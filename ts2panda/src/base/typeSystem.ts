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

import * as ts from "typescript";
import * as jshelpers from "../jshelpers";
import { PandaGen } from "../pandagen";
import { TypeChecker } from "../typeChecker";
import { TypeRecorder } from "../typeRecorder";
import {
    Literal,
    LiteralBuffer,
    LiteralTag
} from "./literal";

export enum PrimitiveType {
    ANY,
    NUMBER,
    BOOLEAN,
    VOID,
    STRING,
    SYMBOL,
    NULL,
    UNDEFINED,
    INT,
    _LENGTH = 50
}

export enum L2Type {
    _COUNTER,
    CLASS,
    CLASSINST,
    FUNCTION,
    UNION,
    ARRAY,
    OBJECT,
    EXTERNAL,
    INTERFACE
}

export enum ModifierAbstract {
    NONABSTRACT,
    ABSTRACT
}

export enum ModifierStatic {
    NONSTATIC,
    STATIC
}

export enum ModifierReadonly {
    NONREADONLY,
    READONLY
}

export enum AccessFlag {
    PUBLIC,
    PRIVATE,
    PROTECTED
}

type ClassMemberFunction = ts.MethodDeclaration | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration;

export abstract class BaseType {

    abstract transfer2LiteralBuffer(): LiteralBuffer;
    protected typeChecker = TypeChecker.getInstance();
    protected typeRecorder = TypeRecorder.getInstance();

    protected addCurrentType(node: ts.Node, index: number) {
        this.typeRecorder.addType2Index(node, index);
    }

    protected setVariable2Type(variableNode: ts.Node, index: number) {
        this.typeRecorder.setVariable2Type(variableNode, index);
    }

    protected tryGetTypeIndex(typeNode: ts.Node) {
        return this.typeRecorder.tryGetTypeIndex(typeNode);
    }

    protected getOrCreateRecordForDeclNode(typeNode: ts.Node, variableNode?: ts.Node) {
        return this.typeChecker.getOrCreateRecordForDeclNode(typeNode, variableNode);
    }

    protected getOrCreateRecordForTypeNode(typeNode: ts.TypeNode | undefined, variableNode?: ts.Node) {
        return this.typeChecker.getOrCreateRecordForTypeNode(typeNode, variableNode);
    }

    protected getIndexFromTypeArrayBuffer(type: BaseType): number {
        return PandaGen.appendTypeArrayBuffer(type);
    }

    protected setTypeArrayBuffer(type: BaseType, index: number) {
        PandaGen.setTypeArrayBuffer(type, index);
    }

}

export class PlaceHolderType extends BaseType {
    transfer2LiteralBuffer(): LiteralBuffer {
        return new LiteralBuffer();
    }
}

export class TypeSummary extends BaseType {
    preservedIndex: number = 0;
    userDefinedClassNum: number = 0;
    anonymousRedirect: Array<string> = new Array<string>();
    constructor() {
        super();
        this.preservedIndex = this.getIndexFromTypeArrayBuffer(new PlaceHolderType());
    }

    public setInfo(userDefinedClassNum: number, anonymousRedirect: Array<string>) {
        this.userDefinedClassNum = userDefinedClassNum;
        this.anonymousRedirect = anonymousRedirect;
        this.setTypeArrayBuffer(this, this.preservedIndex);
    }

    public getPreservedIndex() {
        return this.preservedIndex;
    }

    transfer2LiteralBuffer(): LiteralBuffer {
        let countBuf = new LiteralBuffer();
        let summaryLiterals: Array<Literal> = new Array<Literal>();
        summaryLiterals.push(new Literal(LiteralTag.INTEGER, L2Type._COUNTER));
        summaryLiterals.push(new Literal(LiteralTag.INTEGER, this.userDefinedClassNum));
        summaryLiterals.push(new Literal(LiteralTag.INTEGER, this.anonymousRedirect.length));
        for (let element of this.anonymousRedirect) {
            summaryLiterals.push(new Literal(LiteralTag.STRING, element));
        }
        countBuf.addLiterals(...summaryLiterals);
        return countBuf;
    }
}

