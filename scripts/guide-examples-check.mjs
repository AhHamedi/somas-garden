import { requireHostedWrites } from "./support/browser.mjs";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { guideExamples } from "../public/guide-examples.js";
config({ path: ".env.local" });
requireHostedWrites();
await mkdir(".local", { recursive: true });
const origin = process.env.TEST_ORIGIN;
if (!origin) throw Error("Set TEST_ORIGIN to the staged deployment.");
const created = [];
async function api(path, body, admin = false) {
  const response = await fetch(origin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(admin ? { Authorization: "Bearer " + process.env.SELFORG_ADMIN_PASSWORD } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.ok(response.ok, data.error || "Unexpected API response");
  return data;
}
try {
  for (const example of guideExamples) {
    const result = await api("agents", {
      name: "QA · Guide " + example.id,
      source: example.code,
    });
    created.push(result.agent.id);
    console.log(
      "Compiled and probe-checked " + example.id + " through the real upload runner.",
    );
  }
  const run = await api("runs", { agents: created, seed: 7 });
  assert.equal(run.rounds, 30);
  assert.equal(run.food, 60);
  assert.ok(run.agents.every((a) => !a.dead && !a.error && a.totalFood === 60));
  const memory = run.frames.filter((f) => f.phase === "contribute" && f.actor === 2);
  assert.ok(memory.filter((f) => f.round < 6).every((f) => f.agents[2].given <= 4));
  assert.ok(
    memory.some((f) => f.round >= 6 && f.agents[2].given === 6),
    "Stateful example must remember past harvests and offer more energy.",
  );
  const proof = {
    origin,
    examples: guideExamples.map((e) => e.id),
    compiledAndProbeChecked: true,
    realGameRounds: run.rounds,
    allSurvived: true,
    memoryVerified: true,
    errors: [],
  };
  await writeFile(".local/guide-examples-check.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} finally {
  for (const id of created) await api("moderate", { action: "hide", id }, true);
  if (created.length) {
    const library = await api("agents");
    assert.ok(!library.agents.some((a) => created.includes(a.id)));
    console.log("Temporary guide test agents hidden from the public library.");
  }
}
