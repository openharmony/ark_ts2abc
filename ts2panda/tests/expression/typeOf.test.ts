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
    EcmaCallarg1dyn,
    EcmaLdobjbyname,
    EcmaReturnundefined,
    EcmaTryldglobalbyname,
    EcmaTypeofdyn,
    Imm,
    LdaiDyn,
    LdaStr,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("TypeOfTest", function () {
    it("typeof 12", function () {
        let insns = compileMainSnippet("typeof 5");
        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaTypeofdyn(),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("typeof Number(\"12\")", function () {
        let insns = compileMainSnippet("typeof Number(\"5\")");
        let arg1 = new VReg();
        let arg3 = new VReg();
        let expected = [
            new EcmaTryldglobalbyname("Number"),
            new StaDyn(arg1),

            new LdaStr("5"),
            new StaDyn(arg3),
            new EcmaCallarg1dyn(arg1, arg3),
            new EcmaTypeofdyn(),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("typeof x", function () {
        let insns = compileMainSnippet("typeof x");

        let expected = [
            new EcmaLdobjbyname("x", new VReg()),
            new EcmaTypeofdyn(),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("typeof(x)", function () {
        let insns = compileMainSnippet("typeof(x)");

        let expected = [
            new EcmaLdobjbyname("x", new VReg()),
            new EcmaTypeofdyn(),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });
});
