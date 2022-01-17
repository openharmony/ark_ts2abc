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

/**
 * Imlementation of bytecode generator.
 * The PandaGen works with IR and provides an API
 * to the compiler.
 *
 * This file should not contain imports of TypeScipt's AST nodes.
 */
import * as ts from "typescript";
import {
    BinaryOperator,
    PrefixUnaryOperator,
    SyntaxKind
} from "typescript";
import {
    call,
    closeIterator,
    copyDataProperties,
    copyModuleIntoCurrentModule,
    creatDebugger,
    createArrayWithBuffer,
    createEmptyArray,
    createEmptyObject,
    createObjectHavingMethod,
    createObjectWithBuffer,
    createObjectWithExcludedKeys,
    createRegExpWithLiteral,
    defineAsyncFunc,
    defineClassWithBuffer,
    defineFunc,
    defineGeneratorFunc,
    defineGetterSetterByValue,
    defineMethod,
    defineNCFunc,
    deleteObjProperty,
    getIterator,
    getIteratorNext,
    getNextPropName,
    getPropIterator,
    importModule,
    isFalse,
    isTrue,
    jumpTarget,
    ldSuperByName,
    ldSuperByValue,
    loadAccumulator,
    loadAccumulatorFloat,
    loadAccumulatorInt,
    loadAccumulatorString,
    loadGlobalVar,
    loadHomeObject,
    loadLexicalEnv,
    loadLexicalVar,
    loadModuleVarByName,
    loadObjByIndex,
    loadObjByName,
    loadObjByValue,
    moveVreg,
    newLexicalEnv,
    newObject,
    popLexicalEnv,
    returnUndefined,
    setObjectWithProto,
    stClassToGlobalRecord,
    stConstToGlobalRecord,
    stLetToGlobalRecord,
    storeAccumulator,
    storeArraySpread,
    storeGlobalVar,
    storeLexicalVar,
    storeModuleVariable,
    storeObjByIndex,
    storeObjByName,
    storeObjByValue,
    storeOwnByIndex,
    storeOwnByName,
    storeOwnByValue,
    stSuperByName,
    stSuperByValue,
    superCall,
    superCallSpread,
    throwDeleteSuperProperty,
    throwException,
    throwIfNotObject,
    throwIfSuperNotCorrectCall,
    throwObjectNonCoercible,
    throwThrowNotExists,
    throwUndefinedIfHole,
    tryLoadGlobalByName,
    tryStoreGlobalByName
} from "./base/bcGenUtil";
import { LiteralBuffer } from "./base/literal";
import { getParamLengthOfFunc } from "./base/util";
import {
    CacheList,
    getVregisterCache,
    VregisterCache
} from "./base/vregisterCache";
import { CmdOptions } from "./cmdOptions";
import {
    DebugInfo,
    NodeKind,
    VariableDebugInfo
} from "./debuginfo";
import { isInteger } from "./expression/numericLiteral";
import {
    EcmaAdd2dyn,
    EcmaAnd2dyn,
    EcmaAshr2dyn,
    EcmaAsyncfunctionawaituncaught,
    EcmaAsyncfunctionenter,
    EcmaAsyncfunctionreject,
    EcmaAsyncfunctionresolve,
    EcmaCallspreaddyn,
    EcmaCopyrestargs,
    EcmaCreategeneratorobj,
    EcmaCreateiterresultobj,
    EcmaDecdyn,
    EcmaDiv2dyn,
    EcmaEqdyn,
    EcmaExpdyn,
    EcmaGetresumemode,
    EcmaGettemplateobject,
    EcmaGetunmappedargs,
    EcmaGreaterdyn,
    EcmaGreatereqdyn,
    EcmaIncdyn,
    EcmaInstanceofdyn,
    EcmaIsindyn,
    EcmaLessdyn,
    EcmaLesseqdyn,
    EcmaMod2dyn,
    EcmaMul2dyn,
    EcmaNegdyn,
    EcmaNewobjspreaddyn,
    EcmaNotdyn,
    EcmaNoteqdyn,
    EcmaOr2dyn,
    EcmaResumegenerator,
    EcmaShl2dyn,
    EcmaShr2dyn,
    EcmaStricteqdyn,
    EcmaStrictnoteqdyn,
    EcmaSub2dyn,
    EcmaSuspendgenerator,
    EcmaTonumber,
    EcmaTypeofdyn,
    EcmaXor2dyn,
    Imm,
    IRNode,
    Jeqz,
    Label,
    ResultType,
    ReturnDyn,
    VReg
} from "./irnodes";
import {
    VariableAccessLoad,
    VariableAcessStore
} from "./lexenv";
import { LOGE } from "./log";
import {
    FunctionScope,
    LoopScope,
    Scope,
    VariableScope
} from "./scope";
import { CatchTable } from "./statement/tryStatement";
import {
    Variable
} from "./variable";
import { BaseType } from "./base/typeSystem";
import { TypeRecorder } from "./typeRecorder";

