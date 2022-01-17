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
import { CmdOptions } from "./cmdOptions";
import {
    CalliDynRange,
    CallRange,
    DebugInsPlaceHolder,
    IRNode,
    Label,
    VReg
} from "./irnodes";
import * as jshelpers from "./jshelpers";
import { PandaGen } from "./pandagen";
import { Scope } from "./scope";
import {
    Variable
} from "./variable";

export class DebugPosInfo {
    private boundLeft: number | undefined = 0;
    private boundRight: number | undefined = 0;
    private lineNum: number = -1;
    private columnNum: number = -1;
    private wholeLine: string | undefined = "";
    private nodeKind: NodeKind | undefined = NodeKind.FirstNodeOfFunction;

    constructor() { }

    public setDebugPosInfoNodeState(extendedNode: ts.Node | NodeKind): void {
        if (DebugInfo.isNode(extendedNode)) {
            this.nodeKind = NodeKind.Normal;
        } else {
            this.nodeKind = <NodeKind>extendedNode;
        }
    }

    public getDebugPosInfoNodeState(): NodeKind | undefined {
        return this.nodeKind;
    }

    public setBoundLeft(boundLeft: number): void {
        this.boundLeft = boundLeft;
    }

    public getBoundLeft(): number | undefined {
        return this.boundLeft;
    }

    public setBoundRight(boundRight: number): void {
        this.boundRight = boundRight;
    }

    public getBoundRight(): number | undefined {
        return this.boundRight;
    }

    public setSourecLineNum(lineNum: number): void {
        this.lineNum = lineNum;
    }

    public getSourceLineNum(): number {
        return this.lineNum;
    }

    public setSourecColumnNum(columnNum: number): void {
        this.columnNum = columnNum;
    }

    public getSourceColumnNum(): number {
        return this.columnNum;
    }

    public setWholeLine(wholeLine: string): void {
        this.wholeLine = wholeLine;
    }

    public getWholeLine(): string | undefined {
        return this.wholeLine;
    }

    public ClearMembersForReleaseBuild(): void {
        this.ClearMembersForDebugBuild();
        this.boundLeft = undefined;
        this.boundRight = undefined;
    }

    public ClearMembersForDebugBuild(): void {
        this.wholeLine = undefined;
        this.nodeKind = undefined;
    }
}

export class VariableDebugInfo {
    private name = "";
    private variable: Variable | undefined;
    private signature = "";
    private signatureType = "";
    private reg: number = -1;
    private start: number = -1;
    private length: number = -1;

    constructor(name: string, signature: string, signatureType: string,
        reg: number, start: number = 0, length: number = 0) {
        this.name = name;
        this.signature = signature;
        this.signatureType = signatureType;
        this.reg = reg;
        this.start = start;
        this.length = length;
    }

    public setStart(start: number): void {
        this.start = start;
    }

    public getStart(): number {
        return this.start;
    }

    public setLength(length: number): void {
        this.length = length;
    }
}

export enum NodeKind {
    Normal,
    Invalid,
    FirstNodeOfFunction,
}

export class DebugInfo {
    private static scopeArray: Scope[] = [];
    private static lastNode: ts.Node;
    constructor() { }

    public static isNode(extendedNode: ts.Node | NodeKind) {
        if (extendedNode != NodeKind.Invalid &&
            extendedNode != NodeKind.FirstNodeOfFunction &&
            extendedNode != NodeKind.Normal) {
            return true;
        }

        return false;
    }

    public static updateLastNode(lastNode: ts.Node | NodeKind) {
        if (DebugInfo.isNode(lastNode)) {
            DebugInfo.lastNode = <ts.Node>lastNode;
        }
    }

    public static getLastNode() {
        return DebugInfo.lastNode;
    }

