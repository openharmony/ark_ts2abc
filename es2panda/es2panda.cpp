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

#include "es2panda.h"

#include <compiler/core/compileQueue.h>
#include <compiler/core/compilerContext.h>
#include <compiler/core/compilerImpl.h>
#include <parser/parserImpl.h>
#include <parser/program/program.h>

#include <iostream>
#include <thread>

namespace panda::es2panda {
// Compiler

constexpr size_t DEFAULT_THREAD_COUNT = 2;

Compiler::Compiler(ScriptExtension ext) : Compiler(ext, DEFAULT_THREAD_COUNT) {}

Compiler::Compiler(ScriptExtension ext, size_t threadCount)
    : parser_(new parser::ParserImpl(ext)), compiler_(new compiler::CompilerImpl(threadCount))
{
}

Compiler::~Compiler()
{
    delete parser_;
    delete compiler_;
}

panda::pandasm::Program *Compiler::Compile(const SourceFile &input, const CompilerOptions &options)
{
    /* TODO(dbatyai): pass string view */
    std::string fname(input.fileName);
    std::string src(input.source);

    try {
        auto ast = input.isModule ? parser_->ParseModule(fname, src) : parser_->ParseScript(fname, src);

        if (options.dumpAst) {
            std::cout << ast.Dump() << std::endl;
        }

        if (options.parseOnly) {
            return nullptr;
        }

        auto *prog = compiler_->Compile(&ast, options);

        return prog;
    } catch (const class Error &e) {
        error_ = e;
        return nullptr;
    }
}

void Compiler::DumpAsm(const panda::pandasm::Program *prog)
{
    compiler::CompilerImpl::DumpAsm(prog);
}

}  // namespace panda::es2panda
