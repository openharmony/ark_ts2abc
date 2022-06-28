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

#ifndef ES2PANDA_COMPILER_TYPESCRIPT_TYPES_INTERFACE_TYPE_H
#define ES2PANDA_COMPILER_TYPESCRIPT_TYPES_INTERFACE_TYPE_H

#include "objectType.h"

namespace panda::es2panda::checker {

class InterfaceType : public ObjectType {
public:
    InterfaceType(util::StringView name, ObjectDescriptor *desc);

    void AddBase(ObjectType *base);
    const std::vector<ObjectType *> &Bases() const;
    const util::StringView &Name() const;

    void ToString(std::stringstream &ss) const override;
    TypeFacts GetTypeFacts() const override;
    void Identical(TypeRelation *relation, const Type *other) const override;
    Type *Instantiate(ArenaAllocator *allocator, TypeRelation *relation, GlobalTypesHolder *globalTypes) override;
    binder::LocalVariable *GetProperty(const util::StringView &name) const override;
    void SetMergedTypeParams(std::pair<std::vector<binder::Variable *>, size_t> &&mergedTypeParams);
    const std::pair<std::vector<binder::Variable *>, size_t> &GetMergedTypeParams() const;
    void SetTypeParamTypes(std::vector<Type *> &&typeParamTypes);
    const std::vector<Type *> &GetTypeParamTypes() const;

    void CollectSignatures(std::vector<Signature *> *collectedSignatures, bool collectCallSignatures) const;
    void CollectProperties(std::vector<binder::LocalVariable *> *collectedPropeties) const;
    const IndexInfo *FindIndexInfo(bool findNumberInfo) const;
    IndexInfo *FindIndexInfo(bool findNumberInfo);

private:
    util::StringView name_;
    std::vector<ObjectType *> bases_;
    std::pair<std::vector<binder::Variable *>, size_t> mergedTypeParams_ {};
    std::vector<Type *> typeParamTypes_ {};
};

}  // namespace panda::es2panda::checker

#endif /* TYPESCRIPT_TYPES_INTERFACE_TYPE_H */
