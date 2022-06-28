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

#include <typescript/checker.h>
#include <typescript/types/indexInfo.h>

namespace panda::es2panda::checker {

Type *Checker::CreateNumberLiteralType(double value)
{
    auto search = numberLiteralMap_.find(value);
    if (search != numberLiteralMap_.end()) {
        return search->second;
    }

    auto *newNumLiteralType = allocator_->New<NumberLiteralType>(value);
    numberLiteralMap_.insert({value, newNumLiteralType});
    return newNumLiteralType;
}

Type *Checker::CreateBigintLiteralType(const util::StringView &str, bool negative)
{
    auto search = bigintLiteralMap_.find(str);
    if (search != bigintLiteralMap_.end()) {
        return search->second;
    }

    auto *newBigiLiteralType = allocator_->New<BigintLiteralType>(str, negative);
    bigintLiteralMap_.insert({str, newBigiLiteralType});
    return newBigiLiteralType;
}

Type *Checker::CreateStringLiteralType(const util::StringView &str)
{
    auto search = stringLiteralMap_.find(str);
    if (search != stringLiteralMap_.end()) {
        return search->second;
    }

    auto *newStrLiteralType = allocator_->New<StringLiteralType>(str);
    stringLiteralMap_.insert({str, newStrLiteralType});
    return newStrLiteralType;
}

Type *Checker::CreateUnionType(std::initializer_list<Type *> constituentTypes)
{
    std::vector<Type *> newConstituentTypes;
    for (auto *it : constituentTypes) {
        newConstituentTypes.push_back(it);
    }

    return CreateUnionType(std::move(newConstituentTypes));
}

Type *Checker::CreateUnionType(std::vector<Type *> &&constituentTypes)
{
    UnionType::RemoveDuplicatedTypes(relation_, constituentTypes);

    if (constituentTypes.size() == 1) {
        return constituentTypes[0];
    }

    auto *newUnionType = allocator_->New<UnionType>(std::move(constituentTypes));

    return UnionType::HandleUnionType(newUnionType, globalTypes_);
}

Type *Checker::CreateFunctionTypeWithSignature(Signature *callSignature)
{
    auto *funcObjType = allocator_->New<FunctionType>(allocator_->New<ObjectDescriptor>());
    funcObjType->AddSignature(callSignature);
    return funcObjType;
}

Type *Checker::CreateConstructorTypeWithSignature(Signature *constructSignature)
{
    auto *constructObjType = allocator_->New<ConstructorType>(allocator_->New<ObjectDescriptor>());
    constructObjType->AddSignature(constructSignature, false);
    return constructObjType;
}

Type *Checker::CreateTupleType(ObjectDescriptor *desc, TupleElementFlagPool &&elementFlags, ElementFlags combinedFlags,
                               uint32_t minLength, uint32_t fixedLength, bool readonly)
{
    desc->stringIndexInfo = allocator_->New<IndexInfo>(GlobalAnyType(), "x");

    auto *tupleType =
        allocator_->New<TupleType>(desc, std::move(elementFlags), combinedFlags, minLength, fixedLength, readonly);

    return tupleType;
}

Type *Checker::CreateTupleType(ObjectDescriptor *desc, TupleElementFlagPool &&elementFlags, ElementFlags combinedFlags,
                               uint32_t minLength, uint32_t fixedLength, bool readonly,
                               NamedTupleMemberPool &&namedMembers)
{
    desc->stringIndexInfo = allocator_->New<IndexInfo>(GlobalAnyType(), "x");
    ObjectType *tupleType = nullptr;

    if (!namedMembers.empty()) {
        tupleType = allocator_->New<TupleType>(desc, std::move(elementFlags), combinedFlags, minLength, fixedLength,
                                               readonly, std::move(namedMembers));
    } else {
        tupleType =
            allocator_->New<TupleType>(desc, std::move(elementFlags), combinedFlags, minLength, fixedLength, readonly);
    }

    return tupleType;
}
}  // namespace panda::es2panda::checker
