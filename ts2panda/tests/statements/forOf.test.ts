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

import {
    expect
} from 'chai';
import 'mocha';
import { DiagnosticCode, DiagnosticError } from '../../src/diagnostic';
import {
    EcmaCallithisrangedyn,
    EcmaCreateemptyarray,
    EcmaGetiterator,
    EcmaIsfalse,
    EcmaLdobjbyname,
    EcmaReturnundefined,
    EcmaStrictnoteqdyn,
    EcmaThrowdyn,
    EcmaThrowifnotobject,
    Imm,
    Jeqz,
    Jmp,
    Label,
    LdaDyn, ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("ForOfLoopTest", function () {
    it("forOfLoopWithEmptyArray", function () {
        let insns = compileMainSnippet("for (let a of []) {}");
        let a = new VReg();
        let arrInstance = new VReg();
        let iterReg = new VReg();
        let nextMethodReg = new VReg();
        let resultObj = new VReg();
        let exceptionVreg = new VReg();
        let trueReg = new VReg();
        let done = new VReg();
        let value = new VReg();

        let loopStartLabel = new Label();
        let loopEndLabel = new Label();
        let tryBeginLabel = new Label();
        let tryEndLabel = new Label();
        let catchBeginLabel = new Label();
        let isDone = new Label();

        let expected = [
            new EcmaCreateemptyarray(),
            new StaDyn(arrInstance),
            new EcmaGetiterator(),
            new StaDyn(iterReg),
            new EcmaLdobjbyname("next", iterReg),
            new StaDyn(nextMethodReg),

            new LdaDyn(new VReg()),
            new StaDyn(done),

            tryBeginLabel,
            new LdaDyn(trueReg),
            new StaDyn(done),
            loopStartLabel,
            new EcmaCallithisrangedyn(new Imm(1), [nextMethodReg, iterReg]),
            new StaDyn(resultObj),
            new EcmaThrowifnotobject(resultObj),
            new EcmaLdobjbyname("done", resultObj),
            new EcmaIsfalse(),
            new Jeqz(loopEndLabel),
            new EcmaLdobjbyname("value", resultObj),
            new StaDyn(value),

            new LdaDyn(new VReg()),
            new StaDyn(done),

            new LdaDyn(value),
            new StaDyn(a),
            tryEndLabel,

            new Jmp(loopStartLabel),

            catchBeginLabel,
            new StaDyn(exceptionVreg),
            new LdaDyn(done),
            new EcmaStrictnoteqdyn(trueReg),
            new Jeqz(isDone),
            new EcmaLdobjbyname("return", iterReg),
            new StaDyn(nextMethodReg),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(isDone),
            new EcmaCallithisrangedyn(new Imm(1), [nextMethodReg, iterReg]),
            isDone,
            new LdaDyn(exceptionVreg),
            new EcmaThrowdyn(),

            loopEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => (item instanceof Jmp || item instanceof Jeqz));

        expect(jumps.length).to.equal(4);
    });

    it("forOfLoopWithContinue", function () {
        let insns = compileMainSnippet("for (let a of []) {continue;}");
        let a = new VReg();
        let arrInstance = new VReg();
        let resultObj = new VReg();
        let trueReg = new VReg();
        let iterReg = new VReg();
        let exceptionVreg = new VReg();
        let nextMethodReg = new VReg();
        let done = new VReg();
        let value = new VReg();

        let loopStartLabel = new Label();
        let loopEndLabel = new Label();
        let tryBeginLabel = new Label();
        let tryEndLabel = new Label();
        let catchBeginLabel = new Label();
        let isDone = new Label();
        let insertedtryBeginLabel = new Label();
        let insertedtryEndLabel = new Label();

        let expected = [
            new EcmaCreateemptyarray(),
            new StaDyn(arrInstance),
            new EcmaGetiterator(),
            new StaDyn(iterReg),
            new EcmaLdobjbyname("next", iterReg),
            new StaDyn(nextMethodReg),

            new LdaDyn(new VReg()),
            new StaDyn(done),

            tryBeginLabel,
            new LdaDyn(trueReg),
            new StaDyn(done),
            loopStartLabel,
            new EcmaCallithisrangedyn(new Imm(1), [nextMethodReg, iterReg]),
            new StaDyn(resultObj),
            new EcmaThrowifnotobject(resultObj),
            new EcmaLdobjbyname("done", resultObj),
            new EcmaIsfalse(),
            new Jeqz(loopEndLabel),
            new EcmaLdobjbyname("value", resultObj),
            new StaDyn(value),

            new LdaDyn(new VReg()),
            new StaDyn(done),

            new LdaDyn(value),
            new StaDyn(a),

            insertedtryBeginLabel,
            insertedtryEndLabel,
            new Jmp(loopStartLabel),

            tryEndLabel,

            new Jmp(loopStartLabel),

            catchBeginLabel,
            new StaDyn(exceptionVreg),
            new LdaDyn(done),
            new EcmaStrictnoteqdyn(trueReg),
            new Jeqz(isDone),
            new EcmaLdobjbyname("return", iterReg),
            new StaDyn(nextMethodReg),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(isDone),
            new EcmaCallithisrangedyn(new Imm(1), [nextMethodReg, iterReg]),
            isDone,
            new LdaDyn(exceptionVreg),
            new EcmaThrowdyn(),

            loopEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => (item instanceof Jmp || item instanceof Jeqz));

        expect(jumps.length).to.equal(5);
    });

    it("forOfLoopWithBreak", function () {
        let insns = compileMainSnippet("for (let a of []) {break;}");
        let a = new VReg();
        let arrInstance = new VReg();
        let resultObj = new VReg();
        let exceptionVreg = new VReg();
        let iterReg = new VReg();
        let trueReg = new VReg();
        let nextMethodReg = new VReg();
        let done = new VReg();
        let value = new VReg();
        let loopStartLabel = new Label();
        let loopEndLabel = new Label();
        let tryBeginLabel = new Label();
        let tryEndLabel = new Label();
        let catchBeginLabel = new Label();
        let isDone = new Label();
        let noReturn = new Label();
        let insertedtryBeginLabel = new Label();
        let insertedtryEndLabel = new Label();

        let expected = [
            new EcmaCreateemptyarray(),
            new StaDyn(arrInstance),
            new EcmaGetiterator(),
            new StaDyn(iterReg),
            new EcmaLdobjbyname("next", iterReg),
            new StaDyn(nextMethodReg),

            new LdaDyn(new VReg()),
            new StaDyn(done),

            tryBeginLabel,
            new LdaDyn(trueReg),
            new StaDyn(done),
            loopStartLabel,
            new EcmaCallithisrangedyn(new Imm(1), [nextMethodReg, iterReg]),
            new StaDyn(resultObj),
            new EcmaThrowifnotobject(resultObj),
            new EcmaLdobjbyname("done", resultObj),
            new EcmaIsfalse(),
            new Jeqz(loopEndLabel),
            new EcmaLdobjbyname("value", resultObj),
            new StaDyn(value),

            new LdaDyn(new VReg()),
            new StaDyn(done),

            new LdaDyn(value),
            new StaDyn(a),

            insertedtryBeginLabel,
            new EcmaLdobjbyname("return", iterReg),
            new StaDyn(nextMethodReg),
            new EcmaStrictnoteqdyn(new VReg()), // undefined
            new Jeqz(noReturn),
            new EcmaCallithisrangedyn(new Imm(1), [nextMethodReg, iterReg]),
            new StaDyn(new VReg()),
            new EcmaThrowifnotobject(new VReg()),
            noReturn,
            insertedtryEndLabel,
            new Jmp(loopEndLabel),

            tryEndLabel,

            new Jmp(loopStartLabel),

            catchBeginLabel,
            new StaDyn(exceptionVreg),
            new LdaDyn(done),
            new EcmaStrictnoteqdyn(trueReg),
            new Jeqz(isDone),
            new EcmaLdobjbyname("return", iterReg),
            new StaDyn(nextMethodReg),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(isDone),
            new EcmaCallithisrangedyn(new Imm(1), [nextMethodReg, iterReg]),
            isDone,
            new LdaDyn(exceptionVreg),
            new EcmaThrowdyn(),

            loopEndLabel,
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => (item instanceof Jmp || item instanceof Jeqz));

        expect(jumps.length).to.equal(6);
    });

    it("ForOf SyntaxError", function () {
        let source: string = `for ([(x, y)] of []) {}`;
        let errorThrown = false;
        try {
            compileMainSnippet(source);
        } catch (err) {
            expect(err instanceof DiagnosticError).to.be.true;
            expect((<DiagnosticError>err).code).to.equal(DiagnosticCode.Property_destructuring_pattern_expected);
            errorThrown = true;
        }
        expect(errorThrown).to.be.true;
    });
});
