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

import { DebugPosInfo, VariableDebugInfo } from "./debuginfo";
import { LiteralBuffer } from "./base/literal";

export class Metadata {
    public attribute: string;

    constructor(
        attribute: string = ""
    ) {
        this.attribute = attribute;
    }
}

export class Signature {
    public params: number;
    public retType: string | undefined; // return type is always 'any', so we ignore it in json

    constructor(params: number = 0, retType?: string | undefined) {
        this.params = params;
        this.retType = retType;
    }
}

export class Ins {
    public op: string;
    public regs: Array<number> | undefined;
    public ids: Array<string> | undefined;
    public imms: Array<number> | undefined;
    public label: string | undefined;

    public debug_pos_info: DebugPosInfo | undefined;
    constructor(
        op: string,
        regs: Array<number> | undefined = undefined,
        ids: Array<string> | undefined = undefined,
        imms: Array<number> | undefined = undefined,
        label: string | undefined = undefined,
        debug_pos_info: DebugPosInfo | undefined = undefined,
    ) {
        this.op = op;
        this.regs = regs;
        this.ids = ids;
        this.imms = imms;
        this.label = label;
        this.debug_pos_info = debug_pos_info;
    }
}

export class Function {
    public name: string;
    public signature: Signature;
    public regs_num: number;
    public ins: Array<Ins>;
    public labels: Array<string>;
    public metadata: Metadata;
    public catchTables: Array<CatchTable>;
    public variables: Array<VariableDebugInfo> | undefined;
    public sourceFile: string;
    public sourceCode: string | undefined;
    public callType: number;

    constructor(
        name: string,
        signature: Signature,
        regs_num: number = 0,
        ins: Array<Ins> = [],
        labels: Array<string> = [],
        variables: Array<VariableDebugInfo> | undefined = undefined,
        sourceFile: string = "",
        sourceCode: string | undefined = undefined,
        callType: number = 0
    ) {
        this.name = name;
        this.signature = signature;
        this.ins = ins;
        this.labels = labels;
        this.regs_num = regs_num;
        this.metadata = new Metadata();
        this.catchTables = [];
        this.variables = variables;
        this.sourceFile = sourceFile;
        this.sourceCode = sourceCode;
        this.callType = callType;
    }
}

export class Record {
    public name: string;
    public whole_line: string;
    public bound_left: number;
    public bound_right: number;
    public line_number: number;
    public metadata: Metadata;

    constructor(
        name: string,
        whole_line: string,
        bound_left: number,
        bound_right: number,
        line_number: number
    ) {
        this.name = name;
        this.whole_line = whole_line;
        this.bound_left = bound_left;
        this.bound_right = bound_right;
        this.line_number = line_number;
        this.metadata = new Metadata();
    }
}

export class Program {
    public functions: Array<Function>;
    public records: Array<Record>;
    public strings: Set<string>;
    public strings_arr: Array<string>;
    public literalArrays: Array<LiteralBuffer>;
    public module_mode: boolean;
    public debug_mode: boolean;
    public log_enabled: boolean;
    public opt_level: number;
    public opt_log_level: string;

    constructor() {
        this.functions = [];
        this.records = [];
        this.strings = new Set();
        this.strings_arr = [];
        this.literalArrays = [];
        this.module_mode = false;
        this.debug_mode = false;
        this.log_enabled = false;
        this.opt_level = 1;
        this.opt_log_level = "error";
    }

    finalize(): void {
        this.strings_arr = Array.from(this.strings);
    }
}

export class CatchTable {
    public tryBeginLabel: string;
    public tryEndLabel: string;
    public catchBeginLabel: string;

    constructor(
        tryBeginLabel: string,
        tryEndLabel: string,
        catchBeginLabel: string
    ) {
        this.tryBeginLabel = tryBeginLabel;
        this.tryEndLabel = tryEndLabel;
        this.catchBeginLabel = catchBeginLabel;
    }
}

export interface Emmiter {
    generate_program: (filename: string, program: Program) => string;
}