export class PandaGen {
    private debugTag: string = "PandaGen";
    readonly internalName: string;
    private parametersCount: number;
    private locals: VReg[] = [];
    private temps: VReg[] = [];
    private insns: IRNode[] = [];
    private scope: Scope | undefined;
    private vregisterCache: VregisterCache;
    private catchMap: Map<Label, CatchTable> = new Map<Label, CatchTable>();
    private totalRegsNum = 0;
    // for debug info
    private variableDebugInfoArray: VariableDebugInfo[] = [];
    private firstStmt: ts.Statement | undefined;
    private sourceFileDebugInfo: string = "";
    private sourceCodeDebugInfo: string | undefined;
    private icSize: number = 0;
    private callType: number = 0;

    private static literalArrayBuffer: Array<LiteralBuffer> = new Array<LiteralBuffer>();

    constructor(internalName: string, parametersCount: number, scope: Scope | undefined = undefined) {
        this.internalName = internalName;
        this.parametersCount = parametersCount;
        this.scope = scope;
        this.vregisterCache = new VregisterCache();
    }

    public setCallType(callType: number) {
        this.callType = callType;
    }

    public getCallType(): number {
        return this.callType;
    }
    
    static getExportedTypes() {
        if (TypeRecorder.getInstance()) {
            return TypeRecorder.getInstance().getExportedType();
        } else {
            return new Map<string, number>();
        }
    }

    static getDeclaredTypes() {
        if (TypeRecorder.getInstance()) {
            return TypeRecorder.getInstance().getDeclaredType();
        } else {
            return new Map<string, number>();
        }
    }

    public getSourceCodeDebugInfo() {
        return this.sourceCodeDebugInfo;
    }

    public setSourceCodeDebugInfo(code: string) {
        this.sourceCodeDebugInfo = code;
    }

    public getSourceFileDebugInfo() {
        return this.sourceFileDebugInfo;
    }

    public setSourceFileDebugInfo(sourceFile: string) {
        this.sourceFileDebugInfo = sourceFile;
    }

    static getLiteralArrayBuffer() {
        return PandaGen.literalArrayBuffer;
    }

    static clearLiteralArrayBuffer() {
        PandaGen.literalArrayBuffer = [];
    }

    getParameterLength() {
        if (this.scope instanceof FunctionScope) {
            return this.scope.getParameterLength();
        }
    }

    getFuncName() {
        if (this.scope instanceof FunctionScope) {
            return this.scope.getFuncName();
        } else {
            return "main";
        }
    }

    getICSize() {
        return this.icSize;
    }

    setICSize(total: number) {
        this.icSize = total;
    }

    static appendTypeArrayBuffer(type: BaseType): number {
        let index = PandaGen.literalArrayBuffer.length;
        PandaGen.literalArrayBuffer.push(type.transfer2LiteralBuffer());
        return index;
    }

    static setTypeArrayBuffer(type: BaseType, index: number) {
        PandaGen.literalArrayBuffer[index] = type.transfer2LiteralBuffer();
    }

    getFirstStmt() {
        return this.firstStmt;
    }

    setFirstStmt(firstStmt: ts.Statement) {
        if (this.firstStmt) {
            return;
        }
        this.firstStmt = firstStmt;
    }

    getVregisterCache() {
        return this.vregisterCache;
    }

    getCatchMap() {
        return this.catchMap;
    }

    getScope(): Scope | undefined {
        return this.scope;
    }

    getVariableDebugInfoArray(): VariableDebugInfo[] {
        return this.variableDebugInfoArray;
    }

    addDebugVariableInfo(variable: VariableDebugInfo) {
        this.variableDebugInfoArray.push(variable);
    }

    allocLocalVreg(): VReg {
        let vreg = new VReg();
        this.locals.push(vreg);
        return vreg;
    }

    getVregForVariable(v: Variable): VReg {
        if (v.hasAlreadyBinded()) {
            return v.getVreg();
        }
        let vreg = this.allocLocalVreg();
        v.bindVreg(vreg);
        return vreg;
    }

    getTemp(): VReg {
        let retval: VReg;
        if (this.temps.length > 0) {
            retval = this.temps.shift()!;
        } else {
            retval = new VReg();
        }

        if (CmdOptions.isEnableDebugLog()) {
            if (retval.getStackTrace() !== undefined) {
                throw new Error("stack trace of new temp register is not empty");
            }
            retval.setStackTrace();
        }
        return retval;
    }

    freeTemps(...temps: VReg[]) {
        if (CmdOptions.isEnableDebugLog())
            for (let value of temps)
                value.setStackTrace(null);

        this.temps.unshift(...temps);
    }

    getInsns(): IRNode[] {
        return this.insns;
    }

