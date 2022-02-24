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

import { PandaGen } from "src/pandagen";
import * as ts from "typescript";
import { LReference } from "./base/lreference";
import {
    isArrayBindingOrAssignmentPattern,
    isObjectBindingOrAssignmentPattern
} from "./base/util";
import {
    CacheList,
    getVregisterCache
} from "./base/vregisterCache";
import { Compiler } from "./compiler";
import {
    Label,
    VReg
} from "./irnodes";
import * as jshelpers from "./jshelpers";
import {
    CatchTable,
    LabelPair
} from "./statement/tryStatement";
import { Iterator } from "./base/iterator";

export function compileDestructuring(pattern: ts.BindingOrAssignmentPattern, pandaGen: PandaGen, compiler: Compiler) {
    let rhs = pandaGen.getTemp();
    pandaGen.storeAccumulator(pattern, rhs);

    if (isArrayBindingOrAssignmentPattern(pattern)) {
        compileArrayDestructuring(<ts.ArrayBindingOrAssignmentPattern>pattern, pandaGen, compiler);
    }

    if (isObjectBindingOrAssignmentPattern(pattern)) {
        compileObjectDestructuring(<ts.ObjectBindingOrAssignmentPattern>pattern, pandaGen, compiler);
    }

    pandaGen.loadAccumulator(pattern, rhs);
    pandaGen.freeTemps(rhs);
}

function compileArrayDestructuring(arr: ts.ArrayBindingOrAssignmentPattern, pandaGen: PandaGen, compiler: Compiler) {
    let iter = pandaGen.getTemp();
    let nextMethod = pandaGen.getTemp();
    let iterDone = pandaGen.getTemp();
    let iterValue = pandaGen.getTemp();
    let nextResult = pandaGen.getTemp();
    let exception = pandaGen.getTemp();

    let isDeclaration = ts.isArrayBindingPattern(arr) ? true : false;

    // get iterator
    let iterator = new Iterator({iterator: iter, nextMethod: nextMethod}, iterDone, iterValue, pandaGen, arr);
    iterator.getIterator();

    // prepare try-catch for iterate over all the elements
    let tryBeginLabel = new Label();
    let tryEndLabel = new Label();
    let catchBeginLabel = new Label();
    let catchEndLabel = new Label();
    let normalClose = new Label();
    let endLabel = new Label();
    new CatchTable(
        pandaGen,
        catchBeginLabel,
        new LabelPair(tryBeginLabel, tryEndLabel)
    );

    // try start
    pandaGen.label(arr, tryBeginLabel);

    for (let i = 0; i < arr.elements.length; i++) {
        let element = arr.elements[i];
        iterator.callNext(nextResult);

        // if a hole exist, just let the iterator step ahead
        if (ts.isOmittedExpression(element)) {
            continue;
        }

        // if its spread element
        if ((!isDeclaration && ts.isSpreadElement(element)) ||
            (isDeclaration && (<ts.BindingElement>element).dotDotDotToken)) {
            emitRestElement(isDeclaration ? (<ts.BindingElement>element).name : (<ts.SpreadElement>element).expression,
                            iterator, nextResult, pandaGen, compiler, isDeclaration);
            pandaGen.branch(element, endLabel);
            break;
        }

        let hasInit = false;
        let target: ts.Node = isDeclaration ? (<ts.BindingElement>element).name : <ts.Expression>element;
        let init: ts.Expression | undefined = undefined;
        // in case init is present
        if (!isDeclaration && ts.isBinaryExpression(element)) {
            if (element.operatorToken.kind != ts.SyntaxKind.EqualsToken) {
                throw new Error("Invalid destructuring assignment target");
            }

            target = element.left;
            init = element.right;
            hasInit = true;
        } else if (isDeclaration && (<ts.BindingElement>element).initializer) {
            init = (<ts.BindingElement>element).initializer;
            hasInit = true;
        }

        let lRef = LReference.generateLReference(compiler, target, isDeclaration ? true : false);

        let getDefaultLabel = new Label();
        let getUndefinedLabel = new Label();
        let storeLabel = new Label();

        iterator.iteratorComplete(nextResult);
        pandaGen.condition(
            element,
            ts.SyntaxKind.ExclamationEqualsEqualsToken,
            getVregisterCache(pandaGen, CacheList.True),
            hasInit ? getDefaultLabel : getUndefinedLabel
        );

        // iterdone == false, get current itervalue
        iterator.iteratorValue(nextResult);

        if (hasInit) {
            pandaGen.condition(
                element,
                ts.SyntaxKind.ExclamationEqualsEqualsToken,
                getVregisterCache(pandaGen, CacheList.undefined),
                getDefaultLabel
            )

            pandaGen.loadAccumulator(element, iterator.getCurrentValue());
            pandaGen.branch(element, storeLabel);

            pandaGen.label(element, getDefaultLabel);
            compiler.compileExpression(<ts.Expression>init);

            pandaGen.branch(element, storeLabel);
        } else {
            pandaGen.branch(element, storeLabel);
        }

        pandaGen.label(element, getUndefinedLabel);
        pandaGen.loadAccumulator(element, getVregisterCache(pandaGen, CacheList.undefined));

        pandaGen.label(element, storeLabel);
        lRef.setValue();
    }
    // end of try
    pandaGen.label(arr, tryEndLabel);

    pandaGen.loadAccumulator(arr, iterator.getCurrrentDone());
    pandaGen.condition(
        arr,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        getVregisterCache(pandaGen, CacheList.True),
        normalClose
    );

    // nothing need to be done
    pandaGen.branch(arr, endLabel);

    // if any exception ocurrs, store it, close iterator and rethrow exception
    pandaGen.label(arr, catchBeginLabel);
    pandaGen.storeAccumulator(arr, exception);
    iterator.close();
    pandaGen.loadAccumulator(arr, exception);
    pandaGen.throw(arr);
    pandaGen.label(arr, catchEndLabel);

    // if iterDone is not true after normal completion, close iterator
    pandaGen.label(arr, normalClose);
    iterator.close();

    pandaGen.label(arr, endLabel);
    pandaGen.freeTemps(iter, nextMethod, iterDone, iterValue, nextResult, exception);
}

