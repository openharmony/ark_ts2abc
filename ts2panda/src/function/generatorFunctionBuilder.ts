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

import { Scope } from "src/scope";
import * as ts from "typescript";
import { CacheList, getVregisterCache } from "../base/vregisterCache";
import { Compiler, ControlFlowChange } from "../compiler";
import {
    Label,
    VReg
} from "../irnodes";
import { PandaGen } from "../pandagen";
import { Recorder } from "../recorder";
import { IteratorRecord, IteratorType, getIteratorRecord } from "../statement/forOfStatement";

enum ResumeMode { Return = 0, Throw, Next };

/**
 * function *foo() {
 *     yield 'a'
 * }
*/
export class GeneratorFunctionBuilder {
    private pandaGen: PandaGen;
    private compiler: Compiler;
    private genObj: VReg;
    private retVal: VReg;

    constructor(pandaGen: PandaGen, compiler: Compiler) {
        this.pandaGen = pandaGen;
        this.compiler = compiler;
        this.genObj = pandaGen.getTemp();
        this.retVal = pandaGen.getTemp();
    }

    prepare(node: ts.Node, recorder: Recorder) {
        let pandaGen = this.pandaGen;
        // @ts-ignore
        let scope = <Scope>recorder.getScopeOfNode(node);

        // backend handle funcobj, frontend set undefined
        pandaGen.createGeneratorObj(node, getVregisterCache(pandaGen, CacheList.FUNC));
        pandaGen.storeAccumulator(node, this.genObj);
        pandaGen.suspendGenerator(node, this.genObj, getVregisterCache(pandaGen, CacheList.undefined));
        pandaGen.resumeGenerator(node, this.genObj);
        pandaGen.storeAccumulator(node, this.retVal);

        this.handleMode(node);
    }

    yield(node: ts.Node, value: VReg) {
        let pandaGen = this.pandaGen;

        let iterRslt = pandaGen.getTemp();
        pandaGen.EcmaCreateiterresultobj(node, value, getVregisterCache(pandaGen, CacheList.False));
        pandaGen.storeAccumulator(node, iterRslt);
        pandaGen.suspendGenerator(node, this.genObj, iterRslt);
        pandaGen.freeTemps(iterRslt);

        pandaGen.resumeGenerator(node, this.genObj);
        pandaGen.storeAccumulator(node, this.retVal);

        this.handleMode(node);
    }

