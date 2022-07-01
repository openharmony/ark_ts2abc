/**
 * Copyright (c) 2021 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "classDefinition.h"

#include <util/helpers.h>
#include <binder/scope.h>
#include <compiler/base/literals.h>
#include <compiler/base/lreference.h>
#include <compiler/core/pandagen.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/base/methodDefinition.h>
#include <ir/base/scriptFunction.h>
#include <ir/expression.h>
#include <ir/expressions/functionExpression.h>
#include <ir/expressions/identifier.h>
#include <ir/expressions/literals/nullLiteral.h>
#include <ir/expressions/literals/numberLiteral.h>
#include <ir/expressions/literals/stringLiteral.h>
#include <ir/expressions/literals/taggedLiteral.h>
#include <ir/ts/tsClassImplements.h>
#include <ir/ts/tsIndexSignature.h>
#include <ir/ts/tsTypeParameter.h>
#include <ir/ts/tsTypeParameterDeclaration.h>
#include <ir/ts/tsTypeParameterInstantiation.h>

namespace panda::es2panda::ir {

const FunctionExpression *ClassDefinition::Ctor() const
{
    ASSERT(ctor_ != nullptr);
    return ctor_->Value();
}

void ClassDefinition::Iterate(const NodeTraverser &cb) const
{
    if (ident_) {
        cb(ident_);
    }

    if (typeParams_) {
        cb(typeParams_);
    }

    if (superClass_) {
        cb(superClass_);
    }

    if (superTypeParams_) {
        cb(superTypeParams_);
    }

    for (auto *it : implements_) {
        cb(it);
    }

    cb(ctor_);

    for (auto *it : body_) {
        cb(it);
    }

    for (auto *it : indexSignatures_) {
        cb(it);
    }
}

void ClassDefinition::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"id", AstDumper::Nullable(ident_)},
                 {"typeParameters", AstDumper::Optional(typeParams_)},
                 {"superClass", AstDumper::Nullable(superClass_)},
                 {"superTypeParameters", AstDumper::Optional(superTypeParams_)},
                 {"implements", implements_},
                 {"constructor", ctor_},
                 {"body", body_},
                 {"indexSignatures", indexSignatures_}});
}

compiler::VReg ClassDefinition::CompileHeritageClause(compiler::PandaGen *pg) const
{
    compiler::VReg baseReg = pg->AllocReg();

    if (superClass_) {
        superClass_->Compile(pg);
    } else {
        pg->LoadConst(this, compiler::Constant::JS_HOLE);
    }

    pg->StoreAccumulator(this, baseReg);
    return baseReg;
}

void ClassDefinition::InitializeClassName(compiler::PandaGen *pg) const
{
    if (!ident_) {
        return;
    }

    compiler::LReference lref = compiler::LReference::CreateLRef(pg, ident_, true);
    lref.SetValue();
}

// NOLINTNEXTLINE(google-runtime-references)
int32_t ClassDefinition::CreateClassStaticProperties(compiler::PandaGen *pg, util::BitSet &compiled) const
{
    auto *buf = pg->NewLiteralBuffer();
    compiler::LiteralBuffer staticBuf(pg->Allocator());
    bool seenComputed = false;
    std::unordered_map<util::StringView, size_t> propNameMap;
    std::unordered_map<util::StringView, size_t> staticPropNameMap;

    const auto &properties = body_;

    for (size_t i = 0; i < properties.size(); i++) {
        if (!properties[i]->IsMethodDefinition()) {
            continue;
        }
        const ir::MethodDefinition *prop = properties[i]->AsMethodDefinition();

        if (!util::Helpers::IsConstantPropertyKey(prop->Key(), prop->Computed()) ||
            (prop->Computed() && util::Helpers::IsSpecialPropertyKey(prop->Key()))) {
            seenComputed = true;
            continue;
        }

        util::StringView name = util::Helpers::LiteralToPropName(prop->Key());
        compiler::LiteralBuffer *literalBuf = prop->IsStatic() ? &staticBuf : buf;
        auto &nameMap = prop->IsStatic() ? staticPropNameMap : propNameMap;

        size_t bufferPos = literalBuf->Literals().size();
        auto res = nameMap.insert({name, bufferPos});
        if (res.second) {
            if (seenComputed) {
                break;
            }

            literalBuf->Add(pg->Allocator()->New<StringLiteral>(name));
            literalBuf->Add(nullptr);
        } else {
            bufferPos = res.first->second;
        }

        Literal *value = nullptr;

        switch (prop->Kind()) {
            case ir::MethodDefinitionKind::METHOD: {
                const ir::FunctionExpression *func = prop->Value()->AsFunctionExpression();
                const util::StringView &internalName = func->Function()->Scope()->InternalName();

                value = pg->Allocator()->New<TaggedLiteral>(LiteralTag::METHOD, internalName);
                compiled.Set(i);
                break;
            }
            case ir::MethodDefinitionKind::GET:
            case ir::MethodDefinitionKind::SET: {
                value = pg->Allocator()->New<NullLiteral>();
                break;
            }
            default: {
                UNREACHABLE();
            }
        }

        literalBuf->ResetLiteral(bufferPos + 1, value);
    }

    uint32_t litPairs = buf->Size() / 2;

    /* Static items are stored at the end of the buffer */
    buf->Insert(&staticBuf);

    /* The last literal item represents the offset of the first static property. The regular property literal count
     * is divided by 2 as key/value pairs count as one. */
    buf->Add(pg->Allocator()->New<NumberLiteral>(litPairs));

    return pg->AddLiteralBuffer(buf);
}

