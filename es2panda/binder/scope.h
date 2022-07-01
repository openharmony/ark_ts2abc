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

#ifndef ES2PANDA_COMPILER_SCOPES_SCOPE_H
#define ES2PANDA_COMPILER_SCOPES_SCOPE_H

#include <binder/declaration.h>
#include <binder/variable.h>
#include <parser/program/program.h>
#include <util/enumbitops.h>
#include <util/ustring.h>

#include <map>
#include <unordered_map>
#include <vector>

namespace panda::es2panda::compiler {
class IRNode;
}  // namespace panda::es2panda::compiler

namespace panda::es2panda::binder {

#define DECLARE_CLASSES(type, className) class className;
SCOPE_TYPES(DECLARE_CLASSES)
#undef DECLARE_CLASSES

class Scope;
class VariableScope;
class Variable;

using VariableMap = ArenaUnorderedMap<util::StringView, Variable *>;

class ScopeFindResult {
public:
    ScopeFindResult() = default;
    ScopeFindResult(util::StringView n, Scope *s, uint32_t l, Variable *v) : ScopeFindResult(n, s, l, l, v) {}
    ScopeFindResult(Scope *s, uint32_t l, uint32_t ll, Variable *v) : scope(s), level(l), lexLevel(ll), variable(v) {}
    ScopeFindResult(util::StringView n, Scope *s, uint32_t l, uint32_t ll, Variable *v)
        : name(n), scope(s), level(l), lexLevel(ll), variable(v)
    {
    }

    util::StringView name {};
    Scope *scope {};
    uint32_t level {};
    uint32_t lexLevel {};
    Variable *variable {};
};

class Scope {
public:
    virtual ~Scope() = default;
    NO_COPY_SEMANTIC(Scope);
    NO_MOVE_SEMANTIC(Scope);

    virtual ScopeType Type() const = 0;

#define DECLARE_CHECKS_CASTS(scopeType, className)        \
    bool Is##className() const                            \
    {                                                     \
        return Type() == ScopeType::scopeType;            \
    }                                                     \
    className *As##className()                            \
    {                                                     \
        ASSERT(Is##className());                          \
        return reinterpret_cast<className *>(this);       \
    }                                                     \
    const className *As##className() const                \
    {                                                     \
        ASSERT(Is##className());                          \
        return reinterpret_cast<const className *>(this); \
    }
    SCOPE_TYPES(DECLARE_CHECKS_CASTS)
#undef DECLARE_CHECKS_CASTS

    bool IsVariableScope() const
    {
        return Type() > ScopeType::LOCAL;
    }

    bool IsFunctionVariableScope() const
    {
        return Type() >= ScopeType::FUNCTION;
    }

    FunctionScope *AsFunctionVariableScope()
    {
        ASSERT(IsFunctionVariableScope());
        return reinterpret_cast<FunctionScope *>(this);
    }

    const FunctionScope *AsFunctionVariableScope() const
    {
        ASSERT(IsFunctionVariableScope());
        return reinterpret_cast<const FunctionScope *>(this);
    }

    VariableScope *AsVariableScope()
    {
        ASSERT(IsVariableScope());
        return reinterpret_cast<VariableScope *>(this);
    }

    const VariableScope *AsVariableScope() const
    {
        ASSERT(IsVariableScope());
        return reinterpret_cast<const VariableScope *>(this);
    }

    VariableScope *EnclosingVariableScope();

    const ArenaVector<Decl *> &Decls() const
    {
        return decls_;
    }

    Scope *Parent()
    {
        return parent_;
    }

    const Scope *Parent() const
    {
        return parent_;
    }

    const compiler::IRNode *ScopeStart() const
    {
        return startIns_;
    }

    const compiler::IRNode *ScopeEnd() const
    {
        return endIns_;
    }

    void SetScopeStart(const compiler::IRNode *ins)
    {
        startIns_ = ins;
    }

    void SetScopeEnd(const compiler::IRNode *ins)
    {
        endIns_ = ins;
    }

    const ir::AstNode *Node() const
    {
        return node_;
    }

    void BindNode(const ir::AstNode *node)
    {
        node_ = node;
    }

    bool AddDecl(ArenaAllocator *allocator, Decl *decl, [[maybe_unused]] ScriptExtension extension)
    {
        decls_.push_back(decl);
        return AddBinding(allocator, FindLocal(decl->Name()), decl, extension);
    }

    bool AddTsDecl(ArenaAllocator *allocator, Decl *decl, [[maybe_unused]] ScriptExtension extension)
    {
        decls_.push_back(decl);
        return AddBinding(allocator, FindLocal(decl->Name(), ResolveBindingOptions::ALL), decl, extension);
    }

    template <typename T, typename... Args>
    T *NewDecl(ArenaAllocator *allocator, Args &&... args);

    template <typename DeclType, typename VariableType>
    VariableType *AddDecl(ArenaAllocator *allocator, util::StringView name, VariableFlags flags);

    template <typename DeclType = binder::LetDecl, typename VariableType = binder::LocalVariable>
    static VariableType *CreateVar(ArenaAllocator *allocator, util::StringView name, VariableFlags flags,
                                   const ir::AstNode *node);

    template <typename T, typename... Args>
    void PropagateBinding(ArenaAllocator *allocator, util::StringView name, Args &&... args);

    VariableMap &Bindings()
    {
        return bindings_;
    }

    const VariableMap &Bindings() const
    {
        return bindings_;
    }

    virtual bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                            [[maybe_unused]] ScriptExtension extension) = 0;

    Variable *FindLocal(const util::StringView &name,
                        ResolveBindingOptions options = ResolveBindingOptions::BINDINGS) const;

    ScopeFindResult Find(const util::StringView &name,
                         ResolveBindingOptions options = ResolveBindingOptions::BINDINGS) const;

    Decl *FindDecl(const util::StringView &name) const;

protected:
    explicit Scope(ArenaAllocator *allocator, Scope *parent)
        : parent_(parent), decls_(allocator->Adapter()), bindings_(allocator->Adapter())
    {
    }

    /**
     * @return true - if the variable is shadowed
     *         false - otherwise
     */
    using VariableVisitior = std::function<bool(const Variable *)>;

    /**
     * @return true - if the variable is shadowed
     *         false - otherwise
     */
    std::tuple<Scope *, bool> IterateShadowedVariables(const util::StringView &name, const VariableVisitior &visitor);

    bool AddLocal(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                  [[maybe_unused]] ScriptExtension extension);

    Scope *parent_ {};
    ArenaVector<Decl *> decls_;
    VariableMap bindings_;
    const ir::AstNode *node_ {};
    const compiler::IRNode *startIns_ {};
    const compiler::IRNode *endIns_ {};
};

class VariableScope : public Scope {
public:
    ~VariableScope() override = default;
    NO_COPY_SEMANTIC(VariableScope);
    NO_MOVE_SEMANTIC(VariableScope);

