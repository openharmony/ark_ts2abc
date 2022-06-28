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

#include "breakStatement.h"

#include <compiler/core/pandagen.h>
#include <ir/astDump.h>
#include <ir/expressions/identifier.h>

namespace panda::es2panda::ir {

void BreakStatement::Iterate(const NodeTraverser &cb) const
{
    if (ident_) {
        cb(ident_);
    }
}

void BreakStatement::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "BreakStatement"}, {"label", AstDumper::Nullable(ident_)}});
}

void BreakStatement::Compile([[maybe_unused]] compiler::PandaGen *pg) const
{
    compiler::Label *target = pg->ControlFlowChangeBreak(ident_);
    pg->Branch(this, target);
}

checker::Type *BreakStatement::Check([[maybe_unused]] checker::Checker *checker) const
{
    return nullptr;
}

}  // namespace panda::es2panda::ir
