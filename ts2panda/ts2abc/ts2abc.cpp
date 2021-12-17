/* * Copyright (c) 2021 Huawei Device Co., Ltd.
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

#include <codecvt>
#include <cstdarg>
#include <iostream>
#include <locale>
#include <string>
#include <unistd.h>

#include "assembly-type.h"
#include "assembly-program.h"
#include "assembly-emitter.h"
#include "json/json.h"
#include "ts2abc_options.h"
#include "securec.h"

#ifdef ENABLE_BYTECODE_OPT
#include "optimize_bytecode.h"
#endif

namespace {
    // pandasm definitions
    constexpr const auto LANG_EXT = panda::pandasm::extensions::Language::ECMASCRIPT;
    const std::string WHOLE_LINE;
    bool g_debugModeEnabled = false;
    bool g_debugLogEnabled = false;
    int g_optLevel = 0;
    std::string g_optLogLevel = "error";
    bool g_moduleModeEnabled = false;
    const int LOG_BUFFER_SIZE = 1024;
    const int BASE = 16;
    const int UNICODE_ESCAPE_SYMBOL_LEN = 2;
    const int UNICODE_CHARACTER_LEN = 4;

    int g_literalArrayCount = 0;

    constexpr std::size_t BOUND_LEFT = 0;
    constexpr std::size_t BOUND_RIGHT = 0;
    constexpr std::size_t LINE_NUMBER = 0;
    constexpr bool IS_DEFINED = true;
    // Temprorary map to simplify debuging
    std::unordered_map<std::string, panda::pandasm::Opcode> g_opcodeMap = {
#define OPLIST(opcode, name, optype, width, flags, def_idx, use_idxs) { name, panda::pandasm::Opcode::opcode },
        PANDA_INSTRUCTION_LIST(OPLIST)
#undef OPLIST
            { "", panda::pandasm::Opcode::INVALID },
    };

    enum JsonType {
        FUNCTION = 0,
        RECORD,
        STRING,
        LITERALBUFFER,
        OPTIONS
    };

    const int RETURN_SUCCESS = 0;
    const int RETURN_FAILED = 1;
}

// pandasm hellpers
static panda::pandasm::Record MakeRecordDefinition(const std::string &name, const std::string &wholeLine,
    size_t boundLeft, size_t boundRight, size_t lineNumber)
{
    auto record = panda::pandasm::Record(
        name,
        LANG_EXT,
        boundLeft,
        boundRight,
        wholeLine,
        IS_DEFINED,
        lineNumber);

    return record;
}

static panda::pandasm::Function MakeFuncDefintion(const std::string &name, const std::string &returnType)
{
    auto function = panda::pandasm::Function(
        name,
        LANG_EXT,
        BOUND_LEFT,
        BOUND_RIGHT,
        WHOLE_LINE,
        IS_DEFINED,
        LINE_NUMBER);

    function.return_type = panda::pandasm::Type(returnType.c_str(), 0);
    return function;
};

static panda::pandasm::Label MakeLabel(const std::string &name)
{
    auto label = panda::pandasm::Label(
        name,
        BOUND_LEFT,
        BOUND_RIGHT,
        WHOLE_LINE,
        IS_DEFINED,
        LINE_NUMBER);

    return label;
};


static bool IsValidInt32(double value)
{
    return (value <= static_cast<double>(std::numeric_limits<int>::max()) &&
        value >= static_cast<double>(std::numeric_limits<int>::min()));
}

// Unified interface for debug log print
static void Logd(const char *format, ...)
{
    if (g_debugLogEnabled) {
        va_list valist;
        va_start(valist, format);
        char logMsg[LOG_BUFFER_SIZE];
        int ret = vsnprintf_s(logMsg, sizeof(logMsg) - 1, sizeof(logMsg) - 1, format, valist);
        if (ret == -1) {
            return;
        }
        std::cout << logMsg << std::endl;
        va_end(valist);
    }
}

static std::u16string ConvertUtf8ToUtf16(const std::string &data)
{
    std::u16string u16Data = std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> {}.from_bytes(data);
    return u16Data;
}

static std::string ConvertUtf16ToMUtf8(const uint16_t *u16Data, size_t u16DataSize)
{
    size_t mutf8DataLen = panda::utf::Utf16ToMUtf8Size(u16Data, u16DataSize);
    std::vector<uint8_t> mutf8Data(mutf8DataLen);

    panda::utf::ConvertRegionUtf16ToMUtf8(u16Data, mutf8Data.data(), u16DataSize, mutf8DataLen - 1, 0);

    std::string ret = std::string(reinterpret_cast<char *>(mutf8Data.data()));
    return ret;
}

static std::string ConvertUtf8ToMUtf8(const std::string &data)
{
    // WARN: std::u16string is set of uint_least16_t characters.
    std::u16string u16String = ConvertUtf8ToUtf16(data);
    uint16_t *u16Data = reinterpret_cast<uint16_t *>(u16String.data());
    size_t u16DataSize = u16String.size();
    return ConvertUtf16ToMUtf8(u16Data, u16DataSize);
}

static std::string ParseUnicodeEscapeString(const std::string &data)
{
    std::string::size_type startIdx = 0;
    std::string newData = "";
    std::string::size_type len = data.length();
    while (true) {
        std::string unicodeStr = "\\u";
        std::string::size_type index = data.find(unicodeStr, startIdx);
        if (index == std::string::npos) {
            break;
        }
        if (index != 0 && data[index - 1] == '\\') {
            std::string tmpStr = data.substr(startIdx, index - 1 - startIdx) +
                                data.substr(index, UNICODE_ESCAPE_SYMBOL_LEN); // delete a '\\'
            newData += ConvertUtf8ToMUtf8(tmpStr);
            startIdx = index + UNICODE_ESCAPE_SYMBOL_LEN;
        } else {
            std::string tmpStr = data.substr(startIdx, index - startIdx);
            newData += ConvertUtf8ToMUtf8(tmpStr);
            std::string uStr = data.substr(index + UNICODE_ESCAPE_SYMBOL_LEN, UNICODE_CHARACTER_LEN);
            uint16_t u16Data = std::stoi(uStr.c_str(), NULL, BASE);
            newData += ConvertUtf16ToMUtf8(&u16Data, 1);
            startIdx = index + UNICODE_ESCAPE_SYMBOL_LEN + UNICODE_CHARACTER_LEN;
        }
    }
    if (startIdx != len) {
        std::string tmpStr = data.substr(startIdx);
        newData += ConvertUtf8ToMUtf8(tmpStr);
    }
    return newData;
}

static std::string ParseString(const std::string &data)
{
    if (data.find("\\u") != std::string::npos) {
        return ParseUnicodeEscapeString(data);
    }

    return ConvertUtf8ToMUtf8(data);
}

static void ParseLiteral(const Json::Value &literal, std::vector<panda::pandasm::LiteralArray::Literal> &literalArray)
{
    panda::pandasm::LiteralArray::Literal tagLiteral;
    panda::pandasm::LiteralArray::Literal valueLiteral;

    uint8_t tagValue = static_cast<uint8_t>(literal["tag"].asUInt());

    tagLiteral.tag_ = panda::panda_file::LiteralTag::TAGVALUE;
    tagLiteral.value_ = tagValue;
    literalArray.emplace_back(tagLiteral);

    switch (tagValue) {
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::BOOL): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::BOOL;
            valueLiteral.value_ = literal["value"].asBool();
            break;
        }
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::INTEGER): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::INTEGER;
            valueLiteral.value_ = static_cast<uint32_t>(literal["value"].asInt());
            break;
        }
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::DOUBLE): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::DOUBLE;
            valueLiteral.value_ = literal["value"].asDouble();
            break;
        }
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::STRING): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::STRING;
            valueLiteral.value_ = ParseString(literal["value"].asString());
            break;
        }
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::METHOD): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::METHOD;
            valueLiteral.value_ = ParseString(literal["value"].asString());
            break;
        }
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::GENERATORMETHOD): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::GENERATORMETHOD;
            valueLiteral.value_ = ParseString(literal["value"].asString());
            break;
        }
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::ACCESSOR): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::ACCESSOR;
            valueLiteral.value_ = static_cast<uint8_t>(0);
            break;
        }
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::METHODAFFILIATE): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::METHODAFFILIATE;
            valueLiteral.value_ = static_cast<uint16_t>(literal["value"].asUInt());
            break;
        }
        case static_cast<uint8_t>(panda::panda_file::LiteralTag::NULLVALUE): {
            valueLiteral.tag_ = panda::panda_file::LiteralTag::NULLVALUE;
            valueLiteral.value_ = static_cast<uint8_t>(0);
            break;
        }
        default:
            break;
    }

    literalArray.emplace_back(valueLiteral);
}

static panda::pandasm::Record ParseRecord(const Json::Value &record)
{
    std::string recordName = "";
    if (record.isMember("name") && record["name"].isString()) {
        recordName = record["name"].asString();
    }

    std::string wholeLine = "";
    if (record.isMember("whole_line") && record["whole_line"].isString()) {
        wholeLine = ParseString(record["whole_line"].asString());
    }

    int boundLeft = -1;
    if (record.isMember("bound_left") && record["bound_left"].isInt()) {
        boundLeft = record["bound_left"].asInt();
    }

    int boundRight = -1;
    if (record.isMember("bound_right") && record["bound_right"].isInt()) {
        boundRight = record["bound_right"].asInt();
    }

    int lineNumber = -1;
    if (record.isMember("line_number") && record["line_number"].isInt()) {
        lineNumber = record["line_number"].asInt();
    }

    auto pandaRecord = MakeRecordDefinition(recordName, wholeLine, static_cast<size_t>(boundLeft),
        static_cast<size_t>(boundRight), static_cast<size_t>(lineNumber));

    if (record.isMember("metadata") && record["metadata"].isObject()) {
        auto metadata = record["metadata"];
        if (metadata.isMember("attribute") && metadata["attribute"].isString()) {
            std::string metAttribute = metadata["attribute"].asString();
            if (metAttribute.length() > 0) {
                pandaRecord.metadata->SetAttribute(metAttribute);
            }
        }
    }

    return pandaRecord;
}

static void ParseInstructionOpCode(const Json::Value &ins, panda::pandasm::Ins &pandaIns)
{
    // read opcode as string (can be changed in future)
    if (ins.isMember("op") && ins["op"].isString()) {
        std::string opcode = ins["op"].asString();
        if (g_opcodeMap.find(opcode) != g_opcodeMap.end()) {
            pandaIns.opcode = g_opcodeMap[opcode];
        }
    }
}

static void ParseInstructionRegs(const Json::Value &ins, panda::pandasm::Ins &pandaIns)
{
    if (ins.isMember("regs") && ins["regs"].isArray()) {
        auto regs = ins["regs"];
        for (Json::ArrayIndex i = 0; i < regs.size(); ++i) {
            pandaIns.regs.emplace_back(regs[i].asUInt());
        }
    }
}

static void ParseInstructionIds(const Json::Value &ins, panda::pandasm::Ins &pandaIns)
{
    if (ins.isMember("ids") && ins["ids"].isArray()) {
        auto ids = ins["ids"];
        for (Json::ArrayIndex i = 0; i < ids.size(); ++i) {
            if (ids[i].isString()) {
                pandaIns.ids.emplace_back(ParseString(ids[i].asString()));
            }
        }
    }
}

static void ParseInstructionImms(const Json::Value &ins, panda::pandasm::Ins &pandaIns)
{
    if (ins.isMember("imms") && ins["imms"].isArray()) {
        auto imms = ins["imms"];
        for (Json::ArrayIndex i = 0; i < imms.size(); ++i) {
            double imsValue = imms[i].asDouble();
            Logd("imm: %lf ", imsValue);
            double intpart;
            if (std::modf(imsValue, &intpart) == 0.0 && IsValidInt32(imsValue)) {
                pandaIns.imms.emplace_back(static_cast<int64_t>(imsValue));
            } else {
                pandaIns.imms.emplace_back(imsValue);
            }
        }
    }
}

static void ParseInstructionLabel(const Json::Value &ins, panda::pandasm::Ins &pandaIns)
{
    if (ins.isMember("label") && ins["label"].isString()) {
        std::string label = ins["label"].asString();
        if (label.length() != 0) {
            Logd("label:\t%s", label.c_str());
            pandaIns.set_label = true;
            pandaIns.label = label;
            Logd("pandaIns.label:\t%s", pandaIns.label.c_str());
        }
    }
}

static void ParseInstructionDebugInfo(const Json::Value &ins, panda::pandasm::Ins &pandaIns)
{
    panda::pandasm::debuginfo::Ins insDebug;
    if (ins.isMember("debug_pos_info") && ins["debug_pos_info"].isObject()) {
        auto debugPosInfo = ins["debug_pos_info"];
        if (g_debugModeEnabled) {
            if (debugPosInfo.isMember("boundLeft") && debugPosInfo["boundLeft"].isInt()) {
                insDebug.bound_left = debugPosInfo["boundLeft"].asInt();
            }

            if (debugPosInfo.isMember("boundRight") && debugPosInfo["boundRight"].isInt()) {
                insDebug.bound_right = debugPosInfo["boundRight"].asInt();
            }

            if (debugPosInfo.isMember("wholeLine") && debugPosInfo["wholeLine"].isString()) {
                insDebug.whole_line = debugPosInfo["wholeLine"].asString();
            }
        }

        if (debugPosInfo.isMember("lineNum") && debugPosInfo["lineNum"].isInt()) {
            insDebug.line_number = debugPosInfo["lineNum"].asInt();
        }
    }

    pandaIns.ins_debug = insDebug;
}

static panda::pandasm::Ins ParseInstruction(const Json::Value &ins)
{
    panda::pandasm::Ins pandaIns;
    ParseInstructionOpCode(ins, pandaIns);
    ParseInstructionRegs(ins, pandaIns);
    ParseInstructionIds(ins, pandaIns);
    ParseInstructionImms(ins, pandaIns);
    ParseInstructionLabel(ins, pandaIns);
    ParseInstructionDebugInfo(ins, pandaIns);
    return pandaIns;
}

static int ParseVariablesDebugInfo(const Json::Value &function, panda::pandasm::Function &pandaFunc)
{
    if (!g_debugModeEnabled) {
        return RETURN_SUCCESS;
    }

    if (function.isMember("variables") && function["variables"].isArray()) {
        for (Json::ArrayIndex i = 0; i < function["variables"].size(); ++i) {
            if (!function["variables"][i].isObject()) {
                continue;
            }

            panda::pandasm::debuginfo::LocalVariable variableDebug;
            auto variable = function["variables"][i];
            if (variable.isMember("name") && variable["name"].isString()) {
                variableDebug.name = variable["name"].asString();
            }

            if (variable.isMember("signature") && variable["signature"].isString()) {
                variableDebug.signature = variable["signature"].asString();
            }

            if (variable.isMember("signatureType") && variable["signatureType"].isString()) {
                variableDebug.signature_type = variable["signatureType"].asString();
            }

            if (variable.isMember("reg") && variable["reg"].isInt()) {
                variableDebug.reg = variable["reg"].asInt();
            }

            if (variable.isMember("start") && variable["start"].isInt()) {
                variableDebug.start = variable["start"].asInt();
            }

            if (variable.isMember("length") && variable["length"].isInt()) {
                variableDebug.length = variable["length"].asInt();
            }

            pandaFunc.local_variable_debug.push_back(variableDebug);
        }
    }

    return RETURN_SUCCESS;
}

static int ParseSourceFileDebugInfo(const Json::Value &function, panda::pandasm::Function &pandaFunc)
{
    if (function.isMember("sourceFile") && function["sourceFile"].isString()) {
        pandaFunc.source_file = function["sourceFile"].asString();
    }

    if (g_debugModeEnabled) {
        if (function.isMember("sourceCode") && function["sourceCode"].isString()) {
            pandaFunc.source_code = function["sourceCode"].asString();
        }
    }

    return RETURN_SUCCESS;
}

static panda::pandasm::Function::CatchBlock ParsecatchBlock(const Json::Value &catch_block)
{
    panda::pandasm::Function::CatchBlock pandaCatchBlock;

    if (catch_block.isMember("tryBeginLabel") && catch_block["tryBeginLabel"].isString()) {
        pandaCatchBlock.try_begin_label = catch_block["tryBeginLabel"].asString();
    }

    if (catch_block.isMember("tryEndLabel") && catch_block["tryEndLabel"].isString()) {
        pandaCatchBlock.try_end_label = catch_block["tryEndLabel"].asString();
    }

    if (catch_block.isMember("catchBeginLabel") && catch_block["catchBeginLabel"].isString()) {
        pandaCatchBlock.catch_begin_label = catch_block["catchBeginLabel"].asString();
    }

    if (catch_block.isMember("catchBeginLabel") && catch_block["catchBeginLabel"].isString()) {
        pandaCatchBlock.catch_end_label = catch_block["catchBeginLabel"].asString();
    }

    return pandaCatchBlock;
}

static panda::pandasm::Function GetFunctionDefintion(const Json::Value &function)
{
    std::string funcName = "";
    if (function.isMember("name") && function["name"].isString()) {
        funcName = function["name"].asString();
    }

    std::string funcRetType = "";
    auto params = std::vector<panda::pandasm::Function::Parameter>();
    if (function.isMember("signature") && function["signature"].isObject()) {
        auto signature = function["signature"];
        if (signature.isMember("retType") && signature["retType"].isString()) {
            funcRetType = signature["retType"].asString();
        } else {
            funcRetType = "any";
        }

        Logd("parsing function: %s return type: %s \n", funcName.c_str(), funcRetType.c_str());

        if (signature.isMember("params") && signature["params"].isInt()) {
            auto paramNum = signature["params"].asUInt();
            for (Json::ArrayIndex i = 0; i < paramNum; ++i) {
                params.emplace_back(panda::pandasm::Type("any", 0), LANG_EXT);
            }
        }
    }

    int regsNum = 0;
    if (function.isMember("regs_num") && function["regs_num"].isInt()) {
        regsNum = function["regs_num"].asUInt();
    }

    auto pandaFunc = MakeFuncDefintion(funcName, funcRetType);
    pandaFunc.params = std::move(params);
    pandaFunc.regs_num = regsNum;

    return pandaFunc;
}

static void ParseFunctionMetadata(const Json::Value &function, panda::pandasm::Function &pandaFunc)
{
    if (function.isMember("metadata") && function["metadata"].isObject()) {
        auto metadata = function["metadata"];
        if (metadata.isMember("attribute") && metadata["attribute"].isString()) {
            std::string fnMetadataAttribute = metadata["attribute"].asString();
            if (fnMetadataAttribute.length() > 0) {
                pandaFunc.metadata->SetAttribute(fnMetadataAttribute);
            }
        }
    }
}

static void ParseFunctionInstructions(const Json::Value &function, panda::pandasm::Function &pandaFunc)
{
    if (function.isMember("ins") && function["ins"].isArray()) {
        auto ins = function["ins"];
        for (Json::ArrayIndex i = 0; i < ins.size(); ++i) {
            if (!ins[i].isObject()) {
                continue;
            }

            auto paIns = ParseInstruction(ins[i]);
            Logd("instruction:\t%s", paIns.ToString().c_str());
            pandaFunc.ins.push_back(paIns);
        }
    }
}

static void ParseFunctionLabels(const Json::Value &function, panda::pandasm::Function &pandaFunc)
{
    if (function.isMember("labels") && function["labels"].isArray()) {
        auto labels = function["labels"];
        for (Json::ArrayIndex i = 0; i < labels.size(); ++i) {
            auto labelName = labels[i].asString();
            auto pandaLabel = MakeLabel(labelName);

            Logd("label_name:\t%s", labelName.c_str());
            pandaFunc.label_table.emplace(labelName, pandaLabel);
        }
    }
}

static void ParseFunctionCatchTables(const Json::Value &function, panda::pandasm::Function &pandaFunc)
{
    if (function.isMember("catchTables") && function["catchTables"].isArray()) {
        auto catchTables = function["catchTables"];
        for (Json::ArrayIndex i = 0; i < catchTables.size(); ++i) {
            auto catchTable = catchTables[i];
            if (!catchTable.isObject()) {
                continue;
            }

            auto pandaCatchBlock = ParsecatchBlock(catchTable);
            pandaFunc.catch_blocks.push_back(pandaCatchBlock);
        }
    }
}

static void ParseFunctionCallType(const Json::Value &function, panda::pandasm::Function &pandaFunc)
{
    std::string funcName = "";
    if (function.isMember("name") && function["name"].isString()) {
        funcName = function["name"].asString();
    }
    if (funcName == "func_main_0") {
        return ;
    }

    uint32_t callType = 0;
    if (function.isMember("callType") && function["callType"].isInt()) {
        callType = function["callType"].asUInt();
    }
    panda::pandasm::AnnotationData callTypeAnnotation("_ESCallTypeAnnotation");
    std::string annotationName = "callType";
    panda::pandasm::AnnotationElement callTypeAnnotationElement(annotationName,
        std::make_unique<panda::pandasm::ScalarValue>(
        panda::pandasm::ScalarValue::Create<panda::pandasm::Value::Type::U32>(callType)));
    callTypeAnnotation.AddElement(std::move(callTypeAnnotationElement));
    const_cast<std::vector<panda::pandasm::AnnotationData>&>(pandaFunc.metadata->GetAnnotations()).push_back(
        std::move(callTypeAnnotation));
}

static panda::pandasm::Function ParseFunction(const Json::Value &function)
{
    auto pandaFunc = GetFunctionDefintion(function);
    ParseFunctionMetadata(function, pandaFunc);
    ParseFunctionInstructions(function, pandaFunc);
    // parsing variables debug info
    ParseVariablesDebugInfo(function, pandaFunc);
    // parsing source file debug info
    ParseSourceFileDebugInfo(function, pandaFunc);
    // parsing labels
    ParseFunctionLabels(function, pandaFunc);
    // parsing catch blocks
    ParseFunctionCatchTables(function, pandaFunc);
    // parsing call opt type
    ParseFunctionCallType(function, pandaFunc);

    return pandaFunc;
}

static void GenerateESCallTypeAnnotationRecord(panda::pandasm::Program &prog)
{
    auto callTypeAnnotationRecord = panda::pandasm::Record("_ESCallTypeAnnotation", LANG_EXT);
    callTypeAnnotationRecord.metadata->SetAttribute("external");
    callTypeAnnotationRecord.metadata->SetAccessFlags(panda::ACC_ANNOTATION);
    prog.record_table.emplace(callTypeAnnotationRecord.name, std::move(callTypeAnnotationRecord));
}

static void GenrateESModuleModeRecord(panda::pandasm::Program &prog, bool moduleMode)
{
    auto ecmaModuleModeRecord = panda::pandasm::Record("_ESModuleMode", LANG_EXT);
    ecmaModuleModeRecord.metadata->SetAccessFlags(panda::ACC_PUBLIC);

    auto modeField = panda::pandasm::Field(LANG_EXT);
    modeField.name = "isModule";
    modeField.type = panda::pandasm::Type("u8", 0);
    modeField.metadata->SetValue(panda::pandasm::ScalarValue::Create<panda::pandasm::Value::Type::U8>(
        static_cast<uint8_t>(moduleMode)));

    ecmaModuleModeRecord.field_list.emplace_back(std::move(modeField));

    prog.record_table.emplace(ecmaModuleModeRecord.name, std::move(ecmaModuleModeRecord));
}

static int ParseJson(const std::string &data, Json::Value &rootValue)
{
    JSONCPP_STRING errs;
    Json::CharReaderBuilder readerBuilder;
    bool res;

    std::unique_ptr<Json::CharReader> const jsonReader(readerBuilder.newCharReader());
    res = jsonReader->parse(data.c_str(), data.c_str() + data.length(), &rootValue, &errs);
    if (!res || !errs.empty()) {
        std::cerr << "ParseJson err. " << errs.c_str() << std::endl;
        return RETURN_FAILED;
    }

    if (!rootValue.isObject()) {
        std::cerr << "The parsed json data is not one object" << std::endl;
        return RETURN_FAILED;
    }

    return RETURN_SUCCESS;
}

static void ParseModuleMode(const Json::Value &rootValue, panda::pandasm::Program &prog)
{
    Logd("----------------parse module_mode-----------------");
    if (rootValue.isMember("module_mode") && rootValue["module_mode"].isBool()) {
        g_moduleModeEnabled = rootValue["module_mode"].asBool();
    }

    GenrateESModuleModeRecord(prog, g_moduleModeEnabled);
}

static void ParseLogEnable(const Json::Value &rootValue)
{
    if (rootValue.isMember("log_enabled") && rootValue["log_enabled"].isBool()) {
        g_debugLogEnabled = rootValue["log_enabled"].asBool();
    }
}

static void ParseDebugMode(const Json::Value &rootValue)
{
    Logd("-----------------parse debug_mode-----------------");
    if (rootValue.isMember("debug_mode") && rootValue["debug_mode"].isBool()) {
        g_debugModeEnabled = rootValue["debug_mode"].asBool();
    }
}

static void ParseOptLevel(const Json::Value &rootValue)
{
    Logd("-----------------parse opt level-----------------");
    if (rootValue.isMember("opt_level") && rootValue["opt_level"].isInt()) {
        g_optLevel = rootValue["opt_level"].asInt();
    }
    if (g_debugModeEnabled) {
        g_optLevel = 0;
    }
}

static void ParseOptLogLevel(const Json::Value &rootValue)
{
    Logd("-----------------parse opt log level-----------------");
    if (rootValue.isMember("opt_log_level") && rootValue["opt_log_level"].isString()) {
        g_optLogLevel = rootValue["opt_log_level"].asString();
    }
}

static void ReplaceAllDistinct(std::string &str, const std::string &oldValue, const std::string &newValue)
{
    for (std::string::size_type pos(0); pos != std::string::npos; pos += newValue.length()) {
        if ((pos = str.find(oldValue, pos)) != std::string::npos) {
            str.replace(pos, oldValue.length(), newValue);
        } else {
            break;
        }
    }
}

static void ParseOptions(const Json::Value &rootValue, panda::pandasm::Program &prog)
{
    GenerateESCallTypeAnnotationRecord(prog);
    ParseModuleMode(rootValue, prog);
    ParseLogEnable(rootValue);
    ParseDebugMode(rootValue);
    ParseOptLevel(rootValue);
    ParseOptLogLevel(rootValue);
}

static void ParseSingleFunc(const Json::Value &rootValue, panda::pandasm::Program &prog)
{
    auto function = ParseFunction(rootValue["func_body"]);
    prog.function_table.emplace(function.name.c_str(), std::move(function));
}

static void ParseSingleRec(const Json::Value &rootValue, panda::pandasm::Program &prog)
{
    auto record = ParseRecord(rootValue["rec_body"]);
    prog.record_table.emplace(record.name.c_str(), std::move(record));
}

static void ParseSingleStr(const Json::Value &rootValue, panda::pandasm::Program &prog)
{
    prog.strings.insert(ParseString(rootValue["string"].asString()));
}

static void ParseSingleLiteralBuf(const Json::Value &rootValue, panda::pandasm::Program &prog)
{
    std::vector<panda::pandasm::LiteralArray::Literal> literalArray;
    auto literalBuffer = rootValue["literalArray"];
    auto literals = literalBuffer["literalBuffer"];
    for (Json::ArrayIndex i = 0; i < literals.size(); ++i) {
        ParseLiteral(literals[i], literalArray);
    }

    auto literalarrayInstance = panda::pandasm::LiteralArray(literalArray);
    prog.literalarray_table.emplace(std::to_string(g_literalArrayCount++), std::move(literalarrayInstance));
}

static int ParseSmallPieceJson(const std::string &subJson, panda::pandasm::Program &prog)
{
    Json::Value rootValue;
    if (ParseJson(subJson, rootValue)) {
        std::cerr <<" Fail to parse json by JsonCPP" << std::endl;
        return RETURN_FAILED;
    }
    int type = -1;
    if (rootValue.isMember("type") && rootValue["type"].isInt()) {
        type = rootValue["type"].asInt();
    }
    switch (type) {
        case JsonType::FUNCTION: {
            if (rootValue.isMember("func_body") && rootValue["func_body"].isObject()) {
                ParseSingleFunc(rootValue, prog);
            }
            break;
        }
        case JsonType::RECORD: {
            if (rootValue.isMember("rec_body") && rootValue["rec_body"].isObject()) {
                ParseSingleRec(rootValue, prog);
            }
            break;
        }
        case JsonType::STRING: {
            if (rootValue.isMember("string") && rootValue["string"].isString()) {
                ParseSingleStr(rootValue, prog);
            }
            break;
        }
        case JsonType::LITERALBUFFER: {
            if (rootValue.isMember("literalArray") && rootValue["literalArray"].isObject()) {
                ParseSingleLiteralBuf(rootValue, prog);
            }
            break;
        }
        case JsonType::OPTIONS: {
            ParseOptions(rootValue, prog);
            break;
        }
        default: {
            std::cerr << "Unreachable json type: " << type << std::endl;
            return RETURN_FAILED;
        }
    }
    return RETURN_SUCCESS;
}

static bool ParseData(const std::string &data, panda::pandasm::Program &prog)
{
    if (data.empty()) {
        std::cerr << "the stringify json is empty" << std::endl;
        return false;
    }

    size_t pos = 0;
    bool isStartDollar = true;

    for (size_t idx = 0; idx < data.size(); idx++) {
        if (data[idx] == '$' && data[idx - 1] != '#') {
            if (isStartDollar) {
                pos = idx + 1;
                isStartDollar = false;
                continue;
            }

            std::string subJson = data.substr(pos, idx - pos);
            ReplaceAllDistinct(subJson, "#$", "$");
            if (ParseSmallPieceJson(subJson, prog)) {
                std::cerr << "fail to parse stringify json" << std::endl;
                return false;
            }
            isStartDollar = true;
        }
    }

    return true;
}

static bool GenerateProgram(const std::string &data, std::string output,
                           panda::PandArg<int> optLevelArg,
                           panda::PandArg<std::string> optLogLevelArg)
{
    panda::pandasm::Program prog = panda::pandasm::Program();
    prog.lang = panda::pandasm::extensions::Language::ECMASCRIPT;
    if (!ParseData(data, prog)) {
        std::cerr << "fail to parse Data!" << std::endl;
        return false;
    }

    Logd("parsing done, calling pandasm\n");

#ifdef ENABLE_BYTECODE_OPT
    if (g_optLevel != O_LEVEL0 || optLevelArg.GetValue() != O_LEVEL0) {
        std::string optLogLevel = (optLogLevelArg.GetValue() != "error") ? optLogLevelArg.GetValue() : g_optLogLevel;

        const uint32_t componentMask = panda::Logger::Component::CLASS2PANDA | panda::Logger::Component::ASSEMBLER |
                                    panda::Logger::Component::BYTECODE_OPTIMIZER | panda::Logger::Component::COMPILER;
        panda::Logger::InitializeStdLogging(panda::Logger::LevelFromString(optLogLevel), componentMask);

        bool emitDebugInfo = true;
        std::map<std::string, size_t> stat;
        std::map<std::string, size_t> *statp = nullptr;
        panda::pandasm::AsmEmitter::PandaFileToPandaAsmMaps maps {};
        panda::pandasm::AsmEmitter::PandaFileToPandaAsmMaps* mapsp = &maps;

        if (!panda::pandasm::AsmEmitter::Emit(output.c_str(), prog, statp, mapsp, emitDebugInfo)) {
            std::cerr << "Failed to emit binary data: " << panda::pandasm::AsmEmitter::GetLastError() << std::endl;
            return false;
        }
        panda::bytecodeopt::OptimizeBytecode(&prog, mapsp, output.c_str(), true);
        if (!panda::pandasm::AsmEmitter::Emit(output.c_str(), prog, statp, mapsp, emitDebugInfo)) {
            std::cerr << "Failed to emit binary data: " << panda::pandasm::AsmEmitter::GetLastError() << std::endl;
            return false;
        }
        return true;
    }
#endif

    if (!panda::pandasm::AsmEmitter::Emit(output.c_str(), prog, nullptr)) {
        std::cerr << "Failed to emit binary data" << std::endl;
        return false;
    }

    Logd("Successfully generated: %s\n", output.c_str());
    return true;
}

static bool HandleJsonFile(const std::string &input, std::string &data)
{
    auto inputAbs = panda::os::file::File::GetAbsolutePath(input);
    if (!inputAbs) {
        std::cerr << "Input file does not exist" << std::endl;
        return false;
    }
    auto fpath = inputAbs.Value();
    if (panda::os::file::File::IsRegularFile(fpath) == false) {
        std::cerr << "Input must be either a regular file or a directory" << std::endl;
        return false;
    }

    std::ifstream file;
    file.open(fpath);
    if (file.fail()) {
        std::cerr << "failed to open:" << fpath << std::endl;
        return false;
    }

    file.seekg(0, std::ios::end);
    size_t fileSize = file.tellg();
    file.seekg(0, std::ios::beg);
    auto buf = std::vector<char>(fileSize);
    file.read(reinterpret_cast<char *>(buf.data()), fileSize);
    data = buf.data();
    buf.clear();
    file.close();
    Logd(data.c_str());
    Logd("----------------------------------");

    return true;
}

static bool ReadFromPipe(std::string &data)
{
    const size_t bufSize = 4096;
    const size_t fd = 3;

    char buff[bufSize + 1];
    int ret = 0;

    while ((ret = read(fd, buff, bufSize)) != 0) {
        if (ret < 0) {
            std::cerr << "Read pipe error" << std::endl;
            return false;
        }
        buff[ret] = '\0';
        data += buff;
    }

    if (data.empty()) {
        std::cerr << "Nothing has been read from pipe" << std::endl;
        return false;
    }

    Logd("finish reading from pipe");
    return true;
}

int main(int argc, const char *argv[])
{
    panda::PandArgParser argParser;
    panda::Span<const char *> sp(argv, argc);
    panda::ts2abc::Options options(sp[0]);
    options.AddOptions(&argParser);

    panda::PandArg<bool> sizeStatArg("size-stat", false, "Print panda file size statistic");
    argParser.Add(&sizeStatArg);
    panda::PandArg<bool> helpArg("help", false, "Print this message and exit");
    argParser.Add(&helpArg);
    panda::PandArg<int> optLevelArg("opt-level", 0,
        "Optimization level. Possible values: [0, 1, 2]. Default: 0\n    0: no optimizations\n    "
        "1: basic bytecode optimizations, including valueNumber, lowering, constantResolver, regAccAllocator\n    "
        "2: (experimental optimizations): Sta/Lda Peephole, Movi/Lda Peephole, Register Coalescing");
    argParser.Add(&optLevelArg);
    panda::PandArg<std::string> optLogLevelArg("opt-log-level", "error",
        "Optimization log level. Possible values: ['error', 'debug', 'info', 'fatal']. Default: 'error' ");
    argParser.Add(&optLogLevelArg);
    panda::PandArg<bool> bcVersionArg("bc-version", false, "Print ark bytecode version");
    argParser.Add(&bcVersionArg);
    panda::PandArg<bool> bcMinVersionArg("bc-min-version", false, "Print ark bytecode minimum supported version");
    argParser.Add(&bcMinVersionArg);
    panda::PandArg<bool> compileByPipeArg("compile-by-pipe", false, "Compile a json file that is passed by pipe");
    argParser.Add(&compileByPipeArg);

    argParser.EnableTail();

    panda::PandArg<std::string> tailArg1("ARG_1", "", "Path to input(json file) or path to output(ark bytecode)" \
        " when 'compile-by-pipe' enabled");
    panda::PandArg<std::string> tailArg2("ARG_2", "", "Path to output(ark bytecode) or ignore when 'compile-by-pipe'" \
        " enabled");
    argParser.PushBackTail(&tailArg1);
    argParser.PushBackTail(&tailArg2);

    if (!argParser.Parse(argc, argv)) {
        std::cerr << argParser.GetErrorString();
        std::cerr << argParser.GetHelpString();
        return RETURN_FAILED;
    }

    std::string usage = "Usage: ts2abc [OPTIONS]... [ARGS]...";
    if (helpArg.GetValue()) {
        std::cout << usage << std::endl;
        std::cout << argParser.GetHelpString();
        return RETURN_SUCCESS;
    }

    if (bcVersionArg.GetValue() || bcMinVersionArg.GetValue()) {
        std::string version = bcVersionArg.GetValue() ? panda::panda_file::GetVersion(panda::panda_file::version) :
            panda::panda_file::GetVersion(panda::panda_file::minVersion);
        std::cout << version << std::endl;
        return RETURN_SUCCESS;
    }

    if ((optLevelArg.GetValue() < O_LEVEL0) || (optLevelArg.GetValue() > O_LEVEL2)) {
        std::cerr << "Incorrect optimization level value" << std::endl;
        std::cerr << usage << std::endl;
        std::cerr << argParser.GetHelpString();
        return RETURN_FAILED;
    }

    std::string input, output;
    std::string data = "";

    if (!compileByPipeArg.GetValue()) {
        input = tailArg1.GetValue();
        output = tailArg2.GetValue();
        if (input.empty() || output.empty()) {
            std::cerr << "Incorrect args number" << std::endl;
            std::cerr << "Usage example: ts2abc test.json test.abc\n" << std::endl;
            std::cerr << usage << std::endl;
            std::cerr << argParser.GetHelpString();
            return RETURN_FAILED;
        }
        if (!HandleJsonFile(input, data)) {
            return RETURN_FAILED;
        }
    } else {
        output = tailArg1.GetValue();
        if (output.empty()) {
            std::cerr << usage << std::endl;
            std::cerr << argParser.GetHelpString();
            return RETURN_FAILED;
        }
        if (!ReadFromPipe(data)) {
            return RETURN_FAILED;
        }
    }

    if (!GenerateProgram(data, output, optLevelArg, optLogLevelArg)) {
        std::cerr << "call GenerateProgram fail" << std::endl;
        return RETURN_FAILED;
    }

    return RETURN_SUCCESS;
}
