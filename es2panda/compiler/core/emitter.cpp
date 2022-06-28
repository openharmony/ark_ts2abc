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

#include "emitter.h"

#include <binder/binder.h>
#include <util/helpers.h>
#include <binder/scope.h>
#include <binder/variable.h>
#include <compiler/base/literals.h>
#include <compiler/core/compilerContext.h>
#include <compiler/core/pandagen.h>
#include <compiler/debugger/debuginfoDumper.h>
#include <compiler/base/catchTable.h>
#include <es2panda.h>
#include <gen/isa.h>
#include <ir/expressions/literal.h>
#include <ir/statements/blockStatement.h>
#include <macros.h>
#include <parser/program/program.h>

#include <string>
#include <string_view>
#include <tuple>
#include <utility>

namespace panda::es2panda::compiler {

constexpr const auto LANG_EXT = panda::pandasm::extensions::Language::ECMASCRIPT;

FunctionEmitter::FunctionEmitter(ArenaAllocator *allocator, const PandaGen *pg)
    : pg_(pg), literalBuffers_(allocator->Adapter())
{
    func_ = allocator->New<panda::pandasm::Function>(pg->InternalName().Mutf8(), LANG_EXT);

    size_t paramCount = pg->InternalParamCount();
    func_->params.reserve(paramCount);

    for (uint32_t i = 0; i < paramCount; ++i) {
        func_->params.emplace_back(panda::pandasm::Type("any", 0), LANG_EXT);
    }

    func_->regs_num = pg->TotalRegsNum();
    func_->return_type = panda::pandasm::Type("any", 0);
}

void FunctionEmitter::Generate()
{
    GenFunctionInstructions();
    GenVariablesDebugInfo();
    GenSourceFileDebugInfo();
    GenFunctionCatchTables();
    GenFunctionICSize();
    GenLiteralBuffers();
}

const ArenaSet<util::StringView> &FunctionEmitter::Strings() const
{
    return pg_->Strings();
}

void FunctionEmitter::GenBufferLiterals(const LiteralBuffer *buff)
{
    auto &[idx, array] = literalBuffers_.emplace_back();
    idx = buff->Index();
    array.reserve(buff->Literals().size() * 2);

    for (const auto *literal : buff->Literals()) {
        panda::pandasm::LiteralArray::Literal valueLit;
        panda::pandasm::LiteralArray::Literal tagLit;

        ir::LiteralTag tag = literal->Tag();

        switch (tag) {
            case ir::LiteralTag::BOOLEAN: {
                valueLit.tag_ = panda::panda_file::LiteralTag::BOOL;
                valueLit.value_ = literal->GetBoolean();
                break;
            }
            case ir::LiteralTag::INTEGER: {
                valueLit.tag_ = panda::panda_file::LiteralTag::INTEGER;
                valueLit.value_ = literal->GetInt();
                break;
            }
            case ir::LiteralTag::DOUBLE: {
                valueLit.tag_ = panda::panda_file::LiteralTag::DOUBLE;
                valueLit.value_ = literal->GetDouble();
                break;
            }
            case ir::LiteralTag::STRING: {
                valueLit.tag_ = panda::panda_file::LiteralTag::STRING;
                valueLit.value_ = literal->GetString().Mutf8();
                break;
            }
            case ir::LiteralTag::ACCESSOR: {
                valueLit.tag_ = panda::panda_file::LiteralTag::ACCESSOR;
                valueLit.value_ = static_cast<uint8_t>(0);
                break;
            }
            case ir::LiteralTag::METHOD: {
                valueLit.tag_ = panda::panda_file::LiteralTag::METHOD;
                valueLit.value_ = literal->GetMethod().Mutf8();
                break;
            }
            case ir::LiteralTag::GENERATOR_METHOD: {
                valueLit.tag_ = panda::panda_file::LiteralTag::GENERATORMETHOD;
                valueLit.value_ = literal->GetMethod().Mutf8();
                break;
            }
            case ir::LiteralTag::ASYNC_GENERATOR_METHOD: {
                valueLit.tag_ = panda::panda_file::LiteralTag::ASYNCGENERATORMETHOD;
                valueLit.value_ = literal->GetMethod().Mutf8();
                break;
            }
            case ir::LiteralTag::NULL_VALUE: {
                valueLit.tag_ = panda::panda_file::LiteralTag::NULLVALUE;
                valueLit.value_ = static_cast<uint8_t>(0);
                break;
            }
            default:
                break;
        }

        tagLit.tag_ = panda::panda_file::LiteralTag::TAGVALUE;
        tagLit.value_ = static_cast<uint8_t>(valueLit.tag_);

        array.emplace_back(tagLit);
        array.emplace_back(valueLit);
    }
}

util::StringView FunctionEmitter::SourceCode() const
{
    return pg_->Binder()->Program()->SourceCode();
}

static Format MatchFormat(const IRNode *node, const Formats &formats)
{
    std::array<const VReg *, IRNode::MAX_REG_OPERAND> regs {};
    auto regCnt = node->Registers(&regs);
    auto registers = Span<const VReg *>(regs.data(), regs.data() + regCnt);

    const auto *iter = formats.begin();

    for (; iter != formats.end(); iter++) {
        auto format = *iter;
        size_t limit = 0;
        for (const auto &formatItem : format.GetFormatItem()) {
            if (formatItem.IsVReg()) {
                limit = 1 << formatItem.Bitwidth();
                break;
            }
        }

        if (std::all_of(registers.begin(), registers.end(), [limit](const VReg *reg) { return *reg < limit; })) {
            return format;
        }
    }

    UNREACHABLE();
    return *iter;
}

static size_t GetIRNodeWholeLength(const IRNode *node)
{
    Formats formats = node->GetFormats();
    if (formats.empty()) {
        return 0;
    }

    size_t len = 1;
    const auto format = MatchFormat(node, formats);

    for (auto fi : format.GetFormatItem()) {
        len += fi.Bitwidth() / 8;
    }

    return len;
}

static std::string WholeLine(const util::StringView &source, lexer::SourceRange range)
{
    return source.Substr(range.start.index, range.end.index).EscapeSymbol<util::StringView::Mutf8Encode>();
}

void FunctionEmitter::GenInstructionDebugInfo(const IRNode *ins, panda::pandasm::Ins *pandaIns)
{
    const ir::AstNode *astNode = ins->Node();

    ASSERT(astNode != nullptr);

    if (astNode == FIRST_NODE_OF_FUNCTION) {
        astNode = pg_->Debuginfo().firstStmt;
        if (!astNode) {
            return;
        }
    }

    pandaIns->ins_debug.line_number = astNode->Range().start.line + 1;

    if (pg_->IsDebug()) {
        size_t insLen = GetIRNodeWholeLength(ins);
        if (insLen != 0) {
            pandaIns->ins_debug.bound_left = offset_;
            pandaIns->ins_debug.bound_right = offset_ + insLen;
        }

        offset_ += insLen;
        pandaIns->ins_debug.whole_line = WholeLine(SourceCode(), astNode->Range());
    }
}

void FunctionEmitter::GenFunctionInstructions()
{
    func_->ins.reserve(pg_->Insns().size());

    for (const auto *ins : pg_->Insns()) {
        auto &pandaIns = func_->ins.emplace_back();

        ins->Transform(&pandaIns);
        GenInstructionDebugInfo(ins, &pandaIns);
    }
}

void FunctionEmitter::GenFunctionICSize()
{
    panda::pandasm::AnnotationData funcAnnotationData("_ESAnnotation");
    panda::pandasm::AnnotationElement icSizeAnnotationElement(
        "icSize", std::make_unique<panda::pandasm::ScalarValue>(
                      panda::pandasm::ScalarValue::Create<panda::pandasm::Value::Type::U32>(pg_->IcSize())));
    funcAnnotationData.AddElement(std::move(icSizeAnnotationElement));

    panda::pandasm::AnnotationElement parameterLengthAnnotationElement(
        "parameterLength",
        std::make_unique<panda::pandasm::ScalarValue>(
            panda::pandasm::ScalarValue::Create<panda::pandasm::Value::Type::U32>(pg_->FormalParametersCount())));
    funcAnnotationData.AddElement(std::move(parameterLengthAnnotationElement));

    panda::pandasm::AnnotationElement funcNameAnnotationElement(
        "funcName",
        std::make_unique<panda::pandasm::ScalarValue>(
            panda::pandasm::ScalarValue::Create<panda::pandasm::Value::Type::STRING>(pg_->FunctionName().Mutf8())));
    funcAnnotationData.AddElement(std::move(funcNameAnnotationElement));

    func_->metadata->AddAnnotations({funcAnnotationData});
}

void FunctionEmitter::GenFunctionCatchTables()
{
    func_->catch_blocks.reserve(pg_->CatchList().size());

    for (const auto *catchBlock : pg_->CatchList()) {
        const auto &labelSet = catchBlock->LabelSet();

        auto &pandaCatchBlock = func_->catch_blocks.emplace_back();
        pandaCatchBlock.try_begin_label = labelSet.TryBegin()->Id();
        pandaCatchBlock.try_end_label = labelSet.TryEnd()->Id();
        pandaCatchBlock.catch_begin_label = labelSet.CatchBegin()->Id();
        pandaCatchBlock.catch_end_label = labelSet.CatchEnd()->Id();
    }
}

void FunctionEmitter::GenLiteralBuffers()
{
    for (const auto *buff : pg_->BuffStorage()) {
        GenBufferLiterals(buff);
    }
}

void FunctionEmitter::GenSourceFileDebugInfo()
{
    func_->source_file = std::string {pg_->Binder()->Program()->SourceFile()};

    if (!pg_->IsDebug()) {
        return;
    }

    if (pg_->RootNode()->IsProgram()) {
        func_->source_code = SourceCode().EscapeSymbol<util::StringView::Mutf8Encode>();
    }
}

void FunctionEmitter::GenScopeVariableInfo(const binder::Scope *scope)
{
    const auto *startIns = scope->ScopeStart();
    const auto *endIns = scope->ScopeEnd();

    uint32_t start = 0;
    uint32_t count = 0;

    for (const auto *it : pg_->Insns()) {
        if (startIns == it) {
            start = count;
        } else if (endIns == it) {
            auto varsLength = static_cast<uint32_t>(count - start + 1);

            for (const auto &[name, variable] : scope->Bindings()) {
                if (!variable->IsLocalVariable() || variable->LexicalBound()) {
                    continue;
                }

                auto &variableDebug = func_->local_variable_debug.emplace_back();
                variableDebug.name = name.Mutf8();
                variableDebug.signature = "any";
                variableDebug.signature_type = "any";
                variableDebug.reg = static_cast<int32_t>(variable->AsLocalVariable()->Vreg());
                variableDebug.start = start;
                variableDebug.length = static_cast<uint32_t>(varsLength);
            }

            break;
        }

        count++;
    }
}

void FunctionEmitter::GenVariablesDebugInfo()
{
    if (!pg_->IsDebug()) {
        return;
    }

    for (const auto *scope : pg_->Debuginfo().variableDebugInfo) {
        GenScopeVariableInfo(scope);
    }
}

// Emitter

Emitter::Emitter(const CompilerContext *context)
{
    prog_ = new panda::pandasm::Program();
    prog_->lang = panda::pandasm::extensions::Language::ECMASCRIPT;

    prog_->function_table.reserve(context->Binder()->Functions().size());
    GenESAnnoatationRecord();
    GenESModuleModeRecord(context->Binder()->Program()->Kind() == parser::ScriptKind::MODULE);
}

Emitter::~Emitter()
{
    delete prog_;
}

void Emitter::GenESAnnoatationRecord()
{
    auto annotationRecord = panda::pandasm::Record("_ESAnnotation", LANG_EXT);
    annotationRecord.metadata->SetAttribute("external");
    annotationRecord.metadata->SetAccessFlags(panda::ACC_ANNOTATION);
    prog_->record_table.emplace(annotationRecord.name, std::move(annotationRecord));
}

void Emitter::GenESModuleModeRecord(bool isModule)
{
    auto modeRecord = panda::pandasm::Record("_ESModuleMode", LANG_EXT);
    modeRecord.metadata->SetAccessFlags(panda::ACC_PUBLIC);

    auto modeField = panda::pandasm::Field(LANG_EXT);
    modeField.name = "isModule";
    modeField.type = panda::pandasm::Type("u8", 0);
    modeField.metadata->SetValue(
        panda::pandasm::ScalarValue::Create<panda::pandasm::Value::Type::U8>(static_cast<uint8_t>(isModule)));

    modeRecord.field_list.emplace_back(std::move(modeField));

    prog_->record_table.emplace(modeRecord.name, std::move(modeRecord));
}

void Emitter::AddFunction(FunctionEmitter *func)
{
    std::lock_guard<std::mutex> lock(m_);

    for (const auto &str : func->Strings()) {
        prog_->strings.insert(str.Mutf8());
    }

    for (auto &[idx, buf] : func->LiteralBuffers()) {
        auto literalArrayInstance = panda::pandasm::LiteralArray(std::move(buf));
        prog_->literalarray_table.emplace(std::to_string(idx), std::move(literalArrayInstance));
    }

    auto *function = func->Function();
    prog_->function_table.emplace(function->name, std::move(*function));
}

void Emitter::DumpAsm(const panda::pandasm::Program *prog)
{
    auto &ss = std::cout;

    ss << ".language ECMAScript" << std::endl << std::endl;

    for (auto &[name, func] : prog->function_table) {
        ss << ".function any " << name << '(';

        for (uint32_t i = 0; i < func.GetParamsNum(); i++) {
            ss << "any a" << std::to_string(i);

            if (i != func.GetParamsNum() - 1) {
                ss << ", ";
            }
        }

        ss << ") {" << std::endl;

        for (const auto &ins : func.ins) {
            ss << (ins.set_label ? "" : "\t") << ins.ToString("", true, func.GetTotalRegs()) << std::endl;
        }

        ss << "}" << std::endl << std::endl;

        for (const auto &ct : func.catch_blocks) {
            ss << ".catchall " << ct.try_begin_label << ", " << ct.try_end_label << ", " << ct.catch_begin_label
               << std::endl
               << std::endl;
        }
    }

    ss << std::endl;
}

panda::pandasm::Program *Emitter::Finalize(bool dumpDebugInfo)
{
    if (dumpDebugInfo) {
        debuginfo::DebugInfoDumper dumper(prog_);
        dumper.Dump();
    }

    auto *prog = prog_;
    prog_ = nullptr;
    return prog;
}

}  // namespace panda::es2panda::compiler
