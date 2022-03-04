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
    EcmaDecdyn,
    EcmaIncdyn,
    EcmaIstrue,
    EcmaNegdyn,
    EcmaNotdyn,
    EcmaReturnundefined,
    EcmaStlettoglobalrecord,
    EcmaTonumber,
    EcmaTryldglobalbyname,
    EcmaTrystglobalbyname,
    Imm,
    Jeqz,
    Jmp,
    Label,
    LdaDyn,
    LdaiDyn, ResultType, StaDyn, VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

describe("PrefixOperationsTest", function () {
    it('let i = 5; ++i', function () {
        let insns = compileMainSnippet("let i = 5; let j = ++i");

        let temp = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('i'),
            new EcmaTryldglobalbyname('i'),
            new StaDyn(temp),
            new EcmaIncdyn(temp),
            new EcmaTrystglobalbyname('i'),
            new EcmaStlettoglobalrecord('j'),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it('let i = 5; --i', function () {
        let insns = compileMainSnippet("let i = 5; let j = --i");

        let temp = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('i'),
            new EcmaTryldglobalbyname('i'),
            new StaDyn(temp),
            new EcmaDecdyn(temp),
            new EcmaTrystglobalbyname('i'),
            new EcmaStlettoglobalrecord('j'),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it('let i = 5; let j = +i', function () {
        let insns = compileMainSnippet("let i = 5; let j = +i");

        let temp = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('i'),
            new EcmaTryldglobalbyname('i'),
            new StaDyn(temp),
            new EcmaTonumber(temp),
            new EcmaStlettoglobalrecord('j'),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it('let i = 5; let j = -i', function () {
        let insns = compileMainSnippet("let i = 5; let j = -i");

        let temp = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('i'),
            new EcmaTryldglobalbyname('i'),
            new StaDyn(temp),
            new EcmaNegdyn(temp),
            new EcmaStlettoglobalrecord('j'),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it('let i = 5; let j = !i', function () {
        let insns = compileMainSnippet("let i = 5; let j = !i");

        let preLabel = new Label();
        let postLabel = new Label();
        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('i'),
            new EcmaTryldglobalbyname('i'),
            new StaDyn(new VReg()),
            new EcmaIstrue(),
            new Jeqz(preLabel),
            new LdaDyn(new VReg()),
            new Jmp(postLabel),
            preLabel,
            new LdaDyn(new VReg()),
            postLabel,
            new EcmaStlettoglobalrecord('j'),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it('let i = 5; let j = ~i', function () {
        let insns = compileMainSnippet("let i = 5; let j = ~i");

        let temp_i = new VReg();

        let expected = [
            new LdaiDyn(new Imm(5)),
            new EcmaStlettoglobalrecord('i'),
            new EcmaTryldglobalbyname('i'),
            new StaDyn(temp_i),
            new EcmaNotdyn(temp_i),
            new EcmaStlettoglobalrecord('j'),
            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });
});