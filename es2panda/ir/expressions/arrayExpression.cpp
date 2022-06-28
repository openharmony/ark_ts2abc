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

#include "arrayExpression.h"

#include <util/helpers.h>
#include <typescript/checker.h>
#include <compiler/base/literals.h>
#include <compiler/core/pandagen.h>
#include <ir/astDump.h>
#include <ir/base/spreadElement.h>
#include <ir/expressions/assignmentExpression.h>
#include <ir/expressions/objectExpression.h>

namespace panda::es2panda::ir {

bool ArrayExpression::ConvertibleToArrayPattern()
{
    bool restFound = false;
    bool convResult = true;
    for (auto *it : elements_) {
        switch (it->Type()) {
            case AstNodeType::ARRAY_EXPRESSION: {
                convResult = it->AsArrayExpression()->ConvertibleToArrayPattern();
                break;
            }
            case AstNodeType::SPREAD_ELEMENT: {
                if (!restFound && it == elements_.back() && !trailingComma_) {
                    convResult = it->AsSpreadElement()->ConvertibleToRest(isDeclaration_);
                } else {
                    convResult = false;
                }
                restFound = true;
                break;
            }
            case AstNodeType::OBJECT_EXPRESSION: {
                convResult = it->AsObjectExpression()->ConvertibleToObjectPattern();
                break;
            }
            case AstNodeType::ASSIGNMENT_EXPRESSION: {
                convResult = it->AsAssignmentExpression()->ConvertibleToAssignmentPattern();
                break;
            }
            case AstNodeType::META_PROPERTY_EXPRESSION:
            case AstNodeType::CHAIN_EXPRESSION:
            case AstNodeType::SEQUENCE_EXPRESSION: {
                convResult = false;
                break;
            }
            default: {
                break;
            }
        }

        if (!convResult) {
            break;
        }
    }

    SetType(AstNodeType::ARRAY_PATTERN);
    return convResult;
}

ValidationInfo ArrayExpression::ValidateExpression()
{
    ValidationInfo info;

    for (auto *it : elements_) {
        switch (it->Type()) {
            case AstNodeType::OBJECT_EXPRESSION: {
                info = it->AsObjectExpression()->ValidateExpression();
                break;
            }
            case AstNodeType::ARRAY_EXPRESSION: {
                info = it->AsArrayExpression()->ValidateExpression();
                break;
            }
            case AstNodeType::ASSIGNMENT_EXPRESSION: {
                auto *assignmentExpr = it->AsAssignmentExpression();

                if (assignmentExpr->Left()->IsArrayExpression()) {
                    info = assignmentExpr->Left()->AsArrayExpression()->ValidateExpression();
                } else if (assignmentExpr->Left()->IsObjectExpression()) {
                    info = assignmentExpr->Left()->AsObjectExpression()->ValidateExpression();
                }

                break;
            }
            case AstNodeType::SPREAD_ELEMENT: {
                info = it->AsSpreadElement()->ValidateExpression();
                break;
            }
            default: {
                break;
            }
        }

        if (info.Fail()) {
            break;
        }
    }

    return info;
}

void ArrayExpression::Iterate(const NodeTraverser &cb) const
{
    for (auto *it : elements_) {
        cb(it);
    }

    if (typeAnnotation_) {
        cb(typeAnnotation_);
    }
}

void ArrayExpression::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", type_ == AstNodeType::ARRAY_EXPRESSION ? "ArrayExpression" : "ArrayPattern"},
                 {"elements", elements_},
                 {"typeAnnotation", AstDumper::Optional(typeAnnotation_)},
                 {"optional", AstDumper::Optional(optional_)}});
}

void ArrayExpression::Compile(compiler::PandaGen *pg) const
{
    compiler::RegScope rs(pg);
    compiler::VReg arrayObj = pg->AllocReg();

    pg->CreateArray(this, elements_, arrayObj);
}