    public static searchForPos(node: ts.Node) {
        let file = jshelpers.getSourceFileOfNode(node);
        if (!file) {
            return undefined;
        }

        let pos : number = 0;
        let tempWholeLineText : string = ""
        if (node.pos === -1 || node.end === -1) {
            let parent = node.parent;
            while (parent) {
                if (parent.pos !== -1 && parent.end !== -1) {
                    pos = parent.pos;
                    tempWholeLineText = parent.getText();
                    break;
                }
                parent = parent.parent;
            }
        } else {
            pos = node.getStart();
        }

        let loc = file.getLineAndCharacterOfPosition(pos); 
        let wholeLineText = tempWholeLineText || node.getText();
        return {
            loc: loc,
            wholeLineText: wholeLineText
        }
    }

    public static setPosInfoForUninitializeIns(posInfo: DebugPosInfo, pandaGen: PandaGen) {
        let firstStmt = pandaGen.getFirstStmt();
        if (firstStmt) {
            let res = this.searchForPos(firstStmt);
            if (!res) {
                return;
            }
            posInfo.setSourecLineNum(res.loc.line);
            posInfo.setSourecColumnNum(res.loc.character);
            posInfo.setWholeLine(res.wholeLineText);
        }
    }

    public static addScope(scope: Scope) {
        DebugInfo.scopeArray.push(scope);
    }

    public static getScopeArray() {
        return DebugInfo.scopeArray;
    }

    public static clearScopeArray() {
        DebugInfo.scopeArray = [];
    }

    public static setDebuginfoForIns(node: ts.Node | NodeKind, ...insns: IRNode[]): void {
        DebugInfo.updateLastNode(node);

        let lineNumber = -1;
        let columnNumber = -1;
        let wholeLineText = "";
        if (DebugInfo.isNode(node)) {
            let tsNode = <ts.Node>(node);
            let res = this.searchForPos(tsNode);
            if (!res) {
                return;
            }
            wholeLineText = res.wholeLineText;
            lineNumber = res.loc.line;
            columnNumber = res.loc.character;
        }

        for (let i = 0; i < insns.length; i++) {
            let pos = new DebugPosInfo();
            pos.setSourecLineNum(lineNumber);
            pos.setSourecColumnNum(columnNumber);
            pos.setWholeLine(wholeLineText);
            pos.setDebugPosInfoNodeState(node);

            insns[i].debugPosInfo = pos;
        }
    }

    private static matchFormat(irnode: IRNode): number {
        let formatIndex = 0;
        for (let i = 0; i < irnode.formats[0].length; i++) {
            if (irnode.operands[i] instanceof VReg) {
                for (let j = 0; j < irnode.formats.length; j++) {
                    if ((<VReg>irnode.operands[i]).num < (1 << irnode.formats[j][i].bitwidth)) {
                        formatIndex = j > formatIndex ? j : formatIndex;
                        continue;
                    }
                }
            }
        }
        return formatIndex;
    }

    private static getIRNodeWholeLength(irnode: IRNode): number {
        if (irnode instanceof Label || irnode instanceof DebugInsPlaceHolder) {
            return 0;
        }
        let length = 1;
        if (!irnode.formats[0]) {
            return 0;
        }
        let formatIndex = this.matchFormat(irnode);
        let formats = irnode.formats[formatIndex];
        // count operands length
        for (let i = 0; i < formats.length; i++) {
            if ((irnode instanceof CalliDynRange) || (irnode instanceof CallRange)) {
                length += formats[0].bitwidth / 8; // 8 indicates that one byte is composed of 8 bits
                length += formats[1].bitwidth / 8;
                break;
            }

            length += (formats[i].bitwidth / 8);
        }

        return length;
    }

