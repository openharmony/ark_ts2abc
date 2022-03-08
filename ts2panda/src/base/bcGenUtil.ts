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
    EcmaCallarg0dyn,
    EcmaCallarg1dyn,
    EcmaCallargs2dyn,
    EcmaCallargs3dyn,
    EcmaCallirangedyn,
    EcmaCallithisrangedyn,
    EcmaCloseiterator,
    EcmaCopydataproperties,
    EcmaCreatearraywithbuffer,
    EcmaCreateemptyarray,
    EcmaCreateemptyobject,
    EcmaCreateobjecthavingmethod,
    EcmaCreateobjectwithbuffer,
    EcmaCreateobjectwithexcludedkeys,
    EcmaCreateregexpwithliteral,
    EcmaDebugger,
    EcmaDefineasyncfunc,
    EcmaDefineclasswithbuffer,
    EcmaDefinefuncdyn,
    EcmaDefinegeneratorfunc,
    EcmaDefinegettersetterbyvalue,
    EcmaDefinemethod,
    EcmaDefinencfuncdyn,
    EcmaDelobjprop,
    EcmaGetiterator,
    EcmaGetiteratornext,
    EcmaGetnextpropname,
    EcmaGetpropiterator,
    EcmaGetmodulenamespace,
    EcmaIsfalse,
    EcmaIstrue,
    EcmaLdglobalvar,
    EcmaLdhomeobject,
    EcmaLdlexenvdyn,
    EcmaLdlexvardyn,
    EcmaLdmodulevar,
    EcmaLdobjbyindex,
    EcmaLdobjbyname,
    EcmaLdobjbyvalue,
    EcmaLdsuperbyname,
    EcmaLdsuperbyvalue,
    EcmaNewlexenvdyn,
    EcmaNewlexenvwithnamedyn,
    EcmaNewobjdynrange,
    EcmaPoplexenvdyn,
    EcmaReturnundefined,
    EcmaSetobjectwithproto,
    EcmaStarrayspread,
    EcmaStclasstoglobalrecord,
    EcmaStconsttoglobalrecord,
    EcmaStglobalvar,
    EcmaStlettoglobalrecord,
    EcmaStlexvardyn,
    EcmaStmodulevar,
    EcmaStobjbyindex,
    EcmaStobjbyname,
    EcmaStobjbyvalue,
    EcmaStownbyindex,
    EcmaStownbyname,
    EcmaStownbynamewithnameset,
    EcmaStownbyvalue,
    EcmaStownbyvaluewithnameset,
    EcmaStsuperbyname,
    EcmaStsuperbyvalue,
    EcmaSupercall,
    EcmaSupercallspread,
    EcmaThrowconstassignment,
    EcmaThrowdeletesuperproperty,
    EcmaThrowdyn,
    EcmaThrowifnotobject,
    EcmaThrowifsupernotcorrectcall,
    EcmaThrowpatternnoncoercible,
    EcmaThrowthrownotexists,
    EcmaThrowundefinedifhole,
    EcmaTryldglobalbyname,
    EcmaTrystglobalbyname,
    FldaiDyn,
    Imm,
    IRNode,
    Jmp,
    Label,
    LdaDyn,
    LdaiDyn,
    LdaStr,
    MovDyn,
    StaDyn,
    VReg
} from "../irnodes";

export function loadAccumulatorInt(value: number): IRNode {
    return new LdaiDyn(new Imm(value));
}

export function loadAccumulatorFloat(value: number): IRNode {
    return new FldaiDyn(new Imm(value));
}

export function loadAccumulatorString(value: string): IRNode {
    return new LdaStr(value);
}

export function loadAccumulator(vreg: VReg): IRNode {
    return new LdaDyn(vreg);
}

export function storeAccumulator(vreg: VReg): IRNode {
    return new StaDyn(vreg);
}

export function deleteObjProperty(obj: VReg, prop: VReg): IRNode {
    return new EcmaDelobjprop(obj, prop);
}

export function moveVreg(vd: VReg, vs: VReg): IRNode {
    return new MovDyn(vd, vs);
}

export function jumpTarget(target: Label): IRNode {
    return new Jmp(target);
}

export function creatDebugger(): IRNode {
    return new EcmaDebugger();
}

export function throwException(): IRNode {
    return new EcmaThrowdyn();
}

export function throwConstAssignment(name: VReg) {
    return new EcmaThrowconstassignment(name);
}