export class ClassType extends BaseType {
    modifier: number = ModifierAbstract.NONABSTRACT; // 0 -> unabstract, 1 -> abstract;
    extendsHeritage: number = PrimitiveType.ANY;
    implementsHeritages: Array<number> = new Array<number>();
    // fileds Array: [typeIndex] [public -> 0, private -> 1, protected -> 2] [readonly -> 1]
    staticFields: Map<string, Array<number>> = new Map<string, Array<number>>();
    staticMethods: Map<string, number> = new Map<string, number>();
    fields: Map<string, Array<number>> = new Map<string, Array<number>>();
    methods: Map<string, number> = new Map<string, number>();
    typeIndex: number;
    shiftedTypeIndex: number;

    constructor(classNode: ts.ClassDeclaration | ts.ClassExpression) {
        super();
        this.typeIndex = this.getIndexFromTypeArrayBuffer(new PlaceHolderType());
        this.shiftedTypeIndex = this.typeIndex + PrimitiveType._LENGTH;
        // record type before its initialization, so its index can be recorded
        // in case there's recursive reference of this type
        this.addCurrentType(classNode, this.shiftedTypeIndex);
        this.fillInModifiers(classNode);
        this.fillInHeritages(classNode);
        this.fillInFieldsAndMethods(classNode);
        this.setTypeArrayBuffer(this, this.typeIndex);
    }

    private fillInModifiers(node: ts.ClassDeclaration | ts.ClassExpression) {
        if (node.modifiers) {
            for (let modifier of node.modifiers) {
                switch (modifier.kind) {
                    case ts.SyntaxKind.AbstractKeyword: {
                        this.modifier = ModifierAbstract.ABSTRACT;
                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
        }
    }

    private fillInHeritages(node: ts.ClassDeclaration | ts.ClassExpression) {
        if (node.heritageClauses) {
            for (let heritage of node.heritageClauses) {
                let heritageFullName = heritage.getText();
                for (let heritageType of heritage.types) {
                    let heritageIdentifier = <ts.Identifier>heritageType.expression;
                    let heritageTypeIndex = this.getOrCreateRecordForDeclNode(heritageIdentifier, heritageIdentifier);
                    if (heritageFullName.startsWith("extends ")) {
                        this.extendsHeritage = heritageTypeIndex;
                    } else if (heritageFullName.startsWith("implements ")) {
                        this.implementsHeritages.push(heritageTypeIndex);
                    }
                }
            }
        }
    }

    private fillInFields(member: ts.PropertyDeclaration) {
        let fieldName = jshelpers.getTextOfIdentifierOrLiteral(member.name);
        let fieldInfo = Array<number>(PrimitiveType.ANY, AccessFlag.PUBLIC, ModifierReadonly.NONREADONLY);
        let isStatic: boolean = false;
        if (member.modifiers) {
            for (let modifier of member.modifiers) {
                switch (modifier.kind) {
                    case ts.SyntaxKind.StaticKeyword: {
                        isStatic = true;
                        break;
                    }
                    case ts.SyntaxKind.PrivateKeyword: {
                        fieldInfo[1] = AccessFlag.PRIVATE;
                        break;
                    }
                    case ts.SyntaxKind.ProtectedKeyword: {
                        fieldInfo[1] = AccessFlag.PROTECTED;
                        break;
                    }
                    case ts.SyntaxKind.ReadonlyKeyword: {
                        fieldInfo[2] = ModifierReadonly.READONLY;
                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
        }

        let typeNode = member.type
        let memberName = member.name
        fieldInfo[0] = this.getOrCreateRecordForTypeNode(typeNode, memberName);

        if (isStatic) {
            this.staticFields.set(fieldName, fieldInfo);
        } else {
            this.fields.set(fieldName, fieldInfo);
        }
    }

    private fillInMethods(member: ClassMemberFunction) {
        /**
         * a method like declaration in a new class must be a new type,
         * create this type and add it into typeRecorder
         */
        let variableNode = member.name ? member.name : undefined;
        let funcType = new FunctionType(<ts.FunctionLikeDeclaration>member);
        if (variableNode) {
            this.setVariable2Type(variableNode, funcType.shiftedTypeIndex);
        }

        // Then, get the typeIndex and fill in the methods array
        let typeIndex = this.tryGetTypeIndex(member);
        let funcModifier = funcType.getModifier();
        if (funcModifier) {
            this.staticMethods.set(funcType.getFunctionName(), typeIndex!);
        } else {
            this.methods.set(funcType.getFunctionName(), typeIndex!);
        }
    }

    private fillInFieldsAndMethods(node: ts.ClassDeclaration | ts.ClassExpression) {
        if (node.members) {
            for (let member of node.members) {
                switch (member.kind) {
                    case ts.SyntaxKind.MethodDeclaration:
                    case ts.SyntaxKind.Constructor:
                    case ts.SyntaxKind.GetAccessor:
                    case ts.SyntaxKind.SetAccessor: {
                        this.fillInMethods(<ClassMemberFunction>member);
                        break;
                    }
                    case ts.SyntaxKind.PropertyDeclaration: {
                        this.fillInFields(<ts.PropertyDeclaration>member);
                        break;
                    }
                    default:
                        break;
                }
            }
        }
    }

    transfer2LiteralBuffer() {
        let classTypeBuf = new LiteralBuffer();
        let classTypeLiterals: Array<Literal> = new Array<Literal>();
        // the first element is to determine the L2 type
        classTypeLiterals.push(new Literal(LiteralTag.INTEGER, L2Type.CLASS));
        classTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.modifier));

        classTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.extendsHeritage));
        classTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.implementsHeritages.length));
        this.implementsHeritages.forEach(heritage => {
            classTypeLiterals.push(new Literal(LiteralTag.INTEGER, heritage));
        });

        // record unstatic fields and methods
        this.transferFields2Literal(classTypeLiterals, false);
        this.transferMethods2Literal(classTypeLiterals, false);

        // record static methods and fields;
        this.transferFields2Literal(classTypeLiterals, true);
        this.transferMethods2Literal(classTypeLiterals, true);

        classTypeBuf.addLiterals(...classTypeLiterals);
        return classTypeBuf;
    }

