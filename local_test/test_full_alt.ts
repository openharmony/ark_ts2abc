export class AA extends base2 implements base{
    public a: number = 4;
    private readonly b: string;
    protected static c: string;
    private d: base;

    constructor() {
        super();
        this.b = "hello";
        AA.c = "world";
    }

    public static getC(): string {
        return AA.c;
    }

    private calSqur(num: number, str: string): base {
        return this.d;
    }
}

class base {
    constructor() {}
}

class base2 {
    constructor() {}
}

function newYigeClass () {
    let bigpig = new AA();
}

