import program from "commander";
import * as ts from "typescript";
import * as path from "path";
import assert from "assert";
import { Project, SourceFile, TypeGuards as guard, TypeChecker, PropertyDeclaration, VariableDeclaration, Type, Symbol as MorphSymbol, Node, Identifier, Expression, BinaryExpression, FunctionLikeDeclaration } from "ts-morph";
import * as tsm from "ts-morph";

import packageFile from "./package.json";


// Expose some internal API... I'm Sorry :'(
declare module "typescript" {
  export interface SymbolWalker {
    /** Note: Return values are not ordered. */
    walkType(root: Type): { visitedTypes: ReadonlyArray<Type>, visitedSymbols: ReadonlyArray<Symbol> };
    /** Note: Return values are not ordered. */
    walkSymbol(root: Symbol): { visitedTypes: ReadonlyArray<Type>, visitedSymbols: ReadonlyArray<Symbol> };
  }
  export interface Type {
    intrinsicName?: string;
  }
  export interface TypeChecker {
    getSymbolWalker(accept?: (Symbol) => boolean): SymbolWalker;
    getAnyType(): Type;
    getStringType(): Type;
    getNumberType(): Type;
    getBooleanType(): Type;
    getFalseType(fresh?: boolean): Type;
    getTrueType(fresh?: boolean): Type;
    getVoidType(): Type;
    getUndefinedType(): Type;
    getNullType(): Type;
    getESSymbolType(): Type;
    getNeverType(): Type;
  }
}

program
  .version(packageFile.version)
  .option("-c, --config <path>", "Path to a project tsconfig.json file")
  .option("-a, --all", "Output all results as opposed to only important ones")
  .option("-v, --verbose", "More output while analysis is taking place")
  .option("-e, --no-classes", "Don't resolve symbols for property accesses")
  .option("-g, --no-globals", "Exclude symbols declared in the global/module scope")
  .option("-s, --no-strict", "Don't require projects to have strictNullChecks (or strictPropertyInitialization if -e not present)")
  .parse(process.argv);

assert(program.config, "--config path is required");
program.config = path.resolve(process.cwd(), program.config);

interface Occurrence {
  file: string;
  line: number;
  repr: string;
}
function createOccurrence(file: string, line: number, repr: string): Occurrence {
  return { file, line, repr };
}
interface SuspectSymbol {
  symbol: MorphSymbol;
  // Initialization of this symbol that bypassed type checker
  unsoundInit: Occurrence[];
  // A type cast which bypasses type checking
  explictTypeCast: Occurrence[];
  // A wider type than neccessary is used
  widerType: Occurrence[];
  // Type of symbol is modified from a closure which uses it nonlocally
  closureMutate: Occurrence[];
}
function createSuspect(symbol: MorphSymbol): SuspectSymbol {
  return {
    symbol,
    unsoundInit: [],
    explictTypeCast: [],
    widerType: [],
    closureMutate: [],
  };
}
function suspectIsImportant(suspect: SuspectSymbol): boolean {
  if (suspect.closureMutate.length === 0) {
    return false;
  }
  if (suspect.explictTypeCast.length === 0 && suspect.unsoundInit.length === 0) {
    return false;
  }
  return true;
}
type Evidence = Exclude<keyof SuspectSymbol, "symbol">;
function addEvidence(type: Evidence, node: Node): void {
  const { symbol } = getSharedSymbol(node);
  if (!symbol) {
    return;
  }
  if (!program.globals) {
    const scope = findScope(node);
    if (!scope) {
      return;
    }
  }
  let suspect = suspects.get(symbol);
  if (!suspect) {
    suspect = createSuspect(symbol);
    suspects.set(symbol, suspect);
  }
  suspect[type].push(createOccurrence(
    node.getSourceFile().getFilePath(),
    node.getStartLineNumber(),
    node.print(),
  ));
}
verbose(`// Using the project file: ${program.config}`);

const project = new Project({
  tsConfigFilePath: program.config,
});
const config = project.compilerOptions.get();
if (program.strict) {
  if (!config.strictNullChecks && !config.strict && (!program.classes || config.strictPropertyInitialization)) {
    process.exit();
  }
}

