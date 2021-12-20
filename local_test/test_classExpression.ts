let yigeClass = class AA {
    public a: number = 4;
    private readonly b: string;

    constructor() {
        this.b = "hello";
    }

    public getA(): number {
        return this.a;
    }
}

