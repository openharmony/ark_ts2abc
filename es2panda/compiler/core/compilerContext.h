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

#ifndef ES2PANDA_COMPILER_CORE_COMPILER_CONTEXT_H
#define ES2PANDA_COMPILER_CORE_COMPILER_CONTEXT_H

#include <macros.h>
#include <mem/arena_allocator.h>

#include <cstdint>
#include <mutex>

namespace panda::es2panda::binder {
class Binder;
}  // namespace panda::es2panda::binder

namespace panda::es2panda::compiler {

class DebugInfo;
class Emitter;

class CompilerContext {
public:
    CompilerContext(binder::Binder *binder, bool isDebug);
    NO_COPY_SEMANTIC(CompilerContext);
    NO_MOVE_SEMANTIC(CompilerContext);
    ~CompilerContext() = default;

    binder::Binder *Binder() const
    {
        return binder_;
    }

    Emitter *GetEmitter() const
    {
        return emitter_.get();
    }

    int32_t LiteralCount() const
    {
        return literalBufferIdx_;
    }

    int32_t NewLiteralIndex()
    {
        std::lock_guard lock(m_);
        return literalBufferIdx_++;
    }

    std::mutex &Mutex()
    {
        return m_;
    }

    bool IsDebug() const
    {
        return isDebug_;
    }

private:
    binder::Binder *binder_;
    std::unique_ptr<Emitter> emitter_;
    int32_t literalBufferIdx_ {0};
    std::mutex m_;
    bool isDebug_;
};

}  // namespace panda::es2panda::compiler

#endif
