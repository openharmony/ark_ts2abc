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

import * as ts from "typescript";
import { isBindingPattern } from "./base/util";
import * as jshelpers from "./jshelpers";
import { Recorder } from "./recorder";
import {
    CatchParameter,
    ClassDecl,
    ConstDecl,
    Decl,
    FuncDecl,
    InitStatus,
    LetDecl,
    Scope,
    VarDecl,
    VariableScope
} from "./scope";
import { isGlobalIdentifier } from "./syntaxCheckHelper";
import { VarDeclarationKind } from "./variable";


function addInnerArgs(node: ts.Node, scope: VariableScope): void {
    // the first argument for js function is func_obj
    scope.addParameter("4funcObj", VarDeclarationKind.CONST, -1);
    // the second argument for newTarget

    if (node.kind == ts.SyntaxKind.ArrowFunction) {
        scope.addParameter("0newTarget", VarDeclarationKind.CONST, -1);
        scope.addParameter("0this", VarDeclarationKind.CONST, 0);
    } else {
        scope.addParameter("4newTarget", VarDeclarationKind.CONST, -1);
        scope.addParameter("this", VarDeclarationKind.CONST, 0);
    }

    if (node.kind != ts.SyntaxKind.SourceFile) {
        let funcNode = <ts.FunctionLikeDeclaration>node;
        addParameters(funcNode, scope);
    }

    if (scope.getUseArgs()) {
        if (ts.isArrowFunction(node)) {
            let parentVariableScope = <VariableScope>scope.getParentVariableScope();
            parentVariableScope.add("arguments", VarDeclarationKind.CONST, InitStatus.INITIALIZED);
            parentVariableScope.setUseArgs(true);

            scope.setUseArgs(false);
        } else {
            if (!scope.findLocal("arguments")) {
                scope.add("arguments", VarDeclarationKind.CONST, InitStatus.INITIALIZED);
            }
        }
    }
}

export function addVariableToScope(recorder: Recorder) {
    let scopeMap = recorder.getScopeMap();
    let hoistMap = recorder.getHoistMap();

    scopeMap.forEach((scope, node) => {
        let hoistDecls = [];
        if (scope instanceof VariableScope) {
            addInnerArgs(node, scope);

            hoistDecls = <Decl[]>hoistMap.get(scope);
            if (hoistDecls) {
                hoistDecls.forEach(hoistDecl => {
                    if (hoistDecl instanceof VarDecl) {
                        scope.add(hoistDecl.name, VarDeclarationKind.VAR);
                    } else if (hoistDecl instanceof FuncDecl) {
                        scope.add(hoistDecl.name, VarDeclarationKind.FUNCTION);
                    } else {
                        throw new Error("Wrong type of declaration to be hoisted")
                    }
                })
            }
        }


        let decls = scope.getDecls();
        let nearestVariableScope = <VariableScope>scope.getNearestVariableScope();
        hoistDecls = <Decl[]>hoistMap.get(nearestVariableScope);
        for (let j = 0; j < decls.length; j++) {
            let decl = decls[j];
            if (hoistDecls && hoistDecls.includes(decl)) {
                continue;
            }

            if (decl instanceof LetDecl) {
                scope.add(decl.name, VarDeclarationKind.LET, InitStatus.UNINITIALIZED);
            } else if (decl instanceof ConstDecl) {
                scope.add(decl.name, VarDeclarationKind.CONST, InitStatus.UNINITIALIZED);
            } else if (decl instanceof FuncDecl) {
                scope.add(decl.name, VarDeclarationKind.FUNCTION);
            } else if (decl instanceof CatchParameter) {
                scope.add(decl.name, VarDeclarationKind.LET);
            } else if (decl instanceof ClassDecl) {
                let classNode = decl.node;
                if (ts.isClassDeclaration(classNode)) {
                    scope.add(decl.name, VarDeclarationKind.CLASS, InitStatus.UNINITIALIZED);
                } else {
                    let classScope = <Scope>recorder.getScopeOfNode(classNode);
                    classScope.add(decl.name, VarDeclarationKind.CLASS, InitStatus.UNINITIALIZED);
                }
            } else {
                /**
                 * Case 1: var declaration share a same name with function declaration, then
                 * function declaration will be hoisted and the var declaration will be left be.
                 * Case 2: "var undefined" in global scope is not added to hoistDecls,
                 * but it should be added to scope
                 */
                if (isGlobalIdentifier(decls[j].name)) {
                    scope.add(decls[j].name, VarDeclarationKind.VAR);
                }
            }
        }
    })
}

function addParameters(node: ts.FunctionLikeDeclaration, scope: VariableScope): void {
    let patternParams: Array<ts.BindingPattern> = new Array<ts.BindingPattern>();
    for (let i = 0; i < node.parameters.length; ++i) {
        let param = node.parameters[i];
        let name: string = '';
        if (isBindingPattern(param.name)) {
            patternParams.push(<ts.BindingPattern>param.name);
            name = i.toString() + "pattern";
        } else if (ts.isIdentifier(param.name)) {
            name = jshelpers.getTextOfIdentifierOrLiteral(<ts.Identifier>param.name);
        }

        scope.addParameter(name, VarDeclarationKind.VAR, i + 1);
    }

    for (let i = 0; i < patternParams.length; i++) {
        addPatternParamterElements(patternParams[i], scope);
    }
}

function addPatternParamterElements(pattern: ts.BindingPattern, scope: VariableScope) {
    let name: string = '';
    pattern.elements.forEach(bindingElement => {
        if (ts.isOmittedExpression(bindingElement)) {
            return;
        }

        bindingElement = <ts.BindingElement>bindingElement;
        if (ts.isIdentifier(bindingElement.name)) {
            name = jshelpers.getTextOfIdentifierOrLiteral(bindingElement.name);
            scope.add(name, VarDeclarationKind.VAR);
        } else if (isBindingPattern(bindingElement.name)) {
            let innerPattern = <ts.BindingPattern>bindingElement.name;
            addPatternParamterElements(innerPattern, scope);
        }
    });
}
