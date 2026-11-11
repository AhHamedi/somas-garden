import {
  launchBrowser,
  testOrigin,
  engineUrl,
  engineHeaders,
  isLocalOrigin,
} from "./support/browser.mjs";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = await testOrigin();
assert.ok(
  isLocalOrigin(origin),
  "Playback checks require the local server; use npm run test:browser:playback.",
);
let trace;
if (isLocalOrigin(origin)) {
  const response = await fetch(await engineUrl(), {
    method: "POST",
    headers: await engineHeaders(),
    body: JSON.stringify({ seed: 7, slots: [] }),
  });
  assert.equal(response.status, 200);
  trace = {
    id: "00000000-0000-4000-8000-000000000006",
    ...(await response.json()),
  };
}
const browser = await launchBrowser({
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (trace) await page.route("**/api/runs", (r) => r.fulfill({ json: trace }));
  await page.goto(origin);
  await page.locator("#slots .slot").first().waitFor();
  assert.equal(await page.locator(".queue-card:not([hidden])").count(), 6);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/runs") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run garden" }).click();
  const runResponse = await response;
  assert.equal(runResponse.status(), 200);
  const result = await runResponse.json();
  const harvest = (round) =>
    result.frames
      .filter((f) => f.round === round && f.phase === "harvest")
      .map((f) => f.actor);
  const farming = result.frames
    .filter((f) => f.round === 1 && f.phase === "contribute")
    .map((f) => f.actor);
  const firstByDay = new Map();
  for (const f of result.frames) {
    if (f.phase === "contribute" && !firstByDay.has(f.round))
      firstByDay.set(f.round, f.actor);
  }
  const firstGivers = [...new Set(firstByDay.values())];
  assert.ok(firstGivers.length > 1, "Farming must not have a fixed first contributor");
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "SHUFFLING",
  );
  await page.waitForTimeout(370);
  const poses = () =>
    page
      .locator(".queue-card")
      .evaluateAll((nodes) => nodes.map((n) => n.style.transform));
  const first = await poses();
  await page.waitForTimeout(160);
  assert.notDeepEqual(await poses(), first, "Shuffle should move the cards");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await poses();
  await page.waitForTimeout(300);
  assert.deepEqual(await poses(), paused, "Shuffle must pause");
  await page.screenshot({ path: ".local/queue-shuffle.png", fullPage: true });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "SUNLIGHT",
  );
  const shownOrder = () =>
    page
      .locator(".queue-card:not([hidden])")
      .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.actor)));
  assert.deepEqual(await shownOrder(), harvest(1));
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "HARVEST COMPLETE",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal(
    Number(
      await page.locator('.queue-card[aria-current="step"]').getAttribute("data-actor"),
    ),
    harvest(1)[0],
  );
  assert.equal(
    Number(await page.locator("#garden").getAttribute("data-active-actor")),
    harvest(1)[0],
  );
  await page.screenshot({ path: ".local/queue-active.png", fullPage: true });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForFunction(
    (i) => Number(document.querySelector("#garden").dataset.activeActor) === i,
    harvest(1)[1],
  );
  await page.waitForTimeout(110);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const done = page.locator(`.queue-card[data-actor="${harvest(1)[0]}"]`);
  assert.equal(await done.getAttribute("data-state"), "done");
  assert.deepEqual(await shownOrder(), [...harvest(1).slice(1), harvest(1)[0]]);
  const mid = await poses();
  await page.waitForTimeout(200);
  assert.deepEqual(await poses(), mid, "Queue advance must pause");
  await page.screenshot({ path: ".local/queue-advance.png", fullPage: true });
  await page.selectOption("#speed", "4");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#turn-queue").dataset.phase === "contribute" &&
      document.querySelector("#turn-label").textContent === "SHUFFLING",
    null,
    { timeout: 30000 },
  );
  await page.selectOption("#speed", "1");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal(await page.locator(".queue-card[aria-current='step']").count(), 0);
  assert.equal(await page.locator("#garden").getAttribute("data-active-actor"), "-1");
  assert.equal(await page.locator("#energy").textContent(), "0");
  const beforeFarming = await page.locator("#food").textContent();
  const farmPause = await poses();
  await page.waitForTimeout(200);
  assert.deepEqual(await poses(), farmPause);
  assert.equal(await page.locator("#food").textContent(), beforeFarming);
  assert.equal(await page.locator("#energy").textContent(), "0");
  await page.screenshot({ path: ".local/farming-shuffle.png", fullPage: true });
  assert.deepEqual(await shownOrder(), farming);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForTimeout(180);
  assert.notDeepEqual(await poses(), farmPause, "Farming has its own shuffle animation");
  await page.waitForFunction(
    (i) => Number(document.querySelector("#garden").dataset.activeActor) === i,
    farming[0],
  );
  assert.equal(
    Number(
      await page.locator(".queue-card[aria-current='step']").getAttribute("data-actor"),
    ),
    farming[0],
  );
  await page.selectOption("#speed", "4");
  await page.waitForFunction(
    () =>
      document.querySelector("#round").textContent === "02" &&
      document.querySelector("#turn-label").textContent === "SHUFFLING",
    null,
    { timeout: 30000 },
  );
  await page.selectOption("#speed", "1");
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "SUNLIGHT",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.deepEqual(await shownOrder(), harvest(2));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: ".local/queue-mobile.png", fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const queue = await page.locator(".queue-list").boundingBox(),
      canvas = await page.locator("canvas").boundingBox();
    assert.ok(
      queue.y + queue.height <= canvas.y + 1,
      "Mobile queue should sit above garden",
    );
  }
  assert.deepEqual(errors, []);
  const proof = {
    origin,
    actualHarvestOrder: harvest(1),
    actualFarmingOrder: farming,
    nextDayOrder: harvest(2),
    highlightMatchesQueue: true,
    animatedShuffle: true,
    independentFarmingShuffle: true,
    firstGiversAcrossDays: firstGivers,
    noActionsDuringFarmingShuffle: true,
    animatedAdvance: true,
    pauseResume: true,
    mobile: [390, 320],
    errors,
  };
  await writeFile(".local/queue-browser-check.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} finally {
  await browser.close();
}
