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
import { CmdOptions } from '../../src/cmdOptions';
import {
    EcmaAdd2dyn,
    EcmaAsyncfunctionawaituncaught,
    EcmaAsyncfunctionenter,
    EcmaAsyncfunctionreject,
    EcmaAsyncfunctionresolve,
    EcmaCallarg0dyn,
    EcmaCallarg1dyn,
    EcmaCallargs2dyn,
    EcmaCreatearraywithbuffer,
    EcmaCreateemptyarray,
    EcmaCreategeneratorobj,
    EcmaCreateiterresultobj,
    EcmaCreateobjectwithbuffer,
    EcmaCreateregexpwithliteral,
    EcmaDecdyn,
    EcmaDefineclasswithbuffer,
    EcmaDefinefuncdyn,
    EcmaEqdyn,
    EcmaGetresumemode,
    EcmaIstrue,
    EcmaLdobjbyindex,
    EcmaLdobjbyname,
    EcmaNegdyn,
    EcmaNewobjdynrange,
    EcmaResumegenerator,
    EcmaStownbyindex,
    EcmaStricteqdyn,
    EcmaSuspendgenerator,
    EcmaThrowdyn,
    EcmaTonumber,
    EcmaTypeofdyn,
    FldaiDyn,
    Imm,
    Jeqz,
    Jmp,
    Label,
    LdaDyn,
    LdaStr,
    LdaiDyn,
    MovDyn,
    ReturnDyn,
    StaDyn,
    VReg
} from "../../src/irnodes";
import { LocalVariable } from "../../src/variable";
import { checkInstructions, compileMainSnippet, compileAllSnippet, SnippetCompiler } from "../utils/base";

