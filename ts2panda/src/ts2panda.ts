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

import { CmdOptions } from "./cmdOptions";
import { DebugPosInfo } from "./debuginfo";
import {
    Imm,
    IRNode,
    Label,
    OperandType,
    VReg
} from "./irnodes";
import { LOGD } from "./log";
import { PandaGen } from "./pandagen";
import {
    CatchTable,
    DeclaredSymbol2Type,
    ExportedSymbol2Type,
    Function,
    Ins,
    Signature
} from "./pandasm";
import { generateCatchTables } from "./statement/tryStatement";
import {
    escapeUnicode,
    isRangeInst,
    getRangeStartVregPos
} from "./base/util";
import { TypeOfVreg } from "./pandasm";
import { LiteralBuffer } from "./base/literal";

const dollarSign: RegExp = /\$/g;

const JsonType = {
    "function": 0,
    "record": 1,
    "string": 2,
    "literal_arr": 3,
    "options": 4,
    "type_arr": 5
};
export class Ts2Panda {
    static strings: Set<string> = new Set();
    static labelPrefix = "LABEL_";
    static jsonString: string = "";

    constructor() {
    }

    static getFuncSignature(pg: PandaGen): Signature {
        return new Signature(pg.getParametersCount());
    }

    static getFuncInsnsAndRegsNum(pg: PandaGen) {
        let insns: Array<Ins> = [];
        let labels: Array<string> = [];

        pg.getInsns().forEach((insn: IRNode) => {
            let insOpcode = insn.mnemonic;
            let insRegs: Array<number> = [];
            let insIds: Array<string> = [];
            let insImms: Array<number> = [];
            let insLabel: string = "";
            let insDebugInfo: DebugPosInfo = new DebugPosInfo();

            if (insn instanceof Label) {
                insLabel = Ts2Panda.labelPrefix + insn.id;
                labels.push(insLabel);
            } else if (isRangeInst(insn)) {
                // For DynRange insn we only pass the first vreg of continous vreg array
                let operands = insn.operands;
                insImms.push((<Imm>operands[0]).value);
                insRegs.push((<VReg>operands[1]).num);
                if (getRangeStartVregPos(insn) == 2) {
                    insRegs.push((<VReg>operands[2]).num);
                }
            } else {
                insn.operands.forEach((operand: OperandType) => {
                    if (operand instanceof VReg) {
                        let v = <VReg>operand;
                        insRegs.push(v.num);
                    } else if (operand instanceof Imm) {
                        let imm = <Imm>operand;
                        insImms.push(imm.value);
                    } else if (typeof (operand) === "string") {
                        insIds.push(operand);
                        Ts2Panda.strings.add(operand);
                    } else if (operand instanceof Label) {
                        let labelName = Ts2Panda.labelPrefix + operand.id;
                        insIds.push(labelName);
                    }
                });
            }
            insDebugInfo = insn.debugPosInfo;
            if (CmdOptions.isDebugMode()) {
                insDebugInfo.ClearMembersForDebugBuild();
            } else {
                insDebugInfo.ClearMembersForReleaseBuild();
            }

            insns.push(new Ins(
                insOpcode,
                insRegs.length == 0 ? undefined : insRegs,
                insIds.length == 0 ? undefined : insIds,
                insImms.length == 0 ? undefined : insImms,
                insLabel === "" ? undefined : insLabel,
                insDebugInfo,
            ));
        });

        return {
            insns: insns,
            regsNum: (pg.getTotalRegsNum() - pg.getParametersCount()),
            labels: labels
        };
    }

    static dumpStringsArray(ts2abc: any) {
        let strings_arr = Array.from(Ts2Panda.strings);
        if (CmdOptions.isEnableDebugLog()) {
            Ts2Panda.jsonString += escapeUnicode(JSON.stringify(strings_arr, null, 2));
        }

        strings_arr.forEach(function(str) {
            let strObject = {
                "type": JsonType.string,
                "string": str
            }
            let jsonStrUnicode = escapeUnicode(JSON.stringify(strObject, null, 2));
            Ts2Panda.jsonString += jsonStrUnicode;
            jsonStrUnicode = "$" + jsonStrUnicode.replace(dollarSign, '#$') + "$";
            ts2abc.stdio[3].write(jsonStrUnicode + '\n');
        });
    }

    static dumpTypeLiteralArrayBuffer() {
        let literalArrays = PandaGen.getLiteralArrayBuffer();
        let countType: LiteralBuffer = literalArrays[0];
        let jsonTypeString: string = ""
        let typeCount = countType.getLiteral(1)?.getValue();
        if (typeCount) {
            for (let i = 0; i < typeCount; i++) {
                jsonTypeString += escapeUnicode(JSON.stringify(literalArrays[1+i], null, 2));
            }
        }
        return jsonTypeString;
    }

