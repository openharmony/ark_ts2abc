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

#include "objectExpression.h"

#include <util/helpers.h>
#include <compiler/base/literals.h>
#include <compiler/core/pandagen.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/base/property.h>
#include <ir/base/scriptFunction.h>
#include <ir/base/spreadElement.h>
#include <ir/expressions/arrayExpression.h>
#include <ir/expressions/assignmentExpression.h>
#include <ir/expressions/functionExpression.h>
#include <ir/expressions/identifier.h>
#include <ir/expressions/literals/nullLiteral.h>
#include <ir/expressions/literals/stringLiteral.h>
#include <ir/expressions/literals/taggedLiteral.h>
#include <ir/validationInfo.h>
#include <util/bitset.h>

namespace panda::es2panda::ir {

ValidationInfo ObjectExpression::ValidateExpression()
{
    ValidationInfo info;
    bool foundProto = false;

    for (auto *it : properties_) {
        switch (it->Type()) {
            case AstNodeType::OBJECT_EXPRESSION:
            case AstNodeType::ARRAY_EXPRESSION: {
                return {"Unexpected token.", it->Start()};
            }
            case AstNodeType::SPREAD_ELEMENT: {
                info = it->AsSpreadElement()->ValidateExpression();
                break;
            }
            case AstNodeType::PROPERTY: {
                auto *prop = it->AsProperty();
                info = prop->ValidateExpression();

                if (prop->Kind() == PropertyKind::PROTO) {
                    if (foundProto) {
                        return {"Duplicate __proto__ fields are not allowed in object literals", prop->Key()->Start()};
                    }

                    foundProto = true;
                }

                break;
            }
            default: {
                break;
            }
        }

        if (info.Fail()) {
            break;
        }
    }

    return info;
}

bool ObjectExpression::ConvertibleToObjectPattern()
{
    // TODO(rsipka): throw more precise messages in case of false results
    bool restFound = false;
    bool convResult = true;

    for (auto *it : properties_) {
        switch (it->Type()) {
            case AstNodeType::ARRAY_EXPRESSION: {
                convResult = it->AsArrayExpression()->ConvertibleToArrayPattern();
                break;
            }
            case AstNodeType::SPREAD_ELEMENT: {
                if (!restFound && it == properties_.back() && !trailingComma_) {
                    convResult = it->AsSpreadElement()->ConvertibleToRest(isDeclaration_, false);
                } else {
                    convResult = false;
                }

                restFound = true;
                break;
            }
            case AstNodeType::OBJECT_EXPRESSION: {
                convResult = it->AsObjectExpression()->ConvertibleToObjectPattern();
                break;
            }
            case AstNodeType::ASSIGNMENT_EXPRESSION: {
                convResult = it->AsAssignmentExpression()->ConvertibleToAssignmentPattern();
                break;
            }
            case AstNodeType::META_PROPERTY_EXPRESSION:
            case AstNodeType::CHAIN_EXPRESSION:
            case AstNodeType::SEQUENCE_EXPRESSION: {
                convResult = false;
                break;
            }
            case AstNodeType::PROPERTY: {
                convResult = it->AsProperty()->ConventibleToPatternProperty();
                break;
            }
            default: {
                break;
            }
        }

        if (!convResult) {
            break;
        }
    }

    SetType(AstNodeType::OBJECT_PATTERN);
    return convResult;
}

void ObjectExpression::SetDeclaration()
{
    isDeclaration_ = true;
}

void ObjectExpression::SetOptional(bool optional)
{
    optional_ = optional;
}

void ObjectExpression::SetTsTypeAnnotation(Expression *typeAnnotation)
{
    typeAnnotation_ = typeAnnotation;
}

void ObjectExpression::Iterate(const NodeTraverser &cb) const
{
    for (auto *it : properties_) {
        cb(it);
    }

    if (typeAnnotation_) {
        cb(typeAnnotation_);
    }
}

void ObjectExpression::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", (type_ == AstNodeType::OBJECT_EXPRESSION) ? "ObjectExpression" : "ObjectPattern"},
                 {"properties", properties_},
                 {"typeAnnotation", AstDumper::Optional(typeAnnotation_)},
                 {"optional", AstDumper::Optional(optional_)}});
}

void ObjectExpression::EmitCreateObjectWithBuffer(compiler::PandaGen *pg, compiler::LiteralBuffer *buf,
                                                  bool hasMethod) const
{
    if (buf->IsEmpty()) {
        pg->CreateEmptyObject(this);
        return;
    }

    uint32_t bufIdx = pg->AddLiteralBuffer(buf);

    if (hasMethod) {
        pg->CreateObjectHavingMethod(this, bufIdx);
    } else {
        pg->CreateObjectWithBuffer(this, bufIdx);
    }
}