    printInsns() {
        LOGE("function " + this.internalName + "() {");
        this.getInsns().forEach(ins => {
            LOGE(ins.toString());
        })
        LOGE("}");
    }

    setTotalRegsNum(num: number) {
        this.totalRegsNum = num;
    }

    getTotalRegsNum(): number {
        return this.totalRegsNum;
    }

    setParametersCount(count: number) {
        this.parametersCount = count;
    }

    getParametersCount(): number {
        return this.parametersCount;
    }

    setLocals(locals: VReg[]) {
        this.locals = locals;
    }

    getLocals(): VReg[] {
        return this.locals;
    }

    getTemps(): VReg[] {
        return this.temps;
    }

    storeAccumulator(node: ts.Node | NodeKind, vreg: VReg) {
        this.add(node, storeAccumulator(vreg));
    }

    loadAccFromArgs(node: ts.Node) {
        if ((<VariableScope>this.scope).getUseArgs()) {
            let v = this.scope!.findLocal("arguments");
            if (this.scope instanceof FunctionScope) {
                this.scope.setArgumentsOrRestargs();
            }
            if (v) {
                let paramVreg = this.getVregForVariable(v);
                this.getUnmappedArgs(node);
                this.add(node, storeAccumulator(paramVreg));
            } else {
                throw new Error("fail to get arguments");
            }
        }
    }

    deleteObjProperty(node: ts.Node, obj: VReg, prop: VReg) {
        this.add(node, deleteObjProperty(obj, prop));
    }

    loadAccumulator(node: ts.Node | NodeKind, vreg: VReg) {
        this.add(node, loadAccumulator(vreg));
    }

    createLexEnv(node: ts.Node, env: VReg, scope: VariableScope | LoopScope) {
        let needCreateNewEnv = scope.need2CreateLexEnv();
        let numVars = scope.getNumLexEnv();
        if (needCreateNewEnv) {
            this.add(
                node,
                newLexicalEnv(numVars),
                storeAccumulator(env)
            )
        } else {
            this.add(
                node,
                loadLexicalEnv(),
                storeAccumulator(env)
            )
        }
    }

    popLexicalEnv(node: ts.Node) {
        this.add(
            node,
            popLexicalEnv()
        )
    }

    loadAccFromLexEnv(node: ts.Node, scope: Scope, level: number, v: Variable) {
        let expander = new VariableAccessLoad(scope, level, v);
        let insns = expander.expand(this);
        this.add(
            node,
            ...insns
        );
    }

    storeAccToLexEnv(node: ts.Node | NodeKind, scope: Scope, level: number, v: Variable, isDeclaration: boolean) {
        let expander = new VariableAcessStore(scope, level, v, isDeclaration, node);
        let insns = expander.expand(this);
        this.add(
            node,
            ...insns
        )
    }

    loadObjProperty(node: ts.Node, obj: VReg, prop: VReg | string | number) {
        switch (typeof (prop)) {
            case "number": {
                if (isInteger(prop)) {
                    this.loadObjByIndex(node, obj, prop);
                } else {
                    let propReg = this.getTemp();
                    this.add(
                        node,
                        loadAccumulatorFloat(prop),
                        storeAccumulator(propReg),
                    );
                    this.loadObjByValue(node, obj, propReg);
                    this.freeTemps(propReg);
                }
                break;
            }
            case "string":
                this.loadObjByName(node, obj, prop);
                break;
            default:
                this.loadObjByValue(node, obj, prop);
        }
    }

    storeObjProperty(node: ts.Node | NodeKind, obj: VReg, prop: VReg | string | number) {
        switch (typeof (prop)) {
            case "number":
                if (isInteger(prop)) {
                    this.storeObjByIndex(node, obj, prop);
                } else {
                    let valueReg = this.getTemp();
                    let propReg = this.getTemp();
                    this.storeAccumulator(node, valueReg);
                    this.add(
                        node,
                        loadAccumulatorFloat(prop),
                        storeAccumulator(propReg),
                        loadAccumulator(valueReg)
                    );
                    this.storeObjByValue(node, obj, propReg);
                    this.freeTemps(valueReg, propReg);
                }
                break;
            case "string":
                this.storeObjByName(node, obj, prop);
                break;
            default:
                this.storeObjByValue(node, obj, prop);
        }
    }

    storeOwnProperty(node: ts.Node | NodeKind, obj: VReg, prop: VReg | string | number, nameSetting: boolean = false) {
        switch (typeof prop) {
            case "number": {
                if (isInteger(prop)) {
                    this.stOwnByIndex(node, obj, prop);
                } else {
                    let valueReg = this.getTemp();
                    let propReg = this.getTemp();
                    this.storeAccumulator(node, valueReg);
                    this.add(
                        node,
                        loadAccumulatorFloat(prop),
                        storeAccumulator(propReg),
                        loadAccumulator(valueReg)
                    );
                    this.stOwnByValue(node, obj, propReg, nameSetting);
                    this.freeTemps(valueReg, propReg);
                }
                break;
            }
            case "string":
                this.stOwnByName(node, obj, prop, nameSetting);
                break;
            default:
                this.stOwnByValue(node, obj, prop, nameSetting);
        }
    }

