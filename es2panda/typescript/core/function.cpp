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

#include <ir/expressions/arrayExpression.h>
#include <ir/expressions/assignmentExpression.h>
#include <ir/expressions/callExpression.h>
#include <ir/expressions/objectExpression.h>
#include <ir/expressions/identifier.h>
#include <ir/base/scriptFunction.h>
#include <ir/base/property.h>
#include <ir/base/spreadElement.h>
#include <ir/statements/returnStatement.h>
#include <ir/statements/functionDeclaration.h>
#include <binder/variable.h>
#include <binder/scope.h>
#include <binder/declaration.h>

#include <typescript/checker.h>
#include <typescript/types/objectDescriptor.h>
#include <typescript/types/objectType.h>

#include <cstddef>
#include <cstdint>
#include <memory>
#include <utility>
#include <vector>

namespace panda::es2panda::checker {

Signature *Checker::HandleFunctionReturn(const ir::ScriptFunction *func, SignatureInfo *signatureInfo,
                                         binder::Variable *funcVar)
{
    // TODO(aszilagyi): this function only works properly for simple functions, have to implement the Async and/or
    // Generator function part
    Signature *callSignature = allocator_->New<checker::Signature>(signatureInfo, GlobalAnyType());

    if (funcVar) {
        Type *funcType = CreateFunctionTypeWithSignature(callSignature);
        funcType->SetVariable(funcVar);
        funcVar->SetTsType(funcType);
        callSignature = funcVar->TsType()->AsObjectType()->CallSignatures()[0];
    }

    if (func->ReturnTypeAnnotation()) {
        Type *returnType = func->ReturnTypeAnnotation()->Check(this);

        if (func->IsArrow() && func->Body()->IsExpression() &&
            !ElaborateElementwise(func->Body()->AsExpression(), returnType, func->Body()->Start())) {
            Type *bodyType = GetBaseTypeOfLiteralType(func->Body()->Check(this));
            IsTypeAssignableTo(bodyType, returnType,
                               {"Type '", bodyType, "' is not assignable to type '", returnType, "'."},
                               func->Body()->Start());
        } else if (returnType->IsNeverType()) {
            ThrowTypeError("A function returning 'never' cannot have a reachable end point.",
                           func->ReturnTypeAnnotation()->Start());
        } else if (!MaybeTypeOfKind(returnType, TypeFlag::ANY_OR_VOID)) {
            CheckAllCodePathsInNonVoidFunctionReturnOrThrow(
                func, func->ReturnTypeAnnotation()->Start(),
                "A function whose declared type is neither 'void' nor 'any' must return a value.");
        }

        callSignature->SetReturnType(returnType);
    } else if (func->Declare()) {
        callSignature->SetReturnType(GlobalAnyType());
    } else if (func->IsArrow() && func->Body()->IsExpression()) {
        callSignature->SetReturnType(GetBaseTypeOfLiteralType(func->Body()->Check(this)));
    } else {
        std::vector<Type *> returnTypes;
        CollectTypesFromReturnStatements(func->Body(), returnTypes);

        if (returnTypes.empty()) {
            callSignature->SetReturnType(GlobalVoidType());
        } else {
            callSignature->SetReturnType(CreateUnionType(std::move(returnTypes)));
        }
    }

    return callSignature;
}

void Checker::CreateTypeForObjectPatternParameter(ObjectType *patternType, const ir::Expression *patternNode,
                                                  const ir::Expression *initNode)
{
    if (initNode) {
        ASSERT(initNode->IsObjectExpression());
        ObjectType *initObjType = CheckTypeCached(initNode)->AsObjectType();

        for (auto *it : initObjType->Properties()) {
            binder::LocalVariable *foundProp = patternType->GetProperty(it->Name());
            if (foundProp) {
                foundProp->SetTsType(it->TsType());
            }
        }
    }

    for (auto *it : patternNode->AsObjectPattern()->Properties()) {
        if (it->IsProperty() && it->AsProperty()->Value()->IsAssignmentPattern() &&
            !it->AsProperty()->Value()->AsAssignmentPattern()->Left()->IsIdentifier()) {
            const ir::AssignmentExpression *assignmentPattern = it->AsProperty()->Value()->AsAssignmentPattern();

            binder::LocalVariable *foundProp =
                patternType->GetProperty(ToPropertyName(it->AsProperty()->Key(), TypeFlag::COMPUTED_TYPE_LITERAL_NAME));

            foundProp->SetTsType(CreateTypeForPatternParameter(assignmentPattern->Left(), assignmentPattern->Right()));
        }
    }
}

Type *Checker::CreateTypeForPatternParameter(const ir::Expression *patternNode, const ir::Expression *initNode)
{
    Type *paramType = CheckTypeCached(patternNode);

    if (patternNode->IsObjectPattern()) {
        ASSERT(paramType->IsObjectType());
        CreateTypeForObjectPatternParameter(paramType->AsObjectType(), patternNode, initNode);
    }

    if (patternNode->IsArrayPattern() && initNode) {
        ASSERT(initNode->IsArrayExpression() && paramType->IsObjectType() && paramType->AsObjectType()->IsTupleType());

        paramType = CheckTypeCached(initNode);

        for (size_t it = 0; it < paramType->AsObjectType()->Properties().size(); it++) {
            if (it < patternNode->AsArrayPattern()->Elements().size()) {
                const ir::Expression *patternElement = patternNode->AsArrayPattern()->Elements()[it];

                if (patternElement->IsArrayPattern() || patternElement->IsObjectPattern()) {
                    paramType->AsObjectType()->Properties()[it]->SetTsType(
                        CreateTypeForPatternParameter(patternElement, initNode->AsArrayExpression()->Elements()[it]));
                }
            }
        }
    }

    return paramType;
}

void Checker::CheckFunctionParameterDeclaration(const ArenaVector<ir::Expression *> &params,
                                                SignatureInfo *signatureInfo)
{
    signatureInfo->restVar = nullptr;
    signatureInfo->minArgCount = 0;

    for (auto *it : params) {
        FunctionParameterInfo paramInfo = GetFunctionParameterInfo(it);

        VariableBindingContext context = VariableBindingContext::REGULAR;

        Type *annotationType = paramInfo.typeAnnotation ? CheckTypeCached(paramInfo.typeAnnotation) : nullptr;

        TypeOrNode elaborateSource;

        if (paramInfo.initNode && annotationType) {
            elaborateSource = paramInfo.initNode;
            if (!ElaborateElementwise(elaborateSource, annotationType, it->Start()) &&
                !IsTypeAssignableTo(paramInfo.initType, annotationType)) {
                ThrowTypeError(
                    {"Type '", AsSrc(paramInfo.initType), "' is not assignable to type '", annotationType, "'"},
                    it->Start());
            }
        }

        Type *patternType = paramInfo.destructuringType != DestructuringType::NO_DESTRUCTURING
                                ? paramInfo.bindingNode->Check(this)
                                : nullptr;

        if (patternType) {
            if (annotationType) {
                elaborateSource = patternType;
                ElaborateElementwise(elaborateSource, annotationType, it->Start());
            } else if (paramInfo.initNode) {
                paramInfo.initType = CreateInitializerTypeForPattern(patternType, paramInfo.initNode);
            }
        }

        Type *paramType = GetParamTypeFromParamInfo(paramInfo, annotationType, patternType);

        HandleVariableDeclarationWithContext(paramInfo.bindingNode, paramType, context, paramInfo.destructuringType,
                                             paramInfo.typeAnnotation);

        // TODO(aszilagyi): get the variable from the function scope
        binder::LocalVariable *paramVar = nullptr;

        paramType = paramInfo.destructuringType != DestructuringType::NO_DESTRUCTURING
                        ? CreateTypeForPatternParameter(paramInfo.bindingNode, paramInfo.initNode)
                        : paramType;

        paramType->SetVariable(paramVar);
        paramVar->SetTsType(paramType);

        if (paramInfo.restType) {
            signatureInfo->restVar = paramVar;
            continue;
        }

        if (!paramInfo.optionalParam) {
            signatureInfo->minArgCount++;
        } else {
            paramVar->AddFlag(binder::VariableFlags::OPTIONAL);
        }

        signatureInfo->funcParams.push_back(paramVar);
    }
}

void Checker::InferFunctionDeclarationType(const binder::FunctionDecl *decl, binder::Variable *funcVar)
{
    ObjectDescriptor *descWithOverload = allocator_->New<ObjectDescriptor>();

    for (const auto *it : decl->Decls()) {
        const ir::ScriptFunction *func = it->Function();

        if (func->IsOverload() && !func->Declare()) {
            ScopeContext scopeCtx(this, func->Scope());

            auto *signatureInfo = allocator_->New<checker::SignatureInfo>();
            CheckFunctionParameterDeclaration(func->Params(), signatureInfo);
            Type *returnType = GlobalAnyType();

            if (func->ReturnTypeAnnotation()) {
                returnType = func->ReturnTypeAnnotation()->Check(this);
            }

            Signature *overloadSignature = allocator_->New<Signature>(signatureInfo, returnType);

            descWithOverload->callSignatures.push_back(overloadSignature);

            continue;
        }

        if (descWithOverload->callSignatures.empty()) {
            ScopeContext scopeCtx(this, func->Scope());

            auto *signatureInfo = allocator_->New<checker::SignatureInfo>();
            CheckFunctionParameterDeclaration(func->Params(), signatureInfo);

            HandleFunctionReturn(func, signatureInfo, funcVar);
            return;
        }

        Type *funcType = allocator_->New<FunctionType>(descWithOverload);
        funcType->SetVariable(funcVar);
        funcVar->SetTsType(funcType);

        ScopeContext scopeCtx(this, func->Scope());

        auto *signatureInfo = allocator_->New<checker::SignatureInfo>();
        CheckFunctionParameterDeclaration(func->Params(), signatureInfo);

        Signature *baseCallSignature = HandleFunctionReturn(func, signatureInfo);

        for (auto *iter : funcType->AsObjectType()->CallSignatures()) {
            if (baseCallSignature->ReturnType()->IsVoidType() ||
                IsTypeAssignableTo(baseCallSignature->ReturnType(), iter->ReturnType()) ||
                IsTypeAssignableTo(iter->ReturnType(), baseCallSignature->ReturnType())) {
                baseCallSignature->AssignmentTarget(relation_, iter);

                if (relation_->IsTrue()) {
                    continue;
                }
            }

            ThrowTypeError("This overload signature is not compatible with its implementation signature",
                           func->Start());
        }

        return;
    }
}

void Checker::CollectTypesFromReturnStatements(const ir::AstNode *parent, std::vector<Type *> &returnTypes)
{
    parent->Iterate([this, &returnTypes](ir::AstNode *childNode) -> void {
        if (childNode->IsScriptFunction()) {
            return;
        }

        if (childNode->IsReturnStatement()) {
            ir::ReturnStatement *returnStmt = childNode->AsReturnStatement();

            if (!returnStmt->Argument()) {
                return;
            }

            returnTypes.push_back(GetBaseTypeOfLiteralType(childNode->AsReturnStatement()->Argument()->Check(this)));
        }

        CollectTypesFromReturnStatements(childNode, returnTypes);
    });
}

static bool SearchForReturnOrThrow(const ir::AstNode *parent)
{
    bool found = false;

    parent->Iterate([&found](const ir::AstNode *childNode) -> void {
        if (childNode->IsThrowStatement() || childNode->IsReturnStatement()) {
            found = true;
            return;
        }

        if (childNode->IsScriptFunction()) {
            return;
        }

        SearchForReturnOrThrow(childNode);
    });

    return found;
}

void Checker::CheckAllCodePathsInNonVoidFunctionReturnOrThrow(const ir::ScriptFunction *func,
                                                              lexer::SourcePosition lineInfo, const char *errMsg)
{
    if (!SearchForReturnOrThrow(func->Body())) {
        ThrowTypeError(errMsg, lineInfo);
    }
    // TODO(aszilagyi): this function is not fully implement the TSC one, in the future if we will have a
    // noImplicitReturn compiler option for TypeScript we should update this function
}

FunctionParameterInfo Checker::GetFunctionParameterInfo(ir::Expression *expr)
{
    std::stringstream ss;
    FunctionParameterInfo paramInfo;
    paramInfo.bindingNode = expr;

    if (expr->IsArrayPattern()) {
        paramInfo.typeAnnotation = expr->AsArrayPattern()->TypeAnnotation();
        paramInfo.destructuringType = DestructuringType::ARRAY_DESTRUCTURING;
        CreatePatternName(expr, ss);
        util::UString pn(ss.str(), allocator_);
        paramInfo.paramName = pn.View();
        return paramInfo;
    }

    if (expr->IsObjectPattern()) {
        paramInfo.typeAnnotation = expr->AsObjectPattern()->TypeAnnotation();
        paramInfo.destructuringType = DestructuringType::OBJECT_DESTRUCTURING;
        CreatePatternName(expr, ss);
        util::UString pn(ss.str(), allocator_);
        paramInfo.paramName = pn.View();
        return paramInfo;
    }

    if (expr->IsAssignmentPattern()) {
        ir::AssignmentExpression *assignmentPattern = expr->AsAssignmentPattern();
        paramInfo.initNode = assignmentPattern->Right();
        paramInfo.bindingNode = assignmentPattern->Left();
        paramInfo.optionalParam = true;

        if (paramInfo.bindingNode->IsArrayPattern()) {
            paramInfo.typeAnnotation = paramInfo.bindingNode->AsArrayPattern()->TypeAnnotation();
            // TODO(aszilagyi): 1st param true
            paramInfo.initType = expr->AsAssignmentPattern()->Right()->Check(this);
            paramInfo.destructuringType = DestructuringType::ARRAY_DESTRUCTURING;
            CreatePatternName(expr, ss);
            util::UString pn(ss.str(), allocator_);
            paramInfo.paramName = pn.View();
        } else {
            if (paramInfo.bindingNode->IsObjectPattern()) {
                paramInfo.typeAnnotation = paramInfo.bindingNode->AsObjectPattern()->TypeAnnotation();
                paramInfo.destructuringType = DestructuringType::OBJECT_DESTRUCTURING;
                CreatePatternName(expr, ss);
                util::UString pn(ss.str(), allocator_);
                paramInfo.paramName = pn.View();
            } else {
                ASSERT(paramInfo.bindingNode->IsIdentifier());
                paramInfo.typeAnnotation = paramInfo.bindingNode->AsIdentifier()->TypeAnnotation();
                paramInfo.paramName = paramInfo.bindingNode->AsIdentifier()->Name();
            }

            paramInfo.initType = expr->AsAssignmentPattern()->Right()->Check(this);
        }

        return paramInfo;
    }

    if (expr->IsRestElement()) {
        ir::SpreadElement *restElement = expr->AsRestElement();
        paramInfo.restType = GlobalAnyType();

        if (restElement->TypeAnnotation()) {
            Type *restArrayType = restElement->TypeAnnotation()->Check(this);

            if (!restArrayType->IsArrayType()) {
                ThrowTypeError("A rest parameter must be of an array type", expr->Start());
            }

            paramInfo.restType = restArrayType->AsArrayType()->ElementType();
        }

        paramInfo.paramName = restElement->Argument()->AsIdentifier()->Name();
        paramInfo.bindingNode = restElement->Argument();

        return paramInfo;
    }

    ASSERT(expr->IsIdentifier());
    paramInfo.typeAnnotation = expr->AsIdentifier()->TypeAnnotation();
    paramInfo.optionalParam = expr->AsIdentifier()->IsOptional();
    paramInfo.paramName = expr->AsIdentifier()->Name();

    return paramInfo;
}

Type *Checker::GetParamTypeFromParamInfo(const FunctionParameterInfo &paramInfo, Type *annotationType,
                                         Type *patternType)
{
    if (paramInfo.typeAnnotation) {
        return annotationType;
    }

    if (paramInfo.initType) {
        return paramInfo.initType;
    }

    if (patternType) {
        return patternType;
    }

    if (paramInfo.restType) {
        return paramInfo.restType;
    }

    return GlobalAnyType();
}

}  // namespace panda::es2panda::checker
