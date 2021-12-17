/*
 * Copyright (c) 2021 Huawei Device Co., Ltd.
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

import ts from "typescript";
import * as astutils from "./astutils";
import { isAnonymousFunctionDefinition } from "./base/util";
import { CmdOptions } from "./cmdOptions";
import { CompilerDriver } from "./compilerDriver";
import { DiagnosticCode, DiagnosticError } from "./diagnostic";
import { findOuterNodeOfParenthesis } from "./expression/parenthesizedExpression";
import * as jshelpers from "./jshelpers";
import { LOGD } from "./log";
import { ModuleStmt } from "./modules";
import {
    CatchParameter,
    ClassDecl,
    ConstDecl,
    Decl,
    FuncDecl,
    FunctionParameter,
    FunctionScope,
    GlobalScope,
    LetDecl,
    LocalScope,
    LoopScope,
    ModuleScope,
    Scope,
    VarDecl,
    VariableScope
} from "./scope";
import {
    AddCtor2Class,
    isContainConstruct,
    getClassNameForConstructor
} from "./statement/classStatement";
import { checkSyntaxError } from "./syntaxChecker";
import { isGlobalIdentifier } from "./syntaxCheckHelper";
import { VarDeclarationKind } from "./variable";

export class Recorder {
    node: ts.Node;
    scope: Scope;
    compilerDriver: CompilerDriver;
    private scopeMap: Map<ts.Node, Scope> = new Map<ts.Node, Scope>();
    private hoistMap: Map<Scope, Decl[]> = new Map<Scope, Decl[]>();
    private parametersMap: Map<ts.FunctionLikeDeclaration, FunctionParameter[]> = new Map<ts.FunctionLikeDeclaration, FunctionParameter[]>();
    private funcNameMap: Map<string, number>;
    private ClassGroupOfNoCtor: Array<ts.ClassLikeDeclaration> = new Array<ts.ClassLikeDeclaration>();
    private importStmts: Array<ModuleStmt> = [];
    private exportStmts: Array<ModuleStmt> = [];
    private defaultUsed: boolean = false;

    constructor(node: ts.Node, scope: Scope, compilerDriver: CompilerDriver) {
        this.node = node;
        this.scope = scope;
        this.compilerDriver = compilerDriver;
        this.funcNameMap = new Map<string, number>();
        this.funcNameMap.set("main", 1);
    }

    record() {
        this.setScopeMap(this.node, this.scope);
        this.recordInfo(this.node, this.scope);
        return this.node;
    }

    getClassGroupOfNoCtor() {
        return this.ClassGroupOfNoCtor;
    }

    private recordInfo(node: ts.Node, scope: Scope) {
        node.forEachChild(childNode => {
            checkSyntaxError(childNode);
            switch (childNode.kind) {
                case ts.SyntaxKind.FunctionExpression:
                case ts.SyntaxKind.MethodDeclaration:
                case ts.SyntaxKind.Constructor:
                case ts.SyntaxKind.GetAccessor:
                case ts.SyntaxKind.SetAccessor:
                case ts.SyntaxKind.ArrowFunction: {
                    this.compilerDriver.getFuncId(<ts.FunctionLikeDeclaration>childNode);
                    let functionScope = this.buildVariableScope(scope, <ts.FunctionLikeDeclaration>childNode);
                    this.recordFuncInfo(<ts.FunctionLikeDeclaration>childNode);
                    this.recordInfo(childNode, functionScope);
                    break;
                }
                case ts.SyntaxKind.FunctionDeclaration: {
                    this.compilerDriver.getFuncId(<ts.FunctionDeclaration>childNode);
                    let functionScope = this.buildVariableScope(scope, <ts.FunctionLikeDeclaration>childNode);
                    this.recordFuncDecl(<ts.FunctionDeclaration>childNode, scope);
                    this.recordInfo(childNode, functionScope);
                    break;
                }
                case ts.SyntaxKind.Block:
                case ts.SyntaxKind.IfStatement:
                case ts.SyntaxKind.SwitchStatement:
                case ts.SyntaxKind.LabeledStatement:
                case ts.SyntaxKind.ThrowStatement:
                case ts.SyntaxKind.TryStatement:
                case ts.SyntaxKind.CatchClause: {
                    let localScope = new LocalScope(scope);
                    this.setScopeMap(childNode, localScope);
                    this.recordInfo(childNode, localScope);
                    break;
                }
                case ts.SyntaxKind.DoStatement:
                case ts.SyntaxKind.WhileStatement:
                case ts.SyntaxKind.ForStatement:
                case ts.SyntaxKind.ForInStatement:
                case ts.SyntaxKind.ForOfStatement: {
                    let loopScope: LoopScope = new LoopScope(scope);;
                    this.setScopeMap(childNode, loopScope);
                    this.recordInfo(childNode, loopScope);
                    break;
                }
                case ts.SyntaxKind.ClassDeclaration:
                case ts.SyntaxKind.ClassExpression: {
                    this.recordClassInfo(<ts.ClassLikeDeclaration>childNode, scope);
                    break;
                }
                case ts.SyntaxKind.Identifier: {
                    this.recordVariableDecl(<ts.Identifier>childNode, scope);
                    break;
                }
                case ts.SyntaxKind.ImportDeclaration: {
                    if (!CmdOptions.isModules()) {
                        throw new DiagnosticError(childNode, DiagnosticCode.An_import_declaration_can_only_be_used_in_a_namespace_or_module, jshelpers.getSourceFileOfNode(childNode));
                    }
                    if (!(scope instanceof ModuleScope)) {
                        throw new Error("SyntaxError: import statement cannot in other scope except ModuleScope");
                    }
                    this.recordImportInfo(<ts.ImportDeclaration>childNode, scope);
                    break;
                }
                case ts.SyntaxKind.ExportDeclaration: {
                    if (!CmdOptions.isModules()) {
                        throw new DiagnosticError(childNode, DiagnosticCode.An_export_declaration_can_only_be_used_in_a_module, jshelpers.getSourceFileOfNode(childNode));
                    }
                    if (!(scope instanceof ModuleScope)) {
                        throw new Error("SyntaxError: export statement cannot in other scope except ModuleScope");
                    }
                    this.recordExportInfo(<ts.ExportDeclaration>childNode);
                    break;
                }
                case ts.SyntaxKind.ExportAssignment: {
                    if (this.defaultUsed) {
                        throw new DiagnosticError(childNode, DiagnosticCode.Duplicate_identifier_0, jshelpers.getSourceFileOfNode(childNode), ["default"]);
                    }
                    this.defaultUsed = true;
                    this.recordInfo(childNode, scope);
                    break;
                }
                default:
                    this.recordInfo(childNode, scope);
            }
        });
    }

    private recordClassInfo(childNode: ts.ClassLikeDeclaration, scope: Scope) {
        let localScope = new LocalScope(scope);
        this.setScopeMap(childNode, localScope);
        if (!isContainConstruct(childNode)) {
            AddCtor2Class(this, childNode, localScope);
        }
        if (childNode.name) {
            let name = jshelpers.getTextOfIdentifierOrLiteral(childNode.name);
            let calssDecl = new ClassDecl(name, childNode, this.compilerDriver.getFuncId(childNode));
            scope.setDecls(calssDecl);
        }
        this.recordInfo(childNode, localScope);
    }

    buildVariableScope(curScope: Scope, node: ts.FunctionLikeDeclaration) {
        let functionScope = new FunctionScope(curScope, <ts.FunctionLikeDeclaration>node);
        let parentVariableScope = <VariableScope>curScope.getNearestVariableScope();
        functionScope.setParentVariableScope(parentVariableScope);
        parentVariableScope.addChildVariableScope(functionScope);
        this.setScopeMap(node, functionScope);
        return functionScope;
    }

    private recordVariableDecl(id: ts.Identifier, scope: Scope) {
        let name = jshelpers.getTextOfIdentifierOrLiteral(id);
        let parent = this.getDeclarationNodeOfId(id);

        if (parent) {
            let declKind = astutils.getVarDeclarationKind(<ts.VariableDeclaration>parent);

            // collect declaration information to corresponding scope
            let decl = this.addVariableDeclToScope(scope, id, parent, name, declKind);
            if (declKind == VarDeclarationKind.VAR) {
                let variableScopeParent = <VariableScope>scope.getNearestVariableScope();
                this.collectHoistDecls(id, variableScopeParent, decl);
            }
        } else {
            let declScope = scope.findDeclPos(name);
            if (declScope) {
                let decl = <Decl>declScope.getDecl(name);

                if ((decl instanceof LetDecl || decl instanceof ConstDecl)) {
                    let nearestRefVariableScope = <VariableScope>scope.getNearestVariableScope();
                    let nearestDefLexicalScope = <VariableScope | LoopScope>declScope.getNearestLexicalScope();

                    let tmp: Scope | undefined = nearestRefVariableScope.getNearestLexicalScope();
                    let needCreateLoopEnv: boolean = false;
                    if (nearestDefLexicalScope instanceof LoopScope) {
                        while(tmp) {
                            if (tmp == nearestDefLexicalScope) {
                                needCreateLoopEnv = true;
                                break;
                            }

                            tmp = tmp.getParent();
                        }

                        if (needCreateLoopEnv) {
                            nearestDefLexicalScope.pendingCreateEnv();
                        }
                    }
                }
            }
        }

        if (name == "arguments") {
            let varialbeScope = scope.getNearestVariableScope();
            varialbeScope ?.setUseArgs(true);
        }
    }

    private addVariableDeclToScope(scope: Scope, node: ts.Node, parent: ts.Node, name: string, declKind: VarDeclarationKind): Decl {
        let decl = new VarDecl(name, node);
        switch (declKind) {
            case VarDeclarationKind.VAR:
                break;
            case VarDeclarationKind.LET:
                if (parent.parent.kind == ts.SyntaxKind.CatchClause) {
                    decl = new CatchParameter(name, node);
                } else {
                    decl = new LetDecl(name, node);
                }
                break;
            case VarDeclarationKind.CONST:
                decl = new ConstDecl(name, node);
                break;
            default:
                throw new Error("Wrong type of declaration");
        }
        scope.setDecls(decl);
        return decl;
    }

    private getDeclarationNodeOfId(id: ts.Identifier): ts.VariableDeclaration | undefined {
        let parent = id.parent;
        if (ts.isVariableDeclaration(parent) &&
            parent.name == id) {
            return <ts.VariableDeclaration>parent;
        } else if (ts.isBindingElement(parent) &&
            parent.name == id) {
            while (parent && !ts.isVariableDeclaration(parent)) {
                parent = parent.parent;
            }

            return parent ? <ts.VariableDeclaration>parent : undefined;
        } else {
            return undefined;
        }
    }

    private recordImportInfo(node: ts.ImportDeclaration, scope: ModuleScope) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) {
            throw new Error("moduleSpecifier must be a stringLiteral");
        }
        let moduleRequest = jshelpers.getTextOfIdentifierOrLiteral(node.moduleSpecifier);
        let importStmt = new ModuleStmt(node, moduleRequest);

        if (node.importClause) {
            let importClause: ts.ImportClause = node.importClause;

            // import defaultExport from "a.js"
            if (importClause.name) {
                let name = jshelpers.getTextOfIdentifierOrLiteral(importClause.name);
                scope.setDecls(new ConstDecl(name, importClause.name));
                importStmt.addLocalName(name, "default");
            }

            // import { ... } from "a.js"
            // import * as a from "a.js"
            // import defaultExport, * as a from "a.js"
            if (importClause.namedBindings) {
                let namedBindings = importClause.namedBindings;
                // import * as a from "a.js"
                if (ts.isNamespaceImport(namedBindings)) {
                    let nameSpace = jshelpers.getTextOfIdentifierOrLiteral((<ts.NamespaceImport>namedBindings).name);
                    scope.setDecls(new ConstDecl(nameSpace, namedBindings));
                    importStmt.setNameSpace(nameSpace);
                }

                // import { ... } from "a.js"
                if (ts.isNamedImports(namedBindings)) {
                    namedBindings.elements.forEach((element) => {
                        let name: string = jshelpers.getTextOfIdentifierOrLiteral(element.name);
                        let exoticName: string = element.propertyName ? jshelpers.getTextOfIdentifierOrLiteral(element.propertyName) : name;
                        scope.setDecls(new ConstDecl(name, element));
                        importStmt.addLocalName(name, exoticName);
                    });
                }
            }
        }

        this.importStmts.push(importStmt);
    }

    private recordExportInfo(node: ts.ExportDeclaration) {
        let exportStmt: ModuleStmt;
        if (node.moduleSpecifier) {
            if (!ts.isStringLiteral(node.moduleSpecifier)) {
                throw new Error("moduleSpecifier must be a stringLiteral");
            }
            exportStmt = new ModuleStmt(node, jshelpers.getTextOfIdentifierOrLiteral(node.moduleSpecifier));
        } else {
            exportStmt = new ModuleStmt(node);
        }

        if (node.exportClause) {
            exportStmt.setCopyFlag(false);
            let namedBindings: ts.NamedExportBindings = node.exportClause;
            if (ts.isNamespaceExport(namedBindings)) {
                exportStmt.setNameSpace(jshelpers.getTextOfIdentifierOrLiteral((<ts.NamespaceExport>namedBindings).name));
            }

            if (ts.isNamedExports(namedBindings)) {
                namedBindings.elements.forEach((element) => {
                    let name: string = jshelpers.getTextOfIdentifierOrLiteral(element.name);
                    if (name == 'default') {
                        if (this.defaultUsed) {
                            throw new DiagnosticError(node, DiagnosticCode.Duplicate_identifier_0, jshelpers.getSourceFileOfNode(node), [name]);
                        } else {
                            this.defaultUsed = true;
                        }
                    }
                    let exoticName: string = element.propertyName ? jshelpers.getTextOfIdentifierOrLiteral(element.propertyName) : name;
                    exportStmt.addLocalName(name, exoticName);
                });
            }
        }

        this.exportStmts.push(exportStmt);
    }

    private recordFuncDecl(node: ts.FunctionDeclaration, scope: Scope) {
        this.recordFuncInfo(node);

        let funcId = <ts.Identifier>(node).name;
        if (!funcId) {
            // function declaration without name doesn't need to record hoisting.
            return;
        }
        let funcName = jshelpers.getTextOfIdentifierOrLiteral(funcId);
        let funcDecl = new FuncDecl(funcName, node, this.compilerDriver.getFuncId(node));
        scope.setDecls(funcDecl);
        let hoistScope = scope;
        if (scope instanceof GlobalScope || scope instanceof ModuleScope) {
            this.collectHoistDecls(node, <GlobalScope | ModuleScope>hoistScope, funcDecl);
        } else if (scope instanceof LocalScope) {
            hoistScope = <Scope>scope.getNearestVariableScope();
            let expectHoistScope = this.getScopeOfNode(node.parent.parent);
            if ((hoistScope == expectHoistScope) && (hoistScope instanceof FunctionScope)) {
                this.collectHoistDecls(node, hoistScope, funcDecl);
            }
        } else {
            LOGD("Function declaration", " in function is collected in its body block");
        }
    }

    private recordFuncInfo(node: ts.FunctionLikeDeclaration) {
        this.recordFunctionParameters(node);
        this.recordFuncName(node);
    }

    recordFuncName(node: ts.FunctionLikeDeclaration) {
        let name: string = '';
        if (ts.isConstructorDeclaration(node)) {
            let classNode = node.parent;
            name = getClassNameForConstructor(classNode);
        } else {
            if (isAnonymousFunctionDefinition(node)) {
                let outerNode = findOuterNodeOfParenthesis(node);

                if (ts.isVariableDeclaration(outerNode)) {
                    let id = outerNode.name;
                    if (ts.isIdentifier(id)) {
                        name = jshelpers.getTextOfIdentifierOrLiteral(id);
                    }
                } else if (ts.isBinaryExpression(outerNode)) {
                    if (outerNode.operatorToken.kind == ts.SyntaxKind.EqualsToken && ts.isIdentifier(outerNode.left)) {
                        name = jshelpers.getTextOfIdentifierOrLiteral(outerNode.left);
                    }
                } else if (ts.isPropertyAssignment(outerNode)) {
                    let propName = outerNode.name;
                    if (ts.isIdentifier(propName) || ts.isStringLiteral(propName) || ts.isNumericLiteral(propName)) {
                        name = jshelpers.getTextOfIdentifierOrLiteral(propName);
                        if (name == "__proto__") {
                            name = '';
                        }
                    }
                }
            } else {
                if (ts.isIdentifier(node.name!)) {
                    name = jshelpers.getTextOfIdentifierOrLiteral(node.name);
                }
            }
        }

        (<FunctionScope>this.getScopeOfNode(node)).setFuncName(name);

        if (name != '') {
            let funcNameMap = this.funcNameMap;
            if (funcNameMap.has(name)) {
                let nums = <number>funcNameMap.get(name);
                funcNameMap.set(name, ++nums);
            } else {
                funcNameMap.set(name, 1);
            }
        }
    }

    recordFunctionParameters(node: ts.FunctionLikeDeclaration) {
        let parameters = node.parameters;
        let funcParams: FunctionParameter[] = [];
        let length = 0;
        let lengthFlag = true;

        if (parameters) {
            parameters.forEach(parameter => {
                // record function.length
                if (parameter.initializer || this.isRestParameter(parameter)) {
                    lengthFlag = false;
                }
                if (lengthFlag) {
                    length++;
                }

                if (ts.isIdentifier(parameter.name)) {
                    let name = jshelpers.getTextOfIdentifierOrLiteral(<ts.Identifier>parameter.name);
                    funcParams.push(new FunctionParameter(name, parameter.name));
                } else { // parameter is binding pattern
                    this.recordPatternParameter(<ts.BindingPattern>parameter.name, funcParams);
                }
            });
        }
        (<FunctionScope>this.getScopeOfNode(node)).setParameterLength(length);
        this.setParametersMap(node, funcParams);
    }

    recordPatternParameter(pattern: ts.BindingPattern, funcParams: Array<FunctionParameter>) {
        let name: string = '';
        pattern.elements.forEach(bindingElement => {
            if (ts.isOmittedExpression(bindingElement)) {
                return;
            }

            bindingElement = <ts.BindingElement>bindingElement;
            if (ts.isIdentifier(bindingElement.name)) {
                name = jshelpers.getTextOfIdentifierOrLiteral(bindingElement.name);
                funcParams.push(new FunctionParameter(name, bindingElement.name));
            } else { // case of binding pattern
                let innerPattern = <ts.BindingPattern>bindingElement.name;
                this.recordPatternParameter(innerPattern, funcParams);
            }
        });
    }


    isRestParameter(parameter: ts.ParameterDeclaration) {
        return parameter.dotDotDotToken ? true : false;
    }

    private collectHoistDecls(node: ts.Node, scope: VariableScope, decl: Decl) {
        let declName = decl.name;

        // if variable share a same name with the parameter of its contained function, it should not be hoisted
        if (scope instanceof FunctionScope) {
            let nearestFunc = jshelpers.getContainingFunction(node);
            let functionParameters = this.getParametersOfFunction(nearestFunc);
            if (functionParameters) {
                for (let i = 0; i < functionParameters.length; i++) {
                    if (functionParameters[i].name == declName) {
                        return;
                    }
                }
            }
        }

        // Variable named of global identifier should not be hoisted.
        if (isGlobalIdentifier(declName) && (scope instanceof GlobalScope)) {
            return;
        }

        this.setHoistMap(scope, decl);
    }

    setScopeMap(node: ts.Node, scope: Scope) {
        this.scopeMap.set(node, scope);
    }

    getScopeMap() {
        return this.scopeMap;
    }

    getScopeOfNode(node: ts.Node) {
        return this.scopeMap.get(node);
    }

    getImportStmts() {
        return this.importStmts;
    }

    getExportStmts() {
        return this.exportStmts;
    }

    setHoistMap(scope: VariableScope, decl: Decl) {
        if (!this.hoistMap.has(scope)) {
            this.hoistMap.set(scope, [decl]);
            return;
        }

        let hoistDecls = <Decl[]>this.hoistMap.get(scope);
        for (let i = 0; i < hoistDecls.length; i++) {
            if (decl.name == hoistDecls[i].name) {
                if (decl instanceof FuncDecl) {
                    hoistDecls[i] = decl;
                }
                return;
            }
        }
        hoistDecls.push(decl);
    }

    getHoistMap() {
        return this.hoistMap;
    }

    getHoistDeclsOfScope(scope: VariableScope) {
        return this.hoistMap.get(scope);
    }

    setParametersMap(node: ts.FunctionLikeDeclaration, parameters: FunctionParameter[]) {
        this.parametersMap.set(node, parameters);
    }

    getParametersOfFunction(node: ts.FunctionLikeDeclaration) {
        return this.parametersMap.get(node);
    }

    getFuncNameMap() {
        return this.funcNameMap;
    }
}