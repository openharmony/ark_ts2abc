import { AnotherClassB, AnotherClassB as ClassC } from "./test_another_export";
class DistinctClass {
    constructor() {
        this.name = "I'm in export";
    }
}
import * as anotherExport_1 from "./test_another_export";
// --- 1. ExportDeclaration ---
// 1.1 re-export
export { anotherExport_1 as anotherExport };
export { AnotherClassA, AnotherClassB, DistinctClass } from "./test_another_export";
export { default as anotherDefaultClass } from "./test_another_export";
// 1.2 named exporting via a clause
class ClassE {
}
;
export { ClassE };
export { ClassC, ClassC as ClassD }; //  exporte an imported class
// --- 2. ExportKeyword ---
// 2.1 inline named exports - ClassDeclaration
export class ClassF {
}
;
// export default class {}
// 2.2 inline named exports - VariableStatements
class ClassA {
}
;
export let InstanceA = new ClassA();
export let InstanceB = new AnotherClassB();
export let SomeClass = class {
};
export let SomeClassInst = new class {
};
// export default cLass AnotherDefaultClass{};
// --- 3. ExportAssignment - default export ---
class defaultC {
}
export default defaultC;
// 4. VariableStatement/ClassExpression
//// export class as member of obj
// export default {defaultC, ClassA}
