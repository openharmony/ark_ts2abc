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

#include "tsTypeAliasDeclaration.h"

#include <binder/scope.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/expressions/identifier.h>
#include <ir/ts/tsTypeParameter.h>
#include <ir/ts/tsTypeParameterDeclaration.h>

namespace panda::es2panda::ir {

void TSTypeAliasDeclaration::Iterate(const NodeTraverser &cb) const
{
    cb(id_);

    if (typeParams_) {
        cb(typeParams_);
    }

    cb(typeAnnotation_);
}

void TSTypeAliasDeclaration::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "TSTypeAliasDeclaration"},
                 {"id", id_},
                 {"typeAnnotation", typeAnnotation_},
                 {"typeParameters", AstDumper::Optional(typeParams_)},
                 {"declare", AstDumper::Optional(declare_)}});
}

void TSTypeAliasDeclaration::Compile([[maybe_unused]] compiler::PandaGen *pg) const {}

checker::Type *TSTypeAliasDeclaration::CheckTypeAnnotation(checker::Checker *checker,
                                                           binder::Variable *bindingVar) const
{
    checker::Type *aliasType = typeAnnotation_->Check(checker);
    aliasType->SetVariable(bindingVar);
    bindingVar->SetTsType(aliasType);

    return bindingVar->TsType();
}

checker::Type *TSTypeAliasDeclaration::InferType(checker::Checker *checker, binder::Variable *bindingVar) const
{
    if (typeParams_) {
        checker::ScopeContext scopeCtx(checker, typeParams_->Scope());
        checker->CheckTypeParameters(typeParams_);
        return CheckTypeAnnotation(checker, bindingVar);
    }

    return CheckTypeAnnotation(checker, bindingVar);
}

checker::Type *TSTypeAliasDeclaration::Check([[maybe_unused]] checker::Checker *checker) const
{
    const util::StringView &aliasName = id_->Name();
    binder::ScopeFindResult result = checker->Scope()->Find(aliasName);
    ASSERT(result.variable);

    if (!result.variable->TsType()) {
        InferType(checker, result.variable);
    }

    return nullptr;
}

}  // namespace panda::es2panda::ir