    private loadObjByName(node: ts.Node, obj: VReg, string_id: string) {
        this.add(
            node,
            loadObjByName(obj, string_id)
        );
    }

    private storeObjByName(node: ts.Node | NodeKind, obj: VReg, string_id: string) {
        this.add(
            node,
            storeObjByName(obj, string_id)
        );
    }

    private loadObjByIndex(node: ts.Node, obj: VReg, index: number) {
        this.add(
            node,
            loadObjByIndex(obj, index)
        )
    }

    private storeObjByIndex(node: ts.Node | NodeKind, obj: VReg, index: number) {
        this.add(
            node,
            storeObjByIndex(obj, index)
        )
    }


    private loadObjByValue(node: ts.Node, obj: VReg, value: VReg) {
        this.add(
            node,
            loadObjByValue(obj, value)
        )
    }

    private storeObjByValue(node: ts.Node | NodeKind, obj: VReg, prop: VReg) {
        this.add(
            node,
            storeObjByValue(obj, prop)
        )
    }

    private stOwnByName(node: ts.Node | NodeKind, obj: VReg, string_id: string, nameSetting: boolean) {
        this.add(node, storeOwnByName(obj, string_id, nameSetting));
    }

    private stOwnByIndex(node: ts.Node | NodeKind, obj: VReg, index: number) {
        this.add(node, storeOwnByIndex(obj, index));
    }

    private stOwnByValue(node: ts.Node | NodeKind, obj: VReg, value: VReg, nameSetting: boolean) {
        this.add(node, storeOwnByValue(obj, value, nameSetting));
    }

    // eg. print
    tryLoadGlobalByName(node: ts.Node, string_id: string) {
        this.add(
            node,
            tryLoadGlobalByName(string_id));
    }

    // eg. a = 1
    tryStoreGlobalByName(node: ts.Node, string_id: string) {
        this.add(node,
            tryStoreGlobalByName(string_id));
    }

    // eg. var n; n;
    loadGlobalVar(node: ts.Node, string_id: string) {
        this.add(
            node,
            loadGlobalVar(string_id));
    }

    // var n = 1;
    storeGlobalVar(node: ts.Node | NodeKind, string_id: string) {
        this.add(
            node,
            storeGlobalVar(string_id));
    }

    loadAccumulatorString(node: ts.Node | NodeKind, str: string) {
        this.add(node, loadAccumulatorString(str));
    }

    loadAccumulatorFloat(node: ts.Node, num: number) {
        this.add(node, loadAccumulatorFloat(num));
    }

    loadAccumulatorInt(node: ts.Node, num: number) {
        this.add(node, loadAccumulatorInt(num));
    }

    moveVreg(node: ts.Node | NodeKind, vd: VReg, vs: VReg) {
        this.add(node, moveVreg(vd, vs));
    }

    label(node: ts.Node, label: Label) {
        this.add(NodeKind.FirstNodeOfFunction, label);
    }

    branch(node: ts.Node | NodeKind, target: Label) {
        this.add(node, jumpTarget(target));
    }

    isTrue(node: ts.Node) {
        this.add(
            node,
            isTrue()
        )
    }

    jumpIfTrue(node: ts.Node, target: Label) {
        this.isFalse(node);
        this.add(
            node,
            new Jeqz(target)
        )
    }

    isFalse(node: ts.Node) {
        this.add(
            node,
            isFalse()
        )
    }

    jumpIfFalse(node: ts.Node, target: Label) {
        this.isTrue(node);
        this.add(
            node,
            new Jeqz(target)
        )
    }

    debugger(node: ts.Node) {
        this.add(node, creatDebugger());
    }

    throwUndefinedIfHole(node: ts.Node, hole: VReg, name: VReg) {
        this.add(
            node,
            throwUndefinedIfHole(hole, name)
        )
    }

