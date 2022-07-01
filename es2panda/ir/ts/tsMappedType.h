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

#ifndef ES2PANDA_IR_TS_MAPPED_TYPE_H
#define ES2PANDA_IR_TS_MAPPED_TYPE_H

#include <ir/expression.h>
#include <ir/ts/tsTypeParameter.h>

namespace panda::es2panda::compiler {
class PandaGen;
}  // namespace panda::es2panda::compiler

namespace panda::es2panda::checker {
class Checker;
class Type;
}  // namespace panda::es2panda::checker

namespace panda::es2panda::ir {

class TSMappedType : public Expression {
public:
    explicit TSMappedType(TSTypeParameter *typeParameter, Expression *typeAnnotation, MappedOption readonly,
                          MappedOption optional)
        : Expression(AstNodeType::TS_MAPPED_TYPE),
          typeParameter_(typeParameter),
          typeAnnotation_(typeAnnotation),
          readonly_(readonly),
          optional_(optional)
    {
    }

    TSTypeParameter *TypeParameter()
    {
        return typeParameter_;
    }

    Expression *TypeAnnotation()
    {
        return typeAnnotation_;
    }

    MappedOption Readonly()
    {
        return readonly_;
    }

    MappedOption Optional()
    {
        return optional_;
    }

    void Iterate(const NodeTraverser &cb) const override;
    void Dump(ir::AstDumper *dumper) const override;
    void Compile([[maybe_unused]] compiler::PandaGen *pg) const override;
    checker::Type *Check([[maybe_unused]] checker::Checker *checker) const override;

private:
    TSTypeParameter *typeParameter_;
    Expression *typeAnnotation_;
    MappedOption readonly_;
    MappedOption optional_;
};
}  // namespace panda::es2panda::ir

#endif
