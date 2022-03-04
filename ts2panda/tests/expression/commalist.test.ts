/*
 * Copyright (c) 2022 Huawei Device Co., Ltd.
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
    EcmaReturnundefined,
    EcmaStglobalvar,
    EcmaTryldglobalbyname,
    Imm,
    LdaDyn,
    MovDyn,
    StaDyn,
    EcmaDefineclasswithbuffer,
    EcmaStclasstoglobalrecord,
    EcmaNewobjdynrange,
    VReg
} from "../../src/irnodes";
import { checkInstructions, SnippetCompiler } from "../utils/base";

describe("CommaListExpression", function () {
    it("computedPropertyName", function () {
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compileAfter(" \
        class Test { \
            #filed1; \
            #filed2; \
            #filed3; \
            #filed4; \
            #filed5; \
            #filed6; \
            #filed7; \
            #filed8; \
            #filed9; \
            #filed10; \
            #filed11; \
        } \
        ",
        "test.ts");
        let insns = snippetCompiler.getGlobalInsns();
        let expected = [
            new MovDyn(new VReg(), new VReg()),
            new EcmaDefineclasswithbuffer("#1#Test", new Imm(0), new Imm(0), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new EcmaStclasstoglobalrecord("Test"),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed1'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed2'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed3'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed4'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed5'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed6'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed7'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed8'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed9'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed10'),
            new EcmaTryldglobalbyname('WeakMap'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new EcmaStglobalvar('_Test_filed11'),
            new EcmaReturnundefined()
        ]
        expect(checkInstructions(insns, expected)).to.be.true;
    });

});
