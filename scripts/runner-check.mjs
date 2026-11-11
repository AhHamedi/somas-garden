import { engineUrl, engineHeaders } from "./support/browser.mjs";
import { config } from "dotenv";
import assert from "node:assert/strict";
import { startAgent } from "../lib/runner.mjs";
import { writeFile } from "node:fs/promises";
config({ path: ".env.local" });
config({ path: ".local/runner.env" });
if (!process.argv.includes("--hosted-writes"))
  throw new Error("Run npm run test:hosted:runner to create isolated test runners.");
const report = [];
async function check(name, fn) {
  const start = Date.now();
  await fn();
  report.push({ name, passed: true, ms: Date.now() - start });
  console.log(name + " passed");
}
async function rejected(source, pattern) {
  await assert.rejects(startAgent(source, { probe: true }), pattern);
}
const source = (body) => "package main\n" + body;
await check("compile errors", () =>
  rejected(
    source('func Decide(v View) Action { return Action{Food: "carrot"} }'),
    /compile error/i,
  ),
);
await check("panic error", () =>
  rejected(source('func Decide(v View) Action { panic("oh no") }'), /crashed/i),
);
await check("infinite loop timeout", () =>
  rejected(source("func Decide(v View) Action { for {} }"), /too long/i),
);
const active = [];
try {
  await check("independent private memory and round results", async () => {
    const memory = source(
      "var count int\nfunc Decide(v View) Action {count++;return Action{Food:1,Energy:5+count%2}}",
    );
    for (let i = 0; i < 2; i++) active.push(await startAgent(memory));
    const r = await fetch(await engineUrl(), {
      method: "POST",
      headers: await engineHeaders(),
      body: JSON.stringify({
        seed: 7,
        slots: active.map((a, i) => ({
          id: String(i),
          name: "Memory " + i,
          url: a.url,
          token: a.token,
        })),
      }),
    });
    assert.equal(r.status, 200);
    const game = await r.json();
    assert.equal(game.agents[0].totalEnergy, 165);
    assert.equal(game.agents[1].totalEnergy, 165);
    assert.equal(game.agents[0].error, undefined);
    assert.equal(game.agents[1].error, undefined);
  });
} finally {
  await Promise.allSettled(active.map((a) => a.stop()));
}
await check("outbound network denied", async () => {
  const a = await startAgent(
    source(
      'import("net/http";"time")\nfunc Decide(v View) Action {c:=http.Client{Timeout:300*time.Millisecond};r,e:=c.Get("https://example.com");if e!=nil{return Action{Energy:6}};r.Body.Close();return Action{Energy:0}}',
    ),
  );
  try {
    const r = await fetch(a.url + "/decide", {
      method: "POST",
      headers: { Authorization: "Bearer " + a.token },
      body: '{"Round":1}',
    });
    assert.equal((await r.json()).Energy, 6);
  } finally {
    await a.stop();
  }
});
await check("mid-game failures stop acting", async () => {
  const a = await startAgent(
    source(
      "func Decide(v View) Action {if v.Round==2 {for{}};return Action{Food:2,Energy:4}}",
    ),
  );
  try {
    const r = await fetch(await engineUrl(), {
      method: "POST",
      headers: await engineHeaders(),
      body: JSON.stringify({
        seed: 7,
        slots: [{ id: "loop", name: "Loop", url: a.url, token: a.token }],
      }),
    });
    const game = await r.json();
    assert.equal(game.agents[0].totalEnergy, 4);
    assert.equal(game.agents[0].totalFood, 2);
    assert.match(game.agents[0].error, /timed out/);
  } finally {
    await a.stop();
  }
});
await writeFile(".local/runner-check.json", JSON.stringify(report, null, 2));