    void AddFlag(VariableScopeFlags flag)
    {
        flags_ |= flag;
    }

    void ClearFlag(VariableScopeFlags flag)
    {
        flags_ &= ~flag;
    }

    bool HasFlag(VariableScopeFlags flag) const
    {
        return (flags_ & flag) != 0;
    }

    uint32_t NextSlot()
    {
        return slotIndex_++;
    }

    uint32_t LexicalSlots() const
    {
        return slotIndex_;
    }

    bool NeedLexEnv() const
    {
        return slotIndex_ != 0;
    }

protected:
    explicit VariableScope(ArenaAllocator *allocator, Scope *parent) : Scope(allocator, parent) {}

    template <typename T>
    bool AddVar(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl);

    template <typename T>
    bool AddFunction(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                     [[maybe_unused]] ScriptExtension extension);

    template <typename T>
    bool AddTSBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl, VariableFlags flags);

    template <typename T>
    bool AddLexical(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl);

    VariableScopeFlags flags_ {};
    uint32_t slotIndex_ {};
};

class ParamScope : public Scope {
public:
    ScopeType Type() const override
    {
        return ScopeType::PARAM;
    }

    ArenaVector<LocalVariable *> &Params()
    {
        return params_;
    }

    const ArenaVector<LocalVariable *> &Params() const
    {
        return params_;
    }

    std::tuple<ParameterDecl *, const ir::AstNode *> AddParamDecl(ArenaAllocator *allocator, const ir::AstNode *param);

protected:
    explicit ParamScope(ArenaAllocator *allocator, Scope *parent)
        : Scope(allocator, parent), params_(allocator->Adapter())
    {
    }

    bool AddParam(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl, VariableFlags flags);

    ArenaVector<LocalVariable *> params_;
};

class FunctionScope;

class FunctionParamScope : public ParamScope {
public:
    explicit FunctionParamScope(ArenaAllocator *allocator, Scope *parent) : ParamScope(allocator, parent) {}

    FunctionScope *GetFunctionScope() const
    {
        return functionScope_;
    }

    void BindFunctionScope(FunctionScope *funcScope)
    {
        functionScope_ = funcScope;
    }

    LocalVariable *NameVar() const
    {
        return nameVar_;
    }

    void BindName(ArenaAllocator *allocator, util::StringView name);

    ScopeType Type() const override
    {
        return ScopeType::FUNCTION_PARAM;
    }

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override;

