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

import { expect } from 'chai';
import 'mocha';
import * as ts from "typescript";
import {
    CallRange,
    EcmaCallirangedyn,
    EcmaReturnundefined,
    EcmaStlettoglobalrecord,
    EcmaTryldglobalbyname,
    Imm,
    IRNode,
    LdaiDyn,
    ResultType,
    StaDyn,
    VReg
} from "../src/irnodes";
import { PandaGen } from "../src/pandagen";
import { CacheExpander } from "../src/pass/cacheExpander";
import { RegAlloc } from "../src/regAllocator";
import { basicChecker, checkInstructions, compileAllSnippet } from "./utils/base";


function checkRegisterNumber(left: IRNode, right: IRNode): boolean {
    if (!basicChecker(left, right)) {
        return false;
    }
    let lo = left.operands;
    let ro = right.operands;
    if (lo.length !== ro.length) {
        return false;
    }
    for (let i = 0; i < lo.length; ++i) {
        let l = lo[i];
        let r = ro[i];
        if (l instanceof VReg && r instanceof VReg) {
            if (!((<VReg>l).num == (<VReg>r).num)) {
                return false;
            }
        }
    }
    return true;
}
describe("RegAllocator", function () {
    it("make spill for Src register", function () {
        let string: string = "";
        for (let i = 0; i < 256; ++i) {
            string += "let a" + i + " = " + i + ";";
        }
        string += "a255;";

        let pgs = compileAllSnippet(string, [new CacheExpander(), new RegAlloc()]);
        let insns = pgs[0].getInsns();

        let expected: IRNode[] = [
            new LdaiDyn(new Imm(252)),
            new EcmaStlettoglobalrecord('a252'),
            new LdaiDyn(new Imm(253)),
            new EcmaStlettoglobalrecord('a253'),
            new LdaiDyn(new Imm(254)),
            new EcmaStlettoglobalrecord('a254'),
            new LdaiDyn(new Imm(255)),
            new EcmaStlettoglobalrecord('a255'),
            new EcmaTryldglobalbyname('a255'),
            new EcmaReturnundefined()
        ]

        expect(checkInstructions(insns.slice(insns.length - 10), expected, checkRegisterNumber)).to.be.true;
    });

    it("make spill for SrcDst register", function () {
        /* the only possible instruction whose operand register type could be SrcDstVReg is INCI,
         * but we do not use it at all by now
         */
        expect(true).to.be.true;
    });

    it("make spill for CalliDynRange", function () {
        /* since the bitwidth for CalliDynRange source register is 16 now, we do not need to make spill at all.
           but later 16 might be changed to 8, then spill operation will be needed in some cases. this testcase is designed
           for 8bits constraints.
        */
        let string = "";
        for (let i = 0; i < 256; ++i) {
            string += "let a" + i + " = " + i + ";";
        }
        string += "call(a252, a253, a254, a255);";
        let pgs = compileAllSnippet(string, [new CacheExpander(), new RegAlloc()]);
        let insns = pgs[0].getInsns();
        let v = [];
        for (let i = 0; i < 8; ++i) {
            v[i] = new VReg();
            v[i].num = i;
        }
        let expected = [
            new LdaiDyn(new Imm(252)),
            new EcmaStlettoglobalrecord('a252'),
            new LdaiDyn(new Imm(253)),
            new EcmaStlettoglobalrecord('a253'),
            new LdaiDyn(new Imm(254)),
            new EcmaStlettoglobalrecord('a254'),
            new LdaiDyn(new Imm(255)),
            new EcmaStlettoglobalrecord('a255'),
            new EcmaTryldglobalbyname('call'),
            new StaDyn(v[3]),
            new EcmaTryldglobalbyname('a252'),
            new StaDyn(v[4]),
            new EcmaTryldglobalbyname('a253'),
            new StaDyn(v[5]),
            new EcmaTryldglobalbyname('a254'),
            new StaDyn(v[6]),
            new EcmaTryldglobalbyname('a255'),
            new StaDyn(v[7]),
            new EcmaCallirangedyn(new Imm(4), [v[3],v[4],v[5],v[6],v[7]]),
            new EcmaReturnundefined(),
        ];
        expect(checkInstructions(insns.slice(insns.length - 20), expected, checkRegisterNumber)).to.be.true;
    });

    it("VReg sequence of CalliDynRange is not continuous", function () {
        let pandaGen = new PandaGen('', 0);

        let para1 = pandaGen.getTemp();
        let para2 = pandaGen.getTemp();
        let para3 = pandaGen.getTemp();
        let para4 = pandaGen.getTemp();
        let para5 = pandaGen.getTemp();
        let para6 = pandaGen.getTemp();

        pandaGen.call(ts.createNode(0), [para1, para2, para3, para4, para5, para6], false);

        pandaGen.freeTemps(para1, para3, para2);

        try {
            new RegAlloc().run(pandaGen);
        } catch (err) {
            expect(true).to.be.true;
            return;
        }
        expect(true).to.be.false;
    });

    it("VReg sequence of DynRange is not continuous", function () {
        let pandaGen = new PandaGen('', 0);

        let para1 = pandaGen.getTemp();
        let para2 = pandaGen.getTemp();
        let para3 = pandaGen.getTemp();

        pandaGen.getInsns().push(new CallRange('test', [para1, para2, para3]))

        pandaGen.freeTemps(para1, para3, para2);

        try {
            new RegAlloc().run(pandaGen);
        } catch (err) {
            expect(true).to.be.true;
            return;
        }
        expect(true).to.be.false;
    });
});
