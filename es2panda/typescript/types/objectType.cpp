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

#include "objectType.h"

#include <algorithm>
#include <binder/variable.h>
#include <typescript/types/indexInfo.h>
#include <typescript/types/interfaceType.h>
#include <typescript/types/signature.h>

namespace panda::es2panda::checker {

ObjectType::ObjectType(ObjectTypeKind kind)
    : Type(TypeFlag::OBJECT), kind_(kind), desc_(nullptr), objFlag_(ObjectFlags::CHECK_EXCESS_PROPS)
{
}

ObjectType::ObjectType(ObjectTypeKind kind, ObjectDescriptor *desc)
    : Type(TypeFlag::OBJECT), kind_(kind), desc_(desc), objFlag_(ObjectFlags::CHECK_EXCESS_PROPS)
{
}

ObjectType::ObjectTypeKind ObjectType::Kind() const
{
    return kind_;
}

std::vector<Signature *> &ObjectType::CallSignatures()
{
    return desc_->callSignatures;
}

const std::vector<Signature *> &ObjectType::CallSignatures() const
{
    return desc_->callSignatures;
}

const std::vector<Signature *> &ObjectType::ConstructSignatures() const
{
    return desc_->constructSignatures;
}

const IndexInfo *ObjectType::StringIndexInfo() const
{
    return desc_->stringIndexInfo;
}

const IndexInfo *ObjectType::NumberIndexInfo() const
{
    return desc_->numberIndexInfo;
}

IndexInfo *ObjectType::StringIndexInfo()
{
    return desc_->stringIndexInfo;
}

IndexInfo *ObjectType::NumberIndexInfo()
{
    return desc_->numberIndexInfo;
}

const std::vector<binder::LocalVariable *> &ObjectType::Properties() const
{
    return desc_->properties;
}

ObjectDescriptor *ObjectType::Desc()
{
    return desc_;
}

const ObjectDescriptor *ObjectType::Desc() const
{
    return desc_;
}

void ObjectType::AddProperty(binder::LocalVariable *prop)
{
    desc_->properties.push_back(prop);
}

binder::LocalVariable *ObjectType::GetProperty(const util::StringView &name) const
{
    for (auto *it : desc_->properties) {
        if (name == it->Name()) {
            return it;
        }
    }

    return nullptr;
}

void ObjectType::AddSignature(Signature *signature, bool isCall)
{
    if (isCall) {
        desc_->callSignatures.push_back(signature);
    } else {
        desc_->constructSignatures.push_back(signature);
    }
}

void ObjectType::AddObjectFlag(ObjectFlags flag)
{
    objFlag_ |= flag;
}

void ObjectType::RemoveObjectFlag(ObjectFlags flag)
{
    objFlag_ &= ~flag;
}

bool ObjectType::HasObjectFlag(ObjectFlags flag) const
{
    return (objFlag_ & flag) != 0;
}

bool ObjectType::EachSignatureRelatedToSomeSignature(TypeRelation *relation,
                                                     const std::vector<Signature *> &sourceSignatures,
                                                     const std::vector<Signature *> &targetSignatures)
{
    std::vector<Signature *> targetCopy = targetSignatures;

    return std::all_of(sourceSignatures.begin(), sourceSignatures.end(),
                       [relation, &targetCopy](const Signature *source) {
                           return SignatureRelatedToSomeSignature(relation, source, &targetCopy);
                       });
}

bool ObjectType::SignatureRelatedToSomeSignature(TypeRelation *relation, const Signature *sourceSignature,
                                                 std::vector<Signature *> *targetSignatures)
{
    for (auto it = targetSignatures->begin(); it != targetSignatures->end();) {
        if (relation->IsIdenticalTo(sourceSignature, *it)) {
            targetSignatures->erase(it);
            return true;
        }

        it++;
    }

    return false;
}

void ObjectType::Identical(TypeRelation *relation, const Type *other) const
{
    if (!other->IsObjectType() || kind_ != other->AsObjectType()->Kind()) {
        return;
    }

    const ObjectType *otherObj = other->AsObjectType();

    if (desc_->properties.size() != otherObj->Properties().size() ||
        CallSignatures().size() != otherObj->CallSignatures().size() ||
        ConstructSignatures().size() != otherObj->ConstructSignatures().size() ||
        (desc_->numberIndexInfo && !otherObj->NumberIndexInfo()) ||
        (!desc_->numberIndexInfo && otherObj->NumberIndexInfo()) ||
        (desc_->stringIndexInfo && !otherObj->StringIndexInfo()) ||
        (!desc_->stringIndexInfo && otherObj->StringIndexInfo())) {
        relation->Result(false);
        return;
    }

    for (auto *it : desc_->properties) {
        binder::LocalVariable *found = otherObj->Desc()->FindProperty(it->Name());
        if (!found) {
            relation->Result(false);
            return;
        }

        relation->IsIdenticalTo(it->TsType(), found->TsType());

        if (!relation->IsTrue()) {
            return;
        }

        if (it->Flags() != found->Flags()) {
            relation->Result(false);
            return;
        }
    }

    if (!EachSignatureRelatedToSomeSignature(relation, CallSignatures(), otherObj->CallSignatures()) ||
        !EachSignatureRelatedToSomeSignature(relation, otherObj->CallSignatures(), CallSignatures())) {
        return;
    }

    if (!EachSignatureRelatedToSomeSignature(relation, ConstructSignatures(), otherObj->ConstructSignatures()) ||
        !EachSignatureRelatedToSomeSignature(relation, otherObj->ConstructSignatures(), ConstructSignatures())) {
        return;
    }

    if (desc_->numberIndexInfo) {
        relation->IsIdenticalTo(desc_->numberIndexInfo, otherObj->NumberIndexInfo());
        if (!relation->IsTrue()) {
            return;
        }
    }

    if (desc_->stringIndexInfo) {
        relation->IsIdenticalTo(desc_->stringIndexInfo, otherObj->StringIndexInfo());
        if (!relation->IsTrue()) {
            return;
        }
    }
}

void ObjectType::AssignProperties(TypeRelation *relation, const ObjectType *source,
                                  bool performExcessPropertyCheck) const
{
    std::vector<binder::LocalVariable *> targetProperties;
    const IndexInfo *numberInfo = nullptr;
    const IndexInfo *stringInfo = nullptr;

    if (this->IsInterfaceType()) {
        this->AsInterfaceType()->CollectProperties(&targetProperties);
        numberInfo = this->AsInterfaceType()->FindIndexInfo(true);
        stringInfo = this->AsInterfaceType()->FindIndexInfo(false);
    } else {
        targetProperties = desc_->properties;
        numberInfo = desc_->numberIndexInfo;
        stringInfo = desc_->stringIndexInfo;
    }

    for (auto *it : targetProperties) {
        binder::LocalVariable *found = source->GetProperty(it->Name());

        if (found) {
            if (found->TsType()->HasTypeFlag(TypeFlag::RELATION_CHECKED)) {
                found->TsType()->RemoveTypeFlag(TypeFlag::RELATION_CHECKED);
                continue;
            }

            if (!relation->IsAssignableTo(found->TsType(), it->TsType())) {
                return;
            }

            if (performExcessPropertyCheck && found->HasFlag(binder::VariableFlags::OPTIONAL) &&
                !it->HasFlag(binder::VariableFlags::OPTIONAL)) {
                relation->Result(false);
                return;
            }

            continue;
        }

        if (numberInfo && it->HasFlag(binder::VariableFlags::COMPUTED_INDEX) &&
            !relation->IsAssignableTo(numberInfo->InfoType(), it->TsType())) {
            return;
        }

        if (stringInfo && !relation->IsAssignableTo(stringInfo->InfoType(), it->TsType())) {
            return;
        }

        if (!performExcessPropertyCheck) {
            continue;
        }

        if (!it->HasFlag(binder::VariableFlags::OPTIONAL)) {
            relation->Result(false);
            return;
        }
    }
}

void ObjectType::AssignSignatures(TypeRelation *relation, const ObjectType *source, bool assignCallSignatures) const
{
    std::vector<Signature *> targetSignatures;
    std::vector<Signature *> sourceSignatures;

    if (this->IsInterfaceType()) {
        this->AsInterfaceType()->CollectSignatures(&targetSignatures, assignCallSignatures);
    } else {
        targetSignatures = assignCallSignatures ? CallSignatures() : ConstructSignatures();
    }

    if (source->IsInterfaceType()) {
        source->AsInterfaceType()->CollectSignatures(&sourceSignatures, assignCallSignatures);
    } else {
        sourceSignatures = assignCallSignatures ? source->CallSignatures() : source->ConstructSignatures();
    }

    for (auto *targetSignature : targetSignatures) {
        bool foundCompatible = false;
        for (auto *sourceSignature : sourceSignatures) {
            targetSignature->AssignmentTarget(relation, sourceSignature);

            if (relation->IsTrue()) {
                foundCompatible = true;
                break;
            }
        }

        if (!foundCompatible) {
            relation->Result(false);
            return;
        }
    }
}

void ObjectType::AssignIndexInfo([[maybe_unused]] TypeRelation *relation, const ObjectType *source,
                                 bool assignNumberInfo) const
{
    const IndexInfo *targetInfo = nullptr;
    const IndexInfo *sourceInfo = nullptr;

    if (this->IsInterfaceType()) {
        targetInfo = this->AsInterfaceType()->FindIndexInfo(assignNumberInfo);
    } else {
        targetInfo = assignNumberInfo ? NumberIndexInfo() : StringIndexInfo();
    }

    if (source->IsInterfaceType()) {
        sourceInfo = source->AsInterfaceType()->FindIndexInfo(assignNumberInfo);
    } else {
        sourceInfo = assignNumberInfo ? source->NumberIndexInfo() : source->StringIndexInfo();
    }

    if (targetInfo && sourceInfo) {
        targetInfo->AssignmentTarget(relation, sourceInfo);
    }
}

void ObjectType::AssignmentTarget(TypeRelation *relation, const Type *source) const
{
    if (!source->IsObjectType()) {
        relation->Result(false);
        return;
    }

    relation->Result(true);

    const ObjectType *sourceObj = source->AsObjectType();

    AssignProperties(relation, sourceObj, HasObjectFlag(ObjectFlags::CHECK_EXCESS_PROPS));

    if (relation->IsTrue()) {
        AssignSignatures(relation, sourceObj);

        if (relation->IsTrue()) {
            AssignSignatures(relation, sourceObj, false);

            if (relation->IsTrue()) {
                AssignIndexInfo(relation, sourceObj);

                if (relation->IsTrue()) {
                    AssignIndexInfo(relation, sourceObj, false);
                }
            }
        }
    }
}

}  // namespace panda::es2panda::checker