    friend class FunctionScope;
    template <typename E, typename T>
    friend class ScopeWithParamScope;

private:
    FunctionScope *functionScope_ {};
    LocalVariable *nameVar_ {};
};

template <typename E, typename T>
class ScopeWithParamScope : public E {
public:
    explicit ScopeWithParamScope(ArenaAllocator *allocator, Scope *parent) : E(allocator, parent) {}

    void BindParamScope(T *paramScope)
    {
        AssignParamScope(paramScope);
        this->bindings_ = paramScope->Bindings();
    }

    void AssignParamScope(T *paramScope)
    {
        ASSERT(this->parent_ == paramScope);
        ASSERT(this->bindings_.empty());

        paramScope_ = paramScope;
    }

    T *ParamScope()
    {
        return paramScope_;
    }

    const T *ParamScope() const
    {
        return paramScope_;
    }

protected:
    T *paramScope_;
};

class FunctionScope : public ScopeWithParamScope<VariableScope, FunctionParamScope> {
public:
    explicit FunctionScope(ArenaAllocator *allocator, Scope *parent) : ScopeWithParamScope(allocator, parent) {}

    ScopeType Type() const override
    {
        return ScopeType::FUNCTION;
    }

    void BindName(util::StringView name, util::StringView internalName)
    {
        name_ = name;
        internalName_ = internalName;
    }

    const util::StringView &Name() const
    {
        return name_;
    }

    const util::StringView &InternalName() const
    {
        return internalName_;
    }

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override;

private:
    util::StringView name_ {};
    util::StringView internalName_ {};
};

class LocalScope : public Scope {
public:
    explicit LocalScope(ArenaAllocator *allocator, Scope *parent) : Scope(allocator, parent) {}

    ScopeType Type() const override
    {
        return ScopeType::LOCAL;
    }

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override;
};

class CatchParamScope : public ParamScope {
public:
    explicit CatchParamScope(ArenaAllocator *allocator, Scope *parent) : ParamScope(allocator, parent) {}

    ScopeType Type() const override
    {
        return ScopeType::CATCH_PARAM;
    }

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override;

    friend class CatchScope;
};

class CatchScope : public ScopeWithParamScope<LocalScope, CatchParamScope> {
public:
    explicit CatchScope(ArenaAllocator *allocator, Scope *parent) : ScopeWithParamScope(allocator, parent) {}

    ScopeType Type() const override
    {
        return ScopeType::CATCH;
    }

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override;
};

class LoopScope;

class LoopDeclarationScope : public VariableScope {
public:
    explicit LoopDeclarationScope(ArenaAllocator *allocator, Scope *parent) : VariableScope(allocator, parent) {}

    ScopeType Type() const override
    {
        return loopType_;
    }

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override
    {
        return AddLocal(allocator, currentVariable, newDecl, extension);
    }

    Scope *InitScope()
    {
        if (NeedLexEnv()) {
            return initScope_;
        }

        return this;
    }

    void ConvertToVariableScope(ArenaAllocator *allocator);

private:
    friend class LoopScope;
    LoopScope *loopScope_ {};
    LocalScope *initScope_ {};
    ScopeType loopType_ {ScopeType::LOCAL};
};

class LoopScope : public VariableScope {
public:
    explicit LoopScope(ArenaAllocator *allocator, Scope *parent) : VariableScope(allocator, parent) {}

    LoopDeclarationScope *DeclScope()
    {
        return declScope_;
    }

    void BindDecls(LoopDeclarationScope *declScope)
    {
        declScope_ = declScope;
        declScope_->loopScope_ = this;
    }

    ScopeType Type() const override
    {
        return loopType_;
    }

    void ConvertToVariableScope(ArenaAllocator *allocator);

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override
    {
        return AddLocal(allocator, currentVariable, newDecl, extension);
    }

protected:
    LoopDeclarationScope *declScope_ {};
    ScopeType loopType_ {ScopeType::LOCAL};
};

class GlobalScope : public FunctionScope {
public:
    explicit GlobalScope(ArenaAllocator *allocator) : FunctionScope(allocator, nullptr)
    {
        auto *paramScope = allocator->New<FunctionParamScope>(allocator, this);
        paramScope_ = paramScope;
    }

    ScopeType Type() const override
    {
        return ScopeType::GLOBAL;
    }

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override;
};

class ModuleScope : public GlobalScope {
public:
    template <typename K, typename V>
    using ModuleEntry = ArenaVector<std::pair<K, V>>;
    using ImportDeclList = ArenaVector<ImportDecl *>;
    using ExportDeclList = ArenaVector<ExportDecl *>;
    using LocalExportNameMap = ArenaMultiMap<binder::Variable *, util::StringView>;

    explicit ModuleScope(ArenaAllocator *allocator)
        : GlobalScope(allocator),
          allocator_(allocator),
          imports_(allocator_->Adapter()),
          exports_(allocator_->Adapter()),
          localExports_(allocator_->Adapter())
    {
    }

