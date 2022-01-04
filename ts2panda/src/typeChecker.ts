import ts, { forEachChild } from "typescript";
import {
    ClassType,
    ClassInstType,
    ExternalType,
    UnionType,
    ArrayType,
    FunctionType,
    InterfaceType
} from "./base/typeSystem";
import { ModuleStmt } from "./modules";
import { TypeRecorder } from "./typeRecorder";
import * as jshelpers from "./jshelpers";
import { LOGD } from "./log";
import { PrimitiveType } from "./base/typeSystem";

export enum PrimitiveFlags {
    ANY = 1,
    NUMBER = 8,
    BOOLEAN = 1048592,
    STRING = 4,
    SYMBOL = 4096,
    NULL = 65536,
    UNDEFINED = 32768,
    _LENGTH = 50
}
import { isGlobalDeclare } from "./strictMode";

export class TypeChecker {
    private static instance: TypeChecker;
    private compiledTypeChecker: any = null;
    private constructor() { }

    public static getInstance(): TypeChecker {
        if (!TypeChecker.instance) {
            TypeChecker.instance = new TypeChecker();
        }
        return TypeChecker.instance;
    }

    public setTypeChecker(typeChecker: ts.TypeChecker) {
        this.compiledTypeChecker = typeChecker;
    }

    public getTypeChecker(): ts.TypeChecker {
        return this.compiledTypeChecker;
    }

    public getTypeDeclForIdentifier(node: ts.Node) {
        if (!node) {
            return undefined;
        }
        if (node.kind == ts.SyntaxKind.ClassExpression) {
            return node;
        }
        let symbol = this.compiledTypeChecker.getSymbolAtLocation(node);
        if (symbol && symbol.declarations) {
            return symbol.declarations[0];
        }
        LOGD("TypeDecl NOT FOUND for: " + node.getFullText());
        return undefined;
    }

    public getTypeFlagsAtLocation(node: ts.Node): string | undefined {
        let typeFlag = this.compiledTypeChecker.getTypeAtLocation(node).getFlags();
        if (typeFlag) {
            return PrimitiveFlags[typeFlag];
        } else {
            LOGD("typeFlag not found: ", typeFlag);
            return undefined
        }
    }

