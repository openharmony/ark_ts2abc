/**
 * Copyright (c) 2021 Huawei Device Co., Ltd.
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

#include "classProperty.h"

#include <ir/astDump.h>
#include <ir/base/decorator.h>
#include <ir/expression.h>

#include <cstdint>
#include <string>

namespace panda::es2panda::ir {

void ClassProperty::Iterate(const NodeTraverser &cb) const
{
    cb(key_);

    if (value_) {
        cb(value_);
    }

    if (typeAnnotation_) {
        cb(typeAnnotation_);
    }

    for (auto *it : decorators_) {
        cb(it);
    }
}

void ClassProperty::Dump(ir::AstDumper *dumper) const
{
    dumper->Add({{"type", "ClassProperty"},
                 {"key", key_},
                 {"value", AstDumper::Optional(value_)},
                 {"accessibility", AstDumper::Optional(AstDumper::ModifierToString(modifiers_))},
                 {"abstract", AstDumper::Optional((modifiers_ & ModifierFlags::ABSTRACT) != 0)},
                 {"static", (modifiers_ & ModifierFlags::STATIC) != 0},
                 {"readonly", (modifiers_ & ModifierFlags::READONLY) != 0},
                 {"declare", (modifiers_ & ModifierFlags::DECLARE) != 0},
                 {"optional", (modifiers_ & ModifierFlags::OPTIONAL) != 0},
                 {"computed", isComputed_},
                 {"typeAnnotation", AstDumper::Optional(typeAnnotation_)},
                 {"definite", AstDumper::Optional(definite_)},
                 {"decorators", decorators_}});
}

void ClassProperty::Compile([[maybe_unused]] compiler::PandaGen *pg) const {}

checker::Type *ClassProperty::Check([[maybe_unused]] checker::Checker *checker) const
{
    return nullptr;
}

}  // namespace panda::es2panda::ir
