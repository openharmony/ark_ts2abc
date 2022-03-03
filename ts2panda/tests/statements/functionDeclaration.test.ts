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
    EcmaCopyrestargs,
    EcmaDefinefuncdyn,
    EcmaReturnundefined,
    EcmaStglobalvar,
    EcmaStlettoglobalrecord,
    EcmaStricteqdyn,
    Imm,
    Jeqz,
    Label,
    LdaDyn,
    LdaiDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import {
    GlobalVariable,
    LocalVariable
} from "../../src/variable";
import { checkInstructions, compileAllSnippet, SnippetCompiler } from "../utils/base";

describe("FunctionDeclarationTest", function () {
    it('function definition in the global scope', function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile("function foo() {}");
        let funcName = "foo";
        let expected = [
            new EcmaDefinefuncdyn(funcName, new Imm(0), new VReg()),
            new EcmaStglobalvar(funcName),
            new EcmaReturnundefined()
        ];
        let insns = snippetCompiler.getGlobalInsns();
        let globalScope = snippetCompiler.getGlobalScope();
        expect(checkInstructions(insns, expected)).to.be.true;
        let foo = globalScope!.findLocal(funcName);
        expect(foo != undefined).to.be.true;
        expect(foo instanceof GlobalVariable).to.be.true;
    });

    it('function redefinition in the global scope', function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile(`
      function foo() {}
      function foo() {}
      `);
        let expected = [
            new EcmaDefinefuncdyn("#2#foo", new Imm(0), new VReg()),
            new EcmaStglobalvar("foo"),
            new EcmaReturnundefined()
        ];
        let insns = snippetCompiler.getGlobalInsns();
        let globalScope = snippetCompiler.getGlobalScope();
        expect(checkInstructions(insns, expected)).to.be.true;
        let foo = globalScope!.findLocal("foo");
        expect(foo != undefined).to.be.true;
        expect(foo instanceof GlobalVariable).to.be.true;
    });

    it('function definition inside a function', function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile(`function out() {function foo() {}}`);
        let funcReg = new VReg();
        let expected = [
            new EcmaDefinefuncdyn("foo", new Imm(0), new VReg()),
            new StaDyn(funcReg),

            new EcmaReturnundefined()
        ];
        let functionPg = snippetCompiler.getPandaGenByName("out");
        let insns = functionPg!.getInsns();
        let functionScope = functionPg!.getScope();

        expect(checkInstructions(insns!, expected)).to.be.true;
        let foo = functionScope!.findLocal("foo");
        expect(foo != undefined).to.be.true;
        expect(foo instanceof LocalVariable).to.be.true;
        let parameterLength = functionPg!.getParameterLength();
        expect(parameterLength == 0).to.be.true;
    });

    it("function expression", function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile("let foo = function() {}");
        let insns = snippetCompiler.getGlobalInsns();
        let expected = [
            new EcmaDefinefuncdyn("foo", new Imm(0), new VReg()),
            new EcmaStlettoglobalrecord("foo"),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("Parameters with initializer", function () {
        let compilerunit = compileAllSnippet("function test(a, b = 1) {}");
        let undefinedVReg = new VReg();
        let value = new VReg();
        let endLabel = new Label();

        let expected_main = [
            new EcmaDefinefuncdyn("test", new Imm(1), new VReg()),
            new EcmaStglobalvar("test"),
            new EcmaReturnundefined()
        ];
        let expected_func = [
            // func_test_0
            new LdaDyn(new VReg()),
            new EcmaStricteqdyn(undefinedVReg),
            new Jeqz(endLabel),
            new LdaiDyn(new Imm(1)),
            new StaDyn(value),
            endLabel,
            new EcmaReturnundefined(),
        ];

        compilerunit.forEach(element => {
            if (element.internalName == "func_main_0") {
                let insns = element.getInsns();
                expect(checkInstructions(insns, expected_main)).to.be.true;
            } else if (element.internalName == "test") {
                let insns = element.getInsns();
                expect(checkInstructions(insns, expected_func)).to.be.true;
                let parameterLength = element.getParameterLength();
                expect(parameterLength == 1).to.be.true;
            }
        });
    });

    it("Rest Parameters", function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile(`function test(a, ...b) {}`);

        let idx = new Imm(1);
        let lastParam = new VReg();
        let expected_func = [
            // func_test_0
            new EcmaCopyrestargs(idx),
            new StaDyn(lastParam),
            new EcmaReturnundefined(),
        ];

        let functionPg = snippetCompiler.getPandaGenByName("test");
        let insns = functionPg!.getInsns();

        expect(checkInstructions(insns, expected_func)).to.be.true;
    });
});
