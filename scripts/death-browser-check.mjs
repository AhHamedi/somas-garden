import {
  launchBrowser,
  testOrigin,
  engineUrl,
  engineHeaders,
  isLocalOrigin,
} from "./support/browser.mjs";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const origin = await testOrigin();
assert.ok(
  isLocalOrigin(origin),
  "Playback checks require the local server; use npm run test:browser:playback.",
);
let trace;
if (isLocalOrigin(origin)) {
  const r = await fetch(await engineUrl(), {
    method: "POST",
    headers: await engineHeaders(),
    body: JSON.stringify({
      seed: 7,
      slots: Array.from({ length: 6 }, (_, i) => ({
        id: String(i),
        name: "Sprout " + (i + 1),
        policy: "greedy",
      })),
    }),
  });
  assert.equal(r.status, 200);
  trace = { id: "00000000-0000-4000-8000-000000000002", ...(await r.json()) };
  assert.equal(trace.rounds, 2);
  assert.ok(trace.agents.every((a) => a.dead && a.diedRound === 2));
}
const browser = await launchBrowser({
  headless: true,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (trace) await page.route("**/api/runs", (r) => r.fulfill({ json: trace }));
  await page.goto(origin);
  await page.locator("#slots .slot").first().waitFor();
  if (!trace) {
    for (const edit of await page.locator(".slot-edit").all()) {
      await edit.click();
      await page.locator("[data-change]").click();
      await page.locator('[data-agent="greedy"]').click();
      await page.locator("[data-use]").click();
      await page.locator(".gs-close").click();
    }
  }
  await page.selectOption("#speed", "4");
  await page.getByRole("button", { name: "Run garden" }).click();
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "STARVATION",
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(90);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.ok((await page.locator(".slot.dead").count()) > 0);
  assert.match(
    await page.locator(".slot.dead .slot-stats").first().textContent(),
    /died day 2/,
  );
  await page.screenshot({ path: ".local/death-ghost.png", fullPage: true });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.selectOption("#speed", "4");
  await page.waitForFunction(
    () => document.querySelector("#game-state").textContent === "Game complete",
  );
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".slot.dead").count(), 6);
  await page.locator('#run-results [data-result="replay"]').click();
  assert.equal(await page.locator(".slot.dead").count(), 0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/death-browser-check.json",
    JSON.stringify(
      {
        origin,
        deathFrames: true,
        ghostVisible: true,
        allDeadGameEnds: true,
        replayResetsDeaths: true,
        mobile: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Starvation, ghosts, pause/resume, game end and replay passed.");
} finally {
  await browser.close();
}
