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
    EcmaIsfalse,
    EcmaIstrue,
    EcmaReturnundefined,
    Imm,
    Jeqz,
    Jmp,
    Label,
    LdaDyn,
    LdaiDyn, ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";


describe("LogicBinaryOperators", function () {
    it("ampersandAmpersand", function () {
        let insns = compileMainSnippet("8 && false;");
        let lhs = new VReg();
        let preLabel = new Label();
        let postLabel = new Label();

        let expected = [
            new LdaiDyn(new Imm(8)),
            new StaDyn(lhs),
            new EcmaIstrue(),
            new Jeqz(preLabel),
            new LdaDyn(new VReg()),
            new Jmp(postLabel),
            preLabel,
            new LdaDyn(lhs),
            postLabel,
            new EcmaReturnundefined()
        ]

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("barBar", function () {
        let insns = compileMainSnippet("8 || false;");
        let lhs = new VReg();
        let preLabel = new Label();
        let postLabel = new Label();
        let expected = [
            new LdaiDyn(new Imm(8)),
            new StaDyn(lhs),
            new EcmaIsfalse(),
            new Jeqz(preLabel),
            new LdaDyn(new VReg()),
            new Jmp(postLabel),
            preLabel,
            new LdaDyn(lhs),
            postLabel,
            new EcmaReturnundefined()
        ]

        expect(checkInstructions(insns, expected)).to.be.true;
    });
});
