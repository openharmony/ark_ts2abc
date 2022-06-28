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

#include "moduleContext.h"

#include <binder/scope.h>
#include <binder/variable.h>
#include <compiler/base/lreference.h>
#include <compiler/core/pandagen.h>
#include <ir/expressions/literals/stringLiteral.h>
#include <ir/module/exportAllDeclaration.h>
#include <ir/module/exportNamedDeclaration.h>
#include <ir/module/importDeclaration.h>

namespace panda::es2panda::compiler {
void CompileImports(PandaGen *pg, binder::ModuleScope *scope)
{
    for (const auto &[importDecl, decls] : scope->Imports()) {
        pg->ImportModule(importDecl, importDecl->Source()->Str());

        VReg moduleReg = pg->AllocReg();
        pg->StoreAccumulator(importDecl, moduleReg);

        for (const auto *decl : decls) {
            binder::Variable *v = scope->FindLocal(decl->LocalName());

            if (!v->IsModuleVariable()) {
                ASSERT(decl->ImportName() == "*");

                binder::ScopeFindResult result(decl->LocalName(), scope, 0, v);
                pg->StoreAccToLexEnv(decl->Node(), result, true);
            } else {
                v->AsModuleVariable()->ModuleReg() = moduleReg;
            }
        }
    }
}

void CompileExports(PandaGen *pg, const binder::ModuleScope *scope)
{
    for (const auto &[exportDecl, decls] : scope->Exports()) {
        if (exportDecl->IsExportAllDeclaration()) {
            pg->ImportModule(exportDecl, exportDecl->AsExportAllDeclaration()->Source()->Str());
        } else if (exportDecl->IsExportNamedDeclaration() && exportDecl->AsExportNamedDeclaration()->Source()) {
            pg->ImportModule(exportDecl, exportDecl->AsExportNamedDeclaration()->Source()->Str());
        } else {
            continue;
        }

        VReg moduleReg = pg->AllocReg();
        pg->StoreAccumulator(exportDecl, moduleReg);

        if (exportDecl->IsExportAllDeclaration()) {
            pg->StoreModuleVar(exportDecl, decls.front()->ExportName());
            continue;
        }

        pg->CopyModule(exportDecl, moduleReg);

        for (const auto *decl : decls) {
            pg->LoadObjByName(decl->Node(), moduleReg, decl->LocalName());
            pg->StoreModuleVar(decl->Node(), decl->ExportName());
        }
    }
}

void ModuleContext::Compile(PandaGen *pg, binder::ModuleScope *scope)
{
    CompileImports(pg, scope);
    CompileExports(pg, scope);
}
}  // namespace panda::es2panda::compiler
