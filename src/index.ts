import { parse } from "@babel/parser";

import { findFunctionsToUnasync, unasyncTraversal } from "./ast";
import { generateUnprocessed } from "./ast/generate";
import { applySplices, formatWithPrettier } from "./postprocess";

const inputFilePath = process.argv[1];
if (!inputFilePath) {
  console.error("error: missing input file path.");
  process.exit(1);
}

const outputFilePath = inputFilePath.replace(/\.ts$/i, ".sync.ts");
if (outputFilePath === inputFilePath) {
  console.error("error: input file must be a TypeScript file.");
  process.exit(1);
}

const inputFile = Bun.file(inputFilePath);
const inputContent = await inputFile.text();

const ast = parse(inputContent, {
  sourceType: "module",
  plugins: ["typescript"],
  locations: true,
});

const functionsToUnasync = findFunctionsToUnasync(ast);

const splices = unasyncTraversal(ast, inputContent, functionsToUnasync);

const unasyncedContentUnprocessed = generateUnprocessed(ast);
const unasyncedContentUnformatted = applySplices(
  unasyncedContentUnprocessed,
  splices,
);

const unasyncedContentFormatted = await formatWithPrettier(
  unasyncedContentUnformatted,
);

const outputFile = Bun.file(outputFilePath);
await outputFile.write(unasyncedContentFormatted);