    private transferFields2Literal(classTypeLiterals: Array<Literal>, isStatic: boolean) {
        let transferredTarget: Map<string, Array<number>> = isStatic ? this.staticFields : this.fields;

        classTypeLiterals.push(new Literal(LiteralTag.INTEGER, transferredTarget.size));
        transferredTarget.forEach((typeInfo, name) => {
            classTypeLiterals.push(new Literal(LiteralTag.STRING, name));
            classTypeLiterals.push(new Literal(LiteralTag.INTEGER, typeInfo[0])); // typeIndex
            classTypeLiterals.push(new Literal(LiteralTag.INTEGER, typeInfo[1])); // accessFlag
            classTypeLiterals.push(new Literal(LiteralTag.INTEGER, typeInfo[2])); // readonly
        });
    }

    private transferMethods2Literal(classTypeLiterals: Array<Literal>, isStatic: boolean) {
        let transferredTarget: Map<string, number> = isStatic ? this.staticMethods : this.methods;

        classTypeLiterals.push(new Literal(LiteralTag.INTEGER, transferredTarget.size));
        transferredTarget.forEach((typeInfo, name) => {
            classTypeLiterals.push(new Literal(LiteralTag.STRING, name));
            classTypeLiterals.push(new Literal(LiteralTag.INTEGER, typeInfo));
        });
    }
}

export class ClassInstType extends BaseType {
    shiftedReferredClassIndex: number; // the referred class in the type system;
    typeIndex: number;
    shiftedTypeIndex: number;
    constructor(referredClassIndex: number) {
        super();
        this.shiftedReferredClassIndex = referredClassIndex;
        this.typeIndex = this.getIndexFromTypeArrayBuffer(this);
        this.shiftedTypeIndex = this.typeIndex + PrimitiveType._LENGTH;
        this.typeRecorder.setClass2InstanceMap(this.shiftedReferredClassIndex, this.shiftedTypeIndex);
    }

