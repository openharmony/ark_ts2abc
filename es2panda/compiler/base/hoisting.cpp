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

#include "hoisting.h"

#include <ir/base/scriptFunction.h>
#include <binder/scope.h>
#include <compiler/core/pandagen.h>

namespace panda::es2panda::compiler {

static void HoistVar(PandaGen *pg, binder::Variable *var, const binder::VarDecl *decl)
{
    auto *scope = pg->Scope();

    if (scope->IsGlobalScope()) {
        pg->LoadConst(decl->Node(), Constant::JS_UNDEFINED);
        pg->StoreGlobalVar(decl->Node(), decl->Name());
        return;
    }

    binder::ScopeFindResult result(decl->Name(), scope, 0, var);

    pg->LoadConst(decl->Node(), Constant::JS_UNDEFINED);
    pg->StoreAccToLexEnv(decl->Node(), result, true);
}

static void HoistFunction(PandaGen *pg, binder::Variable *var, const binder::FunctionDecl *decl)
{
    const ir::ScriptFunction *scriptFunction = decl->Node()->AsScriptFunction();
    auto *scope = pg->Scope();

    const auto &internalName = scriptFunction->Scope()->InternalName();

    if (scope->IsGlobalScope()) {
        pg->DefineFunction(decl->Node(), scriptFunction, internalName);
        pg->StoreGlobalVar(decl->Node(), var->Declaration()->Name());
        return;
    }

    ASSERT(scope->IsFunctionScope() || scope->IsCatchScope() || scope->IsLocalScope() || scope->IsModuleScope());
    binder::ScopeFindResult result(decl->Name(), scope, 0, var);

    pg->DefineFunction(decl->Node(), scriptFunction, internalName);
    pg->StoreAccToLexEnv(decl->Node(), result, true);
}

void Hoisting::Hoist(PandaGen *pg)
{
    const auto *scope = pg->Scope();

    for (const auto &[_, var] : scope->Bindings()) {
        (void)_;
        if (!var->HasFlag(binder::VariableFlags::HOIST)) {
            continue;
        }

        const auto *decl = var->Declaration();

        if (decl->IsVarDecl()) {
            HoistVar(pg, var, decl->AsVarDecl());
        } else {
            ASSERT(decl->IsFunctionDecl());
            HoistFunction(pg, var, decl->AsFunctionDecl());
        }
    }
}

}  // namespace panda::es2panda::compiler
