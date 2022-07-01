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

#include "signature.h"

#include <binder/variable.h>

namespace panda::es2panda::checker {

SignatureInfo::SignatureInfo(const SignatureInfo *other, ArenaAllocator *allocator)
{
    for (auto *it : other->funcParams) {
        funcParams.push_back(it->Copy(allocator, it->Declaration()));
    }

    minArgCount = other->minArgCount;

    if (other->restVar) {
        restVar = other->restVar->Copy(allocator, other->restVar->Declaration());
    }
}

Signature::Signature(SignatureInfo *signatureInfo, Type *returnType)
    : signatureInfo_(signatureInfo), returnType_(returnType)
{
}

const SignatureInfo *Signature::Info() const
{
    return signatureInfo_;
}

const std::vector<binder::LocalVariable *> &Signature::Params() const
{
    return signatureInfo_->funcParams;
}

const Type *Signature::ReturnType() const
{
    return returnType_;
}

Type *Signature::ReturnType()
{
    return returnType_;
}

uint32_t Signature::MinArgCount() const
{
    return signatureInfo_->minArgCount;
}

uint32_t Signature::OptionalArgCount() const
{
    return signatureInfo_->funcParams.size() - signatureInfo_->minArgCount;
}

void Signature::SetReturnType(Type *type)
{
    returnType_ = type;
}

const binder::LocalVariable *Signature::RestVar() const
{
    return signatureInfo_->restVar;
}

Signature *Signature::Copy(ArenaAllocator *allocator, TypeRelation *relation, GlobalTypesHolder *globalTypes)
{
    SignatureInfo *copiedInfo = allocator->New<checker::SignatureInfo>(signatureInfo_, allocator);

    for (auto *it : copiedInfo->funcParams) {
        it->SetTsType(it->TsType()->Instantiate(allocator, relation, globalTypes));
    }

    Type *copiedReturnType = returnType_->Instantiate(allocator, relation, globalTypes);

    return allocator->New<Signature>(copiedInfo, copiedReturnType);
}

void Signature::ToString(std::stringstream &ss, const binder::Variable *variable, bool printAsMethod) const
{
    ss << "(";

    for (auto it = signatureInfo_->funcParams.begin(); it != signatureInfo_->funcParams.end(); it++) {
        ss << (*it)->Name();

        if ((*it)->HasFlag(binder::VariableFlags::OPTIONAL)) {
            ss << "?";
        }

        ss << ": ";

        (*it)->TsType()->ToString(ss);

        if (std::next(it) != signatureInfo_->funcParams.end()) {
            ss << ", ";
        }
    }

    if (signatureInfo_->restVar) {
        if (!signatureInfo_->funcParams.empty()) {
            ss << ", ";
        }

        ss << "...";
        ss << signatureInfo_->restVar->Name();
        ss << ": ";
        signatureInfo_->restVar->TsType()->ToString(ss);
        ss << "[]";
    }

    ss << ")";

    if (printAsMethod || (variable && variable->HasFlag(binder::VariableFlags::METHOD))) {
        ss << ": ";
    } else {
        ss << " => ";
    }

    returnType_->ToString(ss);
}

void Signature::Identical(TypeRelation *relation, const Signature *other) const
{
    if (signatureInfo_->minArgCount != other->MinArgCount() ||
        signatureInfo_->funcParams.size() != other->Params().size()) {
        relation->Result(false);
        return;
    }

    relation->IsIdenticalTo(returnType_, other->ReturnType());

    if (relation->IsTrue()) {
        for (uint64_t i = 0; i < signatureInfo_->funcParams.size(); i++) {
            relation->IsIdenticalTo(signatureInfo_->funcParams[i]->TsType(), other->Params()[i]->TsType());
            if (!relation->IsTrue()) {
                return;
            }
        }

        if (signatureInfo_->restVar && other->RestVar()) {
            relation->IsIdenticalTo(signatureInfo_->restVar->TsType(), other->RestVar()->TsType());
        } else if ((signatureInfo_->restVar && !other->RestVar()) || (!signatureInfo_->restVar && other->RestVar())) {
            relation->Result(false);
        }
    }
}

void Signature::AssignmentTarget(TypeRelation *relation, const Signature *source) const
{
    if (!signatureInfo_->restVar &&
        (source->Params().size() - source->OptionalArgCount()) > signatureInfo_->funcParams.size()) {
        relation->Result(false);
        return;
    }

    for (size_t i = 0; i < source->Params().size(); i++) {
        if (!signatureInfo_->restVar && i >= Params().size()) {
            break;
        }

        if (signatureInfo_->restVar) {
            relation->IsAssignableTo(source->Params()[i]->TsType(), signatureInfo_->restVar->TsType());

            if (!relation->IsTrue()) {
                return;
            }

            continue;
        }

        relation->IsAssignableTo(source->Params()[i]->TsType(), Params()[i]->TsType());

        if (!relation->IsTrue()) {
            return;
        }
    }

    relation->IsAssignableTo(source->ReturnType(), ReturnType());

    if (relation->IsTrue() && signatureInfo_->restVar && source->RestVar()) {
        relation->IsAssignableTo(source->RestVar()->TsType(), signatureInfo_->restVar->TsType());
    }
}

}  // namespace panda::es2panda::checker