    static dumpConstantPool(ts2abc: any): void {
        let literalArrays = PandaGen.getLiteralArrayBuffer();
        if (CmdOptions.enableTypeLog()) {
            console.log("-------- LiteralArrayBuffer --------");
            for (let e of PandaGen.getLiteralArrayBuffer()) {
                console.log(JSON.parse(JSON.stringify(e)));
            }
        }

        if (CmdOptions.isEnableDebugLog()) {
            Ts2Panda.jsonString += escapeUnicode(JSON.stringify(literalArrays, null, 2));
        }

        literalArrays.forEach(function(literalArray) {
            let literalArrayObject = {
                "type": JsonType.literal_arr,
                "literalArray": literalArray
            }
            let jsonLiteralArrUnicode = escapeUnicode(JSON.stringify(literalArrayObject, null, 2));
            jsonLiteralArrUnicode = "$" + jsonLiteralArrUnicode.replace(dollarSign, '#$') + "$";
            ts2abc.stdio[3].write(jsonLiteralArrUnicode + '\n');
        });
    }

    static dumpCmdOptions(ts2abc: any): void {
        let options = {
            "type": JsonType.options,
            "module_mode": CmdOptions.isModules(),
            "debug_mode": CmdOptions.isDebugMode(),
            "log_enabled": CmdOptions.isEnableDebugLog(),
            "opt_level": CmdOptions.getOptLevel(),
            "opt_log_level": CmdOptions.getOptLogLevel()
        };
        let jsonOpt = JSON.stringify(options, null, 2);
        if (CmdOptions.isEnableDebugLog()) {
            Ts2Panda.jsonString += jsonOpt;
        }
        jsonOpt = "$" + jsonOpt.replace(dollarSign, '#$') + "$";
        ts2abc.stdio[3].write(jsonOpt + '\n');
    }

    static dumpPandaGen(pg: PandaGen, ts2abc: any, recordType?: boolean): void {
        let funcName = pg.internalName;
        let funcSignature = Ts2Panda.getFuncSignature(pg);
        let funcInsnsAndRegsNum = Ts2Panda.getFuncInsnsAndRegsNum(pg);
        let sourceFile = pg.getSourceFileDebugInfo();
        let callType = pg.getCallType();
        let typeRecord = pg.getLocals();
        let typeInfo = new Array<TypeOfVreg>();
        typeRecord.forEach((vreg) => {
            let typeOfVreg = new TypeOfVreg(vreg.num, vreg.getTypeIndex());
            typeInfo.push(typeOfVreg);
            if (CmdOptions.enableTypeLog()) {
                console.log("---------------------------------------");
                console.log("- vreg name:", vreg.getVariableName());
                console.log("- vreg local num:", vreg.num);
                console.log("- vreg type:", vreg.getTypeIndex());
            }
        });

        let exportedTypes = PandaGen.getExportedTypes();
        let exportedSymbol2Types = exportedTypes.size == 0 ? undefined : new Array<ExportedSymbol2Type>();
        if (funcName == "func_main_0") {
            exportedTypes.forEach((type: number, symbol: string) => {
                let exportedSymbol2Type = new ExportedSymbol2Type(symbol, type);
                exportedSymbol2Types!.push(exportedSymbol2Type);
            })
        }

        let declareddTypes = PandaGen.getDeclaredTypes();
        let declaredSymbol2Types = declareddTypes.size == 0 ? undefined : new Array<DeclaredSymbol2Type>();
        if (funcName == "func_main_0") {
            declareddTypes.forEach((type: number, symbol: string) => {
                let declaredSymbol2Type = new DeclaredSymbol2Type(symbol, type);
                declaredSymbol2Types!.push(declaredSymbol2Type);
            })
        }

        let variables, sourceCode;
        if (CmdOptions.isDebugMode()) {
            variables = pg.getVariableDebugInfoArray();
            sourceCode = pg.getSourceCodeDebugInfo();
        } else {
            variables = undefined;
            sourceCode = undefined;
        }

        let func = new Function(
            funcName,
            funcSignature,
            funcInsnsAndRegsNum.regsNum,
            funcInsnsAndRegsNum.insns,
            funcInsnsAndRegsNum.labels,
            variables,
            sourceFile,
            sourceCode,
            callType,
            typeInfo,
            exportedSymbol2Types,
            declaredSymbol2Types
        );
        let catchTables = generateCatchTables(pg.getCatchMap());
        catchTables.forEach((catchTable) => {
            let catchBeginLabel = catchTable.getCatchBeginLabel();
            let labelPairs = catchTable.getLabelPairs();
            labelPairs.forEach((labelPair) => {
                func.catchTables.push(new CatchTable(
                    Ts2Panda.labelPrefix + labelPair.getBeginLabel().id,
                    Ts2Panda.labelPrefix + labelPair.getEndLabel().id,
                    Ts2Panda.labelPrefix + catchBeginLabel.id
                ));
            });
        });

        LOGD(func);

        let funcObject = {
            "type": JsonType.function,
            "func_body": func
        }
        let jsonFuncUnicode = escapeUnicode(JSON.stringify(funcObject, null, 2));
        if (CmdOptions.isEnableDebugLog()) {
            Ts2Panda.jsonString += jsonFuncUnicode;
        }
        jsonFuncUnicode = "$" + jsonFuncUnicode.replace(dollarSign, '#$') + "$";
        ts2abc.stdio[3].write(jsonFuncUnicode + '\n');
    }

    static clearDumpData() {
        Ts2Panda.strings.clear();
        Ts2Panda.jsonString = "";
    }
}
