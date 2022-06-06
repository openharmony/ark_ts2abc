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
import { checkInstructions, SnippetCompiler } from "./utils/base";
import {
    EcmaCallarg1dyn,
    EcmaCallirangedyn,
    EcmaDefinefuncdyn,
    EcmaReturnundefined,
    EcmaStobjbyname,
    Imm,
    LdaDyn,
    LdaiDyn,
    LdaStr,
    MovDyn,
    StaDyn,
    VReg
} from "../src/irnodes";
import { CmdOptions } from '../src/cmdOptions';


describe("CommonJsTest", function () {

    it("mainFunc", function() {
        CmdOptions.isCommonJs = () => {return true};
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compileCommonjs(`let a = 1`, 'cjs.js');
        CmdOptions.isCommonJs = () => {return false};
        let funcMainInsns = snippetCompiler.getGlobalInsns();
        let expected = [
            new EcmaDefinefuncdyn('#1#', new Imm(5), new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaCallirangedyn(new Imm(5), [new VReg(), new VReg(), new VReg(), new VReg(), new VReg(), new VReg()]),
            new EcmaReturnundefined(),
        ];
        expect(checkInstructions(funcMainInsns, expected)).to.be.true;
    });

    it("requireTest", function() {
        CmdOptions.isCommonJs = () => {return true};
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compileCommonjs(`let a = require('a.js')`, 'cjs.js');
        CmdOptions.isCommonJs = () => {return false};
        let execInsns = snippetCompiler.getPandaGenByName('#1#')!.getInsns();
        let requirePara = new VReg();
        let requireReg = new VReg();
        let moduleRequest = new VReg();
        let expected = [
            new LdaDyn(requirePara),
            new StaDyn(requireReg),
            new LdaStr("a.js"),
            new StaDyn(moduleRequest),
            new EcmaCallarg1dyn(requireReg, moduleRequest),
            new StaDyn(new VReg()),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(execInsns, expected)).to.be.true;
    });

    it("exportTest", function() {
        CmdOptions.isCommonJs = () => {return true};
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compileCommonjs(`let a = 1; exports.a = a;`, 'cjs.js');
        CmdOptions.isCommonJs = () => {return false};
        let execInsns = snippetCompiler.getPandaGenByName('#1#')!.getInsns();
        let exportsPara = new VReg();
        let exportsReg = new VReg();
        let tmpReg = new VReg();
        let a = new VReg();
        let expected = [
            new LdaiDyn(new Imm(1)),
            new StaDyn(a),
            new LdaDyn(exportsPara),
            new StaDyn(exportsReg),
            new MovDyn(tmpReg, exportsReg),
            new LdaDyn(a),
            new EcmaStobjbyname("a", tmpReg),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(execInsns, expected)).to.be.true;
    });
});