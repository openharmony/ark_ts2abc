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

#include <ir/expressions/literals/bigIntLiteral.h>
#include <ir/expressions/literals/numberLiteral.h>
#include <ir/expressions/literals/stringLiteral.h>
#include <ir/expressions/functionExpression.h>
#include <ir/expressions/memberExpression.h>
#include <ir/expressions/identifier.h>
#include <ir/base/property.h>
#include <ir/base/scriptFunction.h>
#include <ir/base/spreadElement.h>
#include <ir/ts/tsIndexSignature.h>
#include <ir/ts/tsMethodSignature.h>
#include <ir/ts/tsPropertySignature.h>
#include <ir/ts/tsSignatureDeclaration.h>
#include <util/helpers.h>
#include <binder/variable.h>
#include <binder/scope.h>

#include <typescript/checker.h>
#include <typescript/types/indexInfo.h>

namespace panda::es2panda::checker {

ObjectLiteralPropertyInfo Checker::HandleObjectLiteralProperty(const ir::Property *prop, ObjectDescriptor *desc,
                                                               std::vector<Type *> *stringIndexTypes, bool readonly)
{
    ObjectLiteralPropertyInfo propInfo;
    bool computed = prop->IsComputed();
    bool shorthand = prop->IsShorthand();

    const ir::Expression *propValue = prop->Value();
    // TODO(aszilagyi): params readonly, readonly
    propInfo.propType = shorthand ? GlobalAnyType() : propValue->Check(this);

    if (prop->Kind() == ir::PropertyKind::GET) {
        const ir::ScriptFunction *func = prop->Value()->AsFunctionExpression()->Function();
        CheckAllCodePathsInNonVoidFunctionReturnOrThrow(func, prop->Start(), "A 'get' accessor must return a value.");

        ASSERT(propInfo.propType->AsObjectType()->IsFunctionType());
        propInfo.propType = propInfo.propType->AsObjectType()->CallSignatures()[0]->ReturnType();
    } else if (prop->Kind() == ir::PropertyKind::SET) {
        ASSERT(propInfo.propType->AsObjectType()->IsFunctionType());
        propInfo.propType = propInfo.propType->AsObjectType()->CallSignatures()[0]->Params()[0]->TsType();
    }

    if (!readonly) {
        propInfo.propType = GetBaseTypeOfLiteralType(propInfo.propType);
    }

    if (computed) {
        propInfo.propName = HandleComputedPropertyName(prop->Key(), desc, propInfo.propType, stringIndexTypes,
                                                       &propInfo.handleNextProp, prop->Start(), readonly);

        if (propInfo.handleNextProp) {
            return propInfo;
        }
    } else {
        propInfo.propName = ToPropertyName(prop->Key(), TypeFlag::COMPUTED_TYPE_LITERAL_NAME);
    }

    if (shorthand) {
        binder::ScopeFindResult result = scope_->Find(propInfo.propName);
        if (!result.variable) {
            ThrowTypeError({"No value exists in scope for the shorthand property '", propInfo.propName,
                            "'. Either declare one ", "or provide an initializer."},
                           prop->Start());
        } else {
            // TODO(aszilagyi): param readonly
            propInfo.propType = prop->Key()->Check(this);
        }
    }

    return propInfo;
}

void Checker::HandleSpreadElement(const ir::SpreadElement *spreadElem, ObjectDescriptor *desc,
                                  lexer::SourcePosition locInfo, bool readonly)
{
    // TODO(aszilagyi): handle other types of spread elements, for example ...[a,b,c], or ...{a,b,c}
    if (!spreadElem->Argument()->IsIdentifier()) {
        return;
    }

    Type *spreadType = nullptr;
    binder::ScopeFindResult result = scope_->Find(spreadElem->Argument()->AsIdentifier()->Name());
    if (!result.variable) {
        ThrowTypeError("Cannot find name ", locInfo);
    }

    spreadType = spreadElem->Argument()->Check(this);
    if (!spreadType->IsObjectType()) {
        ThrowTypeError("Spread types may only be created from object types", locInfo);
    }

    ObjectType *spreadObj = spreadType->AsObjectType();
    for (auto *it : spreadObj->Properties()) {
        binder::LocalVariable *res = desc->FindProperty(it->Name());
        if (res) {
            if (readonly) {
                res->AddFlag(binder::VariableFlags::READONLY);
            }
            res->SetTsType(it->TsType());
        } else {
            auto *var = binder::Scope::CreateVar(allocator_, it->Name(), it->Flags(), nullptr);

            if (readonly) {
                var->AddFlag(binder::VariableFlags::READONLY);
            }
            desc->properties.push_back(var);
        }
    }

    if (spreadObj->IsInterfaceType()) {
        InterfaceType *spreadInterface = spreadObj->AsInterfaceType();
        for (auto *base : spreadInterface->Bases()) {
            for (auto *prop : base->Properties()) {
                binder::LocalVariable *res = desc->FindProperty(prop->Name());
                if (res) {
                    res->SetTsType(prop->TsType());
                } else {
                    auto *var = binder::Scope::CreateVar(allocator_, prop->Name(), prop->Flags(), nullptr);
                    desc->properties.push_back(var);
                }
            }
        }
    }
}

Type *Checker::CollectStringIndexInfoTypes(const ObjectDescriptor *desc, const std::vector<Type *> &stringIndexTypes)
{
    if (stringIndexTypes.empty()) {
        return nullptr;
    }

    std::vector<Type *> collectedTypes;

    for (const auto *it : desc->properties) {
        if (it->TsType()->IsUnionType()) {
            const auto &constituentTypes = it->TsType()->AsUnionType()->ConstituentTypes();
            for (auto *type : constituentTypes) {
                collectedTypes.push_back(type);
            }
        } else {
            collectedTypes.push_back(it->TsType());
        }
    }

    for (const auto &it : stringIndexTypes) {
        if (it->IsUnionType()) {
            std::vector<Type *> &constituentTypes = it->AsUnionType()->ConstituentTypes();
            for (auto *type : constituentTypes) {
                collectedTypes.push_back(type);
            }
        } else {
            collectedTypes.push_back(it);
        }
    }

    if (desc->numberIndexInfo) {
        if (desc->numberIndexInfo->InfoType()->IsUnionType()) {
            std::vector<Type *> &constituentTypes =
                desc->numberIndexInfo->InfoType()->AsUnionType()->ConstituentTypes();
            for (auto *type : constituentTypes) {
                collectedTypes.push_back(type);
            }
        } else {
            collectedTypes.push_back(desc->numberIndexInfo->InfoType());
        }
    }

    if (collectedTypes.empty()) {
        return nullptr;
    }

    if (collectedTypes.size() == 1) {
        return collectedTypes[0];
    }

    return CreateUnionType(std::move(collectedTypes));
}

binder::Variable *Checker::ResolveNonComputedObjectProperty(const ir::MemberExpression *expr)
{
    const ir::MemberExpression *memberLocation = ResolveLeftMostMemberExpression(expr);
    Type *baseType = nullptr;

    while (true) {
        baseType = memberLocation->Object()->Check(this);
        baseType = ResolveBaseProp(baseType, memberLocation->Property(), false, memberLocation->Start());

        if (!memberLocation->Parent()->IsMemberExpression() ||
            memberLocation->Parent()->AsMemberExpression()->IsComputed()) {
            break;
        }

        memberLocation = memberLocation->Parent()->AsMemberExpression();
    }

    return baseType->Variable();
}

binder::Variable *Checker::ResolveObjectProperty(const ir::MemberExpression *expr)
{
    const ir::MemberExpression *memberLocation = ResolveLeftMostMemberExpression(expr);
    Type *baseType = nullptr;

    while (true) {
        baseType = memberLocation->Object()->Check(this);
        baseType = ResolveBaseProp(baseType, memberLocation->Property(), memberLocation->IsComputed(),
                                   memberLocation->Start());

        if (!memberLocation->Parent()->IsMemberExpression()) {
            break;
        }

        memberLocation = memberLocation->Parent()->AsMemberExpression();
    }

    return baseType->Variable();
}

util::StringView Checker::ToPropertyName(const ir::Expression *expr, TypeFlag propNameFlags, bool computed,
                                         bool *hasName, Type **exprType)
{
    if (computed) {
        Type *propType = expr->Check(this);
        if (!propType->HasTypeFlag(propNameFlags)) {
            ThrowTypeError(
                "A computed property name in a type literal must refer to an expression whose type is a literal "
                "type "
                "or a 'unique symbol' type",
                expr->Start());
        }

        if (exprType) {
            *exprType = propType;
        }

        if (propType->IsStringLiteralType()) {
            return propType->AsStringLiteralType()->Value();
        }

        if (propType->IsNumberLiteralType()) {
            return util::Helpers::ToStringView(allocator_, propType->AsNumberLiteralType()->Value());
        }

        if (propType->TypeFlags() == TypeFlag::ENUM) {
            EnumType *enumType = propType->AsEnumType();

            if (std::holds_alternative<double>(enumType->EnumVar()->Value())) {
                return util::Helpers::ToStringView(allocator_, std::get<double>(enumType->EnumVar()->Value()));
            }

            if (std::holds_alternative<util::StringView>(enumType->EnumVar()->Value())) {
                return std::get<util::StringView>(enumType->EnumVar()->Value());
            }
        }

        if (hasName) {
            *hasName = false;
        }

        return util::StringView();
    }

    if (exprType) {
        *exprType = GlobalStringType();
    }

    if (expr->IsIdentifier()) {
        const ir::Identifier *identNode = expr->AsIdentifier();
        return identNode->Name();
    }

    switch (expr->Type()) {
        case ir::AstNodeType::NUMBER_LITERAL: {
            return util::Helpers::ToStringView(allocator_, expr->AsNumberLiteral()->Number<double>());
        }
        case ir::AstNodeType::STRING_LITERAL: {
            return expr->AsStringLiteral()->Str();
        }
        case ir::AstNodeType::BIGINT_LITERAL: {
            return expr->AsBigIntLiteral()->Str();
        }
        default: {
            break;
        }
    }

    UNREACHABLE();

    return util::StringView();
}

void Checker::PrefetchTypeLiteralProperties(const ir::Expression *current, checker::ObjectDescriptor *desc)
{
    ASSERT(current->IsTSPropertySignature() || current->IsTSMethodSignature());
    util::StringView propName;
    bool isComputed = false;
    bool isComputedIdent = false;
    bool isOptional = false;
    bool isPropSignature = false;
    bool isReadonly = false;
    Type *propNameType = nullptr;
    const ir::Expression *key = nullptr;

    if (current->IsTSPropertySignature()) {
        const ir::TSPropertySignature *propSignature = current->AsTSPropertySignature();
        isOptional = propSignature->Optional();
        key = propSignature->Key();
        isComputed = propSignature->Computed();
        isReadonly = propSignature->Readonly();
        isPropSignature = true;
    } else {
        const ir::TSMethodSignature *methodSignature = current->AsTSMethodSignature();
        isOptional = methodSignature->Optional();
        key = methodSignature->Key();
        isComputed = methodSignature->Computed();
    }

    if (isComputed) {
        isComputedIdent = key->IsIdentifier();
    }

    propName = ToPropertyName(key, TypeFlag::COMPUTED_TYPE_LITERAL_NAME, isComputed, nullptr, &propNameType);

    auto *prop = binder::Scope::CreateVar(allocator_, propName, binder::VariableFlags::NONE, current);

    if (isOptional) {
        prop->AddFlag(binder::VariableFlags::OPTIONAL);
    }

    if (isReadonly) {
        prop->AddFlag(binder::VariableFlags::READONLY);
    }

    if (propNameType->HasTypeFlag(TypeFlag::NUMBER_LIKE_ENUM)) {
        prop->AddFlag(binder::VariableFlags::COMPUTED_INDEX);
    }

    if (key->IsLiteral() && key->AsLiteral()->IsNumberLiteral()) {
        prop->AddFlag(binder::VariableFlags::INDEX_NAME);
    }

    if (isComputed) {
        prop->AddFlag(binder::VariableFlags::COMPUTED);
    }

    if (isComputedIdent) {
        prop->AddFlag(binder::VariableFlags::COMPUTED_IDENT);
    }

    if (isPropSignature) {
        prop->AddFlag(binder::VariableFlags::PROPERTY);
    } else {
        prop->AddFlag(binder::VariableFlags::METHOD);
    }

    desc->properties.push_back(prop);
}

void Checker::CheckTsTypeLiteralOrInterfaceMember(const ir::Expression *current, ObjectDescriptor *desc)
{
    if (current->IsTSPropertySignature() || (current->IsTSMethodSignature())) {
        CheckTsPropertyOrMethodSignature(current, desc);
        return;
    }

    if (current->IsTSSignatureDeclaration()) {
        CheckTsSignatureDeclaration(current->AsTSSignatureDeclaration(), desc);
    } else if (current->IsTSIndexSignature()) {
        CheckTsIndexSignature(current->AsTSIndexSignature(), desc);
    }
}

Type *Checker::CheckIndexInfoProperty(IndexInfo *info, Type *objType, lexer::SourcePosition loc)
{
    if (info->Readonly() && !objType->AsObjectType()->IsTupleType()) {
        ThrowTypeError({"Index signature in type '", objType, "' only permits reading."}, loc);
    }
    return info->InfoType();
}

Type *Checker::ResolveBasePropForObject(ObjectType *objType, util::StringView &name, Type *propNameType,
                                        bool isComputed, bool inAssignment, lexer::SourcePosition propLoc,
                                        lexer::SourcePosition exprLoc)
{
    binder::LocalVariable *prop = objType->GetProperty(name);

    if (prop) {
        if (prop && prop->HasFlag(binder::VariableFlags::READONLY) && inAssignment) {
            ThrowTypeError({"Cannot assign to '", prop->Name(), "' because it is a read-only property."}, propLoc);
        }

        if (prop->TsType()) {
            return prop->TsType();
        }

        const ir::AstNode *declNode = prop->Declaration()->Node();
        Type *resolvedType = nullptr;

        if (prop->HasFlag(binder::VariableFlags::PROPERTY)) {
            ASSERT(declNode->IsTSPropertySignature());
            resolvedType = CheckTsPropertySignature(declNode->AsTSPropertySignature(), prop);
        }

        if (prop->HasFlag(binder::VariableFlags::METHOD)) {
            ASSERT(declNode->IsTSMethodSignature());
            resolvedType = CheckTsMethodSignature(declNode->AsTSMethodSignature());
        }

        prop->SetTsType(resolvedType);
        return resolvedType;
    }

    if (objType->IsTupleType()) {
        ThrowTypeError({"Tuple type '", objType, "' of length '", objType->AsTupleType()->FixedLength(),
                        "' has no element at index '", name, "'."},
                       propLoc);
    }

    IndexInfo *numberInfo = objType->NumberIndexInfo();

    if (!numberInfo && objType->IsInterfaceType()) {
        numberInfo = objType->AsInterfaceType()->FindIndexInfo(true);
    }

    if (numberInfo && propNameType && propNameType->HasTypeFlag(TypeFlag::NUMBER_LIKE)) {
        return CheckIndexInfoProperty(numberInfo, objType, exprLoc);
    }

    IndexInfo *stringInfo = objType->StringIndexInfo();

    if (!stringInfo && objType->IsInterfaceType()) {
        stringInfo = objType->AsInterfaceType()->FindIndexInfo(false);
    }

    if (stringInfo) {
        return CheckIndexInfoProperty(stringInfo, objType, exprLoc);
    }

    if (isComputed) {
        return GlobalAnyType();
    }

    ThrowTypeError({"Property '", name, "' does not exist on type '", objType, "'."}, propLoc);

    return nullptr;
}

Type *Checker::ResolveBaseProp(Type *baseType, const ir::Expression *prop, bool isComputed,
                               lexer::SourcePosition exprLoc)
{
    Type *propNameType = nullptr;
    bool hasName = true;
    util::StringView name = ToPropertyName(prop, TypeFlag::COMPUTED_NAME, isComputed, &hasName, &propNameType);

    if (baseType->IsEnumLiteralType()) {
        EnumLiteralType *enumType = baseType->AsEnumLiteralType();

        if (!hasName) {
            if (propNameType->HasTypeFlag(TypeFlag::NUMBER_LIKE)) {
                return GlobalStringType();
            }

            return GlobalAnyType();
        }

        binder::Variable *enumVar = enumType->Scope()->FindLocal(name);

        if (enumVar) {
            if (enumVar->AsEnumVariable()->BackReference()) {
                ThrowTypeError(
                    "Element implicitly has an 'any' type because index expression is not of type "
                    "'number'.",
                    prop->Start());
            }

            return allocator_->New<EnumType>(baseType->Variable(), enumVar->AsEnumVariable());
        }
    }

    if (baseType->IsObjectType()) {
        return ResolveBasePropForObject(baseType->AsObjectType(), name, propNameType, isComputed,
                                        (!prop->Parent()->Parent()->IsMemberExpression() ||
                                         (baseType->IsObjectType() && baseType->AsObjectType()->IsTupleType())) &&
                                            InAssignment(prop),
                                        prop->Start(), exprLoc);
    }

    if (baseType->IsArrayType()) {
        return baseType->AsArrayType()->ElementType();
    }

    if (baseType->IsUnionType()) {
        std::vector<Type *> types;

        for (auto *it : baseType->AsUnionType()->ConstituentTypes()) {
            types.push_back(ResolveBaseProp(it, prop, isComputed, exprLoc));
        }

        return CreateUnionType(std::move(types));
    }

    ThrowTypeError({"Property '", name, "' does not exist on type '", baseType, "'."}, prop->Start());

    return nullptr;
}

Type *Checker::CheckTsPropertySignature(const ir::TSPropertySignature *propSignature, binder::LocalVariable *savedProp)
{
    if (!propSignature->TypeAnnotation()) {
        return GlobalAnyType();
    }

    // TODO(aszilagyi) : saved_prop
    (void)savedProp;
    return propSignature->TypeAnnotation()->Check(this);
}

Type *Checker::CheckTsMethodSignature(const ir::TSMethodSignature *methodSignature)
{
    Type *returnType = GlobalAnyType();

    if (methodSignature->ReturnTypeAnnotation()) {
        returnType = methodSignature->ReturnTypeAnnotation()->Check(this);
    }

    ScopeContext scopeCtx(this, methodSignature->Scope());

    auto *signatureInfo = allocator_->New<checker::SignatureInfo>();
    CheckFunctionParameterDeclaration(methodSignature->Params(), signatureInfo);

    auto *callSiganture = allocator_->New<Signature>(signatureInfo, returnType);
    Type *propType = CreateFunctionTypeWithSignature(callSiganture);

    return propType;
}

void Checker::CheckTsIndexSignature(const ir::TSIndexSignature *indexSignature, ObjectDescriptor *desc)
{
    const util::StringView &paramName = indexSignature->Param()->AsIdentifier()->Name();
    Type *indexType = indexSignature->TypeAnnotation()->Check(this);

    if (indexSignature->Kind() == ir::TSIndexSignature::TSIndexSignatureKind::NUMBER) {
        if (desc->numberIndexInfo) {
            ThrowTypeError("Duplicate number index signature", indexSignature->Start());
        }

        desc->numberIndexInfo = allocator_->New<IndexInfo>(indexType, paramName, indexSignature->Readonly());

        if (desc->stringIndexInfo) {
            IsTypeAssignableTo(indexType, desc->stringIndexInfo->InfoType(),
                               {"Numeric index type '", indexType, "' is not assignable to string index type '",
                                desc->stringIndexInfo->InfoType(), "'"},
                               indexSignature->Start());
        }
    } else {
        ASSERT(indexSignature->Kind() == ir::TSIndexSignature::TSIndexSignatureKind::STRING);
        if (desc->stringIndexInfo) {
            ThrowTypeError("Duplicate string index signature", indexSignature->Start());
        }

        desc->stringIndexInfo = allocator_->New<IndexInfo>(indexType, paramName, indexSignature->Readonly());

        if (desc->numberIndexInfo) {
            IsTypeAssignableTo(desc->numberIndexInfo->InfoType(), indexType,
                               {"Numeric index type '", desc->numberIndexInfo->InfoType(),
                                "' is not assignable to string index type '", indexType, "'"},
                               indexSignature->Start());
        }
    }
}

void Checker::CheckTsSignatureDeclaration(const ir::TSSignatureDeclaration *signatureNode, ObjectDescriptor *desc)
{
    ScopeContext scopeCtx(this, signatureNode->Scope());

    auto *signatureInfo = allocator_->New<checker::SignatureInfo>();
    CheckFunctionParameterDeclaration(signatureNode->Params(), signatureInfo);

    Type *returnType = GlobalAnyType();
    if (signatureNode->ReturnTypeAnnotation()) {
        returnType = signatureNode->ReturnTypeAnnotation()->Check(this);
    }

    auto *signature = allocator_->New<Signature>(signatureInfo, returnType);

    if (signatureNode->Kind() == ir::TSSignatureDeclaration::TSSignatureDeclarationKind::CALL_SIGNATURE) {
        desc->callSignatures.push_back(signature);
    } else {
        desc->constructSignatures.push_back(signature);
    }
}

void Checker::CheckTsPropertyOrMethodSignature(const ir::Expression *current, ObjectDescriptor *desc)
{
    bool isComputed = false;
    bool isPropSignature = false;
    Type *propNameType = nullptr;
    const ir::Expression *key = nullptr;

    if (current->IsTSPropertySignature()) {
        const auto *propSignature = current->AsTSPropertySignature();
        key = propSignature->Key();
        isComputed = propSignature->Computed();
        isPropSignature = true;
    } else {
        const auto *methodSignature = current->AsTSMethodSignature();
        key = methodSignature->Key();
        isComputed = methodSignature->Computed();
    }

    util::StringView propName =
        ToPropertyName(key, TypeFlag::COMPUTED_TYPE_LITERAL_NAME, isComputed, nullptr, &propNameType);
    binder::LocalVariable *prop = desc->FindProperty(propName);
    ASSERT(prop);

    if (prop->TsType()) {
        return;
    }

    Type *propType = nullptr;
    if (isPropSignature) {
        propType = CheckTsPropertySignature(current->AsTSPropertySignature(), prop);
    } else {
        propType = CheckTsMethodSignature(current->AsTSMethodSignature());
    }

    propType->SetVariable(prop);
    prop->SetTsType(propType);
}

void Checker::HandleNumberIndexInfo(ObjectDescriptor *desc, Type *indexType, bool readonly)
{
    if (desc->numberIndexInfo) {
        if (desc->numberIndexInfo->InfoType()->IsUnionType()) {
            desc->numberIndexInfo->InfoType()->AsUnionType()->AddConstituentType(indexType, relation_);
        } else {
            Type *numIndexType = CreateUnionType({desc->numberIndexInfo->InfoType(), indexType});
            desc->numberIndexInfo->SetInfoType(numIndexType);
        }
    } else {
        auto *numIndexInfo = allocator_->New<IndexInfo>(indexType, "x", readonly);
        desc->numberIndexInfo = numIndexInfo;
    }
}

util::StringView Checker::HandleComputedPropertyName(const ir::Expression *propKey, ObjectDescriptor *desc,
                                                     Type *propType, std::vector<Type *> *stringIndexTypes,
                                                     bool *handleNextProp, lexer::SourcePosition locInfo, bool readonly)
{
    util::StringView propName;

    if (propKey->IsIdentifier()) {
        const ir::Identifier *identKey = propKey->AsIdentifier();
        binder::ScopeFindResult result = scope_->Find(identKey->Name());
        if (!result.variable) {
            ThrowTypeError({"Cannot find name '", identKey->Name(), "'"}, locInfo);
        }

        Type *computedPropType = identKey->Check(this);

        if (!computedPropType->HasTypeFlag(TypeFlag::COMPUTED_NAME)) {
            ThrowTypeError("A computed property name must be of type 'string', 'number', 'symbol', or 'any'", locInfo);
        } else if (computedPropType->HasTypeFlag(TypeFlag::NUMBER_OR_ANY)) {
            HandleNumberIndexInfo(desc, propType, readonly);
            *handleNextProp = true;
        } else if (computedPropType->IsStringType()) {
            stringIndexTypes->push_back(propType);
            *handleNextProp = true;
        } else if (computedPropType->IsNumberLiteralType()) {
            propName = util::Helpers::ToStringView(allocator_, computedPropType->AsNumberLiteralType()->Value());
        } else if (computedPropType->IsStringLiteralType()) {
            propName = computedPropType->AsStringLiteralType()->Value();
        }
    } else if (propKey->IsLiteral()) {
        if (propKey->IsNumberLiteral()) {
            propName = util::Helpers::ToStringView(allocator_, propKey->AsNumberLiteral()->Number<double>());
        } else if (propKey->IsStringLiteral()) {
            propName = propKey->AsStringLiteral()->Str();
        } else {
            ThrowTypeError("A computed property name must be of type 'string', 'number', 'symbol', or 'any'", locInfo);
        }
    } else {
        Type *computedKeyType = propKey->Check(this);
        if (computedKeyType->HasTypeFlag(TypeFlag::NUMBER_LIKE_ENUM)) {
            HandleNumberIndexInfo(desc, propType, readonly);
            *handleNextProp = true;
        } else if (computedKeyType->IsStringType()) {
            stringIndexTypes->push_back(propType);
            *handleNextProp = true;
        } else {
            ThrowTypeError("A computed property name must be of type 'string', 'number', 'symbol', or 'any'", locInfo);
        }
    }

    return propName;
}

void Checker::CheckIndexConstraints(Type *type) const
{
    if (!type->IsObjectType()) {
        return;
    }

    ObjectType *objType = type->AsObjectType();

    const IndexInfo *numberInfo = objType->NumberIndexInfo();
    const IndexInfo *stringInfo = objType->StringIndexInfo();
    std::vector<binder::LocalVariable *> properties;

    if (objType->IsInterfaceType()) {
        if (!numberInfo) {
            numberInfo = objType->AsInterfaceType()->FindIndexInfo(true);
        }
        if (!stringInfo) {
            stringInfo = objType->AsInterfaceType()->FindIndexInfo(false);
        }

        objType->AsInterfaceType()->CollectProperties(&properties);
    } else {
        properties = objType->Properties();
    }

    if (numberInfo) {
        for (auto *it : properties) {
            if (it->HasFlag(binder::VariableFlags::INDEX_LIKE)) {
                IsTypeAssignableTo(it->TsType(), numberInfo->InfoType(),
                                   {"Property '", it->Name(), "' of type '", it->TsType(),
                                    "' is not assignable to numeric index type '", numberInfo->InfoType(), "'."},
                                   it->Declaration()->Node()->Start());
            }
        }
    }

    if (stringInfo) {
        for (auto *it : properties) {
            IsTypeAssignableTo(it->TsType(), stringInfo->InfoType(),
                               {"Property '", it->Name(), "' of type '", it->TsType(),
                                "' is not assignable to string index type '", stringInfo->InfoType(), "'."},
                               it->Declaration()->Node()->Start());
        }
    }
}

}  // namespace panda::es2panda::checker
