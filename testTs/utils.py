import os
import datetime
import shutil
import difflib
from config import *
import subprocess
import json


#执行终端命令
def command_os(order):
    cmd = order
    os.system(cmd)

#创建文件夹   
def mk_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)
    
#切换分支(git_brash:分支)
def git_checkout(git_brash):
    command_os(f'git checkout {git_brash}')

#删除文件夹(空文件夹与非空文件夹)
def remove_dir(path):
    if os.path.exists(path):
        shutil.rmtree(path)

#删除文件
def remove_file(path):
    if os.path.exists(path):
        os.remove(path)

#清空文件内容（path：文件路径）
def clean_file(path):
    f = open(path,'w')
    f.write('')
    f.close()

#读取文件内容(全部)
def read_file(path):
    try:
        f =open(path,'r')
        content = f.readlines()
        f.close()
    except:
        content = []
    
    return content

#写入文件，覆盖之前内容
def write_file(path,content):
    f = open(path,'w')
    f.write(content)
    f.close()

#追加写入文件（path：文件路径，content：写入内容）
def write_append(path,content):
    f = open(path,'a+')
    f.write(content)
    f.close()

def move_file(srcfile, dstfile):
    subprocess.getstatusoutput("mv %s %s" % (srcfile, dstfile))

def git_clone(git_url, code_dir):
    cmd = ['git', 'clone', git_url, code_dir]
    ret = run_cmd_cwd(cmd)
    assert not ret, f"\n error: Cloning '{git_url}' failed."

def git_checkout(git_bash, cwd):
    cmd = ['git', 'checkout', git_bash]
    ret = run_cmd_cwd(cmd, cwd)
    assert not ret, f"\n error: git checkout '{git_bash}' failed."


def git_apply(patch_file, cwd):
    cmd = ['git', 'apply', patch_file]
    ret = run_cmd_cwd(cmd, cwd)
    assert not ret, f"\n error: Failed to apply '{patch_file}'"


def git_clean(cwd):
    cmd = ['git', 'checkout', '--', '.']
    run_cmd_cwd(cmd, cwd)

#输出当前时间(可用于计算程序运行时长)
def current_time():
    return datetime.datetime.now()

class Command():
    def __init__(self, cmd):
        self.cmd = cmd

    def run(self):
        LOGGING.debug("command: " + self.cmd)
        out = os.popen(self.cmd).read()
        LOGGING.info(out)
        return out

def run_cmd(command):
    cmd = Command(command)
    return cmd.run()

def excuting_npm_install(args):
    ark_frontend_tool = os.path.join(DEFAULT_ARK_FRONTEND_TOOL)
    if args.ark_frontend_tool:
        ark_frontend_tool = os.path.join(args.ark_frontend_tool)

    ts2abc_build_dir = os.path.join(os.path.dirname(
        os.path.realpath(ark_frontend_tool)), "..")
    if os.path.exists(os.path.join(ts2abc_build_dir, "package.json")):
        npm_install(ts2abc_build_dir)
    elif os.path.exists(os.path.join(ts2abc_build_dir, "..", "package.json")):
        npm_install(os.path.join(ts2abc_build_dir, ".."))
        
def npm_install(cwd):
    try:
        os.chdir(cwd)
        command_os('npm install')
        os.chdir(WORK_PATH)
    except Exception as e:
        print(e)