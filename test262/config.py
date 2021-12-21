#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Copyright (c) 2021 Huawei Device Co., Ltd.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Description: Execute 262 test suite configuration file
"""


import os

DATA_DIR = os.path.join("test262", "data")
ESHOST_DIR = os.path.join("test262", "eshost")
HARNESS_DIR = os.path.join("test262", "harness")

BASE_OUT_DIR = os.path.join("out", "test262")

CUR_FILE_DIR = os.path.dirname(__file__)
CODE_ROOT = os.path.abspath(os.path.join(CUR_FILE_DIR, "../../.."))
ARK_DIR = f"{CODE_ROOT}/out/hi3516dv300/clang_x64/ark/ark"
ICUI_DIR = f"{CODE_ROOT}/out/hi3516dv300/clang_x64/global/i18n_standard"
LLVM_DIR = f"{CODE_ROOT}/prebuilts/clang/ohos/linux-x86_64/llvm/lib/"
ARK_JS_RUNTIME_DIR = f"{CODE_ROOT}/out/hi3516dv300/clang_x64/ark/ark_js_runtime"

# " mode_type": {
#     "1": "only default",
#     "2": "only strict mode",
#     "3": "both default and strict mode"
# }
DEFAULT_MODE = 2

TEST_ES5_DIR = os.path.join(DATA_DIR, "test_es51")
TEST_ES2015_DIR = os.path.join(DATA_DIR, "test_es2015")
TEST_CI_DIR = os.path.join(DATA_DIR, "test_CI")

DEFAULT_ARK_FRONTEND_TOOL = os.path.join(ARK_DIR, "build", "src", "index.js")
DEFAULT_ARK_TOOL = os.path.join(ARK_JS_RUNTIME_DIR, "ark_js_vm")
DEFAULT_LIBS_DIR = f"{ARK_DIR}:{ICUI_DIR}:{LLVM_DIR}:{ARK_JS_RUNTIME_DIR}"

DEFAULT_HOST_TYPE = "panda"
DEFAULT_HOST_PATH = "python3"
DEFAULT_THREADS = 8
DEFAULT_OTHER_ARGS = "--saveCompiledTests"
TEST262_RUNNER_SCRIPT = os.path.join(HARNESS_DIR, "bin", "run.js")
DEFAULT_TIMEOUT = 60000


ES5_LIST_FILE = os.path.join("test262", "es5_tests.txt")
ES2015_LIST_FILE = os.path.join("test262", "es2015_tests.txt")
CI_LIST_FILE = os.path.join("test262", "CI_tests.txt")
MODULE_FILES_LIST = os.path.join("test262", "module_tests.txt")

TEST262_GIT_HASH = "9ca13b12728b7e0089c7eb03fa2bd17f8abe297f"
HARNESS_GIT_HASH = "9c499f028eb24e67781435c0bb442e00343eb39d"
ESHOST_GIT_HASH = "fa2d4d27d9d6152002bdef36ee2d17e98b886268"
ESNEXT_GIT_HASH = "281eb10b2844929a7c0ac04527f5b42ce56509fd"

TEST262_GIT_URL = "https://gitee.com/Han00000000/test262.git"
ESHOST_GIT_URL = "https://gitee.com/Han00000000/eshost.git"
HARNESS_GIT_URL = "https://gitee.com/Han00000000/test262-harness.git"

SKIP_LIST_FILE = os.path.join("test262", "skip_tests.json")
ALL_SKIP_TESTS = []

ARK_FRONTEND_LIST = [
    "ts2panda",
    "es2panda"
]
DEFAULT_ARK_FRONTEND = ARK_FRONTEND_LIST[0]

ARK_ARCH_LIST = [
    "x64",
    "aarch64",
    "arm"
]

DEFAULT_ARK_ARCH = ARK_ARCH_LIST[0]