    transfer2LiteralBuffer(): LiteralBuffer {
        let classInstBuf = new LiteralBuffer();
        let classInstLiterals: Array<Literal> = new Array<Literal>();

        classInstLiterals.push(new Literal(LiteralTag.INTEGER, L2Type.CLASSINST));
        classInstLiterals.push(new Literal(LiteralTag.INTEGER, this.shiftedReferredClassIndex));
        classInstBuf.addLiterals(...classInstLiterals);

        return classInstBuf;
    }
}

export class FunctionType extends BaseType {
    name: string = '';
    accessFlag: number = AccessFlag.PUBLIC; // 0 -> public -> 0, private -> 1, protected -> 2
    modifierStatic: number = ModifierStatic.NONSTATIC; // 0 -> unstatic, 1 -> static
    parameters: Array<number> = new Array<number>();
    returnType: number = PrimitiveType.ANY;
    typeIndex: number;
    shiftedTypeIndex: number;

    constructor(funcNode: ts.FunctionLikeDeclaration | ts.MethodSignature) {
        super();
        this.typeIndex = this.getIndexFromTypeArrayBuffer(new PlaceHolderType());
        this.shiftedTypeIndex = this.typeIndex + PrimitiveType._LENGTH;
        // record type before its initialization, so its index can be recorded
        // in case there's recursive reference of this type
        this.addCurrentType(funcNode, this.shiftedTypeIndex);

        if (funcNode.name) {
            this.name = jshelpers.getTextOfIdentifierOrLiteral(funcNode.name);
        } else {
            this.name = "constructor";
        }
        this.fillInModifiers(funcNode);
        this.fillInParameters(funcNode);
        this.fillInReturn(funcNode);
        this.setTypeArrayBuffer(this, this.typeIndex);
    }

    public getFunctionName() {
        return this.name;
    }

    private fillInModifiers(node: ts.FunctionLikeDeclaration | ts.MethodSignature) {
        if (node.modifiers) {
            for (let modifier of node.modifiers) {
                switch (modifier.kind) {
                    case ts.SyntaxKind.PrivateKeyword: {
                        this.accessFlag = AccessFlag.PRIVATE;
                        break;
                    }
                    case ts.SyntaxKind.ProtectedKeyword: {
                        this.accessFlag = AccessFlag.PROTECTED;
                        break;
                    }
                    case ts.SyntaxKind.StaticKeyword: {
                        this.modifierStatic = ModifierStatic.STATIC;
                        break;
                    }
                    default:
                        break;
                }
            }
        }
    }

    private fillInParameters(node: ts.FunctionLikeDeclaration | ts.MethodSignature) {
        if (node.parameters) {
            for (let parameter of node.parameters) {
                let typeNode = parameter.type;
                let variableNode = parameter.name;
                let typeIndex = this.getOrCreateRecordForTypeNode(typeNode, variableNode);
                this.parameters.push(typeIndex);
            }
        }
    }

    private fillInReturn(node: ts.FunctionLikeDeclaration | ts.MethodSignature) {
        let typeNode = node.type;
        let typeIndex = this.getOrCreateRecordForTypeNode(typeNode, typeNode);
        this.returnType = typeIndex;
    }

    getModifier() {
        return this.modifierStatic;
    }

    transfer2LiteralBuffer(): LiteralBuffer {
        let funcTypeBuf = new LiteralBuffer();
        let funcTypeLiterals: Array<Literal> = new Array<Literal>();
        funcTypeLiterals.push(new Literal(LiteralTag.INTEGER, L2Type.FUNCTION));
        funcTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.accessFlag));
        funcTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.modifierStatic));
        funcTypeLiterals.push(new Literal(LiteralTag.STRING, this.name));
        funcTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.parameters.length));
        this.parameters.forEach((type) => {
            funcTypeLiterals.push(new Literal(LiteralTag.INTEGER, type));
        });

        funcTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.returnType));
        funcTypeBuf.addLiterals(...funcTypeLiterals);
        return funcTypeBuf;
    }
}

export class ExternalType extends BaseType {
    fullRedirectNath: string;
    typeIndex: number;
    shiftedTypeIndex: number;

