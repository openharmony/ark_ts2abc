import os
import json
TS_GIT_PATH = 'https://gitee.com/zhangrengao1/TypeScript.git'
TS_TAG = "v4.3.5"

EXPECT_DIR = os.path.join("testTs", "expect")
OUT_DIR = os.path.join("out")
OUT_TEST_DIR = os.path.join("out", "testTs")
OUT_RESULT_FILE = os.path.join("out", "testTs", "result.txt")
TEST_DIR = os.path.join("testTs")
TS_CASES_DIR = os.path.join(".","testTs", "test")
SKIP_FILE_PATH = os.path.join("testTs", "skip_tests.json")
IMPORT_FILE_PATH = os.path.join("testTs", "import_tests.json")
CUR_FILE_DIR = os.path.dirname(__file__)
CODE_ROOT = os.path.abspath(os.path.join(CUR_FILE_DIR, "../../.."))
ARK_DIR = f"{CODE_ROOT}/out/hi3516dv300/clang_x64/ark/ark"
# ARK_DIR = f"{CODE_ROOT}/out/ohos-arm-release/clang_x64/obj/ark"
WORK_PATH = f'{CODE_ROOT}/ark/ts2abc'

DEFAULT_ARK_FRONTEND_TOOL = os.path.join(ARK_DIR, "build", "src", "index.js")
# DEFAULT_ARK_FRONTEND_TOOL = os.path.join(ARK_DIR, "ts2abc", "ts2panda", "build", "src", "index.js")

TEST_PATH = os.sep.join([".", "testTs", "test"])
OUT_PATH = os.sep.join([".", "out", "testTs"])
EXPECT_PATH = os.sep.join([".", "testTs", "expect"])
TS_EXT = ".ts"
TXT_EXT = ".txt"
ABC_EXT = ".abc"
f = open(IMPORT_FILE_PATH,'r')
content = f.read()
f.close()
IMPORT_TEST = json.loads(content)