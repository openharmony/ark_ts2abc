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
#include <ir/expressions/objectExpression.h>
#include <ir/expressions/identifier.h>
#include <ir/statements/variableDeclarator.h>
#include <ir/base/property.h>
#include <ir/base/spreadElement.h>
#include <typescript/checker.h>
#include <typescript/types/indexInfo.h>
#include <binder/declaration.h>
#include <binder/scope.h>
#include <binder/variable.h>

namespace panda::es2panda::checker {

bool Checker::ElaborateElementwise(TypeOrNode source, const Type *targetType, lexer::SourcePosition locInfo)
{
    const ir::AstNode *sourceNode = nullptr;
    Type *sourceType = nullptr;

    if (std::holds_alternative<const ir::AstNode *>(source)) {
        sourceNode = std::get<const ir::AstNode *>(source);
    } else {
        ASSERT(std::holds_alternative<Type *>(source));
        sourceType = std::get<Type *>(source);
    }

    if (((sourceNode && sourceNode->IsArrayExpression()) ||
         (sourceType && sourceType->IsObjectType() && sourceType->AsObjectType()->IsTupleType())) &&
        (MaybeTypeOfKind(targetType, TypeFlag::ARRAY) ||
         MaybeTypeOfKind(targetType, ObjectType::ObjectTypeKind::TUPLE))) {
        return ElaborateArrayLiteral(source, targetType, locInfo);
    }

    if (((sourceNode && sourceNode->IsObjectExpression()) ||
         (sourceType && sourceType->IsObjectType() && sourceType->AsObjectType()->IsObjectLiteralType())) &&
        (MaybeTypeOfKind(targetType, ObjectType::ObjectTypeKind::LITERAL) ||
         MaybeTypeOfKind(targetType, ObjectType::ObjectTypeKind::INTERFACE))) {
        return ElaborateObjectLiteral(source, targetType, locInfo);
    }

    return false;
}

bool Checker::ElaborateObjectLiteral(TypeOrNode source, const Type *targetType, lexer::SourcePosition locInfo)
{
    const ir::ObjectExpression *sourceNode = nullptr;
    ObjectLiteralType *sourceType = nullptr;

    if (std::holds_alternative<const ir::AstNode *>(source)) {
        sourceNode = std::get<const ir::AstNode *>(source)->AsObjectExpression();
    } else {
        ASSERT(std::holds_alternative<Type *>(source));
        sourceType = std::get<Type *>(source)->AsObjectType()->AsObjectLiteralType();
    }

    bool targetIsUnion = targetType->IsUnionType();
    if (targetIsUnion) {
        for (auto *it : targetType->AsUnionType()->ConstituentTypes()) {
            if (it->IsObjectType() &&
                (it->AsObjectType()->IsObjectLiteralType() || it->AsObjectType()->IsInterfaceType()) &&
                it->GetTypeFacts() == TypeFacts::EMPTY_OBJECT_FACTS) {
                return true;
            }
        }
    } else if (sourceNode && targetType->GetTypeFacts() == TypeFacts::EMPTY_OBJECT_FACTS) {
        return true;
    }

    ObjectLiteralElaborationData elaborationData;
    elaborationData.desc = allocator_->New<ObjectDescriptor>();
    GetPotentialTypesAndIndexInfosForElaboration(targetType, &elaborationData);

    if (sourceNode) {
        bool excessCheckNeeded = ElaborateObjectLiteralWithNode(sourceNode, targetType, &elaborationData);
        if (!excessCheckNeeded) {
            excessCheckNeeded = CheckIfExcessTypeCheckNeededForObjectElaboration(targetType, &elaborationData);
        }

        if (excessCheckNeeded) {
            for (const auto *it : elaborationData.spreads) {
                HandleSpreadElement(it->AsSpreadElement(), elaborationData.desc, it->Start());
            }

            Type *sourceObjType = allocator_->New<ObjectLiteralType>(elaborationData.desc);

            IsTypeAssignableTo(sourceObjType, targetType,
                               {"Type '", sourceObjType, "' is not assignable to type '", targetType, "'."}, locInfo);
        }

        return true;
    }

    ASSERT(sourceType);
    ElaborateObjectLiteralWithType(sourceType, targetType, elaborationData.potentialObjectTypes, locInfo);

    return true;
}

void Checker::GetPotentialTypesAndIndexInfosForElaboration(const Type *targetType,
                                                           ObjectLiteralElaborationData *elaborationData)
{
    if (targetType->IsUnionType()) {
        std::vector<Type *> numberInfoTypes;
        std::vector<Type *> stringInfoTypes;

        for (auto *it : targetType->AsUnionType()->ConstituentTypes()) {
            if (it->IsObjectType() &&
                (it->AsObjectType()->IsObjectLiteralType() || it->AsObjectType()->IsInterfaceType())) {
                IndexInfoTypePair infoTypePair = GetIndexInfoTypePair(it->AsObjectType());
                if (infoTypePair.first) {
                    stringInfoTypes.push_back(infoTypePair.first);
                }

                if (infoTypePair.second) {
                    numberInfoTypes.push_back(infoTypePair.second);
                }

                elaborationData->potentialObjectTypes.insert({it->Id(), it->AsObjectType()});
            }
        }

        Type *numberInfosType = nullptr;
        if (!numberInfoTypes.empty()) {
            numberInfosType = CreateUnionType(std::move(numberInfoTypes));
        }

        Type *stringInfosType = nullptr;
        if (!stringInfoTypes.empty()) {
            stringInfosType = CreateUnionType(std::move(stringInfoTypes));
        }

        elaborationData->numberInfosType = numberInfosType;
        elaborationData->stringInfosType = stringInfosType;
    } else {
        IndexInfoTypePair infoTypePair = GetIndexInfoTypePair(targetType->AsObjectType());

        elaborationData->stringInfosType = infoTypePair.first;
        elaborationData->numberInfosType = infoTypePair.second;
    }
}

IndexInfoTypePair Checker::GetIndexInfoTypePair(const ObjectType *type)
{
    const IndexInfo *stringIndexInfo = type->StringIndexInfo();
    const IndexInfo *numberIndexInfo = type->NumberIndexInfo();

    if (type->IsInterfaceType()) {
        if (!stringIndexInfo) {
            stringIndexInfo = type->AsInterfaceType()->FindIndexInfo(false);
        }

        if (!numberIndexInfo) {
            numberIndexInfo = type->AsInterfaceType()->FindIndexInfo(true);
        }
    }

    return {stringIndexInfo ? const_cast<Type *>(stringIndexInfo->InfoType()) : nullptr,
            numberIndexInfo ? const_cast<Type *>(numberIndexInfo->InfoType()) : nullptr};
}

bool Checker::CheckIfExcessTypeCheckNeededForObjectElaboration(const Type *targetType,
                                                               ObjectLiteralElaborationData *elaborationData)
{
    if (targetType->IsUnionType()) {
        for (auto it : elaborationData->potentialObjectTypes) {
            if (!it.second->CallSignatures().empty() || !it.second->ConstructSignatures().empty()) {
                return true;
            }
        }
    } else if (!targetType->AsObjectType()->CallSignatures().empty() ||
               !targetType->AsObjectType()->ConstructSignatures().empty()) {
        return true;
    }

    if (targetType->IsUnionType()) {
        uint32_t targetPropCount = 0;

        for (auto it : elaborationData->potentialObjectTypes) {
            targetPropCount = it.second->Properties().size();

            if (it.second->IsInterfaceType()) {
                std::vector<binder::LocalVariable *> interfaceProperties;
                it.second->AsInterfaceType()->CollectProperties(&interfaceProperties);
                targetPropCount += interfaceProperties.size();
            }

            if (elaborationData->desc->properties.size() < targetPropCount) {
                return true;
            }
        }
    } else {
        uint32_t targetPropCount = targetType->AsObjectType()->Properties().size();

        if (targetType->AsObjectType()->IsInterfaceType()) {
            std::vector<binder::LocalVariable *> interfaceProperties;
            targetType->AsObjectType()->AsInterfaceType()->CollectProperties(&interfaceProperties);
            targetPropCount += interfaceProperties.size();
        }

        if (elaborationData->desc->properties.size() < targetPropCount) {
            return true;
        }
    }

    return false;
}

bool Checker::ElaborateObjectLiteralWithNode(const ir::ObjectExpression *sourceNode, const Type *targetType,
                                             ObjectLiteralElaborationData *elaborationData)
{
    bool excessCheckNeeded = false;

    for (auto *sourceProp : sourceNode->Properties()) {
        if (!sourceProp->IsProperty()) {
            ASSERT(sourceProp->IsSpreadElement());
            elaborationData->spreads.push_back(sourceProp->AsSpreadElement());
            excessCheckNeeded = true;
            continue;
        }
        const ir::Property *currentProp = sourceProp->AsProperty();

        ObjectLiteralPropertyInfo propInfo =
            HandleObjectLiteralProperty(currentProp, elaborationData->desc, &elaborationData->stringIndexTypes);
        if (propInfo.handleNextProp) {
            excessCheckNeeded = true;
            continue;
        }

        bool numberLiteralName = currentProp->Key()->IsNumberLiteral();

        Type *targetPropType = GetTargetPropertyTypeFromTargetForElaborationWithNode(
            targetType, elaborationData, propInfo.propName, currentProp->Value());

        if (!targetPropType) {
            targetPropType =
                GetindexInfoTypeOrThrowError(targetType, elaborationData, propInfo.propName, currentProp->IsComputed(),
                                             numberLiteralName, sourceProp->Start());
        }

        if (!IsLiteralType(targetPropType) || targetPropType->IsBooleanType()) {
            propInfo.propType = GetBaseTypeOfLiteralType(propInfo.propType);
        }

        if (!ElaborateElementwise(currentProp->Value(), targetPropType, sourceProp->Start()) &&
            !IsTypeAssignableTo(propInfo.propType, targetPropType)) {
            if (currentProp->IsComputed() && currentProp->Key()->IsIdentifier()) {
                ThrowTypeError({"Type of computed property's value is '", propInfo.propType,
                                "', which is not assignable to type '", targetPropType, "'."},
                               sourceProp->Start());
            } else {
                ThrowTypeError({"Type '", propInfo.propType, "' is not assignable to type '", targetPropType, "'."},
                               sourceProp->Start());
            }
        }

        auto *objLitProp =
            binder::Scope::CreateVar(allocator_, propInfo.propName, binder::VariableFlags::NONE, currentProp);

        objLitProp->AddFlag(currentProp->IsMethod() ? binder::VariableFlags::METHOD : binder::VariableFlags::PROPERTY);
        propInfo.propType->SetVariable(objLitProp);
        propInfo.propType->AddTypeFlag(TypeFlag::RELATION_CHECKED);
        objLitProp->SetTsType(propInfo.propType);
        elaborationData->desc->properties.push_back(objLitProp);
    }

    return excessCheckNeeded;
}

Type *Checker::GetindexInfoTypeOrThrowError(const Type *targetType, ObjectLiteralElaborationData *elaborationData,
                                            const util::StringView &propName, bool computed, bool numberLiteralName,
                                            lexer::SourcePosition locInfo)
{
    if ((!elaborationData->stringInfosType && !elaborationData->numberInfosType) ||
        (!numberLiteralName && !elaborationData->stringInfosType)) {
        std::stringstream ss;
        if (computed) {
            ss << "[" << propName << "]";
        } else {
            ss << propName;
        }

        std::string str = ss.str();

        ThrowTypeError({"Object literal may only specify known properties, and '",
                        util::StringView(std::string_view(str)), "' does not exist in type '", targetType, "'"},
                       locInfo);
    }

    if (numberLiteralName && elaborationData->numberInfosType) {
        return elaborationData->numberInfosType;
    }

    return elaborationData->stringInfosType;
}

void Checker::ElaborateObjectLiteralWithType(const ObjectLiteralType *sourceType, const Type *targetType,
                                             const std::unordered_map<uint32_t, ObjectType *> &potentialObjectTypes,
                                             [[maybe_unused]] lexer::SourcePosition locInfo)
{
    for (auto *sourceProp : sourceType->Properties()) {
        Type *targetPropType =
            GetTargetPropertyTypeFromTargetForElaborationWithType(targetType, potentialObjectTypes, sourceProp->Name());

        if (!targetPropType) {
            // TODO(aszilagyi): search for index info and then throw error if its missing
            ThrowTypeError({"Property '", sourceProp->Name(), "' does not exist on type '", targetType, "'"},
                           sourceProp->Declaration()->Node()->Start());
        }

        Type *sourcePropType = sourceProp->TsType();

        if (!ElaborateElementwise(sourcePropType, targetPropType, sourceProp->Declaration()->Node()->Start()) &&
            !IsTypeAssignableTo(sourcePropType, targetPropType)) {
            ThrowTypeError({"Type '", sourcePropType, "' is not assignable to type '", targetPropType, "'."},
                           sourceProp->Declaration()->Node()->Start());
        }
    }
}

Type *Checker::GetTargetPropertyTypeFromTargetForElaborationWithNode(const Type *targetType,
                                                                     ObjectLiteralElaborationData *elaborationData,
                                                                     const util::StringView &propName,
                                                                     const ir::Expression *propValue)
{
    binder::LocalVariable *searchProp = nullptr;

    if (targetType->IsUnionType()) {
        std::vector<Type *> targetPropTypes;
        for (auto potentialType = elaborationData->potentialObjectTypes.begin();
             potentialType != elaborationData->potentialObjectTypes.end();) {
            searchProp = potentialType->second->GetProperty(propName);
            if (searchProp) {
                if (searchProp->TsType()->IsUnionType()) {
                    for (auto *type : searchProp->TsType()->AsUnionType()->ConstituentTypes()) {
                        targetPropTypes.push_back(type);
                    }
                } else {
                    targetPropTypes.push_back(searchProp->TsType());
                }

                if (!IsTypeAssignableTo(CreateTupleTypeFromEveryArrayExpression(propValue), searchProp->TsType())) {
                    potentialType = elaborationData->potentialObjectTypes.erase(potentialType);
                    continue;
                }

                potentialType++;
                continue;
            }

            potentialType = elaborationData->potentialObjectTypes.erase(potentialType);
        }

        if (targetPropTypes.empty()) {
            return nullptr;
        }

        return CreateUnionType(std::move(targetPropTypes));
    }

    ASSERT(targetType->IsObjectType());
    searchProp = targetType->AsObjectType()->GetProperty(propName);
    if (!searchProp) {
        return nullptr;
    }

    return searchProp->TsType();
}

Type *Checker::GetTargetPropertyTypeFromTargetForElaborationWithType(
    const Type *targetType, const std::unordered_map<uint32_t, ObjectType *> &potentialObjectTypes,
    const util::StringView &propName)
{
    binder::LocalVariable *searchProp = nullptr;

    if (targetType->IsUnionType()) {
        std::vector<Type *> targetPropTypes;
        for (auto it : potentialObjectTypes) {
            searchProp = it.second->GetProperty(propName);
            if (searchProp) {
                if (searchProp->TsType()->IsUnionType()) {
                    for (auto *type : searchProp->TsType()->AsUnionType()->ConstituentTypes()) {
                        targetPropTypes.push_back(type);
                    }
                } else {
                    targetPropTypes.push_back(searchProp->TsType());
                }
            }
        }

        if (targetPropTypes.empty()) {
            return nullptr;
        }

        return CreateUnionType(std::move(targetPropTypes));
    }

    ASSERT(targetType->IsObjectType());
    searchProp = targetType->AsObjectType()->GetProperty(propName);
    if (!searchProp) {
        return nullptr;
    }

    return searchProp->TsType();
}

bool Checker::ElaborateArrayLiteral(TypeOrNode source, const Type *targetType, lexer::SourcePosition locInfo)
{
    const ir::ArrayExpression *sourceNode = nullptr;
    TupleType *sourceType = nullptr;

    if (std::holds_alternative<const ir::AstNode *>(source)) {
        sourceNode = std::get<const ir::AstNode *>(source)->AsArrayExpression();
    } else {
        ASSERT(std::holds_alternative<Type *>(source));
        sourceType = std::get<Type *>(source)->AsObjectType()->AsTupleType();
    }

    std::unordered_map<uint32_t, Type *> potentialTypes;

    if (targetType->IsUnionType()) {
        for (auto *it : targetType->AsUnionType()->ConstituentTypes()) {
            if (it->IsArrayType() || (it->IsObjectType() && it->AsObjectType()->IsTupleType())) {
                potentialTypes.insert({it->Id(), it});
            }
        }
    }

    if (sourceNode) {
        ElaborateArrayLiteralWithNode(sourceNode, targetType, &potentialTypes, locInfo);
    } else {
        ASSERT(sourceType);
        ElaborateArrayLiteralWithType(sourceType, targetType, potentialTypes);
    }

    if (sourceNode) {
        CheckTargetTupleLengthConstraints(targetType, sourceNode, &potentialTypes, locInfo);
    }

    return true;
}

void Checker::ElaborateArrayLiteralWithNode(const ir::ArrayExpression *sourceNode, const Type *targetType,
                                            std::unordered_map<uint32_t, Type *> *potentialTypes,
                                            lexer::SourcePosition locInfo)
{
    uint32_t tupleIdx = 0;
    for (auto *it : sourceNode->Elements()) {
        Type *currentElementType = it->Check(this);
        const Type *targetElementType = nullptr;

        if (targetType->IsUnionType()) {
            std::vector<Type *> newElementUnion =
                CollectTargetTypesForArrayElaborationWithNodeFromTargetUnion(potentialTypes, it, tupleIdx);
            if (newElementUnion.empty()) {
                ThrowTypeError({"Type '", sourceNode->Check(this), "' is not assignable to type '", targetType, "'."},
                               locInfo);
            }

            targetElementType = CreateUnionType(std::move(newElementUnion));
        } else if (targetType->IsObjectType() && targetType->AsObjectType()->IsTupleType()) {
            const TupleType *targetTuple = targetType->AsObjectType()->AsTupleType();

            if (targetTuple->FixedLength() <= tupleIdx) {
                ThrowTypeError({"Type '", sourceNode->Check(this), "' is not assignable to type '", targetTuple, "'."},
                               locInfo);
            }

            targetElementType = targetTuple->Properties()[tupleIdx]->TsType();
        } else {
            ASSERT(targetType->IsArrayType());
            targetElementType = targetType->AsArrayType()->ElementType();
        }

        tupleIdx++;

        if (!ElaborateElementwise(it, targetElementType, it->Start()) &&
            !IsTypeAssignableTo(currentElementType, targetElementType)) {
            if (targetElementType->HasTypeFlag(TypeFlag::LITERAL)) {
                ThrowTypeError({"Type '", currentElementType, "' is not assignable to type '", targetElementType, "'."},
                               it->Start());
            } else {
                ThrowTypeError(
                    {"Type '", AsSrc(currentElementType), "' is not assignable to type '", targetElementType, "'."},
                    it->Start());
            }
        }
    }
}

void Checker::ElaborateArrayLiteralWithType(const TupleType *sourceType, const Type *targetType,
                                            const std::unordered_map<uint32_t, Type *> &potentialTypes)
{
    for (size_t tupleIdx = 0; tupleIdx < sourceType->Properties().size(); tupleIdx++) {
        binder::Variable *sourceProp = sourceType->Properties()[tupleIdx];
        Type *sourceElementType = sourceProp->TsType();
        const Type *targetElementType = nullptr;

        if (tupleIdx == sourceType->Properties().size() - 1 && (sourceType->CombinedFlags() & ElementFlags::REST)) {
            return;
        }

        if (targetType->IsUnionType()) {
            std::vector<Type *> newElementUnion =
                CollectTargetTypesForArrayElaborationWithTypeFromTargetUnion(potentialTypes, tupleIdx);
            if (newElementUnion.empty()) {
                ThrowTypeError({"Property '", tupleIdx, "' does not exist on type '", targetType},
                               sourceProp->Declaration()->Node()->Start());
            }

            targetElementType = CreateUnionType(std::move(newElementUnion));
        } else if (targetType->IsObjectType() && targetType->AsObjectType()->IsTupleType()) {
            const TupleType *targetTuple = targetType->AsObjectType()->AsTupleType();

            if (tupleIdx >= targetTuple->FixedLength()) {
                ThrowTypeError({"Tuple type '", targetType, "' of length '", targetTuple->FixedLength(),
                                "' has no element at index '", tupleIdx, "' ."},
                               sourceProp->Declaration()->Node()->Start());
            }

            targetElementType = targetTuple->Properties()[tupleIdx]->TsType();
        } else {
            ASSERT(targetType->IsArrayType());
            targetElementType = targetType->AsArrayType()->ElementType();
        }

        if (!ElaborateElementwise(sourceElementType, targetElementType, sourceProp->Declaration()->Node()->Start()) &&
            !IsTypeAssignableTo(sourceElementType, targetElementType)) {
            ThrowTypeError({"Type '", sourceElementType, "' is not assignable to type '", targetElementType, "'."},
                           sourceProp->Declaration()->Node()->Start());
        }
    }
}

std::vector<Type *> Checker::CollectTargetTypesForArrayElaborationWithNodeFromTargetUnion(
    std::unordered_map<uint32_t, Type *> *potentialTypes, const ir::Expression *currentSourceElement, uint32_t tupleIdx)
{
    std::vector<Type *> newElementUnion;

    for (auto potentialType = potentialTypes->begin(); potentialType != potentialTypes->end();) {
        if (potentialType->second->IsObjectType() && potentialType->second->AsObjectType()->IsTupleType()) {
            TupleType *currentTargetTuple = potentialType->second->AsObjectType()->AsTupleType();

            if (currentTargetTuple->FixedLength() <= tupleIdx) {
                potentialType = potentialTypes->erase(potentialType);
                continue;
            }

            Type *elementType = currentTargetTuple->Properties()[tupleIdx]->TsType();

            if (elementType->IsUnionType()) {
                std::vector<Type *> &types = elementType->AsUnionType()->ConstituentTypes();
                newElementUnion.insert(newElementUnion.end(), types.begin(), types.end());
            } else {
                newElementUnion.push_back(elementType);
            }

            if (!IsTypeAssignableTo(CreateTupleTypeFromEveryArrayExpression(currentSourceElement), elementType)) {
                potentialType = potentialTypes->erase(potentialType);
                continue;
            }
        } else if (potentialType->second->IsArrayType()) {
            Type *potentialArrayElementType = potentialType->second->AsArrayType()->ElementType();

            if (potentialArrayElementType->IsUnionType()) {
                std::vector<Type *> &types = potentialArrayElementType->AsUnionType()->ConstituentTypes();
                newElementUnion.insert(newElementUnion.end(), types.begin(), types.end());
            } else {
                newElementUnion.push_back(potentialArrayElementType);
            }
        }

        potentialType++;
    }

    return newElementUnion;
}

std::vector<Type *> Checker::CollectTargetTypesForArrayElaborationWithTypeFromTargetUnion(
    const std::unordered_map<uint32_t, Type *> &potentialTypes, uint32_t tupleIdx)
{
    std::vector<Type *> newElementUnion;

    for (const auto &potentialType : potentialTypes) {
        if (potentialType.second->IsObjectType() && potentialType.second->AsObjectType()->IsTupleType()) {
            TupleType *currentTargetTuple = potentialType.second->AsObjectType()->AsTupleType();

            if (currentTargetTuple->FixedLength() <= tupleIdx) {
                continue;
            }

            Type *elementType = currentTargetTuple->Properties()[tupleIdx]->TsType();

            if (elementType->IsUnionType()) {
                std::vector<Type *> &types = elementType->AsUnionType()->ConstituentTypes();
                newElementUnion.insert(newElementUnion.end(), types.begin(), types.end());
            } else {
                newElementUnion.push_back(elementType);
            }
        } else if (potentialType.second->IsArrayType()) {
            Type *potentialArrayElementType = potentialType.second->AsArrayType()->ElementType();

            if (potentialArrayElementType->IsUnionType()) {
                std::vector<Type *> &types = potentialArrayElementType->AsUnionType()->ConstituentTypes();
                newElementUnion.insert(newElementUnion.end(), types.begin(), types.end());
            } else {
                newElementUnion.push_back(potentialArrayElementType);
            }
        }
    }

    return newElementUnion;
}

void Checker::CheckTargetTupleLengthConstraints(const Type *targetType, const ir::ArrayExpression *sourceNode,
                                                std::unordered_map<uint32_t, Type *> *potentialTypes,
                                                const lexer::SourcePosition &locInfo)
{
    if (targetType->IsUnionType()) {
        for (auto it = potentialTypes->begin(); it != potentialTypes->end();) {
            if (it->second->IsObjectType() && it->second->AsObjectType()->IsTupleType()) {
                TupleType *currentTargetTuple = it->second->AsObjectType()->AsTupleType();

                if (currentTargetTuple->MinLength() > sourceNode->Elements().size() ||
                    (sourceNode->Elements().empty() && currentTargetTuple->MinLength() > 0)) {
                    it = potentialTypes->erase(it);
                    continue;
                }
            }

            it++;
        }

        if (potentialTypes->empty()) {
            ThrowTypeError({"Type '", sourceNode->Check(this), "' is not assignable to type '", targetType, "'."},
                           locInfo);
        }
    } else if (targetType->IsObjectType() && targetType->AsObjectType()->IsTupleType()) {
        const TupleType *targetTuple = targetType->AsObjectType()->AsTupleType();

        if ((targetTuple->MinLength() > sourceNode->Elements().size()) ||
            (sourceNode->Elements().empty() && targetTuple->MinLength() > 0)) {
            ThrowTypeError({"Type '", sourceNode->Check(this), "' is not assignable to type '", targetTuple, "'."},
                           locInfo);
        }
    }
}

Type *Checker::GetUnaryResultType(Type *operandType)
{
    if (MaybeTypeOfKind(operandType, TypeFlag::BIGINT_LIKE)) {
        if (operandType->HasTypeFlag(TypeFlag::UNION_OR_INTERSECTION) &&
            MaybeTypeOfKind(operandType, TypeFlag::NUMBER_LIKE)) {
            return GlobalNumberOrBigintType();
        }

        return GlobalBigintType();
    }

    return GlobalNumberType();
}

Type *Checker::InferVariableDeclarationType(const ir::Identifier *decl)
{
    if (!typeStack_.insert(decl).second) {
        if (decl->TypeAnnotation()) {
            ThrowTypeError({"'", decl->Name(),
                            "' is referenced directly or indirectly in its "
                            "own type annotation."},
                           decl->Start());
        }

        ThrowTypeError({"'", decl->Name(),
                        "' is referenced directly or indirectly in its "
                        "own initializer."},
                       decl->Start());
    }

    Type *inferedType = nullptr;
    if (decl->TypeAnnotation()) {
        inferedType = decl->TypeAnnotation()->Check(this);
    } else if (decl->Parent()->AsVariableDeclarator()->Init()) {
        inferedType = decl->Parent()->AsVariableDeclarator()->Init()->Check(this);
    }

    TypeStack().erase(decl);
    return inferedType;
}

}  // namespace panda::es2panda::checker
