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

#include "type_adapter.h"
#include "assembler/meta.h"

void TypeAdapter::AdaptTypeForProgram(panda::pandasm::Program *prog) const
{
    for (auto &[name, func] : prog->function_table) {
        if (ShouldDisplayTypeInfo()) {
            std::cout << "Handle types for funtion: " << name << "\n";
        }
        AdaptTypeForFunction(&func);
    }
}

void TypeAdapter::AdaptTypeForFunction(panda::pandasm::Function *func) const
{
    const auto &annos = func->metadata->GetAnnotations();
    std::unordered_map<int32_t, int32_t> vreg_type_map;
    size_t anno_idx = 0;
    size_t ele_idx = 0;
    for (; anno_idx < annos.size(); anno_idx++) {
        const auto &anno_data = annos[anno_idx];
        if (anno_data.GetName() != TSTYPE_ANNO_RECORD_NAME) {
            continue;
        }
        const auto &elements = anno_data.GetElements();
        for (; ele_idx < elements.size(); ele_idx++) {
            const auto &element = elements[ele_idx];
            if (element.GetName() != TSTYPE_ANNO_ELEMENT_NAME) {
                continue;
            }
            const auto *array_value = element.GetValue();
            ASSERT(array_value->IsArray());
            const auto &values = array_value->GetAsArray()->GetValues();
            size_t i = 0;
            while (i < values.size()) {
                auto vreg = static_cast<int32_t>(values[i++].GetValue<uint32_t>());
                auto type = static_cast<int32_t>(values[i++].GetValue<uint32_t>());
                vreg_type_map.emplace(vreg, type);
            }
            break;
        }
        break;
    }
    if (!vreg_type_map.empty()) {
        HandleTypeForFunction(func, anno_idx, ele_idx, vreg_type_map);
    }
}

static bool MaybeArg(const panda::pandasm::Function *func, size_t idx)
{
    return idx < func->params.size() && func->ins[idx].opcode == panda::pandasm::Opcode::MOV_DYN;
}

void TypeAdapter::HandleTypeForFunction(panda::pandasm::Function *func, size_t anno_idx, size_t ele_idx,
                                        const std::unordered_map<int32_t, int32_t> &vreg_type_map) const
{
    std::unordered_map<int32_t, int32_t> order_type_map;
    std::vector<int32_t> finished_vregs;
    int32_t order = 0;
    for (size_t i = 0; i < func->ins.size(); i++) {
        const auto &insn = func->ins[i];
        if (insn.opcode == panda::pandasm::Opcode::INVALID) {
            continue;
        }
        order++;
        bool maybe_arg = MaybeArg(func, i);
        if (!maybe_arg && insn.opcode != panda::pandasm::Opcode::STA_DYN) {
            continue;
        }
        if (maybe_arg) {
            auto vreg = insn.regs[0];
            auto arg = insn.regs[1];
            if (vreg >= func->params.size() || arg < func->regs_num) {
                continue;  // not arg
            }
            auto it = vreg_type_map.find(vreg);
            if (it != vreg_type_map.end()) {
                ASSERT(std::find(finished_vregs.begin(), finished_vregs.end(), vreg) == finished_vregs.end());
                int32_t arg_order = func->regs_num - arg - 1;
                order_type_map.emplace(arg_order, it->second);
                finished_vregs.emplace_back(vreg);
            }
            continue;
        }

        // vregs binded with variables must be filled through sta_dyn
        ASSERT(insn.opcode == panda::pandasm::Opcode::STA_DYN);
        ASSERT(!insn.regs.empty());
        auto vreg = insn.regs[0];
        auto it = vreg_type_map.find(vreg);
        if (it != vreg_type_map.end() &&
                  std::find(finished_vregs.begin(), finished_vregs.end(), vreg) == finished_vregs.end()) {
            order_type_map.emplace(order - 1, it->second);
            finished_vregs.emplace_back(vreg);
        }
    }

    UpdateTypeAnnotation(func, anno_idx, ele_idx, order_type_map);
}

void TypeAdapter::UpdateTypeAnnotation(panda::pandasm::Function *func, size_t anno_idx, size_t ele_idx,
                                       const std::unordered_map<int32_t, int32_t> &order_type_map) const
{
    ASSERT(anno_idx <= func->metadata->GetAnnotations().size());
    if (anno_idx == func->metadata->GetAnnotations().size()) {
        std::vector<panda::pandasm::AnnotationData> added_datas;
        panda::pandasm::AnnotationData data(TSTYPE_ANNO_RECORD_NAME);
        added_datas.push_back(std::forward<panda::pandasm::AnnotationData>(data));
        func->metadata->AddAnnotations(std::forward<std::vector<panda::pandasm::AnnotationData>>(added_datas));
        ele_idx = 0;
    }

    using ArrayValue = panda::pandasm::ArrayValue;
    using ScalarValue = panda::pandasm::ScalarValue;
    std::vector<ScalarValue> elements;
    for (const auto &[order, type] : order_type_map) {
        ScalarValue insn_order(ScalarValue::Create<panda::pandasm::Value::Type::I32>(order));
        elements.emplace_back(std::move(insn_order));
        ScalarValue insn_type(ScalarValue::Create<panda::pandasm::Value::Type::I32>(type));
        elements.emplace_back(std::move(insn_type));
    }

    ArrayValue arr(panda::pandasm::Value::Type::I32, elements);
    panda::pandasm::AnnotationElement anno_ele(TSTYPE_ANNO_ELEMENT_NAME, std::make_unique<ArrayValue>(arr));
    func->metadata->SetOrAddAnnotationElementByIndex(anno_idx, ele_idx, std::move(anno_ele));

    if (ShouldDisplayTypeInfo()) {
        std::cout << "(instruction order, type): ";
        const auto data = func->metadata->GetAnnotations()[anno_idx];
        const auto vars = data.GetElements()[ele_idx].GetValue()->GetAsArray()->GetValues();
        size_t pair_gap = 2;
        for (size_t i = 0; i < vars.size(); i += pair_gap) {
            std::cout << "(" << static_cast<int32_t>(vars[i].GetValue<int32_t>()) << ", "
                      << static_cast<int32_t>(vars[i + 1].GetValue<uint32_t>()) << "), ";
        }
        std::cout << "\n";
    }
}
