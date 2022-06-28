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

#ifndef ES2PANDA_COMPILER_TYPESCRIPT_TYPES_SIGNATURE_H
#define ES2PANDA_COMPILER_TYPESCRIPT_TYPES_SIGNATURE_H

#include "type.h"

namespace panda::es2panda::binder {
class LocalVariable;
}  // namespace panda::es2panda::binder

namespace panda::es2panda::checker {

class SignatureInfo {
public:
    SignatureInfo() = default;
    explicit SignatureInfo(const SignatureInfo *other, ArenaAllocator *allocator);
    NO_COPY_SEMANTIC(SignatureInfo);
    NO_MOVE_SEMANTIC(SignatureInfo);
    ~SignatureInfo() = default;

    uint32_t minArgCount {};
    binder::LocalVariable *restVar {};
    std::vector<binder::LocalVariable *> funcParams {};
};

class Signature {
public:
    Signature(SignatureInfo *signatureInfo, Type *returnType);
    ~Signature() = default;
    NO_COPY_SEMANTIC(Signature);
    NO_MOVE_SEMANTIC(Signature);

    const SignatureInfo *Info() const;
    const std::vector<binder::LocalVariable *> &Params() const;
    const Type *ReturnType() const;
    Type *ReturnType();
    uint32_t MinArgCount() const;
    uint32_t OptionalArgCount() const;
    void SetReturnType(Type *type);
    const binder::LocalVariable *RestVar() const;
    Signature *Copy(ArenaAllocator *allocator, TypeRelation *relation, GlobalTypesHolder *globalTypes);

    void ToString(std::stringstream &ss, const binder::Variable *variable, bool printAsMethod = false) const;
    void Identical(TypeRelation *relation, const Signature *other) const;
    void AssignmentTarget(TypeRelation *relation, const Signature *source) const;

private:
    SignatureInfo *signatureInfo_;
    Type *returnType_;
};

}  // namespace panda::es2panda::checker

#endif /* TYPESCRIPT_TYPES_SIGNATURE_H */
