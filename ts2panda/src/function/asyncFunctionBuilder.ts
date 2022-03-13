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
import { CacheList, getVregisterCache } from "../base/vregisterCache";
import { NodeKind } from "../debuginfo";
import {
    Label,
    VReg
} from "../irnodes";
import { PandaGen } from "../pandagen";
import { CatchTable, LabelPair } from "../statement/tryStatement";

enum ResumeMode { Return = 0, Throw, Next };

/**
 * async function foo() {
 *     await 'promise obj';
 * }
 */
export class AsyncFunctionBuilder {
    private pandaGen: PandaGen;
    private beginLabel: Label;
    private endLabel: Label;
    private asyncObj: VReg;
    private retVal: VReg;

    constructor(pandaGen: PandaGen) {
        this.pandaGen = pandaGen;
        this.beginLabel = new Label();
        this.endLabel = new Label();
        this.asyncObj = pandaGen.getTemp();
        this.retVal = pandaGen.getTemp();
    }

    prepare(node: ts.Node): void {
        let pandaGen = this.pandaGen;

        pandaGen.asyncFunctionEnter(node);
        pandaGen.storeAccumulator(node, this.asyncObj);

        pandaGen.label(node, this.beginLabel);
    }

    await(node: ts.Node, value: VReg): void {
        let pandaGen = this.pandaGen;
        let promise = this.pandaGen.getTemp();

        pandaGen.asyncFunctionAwaitUncaught(node, this.asyncObj, value);
        pandaGen.storeAccumulator(node, promise);

        pandaGen.suspendGenerator(node, this.asyncObj, promise);

        pandaGen.freeTemps(promise);

        pandaGen.resumeGenerator(node, this.asyncObj);
        pandaGen.storeAccumulator(node, this.retVal);

        this.handleMode(node);
    }

    private handleMode(node: ts.Node) {
        let pandaGen = this.pandaGen;
        let modeType = pandaGen.getTemp();

        pandaGen.getResumeMode(node, this.asyncObj);
        pandaGen.storeAccumulator(node, modeType);

        // .reject
        pandaGen.loadAccumulatorInt(node, ResumeMode.Throw);

        let notThrowLabel = new Label();

        // jump to normal code
        pandaGen.condition(node, ts.SyntaxKind.EqualsEqualsToken, modeType, notThrowLabel);
        pandaGen.loadAccumulator(node, this.retVal);
        pandaGen.throw(node);

        pandaGen.freeTemps(modeType);

        // .resolve
        pandaGen.label(node, notThrowLabel);
        pandaGen.loadAccumulator(node, this.retVal);
    }

    resolve(node: ts.Node | NodeKind, value: VReg) {
        let pandaGen = this.pandaGen;

        pandaGen.asyncFunctionResolve(node, this.asyncObj, getVregisterCache(pandaGen, CacheList.True), value);
    }

    cleanUp(node: ts.Node): void {
        let pandaGen = this.pandaGen;

        pandaGen.label(node, this.endLabel);

        // catch
        let exception = pandaGen.getTemp();

        pandaGen.storeAccumulator(NodeKind.Invalid, exception);
        pandaGen.asyncFunctionReject(NodeKind.Invalid, this.asyncObj, getVregisterCache(pandaGen, CacheList.True), exception);
        pandaGen.return(NodeKind.Invalid);

        pandaGen.freeTemps(exception);

        pandaGen.freeTemps(this.asyncObj, this.retVal);

        new CatchTable(pandaGen, this.endLabel, new LabelPair(this.beginLabel, this.endLabel));
    }
}