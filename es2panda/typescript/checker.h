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

#ifndef ES2PANDA_COMPILER_TYPESCRIPT_CHECKER_H
#define ES2PANDA_COMPILER_TYPESCRIPT_CHECKER_H

#include <binder/enumMemberResult.h>
#include <typescript/types/globalTypesHolder.h>
#include <typescript/types/typeRelation.h>
#include <typescript/types/types.h>
#include <macros.h>
#include <util/enumbitops.h>
#include <util/ustring.h>

#include <cstdint>
#include <initializer_list>
#include <unordered_map>
#include <unordered_set>

namespace panda::es2panda::binder {
class Binder;
class Decl;
class EnumVariable;
class FunctionDecl;
class LocalVariable;
class Scope;
class Variable;
}  // namespace panda::es2panda::binder

namespace panda::es2panda::ir {
class AstNode;
class SpreadElement;
class AssignmentExpression;
class Property;
class Expression;
class ScriptFunction;
class UnaryExpression;
class BinaryExpression;
class Identifier;
class MemberExpression;
class TSEnumDeclaration;
class TSInterfaceDeclaration;
class ObjectExpression;
class TSArrayType;
class TSUnionType;
class TSFunctionType;
class TSConstructorType;
class TSTypeLiteral;
class TSTypeReference;
class TSQualifiedName;
class TSIndexedAccessType;
class TSInterfaceHeritage;
class TSTypeQuery;
class TSTupleType;
class ArrayExpression;
class Statement;
class TSTypeParameterDeclaration;
class TSTypeParameterInstantiation;
class BlockStatement;
class VariableDeclaration;
class IfStatement;
class DoWhileStatement;
class WhileStatement;
class ForUpdateStatement;
class ForInStatement;
class ForOfStatement;
class ReturnStatement;
class SwitchStatement;
class LabelledStatement;
class ThrowStatement;
class TryStatement;
class TSTypeAliasDeclaration;
class TSAsExpression;
class ThisExpression;
class NewExpression;
class FunctionExpression;
class AwaitExpression;
class UpdateExpression;
class ConditionalExpression;
class YieldExpression;
class ArrowFunctionExpression;
class TemplateLiteral;
class TaggedTemplateExpression;
class TSIndexSignature;
class TSSignatureDeclaration;
class TSPropertySignature;
class TSMethodSignature;
class ChainExpression;

enum class AstNodeType;
}  // namespace panda::es2panda::ir

namespace panda::es2panda::checker {

using StringLiteralPool = std::unordered_map<util::StringView, Type *>;
using NumberLiteralPool = std::unordered_map<double, Type *>;
using FunctionParamsResolveResult = std::variant<std::vector<binder::LocalVariable *> &, bool>;
using InterfacePropertyMap = std::unordered_map<util::StringView, std::pair<binder::LocalVariable *, InterfaceType *>>;
using TypeOrNode = std::variant<Type *, const ir::AstNode *>;
using IndexInfoTypePair = std::pair<Type *, Type *>;
using PropertyMap = std::unordered_map<util::StringView, binder::LocalVariable *>;

enum class DestructuringType {
    NO_DESTRUCTURING,
    ARRAY_DESTRUCTURING,
    OBJECT_DESTRUCTURING,
};

class ObjectLiteralElaborationData {
public:
    ObjectLiteralElaborationData() = default;
    ~ObjectLiteralElaborationData() = default;
    NO_COPY_SEMANTIC(ObjectLiteralElaborationData);
    NO_MOVE_SEMANTIC(ObjectLiteralElaborationData);

    ObjectDescriptor *desc {};
    std::vector<Type *> stringIndexTypes {};
    Type *numberInfosType {};
    Type *stringInfosType {};
    std::vector<const ir::SpreadElement *> spreads {};
    std::unordered_map<uint32_t, ObjectType *> potentialObjectTypes {};
};

class ObjectLiteralPropertyInfo {
public:
    ObjectLiteralPropertyInfo() = default;
    ~ObjectLiteralPropertyInfo() = default;
    NO_COPY_SEMANTIC(ObjectLiteralPropertyInfo);
    DEFAULT_MOVE_SEMANTIC(ObjectLiteralPropertyInfo);

