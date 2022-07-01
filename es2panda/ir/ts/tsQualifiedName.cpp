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

#include "tsQualifiedName.h"

#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/expressions/identifier.h>

namespace panda::es2panda::ir {

void TSQualifiedName::Iterate(const NodeTraverser &cb) const
{
    cb(left_);
    cb(right_);
}

void TSQualifiedName::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "TSQualifiedName"}, {"left", left_}, {"right", right_}});
}

void TSQualifiedName::Compile([[maybe_unused]] compiler::PandaGen *pg) const {}

checker::Type *TSQualifiedName::Check([[maybe_unused]] checker::Checker *checker) const
{
    checker::Type *baseType = left_->Check(checker);

    if (!parent_->IsTSQualifiedName()) {
        if (!checker->TypeStack().insert(right_).second) {
            checker->ThrowTypeError({"'", checker->ToPropertyName(right_, checker::TypeFlag::COMPUTED_NAME),
                                     "' is referenced directly or indirectly in its own type annotation."},
                                    right_->Start());
        }
    }

    checker::Type *propType = checker->ResolveBaseProp(baseType, right_, false, Start());

    checker->TypeStack().erase(right_);

    if (!parent_->IsTSIndexedAccessType() || !parent_->IsTSQualifiedName()) {
        const ir::TSQualifiedName *leftMost = checker::Checker::ResolveLeftMostQualifiedName(this);

        const util::StringView &objName = leftMost->Left()->AsIdentifier()->Name();
        const util::StringView &propName = leftMost->Right()->Name();
        checker->ThrowTypeError(
            {"Cannot access '", objName, ".", propName, "' because '", objName,
             "' is a type, but not a namespace. Did you mean to retrieve the type of the property '", propName,
             "' in '", objName, "' with '", objName, "[\"", propName, "\"]'?"},
            Start());
    }

    return propType;
}

}  // namespace panda::es2panda::ir
