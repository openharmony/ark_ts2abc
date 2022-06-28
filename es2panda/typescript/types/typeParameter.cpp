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

#include "typeParameter.h"

namespace panda::es2panda::checker {

TypeParameter::TypeParameter(Type *constraint, Type *defaultType)
    : Type(TypeFlag::TYPE_PARAMETER), constraint_(constraint), default_(defaultType)
{
}

const Type *TypeParameter::ConstraintType() const
{
    return constraint_;
}

Type *TypeParameter::DefaultType()
{
    return default_;
}

Type **TypeParameter::DefaultTypeRef()
{
    return &default_;
}

void TypeParameter::SetDefaultType(Type *type)
{
    default_ = type;
}

void TypeParameter::ToString([[maybe_unused]] std::stringstream &ss) const
{
    UNREACHABLE();
}

void TypeParameter::Identical([[maybe_unused]] TypeRelation *relation, [[maybe_unused]] const Type *other) const
{
    UNREACHABLE();
}

void TypeParameter::AssignmentTarget([[maybe_unused]] TypeRelation *relation, [[maybe_unused]] const Type *source) const
{
    UNREACHABLE();
}

TypeFacts TypeParameter::GetTypeFacts() const
{
    UNREACHABLE();
    return TypeFacts::NONE;
}

Type *TypeParameter::Instantiate([[maybe_unused]] ArenaAllocator *allocator, [[maybe_unused]] TypeRelation *relation,
                                 [[maybe_unused]] GlobalTypesHolder *globalTypes)
{
    UNREACHABLE();
    return nullptr;
}

}  // namespace panda::es2panda::checker