static const Literal *CreateLiteral(compiler::PandaGen *pg, const ir::Property *prop, util::BitSet *compiled,
                                    size_t propIndex)
{
    if (util::Helpers::IsConstantExpr(prop->Value())) {
        compiled->Set(propIndex);
        return prop->Value()->AsLiteral();
    }

    if (prop->Kind() != ir::PropertyKind::INIT) {
        ASSERT(prop->IsAccessor());
        return pg->Allocator()->New<TaggedLiteral>(LiteralTag::ACCESSOR);
    }

    if (prop->IsMethod()) {
        const ir::ScriptFunction *method = prop->Value()->AsFunctionExpression()->Function();

        LiteralTag tag = LiteralTag::METHOD;

        if (method->IsGenerator()) {
            tag = LiteralTag::GENERATOR_METHOD;

            if (method->IsAsync()) {
                tag = LiteralTag::ASYNC_GENERATOR_METHOD;
            }
        }

        compiled->Set(propIndex);
        return pg->Allocator()->New<TaggedLiteral>(tag, method->Scope()->InternalName());
    }

    return pg->Allocator()->New<NullLiteral>();
}

void ObjectExpression::CompileStaticProperties(compiler::PandaGen *pg, util::BitSet *compiled) const
{
    bool hasMethod = false;
    bool seenComputed = false;
    auto *buf = pg->NewLiteralBuffer();
    std::unordered_map<util::StringView, size_t> propNameMap;

    for (size_t i = 0; i < properties_.size(); i++) {
        if (properties_[i]->IsSpreadElement()) {
            seenComputed = true;
            continue;
        }

        const ir::Property *prop = properties_[i]->AsProperty();

        if (!util::Helpers::IsConstantPropertyKey(prop->Key(), prop->IsComputed()) ||
            prop->Kind() == ir::PropertyKind::PROTO) {
            seenComputed = true;
            continue;
        }

        util::StringView name = util::Helpers::LiteralToPropName(prop->Key());
        size_t bufferPos = buf->Literals().size();
        auto res = propNameMap.insert({name, bufferPos});
        if (res.second) {
            if (seenComputed) {
                break;
            }

            buf->Add(pg->Allocator()->New<StringLiteral>(name));
            buf->Add(nullptr);
        } else {
            bufferPos = res.first->second;
        }

        if (prop->IsMethod()) {
            hasMethod = true;
        }

        buf->ResetLiteral(bufferPos + 1, CreateLiteral(pg, prop, compiled, i));
    }

    EmitCreateObjectWithBuffer(pg, buf, hasMethod);
}

void ObjectExpression::CompileRemainingProperties(compiler::PandaGen *pg, const util::BitSet *compiled,
                                                  compiler::VReg objReg) const
{
    for (size_t i = 0; i < properties_.size(); i++) {
        if (compiled->Test(i)) {
            continue;
        }

        compiler::RegScope rs(pg);

        if (properties_[i]->IsSpreadElement()) {
            compiler::VReg srcObj = pg->AllocReg();
            const ir::SpreadElement *spread = properties_[i]->AsSpreadElement();

            spread->Argument()->Compile(pg);
            pg->StoreAccumulator(spread, srcObj);

            pg->CopyDataProperties(spread, objReg, srcObj);
            continue;
        }

        const ir::Property *prop = properties_[i]->AsProperty();

        switch (prop->Kind()) {
            case ir::PropertyKind::GET:
            case ir::PropertyKind::SET: {
                compiler::VReg key = pg->LoadPropertyKey(prop->Key(), prop->IsComputed());

                compiler::VReg undef = pg->AllocReg();
                pg->LoadConst(this, compiler::Constant::JS_UNDEFINED);
                pg->StoreAccumulator(this, undef);

                compiler::VReg getter = undef;
                compiler::VReg setter = undef;

                compiler::VReg accessor = pg->AllocReg();
                pg->LoadAccumulator(prop->Value(), objReg);
                prop->Value()->Compile(pg);
                pg->StoreAccumulator(prop->Value(), accessor);

                if (prop->Kind() == ir::PropertyKind::GET) {
                    getter = accessor;
                } else {
                    setter = accessor;
                }

                pg->DefineGetterSetterByValue(this, objReg, key, getter, setter, prop->IsComputed());
                break;
            }
            case ir::PropertyKind::INIT: {
                compiler::Operand key = pg->ToPropertyKey(prop->Key(), prop->IsComputed());

                if (prop->IsMethod()) {
                    pg->LoadAccumulator(prop->Value(), objReg);
                }

                prop->Value()->Compile(pg);
                pg->StoreOwnProperty(this, objReg, key);
                break;
            }
            case ir::PropertyKind::PROTO: {
                prop->Value()->Compile(pg);
                compiler::VReg proto = pg->AllocReg();
                pg->StoreAccumulator(this, proto);

                pg->SetObjectWithProto(this, proto, objReg);
                break;
            }
            default: {
                UNREACHABLE();
            }
        }
    }

    pg->LoadAccumulator(this, objReg);
}

void ObjectExpression::Compile([[maybe_unused]] compiler::PandaGen *pg) const
{
    if (properties_.empty()) {
        pg->CreateEmptyObject(this);
        return;
    }

    util::BitSet compiled(properties_.size());
    CompileStaticProperties(pg, &compiled);

    compiler::RegScope rs(pg);
    compiler::VReg objReg = pg->AllocReg();

    pg->StoreAccumulator(this, objReg);

    CompileRemainingProperties(pg, &compiled, objReg);
}

