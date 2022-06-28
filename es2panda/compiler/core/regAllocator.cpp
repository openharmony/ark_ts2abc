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

#include "regAllocator.h"

#include <compiler/core/pandagen.h>

#include <algorithm>

namespace panda::es2panda::compiler {

// RegAllocatorBase

void AllocatorBase::PushBack(IRNode *ins)
{
    pg_->Insns().push_back(ins);
}

ArenaAllocator *AllocatorBase::Allocator() const
{
    return pg_->Allocator();
}

// SimpleAllocator

Label *SimpleAllocator::AllocLabel(std::string &&id)
{
    const auto *lastInsNode = pg_->Insns().empty() ? FIRST_NODE_OF_FUNCTION : pg_->Insns().back()->Node();
    return Alloc<Label>(lastInsNode, std::move(id));
}

// FrontAllocator

FrontAllocator::FrontAllocator(PandaGen *pg)
    : AllocatorBase(pg), insn_(std::move(pg_->Insns()), pg_->Allocator()->Adapter())
{
}

FrontAllocator::~FrontAllocator()
{
    pg_->Insns().splice(pg_->Insns().end(), std::move(insn_));
}

// RegAllocatorBase

VReg RegAllocatorBase::Spill(IRNode *ins, VReg reg)
{
    VReg spillReg = pg_->AllocReg();
    VReg origin = spillIndex_++;

    Add<MovDyn>(ins->Node(), spillReg, origin);
    Add<MovDyn>(ins->Node(), origin, reg);

    return origin;
}

void RegAllocatorBase::Restore(IRNode *ins)
{
    spillIndex_--;
    VReg spillReg = spillIndex_;
    VReg origin = regEnd_ + spillIndex_;

    Add<MovDyn>(ins->Node(), origin, spillReg);
}

// RegAllocator

void RegAllocator::Run(IRNode *ins)
{
    ASSERT(spillIndex_ == 0);
    std::array<VReg *, IRNode::MAX_REG_OPERAND> regs {};
    auto regCnt = ins->Registers(&regs);
    auto registers = Span<VReg *>(regs.data(), regs.data() + regCnt);

    if (CheckRegIndices(ins, registers)) {
        PushBack(ins);
        return;
    }

    RegScope regScope(pg_);

    regEnd_ = pg_->NextReg();

    for (auto *reg : registers) {
        if (IsRegisterCorrect(reg)) {
            continue;
        }

        const auto actualReg = *reg;
        *reg = Spill(ins, actualReg);
    }

    PushBack(ins);

    while (spillIndex_ != 0) {
        Restore(ins);
    }
}

// RangeRegAllocator

void RangeRegAllocator::Run(IRNode *ins, VReg rangeStart, size_t argCount)
{
    ASSERT(spillIndex_ == 0);
    const auto rangeEnd = rangeStart + argCount;

    std::array<VReg *, IRNode::MAX_REG_OPERAND> regs {};
    auto regCnt = ins->Registers(&regs);
    auto registers = Span<VReg *>(regs.data(), regs.data() + regCnt);

    if (CheckRegIndices(ins, registers)) {
        PushBack(ins);
        return;
    }

    RegScope regScope(pg_);

    regEnd_ = pg_->NextReg();

    auto *iter = registers.begin();
    auto *iterEnd = iter + registers.size() - 1;

    while (iter != iterEnd) {
        VReg *reg = *iter;

        const auto actualReg = *reg;
        *reg = Spill(ins, actualReg);
        iter++;
    }

    VReg *regStartReg = *iter;
    VReg reg = rangeStart++;
    *regStartReg = Spill(ins, reg);

    while (rangeStart != rangeEnd) {
        reg = rangeStart++;
        Spill(ins, reg);
    }

    PushBack(ins);

    while (spillIndex_ != 0) {
        Restore(ins);
    }
}

}  // namespace panda::es2panda::compiler