function emitRestElement(restElement: ts.BindingName | ts.Expression, iterator: Iterator, iterResult: VReg,
                         pandaGen: PandaGen, compiler: Compiler, isDeclaration: boolean) {
    let arrayObj = pandaGen.getTemp();
    let index = pandaGen.getTemp();

    let nextLabel = new Label();
    let doneLabel = new Label();

    // create left reference for rest element
    let target = restElement;
    let lRef = LReference.generateLReference(compiler, target, isDeclaration);

    // create an empty array first
    pandaGen.createEmptyArray(restElement);
    pandaGen.storeAccumulator(restElement, arrayObj);

    // index = 0
    pandaGen.loadAccumulatorInt(restElement, 0);
    pandaGen.storeAccumulator(restElement, index);

    pandaGen.label(restElement, nextLabel);

    // if iterDone == true, done with the process of building array
    iterator.iteratorComplete(iterResult);
    pandaGen.condition(
        restElement,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        getVregisterCache(pandaGen, CacheList.True),
        doneLabel
    );

    // get value from iter and store it to arrayObj
    // getIterValue(iterRecord, iterValue, pandaGen, restElement);
    iterator.iteratorValue(iterResult);
    pandaGen.storeObjProperty(restElement, arrayObj, index);

    // index++
    pandaGen.loadAccumulatorInt(restElement, 1);
    pandaGen.binary(restElement, ts.SyntaxKind.PlusToken, index);
    pandaGen.storeAccumulator(restElement, index);

    iterator.callNext(iterResult);
    pandaGen.branch(restElement, nextLabel);

    pandaGen.label(restElement, doneLabel);
    pandaGen.loadAccumulator(restElement, arrayObj);
    
    lRef.setValue();

    pandaGen.freeTemps(arrayObj, index);
}

