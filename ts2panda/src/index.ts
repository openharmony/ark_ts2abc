/*
 * Copyright (c) 2022 Huawei Device Co., Ltd.
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

import * as path from "path";
import * as ts from "typescript";
import * as fs from "fs";
import { CmdOptions } from "./cmdOptions";
import { CompilerDriver } from "./compilerDriver";
import * as diag from "./diagnostic";
import * as jshelpers from "./jshelpers";
import { LOGE } from "./log";
import { setGlobalDeclare, setGlobalStrict } from "./strictMode";
import { TypeChecker } from "./typeChecker";
import { setPos, isBase64Str } from "./base/util";

function checkIsGlobalDeclaration(sourceFile: ts.SourceFile) {
    for (let statement of sourceFile.statements) {
        if (statement.modifiers) {
            for (let modifier of statement.modifiers) {
                if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
                    return false;
                }
            }
        } else if (statement.kind === ts.SyntaxKind.ExportAssignment) {
            return false;
        } else if (statement.kind === ts.SyntaxKind.ImportKeyword || statement.kind === ts.SyntaxKind.ImportDeclaration) {
            return false;
        }
    }
    return true;
}

function generateDTs(node: ts.SourceFile, options: ts.CompilerOptions) {
    let outputBinName = getOutputBinName(node);
    let compilerDriver = new CompilerDriver(outputBinName);
    setGlobalStrict(jshelpers.isEffectiveStrictModeSourceFile(node, options));
    compilerDriver.compile(node);
    compilerDriver.showStatistics();
}

function main(fileNames: string[], options: ts.CompilerOptions) {
    let program = ts.createProgram(fileNames, options);
    let typeChecker = TypeChecker.getInstance();
    typeChecker.setTypeChecker(program.getTypeChecker());

    if (CmdOptions.needRecordDtsType()) {
        for (let sourceFile of program.getSourceFiles()) {
            if (sourceFile.isDeclarationFile && !program.isSourceFileDefaultLibrary(sourceFile)) {
                setGlobalDeclare(checkIsGlobalDeclaration(sourceFile));
                generateDTs(sourceFile, options);
            }
        }
    }

    let emitResult = program.emit(
        undefined,
        undefined,
        undefined,
        undefined,
        {
            before: [
                // @ts-ignore
                (ctx: ts.TransformationContext) => {
                    return (node: ts.SourceFile) => {
                        let outputBinName = getOutputBinName(node);
                        let compilerDriver = new CompilerDriver(outputBinName);
                        compilerDriver.compileForSyntaxCheck(node);
                        return node;
                    }
                }
            ],
            after: [
                // @ts-ignore
                (ctx: ts.TransformationContext) => {
                    return (node: ts.SourceFile) => {
                        if (ts.getEmitHelpers(node)) {
                            let newStatements = [];
                            ts.getEmitHelpers(node)?.forEach(
                                item => {
                                    let emitHelperSourceFile = ts.createSourceFile(node.fileName, <string>item.text, options.target!, true, ts.ScriptKind.JS);
                                    emitHelperSourceFile.statements.forEach(emitStatement => {
                                        let emitNode = setPos(emitStatement);
                                        newStatements.push(emitNode);
                                    });
                                }
                            )
                            newStatements.push(...node.statements);
                            node = ts.factory.updateSourceFile(node, newStatements);
                        }
                        let outputBinName = getOutputBinName(node);
                        let compilerDriver = new CompilerDriver(outputBinName);
                        setGlobalStrict(jshelpers.isEffectiveStrictModeSourceFile(node, options));
                        compilerDriver.compile(node);
                        compilerDriver.showStatistics();
                        return node;
                    }
                }
            ]
        }
    );

    let allDiagnostics = ts
        .getPreEmitDiagnostics(program)
        .concat(emitResult.diagnostics);

    allDiagnostics.forEach(diagnostic => {
        diag.printDiagnostic(diagnostic);
    });
}

function getOutputBinName(node: ts.SourceFile) {
    let outputBinName = CmdOptions.getOutputBinName();
    let fileName = node.fileName.substring(0, node.fileName.lastIndexOf('.'));
    let inputFileName = CmdOptions.getInputFileName();
    if (/^win/.test(require('os').platform())) {
        var inputFileTmps = inputFileName.split(path.sep);
        inputFileName = path.posix.join(...inputFileTmps);
    }

    if (fileName != inputFileName) {
        outputBinName = fileName + ".abc";
    }
    return outputBinName;
}

function getDtsFiles(libDir: string): string[] {
    let dtsFiles:string[] = [];
    function finDtsFile(dir){
        let files = fs.readdirSync(dir);
        files.forEach(function (item, _) {
            let fPath = path.join(dir,item);
            let stat = fs.statSync(fPath);
            if(stat.isDirectory() === true) {
                finDtsFile(fPath);
            }
            if (stat.isFile() === true && item.endsWith(".d.ts") === true) {
                dtsFiles.push(fPath);
            }
        });
    }
    finDtsFile(libDir);
    return dtsFiles;
}

function parseWatch(files: string[]): string {
    let watchArgs = CmdOptions.getAddWatchArgs();
    let ideIputStr = watchArgs[0];
    if (watchArgs.length != 2 || !isBase64Str(ideIputStr)) {
        throw new Error("Incorrect args' format or not enter base64 string in watch mode.");
    }
    let fragmentSep = "\\n";
    let originExpre = Buffer.from(ideIputStr, 'base64').toString();
    let expressiones = originExpre.split(fragmentSep);
    let jsFileName = watchArgs[1] + path.sep + "watch_expres.js";
    let abcFileName = watchArgs[1] + path.sep + "watch_expres.abc";
    let writeFlag: Boolean = false;
    for (let index = 0; index < expressiones.length; index++) {
        let expreLine = expressiones[index].trim();
        if (expreLine != "") {
            if (!writeFlag) {
                fs.writeFileSync(jsFileName, expreLine + "\n");
                writeFlag = true;
            } else {
                fs.appendFileSync(jsFileName, expreLine + "\n");
            }
        }
    }
    files.unshift(jsFileName);
    return abcFileName;
}

namespace Compiler {
    export namespace Options {
        export let Default: ts.CompilerOptions = {
            outDir: "../tmp/build",
            allowJs: true,
            noEmitOnError: true,
            noImplicitAny: true,
            target: ts.ScriptTarget.ES2017,
            module: ts.ModuleKind.ES2015,
            strictNullChecks: true,
            skipLibCheck: true,
            alwaysStrict: true
        };
    }
}

function run(args: string[], options?: ts.CompilerOptions): void {
    let parsed = CmdOptions.parseUserCmd(args);
    if (!parsed) {
        return;
    }

    if (options) {
        if (!((parsed.options.project) || (parsed.options.build))) {
            parsed.options = options;
        }
    }
    try {
        let files: string[] = parsed.fileNames;
        let abcFileName: string = '';
        if (CmdOptions.isWatchMode()) {
            abcFileName = parseWatch(files);
        }
        main(files.concat(CmdOptions.getIncludedFiles()), parsed.options);
        if (CmdOptions.isWatchMode() && !CmdOptions.isAssemblyMode()) {
            process.on('exit', () => {
                let base64data = fs.readFileSync(abcFileName);
                let watchResStr = Buffer.from(base64data).toString('base64');
                console.log(watchResStr);
            });
        }
    } catch (err) {
        if (err instanceof diag.DiagnosticError) {
            let diagnostic = diag.getDiagnostic(err.code);
            if (diagnostic != undefined) {
                let diagnosticLog = diag.createDiagnostic(err.file, err.irnode, diagnostic, ...err.args);
                diag.printDiagnostic(diagnosticLog);
            }
        } else if (err instanceof SyntaxError) {
            LOGE(err.name, err.message);
        } else {
            throw err;
        }
    }
}

let dtsFiles = getDtsFiles(path["join"](__dirname, "../node_modules/typescript/lib"));
process.argv.push(...dtsFiles);
run(process.argv.slice(2), Compiler.Options.Default);
global.gc();
