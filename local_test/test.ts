class C {
    s:string
    constructor(v:any) {
        this.s = v;
    }
}

var c = new C("hello, world");
console.log(c.s);
