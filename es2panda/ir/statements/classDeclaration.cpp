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

#include "classDeclaration.h"

#include <compiler/base/lreference.h>
#include <ir/astDump.h>
#include <ir/base/classDefinition.h>
#include <ir/base/decorator.h>
#include <ir/expressions/identifier.h>

namespace panda::es2panda::ir {

void ClassDeclaration::Iterate(const NodeTraverser &cb) const
{
    cb(def_);

    for (auto *it : decorators_) {
        cb(it);
    }
}

void ClassDeclaration::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "ClassDeclaration"}, {"definition", def_}, {"decorators", decorators_}});
}

void ClassDeclaration::Compile([[maybe_unused]] compiler::PandaGen *pg) const
{
    auto lref = compiler::LReference::CreateLRef(pg, def_->Ident(), true);
    def_->Compile(pg);
    lref.SetValue();
}

checker::Type *ClassDeclaration::Check([[maybe_unused]] checker::Checker *checker) const
{
    return nullptr;
}

}  // namespace panda::es2panda::ir
