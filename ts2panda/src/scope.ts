/*
 * Copyright (c) 2021-2022 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as ts from "typescript";
import { LOGD, LOGE } from "./log";
import {
    GlobalVariable,
    LocalVariable,
    VarDeclarationKind,
    Variable
} from "./variable";

export enum InitStatus {
    INITIALIZED, UNINITIALIZED
}

export abstract class Decl {
    name: string;
    node: ts.Node;
    constructor(name: string, node: ts.Node) {
        this.name = name;
        this.node = node;
    }
}

export class VarDecl extends Decl {
    constructor(varName: string, node: ts.Node) {
        super(varName, node);
    }
}

export class LetDecl extends Decl {
    constructor(letName: string, node: ts.Node) {
        super(letName, node);
    }
}

export class ConstDecl extends Decl {
    constructor(constName: string, node: ts.Node) {
        super(constName, node);
    }
}

export class FuncDecl extends Decl {
    constructor(funcName: string, node: ts.Node) {
        super(funcName, node);
    }
}

export class ClassDecl extends Decl {
    constructor(className: string, node: ts.Node) {
        super(className, node);
    }
}

export class CatchParameter extends Decl {
    constructor(CpName: string, node: ts.Node) {
        super(CpName, node);
    }
}

export class FunctionParameter extends Decl {
    constructor(FpName: string, node: ts.Node) {
        super(FpName, node);
    }
}

export abstract class Scope {
    protected debugTag = "scope";
    protected globals: Variable[] = [];
    protected locals: Variable[] = [];
    protected name2variable: Map<string, Variable> = new Map<string, Variable>();
    protected decls: Decl[] = [];
    protected parent: Scope | undefined = undefined;
    // for debuginfo
    protected startInsIdx: number | undefined;
    protected endInsIdx: number | undefined;
    private callOpt: Set<String> = new Set();
    private isArgumentsOrRestargs: boolean = false;

    constructor() { }

    abstract add(name: string, declKind: VarDeclarationKind, status?: InitStatus): Variable | undefined;

    getName2variable(): Map<string, Variable> {
        return this.name2variable;
    }

    getScopeStartInsIdx() {
        return this.startInsIdx;
    }

    setScopeStartInsIdx(startInsIdx: number) {
        this.startInsIdx = startInsIdx;
    }

    setScopeEndInsIdx(endInsIdx: number) {
        this.endInsIdx = endInsIdx;
    }

    getScopeEndInsIdx() {
        return this.endInsIdx;
    }

    setParent(parentScope: Scope | undefined) {
        this.parent = parentScope;
    }

    getParent(): Scope | undefined {
        return this.parent;
    }

    getRootScope(): Scope {
        let sp: Scope | undefined = this;
        let pp = this.getParent();
        while (pp != undefined) {
            sp = pp;
            pp = pp.getParent();
        }

        return sp;
    }

    getNearestVariableScope(): VariableScope | undefined {
        let sp: Scope | undefined = this;

        while (sp) {
            if (sp instanceof VariableScope) {
                return <VariableScope>sp;
            }
            sp = sp.parent;
        }

        return undefined;
    }

    getNearestLexicalScope(): VariableScope | LoopScope | undefined {
        let curScope: Scope | undefined = this;

        while (curScope) {
            if (curScope instanceof VariableScope || curScope instanceof LoopScope) {
                return <VariableScope | LoopScope>curScope;
            }
            curScope = curScope.parent;
        }

        return undefined;
    }

    getNthVariableScope(level: number): VariableScope | undefined {
        let sp: Scope | undefined = this;
        let tempLevel = level;

        while (sp) {
            if (sp instanceof VariableScope) {
                if (tempLevel == 0) {
                    return <VariableScope>sp;
                } else {
                    tempLevel--;
                }
            }
            sp = sp.parent;
        }

        return undefined;
    }

    findLocal(name: string): Variable | undefined {
        return this.name2variable.get(name);
    }

    find(name: string): { scope: Scope | undefined, level: number, v: Variable | undefined } {
        let curLevel = 0;
        let curScope: Scope | undefined = this;

        while (curScope) {
            let resolve = null;
            let tmpLevel = curLevel; // to store current level, not impact by ++
            if (curScope instanceof VariableScope || (curScope instanceof LoopScope && curScope.need2CreateLexEnv())) {
                curLevel++;
            }
            resolve = curScope.findLocal(name);
            if (resolve) {
                LOGD(this.debugTag, "scope.find (" + name + ") :");
                LOGD(undefined, resolve);
                return { scope: curScope, level: tmpLevel, v: resolve };
            }

            curScope = curScope.getParent();
        }

        LOGD(this.debugTag, "scope.find (" + name + ") : undefined");
        return { scope: undefined, level: 0, v: undefined };
    }

    findDeclPos(name: string): Scope | undefined {
        let declPos: Scope | undefined = undefined;
        let curScope: Scope | undefined = this;
        while (curScope) {
            if (curScope.hasDecl(name)) {
                declPos = curScope;
                break;
            }

            curScope = curScope.getParent();
        }

        return declPos;
    }

    abstract setLexVar(v: Variable, srcScope: Scope): void;

    setDecls(decl: Decl) {
        this.decls.push(decl);
    }

    hasDecl(name: string): boolean {
        let decls = this.decls;
        for (let i = 0; i < decls.length; i++) {
            if (decls[i].name == name) {
                return true;
            }
        }

        return false;
    }

    getDecl(name: string): Decl | undefined {
        let decls = this.decls;
        for (let i = 0; i < decls.length; i++) {
            if (decls[i].name == name) {
                return decls[i];
            }
        }

        return undefined;
    }

    getDecls() {
        return this.decls;
    }

    public getCallOpt() {
        return this.callOpt;
    }

    public setCallOpt(key: String) {
        if (this instanceof FunctionScope) {
            this.callOpt.add(key);
        } else {
            let parent = this.parent;
            while (parent != undefined) {
                if (parent instanceof FunctionScope) {
                    parent.callOpt.add(key);
                    break;
                } else {
                    parent = parent.parent;
                }
            }
        }
    }

    public setArgumentsOrRestargs() {
        this.isArgumentsOrRestargs = true;
    }

    public getArgumentsOrRestargs() {
        return this.isArgumentsOrRestargs;
    }
}

export abstract class VariableScope extends Scope {
    protected startLexIdx: number = 0;
    protected needCreateLexEnv: boolean = false;
    protected parameters: LocalVariable[] = [];
    protected useArgs = false;
    protected node: ts.Node | undefined = undefined;
    protected parentVariableScope: VariableScope | null = null;
    protected childVariableScope: VariableScope[] = [];
    protected lexVarInfo: Map<string, number> = new Map<string, number>();

    getLexVarInfo() {
        return this.lexVarInfo;
    }

    getBindingNode() {
        return this.node;
    }

    setParentVariableScope(scope: VariableScope) {
        this.parentVariableScope = scope;
    }

    getParentVariableScope() {
        return this.parentVariableScope;
    }

    getChildVariableScope() {
        return this.childVariableScope;
    }

    addChildVariableScope(scope: VariableScope) {
        this.childVariableScope.push(scope);
    }

    addParameter(name: string, declKind: VarDeclarationKind, argIdx: number): Variable | undefined {
        LOGD(this.debugTag, "VariableScope.addArg(" + name + "), kind(" + declKind + ")", "argIdx(" + argIdx + ")");
        let v = this.add(name, declKind, InitStatus.INITIALIZED);
        if (!(v instanceof LocalVariable)) {
            throw new Error("Error: argument must be local variable!");
        }
        this.parameters.push(v);
        return v;
    }

    addFuncName(funcName: string) {
        let funcObj = this.name2variable.get('4funcObj');
        this.name2variable.set(funcName, funcObj!);
    }

    need2CreateLexEnv(): boolean {
        return this.needCreateLexEnv;
    }

    pendingCreateEnv() {
        this.needCreateLexEnv = true;
    }

    getNumLexEnv(): number {
        return this.startLexIdx;
    }

    getParametersCount(): number {
        return this.parameters.length;
    }

    getParameters(): LocalVariable[] {
        return this.parameters;
    }

    getLexVarIdx() {
        this.needCreateLexEnv = true;
        return this.startLexIdx++;
    }

    setLexVar(v: Variable, refScope: Scope) {
        if (!v.isLexVar) {
            let slot = v.setLexVar(this);
            this.lexVarInfo.set(v.getName(), slot);
        }

        LOGD(this.debugTag, "VariableScope.setLexVar(" + v.idxLex + ")");
        // set all chain to create env
        let scope: Scope | undefined = refScope;
        while (scope && scope != this) {
            if (scope instanceof VariableScope || (scope instanceof LoopScope && scope.need2CreateLexEnv())) {
                scope.pendingCreateEnv();
            }

            scope = scope.getParent();
        }
    }

    setUseArgs(value: boolean) {
        this.useArgs = value;
    }

    getUseArgs(): boolean {
        return this.useArgs;
    }
}

export class GlobalScope extends VariableScope {
    constructor(node?: ts.SourceFile) {
        super();
        this.node = node ? node : undefined;
    }

    add(name: string, declKind: VarDeclarationKind, status?: InitStatus): Variable | undefined {
        LOGD(this.debugTag, "globalscope.add (" + name + "), kind:" + declKind);
        let v: Variable | undefined;
        if (declKind == VarDeclarationKind.NONE || declKind == VarDeclarationKind.VAR || declKind == VarDeclarationKind.FUNCTION) {
            v = new GlobalVariable(declKind, name);
            this.globals.push(v);
        } else {
            v = new LocalVariable(declKind, name, status);
            this.locals.push(v);
        }
        this.name2variable.set(name, v);
        return v;
    }
}

export class ModuleScope extends VariableScope {
    constructor(node?: ts.SourceFile | ts.ModuleBlock) {
        super();
        this.node = node ? node : undefined;
    }

    add(name: string, declKind: VarDeclarationKind, status?: InitStatus): Variable | undefined {
        LOGD(this.debugTag, "modulescope.add (" + name + "), kind:" + declKind);
        let v: Variable | undefined;
        if (declKind == VarDeclarationKind.NONE) {
            v = new GlobalVariable(declKind, name);
            this.globals.push(v);
        } else if (declKind == VarDeclarationKind.VAR || declKind == VarDeclarationKind.FUNCTION) {
            v = new LocalVariable(declKind, name);
            this.locals.push(v);
        } else {
            v = new LocalVariable(declKind, name, status);
            this.locals.push(v);
        }
        this.name2variable.set(name, v);
        return v;
    }
}

export class FunctionScope extends VariableScope {
    private parameterLength: number = 0;
    private funcName: string = "";
    constructor(parent?: Scope, node?: ts.FunctionLikeDeclaration) {
        super();
        this.parent = parent ? parent : undefined;
        this.node = node ? node : undefined;
    }

    setParameterLength(length: number) {
        this.parameterLength = length;
    }

    getParameterLength(): number {
        return this.parameterLength;
    }

    setFuncName(name: string) {
        this.funcName = name;
    }

    getFuncName() {
        return this.funcName;
    }

    getParent(): Scope | undefined {
        return this.parent;
    }

    add(name: string, declKind: VarDeclarationKind, status?: InitStatus): Variable | undefined {
        let v: Variable | undefined;
        LOGD(this.debugTag, "functionscope.add (" + name + "), kind:" + declKind);

        if (declKind == VarDeclarationKind.NONE) {
            // the variable declared without anything should be global
            // See EcmaStandard: 13.3.2 Variable Statement
            let globalScope = this.getRootScope();
            if (globalScope instanceof GlobalScope || globalScope instanceof ModuleScope) {
                v = globalScope.add(name, declKind);
            } else {
                v = undefined;
                throw new Error("Error: global variable must be defined in global scope");
            }
        } else if (declKind == VarDeclarationKind.VAR || declKind == VarDeclarationKind.FUNCTION) {
            v = new LocalVariable(declKind, name);
            this.locals.push(v);
            this.name2variable.set(name, v);
        } else {
            v = new LocalVariable(declKind, name, status);
            this.locals.push(v);
            this.name2variable.set(name, v);
        }
        return v;
    }
}

export class LocalScope extends Scope {
    constructor(parent: Scope) {
        super();
        this.parent = parent
    }

    setLexVar(v: Variable, srcScope: Scope) {
        let lexicalScope = <VariableScope | LoopScope>this.getNearestLexicalScope();
        lexicalScope.setLexVar(v, srcScope);
    }


    add(name: string, declKind: VarDeclarationKind, status?: InitStatus): Variable | undefined {
        let v: Variable | undefined;

        LOGD(this.debugTag, "localscope.add (" + name + "), kind:" + declKind);
        if (declKind == VarDeclarationKind.NONE) {
            let root = this.getRootScope();

            if (root instanceof GlobalScope || root instanceof ModuleScope) {
                return root.add(name, declKind, status);
            } else {
                LOGE(undefined, "Error: the root of this scope is not global scope, it is wrong");
                return undefined;
            }
        } else if (declKind == VarDeclarationKind.VAR) {
            /**
             * the variable declared without anything should be accessible
             * in all parent scopes so delegate creation to the parent
             * See EcmaStandard: 13.3.2 Variable Statement
             */
            let functionScope = this.getNearestVariableScope();
            v = functionScope!.add(name, declKind);
        } else {
            v = new LocalVariable(declKind, name, status);
            this.locals.push(v);
            this.name2variable.set(name, v);
        }

        return v;
    }
}

export class LoopScope extends LocalScope {
    protected startLexIdx: number = 0;
    protected needCreateLexEnv: boolean = false;
    protected lexVarInfo: Map<string, number> = new Map<string, number>();
    constructor(parent: Scope) {
        super(parent);
    }

    setLexVar(v: Variable, refScope: Scope) {
        if (!v.isLexVar) {
            let idxLex = v.setLexVar(this);
            this.lexVarInfo.set(v.getName(), idxLex);
        }

        LOGD(this.debugTag, "LoopScope.setLexVar(" + v.idxLex + ")");
        let scope: Scope | undefined = refScope;
        while (scope && scope != this) {
            if (scope instanceof VariableScope || (scope instanceof LoopScope && scope.need2CreateLexEnv())) {
                scope.pendingCreateEnv();
            }

            scope = scope.getParent();
        }
    }

    getLexVarInfo() {
        return this.lexVarInfo;
    }

    need2CreateLexEnv(): boolean {
        return this.needCreateLexEnv;
    }

    pendingCreateEnv() {
        this.needCreateLexEnv = true;
    }

    getLexVarIdx() {
        this.needCreateLexEnv = true;
        return this.startLexIdx++;
    }

    getNumLexEnv(): number {
        return this.startLexIdx;
    }
}

