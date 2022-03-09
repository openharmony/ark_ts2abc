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
    getRangeStartVregPos, isRangeInst
} from "./base/util";
import { CacheList } from "./base/vregisterCache";
import { DebugInfo } from "./debuginfo";
import {
    Format,
    IRNode,
    MovDyn,
    OperandKind,
    OperandType,
    VReg
} from "./irnodes";
import { PandaGen } from "./pandagen";

const MAX_VREGA = 16;
const MAX_VREGB = 256;
const MAX_VREGC = 65536;

interface VRegWithFlag {
    vreg: VReg;
    flag: boolean; // indicate whether it is used as a temporary register for spill
}

class RegAllocator {
    private newInsns: IRNode[] = [];
    private spills: VReg[] = [];
    private vRegsId: number = 0;
    private usedVreg: VRegWithFlag[] = [];
    private tmpVreg: VRegWithFlag[] = [];

    constructor() {
        this.vRegsId = 0;
    }

    allocIndexForVreg(vreg: VReg) {
        let num = this.getFreeVreg();
        vreg.num = num;
        this.usedVreg[num] = {vreg: vreg, flag: false};
    }

    findTmpVreg(level: number): VReg {
        let iterCnts = Math.min(MAX_VREGB, this.usedVreg.length);
        for (let i = 0; i < iterCnts; ++i) {
            let value = this.usedVreg[i];
            if (value === undefined || value.flag) {
                continue;
            }
            if (level === MAX_VREGA && value.vreg.num >= MAX_VREGA) {
                throw new Error("no available tmp vReg from A");
            }
            value.flag = true;
            this.tmpVreg.push(value);
            return value.vreg;
        }
        throw new Error("no available tmp vReg from B");
    }

    clearVregFlags(): void {
        for (let v of this.tmpVreg) {
            v.flag = false;
        }
        this.tmpVreg = [];
    }
    allocSpill(): VReg {
        if (this.spills.length > 0) {
            return this.spills.pop()!;
        }
        let v = new VReg();
        this.allocIndexForVreg(v);
        return v;
    }
    freeSpill(v: VReg): void {
        this.spills.push(v);
    }

    getFreeVreg(): number {
        if (this.vRegsId >= MAX_VREGC) {
            throw new Error("vreg has been running out");
        }
        return this.vRegsId++;
    }

    /* check whether the operands is valid for the format,
       return 0 if it is valid, otherwise return the total
       number of vreg which does not meet the requirement
    */
    getNumOfInvalidVregs(operands: OperandType[], format: Format): number {
        let num = 0;
        for (let j = 0; j < operands.length; ++j) {
            if (operands[j] instanceof VReg) {
                if ((<VReg>operands[j]).num >= (1 << format[j][1])) {
                    num++;
                }
            }
        }
        return num;
    }

    markVregNotAvailableAsTmp(vreg: VReg): void {
        let num = vreg.num;
        this.usedVreg[num].flag = true;
        this.tmpVreg.push(this.usedVreg[num]);
    }

    doRealAdjustment(operands: OperandType[], format: Format, index: number, irNodes: IRNode[]) {
        let head: IRNode[] = [];
        let tail: IRNode[] = [];
        let spills: VReg[] = [];

        // mark all vreg used in the current insn as not valid for tmp register
        for (let i = 0; i < operands.length; ++i) {
            if (operands[i] instanceof VReg) {
                this.markVregNotAvailableAsTmp(<VReg>operands[i]);
            }
        }
        for (let j = 0; j < operands.length; ++j) {
            if (operands[j] instanceof VReg) {
                let vOrigin = <VReg>operands[j];
                if (vOrigin.num >= (1 << format[j][1])) {
                    let spill = this.allocSpill();
                    spills.push(spill);
                    let vTmp;
                    try {
                        vTmp = this.findTmpVreg(1 << format[j][1]);
                    } catch {
                        throw Error("no available tmp vReg");
                    }
                    head.push(new MovDyn(spill, vTmp));
                    operands[j] = vTmp;
                    if (format[j][0] == OperandKind.SrcVReg) {
                        head.push(new MovDyn(vTmp, vOrigin));
                    } else if (format[j][0] == OperandKind.DstVReg) {
                        tail.push(new MovDyn(vOrigin, vTmp))
                    } else if (format[j][0] == OperandKind.SrcDstVReg) {
                        head.push(new MovDyn(vTmp, vOrigin));
                        tail.push(new MovDyn(vOrigin, vTmp))
                    } else {
                        // here we do nothing
                    }
                    tail.push(new MovDyn(vTmp, spill));
                }
            }
        }

        // for debuginfo
        DebugInfo.copyDebugInfo(irNodes[index], head);
        DebugInfo.copyDebugInfo(irNodes[index], tail);

        this.newInsns.push(...head, irNodes[index], ...tail);

        for (let j = spills.length - 1; j >= 0; --j) {
            this.freeSpill(spills[j]);
        }
        this.clearVregFlags();
    }

