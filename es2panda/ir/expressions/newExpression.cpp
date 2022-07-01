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

#include "newExpression.h"

#include <util/helpers.h>
#include <compiler/core/pandagen.h>
#include <compiler/core/regScope.h>
#include <typescript/checker.h>
#include <ir/astDump.h>

namespace panda::es2panda::ir {

void NewExpression::Iterate(const NodeTraverser &cb) const
{
    cb(callee_);

    for (auto *it : arguments_) {
        cb(it);
    }
}

void NewExpression::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "NewExpression"}, {"callee", callee_}, {"arguments", arguments_}});
}

void NewExpression::Compile(compiler::PandaGen *pg) const
{
    compiler::RegScope rs(pg);
    compiler::VReg ctor = pg->AllocReg();
    compiler::VReg newTarget = pg->AllocReg();

    callee_->Compile(pg);
    pg->StoreAccumulator(this, ctor);

    // new.Target will be the same as ctor
    pg->StoreAccumulator(this, newTarget);

    if (!util::Helpers::ContainSpreadElement(arguments_)) {
        for (const auto *it : arguments_) {
            compiler::VReg arg = pg->AllocReg();
            it->Compile(pg);
            pg->StoreAccumulator(this, arg);
        }

        pg->NewObject(this, ctor, arguments_.size() + 2);
    } else {
        compiler::VReg argsObj = pg->AllocReg();

        pg->CreateArray(this, arguments_, argsObj);
        pg->NewObjSpread(this, ctor, newTarget);
    }
}

checker::Type *NewExpression::Check([[maybe_unused]] checker::Checker *checker) const
{
    // TODO(aszilagyi)
    return checker->GlobalAnyType();
}

}  // namespace panda::es2panda::ir
