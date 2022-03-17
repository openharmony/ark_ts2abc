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
import * as ts from "typescript";
import {
    CompilerDriver
} from "../src/compilerDriver";
import {
    EcmaAdd2dyn,
    EcmaDefinefuncdyn,
    EcmaIncdyn,
    EcmaLdlexenvdyn,
    EcmaLdlexvardyn,
    EcmaNewlexenvdyn,
    EcmaReturnundefined,
    EcmaStglobalvar,
    EcmaStlettoglobalrecord,
    EcmaStlexvardyn,
    EcmaThrowconstassignment,
    EcmaThrowundefinedifhole,
    EcmaTonumber,
    EcmaTrystglobalbyname,
    Imm,
    IRNode,
    LdaDyn,
    LdaiDyn,
    LdaStr,
    ResultType,
    ReturnDyn,
    StaDyn,
    VReg
} from "../src/irnodes";
import { PandaGen } from "../src/pandagen";
import { CacheExpander } from "../src/pass/cacheExpander";
import { Recorder } from '../src/recorder';
import {
    FunctionScope,
    GlobalScope,
    VariableScope
} from "../src/scope";
import {
    GlobalVariable,
    LocalVariable,
    VarDeclarationKind
} from "../src/variable";
import { creatAstFromSnippet } from "./utils/asthelper";
import {
    checkInstructions,
    compileAllSnippet,
    SnippetCompiler
} from "./utils/base";

function MicroCreateLexEnv(numVars: number, hasLexEnv: boolean): IRNode[] {
    let insns = [];

    if (hasLexEnv) {
        insns.push(new EcmaNewlexenvdyn(new Imm(numVars)));
    } else {
        insns.push(new EcmaLdlexenvdyn());
    }
    insns.push(new StaDyn(new VReg())); // create lexenv

    return insns;
}

function MicroStoreLexVar(level: number, slot: number, kind?: VarDeclarationKind, name?: string): IRNode[] {
    let insns = [];

    if (kind && name) {
        insns.push(new EcmaLdlexvardyn(new Imm(level), new Imm(slot)));
        insns.push(new StaDyn(new VReg()));
        insns.push(new LdaStr(name));
        insns.push(new StaDyn(new VReg()));
        insns.push(new EcmaThrowundefinedifhole(new VReg(), new VReg()));
        if (kind == VarDeclarationKind.CONST) {
            insns.push(new EcmaThrowconstassignment(new VReg()));
        }
    }
    insns.push(new EcmaStlexvardyn(new Imm(level), new Imm(slot), new VReg()));
    insns.push(new LdaDyn(new VReg()));

    return insns;
}

function MicroLoadLexVar(level: number, slot: number, kind?: VarDeclarationKind, name?: string): IRNode[] {
    let insns = [];

    insns.push(new EcmaLdlexvardyn(new Imm(level), new Imm(slot)));
    if (kind && name) {
        insns.push(new StaDyn(new VReg()));
        insns.push(new LdaStr(name));
        insns.push(new StaDyn(new VReg()));
        insns.push(new EcmaThrowundefinedifhole(new VReg(), new VReg()));
        insns.push(new LdaDyn(new VReg()));
    }

    return insns;
}

