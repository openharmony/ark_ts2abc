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
    EcmaCreateemptyobject,
    EcmaGetnextpropname,
    EcmaGetpropiterator,
    EcmaReturnundefined,
    EcmaStrictnoteqdyn,
    EcmaTryldglobalbyname,
    EcmaTrystglobalbyname,
    Jeqz,
    Jmp,
    Label,
    LdaDyn,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("forInLoopTest", function () {
    it("forInLoopwithEmptyObject", function () {
        let insns = compileMainSnippet("for (let prop in {}) {}");
        let prop = new VReg();
        let temp = new VReg();
        let objInstance = new VReg();
        let iterReg = new VReg();
        let rhs = new VReg();

        let loopStartLabel = new Label();
        let loopEndLabel = new Label();
        let expected = [
            new EcmaCreateemptyobject(),
            new StaDyn(objInstance),
            new EcmaGetpropiterator(),
            new StaDyn(iterReg),

            loopStartLabel,
            new EcmaGetnextpropname(iterReg),
            new StaDyn(rhs),
            new EcmaStrictnoteqdyn(temp),
            new Jeqz(loopEndLabel),
            new LdaDyn(rhs),
            new StaDyn(prop),
            new Jmp(loopStartLabel),

            loopEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => (item instanceof Jmp || item instanceof Jeqz));

        expect(jumps.length).to.equal(2);
    });

    it("forInLoopWithExpressionAsLoopVariable", function () {
        let insns = compileMainSnippet(`
      let prop;
      let obj;
      for (prop in obj) {
      }
      `);
        let temp = new VReg();
        let iterReg = new VReg();
        let rhs = new VReg();

        let loopStartLabel = new Label();
        let loopEndLabel = new Label();
        let expected = [
            new EcmaTryldglobalbyname('obj'),
            new EcmaGetpropiterator(),
            new StaDyn(iterReg),

            loopStartLabel,
            new EcmaGetnextpropname(iterReg),
            new StaDyn(rhs),
            new EcmaStrictnoteqdyn(temp),
            new Jeqz(loopEndLabel),
            new LdaDyn(rhs),
            new EcmaTrystglobalbyname('prop'),
            new Jmp(loopStartLabel),

            loopEndLabel,
        ];

        insns = insns.slice(4, insns.length - 1);
        expect(checkInstructions(insns, expected)).to.be.true;

        let jmp = <Jmp>insns.find(item => (item instanceof Jmp));
        let jeqz = <Jeqz>insns.find(item => (item instanceof Jeqz));
        expect(jmp.getTarget()).to.equal(insns[3]);
        expect(jeqz.getTarget()).to.equal(insns[insns.length - 1]);
    });

    it("forInLoopwithObjectwithContinue", function () {
        let insns = compileMainSnippet("for (let prop in {}) {continue; }");
        let prop = new VReg();
        let temp = new VReg();
        let objInstance = new VReg();
        let iterReg = new VReg();
        let rhs = new VReg();

        let loopStartLabel = new Label();
        let loopEndLabel = new Label();
        let expected = [
            new EcmaCreateemptyobject(),
            new StaDyn(objInstance),
            new EcmaGetpropiterator(),
            new StaDyn(iterReg),

            loopStartLabel,
            new EcmaGetnextpropname(iterReg),
            new StaDyn(rhs),
            new EcmaStrictnoteqdyn(temp),
            new Jeqz(loopEndLabel),
            new LdaDyn(rhs),
            new StaDyn(prop),
            new Jmp(loopStartLabel),
            new Jmp(loopStartLabel),

            loopEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => (item instanceof Jmp || item instanceof Jeqz));

        expect(jumps.length).to.equal(3);
    });

    it("forInLoopwithObjectwithBreak", function () {
        let insns = compileMainSnippet("for (let prop in {}) {break; }");
        let prop = new VReg();
        let temp = new VReg();
        let objInstance = new VReg();
        let iterReg = new VReg();
        let rhs = new VReg();

        let loopStartLabel = new Label();
        let loopEndLabel = new Label();
        let expected = [
            new EcmaCreateemptyobject(),
            new StaDyn(objInstance),
            new EcmaGetpropiterator(),
            new StaDyn(iterReg),

            loopStartLabel,
            new EcmaGetnextpropname(iterReg),
            new StaDyn(rhs),
            new EcmaStrictnoteqdyn(temp),
            new Jeqz(loopEndLabel),
            new LdaDyn(rhs),
            new StaDyn(prop),
            new Jmp(loopEndLabel),
            new Jmp(loopStartLabel),

            loopEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => (item instanceof Jmp || item instanceof Jeqz));

        expect(jumps.length).to.equal(3);
    });

    it("ForIn SyntaxError", function () {
        let source: string = `for ([(x, y)] in {}) { }`;
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