    /**
     * The method generates code for ther following cases
     *          if (lhs OP acc) {...}
     * ifFalse: ...
     */
    condition(node: ts.Node, op: SyntaxKind, lhs: VReg, ifFalse: Label) {
        // Please keep order of cases the same as in types.ts
        switch (op) {
            case SyntaxKind.LessThanToken: // line 57
                this.add(node, new EcmaLessdyn(lhs));
                this.add(node, new Jeqz(ifFalse));
                break;
            case SyntaxKind.GreaterThanToken: // line 59
                this.add(node, new EcmaGreaterdyn(lhs));
                this.add(node, new Jeqz(ifFalse));
                break;
            case SyntaxKind.LessThanEqualsToken: // line 60
                this.add(node, new EcmaLesseqdyn(lhs));
                this.add(node, new Jeqz(ifFalse));
                break;
            case SyntaxKind.GreaterThanEqualsToken: // line 61
                this.add(node, new EcmaGreatereqdyn(lhs));
                this.add(node, new Jeqz(ifFalse));
                break;
            case SyntaxKind.EqualsEqualsToken: // line 62
                this.add(node, new EcmaEqdyn(lhs));
                this.add(node, new Jeqz(ifFalse));
                break;
            case SyntaxKind.ExclamationEqualsToken: // line 63
                this.add(node, new EcmaNoteqdyn(lhs));
                this.add(node, new Jeqz(ifFalse));
                break;
            case SyntaxKind.EqualsEqualsEqualsToken: // line 64
                this.add(node, new EcmaStricteqdyn(lhs));
                this.add(node, new Jeqz(ifFalse));
                break;
            case SyntaxKind.ExclamationEqualsEqualsToken: // line 65
                this.add(node, new EcmaStrictnoteqdyn(lhs));
                this.add(node, new Jeqz(ifFalse));
                break;
            default:
                break;
        }
    }

    unary(node: ts.Node, op: PrefixUnaryOperator, operand: VReg) {
        switch (op) {
            case SyntaxKind.PlusToken:
                this.add(node, new EcmaTonumber(operand));
                break;
            case SyntaxKind.MinusToken:
                this.add(node, new EcmaNegdyn(operand));
                break;
            case SyntaxKind.PlusPlusToken:
                this.add(node, new EcmaIncdyn(operand));
                break;
            case SyntaxKind.MinusMinusToken:
                this.add(node, new EcmaDecdyn(operand));
                break;
            case SyntaxKind.ExclamationToken:
                let falseLabel = new Label();
                let endLabel = new Label();
                this.jumpIfFalse(node, falseLabel);
                // operand is true
                this.add(node, loadAccumulator(getVregisterCache(this, CacheList.False)));
                this.branch(node, endLabel);
                // operand is false
                this.label(node, falseLabel);
                this.add(node, loadAccumulator(getVregisterCache(this, CacheList.True)));
                this.label(node, endLabel);
                break;
            case SyntaxKind.TildeToken:
                this.add(node, new EcmaNotdyn(operand));
                break;
            default:
                throw new Error("Unimplemented");
        }
    }

    binary(node: ts.Node, op: BinaryOperator, lhs: VReg) {
        switch (op) {
            case SyntaxKind.LessThanToken: // line 57
            case SyntaxKind.GreaterThanToken: // line 59
            case SyntaxKind.LessThanEqualsToken: // line 60
            case SyntaxKind.GreaterThanEqualsToken: // line 61
            case SyntaxKind.EqualsEqualsToken: // line 62
            case SyntaxKind.ExclamationEqualsToken: // line 63
            case SyntaxKind.EqualsEqualsEqualsToken: // line 64
            case SyntaxKind.ExclamationEqualsEqualsToken: // line 65
                this.binaryRelation(node, op, lhs);
                break;
            case SyntaxKind.PlusToken: // line 67
            case SyntaxKind.PlusEqualsToken: // line 91
                this.add(node, new EcmaAdd2dyn(lhs));
                break;
            case SyntaxKind.MinusToken: // line 68
            case SyntaxKind.MinusEqualsToken: // line 92
                this.add(node, new EcmaSub2dyn(lhs));
                break;
            case SyntaxKind.AsteriskToken: // line 69
            case SyntaxKind.AsteriskEqualsToken: // line 93
                this.add(node, new EcmaMul2dyn(lhs));
                break;
            case SyntaxKind.AsteriskAsteriskToken: // line 70
            case SyntaxKind.AsteriskAsteriskEqualsToken: // line 94
                this.add(node, new EcmaExpdyn(lhs));
                break;
            case SyntaxKind.SlashToken: // line 71
            case SyntaxKind.SlashEqualsToken: // line 95
                this.add(node, new EcmaDiv2dyn(lhs));
                break;
            case SyntaxKind.PercentToken: // line 72
            case SyntaxKind.PercentEqualsToken: // line 96
                this.add(node, new EcmaMod2dyn(lhs));
                break;
            case SyntaxKind.LessThanLessThanToken: // line 75
            case SyntaxKind.LessThanLessThanEqualsToken: // line 97
                this.add(node, new EcmaShl2dyn(lhs));
                break;
            case SyntaxKind.GreaterThanGreaterThanToken: // line 76
            case SyntaxKind.GreaterThanGreaterThanEqualsToken: // line 98
                this.add(node, new EcmaShr2dyn(lhs));
                break;
            case SyntaxKind.GreaterThanGreaterThanGreaterThanToken: // line 77
            case SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken: // line 99
                this.add(node, new EcmaAshr2dyn(lhs));
                break;
            case SyntaxKind.AmpersandToken: // line 78
            case SyntaxKind.AmpersandEqualsToken: // line 100
                this.add(node, new EcmaAnd2dyn(lhs));
                break;
            case SyntaxKind.BarToken: // line 79
            case SyntaxKind.BarEqualsToken: // line 101
                this.add(node, new EcmaOr2dyn(lhs));
                break;
            case SyntaxKind.CaretToken: // line 80
            case SyntaxKind.CaretEqualsToken: // line 102
                this.add(node, new EcmaXor2dyn(lhs));
                break;
            case SyntaxKind.InKeyword: //line 125
                // The in operator returns true if the specified property is in the specified object or its prototype chain
                this.add(node, new EcmaIsindyn(lhs));
                break;
            case SyntaxKind.InstanceOfKeyword: //line 126
                // The instanceof operator tests to see if the prototype property of
                // a constructor appears anywhere in the prototype chain of an object.
                // The return value is a boolean value.
                this.add(node, new EcmaInstanceofdyn(lhs));
                break;
            default:
                throw new Error("Unimplemented");
        }
    }

