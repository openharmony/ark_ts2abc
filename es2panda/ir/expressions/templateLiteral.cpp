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

#include "templateLiteral.h"

#include <compiler/core/pandagen.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/base/templateElement.h>

namespace panda::es2panda::ir {

void TemplateLiteral::Iterate(const NodeTraverser &cb) const
{
    for (auto *it : expressions_) {
        cb(it);
    }

    for (auto *it : quasis_) {
        cb(it);
    }
}

void TemplateLiteral::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "TemplateLiteral"}, {"expressions", expressions_}, {"quasis", quasis_}});
}

void TemplateLiteral::Compile([[maybe_unused]] compiler::PandaGen *pg) const
{
    auto quasisIt = quasis_.begin();
    auto expressionIt = expressions_.begin();

    pg->LoadAccumulatorString(this, (*quasisIt)->Raw());

    quasisIt++;

    bool isQuais = false;
    size_t total = quasis_.size() + expressions_.size();

    compiler::RegScope rs(pg);
    compiler::VReg lhs = pg->AllocReg();

    while (total != 1) {
        const ir::AstNode *node = nullptr;

        if (isQuais) {
            pg->StoreAccumulator(*quasisIt, lhs);
            pg->LoadAccumulatorString(this, (*quasisIt)->Raw());

            node = *quasisIt;
            quasisIt++;
        } else {
            const ir::Expression *element = *expressionIt;
            pg->StoreAccumulator(element, lhs);

            element->Compile(pg);

            node = element;
            expressionIt++;
        }

        pg->Binary(node, lexer::TokenType::PUNCTUATOR_PLUS, lhs);

        isQuais = !isQuais;
        total--;
    }
}

checker::Type *TemplateLiteral::Check([[maybe_unused]] checker::Checker *checker) const
{
    // TODO(aszilagyi)
    return checker->GlobalAnyType();
}

}  // namespace panda::es2panda::ir
