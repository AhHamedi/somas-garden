import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  STATUTES,
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
  assert.ok(catalogue.length === 4, "catalogue parsed");
  for (const def of catalogue) {
    const st = statute(def.key, def.scope);
    assert.ok(st, `${def.scope} ${def.key} is in the statute book`);
    const modes = st.options.map((o) => o.mode);
    for (const mode of def.modes)
      assert.ok(modes.includes(mode), `${def.key} offers ${mode}`);
    for (const mode of modes)
      if (mode) assert.ok(def.modes.includes(mode), `${def.key} does not invent ${mode}`);
  }
  assert.equal(STATUTES.length, catalogue.length, "no statute without an engine policy");
});

test("options only name parameters the statute defines", () => {
  for (const st of STATUTES)
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
  assert.equal(fill("{votingTokens} daily", { votingTokens: 6 }), "6 daily");
  assert.equal(fill("{missing}", {}), "{missing}");
  assert.equal(
    statuteOfMotion({ input: { kind: "policy", key: "harvestOrder" } }).key,
    "harvestOrder",
  );
  assert.equal(
    statuteOfMotion({ input: { kind: "repeal", key: "tokenAllocation" } }).key,
    "tokenAllocation",
  );
  assert.equal(statuteOfMotion({ input: { kind: "elect", key: "trade" } }), null);
  assert.equal(statute("tax"), null);
});
