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
    EcmaAnd2dyn,
    EcmaAshr2dyn,
    EcmaCreateemptyobject,
    EcmaDiv2dyn,
    EcmaExpdyn,
    EcmaMod2dyn,
    EcmaMul2dyn,
    EcmaOr2dyn,
    EcmaReturnundefined,
    EcmaShl2dyn,
    EcmaShr2dyn,
    EcmaStglobalvar,
    EcmaStlettoglobalrecord,
    EcmaStobjbyname,
    EcmaStrictnoteqdyn,
    EcmaSub2dyn,
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
    MovDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("BinaryOperationsTest", function () {
    it("2 + 3", function () {
        let insns = compileMainSnippet("2 + 3");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(2)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaAdd2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("5 - 1", function () {
        let insns = compileMainSnippet("5 - 1");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(5)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(1)),
            new EcmaSub2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("null ?? 1", function () {
        let insns = compileMainSnippet("null ?? 1");

        let leftNullishLabel = new Label();
        let endLabel = new Label();
        let expected = [
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(leftNullishLabel),
            new LdaDyn(new VReg()),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(leftNullishLabel),
            new LdaDyn(new VReg()),
            new Jmp(endLabel),
            leftNullishLabel,
            new LdaiDyn(new Imm(1)),
            endLabel,
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => item instanceof Jeqz || item instanceof Jmp)

        expect(jumps.length).to.equal(3);
    });

    it("undefined ?? 1", function () {
        let insns = compileMainSnippet("undefined ?? 1");

        let leftNullishLabel = new Label();
        let endLabel = new Label();
        let expected = [
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(leftNullishLabel),
            new LdaDyn(new VReg()),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(leftNullishLabel),

            new LdaDyn(new VReg()),
            new Jmp(endLabel),

            leftNullishLabel,
            new LdaiDyn(new Imm(1)),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => item instanceof Jeqz || item instanceof Jmp)

        expect(jumps.length).to.equal(3);
    });

    it("2 ?? 1", function () {
        let insns = compileMainSnippet("2 ?? 1");
        let lhs = new VReg();

        let leftNullishLabel = new Label();
        let endLabel = new Label();
        let expected = [
            new LdaiDyn(new Imm(2)),
            new StaDyn(new VReg()),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(leftNullishLabel),
            new LdaDyn(new VReg()),
            new EcmaStrictnoteqdyn(new VReg()),
            new Jeqz(leftNullishLabel),

            new LdaDyn(lhs),
            new Jmp(endLabel),

            leftNullishLabel,
            new LdaiDyn(new Imm(1)),
            endLabel,
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;

        let jumps = insns.filter(item => item instanceof Jeqz || item instanceof Jmp)

        expect(jumps.length).to.equal(3);
    });

    it("3 * 4", function () {
        let insns = compileMainSnippet("3 * 4");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(4)),
            new EcmaMul2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("2 ** 3", function () {
        let insns = compileMainSnippet("2 ** 3");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(2)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaExpdyn(lhs),
            new EcmaReturnundefined(),
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("7 / 1", function () {
        let insns = compileMainSnippet("7 / 1");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(7)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(1)),
            new EcmaDiv2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("8 % 2", function () {
        let insns = compileMainSnippet("8 % 2");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(8)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(2)),
            new EcmaMod2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("2 << 3", function () {
        let insns = compileMainSnippet("2 << 3");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(2)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaShl2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("4 >> 1", function () {
        let insns = compileMainSnippet("4 >> 1");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(4)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(1)),
            new EcmaShr2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("12 >>> 2", function () {
        let insns = compileMainSnippet("12 >>> 2");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(12)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(2)),
            new EcmaAshr2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("3 & 4", function () {
        let insns = compileMainSnippet("3 & 4");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(3)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(4)),
            new EcmaAnd2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("2 | 5", function () {
        let insns = compileMainSnippet("2 | 5");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(2)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(5)),
            new EcmaOr2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("7 ^ 3", function () {
        let insns = compileMainSnippet("7 ^ 3");
        let lhs = new VReg();
        let expected = [
            new LdaiDyn(new Imm(7)),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaXor2dyn(lhs),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("let i; i = 2", function () {
        let insns = compileMainSnippet("let i; i = 2;");
        let expected = [
            new LdaDyn(new VReg()),
            new EcmaStlettoglobalrecord('i'),
            new LdaiDyn(new Imm(2)),
            new EcmaTrystglobalbyname('i'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("a = 1 under strict mode", function () {
        let insns = compileMainSnippet(`
                                        "use strict";
                                        a = 1;
                                        `);
        let expected = [
            new LdaStr("use strict"),
            new LdaiDyn(new Imm(1)),
            new EcmaTrystglobalbyname("a"),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    })

    it("Assignment to ParenthesizedExpression case1", function () {
        let insns = compileMainSnippet("((x)) = 1;");

        let expected = [
            new LdaiDyn(new Imm(1)),
            new EcmaStglobalvar("x"),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("Assignment to ParenthesizedExpression case2", function () {
        let insns = compileMainSnippet(`let a = {};
                                ((a.b)) = 1;`);
        let objReg = new VReg();
        let tempObj = new VReg();

        let expected = [
            new EcmaCreateemptyobject(),
            new StaDyn(new VReg()),
            // insns for `((a.b)) = 1`
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(tempObj),
            new MovDyn(objReg, tempObj),
            new LdaiDyn(new Imm(1)),

            new EcmaStobjbyname("b", objReg),
            new EcmaReturnundefined()
        ]
        expect(checkInstructions(insns, expected)).to.be.true;
    });
});
