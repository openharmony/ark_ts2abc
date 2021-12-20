class C {
    s: string;
    constructor(input: string) {
        this.s = input;
    }
}

function foo() : void {
    var c = new C("hello, world");
}