    util::StringView propName {};
    Type *propType {};
    bool handleNextProp {};
};

class FunctionParameterInfo {
public:
    FunctionParameterInfo() = default;
    ~FunctionParameterInfo() = default;
    NO_COPY_SEMANTIC(FunctionParameterInfo);
    DEFAULT_MOVE_SEMANTIC(FunctionParameterInfo);

    const ir::Expression *typeAnnotation {};
    const ir::Expression *initNode {};
    const ir::Expression *bindingNode {};
    Type *initType {};
    Type *restType {};
    DestructuringType destructuringType {DestructuringType::NO_DESTRUCTURING};
    bool optionalParam {};
    util::StringView paramName {};
};

enum class CheckerStatus {
    NO_OPTS = 0,
    FORCE_TUPLE = 1 << 0,
};

DEFINE_BITOPS(CheckerStatus)

enum class VariableBindingContext {
    REGULAR,
    FOR_IN,
    FOR_OF,
};

class Checker {
public:
    explicit Checker(ArenaAllocator *allocator, binder::Binder *binder);
    ~Checker() = default;
    NO_COPY_SEMANTIC(Checker);
    NO_MOVE_SEMANTIC(Checker);

    void StartChecker();

    ArenaAllocator *Allocator() const
    {
        return allocator_;
    }

    binder::Binder *Binder()
    {
        return binder_;
    }

    binder::Scope *Scope() const;

    [[noreturn]] void ThrowTypeError(std::string_view message, const lexer::SourcePosition &pos);
    [[noreturn]] void ThrowTypeError(std::initializer_list<TypeErrorMessageElement> list,
                                     const lexer::SourcePosition &pos);

    Type *GlobalNumberType();
    Type *GlobalAnyType();
    Type *GlobalStringType();
    Type *GlobalBooleanType();
    Type *GlobalVoidType();
    Type *GlobalNullType();
    Type *GlobalUndefinedType();
    Type *GlobalUnknownType();
    Type *GlobalNeverType();
    Type *GlobalNonPrimitiveType();
    Type *GlobalBigintType();
    Type *GlobalFalseType();
    Type *GlobalTrueType();
    Type *GlobalNumberOrBigintType();
    Type *GlobalStringOrNumberType();
    Type *GlobalZeroType();
    Type *GlobalEmptyStringType();
    Type *GlobalZeroBigintType();
    Type *GlobalPrimitiveType();
    Type *GlobalEmptyTupleType();
    Type *GlobalEmptyObjectType();

    NumberLiteralPool &NumberLiteralMap();
    StringLiteralPool &StringLiteralMap();
    StringLiteralPool &BigintLiteralMap();

    TypeRelation *Relation();

    RelationHolder &IdenticalResults();
    RelationHolder &AssignableResults();
    RelationHolder &ComparableResults();

    std::unordered_set<const ir::AstNode *> &TypeStack();
    std::unordered_map<const ir::AstNode *, Type *> &NodeCache();
    Type *CheckTypeCached(const ir::Expression *expr);

    CheckerStatus Status();

    // Util
    static bool InAssignment(const ir::AstNode *node);
    static bool IsAssignmentOperator(lexer::TokenType op);
    Type *GetBaseTypeOfLiteralType(Type *type);
    static bool IsLiteralType(const Type *type);
    static const ir::AstNode *FindAncestorGivenByType(const ir::AstNode *node, ir::AstNodeType type);
    void CheckNonNullType(Type *type, lexer::SourcePosition lineInfo);
    static bool MaybeTypeOfKind(const Type *type, TypeFlag flags);
    static bool MaybeTypeOfKind(const Type *type, ObjectType::ObjectTypeKind kind);
    static bool IsConstantMemberAccess(const ir::Expression *expr);
    static bool IsStringLike(const ir::Expression *expr);
    void CheckTruthinessOfType(Type *type, lexer::SourcePosition lineInfo);

