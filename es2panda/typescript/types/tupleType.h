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

#ifndef ES2PANDA_COMPILER_TYPESCRIPT_TYPES_TUPLE_TYPE_H
#define ES2PANDA_COMPILER_TYPESCRIPT_TYPES_TUPLE_TYPE_H

#include <macros.h>

#include <typescript/types/elementFlags.h>
#include <typescript/types/objectType.h>

namespace panda::es2panda::checker {

class TupleTypeIterator {
public:
    explicit TupleTypeIterator(TupleType *tuple);
    ~TupleTypeIterator() = default;
    NO_COPY_SEMANTIC(TupleTypeIterator);
    NO_MOVE_SEMANTIC(TupleTypeIterator);

    Type *Next();
    Type *Current();
    uint32_t Iter() const;

private:
    TupleType *tupleType_;
    uint32_t iter_;
};

using NamedTupleMemberPool = std::unordered_map<binder::LocalVariable *, util::StringView>;
using TupleElementFlagPool = std::unordered_map<util::StringView, checker::ElementFlags>;

class TupleType : public ObjectType {
public:
    TupleType(ObjectDescriptor *desc, TupleElementFlagPool &&elementFlags, ElementFlags combinedFlags,
              uint32_t minLength, uint32_t fixedLength, bool readonly);
    TupleType(ObjectDescriptor *desc, TupleElementFlagPool &&elementFlags, ElementFlags combinedFlags,
              uint32_t minLength, uint32_t fixedLength, bool readonly, NamedTupleMemberPool &&namedMembers);
    TupleType();
    ~TupleType() override;
    NO_COPY_SEMANTIC(TupleType);
    NO_MOVE_SEMANTIC(TupleType);

    ElementFlags GetElementFlag(const util::StringView &index) const;
    ElementFlags CombinedFlags() const;
    uint32_t MinLength() const;
    uint32_t FixedLength() const;
    bool HasElementFlag(ElementFlags elementFlag) const;
    bool HasCombinedFlag(ElementFlags combinedFlag) const;
    bool IsReadOnly() const;
    TupleTypeIterator *Iterator();
    const TupleTypeIterator *Iterator() const;
    const NamedTupleMemberPool &NamedMembers() const;
    const util::StringView &FindNamedMemberName(binder::LocalVariable *member) const;

    void ToString(std::stringstream &ss) const override;
    void Identical(TypeRelation *relation, const Type *other) const override;
    void AssignmentTarget(TypeRelation *relation, const Type *source) const override;
    TypeFacts GetTypeFacts() const override;
    Type *Instantiate(ArenaAllocator *allocator, TypeRelation *relation, GlobalTypesHolder *globalTypes) override;

private:
    TupleElementFlagPool elementFlags_ {};
    ElementFlags combinedFlags_ {};
    uint32_t minLength_ {};
    uint32_t fixedLength_ {};
    NamedTupleMemberPool namedMembers_ {};
    bool readonly_ {};
    TupleTypeIterator *iterator_ {nullptr};
};

}  // namespace panda::es2panda::checker

#endif /* TYPESCRIPT_TYPES_TUPLE_TYPE_H */