const checker = project.getTypeChecker();
const tchecker = checker.compilerObject;
const symbolWalker = tchecker.getSymbolWalker();
const sources = project.getSourceFiles();
const suspects = new Map<MorphSymbol, SuspectSymbol>();

sources.forEach(analyze);
printResults();

function assertInitialization(s: SourceFile) {
  s.getClasses().forEach(classDeclr => {
    classDeclr.getProperties().forEach(checkDeclr);
  });
  s.getVariableDeclarations().forEach(checkDeclr);
  function checkDeclr(declr: PropertyDeclaration | VariableDeclaration) {
    if (declr.getNodeProperty("exclamationToken")) {
      addEvidence("unsoundInit", declr);
      return;
    }
    const initializer = declr.getNodeProperty("initializer");
    if (initializer) {
      const type = checker.getTypeAtLocation(initializer);
      if (isUnsoundType(type)) {
        addEvidence("unsoundInit", declr);
      }
    }
  }
}

function explictTypeCast(s: SourceFile) {
  s.forEachChild(function walk(node) {
    if (guard.isAsExpression(node) || guard.isTypeAssertion(node)) {
      const type = tchecker.getTypeFromTypeNode(node.getNodeProperty("type").compilerNode);
      // We end up with way too many irrelevant results without this filter
      const { right } = getAssignmentFromRightSubExpression(node);
      if (right) {
        const finalType = checker.getTypeAtLocation(right).compilerType;
        if (type === finalType) {
          addEvidence("explictTypeCast", node);
        }
      }
    }
    node.forEachChild(walk);
  });
}

function widerType(s: SourceFile): void {
  s.forEachChild(function walk(node) {
    locateSymbol: {
      const { symbol } = getSharedSymbol(node);
      if (!symbol) {
        break locateSymbol;
      }
      const unsound = symbol.getDeclarations().some(declr => declr === node && isUnsoundUnion(declr.getType()));
      if (!unsound) {
        break locateSymbol;
      }
      const muts = getAllMutations(s, symbol);
      const shouldReport = !muts.some(m => isUnsoundType(m.getType()));
      if (!shouldReport) {
        break locateSymbol;
      }
      addEvidence("widerType", node);
    }
    node.forEachChild(walk);
  });
}

function findScope(n: Node): FunctionLikeDeclaration | undefined {
  return n.getFirstAncestor(a => {
    if (guard.isFunctionLikeDeclaration(a) || guard.isClassDeclaration(a)) {
      return true;
    }
    return false;
  }) as FunctionLikeDeclaration | undefined;
}

function closureMutate(s: SourceFile) {
  s.forEachChild(function walk(node) {
    binexp: if (guard.isBinaryExpression(node) && node.getOperatorToken().compilerNode.kind === ts.SyntaxKind.EqualsToken) {
      const { symbol } = getSharedSymbol(node);
      if (!symbol) {
        break binexp;
      }
      const declr = symbol.getDeclarations()[0];
      if (!declr) {
        break binexp;
      }
      const declrScope = findScope(declr);
      const nodeScope = findScope(node);
      if (!declrScope && !nodeScope) {
        break binexp;
      }

      if (declrScope != nodeScope) {
        addEvidence("closureMutate", node);
      }
    }
    node.forEachChild(walk);
  });
}

function analyze(s: SourceFile) {
  verbose(`// Scanning file: ${s.getFilePath()}`);
  assertInitialization(s);
  explictTypeCast(s);
  widerType(s);
  closureMutate(s);
}

function printResults() {
  for (const [, result] of suspects) {
    if (program.all || suspectIsImportant(result)) {
      const declr = result.symbol.getDeclarations()[0]!;
      console.log(`Summary: ${declr.print()} from ${declr.getSourceFile().getFilePath()}:${declr.getStartLineNumber()}`);
      for (const r of result.unsoundInit) {
        console.log(`- Unsound init \`${r.repr}\` ${r.file}:${r.line}`);
      }
      for (const r of result.explictTypeCast) {
        console.log(`- Explcit type cast \`${r.repr}\` ${r.file}:${r.line}`);
      }
      for (const r of result.widerType) {
        console.log(`- Wider Type used than needed \`${r.repr}\` ${r.file}:${r.line}`);
      }
      for (const r of result.closureMutate) {
        console.log(`- Closure mutate \`${r.repr}\` ${r.file}:${r.line}`);
      }
    }
  }
}