    // Helpers
    static const ir::TSQualifiedName *ResolveLeftMostQualifiedName(const ir::TSQualifiedName *qualifiedName);
    static const ir::MemberExpression *ResolveLeftMostMemberExpression(const ir::MemberExpression *expr);
    void CheckReferenceExpression(const ir::Expression *expr, const char *invalidReferenceMsg,
                                  const char *invalidOptionalChainMsg);
    void CheckTestingKnownTruthyCallableOrAwaitableType(const ir::Expression *condExpr, Type *type,
                                                        const ir::AstNode *body);
    Type *ExtractDefinitelyFalsyTypes(Type *type);
    Type *RemoveDefinitelyFalsyTypes(Type *type);
    TypeFlag GetFalsyFlags(Type *type);
    bool IsVariableUsedInConditionBody(const ir::AstNode *parent, binder::Variable *searchVar);
    bool FindVariableInBinaryExpressionChain(const ir::AstNode *parent, binder::Variable *searchVar);
    bool IsVariableUsedInBinaryExpressionChain(const ir::AstNode *parent, binder::Variable *searchVar);
    Type *CreateTupleTypeFromEveryArrayExpression(const ir::Expression *expr);
    [[noreturn]] void ThrowBinaryLikeError(lexer::TokenType op, Type *leftType, Type *rightType,
                                           lexer::SourcePosition lineInfo);
    [[noreturn]] void ThrowAssignmentError(Type *leftType, Type *rightType, lexer::SourcePosition lineInfo,
                                           bool isAsSrcLeftType = false);

    // Generics
    void CheckTypeParametersNotReferenced(const ir::AstNode *parent, const ir::TSTypeParameterDeclaration *typeParams,
                                          size_t index);
    std::vector<binder::Variable *> CheckTypeParameters(const ir::TSTypeParameterDeclaration *typeParams);
    Type *InstantiateGenericTypeAlias(binder::Variable *bindingVar, const ir::TSTypeParameterDeclaration *decl,
                                      const ir::TSTypeParameterInstantiation *typeParams,
                                      const lexer::SourcePosition &locInfo);
    Type *InstantiateGenericInterface(binder::Variable *bindingVar, const binder::Decl *decl,
                                      const ir::TSTypeParameterInstantiation *typeParams,
                                      const lexer::SourcePosition &locInfo);
    void ValidateTypeParameterInstantiation(size_t typeArgumentCount, size_t minTypeArgumentCount,
                                            size_t numOfTypeArguments, const util::StringView &name,
                                            const lexer::SourcePosition &locInfo);
    bool CheckTypeParametersAreIdentical(const std::pair<std::vector<binder::Variable *>, size_t> &collectedTypeParams,
                                         std::vector<binder::Variable *> &currentTypeParams) const;
    std::pair<std::vector<binder::Variable *>, size_t> CollectTypeParametersFromDeclarations(
        const ArenaVector<ir::TSInterfaceDeclaration *> &declarations);

    // Type creation
    Type *CreateNumberLiteralType(double value);
    Type *CreateBigintLiteralType(const util::StringView &str, bool negative);
    Type *CreateStringLiteralType(const util::StringView &str);
    Type *CreateFunctionTypeWithSignature(Signature *callSignature);
    Type *CreateConstructorTypeWithSignature(Signature *constructSignature);
    Type *CreateTupleType(ObjectDescriptor *desc, TupleElementFlagPool &&elementFlags, ElementFlags combinedFlags,
                          uint32_t minLength, uint32_t fixedLength, bool readonly);
    Type *CreateTupleType(ObjectDescriptor *desc, TupleElementFlagPool &&elementFlags, ElementFlags combinedFlags,
                          uint32_t minLength, uint32_t fixedLength, bool readonly, NamedTupleMemberPool &&namedMembers);
    Type *CreateUnionType(std::vector<Type *> &&constituentTypes);
    Type *CreateUnionType(std::initializer_list<Type *> constituentTypes);

