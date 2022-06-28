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

#include "tsIndexedAccessType.h"

#include <typescript/checker.h>
#include <ir/astDump.h>

namespace panda::es2panda::ir {

void TSIndexedAccessType::Iterate(const NodeTraverser &cb) const
{
    cb(objectType_);
    cb(indexType_);
}

void TSIndexedAccessType::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "TSIndexedAccessType"}, {"objectType", objectType_}, {"indexType", indexType_}});
}

void TSIndexedAccessType::Compile([[maybe_unused]] compiler::PandaGen *pg) const {}

checker::Type *TSIndexedAccessType::Check([[maybe_unused]] checker::Checker *checker) const
{
    checker::Type *baseType = objectType_->Check(checker);
    checker::Type *propType = checker->ResolveBaseProp(baseType, indexType_, false, Start());

    return propType;
}

}  // namespace panda::es2panda::ir