export function throwUndefinedIfHole(hole: VReg, name: VReg) {
    return new EcmaThrowundefinedifhole(hole, name);
}

export function throwThrowNotExists() {
    return new EcmaThrowthrownotexists();
}

export function throwDeleteSuperProperty() {
    return new EcmaThrowdeletesuperproperty();
}

export function newLexicalEnv(numVars: number, scopeInfoIdx: number | undefined) {
    if (scopeInfoIdx == undefined) {
        return new EcmaNewlexenvdyn(new Imm(numVars));
    }
    return new EcmaNewlexenvwithnamedyn(new Imm(numVars), new Imm(scopeInfoIdx));
}

export function loadLexicalEnv() {
    return new EcmaLdlexenvdyn();
}

export function popLexicalEnv() {
    return new EcmaPoplexenvdyn();
}

export function loadLexicalVar(level: number, slot: number) {
    return new EcmaLdlexvardyn(new Imm(level), new Imm(slot));
}

export function storeLexicalVar(level: number, slot: number, value: VReg) {
    return new EcmaStlexvardyn(new Imm(level), new Imm(slot), value);
}

export function tryLoadGlobalByName(key: string) {
    return new EcmaTryldglobalbyname(key);
}

export function tryStoreGlobalByName(key: string) {
    return new EcmaTrystglobalbyname(key);
}

export function loadGlobalVar(name: string) {
    return new EcmaLdglobalvar(name);
}

export function storeGlobalVar(name: string) {
    return new EcmaStglobalvar(name);
}

export function loadObjByName(obj: VReg, key: string) {
    return new EcmaLdobjbyname(key, obj);
}

export function storeObjByName(obj: VReg, key: string) {
    return new EcmaStobjbyname(key, obj);
}

export function loadObjByIndex(obj: VReg, index: number) {
    return new EcmaLdobjbyindex(obj, new Imm(index));
}

export function storeObjByIndex(obj: VReg, index: number) {
    return new EcmaStobjbyindex(obj, new Imm(index));
}

export function loadObjByValue(obj: VReg, prop: VReg): IRNode {
    return new EcmaLdobjbyvalue(obj, prop);
}

export function storeObjByValue(obj: VReg, prop: VReg): IRNode {
    return new EcmaStobjbyvalue(obj, prop);
}

export function storeOwnByName(obj: VReg, key: string, nameSetting: boolean): IRNode {
    return nameSetting ? new EcmaStownbynamewithnameset(key, obj) : new EcmaStownbyname(key, obj);
}

export function storeOwnByIndex(obj: VReg, index: number) {
    return new EcmaStownbyindex(obj, new Imm(index));
}

export function storeOwnByValue(obj: VReg, value: VReg, nameSetting: boolean) {
    return nameSetting ? new EcmaStownbyvaluewithnameset(obj, value) : new EcmaStownbyvalue(obj, value);
}

export function throwIfSuperNotCorrectCall(num: number) {
    return new EcmaThrowifsupernotcorrectcall(new Imm(num));
}

export function call(args: VReg[], passThis: boolean) {
    let length = args.length;
    let insn: IRNode;
    if (!passThis) {
        switch (length) {
            case 1:
                insn = new EcmaCallarg0dyn(args[0]);
                break;
            case 2:
                insn = new EcmaCallarg1dyn(args[0], args[1]);
                break;
            case 3:
                insn = new EcmaCallargs2dyn(args[0], args[1], args[2]);
                break;
            case 4:
                insn = new EcmaCallargs3dyn(args[0], args[1], args[2], args[3]);
                break;
            default:
                insn = new EcmaCallirangedyn(new Imm(length - 1), args);
        }
    } else {
        insn = new EcmaCallithisrangedyn(new Imm(length - 1), args);
    }

    return insn;
}

export function newObject(args: VReg[]) {
    return new EcmaNewobjdynrange(new Imm(args.length), args);
}

export function getPropIterator() {
    return new EcmaGetpropiterator();
}

export function getNextPropName(iter: VReg) {
    return new EcmaGetnextpropname(iter);
}

export function returnUndefined() {
    return new EcmaReturnundefined();
}

export function createEmptyObject() {
    return new EcmaCreateemptyobject();
}

export function createObjectHavingMethod(idx: number) {
    return new EcmaCreateobjecthavingmethod(new Imm(idx));
}