    // Object
    ObjectLiteralPropertyInfo HandleObjectLiteralProperty(const ir::Property *prop, ObjectDescriptor *desc,
                                                          std::vector<Type *> *stringIndexTypes, bool readonly = false);
    void HandleSpreadElement(const ir::SpreadElement *spreadElem, ObjectDescriptor *desc, lexer::SourcePosition locInfo,
                             bool readonly = false);
    Type *CollectStringIndexInfoTypes(const ObjectDescriptor *desc, const std::vector<Type *> &stringIndexTypes);
    binder::Variable *ResolveNonComputedObjectProperty(const ir::MemberExpression *expr);
    util::StringView ToPropertyName(const ir::Expression *expr, TypeFlag propNameFlags, bool computed = false,
                                    bool *hasName = nullptr, Type **exprType = nullptr);
    void PrefetchTypeLiteralProperties(const ir::Expression *current, ObjectDescriptor *desc);
    void CheckTsTypeLiteralOrInterfaceMember(const ir::Expression *current, ObjectDescriptor *desc);
    Type *CheckIndexInfoProperty(IndexInfo *info, Type *objType, lexer::SourcePosition loc);
    Type *ResolveBasePropForObject(ObjectType *objType, util::StringView &name, Type *propNameType, bool isComputed,
                                   bool inAssignment, lexer::SourcePosition propLoc, lexer::SourcePosition exprLoc);
    Type *ResolveBaseProp(Type *baseType, const ir::Expression *prop, bool isComputed, lexer::SourcePosition exprLoc);
    binder::Variable *ResolveObjectProperty(const ir::MemberExpression *expr);
    Type *CheckTsPropertySignature(const ir::TSPropertySignature *propSignature, binder::LocalVariable *savedProp);
    Type *CheckTsMethodSignature(const ir::TSMethodSignature *methodSignature);
    void CheckTsIndexSignature(const ir::TSIndexSignature *indexSignature, ObjectDescriptor *desc);
    void CheckTsSignatureDeclaration(const ir::TSSignatureDeclaration *signatureNode, ObjectDescriptor *desc);
    void CheckTsPropertyOrMethodSignature(const ir::Expression *current, ObjectDescriptor *desc);
    void HandleNumberIndexInfo(ObjectDescriptor *desc, Type *indexType, bool readonly = false);
    util::StringView HandleComputedPropertyName(const ir::Expression *propKey, ObjectDescriptor *desc, Type *propType,
                                                std::vector<Type *> *stringIndexTypes, bool *handleNextProp,
                                                lexer::SourcePosition locInfo, bool readonly = false);
    void CheckIndexConstraints(Type *type) const;

    // Function
    Signature *HandleFunctionReturn(const ir::ScriptFunction *func, SignatureInfo *signatureInfo,
                                    binder::Variable *funcVar = nullptr);
    Type *CreateTypeForPatternParameter(const ir::Expression *patternNode, const ir::Expression *initNode);
    void CreateTypeForObjectPatternParameter(ObjectType *patternType, const ir::Expression *patternNode,
                                             const ir::Expression *initNode);
    void CheckFunctionParameterDeclaration(const ArenaVector<ir::Expression *> &params, SignatureInfo *signatureInfo);
    void InferFunctionDeclarationType(const binder::FunctionDecl *decl, binder::Variable *funcVar);
    void CollectTypesFromReturnStatements(const ir::AstNode *parent, std::vector<Type *> &returnTypes);
    void CheckAllCodePathsInNonVoidFunctionReturnOrThrow(const ir::ScriptFunction *func, lexer::SourcePosition lineInfo,
                                                         const char *errMsg);
    FunctionParameterInfo GetFunctionParameterInfo(ir::Expression *expr);
    Type *GetParamTypeFromParamInfo(const FunctionParameterInfo &paramInfo, Type *annotationType, Type *patternType);

