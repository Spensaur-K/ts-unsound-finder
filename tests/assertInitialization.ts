/**
 * File asserts that properties are initialized in a class
 */
export class Foo {
    private x: HTMLAllCollection = undefined!;
    private y: HTMLAllCollection = null!;
    private z!: HTMLAllCollection;
    constructor() { }
}

let x: HTMLAllCollection = undefined!;
let y: HTMLAllCollection = null!;
let z!: HTMLAllCollection;