    // throw needs argument of exceptionVreg
    // to ensure rethrow the exception after finally
    throw(node: ts.Node) {
        this.add(
            node,
            throwException()
        );
    }

    throwThrowNotExist(node: ts.Node) {
        this.add(node, throwThrowNotExists());
    }

    throwDeleteSuperProperty(node: ts.Node) {
        this.add(node, throwDeleteSuperProperty());
    }

    return(node: ts.Node | NodeKind) {
        this.add(node, new ReturnDyn());
    }

    call(node: ts.Node, args: VReg[], passThis: boolean) {
        this.add(
            node,
            call(args, passThis)
        )
    }

    returnUndefined(node: ts.Node | NodeKind) {
        this.add(
            node,
            returnUndefined()
        )
    }

    newObject(node: ts.Node, args: VReg[]) {
        this.add(
            node,
            newObject(args)
        );
    }

    defineMethod(node: ts.FunctionLikeDeclaration, name: string, objReg: VReg, env: VReg) {
        let paramLength = getParamLengthOfFunc(node);
        this.add(
            node,
            loadAccumulator(objReg),
            defineMethod(name, env, paramLength)
        );
    }

    defineFunction(node: ts.FunctionLikeDeclaration | NodeKind, realNode: ts.FunctionLikeDeclaration, name: string, env: VReg) {
        let paramLength = getParamLengthOfFunc(realNode);
        if (realNode.modifiers) {
            for (let i = 0; i < realNode.modifiers.length; i++) {
                if (realNode.modifiers[i].kind == ts.SyntaxKind.AsyncKeyword) {
                    if (realNode.asteriskToken) {
                        // support async* further
                    } else { // async
                        this.add(
                            node,
                            defineAsyncFunc(name, env, paramLength)
                        );
                        return;
                    }
                }
            }
        }

        if (realNode.asteriskToken) {
            this.add(
                node,
                defineGeneratorFunc(name, env, paramLength)
            );
            return;
        }

        if (ts.isArrowFunction(realNode) || ts.isMethodDeclaration(realNode)) {
            this.add(
                node,
                loadHomeObject(),
                defineNCFunc(name, env, paramLength)
            );
            return;
        }

        this.add(
            node,
            defineFunc(name, env, paramLength)
        );
    }

    typeOf(node: ts.Node) {
        this.add(node, new EcmaTypeofdyn());
    }

    callSpread(node: ts.Node, func: VReg, thisReg: VReg, args: VReg) {
        this.add(node, new EcmaCallspreaddyn(func, thisReg, args));
    }

    newObjSpread(node: ts.Node, obj: VReg, target: VReg) {
        this.add(node, new EcmaNewobjspreaddyn(obj, target));
    }

    getUnmappedArgs(node: ts.Node) {
        this.add(node, new EcmaGetunmappedargs());
    }

    toNumber(node: ts.Node, arg: VReg) {
        this.add(node, new EcmaTonumber(arg));
    }

    createGeneratorObj(node: ts.Node, funcObj: VReg) {
        this.add(node, new EcmaCreategeneratorobj(funcObj));
    }

    EcmaCreateiterresultobj(node: ts.Node, value: VReg, done: VReg) {
        this.add(node, new EcmaCreateiterresultobj(value, done));
    }

    suspendGenerator(node: ts.Node, genObj: VReg, iterRslt: VReg) {
        this.add(node, new EcmaSuspendgenerator(genObj, iterRslt));
    }

    resumeGenerator(node: ts.Node, genObj: VReg) {
        this.add(node, new EcmaResumegenerator(genObj));
    }

