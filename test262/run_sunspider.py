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

Description: Use ark to execute js files
"""

import argparse
import os
import platform
import sys
import signal
import subprocess
from utils import *
from config import *


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ark-tool',
                        default=DEFAULT_ARK_TOOL,
                        required=False,
                        help="ark's binary tool")
    parser.add_argument('--ark-frontend-tool',
                        default=DEFAULT_ARK_FRONTEND_TOOL,
                        required=False,
                        help="ark frontend conversion tool")
    parser.add_argument("--libs-dir",
                        default=DEFAULT_LIBS_DIR,
                        required=False,
                        help="The path collection of dependent so has been divided by':'")
    parser.add_argument("--js-file",
                        required=True,
                        help="js file")
    parser.add_argument('--ark-frontend',
                        default=DEFAULT_ARK_FRONTEND,
                        required=False,
                        nargs='?', choices=ARK_FRONTEND_LIST, type=str,
                        help="Choose one of them")
    parser.add_argument('--ark-arch',
                        default=DEFAULT_ARK_ARCH,
                        required=False,
                        nargs='?', choices=ARK_ARCH_LIST, type=str,
                        help="Choose one of them")
    parser.add_argument('--ark-arch-root',
                        default=DEFAULT_ARK_ARCH,
                        required=False,
                        help="the root path for qemu-aarch64 or qemu-arm")
    arguments = parser.parse_args()
    return arguments


ARK_ARGS = "--gc-type=epsilon"
ICU_PATH = f"--icu-data-path={CODE_ROOT}/third_party/icu/ohos_icu4j/data"
ARK_TOOL = DEFAULT_ARK_TOOL
ARK_FRONTEND_TOOL = DEFAULT_ARK_FRONTEND_TOOL
LIBS_DIR = DEFAULT_LIBS_DIR
ARK_FRONTEND = DEFAULT_ARK_FRONTEND
ARK_ARCH = DEFAULT_ARK_ARCH


def output(retcode, msg):
    if retcode == 0:
        if msg != '':
            print(str(msg))
    elif retcode == -6:
        sys.stderr.write("Aborted (core dumped)")
    elif retcode == -4:
        sys.stderr.write("Aborted (core dumped)")
    elif retcode == -11:
        sys.stderr.write("Segmentation fault (core dumped)")
    elif msg != '':
        sys.stderr.write(str(msg))
    else:
        sys.stderr.write("Unknown Error: " + str(retcode))


def exec_command(cmd_args, timeout=DEFAULT_TIMEOUT):
    proc = subprocess.Popen(cmd_args,
                            stderr=subprocess.PIPE,
                            stdout=subprocess.PIPE,
                            close_fds=True,
                            start_new_session=True)
    cmd_string = " ".join(cmd_args)
    code_format = 'utf-8'
    if platform.system() == "Windows":
        code_format = 'gbk'

    try:
        (msg, errs) = proc.communicate(timeout=timeout)
        ret_code = proc.poll()

        if errs.decode(code_format, 'ignore') != '':
            output(1, errs.decode(code_format, 'ignore'))
            return 1

        if ret_code and ret_code != 1:
            code = ret_code
            msg = f"Command {cmd_string}: \n"
            msg += f"error: {str(errs.decode(code_format,'ignore'))}"
        else:
            code = 0
            msg = str(msg.decode(code_format, 'ignore'))

    except subprocess.TimeoutExpired:
        proc.kill()
        proc.terminate()
        os.kill(proc.pid, signal.SIGTERM)
        code = 1
        msg = f"Timeout:'{cmd_string}' timed out after' {str(timeout)} seconds"
    except Exception as err:
        code = 1
        msg = f"{cmd_string}: unknown error: {str(err)}"
    output(code, msg)
    return code


class ArkProgram():
    def __init__(self, args):
        self.args = args
        self.ark_tool = ARK_TOOL
        self.ark_frontend_tool = ARK_FRONTEND_TOOL
        self.libs_dir = LIBS_DIR
        self.ark_frontend = ARK_FRONTEND
        self.js_file = ""
        self.arch = ARK_ARCH
        self.arch_root = ""

    def proce_parameters(self):
        if self.args.ark_tool:
            self.ark_tool = self.args.ark_tool

        if self.args.ark_frontend_tool:
            self.ark_frontend_tool = self.args.ark_frontend_tool

        if self.args.libs_dir:
            self.libs_dir = self.args.libs_dir

        if self.args.ark_frontend:
            self.ark_frontend = self.args.ark_frontend

        self.js_file = self.args.js_file

        self.arch = self.args.ark_arch

        self.arch_root = self.args.ark_arch_root

    def gen_abc(self):
        js_file = self.js_file
        file_name_pre = os.path.splitext(js_file)[0]
        file_name = os.path.basename(js_file)
        out_file = f"{file_name_pre}.abc"
        mod_opt_index = 0
        cmd_args = []
        frontend_tool = self.ark_frontend_tool
        if self.ark_frontend == ARK_FRONTEND_LIST[0]:
            mod_opt_index = 3
            cmd_args = ['node', '--expose-gc', frontend_tool,
                        js_file, '-o', out_file]
        elif self.ark_frontend == ARK_FRONTEND_LIST[1]:
            mod_opt_index = 1
            cmd_args = [frontend_tool, '-c',
                        '-e', 'js', '-o', out_file, '-i', js_file]

        if file_name in MODULE_FILES_LIST:
            cmd_args.insert(mod_opt_index, "-m")

        retcode = exec_command(cmd_args)
        return retcode

    def execute(self):

        os.environ["LD_LIBRARY_PATH"] = self.libs_dir
        file_name_pre = os.path.splitext(self.js_file)[0]
        cmd_args = []
        if self.arch == ARK_ARCH_LIST[1]:
            qemu_tool = "qemu-aarch64"
            qemu_arg1 = "-L"
            qemu_arg2 = self.arch_root
            cmd_args = [qemu_tool, qemu_arg1, qemu_arg2, self.ark_tool,
                        ARK_ARGS, ICU_PATH,
                        f'{file_name_pre}.abc']
        elif self.arch == ARK_ARCH_LIST[2]:
            qemu_tool = "qemu-arm"
            qemu_arg1 = "-L"
            qemu_arg2 =  self.arch_root
            cmd_args = [qemu_tool, qemu_arg1, qemu_arg2, self.ark_tool,
                        ARK_ARGS, ICU_PATH,
                        f'{file_name_pre}.abc']
        elif self.arch == ARK_ARCH_LIST[0]:
            cmd_args = [self.ark_tool, ARK_ARGS, ICU_PATH,
                        f'{file_name_pre}.abc']

        retcode = exec_command(cmd_args)
        return retcode

    def is_legal_frontend(self):
        if self.ark_frontend not in ARK_FRONTEND_LIST:
            sys.stderr.write("Wrong ark front-end option")
            return False
        return True

    def execute_ark(self):
        self.proce_parameters()
        if not self.is_legal_frontend():
            return
        if self.gen_abc():
            return
        self.execute()


def main():
    args = parse_args()

    ark = ArkProgram(args)
    ark.execute_ark()


if __name__ == "__main__":
    sys.exit(main())
