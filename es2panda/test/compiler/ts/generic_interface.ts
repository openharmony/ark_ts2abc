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


interface R<T = number> {
    a: T;
}

var var1: R;
var1.a = 5;

var var2: R<string>;
var2.a = "foo";

interface U<Z, W> extends R {
    b: Z | W;
}

var var3: U<boolean, number>;
var3.a = 12;
var3.b = true;
var3.b = 32;

interface V<T = number> {
    a: T[];
}

interface V {
    b: string[]
}

var var4: V;
var4.a = [1, 2, 3];
var4.b = ["bar", "baz"];

interface C<E, F = { a: number, b: string }> {
    a: E;
    b: F;
}

var var5: C<[number]>;
var5.a = [2];
var5.b = { a: 3, b: "foo" };

interface I<A> {
    aa: A
}

var a: {
    aa: number
}

interface A<T = string, B = typeof a | I<string>> {
}

interface O<T = typeof a, B = I<boolean>> { }

interface L<T, B, O = A> { }
