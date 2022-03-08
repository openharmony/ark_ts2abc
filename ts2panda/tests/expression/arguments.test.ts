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
    EcmaGetunmappedargs,
    EcmaLdobjbyindex,
    EcmaReturnundefined,
    Imm,
    LdaDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, SnippetCompiler } from "../utils/base";

describe("arguments Keyword", function () {
    it('arguments: Array-like object accessible inside functions', function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile(`function foo(a,b) {arguments[0];}`);
        let argumentsReg = new VReg();
        let temp1 = new VReg();
        let expected = [
            new EcmaGetunmappedargs(),
            new StaDyn(argumentsReg),
            new LdaDyn(argumentsReg),
            new StaDyn(temp1),
            new EcmaLdobjbyindex(temp1, new Imm(0)),
            new EcmaReturnundefined()
        ];
        let functionPg = snippetCompiler.getPandaGenByName("foo");
        let insns = functionPg!.getInsns();

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it('arguments as parameter shadows keyword', function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile(`function foo(arguments) {arguments[0];}`);
        let parameterArguments = new VReg();
        let temp1 = new VReg();
        let expected = [
            new EcmaGetunmappedargs(),
            new StaDyn(new VReg()),
            new LdaDyn(parameterArguments),
            new StaDyn(temp1),
            new EcmaLdobjbyindex(temp1, new Imm(0)),
            new EcmaReturnundefined()
        ];
        let functionPg = snippetCompiler.getPandaGenByName("foo");
        let insns = functionPg!.getInsns();

        expect(checkInstructions(insns, expected)).to.be.true;
    });
});