export function createObjectWithBuffer(idx: number) {
    return new EcmaCreateobjectwithbuffer(new Imm(idx));
}

export function setObjectWithProto(proto: VReg, object: VReg) {
    return new EcmaSetobjectwithproto(proto, object);
}

export function copyDataProperties(dstObj: VReg, srcObj: VReg) {
    return new EcmaCopydataproperties(dstObj, srcObj);
}

export function defineGetterSetterByValue(obj: VReg, name: VReg, getter: VReg, setter: VReg) {
    return new EcmaDefinegettersetterbyvalue(obj, name, getter, setter);
}

export function createEmptyArray() {
    return new EcmaCreateemptyarray();
}

export function createArrayWithBuffer(idx: number) {
    return new EcmaCreatearraywithbuffer(new Imm(idx));
}

export function storeArraySpread(array: VReg, index: VReg) {
    return new EcmaStarrayspread(array, index);
}

export function defineClassWithBuffer(id: string, idx: number, parameterLength: number, env: VReg, base: VReg) {
    return new EcmaDefineclasswithbuffer(id, new Imm(idx), new Imm(parameterLength), env, base);
}

export function createObjectWithExcludedKeys(obj: VReg, args: VReg[]) {
    return new EcmaCreateobjectwithexcludedkeys(new Imm(args.length - 1), obj, args);
}

export function throwObjectNonCoercible() {
    return new EcmaThrowpatternnoncoercible();
}

export function throwIfNotObject(v: VReg) {
    return new EcmaThrowifnotobject(v);
}

export function getIterator() {
    return new EcmaGetiterator();
}

export function getIteratorNext(iter: VReg, nextMethod: VReg) {
    return new EcmaGetiteratornext(iter, nextMethod);
}

export function closeIterator(iter: VReg) {
    return new EcmaCloseiterator(iter);
}

export function superCall(num: number, start: VReg) {
    return new EcmaSupercall(new Imm(num), start);
}

export function superCallSpread(vs: VReg) {
    return new EcmaSupercallspread(vs);
}

export function ldSuperByName(obj: VReg, key: string) {
    return new EcmaLdsuperbyname(key, obj);
}

export function stSuperByName(obj: VReg, key: string) {
    return new EcmaStsuperbyname(key, obj);
}

export function stSuperByValue(obj: VReg, prop: VReg) {
    return new EcmaStsuperbyvalue(obj, prop);
}

export function ldSuperByValue(obj: VReg, prop: VReg): IRNode {
    return new EcmaLdsuperbyvalue(obj, prop);
}

export function loadModuleVariable(name: string, isLocal: number) {
    return new EcmaLdmodulevar(name, new Imm(isLocal));
}

export function storeModuleVariable(name: string) {
    return new EcmaStmodulevar(name);
}

export function getModuleNamespace(localName: string) {
    return new EcmaGetmodulenamespace(localName);
}

export function loadHomeObject() {
    return new EcmaLdhomeobject();
}

export function defineFunc(name: string, env: VReg, paramLength: number) {
    return new EcmaDefinefuncdyn(name, new Imm(paramLength), env);
}

export function defineAsyncFunc(name: string, env: VReg, paramLength: number) {
    return new EcmaDefineasyncfunc(name, new Imm(paramLength), env);
}

export function defineGeneratorFunc(name: string, env: VReg, paramLength: number) {
    return new EcmaDefinegeneratorfunc(name, new Imm(paramLength), env);
}

export function defineNCFunc(name: string, env: VReg, paramLength: number) {
    return new EcmaDefinencfuncdyn(name, new Imm(paramLength), env);
}

export function defineMethod(name: string, env: VReg, paramLength: number) {
    return new EcmaDefinemethod(name, new Imm(paramLength), env);
}

export function isTrue() {
    return new EcmaIstrue();
}

export function isFalse() {
    return new EcmaIsfalse();
}

export function createRegExpWithLiteral(pattern: string, flags: number) {
    return new EcmaCreateregexpwithliteral(pattern, new Imm(flags));
}

export function stLetToGlobalRecord(name: string) {
    return new EcmaStlettoglobalrecord(name);
}

export function stConstToGlobalRecord(name: string) {
    return new EcmaStconsttoglobalrecord(name);
}

export function stClassToGlobalRecord(name: string) {
    return new EcmaStclasstoglobalrecord(name);
}