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
    EcmaDelobjprop,
    EcmaReturnundefined,
    EcmaStlettoglobalrecord,
    EcmaTryldglobalbyname,
    Imm,
    LdaDyn,
    LdaiDyn,
    LdaStr,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet, SnippetCompiler } from "../utils/base";

describe("deleteExpressionTest", function () {
    it("deleteElementFromArray", function () {
        let insns = compileMainSnippet("let arr = [1, 2]; delete arr[1];");

        let objReg = new VReg();
        let propReg = new VReg();

        let expected = [
            // let arr = [1, 2];
            // ...
            // delete arr[1];
            new EcmaStlettoglobalrecord('arr'),
            new EcmaTryldglobalbyname('arr'),
            new StaDyn(objReg),
            new LdaiDyn(new Imm(1)),
            new StaDyn(propReg),
            new EcmaDelobjprop(objReg, propReg),
            new EcmaReturnundefined()
        ];

        insns = insns.slice(insns.length - 7, insns.length);
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("deletePropFromObj", function () {
        // this Snippet code isn't supported by TS
        let insns = compileMainSnippet(`let obj = {
                                  a: 1,
                                  b: 2};
                                  delete obj.b;`);
        let objReg = new VReg();
        let propReg = new VReg();

        let expected = [
            // delete obj.b;
            new EcmaStlettoglobalrecord('obj'),
            new EcmaTryldglobalbyname('obj'),
            new StaDyn(objReg),
            new LdaStr("b"),
            new StaDyn(propReg),
            new EcmaDelobjprop(objReg, propReg),
            new EcmaReturnundefined()
        ];

        insns = insns.slice(insns.length - 7, insns.length);
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    // delete function call won't use delObjProp
    it("deleteFunctionCall", function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile(`var foo = function() {
                                  bIsFooCalled = true;
                              };
                              let a = delete foo();`);

        let insns = snippetCompiler.getGlobalInsns();
        let expected = [
            // function call insns
            new LdaDyn(new VReg()),
            new EcmaStlettoglobalrecord('a'),
            new EcmaReturnundefined()
        ];

        insns = insns.slice(insns.length - 3, insns.length);
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    // delete keywords won't use delObjProp
    it("deleteKeywords", function () {
        let insns = compileMainSnippet(`let a = delete false;`);

        let expected = [
            new LdaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new EcmaStlettoglobalrecord('a'),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("deleteUnresolvable", function () {
        let insns = compileMainSnippet(`delete a;`);
        let globalReg = new VReg();
        let a = new VReg();

        let expected = [
            new LdaStr("a"),
            new StaDyn(a),
            new EcmaDelobjprop(globalReg, a),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("double delete", function () {
        let insns = compileMainSnippet(`delete delete a;`);
        let globalReg = new VReg();
        let a = new VReg();

        let expected = [
            new LdaStr("a"),
            new StaDyn(a),
            new EcmaDelobjprop(globalReg, a),
            new LdaDyn(new VReg()),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });
});