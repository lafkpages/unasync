import prettierPluginBabel from "prettier/plugins/babel";
import prettierPluginEstree from "prettier/plugins/estree";
import { format } from "prettier/standalone";

export interface Splice {
  line: number;
  text: string;
}

export function applySplices(unprocessedCode: string, splices: Splice[]) {
  const lines = unprocessedCode.split("\n");

  for (const splice of splices.sort((a, b) => b.line - a.line)) {
    lines.splice(splice.line - 1, 0, ...splice.text.split("\n"));
  }

  return lines.join("\n");
}

// https://github.com/prettier/prettier/issues/9114
export async function formatWithPrettier(processedCode: string) {
  return await format(processedCode, {
    parser: "babel-ts",
    plugins: [prettierPluginBabel, prettierPluginEstree],
  });
}
