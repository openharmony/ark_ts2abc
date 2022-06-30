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
#include "assembler/assembly-parser.h"

namespace ts2abc_type_adapter::type_adapter_test {
using ArrayValue = panda::pandasm::ArrayValue;
using ScalarValue = panda::pandasm::ScalarValue;
using AnnotationData = panda::pandasm::AnnotationData;
using AnnotationElement = panda::pandasm::AnnotationElement;

class TestBase {
public:
    template <typename T1, typename T2>
    inline void TestAssertEqual(const T1 &left, const T2 &right) const
    {
        if (left != static_cast<T1>(right)) {
            std::cout << "assertion equal failed." << std::endl;
            UNREACHABLE();
        }
    }

    template <typename T1, typename T2>
    inline void TestAssertNotEqual(const T1 &left, const T2 &right) const
    {
        if (left == static_cast<T1>(right)) {
            std::cout << "assertion not equal failed." << std::endl;
            UNREACHABLE();
        }
    }
};

class TypeAdapterTest : TestBase {
public:
    void TestVariablesArgsType() const;
    void TestBuiltinsType() const;

    std::unordered_map<int32_t, int32_t> ExtractTypeinfo(const panda::pandasm::Function &fun) const
    {
        const auto *ele = fun.metadata->GetAnnotations()[0].GetElements()[0].GetValue();
        const auto &values = ele->GetAsArray()->GetValues();
        std::unordered_map<int32_t, int32_t>type_info;
        const size_t pair_gap = 2;
        TestAssertEqual(values.size() % pair_gap, 0);
        for (size_t i = 0; i < values.size(); i += pair_gap) {
            type_info.emplace(values[i].GetValue<int32_t>(), values[i + 1].GetValue<int32_t>());
        }
        return type_info;
    }

    void CheckTypeExist(const std::unordered_map<int32_t, int32_t> &typeinfo, int32_t order, int32_t type) const
    {
        auto type_it = typeinfo.find(order);
        TestAssertNotEqual(type_it, typeinfo.end());
        TestAssertEqual(type_it->second, type);
    }

    void AddTypeinfo(std::vector<ScalarValue> *elements, int32_t order, int32_t type) const
    {
        ScalarValue insn_order(ScalarValue::Create<panda::pandasm::Value::Type::I32>(order));
        elements->emplace_back(std::move(insn_order));
        ScalarValue insn_type(ScalarValue::Create<panda::pandasm::Value::Type::I32>(type));
        elements->emplace_back(std::move(insn_type));
    }
};

void TypeAdapterTest::TestVariablesArgsType() const
{
    std::string source = R"(
        .function any foo(any a0, any a1) {
            mov.dyn v1, a1
            mov.dyn v0, a0
            ecma.ldlexenvdyn
            sta.dyn v4
            lda.dyn v0
            sta.dyn v3
            lda.dyn v1
            ecma.add2dyn v3
            sta.dyn v2
            lda.dyn v2
            sta.dyn v3
            lda.dyn v3
            return.dyn
        }
    )";
    panda::pandasm::Parser p;
    auto res = p.Parse(source);
    auto &program = res.Value();
    auto it = program.function_table.find("foo");
    TestAssertNotEqual(it, program.function_table.end());
    auto &foo = it->second;

    // set up args types
    std::vector<ScalarValue> elements;
    AddTypeinfo(&elements, 0, 1);
    AddTypeinfo(&elements, 1, 1);
    // set up variable type
    const int32_t var_reg = 2;
    AddTypeinfo(&elements, var_reg, 1);
    ArrayValue arr(panda::pandasm::Value::Type::I32, elements);
    AnnotationElement anno_ele(TypeAdapter::TSTYPE_ANNO_ELEMENT_NAME, std::make_unique<ArrayValue>(arr));
    AnnotationData anno_data(TypeAdapter::TSTYPE_ANNO_RECORD_NAME);
    anno_data.AddElement(std::move(anno_ele));
    std::vector<panda::pandasm::AnnotationData> annos;
    annos.emplace_back(std::move(anno_data));
    foo.metadata->SetAnnotations(std::move(annos));

    TypeAdapter ta;
    ta.AdaptTypeForProgram(&program);

    // Check types
    const auto typeinfo = ExtractTypeinfo(foo);
    // first arg type
    CheckTypeExist(typeinfo, -1, 1);
    // second arg type
    const int32_t second_arg = -2;
    CheckTypeExist(typeinfo, second_arg, 1);
    // variable type
    const int32_t instruction_location = 8;
    CheckTypeExist(typeinfo, instruction_location, 1);
}
}  // namespace ts2abc_type_adapter::type_adapter_test

int main()
{
    ts2abc_type_adapter::type_adapter_test::TypeAdapterTest test;
    std::cout << "TypeAdapterTest TestVariablesArgsType: " << std::endl;
    test.TestVariablesArgsType();
    std::cout << "PASS!" << std::endl;
    return 0;
    // should enable TestBuiltinsType when builtins adaption is ready
}
