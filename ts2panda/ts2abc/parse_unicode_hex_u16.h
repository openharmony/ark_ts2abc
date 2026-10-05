/*
 * Copyright (c) 2026 Huawei Device Co., Ltd.
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

#ifndef TS2ABC_PARSE_UNICODE_HEX_U16_H
#define TS2ABC_PARSE_UNICODE_HEX_U16_H

#include <charconv>
#include <cstdint>
#include <string_view>
#include <system_error>

namespace panda::ts2abc {
inline bool ParseUnicodeHexU16(std::string_view text, uint16_t &out)
{
    if (text.empty()) {
        return false;
    }
    uint16_t value = 0;
    auto result = std::from_chars(text.data(), text.data() + text.size(), value, 16);
    if (result.ec != std::errc() || result.ptr != text.data() + text.size()) {
        return false;
    }
    out = value;
    return true;
}
} // namespace panda::ts2abc
#endif // TS2ABC_PARSE_UNICODE_HEX_U16_H