    constructor(importName: string, redirectPath: string) {
        super();
        this.fullRedirectNath = `#${importName}#${redirectPath}`;
        this.typeIndex = this.getIndexFromTypeArrayBuffer(this);
        this.shiftedTypeIndex = this.typeIndex + PrimitiveType._LENGTH;
    }

    transfer2LiteralBuffer(): LiteralBuffer {
        let ImpTypeBuf = new LiteralBuffer();
        let ImpTypeLiterals: Array<Literal> = new Array<Literal>();
        ImpTypeLiterals.push(new Literal(LiteralTag.INTEGER, L2Type.EXTERNAL));
        ImpTypeLiterals.push(new Literal(LiteralTag.STRING, this.fullRedirectNath));
        ImpTypeBuf.addLiterals(...ImpTypeLiterals);
        return ImpTypeBuf;
    }
}

export class UnionType extends BaseType {
    unionedTypeArray: Array<number> = [];
    typeIndex: number = PrimitiveType.ANY;
    shiftedTypeIndex: number = PrimitiveType.ANY;

    constructor(typeNode: ts.Node) {
        super();
        this.setOrReadFromArrayRecord(typeNode);
    }

    setOrReadFromArrayRecord(typeNode: ts.Node) {
        let unionStr = typeNode.getText();
        if (this.hasUnionTypeMapping(unionStr)) {
            this.shiftedTypeIndex = this.getFromUnionTypeMap(unionStr)!;
            return;
        }
        this.typeIndex = this.getIndexFromTypeArrayBuffer(new PlaceHolderType());
        this.shiftedTypeIndex = this.typeIndex + PrimitiveType._LENGTH;
        this.fillInUnionArray(typeNode, this.unionedTypeArray);
        this.setUnionTypeMap(unionStr, this.shiftedTypeIndex);
        this.setTypeArrayBuffer(this, this.typeIndex);
    }

    hasUnionTypeMapping(unionStr: string) {
        return this.typeRecorder.hasUnionTypeMapping(unionStr);
    }

    getFromUnionTypeMap(unionStr: string) {
        return this.typeRecorder.getFromUnionTypeMap(unionStr);
    }

    setUnionTypeMap(unionStr: string, shiftedTypeIndex: number) {
        return this.typeRecorder.setUnionTypeMap(unionStr, shiftedTypeIndex);
    }

    fillInUnionArray(typeNode: ts.Node, unionedTypeArray: Array<number>) {
        for (let element of (<ts.UnionType><any>typeNode).types) {
            let elementNode = <ts.TypeNode><any>element;
            let typeIndex = this.getOrCreateRecordForTypeNode(elementNode, elementNode);
            unionedTypeArray.push(typeIndex!);
        }
    }

    transfer2LiteralBuffer(): LiteralBuffer {
        let UnionTypeBuf = new LiteralBuffer();
        let UnionTypeLiterals: Array<Literal> = new Array<Literal>();
        UnionTypeLiterals.push(new Literal(LiteralTag.INTEGER, L2Type.UNION));
        UnionTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.unionedTypeArray.length));
        for (let type of this.unionedTypeArray) {
            UnionTypeLiterals.push(new Literal(LiteralTag.INTEGER, type));
        }
        UnionTypeBuf.addLiterals(...UnionTypeLiterals);
        return UnionTypeBuf;
    }
}

export class ArrayType extends BaseType {
    referedTypeIndex: number = PrimitiveType.ANY;
    typeIndex: number = PrimitiveType.ANY;
    shiftedTypeIndex: number = PrimitiveType.ANY;
    constructor(typeNode: ts.Node) {
        super();
        let elementNode = (<ts.ArrayTypeNode><any>typeNode).elementType;
        this.referedTypeIndex = this.getOrCreateRecordForTypeNode(elementNode, elementNode);
        this.setOrReadFromArrayRecord();
    }

