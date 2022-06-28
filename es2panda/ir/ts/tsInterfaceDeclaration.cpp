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

#include "tsInterfaceDeclaration.h"

#include <binder/declaration.h>
#include <binder/scope.h>
#include <binder/variable.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/expressions/identifier.h>
#include <ir/ts/tsInterfaceBody.h>
#include <ir/ts/tsInterfaceHeritage.h>
#include <ir/ts/tsTypeParameter.h>
#include <ir/ts/tsTypeParameterDeclaration.h>

namespace panda::es2panda::ir {

void TSInterfaceDeclaration::Iterate(const NodeTraverser &cb) const
{
    cb(id_);

    if (typeParams_) {
        cb(typeParams_);
    }

    cb(body_);

    for (auto *it : extends_) {
        cb(it);
    }
}

void TSInterfaceDeclaration::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "TSInterfaceDeclaration"},
                 {"body", body_},
                 {"id", id_},
                 {"extends", extends_},
                 {"typeParameters", AstDumper::Optional(typeParams_)}});
}

void TSInterfaceDeclaration::Compile([[maybe_unused]] compiler::PandaGen *pg) const {}

void CheckInheritedPropertiesAreIdentical(checker::Checker *checker, checker::InterfaceType *type,
                                          lexer::SourcePosition locInfo)
{
    if (type->Bases().size() < 2) {
        return;
    }

    checker::InterfacePropertyMap properties;

    for (auto *it : type->Properties()) {
        properties.insert({it->Name(), {it, type}});
    }

    for (auto *base : type->Bases()) {
        std::vector<binder::LocalVariable *> inheritedProperties;
        base->AsInterfaceType()->CollectProperties(&inheritedProperties);

        for (auto *inheritedProp : inheritedProperties) {
            auto res = properties.find(inheritedProp->Name());
            if (res == properties.end()) {
                properties.insert({inheritedProp->Name(), {inheritedProp, base->AsInterfaceType()}});
            } else if (res->second.second != type) {
                checker->IsTypeIdenticalTo(inheritedProp->TsType(), res->second.first->TsType(),
                                           {"Interface '", type, "' cannot simultaneously extend types '",
                                            res->second.second, "' and '", base->AsInterfaceType(), "'."},
                                           locInfo);
            }
        }
    }
}

checker::Type *TSInterfaceDeclaration::InferType(checker::Checker *checker, binder::Variable *bindingVar) const
{
    auto *decl = bindingVar->Declaration();
    checker::ObjectDescriptor *desc = checker->Allocator()->New<checker::ObjectDescriptor>();
    std::set<const ir::TSInterfaceHeritage *> extendsSet;
    const auto &declarations = decl->AsInterfaceDecl()->Decls();
    ASSERT(!declarations.empty());

    checker::InterfaceType *newInterface = checker->Allocator()->New<checker::InterfaceType>(decl->Name(), desc);
    newInterface->SetVariable(bindingVar);
    bindingVar->SetTsType(newInterface);

    std::pair<std::vector<binder::Variable *>, size_t> mergedTypeParams =
        checker->CollectTypeParametersFromDeclarations(declarations);

    newInterface->SetMergedTypeParams(std::move(mergedTypeParams));

    for (const auto *it : declarations) {
        const ir::TSInterfaceDeclaration *currentDecl = it->AsTSInterfaceDeclaration();

        checker::ScopeContext scopeCtx(checker, currentDecl->Scope());

        bool throwTypeParameterMismatchError = false;

        if (currentDecl->TypeParams()) {
            std::vector<binder::Variable *> typeParams = checker->CheckTypeParameters(currentDecl->TypeParams());

            throwTypeParameterMismatchError =
                checker->CheckTypeParametersAreIdentical(newInterface->GetMergedTypeParams(), typeParams);
        } else if (!newInterface->GetMergedTypeParams().first.empty() &&
                   newInterface->GetMergedTypeParams().second != 0) {
            throwTypeParameterMismatchError = true;
        }

        if (throwTypeParameterMismatchError) {
            checker->ThrowTypeError(
                {"All declarations of '", newInterface->Name(), "' must have identical type parameters."},
                currentDecl->Id()->Start());
        }

        for (const auto *iter : currentDecl->Body()->AsTSInterfaceBody()->Body()) {
            if (iter->IsTSPropertySignature() || iter->IsTSMethodSignature()) {
                checker->PrefetchTypeLiteralProperties(iter, desc);
            }
        }

        for (auto *member : currentDecl->Body()->AsTSInterfaceBody()->Body()) {
            checker->CheckTsTypeLiteralOrInterfaceMember(member, desc);
        }

        for (const auto *extends : currentDecl->Extends()) {
            // TODO(Csaba Repasi): Handle TSQualifiedName here

            binder::Variable *extendsVar = extends->Expr()->AsIdentifier()->Variable();

            if (!extendsVar) {
                checker->ThrowTypeError({"Cannot find name ", extendsVar->Name()}, extends->Start());
            }

            if (!extendsVar->HasFlag(binder::VariableFlags::INTERFACE)) {
                checker->ThrowTypeError(
                    "An interface can only extend an object type or intersection of object types with statically "
                    "known "
                    "members",
                    extends->Start());
            }

            extendsSet.insert(extends);
        }
    }

    for (const auto *base : extendsSet) {
        // TODO(Csaba Repasi): Handle TSQualifiedName here
        binder::Variable *extendsVar = base->Expr()->AsIdentifier()->Variable();

        if (!checker->TypeStack().insert(extendsVar->Declaration()->Node()).second) {
            checker->ThrowTypeError({"Type '", newInterface->Name(), "' recursively references itself as a base type"},
                                    decl->AsInterfaceDecl()->Node()->AsTSInterfaceDeclaration()->Id()->Start());
        }

        checker::ObjectType *resolvedBaseType = InferType(checker, extendsVar)->AsObjectType();

        if (extendsVar->HasFlag(binder::VariableFlags::INTERFACE)) {
            for (const auto *it : extendsVar->Declaration()->AsInterfaceDecl()->Decls()) {
                if (!it->TypeParams()) {
                    continue;
                }

                resolvedBaseType = checker
                                       ->InstantiateGenericInterface(extendsVar, extendsVar->Declaration(),
                                                                     base->TypeParams(), base->Start())
                                       ->AsObjectType();
                break;
            }
        }

        newInterface->AddBase(resolvedBaseType);

        checker->TypeStack().erase(extendsVar->Declaration()->Node());
    }

    CheckInheritedPropertiesAreIdentical(checker, newInterface, declarations[0]->Id()->Start());

    for (auto *it : newInterface->Bases()) {
        checker->IsTypeAssignableTo(
            newInterface, it,
            {"Interface '", newInterface, "' incorrectly extends interface '", it->AsInterfaceType(), "'"},
            declarations[0]->Start());
    }

    checker->CheckIndexConstraints(newInterface);

    return newInterface;
}

checker::Type *TSInterfaceDeclaration::Check([[maybe_unused]] checker::Checker *checker) const
{
    if (!id_->Variable()->TsType()) {
        InferType(checker, id_->Variable());
    }

    return nullptr;
}

}  // namespace panda::es2panda::ir