    checkDynRangeInstruction(irNodes: IRNode[], index: number): boolean {
        let operands = irNodes[index].operands;
        let rangeRegOffset = getRangeStartVregPos(irNodes[index]);
        let level = 1 << (irNodes[index].getFormats())[0][rangeRegOffset][1];

        /*
          1. "CalliDynRange 4, v255" is a valid insn, there is no need for all 4 registers numbers to be less than 255,
          it is also similar for NewobjDyn
          2. we do not need to mark any register to be invalid for tmp register, since no other register is used in calli.dyn.range
          3. if v.num is bigger than 255, it means all register less than 255 has been already used, they should have been pushed
          into usedVreg
        */
        if ((<VReg>operands[1]).num >= level) {
            // needs to be adjusted.
            return false;
        }

        /* the first operand is an imm */
        let startNum = (<VReg>operands[rangeRegOffset]).num;
        let i = rangeRegOffset + 1;
        for (; i < (irNodes[index]).operands.length; ++i) {
            if ((startNum + 1) != (<VReg>operands[i]).num) {
                throw Error("Warning: VReg sequence of DynRange is not continuous. Please adjust it now.");
            }
            startNum++;
        }

        /* If the parameters are consecutive, no adjustment is required. */
        if (i == (irNodes[index]).operands.length) {
            return true;
        }

        // needs to be adjusted.
        return false;
    }

    adjustDynRangeInstruction(irNodes: IRNode[], index: number) {
        let head: IRNode[] = [];
        let tail: IRNode[] = [];
        let spills: VReg[] = [];
        let operands = irNodes[index].operands;

        /* exclude operands that are not require consecutive */
        let rangeRegOffset = getRangeStartVregPos(irNodes[index]);
        let regNums = operands.length - getRangeStartVregPos(irNodes[index]);

        let level = 1 << (irNodes[index].getFormats())[0][rangeRegOffset][1];
        let tmp = this.findTmpVreg(level);

        for (let i = 0; i < regNums; i++) {
            let spill = this.allocSpill();
            spills.push(spill);

            /* We need to make sure that the register input in the .range instruction is continuous(small to big). */
            head.push(new MovDyn(spill, this.usedVreg[tmp.num + i].vreg));
            head.push(new MovDyn(this.usedVreg[tmp.num + i].vreg, <VReg>operands[i + rangeRegOffset]));
            operands[i + rangeRegOffset] = this.usedVreg[tmp.num + i].vreg;
            tail.push(new MovDyn(this.usedVreg[tmp.num + i].vreg, spill));
        }

        // for debuginfo
        DebugInfo.copyDebugInfo(irNodes[index], head);
        DebugInfo.copyDebugInfo(irNodes[index], tail);

        this.newInsns.push(...head, irNodes[index], ...tail);
        for (let i = spills.length - 1; i >= 0; --i) {
            this.freeSpill(spills[i]);
        }
        this.clearVregFlags();
    }

    adjustInstructionsIfNeeded(irNodes: IRNode[]): void {
        for (let i = 0; i < irNodes.length; ++i) {
            let operands = irNodes[i].operands;
            let formats = irNodes[i].getFormats();
            if (isRangeInst(irNodes[i])) {
                if (this.checkDynRangeInstruction(irNodes, i)) {
                    this.newInsns.push(irNodes[i]);
                    continue;
                }
                this.adjustDynRangeInstruction(irNodes, i);
                continue;
            }

            let min = operands.length;
            let minFormat = formats[0];
            for (let j = 0; j < formats.length; ++j) {
                let num = this.getNumOfInvalidVregs(operands, formats[j]);
                if (num < min) {
                    minFormat = formats[j];
                    min = num;
                }
            }
            if (min > 0) {
                this.doRealAdjustment(operands, minFormat, i, irNodes);
                continue;
            }
            this.newInsns.push(irNodes[i]);
        }
    }

    getTotalRegsNum(): number {
        return this.vRegsId;
    }

    run(pandaGen: PandaGen): void {
        let irNodes = pandaGen.getInsns();
        let locals = pandaGen.getLocals();
        let temps = pandaGen.getTemps();
        let cache = pandaGen.getVregisterCache();
        let parametersCount = pandaGen.getParametersCount();
        // don't mess up allocation order
        for (let i = 0; i < locals.length; ++i) {
            this.allocIndexForVreg(locals[i]);
        }
        for (let i = 0; i < temps.length; ++i) {
            this.allocIndexForVreg(temps[i]);
        }
        for (let i = CacheList.MIN; i < CacheList.MAX; ++i) {
            let cacheItem = cache.getCache(i);
            if (cacheItem.isNeeded()) {
                this.allocIndexForVreg(cacheItem.getCache());
            }
        }
        this.adjustInstructionsIfNeeded(irNodes);
        for (let i = 0; i < parametersCount; ++i) {
            let v = new VReg();
            this.allocIndexForVreg(v);
            this.newInsns.unshift(new MovDyn(locals[i], v));
        }

        pandaGen.setInsns(this.newInsns);
    }
}

export class RegAlloc {
    run(pandaGen: PandaGen): void {
        let regalloc = new RegAllocator();

        regalloc.run(pandaGen);
        pandaGen.setTotalRegsNum(regalloc.getTotalRegsNum());
    }
}
