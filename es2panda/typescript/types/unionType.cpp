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

#include "unionType.h"
#include <algorithm>

#include <typescript/types/globalTypesHolder.h>

namespace panda::es2panda::checker {

UnionType::UnionType(std::vector<Type *> &&constituentTypes)
    : Type(TypeFlag::UNION), constituentTypes_(std::move(constituentTypes))
{
    for (auto *it : constituentTypes_) {
        AddConstituentFlag(it->TypeFlags());
    }
}

UnionType::UnionType(std::initializer_list<Type *> types) : Type(TypeFlag::UNION)
{
    for (auto *it : types) {
        constituentTypes_.push_back(it);
        AddConstituentFlag(it->TypeFlags());
    }
}

const std::vector<Type *> &UnionType::ConstituentTypes() const
{
    return constituentTypes_;
}

std::vector<Type *> &UnionType::ConstituentTypes()
{
    return constituentTypes_;
}

void UnionType::AddConstituentType(Type *type, TypeRelation *relation)
{
    if ((HasConstituentFlag(TypeFlag::NUMBER) && type->IsNumberLiteralType()) ||
        (HasConstituentFlag(TypeFlag::STRING) && type->IsStringLiteralType()) ||
        (HasConstituentFlag(TypeFlag::BIGINT) && type->IsBigintLiteralType()) ||
        (HasConstituentFlag(TypeFlag::BOOLEAN) && type->IsBooleanLiteralType())) {
        return;
    }

    for (auto *it : constituentTypes_) {
        if (relation->IsIdenticalTo(it, type)) {
            return;
        }
    }

    AddConstituentFlag(type->TypeFlags());
    constituentTypes_.push_back(type);
}

void UnionType::AddConstituentFlag(TypeFlag flag)
{
    constituentFlags_ |= flag;
}

void UnionType::RemoveConstituentFlag(TypeFlag flag)
{
    constituentFlags_ &= ~flag;
}

bool UnionType::HasConstituentFlag(TypeFlag flag) const
{
    return (constituentFlags_ & flag) != 0;
}

void UnionType::ToString(std::stringstream &ss) const
{
    for (auto it = constituentTypes_.begin(); it != constituentTypes_.end(); it++) {
        (*it)->ToString(ss);
        if (std::next(it) != constituentTypes_.end()) {
            ss << " | ";
        }
    }
}

bool UnionType::EachTypeRelatedToSomeType(TypeRelation *relation, const UnionType *source, const UnionType *target)
{
    return std::all_of(source->constituentTypes_.begin(), source->constituentTypes_.end(),
                       [relation, target](const auto *s) { return TypeRelatedToSomeType(relation, s, target); });
}

bool UnionType::TypeRelatedToSomeType(TypeRelation *relation, const Type *source, const UnionType *target)
{
    return std::any_of(target->constituentTypes_.begin(), target->constituentTypes_.end(),
                       [relation, source](const auto *t) { return relation->IsIdenticalTo(source, t); });
}

void UnionType::Identical(TypeRelation *relation, const Type *other) const
{
    if (other->IsUnionType()) {
        if (EachTypeRelatedToSomeType(relation, this, other->AsUnionType()) &&
            EachTypeRelatedToSomeType(relation, other->AsUnionType(), this)) {
            relation->Result(true);
            return;
        }
    }

    relation->Result(false);
}

bool UnionType::AssignmentSource(TypeRelation *relation, const Type *target) const
{
    for (auto *it : constituentTypes_) {
        if (!relation->IsAssignableTo(it, target)) {
            return false;
        }
    }

    relation->Result(true);
    return true;
}

void UnionType::AssignmentTarget(TypeRelation *relation, const Type *source) const
{
    for (auto *it : constituentTypes_) {
        if (relation->IsAssignableTo(source, it)) {
            return;
        }
    }
}

TypeFacts UnionType::GetTypeFacts() const
{
    TypeFacts facts = TypeFacts::NONE;

    for (auto *it : constituentTypes_) {
        facts |= it->GetTypeFacts();
    }

    return facts;
}

void UnionType::RemoveDuplicatedTypes(TypeRelation *relation, std::vector<Type *> &constituentTypes)
{
    auto compare = constituentTypes.begin();

    while (compare != constituentTypes.end()) {
        auto it = compare + 1;

        while (it != constituentTypes.end()) {
            relation->Result(false);

            (*compare)->Identical(relation, *it);

            if (relation->IsTrue()) {
                it = constituentTypes.erase(it);
            } else {
                it++;
            }
        }

        compare = it;
    }
}

Type *UnionType::HandleUnionType(UnionType *unionType, GlobalTypesHolder *globalTypesHolder)
{
    if (unionType->HasConstituentFlag(TypeFlag::ANY)) {
        return globalTypesHolder->GlobalAnyType();
    }

    if (unionType->HasConstituentFlag(TypeFlag::UNKNOWN)) {
        return globalTypesHolder->GlobalUnknownType();
    }

    RemoveRedundantLiteralTypesFromUnion(unionType);

    if (unionType->ConstituentTypes().size() == 1) {
        return unionType->ConstituentTypes()[0];
    }

    return unionType;
}

void UnionType::RemoveRedundantLiteralTypesFromUnion(UnionType *type)
{
    bool removeNumberLiterals = false;
    bool removeStringLiterals = false;
    bool removeBigintLiterals = false;
    bool removeBooleanLiterals = false;

    if (type->HasConstituentFlag(TypeFlag::NUMBER) && type->HasConstituentFlag(TypeFlag::NUMBER_LITERAL)) {
        removeNumberLiterals = true;
    }

    if (type->HasConstituentFlag(TypeFlag::STRING) && type->HasConstituentFlag(TypeFlag::STRING_LITERAL)) {
        removeStringLiterals = true;
    }

    if (type->HasConstituentFlag(TypeFlag::BIGINT) && type->HasConstituentFlag(TypeFlag::BIGINT_LITERAL)) {
        removeBigintLiterals = true;
    }

    if (type->HasConstituentFlag(TypeFlag::BOOLEAN) && type->HasConstituentFlag(TypeFlag::BOOLEAN_LITERAL)) {
        removeBooleanLiterals = true;
    }

    std::vector<Type *> &constituentTypes = type->ConstituentTypes();
    /* TODO(dbatyai): use std::erase_if */
    auto it = constituentTypes.begin();
    while (it != constituentTypes.end()) {
        if ((removeNumberLiterals && (*it)->IsNumberLiteralType()) ||
            (removeStringLiterals && (*it)->IsStringLiteralType()) ||
            (removeBigintLiterals && (*it)->IsBigintLiteralType()) ||
            (removeBooleanLiterals && (*it)->IsBooleanLiteralType())) {
            type->RemoveConstituentFlag((*it)->TypeFlags());
            it = constituentTypes.erase(it);
            continue;
        }

        it++;
    }
}

Type *UnionType::Instantiate(ArenaAllocator *allocator, TypeRelation *relation, GlobalTypesHolder *globalTypes)
{
    std::vector<Type *> copiedConstituents(constituentTypes_.size());

    for (auto *it : constituentTypes_) {
        copiedConstituents.push_back(it->Instantiate(allocator, relation, globalTypes));
    }

    RemoveDuplicatedTypes(relation, copiedConstituents);

    if (copiedConstituents.size() == 1) {
        return copiedConstituents[0];
    }

    Type *newUnionType = allocator->New<UnionType>(std::move(copiedConstituents));

    return HandleUnionType(newUnionType->AsUnionType(), globalTypes);
}

}  // namespace panda::es2panda::checker
