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

#include "compileQueue.h"

#include <binder/binder.h>
#include <binder/scope.h>
#include <compiler/core/compilerContext.h>
#include <compiler/core/emitter.h>
#include <compiler/core/function.h>
#include <compiler/core/pandagen.h>

namespace panda::es2panda::compiler {

void CompileJob::Run()
{
    std::unique_lock<std::mutex> lock(m_);
    cond_.wait(lock, [this] { return dependencies_ == 0; });

    ArenaAllocator allocator(SpaceType::SPACE_TYPE_COMPILER, nullptr, true);
    PandaGen pg(&allocator, context_, scope_);

    Function::Compile(&pg);

    FunctionEmitter funcEmitter(&allocator, &pg);
    funcEmitter.Generate();

    context_->GetEmitter()->AddFunction(&funcEmitter);

    if (dependant_) {
        dependant_->Signal();
    }
}

void CompileJob::DependsOn(CompileJob *job)
{
    job->dependant_ = this;
    dependencies_++;
}

void CompileJob::Signal()
{
    {
        std::lock_guard<std::mutex> lock(m_);
        dependencies_--;
    }

    cond_.notify_one();
}

CompileQueue::CompileQueue(size_t threadCount)
{
    threads_.reserve(threadCount);

    for (size_t i = 0; i < threadCount; i++) {
        threads_.push_back(os::thread::ThreadStart(Worker, this));
    }
}

CompileQueue::~CompileQueue()
{
    void *retval = nullptr;

    std::unique_lock<std::mutex> lock(m_);
    terminate_ = true;
    lock.unlock();
    jobsAvailable_.notify_all();

    for (const auto handle_id : threads_) {
        os::thread::ThreadJoin(handle_id, &retval);
    }
}

void CompileQueue::Schedule(CompilerContext *context)
{
    ASSERT(jobsCount_ == 0);
    std::unique_lock<std::mutex> lock(m_);
    const auto &functions = context->Binder()->Functions();
    jobs_ = new CompileJob[functions.size()]();

    for (auto *function : functions) {
        jobs_[jobsCount_++].SetConext(context, function);
    }

    lock.unlock();
    jobsAvailable_.notify_all();
}

void CompileQueue::Worker(CompileQueue *queue)
{
    while (true) {
        std::unique_lock<std::mutex> lock(queue->m_);
        queue->jobsAvailable_.wait(lock, [queue]() { return queue->terminate_ || queue->jobsCount_ != 0; });

        if (queue->terminate_) {
            return;
        }

        lock.unlock();

        queue->Consume();
        queue->jobsFinished_.notify_one();
    }
}

void CompileQueue::Consume()
{
    std::unique_lock<std::mutex> lock(m_);
    activeWorkers_++;

    while (jobsCount_ > 0) {
        --jobsCount_;
        auto &job = jobs_[jobsCount_];

        lock.unlock();

        try {
            job.Run();
        } catch (const Error &e) {
            lock.lock();
            errors_.push_back(e);
            lock.unlock();
        }

        lock.lock();
    }

    activeWorkers_--;
}

void CompileQueue::Wait()
{
    std::unique_lock<std::mutex> lock(m_);
    jobsFinished_.wait(lock, [this]() { return activeWorkers_ == 0 && jobsCount_ == 0; });
    delete[] jobs_;

    if (!errors_.empty()) {
        // NOLINTNEXTLINE
        throw errors_.front();
    }
}

}  // namespace panda::es2panda::compiler