checker::Type *GetSpreadElementTypeInArrayLiteral(checker::Checker *checker, const ir::SpreadElement *spreadElement)
{
    checker::Type *spreadType = spreadElement->Argument()->Check(checker);

    if (spreadType->IsArrayType()) {
        return spreadType->AsArrayType()->ElementType();
    }

    if (spreadType->IsObjectType() && spreadType->AsObjectType()->IsTupleType()) {
        std::vector<checker::Type *> tupleElementTypes;
        checker::TupleType *spreadTuple = spreadType->AsObjectType()->AsTupleType();
        auto *it = spreadTuple->Iterator()->Next();

        while (it) {
            tupleElementTypes.push_back(it);
            it = spreadTuple->Iterator()->Next();
        }

        return checker->CreateUnionType(std::move(tupleElementTypes));
    }

    if (spreadType->IsUnionType()) {
        std::vector<checker::Type *> spreadTypes;
        bool throwError = false;

        for (auto *it : spreadType->AsUnionType()->ConstituentTypes()) {
            if (it->IsArrayType()) {
                spreadTypes.push_back(it->AsArrayType()->ElementType());
                continue;
            }

            if (it->IsObjectType() && it->AsObjectType()->IsTupleType()) {
                checker::TupleType *tuple = it->AsObjectType()->AsTupleType();
                auto *iter = tuple->Iterator()->Next();

                while (iter) {
                    spreadTypes.push_back(iter);
                    iter = tuple->Iterator()->Next();
                }

                continue;
            }

            throwError = true;
            break;
        }

        if (!throwError) {
            return checker->CreateUnionType(std::move(spreadTypes));
        }
    }

    checker->ThrowTypeError(
        {"Type '", spreadType, "' must have a '[Symbol.Iterator]()' method that returns an iterator."},
        spreadElement->Start());

    return nullptr;
}

checker::Type *GetArrayLiteralElementType(checker::Checker *checker, const ir::Expression *expr, bool forceTuple,
                                          bool noLiteralBaseType, bool destructuringSource, bool readonly)
{
    if (expr->IsSpreadElement()) {
        return GetSpreadElementTypeInArrayLiteral(checker, expr->AsSpreadElement());
    }

    if (expr->IsOmittedExpression()) {
        if (forceTuple) {
            if (destructuringSource) {
                return checker->GlobalAnyType();
            }

            return checker->GlobalUndefinedType();
        }

        return nullptr;
    }

    // TODO(aszilagyi): params force_tuple, readonly

    checker::Type *returnType = expr->Check(checker);

    if (noLiteralBaseType || readonly) {
        return returnType;
    }

    if (returnType->IsEnumType()) {
        return returnType->AsEnumType()->EnumLiteralVar()->TsType();
    }

    return checker->GetBaseTypeOfLiteralType(returnType);
}

