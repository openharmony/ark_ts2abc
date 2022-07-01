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

#ifndef ES2PANDA_COMPILER_IR_EMITTER_H
#define ES2PANDA_COMPILER_IR_EMITTER_H

#include <assembly-literals.h>
#include <ir/astNode.h>
#include <lexer/token/sourceLocation.h>
#include <macros.h>
#include <util/ustring.h>

#include <list>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace panda::pandasm {
struct Program;
struct Function;
struct Ins;
}  // namespace panda::pandasm

namespace panda::es2panda::ir {
class Statement;
}  // namespace panda::es2panda::ir

namespace panda::es2panda::binder {
class Scope;
}  // namespace panda::es2panda::binder

namespace panda::es2panda::compiler {

class PandaGen;
class LiteralBuffer;
class DebugInfo;
class Label;
class IRNode;
class CompilerContext;

class FunctionEmitter {
public:
    explicit FunctionEmitter(ArenaAllocator *allocator, const PandaGen *pg);
    ~FunctionEmitter() = default;
    NO_COPY_SEMANTIC(FunctionEmitter);
    NO_MOVE_SEMANTIC(FunctionEmitter);

    panda::pandasm::Function *Function()
    {
        return func_;
    }

    auto &LiteralBuffers()
    {
        return literalBuffers_;
    }

    void Generate();
    const ArenaSet<util::StringView> &Strings() const;

private:
    void GenInstructionDebugInfo(const IRNode *ins, panda::pandasm::Ins *pandaIns);
    void GenFunctionInstructions();
    void GenFunctionCatchTables();
    void GenFunctionICSize();
    void GenScopeVariableInfo(const binder::Scope *scope);
    void GenSourceFileDebugInfo();
    void GenVariablesDebugInfo();
    util::StringView SourceCode() const;

    void GenLiteralBuffers();
    void GenBufferLiterals(const LiteralBuffer *buff);

    const PandaGen *pg_;
    panda::pandasm::Function *func_ {};
    ArenaVector<std::pair<int32_t, std::vector<panda::pandasm::LiteralArray::Literal>>> literalBuffers_;
    size_t offset_ {0};
};

class Emitter {
public:
    explicit Emitter(const CompilerContext *context);
    ~Emitter();
    NO_COPY_SEMANTIC(Emitter);
    NO_MOVE_SEMANTIC(Emitter);

    void AddFunction(FunctionEmitter *func);
    static void DumpAsm(const panda::pandasm::Program *prog);
    panda::pandasm::Program *Finalize(bool dumpDebugInfo);

private:
    void GenESAnnoatationRecord();
    void GenESModuleModeRecord(bool isModule);

    std::mutex m_;
    panda::pandasm::Program *prog_;
};

}  // namespace panda::es2panda::compiler

#endif
