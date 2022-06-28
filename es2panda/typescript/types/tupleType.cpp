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

#include "tupleType.h"

#include <binder/variable.h>

namespace panda::es2panda::checker {

TupleTypeIterator::TupleTypeIterator(TupleType *tuple) : tupleType_(tuple), iter_(0) {}

Type *TupleTypeIterator::Next()
{
    if (iter_ >= tupleType_->Properties().size()) {
        return nullptr;
    }

    Type *returnType = tupleType_->Properties()[iter_]->TsType();

    iter_++;

    return returnType;
}

Type *TupleTypeIterator::Current()
{
    if (iter_ >= tupleType_->Properties().size()) {
        return nullptr;
    }

    return tupleType_->Properties()[iter_]->TsType();
}

uint32_t TupleTypeIterator::Iter() const
{
    return iter_;
}

TupleType::TupleType(ObjectDescriptor *desc, TupleElementFlagPool &&elementFlags, ElementFlags combinedFlags,
                     uint32_t minLength, uint32_t fixedLength, bool readonly)
    : ObjectType(ObjectType::ObjectTypeKind::TUPLE, desc),
      elementFlags_(std::move(elementFlags)),
      combinedFlags_(combinedFlags),
      minLength_(minLength),
      fixedLength_(fixedLength),
      readonly_(readonly)
{
    if (readonly_) {
        for (auto *it : Properties()) {
            it->AddFlag(binder::VariableFlags::READONLY);
        }
    }

    iterator_ = new TupleTypeIterator(this);
}

TupleType::TupleType(ObjectDescriptor *desc, TupleElementFlagPool &&elementFlags, ElementFlags combinedFlags,
                     uint32_t minLength, uint32_t fixedLength, bool readonly, NamedTupleMemberPool &&namedMembers)
    : ObjectType(ObjectType::ObjectTypeKind::TUPLE, desc),
      elementFlags_(std::move(elementFlags)),
      combinedFlags_(combinedFlags),
      minLength_(minLength),
      fixedLength_(fixedLength),
      namedMembers_(std::move(namedMembers)),
      readonly_(readonly)
{
    if (readonly_) {
        for (auto *it : Properties()) {
            it->AddFlag(binder::VariableFlags::READONLY);
        }
    }

    iterator_ = new TupleTypeIterator(this);
}

TupleType::TupleType() : ObjectType(ObjectType::ObjectTypeKind::TUPLE) {}

TupleType::~TupleType()
{
    delete iterator_;
}

ElementFlags TupleType::CombinedFlags() const
{
    return combinedFlags_;
}

uint32_t TupleType::MinLength() const
{
    return minLength_;
}

uint32_t TupleType::FixedLength() const
{
    return fixedLength_;
}

ElementFlags TupleType::GetElementFlag(const util::StringView &index) const
{
    auto res = elementFlags_.find(index);
    if (res != elementFlags_.end()) {
        return res->second;
    }
    return ElementFlags::NO_OPTS;
}

bool TupleType::HasCombinedFlag(ElementFlags combinedFlag) const
{
    return (combinedFlags_ & combinedFlag) != 0;
}

bool TupleType::IsReadOnly() const
{
    return readonly_;
}

TupleTypeIterator *TupleType::Iterator()
{
    return iterator_;
}

const TupleTypeIterator *TupleType::Iterator() const
{
    return iterator_;
}

const NamedTupleMemberPool &TupleType::NamedMembers() const
{
    return namedMembers_;
}

const util::StringView &TupleType::FindNamedMemberName(binder::LocalVariable *member) const
{
    auto res = namedMembers_.find(member);
    return res->second;
}

void TupleType::ToString(std::stringstream &ss) const
{
    if (readonly_) {
        ss << "readonly ";
    }
    ss << "[";

    if (namedMembers_.empty()) {
        for (auto it = desc_->properties.begin(); it != desc_->properties.end(); it++) {
            (*it)->TsType()->ToString(ss);
            if ((*it)->HasFlag(binder::VariableFlags::OPTIONAL)) {
                ss << "?";
            }

            if (std::next(it) != desc_->properties.end()) {
                ss << ", ";
            }
        }
    } else {
        for (auto it = desc_->properties.begin(); it != desc_->properties.end(); it++) {
            const util::StringView &memberName = FindNamedMemberName(*it);
            ss << memberName;

            if ((*it)->HasFlag(binder::VariableFlags::OPTIONAL)) {
                ss << "?";
            }

            ss << ": ";
            (*it)->TsType()->ToString(ss);
            if (std::next(it) != desc_->properties.end()) {
                ss << ", ";
            }
        }
    }

    ss << "]";
}

void TupleType::Identical(TypeRelation *relation, const Type *other) const
{
    if (other->IsObjectType() && other->AsObjectType()->IsTupleType()) {
        const TupleType *otherTuple = other->AsObjectType()->AsTupleType();
        if (kind_ == otherTuple->Kind() && desc_->properties.size() == otherTuple->Properties().size()) {
            const auto &otherProperties = otherTuple->Properties();
            for (size_t i = 0; i < desc_->properties.size(); i++) {
                binder::LocalVariable *targetProp = desc_->properties[i];
                binder::LocalVariable *sourceProp = otherProperties[i];

                if (targetProp->Flags() != sourceProp->Flags()) {
                    relation->Result(false);
                    return;
                }

                relation->IsIdenticalTo(targetProp->TsType(), sourceProp->TsType());

                if (!relation->IsTrue()) {
                    return;
                }
            }
            relation->Result(true);
        }
    }
}

void TupleType::AssignmentTarget(TypeRelation *relation, const Type *source) const
{
    if (!source->IsObjectType() || !source->AsObjectType()->IsTupleType()) {
        relation->Result(false);
        return;
    }

    const TupleType *sourceTuple = source->AsObjectType()->AsTupleType();
    if (FixedLength() < sourceTuple->MinLength()) {
        relation->Result(false);
        return;
    }

    relation->Result(true);

    const auto &sourceProperties = sourceTuple->Properties();
    for (size_t i = 0; i < desc_->properties.size(); i++) {
        auto *targetProp = desc_->properties[i];

        if (i < sourceProperties.size()) {
            if (!targetProp->HasFlag(binder::VariableFlags::OPTIONAL) &&
                sourceProperties[i]->HasFlag(binder::VariableFlags::OPTIONAL)) {
                relation->Result(false);
                return;
            }

            Type *targetPropType = targetProp->TsType();
            Type *sourcePropType = sourceProperties[i]->TsType();
            if (!relation->IsAssignableTo(sourcePropType, targetPropType)) {
                return;
            }

            continue;
        }

        if (!targetProp->HasFlag(binder::VariableFlags::OPTIONAL)) {
            relation->Result(false);
            return;
        }
    }

    if (relation->IsTrue()) {
        AssignIndexInfo(relation, sourceTuple);
    }
}

TypeFacts TupleType::GetTypeFacts() const
{
    if (desc_->properties.empty()) {
        return TypeFacts::EMPTY_OBJECT_FACTS;
    }

    return TypeFacts::OBJECT_FACTS;
}

Type *TupleType::Instantiate(ArenaAllocator *allocator, TypeRelation *relation, GlobalTypesHolder *globalTypes)
{
    ObjectDescriptor *copiedDesc = allocator->New<ObjectDescriptor>();

    desc_->Copy(allocator, copiedDesc, relation, globalTypes);

    NamedTupleMemberPool copiedNamedMemberPool = namedMembers_;
    TupleElementFlagPool copiedElementFlagPool = elementFlags_;

    return allocator->New<TupleType>(copiedDesc, std::move(copiedElementFlagPool), combinedFlags_, minLength_,
                                     fixedLength_, readonly_, std::move(copiedNamedMemberPool));
}

}  // namespace panda::es2panda::checker
