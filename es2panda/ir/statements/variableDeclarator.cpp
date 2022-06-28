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

#include "variableDeclarator.h"

#include <compiler/base/lreference.h>
#include <compiler/core/pandagen.h>
#include <ir/astDump.h>
#include <ir/expression.h>
#include <ir/statements/variableDeclaration.h>

namespace panda::es2panda::ir {

void VariableDeclarator::Iterate(const NodeTraverser &cb) const
{
    cb(id_);

    if (init_) {
        cb(init_);
    }
}

void VariableDeclarator::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "VariableDeclarator"}, {"id", id_}, {"init", AstDumper::Nullable(init_)}});
}

void VariableDeclarator::Compile([[maybe_unused]] compiler::PandaGen *pg) const
{
    compiler::LReference lref = compiler::LReference::CreateLRef(pg, id_, true);
    const ir::VariableDeclaration *decl = parent_->AsVariableDeclaration();

    if (init_) {
        init_->Compile(pg);
    } else {
        if (decl->Kind() == ir::VariableDeclaration::VariableDeclarationKind::VAR) {
            return;
        }
        if (decl->Kind() == ir::VariableDeclaration::VariableDeclarationKind::LET && !decl->Parent()->IsCatchClause()) {
            pg->LoadConst(this, compiler::Constant::JS_UNDEFINED);
        }
    }

    lref.SetValue();
}

checker::Type *VariableDeclarator::Check([[maybe_unused]] checker::Checker *checker) const
{
    return nullptr;
}

}  // namespace panda::es2panda::ir