describe("WatchExpressions", function () {
    it("watch NumericLiteral", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        a=-123.212
        `);

        let expected = [
            new FldaiDyn(new Imm(123.212)),
            new StaDyn(new VReg()),
            new EcmaNegdyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerSetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch StringLiteral", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        y = 'He is called \'Johnny\''
        `);

        let expected = [
            new LdaStr('He is called '),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerSetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('y'),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('Johnny'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new LdaStr(''),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch RegularExpressionLiteral", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        a = /abc/
        `);

        let expected = [
            new EcmaCreateregexpwithliteral('abc', new Imm(0)),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerSetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch Identifier", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        _awef
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('_awef'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch TrueKeyword", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        b === true
        `);

        let isTrueLabel = new Label();
        let isFalseLabel = new Label();
        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('b'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new EcmaStricteqdyn(new VReg()),
            new Jeqz(isTrueLabel),
            new LdaDyn(new VReg()),
            new Jmp(isFalseLabel),
            isTrueLabel,
            new LdaDyn(new VReg()),
            isFalseLabel,

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch FalseKeyword", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        b === false
        `);

        let ifFalseLabel = new Label(); //lable0
        let ifTrueLabel = new Label();  //label1

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('b'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new EcmaStricteqdyn(new VReg()),
            new Jeqz(ifFalseLabel),
            new LdaDyn(new VReg()),
            new Jmp(ifTrueLabel),
            ifFalseLabel,
            new LdaDyn(new VReg()), //lda.dyn v10
            ifTrueLabel,

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch CallExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        BigInt(10.2)
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('BigInt'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new FldaiDyn(new Imm(10.2)),
            new StaDyn(new VReg()),
            new EcmaCallarg1dyn(new VReg(), new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch NullKeyword", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        b === null
        `);

        let isTrueLabel = new Label();
        let isFalseLabel = new Label();
        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('b'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new EcmaStricteqdyn(new VReg()),
            new Jeqz(isTrueLabel),
            new LdaDyn(new VReg()),
            new Jmp(isFalseLabel),
            isTrueLabel,
            new LdaDyn(new VReg()),
            isFalseLabel,

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch ThisKeyword", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        this
        `);
        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('this'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch MetaProperty", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let pandaGens = compileAllSnippet(`
        function (){
            b = new.target;
        }
        `);

        let expected = [
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname("debuggerSetValue", new VReg()),
            new StaDyn(new VReg()),
            new LdaStr("b"),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        pandaGens.forEach((pg) => {
            if (pg.internalName == "#1#") {
                expect(checkInstructions(pg.getInsns(), expected)).to.be.true;
            }
        });
    });

    it("watch ArrayLiteralExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        [1,2]
        `);

        let expected = [
            new EcmaCreatearraywithbuffer(new Imm(1)),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch ObjectLiteralExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        a = {key:1,value:1}
        `);

        let expected = [
            new EcmaCreateobjectwithbuffer(new Imm(1)),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerSetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch PropertyAccessExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        a.b
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('b', new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch ElementAccessExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        a[0]
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue',new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyindex(new VReg(), new Imm(0)),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch NewExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        new Function()
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('Function'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch ParenthesizedExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        (a,b,c)
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('b'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('c'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch FunctionExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let pandaGens = compileAllSnippet(`
        a = function () {}
        `);

        let expected = [
            new EcmaDefinefuncdyn('a', new Imm(0), new VReg()),
            new StaDyn(new VReg),
            new EcmaLdobjbyname('debuggerSetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        pandaGens.forEach((pg) => {
            if (pg.internalName == "func_main_0") {
                expect(checkInstructions(pg.getInsns(), expected)).to.be.true;
            }
        });
    });

    it("watch DeleteExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        delete[abc]
        `);

        let expected = [
            new EcmaCreateemptyarray(),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('abc'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new EcmaStownbyindex(new VReg(), new Imm(0)),
            new LdaDyn(new VReg()),
            new LdaDyn(new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch TypeOfExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        typeof(a)
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new EcmaTypeofdyn(),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch VoidExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        void doSomething()
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('doSomething'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaCallarg0dyn(new VReg()),
            new LdaDyn(new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch AwaitExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let pandaGens = compileAllSnippet(
            `async function a(){
                await abc;
            }`
        );

        let beginLabel = new Label();
        let endLabel = new Label();
        let nextLabel = new Label();

        let expected = [
            new EcmaAsyncfunctionenter(),
            new StaDyn(new VReg()),
            beginLabel,
            new EcmaLdobjbyname("debuggerGetValue", new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('abc'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaAsyncfunctionawaituncaught(new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaSuspendgenerator(new VReg(), new VReg()),
            new EcmaResumegenerator(new VReg()),
            new StaDyn(new VReg()),
            new EcmaGetresumemode(new VReg()),
            new StaDyn(new VReg()),
            new LdaiDyn(new Imm(1)),
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

        pandaGens.forEach((pg) => {
            if (pg.internalName == "a") {
                expect(checkInstructions(pg.getInsns(), expected)).to.be.true;
            }
        });
    });

    it("watch PrefixUnaryExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        --a
        `);

        let expected = [
            new EcmaLdobjbyname("debuggerGetValue", new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaDecdyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname("debuggerSetValue", new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch PostfixUnaryExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        a--
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaDecdyn(new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerSetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new EcmaTonumber(new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch BinaryExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        a+b
        `);

        let expected = [
            new EcmaLdobjbyname("debuggerGetValue", new VReg()),
            new StaDyn(new VReg()),
            new LdaStr("a"),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname("debuggerGetValue", new VReg()),
            new StaDyn(new VReg()),
            new LdaStr("b"),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new EcmaAdd2dyn(new VReg()),

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch ConditionalExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let insns = compileMainSnippet(`
        a?4:2
        `);

        let ifTrueLabel = new Label();
        let ifFalseLabel = new Label();

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new EcmaIstrue(),
            new Jeqz(ifTrueLabel),
            new LdaiDyn(new Imm(4)),
            new Jmp(ifFalseLabel),
            ifTrueLabel,
            new LdaiDyn(new Imm(2)),
            ifFalseLabel,

            new ReturnDyn()
        ];
        expect(checkInstructions(insns, expected)).to.be.true;
    });

    it("watch YieldExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let pandaGens = compileAllSnippet(`
        function* func(){
            yield a;
        }`);

        let startLabel = new Label();
        let thenLabel = new Label();
        let nextLabel = new Label();
        let endLabel = new Label();

        let expected = [
            new EcmaCreategeneratorobj(new VReg()),
            new StaDyn(new VReg()),
            new EcmaSuspendgenerator(new VReg(), new VReg()),
            new EcmaResumegenerator(new VReg()),
            new StaDyn(new VReg()),
            new EcmaGetresumemode(new VReg()),
            new StaDyn(new VReg()),
            new LdaiDyn(new Imm(0)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(startLabel),
            new LdaDyn(new VReg()),
            new ReturnDyn(),
            startLabel,
            new LdaiDyn(new Imm(1)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(thenLabel),
            new LdaDyn(new VReg()),
            new EcmaThrowdyn(),
            thenLabel,
            new LdaDyn(new VReg()),
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('a'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new EcmaCreateiterresultobj(new VReg(),new VReg()),
            new StaDyn(new VReg()),
            new EcmaSuspendgenerator(new VReg(), new VReg()),
            new EcmaResumegenerator(new VReg()),
            new StaDyn(new VReg()),
            new EcmaGetresumemode(new VReg()),
            new StaDyn(new VReg()),
            new LdaiDyn(new Imm(0)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(nextLabel),
            new LdaDyn(new VReg()),
            new ReturnDyn(),
            nextLabel,
            new LdaiDyn(new Imm(1)),
            new EcmaEqdyn(new VReg()),
            new Jeqz(endLabel),
            new LdaDyn(new VReg()),
            new EcmaThrowdyn(),
            endLabel,
            new LdaDyn(new VReg()),

            new ReturnDyn()
        ];

        pandaGens.forEach((pg) => {
            if (pg.internalName == "func") {
                expect(checkInstructions(pg.getInsns(), expected)).to.be.true;
            }
        });
    });

    it("watch ArrowFunction", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let pandaGens = compileAllSnippet(`
        a => b.length
        `);

        let expected = [
            new EcmaLdobjbyname('debuggerGetValue', new VReg()),
            new StaDyn(new VReg()),
            new LdaStr('b'),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(),new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(),new VReg()),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname('length', new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),

            new ReturnDyn()
        ];

        pandaGens.forEach((pg) => {
            if (pg.internalName == "#1#") {
                expect(checkInstructions(pg.getInsns(), expected)).to.be.true;
            }
        });
    });

    it("watch ClassExpression", function () {
        CmdOptions.parseUserCmd([""]);
        CmdOptions.setWatchArgs(['','']);
        let pandaGens = compileAllSnippet(`
        a = new class{};
        `);

        let expected = [
            new MovDyn(new VReg(), new VReg()),
            new EcmaDefineclasswithbuffer("#1#", new Imm(1), new Imm(0), new VReg(), new VReg()),
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            new MovDyn(new VReg(), new VReg()),
            new EcmaNewobjdynrange(new Imm(2), [new VReg(), new VReg()]),
            new StaDyn(new VReg()),
            new EcmaLdobjbyname("debuggerSetValue", new VReg()),
            new StaDyn(new VReg()),
            new LdaStr("a"),
            new StaDyn(new VReg()),
            new EcmaCallargs2dyn(new VReg(), new VReg(), new VReg()),

            new ReturnDyn()
        ];
        pandaGens.forEach((pg) => {
            if (pg.internalName == "func_main_0") {
                expect(checkInstructions(pg.getInsns(), expected)).to.be.true;
            }
        });
    });
});
