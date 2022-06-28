/*
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

#ifndef ES2PANDA_COMPILER_CORE_COMPILEQUEUE_H
#define ES2PANDA_COMPILER_CORE_COMPILEQUEUE_H

#include <macros.h>
#include <os/thread.h>
#include <es2panda.h>

#include <condition_variable>
#include <mutex>

namespace panda::es2panda::binder {
class FunctionScope;
}  // namespace panda::es2panda::binder

namespace panda::es2panda::compiler {

class CompilerContext;

class CompileJob {
public:
    CompileJob() = default;
    NO_COPY_SEMANTIC(CompileJob);
    NO_MOVE_SEMANTIC(CompileJob);
    ~CompileJob() = default;

    binder::FunctionScope *Scope() const
    {
        return scope_;
    }

    void SetConext(CompilerContext *context, binder::FunctionScope *scope)
    {
        context_ = context;
        scope_ = scope;
    }

    void Run();
    void DependsOn(CompileJob *job);
    void Signal();

private:
    std::mutex m_;
    std::condition_variable cond_;
    CompilerContext *context_ {};
    binder::FunctionScope *scope_ {};
    CompileJob *dependant_ {};
    size_t dependencies_ {0};
};

class CompileQueue {
public:
    explicit CompileQueue(size_t threadCount);
    NO_COPY_SEMANTIC(CompileQueue);
    NO_MOVE_SEMANTIC(CompileQueue);
    ~CompileQueue();

    void Schedule(CompilerContext *context);
    void Consume();
    void Wait();

private:
    static void Worker(CompileQueue *queue);

    std::vector<os::thread::native_handle_type> threads_;
    std::vector<Error> errors_;
    std::mutex m_;
    std::condition_variable jobsAvailable_;
    std::condition_variable jobsFinished_;
    CompileJob *jobs_ {};
    size_t jobsCount_ {0};
    size_t activeWorkers_ {0};
    bool terminate_ {false};
};

}  // namespace panda::es2panda::compiler

#endif
