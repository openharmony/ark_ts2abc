class C{
    p1:string;
    p2:number;
    p3:boolean;

    constructor(i1:string,
                i2:number,
                i3:boolean) {
        this.p1=i1;
        this.p2=i2;
        this.p3=i3;
    }
}

function foo() {
    var c = new C("hello", 1, true);
}

foo();
