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

#ifndef ES2PANDA_COMPILER_TYPESCRIPT_TYPES_OBJECT_TYPE_H
#define ES2PANDA_COMPILER_TYPESCRIPT_TYPES_OBJECT_TYPE_H

#include "type.h"

#include <typescript/types/objectDescriptor.h>

#include <util/ustring.h>
#include <util/enumbitops.h>

namespace panda::es2panda::binder {
class LocalVariable;
}  // namespace panda::es2panda::binder

namespace panda::es2panda::checker {

class Signature;
class IndexInfo;

#define DECLARE_OBJECT_TYPENAMES(objectKind, typeName) class typeName;
OBJECT_TYPE_MAPPING(DECLARE_OBJECT_TYPENAMES)
#undef DECLARE_OBJECT_TYPENAMES

class ObjectType : public Type {
public:
    enum class ObjectTypeKind {
        LITERAL,
        CLASS,
        INTERFACE,
        TUPLE,
        FUNCTION,
    };

    enum class ObjectFlags {
        NO_OPTS = 0,
        CHECK_EXCESS_PROPS = 1 << 0,
        HAVE_REST = 1 << 1,
    };

#define OBJECT_TYPE_IS_CHECKS(objectKind, typeName) \
    bool Is##typeName() const                       \
    {                                               \
        return kind_ == objectKind;                 \
    }
    OBJECT_TYPE_MAPPING(OBJECT_TYPE_IS_CHECKS)
#undef OBJECT_TYPE_IS_CHECKS

#define OBJECT_TYPE_AS_CASTS(objectKind, typeName)       \
    typeName *As##typeName()                             \
    {                                                    \
        ASSERT(Is##typeName());                          \
        return reinterpret_cast<typeName *>(this);       \
    }                                                    \
    const typeName *As##typeName() const                 \
    {                                                    \
        ASSERT(Is##typeName());                          \
        return reinterpret_cast<const typeName *>(this); \
    }
    OBJECT_TYPE_MAPPING(OBJECT_TYPE_AS_CASTS)
#undef OBJECT_TYPE_AS_CASTS

    explicit ObjectType(ObjectTypeKind kind);
    ObjectType(ObjectTypeKind kind, ObjectDescriptor *desc);

    ObjectTypeKind Kind() const;
    std::vector<Signature *> &CallSignatures();
    const std::vector<Signature *> &CallSignatures() const;
    const std::vector<Signature *> &ConstructSignatures() const;
    const IndexInfo *StringIndexInfo() const;
    const IndexInfo *NumberIndexInfo() const;
    IndexInfo *StringIndexInfo();
    IndexInfo *NumberIndexInfo();
    const std::vector<binder::LocalVariable *> &Properties() const;
    ObjectDescriptor *Desc();
    const ObjectDescriptor *Desc() const;

    void AddProperty(binder::LocalVariable *prop);
    void AddSignature(Signature *signature, bool isCall = true);
    void AddObjectFlag(ObjectFlags flag);
    void RemoveObjectFlag(ObjectFlags flag);
    bool HasObjectFlag(ObjectFlags flag) const;

    void Identical(TypeRelation *relation, const Type *other) const override;
    void AssignmentTarget(TypeRelation *relation, const Type *source) const override;
    virtual binder::LocalVariable *GetProperty(const util::StringView &name) const;

    static bool SignatureRelatedToSomeSignature(TypeRelation *relation, const Signature *sourceSignature,
                                                std::vector<Signature *> *targetSignatures);
    static bool EachSignatureRelatedToSomeSignature(TypeRelation *relation,
                                                    const std::vector<Signature *> &sourceSignatures,
                                                    const std::vector<Signature *> &targetSignatures);

    void AssignProperties(TypeRelation *relation, const ObjectType *source,
                          bool performExcessPropertyCheck = false) const;
    void AssignSignatures(TypeRelation *relation, const ObjectType *source, bool assignCallSignatures = true) const;
    void AssignIndexInfo(TypeRelation *relation, const ObjectType *source, bool assignNumberInfo = true) const;

protected:
    ObjectTypeKind kind_;
    ObjectDescriptor *desc_;
    ObjectFlags objFlag_;
};

DEFINE_BITOPS(ObjectType::ObjectFlags)

}  // namespace panda::es2panda::checker

#endif /* TYPESCRIPT_TYPES_OBJECT_TYPE_H */
