export class AnotherClassA {
    constructor() {
        this.a = this.getA();
    }
    getA() {
        return 3;
    }
}
export class AnotherClassB {
}
export class DistinctClass {
    constructor() {
        this.name = "I'm in another export";
    }
}
// export default class declarations
export default class AnotherDefaultClass {
}
;
