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

describe("union tests in union.test.ts", function () {
    it("test union with primitives", function () {
        let fileNames = 'tests/types/union/union_primitives.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#3#num", shift + 1],
            ["#4#str", shift + 2],
            ["#5#und", shift + 3],
            ["#6#full", shift + 4],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 4], [2, 0]
            ],
            [
                [2, 4], [2, 2], [2, 1], [2, 2]
            ],
            [
                [2, 4], [2, 2], [2, 4], [2, 5]
            ],
            [
                [2, 4], [2, 2], [2, 7], [2, 6]
            ],
            [
                [2, 4], [2, 6], [2, 1], [2, 2],
                [2, 4], [2, 5], [2, 7], [2, 6]
            ]
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });

    it("test union with user defined type", function () {
        let fileNames = 'tests/types/union/union_userDefinedType.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#3#A", shift + 2],
            ["#4#c", shift + 1],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 4], [2, 0]
            ],
            [
                [2, 4], [2, 2], [2, 53], [2, 54]
            ],
            [
                [2, 1], [2, 0], [2, 0], [2, 0],
                [2, 0], [2, 0], [2, 0], [2, 0]
            ],
            [
                [2, 2], [2, 52]
            ],
            [
                [2, 5], [2, 1]
            ]
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });

    it("test union with multi same primitives", function () {
        let fileNames = 'tests/types/union/union_multi_same_primi.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#3#u1", shift + 1],
            ["#4#u2", shift + 1],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 1], [2, 0]
            ],
            [
                [2, 4], [2, 2], [2, 1], [2, 2]
            ],
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });

    it("test union with multi same user defined type", function () {
        let fileNames = 'tests/types/union/union_multi_userDefinedType.ts';
        let result = compileTsWithType(fileNames);
        let functionPg = result.snippetCompiler.getPandaGenByName("func_main_0");
        let locals = functionPg!.getLocals();
        // check vreg
        let extectedVRegTypePair = [
            ["#3#A", shift + 2],
            ["#4#c", shift + 1],
            ["#5#d", shift + 1],
        ]
        let vreg2TypeMap = createVRegTypePair(extectedVRegTypePair);
        expect(compareVReg2Type(vreg2TypeMap, locals), "check vreg typeInfo").to.be.true;

        // check liberalBuffer
        let expectedBuffValues = [
            [
                [2, 0], [2, 4], [2, 0]
            ],
            [
                [2, 4], [2, 2], [2, 53], [2, 54]
            ],
            [
                [2, 1], [2, 0], [2, 0], [2, 0],
                [2, 0], [2, 0], [2, 0], [2, 0]
            ],
            [
                [2, 2], [2, 52]
            ],
            [
                [2, 5], [2, 1]
            ]
        ]
        let buff = createLiteralBufferArray(expectedBuffValues);
        expect(compareLiteralBuffer(buff, result.literalBufferArray), "check literal buffer").to.be.true;
    });
});