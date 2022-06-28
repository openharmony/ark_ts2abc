/**
 * Copyright (c) 2021-2022 Huawei Device Co., Ltd.
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

#include "type.h"

#include <typescript/types/typeFlag.h>
#include <typescript/types/typeFacts.h>
#include <typescript/types/typeRelation.h>

namespace panda::es2panda::checker {

Type::Type(TypeFlag flag) : typeFlags_(flag), variable_(nullptr)
{
    static uint64_t typeId = 0;
    id_ = ++typeId;
}

TypeFlag Type::TypeFlags() const
{
    return typeFlags_;
}

bool Type::HasTypeFlag(TypeFlag typeFlag) const
{
    return (typeFlags_ & typeFlag) != 0;
}

void Type::AddTypeFlag(TypeFlag typeFlag)
{
    typeFlags_ |= typeFlag;
}

void Type::RemoveTypeFlag(TypeFlag typeFlag)
{
    typeFlags_ &= ~typeFlag;
}

uint64_t Type::Id() const
{
    return id_;
}

void Type::ToStringAsSrc(std::stringstream &ss) const
{
    ToString(ss);
}

void Type::SetVariable(binder::Variable *variable)
{
    variable_ = variable;
}

binder::Variable *Type::Variable()
{
    return variable_;
}

const binder::Variable *Type::Variable() const
{
    return variable_;
}

void Type::Identical(TypeRelation *relation, const Type *other) const
{
    relation->Result(typeFlags_ == other->TypeFlags());
}

bool Type::AssignmentSource([[maybe_unused]] TypeRelation *relation, [[maybe_unused]] const Type *target) const
{
    return false;
}

void Type::Compare([[maybe_unused]] TypeRelation *relation, [[maybe_unused]] const Type *other) const {}

Type *Type::Instantiate([[maybe_unused]] ArenaAllocator *allocator, [[maybe_unused]] TypeRelation *relation,
                        [[maybe_unused]] GlobalTypesHolder *globalTypes)
{
    return nullptr;
}

}  // namespace panda::es2panda::checker
