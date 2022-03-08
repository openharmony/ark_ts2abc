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
    EcmaReturnundefined,
    EcmaStlettoglobalrecord,
    EcmaStrictnoteqdyn,
    EcmaTryldglobalbyname,
    Imm,
    Jeqz,
    Jmp,
    Jnez,
    Label, LdaiDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("switchTest", function () {
    it("single case", function () {
        let insns = compileMainSnippet("let a = 0; switch (a) {case 0 : ;}");
        let a = new VReg();
        let rhs = new VReg();
        let caseLabel = new Label();
        let switchEndLabel = new Label();
        let expected = [
            new LdaiDyn(new Imm(0)),
            new EcmaStlettoglobalrecord('a'),
            // switch body
            new EcmaTryldglobalbyname('a'),
            new StaDyn(rhs),
            new LdaiDyn(new Imm(0)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel),
            new Jmp(switchEndLabel),
            // switch cases
            caseLabel,
            switchEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
        expect((<Jnez>insns[6]).getTarget() === insns[8]).to.be.true;
        expect((<Jmp>insns[7]).getTarget() === insns[9]).to.be.true;
    });

    it("multiple cases without break", function () {
        let insns = compileMainSnippet(`let a = 0; switch (a)
                                 {
                                  case 0 : ;
                                  case 1 : ;
                                  default : ;
                                 }`);
        let rhs = new VReg();
        let caseLabel_0 = new Label();
        let caseLabel_1 = new Label();
        let defaultLabel = new Label();
        let switchEndLabel = new Label();
        let expected = [
            new LdaiDyn(new Imm(0)),
            new EcmaStlettoglobalrecord('a'),
            // switch body
            new EcmaTryldglobalbyname('a'),
            new StaDyn(rhs),
            new LdaiDyn(new Imm(0)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel_0),
            new LdaiDyn(new Imm(1)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel_1),
            new Jmp(defaultLabel),
            // cases
            caseLabel_0,
            caseLabel_1,
            // default case
            defaultLabel,
            switchEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("multiple cases with default", function () {
        let insns = compileMainSnippet(`let a = 0; switch (a)
                                 {
                                  case 0 : break;
                                  case 1 : break;
                                  default : ;
                                 }`);
        let rhs = new VReg();
        let caseLabel_0 = new Label();
        let caseLabel_1 = new Label();
        let defaultLabel = new Label();
        let switchEndLabel = new Label();
        let expected = [
            new LdaiDyn(new Imm(0)),
            new EcmaStlettoglobalrecord('a'),
            // switch body
            new EcmaTryldglobalbyname('a'),
            new StaDyn(rhs),
            new LdaiDyn(new Imm(0)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel_0),
            new LdaiDyn(new Imm(1)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel_1),
            new Jmp(defaultLabel),
            // switch cases
            caseLabel_0,
            new Jmp(switchEndLabel),
            caseLabel_1,
            new Jmp(switchEndLabel),
            defaultLabel,
            switchEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("multiple cases without default", function () {
        let insns = compileMainSnippet(`let a = 0; switch (a)
                                 {
                                  case 0 : break;
                                  case 1 : break;
                                 }`);
        let rhs = new VReg();
        let caseLabel_0 = new Label();
        let caseLabel_1 = new Label();
        let switchEndLabel = new Label();
        let expected = [
            new LdaiDyn(new Imm(0)),
            new EcmaStlettoglobalrecord('a'),
            // switch body
            new EcmaTryldglobalbyname('a'),
            new StaDyn(rhs),
            new LdaiDyn(new Imm(0)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel_0),
            new LdaiDyn(new Imm(1)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel_1),
            new Jmp(switchEndLabel),
            // switch cases
            caseLabel_0,
            new Jmp(switchEndLabel),
            caseLabel_1,
            new Jmp(switchEndLabel),
            switchEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("multiple cases with default surrounded by cases", function () {
        let insns = compileMainSnippet(`let a = 0; switch (a)
                                 {
                                  case 0 : break;
                                  default : ;
                                  case 1 : ;
                                 }`);
        let rhs = new VReg();
        let caseLabel_0 = new Label();
        let caseLabel_1 = new Label();
        let defaultLabel = new Label();
        let switchEndLabel = new Label();
        let expected = [
            new LdaiDyn(new Imm(0)),
            new EcmaStlettoglobalrecord('a'),
            // switch body
            new EcmaTryldglobalbyname('a'),
            new StaDyn(rhs),
            new LdaiDyn(new Imm(0)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel_0),
            new LdaiDyn(new Imm(1)),
            new EcmaStrictnoteqdyn(rhs),
            new Jeqz(caseLabel_1),
            new Jmp(defaultLabel),
            // switch cases
            caseLabel_0,
            new Jmp(switchEndLabel),
            // default case
            defaultLabel,
            caseLabel_1,
            switchEndLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });
});
