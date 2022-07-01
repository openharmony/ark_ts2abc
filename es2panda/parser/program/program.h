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

#ifndef ES2PANDA_PARSER_INCLUDE_PROGRAM_H
#define ES2PANDA_PARSER_INCLUDE_PROGRAM_H

#include <macros.h>
#include <mem/arena_allocator.h>
#include <util/ustring.h>

#include "es2panda.h"

namespace panda::es2panda::ir {
class BlockStatement;
}  // namespace panda::es2panda::ir

namespace panda::es2panda::binder {
class Binder;
}  // namespace panda::es2panda::binder

namespace panda::es2panda::parser {

enum class ScriptKind { SCRIPT, MODULE };

class Program {
public:
    explicit Program(es2panda::ScriptExtension extension);
    NO_COPY_SEMANTIC(Program);
    Program(Program &&other);
    Program &operator=(Program &&other);
    ~Program() = default;

    ArenaAllocator *Allocator() const
    {
        return allocator_.get();
    }

    const binder::Binder *Binder() const
    {
        return binder_;
    }

    binder::Binder *Binder()
    {
        return binder_;
    }

    ScriptExtension Extension() const
    {
        return extension_;
    }

    ScriptKind Kind() const
    {
        return kind_;
    }

    util::StringView SourceCode() const
    {
        return sourceCode_.View();
    }

    util::StringView SourceFile() const
    {
        return sourceFile_.View();
    }

    ir::BlockStatement *Ast()
    {
        return ast_;
    }

    const ir::BlockStatement *Ast() const
    {
        return ast_;
    }

    void SetAst(ir::BlockStatement *ast)
    {
        ast_ = ast;
    }

    void SetSource(const std::string &sourceCode, const std::string &sourceFile)
    {
        sourceCode_ = util::UString(sourceCode, Allocator());
        sourceFile_ = util::UString(sourceFile, Allocator());
    }

    std::string Dump() const;
    void SetKind(ScriptKind kind);

private:
    std::unique_ptr<ArenaAllocator> allocator_ {};
    binder::Binder *binder_ {};
    ir::BlockStatement *ast_ {};
    util::UString sourceCode_ {};
    util::UString sourceFile_ {};
    ScriptKind kind_ {};
    ScriptExtension extension_ {};
};

}  // namespace panda::es2panda::parser

#endif
