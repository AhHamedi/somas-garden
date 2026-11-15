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
  await page.locator("#setup-button").click();
  for (const [key, value] of Object.entries({
    copies: 4,
    plots: 4,
    days: 3,
    months: 2,
  })) {
    await page.locator(`[data-setting="${key}"]`).fill(String(value));
  }
  await page.locator("#setup-form button[type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#setup-dialog").open);
  await page.waitForFunction(() => document.querySelectorAll(".plot").length === 4);
  const id = await page.evaluate(() => localStorage.getItem("amoeboids.society.active"));
  await page.locator("#day-button").click();
  await page.waitForFunction(() => !document.querySelector("#day-button").disabled, {
    timeout: 30000,
  });
  await page.locator(".plot").first().click();
  await page.getByRole("tab", { name: /^Residents/ }).click();
  await page.locator("[data-agent]").first().click();
  assert.match(await page.locator("#inspector").innerText(), /Body|body/);
  await page.locator("#year-button").click();
  await page.waitForFunction(
    () => document.querySelector("#world-state").textContent === "A YEAR OF EXPERIENCE",
    { timeout: 60000 },
  );
  const finished = await (
    await page.request.get(origin + "/api/society/runs/" + id)
  ).json();
  assert.equal(finished.snapshot.months.length, 2);
  assert.equal(finished.snapshot.agents.length, 24);
  assert.equal(finished.status, "complete");
  await page.locator('[data-page="results"]').click();
  assert.equal(await page.locator(".month-card").count(), 2);
  await page.screenshot({ path: join(evidence, "results.png"), fullPage: true });
  await page.locator('[data-page="chronicle"]').click();
  await page.waitForTimeout(500);
  assert.match(await page.locator("#chronicle-page").innerText(), /meteor|reset/i);
  await page.locator('[data-page="world"]').click();
  await page.locator("#timeline").evaluate((el) => {
    el.value = "0";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelector("#world-state").textContent === "EXPLORING THE PAST",
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
