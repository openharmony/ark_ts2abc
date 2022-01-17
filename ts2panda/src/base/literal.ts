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

export enum LiteralTag {
  BOOLEAN = 1,
  INTEGER = 2,
  DOUBLE = 4,
  STRING = 5,
  METHOD = 6,
  GENERATOR = 7,
  ACCESSOR = 8,
  METHODAFFILIATE = 9,
  NULLVALUE = 255
}

export class Literal {
  private tag: LiteralTag;
  private value: any;

  constructor(tag: LiteralTag, value: any) {
      this.tag = tag;
      this.value = value;
  }

  getTag() {
      return this.tag;
  }

  getValue() {
      return this.value;
  }
}

export class LiteralBuffer {
  private literalBuffer: Literal[] = [];

  constructor() { };

  addLiterals(...literals: Array<Literal>) {
      this.literalBuffer.push(...literals);
  }

  getLiterals() {
    return this.literalBuffer;
  }

  isEmpty() {
      return this.literalBuffer.length == 0;
  }
}