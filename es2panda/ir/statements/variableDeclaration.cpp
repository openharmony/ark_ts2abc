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

#include "variableDeclaration.h"

#include <binder/scope.h>
#include <binder/variable.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/expressions/arrayExpression.h>
#include <ir/expressions/identifier.h>
#include <ir/expressions/objectExpression.h>
#include <ir/statements/variableDeclarator.h>

namespace panda::es2panda::ir {

void VariableDeclaration::Iterate(const NodeTraverser &cb) const
{
    for (auto *it : declarators_) {
        cb(it);
    }
}

void VariableDeclaration::Dump(ir::AstDumper *dumper) const
{
    const char *kind = nullptr;

    switch (kind_) {
        case VariableDeclarationKind::CONST: {
            kind = "const";
            break;
        }
        case VariableDeclarationKind::LET: {
            kind = "let";
            break;
        }
        case VariableDeclarationKind::VAR: {
            kind = "var";
            break;
        }
        default: {
            UNREACHABLE();
        }
    }

    dumper->Add({{"type", "VariableDeclaration"},
                 {"declarations", declarators_},
                 {"kind", kind},
                 {"declare", AstDumper::Optional(declare_)}});
}

void VariableDeclaration::Compile(compiler::PandaGen *pg) const
{
    for (const auto *it : declarators_) {
        it->Compile(pg);
    }
}

using TypeAnnotationDestructuringType =
    std::tuple<binder::Variable *, const ir::Expression *, checker::DestructuringType>;

static TypeAnnotationDestructuringType GetTypeAnnotationNodeAndDestructuringType(checker::Checker *checker,
                                                                                 const ir::VariableDeclarator *decl)
{
    if (decl->Id()->IsArrayPattern()) {
        if (!decl->Init()) {
            checker->ThrowTypeError("A destructuring declaration must have an initializer", decl->Id()->Start());
        }

        return {nullptr, decl->Id()->AsArrayPattern()->TypeAnnotation(),
                checker::DestructuringType::ARRAY_DESTRUCTURING};
    }

    if (decl->Id()->IsObjectPattern()) {
        if (!decl->Init()) {
            checker->ThrowTypeError("A destructuring declaration must have an initializer", decl->Id()->Start());
        }

        return {nullptr, decl->Id()->AsObjectPattern()->TypeAnnotation(),
                checker::DestructuringType::OBJECT_DESTRUCTURING};
    }

    ASSERT(decl->Id()->IsIdentifier());
    binder::ScopeFindResult result = checker->Scope()->Find(decl->Id()->AsIdentifier()->Name());
    ASSERT(result.variable);
    return {result.variable, decl->Id()->AsIdentifier()->TypeAnnotation(),
            checker::DestructuringType::NO_DESTRUCTURING};
}

checker::Type *VariableDeclaration::Check(checker::Checker *checker) const
{
    for (auto *it : declarators_) {
        auto [bindingVar, typeAnnotation, destucturingType] = GetTypeAnnotationNodeAndDestructuringType(checker, it);

        // TODO(aszilagyi): binding_var
        (void)bindingVar;
        checker::Type *annotationType = typeAnnotation ? checker->CheckTypeCached(typeAnnotation) : nullptr;

        checker::Type *initType = it->Init() ? checker->CheckTypeCached(it->Init()) : nullptr;

        checker::Type *patternType =
            destucturingType != checker::DestructuringType::NO_DESTRUCTURING ? it->Id()->Check(checker) : nullptr;

        if (initType && kind_ != ir::VariableDeclaration::VariableDeclarationKind::CONST) {
            initType = checker->GetBaseTypeOfLiteralType(initType);
        }

        checker->ValidateTypeAnnotationAndInitType(it->Init(), &initType, annotationType, patternType,
                                                   it->Id()->Start());

        /* TODO(aszilagyi) */
        auto context = checker::VariableBindingContext::REGULAR;
        checker->HandleVariableDeclarationWithContext(it->Id(), annotationType ? annotationType : initType, context,
                                                      destucturingType, annotationType);
    }
    return nullptr;
}

}  // namespace panda::es2panda::ir
