/*
 * Copyright (c) 2022 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


type A<T> = number | T;

var var1: A<string>;
var1 = 4;
var1 = "foo";

var var2: A<number>;
var2 = 1;

var var3: A<A<boolean>>;
var3 = 2;
var3 = true;

type B<R, T = number> = [R, T];

var var4: B<string>;
var4 = ["foo", 12];

var var5: B<number, boolean>;
var5 = [4, true];

var var6: B<A<{ a: number, b: string }>>;
var6 = [{ a: 2, b: "foo" }, 12];

var o = {
    a: 12,
    b: ["foo", true],
}

var z = {
    ...o,
    c: function (a: number, b: string): number[] {
        return [1, 2, 3];
    }
}

type C<T = typeof z, E = () => number[]> = (T | E)[];

var var7: C;
var7 = [];
var7 = [{ a: 2, b: ["bar", false], c: function () { return [1] } }];
var7 = [function () {
    return [1, 2, 3];
}];
var7 = [{ a: 1, b: ["baz"], c: function (a: number, b: string) { return [] } }, function () { return [2] }];

var var8: C<number>;
var8 = [1, 2, 3];

function func(): number[] {
    return [1, 2, 3, 4];
}

var8 = [1, func];
