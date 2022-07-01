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

#ifndef ES2PANDA_IR_TS_MODULE_BLOCK_H
#define ES2PANDA_IR_TS_MODULE_BLOCK_H

#include <ir/statement.h>

namespace panda::es2panda::binder {
class LocalScope;
}  // namespace panda::es2panda::binder

namespace panda::es2panda::compiler {
class PandaGen;
}  // namespace panda::es2panda::compiler

namespace panda::es2panda::checker {
class Checker;
class Type;
}  // namespace panda::es2panda::checker

namespace panda::es2panda::ir {

class TSModuleBlock : public Statement {
public:
    explicit TSModuleBlock(binder::LocalScope *scope, ArenaVector<Statement *> &&statements)
        : Statement(AstNodeType::TS_MODULE_BLOCK), scope_(scope), statements_(std::move(statements))
    {
    }

    binder::LocalScope *Scope() const
    {
        return scope_;
    }

    const ArenaVector<Statement *> &Statements() const
    {
        return statements_;
    }

    void Iterate(const NodeTraverser &cb) const override;
    void Dump(ir::AstDumper *dumper) const override;
    void Compile([[maybe_unused]] compiler::PandaGen *pg) const override;
    checker::Type *Check([[maybe_unused]] checker::Checker *checker) const override;

private:
    binder::LocalScope *scope_;
    ArenaVector<Statement *> statements_;
};
}  // namespace panda::es2panda::ir

#endif
