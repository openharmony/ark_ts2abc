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
    EcmaAdd2dyn,
    EcmaCreatearraywithbuffer,
    EcmaCreateemptyarray,
    EcmaCreateemptyobject,
    EcmaCreateobjectwithbuffer,
    EcmaIncdyn,
    EcmaReturnundefined,
    EcmaStarrayspread,
    EcmaStlettoglobalrecord,
    EcmaStownbyindex,
    EcmaStownbyname,
    EcmaStownbyvalue,
    EcmaTryldglobalbyname,
    Imm,
    LdaDyn,
    LdaiDyn,
    LdaStr,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("LiteralTest", function () {
    it("5", function () {
        let insns = compileMainSnippet("5");
        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("\"stringLiteral\"", function () {
        let insns = compileMainSnippet("\"stringLiteral\"");
        let expected = [
            new LdaStr("stringLiteral"),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("true", function () {
        let insns = compileMainSnippet("true");
        let expected = [
            new LdaDyn(new VReg()),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("false", function () {
        let insns = compileMainSnippet("false");
        let expected = [
            new LdaDyn(new VReg()),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("null", function () {
        let insns = compileMainSnippet("null");
        let expected = [
            new LdaDyn(new VReg()),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let arr = [1]", function () {
        let insns = compileMainSnippet("let arr = [1]");
        let arrayInstance = new VReg();

        let expected = [
            new EcmaCreatearraywithbuffer(new Imm(0)),
            new StaDyn(arrayInstance),
            new LdaDyn(arrayInstance),
            new EcmaStlettoglobalrecord('arr'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let arr = []", function () {
        let insns = compileMainSnippet("let arr = []");
        let arrayInstance = new VReg();

        let expected = [
            new EcmaCreateemptyarray(),
            new StaDyn(arrayInstance),
            new EcmaStlettoglobalrecord('arr'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let arr = [1, 2]", function () {
        let insns = compileMainSnippet("let arr = [1, 2]");
        let arrayInstance = new VReg();

        let expected = [
            new EcmaCreatearraywithbuffer(new Imm(0)),
            new StaDyn(arrayInstance),
            new LdaDyn(arrayInstance),
            new EcmaStlettoglobalrecord('arr'),
            new EcmaReturnundefined()
        ];
        insns = insns.slice(0, insns.length);
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let arr = [, 1]", function () {
        let insns = compileMainSnippet("let arr = [, 1]");
        let arrayInstance = new VReg();

        let expected = [
            new EcmaCreateemptyarray(),
            new StaDyn(arrayInstance),
            new LdaiDyn(new Imm(1)),
            new EcmaStownbyindex(arrayInstance, new Imm(1)),
            new LdaDyn(arrayInstance),
            new EcmaStlettoglobalrecord('arr'),
            new EcmaReturnundefined()
        ];
        insns = insns.slice(0, insns.length);
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let arr = [1, , 3]", function () {
        let insns = compileMainSnippet("let arr = [1,, 3]");
        let arrayInstance = new VReg();

        let expected = [
            new EcmaCreatearraywithbuffer(new Imm(0)),
            new StaDyn(arrayInstance),
            new LdaiDyn(new Imm(3)),
            new EcmaStownbyindex(arrayInstance, new Imm(2)),
            new LdaDyn(arrayInstance),
            new EcmaStlettoglobalrecord('arr'),
            new EcmaReturnundefined()
        ];

        insns = insns.slice(0, insns.length);
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let arr = [1, ...arr1, 3]", function () {
        let insns = compileMainSnippet(`let arr1 = [1, 2];
                                let arr = [1, ...arr1, 3]`);
        let elemIdxReg = new VReg();
        let arrayInstance = new VReg();

        let expected = [
            new EcmaCreatearraywithbuffer(new Imm(0)),
            new StaDyn(arrayInstance),
            new LdaDyn(arrayInstance),
            new EcmaStlettoglobalrecord('arr1'),

            new EcmaCreatearraywithbuffer(new Imm(1)),
            new StaDyn(arrayInstance),
            new LdaiDyn(new Imm(1)),
            new StaDyn(elemIdxReg),
            new EcmaTryldglobalbyname('arr1'),
            new EcmaStarrayspread(arrayInstance, elemIdxReg),
            new StaDyn(elemIdxReg),
            new LdaiDyn(new Imm(3)),
            new EcmaStownbyvalue(arrayInstance, elemIdxReg),
            new EcmaIncdyn(elemIdxReg),
            new StaDyn(elemIdxReg),
            new LdaDyn(arrayInstance),
            new EcmaStlettoglobalrecord('arr'),
        ];
        insns = insns.slice(0, insns.length - 1);
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let obj = {}", function () {
        let insns = compileMainSnippet("let obj = {}");
        let objInstance = new VReg();

        let expected = [
            new EcmaCreateemptyobject(),
            new StaDyn(objInstance),

            new EcmaStlettoglobalrecord('obj'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let obj = {a: 1}", function () {
        let insns = compileMainSnippet("let obj = {a: 1}");
        let objInstance = new VReg();
        let expected = [
            new EcmaCreateobjectwithbuffer(new Imm(0)),
            new StaDyn(objInstance),
            new LdaDyn(objInstance),
            new EcmaStlettoglobalrecord('obj'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let obj = {0: 1 + 2}", function () {
        let insns = compileMainSnippet("let obj = {0: 1 + 2}");
        let objInstance = new VReg();
        let lhs = new VReg();

        let expected = [
            new EcmaCreateobjectwithbuffer(new Imm(0)),
            new StaDyn(objInstance),
            new LdaiDyn(new Imm(1)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(2)),
            new EcmaAdd2dyn(lhs),
            new EcmaStownbyindex(objInstance, new Imm(0)),
            new LdaDyn(objInstance),
            new EcmaStlettoglobalrecord('obj'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let obj = {\"str\": 1}", function () {
        let insns = compileMainSnippet("let obj = {\"str\": 1}");
        let objInstance = new VReg();

        let expected = [
            new EcmaCreateobjectwithbuffer(new Imm(0)),
            new StaDyn(objInstance),
            new LdaDyn(objInstance),
            new EcmaStlettoglobalrecord('obj'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let a; let obj = {a}", function () {
        let insns = compileMainSnippet("let a; let obj = {a}");
        let objInstance = new VReg();

        let expected = [
            new EcmaCreateobjectwithbuffer(new Imm(0)),
            new StaDyn(objInstance),
            new EcmaTryldglobalbyname('a'),
            new EcmaStownbyname("a", objInstance),
            new LdaDyn(objInstance),
            new EcmaStlettoglobalrecord('obj')
        ];
        insns = insns.slice(2, insns.length - 1);
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("duplicate __proto__", function () {
        let errorThrown = false;
        try {
            compileMainSnippet("({__proto__: null,other: null,'__proto__': null});");
        } catch (err) {
            expect(err instanceof DiagnosticError).to.be.true;
            expect((<DiagnosticError>err).code).to.equal(DiagnosticCode.Duplicate_identifier_0);
            errorThrown = true;
        }
        expect(errorThrown).to.be.true;
    });
});