    getResumeMode(node: ts.Node, genObj: VReg) {
        this.add(node, new EcmaGetresumemode(genObj));
    }

    asyncFunctionEnter(node: ts.Node) {
        this.add(node, new EcmaAsyncfunctionenter());
    }

    asyncFunctionAwaitUncaught(node: ts.Node, asynFuncObj: VReg, value: VReg) {
        this.add(node, new EcmaAsyncfunctionawaituncaught(asynFuncObj, value));
    }

    asyncFunctionResolve(node: ts.Node | NodeKind, asyncObj: VReg, value: VReg, canSuspend: VReg) {
        this.add(node, new EcmaAsyncfunctionresolve(asyncObj, value, canSuspend));
    }

    asyncFunctionReject(node: ts.Node | NodeKind, asyncObj: VReg, value: VReg, canSuspend: VReg) {
        this.add(node, new EcmaAsyncfunctionreject(asyncObj, value, canSuspend));
    }

    getTemplateObject(node: ts.Node | NodeKind, value: VReg) {
        this.add(node, new EcmaGettemplateobject(value));
    }

    copyRestArgs(node: ts.Node, index: number) {
        this.add(node, new EcmaCopyrestargs(new Imm(ResultType.Int, index)));
    }

    getPropIterator(node: ts.Node) {
        this.add(node, getPropIterator());
    }

    getNextPropName(node: ts.Node, iter: VReg) {
        this.add(node, getNextPropName(iter));
    }

    createEmptyObject(node: ts.Node) {
        this.add(node, createEmptyObject());
    }

    createObjectHavingMethod(node: ts.Node, idx: number, env: VReg) {
        this.add(
            node,
            loadAccumulator(env),
            createObjectHavingMethod(idx)
        );
    }

    createObjectWithBuffer(node: ts.Node, idx: number) {
        this.add(node, createObjectWithBuffer(idx));
    }

    setObjectWithProto(node: ts.Node, proto: VReg, object: VReg) {
        this.add(node, setObjectWithProto(proto, object));
    }

    copyDataProperties(node: ts.Node, dstObj: VReg, srcObj: VReg) {
        this.add(node, copyDataProperties(dstObj, srcObj));
    }

    defineGetterSetterByValue(node: ts.Node, obj: VReg, name: VReg, getter: VReg, setter: VReg, isComputedPropertyName: boolean) {
        if (isComputedPropertyName) {
            this.add(node, loadAccumulator(getVregisterCache(this, CacheList.True)));
        } else {
            this.add(node, loadAccumulator(getVregisterCache(this, CacheList.False)));
        }
        this.add(node, defineGetterSetterByValue(obj, name, getter, setter));
    }

    createEmptyArray(node: ts.Node) {
        this.add(node, createEmptyArray());
    }

    createArrayWithBuffer(node: ts.Node, idx: number) {
        this.add(node, createArrayWithBuffer(idx));
    }

    storeArraySpreadElement(node: ts.Node, array: VReg, index: VReg) {
        this.add(node, storeArraySpread(array, index));
    }

    storeLexicalVar(node: ts.Node, level: number, slot: number, value: VReg) {
        this.add(
            node,
            storeLexicalVar(level, slot, value)
        );
    }

    loadLexicalVar(node: ts.Node, level: number, slot: number) {
        this.add(
            node,
            loadLexicalVar(level, slot)
        )
    }

    importModule(node: ts.Node, moduleName: string) {
        this.add(node, importModule(moduleName));
    }

    loadModuleVariable(node: ts.Node, module: VReg, varName: string) {
        this.add(node, loadModuleVarByName(varName, module));
    }

    storeModuleVar(node: ts.Node, moduleVarName: string) {
        this.add(node, storeModuleVariable(moduleVarName));
    }

    copyModule(node: ts.Node, module: VReg) {
        this.add(node, copyModuleIntoCurrentModule(module));
    }

    defineClassWithBuffer(node: ts.Node, name: string, idx: number, parameterLength: number, base: VReg) {
        this.add(
            node,
            defineClassWithBuffer(name, idx, parameterLength, getVregisterCache(this, CacheList.LexEnv), base)
        )
    }

    createObjectWithExcludedKeys(node: ts.Node, obj: VReg, args: VReg[]) {
        this.add(
            node,
            createObjectWithExcludedKeys(obj, args)
        );
    }

    throwObjectNonCoercible(node: ts.Node) {
        this.add(
            node,
            throwObjectNonCoercible()
        );
    }

    getIterator(node: ts.Node) {
        this.add(
            node,
            getIterator()
        );
    }

    getIteratorNext(node: ts.Node, iter: VReg, nextMethod: VReg) {
        this.add(
            node,
            getIteratorNext(iter, nextMethod)
        )
    }

    closeIterator(node: ts.Node, iter: VReg) {
        this.add(
            node,
            closeIterator(iter)
        )
    }

