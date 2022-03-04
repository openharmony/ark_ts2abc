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
    EcmaAdd2dyn,
    EcmaCallithisrangedyn,
    EcmaCreateemptyarray,
    EcmaGettemplateobject,
    EcmaLdobjbyname,
    EcmaReturnundefined,
    EcmaStobjbyvalue,
    EcmaTryldglobalbyname,
    Imm,
    IRNode,
    LdaDyn,
    LdaiDyn,
    LdaStr,
    MovDyn,
    ResultType,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { checkInstructions, compileMainSnippet } from "../utils/base";

function MicroCreateAddInsns(leftVal: number, rightVal: number): IRNode[] {
    let insns = [];
    let lhs = new VReg();

    insns.push(new LdaiDyn(new Imm(leftVal)));
    insns.push(new StaDyn(lhs));
    insns.push(new LdaiDyn(new Imm(rightVal)));
    insns.push(new EcmaAdd2dyn(lhs));

    return insns;
}

function MicroCreateObjAndPropInsns(): IRNode[] {
    let insns = [];
    let obj = new VReg();
    let val = new VReg();

    insns.push(new EcmaTryldglobalbyname("String"));
    insns.push(new StaDyn(obj));
    insns.push(new EcmaLdobjbyname("raw", obj));
    insns.push(new StaDyn(val));

    return insns;
}

function MicroGetTemplateObject(rawArr: VReg, cookedArr: VReg): IRNode[] {
    let insns = [];
    let objReg = new VReg();
    let indexReg = new VReg();

    insns.push(new EcmaCreateemptyarray());
    insns.push(new StaDyn(objReg));

    insns.push(new LdaiDyn(new Imm(0)));
    insns.push(new StaDyn(indexReg));
    insns.push(new LdaDyn(rawArr));
    insns.push(new EcmaStobjbyvalue(objReg, indexReg));
    insns.push(new LdaiDyn(new Imm(1)));
    insns.push(new StaDyn(indexReg));
    insns.push(new LdaDyn(cookedArr));
    insns.push(new EcmaStobjbyvalue(objReg, indexReg));
    insns.push(new EcmaGettemplateobject(objReg));
    return insns;

}