    ScopeType Type() const override
    {
        return ScopeType::MODULE;
    }

    const ModuleEntry<const ir::ImportDeclaration *, ImportDeclList> &Imports() const
    {
        return imports_;
    }

    const ModuleEntry<const ir::AstNode *, ExportDeclList> &Exports() const
    {
        return exports_;
    }

    const LocalExportNameMap &LocalExports() const
    {
        return localExports_;
    }

    void AddImportDecl(const ir::ImportDeclaration *importDecl, ImportDeclList &&decls);

    void AddExportDecl(const ir::AstNode *exportDecl, ExportDecl *decl);

    void AddExportDecl(const ir::AstNode *exportDecl, ExportDeclList &&decls);

    bool AddBinding(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                    [[maybe_unused]] ScriptExtension extension) override;

    bool ExportAnalysis();

private:
    bool AddImport(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl);

    ArenaAllocator *allocator_;
    ModuleEntry<const ir::ImportDeclaration *, ImportDeclList> imports_;
    ModuleEntry<const ir::AstNode *, ExportDeclList> exports_;
    LocalExportNameMap localExports_;
};

template <typename T>
bool VariableScope::AddVar(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl)
{
    if (!currentVariable) {
        bindings_.insert({newDecl->Name(), allocator->New<T>(newDecl, VariableFlags::HOIST_VAR)});
        return true;
    }

    switch (currentVariable->Declaration()->Type()) {
        case DeclType::VAR: {
            currentVariable->Reset(newDecl, VariableFlags::HOIST_VAR);
            break;
        }
        case DeclType::PARAM:
        case DeclType::FUNC: {
            break;
        }
        default: {
            return false;
        }
    }

    return true;
}

template <typename T>
bool VariableScope::AddFunction(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl,
                                [[maybe_unused]] ScriptExtension extension)
{
    VariableFlags flags = (extension == ScriptExtension::JS) ? VariableFlags::HOIST_VAR : VariableFlags::HOIST;

    if (!currentVariable) {
        bindings_.insert({newDecl->Name(), allocator->New<T>(newDecl, flags)});
        return true;
    }

    if (extension != ScriptExtension::JS || IsModuleScope()) {
        return false;
    }

    switch (currentVariable->Declaration()->Type()) {
        case DeclType::VAR:
        case DeclType::FUNC: {
            currentVariable->Reset(newDecl, VariableFlags::HOIST_VAR);
            break;
        }
        default: {
            return false;
        }
    }

    return true;
}

template <typename T>
bool VariableScope::AddTSBinding(ArenaAllocator *allocator, [[maybe_unused]] Variable *currentVariable, Decl *newDecl,
                                 VariableFlags flags)
{
    ASSERT(!currentVariable);
    bindings_.insert({newDecl->Name(), allocator->New<T>(newDecl, flags)});
    return true;
}

template <typename T>
bool VariableScope::AddLexical(ArenaAllocator *allocator, Variable *currentVariable, Decl *newDecl)
{
    if (currentVariable) {
        return false;
    }

    bindings_.insert({newDecl->Name(), allocator->New<T>(newDecl, VariableFlags::NONE)});
    return true;
}

template <typename T, typename... Args>
T *Scope::NewDecl(ArenaAllocator *allocator, Args &&... args)
{
    T *decl = allocator->New<T>(std::forward<Args>(args)...);
    decls_.push_back(decl);

    return decl;
}

template <typename DeclType, typename VariableType>
VariableType *Scope::AddDecl(ArenaAllocator *allocator, util::StringView name, VariableFlags flags)
{
    if (FindLocal(name)) {
        return nullptr;
    }

    auto *decl = allocator->New<DeclType>(name);
    auto *variable = allocator->New<VariableType>(decl, flags);

    decls_.push_back(decl);
    bindings_.insert({decl->Name(), variable});

    return variable;
}

template <typename DeclType, typename VariableType>
VariableType *Scope::CreateVar(ArenaAllocator *allocator, util::StringView name, VariableFlags flags,
                               const ir::AstNode *node)
{
    auto *decl = allocator->New<DeclType>(name);
    auto *variable = allocator->New<VariableType>(decl, flags);
    decl->BindNode(node);
    return variable;
}

template <typename T, typename... Args>
void Scope::PropagateBinding(ArenaAllocator *allocator, util::StringView name, Args &&... args)
{
    auto res = bindings_.find(name);
    if (res == bindings_.end()) {
        bindings_.insert({name, allocator->New<T>(std::forward<Args>(args)...)});
        return;
    }

    res->second->Reset(std::forward<Args>(args)...);
}

}  // namespace panda::es2panda::binder

#endif
