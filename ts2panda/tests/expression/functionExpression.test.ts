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
import { DiagnosticCode, DiagnosticError } from '../../src/diagnostic';
import {
    EcmaAdd2dyn,
    EcmaAsyncfunctionawaituncaught,
    EcmaAsyncfunctionenter,
    EcmaAsyncfunctionreject,
    EcmaAsyncfunctionresolve,
    EcmaCallarg0dyn,
    EcmaCreategeneratorobj,
    EcmaCreateiterresultobj,
    EcmaDefinefuncdyn,
    EcmaDefinegeneratorfunc,
    EcmaDefinencfuncdyn,
    EcmaEqdyn,
    EcmaGetresumemode,
    EcmaLdlexenvdyn,
    EcmaLdfunction,
    EcmaResumegenerator,
    EcmaReturnundefined,
    EcmaSuspendgenerator,
    EcmaThrowdyn,
    Imm,
    Jeqz,
    Label,
    LdaDyn,
    LdaiDyn,
    ResultType,
    ReturnDyn,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { CacheExpander } from '../../src/pass/cacheExpander';
import { checkInstructions, compileAllSnippet } from "../utils/base";

describe("compileFunctionExpression", function () {
    it("FunctionExpression with name", function () {
        let source: string = `
        var a = function test() {
            test();
        }`;

        let passes = [new CacheExpander()];
        let pandaGens = compileAllSnippet(source, passes);

        let expected_func = [
            new EcmaLdlexenvdyn(),
            new StaDyn(new VReg()),
            new EcmaLdfunction(),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaCallarg0dyn(new VReg()),
            new EcmaReturnundefined()
        ];

        let checkCount = 0;
        pandaGens.forEach((pg) => {
            if (pg.internalName == "test") {
                expect(checkInstructions(pg.getInsns(), expected_func), "check func insns").to.be.true;
                checkCount++;
            }
        });

        expect(checkCount).to.equals(1);
    });

    it("FunctionExpression without name", function () {
        let source: string = `
        var a = function () {
        }`;

        let pandaGens = compileAllSnippet(source);

        let checkCount = 0;
        pandaGens.forEach((pg) => {
            if (pg.internalName == "a") {
                checkCount++;
            }

            if (pg.internalName == "func_main_0") {

                pg.getInsns().forEach((insns) => {
                    if (insns instanceof EcmaDefinefuncdyn) {
                        expect(insns.operands[0]).to.equal('a');
                        checkCount++;
                    }
                });
            }
        });

        expect(checkCount).to.equals(2);
    });

    it("FunctionExpression without name in binary expression", function () {
        let source: string = `
        var a;
        a = function () {
        }`;

        let pandaGens = compileAllSnippet(source);

        let checkCount = 0;
        pandaGens.forEach((pg) => {
            if (pg.internalName == "a") {
                checkCount++;
            }

            if (pg.internalName == "func_main_0") {

                pg.getInsns().forEach((insns) => {
                    if (insns instanceof EcmaDefinefuncdyn) {
                        expect(insns.operands[0]).to.equal('a');
                        checkCount++;
                    }
                });
            }
        });

        expect(checkCount).to.equals(2);
    });


    it("ArrowFunction", function () {
        let source: string = `
        var a = ()=> {
        }`;

        let pandaGens = compileAllSnippet(source);
        let checkCount = 0;

        pandaGens.forEach((pg) => {
            if (pg.internalName == "a") {
                checkCount++;
            }

            if (pg.internalName == "func_main_0") {

                pg.getInsns().forEach((insns) => {
                    if (insns instanceof EcmaDefinencfuncdyn) {
                        expect(insns.operands[0]).to.equal('a');
                        checkCount++;
                    }
                });
            }
        });

        expect(checkCount).to.equals(2);
    });

    it("ArrowFunctionWithExpression", function () {
        let source: string = `
        var p = (x, y) => x + y;`;

        let pandaGens = compileAllSnippet(source);
        let checkCount = 0;

        let expected_func = [
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new EcmaAdd2dyn(new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new ReturnDyn()
        ];

        pandaGens.forEach((pg) => {
            if (pg.internalName == "p") {
                expect(checkInstructions(pg.getInsns(), expected_func), "check arrow func insns").to.be.true;
                checkCount++;
            }

            if (pg.internalName == "func_main_0") {

                pg.getInsns().forEach((insns) => {
                    if (insns instanceof EcmaDefinencfuncdyn) {
                        expect(insns.operands[0]).to.equal('p');
                        checkCount++;
                    }
                });
            }
        });

        expect(checkCount).to.equals(2);
    });

    it("ArrowFunctionSyntaxError", function () {
        let source: string = `
            var af = x
                => {};`;
        let errorThrown = false;
        try {
            compileAllSnippet(source);
        } catch (err) {
            expect(err instanceof DiagnosticError).to.be.true;
            expect((<DiagnosticError>err).code).to.equal(DiagnosticCode.Line_terminator_not_permitted_before_arrow);
            errorThrown = true;
        }
        expect(errorThrown).to.be.true;
    });

    it("GeneratorFunction", function () {
        let source: string = `
            function* a() {
                yield 1;
            }`;

        let notRetLabel0 = new Label();
        let notThrowLabel0 = new Label();
        let notRetLabel1 = new Label();
        let notThrowLabel1 = new Label();

        let expected_func = [
            new EcmaCreategeneratorobj(new VReg()),
            new StaDyn(new VReg()),
            new EcmaSuspendgenerator(new VReg(), new VReg()),
            new EcmaResumegenerator(new VReg()),
            new StaDyn(new VReg()),
            new EcmaGetresumemode(new VReg()),
            new StaDyn(new VReg()),

            new LdaiDyn(new Imm(ResultType.Int, 0)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(notRetLabel0),
            new LdaDyn(new VReg()),
            new ReturnDyn(),

            notRetLabel0,
            new LdaiDyn(new Imm(ResultType.Int, 1)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(notThrowLabel0),
            new LdaDyn(new VReg()),
            new EcmaThrowdyn(),

            notThrowLabel0,
            new LdaDyn(new VReg()),
            new LdaiDyn(new Imm(ResultType.Int, 1)),
            new StaDyn(new VReg()),
            new EcmaCreateiterresultobj(new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaSuspendgenerator(new VReg(), new VReg()),
            new EcmaResumegenerator(new VReg()),
            new StaDyn(new VReg()),
            new EcmaGetresumemode(new VReg()),
            new StaDyn(new VReg()),

            new LdaiDyn(new Imm(ResultType.Int, 0)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(notRetLabel1),
            new LdaDyn(new VReg()),
            new ReturnDyn(),

            notRetLabel1,
            new LdaiDyn(new Imm(ResultType.Int, 1)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(notThrowLabel1),
            new LdaDyn(new VReg()),
            new EcmaThrowdyn(),

            notThrowLabel1,
            new LdaDyn(new VReg()),
            new EcmaReturnundefined()
        ];

        let pandaGens = compileAllSnippet(source);
        let checkCount = 0;

        pandaGens.forEach((pg) => {
            if (pg.internalName == "a") {
                expect(checkInstructions(pg.getInsns(), expected_func), "check generator func insns").to.be.true;
                checkCount++;
            }

            if (pg.internalName == "func_main_0") {
                pg.getInsns().forEach((insns) => {
                    if (insns instanceof EcmaDefinegeneratorfunc) {
                        expect(insns.operands[0]).to.equal('a');
                        checkCount++;
                    }
                });
            }
        });

        expect(checkCount).to.equals(2);
    });

    it("AsyncFunction", function () {
        let source: string = `
            async function a() {
                await 1;
            }`;

        let beginLabel = new Label();
        let endLabel = new Label();
        let nextLabel = new Label();

        let expected_func = [
            new EcmaAsyncfunctionenter(),
            new StaDyn(new VReg()),
            beginLabel,
            new LdaiDyn(new Imm(ResultType.Int, 1)),
            new StaDyn(new VReg()),
            new EcmaAsyncfunctionawaituncaught(new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaSuspendgenerator(new VReg(), new VReg()),
            new EcmaResumegenerator(new VReg()),
            new StaDyn(new VReg()),
            new EcmaGetresumemode(new VReg()),
            new StaDyn(new VReg()),
            new LdaiDyn(new Imm(ResultType.Int, 1)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(nextLabel),
            new LdaDyn(new VReg()),
            new EcmaThrowdyn(),
            nextLabel,
            new LdaDyn(new VReg()),
            new EcmaAsyncfunctionresolve(new VReg(), new VReg(), new VReg()),
            new ReturnDyn(),
            endLabel,
            new StaDyn(new VReg()),
            new EcmaAsyncfunctionreject(new VReg(), new VReg(), new VReg()),
            new ReturnDyn(),
        ];

        let pandaGens = compileAllSnippet(source);
        let checkCount = 0;

        pandaGens.forEach((pg) => {
            if (pg.internalName == "a") {
                expect(checkInstructions(pg.getInsns(), expected_func), "check async func insns").to.be.true;
                checkCount++;
            }

            if (pg.internalName == "func_main_0") {
                pg.getInsns().forEach((insns) => {
                    if (insns instanceof EcmaDefinencfuncdyn) {
                        expect(insns.operands[0]).to.equal('a');
                        checkCount++;
                    }
                });
            }
        });

        expect(checkCount).to.equals(1);
    });

    it("FunctionWithRestParameterSyntaxError", function () {
        let source: string = `function func(...a,)`;
        let errorThrown = false;
        try {
            compileAllSnippet(source);
        } catch (err) {
            expect(err instanceof DiagnosticError).to.be.true;
            expect((<DiagnosticError>err).code).to.equal(DiagnosticCode.A_rest_parameter_or_binding_pattern_may_not_have_a_trailing_comma);
            errorThrown = true;
        }
        expect(errorThrown).to.be.true;
    });
})
