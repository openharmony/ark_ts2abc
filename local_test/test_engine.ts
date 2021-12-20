

var str:string = "hello ,world";
class Car { 
    // 字段 
    engine:string; 
 
    // 构造函数 
    constructor(engine:string) { 
        this.engine = engine 
    }  
 
    // 方法 
    disp():void { 
        console.log("发动机为 :   "+this.engine) 
    } 
}

class Car2 { 
    // 字段 
    engine2:string; 
 
    // 构造函数 
    constructor(engine:string) { 
        this.engine2 = engine 
    }  
 
    // 方法 
    disp():void { 
        console.log("发动机为 :   "+this.engine2) 
    } 
}

class Carage { 
    // 字段 
    age:number; 
 
    // 构造函数 
    constructor(age:number) { 
        this.age = age 
    }  
 
    // 方法 
    disp():void { 
        console.log("年限 :   "+this.age) 
    } 
}

var obj = new Car("Engine 1")
var obj3= new Carage(10)
// console.log(f(34))
