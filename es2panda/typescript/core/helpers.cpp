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

#include <ir/expressions/assignmentExpression.h>
#include <ir/expressions/binaryExpression.h>
#include <ir/expressions/memberExpression.h>
#include <ir/expressions/identifier.h>
#include <ir/ts/tsQualifiedName.h>
#include <ir/ts/tsTypeParameterDeclaration.h>
#include <ir/ts/tsTypeParameter.h>
#include <binder/variable.h>
#include <binder/scope.h>

#include <typescript/checker.h>

namespace panda::es2panda::checker {

const ir::TSQualifiedName *Checker::ResolveLeftMostQualifiedName(const ir::TSQualifiedName *qualifiedName)
{
    const ir::TSQualifiedName *iter = qualifiedName;

    while (iter->Left()->IsTSQualifiedName()) {
        iter = iter->Left()->AsTSQualifiedName();
    }

    return iter;
}

const ir::MemberExpression *Checker::ResolveLeftMostMemberExpression(const ir::MemberExpression *expr)
{
    const ir::MemberExpression *iter = expr;

    while (iter->Object()->IsMemberExpression()) {
        iter = iter->Object()->AsMemberExpression();
    }

    return iter;
}

void Checker::CheckReferenceExpression(const ir::Expression *expr, const char *invalidReferenceMsg,
                                       const char *invalidOptionalChainMsg)
{
    if (expr->IsIdentifier()) {
        const util::StringView &name = expr->AsIdentifier()->Name();
        binder::ScopeFindResult result = scope_->Find(name);
        ASSERT(result.variable);

        if (result.variable->HasFlag(binder::VariableFlags::ENUM_LITERAL)) {
            ThrowTypeError({"Cannot assign to '", name, "' because it is not a variable."}, expr->Start());
        }
    } else if (!expr->IsMemberExpression()) {
        if (expr->IsChainExpression()) {
            ThrowTypeError(invalidOptionalChainMsg, expr->Start());
        }

        ThrowTypeError(invalidReferenceMsg, expr->Start());
    }
}

void Checker::CheckTestingKnownTruthyCallableOrAwaitableType(const ir::Expression *condExpr, Type *type,
                                                             const ir::AstNode *body)
{
    if (GetFalsyFlags(type) != TypeFlag::NONE) {
        return;
    }

    const ir::AstNode *location = condExpr;
    if (condExpr->IsBinaryExpression()) {
        location = condExpr->AsBinaryExpression()->Right();
    } else if (condExpr->IsAssignmentExpression()) {
        location = condExpr->AsAssignmentExpression()->Right();
    }

    binder::Variable *testVar = nullptr;
    binder::ScopeFindResult result {};

    if (location->IsIdentifier()) {
        result = scope_->Find(location->AsIdentifier()->Name(), binder::ResolveBindingOptions::ALL);
        ASSERT(result.variable);
        testVar = result.variable;
    } else if (location->IsBinaryExpression() && location->AsBinaryExpression()->Right()->IsIdentifier()) {
        result = scope_->Find(location->AsBinaryExpression()->Right()->AsIdentifier()->Name(),
                              binder::ResolveBindingOptions::ALL);
        ASSERT(result.variable);
        testVar = result.variable;
    } else if (location->IsAssignmentExpression() && location->AsAssignmentExpression()->Right()->IsIdentifier()) {
        result = scope_->Find(location->AsAssignmentExpression()->Right()->AsIdentifier()->Name(),
                              binder::ResolveBindingOptions::ALL);
        ASSERT(result.variable);
        testVar = result.variable;
    } else if (location->IsMemberExpression() && !location->AsMemberExpression()->IsComputed()) {
        testVar = ResolveNonComputedObjectProperty(location->AsMemberExpression());
    }

    if (!testVar) {
        return;
    }

    if (testVar->TsType() && testVar->TsType()->IsObjectType() &&
        !testVar->TsType()->AsObjectType()->CallSignatures().empty()) {
        if (condExpr->Parent()->IsBinaryExpression() &&
            IsVariableUsedInBinaryExpressionChain(condExpr->Parent(), testVar) &&
            IsVariableUsedInConditionBody(body, testVar)) {
            ThrowTypeError(
                "This condition will always return true since this function appears to always be defined. "
                "Did "
                "you mean to call it insted?",
                location->Start());
        }
    }
}

Type *Checker::ExtractDefinitelyFalsyTypes(Type *type)
{
    if (type->IsStringType()) {
        return GlobalEmptyStringType();
    }

    if (type->IsNumberType()) {
        return GlobalZeroType();
    }

    if (type->IsBigintType()) {
        return GlobalZeroBigintType();
    }

    if (type == GlobalFalseType() || type->HasTypeFlag(TypeFlag::NULLABLE) ||
        type->HasTypeFlag(TypeFlag::ANY_OR_UNKNOWN) || type->HasTypeFlag(TypeFlag::VOID) ||
        (type->IsStringLiteralType() && IsTypeIdenticalTo(type, GlobalEmptyStringType())) ||
        (type->IsNumberLiteralType() && IsTypeIdenticalTo(type, GlobalZeroType())) ||
        (type->IsBigintLiteralType() && IsTypeIdenticalTo(type, GlobalZeroBigintType()))) {
        return type;
    }

    if (type->IsUnionType()) {
        std::vector<Type *> &constituentTypes = type->AsUnionType()->ConstituentTypes();
        std::vector<Type *> newConstituentTypes;

        newConstituentTypes.reserve(constituentTypes.size());
        for (auto &it : constituentTypes) {
            newConstituentTypes.push_back(ExtractDefinitelyFalsyTypes(it));
        }

        return CreateUnionType(std::move(newConstituentTypes));
    }

    return GlobalNeverType();
}

Type *Checker::RemoveDefinitelyFalsyTypes(Type *type)
{
    if (static_cast<uint64_t>(GetFalsyFlags(type)) & static_cast<uint64_t>(TypeFlag::DEFINITELY_FALSY)) {
        if (type->IsUnionType()) {
            std::vector<Type *> &constituentTypes = type->AsUnionType()->ConstituentTypes();
            std::vector<Type *> newConstituentTypes;

            for (auto &it : constituentTypes) {
                if (!(static_cast<uint64_t>(GetFalsyFlags(it)) & static_cast<uint64_t>(TypeFlag::DEFINITELY_FALSY))) {
                    newConstituentTypes.push_back(it);
                }
            }

            if (newConstituentTypes.empty()) {
                return GlobalNeverType();
            }

            if (newConstituentTypes.size() == 1) {
                return newConstituentTypes[0];
            }

            return CreateUnionType(std::move(newConstituentTypes));
        }

        return GlobalNeverType();
    }

    return type;
}

TypeFlag Checker::GetFalsyFlags(Type *type)
{
    if (type->IsStringLiteralType()) {
        return type->AsStringLiteralType()->Value().Empty() ? TypeFlag::STRING_LITERAL : TypeFlag::NONE;
    }

    if (type->IsNumberLiteralType()) {
        return type->AsNumberLiteralType()->Value() == 0 ? TypeFlag::NUMBER_LITERAL : TypeFlag::NONE;
    }

    if (type->IsBigintLiteralType()) {
        return type->AsBigintLiteralType()->Value() == "0n" ? TypeFlag::BIGINT_LITERAL : TypeFlag::NONE;
    }

    if (type->IsBooleanLiteralType()) {
        return type->AsBooleanLiteralType()->Value() ? TypeFlag::NONE : TypeFlag::BOOLEAN_LITERAL;
    }

    if (type->IsUnionType()) {
        std::vector<Type *> &constituentTypes = type->AsUnionType()->ConstituentTypes();
        TypeFlag returnFlag = TypeFlag::NONE;

        for (auto &it : constituentTypes) {
            returnFlag |= GetFalsyFlags(it);
        }

        return returnFlag;
    }

    return static_cast<TypeFlag>(type->TypeFlags() & TypeFlag::POSSIBLY_FALSY);
}

bool Checker::IsVariableUsedInConditionBody(const ir::AstNode *parent, binder::Variable *searchVar)
{
    bool found = false;

    parent->Iterate([this, searchVar, &found](const ir::AstNode *childNode) -> void {
        binder::Variable *resultVar = nullptr;
        if (childNode->IsMemberExpression()) {
            resultVar = ResolveNonComputedObjectProperty(childNode->AsMemberExpression());
        } else if (childNode->IsIdentifier()) {
            binder::ScopeFindResult result = scope_->Find(childNode->AsIdentifier()->Name());
            ASSERT(result.variable);
            resultVar = result.variable;
        }

        if (searchVar == resultVar) {
            found = true;
            return;
        }

        if (!childNode->IsMemberExpression()) {
            IsVariableUsedInConditionBody(childNode, searchVar);
        }
    });

    return found;
}

bool Checker::FindVariableInBinaryExpressionChain(const ir::AstNode *parent, binder::Variable *searchVar)
{
    bool found = false;

    parent->Iterate([this, searchVar, &found](const ir::AstNode *childNode) -> void {
        if (childNode->IsIdentifier()) {
            binder::ScopeFindResult result = scope_->Find(childNode->AsIdentifier()->Name());
            ASSERT(result.variable);
            if (result.variable == searchVar) {
                found = true;
                return;
            }
        }

        FindVariableInBinaryExpressionChain(childNode, searchVar);
    });

    return found;
}

bool Checker::IsVariableUsedInBinaryExpressionChain(const ir::AstNode *parent, binder::Variable *searchVar)
{
    while (parent->IsBinaryExpression() &&
           parent->AsBinaryExpression()->OperatorType() == lexer::TokenType::PUNCTUATOR_LOGICAL_AND) {
        if (FindVariableInBinaryExpressionChain(parent, searchVar)) {
            return true;
        }

        parent = parent->Parent();
    }

    return false;
}

Type *Checker::CreateTupleTypeFromEveryArrayExpression(const ir::Expression *expr)
{
    status_ |= CheckerStatus::FORCE_TUPLE;

    Type *returnType = expr->Check(this);

    status_ &= ~CheckerStatus::FORCE_TUPLE;

    return returnType;
}

void Checker::ThrowBinaryLikeError(lexer::TokenType op, Type *leftType, Type *rightType, lexer::SourcePosition lineInfo)
{
    ThrowTypeError({"operator ", op, " cannot be applied to types ", leftType, " and ", rightType}, lineInfo);
}

void Checker::ThrowAssignmentError(Type *leftType, Type *rightType, lexer::SourcePosition lineInfo,
                                   bool isAsSrcLeftType)
{
    if (isAsSrcLeftType) {
        ThrowTypeError({"Type '", AsSrc(leftType), "' is not assignable to type '", rightType, "'."}, lineInfo);
    } else {
        ThrowTypeError({"Type '", leftType, "' is not assignable to type '", rightType, "'."}, lineInfo);
    }
}

}  // namespace panda::es2panda::checker
