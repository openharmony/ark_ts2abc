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

#include <ir/ts/tsTypeAliasDeclaration.h>
#include <ir/ts/tsTypeParameterDeclaration.h>
#include <ir/ts/tsTypeParameterInstantiation.h>
#include <ir/ts/tsInterfaceDeclaration.h>
#include <ir/ts/tsTypeParameter.h>
#include <ir/ts/tsTypeReference.h>
#include <ir/expressions/identifier.h>

#include <binder/variable.h>
#include <binder/scope.h>
#include <binder/declaration.h>

#include <typescript/checker.h>

namespace panda::es2panda::checker {

void Checker::ValidateTypeParameterInstantiation(size_t typeArgumentCount, size_t minTypeArgumentCount,
                                                 size_t numOfTypeArguments, const util::StringView &name,
                                                 const lexer::SourcePosition &locInfo)
{
    if (numOfTypeArguments < minTypeArgumentCount || numOfTypeArguments > typeArgumentCount) {
        if (minTypeArgumentCount == typeArgumentCount) {
            ThrowTypeError({"Generic type '", name, "' requires '", minTypeArgumentCount, "' type argument(s)."},
                           locInfo);
        }

        ThrowTypeError({"Generic type '", name, "' requires between '", minTypeArgumentCount, "' and '",
                        typeArgumentCount, "' type arguments."},
                       locInfo);
    }
}

Type *Checker::InstantiateGenericTypeAlias(binder::Variable *bindingVar, const ir::TSTypeParameterDeclaration *decl,
                                           const ir::TSTypeParameterInstantiation *typeParams,
                                           const lexer::SourcePosition &locInfo)
{
    ValidateTypeParameterInstantiation(decl->Params().size(), decl->RequiredParams(),
                                       typeParams ? typeParams->Params().size() : 0, bindingVar->Name(), locInfo);

    std::vector<std::pair<TypeParameter *, Type *>> savedDefaultTypes;

    if (typeParams) {
        ScopeContext scopeCtx(this, decl->Scope());

        for (size_t it = 0; it < typeParams->Params().size(); it++) {
            binder::ScopeFindResult res = scope_->Find(decl->Params()[it]->Name()->Name());

            ASSERT(res.variable && res.variable->TsType() && res.variable->TsType()->IsTypeParameter());

            TypeParameter *currentTypeParameterType = res.variable->TsType()->AsTypeParameter();

            savedDefaultTypes.emplace_back(currentTypeParameterType, currentTypeParameterType->DefaultType());

            currentTypeParameterType->SetDefaultType(typeParams->Params()[it]->Check(this));
        }
    }

    Type *newGenericType = bindingVar->TsType()->Instantiate(allocator_, relation_, globalTypes_);

    for (auto it : savedDefaultTypes) {
        it.first->SetDefaultType(it.second);
    }

    return newGenericType;
}

Type *Checker::InstantiateGenericInterface(binder::Variable *bindingVar, const binder::Decl *decl,
                                           const ir::TSTypeParameterInstantiation *typeParams,
                                           const lexer::SourcePosition &locInfo)
{
    const std::pair<std::vector<binder::Variable *>, size_t> &mergedTypeParams =
        bindingVar->TsType()->AsObjectType()->AsInterfaceType()->GetMergedTypeParams();

    ValidateTypeParameterInstantiation(mergedTypeParams.first.size(), mergedTypeParams.second,
                                       typeParams ? typeParams->Params().size() : 0, bindingVar->Name(), locInfo);

    std::vector<Type *> typeParamInstantiationTypes;

    if (typeParams) {
        for (auto *it : typeParams->Params()) {
            typeParamInstantiationTypes.push_back(it->Check(this));
        }
    }

    std::vector<std::pair<TypeParameter *, Type *>> savedDefaultTypes;

    for (size_t i = 0; i < typeParamInstantiationTypes.size(); i++) {
        TypeParameter *mergedTypeParam = mergedTypeParams.first[i]->TsType()->AsTypeParameter();

        savedDefaultTypes.emplace_back(mergedTypeParam, mergedTypeParam->DefaultType());

        mergedTypeParam->SetDefaultType(typeParamInstantiationTypes[i]);
    }

    const auto &declarations = decl->AsInterfaceDecl()->Decls();

    for (const auto *it : declarations) {
        const ir::TSInterfaceDeclaration *currentDecl = it->AsTSInterfaceDeclaration();

        if (!currentDecl->TypeParams()) {
            continue;
        }

        const ir::TSTypeParameterDeclaration *currentTypeParams = currentDecl->TypeParams();

        ScopeContext scopeCtx(this, currentTypeParams->Scope());

        for (size_t i = 0; i < currentTypeParams->Params().size(); i++) {
            binder::ScopeFindResult res = scope_->Find(currentTypeParams->Params()[i]->Name()->Name());

            ASSERT(res.variable && res.variable->TsType() && res.variable->TsType()->IsTypeParameter());

            TypeParameter *currentTypeParameterType = res.variable->TsType()->AsTypeParameter();

            savedDefaultTypes.emplace_back(currentTypeParameterType, currentTypeParameterType->DefaultType());

            currentTypeParameterType->SetDefaultType(
                mergedTypeParams.first[i]->TsType()->AsTypeParameter()->DefaultType());
        }
    }

    Type *newGenericType = bindingVar->TsType()->Instantiate(allocator_, relation_, globalTypes_);

    newGenericType->AsObjectType()->AsInterfaceType()->SetTypeParamTypes(std::move(typeParamInstantiationTypes));

    for (auto it = savedDefaultTypes.rbegin(); it != savedDefaultTypes.rend(); it++) {
        (*it).first->SetDefaultType((*it).second);
    }

    return newGenericType;
}

void Checker::CheckTypeParametersNotReferenced(const ir::AstNode *parent,
                                               const ir::TSTypeParameterDeclaration *typeParams, size_t index)
{
    parent->Iterate([this, typeParams, index](ir::AstNode *childNode) -> void {
        if (childNode->IsTSTypeReference() && childNode->AsTSTypeReference()->TypeName()->IsIdentifier()) {
            const util::StringView &defaultTypeName =
                childNode->AsTSTypeReference()->TypeName()->AsIdentifier()->Name();

            for (size_t i = index; i < typeParams->Params().size(); i++) {
                const ir::TSTypeParameter *currentParam = typeParams->Params()[i];

                if (currentParam->Name()->Name() == defaultTypeName) {
                    ThrowTypeError("Type paremeter defaults can only reference previously declared type parameters.",
                                   childNode->Start());
                }
            }
        }

        CheckTypeParametersNotReferenced(childNode, typeParams, index);
    });
}

std::vector<binder::Variable *> Checker::CheckTypeParameters(const ir::TSTypeParameterDeclaration *typeParams)
{
    ScopeContext scopeCtx(this, typeParams->Scope());
    std::vector<binder::Variable *> params;

    for (size_t i = 0; i < typeParams->Params().size(); i++) {
        const ir::TSTypeParameter *currentParam = typeParams->Params()[i];

        binder::ScopeFindResult res = scope_->Find(currentParam->Name()->Name());
        ASSERT(res.variable);

        if (!res.variable->TsType()) {
            Type *defaultType = nullptr;
            if (currentParam->DefaultType()) {
                CheckTypeParametersNotReferenced(currentParam->DefaultType(), typeParams, i + 1);

                if (!typeStack_.insert(currentParam->DefaultType()).second) {
                    ThrowTypeError({"Type parameter '", currentParam->Name()->Name(), "' has a circular default."},
                                   currentParam->DefaultType()->Start());
                }

                defaultType = currentParam->DefaultType()->Check(this);

                typeStack_.erase(currentParam->DefaultType());
            }

            // TODO(aszilagyi): handle type parameter constraints
            auto *paramType = allocator_->New<TypeParameter>(nullptr, defaultType);

            res.variable->SetTsType(paramType);
        }

        params.push_back(res.variable);
    }

    return params;
}

std::pair<std::vector<binder::Variable *>, size_t> Checker::CollectTypeParametersFromDeclarations(
    const ArenaVector<ir::TSInterfaceDeclaration *> &declarations)
{
    std::pair<std::vector<binder::Variable *>, size_t> collectedTypeParams;

    for (const auto *decl : declarations) {
        ASSERT(decl->IsTSInterfaceDeclaration());

        const ir::TSInterfaceDeclaration *interfaceDecl = decl->AsTSInterfaceDeclaration();

        if (!interfaceDecl->TypeParams()) {
            continue;
        }

        std::vector<binder::Variable *> currentParams = CheckTypeParameters(interfaceDecl->TypeParams());

        for (auto *currentParam : currentParams) {
            bool addParam = true;

            for (auto &collectedTypeParam : collectedTypeParams.first) {
                if (currentParam->Name() != collectedTypeParam->Name()) {
                    continue;
                }

                if (currentParam->Name() == collectedTypeParam->Name()) {
                    if (!collectedTypeParam->TsType()->AsTypeParameter()->DefaultType() &&
                        currentParam->TsType()->AsTypeParameter()->DefaultType()) {
                        collectedTypeParam = currentParam;
                    }

                    addParam = false;
                    break;
                }
            }

            if (addParam) {
                collectedTypeParams.first.push_back(currentParam);
            }
        }
    }

    size_t minTypeArgumentCount = 0;

    for (size_t i = 0; i < collectedTypeParams.first.size(); i++) {
        if (!collectedTypeParams.first[i]->TsType()->AsTypeParameter()->DefaultType()) {
            minTypeArgumentCount = i + 1;
        }
    }

    collectedTypeParams.second = minTypeArgumentCount;

    return collectedTypeParams;
}

bool Checker::CheckTypeParametersAreIdentical(
    const std::pair<std::vector<binder::Variable *>, size_t> &collectedTypeParams,
    std::vector<binder::Variable *> &currentTypeParams) const
{
    size_t maxTypeArgumentCount = collectedTypeParams.first.size();
    size_t minTypeArgumentCount = collectedTypeParams.second;

    size_t numTypeParameters = currentTypeParams.size();
    if (numTypeParameters < minTypeArgumentCount || numTypeParameters > maxTypeArgumentCount) {
        return true;
    }

    for (size_t i = 0; i < currentTypeParams.size(); i++) {
        binder::Variable *sourceParam = currentTypeParams[i];
        binder::Variable *targetParam = collectedTypeParams.first[i];

        if (sourceParam->Name() != targetParam->Name()) {
            return true;
        }

        Type *sourceDefaultType = sourceParam->TsType()->AsTypeParameter()->DefaultType();
        Type *targetDefaultType = targetParam->TsType()->AsTypeParameter()->DefaultType();

        if (sourceDefaultType && targetDefaultType && !IsTypeIdenticalTo(sourceDefaultType, targetDefaultType)) {
            return true;
        }
    }

    return false;
}

}  // namespace panda::es2panda::checker
