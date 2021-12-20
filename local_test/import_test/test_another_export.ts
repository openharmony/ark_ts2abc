export class AnotherClassA {
    a = this.getA();
    public getA(): number {
        return 3;
    }
}
export class AnotherClassB {}
export class DistinctClass {
    name: string = "I'm in another export";
}

// export default class declarations
export default class AnotherDefaultClass{};