static void CheckPatternProperty(checker::Checker *checker, bool inAssignment, checker::ObjectDescriptor *desc,
                                 ir::Expression *exp)
{
    ASSERT(exp->IsProperty());
    const ir::Property *prop = exp->AsProperty();
    checker::Type *propType = checker->GlobalAnyType();
    bool optional = false;
    util::StringView propName = checker->ToPropertyName(prop->Key(), checker::TypeFlag::COMPUTED_TYPE_LITERAL_NAME);

    if (prop->Value()->IsObjectPattern()) {
        propType = prop->Value()->AsObjectPattern()->CheckPattern(checker, inAssignment);
    } else if (prop->Value()->IsArrayPattern()) {
        propType = prop->Value()->AsArrayPattern()->CheckPattern(checker);
    } else if (prop->Value()->IsAssignmentPattern()) {
        const ir::AssignmentExpression *assignmentPattern = prop->Value()->AsAssignmentPattern();

        if (!assignmentPattern->Left()->IsIdentifier()) {
            propType = checker->CreateInitializerTypeForPattern(assignmentPattern->Left()->Check(checker),
                                                                assignmentPattern->Right());
            checker->NodeCache().insert({assignmentPattern->Right(), propType});
        } else {
            propType = checker->GetBaseTypeOfLiteralType(assignmentPattern->Right()->Check(checker));
        }

        optional = true;
    } else if (inAssignment) {
        binder::ScopeFindResult result = checker->Scope()->Find(propName);
        if (result.variable) {
            propType = result.variable->TsType();
        }
    }

    auto *newProp = binder::Scope::CreateVar(checker->Allocator(), propName, binder::VariableFlags::PROPERTY, prop);

    if (optional) {
        newProp->AddFlag(binder::VariableFlags::OPTIONAL);
    }

    newProp->SetTsType(propType);
    desc->properties.push_back(newProp);
}

checker::Type *ObjectExpression::CheckPattern(checker::Checker *checker, bool inAssignment) const
{
    checker::ObjectDescriptor *desc = checker->Allocator()->New<checker::ObjectDescriptor>();
    bool haveRest = false;

    for (auto *it : properties_) {
        if (it->IsRestElement()) {
            ASSERT(it->AsRestElement()->Argument()->IsIdentifier());
            haveRest = true;
            util::StringView indexInfoName("x");
            auto *newIndexInfo = checker->Allocator()->New<checker::IndexInfo>(checker->GlobalAnyType(), indexInfoName);
            desc->stringIndexInfo = newIndexInfo;
        } else {
            CheckPatternProperty(checker, inAssignment, desc, it);
        }
    }

    checker::Type *returnType = checker->Allocator()->New<checker::ObjectLiteralType>(desc);

    if (haveRest) {
        returnType->AsObjectType()->AddObjectFlag(checker::ObjectType::ObjectFlags::HAVE_REST);
    }

    return returnType;
}

checker::Type *ObjectExpression::Check(checker::Checker *checker) const
{
    checker::ObjectDescriptor *desc = checker->Allocator()->New<checker::ObjectDescriptor>();
    std::vector<checker::Type *> stringIndexTypes;

    /* TODO(dbatyai) */
    bool readonly = false;

    for (const auto *it : properties_) {
        if (it->IsProperty()) {
            checker::ObjectLiteralPropertyInfo propInfo =
                checker->HandleObjectLiteralProperty(it->AsProperty(), desc, &stringIndexTypes, readonly);
            if (propInfo.handleNextProp) {
                continue;
            }

            if (desc->FindProperty(propInfo.propName)) {
                checker->ThrowTypeError({"Duplicate identifier '", propInfo.propName, "'."}, it->Start());
            }

            propInfo.propType = checker->GetBaseTypeOfLiteralType(propInfo.propType);
            binder::VariableFlags propFlag =
                it->AsProperty()->IsMethod() ? binder::VariableFlags::METHOD : binder::VariableFlags::PROPERTY;
            auto *newProp = binder::Scope::CreateVar(checker->Allocator(), propInfo.propName, propFlag, it);

            propInfo.propType->SetVariable(newProp);
            newProp->SetTsType(propInfo.propType);
            if (readonly) {
                propInfo.propType->Variable()->AddFlag(binder::VariableFlags::READONLY);
            }
            desc->properties.push_back(newProp);
        } else {
            ASSERT(it->IsSpreadElement());
            checker->HandleSpreadElement(it->AsSpreadElement(), desc, it->Start(), readonly);
        }
    }

    checker::Type *stringIndexType = checker->CollectStringIndexInfoTypes(desc, stringIndexTypes);

    if (stringIndexType) {
        auto *strIndexInfo = checker->Allocator()->New<checker::IndexInfo>(stringIndexType, "x", readonly);
        desc->stringIndexInfo = strIndexInfo;
    }

    return checker->Allocator()->New<checker::ObjectLiteralType>(desc);
}

}  // namespace panda::es2panda::ir
