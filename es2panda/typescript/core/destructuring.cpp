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

#include <ir/expressions/arrayExpression.h>
#include <ir/expressions/assignmentExpression.h>
#include <ir/expressions/identifier.h>
#include <ir/expressions/objectExpression.h>
#include <ir/expressions/literals/bigIntLiteral.h>
#include <ir/expressions/literals/numberLiteral.h>
#include <ir/expressions/literals/stringLiteral.h>
#include <ir/base/property.h>
#include <ir/base/spreadElement.h>
#include <util/helpers.h>
#include <binder/variable.h>
#include <binder/scope.h>
#include <binder/declaration.h>

#include <typescript/checker.h>

namespace panda::es2panda::checker {

void Checker::HandleVariableDeclarationWithContext(const ir::Expression *id, Type *inferedType,
                                                   VariableBindingContext context, DestructuringType destructuringType,
                                                   bool annotationTypeUsed, bool inAssignment)
{
    if (id->IsIdentifier()) {
        HandleIdentifierDeclarationWithContext(id->AsIdentifier(), inferedType, destructuringType, annotationTypeUsed,
                                               inAssignment);
        return;
    }

    if (id->IsProperty()) {
        HandlePropertyDeclarationWithContext(id->AsProperty(), inferedType, context, destructuringType,
                                             annotationTypeUsed, inAssignment);
        return;
    }

    if (id->IsAssignmentPattern()) {
        HandleAssignmentPatternWithContext(id->AsAssignmentPattern(), inferedType, context, destructuringType,
                                           annotationTypeUsed, inAssignment);
        return;
    }

    if (id->IsArrayPattern()) {
        if (!inferedType->IsArrayType() &&
            !(inferedType->IsObjectType() && inferedType->AsObjectType()->IsTupleType()) &&
            !inferedType->IsUnionType()) {
            ThrowTypeError(
                {"Type '", inferedType, "' must have a '[Symbol.Iterator]()' method that returns an interator"},
                id->Start());
        }

        HandleArrayPatternWithContext(id->AsArrayPattern(), inferedType, context, annotationTypeUsed, inAssignment);
        return;
    }

    if (id->IsObjectPattern()) {
        for (auto *it : id->AsObjectPattern()->Properties()) {
            HandleVariableDeclarationWithContext(it, inferedType, context, DestructuringType::OBJECT_DESTRUCTURING,
                                                 annotationTypeUsed, inAssignment);
        }

        return;
    }

    if (id->IsRestElement()) {
        HandleRestElementWithContext(id->AsRestElement(), inferedType, context, destructuringType, annotationTypeUsed,
                                     inAssignment);
        return;
    }

    ASSERT(id->IsOmittedExpression());
    if (inferedType->IsObjectType() && inferedType->AsObjectType()->IsTupleType()) {
        inferedType->AsObjectType()->AsTupleType()->Iterator()->Next();
    }
}

void Checker::HandleIdentifierDeclarationWithContext(const ir::Identifier *identNode, Type *inferedType,
                                                     DestructuringType destructuringType, bool annotationTypeUsed,
                                                     bool inAssignment)
{
    const util::StringView &identName = identNode->Name();
    binder::ScopeFindResult result = scope_->Find(identName);

    if (inAssignment) {
        if (!result.variable) {
            ThrowTypeError({"Cannot find name '", identName, "'."}, identNode->Start());
        }

        Type *varType = GetVariableType(identName, inferedType, nullptr, nullptr, destructuringType, identNode->Start(),
                                        annotationTypeUsed, true);

        if (!IsTypeAssignableTo(varType, result.variable->TsType())) {
            ThrowAssignmentError(varType, result.variable->TsType(), identNode->Start());
        }

        return;
    }

    ASSERT(result.variable);

    Type *varType = GetVariableType(identNode->Name(), inferedType, nullptr, result.variable, destructuringType,
                                    identNode->Start(), annotationTypeUsed);

    varType->SetVariable(result.variable);
    result.variable->SetTsType(varType);
}

void Checker::HandlePropertyDeclarationWithContext(const ir::Property *prop, Type *inferedType,
                                                   VariableBindingContext context, DestructuringType destructuringType,
                                                   bool annotationTypeUsed, bool inAssignment)
{
    if (prop->IsComputed()) {
        // TODO(aszilagyi)
        return;
    }

    util::StringView propName;
    util::StringView searchVarName;
    lexer::SourcePosition errorLoc {};
    bool fetchVar = true;
    Type *initType = nullptr;

    if (prop->Value()) {
        if (prop->Value()->IsIdentifier()) {
            searchVarName = prop->Value()->AsIdentifier()->Name();
            errorLoc = prop->Value()->Start();
        } else if (prop->Value()->IsAssignmentPattern()) {
            const ir::AssignmentExpression *assignmentPattern = prop->Value()->AsAssignmentPattern();

            initType = GetBaseTypeOfLiteralType(assignmentPattern->Right()->Check(this));

            if (assignmentPattern->Left()->IsIdentifier()) {
                searchVarName = assignmentPattern->Left()->AsIdentifier()->Name();
            } else {
                fetchVar = false;
            }
        } else {
            fetchVar = false;
        }

        if (initType && !prop->Value()->AsAssignmentPattern()->Left()->IsIdentifier() && inAssignment) {
            HandleVariableDeclarationWithContext(prop->Value()->AsAssignmentPattern()->Left(), initType, context,
                                                 destructuringType, annotationTypeUsed, inAssignment);
        }

        errorLoc = prop->Key()->Start();

        propName = ToPropertyName(prop->Key(), TypeFlag::COMPUTED_TYPE_LITERAL_NAME);
    } else {
        ASSERT(prop->Key()->IsIdentifier());
        propName = prop->Value()->AsIdentifier()->Name();
        searchVarName = propName;
        errorLoc = prop->Key()->Start();
    }

    binder::Variable *resultVar = nullptr;

    if (fetchVar) {
        binder::ScopeFindResult result = scope_->Find(searchVarName);
        resultVar = result.variable;
    }
    if (fetchVar && inAssignment && !resultVar) {
        ThrowTypeError({"No value exists in scope for the shorthand property '", searchVarName,
                        "'. Either declare one or provide an initializer."},
                       prop->Start());
    }
    if (fetchVar && inAssignment && initType && !IsTypeAssignableTo(initType, resultVar->TsType())) {
        ThrowAssignmentError(initType, resultVar->TsType(), prop->Start());
    }

    Type *varType = GetVariableType(propName, inferedType, initType, resultVar, destructuringType, errorLoc,
                                    annotationTypeUsed, inAssignment);

    if (inAssignment && fetchVar && !IsTypeAssignableTo(varType, resultVar->TsType())) {
        ThrowAssignmentError(varType, resultVar->TsType(), prop->Start());
    }
    if (fetchVar) {
        varType->SetVariable(resultVar);
        resultVar->SetTsType(varType);
        return;
    }

    HandleVariableDeclarationWithContext(initType ? prop->Value()->AsAssignmentPattern()->Left() : prop->Value(),
                                         varType, context, destructuringType, annotationTypeUsed, inAssignment);
}

void Checker::HandleAssignmentPatternWithContext(const ir::AssignmentExpression *assignmentPattern, Type *inferedType,
                                                 VariableBindingContext context, DestructuringType destructuringType,
                                                 bool annotationTypeUsed, bool inAssignment)
{
    Type *initType = CheckTypeCached(assignmentPattern->Right());

    if (assignmentPattern->Left()->IsIdentifier()) {
        const ir::Identifier *identNode = assignmentPattern->Left()->AsIdentifier();
        binder::ScopeFindResult result = scope_->Find(identNode->Name());

        if (inAssignment) {
            if (!result.variable) {
                ThrowTypeError({"Cannot find name '", identNode->Name(), "'."}, identNode->Start());
            }

            if (!IsTypeAssignableTo(initType, result.variable->TsType())) {
                ThrowAssignmentError(initType, result.variable->TsType(), identNode->Start());
            }

            Type *varType = GetVariableType(identNode->Name(), inferedType, GetBaseTypeOfLiteralType(initType), nullptr,
                                            destructuringType, identNode->Start(), annotationTypeUsed, true);

            if (!IsTypeAssignableTo(varType, result.variable->TsType())) {
                ThrowAssignmentError(varType, result.variable->TsType(), identNode->Start());
            }

            return;
        }

        ASSERT(result.variable);

        Type *varType = GetVariableType(identNode->Name(), inferedType, GetBaseTypeOfLiteralType(initType),
                                        result.variable, destructuringType, identNode->Start(), annotationTypeUsed);

        varType->SetVariable(result.variable);
        result.variable->SetTsType(varType);

        return;
    }

    if (inferedType->IsUnionType()) {
        inferedType->AsUnionType()->AddConstituentType(initType, relation_);
    } else {
        inferedType = CreateUnionType({initType, inferedType});
    }

    HandleVariableDeclarationWithContext(assignmentPattern->Left(), inferedType, context, destructuringType,
                                         annotationTypeUsed, inAssignment);
}

void Checker::HandleArrayPatternWithContext(const ir::ArrayExpression *arrayPattern, Type *inferedType,
                                            VariableBindingContext context, bool annotationTypeUsed, bool inAssignment)
{
    for (auto *it : arrayPattern->Elements()) {
        Type *nextInferedType = inferedType;

        if (it->IsArrayPattern() || it->IsObjectPattern() ||
            (it->IsAssignmentPattern() && (it->AsAssignmentPattern()->Left()->IsArrayPattern() ||
                                           it->AsAssignmentPattern()->Left()->IsObjectPattern()))) {
            nextInferedType = GetNextInferedTypeForArrayPattern(inferedType);
            if (!nextInferedType) {
                ThrowTypeError(
                    {"Type '", inferedType, "' must have a '[Symbol.Iterator]()' method that returns an interator"},
                    it->Start());
            }
        }

        HandleVariableDeclarationWithContext(it, nextInferedType, context, DestructuringType::ARRAY_DESTRUCTURING,
                                             annotationTypeUsed, inAssignment);
    }
}

Type *Checker::GetNextInferedTypeForArrayPattern(Type *inferedType)
{
    if (inferedType->IsArrayType()) {
        return inferedType->AsArrayType()->ElementType();
    }

    if (inferedType->IsObjectType() && inferedType->AsObjectType()->IsTupleType()) {
        return inferedType->AsObjectType()->AsTupleType()->Iterator()->Next();
    }

    if (inferedType->IsUnionType()) {
        std::vector<Type *> unionTypes;

        for (auto *type : inferedType->AsUnionType()->ConstituentTypes()) {
            if (type->IsArrayType()) {
                unionTypes.push_back(type->AsArrayType()->ElementType());
            } else if (type->IsObjectType() && type->AsObjectType()->IsTupleType()) {
                TupleType *tupleType = type->AsObjectType()->AsTupleType();
                Type *iter = tupleType->Iterator()->Next();

                if (!iter) {
                    continue;
                }

                unionTypes.push_back(iter);
            } else {
                return nullptr;
            }
        }

        return CreateUnionType(std::move(unionTypes));
    }

    return nullptr;
}

void Checker::HandleRestElementWithContext(const ir::SpreadElement *restElement, Type *inferedType,
                                           VariableBindingContext context, DestructuringType destructuringType,
                                           bool annotationTypeUsed, bool inAssignment)
{
    binder::Variable *restVar = nullptr;

    if (restElement->Argument()->IsIdentifier()) {
        binder::ScopeFindResult result = scope_->Find(restElement->Argument()->AsIdentifier()->Name());
        if (inAssignment && !result.variable) {
            ThrowTypeError({"Cannot find name '", restElement->Argument()->AsIdentifier()->Name(), "'."},
                           restElement->Argument()->Start());
        }

        ASSERT(result.variable);
        restVar = result.variable;
    }

    Type *restType =
        GetRestElementType(inferedType, restVar, destructuringType, restElement->Argument()->Start(), inAssignment);

    if (restVar && !inAssignment) {
        restType->SetVariable(restVar);
        restVar->SetTsType(restType);
        return;
    }

    if (restVar && inAssignment) {
        IsTypeAssignableTo(restType, restVar->TsType(),
                           {"Type '", restType, "' is not assignable to type '", restVar->TsType(), "'."},
                           restElement->Argument()->Start());
        return;
    }

    ASSERT(destructuringType == DestructuringType::ARRAY_DESTRUCTURING);
    HandleVariableDeclarationWithContext(restElement->Argument(), restType, context, destructuringType,
                                         annotationTypeUsed, inAssignment);
}

void Checker::ValidateTypeAnnotationAndInitType(const ir::Expression *initNode, Type **initType,
                                                const Type *annotationType, Type *patternType,
                                                lexer::SourcePosition locInfo)
{
    TypeOrNode elaborateSource;

    if (initNode && annotationType) {
        elaborateSource = initNode;
        if (!ElaborateElementwise(elaborateSource, annotationType, locInfo)) {
            IsTypeAssignableTo(*initType, annotationType,
                               {"Type '", AsSrc(*initType), "' is not assignable to type '", annotationType, "'"},
                               locInfo);
        }
    }

    if (patternType) {
        if (annotationType) {
            elaborateSource = patternType;
            ElaborateElementwise(elaborateSource, annotationType, locInfo);
            return;
        }

        ASSERT(initNode);
        *initType = CreateInitializerTypeForPattern(patternType, initNode);
    }
}

Type *Checker::GetVariableType(const util::StringView &name, Type *inferedType, Type *initType,
                               binder::Variable *resultVar, DestructuringType destructuringType,
                               const lexer::SourcePosition &locInfo, bool annotationTypeUsed, bool inAssignment)
{
    Type *varType = nullptr;

    if (destructuringType == DestructuringType::NO_DESTRUCTURING) {
        varType = inferedType ? inferedType : GlobalAnyType();
    } else if (destructuringType == DestructuringType::OBJECT_DESTRUCTURING) {
        varType = GetVariableTypeInObjectDestructuring(name, inferedType, initType, annotationTypeUsed, locInfo,
                                                       inAssignment);
    } else if (destructuringType == DestructuringType::ARRAY_DESTRUCTURING) {
        varType = GetVariableTypeInArrayDestructuring(inferedType, initType, locInfo, inAssignment);
    }

    if (resultVar) {
        Type *resolvedType = resultVar->TsType();

        if (resolvedType && !inAssignment) {
            IsTypeIdenticalTo(resolvedType, varType,
                              {"Subsequent variable declaration must have the same type. Variable '", resultVar->Name(),
                               "' must be of type '", resolvedType, "', but here has type '", varType, "'."},
                              locInfo);
        }
    }

    return varType ? varType : GlobalAnyType();
}

Type *Checker::GetVariableTypeInObjectDestructuring(const util::StringView &name, Type *inferedType, Type *initType,
                                                    bool annotationTypeUsed, const lexer::SourcePosition &locInfo,
                                                    bool inAssignment)
{
    if (inferedType->IsUnionType()) {
        return GetVariableTypeInObjectDestructuringWithTargetUnion(name, inferedType->AsUnionType(), initType,
                                                                   annotationTypeUsed, locInfo, inAssignment);
    }

    if (inferedType->IsObjectType()) {
        binder::LocalVariable *property = inferedType->AsObjectType()->GetProperty(name);

        if (!property && !initType) {
            if (inferedType->AsObjectType()->IsObjectLiteralType()) {
                ThrowTypeError(
                    "Initializer provides no value for this binding element and the binding element has no default "
                    "value",
                    locInfo);
            }

            ThrowTypeError({"Property '", name, "' does not exist on type '", inferedType}, locInfo);
        }

        if (property) {
            property->AddFlag(binder::VariableFlags::INFERED_IN_PATTERN);
        }

        if (!initType) {
            ASSERT(property);
            return property->TsType();
        }

        if (property) {
            return inAssignment ? property->TsType() : CreateUnionType({initType, property->TsType()});
        }

        return initType;
    }

    ThrowTypeError({"Property '", name, "' does not exist on type '", inferedType}, locInfo);
    return nullptr;
}

Type *Checker::GetVariableTypeInObjectDestructuringWithTargetUnion(const util::StringView &name, UnionType *inferedType,
                                                                   Type *initType, bool annotationTypeUsed,
                                                                   const lexer::SourcePosition &locInfo,
                                                                   bool inAssignment)
{
    std::vector<Type *> unionTypes;

    for (auto *it : inferedType->ConstituentTypes()) {
        if (it->IsObjectType()) {
            binder::LocalVariable *property = it->AsObjectType()->GetProperty(name);

            if (property) {
                unionTypes.push_back(property->TsType());
                property->AddFlag(binder::VariableFlags::INFERED_IN_PATTERN);
                continue;
            }

            if (annotationTypeUsed) {
                ThrowTypeError({"Property '", name, "' does not exist on type '", inferedType}, locInfo);
            }

            continue;
        }

        ThrowTypeError({"Property '", name, "' does not exist on type '", inferedType}, locInfo);
    }

    if (unionTypes.empty()) {
        ThrowTypeError({"Property '", name, "' does not exist on type '", inferedType}, locInfo);
    }

    if (initType && !inAssignment) {
        unionTypes.push_back(initType);
    }

    return CreateUnionType(std::move(unionTypes));
}

Type *Checker::GetVariableTypeInArrayDestructuring(Type *inferedType, Type *initType,
                                                   const lexer::SourcePosition &locInfo, bool inAssignment)
{
    if (inferedType->IsUnionType()) {
        return GetVariableTypeInArrayDestructuringWithTargetUnion(inferedType->AsUnionType(), initType, locInfo,
                                                                  inAssignment);
    }

    if (inferedType->IsArrayType()) {
        if (initType && !inAssignment) {
            return CreateUnionType({initType, inferedType->AsArrayType()->ElementType()});
        }

        return inferedType->AsArrayType()->ElementType();
    }

    if (inferedType->IsObjectType() && inferedType->AsObjectType()->IsTupleType()) {
        TupleType *inferedTuple = inferedType->AsObjectType()->AsTupleType();
        Type *iter = inferedTuple->Iterator()->Next();

        if (initType) {
            if (iter) {
                return inAssignment ? iter : CreateUnionType({initType, iter});
            }

            return initType;
        }

        if (!iter) {
            ThrowTypeError(
                "Initializer provides no value for this binding element and the binding element has no default "
                "value",
                locInfo);
        }

        return iter;
    }

    ThrowTypeError({"Type '", inferedType, "' must have a '[Symbol.Iterator]()' method that returns an interator"},
                   locInfo);
    return nullptr;
}

Type *Checker::GetVariableTypeInArrayDestructuringWithTargetUnion(UnionType *inferedType, Type *initType,
                                                                  const lexer::SourcePosition &locInfo,
                                                                  bool inAssignment)
{
    std::vector<Type *> unionTypes;

    for (auto *it : inferedType->ConstituentTypes()) {
        if (it->IsArrayType()) {
            unionTypes.push_back(it->AsArrayType()->ElementType());
            continue;
        }

        if (it->IsObjectType() && it->AsObjectType()->IsTupleType()) {
            TupleType *tupleType = it->AsObjectType()->AsTupleType();
            Type *iter = tupleType->Iterator()->Next();

            if (!iter) {
                continue;
            }

            unionTypes.push_back(iter);
            continue;
        }

        ThrowTypeError({"Type '", inferedType, "' must have a '[Symbol.Iterator]()' method that returns an interator"},
                       locInfo);
    }

    if (initType) {
        unionTypes.push_back(initType);
    }

    if (unionTypes.empty()) {
        ThrowTypeError(
            "Initializer provides no value for this binding element and the binding element has no default "
            "value",
            locInfo);
    }

    if (inAssignment) {
        unionTypes.pop_back();
    }

    return CreateUnionType(std::move(unionTypes));
}

Type *Checker::GetRestElementType(Type *inferedType, binder::Variable *resultVar, DestructuringType destructuringType,
                                  const lexer::SourcePosition &locInfo, bool inAssignment)
{
    Type *restType = nullptr;

    if (destructuringType == DestructuringType::ARRAY_DESTRUCTURING) {
        restType = GetRestElementTypeInArrayDestructuring(inferedType, locInfo);
    } else if (destructuringType == DestructuringType::OBJECT_DESTRUCTURING) {
        restType = GetRestElementTypeInObjectDestructuring(inferedType, locInfo);
    }

    if (resultVar && !inAssignment) {
        Type *resolvedType = resultVar->TsType();

        if (resolvedType) {
            IsTypeIdenticalTo(resolvedType, restType,
                              {"Subsequent variable declaration must have the same type. Variable '", resultVar->Name(),
                               "' must be of type '", resolvedType, "', but here has type '", restType, "'."},
                              locInfo);
        }
    }

    return restType;
}

Type *Checker::GetRestElementTypeInArrayDestructuring(Type *inferedType, const lexer::SourcePosition &locInfo)
{
    if (inferedType->IsUnionType()) {
        bool createArrayType = false;

        for (auto *it : inferedType->AsUnionType()->ConstituentTypes()) {
            if (it->IsArrayType()) {
                createArrayType = true;
                break;
            }

            if (!it->IsObjectType() || !it->AsObjectType()->IsTupleType()) {
                ThrowTypeError(
                    {"Type '", inferedType, "' must have a '[Symbol.Iterator]()' method that returns an interator"},
                    locInfo);
            }
        }

        if (createArrayType) {
            return CreateArrayTypeForRest(inferedType->AsUnionType());
        }

        std::vector<Type *> tupleUnion;

        for (auto *it : inferedType->AsUnionType()->ConstituentTypes()) {
            ASSERT(it->IsObjectType() && it->AsObjectType()->IsTupleType());
            Type *newTuple = CreateTupleTypeForRest(it->AsObjectType()->AsTupleType()->Iterator());
            tupleUnion.push_back(newTuple);
        }

        return CreateUnionType(std::move(tupleUnion));
    }

    if (inferedType->IsArrayType()) {
        return inferedType;
    }

    if (inferedType->IsObjectType() && inferedType->AsObjectType()->IsTupleType()) {
        return CreateTupleTypeForRest(inferedType->AsObjectType()->AsTupleType()->Iterator());
    }

    ThrowTypeError({"Type '", inferedType, "' must have a '[Symbol.Iterator]()' method that returns an interator"},
                   locInfo);
    return nullptr;
}

Type *Checker::GetRestElementTypeInObjectDestructuring(Type *inferedType, const lexer::SourcePosition &locInfo)
{
    if (inferedType->IsUnionType()) {
        std::vector<Type *> unionTypes;

        for (auto *it : inferedType->AsUnionType()->ConstituentTypes()) {
            if (it->IsObjectType()) {
                unionTypes.push_back(CreateObjectTypeForRest(it->AsObjectType()));
                continue;
            }

            ThrowTypeError("Rest types may only be created from object types.", locInfo);
        }

        return CreateUnionType(std::move(unionTypes));
    }

    if (inferedType->IsObjectType()) {
        return CreateObjectTypeForRest(inferedType->AsObjectType());
    }

    ThrowTypeError("Rest types may only be created from object types.", locInfo);
    return nullptr;
}

Type *Checker::CreateObjectTypeForRest(ObjectType *objType)
{
    ObjectDescriptor *desc = allocator_->New<ObjectDescriptor>();

    for (auto *it : objType->AsObjectType()->Properties()) {
        if (!it->HasFlag(binder::VariableFlags::INFERED_IN_PATTERN)) {
            auto *memberVar = binder::Scope::CreateVar(allocator_, it->Name(), binder::VariableFlags::NONE, nullptr);
            memberVar->SetTsType(it->TsType());
            it->RemoveFlag(binder::VariableFlags::INFERED_IN_PATTERN);
            memberVar->AddFlag(it->Flags());
            desc->properties.push_back(memberVar);
        }
    }

    return allocator_->New<ObjectLiteralType>(desc);
}

Type *Checker::CreateTupleTypeForRest(TupleTypeIterator *iterator)
{
    ObjectDescriptor *desc = allocator_->New<ObjectDescriptor>();
    TupleElementFlagPool elementFlags;
    uint32_t index = 0;

    (void)iterator;

    Type *iter = iterator->Next();
    while (iter) {
        Type *elementType = iter;
        ElementFlags memberFlag = ElementFlags::REQUIRED;

        util::StringView memberIndex = util::Helpers::ToStringView(allocator_, index);
        auto *memberVar = binder::Scope::CreateVar(allocator_, memberIndex, binder::VariableFlags::PROPERTY, nullptr);
        memberVar->SetTsType(elementType);
        elementFlags.insert({memberIndex, memberFlag});
        desc->properties.push_back(memberVar);

        index++;
        iter = iterator->Next();
    }

    return CreateTupleType(desc, std::move(elementFlags), ElementFlags::REQUIRED, index, index, false);
}

Type *Checker::CreateArrayTypeForRest(UnionType *inferedType)
{
    std::vector<Type *> unionTypes;

    for (auto *it : inferedType->ConstituentTypes()) {
        if (it->IsArrayType()) {
            unionTypes.push_back(it->AsArrayType()->ElementType());
            continue;
        }

        if (it->IsObjectType() && it->AsObjectType()->IsTupleType()) {
            TupleType *currentTuple = it->AsObjectType()->AsTupleType();

            Type *iter = currentTuple->Iterator()->Next();
            while (iter) {
                unionTypes.push_back(iter);
                iter = currentTuple->Iterator()->Next();
            }
        }
    }

    Type *restArrayElementType = CreateUnionType(std::move(unionTypes));
    return allocator_->New<ArrayType>(restArrayElementType);
}

Type *Checker::CreateInitializerTypeForPattern(const Type *patternType, const ir::Expression *initNode,
                                               bool validateCurrent)
{
    if (patternType->IsObjectType() && patternType->AsObjectType()->IsObjectLiteralType() &&
        initNode->IsObjectExpression()) {
        return CreateInitializerTypeForObjectPattern(patternType->AsObjectType(),
                                                     const_cast<ir::ObjectExpression *>(initNode->AsObjectExpression()),
                                                     validateCurrent);
    }

    if (patternType->IsObjectType() && patternType->AsObjectType()->IsTupleType() && initNode->IsArrayExpression()) {
        return CreateInitializerTypeForArrayPattern(patternType->AsObjectType()->AsTupleType(),
                                                    const_cast<ir::ArrayExpression *>(initNode->AsArrayExpression()),
                                                    validateCurrent);
    }

    return GetBaseTypeOfLiteralType(CheckTypeCached(initNode));
}

Type *Checker::CreateInitializerTypeForObjectPattern(const ObjectType *patternType,
                                                     const ir::ObjectExpression *initNode, bool validateCurrent)
{
    ObjectType *initObjectType = initNode->Check(this)->AsObjectType();

    for (auto *it : initNode->AsObjectExpression()->Properties()) {
        if (it->IsProperty()) {
            ir::Property *currentProp = it->AsProperty();
            util::StringView propName =
                ToPropertyName(currentProp->Key(), TypeFlag::COMPUTED_TYPE_LITERAL_NAME, currentProp->IsComputed());

            binder::Variable *patternProp = patternType->GetProperty(propName);

            if (!patternProp) {
                if (validateCurrent && !patternType->HasObjectFlag(ObjectType::ObjectFlags::HAVE_REST)) {
                    ThrowTypeError({"Object literal may only specify known properties, and '", propName,
                                    "' does not exist in type '", patternType, "'."},
                                   currentProp->Start());
                }

                continue;
            }

            binder::Variable *initProp = initObjectType->GetProperty(propName);
            ASSERT(initProp);

            initProp->SetTsType(CreateInitializerTypeForPattern(
                patternProp->TsType(), currentProp->Value(), !patternProp->HasFlag(binder::VariableFlags::OPTIONAL)));
        }
    }

    return initObjectType;
}

Type *Checker::CreateInitializerTypeForArrayPattern(const TupleType *patternType, const ir::ArrayExpression *initNode,
                                                    bool validateCurrent)
{
    if (patternType->Properties().size() == 1 && (patternType->CombinedFlags() & ElementFlags::REST)) {
        return initNode->Check(this);
    }

    ObjectType *initTupleType = initNode->Check(this)->AsObjectType()->AsTupleType();

    nodeCache_.insert({initNode, initTupleType});

    for (size_t it = 0; it < initNode->Elements().size(); it++) {
        if (patternType->FixedLength() < it) {
            return initTupleType;
        }

        util::StringView propName = util::Helpers::ToStringView(allocator_, static_cast<uint32_t>(it));
        binder::Variable *initProp = initTupleType->GetProperty(propName);
        ASSERT(initProp);

        binder::Variable *patternProp = patternType->GetProperty(propName);

        if (patternProp) {
            initProp->SetTsType(
                CreateInitializerTypeForPattern(patternProp->TsType(), initNode->Elements()[it], validateCurrent));
        }
    }

    return initTupleType;
}

bool Checker::ShouldCreatePropertyValueName(const ir::Expression *propValue)
{
    return propValue->IsArrayPattern() || propValue->IsObjectPattern() ||
           (propValue->IsAssignmentPattern() && (propValue->AsAssignmentPattern()->Left()->IsArrayPattern() ||
                                                 propValue->AsAssignmentPattern()->Left()->IsObjectPattern()));
}

void Checker::CreatePatternName(const ir::AstNode *node, std::stringstream &ss) const
{
    switch (node->Type()) {
        case ir::AstNodeType::IDENTIFIER: {
            ss << node->AsIdentifier()->Name();
            break;
        }
        case ir::AstNodeType::ARRAY_PATTERN: {
            ss << "[";

            const auto &elements = node->AsArrayPattern()->Elements();
            for (auto it = elements.begin(); it != elements.end(); it++) {
                Checker::CreatePatternName(*it, ss);
                if (std::next(it) != elements.end()) {
                    ss << ", ";
                }
            }

            ss << "]";
            break;
        }
        case ir::AstNodeType::OBJECT_PATTERN: {
            ss << "{ ";

            const auto &properties = node->AsObjectPattern()->Properties();
            for (auto it = properties.begin(); it != properties.end(); it++) {
                Checker::CreatePatternName(*it, ss);
                if (std::next(it) != properties.end()) {
                    ss << ", ";
                }
            }

            ss << " }";
            break;
        }
        case ir::AstNodeType::ASSIGNMENT_PATTERN: {
            Checker::CreatePatternName(node->AsAssignmentPattern()->Left(), ss);
            break;
        }
        case ir::AstNodeType::PROPERTY: {
            const ir::Property *prop = node->AsProperty();
            util::StringView propName;

            if (prop->Key()->IsIdentifier()) {
                propName = prop->Key()->AsIdentifier()->Name();
            } else {
                switch (prop->Key()->Type()) {
                    case ir::AstNodeType::NUMBER_LITERAL: {
                        propName =
                            util::Helpers::ToStringView(allocator_, prop->Key()->AsNumberLiteral()->Number<double>());
                        break;
                    }
                    case ir::AstNodeType::BIGINT_LITERAL: {
                        propName = prop->Key()->AsBigIntLiteral()->Str();
                        break;
                    }
                    case ir::AstNodeType::STRING_LITERAL: {
                        propName = prop->Key()->AsStringLiteral()->Str();
                        break;
                    }
                    default: {
                        UNREACHABLE();
                        break;
                    }
                }
            }

            ss << propName;

            if (ShouldCreatePropertyValueName(prop->Value())) {
                ss << ": ";
                Checker::CreatePatternName(prop->Value(), ss);
            }

            break;
        }
        case ir::AstNodeType::REST_ELEMENT: {
            ss << "...";
            Checker::CreatePatternName(node->AsRestElement()->Argument(), ss);
            break;
        }
        case ir::AstNodeType::OMITTED_EXPRESSION: {
            ss << ", ";
            break;
        }
        default:
            break;
    }
}

}  // namespace panda::es2panda::checker
