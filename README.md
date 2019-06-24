# Search TypeScript projects for unsound type casts

## Dependencies
- Bash
- Git
- Node.js / NPM (latest version)
- Yarn `npm install -g yarn`
- TypeScript (latest) `npm install -g typescript`
- TS-node (latest) `npm install -g ts-node`

## Building and running

The program is contained within `index.ts` which is used by mine.bash.  
Running mine.bash will fetch the repositories from repo_list.txt and run `yarn install` if the repos folder is not present.  
After the repositories are fetched, the analysis results will be stored in `results`  
Open this file in VSCode's terminal for hyperlinked source URLs

## Usage

```
Usage: ts-node index.ts [options]

Options:
  -V, --version        output the version number
  -c, --config <path>  Path to a project tsconfig.json file
  -a, --all            Output all results as opposed to only important ones
  -v, --verbose        More output while analysis is taking place
  -e, --no-classes     Don't resolve symbols for property accesses
  -g, --no-globals     Exclude symbols declared in the global/module scope
  -s, --no-strict      Don't require projects to have strictNullChecks (or strictPropertyInitialization if -e not present)
  -h, --help           output usage information
```

## Method

This program was created to find instances in real world code in which interprocedural extensions to tsc would be useful.
It relies on the assumption that developers will follow patterns to bypass TypeScript's typechecking in instances where "they know better than the compiler"
Unfortunately, there are many reasons that developers may want to bypass typechecking and output from this program must be manually inspected.  
  
The patterns recognized by this program are outlined below.

1. Explict initalization marking
Adding an ! after an identifer in a declaration will prevent TypeScript from asserting that a variable has not been initialized.
This program marks symbols that are attached to property and variable declarations that have the token.  

```ts
class Foo {
  x!: number;
  constructor() {
    // Does not complain that `this.x` has not been initialized
  }
}
let x!: number;
x * 2;// Does not complain that x has not been initialized

```

2. Assignment from any/never
Developers also have the option of bypassing initialization checks by assigning a value to a variable that is of any/never type
This tool will mark symbols that have an initialization that contains an explict cast to an unsound type (never/any) and where the entire initialization expression is an unsound type.

```ts
let x: number = 42 as any; // Marked
let y: number = 12 as never; // Marked
let z: number = undefined!; // Marked
let w: number = null!; // Marked

let not: { x: number } = { x: 45 as any }; // Not Marked
```

3. A wider type than neccessary is used
Though still sound, a developer may address shortcomings of the control flow analysis by choosing to declare their variables with a wider type than needed.
This is apparent when all assignments to a variable may be determined statically and use a type that is more narrow than the declared type.
This tool will still mark property assignments even though all assignments to a property cannot be statically determined.
This tool will also not consider that a variable will be initialized with the value `undefined` if the declaration does not have an initialization.

```ts
let x: string | number;
x = 43;
// A string is never assigned to x
```

Because of the limitations of the TypeScript compiler type checking api, this analysis only checkers for union type nodes with undefined / null in them

4. Mutation from within a method/closure
Symbols that are modified within a function that they were not declared inside are marked
```ts
let x!: number;

function mutate() {
  x = 45;
}

// `x` has #1 and #3 and is reported
```


For a symbol to be reported, it must have either one of #1, #2, or #3 (or any combination) and it must have #4
