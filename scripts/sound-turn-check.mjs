import {
  launchBrowser,
  testOrigin,
  engineUrl,
  engineHeaders,
  isLocalOrigin,
} from "./support/browser.mjs";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = await testOrigin(),
  local = isLocalOrigin(origin);
let trace;
if (local) {
  const r = await fetch(await engineUrl(), {
    method: "POST",
    headers: await engineHeaders(),
    body: JSON.stringify({ seed: 7, slots: [] }),
  });
  assert.equal(r.status, 200);
  trace = { id: "00000000-0000-4000-8000-000000000003", ...(await r.json()) };
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
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        const monitor = this.createAnalyser();
        monitor.fftSize = 2048;
        monitor.connect(this.destination);
        Object.defineProperty(this, "destination", { value: monitor });
        window.testAudio = { context: this, monitor };
      }
    };
    window.audioRms = () => {
      const monitor = window.testAudio?.monitor;
      if (!monitor) return 0;
      const data = new Float32Array(monitor.fftSize);
      monitor.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((s, n) => s + n * n, 0) / data.length);
    };
  });
  if (trace) await page.route("**/api/runs", (r) => r.fulfill({ json: trace }));
  await page.goto(origin);
  await page.locator("#slots .slot").first().waitFor();
  assert.equal(await page.locator("#sound").getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => !!window.testAudio), false);
  await page.evaluate(() => {
    window.turnEvents = [];
    new MutationObserver(() => {
      const phase = document.querySelector("#turn-label").textContent;
      if (
        phase === "HARVEST" &&
        window.turnEvents.at(-1)?.name !==
          document.querySelector("#turn-name").textContent
      )
        window.turnEvents.push({
          time: performance.now(),
          name: document.querySelector("#turn-name").textContent,
        });
    }).observe(document.querySelector("#turn-label"), { childList: true });
  });
  await page.getByRole("button", { name: "Run garden" }).click();
  await page.waitForFunction(() => window.audioRms() > 0.0001, null, {
    timeout: 45000,
  });
  assert.equal(await page.evaluate(() => window.testAudio.context.state), "running");
  await page.waitForFunction(() => window.turnEvents.length >= 3);
  const times = await page.evaluate(() => window.turnEvents.slice(0, 3));
  const delay = times[2].time - times[1].time;
  assert.ok(delay >= 600 && delay < 1100, "1× action delay " + delay);
  assert.match(await page.locator("#turn-name").textContent(), /Amoeboid/);
  assert.match(await page.locator("#turn-amount").textContent(), /\/2$/);
  assert.equal(await page.locator(".slot.active").count(), 1);
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  await page.waitForTimeout(170);
  assert.ok((await page.evaluate(() => window.audioRms())) < 0.0001);
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page.waitForFunction(() => window.audioRms() > 0.0001);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await page.locator("#scene-caption").textContent();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#scene-caption").textContent(), paused);
  assert.ok((await page.evaluate(() => window.audioRms())) < 0.0001);
  await page.screenshot({
    path: ".local/sound-turn-desktop.png",
    fullPage: true,
  });
  const cues = await page.evaluate(async () => {
    const { playGardenCue } = await import("/sound.js");
    const results = [];
    for (const phase of ["harvest", "contribute", "grow", "death"]) {
      const ctx = new OfflineAudioContext(2, 96000, 48000);
      playGardenCue(ctx, ctx.destination, {
        phase,
        regrew: true,
        actor: 0,
        agents: [{ food: 2, given: 4 }],
      });
      const b = await ctx.startRendering();
      const data = b.getChannelData(0);
      let energy = 0,
        peak = 0;
      for (const s of data) {
        energy += s * s;
        peak = Math.max(peak, Math.abs(s));
      }
      results.push({
        phase,
        rms: Math.sqrt(energy / data.length),
        peak,
        endsSilent: data.slice(-2000).every((s) => Math.abs(s) < 0.0001),
      });
    }
    return results;
  });
  for (const cue of cues) {
    assert.ok(cue.rms > 0.00001 && cue.peak < 0.5, JSON.stringify(cue));
    assert.equal(cue.endsSilent, true);
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  await page.screenshot({
    path: ".local/sound-turn-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  await page.reload();
  assert.equal(await page.locator("#sound").getAttribute("aria-pressed"), "false");
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/sound-turn-check.json",
    JSON.stringify(
      {
        origin,
        passed: true,
        actionDelayMs: delay,
        soundAfterGesture: true,
        muteAndPauseSilence: true,
        preferencePersists: true,
        cues,
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
      actionDelayMs: Math.round(delay),
      cues: cues.map((c) => c.phase),
      consoleErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
