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
import {
    EcmaIncdyn,
    EcmaLessdyn,
    EcmaReturnundefined,
    EcmaTonumeric,
    Imm,
    Jeqz,
    Jmp,
    Label,
    LdaDyn,
    LdaiDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("ForLoopTest", function () {
    it('forLoopEmpty', function () {
        let insns = compileMainSnippet("for (;;) {}");
        let labelPre = new Label();
        let labelPost = new Label();
        let labelIncr = new Label();
        let expected = [
            labelPre,
            labelIncr,
            new Jmp(labelPre),
            labelPost,
            new EcmaReturnundefined()
        ];
        let jumps = insns.filter(item => item instanceof Jmp);

        expect(jumps.length).to.equal(1);

        let jmpLabel = (<Jmp>jumps[0]).getTarget();

        expect(checkInstructions(insns, expected)).to.be.true;
        expect(jmpLabel).to.equal(insns[0]);
    });

    it('forLoopWithInitializer', function () {
        let insns = compileMainSnippet("for (let i = 0;;) {}");
        let jumps = insns.filter(item => item instanceof Jmp);

        expect(jumps.length).to.equal(1);

        let jmpLabel = (<Jmp>jumps[0]).getTarget();

        expect(insns[4]).to.equal(jumps[0]);
        expect(jmpLabel).to.equal(insns[2]);
    });

    it('forLoopWithInitializerAndCondition', function () {
        let insns = compileMainSnippet("for (let i = 0; i < 5;) {}");
        let jumps = insns.filter(item => (item instanceof Jmp || item instanceof Jeqz));

        expect(jumps.length).to.equal(2);

        let jgezLabel = (<Jmp>jumps[0]).getTarget();
        let jmpLabel = (<Jmp>jumps[1]).getTarget();

        expect(jmpLabel).to.equal(insns[2]);
        expect(jgezLabel).to.equal(insns[10]);

        expect(insns[7]).to.equal(jumps[0]);
        expect(insns[9]).to.equal(jumps[1]);
    });

    it('forLoopWithInitializerAndConditionAndIncrementor', function () {
        let insns = compileMainSnippet("for (let i = 0; i < 5; i++) {}");
        let jumps = insns.filter(item => (item instanceof Jmp || item instanceof Jeqz));

        expect(jumps.length).to.equal(2);

        let jgezLabel = (<Jmp>jumps[0]).getTarget();
        let jmpLabel = (<Jmp>jumps[1]).getTarget();

        expect(jmpLabel).to.equal(insns[2]);
        expect(jgezLabel).to.equal(insns[15]);

        expect(insns[7]).to.equal(jumps[0]);
        expect(insns[14]).to.equal(jumps[1]);
    });

    it('forLoopWithContinue', function () {
        let insns = compileMainSnippet("for (let i = 0; i < 5; ++i) { continue; }");
        let i = new VReg();
        let lhs = new VReg();
        let operand = new VReg();
        let labelPre = new Label();
        let labelPost = new Label();
        let labelIncr = new Label();
        let expected = [
            // initializer
            new LdaiDyn(new Imm(0)),
            new StaDyn(i),
            labelPre,
            // condition
            new LdaDyn(i),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(5)),
            new EcmaLessdyn(lhs),
            new Jeqz(labelPost),
            // body
            new Jmp(labelIncr), // continue
            labelIncr,
            // incrementor
            new LdaDyn(i),
            new StaDyn(operand),
            new EcmaIncdyn(operand),
            new StaDyn(i),
            // jump to the loop header
            new Jmp(new Label()),
            labelPost,
            new EcmaReturnundefined()
        ];
        // check the instruction kinds are the same as we expect
        expect(checkInstructions(insns, expected)).to.be.true;
        // check continue jumps to the expected instruction
        let jmp = <Jmp>insns[8];
        let targetLabel = (jmp).getTarget();
        expect(targetLabel).to.equal(insns[9]);
    });

    it('forLoopWithBreak', function () {
        let insns = compileMainSnippet("for (let i = 0; i < 5; ++i) {break; }");
        let i = new VReg();
        let lhs = new VReg();
        let operand = new VReg();
        let labelPre = new Label();
        let labelPost = new Label();
        let labelIncr = new Label();
        let expected = [
            // initializer
            new LdaiDyn(new Imm(0)),
            new StaDyn(i),
            labelPre,
            // condition
            new LdaDyn(i),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(5)),
            new EcmaLessdyn(lhs),
            new Jeqz(labelPost),
            // body
            new Jmp(labelPost), // break
            // incrementor
            labelIncr,
            new LdaDyn(i),
            new StaDyn(operand),
            new EcmaIncdyn(operand),
            new StaDyn(i),
            // jump to the loop header
            new Jmp(labelPre),
            labelPost,
            new EcmaReturnundefined()
        ];
        // check the instruction kinds are the same as we expect
        expect(checkInstructions(insns, expected)).to.be.true;
        // check continue jumps to the expected instruction
        let jmp = <Jmp>insns[8];
        let targetLabel = (jmp).getTarget();
        expect(targetLabel).to.equal(insns[15]);
    });
});