void ClassDefinition::CompileMissingProperties(compiler::PandaGen *pg, const util::BitSet &compiled,
                                               compiler::VReg classReg) const
{
    const auto &properties = body_;

    compiler::VReg protoReg = pg->AllocReg();

    pg->LoadObjByName(this, classReg, "prototype");
    pg->StoreAccumulator(this, protoReg);

    for (size_t i = 0; i < properties.size(); i++) {
        if (!properties[i]->IsMethodDefinition() || compiled.Test(i)) {
            continue;
        }

        const ir::MethodDefinition *prop = properties[i]->AsMethodDefinition();
        compiler::VReg dest = prop->IsStatic() ? classReg : protoReg;
        compiler::RegScope rs(pg);

        switch (prop->Kind()) {
            case ir::MethodDefinitionKind::METHOD: {
                compiler::Operand key = pg->ToPropertyKey(prop->Key(), prop->Computed());

                pg->LoadAccumulator(this, dest);
                const ir::FunctionExpression *func = prop->Value()->AsFunctionExpression();
                func->Compile(pg);

                pg->StoreOwnProperty(prop->Value()->Parent(), dest, key);
                break;
            }
            case ir::MethodDefinitionKind::GET:
            case ir::MethodDefinitionKind::SET: {
                compiler::VReg keyReg = pg->LoadPropertyKey(prop->Key(), prop->Computed());

                compiler::VReg undef = pg->AllocReg();
                pg->LoadConst(this, compiler::Constant::JS_UNDEFINED);
                pg->StoreAccumulator(this, undef);

                compiler::VReg getter = undef;
                compiler::VReg setter = undef;

                pg->LoadAccumulator(this, dest);

                compiler::VReg accessor = pg->AllocReg();
                prop->Value()->Compile(pg);
                pg->StoreAccumulator(prop->Value(), accessor);

                if (prop->Kind() == ir::MethodDefinitionKind::GET) {
                    getter = accessor;
                } else {
                    setter = accessor;
                }

                pg->DefineGetterSetterByValue(this, dest, keyReg, getter, setter, prop->Computed());
                break;
            }
            default: {
                UNREACHABLE();
            }
        }
    }

    pg->LoadAccumulator(this, classReg);
}

void ClassDefinition::Compile(compiler::PandaGen *pg) const
{
    compiler::RegScope rs(pg);
    compiler::VReg classReg = pg->AllocReg();
    compiler::VReg lexenv = pg->LexEnv();

    compiler::LocalRegScope lrs(pg, scope_);

    compiler::VReg baseReg = CompileHeritageClause(pg);
    util::StringView ctorId = ctor_->Function()->Scope()->InternalName();
    util::BitSet compiled(body_.size());

    int32_t bufIdx = CreateClassStaticProperties(pg, compiled);
    pg->DefineClassWithBuffer(this, ctorId, bufIdx, lexenv, baseReg);
    if (scope_->Parent()->IsGlobalScope() && ident_) {
        pg->StoreGlobalLet(this, ident_->Name());
    }
    pg->StoreAccumulator(this, classReg);
    InitializeClassName(pg);

    CompileMissingProperties(pg, compiled, classReg);
}

checker::Type *ClassDefinition::Check([[maybe_unused]] checker::Checker *checker) const
{
    // TODO(aszilagyi)
    return checker->GlobalAnyType();
}

}  // namespace panda::es2panda::ir
