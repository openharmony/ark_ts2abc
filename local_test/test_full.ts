class base {
    constructor() {}
}

class base2 {
    constructor() {}
}

class base3 {}

function newYigeClass () {
    class AA extends base2 implements base, base3 {
        public a: number = 4;
        private readonly b: string;
        protected static c: string;
        private static d: base;

        constructor() {
            super();
            this.b = "hello";
        }

        public getA(): number {
            return this.a;
        }

        private static calSqur(num: number, str: string): base {
            return num;
        }
    }

    let yigeClass = new AA();
    yigeClass.getA();
}
