import { afterAll, expect, test } from "bun:test";

import { cleanUpTypeChecking } from "./typecheck";

test("valid TS typechecks", async () => {
  await expect("1 + 1").toTypeCheck();
  await expect('"1" + "2"').toTypeCheck();
});

test("invalid TS does not typecheck", async () => {
  await expect("[] + {}").not.toTypeCheck();
  await expect("process.exit([])").not.toTypeCheck();
});

afterAll(cleanUpTypeChecking);
