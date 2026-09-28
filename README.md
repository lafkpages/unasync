# unasync

Generate synchronous versions of async TypeScript functions.

You write async functions as usual, and mark where you want a sync twin with a
`declare const` typed as `Unasynced<typeof ...>`. unasync rewrites each async
function into its sync counterpart and writes the result to a `.sync.ts` file
next to the input.

## Why?

Offering both sync and async versions of the same API usually means
maintaining two hand-written copies of the same logic that drift apart over
time. unasync flips that around: write the async version once — it's the
easier one to write, and the one that composes with I/O — and derive the sync
version from it mechanically.

Why not just write a single implementation? TypeScript doesn't allow it:
`await` is only legal inside `async` functions, and an `async` function
always returns a `Promise` — even `async () => 1` returns `Promise<number>`.
Once logic interleaves sync steps with awaited calls, the same body cannot
be both sync and async. The two versions differ only in the `async`/`await`
keywords and in the types — rote, drift-prone duplication that a tool can
generate instead.

The async function stays the single source of truth. Async operations are
injected as parameters, so the sync twin is the same code with the async
dependencies swapped for sync ones — there's no second implementation to keep
in sync by hand.

And since the generated file is meant to be committed and reviewed like any
other source file, unasync preserves comments and formatting rather than
regenerating everything from scratch.

## Usage

```sh
bun src/index.ts path/to/input.ts
```

This writes `path/to/input.sync.ts`. The input must be a `.ts` file.

## Example

Input:

```ts
import type { Unasynced } from "./types";

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
```

Output (`input.sync.ts`) — note the `Unasynced` import and declaration are
gone:

```ts
export async function exampleFnAsync(
  callback: (x: number) => MaybePromise<number>,
): Promise<number> {
  // do sync stuff
  const x = 1;

  // do async stuff
  const result = await callback(x);
  return result;
}
export function exampleFn(
  callback: (x: number) => Awaited<MaybePromise<number>>,
): number {
  // do sync stuff
  const x = 1;

  // do async stuff
  const result = callback(x);
  return result;
}
```

The sync version is emitted where the async function was declared. The
original async source is kept when the function is still referenced elsewhere
(e.g. because it's exported); otherwise only the sync version remains.

## How it works

For every `declare const mySyncFn: Unasynced<typeof myAsyncFn>` in the file,
unasync:

1. Strips `async` from `myAsyncFn` and renames it to `mySyncFn`
2. Unwraps the return type: `Promise<X>` becomes `X`, anything else becomes
   `Awaited<X>`
3. Replaces `await callee(...)` with `callee(...)`, and rewrites the callee's
   parameter type from `(…args) => Promise<R>` to `(…args) => R`
4. Removes the `Unasynced` declaration (and the `Unasynced` type import, if it
   only imports that)
5. Splices the original source text back in so comments and formatting are
   preserved, then formats the result with Prettier

The `Unasynced<T>` helper type lives in [`src/types.ts`](src/types.ts); it
maps promise-returning parameters to their awaited versions and unwraps the
return type, so the async source typechecks while the marker declaration is
still in place. unasync removes both afterwards.

## Rules and limitations

- `await` must be applied to a call expression with a bare identifier callee
  (`await callback(x)`, not `await p` or `await obj.method()`)
- Awaited functions must be parameters of the function being unasynced, typed
  with a TS function type that has a return type
- Generator functions are not supported
- Functions to unasync must be marked `async`
- Exporting the async function via `export default` is not supported
  (`export default mySyncFn` on the sync version is fine)

## Development

```sh
bun install
bun test           # runs the test suite (includes typecheck tests via tsc)
bun run -b format  # prettier
```
