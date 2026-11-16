import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Load the actual browser modules in Node, resolving their /game/ imports.
// No DOM is needed to exercise the Results data-loading boundary.
const modules = new Map();
async function browserModuleURL(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let source = await readFile(url, "utf8");
  for (const match of source.matchAll(/\bfrom\s+["'](\/game\/[^"']+|\.[^"']+)["']/g)) {
    const specifier = match[1];
    const dependency = specifier.startsWith("/game/")
      ? new URL(`../public${specifier}`, import.meta.url)
      : new URL(specifier, url);
    source = source.replace(
      match[0],
      `from ${JSON.stringify(await browserModuleURL(dependency))}`,
    );
  }
  const result = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  modules.set(url.href, result);
  return result;
}
const { ensureStudy } = await import(
  await browserModuleURL(new URL("../public/game/results.js", import.meta.url))
);

const phases = [
  "environment",
  "movement",
  "harvest",
  "proposals",
  "voting",
  "transfers",
  "eating",
  "close",
];
function observer(api) {
  return {
    view: "world",
    pb: {
      id: "first-run",
      cur: 15,
      frames: Array.from({ length: 17 }, (_, i) => ({
        month: 1,
        phase: i ? phases[(i - 1) % phases.length] : "ready",
      })),
    },
    api,
  };
}
const record = (frame) => ({ frame, months: [{ frame }], days: [], motions: [] });

test("Results refetches exact frames when rewinding from eating 15 to voting 13", async () => {
  const calls = [];
  const app = observer(async (path) => {
    calls.push(path);
    return record(Number(new URL(path, "http://localhost").searchParams.get("frame")));
  });
  await ensureStudy(app);
  assert.equal(app.study.data.frame, 15);

  app.pb.cur = 13;
  const rewind = ensureStudy(app);
  assert.equal(app.study.data, null, "future totals are unavailable during loading");
  await rewind;
  assert.equal(app.study.data.frame, 13);

  app.pb.cur = 15;
  await ensureStudy(app);
  assert.equal(app.study.data.frame, 15, "eating totals refresh when playing forward");
  await ensureStudy(app);
  assert.deepEqual(calls, [
    "/runs/first-run/study?frame=15",
    "/runs/first-run/study?frame=13",
    "/runs/first-run/study?frame=15",
  ]);
});

test("Results discards an in-flight response after a rewind or run change", async () => {
  const pending = [];
  const app = observer(
    (path) => new Promise((resolve) => pending.push({ path, resolve })),
  );
  const eating = ensureStudy(app);
  app.pb.cur = 13;
  ensureStudy(app);
  pending[0].resolve(record(15));
  await eating;
  assert.equal(app.study.data, null, "late eating response cannot restore future data");

  const voting = ensureStudy(app);
  assert.equal(pending[1].path, "/runs/first-run/study?frame=13");
  pending[1].resolve(record(13));
  await voting;
  assert.equal(app.study.data.frame, 13);

  app.pb.cur = 15;
  const firstRun = ensureStudy(app);
  app.pb.id = "second-run";
  pending[2].resolve(record(15));
  await firstRun;
  assert.equal(app.study.data, null, "the previous run cannot fill the new run's cache");
  const secondRun = ensureStudy(app);
  assert.equal(pending[3].path, "/runs/second-run/study?frame=15");
  pending[3].resolve(record(15));
  await secondRun;
  assert.equal(app.study.key, "second-run:15");
});

test("loading the shared study also refreshes a paused Rulebook", async () => {
  const app = observer(async () => record(15));
  app.view = "rulebook";
  const renders = [];
  app.actions = {
    setView(view) {
      renders.push({ view, frame: app.study.data?.frame });
      ensureStudy(app);
    },
  };
  await ensureStudy(app);
  assert.deepEqual(renders, [{ view: "rulebook", frame: 15 }]);
});
