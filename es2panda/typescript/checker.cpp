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

#include "checker.h"

#include <ir/expression.h>
#include <ir/statements/blockStatement.h>
#include <parser/program/program.h>
#include <util/helpers.h>
#include <binder/binder.h>
#include <binder/scope.h>
#include <binder/variable.h>
#include <es2panda.h>

#include <cstdint>
#include <initializer_list>
#include <memory>

namespace panda::es2panda::checker {

Checker::Checker(ArenaAllocator *allocator, binder::Binder *binder)
    : allocator_(allocator),
      binder_(binder),
      rootNode_(binder->TopScope()->Node()->AsBlockStatement()),
      scope_(binder->TopScope())
{
    scopeStack_.push_back(scope_);
    globalTypes_ = allocator_->New<GlobalTypesHolder>(allocator_);
    relation_ = allocator_->New<TypeRelation>(this);
    status_ = CheckerStatus::NO_OPTS;
}

void Checker::StartChecker()
{
    ASSERT(rootNode_->IsProgram());
    rootNode_->Check(this);
}

binder::Scope *Checker::Scope() const
{
    return scope_;
}

void Checker::ThrowTypeError(std::initializer_list<TypeErrorMessageElement> list, const lexer::SourcePosition &pos)
{
    std::stringstream ss;

    for (const auto &it : list) {
        if (std::holds_alternative<char *>(it)) {
            ss << std::get<char *>(it);
        } else if (std::holds_alternative<util::StringView>(it)) {
            ss << std::get<util::StringView>(it);
        } else if (std::holds_alternative<lexer::TokenType>(it)) {
            ss << TokenToString(std::get<lexer::TokenType>(it));
        } else if (std::holds_alternative<const Type *>(it)) {
            std::get<const Type *>(it)->ToString(ss);
        } else if (std::holds_alternative<AsSrc>(it)) {
            std::get<AsSrc>(it).GetType()->ToStringAsSrc(ss);
        } else if (std::holds_alternative<size_t>(it)) {
            ss << std::to_string(std::get<size_t>(it));
        } else {
            UNREACHABLE();
        }
    }

    std::string err = ss.str();
    ThrowTypeError(err, pos);
}

void Checker::ThrowTypeError(std::string_view message, const lexer::SourcePosition &pos)
{
    lexer::LineIndex index(binder_->Program()->SourceCode());
    lexer::SourceLocation loc = index.GetLocation(pos);

    throw Error {ErrorType::TYPE, message, loc.line, loc.col};
}

Type *Checker::GlobalNumberType()
{
    return globalTypes_->GlobalNumberType();
}

Type *Checker::GlobalAnyType()
{
    return globalTypes_->GlobalAnyType();
}

Type *Checker::GlobalStringType()
{
    return globalTypes_->GlobalStringType();
}

Type *Checker::GlobalBooleanType()
{
    return globalTypes_->GlobalBooleanType();
}

Type *Checker::GlobalVoidType()
{
    return globalTypes_->GlobalVoidType();
}

Type *Checker::GlobalNullType()
{
    return globalTypes_->GlobalNullType();
}

Type *Checker::GlobalUndefinedType()
{
    return globalTypes_->GlobalUndefinedType();
}

Type *Checker::GlobalUnknownType()
{
    return globalTypes_->GlobalUnknownType();
}

Type *Checker::GlobalNeverType()
{
    return globalTypes_->GlobalNeverType();
}

Type *Checker::GlobalNonPrimitiveType()
{
    return globalTypes_->GlobalNonPrimitiveType();
}

Type *Checker::GlobalBigintType()
{
    return globalTypes_->GlobalBigintType();
}

Type *Checker::GlobalFalseType()
{
    return globalTypes_->GlobalFalseType();
}

Type *Checker::GlobalTrueType()
{
    return globalTypes_->GlobalTrueType();
}

Type *Checker::GlobalNumberOrBigintType()
{
    return globalTypes_->GlobalNumberOrBigintType();
}

Type *Checker::GlobalStringOrNumberType()
{
    return globalTypes_->GlobalStringOrNumberType();
}

Type *Checker::GlobalZeroType()
{
    return globalTypes_->GlobalZeroType();
}

Type *Checker::GlobalEmptyStringType()
{
    return globalTypes_->GlobalEmptyStringType();
}

Type *Checker::GlobalZeroBigintType()
{
    return globalTypes_->GlobalZeroBigintType();
}

Type *Checker::GlobalPrimitiveType()
{
    return globalTypes_->GlobalPrimitiveType();
}

Type *Checker::GlobalEmptyTupleType()
{
    return globalTypes_->GlobalEmptyTupleType();
}

Type *Checker::GlobalEmptyObjectType()
{
    return globalTypes_->GlobalEmptyObjectType();
}

NumberLiteralPool &Checker::NumberLiteralMap()
{
    return numberLiteralMap_;
}

StringLiteralPool &Checker::StringLiteralMap()
{
    return stringLiteralMap_;
}

StringLiteralPool &Checker::BigintLiteralMap()
{
    return bigintLiteralMap_;
}

TypeRelation *Checker::Relation()
{
    return relation_;
}

RelationHolder &Checker::IdenticalResults()
{
    return identicalResults_;
}

RelationHolder &Checker::AssignableResults()
{
    return assignableResults_;
}

RelationHolder &Checker::ComparableResults()
{
    return comparableResults_;
}

std::unordered_set<const ir::AstNode *> &Checker::TypeStack()
{
    return typeStack_;
}

std::unordered_map<const ir::AstNode *, Type *> &Checker::NodeCache()
{
    return nodeCache_;
}

CheckerStatus Checker::Status()
{
    return status_;
}

Type *Checker::CheckTypeCached(const ir::Expression *expr)
{
    auto res = nodeCache_.find(expr);
    if (res != nodeCache_.end()) {
        return res->second;
    }

    Type *returnType = expr->Check(this);
    nodeCache_.insert({expr, returnType});

    return returnType;
}

}  // namespace panda::es2panda::checker
