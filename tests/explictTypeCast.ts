/**
 * File uses explict casting when the result of an expression isn't unknown or `any`
 */

export default {};

declare const something: any;
declare const somethingMysterious: unknown;
declare const somethingStringy: string;

let x: number = something;
let y: number = somethingMysterious as any;
let z: number = somethingStringy as unknown as number;
let w: number = somethingStringy as never as number;

let g: number = something;
let a: number = <any>somethingMysterious;
let b: number = <number><unknown>somethingStringy;
let h: number = <number><never>somethingStringy;
