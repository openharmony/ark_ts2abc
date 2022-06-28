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

#include "iterators.h"

#include <compiler/core/pandagen.h>
#include <compiler/base/catchTable.h>
#include <compiler/function/functionBuilder.h>

namespace panda::es2panda::compiler {

// Iterator

Iterator::Iterator(PandaGen *pg, const ir::AstNode *node, IteratorType type)
    : pg_(pg), node_(node), method_(pg->AllocReg()), iterator_(pg->AllocReg()), nextResult_(pg->AllocReg()), type_(type)
{
    if (type_ == IteratorType::ASYNC) {
        pg_->GetAsyncIterator(node);
    } else {
        pg_->GetIterator(node);
    }

    pg_->StoreAccumulator(node, iterator_);
    pg_->LoadObjByName(node_, iterator_, "next");
    pg_->StoreAccumulator(node_, method_);

    pg_->ThrowIfNotObject(node_);
}

void Iterator::GetMethod(util::StringView name) const
{
    pg_->GetMethod(node_, iterator_, name);
    pg_->StoreAccumulator(node_, method_);
}

void Iterator::CallMethodWithValue() const
{
    pg_->CallThis(node_, method_, 2);
}

void Iterator::CallMethod() const
{
    pg_->CallThis(node_, method_, 1);
}

void Iterator::Next() const
{
    CallMethod();

    if (type_ == IteratorType::ASYNC) {
        pg_->FuncBuilder()->Await(node_);
    }

    pg_->ThrowIfNotObject(node_);
    pg_->StoreAccumulator(node_, nextResult_);
}

void Iterator::Complete() const
{
    pg_->LoadObjByName(node_, nextResult_, "done");
    pg_->ToBoolean(node_);
}

void Iterator::Value() const
{
    pg_->LoadObjByName(node_, nextResult_, "value");
}

void Iterator::Close(bool abruptCompletion) const
{
    if (type_ == IteratorType::SYNC) {
        if (!abruptCompletion) {
            pg_->LoadConst(node_, Constant::JS_HOLE);
        }
        pg_->CloseIterator(node_, iterator_);
        return;
    }

    RegScope rs(pg_);
    VReg completion = pg_->AllocReg();
    VReg innerResult = pg_->AllocReg();
    VReg innerResultType = pg_->AllocReg();

    pg_->StoreAccumulator(node_, completion);
    pg_->StoreConst(node_, innerResultType, Constant::JS_HOLE);

    TryContext tryCtx(pg_);
    const auto &labelSet = tryCtx.LabelSet();
    Label *returnExits = pg_->AllocLabel();

    pg_->SetLabel(node_, labelSet.TryBegin());

    // 4. Let innerResult be GetMethod(iterator, "return").
    GetMethod("return");

    // 5. If innerResult.[[Type]] is normal, then
    {
        // b. If return is undefined, return Completion(completion).
        pg_->BranchIfNotUndefined(node_, returnExits);
        // a. Let return be innerResult.[[Value]].
        pg_->LoadAccumulator(node_, completion);

        if (abruptCompletion) {
            pg_->EmitThrow(node_);
        } else {
            pg_->DirectReturn(node_);
        }

        pg_->SetLabel(node_, returnExits);

        {
            TryContext innerTryCtx(pg_);
            const auto &innerLabelSet = innerTryCtx.LabelSet();

            pg_->SetLabel(node_, innerLabelSet.TryBegin());
            // c. Set innerResult to Call(return, iterator).
            CallMethod();
            // d. If innerResult.[[Type]] is normal, set innerResult to Await(innerResult.[[Value]]).
            pg_->FuncBuilder()->Await(node_);
            pg_->StoreAccumulator(node_, innerResult);
            pg_->SetLabel(node_, innerLabelSet.TryEnd());
            pg_->Branch(node_, innerLabelSet.CatchEnd());

            pg_->SetLabel(node_, innerLabelSet.CatchBegin());
            pg_->StoreAccumulator(node_, innerResult);
            pg_->StoreAccumulator(node_, innerResultType);
            pg_->SetLabel(node_, innerLabelSet.CatchEnd());
        }
    }

    pg_->SetLabel(node_, labelSet.TryEnd());
    pg_->Branch(node_, labelSet.CatchEnd());

    pg_->SetLabel(node_, labelSet.CatchBegin());
    pg_->StoreAccumulator(node_, innerResult);
    pg_->StoreAccumulator(node_, innerResultType);
    pg_->SetLabel(node_, labelSet.CatchEnd());

    // 6. If completion.[[Type]] is throw, return Completion(completion).
    if (abruptCompletion) {
        pg_->LoadAccumulator(node_, completion);
        pg_->EmitThrow(node_);
    } else {
        // 7. If innerResult.[[Type]] is throw, return Completion(innerResult).
        pg_->LoadAccumulator(node_, innerResultType);
        pg_->EmitRethrow(node_);
    }

    // 8. If Type(innerResult.[[Value]]) is not Object, throw a TypeError exception.
    pg_->LoadAccumulator(node_, innerResult);
    pg_->ThrowIfNotObject(node_);
}

DestructuringIterator::DestructuringIterator(PandaGen *pg, const ir::AstNode *node)
    : Iterator(pg, node, IteratorType::SYNC), done_(pg->AllocReg()), result_(pg->AllocReg())
{
    pg_->StoreConst(node, done_, Constant::JS_FALSE);
    pg_->StoreConst(node, result_, Constant::JS_UNDEFINED);
}

void DestructuringIterator::Step(Label *doneTarget) const
{
    TryContext tryCtx(pg_);
    const auto &labelSet = tryCtx.LabelSet();
    Label *normalClose = pg_->AllocLabel();
    Label *noClose = pg_->AllocLabel();

    pg_->SetLabel(node_, labelSet.TryBegin());
    Next();
    Complete();
    pg_->StoreAccumulator(node_, done_);
    pg_->BranchIfFalse(node_, normalClose);
    pg_->StoreConst(node_, done_, Constant::JS_TRUE);
    pg_->LoadConst(node_, Constant::JS_UNDEFINED);
    OnIterDone(doneTarget);
    pg_->Branch(node_, noClose);

    pg_->SetLabel(node_, normalClose);
    Value();
    pg_->StoreAccumulator(node_, result_);
    pg_->SetLabel(node_, noClose);

    pg_->SetLabel(node_, labelSet.TryEnd());
    pg_->Branch(node_, labelSet.CatchEnd());

    pg_->SetLabel(node_, labelSet.CatchBegin());
    pg_->StoreAccumulator(node_, result_);
    pg_->StoreConst(node_, done_, Constant::JS_TRUE);
    pg_->LoadAccumulator(node_, result_);
    pg_->EmitThrow(node_);
    pg_->SetLabel(node_, labelSet.CatchEnd());
}

void DestructuringIterator::OnIterDone([[maybe_unused]] Label *doneTarget) const
{
    pg_->LoadConst(node_, Constant::JS_UNDEFINED);
}

void DestructuringRestIterator::OnIterDone([[maybe_unused]] Label *doneTarget) const
{
    pg_->Branch(node_, doneTarget);
}

}  // namespace panda::es2panda::compiler
