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
import * as jshelpers from "../jshelpers";
import { DiagnosticCode, DiagnosticError } from "../diagnostic";
import { TryStatement } from "./tryStatement";
import { Label } from "../irnodes";

export class LabelTarget {
    private static name2LabelTarget: Map<string, LabelTarget> = new Map<string, LabelTarget>();
    private static labelTargetStack: LabelTarget[] = [];
    private node: ts.Node;
    private breakTargetLabel: Label;
    private continueTargetLabel: Label | undefined;
    private hasLoopEnv: boolean;
    private loopEnvLevel: number;
    private tryStatement: TryStatement | undefined;

    constructor(node: ts.Node, breakTargetLabel: Label, continueTargetLabel: Label | undefined, hasLoopEnv: boolean = false) {
        this.node = node;
        this.breakTargetLabel = breakTargetLabel;
        this.continueTargetLabel = continueTargetLabel;
        this.hasLoopEnv = hasLoopEnv;
        this.loopEnvLevel = hasLoopEnv ? 1 : 0;
        this.tryStatement = TryStatement.getCurrentTryStatement();
    }

    getBreakTargetLabel() {
        return this.breakTargetLabel;
    }

    getContinueTargetLabel() {
        return this.continueTargetLabel;
    }

    getLoopEnvLevel() {
        return this.loopEnvLevel;
    }

    getTryStatement() {
        return this.tryStatement;
    }

    getCorrespondingNode() {
        return this.node;
    }

    private increaseLoopEnvLevel() {
        this.loopEnvLevel += 1;
    }

    private decreaseLoopEnvLevel() {
        this.loopEnvLevel -= 1;
    }

    private static isLabelTargetsEmpty(): boolean {
        if (LabelTarget.labelTargetStack.length == 0) {
            return true;
        }
        return false;
    }

    private static getCloseLabelTarget(): LabelTarget | undefined {
        if (!LabelTarget.isLabelTargetsEmpty()) {
            return LabelTarget.labelTargetStack[LabelTarget.labelTargetStack.length - 1];
        }
        return undefined;
    }

    // this API used for get uplevel continueLabel when compile switchStatement
    static getCloseContinueTarget(): Label | undefined {
        let labelTarget = LabelTarget.getCloseLabelTarget();
        if (labelTarget) {
            return labelTarget.continueTargetLabel;
        }
        return undefined;
    }

    static pushLabelTarget(labelTarget: LabelTarget) {
        if (labelTarget.hasLoopEnv) {
            if (TryStatement.getCurrentTryStatement()) {
                TryStatement.getCurrentTryStatement().increaseLoopEnvLevel();
            }
            LabelTarget.labelTargetStack.forEach(lt => lt.increaseLoopEnvLevel());
        }
        LabelTarget.labelTargetStack.push(labelTarget);
    }

    static popLabelTarget() {
        if (!LabelTarget.isLabelTargetsEmpty() && LabelTarget.labelTargetStack.pop().hasLoopEnv) {
            if (TryStatement.getCurrentTryStatement()) {
                TryStatement.getCurrentTryStatement().decreaseLoopEnvLevel();
            }
            LabelTarget.labelTargetStack.forEach(lt => lt.decreaseLoopEnvLevel());
        }
    }

    static updateName2LabelTarget(node: ts.Node, labelTarget: LabelTarget) {
        while (node.kind == ts.SyntaxKind.LabeledStatement) {
            let labeledStmt = <ts.LabeledStatement>node;
            let labelName = jshelpers.getTextOfIdentifierOrLiteral(labeledStmt.label);

            // make sure saved label is different
            if (LabelTarget.name2LabelTarget.has(labelName)) {
                throw new DiagnosticError(node, DiagnosticCode.Duplicate_label_0);
            }

            LabelTarget.name2LabelTarget.set(labelName, labelTarget);
            node = node.parent;
        }
    }

    static deleteName2LabelTarget(labelName: string) {
        LabelTarget.name2LabelTarget.delete(labelName);
    }

    static getLabelTarget(stmt: ts.BreakOrContinueStatement): LabelTarget {
        let labelTarget: LabelTarget;
        if (stmt.label) {
            let labelName = jshelpers.getTextOfIdentifierOrLiteral(stmt.label);
            labelTarget = LabelTarget.name2LabelTarget.get(labelName)!;
        } else {
            labelTarget = LabelTarget.getCloseLabelTarget()!;
        }
        return labelTarget;
    }
}