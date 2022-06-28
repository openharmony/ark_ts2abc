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

#include "callExpression.h"

#include <util/helpers.h>
#include <compiler/core/pandagen.h>
#include <compiler/core/regScope.h>
#include <typescript/checker.h>
#include <typescript/types/objectType.h>
#include <typescript/types/signature.h>
#include <typescript/types/type.h>
#include <ir/astDump.h>
#include <ir/expressions/memberExpression.h>
#include <ir/ts/tsTypeParameterInstantiation.h>

namespace panda::es2panda::ir {

void CallExpression::Iterate(const NodeTraverser &cb) const
{
    cb(callee_);

    if (typeParams_) {
        cb(typeParams_);
    }

    for (auto *it : arguments_) {
        cb(it);
    }
}

void CallExpression::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "CallExpression"},
                 {"callee", callee_},
                 {"arguments", arguments_},
                 {"optional", optional_},
                 {"typeParameters", AstDumper::Optional(typeParams_)}});
}

compiler::VReg CallExpression::CreateSpreadArguments(compiler::PandaGen *pg) const
{
    compiler::VReg argsObj = pg->AllocReg();
    pg->CreateArray(this, arguments_, argsObj);

    return argsObj;
}

void CallExpression::Compile(compiler::PandaGen *pg) const
{
    compiler::RegScope rs(pg);
    bool containsSpread = util::Helpers::ContainSpreadElement(arguments_);

    if (callee_->IsSuperExpression()) {
        if (containsSpread) {
            compiler::RegScope paramScope(pg);
            compiler::VReg argsObj = CreateSpreadArguments(pg);

            pg->GetFunctionObject(this);
            pg->SuperCallSpread(this, argsObj);
        } else {
            compiler::RegScope paramScope(pg);
            compiler::VReg argStart {};

            if (arguments_.empty()) {
                argStart = pg->AllocReg();
                pg->LoadConst(this, compiler::Constant::JS_UNDEFINED);
                pg->StoreAccumulator(this, argStart);
            } else {
                argStart = pg->NextReg();
            }

            for (const auto *it : arguments_) {
                compiler::VReg arg = pg->AllocReg();
                it->Compile(pg);
                pg->StoreAccumulator(it, arg);
            }

            pg->GetFunctionObject(this);
            pg->SuperCall(this, argStart, arguments_.size());
        }

        compiler::VReg newThis = pg->AllocReg();
        pg->StoreAccumulator(this, newThis);

        pg->GetThis(this);
        pg->ThrowIfSuperNotCorrectCall(this, 1);

        pg->LoadAccumulator(this, newThis);
        pg->SetThis(this);
        return;
    }

    compiler::VReg callee = pg->AllocReg();
    bool hasThis = false;
    compiler::VReg thisReg {};

    if (callee_->IsMemberExpression()) {
        hasThis = true;
        thisReg = pg->AllocReg();

        compiler::RegScope mrs(pg);
        callee_->AsMemberExpression()->Compile(pg, thisReg);
    } else {
        callee_->Compile(pg);
    }

    pg->StoreAccumulator(this, callee);

    if (containsSpread) {
        if (!hasThis) {
            thisReg = pg->AllocReg();
            pg->LoadConst(this, compiler::Constant::JS_UNDEFINED);
            pg->StoreAccumulator(this, thisReg);
        }

        compiler::VReg argsObj = CreateSpreadArguments(pg);
        pg->CallSpread(this, callee, thisReg, argsObj);
        return;
    }

    for (const auto *it : arguments_) {
        it->Compile(pg);
        compiler::VReg arg = pg->AllocReg();
        pg->StoreAccumulator(it, arg);
    }

    if (hasThis) {
        pg->CallThis(this, callee, static_cast<int64_t>(arguments_.size() + 1));
        return;
    }

    pg->Call(this, callee, arguments_.size());
}

using ArgRange = std::pair<uint32_t, uint32_t>;

