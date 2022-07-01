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

#include "tsTypeLiteral.h"

#include <ir/astDump.h>

#include <binder/variable.h>
#include <binder/declaration.h>
#include <typescript/checker.h>
#include <typescript/types/signature.h>

namespace panda::es2panda::ir {

void TSTypeLiteral::Iterate(const NodeTraverser &cb) const
{
    for (auto *it : members_) {
        cb(it);
    }
}

void TSTypeLiteral::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "TSTypeLiteral"}, {"members", members_}});
}

void TSTypeLiteral::Compile([[maybe_unused]] compiler::PandaGen *pg) const {}

checker::Type *TSTypeLiteral::Check(checker::Checker *checker) const
{
    // TODO(aszilagyi): came from param
    binder::Variable *bindingVar = nullptr;

    checker::ObjectDescriptor *desc = checker->Allocator()->New<checker::ObjectDescriptor>();
    checker::Type *returnType = checker->Allocator()->New<checker::ObjectLiteralType>(desc);

    checker::Type *savedType = nullptr;

    if (bindingVar) {
        if (bindingVar->TsType()) {
            savedType = bindingVar->TsType();
        }

        bindingVar->SetTsType(returnType);
    }

    for (auto *it : members_) {
        if (it->IsTSPropertySignature() || it->IsTSMethodSignature()) {
            checker->PrefetchTypeLiteralProperties(it, desc);
        }
    }

    for (auto *it : members_) {
        checker->CheckTsTypeLiteralOrInterfaceMember(it, desc);
    }

    if (bindingVar) {
        if (savedType) {
            checker->IsTypeIdenticalTo(savedType, bindingVar->TsType(),
                                       {"Subsequent variable declaration must have the same type. Variable '",
                                        bindingVar->Name(), "' must be of type '", savedType, "', but here has type '",
                                        bindingVar->TsType(), "'."},
                                       bindingVar->Declaration()->Node()->Start());
        }
    }

    checker->CheckIndexConstraints(returnType);

    return returnType;
}

}  // namespace panda::es2panda::ir
