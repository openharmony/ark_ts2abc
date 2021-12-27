/*
 * Copyright (c) 2021 Huawei Device Co., Ltd.
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

import ts, { IndexedAccessType } from "typescript";
import {
    ClassType,
    ExternalType,
    TypeSummary
} from "./base/typeSystem";
import { ModuleStmt } from "./modules";
import { TypeChecker } from "./typeChecker";
import { PrimitiveType } from "./base/typeSystem";
import * as jshelpers from "./jshelpers";

export class TypeRecorder {
    private static instance: TypeRecorder;
    private type2Index: Map<ts.Node, number> = new Map<ts.Node, number>();
    private variable2Type: Map<ts.Node, number> = new Map<ts.Node, number>();
    private userDefinedTypeSet: Set<number> = new Set<number>();;
    private typeSummary: TypeSummary = new TypeSummary();
    private arrayTypeMap: Map<number, number> = new Map<number, number>();
    // ---> export/import
    // exportedType: exportedName -> typeIndex
    private exportedType: Map<string, number> = new Map<string, number>();
    // namespace mapping: namepace -> filepath (import * as sth from "...")
    // later in PropertyAccessExpression we'll need this to map the symbol to filepath
    private namespaceMap: Map<string, string> = new Map<string, string>();
    // (export * from "..."), if the symbol isn't in the reExportedType map, search here.
    private anonymousReExport: Array<string> = new Array<string>();

    private constructor() {}

    public static getInstance(): TypeRecorder {
        return TypeRecorder.instance;
    }

    public static createInstance(): TypeRecorder {
        TypeRecorder.instance = new TypeRecorder();
        return TypeRecorder.instance;
    }

    public setTypeSummary() {
        this.typeSummary.setInfo(this.countUserDefinedTypeSet(), this.anonymousReExport);
    }

    public addUserDefinedTypeSet(index: number) {
        this.userDefinedTypeSet.add(index);
    }

    public countUserDefinedTypeSet(): number {
        return this.userDefinedTypeSet.size;
    }

    public addType2Index(typeNode: ts.Node, index: number) {
        this.type2Index.set(typeNode, index);
        this.addUserDefinedTypeSet(index);
    }

    public setVariable2Type(variableNode: ts.Node, index: number, isUserDefinedType: boolean) {
        this.variable2Type.set(variableNode, index);
        if (isUserDefinedType) {
            this.addUserDefinedTypeSet(index);
        }
    }

    public hasType(typeNode: ts.Node): boolean {
        return this.type2Index.has(typeNode);
    }

    public tryGetTypeIndex(typeNode: ts.Node): number {
        if (this.type2Index.has(typeNode)) {
            return this.type2Index.get(typeNode)!;
        } else {
            return -1;
        }
    }

    public tryGetVariable2Type(variableNode: ts.Node): number {
        if (this.variable2Type.has(variableNode)) {
            return this.variable2Type.get(variableNode)!;
        } else {
            return -1;
        }
    }

    public setArrayTypeMap(contentTypeIndex: number, arrayTypeIndex: number) {
        this.arrayTypeMap.set(contentTypeIndex, arrayTypeIndex)
    }

    public hasArrayTypeMapping(contentTypeIndex: number) {
        return this.arrayTypeMap.has(contentTypeIndex);
    }

    public getFromArrayTypeMap(contentTypeIndex: number) {
        return this.arrayTypeMap.get(contentTypeIndex);
    }

    // ---> exported/imported
    public addImportedType(moduleStmt: ModuleStmt) {
        moduleStmt.getBindingNodeMap().forEach((externalNode, localNode) => {
            let externalName = jshelpers.getTextOfIdentifierOrLiteral(externalNode);
            let importDeclNode = TypeChecker.getInstance().getTypeDeclForIdentifier(localNode);
            let externalType = new ExternalType(externalName, moduleStmt.getModuleRequest());
            this.addType2Index(importDeclNode, this.shiftType(externalType.getTypeIndex()));
        });

        if (moduleStmt.getNameSpace() != "") {
            this.setNamespaceMap(moduleStmt.getNameSpace(), moduleStmt.getModuleRequest());
        }
    }

    public addExportedType(moduleStmt: ModuleStmt) {
        if (moduleStmt.getModuleRequest() != "") {
            // re-export, no need to search in typeRecord cause it must not be there
            if (moduleStmt.getNameSpace() != "") {
                // re-export * as namespace
                let externalType = new ExternalType("*", moduleStmt.getModuleRequest());
                let typeIndex = this.shiftType(externalType.getTypeIndex());
                this.setExportedType(moduleStmt.getNameSpace(), typeIndex, true);
                this.addUserDefinedTypeSet(typeIndex);
            } else if (moduleStmt.getBindingNameMap().size != 0) {
                // re-export via clause
                moduleStmt.getBindingNameMap().forEach((originalName, exportedName) => {
                    // let redirectName = this.createRedirectName(originalName, moduleStmt.getModuleRequest());
                    // this.setReExportedType(exportedName, redirectName);
                    let externalType = new ExternalType(originalName, moduleStmt.getModuleRequest());
                    let typeIndex = this.shiftType(externalType.getTypeIndex());
                    this.setExportedType(exportedName, typeIndex, true);
                    this.addUserDefinedTypeSet(typeIndex);
                });
            } else {
                // re-export * with anonymuse namespace
                this.addAnonymousReExport(moduleStmt.getModuleRequest());
            }
        } else {
            // named export via clause, could came from imported or local
            // propertyName is local name, name is external name
            moduleStmt.getBindingNodeMap().forEach((localNode, externalNode) => {
                let exportedName = jshelpers.getTextOfIdentifierOrLiteral(externalNode);
                let nodeType = TypeChecker.getInstance().getTypeChecker().getTypeAtLocation(localNode);
                let typeNode = nodeType.getSymbol()?.valueDeclaration;
                this.addNonReExportedType(exportedName, typeNode!);
            });
        }
    }

    public addNonReExportedType(exportedName: string, typeNode: ts.Node) {
        // Check if type of localName was already stroed in typeRecord
        // Imported type should already be stored in typeRecord by design
        let typeIndexForType = this.tryGetTypeIndex(typeNode);
        let typeIndexForVariable = this.tryGetVariable2Type(typeNode);
        if (typeIndexForType != -1) {
            this.setExportedType(exportedName, typeIndexForType, true);
        } else if (typeIndexForVariable != -1) {
            this.setExportedType(exportedName, typeIndexForVariable, true);
        } else {
            // not found in typeRecord. Need to create the type and
            // add to typeRecord with its localName and to exportedType with its exportedName
            if (typeNode.kind == ts.SyntaxKind.ClassDeclaration) {
                let classType = new ClassType(<ts.ClassDeclaration>typeNode, false);
                let typeIndex = classType.getTypeIndex();
                this.setExportedType(exportedName, typeIndex, false);
            }

            // Checking for duplicated export name should already be done by
            // some kind of syntax checker, so no need to worry about duplicated export
        }
    }

    public shiftType(typeIndex: number) {
        return typeIndex + PrimitiveType._LENGTH;
    }

    public setExportedType(exportedName: string, typeIndex: number, shifted: boolean) {
        if (!shifted) {
            typeIndex = this.shiftType(typeIndex);
        }
        this.exportedType.set(exportedName, typeIndex);
    }

    public addAnonymousReExport(redirectName: string) {
        this.anonymousReExport.push(redirectName);
    }

    public setNamespaceMap(namespace: string, filePath: string) {
        this.namespaceMap.set(namespace, filePath);
    }

    public inNampespaceMap(targetName: string) {
        return this.namespaceMap.has(targetName);
    }

    public getPathForNamespace(targetName: string) {
        return this.namespaceMap.get(targetName);
    }

    // for log
    public getType2Index(): Map<ts.Node, number> {
        return this.type2Index;
    }

    public getVariable2Type(): Map<ts.Node, number> {
        return this.variable2Type;
    }

    public getTypeSet() {
        return this.userDefinedTypeSet;
    }

    public getExportedType() {
        return this.exportedType;
    }

    public getAnonymousReExport() {
        return this.anonymousReExport;
    }

    public getNamespaceMap() {
        return this.namespaceMap;
    }

    public printNodeMap(map: Map<ts.Node, number>) {
        map.forEach((value, key) => {
            console.log(jshelpers.getTextOfNode(key) + ": " + value);
        });
    }

    public printExportMap(map: Map<string, number>) {
        map.forEach((value, key) => {
            console.log(key + " : " + value);
        });
    }

    public printReExportMap(map: Map<string, string>) {
        map.forEach((value, key) => {
            console.log(key + " : " + value);
        });
    }

    public getLog() {
        // console.log("=========== getLog ===========: " + node.kind);
        // console.log(jshelpers.getTextOfNode(node));
        // console.log("=========== currIndex ===========: ", currIndex);
        // console.log(PandaGen.getLiteralArrayBuffer()[currIndex]);
        console.log("==============================");
        console.log("type2Index: ");
        console.log(this.printNodeMap(this.getType2Index()));
        console.log("variable2Type: ");
        console.log(this.printNodeMap(this.getVariable2Type()));
        console.log("getTypeSet: ");
        console.log(this.getTypeSet());
        console.log("==============================");
        console.log("exportedType:");
        console.log(this.printExportMap(this.getExportedType()));
        console.log("AnoymousRedirect:");
        console.log(this.getAnonymousReExport());
        console.log("namespace Map:");
        console.log(this.getNamespaceMap());
        console.log("==============================");
    }
}