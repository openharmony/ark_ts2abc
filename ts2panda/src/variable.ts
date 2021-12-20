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

import { VReg } from "./irnodes";
import {
    InitStatus,
    LoopScope,
    VariableScope
} from "./scope";

export enum VarDeclarationKind {
    NONE,
    LET,
    CONST,
    VAR,
    FUNCTION,
    MODULE,
    CLASS
}

export abstract class Variable {
    private vreg: VReg | undefined;
    private name: string;
    private typeIndex: number;
    isLexVar: boolean = false;
    idxLex: number = 0;
    constructor(
        readonly declKind: VarDeclarationKind,
        name: string
    ) {
        this.name = name;
        this.vreg = undefined;
        this.name = name;
        this.typeIndex = 77;
    }

    bindVreg(vreg: VReg) {
        this.vreg = vreg;
        this.vreg.setTypeIndex(this.typeIndex);
    }

    hasAlreadyBinded(): boolean {
        return this.vreg !== undefined;
    }

    getVreg(): VReg {
        if (!this.vreg) {
            throw new Error("variable has not been binded")
        }
        return this.vreg;
    }

    getName() {
        return this.name;
    }

    getTypeIndex() {
        return this.typeIndex;
    }

    setTypeIndex(typeIndex: number) {
        return this.typeIndex = typeIndex;
    }

    setLexVar(scope: VariableScope | LoopScope) {
        this.idxLex = scope.getLexVarIdx()
        scope.pendingCreateEnv();
        this.isLexVar = true;
    }

    clearLexVar() {
        this.isLexVar = false;
        this.idxLex = 0;
    }

    isLet(): boolean {
        return this.declKind == VarDeclarationKind.LET;
    }

    isConst(): boolean {
        return this.declKind == VarDeclarationKind.CONST;
    }

    isLetOrConst(): boolean {
        return this.declKind == VarDeclarationKind.LET || this.declKind == VarDeclarationKind.CONST;
    }

    isVar(): boolean {
        return this.declKind == VarDeclarationKind.VAR;
    }

    isNone(): boolean {
        return this.declKind == VarDeclarationKind.NONE;
    }

    isClass(): boolean {
        return this.declKind == VarDeclarationKind.CLASS;
    }
}

export class LocalVariable extends Variable {
    status: InitStatus | null;
    isExport: boolean = false;
    exportedName: string = "";

    constructor(declKind: VarDeclarationKind, name: string, status?: InitStatus) {
        super(declKind, name);
        this.status = status ? status : null;
    }

    initialize() {
        this.status = InitStatus.INITIALIZED;
    }

    isInitialized() {
        if (this.status != null) {
            return this.status == InitStatus.INITIALIZED;
        }
        return true;
    }

    setExport() {
        this.isExport = true;
    }

    isExportVar() {
        return this.isExport;
    }

    setExportedName(name: string) {
        this.exportedName = name;
    }

    getExportedName() {
        if (!this.exportedName) {
            throw new Error("Exported Variable " + this.getName() + " doesn't have exported name");
        }
        return this.exportedName;
    }
}

export class GlobalVariable extends Variable {
    constructor(declKind: VarDeclarationKind, name: string) {
        super(declKind, name);
    }
}