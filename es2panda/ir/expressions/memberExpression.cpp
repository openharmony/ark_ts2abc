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

#include "memberExpression.h"

#include <compiler/core/pandagen.h>
#include <typescript/checker.h>
#include <ir/astDump.h>

namespace panda::es2panda::ir {

void MemberExpression::Iterate(const NodeTraverser &cb) const
{
    cb(object_);
    cb(property_);
}

void MemberExpression::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "MemberExpression"},
                 {"object", object_},
                 {"property", property_},
                 {"computed", computed_},
                 {"optional", optional_}});
}

void MemberExpression::CompileObject(compiler::PandaGen *pg, compiler::VReg dest) const
{
    object_->Compile(pg);
    pg->StoreAccumulator(this, dest);
}

compiler::Operand MemberExpression::CompileKey(compiler::PandaGen *pg) const
{
    return pg->ToPropertyKey(property_, computed_);
}

void MemberExpression::Compile(compiler::PandaGen *pg) const
{
    compiler::RegScope rs(pg);
    compiler::VReg objReg = pg->AllocReg();
    CompileObject(pg, objReg);
    compiler::Operand prop = CompileKey(pg);

    if (object_->IsSuperExpression()) {
        pg->LoadSuperProperty(this, objReg, prop);
    } else {
        pg->LoadObjProperty(this, objReg, prop);
    }
}

void MemberExpression::Compile(compiler::PandaGen *pg, compiler::VReg objReg) const
{
    CompileObject(pg, objReg);
    compiler::Operand prop = CompileKey(pg);

    if (object_->IsSuperExpression()) {
        pg->LoadSuperProperty(this, objReg, prop);
    } else {
        pg->LoadObjProperty(this, objReg, prop);
    }
}

checker::Type *MemberExpression::Check(checker::Checker *checker) const
{
    auto *baseType = object_->Check(checker);

    return checker->ResolveBaseProp(baseType, property_, computed_, Start());
}

}  // namespace panda::es2panda::ir