describe("LoopWithLabelTests", function () {
    it('forLoopWithBreakWithLabel', function () {
        let insns = compileMainSnippet(`loop1:
                                for (let i = 0; i < 5; ++i) {
                                    for (let j = 0; j < 6; j++) {
                                        break loop1;
                                    }
                                }`);
        let i = new VReg();
        let j = new VReg();
        let lhs = new VReg();
        let labelPre = new Label();
        let labelPost = new Label();
        let labelIncr = new Label();
        let labelPre1 = new Label();
        let labelPost1 = new Label();
        let labelIncr1 = new Label();
        let expected = [
            // initializer
            new LdaiDyn(new Imm(0.0)),
            new StaDyn(i),
            labelPre,
            // condition
            new LdaDyn(i),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(5.0)),
            new EcmaLessdyn(lhs),
            new Jeqz(labelPost),

            // second for
            new LdaiDyn(new Imm(0.0)),
            new StaDyn(j),
            labelPre1,
            // condition
            new LdaDyn(j),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(6.0)),
            new EcmaLessdyn(lhs),
            new Jeqz(labelPost1),
            new Jmp(labelPost),
            labelIncr1,
            // incrementor
            new LdaDyn(j),
            new StaDyn(j),
            new EcmaIncdyn(j),
            new StaDyn(j),
            new EcmaTonumeric(j),
            // jump to the loop header
            new Jmp(labelPre1),
            labelPost1,
            labelIncr,
            // incrementor
            new LdaDyn(i),
            new StaDyn(i),
            new EcmaIncdyn(i),
            new StaDyn(i),
            // jump to the loop header
            new Jmp(labelPre),
            labelPost,
            new EcmaReturnundefined()
        ];

        // check the instruction kinds are the same as we expect
        expect(checkInstructions(insns, expected)).to.be.true;
        // check break jumps to the expected instruction
        let jmp = <Jmp>insns[16];
        let targetLabel = (jmp).getTarget();
        expect(targetLabel).to.equal(insns[31]);
    });

    it('forLoopWithContinueWithLabel', function () {
        let insns = compileMainSnippet(`loop1:
                                loop2:
                                loop3:
                                for (let i = 0; i < 5; ++i) {
                                    for (let j = 0; j < 6; j++) {
                                        continue loop2;
                                    }
                                }`);
        let i = new VReg();
        let j = new VReg();
        let lhs = new VReg();
        let labelPre = new Label();
        let labelPost = new Label();
        let labelIncr = new Label();
        let labelPre1 = new Label();
        let labelPost1 = new Label();
        let labelIncr1 = new Label();
        let expected = [
            // initializer
            new LdaiDyn(new Imm(0.0)),
            new StaDyn(i),
            labelPre,
            // condition
            new LdaDyn(i),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(5.0)),
            new EcmaLessdyn(lhs),
            new Jeqz(labelPost),

            // second for
            new LdaiDyn(new Imm(0.0)),
            new StaDyn(j),
            labelPre1,
            // condition
            new LdaDyn(j),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(6.0)),
            new EcmaLessdyn(lhs),
            new Jeqz(labelPost1),
            new Jmp(labelIncr),
            labelIncr1,
            // incrementor
            new LdaDyn(j),
            new StaDyn(j),
            new EcmaIncdyn(j),
            new StaDyn(j),
            new EcmaTonumeric(j),
            // jump to the loop header
            new Jmp(labelPre1),
            labelPost1,
            labelIncr,
            // incrementor
            new LdaDyn(i),
            new StaDyn(i),
            new EcmaIncdyn(i),
            new StaDyn(i),
            // jump to the loop header
            new Jmp(labelPre),
            labelPost,
            new EcmaReturnundefined()
        ];

        // check the instruction kinds are the same as we expect
        expect(checkInstructions(insns, expected)).to.be.true;
        // check break jumps to the expected instruction
        let jmp = <Jmp>insns[16];
        let targetLabel = (jmp).getTarget();
        expect(targetLabel).to.equal(insns[25]);
    });
});
