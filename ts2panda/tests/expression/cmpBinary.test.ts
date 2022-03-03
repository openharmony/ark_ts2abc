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
    EcmaAnd2dyn,
    EcmaEqdyn,
    EcmaGreaterdyn,
    EcmaGreatereqdyn,
    EcmaIncdyn,
    EcmaInstanceofdyn,
    EcmaIsindyn,
    EcmaLessdyn,
    EcmaLesseqdyn,
    EcmaNoteqdyn,
    EcmaOr2dyn,
    EcmaReturnundefined,
    EcmaStlettoglobalrecord,
    EcmaStricteqdyn,
    EcmaStrictnoteqdyn,
    EcmaTonumber,
    EcmaTryldglobalbyname,
    EcmaTrystglobalbyname,
    EcmaXor2dyn,
    Imm,
    Jeqz,
    Jmp,
    Label,
    LdaDyn,
    LdaiDyn,
    LdaStr,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("CmpBinaryOperators", function () {
    it("LessThan", function () {
        let insns = compileMainSnippet("2 < 3;");
        let lhs = new VReg();
        let falseLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(2)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaLessdyn(lhs),
            new Jeqz(falseLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            falseLabel,
            new LdaDyn(new VReg()),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("GreaterThan", function () {
        let insns = compileMainSnippet("3 > 1;");
        let lhs = new VReg();
        let falseLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(1)),
            new EcmaGreaterdyn(lhs),
            new Jeqz(falseLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            falseLabel,
            new LdaDyn(new VReg()),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("LessThanEquals", function () {
        let insns = compileMainSnippet("3 <= 4;");
        let lhs = new VReg();
        let falseLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(4)),
            new EcmaLesseqdyn(lhs),
            new Jeqz(falseLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            falseLabel,
            new LdaDyn(new VReg()),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("GreaterThanEquals", function () {
        let insns = compileMainSnippet("3 >= 2;");
        let lhs = new VReg();
        let falseLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(2)),
            new EcmaGreatereqdyn(lhs),
            new Jeqz(falseLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            falseLabel,
            new LdaDyn(new VReg()),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("EqualsEquals", function () {
        let insns = compileMainSnippet("3 == 3;");
        let lhs = new VReg();
        let falseLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaEqdyn(lhs),
            new Jeqz(falseLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            falseLabel,
            new LdaDyn(new VReg()),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("ExclamationEquals", function () {
        let insns = compileMainSnippet("3 != 2;");
        let lhs = new VReg();
        let falseLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(2)),
            new EcmaNoteqdyn(lhs),
            new Jeqz(falseLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            falseLabel,
            new LdaDyn(new VReg()),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("EqualsEqualsEquals", function () {
        let insns = compileMainSnippet("3 === 3;");
        let lhs = new VReg();
        let falseLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaStricteqdyn(lhs),
            new Jeqz(falseLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            falseLabel,
            new LdaDyn(new VReg()),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("ExclamationEqualsEquals", function () {
        let insns = compileMainSnippet("3 !== 3;");
        let lhs = new VReg();
        let falseLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaStrictnoteqdyn(lhs),
            new Jeqz(falseLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            falseLabel,
            new LdaDyn(new VReg()),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("ampersandEqual", function () {
        let insns = compileMainSnippet("let a = 5;\n" +
            "a &= 3;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaAnd2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("barEqual", function () {
        let insns = compileMainSnippet("let a = 5;\n" +
            "a |= 3;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaOr2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("caretEqual", function () {
        let insns = compileMainSnippet("let a = 5;\n" +
            "a ^= 3;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaXor2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("CommaToken", function () {
        let insns = compileMainSnippet(`let x = 1;
                                x = (x++, x);`);
        let variable = new VReg();
        let rhs = new VReg();
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(1)),
            new EcmaStlettoglobalrecord('x'),
            new EcmaTryldglobalbyname('x'),
            new StaDyn(lhs),
            new EcmaIncdyn(lhs),
            new EcmaTrystglobalbyname('x'),
            new EcmaTonumber(variable),
            new StaDyn(rhs),
            new EcmaTryldglobalbyname('x'),
            new EcmaTrystglobalbyname('x'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("InKeyword", function () {
        let insns = compileMainSnippet(`'o' in C;`);
        let rhs = new VReg();

        let expected = [
            new LdaStr('o'),
            new StaDyn(rhs),
            new EcmaTryldglobalbyname("C"),
            new EcmaIsindyn(rhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("InstanceOfKeyword", function () {
        let insns = compileMainSnippet(`o instanceof C;`);
        let rhs = new VReg();

        let expected = [
            new EcmaTryldglobalbyname("o"),
            new StaDyn(rhs),
            new EcmaTryldglobalbyname("C"),
            new EcmaInstanceofdyn(rhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

});
