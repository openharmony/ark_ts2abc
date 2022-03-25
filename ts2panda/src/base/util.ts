/*
 * Copyright (c) 2022 Huawei Device Co., Ltd.
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

import * as path from "path";
import { extractCtorOfClass } from "../statement/classStatement";
import { LocalVariable, Variable } from "../variable";
import * as ts from "typescript";
import {
    EcmaCallirangedyn,
    EcmaCallithisrangedyn,
    EcmaCreateobjectwithexcludedkeys,
    EcmaNewobjdynrange,
    IRNode
} from "../irnodes";
import * as jshelpers from "../jshelpers";
import { LOGD } from "../log";
import { ModuleScope, Scope } from "../scope";
import { isFunctionLikeDeclaration } from "../syntaxCheckHelper";

export function containSpreadElement(args?: ts.NodeArray<ts.Expression>): boolean {
    if (!args) {
        return false;
    }

    for (let i = 0; i < args.length; i++) {
        if (args[i].kind === ts.SyntaxKind.SpreadElement) {
            return true;
        }
    }

    return false;
}

export function hasExportKeywordModifier(node: ts.Node): boolean {
    let hasExport: boolean = false;
    if (node.modifiers) {
        node.modifiers.forEach((mod) => {
            if (mod.kind == ts.SyntaxKind.ExportKeyword) {
                hasExport = true;
            }
        });
    }

    return hasExport;
}

export function hasDefaultKeywordModifier(node: ts.Node): boolean {
    let hasDefault: boolean = false;
    if (node.modifiers) {
        node.modifiers.forEach((mod) => {
            if (mod.kind == ts.SyntaxKind.DefaultKeyword) {
                hasDefault = true;
            }
        });
    }

    return hasDefault;
}

export function setVariableExported(varName: string, scope: Scope) {
    if (!(scope instanceof ModuleScope)) {
        throw new Error("variable can't be exported out of module scope");
    }

    let variable: { scope: Scope | undefined, level: number, v: Variable | undefined } = scope.find(varName);
    (<LocalVariable>variable.v!).setExport();
    (<LocalVariable>variable.v!).setExportedName(varName);
}

export function execute(cmd: string, args: Array<string>) {
    var spawn = require('child_process').spawn;

    let child = spawn(cmd, [...args], {
        stdio: ['pipe', 'inherit', 'inherit']
    });

    child.on('exit', (code: any) => {
        if (code === 1) {
            LOGD("fail to execute cmd: ", cmd);
            return 0;
        }
        LOGD("execute cmd successfully: ", cmd);
        return 1;
    });

    return 1;
}

export function addUnicodeEscape(text: string) {
    let firstIdx = 0;
    let secondIdx = 0;
    let len = text.length;
    let newText = "";
    while (secondIdx != len) {
        if (text[secondIdx] == '\\' && secondIdx + 1 != len && text[secondIdx + 1] == 'u') {
            if (secondIdx != 0 && text[secondIdx - 1] == '\\') {
                newText += text.substr(firstIdx, secondIdx - firstIdx) + "\\\\" + "\\u";
            } else {
                newText += text.substr(firstIdx, secondIdx - firstIdx) + "\\" + "\\u";
            }
            secondIdx += 2;
            firstIdx = secondIdx;
        } else {
            secondIdx++;
        }
    }

    if (secondIdx == len && firstIdx != secondIdx) {
        newText += text.substr(firstIdx);
    }

    return newText;
}

export function isBindingPattern(node: ts.Node) {
    return ts.isArrayBindingPattern(node) || ts.isObjectBindingPattern(node);
}

export function isObjectBindingOrAssignmentPattern(node: ts.Node) {
    return ts.isObjectLiteralExpression(node) || ts.isObjectBindingPattern(node);
}

export function isArrayBindingOrAssignmentPattern(node: ts.Node) {
    return ts.isArrayLiteralExpression(node) || ts.isArrayBindingPattern(node);
}

export function isBindingOrAssignmentPattern(node: ts.Node) {
    return isArrayBindingOrAssignmentPattern(node) || isObjectBindingOrAssignmentPattern(node);
}

export function isMemberExpression(node: ts.Node) {
    if (ts.isPropertyAccessExpression(node)
        || ts.isElementAccessExpression(node)) {
        return true;
    }

    return false;
}

export function isUndefinedIdentifier(node: ts.Node) {
    if (!ts.isIdentifier(node)) {
        return false;
    }

    if (jshelpers.getTextOfIdentifierOrLiteral(node) != "undefined") {
        return false;
    }

    return true;
}

export function isAnonymousFunctionDefinition(node: ts.Node) {
    if (!isFunctionLikeDeclaration(node)) {
        return false;
    }

    if (node.name) {
        return false;
    } else {
        return true;
    }
}

export function escapeUnicode(data: string) {
    let char = '\n';
    let i = 0;
    let j = 0;
    let new_data = ""
    while ((j = data.indexOf(char, i)) !== -1) {
        let tmp = data.substring(i, j);
        if (tmp.indexOf("\\u") != -1) {
            tmp = addUnicodeEscape(tmp);
        }
        new_data = new_data.concat(tmp, "\n");
        i = j + 1;
    }

    new_data = new_data.concat("}\n");
    return new_data
}

export function initiateTs2abc(args: Array<string>) {
    let js2abc = path.join(path.resolve(__dirname, '../bin'), "js2abc");
    args.unshift("--compile-by-pipe");
    // @ts-ignore
    var spawn = require('child_process').spawn;
    let child = spawn(js2abc, [...args], {
        stdio: ['pipe', 'inherit', 'inherit', 'pipe']
    });

    return child;
}

export function terminateWritePipe(ts2abc: any) {
    if (!ts2abc) {
        LOGD("ts2abc is not a valid object");
    }

    ts2abc.stdio[3].end();
}

export function listenChildExit(child: any) {
    if (!child) {
        LOGD("child is not a valid object");
    }

    child.on('exit', (code: any) => {
        if (code === 1) {
            LOGD("fail to generate panda binary file");
        }
        LOGD("success to generate panda binary file");
    });
}

export function listenErrorEvent(child: any) {
    if (!child) {
        LOGD("child is not a valid object");
    }

    child.on('error', (err: any) => {
        LOGD(err.toString());
    });
}

export function isRangeInst(ins: IRNode) {
    if (ins instanceof EcmaCallithisrangedyn ||
        ins instanceof EcmaCallirangedyn ||
        ins instanceof EcmaNewobjdynrange ||
        ins instanceof EcmaCreateobjectwithexcludedkeys) {
        return true;
    }
    return false;
}

export function getRangeExplicitVregNums(ins: IRNode): number {
    if (!isRangeInst(ins)) {
        return -1;
    }
    return ins instanceof EcmaCreateobjectwithexcludedkeys ? 2 : 1;
}

export function isRestParameter(parameter: ts.ParameterDeclaration) {
    return parameter.dotDotDotToken ? true : false;
}

export function getParamLengthOfFunc(node: ts.FunctionLikeDeclaration) {
    let length = 0;
    let validLengthRange = true;
    let parameters = node.parameters;
    if (parameters) {
        parameters.forEach(parameter => {
            if (parameter.initializer || isRestParameter(parameter)) {
                validLengthRange = false;
            }

            if (validLengthRange) {
                length++;
            }
        })
    }

    return length;
}

export function getParameterLength4Ctor(node: ts.ClassLikeDeclaration) {
    if (!extractCtorOfClass(node)) {
        return 0;
    }

    let members = node.members;
    let ctorNode: ts.ConstructorDeclaration;
    for (let index = 0; index < members.length; index++) {
        let member = members[index];
        if (ts.isConstructorDeclaration(member)) {
            ctorNode = member;
        }
    }

    return getParamLengthOfFunc(ctorNode!);
}

export function getRangeStartVregPos(ins: IRNode): number {
    if (!isRangeInst(ins)) {
        return -1;
    }
    return ins instanceof EcmaCreateobjectwithexcludedkeys ? 2 : 1;
}

export function setPos(node: ts.Node) {
    ts.setTextRange(node, {pos:-1, end:-1});
    node.forEachChild(childNode => {
        setPos(childNode);
    });
    return node;
}