    // Destructuring
    void HandleVariableDeclarationWithContext(const ir::Expression *id, Type *inferedType,
                                              VariableBindingContext context, DestructuringType destructuringType,
                                              bool annotationTypeUsed, bool inAssignment = false);
    void HandleIdentifierDeclarationWithContext(const ir::Identifier *identNode, Type *inferedType,
                                                DestructuringType destructuringType, bool annotationTypeUsed,
                                                bool inAssignment);
    void HandlePropertyDeclarationWithContext(const ir::Property *prop, Type *inferedType,
                                              VariableBindingContext context, DestructuringType destructuringType,
                                              bool annotationTypeUsed, bool inAssignment);
    void HandleAssignmentPatternWithContext(const ir::AssignmentExpression *assignmentPattern, Type *inferedType,
                                            VariableBindingContext context, DestructuringType destructuringType,
                                            bool annotationTypeUsed, bool inAssignment);
    void HandleArrayPatternWithContext(const ir::ArrayExpression *arrayPattern, Type *inferedType,
                                       VariableBindingContext context, bool annotationTypeUsed, bool inAssignment);
    void HandleRestElementWithContext(const ir::SpreadElement *restElement, Type *inferedType,
                                      VariableBindingContext context, DestructuringType destructuringType,
                                      bool annotationTypeUsed, bool inAssignment);
    void ValidateTypeAnnotationAndInitType(const ir::Expression *initNode, Type **initType, const Type *annotationType,
                                           Type *patternType, lexer::SourcePosition locInfo);
    Type *GetVariableType(const util::StringView &name, Type *inferedType, Type *initType, binder::Variable *resultVar,
                          DestructuringType destructuringType, const lexer::SourcePosition &locInfo,
                          bool annotationTypeUsed, bool inAssignment = false);
    Type *GetVariableTypeInObjectDestructuring(const util::StringView &name, Type *inferedType, Type *initType,
                                               bool annotationTypeUsed, const lexer::SourcePosition &locInfo,
                                               bool inAssignment = false);
    Type *GetVariableTypeInObjectDestructuringWithTargetUnion(const util::StringView &name, UnionType *inferedType,
                                                              Type *initType, bool annotationTypeUsed,
                                                              const lexer::SourcePosition &locInfo,
                                                              bool inAssignment = false);
    Type *GetVariableTypeInArrayDestructuring(Type *inferedType, Type *initType, const lexer::SourcePosition &locInfo,
                                              bool inAssignment);
    Type *GetVariableTypeInArrayDestructuringWithTargetUnion(UnionType *inferedType, Type *initType,
                                                             const lexer::SourcePosition &locInfo, bool inAssignment);
    Type *GetRestElementType(Type *inferedType, binder::Variable *resultVar, DestructuringType destructuringType,
                             const lexer::SourcePosition &locInfo, bool inAssignment = false);
    Type *GetRestElementTypeInArrayDestructuring(Type *inferedType, const lexer::SourcePosition &locInfo);
    Type *GetRestElementTypeInObjectDestructuring(Type *inferedType, const lexer::SourcePosition &locInfo);
    Type *GetNextInferedTypeForArrayPattern(Type *inferedType);
    Type *CreateTupleTypeForRest(TupleTypeIterator *iterator);
    Type *CreateArrayTypeForRest(UnionType *inferedType);
    Type *CreateObjectTypeForRest(ObjectType *objType);
    Type *CreateInitializerTypeForPattern(const Type *patternType, const ir::Expression *initNode,
                                          bool validateCurrent = true);
    Type *CreateInitializerTypeForObjectPattern(const ObjectType *patternType, const ir::ObjectExpression *initNode,
                                                bool validateCurrent);
    Type *CreateInitializerTypeForArrayPattern(const TupleType *patternType, const ir::ArrayExpression *initNode,
                                               bool validateCurrent);
    static bool ShouldCreatePropertyValueName(const ir::Expression *propValue);
    void CreatePatternName(const ir::AstNode *node, std::stringstream &ss) const;

