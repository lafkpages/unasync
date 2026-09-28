import { afterAll, describe, expect, test } from "bun:test";

import { parse } from "@babel/parser";

import { findFunctionsToUnasync, unasyncTraversal } from "../src/ast";
import { generateUnprocessed } from "../src/ast/generate";
import { applySplices, formatWithPrettier } from "../src/postprocess";
import { cleanUpTypeChecking } from "./typecheck";

async function unasync(js: string) {
  const ast = parse(js, {
    sourceType: "module",
    plugins: ["typescript"],
    locations: true,
  });

  const [functionsToUnasync] = findFunctionsToUnasync(ast);

  const splices = unasyncTraversal(ast, js, functionsToUnasync);

  const unprocessed = generateUnprocessed(ast);
  const postprocessed = applySplices(unprocessed, splices);
  const formatted = await formatWithPrettier(postprocessed);

  return formatted;
}

describe("basic async functions", () => {
  test("basic unexported async function with no parameters", async () => {
    const unasynced = await unasync(`\
      async function fooAsync() {
        return 1;
      }
      declare const foo: Unasynced<typeof fooAsync>;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();
  });

  test("basic exported async function with no parameters", async () => {
    const unasynced = await unasync(`\
      export async function fooAsync() {
        return 1;
      }
      export declare const foo: Unasynced<typeof fooAsync>;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();
  });

  test("basic exported async function with unrelated parameters", async () => {
    const unasynced = await unasync(`\
      export async function fooAsync(x: number) {
        return x + 1;
      }
      export declare const foo: Unasynced<typeof fooAsync>;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();
  });

  test("basic exported async function with sync callback parameter", async () => {
    const unasynced = await unasync(`\
      export async function fooAsync(
        callback: () => unknown,
      ) {
        return await callback();
      }
      export declare const foo: Unasynced<typeof fooAsync>;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();
  });

  test("basic unexported async function with async callback parameter", async () => {
    const unasynced = await unasync(`\
      async function fooAsync(
        callback: () => Promise<unknown>,
      ) {
        return await callback();
      }
      declare const foo: Unasynced<typeof fooAsync>;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();
  });

  test("basic exported async function with async callback parameter", async () => {
    const unasynced = await unasync(`\
      export async function fooAsync(
        callback: () => Promise<unknown>,
      ) {
        return await callback();
      }
      export declare const foo: Unasynced<typeof fooAsync>;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();
  });

  test("basic unexported async function with async callback parameter with unasynced exported", async () => {
    const unasynced = await unasync(`\
      async function fooAsync(
        callback: () => Promise<unknown>,
      ) {
        return await callback();
      }
      export declare const foo: Unasynced<typeof fooAsync>;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();
  });

  test("basic unexported async function with async callback parameter with unasynced default-exported", async () => {
    const unasynced = await unasync(`\
      async function fooAsync(
        callback: () => Promise<unknown>,
      ) {
        return await callback();
      }
      declare const foo: Unasynced<typeof fooAsync>;
      export default foo;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();
  });
});

describe("invalid inputs", () => {
  test("await is not allowed on non-call expressions", () => {
    expect(
      unasync(`\
        async function fooAsync(
          callback: () => Promise<unknown>,
        ) {
          const p = callback();
          return await p;
        }
        declare const foo: Unasynced<typeof fooAsync>;
      `),
    ).rejects.toThrowError();
  });

  test("await is not allowed on functions not passed via parameters", () => {
    expect(
      unasync(`\
        const helper: (n: number) => Promise<number> = async (n) => n + 1;

        export async function myAsyncFn() {
          return await helper(1);
        }
        export declare const mySyncFn: Unasynced<typeof myAsyncFn>;
      `),
    ).rejects.toThrowError();
  });
});

describe("formatting", () => {
  test("newlines are preserved", async () => {
    // All the splicing and the retainLines shenanigans are exactly for this

    const unasynced = await unasync(`\
      import type { MaybePromise } from "bun";

      export async function exampleFnAsync(
        callback: (x: number) => MaybePromise<number>,
      ): Promise<number> {
        // do sync stuff
        const x = 1;

        // do async stuff
        const result = await callback(x);
        return result;
      }
      export declare const exampleFn: Unasynced<typeof exampleFnAsync>;

      type SS = Promise<string>;

      export async function anotherAsync(): SS {
        return "hi";
      }
      export declare const anotherSync: Unasynced<typeof anotherAsync>;
    `);

    await expect(unasynced).toTypeCheck();
    expect(unasynced).toMatchSnapshot();

    // Newlines around `type SS = ...` are preserved
    expect(unasynced).toInclude("\n\ntype SS = Promise<string>;\n\n");

    // No newlines between async and sync functions
    expect(unasynced).not.toMatch(/^}\n{2,}export/m);
  });
});

test("edge cases", () => {
  expect(unasync("")).resolves.toBe("");
  expect(unasync("  ")).resolves.toBe("");
  expect(unasync(";")).resolves.toBe("");
});

afterAll(cleanUpTypeChecking);
