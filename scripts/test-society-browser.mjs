import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const temp = await mkdtemp(join(tmpdir(), "amoeboids-browser-"));
const sessionFile = join(temp, "dev.json");
const evidence = resolve(".local/verification/browser");
await mkdir(evidence, { recursive: true });
const server = spawn(process.execPath, ["scripts/dev.mjs"], {
  env: {
    ...process.env,
    PORT: "0",
    ENGINE_PORT: "0",
    DEV_SESSION_FILE: sessionFile,
    LOCAL_DATA_DIR: join(temp, "data"),
    DEV_CONTROL_STDIN: "1",
  },
  stdio: ["pipe", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", (x) => {
  output += x;
});
server.stderr.on("data", (x) => {
  output += x;
});
const exited = new Promise((done) => server.once("exit", done));
let browser;
const failures = [];
try {
  let origin;
  for (let i = 0; i < 1200; i++) {
    if (server.exitCode !== null) throw Error(output);
    try {
      origin = JSON.parse(await readFile(sessionFile)).origin;
      break;
    } catch {}
    await delay(100);
  }
  assert.ok(origin, "server started");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto(origin);
  await page.waitForSelector(".plot", { timeout: 30000 });
  assert.equal(await page.locator(".plot").count(), 6);
  assert.match(await page.locator("#world-metrics").innerText(), /300/);
  await page.screenshot({ path: join(evidence, "initial.png"), fullPage: true });
  assert.equal(await page.locator("#inspector-shell").isVisible(), false);
  assert.equal(await page.locator("#world-canvas").isVisible(), true);
  const initialRunId = await page.evaluate(() =>
    localStorage.getItem("amoeboids.society.active"),
  );
  await page.locator("#game-menu > summary").focus();
  await page.keyboard.press("Space");
  assert.equal(
    await page.locator("#game-menu").evaluate((el) => el.open),
    true,
    "Space opens the native Menu summary",
  );
  assert.equal(
    await page.locator("#phase-label").textContent(),
    "Ready",
    "Menu activation does not start the simulation",
  );
  await page.locator("#setup-button").click();
  for (const [key, value] of Object.entries({
    copies: 4,
    plots: 4,
    days: 3,
    months: 2,
  })) {
    await page.locator(`[data-setting="${key}"]`).fill(String(value));
  }
  await page.locator('[data-setup-tab="teams"]').click();
  await page.locator('[data-edit-team="0"]').click();
  await page.locator('[data-builder="harvest"]').fill("4");
  await page.locator("#save-strategy").click();
  await page.locator('[data-setup-tab="advanced"]').click();
  assert.equal(
    await page.locator("#setup-content input:invalid").count(),
    0,
    "all advanced defaults are valid",
  );
  await page.locator("#setup-form button[type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#setup-dialog").open);
  await page.waitForFunction(() => document.querySelectorAll(".plot").length === 4);
  const id = await page.evaluate(() => localStorage.getItem("amoeboids.society.active"));
  await page.locator("#play-button").click();
  await page.waitForFunction(
    () => document.querySelector("#phase-label").textContent !== "Ready",
  );
  await page.locator("#play-button").click();
  await page.waitForFunction(
    () => document.querySelector("#world-state").textContent === "Paused",
  );
  assert.match(await page.locator("#play-button").innerText(), /Play/);
  await page.locator("#day-button").click();
  await page.waitForFunction(() => !document.querySelector("#day-button").disabled, {
    timeout: 30000,
  });
  const beforeReplay = await (
    await page.request.get(origin + "/api/society/runs/" + id)
  ).json();
  await page.locator("#replay-toggle").click();
  // A frame response from a former run must not overwrite the selected world.
  let releaseFrame, frameReady;
  const heldFrame = new Promise((done) => {
    releaseFrame = done;
  });
  const capturedFrame = new Promise((done) => {
    frameReady = done;
  });
  const frameURL = origin + "/api/society/runs/" + id + "/frames/0";
  await page.route(frameURL, async (route) => {
    const response = await route.fetch();
    frameReady();
    await heldFrame;
    await route.fulfill({ response });
  });
  await page.locator("#timeline").evaluate((el) => {
    el.value = "0";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await capturedFrame;
  await page.locator("#game-menu > summary").click();
  await page.locator("#saved-button").click();
  await page.locator(`[data-open-run="${initialRunId}"]`).click();
  await page.waitForFunction(() => !document.querySelector("#saved-dialog").open);
  const deliveredFrame = page.waitForResponse(frameURL);
  releaseFrame();
  await (await deliveredFrame).finished();
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("amoeboids.society.active")),
    initialRunId,
  );
  assert.match(
    await page.locator("#world-metrics").innerText(),
    /300/,
    "delayed replay frame cannot replace the newly selected world's population",
  );
  assert.equal(
    await page.locator("#world-state").textContent(),
    "Paused",
    "delayed replay frame cannot put a different world into replay mode",
  );
  await page.unroute(frameURL);
  await page.locator("#game-menu > summary").click();
  await page.locator("#saved-button").click();
  await page.locator(`[data-open-run="${id}"]`).click();
  await page.waitForFunction(() => !document.querySelector("#saved-dialog").open);
  await page.locator("#timeline").evaluate((el) => {
    el.value = "0";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("#world-state").textContent === "Replay",
  );
  await page.locator("#step-button").click();
  await page.waitForFunction(
    () => document.querySelector("#phase-label").textContent === "Environment",
  );
  assert.equal(await page.locator("#world-state").textContent(), "Replay");
  await page.locator("#play-button").click();
  await page.waitForFunction(
    () => document.querySelector("#phase-label").textContent !== "Environment",
  );
  await page.locator("#play-button").click();
  await page.waitForFunction(() =>
    document.querySelector("#play-button").textContent.includes("Play"),
  );
  await page.locator("#day-button").click();
  await page.waitForFunction(
    () => document.querySelector("#phase-label").textContent === "Nightfall",
  );
  const afterReplay = await (
    await page.request.get(origin + "/api/society/runs/" + id)
  ).json();
  assert.equal(
    afterReplay.frameIndex,
    beforeReplay.frameIndex,
    "replay controls never advance the live world",
  );
  await page.locator("#live-button").click();
  await page.locator("#replay-toggle").click();
  await page.locator(".plot").first().click();
  await page.getByRole("tab", { name: /^Residents/ }).click();
  await page.locator("[data-agent]").first().click();
  assert.match(await page.locator("#inspector").innerText(), /Body|body/);
  await page.locator("#inspector-close").click();
  assert.equal(await page.locator("#inspector-shell").isVisible(), false);
  await page.locator("#time-options > summary").focus();
  await page.keyboard.press("Space");
  assert.equal(
    await page.locator("#time-options").evaluate((el) => el.open),
    true,
    "Space opens playback options without toggling playback",
  );
  await page.locator("#year-button").click();
  await page.waitForFunction(
    () => document.querySelector("#world-state").textContent === "Complete",
    { timeout: 60000 },
  );
  const finished = await (
    await page.request.get(origin + "/api/society/runs/" + id)
  ).json();
  assert.equal(finished.snapshot.months.length, 2);
  assert.equal(finished.snapshot.agents.length, 24);
  assert.equal(
    finished.snapshot.teams[0].builder.harvest,
    4,
    "edited behaviour applied to the new world",
  );
  assert.equal(finished.status, "complete");
  await page.locator('[data-page="results"]').click();
  assert.equal(await page.locator(".month-card").count(), 2);
  await page.screenshot({ path: join(evidence, "results.png"), fullPage: true });
  await page.locator('[data-page="chronicle"]').click();
  await page.waitForTimeout(500);
  assert.match(await page.locator("#chronicle-page").innerText(), /meteor|reset/i);
  await page.locator('[data-page="world"]').click();
  await page.locator("#replay-toggle").click();
  await page.locator("#timeline").evaluate((el) => {
    el.value = "0";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("#world-state").textContent === "Replay",
  );
  await page.locator("#live-button").click();
  await page.reload();
  await page.waitForSelector(".plot");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("amoeboids.society.active")),
    id,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(evidence, "mobile.png"), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    "mobile fits viewport",
  );
  assert.deepEqual(failures, []);
  await writeFile(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        passed: true,
        phases: finished.progress,
        population: 24,
        months: 2,
        browserErrors: failures,
      },
      null,
      2,
    ),
  );
  console.log(
    "Society browser flow passed: setup, real run, inspection, results, meteor, timeline, reload and mobile.",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.stdin.end("stop\n");
    const timeout = setTimeout(() => server.kill(), 10000);
    await exited;
    clearTimeout(timeout);
  }
  await rm(temp, { recursive: true, force: true });
}