    public checkExportKeyword(node: ts.Node): boolean {
        if (node.modifiers) {
            for (let modifier of node.modifiers) {
                if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
                    return true;
                }
            }
        }
        return false;
    }

    public checkPotentialPrimitiveType(node: ts.TypeNode): number | undefined {
        let typeFlagName = this.getTypeFlagsAtLocation(node);
        let typeIndex = undefined;
        if (typeFlagName && typeFlagName in PrimitiveType) {
            typeIndex = PrimitiveType[typeFlagName as keyof typeof PrimitiveType];
        }
        return typeIndex;
    }

    public getOrCreateRecordForTypeNode(typeNode: ts.TypeNode) {
        let typeIndex = PrimitiveType.ANY;
        typeIndex = this.checkDeclarationType(typeNode);
        if (typeIndex == PrimitiveType.ANY && typeNode.kind == ts.SyntaxKind.TypeReference) {
            let typeName = typeNode.getChildAt(0);
            let typeDecl = this.getTypeDeclForInitializer(typeName, false);
            if (typeDecl) {
                typeIndex = this.checkForTypeDecl(typeName, typeDecl, false, true);
            } else {
                typeIndex = PrimitiveType.ANY;
            }
        }
        return typeIndex;
    }

    public checkDeclarationType(typeNode: ts.TypeNode | undefined) {
        if (!typeNode) {
            return PrimitiveType.ANY;
        }
        switch (typeNode.kind) {
            case ts.SyntaxKind.StringKeyword:
            case ts.SyntaxKind.NumberKeyword:
            case ts.SyntaxKind.BooleanKeyword:
            case ts.SyntaxKind.SymbolKeyword:
            case ts.SyntaxKind.UndefinedKeyword:
            case ts.SyntaxKind.BigIntKeyword:
            case ts.SyntaxKind.LiteralType:
                let typeName = typeNode.getText().toUpperCase();
                let typeIndex = PrimitiveType.ANY;
                if (typeName && typeName in PrimitiveType) {
                    typeIndex = PrimitiveType[typeName as keyof typeof PrimitiveType];
                }
                return typeIndex;
            case ts.SyntaxKind.UnionType:
                let unionType = new UnionType(typeNode);
                return unionType.shiftedTypeIndex;
            case ts.SyntaxKind.ArrayType:
                let arrayType = new ArrayType(typeNode);
                return arrayType.shiftedTypeIndex;
            case ts.SyntaxKind.ParenthesizedType:
                let subType = (<ts.ParenthesizedTypeNode>typeNode).type
                if (subType.kind == ts.SyntaxKind.UnionType) {
                    let unionType = new UnionType(subType);
                    return unionType.shiftedTypeIndex;
                }
                return PrimitiveType.ANY;
            default:
                return PrimitiveType.ANY;
        }
    }

    public getTypeDeclForInitializer(initializer: ts.Node, exportNeeded:boolean) {
        switch (initializer.kind) {
            // only create the type when it was used (initialized) or TODO: exported
            // NewExpression initializer means that the type is a new class (TODO: or other object later, but is there any?)
            case ts.SyntaxKind.NewExpression:
                let initializerExpression = <ts.NewExpression>initializer;
                return this.getTypeDeclForIdentifier(initializerExpression.expression);
            case ts.SyntaxKind.ClassExpression:
                if (exportNeeded) {
                    return initializer;
                }
                break;
            // Or the initializer is a variable
            case ts.SyntaxKind.Identifier:
                // other types, functions/primitives...
                return this.getTypeDeclForIdentifier(initializer);
            case ts.SyntaxKind.PropertyAccessExpression:
                return initializer;
            default:
                return null;
        }
    }

    // If newExpressionFlag is ture, the type has to be created no matter the export is needed or not;
    // while newExpressionFlag if false, the export has to be needed.
    public checkForTypeDecl(originalName: ts.Node, typeDeclNode: ts.Node, exportNeeded: boolean, newExpressionFlag: boolean): number {
        if (!typeDeclNode) {
            return PrimitiveType.ANY;
        }
        switch (typeDeclNode.kind) {
            // Type found to be defined a classDeclaration or classExpression
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.ClassExpression:
                let origTypeDeclNode = <ts.ClassDeclaration>ts.getOriginalNode(typeDeclNode);
                let classTypeIndex = TypeRecorder.getInstance().tryGetTypeIndex(origTypeDeclNode);
                if (classTypeIndex == PrimitiveType.ANY) {
                    new ClassType(<ts.ClassDeclaration>origTypeDeclNode, newExpressionFlag, originalName);
                    if (newExpressionFlag) {
                        classTypeIndex = TypeRecorder.getInstance().tryGetVariable2Type(originalName);
                    } else {
                        classTypeIndex = TypeRecorder.getInstance().tryGetTypeIndex(origTypeDeclNode);
                    }
                } else if (newExpressionFlag) {
                    // class type is created, need to add current variable to classInstance
                    classTypeIndex = classTypeIndex + 1;
                    TypeRecorder.getInstance().setVariable2Type(originalName, classTypeIndex, true);
                }
                if (exportNeeded) {
                    let exportedName = jshelpers.getTextOfIdentifierOrLiteral(originalName);
                    TypeRecorder.getInstance().setExportedType(exportedName, classTypeIndex, true);
                }
                return classTypeIndex;
            // The type was passed by a variable, need to keep search in deep
            case ts.SyntaxKind.VariableDeclaration:
                let varDeclNode = <ts.VariableDeclaration>typeDeclNode;
                let nextInitializer = varDeclNode.initializer;
                if (nextInitializer) {
                    let nextTypeDeclNode = this.getTypeDeclForInitializer(nextInitializer, exportNeeded);
                    if (nextTypeDeclNode) {
                        return this.checkForTypeDecl(originalName, nextTypeDeclNode, exportNeeded, newExpressionFlag);
                    }
                }
                return PrimitiveType.ANY;
            case ts.SyntaxKind.ImportSpecifier:
            case ts.SyntaxKind.ImportClause:
                let ImportTypeIndex = TypeRecorder.getInstance().tryGetTypeIndex(typeDeclNode);
                if (ImportTypeIndex != PrimitiveType.ANY) {
                    TypeRecorder.getInstance().setVariable2Type(originalName, ImportTypeIndex, true);
                    return ImportTypeIndex;
                }
                // console.log("-> ERROR: missing imported type for: ", jshelpers.getTextOfIdentifierOrLiteral(originalName));
                return PrimitiveType.ANY;
            case ts.SyntaxKind.PropertyAccessExpression:
                let propertyAccessExpression = <ts.PropertyAccessExpression>typeDeclNode;
                let localName = jshelpers.getTextOfIdentifierOrLiteral(propertyAccessExpression.expression);
                let externalName = jshelpers.getTextOfIdentifierOrLiteral(propertyAccessExpression.name);
                if (TypeRecorder.getInstance().inNampespaceMap(localName)) {
                    let redirectPath = TypeRecorder.getInstance().getPathForNamespace(localName)!;
                    let externalType = new ExternalType(externalName, redirectPath);
                    let ImportTypeIndex = externalType.getTypeIndex();
                    let shiftedTypeIndex = TypeRecorder.getInstance().shiftType(ImportTypeIndex);
                    TypeRecorder.getInstance().setVariable2Type(originalName, shiftedTypeIndex, true);
                    return shiftedTypeIndex;
                }
                // console.log("-> ERROR: missing imported type for: ", jshelpers.getTextOfIdentifierOrLiteral(originalName));
                return PrimitiveType.ANY;
        }
        return PrimitiveType.ANY;
    }

    public checkTypeForVariableDeclaration(node: ts.VariableDeclaration, exportNeeded: boolean) {
        let name = node.name;
        let initializer = node.initializer;
        let type = (<ts.VariableDeclaration>ts.getOriginalNode(node)).type;
        // first check if this is a primitive or union declaration
        let typeIndex = this.checkDeclarationType(type);
        if (typeIndex != PrimitiveType.ANY) {
            let isUserDefinedType = typeIndex <= PrimitiveType._LENGTH ? false : true;
            TypeRecorder.getInstance().setVariable2Type(name, typeIndex, isUserDefinedType);
        } else if (initializer) {
            let typeDeclNode = this.getTypeDeclForInitializer(initializer, exportNeeded);
            let newExpressionFlag = initializer.kind == ts.SyntaxKind.NewExpression;
            if (typeDeclNode) {
                this.checkForTypeDecl(name, typeDeclNode, exportNeeded, newExpressionFlag);
            }
        }
    }

    // Entry for type recording, only process node that will need a type to be created
    public formatNodeType(node: ts.Node, importOrExportStmt?: ModuleStmt) {
        if (this.compiledTypeChecker === null) {
            return;
        }
        switch(node.kind) {
            case ts.SyntaxKind.VariableStatement:
                // For varibaleStatemnt, need to check what kind of type the variable was set to
                const variableStatementNode = <ts.VariableStatement>node;
                const decList = variableStatementNode.declarationList;
                let exportNeeded = this.checkExportKeyword(node);
                decList.declarations.forEach(declaration => {
                    this.checkTypeForVariableDeclaration(declaration, exportNeeded);
                });
                break;
            case ts.SyntaxKind.FunctionDeclaration:
                let functionDeclNode = <ts.FunctionDeclaration>ts.getOriginalNode(node);
                let functionName = functionDeclNode.name? functionDeclNode.name : undefined;
                new FunctionType(functionDeclNode, functionName);
                break;
            case ts.SyntaxKind.ClassDeclaration:
                // Only create the type if it is exported. 
                // Otherwise, waite until it gets instantiated
                let classDeclNode = <ts.ClassDeclaration>ts.getOriginalNode(node);
                if (this.checkExportKeyword(node) || this.checkDeclareKeyword(node)) {
                    let classType = new ClassType(classDeclNode, false);
                    let typeIndex = classType.getTypeIndex();
                    let className = classDeclNode.name;
                    let exportedName = "default";
                    if (className) {
                        exportedName = jshelpers.getTextOfIdentifierOrLiteral(className);
                    } else {
                        LOGD("ClassName NOT FOUND for:" + node.getFullText());
                    }
                    if (this.checkExportKeyword(node)) {
                        TypeRecorder.getInstance().setExportedType(exportedName, typeIndex, false);
                    } else if (this.checkDeclareKeyword(node) && isGlobalDeclare()){
                        TypeRecorder.getInstance().setDeclaredType(exportedName, typeIndex, false);
                    }
                }
                break;
            case ts.SyntaxKind.InterfaceDeclaration:
                if (isGlobalDeclare()) {
                    let interfaceDeclNode : ts.InterfaceDeclaration = <ts.InterfaceDeclaration>ts.getOriginalNode(node);
                    let interfaceType = new InterfaceType(interfaceDeclNode);
                    let interfaceName = interfaceDeclNode.name;
                    if (interfaceName) {
                        TypeRecorder.getInstance().setDeclaredType(jshelpers.getTextOfIdentifierOrLiteral(interfaceName), interfaceType.getTypeIndex(), false);
                    } else {
                        LOGD("InterfaceName NOT FOUND for:" + node.getFullText());
                    }
                }
                break;
            case ts.SyntaxKind.ExportDeclaration:
                if (importOrExportStmt) {
                    TypeRecorder.getInstance().addExportedType(importOrExportStmt);
                }
                break;
            case ts.SyntaxKind.ImportDeclaration:
                if (importOrExportStmt) {
                    TypeRecorder.getInstance().addImportedType(importOrExportStmt);
                }
                break;
            case ts.SyntaxKind.ExportAssignment:
                let exportAssignmentNode = <ts.ExportAssignment>node;
                let expression = exportAssignmentNode.expression;
                let exportedName = "default";
                let expressionType = this.compiledTypeChecker.getTypeAtLocation(expression);
                let typeNode = expressionType.getSymbol()?.valueDeclaration;
                TypeRecorder.getInstance().addNonReExportedType(exportedName, typeNode);
                break;
        }
    }

    public checkDeclareKeyword(node: ts.Node): boolean {
        if (node.modifiers) {
            for (let modifier of node.modifiers) {
                if (modifier.kind === ts.SyntaxKind.DeclareKeyword) {
                    return true;
                }
            }
        }
        return false;
    }
}