describe("templateExpressionTest", function () {
    it("`string text line 1`", function () {
        let insns = compileMainSnippet("`string text line 1`;");
        let expected = [
            new LdaStr("string text line 1"),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("`Fifteen is ${5 + 10}`", function () {
        let insns = compileMainSnippet("`Fifteen is ${5 + 10}`");
        let headVal = new VReg();

        let expected = [
            new LdaStr("Fifteen is "),
            new StaDyn(headVal),
            ...MicroCreateAddInsns(5, 10),
            new EcmaAdd2dyn(headVal),
            new EcmaReturnundefined()
        ]
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("String.raw`string text line 1`", function () {
        let insns = compileMainSnippet("String.raw`string text line 1`;");
        let obj = new VReg();
        let prop = new VReg();
        let elemIdxReg = new VReg();
        let rawArr = new VReg();
        let cookedArr = new VReg();
        let rawArr1 = new VReg();
        let cookedArr1 = new VReg();
        let templateObj = new VReg();

        let expected = [

            ...MicroCreateObjAndPropInsns(),
            new EcmaCreateemptyarray(),
            new StaDyn(rawArr),
            new EcmaCreateemptyarray(),
            new StaDyn(cookedArr),

            new LdaiDyn(new Imm(0)),
            new StaDyn(elemIdxReg),
            new LdaStr("string text line 1"),
            new EcmaStobjbyvalue(rawArr, elemIdxReg),

            new LdaStr("string text line 1"),
            new EcmaStobjbyvalue(cookedArr, elemIdxReg),
            new MovDyn(rawArr1, rawArr),
            new MovDyn(cookedArr1, cookedArr),

            ...MicroGetTemplateObject(rawArr1, cookedArr),
            new StaDyn(templateObj),

            // structure call 
            new EcmaCallithisrangedyn(new Imm(2), [prop, obj, templateObj]),

            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("String.raw`string text line 1\\nstring text line 2`", function () {
        let insns = compileMainSnippet("String.raw`string text line 1\\nstring text line 2`;");
        let obj = new VReg();
        let prop = new VReg();
        let elemIdxReg = new VReg();
        let rawArr = new VReg();
        let cookedArr = new VReg();
        let rawArr1 = new VReg();
        let cookedArr1 = new VReg();
        let templateObj = new VReg();

        let expected = [

            ...MicroCreateObjAndPropInsns(),
            new EcmaCreateemptyarray(),
            new StaDyn(rawArr),
            new EcmaCreateemptyarray(),
            new StaDyn(cookedArr),

            new LdaiDyn(new Imm(0)),
            new StaDyn(elemIdxReg),
            new LdaStr("string text line 1\\nstring text line 2"),
            new EcmaStobjbyvalue(rawArr, elemIdxReg),

            new LdaStr("string text line 1\nstring text line 2"),
            new EcmaStobjbyvalue(cookedArr, elemIdxReg),
            new MovDyn(rawArr1, rawArr),
            new MovDyn(cookedArr1, cookedArr),

            ...MicroGetTemplateObject(rawArr1, cookedArr1),
            new StaDyn(templateObj),

            // structure call 
            new EcmaCallithisrangedyn(new Imm(2), [prop, obj, templateObj]),

            new EcmaReturnundefined()
        ];

        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("String.raw`Fifteen is ${5 + 10} !!`", function () {
        let insns = compileMainSnippet("String.raw`Fifteen is ${5 + 10} !!`");
        let obj = new VReg();
        let prop = new VReg();
        let elemIdxReg = new VReg();
        let rawArr = new VReg();
        let cookedArr = new VReg();
        let rawArr1 = new VReg();
        let cookedArr1 = new VReg();
        let addRet = new VReg();
        let templateObj = new VReg();

        let expected = [

            ...MicroCreateObjAndPropInsns(),
            new EcmaCreateemptyarray(),
            new StaDyn(rawArr),
            new EcmaCreateemptyarray(),
            new StaDyn(cookedArr),

            new LdaiDyn(new Imm(0)),
            new StaDyn(elemIdxReg),
            new LdaStr("Fifteen is "),
            new EcmaStobjbyvalue(rawArr, elemIdxReg),
            new LdaStr("Fifteen is "),
            new EcmaStobjbyvalue(cookedArr, elemIdxReg),
            new LdaiDyn(new Imm(1)),
            new StaDyn(elemIdxReg),
            new LdaStr(" !!"),
            new EcmaStobjbyvalue(rawArr, elemIdxReg),
            new LdaStr(" !!"),
            new EcmaStobjbyvalue(cookedArr, elemIdxReg),
            new MovDyn(rawArr1, rawArr),
            new MovDyn(cookedArr1, cookedArr),

            ...MicroGetTemplateObject(rawArr1, cookedArr1),
            new StaDyn(templateObj),

            ...MicroCreateAddInsns(5, 10),
            new StaDyn(addRet),

            // structure call
            new EcmaCallithisrangedyn(new Imm(3), [prop, obj, rawArr, templateObj]),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("String.raw`Fifteen is ${5 + 10} !!\\n Is not ${15 + 10} !!!`", function () {
        let insns = compileMainSnippet("String.raw`Fifteen is ${5 + 10} !!\\n Is not ${15 + 10} !!!\\n`");
        let obj = new VReg();
        let val = new VReg();
        let prop = new VReg();
        let elemIdxReg = new VReg();
        let rawArr = new VReg();
        let cookedArr = new VReg();
        let rawArr1 = new VReg();
        let cookedArr1 = new VReg();
        let addRet1 = new VReg();
        let addRet2 = new VReg();
        let templateObj = new VReg();

        let expected = [

            ...MicroCreateObjAndPropInsns(),
            new EcmaCreateemptyarray(),
            new StaDyn(rawArr),
            new EcmaCreateemptyarray(),
            new StaDyn(cookedArr),

            new LdaiDyn(new Imm(0)),
            new StaDyn(elemIdxReg),
            new LdaStr("Fifteen is "),
            new EcmaStobjbyvalue(rawArr, elemIdxReg),
            new LdaStr("Fifteen is "),
            new EcmaStobjbyvalue(cookedArr, elemIdxReg),
            new LdaiDyn(new Imm(1)),
            new StaDyn(elemIdxReg),
            new LdaStr(" !!\\n Is not "),
            new EcmaStobjbyvalue(rawArr, elemIdxReg),
            new LdaStr(" !!\n Is not "),
            new EcmaStobjbyvalue(cookedArr, elemIdxReg),
            new LdaiDyn(new Imm(2)),
            new StaDyn(elemIdxReg),
            new LdaStr(" !!!\\n"),
            new EcmaStobjbyvalue(rawArr, elemIdxReg),
            new LdaStr(" !!!\n"),
            new EcmaStobjbyvalue(cookedArr, elemIdxReg),
            new MovDyn(rawArr1, rawArr),
            new MovDyn(cookedArr1, cookedArr),

            ...MicroGetTemplateObject(rawArr1, cookedArr1),
            new StaDyn(templateObj),

            ...MicroCreateAddInsns(5, 10),
            new StaDyn(addRet1),
            ...MicroCreateAddInsns(15, 10),
            new StaDyn(addRet2),

            // structure call
            new EcmaCallithisrangedyn(new Imm(4), [prop, obj, rawArr, cookedArr, templateObj]),
            new EcmaReturnundefined()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });
});