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

#include "interfaceType.h"

#include <binder/variable.h>
#include <typescript/types/typeParameter.h>

#include <algorithm>
#include <utility>

namespace panda::es2panda::checker {

InterfaceType::InterfaceType(util::StringView name, ObjectDescriptor *desc)
    : ObjectType(ObjectType::ObjectTypeKind::INTERFACE, desc), name_(name)
{
}

void InterfaceType::AddBase(ObjectType *base)
{
    bases_.push_back(base);
}

const std::vector<ObjectType *> &InterfaceType::Bases() const
{
    return bases_;
}

const util::StringView &InterfaceType::Name() const
{
    return name_;
}

void InterfaceType::SetMergedTypeParams(std::pair<std::vector<binder::Variable *>, size_t> &&mergedTypeParams)
{
    mergedTypeParams_ = std::move(mergedTypeParams);
}

const std::pair<std::vector<binder::Variable *>, size_t> &InterfaceType::GetMergedTypeParams() const
{
    return mergedTypeParams_;
}

void InterfaceType::SetTypeParamTypes(std::vector<Type *> &&typeParamTypes)
{
    typeParamTypes_ = std::move(typeParamTypes);
}

const std::vector<Type *> &InterfaceType::GetTypeParamTypes() const
{
    return typeParamTypes_;
}

binder::LocalVariable *InterfaceType::GetProperty(const util::StringView &name) const
{
    binder::LocalVariable *resultProp = ObjectType::GetProperty(name);

    if (resultProp) {
        return resultProp;
    }

    for (auto *base : bases_) {
        resultProp = base->GetProperty(name);
        if (resultProp) {
            return resultProp;
        }
    }

    return nullptr;
}

void InterfaceType::ToString(std::stringstream &ss) const
{
    ss << name_;

    if (!typeParamTypes_.empty()) {
        ss << "<";

        for (auto it = typeParamTypes_.begin(); it != typeParamTypes_.end(); it++) {
            (*it)->ToString(ss);

            if (std::next(it) != typeParamTypes_.end()) {
                ss << ", ";
            }
        }

        ss << ">";
    }
}

void InterfaceType::Identical(TypeRelation *relation, const Type *other) const
{
    if (!other->IsObjectType() || !other->AsObjectType()->IsInterfaceType()) {
        return;
    }

    const InterfaceType *otherInterface = other->AsObjectType()->AsInterfaceType();

    std::vector<binder::LocalVariable *> targetProperties;
    CollectProperties(&targetProperties);

    std::vector<binder::LocalVariable *> sourceProperties;
    otherInterface->CollectProperties(&sourceProperties);

    if (targetProperties.size() != sourceProperties.size()) {
        relation->Result(false);
        return;
    }

    for (const auto *targetProp : targetProperties) {
        bool foundProp = std::any_of(sourceProperties.begin(), sourceProperties.end(),
                                     [targetProp, relation](const binder::LocalVariable *sourceProp) {
                                         if (targetProp->Name() == sourceProp->Name()) {
                                             return relation->IsIdenticalTo(targetProp->TsType(), sourceProp->TsType());
                                         }

                                         return false;
                                     });
        if (!foundProp) {
            relation->Result(false);
            return;
        }
    }

    std::vector<Signature *> targetCallSignatures;
    CollectSignatures(&targetCallSignatures, true);

    std::vector<Signature *> sourceCallSignatures;
    otherInterface->CollectSignatures(&sourceCallSignatures, true);

    if (targetCallSignatures.size() != sourceCallSignatures.size()) {
        relation->Result(false);
        return;
    }

    if (!EachSignatureRelatedToSomeSignature(relation, targetCallSignatures, sourceCallSignatures) ||
        !EachSignatureRelatedToSomeSignature(relation, sourceCallSignatures, targetCallSignatures)) {
        return;
    }

    std::vector<Signature *> targetConstructSignatures;
    CollectSignatures(&targetConstructSignatures, false);

    std::vector<Signature *> sourceConstructSignatures;
    otherInterface->CollectSignatures(&sourceConstructSignatures, false);

    if (targetConstructSignatures.size() != sourceConstructSignatures.size()) {
        relation->Result(false);
        return;
    }

    if (!EachSignatureRelatedToSomeSignature(relation, targetConstructSignatures, sourceConstructSignatures) ||
        !EachSignatureRelatedToSomeSignature(relation, sourceConstructSignatures, targetConstructSignatures)) {
        return;
    }

    const IndexInfo *targetNumberInfo = FindIndexInfo(true);
    const IndexInfo *sourceNumberInfo = otherInterface->FindIndexInfo(true);

    if ((targetNumberInfo && !sourceNumberInfo) || (!targetNumberInfo && sourceNumberInfo)) {
        relation->Result(false);
        return;
    }

    relation->IsIdenticalTo(targetNumberInfo, sourceNumberInfo);

    if (relation->IsTrue()) {
        const IndexInfo *targetStringInfo = FindIndexInfo(false);
        const IndexInfo *sourceStringInfo = otherInterface->FindIndexInfo(false);

        if ((targetStringInfo && !sourceStringInfo) || (!targetStringInfo && sourceStringInfo)) {
            relation->Result(false);
            return;
        }

        relation->IsIdenticalTo(targetStringInfo, sourceStringInfo);
    }
}

Type *InterfaceType::Instantiate(ArenaAllocator *allocator, TypeRelation *relation, GlobalTypesHolder *globalTypes)
{
    ObjectDescriptor *copiedDesc = allocator->New<ObjectDescriptor>();

    desc_->Copy(allocator, copiedDesc, relation, globalTypes);

    Type *newInterfaceType = allocator->New<InterfaceType>(name_, copiedDesc);

    for (auto *it : bases_) {
        newInterfaceType->AsObjectType()->AsInterfaceType()->AddBase(
            it->Instantiate(allocator, relation, globalTypes)->AsObjectType());
    }

    return newInterfaceType;
}

void InterfaceType::CollectSignatures(std::vector<Signature *> *collectedSignatures, bool collectCallSignatures) const
{
    if (collectCallSignatures) {
        for (auto *it : CallSignatures()) {
            collectedSignatures->push_back(it);
        }
    } else {
        for (auto *it : ConstructSignatures()) {
            collectedSignatures->push_back(it);
        }
    }

    for (auto *it : bases_) {
        it->AsInterfaceType()->CollectSignatures(collectedSignatures, collectCallSignatures);
    }
}

void InterfaceType::CollectProperties(std::vector<binder::LocalVariable *> *collectedPropeties) const
{
    for (auto *currentProp : Properties()) {
        bool propAlreadyCollected = false;
        for (auto *collectedProp : *collectedPropeties) {
            if (currentProp->Name() == collectedProp->Name()) {
                propAlreadyCollected = true;
                break;
            }
        }

        if (propAlreadyCollected) {
            continue;
        }

        collectedPropeties->push_back(currentProp);
    }

    for (auto *it : bases_) {
        it->AsInterfaceType()->CollectProperties(collectedPropeties);
    }
}

const IndexInfo *InterfaceType::FindIndexInfo(bool findNumberInfo) const
{
    const IndexInfo *foundInfo = nullptr;

    if (findNumberInfo && NumberIndexInfo()) {
        foundInfo = NumberIndexInfo();
    } else if (!findNumberInfo && StringIndexInfo()) {
        foundInfo = StringIndexInfo();
    }

    for (auto it = bases_.begin(); it != bases_.end() && !foundInfo; it++) {
        foundInfo = (*it)->AsInterfaceType()->FindIndexInfo(findNumberInfo);
    }

    return foundInfo;
}

IndexInfo *InterfaceType::FindIndexInfo(bool findNumberInfo)
{
    IndexInfo *foundInfo = nullptr;

    if (findNumberInfo && NumberIndexInfo()) {
        foundInfo = NumberIndexInfo();
    } else if (!findNumberInfo && StringIndexInfo()) {
        foundInfo = StringIndexInfo();
    }

    for (auto it = bases_.begin(); it != bases_.end() && !foundInfo; it++) {
        foundInfo = (*it)->AsInterfaceType()->FindIndexInfo(findNumberInfo);
    }

    return foundInfo;
}

TypeFacts InterfaceType::GetTypeFacts() const
{
    if (desc_->properties.empty() && desc_->callSignatures.empty() && desc_->constructSignatures.empty() &&
        !desc_->stringIndexInfo && !desc_->numberIndexInfo) {
        if (bases_.empty()) {
            return TypeFacts::EMPTY_OBJECT_FACTS;
        }

        bool isEmpty = true;
        for (auto it = bases_.begin(); isEmpty && it != bases_.end(); it++) {
            if (!(*it)->Properties().empty() || !(*it)->CallSignatures().empty() ||
                !(*it)->ConstructSignatures().empty() || (*it)->StringIndexInfo() || (*it)->NumberIndexInfo()) {
                isEmpty = false;
            }
        }

        if (isEmpty) {
            return TypeFacts::EMPTY_OBJECT_FACTS;
        }
    }

    return TypeFacts::OBJECT_FACTS;
}

}  // namespace panda::es2panda::checker
