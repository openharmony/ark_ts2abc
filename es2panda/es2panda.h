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

#ifndef ES2PANDA_PUBLIC_H
#define ES2PANDA_PUBLIC_H

#include <macros.h>

#include <string>

namespace panda::pandasm {
struct Program;
}  // namespace panda::pandasm

namespace panda::es2panda {
namespace parser {
class ParserImpl;
}  // namespace parser

namespace compiler {
class CompilerImpl;
}  // namespace compiler

enum class ScriptExtension {
    JS,
    TS,
    AS,
};

struct SourceFile {
    SourceFile(std::string_view fn, std::string_view s) : fileName(fn), source(s) {};
    SourceFile(std::string_view fn, std::string_view s, bool m) : fileName(fn), source(s), isModule(m) {};

    std::string_view fileName {};
    std::string_view source {};
    bool isModule {false};
};

struct CompilerOptions {
    bool isDebug {false};
    bool dumpAst {false};
    bool dumpAsm {false};
    bool dumpDebugInfo {false};
    bool parseOnly {false};
};

enum class ErrorType {
    GENERIC,
    SYNTAX,
    TYPE,
};

class Error : public std::exception {
public:
    Error() noexcept = default;
    explicit Error(ErrorType type, std::string_view message) noexcept : type_(type), message_(message) {}
    explicit Error(ErrorType type, std::string_view message, size_t line, size_t column) noexcept
        : type_(type), message_(message), line_(line), col_(column)
    {
    }
    ~Error() override = default;
    DEFAULT_COPY_SEMANTIC(Error);
    DEFAULT_MOVE_SEMANTIC(Error);

    ErrorType Type() const noexcept
    {
        return type_;
    }

    const char *TypeString() const noexcept
    {
        switch (type_) {
            case ErrorType::SYNTAX:
                return "SyntaxError";
            case ErrorType::TYPE:
                return "TypeError";
            default:
                break;
        }

        return "Error";
    }

    const char *what() const noexcept override
    {
        return message_.c_str();
    }

    int ErrorCode() const noexcept
    {
        return errorCode_;
    }

    const std::string &Message() const noexcept
    {
        return message_;
    }

    size_t Line() const
    {
        return line_;
    }

    size_t Col() const
    {
        return col_;
    }

private:
    ErrorType type_ {ErrorType::GENERIC};
    std::string message_;
    size_t line_ {};
    size_t col_ {};
    int errorCode_ {1};
};

class Compiler {
public:
    explicit Compiler(ScriptExtension ext);
    explicit Compiler(ScriptExtension ext, size_t threadCount);
    ~Compiler();
    NO_COPY_SEMANTIC(Compiler);
    NO_MOVE_SEMANTIC(Compiler);

    panda::pandasm::Program *Compile(const SourceFile &input, const CompilerOptions &options);

    inline panda::pandasm::Program *Compile(const SourceFile &input)
    {
        CompilerOptions options;

        return Compile(input, options);
    }

    static void DumpAsm(const panda::pandasm::Program *prog);

    const Error &GetError() const noexcept
    {
        return error_;
    }

private:
    parser::ParserImpl *parser_;
    compiler::CompilerImpl *compiler_;
    Error error_;
};
}  // namespace panda::es2panda

#endif
