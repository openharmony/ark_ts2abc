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

#include "tsTypeReference.h"

#include <binder/declaration.h>
#include <binder/scope.h>
#include <binder/variable.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/expressions/identifier.h>
#include <ir/ts/tsInterfaceDeclaration.h>
#include <ir/ts/tsTypeAliasDeclaration.h>
#include <ir/ts/tsTypeParameterInstantiation.h>
#include <ir/ts/tsEnumDeclaration.h>

namespace panda::es2panda::ir {

void TSTypeReference::Iterate(const NodeTraverser &cb) const
{
    if (typeParams_) {
        cb(typeParams_);
    }

    cb(typeName_);
}

void TSTypeReference::Dump(ir::AstDumper *dumper) const
{
    dumper->Add(
        {{"type", "TSTypeReference"}, {"typeName", typeName_}, {"typeParameters", AstDumper::Optional(typeParams_)}});
}

void TSTypeReference::Compile([[maybe_unused]] compiler::PandaGen *pg) const {}

checker::Type *TSTypeReference::Check([[maybe_unused]] checker::Checker *checker) const
{
    if (typeName_->IsIdentifier()) {
        return ResolveReference(checker, typeName_->AsIdentifier()->Variable(), typeName_->AsIdentifier(), typeParams_);
    }

    ASSERT(typeName_->IsTSQualifiedName());
    return typeName_->Check(checker);
}

checker::Type *TSTypeReference::ResolveReference(checker::Checker *checker, binder::Variable *var,
                                                 const ir::Identifier *refIdent,
                                                 const ir::TSTypeParameterInstantiation *typeParams)
{
    if (!var) {
        checker->ThrowTypeError({"Cannot find name ", refIdent->Name()}, refIdent->Start());
    }

    const binder::Decl *decl = var->Declaration();

    if (decl->IsTypeParameterDecl()) {
        ASSERT(var->TsType() && var->TsType()->IsTypeParameter());
        return checker->Allocator()->New<checker::TypeReference>(var->TsType()->AsTypeParameter()->DefaultTypeRef());
    }

    if (!var->TsType()) {
        checker::Type *bindingType = nullptr;

        if (var->HasFlag(binder::VariableFlags::TYPE_ALIAS)) {
            if (!checker->TypeStack().insert(decl->Node()).second) {
                checker->ThrowTypeError({"Type alias '", refIdent->Name(), "' circularly references itself"},
                                        decl->Node()->Start());
            }

            bindingType = decl->Node()->AsTSTypeAliasDeclaration()->InferType(checker, var);
            checker->TypeStack().erase(decl->Node());
        } else if (var->HasFlag(binder::VariableFlags::INTERFACE)) {
            bindingType = decl->Node()->AsTSInterfaceDeclaration()->InferType(checker, var);
        } else if (var->HasFlag(binder::VariableFlags::ENUM_LITERAL)) {
            bindingType =
                decl->Node()->AsTSEnumDeclaration()->InferType(checker, decl->Node()->AsTSEnumDeclaration()->IsConst());
        } else {
            // TODO(aszilagyi)
            bindingType = checker->GlobalAnyType();
        }

        bindingType->SetVariable(var);
        var->SetTsType(bindingType);
    }

    if (var->HasFlag(binder::VariableFlags::INTERFACE)) {
        for (const auto *it : decl->AsInterfaceDecl()->Decls()) {
            if (!it->TypeParams()) {
                continue;
            }

            return checker->InstantiateGenericInterface(var, decl, typeParams, refIdent->Start());
        }
    }

    if (var->HasFlag(binder::VariableFlags::TYPE_ALIAS) && decl->Node()->AsTSTypeAliasDeclaration()->TypeParams()) {
        return checker->InstantiateGenericTypeAlias(var, decl->Node()->AsTSTypeAliasDeclaration()->TypeParams(),
                                                    typeParams, refIdent->Start());
    }

    return var->TsType();
}

}  // namespace panda::es2panda::ir