    yieldStar(expr: ts.YieldExpression) {
        let pandaGen = this.pandaGen;
        let method = pandaGen.getTemp();
        let object = pandaGen.getTemp();

        let receivedValue = pandaGen.getTemp();
        let modeType = pandaGen.getTemp();

        let loopStartLabel = new Label();
        let callreturnLabel = new Label();
        let callthrowLabel = new Label();
        let iteratorCompletionLabel = new Label();
        let exitLabel_return = new Label();
        let exitLabel_throw = new Label();
        let exitLabel_value = new Label();
        let exitLabel_TypeError = new Label();

        // get innerIterator & iterator.[[Nextmethod]] (spec 4 & 5), support async in the future
        let type: IteratorType = IteratorType.Normal;
        let iterator: IteratorRecord = getIteratorRecord(pandaGen, expr, method, object, type);

        // init receivedValue with Undefined (spec 6)
        pandaGen.moveVreg(expr, receivedValue, getVregisterCache(pandaGen, CacheList.undefined));

        // init modeType with Next (spec 6)
        pandaGen.loadAccumulatorInt(expr, ResumeMode.Next);
        pandaGen.storeAccumulator(expr, modeType);

        // starts executeing iterator.[[method]] (spec 7)
        pandaGen.label(expr, loopStartLabel);
        pandaGen.loadAccumulatorInt(expr, ResumeMode.Next);
        pandaGen.condition(expr, ts.SyntaxKind.EqualsEqualsToken, modeType, callreturnLabel);

        // call next
        pandaGen.call(expr, [iterator.getNextMethod(), iterator.getObject(), receivedValue], true);
        pandaGen.branch(expr, iteratorCompletionLabel);

        // call return
        pandaGen.label(expr, callreturnLabel);
        pandaGen.loadAccumulatorInt(expr, ResumeMode.Return);
        pandaGen.condition(expr, ts.SyntaxKind.EqualsEqualsToken, modeType, callthrowLabel);

        pandaGen.loadObjProperty(expr, iterator.getObject(), "return");
        pandaGen.storeAccumulator(expr, method);

        // whether iterator.[[return]] exists
        pandaGen.condition(expr, ts.SyntaxKind.ExclamationEqualsEqualsToken, getVregisterCache(pandaGen, CacheList.undefined), exitLabel_return);
        pandaGen.call(expr, [method, iterator.getObject(), receivedValue], true);
        pandaGen.branch(expr, iteratorCompletionLabel);

        // no return method
        pandaGen.label(expr, exitLabel_return);

        // if there are finally blocks, should implement these at first.
        this.compiler.compileFinallyBeforeCFC(
            undefined,
            ControlFlowChange.Break,
            undefined
        );

        // spec 7.c.iii.2 Return Completion(received).
        pandaGen.loadAccumulator(expr, receivedValue);
        pandaGen.return(expr);

        // call throw
        pandaGen.label(expr, callthrowLabel);
        pandaGen.loadObjProperty(expr, iterator.getObject(), "throw");
        pandaGen.storeAccumulator(expr, method);

        // whether iterator.[[throw]] exists
        pandaGen.condition(expr, ts.SyntaxKind.ExclamationEqualsEqualsToken, getVregisterCache(pandaGen, CacheList.undefined), exitLabel_throw);
        pandaGen.call(expr, [method, iterator.getObject(), receivedValue], true);
        pandaGen.branch(expr, iteratorCompletionLabel);

        // NOTE: If iterator does not have a throw method, this throw is
        // going to terminate the yield* loop. But first we need to give
        // iterator a chance to clean up.
        pandaGen.label(expr, exitLabel_throw);
        pandaGen.loadObjProperty(expr, iterator.getObject(), "return");
        pandaGen.storeAccumulator(expr, method);

        // whether iterator.[[return]] exists
        pandaGen.condition(expr, ts.SyntaxKind.ExclamationEqualsEqualsToken, getVregisterCache(pandaGen, CacheList.undefined), exitLabel_TypeError);

        // [[return]] exists
        pandaGen.call(expr, [method, iterator.getObject()], true);
        let innerResult = pandaGen.getTemp();
        pandaGen.storeAccumulator(expr, innerResult);
        pandaGen.throwIfNotObject(expr, innerResult);
        pandaGen.freeTemps(innerResult);

        pandaGen.label(expr, exitLabel_TypeError);
        pandaGen.throwThrowNotExist(expr);

        // iteratorCompletion
        pandaGen.label(expr, iteratorCompletionLabel);
        pandaGen.storeAccumulator(expr, this.retVal);
        pandaGen.throwIfNotObject(expr, this.retVal);

        pandaGen.loadObjProperty(expr, this.retVal, "done");
        pandaGen.jumpIfTrue(expr, exitLabel_value);

        pandaGen.suspendGenerator(expr, this.genObj, this.retVal);
        pandaGen.resumeGenerator(expr, this.genObj);
        pandaGen.storeAccumulator(expr, receivedValue);
        pandaGen.getResumeMode(expr, this.genObj);
        pandaGen.storeAccumulator(expr, modeType);
        pandaGen.branch(expr, loopStartLabel);

        // spec 7.a.v.1/7.b.ii.6.a/7.c.viii Return ? IteratorValue(innerResult).
        // Decide if we trigger a return or if the yield* expression should just
        // produce a value.
        let outputLabel = new Label();

        pandaGen.label(expr, exitLabel_value);
        pandaGen.loadObjProperty(expr, this.retVal, "value");
        let outputResult = pandaGen.getTemp();
        pandaGen.storeAccumulator(expr, outputResult);
        pandaGen.loadAccumulatorInt(expr, ResumeMode.Return);
        pandaGen.condition(expr, ts.SyntaxKind.EqualsEqualsToken, modeType, outputLabel);

        this.compiler.compileFinallyBeforeCFC(
            undefined,
            ControlFlowChange.Break,
            undefined
        );
        pandaGen.loadAccumulator(expr, outputResult);
        pandaGen.return(expr);

        pandaGen.label(expr, outputLabel);
        pandaGen.loadAccumulator(expr, outputResult);

        pandaGen.freeTemps(method, object, receivedValue, modeType, outputResult);
    }

    private handleMode(node: ts.Node) {
        let pandaGen = this.pandaGen;

        let modeType = pandaGen.getTemp();

        pandaGen.getResumeMode(node, this.genObj);
        pandaGen.storeAccumulator(node, modeType);

        // .return(value)
        pandaGen.loadAccumulatorInt(node, ResumeMode.Return);

        let notRetLabel = new Label();

        pandaGen.condition(node, ts.SyntaxKind.EqualsEqualsToken, modeType, notRetLabel);

        // if there are finally blocks, should implement these at first.
        this.compiler.compileFinallyBeforeCFC(
            undefined,
            ControlFlowChange.Break,
            undefined
        );

        pandaGen.loadAccumulator(node, this.retVal);
        pandaGen.return(node);

        // .throw(value)
        pandaGen.label(node, notRetLabel);

        pandaGen.loadAccumulatorInt(node, ResumeMode.Throw);

        let notThrowLabel = new Label();

        pandaGen.condition(node, ts.SyntaxKind.EqualsEqualsToken, modeType, notThrowLabel);
        pandaGen.loadAccumulator(node, this.retVal);
        pandaGen.throw(node);

        pandaGen.freeTemps(modeType);

        // .next(value)
        pandaGen.label(node, notThrowLabel);
        pandaGen.loadAccumulator(node, this.retVal);
    }

    cleanUp() {
        this.pandaGen.freeTemps(this.genObj, this.retVal);
    }
}
