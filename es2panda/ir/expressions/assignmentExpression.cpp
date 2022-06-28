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

#include "assignmentExpression.h"

#include <compiler/base/lreference.h>
#include <compiler/core/pandagen.h>
#include <compiler/core/regScope.h>
#include <typescript/checker.h>
#include <ir/astDump.h>
#include <ir/base/spreadElement.h>
#include <ir/expressions/arrayExpression.h>
#include <ir/expressions/objectExpression.h>

namespace panda::es2panda::ir {

bool AssignmentExpression::ConvertibleToAssignmentPattern(bool mustBePattern)
{
    bool convResult = true;

    switch (left_->Type()) {
        case AstNodeType::ARRAY_EXPRESSION: {
            convResult = left_->AsArrayExpression()->ConvertibleToArrayPattern();
            break;
        }
        case AstNodeType::SPREAD_ELEMENT: {
            convResult = mustBePattern && left_->AsSpreadElement()->ConvertibleToRest(false);
            break;
        }
        case AstNodeType::OBJECT_EXPRESSION: {
            convResult = left_->AsObjectExpression()->ConvertibleToObjectPattern();
            break;
        }
        case AstNodeType::ASSIGNMENT_EXPRESSION: {
            convResult = left_->AsAssignmentExpression()->ConvertibleToAssignmentPattern(mustBePattern);
            break;
        }
        case AstNodeType::META_PROPERTY_EXPRESSION:
        case AstNodeType::CHAIN_EXPRESSION: {
            convResult = false;
            break;
        }
        default: {
            break;
        }
    }

    if (mustBePattern) {
        SetType(AstNodeType::ASSIGNMENT_PATTERN);
    }

    if (!right_->IsAssignmentExpression()) {
        return convResult;
    }

    switch (right_->Type()) {
        case AstNodeType::ARRAY_EXPRESSION: {
            convResult = right_->AsArrayExpression()->ConvertibleToArrayPattern();
            break;
        }
        case AstNodeType::CHAIN_EXPRESSION:
        case AstNodeType::SPREAD_ELEMENT: {
            convResult = false;
            break;
        }
        case AstNodeType::OBJECT_EXPRESSION: {
            convResult = right_->AsObjectExpression()->ConvertibleToObjectPattern();
            break;
        }
        case AstNodeType::ASSIGNMENT_EXPRESSION: {
            convResult = right_->AsAssignmentExpression()->ConvertibleToAssignmentPattern(false);
            break;
        }
        default: {
            break;
        }
    }

    return convResult;
}

void AssignmentExpression::Iterate(const NodeTraverser &cb) const
{
    cb(left_);
    cb(right_);
}

void AssignmentExpression::Dump(ir::AstDumper *dumper) const
{
    if (type_ == AstNodeType::ASSIGNMENT_EXPRESSION) {
        dumper->Add({{"type", "AssignmentExpression"}, {"operator", operator_}, {"left", left_}, {"right", right_}});
    } else {
        dumper->Add({{"type", "AssignmentPattern"}, {"left", left_}, {"right", right_}});
    }
}

void AssignmentExpression::Compile(compiler::PandaGen *pg) const
{
    compiler::RegScope rs(pg);
    compiler::LReference lref = compiler::LReference::CreateLRef(pg, left_, false);

    if (operator_ == lexer::TokenType::PUNCTUATOR_LOGICAL_AND_EQUAL ||
        operator_ == lexer::TokenType::PUNCTUATOR_LOGICAL_OR_EQUAL) {
        pg->Unimplemented();
    } else if (operator_ != lexer::TokenType::PUNCTUATOR_SUBSTITUTION) {
        compiler::VReg lhsReg = pg->AllocReg();

        lref.GetValue();
        pg->StoreAccumulator(left_, lhsReg);
        right_->Compile(pg);
        pg->Binary(this, operator_, lhsReg);
    } else {
        right_->Compile(pg);
    }

    lref.SetValue();
}

void AssignmentExpression::CompilePattern(compiler::PandaGen *pg) const
{
    compiler::RegScope rs(pg);
    compiler::LReference lref = compiler::LReference::CreateLRef(pg, left_, false);
    right_->Compile(pg);
    lref.SetValue();
}

checker::Type *AssignmentExpression::Check(checker::Checker *checker) const
{
    if (left_->IsArrayPattern()) {
        auto *leftType = left_->AsArrayPattern()->Check(checker);
        auto *rightType = checker->CreateInitializerTypeForPattern(leftType, right_);
        checker->HandleVariableDeclarationWithContext(left_, rightType, checker::VariableBindingContext::REGULAR,
                                                      checker::DestructuringType::ARRAY_DESTRUCTURING, false, true);

        return rightType;
    }

    if (left_->IsObjectPattern()) {
        auto *leftType = left_->AsObjectPattern()->Check(checker);
        auto *rightType = checker->CreateInitializerTypeForPattern(leftType, right_);
        checker->HandleVariableDeclarationWithContext(left_, rightType, checker::VariableBindingContext::REGULAR,
                                                      checker::DestructuringType::OBJECT_DESTRUCTURING, false, true);

        return rightType;
    }

    auto *leftType = left_->Check(checker);

    if (operator_ == lexer::TokenType::PUNCTUATOR_SUBSTITUTION &&
        checker->ElaborateElementwise(right_, leftType, left_->Start())) {
        return right_->Check(checker);
    }

    auto *rightType = right_->Check(checker);

    switch (operator_) {
        case lexer::TokenType::PUNCTUATOR_MULTIPLY_EQUAL:
        case lexer::TokenType::PUNCTUATOR_EXPONENTIATION_EQUAL:
        case lexer::TokenType::PUNCTUATOR_DIVIDE_EQUAL:
        case lexer::TokenType::PUNCTUATOR_MOD_EQUAL:
        case lexer::TokenType::PUNCTUATOR_MINUS_EQUAL:
        case lexer::TokenType::PUNCTUATOR_LEFT_SHIFT_EQUAL:
        case lexer::TokenType::PUNCTUATOR_RIGHT_SHIFT_EQUAL:
        case lexer::TokenType::PUNCTUATOR_UNSIGNED_RIGHT_SHIFT_EQUAL:
        case lexer::TokenType::PUNCTUATOR_BITWISE_AND_EQUAL:
        case lexer::TokenType::PUNCTUATOR_BITWISE_XOR_EQUAL:
        case lexer::TokenType::PUNCTUATOR_BITWISE_OR_EQUAL: {
            return checker->CheckBinaryOperator(leftType, rightType, left_, right_, this, operator_);
        }
        case lexer::TokenType::PUNCTUATOR_PLUS_EQUAL: {
            return checker->CheckPlusOperator(leftType, rightType, left_, right_, this, operator_);
        }
        case lexer::TokenType::PUNCTUATOR_LESS_THAN_EQUAL:
        case lexer::TokenType::PUNCTUATOR_GREATER_THAN_EQUAL: {
            return checker->CheckCompareOperator(leftType, rightType, left_, right_, this, operator_);
        }
        case lexer::TokenType::PUNCTUATOR_SUBSTITUTION: {
            checker->CheckAssignmentOperator(operator_, left_, leftType, rightType);
            return rightType;
        }
        default: {
            UNREACHABLE();
            break;
        }
    }

    return nullptr;
}

}  // namespace panda::es2panda::ir
