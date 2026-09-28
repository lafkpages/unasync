import type { File } from "@babel/types";

import generate from "@babel/generator";

export function generateUnprocessed(ast: File) {
  // retainLines keeps every original line number intact (the transform only
  // edits lines in place), so each marker comment lands on its original line
  // and the async originals can be spliced in at exactly those lines. Splicing
  // bottom-up keeps earlier line numbers valid.
  return generate(ast, { retainLines: true }).code;
}
