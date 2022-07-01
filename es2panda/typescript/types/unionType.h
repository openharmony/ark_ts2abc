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

#ifndef ES2PANDA_COMPILER_TYPESCRIPT_TYPES_UNION_TYPE_H
#define ES2PANDA_COMPILER_TYPESCRIPT_TYPES_UNION_TYPE_H

#include "type.h"

namespace panda::es2panda::checker {

class GlobalTypesHolder;

class UnionType : public Type {
public:
    explicit UnionType(std::vector<Type *> &&constituentTypes);
    UnionType(std::initializer_list<Type *> types);

    const std::vector<Type *> &ConstituentTypes() const;
    std::vector<Type *> &ConstituentTypes();
    void AddConstituentType(Type *type, TypeRelation *relation);
    void AddConstituentFlag(TypeFlag flag);
    void RemoveConstituentFlag(TypeFlag flag);
    bool HasConstituentFlag(TypeFlag flag) const;

    void ToString(std::stringstream &ss) const override;
    void Identical(TypeRelation *relation, const Type *other) const override;
    void AssignmentTarget(TypeRelation *relation, const Type *source) const override;
    bool AssignmentSource(TypeRelation *relation, const Type *target) const override;
    TypeFacts GetTypeFacts() const override;
    Type *Instantiate(ArenaAllocator *allocator, TypeRelation *relation, GlobalTypesHolder *globalTypes) override;

    static void RemoveDuplicatedTypes(TypeRelation *relation, std::vector<Type *> &constituentTypes);
    static Type *HandleUnionType(UnionType *unionType, GlobalTypesHolder *globalTypesHolder);
    static void RemoveRedundantLiteralTypesFromUnion(UnionType *type);

private:
    static bool EachTypeRelatedToSomeType(TypeRelation *relation, const UnionType *source, const UnionType *target);
    static bool TypeRelatedToSomeType(TypeRelation *relation, const Type *source, const UnionType *target);

    std::vector<Type *> constituentTypes_;
    TypeFlag constituentFlags_ {TypeFlag::NONE};
};

}  // namespace panda::es2panda::checker

#endif /* TYPESCRIPT_TYPES_UNION_TYPE_H */
