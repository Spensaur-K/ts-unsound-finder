/**
 * File has a function with many closures that mutate variables in the surrounding scope
 */

 function wrapper() {
     let x;
     let y;
     let z;

     function A() {
         x = 43;
     }

     function B() {
         y = "hello";
     }

     function C() {
         z = Symbol("foo");
     }
 }
 