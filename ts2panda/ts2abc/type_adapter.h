/*
 * Copyright (c) 2021-2022 Huawei Device Co., Ltd.
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

#ifndef TS2PANDA_TS2ABC_TYPE_ADAPTER_H
#define TS2PANDA_TS2ABC_TYPE_ADAPTER_H

#include "assembler/assembly-program.h"
#include "assembler/assembly-function.h"

class TypeAdapter {
public:
    TypeAdapter() {};
    ~TypeAdapter() {};
    explicit TypeAdapter(bool display) : display_typeinfo_(display) {};

    static constexpr const char* TSTYPE_ANNO_RECORD_NAME = "_ESTypeAnnotation";
    static constexpr const char* TSTYPE_ANNO_ELEMENT_NAME = "_TypeOfInstruction";

    bool ShouldDisplayTypeInfo() const
    {
        return display_typeinfo_;
    }

    void AdaptTypeForProgram(panda::pandasm::Program *prog) const;

private:
    void AdaptTypeForFunction(panda::pandasm::Function *func) const;
    void HandleTypeForFunction(panda::pandasm::Function *func, size_t anno_idx, size_t ele_idx,
                               const std::unordered_map<int32_t, int32_t> &vreg_type_map) const;
    void UpdateTypeAnnotation(panda::pandasm::Function *func, size_t anno_idx, size_t ele_idx,
                              const std::unordered_map<int32_t, int32_t> &order_type_map) const;
    bool display_typeinfo_ = false;
};

#endif  // TS2PANDA_TS2ABC_TYPE_ADAPTER_H