    setOrReadFromArrayRecord() {
        if (this.hasArrayTypeMapping(this.referedTypeIndex)) {
            this.shiftedTypeIndex = this.getFromArrayTypeMap(this.referedTypeIndex)!;
        } else {
            this.typeIndex = this.getIndexFromTypeArrayBuffer(this);
            this.shiftedTypeIndex = this.typeIndex + PrimitiveType._LENGTH;
            this.setTypeArrayBuffer(this, this.typeIndex);
            this.setArrayTypeMap(this.referedTypeIndex, this.shiftedTypeIndex);
        }
    }

    hasArrayTypeMapping(referedTypeIndex: number) {
        return this.typeRecorder.hasArrayTypeMapping(referedTypeIndex);
    }

    getFromArrayTypeMap(referedTypeIndex: number) {
        return this.typeRecorder.getFromArrayTypeMap(referedTypeIndex);
    }

    setArrayTypeMap(referedTypeIndex: number, shiftedTypeIndex: number) {
        return this.typeRecorder.setArrayTypeMap(referedTypeIndex, shiftedTypeIndex);
    }

    transfer2LiteralBuffer(): LiteralBuffer {
        let arrayBuf = new LiteralBuffer();
        let arrayLiterals: Array<Literal> = new Array<Literal>();
        arrayLiterals.push(new Literal(LiteralTag.INTEGER, L2Type.ARRAY));
        arrayLiterals.push(new Literal(LiteralTag.INTEGER, this.referedTypeIndex));
        arrayBuf.addLiterals(...arrayLiterals);
        return arrayBuf;
    }
}

export class ObjectType extends BaseType {
    private properties: Map<string, number> = new Map<string, number>();
    typeIndex: number = PrimitiveType.ANY;
    shiftedTypeIndex: number = PrimitiveType.ANY;

    constructor(objNode: ts.TypeLiteralNode) {
        super();
        this.typeIndex = this.getIndexFromTypeArrayBuffer(new PlaceHolderType());
        this.shiftedTypeIndex = this.typeIndex + PrimitiveType._LENGTH;
        this.fillInMembers(objNode);
        this.setTypeArrayBuffer(this, this.typeIndex);
    }

    fillInMembers(objNode: ts.TypeLiteralNode) {
        for (let member of objNode.members) {
            let propertySig = <ts.PropertySignature>member;
            let name = member.name ? member.name.getText() : "#undefined";
            let typeIndex = this.getOrCreateRecordForTypeNode(propertySig.type, member.name);
            this.properties.set(name, typeIndex);
        }
    }

    transfer2LiteralBuffer(): LiteralBuffer {
        let objTypeBuf = new LiteralBuffer();
        let objLiterals: Array<Literal> = new Array<Literal>();
        objLiterals.push(new Literal(LiteralTag.INTEGER, L2Type.OBJECT));
        objLiterals.push(new Literal(LiteralTag.INTEGER, this.properties.size));
        this.properties.forEach((typeIndex, name) => {
            objLiterals.push(new Literal(LiteralTag.STRING, name));
            objLiterals.push(new Literal(LiteralTag.INTEGER, typeIndex));
        });
        objTypeBuf.addLiterals(...objLiterals);
        return objTypeBuf;
    }
}

export class InterfaceType extends BaseType {
    heritages: Array<number> = new Array<number>();
    // fileds Array: [typeIndex] [public -> 0, private -> 1, protected -> 2] [readonly -> 1]
    fields: Map<string, Array<number>> = new Map<string, Array<number>>();
    methods: Array<number> = new Array<number>();
    typeIndex: number;
    shiftedTypeIndex: number;

    constructor(interfaceNode: ts.InterfaceDeclaration) {
        super();
        this.typeIndex = this.getIndexFromTypeArrayBuffer(new PlaceHolderType());
        this.shiftedTypeIndex = this.typeIndex + PrimitiveType._LENGTH;
        // record type before its initialization, so its index can be recorded
        // in case there's recursive reference of this type
        this.addCurrentType(interfaceNode, this.shiftedTypeIndex);
        this.fillInHeritages(interfaceNode);
        this.fillInFieldsAndMethods(interfaceNode);
        this.setTypeArrayBuffer(this, this.typeIndex);
    }