function compileObjectDestructuring(obj: ts.ObjectBindingOrAssignmentPattern, pandaGen: PandaGen, compiler: Compiler) {
    let value = pandaGen.getTemp();
    pandaGen.storeAccumulator(obj, value);

    let isDeclaration: boolean = ts.isObjectLiteralExpression(obj) ? false : true;
    let elements = isDeclaration ? (<ts.ObjectBindingPattern>obj).elements : (<ts.ObjectLiteralExpression>obj).properties;
    let elementsLength = elements.length;

    // check if value is coercible
    if (elementsLength == 0 ||
        (isDeclaration && isRestElement(<ts.BindingElement>elements[0])) ||
        (!isDeclaration && ts.isSpreadAssignment(elements[0]))) {
        let notNullish: Label = new Label();
        let nullLish: Label = new Label();

        pandaGen.loadAccumulator(obj, value);
        pandaGen.condition(obj, ts.SyntaxKind.ExclamationEqualsEqualsToken, getVregisterCache(pandaGen, CacheList.Null), nullLish);
        pandaGen.loadAccumulator(obj, value);
        pandaGen.condition(obj, ts.SyntaxKind.ExclamationEqualsEqualsToken, getVregisterCache(pandaGen, CacheList.undefined), nullLish);
        pandaGen.branch(obj, notNullish);

        // value == null or undefined, throw error
        pandaGen.label(obj, nullLish);
        pandaGen.throwObjectNonCoercible(obj);

        pandaGen.label(obj, notNullish);
    }

    // create before to store the properties
    let properties: Array<VReg> = new Array<VReg>();
    let excludedProp: Array<VReg> = new Array<VReg>();

    for (let i = 0; i < elementsLength; i++) {
        let tmp = pandaGen.getTemp();
        properties.push(tmp);
    }

    for (let i = 0; i < elementsLength; i++) {
        let element = elements[i];

        // emit rest property
        if ((isDeclaration && isRestElement(<ts.BindingElement>element)) ||
            (!isDeclaration && ts.isSpreadAssignment(element))) {
            emitRestProperty(<ts.BindingElement | ts.SpreadAssignment>element, excludedProp, value, pandaGen, compiler);
            break;
        }

        excludedProp.push(properties[i]);

        let loadedValue: VReg = pandaGen.getTemp();
        let key: ts.Expression | ts.ComputedPropertyName;
        let target: ts.Node = element;
        let init: ts.Expression | undefined = undefined;
        let hasInit: boolean = false;

        if (isDeclaration) {
            let bindingElement = <ts.BindingElement>element;
            target = bindingElement.name;

            if (bindingElement.propertyName) {
                key = <ts.Expression>bindingElement.propertyName;
            } else {
                key = <ts.Identifier>bindingElement.name;
            }

            // obtain init if exists
            if (bindingElement.initializer) {
                hasInit = true;
                init = bindingElement.initializer;
            }
        } else {
            if (ts.isPropertyAssignment(element)) {
                key = <ts.Expression>element.name;

                let targetExpr = element.initializer;
                if (ts.isBinaryExpression(targetExpr)) {
                    if (targetExpr.operatorToken.kind != ts.SyntaxKind.EqualsToken) {
                        throw new Error("Invalid destructuring target");
                    }

                    target = targetExpr.left;
                    init = targetExpr.right;
                } else {
                    target = targetExpr;
                }
            } else if (ts.isShorthandPropertyAssignment(element)) {
                key = element.name;
                target = element.name;
                init = element.objectAssignmentInitializer ? element.objectAssignmentInitializer : undefined;
            } else {
                throw new Error("Invalid destructuring target");
            }
        }

        // compile key 
        if (ts.isComputedPropertyName(key)) {
            compiler.compileExpression(key.expression);
        } else {
            // compiler.compileExpression(key);
            if (ts.isIdentifier(key)) {
                let keyName = jshelpers.getTextOfIdentifierOrLiteral(key);
                pandaGen.loadAccumulatorString(key, keyName);
            } else {
                compiler.compileExpression(key);
            }
        }
        pandaGen.storeAccumulator(key, properties[i]);

        // create left reference
        let lRef = LReference.generateLReference(compiler, target, isDeclaration);

        // load obj property from rhs, return undefined if no corresponding property exists
        pandaGen.loadObjProperty(element, value, properties[i]);
        pandaGen.storeAccumulator(element, loadedValue);

        let getDefaultLabel = new Label();
        let storeLabel = new Label();

        if (hasInit) {
            pandaGen.condition(
                element,
                ts.SyntaxKind.ExclamationEqualsEqualsToken,
                getVregisterCache(pandaGen, CacheList.undefined),
                getDefaultLabel
            );

            // load the new value
            pandaGen.loadAccumulator(element, loadedValue);
            pandaGen.branch(element, storeLabel);

            // use default value
            pandaGen.label(element, getDefaultLabel);
            compiler.compileExpression(<ts.Expression>init);

            pandaGen.label(element, storeLabel);
        }

        lRef.setValue();
        pandaGen.freeTemps(loadedValue);
    }

    pandaGen.freeTemps(value, ...properties);
}

function emitRestProperty(restProperty: ts.BindingElement | ts.SpreadAssignment, excludedProp: Array<VReg>,
                          obj: VReg, pandaGen: PandaGen, compiler: Compiler) {
    let isDeclaration = ts.isBindingElement(restProperty) ? true : false;
    let target = isDeclaration ? (<ts.BindingElement>restProperty).name : (<ts.SpreadAssignment>restProperty).expression;
    let lRef = LReference.generateLReference(compiler, target, true);
    let undefinedReg = pandaGen.getTemp();

    if (excludedProp.length == 0) {
        pandaGen.loadAccumulator(restProperty, getVregisterCache(pandaGen, CacheList.undefined));
        pandaGen.storeAccumulator(restProperty, undefinedReg);
        excludedProp.push(undefinedReg);
    }

    // Create a Object with the information of excluded properties
    pandaGen.createObjectWithExcludedKeys(restProperty, obj, excludedProp);

    lRef.setValue();
    pandaGen.freeTemps(undefinedReg);
}

function isRestElement(node: ts.BindingElement) {
    if (node.dotDotDotToken) {
        return true;
    }

    return false;
}