static ArgRange GetArgRange(const std::vector<checker::Signature *> &signatures,
                            std::vector<checker::Signature *> *potentialSignatures, uint32_t callArgsSize,
                            bool *haveSignatureWithRest)
{
    uint32_t minArg = UINT32_MAX;
    uint32_t maxArg = 0;

    for (auto *it : signatures) {
        if (it->RestVar()) {
            *haveSignatureWithRest = true;
        }

        if (it->MinArgCount() < minArg) {
            minArg = it->MinArgCount();
        }

        if (it->Params().size() > maxArg) {
            maxArg = it->Params().size();
        }

        if (callArgsSize >= it->MinArgCount() && (callArgsSize <= it->Params().size() || it->RestVar())) {
            potentialSignatures->push_back(it);
        }
    }

    return {minArg, maxArg};
}

static bool CallMatchesSignature(checker::Checker *checker, const ArenaVector<ir::Expression *> &args,
                                 checker::Signature *signature, bool throwError)
{
    for (size_t index = 0; index < args.size(); index++) {
        checker::Type *sigArgType = nullptr;
        bool validateRestArg = false;

        if (index >= signature->Params().size()) {
            ASSERT(signature->RestVar());
            validateRestArg = true;
            sigArgType = signature->RestVar()->TsType();
        } else {
            sigArgType = signature->Params()[index]->TsType();
        }

        if (validateRestArg || !throwError ||
            !checker->ElaborateElementwise(args[index], sigArgType, args[index]->Start())) {
            checker::Type *callArgType = checker->GetBaseTypeOfLiteralType(args[index]->Check(checker));
            if (!checker->IsTypeAssignableTo(callArgType, sigArgType)) {
                if (throwError) {
                    checker->ThrowTypeError({"Argument of type '", callArgType,
                                             "' is not assignable to parameter of type '", sigArgType, "'."},
                                            args[index]->Start());
                }

                return false;
            }
        }
    }

    return true;
}

checker::Type *CallExpression::Check(checker::Checker *checker) const
{
    auto *calleeType = callee_->Check(checker);

    // TODO(aszilagyi): handle optional chain
    if (calleeType->IsObjectType()) {
        checker::ObjectType *calleeObj = calleeType->AsObjectType();

        const std::vector<checker::Signature *> &signatures = calleeObj->CallSignatures();

        if (!signatures.empty()) {
            std::vector<checker::Signature *> potentialSignatures;
            bool haveSignatureWithRest = false;

            auto argRange = GetArgRange(signatures, &potentialSignatures, arguments_.size(), &haveSignatureWithRest);

            if (potentialSignatures.empty()) {
                if (haveSignatureWithRest) {
                    checker->ThrowTypeError(
                        {"Expected at least ", argRange.first, " arguments, but got ", arguments_.size(), "."},
                        Start());
                }

                if (signatures.size() == 1 && argRange.first == argRange.second) {
                    lexer::SourcePosition loc =
                        (argRange.first > arguments_.size()) ? Start() : arguments_[argRange.second]->Start();
                    checker->ThrowTypeError(
                        {"Expected ", argRange.first, " arguments, but got ", arguments_.size(), "."}, loc);
                }

                checker->ThrowTypeError(
                    {"Expected ", argRange.first, "-", argRange.second, " arguments, but got ", arguments_.size()},
                    Start());
            }

            checker::Type *returnType = nullptr;
            for (auto *it : potentialSignatures) {
                if (CallMatchesSignature(checker, arguments_, it, potentialSignatures.size() == 1)) {
                    returnType = it->ReturnType();
                    break;
                }
            }

            if (!returnType) {
                checker->ThrowTypeError("No overload matches this call.", Start());
            }

            return returnType;
        }
    }

    checker->ThrowTypeError("This expression is not callable.", Start());
    return checker->GlobalAnyType();
}

}  // namespace panda::es2panda::ir