    private fillInHeritages(node: ts.InterfaceDeclaration) {
        if (node.heritageClauses) {
            for (let heritage of node.heritageClauses) {
                for (let heritageType of heritage.types) {
                    let heritageIdentifier = <ts.Identifier>heritageType.expression;
                    let heritageTypeIndex = this.getOrCreateRecordForDeclNode(heritageIdentifier, heritageIdentifier);
                    this.heritages.push(heritageTypeIndex);
                }
            }
        }
    }

    private fillInFields(member: ts.PropertySignature) {
        let fieldName = jshelpers.getTextOfIdentifierOrLiteral(member.name);
        let fieldInfo = Array<number>(PrimitiveType.ANY, AccessFlag.PUBLIC, ModifierReadonly.NONREADONLY);
        if (member.modifiers) {
            for (let modifier of member.modifiers) {
                switch (modifier.kind) {
                    case ts.SyntaxKind.PrivateKeyword: {
                        fieldInfo[1] = AccessFlag.PRIVATE;
                        break;
                    }
                    case ts.SyntaxKind.ProtectedKeyword: {
                        fieldInfo[1] = AccessFlag.PROTECTED;
                        break;
                    }
                    case ts.SyntaxKind.ReadonlyKeyword: {
                        fieldInfo[2] = ModifierReadonly.READONLY;
                        break;
                    }
                    default:
                        break;
                }
            }
        }
        let typeNode = member.type;
        let memberName = member.name;
        fieldInfo[0] = this.getOrCreateRecordForTypeNode(typeNode, memberName);
        this.fields.set(fieldName, fieldInfo);
    }

    private fillInMethods(member: ts.MethodSignature) {
        /**
         * a method like declaration in a new class must be a new type,
         * create this type and add it into typeRecorder
         */
        let variableNode = member.name ? member.name : undefined;
        let funcType = new FunctionType(<ts.MethodSignature>member);
        if (variableNode) {
            this.setVariable2Type(variableNode, funcType.shiftedTypeIndex);
        }
        // Then, get the typeIndex and fill in the methods array
        let typeIndex = this.tryGetTypeIndex(member);
        this.methods.push(typeIndex!);
    }

    private fillInFieldsAndMethods(node: ts.InterfaceDeclaration) {
        if (node.members) {
            for (let member of node.members) {
                switch (member.kind) {
                    case ts.SyntaxKind.MethodSignature: {
                        this.fillInMethods(<ts.MethodSignature>member);
                        break;
                    }
                    case ts.SyntaxKind.PropertySignature: {
                        this.fillInFields(<ts.PropertySignature>member);
                        break;
                    }
                    default:
                        break;
                }
            }
        }
    }

    transfer2LiteralBuffer() {
        let interfaceTypeBuf = new LiteralBuffer();
        let interfaceTypeLiterals: Array<Literal> = new Array<Literal>();
        // the first element is to determine the L2 type
        interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, L2Type.INTERFACE));

        interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, this.heritages.length));
        this.heritages.forEach(heritage => {
            interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, heritage));
        });

        // record fields and methods
        this.transferFields2Literal(interfaceTypeLiterals);
        this.transferMethods2Literal(interfaceTypeLiterals);

        interfaceTypeBuf.addLiterals(...interfaceTypeLiterals);
        return interfaceTypeBuf;
    }

    private transferFields2Literal(interfaceTypeLiterals: Array<Literal>) {
        let transferredTarget: Map<string, Array<number>> = this.fields;

        interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, transferredTarget.size));
        transferredTarget.forEach((typeInfo, name) => {
            interfaceTypeLiterals.push(new Literal(LiteralTag.STRING, name));
            interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, typeInfo[0])); // typeIndex
            interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, typeInfo[1])); // accessFlag
            interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, typeInfo[2])); // readonly
        });
    }

    private transferMethods2Literal(interfaceTypeLiterals: Array<Literal>) {
        let transferredTarget: Array<number> = this.methods;

        interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, transferredTarget.length));
        transferredTarget.forEach(method => {
            interfaceTypeLiterals.push(new Literal(LiteralTag.INTEGER, method));
        });
    }
}
