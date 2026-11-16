import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  STATUTES,
  CHARTER,
  DECISIONS,
  fill,
  statute,
  statuteOfMotion,
} from "../public/game/statutes.js";

// The engine's catalogue is the source of truth for what can be voted on.
const source = await readFile(
  new URL("../pkg/society/politics_types.go", import.meta.url),
  "utf8",
);
const catalogue = [
  ...source.matchAll(
    /\{"(\w+)", "[^"]*", "[^"]*", "(local|federation)", (nil|\[\]string\{([^}]*)\})/g,
  ),
].map((m) => ({
  key: m[1],
  scope: m[2],
  modes: m[4] ? m[4].split(",").map((x) => x.trim().replace(/"/g, "")) : [],
}));

test("every catalogue policy has a statute with every engine option", () => {
  assert.ok(catalogue.length >= 28, "catalogue parsed");
  for (const def of catalogue) {
    const st = statute(def.key, def.scope);
    assert.ok(st, `${def.scope} ${def.key} is in the statute book`);
    const modes = st.options.map((o) => o.mode);
    for (const mode of def.modes)
      assert.ok(modes.includes(mode), `${def.key} offers ${mode}`);
    for (const mode of modes)
      if (mode) assert.ok(def.modes.includes(mode), `${def.key} does not invent ${mode}`);
  }
  assert.equal(
    STATUTES.length + CHARTER.length,
    catalogue.length,
    "no statute without an engine policy",
  );
});

test("options only name parameters the statute defines", () => {
  for (const st of [...STATUTES, ...CHARTER])
    for (const o of st.options)
      for (const p of o.params || [])
        assert.ok(st.params[p], `${st.key}.${o.mode} parameter ${p}`);
});

test("one-off decisions are engine proposal kinds", async () => {
  const politics = await readFile(
    new URL("../pkg/society/politics.go", import.meta.url),
    "utf8",
  );
  for (const d of DECISIONS) assert.match(politics, new RegExp(`"${d.kind}"`), d.kind);
});

test("settings fill placeholders and motions map to their law", () => {
  assert.equal(
    fill("up to {harvestLimit} a day, {proposalCost} mind", {
      harvestLimit: 4,
      proposalCost: 1,
    }),
    "up to 4 a day, 1 mind",
  );
  assert.equal(fill("{missing}", {}), "{missing}");
  assert.equal(
    statuteOfMotion({ input: { kind: "policy", key: "quota:12" } }).key,
    "quota",
  );
  assert.equal(statuteOfMotion({ input: { kind: "office", target: 3 } }).key, "office");
  assert.equal(
    statuteOfMotion({ input: { kind: "federationPolicy", key: "gifts" } }).scope,
    "federation",
  );
  assert.equal(statuteOfMotion({ input: { kind: "found" } }), null);
});

test("the influence basis lists every source the engine counts", async () => {
  const go = await readFile(
    new URL("../pkg/society/contributions.go", import.meta.url),
    "utf8",
  );
  const struct = go.match(/type ContributionDay struct \{([^}]*)\}/)[1];
  const fields = [...struct.matchAll(/json:"(\w+)/g)]
    .map((m) => m[1])
    .filter((f) => f !== "agent" && f !== "day");
  const rows = statute("influenceBasis").points.earn;
  assert.deepEqual(
    rows.map((r) => r[2]).filter(Boolean),
    fields,
    "one row per ledger field, in the engine's order",
  );
});
