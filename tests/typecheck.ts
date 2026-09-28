import { expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

declare module "bun:test" {
  interface Matchers<T> {
    toTypeCheck(): Promise<void>;
  }
}

const ROOT = resolve(import.meta.dir, "..");
const TYPECHECK_DIR = join(ROOT, ".typecheck.tmp");

let isTypeCheckingSetUp = false;

function setUpTypeChecking() {
  if (isTypeCheckingSetUp) {
    return;
  }

  mkdirSync(TYPECHECK_DIR, { recursive: true });
  writeFileSync(
    join(TYPECHECK_DIR, "tsconfig.json"),
    JSON.stringify({ extends: "../tsconfig.json" }),
  );

  isTypeCheckingSetUp = true;
}

export function cleanUpTypeChecking() {
  rmSync(TYPECHECK_DIR, { recursive: true, force: true });
  isTypeCheckingSetUp = false;
}

async function typeCheck(js: string) {
  if (!isTypeCheckingSetUp) {
    setUpTypeChecking();
  }

  const path = join(TYPECHECK_DIR, "index.ts");
  await Bun.write(path, js);

  const proc = Bun.spawn({
    cmd: [
      process.execPath,
      "./node_modules/.bin/tsc",
      "--noEmit",
      "--pretty",
      "false",
      "-p",
      TYPECHECK_DIR,
    ],
    cwd: ROOT,
    // stdout: "inherit",
    // stderr: "inherit",
    stdout: null,
    stderr: null,
  });

  const exitCode = await proc.exited;

  return exitCode === 0;
}

expect.extend({
  async toTypeCheck(js: unknown) {
    if (typeof js !== "string") {
      return {
        pass: false,
        message: () => `Expected a string, got ${typeof js}`,
      };
    }

    const ok = await typeCheck(js);

    return {
      pass: ok,
      message: () =>
        ok
          ? "Expected code not to typecheck, but it did"
          : "Expected code to typecheck, but it didn't",
    };
  },
});
