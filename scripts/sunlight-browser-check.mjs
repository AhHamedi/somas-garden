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
    id: "00000000-0000-4000-8000-000000000005",
    ...(await response.json()),
  };
}
const browser = await launchBrowser({
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1400 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  if (process.env.TEST_SLOW_RENDER === "1") {
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        raf(() => setTimeout(() => callback(performance.now()), 180));
    });
  }
  page.on("pageerror", (e) => errors.push(e.message));
  if (trace) await page.route("**/api/runs", (r) => r.fulfill({ json: trace }));
  await page.goto(origin);
  await page.locator("#slots .slot").first().waitFor();
  await page.screenshot({
    path: ".local/amoeboids-desktop.png",
    fullPage: true,
  });
  assert.equal(await page.locator(".resource-icon .resource-symbol").count(), 2);
  const paths = await page.evaluate(() => {
    const d = (selector) =>
      [...document.querySelectorAll(selector + " path")].map((p) => p.getAttribute("d"));
    return {
      footer: d(".resource-icon.sun svg"),
      budget: d(".slot-budget svg"),
    };
  });
  assert.deepEqual(paths.budget.slice(0, paths.footer.length), paths.footer);
  await page.evaluate(() => {
    window.energyHistory = [];
    new MutationObserver(() => {
      if (document.querySelector("#turn-label").textContent === "SUNLIGHT") {
        window.energyHistory.push(
          [...document.querySelectorAll(".slot-budget")].map((e) => e.textContent),
        );
      }
    }).observe(document.querySelector("#slots"), {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await page.getByRole("button", { name: "Run garden" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#turn-label").textContent === "SUNLIGHT" &&
      document.querySelector(".slot-budget")?.textContent === "2/6",
    null,
    { timeout: 45000 },
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const held = await page.locator(".slot-budget").allTextContents();
  assert.ok(held.some((v) => v !== "0/6") && held.some((v) => v !== "6/6"));
  await page.screenshot({ path: ".local/sunlight-refill.png", fullPage: true });
  await page.waitForTimeout(400);
  assert.deepEqual(await page.locator(".slot-budget").allTextContents(), held);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#turn-amount").textContent === "6/6 energy",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.deepEqual(
    await page.locator(".slot-budget").allTextContents(),
    Array(6).fill("6/6"),
  );
  const history = await page.evaluate(() => window.energyHistory);
  assert.ok(history.length > 2);
  assert.ok(history.some((row) => row[0] === "6/6"));
  assert.ok(
    history.some((row) => new Set(row).size > 1),
    "Refill should ripple between amoeboids",
  );
  for (const [i, row] of history.entries()) {
    assert.equal(row.length, 6);
    if (i)
      row.forEach((budget, actor) =>
        assert.ok(
          parseInt(budget) >= parseInt(history[i - 1][actor]),
          "Wallet went backwards",
        ),
      );
  }
  await page.screenshot({ path: ".local/sunlight-full.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: ".local/amoeboids-mobile.png",
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      "Mobile overflow at " + width,
    );
  }
  assert.deepEqual(errors, []);
  const proof = {
    origin,
    staggeredRefill: true,
    slowRendering: process.env.TEST_SLOW_RENDER === "1",
    pauseResume: true,
    matchingResourceIcons: true,
    energySteps: [...new Set(history.map((r) => r[0]))],
    mobileWidths: [390, 320],
    errors,
  };
  await writeFile(".local/sunlight-browser-check.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} finally {
  await browser.close();
}
