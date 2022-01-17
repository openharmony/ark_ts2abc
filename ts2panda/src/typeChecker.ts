import ts, { forEachChild } from "typescript";
import {
    ClassType,
    ClassInstType,
    ExternalType,
    UnionType,
    ArrayType,
    FunctionType,
    InterfaceType,
    ObjectType
} from "./base/typeSystem";
import { ModuleStmt } from "./modules";
import { TypeRecorder } from "./typeRecorder";
import * as jshelpers from "./jshelpers";
import { LOGD } from "./log";
import { PrimitiveType } from "./base/typeSystem";
import { isGlobalDeclare } from "./strictMode";
import { syncBuiltinESMExports } from "module";

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

    public getTypeAtLocation(node: ts.Node) {
        if (!node) {
            return undefined;
        }
        try {
            return this.compiledTypeChecker.getTypeAtLocation(node);
        } catch {
            LOGD("Get getTypeAtLocation filed for : " + node.getFullText());
            return undefined;
        }
    }

    public getTypeDeclForIdentifier(node: ts.Node) {
        if (!node) {
            return undefined;
        }
        let symbol;
        try {
            symbol = this.compiledTypeChecker.getSymbolAtLocation(node);
        } catch {
            LOGD("Get getSymbolAtLocation filed for : " + node.getFullText());
            return undefined;
        }
        if (symbol && symbol.declarations) {
            return symbol.declarations[0];
        }
        return undefined;
    }

    public hasExportKeyword(node: ts.Node): boolean {
        if (node.modifiers) {
            for (let modifier of node.modifiers) {
                if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
                    return true;
                }
            }
        }
        return false;
    }

    public hasDeclareKeyword(node: ts.Node): boolean {
        if (node.modifiers) {
            for (let modifier of node.modifiers) {
                if (modifier.kind === ts.SyntaxKind.DeclareKeyword) {
                    return true;
                }
            }
        }
        return false;
    }

    public getDeclNodeForInitializer(initializer: ts.Node) {
        switch (initializer.kind) {
            case ts.SyntaxKind.Identifier:
                return this.getTypeDeclForIdentifier(initializer);
            case ts.SyntaxKind.NewExpression:
                let initializerExpression = <ts.NewExpression>initializer;
                let expression = initializerExpression.expression;
                if (expression.kind == ts.SyntaxKind.ClassExpression) {
                    return expression;
                }
                return this.getTypeDeclForIdentifier(expression);
            case ts.SyntaxKind.ClassExpression:
                return initializer;
            case ts.SyntaxKind.PropertyAccessExpression:
                return initializer;
            default:
                return undefined;
        }
    }

    public getTypeForClassDeclOrExp(typeDeclNode: ts.Node, getTypeForInstace: boolean): number {
        let classTypeIndex = TypeRecorder.getInstance().tryGetTypeIndex(typeDeclNode);
        if (classTypeIndex == PrimitiveType.ANY) {
            let classType = new ClassType(<ts.ClassDeclaration>typeDeclNode);
            classTypeIndex = classType.shiftedTypeIndex;
        }
        if (getTypeForInstace) {
            // class type was already created, need to get the classInstance
            if (!TypeRecorder.getInstance().hasClass2InstanceMap(classTypeIndex)) {
                new ClassInstType(classTypeIndex);
            }
            classTypeIndex = TypeRecorder.getInstance().getClass2InstanceMap(classTypeIndex)!;
        }
        return classTypeIndex;
    }

    public getTypeForPropertyAccessExpression(typeDeclNode: ts.Node) {
        let propertyAccessExpression = <ts.PropertyAccessExpression>typeDeclNode;
        let localName = jshelpers.getTextOfIdentifierOrLiteral(propertyAccessExpression.expression);
        let externalName = jshelpers.getTextOfIdentifierOrLiteral(propertyAccessExpression.name);
        if (TypeRecorder.getInstance().inNampespaceMap(localName)) {
            let redirectPath = TypeRecorder.getInstance().getPathForNamespace(localName)!;
            let externalType = new ExternalType(externalName, redirectPath);
            let ImportTypeIndex = externalType.shiftedTypeIndex;
            return ImportTypeIndex;
        }
        return PrimitiveType.ANY;
    }

    public getInterfaceDeclaration(typeDeclNode: ts.Node) {
        let interfaceTypeIndex = TypeRecorder.getInstance().tryGetTypeIndex(typeDeclNode);
        if (interfaceTypeIndex == PrimitiveType.ANY) {
            let interefaceType = new InterfaceType(<ts.InterfaceDeclaration>typeDeclNode);
            interfaceTypeIndex = interefaceType.shiftedTypeIndex;
        }
        return interfaceTypeIndex;        
    }

    public getTypeFromDecl(typeDeclNode: ts.Node, getTypeForInstace: boolean): number {
        if (!typeDeclNode) {
            return PrimitiveType.ANY;
        }
        switch (typeDeclNode.kind) {
            // Type found to be defined a classDeclaration or classExpression
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.ClassExpression:
                return this.getTypeForClassDeclOrExp(typeDeclNode, getTypeForInstace);
            case ts.SyntaxKind.ImportSpecifier:
            case ts.SyntaxKind.ImportClause:
                let ImportTypeIndex = TypeRecorder.getInstance().tryGetTypeIndex(typeDeclNode);
                if (ImportTypeIndex != PrimitiveType.ANY) {
                    return ImportTypeIndex;
                }
                return PrimitiveType.ANY;
            case ts.SyntaxKind.PropertyAccessExpression:
                return this.getTypeForPropertyAccessExpression(typeDeclNode);
            case ts.SyntaxKind.InterfaceDeclaration:
                return this.getInterfaceDeclaration(typeDeclNode);
            default:
                return PrimitiveType.ANY;
        }
    }

    public getTypeFromAnotation(typeNode: ts.TypeNode | undefined) {
        if (!typeNode) {
            return PrimitiveType.ANY;
        }
        switch (typeNode.kind) {
            case ts.SyntaxKind.StringKeyword:
            case ts.SyntaxKind.NumberKeyword:
            case ts.SyntaxKind.BooleanKeyword:
            case ts.SyntaxKind.SymbolKeyword:
            case ts.SyntaxKind.UndefinedKeyword:
            case ts.SyntaxKind.VoidKeyword:
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
            case ts.SyntaxKind.TypeLiteral:
                let objectType = new ObjectType(<ts.TypeLiteralNode>typeNode);
                return objectType.shiftedTypeIndex;
            default:
                return PrimitiveType.ANY;
        }
    }

    public getOrCreateRecordForDeclNode(initializer: ts.Node | undefined, variableNode?: ts.Node) {
        if (!initializer) {
            return PrimitiveType.ANY;
        }
        let typeIndex = PrimitiveType.ANY;
        let declNode = this.getDeclNodeForInitializer(initializer);
        typeIndex = this.getTypeFromDecl(declNode, initializer.kind == ts.SyntaxKind.NewExpression);
        if (variableNode) {
            TypeRecorder.getInstance().setVariable2Type(variableNode, typeIndex);
        }
        return typeIndex;
    }

    public getOrCreateRecordForTypeNode(typeNode: ts.TypeNode | undefined, variableNode?: ts.Node) {
        if (!typeNode) {
            return PrimitiveType.ANY;
        }
        let typeIndex = PrimitiveType.ANY;
        typeIndex = this.getTypeFromAnotation(typeNode);
        if (typeIndex == PrimitiveType.ANY && typeNode.kind == ts.SyntaxKind.TypeReference) {
            let typeName = typeNode.getChildAt(0);
            let typeDecl = this.getDeclNodeForInitializer(typeName);
            typeIndex = this.getTypeFromDecl(typeDecl, true);
        }
        if (variableNode) {
            TypeRecorder.getInstance().setVariable2Type(variableNode, typeIndex);
        }
        return typeIndex;
    }

    public formatVariableStatement(variableStatementNode: ts.VariableStatement) {
        let decList = variableStatementNode.declarationList;
        decList.declarations.forEach(declaration => {
            let variableNode = declaration.name;
            let typeNode = declaration.type;
            let initializer = declaration.initializer;
            let typeIndex = this.getOrCreateRecordForTypeNode(typeNode, variableNode);
            if (typeIndex == PrimitiveType.ANY) {
                typeIndex = this.getOrCreateRecordForDeclNode(initializer, variableNode);
            }
            if (this.hasExportKeyword(variableStatementNode) && typeIndex != PrimitiveType.ANY) {
                let exportedName = jshelpers.getTextOfIdentifierOrLiteral(variableNode);
                TypeRecorder.getInstance().setExportedType(exportedName, typeIndex);
            }
        });
    }

    public formatClassDeclaration(classDeclNode: ts.ClassDeclaration) {
        let classType = new ClassType(classDeclNode);
        let typeIndex = classType.shiftedTypeIndex;
        let className = classDeclNode.name;
        let exportedName = "default";
        if (className) {
            exportedName = jshelpers.getTextOfIdentifierOrLiteral(className);
        }
        if (this.hasExportKeyword(classDeclNode)) {
            TypeRecorder.getInstance().setExportedType(exportedName, typeIndex);
        } else if (this.hasDeclareKeyword(classDeclNode) && isGlobalDeclare()) {
            TypeRecorder.getInstance().setDeclaredType(exportedName, typeIndex);
        }
    }

    // Entry for type recording
    public formatNodeType(node: ts.Node, importOrExportStmt?: ModuleStmt) {
        if (this.compiledTypeChecker === null) {
            return;
        }
        switch (node.kind) {
            case ts.SyntaxKind.VariableStatement:
                let variableStatementNode = <ts.VariableStatement>ts.getOriginalNode(node);
                this.formatVariableStatement(variableStatementNode);
                break;
            case ts.SyntaxKind.FunctionDeclaration:
                let functionDeclNode = <ts.FunctionDeclaration>ts.getOriginalNode(node);
                let functionName = functionDeclNode.name ? functionDeclNode.name : undefined;
                let funcType = new FunctionType(functionDeclNode);
                if (functionName) {
                    TypeRecorder.getInstance().setVariable2Type(functionName, funcType.shiftedTypeIndex);
                }
                break;
            case ts.SyntaxKind.ClassDeclaration:
                // Create the type if it is exported or declared. Otherwise, waite until it gets instantiated
                let classDeclNode = <ts.ClassDeclaration>ts.getOriginalNode(node);
                if (this.hasExportKeyword(node) || this.hasDeclareKeyword(node)) {
                    this.formatClassDeclaration(classDeclNode);
                }
                break;
            case ts.SyntaxKind.InterfaceDeclaration:
                if (isGlobalDeclare()) {
                    let interfaceDeclNode = <ts.InterfaceDeclaration>ts.getOriginalNode(node);
                    let interfaceType = new InterfaceType(interfaceDeclNode);
                    let interfaceName = interfaceDeclNode.name;
                    if (interfaceName) {
                        let name = jshelpers.getTextOfIdentifierOrLiteral(interfaceName);
                        TypeRecorder.getInstance().setDeclaredType(name, interfaceType.shiftedTypeIndex);
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
                let expression = (<ts.ExportAssignment>node).expression;
                let exportedName = "default";
                let expressionType = this.getTypeAtLocation(expression);
                if (expressionType) {
                    let typeNode = expressionType.getSymbol().valueDeclaration;
                    TypeRecorder.getInstance().addNonReExportedType(exportedName, typeNode, expression);
                }
                break;
            default:
                break;
        }
    }


}
