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

#include <assembly-literals.h>
#include <bytecode_optimizer/bytecodeopt_options.h>
#include <bytecode_optimizer/optimize_bytecode.h>
#include <mem/arena_allocator.h>
#include <mem/pool_manager.h>
#include <options.h>
#include <plugins/ecmascript/es2panda/es2panda.h>

#include <iostream>
#include <memory>

namespace panda::es2panda::aot {

using mem::MemConfig;

class MemManager {
public:
    explicit MemManager()
    {
        constexpr auto COMPILER_SIZE = 128_MB;

        MemConfig::Initialize(0, 0, COMPILER_SIZE, 0);
        PoolManager::Initialize(PoolType::MMAP);
    }

    NO_COPY_SEMANTIC(MemManager);
    NO_MOVE_SEMANTIC(MemManager);

    ~MemManager()
    {
        PoolManager::Finalize();
        MemConfig::Finalize();
    }
};

static int GenerateProgram(panda::pandasm::Program *prog, const std::string &output, int optLevel, bool dumpAsm,
                           bool dumpSize)
{
    std::map<std::string, size_t> stat;
    std::map<std::string, size_t> *statp = optLevel != 0 ? &stat : nullptr;
    panda::pandasm::AsmEmitter::PandaFileToPandaAsmMaps maps {};
    panda::pandasm::AsmEmitter::PandaFileToPandaAsmMaps *mapsp = optLevel != 0 ? &maps : nullptr;

#ifdef PANDA_WITH_BYTECODE_OPTIMIZER
    if (optLevel != 0) {
        const uint32_t COMPONENT_MASK = panda::Logger::Component::ASSEMBLER |
                                        panda::Logger::Component::BYTECODE_OPTIMIZER |
                                        panda::Logger::Component::COMPILER;
        panda::Logger::InitializeStdLogging(panda::Logger::Level::ERROR, COMPONENT_MASK);

        if (!panda::pandasm::AsmEmitter::Emit(output, *prog, statp, mapsp, true)) {
            return 1;
        }

        panda::bytecodeopt::options.SetOptLevel(optLevel);
        panda::bytecodeopt::OptimizeBytecode(prog, mapsp, output, true, true);
    }
#endif

    if (dumpAsm) {
        es2panda::Compiler::DumpAsm(prog);
    }

    if (!panda::pandasm::AsmEmitter::Emit(output, *prog, statp, mapsp, true)) {
        return 1;
    }

    if (dumpSize && optLevel != 0) {
        size_t totalSize = 0;
        std::cout << "Panda file size statistic:" << std::endl;
        constexpr std::array<std::string_view, 2> INFO_STATS = {"instructions_number", "codesize"};

        for (const auto &[name, size] : stat) {
            if (find(INFO_STATS.begin(), INFO_STATS.end(), name) != INFO_STATS.end()) {
                continue;
            }
            std::cout << name << " section: " << size << std::endl;
            totalSize += size;
        }

        for (const auto &name : INFO_STATS) {
            std::cout << name << ": " << stat.at(std::string(name)) << std::endl;
        }

        std::cout << "total: " << totalSize << std::endl;
    }

    return 0;
}

int Run(int argc, const char **argv)
{
    auto options = std::make_unique<Options>();

    if (!options->Parse(argc, argv)) {
        std::cerr << options->ErrorMsg() << std::endl;
        return 1;
    }

    es2panda::Compiler compiler(options->Extension(), options->ThreadCount());
    es2panda::SourceFile input(options->SourceFile(), options->ParserInput(), options->ParseModule());

    auto *program = compiler.Compile(input, options->CompilerOptions());

    if (!program) {
        const auto &err = compiler.GetError();

        if (err.Message().empty() && options->ParseOnly()) {
            return 0;
        }

        std::cout << err.TypeString() << ": " << err.Message();
        std::cout << " [" << options->SourceFile() << ":" << err.Line() << ":" << err.Col() << "]" << std::endl;

        return err.ErrorCode();
    }

    GenerateProgram(program, options->CompilerOutput(), options->OptLevel(), options->CompilerOptions().dumpAsm,
                    options->SizeStat());
    delete program;

    return 0;
}

}  // namespace panda::es2panda::aot

int main(int argc, const char **argv)
{
    panda::es2panda::aot::MemManager mm;
    return panda::es2panda::aot::Run(argc, argv);
}
