/**
 * Instances where the declared type is wider than it needs to be
 */

interface TooDee { x: number, y: number };
interface ThreeDee extends TooDee { z: number };


let foo: number | undefined;

foo = 43;
foo = 12;

function init(){
    foo = 32;
}


let threeDee: ThreeDee | TooDee;

threeDee = {
    x: 42,
    y: 12
};
threeDee = {
    x: 111,
    y: 999
};

function bar() {
    threeDee = {
        x: -1,
        y: 534,
    };
}

// Tracking primitives is too pedantic
// These should not be reported
let x: number;
let y: string;
let z: symbol;

const unique = Symbol();

x = 5;
x = 5;
y = "hello";
y = "hello";
z = unique;
z = unique;


function g() {
    x = 5;
    y = "hello";
    z = unique;
}
