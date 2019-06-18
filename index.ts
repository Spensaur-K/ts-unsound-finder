"use strict";

import program from "commander";
import * as ts from "typescript";
import * as path from "path";
import assert from "assert";
import { Project, SourceFile, TypeGuards as guard, TypeChecker, PropertyDeclaration, VariableDeclaration, Type } from "ts-morph";

import packageFile from "./package.json";

program
  .version(packageFile.version)
  .option('-c, --config <path>', 'Path to a project tsconfig.json file')
  .parse(process.argv);

assert(program.config, "--config path is required");
program.config = path.resolve(process.cwd(), program.config);

console.log(`Searching using the project file: ${program.config}`);

const config = require(program.config);

const project = new Project({
  tsConfigFilePath: program.config,
});
const checker = project.getTypeChecker();
const tchecker = checker.compilerObject;

const sources = project.getSourceFiles();

function assertInitialization(s: SourceFile) {
  s.getClasses().forEach(classDeclr => {
    classDeclr.getProperties().forEach(checkDeclr);
  });
  s.getVariableDeclarations().forEach(checkDeclr);
  function checkDeclr(declr: PropertyDeclaration | VariableDeclaration) {
    if (declr.getNodeProperty("exclamationToken")) {
      console.log(`// Found explict init assert @ ${s.getFilePath()}:${declr.getStartLineNumber()}`);
    }
    const initializer = declr.getNodeProperty("initializer");
    if (initializer) {
      const type = checker.getTypeAtLocation(initializer);
      const name = isUnsoundType(type);
      debugger;
      if (name) {
        console.log(`// Found explict init assert @ ${s.getFilePath()}:${declr.getStartLineNumber()}`);
      }
    }
  }
}

function explictTypeCast(s: SourceFile) {
  s.forEachChild(function walk(node) {
    if (guard.isAsExpression(node) || guard.isTypeAssertion(node)) {
      const type = tchecker.getTypeFromTypeNode(node.getNodeProperty("type").compilerNode);
      const name = isUnsoundType(type);
      if (name) {
        console.log(`// Found cast to ${name} @ ${s.getFilePath()}:${node.getStartLineNumber()}`);
      }
    }
    node.forEachChild(walk);
  });
}

function analyze(s: SourceFile) {
  console.log(`// Scanning file: ${s.getFilePath()}`);
  assertInitialization(s);
  explictTypeCast(s);
}

function isUnsoundType(t: ts.Type | Type<ts.Type>) {
  if ("compilerType" in t) t = t.compilerType;
  switch ((t as any).intrinsicName) {
    case "any":
    case "unknown":
    case "never":
      return (t as any).intrinsicName;
    default:
      return;
  }
}

sources.forEach(analyze);