    throwIfNotObject(node: ts.Node, obj: VReg) {
        this.add(
            node,
            throwIfNotObject(obj)
        );
    }

    superCall(node: ts.Node, num: number, start: VReg) {
        this.add(
            node,
            superCall(num, start)
        )
    }

    superCallSpread(node: ts.Node, vs: VReg) {
        this.add(node, superCallSpread(vs));
    }

    ldSuperByName(node: ts.Node, obj: VReg, key: string) {
        this.add(
            node,
            ldSuperByName(obj, key)
        )
    }

    stSuperByName(node: ts.Node, obj: VReg, key: string) {
        this.add(
            node,
            stSuperByName(obj, key)
        )
    }

    ldSuperByValue(node: ts.Node, obj: VReg, prop: VReg) {
        this.add(
            node,
            ldSuperByValue(obj, prop)
        )
    }

    stSuperByValue(node: ts.Node, obj: VReg, prop: VReg) {
        this.add(
            node,
            stSuperByValue(obj, prop)
        )
    }

    loadSuperProperty(node: ts.Node, obj: VReg, prop: VReg | string | number) {
        switch (typeof (prop)) {
            case "string":
                this.ldSuperByName(node, obj, prop);
                break;
            case "number":
                let propReg = this.getTemp();
                this.loadAccumulatorInt(node, prop);
                this.storeAccumulator(node, propReg);
                this.ldSuperByValue(node, obj, propReg);
                this.freeTemps(propReg)
                break;
            default:
                this.ldSuperByValue(node, obj, prop);
        }
    }

    throwIfSuperNotCorrectCall(node: ts.Node, num: number) {
        this.add(node, throwIfSuperNotCorrectCall(num));
    }

    storeSuperProperty(node: ts.Node, obj: VReg, prop: VReg | string | number) {
        switch (typeof (prop)) {
            case "string":
                this.stSuperByName(node, obj, prop);
                break;
            case "number":
                let propReg = this.getTemp();
                this.loadAccumulatorInt(node, prop);
                this.storeAccumulator(node, propReg);
                this.stSuperByValue(node, obj, propReg);
                this.freeTemps(propReg)
                break;
            default:
                this.stSuperByValue(node, obj, prop);
        }
    }

    loadHomeObject(node: ts.Node) {
        this.add(
            node,
            loadHomeObject()
        )
    }

    createRegExpWithLiteral(node: ts.Node, pattern: string, flags: number) {
        this.add(
            node,
            createRegExpWithLiteral(pattern, flags)
        )
    }

    stLetToGlobalRecord(node: ts.Node, string_id: string) {
        this.add(
            node,
            stLetToGlobalRecord(string_id));
    }

    stConstToGlobalRecord(node: ts.Node, string_id: string) {
        this.add(
            node,
            stConstToGlobalRecord(string_id));
    }

    stClassToGlobalRecord(node: ts.Node, string_id: string) {
        this.add(
            node,
            stClassToGlobalRecord(string_id));
    }

    private binaryRelation(node: ts.Node, op: BinaryOperator, lhs: VReg) {
        let falseLabel = new Label();
        let endLabel = new Label();
        switch (op) {
            case SyntaxKind.LessThanToken:
                this.add(node, new EcmaLessdyn(lhs));
                break;
            case SyntaxKind.GreaterThanToken:
                this.add(node, new EcmaGreaterdyn(lhs));
                break;
            case SyntaxKind.LessThanEqualsToken:
                this.add(node, new EcmaLesseqdyn(lhs));
                break;
            case SyntaxKind.GreaterThanEqualsToken:
                this.add(node, new EcmaGreatereqdyn(lhs));
                break;
            case SyntaxKind.EqualsEqualsToken:
                this.add(node, new EcmaEqdyn(lhs));
                break;
            case SyntaxKind.ExclamationEqualsToken:
                this.add(node, new EcmaNoteqdyn(lhs));
                break;
            case SyntaxKind.EqualsEqualsEqualsToken:
                this.add(node, new EcmaStricteqdyn(lhs));
                break;
            case SyntaxKind.ExclamationEqualsEqualsToken:
                this.add(node, new EcmaStrictnoteqdyn(lhs));
                break;
            default:
                break;
        }
        this.add(node, new Jeqz(falseLabel));
        this.add(node, loadAccumulator(getVregisterCache(this, CacheList.True)));
        this.branch(node, endLabel);
        this.label(node, falseLabel);
        this.add(node, loadAccumulator(getVregisterCache(this, CacheList.False)));
        this.label(node, endLabel);
    }

    private add(node: ts.Node | NodeKind, ...insns: IRNode[]): void {
        // set pos debug info if debug mode
        DebugInfo.setDebuginfoForIns(node, ...insns);

        this.insns = this.insns.concat(insns);
    }
}