checker::Type *ArrayExpression::Check(checker::Checker *checker) const
{
    checker::ObjectDescriptor *desc = checker->Allocator()->New<checker::ObjectDescriptor>();
    checker::TupleElementFlagPool elementFlags;
    std::vector<checker::Type *> elementTypes;
    uint32_t index = 0;
    bool forceTuple = (checker->Status() & checker::CheckerStatus::FORCE_TUPLE);

    for (auto *it : elements_) {
        // TODO(aszilagyi): remove bool params
        checker::Type *currentElementType = GetArrayLiteralElementType(checker, it, false, false, false, false);

        if (!currentElementType) {
            continue;
        }

        if (forceTuple) {
            util::StringView memberIndex = util::Helpers::ToStringView(checker->Allocator(), index);

            auto *memberVar =
                binder::Scope::CreateVar(checker->Allocator(), memberIndex, binder::VariableFlags::PROPERTY, it);

            memberVar->AddFlag(binder::VariableFlags::PROPERTY);
            memberVar->SetTsType(currentElementType);
            elementFlags.insert({memberIndex, checker::ElementFlags::REQUIRED});
            desc->properties.push_back(memberVar);
            index++;
        }

        if (currentElementType->IsUnionType()) {
            for (auto *iter : currentElementType->AsUnionType()->ConstituentTypes()) {
                elementTypes.push_back(iter);
            }

            continue;
        }

        elementTypes.push_back(currentElementType);
    }

    checker::Type *arrayElementType = nullptr;
    if (elementTypes.empty()) {
        arrayElementType = checker->GlobalAnyType();
    } else if (elementTypes.size() == 1) {
        arrayElementType = elementTypes[0];
    } else {
        arrayElementType = checker->CreateUnionType(std::move(elementTypes));
    }

    if (forceTuple) {
        // TODO(aszilagyi): handle readonly when creating IndexInfo and TupleType
        desc->numberIndexInfo = checker->Allocator()->New<checker::IndexInfo>(arrayElementType, "x", false);
        return checker->CreateTupleType(desc, std::move(elementFlags), checker::ElementFlags::REQUIRED, index, index,
                                        false);
    }

    return checker->Allocator()->New<checker::ArrayType>(arrayElementType);
}

checker::Type *ArrayExpression::CheckPattern(checker::Checker *checker) const
{
    checker::ObjectDescriptor *desc = checker->Allocator()->New<checker::ObjectDescriptor>();
    checker::TupleElementFlagPool elementFlags;
    checker::ElementFlags combinedFlags = checker::ElementFlags::NO_OPTS;
    uint32_t minLength = 0;
    uint32_t index = 0;

    for (auto *it : elements_) {
        checker::Type *elementType = nullptr;
        checker::ElementFlags memberFlag = checker::ElementFlags::NO_OPTS;

        if (it->IsRestElement()) {
            elementType = checker->Allocator()->New<checker::ArrayType>(checker->GlobalAnyType());
            memberFlag = checker::ElementFlags::REST;
        } else if (it->IsObjectPattern()) {
            // TODO(aszilagyi): handle inAssignment parameter
            elementType = it->AsObjectPattern()->CheckPattern(checker, false);
            memberFlag = checker::ElementFlags::REQUIRED;
        } else if (it->IsArrayPattern()) {
            elementType = it->AsArrayPattern()->CheckPattern(checker);
            memberFlag = checker::ElementFlags::REQUIRED;
        } else if (it->IsAssignmentPattern()) {
            const ir::AssignmentExpression *assignmentPattern = it->AsAssignmentPattern();

            if (!assignmentPattern->Left()->IsIdentifier()) {
                elementType = checker->CreateInitializerTypeForPattern(assignmentPattern->Left()->Check(checker),
                                                                       assignmentPattern->Right());
                checker->NodeCache().insert({assignmentPattern->Right(), elementType});
            } else {
                elementType = checker->GetBaseTypeOfLiteralType(assignmentPattern->Right()->Check(checker));
            }

            memberFlag = checker::ElementFlags::OPTIONAL;
        } else {
            elementType = checker->GlobalAnyType();
            memberFlag = checker::ElementFlags::REQUIRED;
        }

        util::StringView memberIndex = util::Helpers::ToStringView(checker->Allocator(), index);

        auto *memberVar =
            binder::Scope::CreateVar(checker->Allocator(), memberIndex, binder::VariableFlags::PROPERTY, it);

        if (memberFlag == checker::ElementFlags::OPTIONAL) {
            memberVar->AddFlag(binder::VariableFlags::OPTIONAL);
        } else {
            minLength++;
        }

        memberVar->SetTsType(elementType);
        elementFlags.insert({memberIndex, memberFlag});
        desc->properties.push_back(memberVar);

        combinedFlags |= memberFlag;
        index++;
    }

    return checker->CreateTupleType(desc, std::move(elementFlags), combinedFlags, minLength, desc->properties.size(),
                                    false);
}

}  // namespace panda::es2panda::ir
