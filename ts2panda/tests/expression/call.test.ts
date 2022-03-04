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
    EcmaCallarg0dyn,
    EcmaCallarg1dyn,
    EcmaCallithisrangedyn,
    EcmaCallspreaddyn,
    EcmaCreatearraywithbuffer,
    EcmaCreateemptyarray,
    EcmaLdobjbyname,
    EcmaLdobjbyvalue,
    EcmaReturnundefined,
    EcmaStarrayspread,
    EcmaStconsttoglobalrecord,
    EcmaStlettoglobalrecord,
    EcmaTryldglobalbyname,
    Imm,
    LdaDyn,
    LdaiDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("CallTest", function () {
    it("no arg call of a global standalone function", function () {
        let insns = compileMainSnippet(`
      foo();
      `);
        let arg0 = new VReg();
        let expected = [
            new EcmaTryldglobalbyname("foo"),
            new StaDyn(arg0),
            new EcmaCallarg0dyn(arg0),

            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("one arg call of a global standalone function", function () {
        let insns = compileMainSnippet(`
      let i = 5;
      foo(i);
      `);
        let arg0 = new VReg();
        let arg2 = new VReg();
        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('i'),
            new EcmaTryldglobalbyname("foo"),
            new StaDyn(arg0),
            new EcmaTryldglobalbyname('i'),
            new StaDyn(arg2),
            new EcmaCallarg1dyn(arg0, arg2),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("call method", function () {
        let insns = compileMainSnippet(`
      Foo.method();
      `);
        let obj = new VReg();
        let arg0 = new VReg();
        let arg1 = new VReg();
        let expected = [
            new EcmaTryldglobalbyname("Foo"),
            new StaDyn(arg0),
            new EcmaLdobjbyname("method", arg0),
            new StaDyn(arg1),
            new EcmaCallithisrangedyn(new Imm(1), [arg1, obj]),

            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("spread element call of a global standalone function", function () {
        let insns = compileMainSnippet(`
       const args = [1, 2];
       myFunction(...args);
      `);
        let arg0 = new VReg();
        let globalEnv = new VReg();
        let lengthReg = new VReg();
        let arrayInstance = new VReg();

        let expected = [
            new EcmaCreatearraywithbuffer(new Imm(0)),
            new StaDyn(arrayInstance),
            new LdaDyn(arrayInstance),
            new EcmaStconsttoglobalrecord('args'),

            new EcmaTryldglobalbyname("myFunction"),
            new StaDyn(arg0),

            new EcmaCreateemptyarray(),
            new StaDyn(arrayInstance),
            new LdaiDyn(new Imm(0)),
            new StaDyn(lengthReg),
            new EcmaTryldglobalbyname('args'),
            new EcmaStarrayspread(arrayInstance, lengthReg),
            new StaDyn(lengthReg),
            new LdaDyn(arrayInstance),

            new EcmaCallspreaddyn(arg0, globalEnv, arrayInstance),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("call by element access", function () {
        let insns = compileMainSnippet(`
            Foo[method]();
            `);
        let obj = new VReg();
        let prop = new VReg();
        let arg0 = new VReg();
        let arg1 = new VReg();
        let expected = [
            new EcmaTryldglobalbyname("Foo"),
            new StaDyn(arg0),
            new EcmaTryldglobalbyname("method"),
            new StaDyn(prop),
            new EcmaLdobjbyvalue(arg0, prop),
            new StaDyn(arg1),
            new EcmaCallithisrangedyn(new Imm(1), [arg1, obj]),

            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });
});