    private static setVariablesDebugInfoInternal(pandaGen: PandaGen, scope: Scope) {
        let insns = pandaGen.getInsns();
        // count variables offset
        let startIdx = 0;
        let startIns = scope.getScopeStartIns();
        let endIns = scope.getScopeEndIns();

        for (let i = 0; i < insns.length; i++) {
            if (startIns == insns[i]) {
                startIdx = i;
            }

            if (endIns == insns[i]) {
                let name2variable = scope.getName2variable();
                name2variable.forEach((value, key) => {
                    if (!value.hasAlreadyBinded()) {
                        return;
                    }
                    let variableInfo = new VariableDebugInfo(key, "any", "any", (value.getVreg().num));
                    variableInfo.setStart(startIdx);
                    variableInfo.setLength(i - startIdx + 1);
                    pandaGen.addDebugVariableInfo(variableInfo);
                });
            }
        }
    }

    private static setPosDebugInfo(pandaGen: PandaGen) {
        let insns = pandaGen.getInsns();
        let offset = 0;

        for (let i = 0; i < insns.length; i++) {
            if (insns[i].debugPosInfo.getDebugPosInfoNodeState() == NodeKind.FirstNodeOfFunction) {
                DebugInfo.setPosInfoForUninitializeIns(insns[i].debugPosInfo, pandaGen);
            }
        }

        // count pos offset
        for (let i = 0; i < insns.length; i++) {
            let insLength = DebugInfo.getIRNodeWholeLength(insns[i]);
            let insnsDebugPosInfo = insns[i].debugPosInfo;

            if (insnsDebugPosInfo) {
                insnsDebugPosInfo.setBoundLeft(offset);
                insnsDebugPosInfo.setBoundRight(offset + insLength);
            }

            offset += insLength;

            if (i > 0 && insns[i - 1] instanceof Label) {
                insns[i - 1].debugPosInfo = insns[i].debugPosInfo;
            }
        }
    }

    private static removeDebugIns(pandaGen: PandaGen) {
        let insns = pandaGen.getInsns();
        for (let i = 0; i < insns.length; i++) {
            if (insns[i] instanceof DebugInsPlaceHolder) {
                insns.splice(i, 1);
                i--;
            }
        }
    }

    private static setVariablesDebugInfo(pandaGen: PandaGen) {
        let recordArray = DebugInfo.getScopeArray();
        recordArray.forEach(scope => {
            DebugInfo.setVariablesDebugInfoInternal(pandaGen, scope);
        });
    }

    public static setDebugInfo(pandaGen: PandaGen) {
        // set position debug info
        DebugInfo.setPosDebugInfo(pandaGen);
        if (CmdOptions.isDebugMode()) {
            // set variable debug info
            DebugInfo.setVariablesDebugInfo(pandaGen);

            // delete ins placeholder
            DebugInfo.removeDebugIns(pandaGen)

            // clear scope array
            DebugInfo.clearScopeArray();
            return;
        }
    }

    public static setSourceFileDebugInfo(pandaGen: PandaGen, node: ts.SourceFile | ts.FunctionLikeDeclaration) {
        let sourceFile = jshelpers.getSourceFileOfNode(node);
        pandaGen.setSourceFileDebugInfo(sourceFile.fileName);

        if (CmdOptions.isDebugMode()) {
            if (ts.isSourceFile(node)) {
                pandaGen.setSourceCodeDebugInfo(node.text);
            }
            return;
        }
    }


    public static copyDebugInfo(insn: IRNode, expansion: IRNode[]) {
        let debugPosInfo = insn.debugPosInfo;
        for (let j = 0; j < expansion.length; j++) {
            expansion[j].debugPosInfo = debugPosInfo;
        }
    }

    public static addDebugIns(scope: Scope, pandaGen: PandaGen, isStart: boolean) {
        if (!CmdOptions.isDebugMode()) {
            return;
        }
        let insns = pandaGen.getInsns();
        let placeHolder = new DebugInsPlaceHolder();
        insns.push(placeHolder);
        if (isStart) {
            scope.setScopeStartIns(placeHolder);
            DebugInfo.addScope(scope);
        } else {
            scope.setScopeEndIns(placeHolder);
        }
    }
}