    // Type elaboration
    bool ElaborateElementwise(TypeOrNode source, const Type *targetType, lexer::SourcePosition locInfo);
    bool ElaborateObjectLiteral(TypeOrNode source, const Type *targetType, lexer::SourcePosition locInfo);
    bool ElaborateObjectLiteralWithNode(const ir::ObjectExpression *sourceNode, const Type *targetType,
                                        ObjectLiteralElaborationData *elaborationData);
    void ElaborateObjectLiteralWithType(const ObjectLiteralType *sourceType, const Type *targetType,
                                        const std::unordered_map<uint32_t, ObjectType *> &potentialObjectTypes,
                                        lexer::SourcePosition locInfo);
    bool ElaborateArrayLiteral(TypeOrNode source, const Type *targetType, lexer::SourcePosition locInfo);
    void ElaborateArrayLiteralWithNode(const ir::ArrayExpression *sourceNode, const Type *targetType,
                                       std::unordered_map<uint32_t, Type *> *potentialTypes,
                                       lexer::SourcePosition locInfo);
    void ElaborateArrayLiteralWithType(const TupleType *sourceType, const Type *targetType,
                                       const std::unordered_map<uint32_t, Type *> &potentialTypes);
    void GetPotentialTypesAndIndexInfosForElaboration(const Type *targetType,
                                                      ObjectLiteralElaborationData *elaborationData);
    static IndexInfoTypePair GetIndexInfoTypePair(const ObjectType *type);
    void CheckTargetTupleLengthConstraints(const Type *targetType, const ir::ArrayExpression *sourceNode,
                                           std::unordered_map<uint32_t, Type *> *potentialTypes,
                                           const lexer::SourcePosition &locInfo);
    std::vector<Type *> CollectTargetTypesForArrayElaborationWithNodeFromTargetUnion(
        std::unordered_map<uint32_t, Type *> *potentialTypes, const ir::Expression *currentSourceElement,
        uint32_t tupleIdx);
    static std::vector<Type *> CollectTargetTypesForArrayElaborationWithTypeFromTargetUnion(
        const std::unordered_map<uint32_t, Type *> &potentialTypes, uint32_t tupleIdx);
    static bool CheckIfExcessTypeCheckNeededForObjectElaboration(const Type *targetType,
                                                                 ObjectLiteralElaborationData *elaborationData);
    Type *GetTargetPropertyTypeFromTargetForElaborationWithNode(const Type *targetType,
                                                                ObjectLiteralElaborationData *elaborationData,
                                                                const util::StringView &propName,
                                                                const ir::Expression *propValue);
    Type *GetTargetPropertyTypeFromTargetForElaborationWithType(
        const Type *targetType, const std::unordered_map<uint32_t, ObjectType *> &potentialObjectTypes,
        const util::StringView &propName);
    Type *GetindexInfoTypeOrThrowError(const Type *targetType, ObjectLiteralElaborationData *elaborationData,
                                       const util::StringView &propName, bool computed, bool numberLiteralName,
                                       lexer::SourcePosition locInfo);
    Type *GetUnaryResultType(Type *operandType);
    Type *InferVariableDeclarationType(const ir::Identifier *decl);

