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
    EcmaAdd2dyn,
    EcmaIstrue,
    EcmaLessdyn,
    EcmaReturnundefined,
    EcmaStlettoglobalrecord,
    EcmaTryldglobalbyname,
    EcmaTrystglobalbyname,
    Imm,
    Jeqz,
    Jgez,
    Jmp,
    Label,
    LdaDyn,
    LdaiDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("WhileLoopTest", function () {
    it("while (true) {}", function () {
        let insns = compileMainSnippet("while (true) {}");
        let labelPre = new Label();
        let labelPost = new Label();
        let expected = [
            labelPre,
            new LdaDyn(new VReg()),
            new EcmaIstrue(),
            new Jeqz(labelPost),
            new Jmp(labelPre),
            labelPost,
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("while (a + b) {}", function () {
        let insns = compileMainSnippet("let a, b; while (a + b) {}");
        let loopBegin = new Label();
        let loopEnd = new Label();
        let lhs = new VReg();
        let expected = [
            loopBegin,
            // a + b
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new EcmaTryldglobalbyname('b'),
            new EcmaAdd2dyn(lhs),
            new EcmaIstrue(),
            new Jeqz(loopEnd),
            // body
            new Jmp(loopBegin),
            loopEnd
        ];

        insns = insns.slice(4, insns.length - 1); // skip let a, b and return.dyn
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it('whileLoopWithBody', function () {
        let insns = compileMainSnippet(`
      let a;
      while (a < 0) { a = 1; }
      `);

        let lhs = new VReg();
        let loopBegin = new Label();
        let loopEnd = new Label();
        let expected = [
            loopBegin,
            // condition
            // compute lhs
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            // compute rhs
            new LdaiDyn(new Imm(0)),
            new EcmaLessdyn(lhs),
            new Jeqz(loopEnd),

            // body
            new LdaiDyn(new Imm(1)),
            new EcmaTrystglobalbyname('a'),
            new Jmp(loopBegin),

            loopEnd,
        ];

        insns = insns.slice(2, insns.length - 1); // skip let a and return.dyn
        expect(checkInstructions(insns, expected)).to.be.true;
        expect((<Jgez>insns[5]).getTarget() === insns[insns.length - 1]).to.be.true;
        expect((<Jmp>insns[insns.length - 2]).getTarget() === insns[0]).to.be.true;
    });

    it('whileLoopWithContinue', function () {
        let insns = compileMainSnippet("let a = 5;" +
            "while (a < 1) { a = 2; continue; }");
        let lhs = new VReg();
        let labelPre = new Label();
        let labelPost = new Label();
        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('a'),
            labelPre,
            // condition
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(1)),
            new EcmaLessdyn(lhs),
            new Jeqz(labelPost),
            //body
            new LdaiDyn(new Imm(2)),
            new EcmaTrystglobalbyname('a'),
            new Jmp(labelPre), // continue
            new Jmp(labelPre),
            labelPost,
            new EcmaReturnundefined()
        ]
        // check the instruction kinds are the same as we expect
        expect(checkInstructions(insns, expected)).to.be.true;
        // check continue jumps to the expected instruction
        let jmp = <Jmp>insns[11];
        let targetLabel = (jmp).getTarget();
        expect(targetLabel).to.equal(insns[2]);
    });

    it('whileLoopWithBreak', function () {
        let insns = compileMainSnippet("let a = 5;" +
            "while (a < 1) { a = 2; break; }");
        let lhs = new VReg();
        let labelPre = new Label();
        let labelPost = new Label();
        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('a'),
            labelPre,
            // condition
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(1)),
            new EcmaLessdyn(lhs),
            new Jeqz(labelPost),
            //body
            new LdaiDyn(new Imm(2)),
            new EcmaTrystglobalbyname('a'),
            new Jmp(labelPost), //break
            new Jmp(labelPre),
            labelPost,
            new EcmaReturnundefined()
        ]
        // check the instruction kinds are the same as we expect
        expect(checkInstructions(insns, expected)).to.be.true;
        // check continue jumps to the expected instruction
        let jmp = <Jmp>insns[10];
        let targetLabel = (jmp).getTarget();
        expect(targetLabel).to.equal(insns[12]);
    });
});
