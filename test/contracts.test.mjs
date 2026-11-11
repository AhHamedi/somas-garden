import test from "node:test";
import assert from "node:assert/strict";
import { validateSource } from "../lib/runner.mjs";
import { readFileSync } from "node:fs";
test("upload contract rejects oversized, missing and incompatible entry points", () => {
  validateSource(readFileSync(new URL("../public/example.go", import.meta.url), "utf8"));
  for (const s of [
    null,
    "",
    "package potato\nfunc Decide(v View) Action{return Action{}}",
    "package main\nfunc main(){}\nfunc Decide(v View) Action{return Action{}}",
    "package main\n" + " ".repeat(20500),
  ])
    assert.throws(() => validateSource(s));
});

import { readRun } from "../lib/roster.mjs";
import { sourceVersion } from "../lib/runner.mjs";

test("configured seats retain identity and cannot inject runner credentials or a URL", () => {
  const seat = {
    id: "sage",
    name: "Sage",
    strategy: "cooperate",
    startingPantry: 0,
    appearance: 0,
  };
  assert.deepEqual(
    readRun({
      settings: {},
      roster: [{ ...seat, url: "https://example.invalid", token: "x" }],
      seed: 0,
    }),
    {
      seed: 0,
      settings: {},
      seats: [seat],
    },
  );
  for (const roster of [
    [],
    [seat, seat],
    [{ ...seat, startingPantry: -1 }],
    [{ ...seat, builder: {} }],
    [{ ...seat, strategy: "constructor" }],
  ])
    assert.throws(() => readRun({ settings: {}, roster }));
  assert.equal(readRun({ agents: [], seed: 0 }).settings, undefined);
});

test("Go source opts into new fields before its package declaration", () => {
  assert.equal(sourceVersion("package main\n// somas:api=2"), 1);
  assert.equal(sourceVersion("// somas:api=2\npackage main"), 2);
  assert.throws(() => sourceVersion("// somas:api=5\npackage main"));
});
