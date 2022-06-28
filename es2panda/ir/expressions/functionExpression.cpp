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

#include "functionExpression.h"

#include <compiler/core/pandagen.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/base/scriptFunction.h>
#include <ir/expressions/identifier.h>
#include <ir/statements/variableDeclarator.h>

namespace panda::es2panda::ir {

void FunctionExpression::Iterate(const NodeTraverser &cb) const
{
    cb(func_);
}

void FunctionExpression::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "FunctionExpression"}, {"function", func_}});
}

void FunctionExpression::Compile(compiler::PandaGen *pg) const
{
    pg->DefineFunction(func_, func_, func_->Scope()->InternalName());
}

checker::Type *FunctionExpression::Check(checker::Checker *checker) const
{
    binder::Variable *funcVar = nullptr;
    const ir::VariableDeclarator *varDecl = nullptr;

    if (func_->Parent()->Parent()->IsVariableDeclarator()) {
        varDecl = func_->Parent()->Parent()->AsVariableDeclarator();
    }

    if (varDecl) {
        ASSERT(varDecl->IsVariableDeclarator());
        if (varDecl->AsVariableDeclarator()->Id()->IsIdentifier() && !varDecl->Id()->AsIdentifier()->TypeAnnotation()) {
            const util::StringView &varName = varDecl->AsVariableDeclarator()->Id()->AsIdentifier()->Name();

            binder::ScopeFindResult result = checker->Scope()->Find(varName);
            ASSERT(result.variable);

            funcVar = result.variable;
        }
    }

    checker::ScopeContext scopeCtx(checker, func_->Scope());

    auto *signatureInfo = checker->Allocator()->New<checker::SignatureInfo>();
    checker->CheckFunctionParameterDeclaration(func_->Params(), signatureInfo);

    checker::Type *returnType = nullptr;

    if (funcVar) {
        checker->HandleFunctionReturn(func_, signatureInfo, funcVar);
        returnType = funcVar->TsType();
    } else {
        checker::ObjectDescriptor *desc = checker->Allocator()->New<checker::ObjectDescriptor>();
        desc->callSignatures.push_back(checker->HandleFunctionReturn(func_, signatureInfo, funcVar));
        returnType = checker->Allocator()->New<checker::FunctionType>(desc);
    }

    if (!func_->IsArrow() || !func_->Body()->IsExpression()) {
        func_->Body()->Check(checker);
    }

    return returnType;
}

}  // namespace panda::es2panda::ir
