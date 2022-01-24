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

import { expect } from 'chai';
import 'mocha';
import {
    compileTsWithType,
    createLiteralBufferArray,
    compareLiteralBuffer,
    createVRegTypePair,
    compareVReg2Type
} from "./typeUtils";
import { PrimitiveType } from '../../src/base/typeSystem';

let shift = PrimitiveType._LENGTH;

describe("function tests in function.test.ts", function () {
    it("test function with no parameter", function () {
        let fileNames = 'tests/types/function/function_no_para.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#0#emptyFunc", shift + 2],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 1], [2, 0]
            ],
            [
                [2, 3], [2, 0], [2, 0], [5, 'local'],
                [2, 0], [2, 0]
            ],
            [
                [2, 3], [2, 0], [2, 0], [5, 'emptyFunc'],
                [2, 0], [2, 0]
            ]
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });

    it("test function with muti parameter", function () {
        let fileNames = 'tests/types/function/function_multi_para.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#0#num", 1],
            ["#1#str", 4],
            ["#0#emptyFunc", shift + 2],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 2], [2, 0]
            ],
            [
                [2, 3], [2, 0], [2, 0], [5, 'local'],
                [2, 0], [2, 0]
            ],
            [
                [2, 3], [2, 0], [2, 0], [5, 'emptyFunc'],
                [2, 2], [2, 1], [2, 4], [2, 4]
            ]
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });

    it("test function with same type of paras and return", function () {
        let fileNames = 'tests/types/function/function_same_para_and_return.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#0#num", 1],
            ["#1#str", 4],
            ["#0#num", 1],
            ["#1#str", 4],
            ["#0#foo", shift + 2],
            ["#1#bar", shift + 3],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 3], [2, 0]
            ],
            [
                [2, 3],[2, 0],[2, 0],[5, 'twoFunctions'],
                [2, 0],[2, 0]
            ],
            [
                [2, 3],[2, 0],[2, 0],[5, 'foo'],
                [2, 2],[2, 1],[2, 4],[2, 3]
            ],
            [
                [2, 3],[2, 0],[2, 0],[5, 'bar'],
                [2, 2],[2, 1],[2, 4],[2, 3]
            ]
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });

    it("test function with class as parameter", function () {
        let fileNames = 'tests/types/function/function_class_para.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#0#num", 1],
            ["#1#a", shift + 4],
            ["#0#foo", shift + 2],
            ["#1#A", shift + 3],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 4], [2, 0]
            ],
            [
                [2, 3], [2, 0], [2, 0], [5, 'localClass'],
                [2, 0], [2, 0]
            ],
            [
                [2, 3], [2, 0], [2, 0], [5, 'foo'],
                [2, 2], [2, 1], [2, shift + 4], [2, 0]
            ],
            [

                [2, 1], [2, 0], [2, 0], [2, 0],
                [2, 0], [2, 0], [2, 0], [2, 0]
            ],
            [
                [2, 2], [2, shift + 3]
            ]
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });

    it("test function with class as return", function () {
        let fileNames = 'tests/types/function/function_class_return.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#0#foo", shift + 2],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 4], [2, 0]
            ],
            [
                [2, 3], [2, 0], [2, 0], [5, 'localClass'],
                [2, 0], [2, 0]
            ],
            [
                [2, 3], [2, 0], [2, 0], [5, 'foo'],
                [2, 0], [2, shift + 4]
            ],
            [

                [2, 1], [2, 0], [2, 0], [2, 0],
                [2, 0], [2, 0], [2, 0], [2, 0]
            ],
            [
                [2, 2], [2, shift + 3]
            ]
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });
});
