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
    EcmaAshr2dyn,
    EcmaDiv2dyn,
    EcmaExpdyn,
    EcmaMod2dyn,
    EcmaMul2dyn,
    EcmaReturnundefined,
    EcmaShl2dyn,
    EcmaShr2dyn,
    EcmaStlettoglobalrecord,
    EcmaSub2dyn,
    EcmaTryldglobalbyname,
    EcmaTrystglobalbyname,
    Imm,
    LdaiDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("OperationEqualTest", function () {
    it("plusEqual", function () {
        let insns = compileMainSnippet("let a = 2;\n" +
            "a += 3;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(2)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaAdd2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("minusEqual", function () {
        let insns = compileMainSnippet("let a = 5;\n" +
            "a -= 7;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(7)),
            new EcmaSub2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("asteriskEqual", function () {
        let insns = compileMainSnippet("let a = 2;\n" +
            "a *= 4;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(2)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(4)),
            new EcmaMul2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("AsteriskAsteriskEqualsToken", function () {
        let insns = compileMainSnippet("let a = 2;\n" +
            "a **= 3;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(2)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaExpdyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ]
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("slashEqual", function () {
        let insns = compileMainSnippet("let a = 5;\n" +
            "a /= 3;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaDiv2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("percentEqual", function () {
        let insns = compileMainSnippet("let a = 15;\n" +
            "a %= 7;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(15)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(7)),
            new EcmaMod2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("lessThanLessThanEqual", function () {
        let insns = compileMainSnippet("let a = 8;\n" +
            "a <<= 3;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(8)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(3)),
            new EcmaShl2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("greaterThanGreaterThanEqual", function () {
        let insns = compileMainSnippet("let a = 4;\n" +
            "a >>= 1;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(4)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(1)),
            new EcmaShr2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("greaterThanGreaterThanGreaterThanEqual", function () {
        let insns = compileMainSnippet("let a = 8;\n" +
            "a >>>= 2;");
        let lhs = new VReg();

        let expected = [
            new LdaiDyn(new Imm(8)),
            new EcmaStlettoglobalrecord('a'),
            new EcmaTryldglobalbyname('a'),
            new StaDyn(lhs),
            new LdaiDyn(new Imm(2)),
            new EcmaAshr2dyn(lhs),
            new EcmaTrystglobalbyname('a'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });
});
