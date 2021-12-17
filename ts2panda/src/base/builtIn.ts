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

import { PandaGen } from "src/pandagen";
import {
    IRNode,
    EcmaLdfalse,
    EcmaLdglobal,
    EcmaLdhole,
    EcmaLdinfinity,
    EcmaLdnan,
    EcmaLdnull,
    EcmaLdsymbol,
    EcmaLdtrue,
    EcmaLdundefined,
    StaDyn,
    EcmaLdfunction
} from "../irnodes";
import { CacheList, getVregisterCache } from "./vregisterCache";

export function expandHole(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.HOLE);
    return [
        new EcmaLdhole(),
        new StaDyn(vreg)
    ]
}

export function expandNaN(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.NaN);
    return [
        new EcmaLdnan(),
        new StaDyn(vreg)
    ];
}

export function expandInfinity(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.Infinity);
    return [
        new EcmaLdinfinity(),
        new StaDyn(vreg)
    ];
}

export function expandGlobal(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.Global);
    return [
        new EcmaLdglobal(),
        new StaDyn(vreg)
    ];
}

export function expandUndefined(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.undefined);
    return [
        new EcmaLdundefined(),
        new StaDyn(vreg)
    ];
}

export function expandSymbol(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.Symbol);
    return [
        new EcmaLdsymbol(),
        new StaDyn(vreg)
    ];
}

export function expandNull(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.Null);
    return [
        new EcmaLdnull(),
        new StaDyn(vreg)
    ];
}

export function expandTrue(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.True);
    return [
        new EcmaLdtrue(),
        new StaDyn(vreg)
    ];
}

export function expandFalse(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.False);
    return [
        new EcmaLdfalse(),
        new StaDyn(vreg)
    ];
}

export function expandFunc(pandaGen: PandaGen): IRNode[] {
    let vreg = getVregisterCache(pandaGen, CacheList.FUNC);
    return [
        new EcmaLdfunction(),
        new StaDyn(vreg)
    ];
}