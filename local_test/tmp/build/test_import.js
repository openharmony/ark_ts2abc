// 1. default import
import DefaultClassA from "./test_export.js";
// 2. namespace import
import * as Imported from "./test_export.js";
import { anotherExport as anotherImport } from "./test_export.js";
// 3. named import
import { InstanceA, InstanceB, } from "./test_export.js";
// 3.1 rename imports:
import { ClassD as ClassDDD, default as defaultAlt, anotherDefaultClass as defualtClassAlt } from "./test_export.js";
// 4. empty import
import "./test_export.js";
// 5. combining default import with namespace:
import DefaultClassB, * as importedAlt from "./test_export.js";
// 6. combining default with named imports:
import DefaultClassC, { ClassC, ClassE } from "./test_export.js";
/////////////
let da = DefaultClassA;
let ita = Imported.AnotherClassA;
let ae = anotherImport.AnotherClassA;
let ia = InstanceA;
let ib = InstanceB;
let cddd = ClassDDD;
let dat = defaultAlt;
let dcat = defualtClassAlt;
let dcb = DefaultClassB;
let italt = importedAlt.AnotherClassA;
let dcc = DefaultClassC;
let cc = ClassC;
let cd = ClassE;