function isUnsoundType(t: ts.Type | Type<ts.Type>): boolean {
  if ("compilerType" in t) t = t.compilerType;
  switch (t.intrinsicName) {
    case "any":
    case "unknown":
    case "never":
      return true;
    default:
      return false;
  }
}

function isUnsoundUnion(t: ts.Type | tsm.Type): boolean {
  if ("compilerType" in t) t = t.compilerType;
  return symbolWalker.walkType(t).visitedTypes.some(isUnsoundType);
}

interface SharedSymbol {
  symbol?: MorphSymbol;
  id?: tsm.Identifier;
  assignedValue?: Expression;
}

function getSharedSymbol(n: Node): SharedSymbol {
  const isProp = program.classes && guard.isPropertyDeclaration(n);
  declr: if (guard.isVariableDeclaration(n) || isProp) {
    const nn = (<VariableDeclaration | PropertyDeclaration>n);
    const id = nn.getNodeProperty("name");
    const symbol = checker.getSymbolAtLocation(id);
    if (symbol) {
      const id = nn.getNodeProperty("name");
      if (!guard.isIdentifier(id)) {
        break declr;
      }
      return {
        symbol,
        id,
        assignedValue: nn.getNodeProperty("initializer"),
      };
    }
  }
  isexpr: if (guard.isExpression(n)) {
    const { symbol, left, assignment, right } = getAssignmentFromRightSubExpression(n);
    if (!program.classes) {
      if (left && guard.isPropertyAccessExpression(left)) {
        break isexpr;
      }
      if (assignment && guard.isPropertyAssignment(assignment)) {
        break isexpr;
      }
    }
    let id;
    if (left && guard.isIdentifier(left)) {
      id = left;
    }
    if (symbol) {
      return {
        symbol,
        id,
        assignedValue: right,
      };
    }
  }
  return {};
}

function getAllMutations(source: tsm.SourceFile, symbol: tsm.Symbol): tsm.Node[] {
  const mutations: tsm.Node[] = [];
  source.forEachChild(function walk(node) {
    const { symbol, assignedValue } = getSharedSymbol(node);
    if (symbol && assignedValue) {
      mutations.push(assignedValue);
    }
    node.forEachChild(walk);
  });
  return mutations;
}

type Assignment = VariableDeclaration | PropertyDeclaration | BinaryExpression;
interface AssignmentHelper {
  symbol: MorphSymbol | undefined;
  assignment: Assignment;
  left: Node;
  right: Expression;
}

function getAssignmentFromRightSubExpression(e: Expression): Partial<AssignmentHelper> {
  const result: Partial<AssignmentHelper> = {};
  if (!walk(e)) {
    if (!e.getFirstAncestor(walk)) {
      return {};
    }
  }

  return result;

  function walk(node): boolean {
    if (guard.isBinaryExpression(node)) {
      if (node.getOperatorToken().compilerNode.kind === ts.SyntaxKind.EqualsToken) {
        result.assignment = node;
        result.symbol = node.getLeft().getSymbol();
        result.right = node.getRight();
        result.left = node.getLeft();
        return true;
      }
    }
    if (guard.isVariableDeclaration(node) || guard.isPropertyDeclaration(node)) {
      result.symbol = node.getNodeProperty("name").getSymbol();
      result.assignment = node;
      result.right = node.getInitializer()!;
      result.left = node.getNodeProperty("name");
      return true;
    }
    return false;
  }
}

function verbose(...consoleArgs: Parameters<typeof console.error>): ReturnType<typeof console.error> | void {
  if (program.verbose) {
    return console.error(...consoleArgs);
  }
}