describe("lexenv-compile-testcase in lexenv.test.ts", function () {

    it("test CompilerDriver.scanFunctions-with-empty", function () {
        let source: string = ``;
        let sourceFile = creatAstFromSnippet(source);
        let compilerDriver = new CompilerDriver('UnitTest');
        let globalScope = new GlobalScope(sourceFile);
        let recorder = new Recorder(sourceFile, globalScope, compilerDriver, false, false, true);
        recorder.record();

        expect(globalScope, "root is null!").to.not.equal(null);

        expect(globalScope.getChildVariableScope().length, "should not have any children!").to.be.equal(0);
        expect(globalScope.getParentVariableScope(), "should not have any children!").to.be.equal(null);
        expect(globalScope.getBindingNode() == sourceFile, "functionblock.node should equal to sourceFile").to.be.true;
    });

    it("test CompilerDriver.scanFunctions-with-embedded-function", function () {
        let source: string = `
      {
      function outer() {
        function innerA() {
        }
        function innerB() {
        }
      }
      }
      {

      }
      var funcExpression = function() { }
    `;
        let sourceFile = creatAstFromSnippet(source);
        let compilerDriver = new CompilerDriver('UnitTest');
        let globalScope = new GlobalScope(sourceFile);
        let recorder = new Recorder(sourceFile, globalScope, compilerDriver, false, false, true);
        recorder.record();

        let children = globalScope.getChildVariableScope();
        let parent = globalScope.getParentVariableScope();
        let bindingNode = globalScope.getBindingNode();
        expect(globalScope != null, "root is null!");
        expect(children.length, "should have 2 child!").to.be.equal(2);
        expect(parent, "should not have any children!").to.be.equal(null);
        expect(bindingNode, "functionblock.root should equal to sourceFile").to.be.deep.equal(sourceFile);
        // check children
        let son0 = children[0];
        let grandchildren0 = son0.getChildVariableScope();
        let parentOfSon0 = son0.getParentVariableScope();
        let bindingNodeOfSon0 = <ts.Node>son0.getBindingNode();
        expect(grandchildren0.length == 2, "son should have two children!").to.be.true;
        expect(parentOfSon0, "son's parent should equal root!").deep.equal(globalScope);
        expect(bindingNodeOfSon0.kind, "son's parent should equal root!").deep.equal(ts.SyntaxKind.FunctionDeclaration);
        // check grandson
        let grandson0 = grandchildren0[0];
        let parentOfGrandson0 = grandson0.getParentVariableScope();
        let grandgrandchiildren0 = grandson0.getChildVariableScope();
        let bindingNodeOfGrandson0 = <ts.Node>grandson0.getBindingNode();
        expect(parentOfGrandson0).to.be.equal(son0);
        expect(grandgrandchiildren0.length).to.be.equal(0);
        expect(bindingNodeOfGrandson0.kind, "grandson0's parent should equal son0!").deep.equal(ts.SyntaxKind.FunctionDeclaration);

        let grandson1 = grandchildren0[1];
        expect(grandson1.getParentVariableScope()).to.be.equal(son0);
        expect(grandson1.getChildVariableScope().length).to.be.equal(0);
        expect((<ts.Node>grandson1.getBindingNode()).kind, "grandson1's parent should equal son0!").deep.equal(ts.SyntaxKind.FunctionDeclaration);

        let son1 = children[1];
        let grandchildren1 = son1.getChildVariableScope();
        let parentOfSon1 = son1.getParentVariableScope();
        let bindingNodeOfSon1 = <ts.Node>son1.getBindingNode();
        expect(grandchildren1.length == 0, "son1 should have two children!").to.be.true;
        expect(parentOfSon1, "son1's parent should equal root!").deep.equal(globalScope);
        expect(bindingNodeOfSon1.kind, "son1's parent should equal root!").deep.equal(ts.SyntaxKind.FunctionExpression);
    });

    it("test CompilerDriver.postorderanalysis-with-empty", function () {
        let source: string = `
    `;
        let sourceFile = creatAstFromSnippet(source);
        let compilerDriver = new CompilerDriver('UnitTest');
        let globalScope = new GlobalScope(sourceFile);

        let recorder = new Recorder(sourceFile, globalScope, compilerDriver, false, false, true);
        recorder.record();
        let postOrderVariableScopes = compilerDriver.postOrderAnalysis(globalScope);

        expect(postOrderVariableScopes.length == 1, "postorder array length not correct");
        expect(postOrderVariableScopes[0]).to.be.deep.equal(globalScope);
    });

    it("test CompilerDriver.postorderanalysis-with-embeded-function", function () {
        let source: string = `
      {
      function outer() {
        function innerA() {
        }
        function innerB() {
        }
      }
      }
      var funcExt = function() { }
    `;
        let sourceFile = creatAstFromSnippet(source);
        let compilerDriver = new CompilerDriver('UnitTest');
        let globalScope = new GlobalScope(sourceFile);

        let recorder = new Recorder(sourceFile, globalScope, compilerDriver, false, false, true);
        recorder.record();
        let postOrderVariableScopes = compilerDriver.postOrderAnalysis(globalScope);

        let children = globalScope.getChildVariableScope();
        expect(postOrderVariableScopes.length == 5, "postorder array length not correct");
        expect(postOrderVariableScopes[0]).to.be.deep.equal(children[0].getChildVariableScope()[0]);
        expect(postOrderVariableScopes[1]).to.be.deep.equal(children[0].getChildVariableScope()[1]);
        expect(postOrderVariableScopes[2]).to.be.deep.equal(children[0]);
        expect(postOrderVariableScopes[3]).to.be.deep.equal(children[1]);
        expect(postOrderVariableScopes[4]).to.be.deep.equal(globalScope);
    });

    /*
     * the function inherit chart, total IIFE expression
     *            +---------+
     *            | global  |
     *            +---.-----+   
     *              .`   `.     
     *            .`       `,   
     *          .`           ', 
     *  +-----`--+       +----'---+
     *  |   1    |       |   2    |
     *  +--------+       +----/---+
     *                        |
     *                        |
     *                        |
     *                    +----\---+
     *                    |    3   |
     *                    +--,.-,--+  
     *                    ,-`    `.   
     *                .'`         `. 
     *          +----'`-+        +---'--+
     *          |   4   |        |  5   |
     *          +-------+        +------+
    */
    it("test CompilerDriver.postorderanalysis-with-IIFE", function () {
        let source: string = `
    (function (global, factory) { // 1
    } (this, (function () { 'use strict'; // 2
      Array.from = (function() { // 3
        var isCallable = function(fn) { //4
        };

        return function from(arrayLike) { //5
        };
      }());

    })))
    `;
        let sourceFile = creatAstFromSnippet(source);
        let compilerDriver = new CompilerDriver('UnitTest');
        let globalScope = new GlobalScope(sourceFile);

        let recorder = new Recorder(sourceFile, globalScope, compilerDriver, false, false, true);
        recorder.record();
        let postOrderVariableScopes = compilerDriver.postOrderAnalysis(globalScope);

        let children = globalScope.getChildVariableScope();
        let grandchildren1 = children[1].getChildVariableScope();
        expect(postOrderVariableScopes.length == 6, "postorder array length not correct");
        expect(postOrderVariableScopes[0]).to.be.deep.equal(children[0]);
        expect(postOrderVariableScopes[1]).to.be.deep.equal(grandchildren1[0].getChildVariableScope()[0]);
        expect(postOrderVariableScopes[2]).to.be.deep.equal(grandchildren1[0].getChildVariableScope()[1]);
        expect(postOrderVariableScopes[3]).to.be.deep.equal(grandchildren1[0]);
        expect(postOrderVariableScopes[4]).to.be.deep.equal(children[1]);
        expect(postOrderVariableScopes[5]).to.be.deep.equal(globalScope);
    });

    it("test loadAccFromLexEnv with loacal variable", function () {
        let globalScope = new GlobalScope();
        let pandaGen = new PandaGen("lexVarPassPandaGen", 1, globalScope);
        let var1 = globalScope.add("var1", VarDeclarationKind.LET);
        let funcObj = globalScope.add("4funcObj", VarDeclarationKind.LET);
        funcObj!.bindVreg(new VReg());

        let pass = new CacheExpander();
        let varReg = pandaGen.getVregForVariable(var1!);

        pandaGen.loadAccFromLexEnv(ts.createNode(0), globalScope, 0, var1!);
        pass.run(pandaGen);

        // load local register to acc
        let outInsns = pandaGen.getInsns();
        let expected = [
            new LdaDyn(varReg),
        ];

        expect(checkInstructions(outInsns, expected)).to.be.true;
    });

    it("test loadAccFromLexEnv with lex env variable", function () {
        let globalScope = new GlobalScope();
        let pandaGen = new PandaGen("lexVarPassPandaGen", 1, globalScope);
        let var1 = globalScope.add("var1", VarDeclarationKind.LET);
        let funcObj = globalScope.add("4funcObj", VarDeclarationKind.LET);
        funcObj!.bindVreg(new VReg());
        let pass = new CacheExpander();

        var1!.setLexVar(globalScope);
        pandaGen.loadAccFromLexEnv(ts.createNode(0), globalScope, 0, var1!);
        pass.run(pandaGen);

        let outInsns = pandaGen.getInsns();
        let tempReg = new VReg();
        let nameReg = new VReg();
        let expected = [
            new EcmaLdlexvardyn(new Imm(0), new Imm(0)),
            new StaDyn(tempReg),
            new LdaStr("var1"),
            new StaDyn(nameReg),
            new EcmaThrowundefinedifhole(new VReg(), nameReg),
            new LdaDyn(tempReg)
        ];
        expect(checkInstructions(outInsns, expected)).to.be.true;
    });

    it("test storeAccFromLexEnv with local variable", function () {
        let globalScope = new GlobalScope();
        let pandaGen = new PandaGen("lexVarPassPandaGen", 1, globalScope);
        let var1 = globalScope.add("var1", VarDeclarationKind.LET);
        let pass = new CacheExpander();
        let varReg = pandaGen.getVregForVariable(var1!);

        pandaGen.storeAccToLexEnv(ts.createNode(0), globalScope, 0, var1!, true);
        pass.run(pandaGen);

        // load local register to acc
        let outInsns = pandaGen.getInsns();
        let expected = [
            new StaDyn(varReg),
        ];

        expect(checkInstructions(outInsns, expected)).to.be.true;
    });

    it("test storeAccFromLexEnv with lex env let-variable", function () {
        let globalScope = new GlobalScope();
        let pandaGen = new PandaGen("lexVarPassPandaGen", 1, globalScope);
        let var1 = globalScope.add("var1", VarDeclarationKind.LET);
        let funcObj = globalScope.add("4funcObj", VarDeclarationKind.LET);
        funcObj!.bindVreg(new VReg());

        let pass = new CacheExpander();

        var1!.setLexVar(globalScope);
        pandaGen.storeAccToLexEnv(ts.createNode(0), globalScope, 0, var1!, true);
        pass.run(pandaGen);

        let outInsns = pandaGen.getInsns();
        let valueReg = new VReg();
        let expected = [
            new StaDyn(valueReg),
            new EcmaStlexvardyn(new Imm(0), new Imm(0), valueReg),
            new LdaDyn(new VReg())
        ];
        expect(checkInstructions(outInsns, expected)).to.be.true;
    });

    it("test storeAccFromLexEnv with lex env const-variable", function () {
        let globalScope = new GlobalScope();
        let pandaGen = new PandaGen("lexVarPassPandaGen", 1, globalScope);
        let var1 = globalScope.add("var1", VarDeclarationKind.CONST);
        let funcObj = globalScope.add("4funcObj", VarDeclarationKind.LET);
        funcObj!.bindVreg(new VReg());
        let pass = new CacheExpander();

        var1!.setLexVar(globalScope);
        pandaGen.storeAccToLexEnv(ts.createNode(0), globalScope, 0, var1!, true);
        pass.run(pandaGen);

        let outInsns = pandaGen.getInsns();
        let valueReg = new VReg();
        let expected = [
            new StaDyn(valueReg),
            new EcmaStlexvardyn(new Imm(0), new Imm(0), valueReg),
            new LdaDyn(valueReg)
        ];
        expect(checkInstructions(outInsns, expected)).to.be.true;
    });

    it("test lexenv variable capture in function", function () {
        let source: string = `
      var outer = 1;

      function func() {
        outer = 2;
      }
    `;

        let pandaGens = compileAllSnippet(source);
        let expected_main = [
            new LdaDyn(new VReg()),
            new EcmaStglobalvar("outer"),
            new EcmaDefinefuncdyn("func", new Imm(0), new VReg()),
            new EcmaStglobalvar("func"),
            new LdaiDyn(new Imm(1)),
            new EcmaStglobalvar("outer"),
            new EcmaReturnundefined()
        ];
        let expected_func = [
            new LdaiDyn(new Imm(2)),
            new EcmaStglobalvar("outer"),
            new EcmaReturnundefined()
        ];

        pandaGens.forEach((pg) => {
            if (pg.internalName == "func_main_0") {
                expect(checkInstructions(pg.getInsns(), expected_main)).to.be.true;
            } else if (pg.internalName == "func") {
                expect(checkInstructions(pg.getInsns(), expected_func)).to.be.true;
            }
        })
    });

    it("test lexenv let capture in function", function () {
        let source: string = `
      let outer = 1;

      function func() {
        outer = 2;
      }
    `;

        let insnsCreateLexEnv_main = MicroCreateLexEnv(1, false);
        let passes = [new CacheExpander()];
        let pandaGens = compileAllSnippet(source, passes);
        let expected_main = [
            ...insnsCreateLexEnv_main,
            new EcmaDefinefuncdyn("func", new Imm(0), new VReg()),
            new EcmaStglobalvar("func"), // global.func = func_func_1
            new LdaiDyn(new Imm(1)), // value = 1
            // ...insnsStoreLexVar_main,
            new EcmaStlettoglobalrecord("outer"),
            new EcmaReturnundefined()
        ];
        let insnsCreateLexEnv_func = MicroCreateLexEnv(0, false);
        let expected_func = [
            ...insnsCreateLexEnv_func,
            new LdaiDyn(new Imm(2)),
            // ...insnsStoreLexVar_func,
            new EcmaTrystglobalbyname("outer"),
            new EcmaReturnundefined()
        ];

        pandaGens.forEach((pg) => {
            let scope = <VariableScope>pg.getScope();
            if (pg.internalName == "func_main_0") {
                expect(checkInstructions(pg.getInsns(), expected_main), "check main insns").to.be.true;
                expect(scope.getNumLexEnv(), "main scope has 0 lexvar").to.be.equal(0);
                // expect(scope.hasLexEnv(), "main scope has lexenv").to.be.true;
            } else if (pg.internalName == "func") {

                expect(checkInstructions(pg.getInsns(), expected_func), "check func insns").to.be.true;
                expect(scope.getNumLexEnv(), "func scope has 1 lexvar").to.be.equal(0);
                // expect(scope.hasLexEnv(), "func scope has lexenv").to.be.true;
            }
        });

    });

    it("test lexenv capture in function", function () {
        let source: string = `
      var a = 1;
      function outer(a, b) {
        return function () {
          a++;
          return a + b;
        }
      }
      var fun = outer(a, 5);
      a = 3;
      func();
    `;

        let insnsCreateLexEnv_outer = MicroCreateLexEnv(2, true);
        let insnsStoreLexVar_outer_1 = MicroStoreLexVar(0, 0);
        let insnsStoreLexVar_outer_2 = MicroStoreLexVar(0, 1);

        let expect_outer: IRNode[] = [
            ...insnsCreateLexEnv_outer,
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            ...insnsStoreLexVar_outer_1,
            new LdaDyn(new VReg()),
            new StaDyn(new VReg()),
            ...insnsStoreLexVar_outer_2,
            new EcmaDefinefuncdyn("#1#", new Imm(0), new VReg()),
            // returnStatement
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new ReturnDyn()
        ];


        let expect_anonymous = [
            ...MicroCreateLexEnv(0, true),
            ...MicroLoadLexVar(1, 0),
            new StaDyn(new VReg()),
            new EcmaIncdyn(new VReg()),
            new StaDyn(new VReg()),
            ...MicroStoreLexVar(1, 0),
            new EcmaTonumber(new VReg()), // this is reduntant load varialbe
            ...MicroLoadLexVar(1, 0),
            new StaDyn(new VReg),
            ...MicroLoadLexVar(1, 1),
            new EcmaAdd2dyn(new VReg()),
            // returnStatement
            new StaDyn(new VReg()),
            new LdaDyn(new VReg()),
            new ReturnDyn()
        ];

        let passes = [new CacheExpander()];
        let snippetCompiler = new SnippetCompiler();
        snippetCompiler.compile(source, passes);

        // check compile result!
        let outerPg = snippetCompiler.getPandaGenByName("outer");
        let outerScope = outerPg!.getScope();
        let outerA = outerScope!.findLocal("a");
        expect(outerA instanceof LocalVariable, "a in outer is local variable").to.be.true;
        // expect((<FunctionScope>outerScope).hasLexEnv(), "outer scope need to create lex env").to.be.true;
        expect((<FunctionScope>outerScope).getNumLexEnv(), "number of lexvar at outer scope").to.be.equal(2);
        let anonymousPg = snippetCompiler.getPandaGenByName("#1#");
        let anonymousScope = anonymousPg!.getScope();
        let anonymousA = anonymousScope!.findLocal("a");
        let searchRlt = anonymousScope!.find("a");
        expect(searchRlt!.level).to.be.equal(1);
        expect(searchRlt!.scope, "a is defined in outerscope").to.be.deep.equal(outerScope);
        expect(anonymousA, "no a in anonymous function").to.be.undefined;
        // expect((<FunctionScope>anonymousScope).hasLexEnv(), "anonymous scope had lex env").to.be.true;
        expect((<FunctionScope>anonymousScope).getNumLexEnv()).to.be.equal(0);
        let globalPg = snippetCompiler.getPandaGenByName("func_main_0");
        let globalScope = globalPg!.getScope();
        let globalA = globalScope!.findLocal("a");
        expect(globalA instanceof GlobalVariable, "globalA is GlobalVariable").to.be.true;

        expect(checkInstructions(anonymousPg!.getInsns(), expect_anonymous), "check annonymous func ins").to.be.true;
        expect(checkInstructions(outerPg!.getInsns(), expect_outer), "check outer func ins").to.be.true;
    });
});
