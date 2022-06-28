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

#ifndef ES2PANDA_COMPILER_CORE_REG_ALLOCATOR_H
#define ES2PANDA_COMPILER_CORE_REG_ALLOCATOR_H

#include <gen/isa.h>
#include <macros.h>

namespace panda::es2panda::ir {
class AstNode;
}  // namespace panda::es2panda::ir

namespace panda::es2panda::compiler {

class PandaGen;

class AllocatorBase {
public:
    explicit AllocatorBase(PandaGen *pg) : pg_(pg) {};
    NO_COPY_SEMANTIC(AllocatorBase);
    NO_MOVE_SEMANTIC(AllocatorBase);
    ~AllocatorBase() = default;

protected:
    void PushBack(IRNode *ins);
    ArenaAllocator *Allocator() const;

    template <typename T, typename... Args>
    T *Alloc(const ir::AstNode *node, Args &&... args)
    {
        return Allocator()->New<T>(node, std::forward<Args>(args)...);
    }

    template <typename T, typename... Args>
    void Add(const ir::AstNode *node, Args &&... args)
    {
        return PushBack(Alloc<T>(node, std::forward<Args>(args)...));
    }

    PandaGen *pg_;
};

class SimpleAllocator : public AllocatorBase {
public:
    explicit SimpleAllocator(PandaGen *pg) : AllocatorBase(pg) {};
    NO_COPY_SEMANTIC(SimpleAllocator);
    NO_MOVE_SEMANTIC(SimpleAllocator);
    ~SimpleAllocator() = default;

    Label *AllocLabel(std::string &&id);
    void AddLabel(Label *label)
    {
        PushBack(label);
    }

    template <typename T, typename... Args>
    void Emit(const ir::AstNode *node, Args &&... args)
    {
        Add<T>(node, std::forward<Args>(args)...);
    }
};

class FrontAllocator : public AllocatorBase {
public:
    explicit FrontAllocator(PandaGen *pg);
    NO_COPY_SEMANTIC(FrontAllocator);
    NO_MOVE_SEMANTIC(FrontAllocator);
    ~FrontAllocator();

private:
    ArenaList<IRNode *> insn_;
};

class RegAllocatorBase : public AllocatorBase {
public:
    explicit RegAllocatorBase(PandaGen *pg) : AllocatorBase(pg) {}
    NO_COPY_SEMANTIC(RegAllocatorBase);
    NO_MOVE_SEMANTIC(RegAllocatorBase);
    ~RegAllocatorBase() = default;

protected:
    inline bool CheckRegIndices(IRNode *ins, const Span<VReg *> &registers)
    {
        Formats formats = ins->GetFormats();
        limit_ = 0;

        for (const auto &format : formats) {
            for (const auto &formatItem : format.GetFormatItem()) {
                if (formatItem.IsVReg()) {
                    limit_ = 1 << formatItem.Bitwidth();
                    break;
                }
            }

            if (std::all_of(registers.begin(), registers.end(),
                            [this](const VReg *reg) { return IsRegisterCorrect(reg); })) {
                return true;
            }
        }
        return false;
    }

    inline bool IsRegisterCorrect(const VReg *reg) const
    {
        return *reg < limit_;
    }

    VReg Spill(IRNode *ins, VReg reg);
    void Restore(IRNode *ins);

    VReg spillIndex_ {0};
    VReg regEnd_ {0};
    size_t limit_ {0};
};

class RegAllocator : public RegAllocatorBase {
public:
    explicit RegAllocator(PandaGen *pg) : RegAllocatorBase(pg) {}
    NO_COPY_SEMANTIC(RegAllocator);
    NO_MOVE_SEMANTIC(RegAllocator);
    ~RegAllocator() = default;

    template <typename T, typename... Args>
    void Emit(const ir::AstNode *node, Args &&... args)
    {
        auto *ins = Alloc<T>(node, std::forward<Args>(args)...);
        Run(ins);
    }

private:
    void Run(IRNode *ins);
};

class RangeRegAllocator : public RegAllocatorBase {
public:
    explicit RangeRegAllocator(PandaGen *pg) : RegAllocatorBase(pg) {}
    NO_COPY_SEMANTIC(RangeRegAllocator);
    NO_MOVE_SEMANTIC(RangeRegAllocator);
    ~RangeRegAllocator() = default;

    template <typename T, typename... Args>
    void Emit(const ir::AstNode *node, VReg rangeStart, size_t argCount, Args &&... args)
    {
        auto *ins = Alloc<T>(node, std::forward<Args>(args)...);
        Run(ins, rangeStart, argCount);
    }

private:
    void Run(IRNode *ins, VReg rangeStart, size_t argCount);
};
}  // namespace panda::es2panda::compiler

#endif
