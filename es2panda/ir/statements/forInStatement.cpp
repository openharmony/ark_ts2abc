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

#include "forInStatement.h"

#include <binder/scope.h>
#include <compiler/base/lreference.h>
#include <compiler/core/labelTarget.h>
#include <compiler/core/pandagen.h>
#include <typescript/checker.h>

#include <ir/astDump.h>
#include <ir/expression.h>

namespace panda::es2panda::ir {

void ForInStatement::Iterate(const NodeTraverser &cb) const
{
    cb(left_);
    cb(right_);
    cb(body_);
}

void ForInStatement::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "ForInStatement"}, {"left", left_}, {"right", right_}, {"body", body_}});
}

void ForInStatement::Compile([[maybe_unused]] compiler::PandaGen *pg) const
{
    compiler::LabelTarget labelTarget(pg);

    compiler::RegScope rs(pg);
    compiler::VReg iter = pg->AllocReg();
    compiler::VReg propName = pg->AllocReg();

    // create enumerator
    right_->Compile(pg);
    pg->GetPropIterator(this);
    pg->StoreAccumulator(this, iter);

    pg->SetLabel(this, labelTarget.ContinueTarget());

    // get next prop of enumerator
    pg->GetNextPropName(this, iter);
    pg->StoreAccumulator(this, propName);
    pg->BranchIfUndefined(this, labelTarget.BreakTarget());

    compiler::LocalRegScope declRegScope(pg, scope_->DeclScope()->InitScope());
    auto lref = compiler::LReference::CreateLRef(pg, left_, false);
    pg->LoadAccumulator(this, propName);
    lref.SetValue();

    compiler::LoopEnvScope declEnvScope(pg, scope_->DeclScope());

    {
        compiler::LoopEnvScope envScope(pg, scope_, labelTarget);
        body_->Compile(pg);
    }

    pg->Branch(this, labelTarget.ContinueTarget());
    pg->SetLabel(this, labelTarget.BreakTarget());
}

checker::Type *ForInStatement::Check([[maybe_unused]] checker::Checker *checker) const
{
    return nullptr;
}

}  // namespace panda::es2panda::ir