    // Type relation
    bool IsTypeIdenticalTo(const Type *source, const Type *target) const;
    bool IsTypeIdenticalTo(const Type *source, const Type *target, const std::string &errMsg,
                           const lexer::SourcePosition &errPos) const;
    bool IsTypeIdenticalTo(const Type *source, const Type *target, std::initializer_list<TypeErrorMessageElement> list,
                           const lexer::SourcePosition &errPos) const;
    bool IsTypeAssignableTo(const Type *source, const Type *target) const;
    bool IsTypeAssignableTo(const Type *source, const Type *target, const std::string &errMsg,
                            const lexer::SourcePosition &errPos) const;
    bool IsTypeAssignableTo(const Type *source, const Type *target, std::initializer_list<TypeErrorMessageElement> list,
                            const lexer::SourcePosition &errPos) const;
    bool IsTypeComparableTo(const Type *source, const Type *target) const;
    bool IsTypeComparableTo(const Type *source, const Type *target, const std::string &errMsg,
                            const lexer::SourcePosition &errPos) const;
    bool IsTypeComparableTo(const Type *source, const Type *target, std::initializer_list<TypeErrorMessageElement> list,
                            const lexer::SourcePosition &errPos) const;
    bool AreTypesComparable(const Type *source, const Type *target) const;
    bool IsTypeEqualityComparableTo(const Type *source, const Type *target) const;
    bool IsAllTypesAssignableTo(Type *source, Type *target);

    // Binary like expression
    Type *CheckBinaryOperator(Type *leftType, Type *rightType, const ir::Expression *leftExpr,
                              const ir::Expression *rightExpr, const ir::AstNode *expr, lexer::TokenType op);
    Type *CheckPlusOperator(Type *leftType, Type *rightType, const ir::Expression *leftExpr,
                            const ir::Expression *rightExpr, const ir::AstNode *expr, lexer::TokenType op);
    Type *CheckCompareOperator(Type *leftType, Type *rightType, const ir::Expression *leftExpr,
                               const ir::Expression *rightExpr, const ir::AstNode *expr, lexer::TokenType op);
    Type *CheckAndOperator(Type *leftType, Type *rightType, const ir::Expression *leftExpr);
    Type *CheckOrOperator(Type *leftType, Type *rightType, const ir::Expression *leftExpr);
    Type *CheckInstanceofExpression(Type *leftType, Type *rightType, const ir::Expression *rightExpr,
                                    const ir::AstNode *expr);
    Type *CheckInExpression(Type *leftType, Type *rightType, const ir::Expression *leftExpr,
                            const ir::Expression *rightExpr, const ir::AstNode *expr);
    void CheckAssignmentOperator(lexer::TokenType op, const ir::Expression *leftExpr, Type *leftType, Type *valueType);

    friend class ScopeContext;

private:
    ArenaAllocator *allocator_;
    binder::Binder *binder_;
    const ir::BlockStatement *rootNode_;
    binder::Scope *scope_;
    GlobalTypesHolder *globalTypes_;

    NumberLiteralPool numberLiteralMap_;
    StringLiteralPool stringLiteralMap_;
    StringLiteralPool bigintLiteralMap_;

    TypeRelation *relation_;

    RelationHolder identicalResults_;
    RelationHolder assignableResults_;
    RelationHolder comparableResults_;

    std::unordered_set<const ir::AstNode *> typeStack_;
    std::unordered_map<const ir::AstNode *, Type *> nodeCache_;
    std::vector<binder::Scope *> scopeStack_;

    CheckerStatus status_;
};

class ScopeContext {
public:
    explicit ScopeContext(Checker *checker, binder::Scope *newScope) : checker_(checker), prevScope_(checker_->scope_)
    {
        checker_->scope_ = newScope;
    }

    ~ScopeContext()
    {
        checker_->scope_ = prevScope_;
    }

    NO_COPY_SEMANTIC(ScopeContext);
    NO_MOVE_SEMANTIC(ScopeContext);

private:
    Checker *checker_;
    binder::Scope *prevScope_;
};

}  // namespace panda::es2panda::checker

#endif /* CHECKER_H */
