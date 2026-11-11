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
  const r = await fetch(await engineUrl(), {
    method: "POST",
    headers: await engineHeaders(),
    body: JSON.stringify({ seed: 7, slots: [] }),
  });
  trace = { id: "00000000-0000-4000-8000-000000000004", ...(await r.json()) };
  assert.equal(trace.version, 3);
}
const browser = await launchBrowser({
  headless: true,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.audioContacts = [];
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (when = this.currentTime, ...args) => {
          window.audioContacts.push(performance.now() + (when - this.currentTime) * 1000);
          return start(when, ...args);
        };
        return source;
      }
    };
  });
  if (trace) await page.route("**/api/runs", (r) => r.fulfill({ json: trace }));
  await page.goto(origin);
  await page.locator("#slots .slot").first().waitFor();
  assert.equal(await page.locator(".slot .creature-dot svg").count(), 6);
  await page.evaluate(() => {
    window.counts = [];
    new MutationObserver(() => {
      const phase = document.querySelector("#turn-label").textContent;
      if (phase === "HARVEST" || phase === "HARVEST COMPLETE") {
        const value = document.querySelector("#turn-amount").textContent;
        if (window.counts.at(-1)?.value !== value)
          window.counts.push({ value, at: performance.now() });
      }
    }).observe(document.querySelector("#turn-amount"), {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  const done = page.waitForResponse(
    (r) => r.url().endsWith("/api/runs") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run garden" }).click();
  const response = await done;
  assert.equal(response.status(), 200, await response.text());
  assert.equal((await response.json()).version, 3);
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "HARVEST COMPLETE",
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(90);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const counts = await page.evaluate(() => window.counts);
  const audio = await page.evaluate(() => window.audioContacts);
  for (const value of ["0/2", "1/2", "2/2", "+2 carrots"]) {
    const update = counts.find((item) => item.value === value);
    assert.ok(update, "Missing harvest counter " + value);
    if (value !== "0/2")
      assert.ok(
        audio.some((at) => Math.abs(at - update.at) <= 40),
        "Missing contact near " + value,
      );
  }
  assert.match(await page.locator("#turn-amount").textContent(), /\+2 carrots/);
  await page.screenshot({ path: ".local/harvest-counter.png", fullPage: true });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "CONVERTING",
    null,
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const stock = Number(await page.locator("#food").textContent());
  assert.match(
    await page.locator("#garden").getAttribute("aria-label"),
    /2 of 2 energy in the converter/,
  );
  assert.match(await page.locator(".slot.active .slot-budget").textContent(), /4\/6/);
  assert.equal(Number(await page.locator("#energy").textContent()), 2);
  await page.screenshot({ path: ".local/energy-slots.png", fullPage: true });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForFunction(
    (before) => Number(document.querySelector("#food").textContent) > before,
    stock,
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal(Number(await page.locator("#food").textContent()), stock + 1);
  assert.match(
    await page.locator("#garden").getAttribute("aria-label"),
    /0 of 2 energy in the converter/,
  );
  const paused = await page.locator("#food").textContent();
  await page.waitForTimeout(400);
  assert.equal(await page.locator("#food").textContent(), paused);
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  assert.equal(await page.locator("#sound").getAttribute("aria-pressed"), "false");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  await page.screenshot({
    path: ".local/conversion-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/conversion-browser-check.json",
    JSON.stringify(
      {
        origin,
        passed: true,
        individualCounts: counts,
        audibleContactAtEachArrival: true,
        fullPairProducesOne: true,
        visiblePersonalEnergy: true,
        newCharacters: true,
        pauseAndMute: true,
        mobile: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      origin,
      counts,
      conversion: "2 energy → 1 carrot",
      errors,
    }),
  );
} finally {
  await browser.close();
}
