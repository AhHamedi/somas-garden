import {
  launchBrowser,
  testOrigin,
  engineUrl,
  engineHeaders,
} from "./support/browser.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const origin = await testOrigin();
const out = process.env.REVIEW_DIR || ".local/juice-upgrade/review";
await mkdir(out, { recursive: true });
const browser = await launchBrowser({ headless: true });
const errors = [];
const report = { origin, sizes: [], errors };
try {
  // Run a trusted built-in example. Reuse its trace on every viewport.
  const response = await fetch(await engineUrl(), {
    method: "POST",
    headers: await engineHeaders(),
    body: JSON.stringify({ seed: 7, slots: [] }),
  });
  assert.equal(response.status, 200);
  const trace = {
    id: "00000000-0000-4000-8000-000000000009",
    ...(await response.json()),
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.route("**/api/runs", (route) => route.fulfill({ json: trace }));
  await context.route("**/api/agents", (route) =>
    route.fulfill({ json: { agents: [] } }),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.strikes = [];
    window.contacts = [];
    window.AudioContext = class extends NativeAudio {
      constructor(...args) {
        super(...args);
        const audio = this;
        const monitor = audio.createAnalyser();
        const capture = audio.createMediaStreamDestination();
        monitor.connect(capture);
        monitor.connect(audio.destination);
        Object.defineProperty(audio, "destination", { value: monitor });
        const bufferSource = audio.createBufferSource.bind(audio);
        audio.createBufferSource = () => {
          const source = bufferSource();
          const start = source.start.bind(source);
          source.start = (when = 0, ...args) => {
            const stamp = audio.getOutputTimestamp();
            window.strikes.push({
              issued: performance.now(),
              graphDelay: (Math.max(when, audio.currentTime) - audio.currentTime) * 1000,
              output:
                stamp.performanceTime +
                (Math.max(when, audio.currentTime) - stamp.contextTime) * 1000,
            });
            return start(when, ...args);
          };
          return source;
        };
        window.reviewAudio = { audio, capture, monitor };
      }
    };
    window.rms = () => {
      const monitor = window.reviewAudio?.monitor;
      if (!monitor) return 0;
      const samples = new Float32Array(monitor.fftSize);
      monitor.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
    };
  });
  await page.goto(origin);
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.locator("#slots .slot").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out + "/desktop.png", fullPage: true });
  await button("Garden setup").focus();
  await page.keyboard.press("Enter");
  await page.locator("#garden-setup-dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await button("Garden setup").evaluate((el) => el === document.activeElement),
    true,
  );
  await page.evaluate(() => {
    window.firstRow = document.querySelector(".slot");
  });
  await page.evaluate(() => {
    const read = () =>
      [...document.querySelectorAll(".slot-budget")].map((el) =>
        parseInt(el.textContent, 10),
      );
    let last = read();
    new MutationObserver(() => {
      const budgets = read();
      if (document.querySelector("#turn-label").textContent === "SUNLIGHT") {
        const count = budgets.reduce((sum, n, i) => sum + Math.max(0, n - last[i]), 0);
        if (count) window.contacts.push({ time: performance.now(), count });
      }
      last = budgets;
    }).observe(document.querySelector("#slots"), {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await button("Run garden").click();
  await page.waitForFunction(() => window.reviewAudio?.audio.state === "running");
  await page.evaluate(() => {
    const stream = document.querySelector("#garden").captureStream(60);
    stream.addTrack(window.reviewAudio.capture.stream.getAudioTracks()[0]);
    const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    const recorder = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: 3500000,
    });
    window.finishedClip = new Promise((resolve) => {
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(reader.result.slice(reader.result.lastIndexOf(",") + 1));
        reader.readAsDataURL(new Blob(chunks, { type }));
        stream.getVideoTracks().forEach((track) => track.stop());
      };
    });
    recorder.start(200);
    window.finishClip = () => recorder.stop();
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#turn-label").textContent === "SUNLIGHT" &&
      [...document.querySelectorAll(".slot-budget")].some(
        (el) => el.textContent === "2/6",
      ),
  );
  await page.screenshot({ path: out + "/sunlight.png" });
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "HARVEST COMPLETE",
  );
  const timing = await page.evaluate(() =>
    window.contacts.map((contact) => {
      const nearest = window.strikes.reduce((best, strike) =>
        Math.abs(strike.issued - contact.time) < Math.abs(best.issued - contact.time)
          ? strike
          : best,
      );
      return {
        count: contact.count,
        graphMs: Math.abs(nearest.issued + nearest.graphDelay - contact.time),
        estimatedOutputMs: nearest.output - contact.time,
      };
    }),
  );
  assert.equal(
    timing.reduce((sum, e) => sum + e.count, 0),
    36,
  );
  report.maxContactDispatchMs = Math.max(...timing.map((e) => e.graphMs));
  report.maxEstimatedDeviceMs = Math.max(
    ...timing.map((e) => Math.abs(e.estimatedOutputMs)),
  );
  assert.ok(report.maxContactDispatchMs < 40, JSON.stringify(timing));
  await page.screenshot({ path: out + "/harvest.png" });
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "CONVERTING",
  );
  await page.screenshot({ path: out + "/conversion.png" });
  const clip = await page.evaluate(async () => {
    window.finishClip();
    return await window.finishedClip;
  });
  const movie = Buffer.from(clip, "base64");
  assert.equal(movie.readUInt32BE(0), 0x1a45dfa3, "Expected a WebM recording");
  await writeFile(out + "/garden-with-sound.webm", movie);
  await page.selectOption("#speed", "2");
  await page.selectOption("#speed", "4");
  await button("Pause").click();
  const state = () => page.locator("#turn-box, .slot-budget").allTextContents();
  const paused = await state();
  await page.waitForTimeout(200);
  assert.deepEqual(await state(), paused);
  assert.ok(await page.evaluate(() => window.rms() < 0.0001));
  assert.ok(
    await page.evaluate(() => window.firstRow === document.querySelector(".slot")),
  );
  await button("Resume").click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = await state();
  await page.waitForTimeout(300);
  assert.deepEqual(await state(), hidden);
  assert.ok(await page.evaluate(() => window.rms() < 0.0001));
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await button("Pause").waitFor();
  await button("Replay this game").click();
  await page.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "SHUFFLING",
  );
  await button("Pause").click();
  await button("Go guide").click();
  await page.locator("#guide-tab-simple").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.locator("#guide-tab-adaptive").getAttribute("aria-selected"),
    "true",
  );
  await page
    .locator("#help-dialog")
    .evaluate((dialog) => Promise.all(dialog.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: out + "/guide.png" });
  await page.keyboard.press("Escape");
  await button("Garden setup").click();
  await page.locator("[data-library]").click();
  assert.equal(await page.locator("[data-upload]").isDisabled(), true);
  assert.equal(await page.locator("#gs-upload-note").isVisible(), true);
  await button("View Go").click();
  await page.locator("#source-dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".gs-close").click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(180);
    const size = await page.evaluate(() => ({
      width: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      controls: document.querySelector("#run").getBoundingClientRect().toJSON(),
      scene: document.querySelector("canvas").getBoundingClientRect().toJSON(),
    }));
    assert.ok(size.overflow <= 0);
    report.sizes.push(size);
    await page.screenshot({ path: out + "/phone-" + width + ".png", fullPage: true });
  }
  await context.close();
  const fallback = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  await fallback.route("**/api/runs", (r) => r.fulfill({ json: trace }));
  await fallback.route("**/api/agents", (r) => r.fulfill({ json: { agents: [] } }));
  await fallback.addInitScript(() => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  });
  const reduced = await fallback.newPage();
  reduced.on("pageerror", (error) => errors.push(error.message));
  await reduced.goto(origin);
  assert.equal(await reduced.locator("#sound").isDisabled(), true);
  await reduced.locator("#run").click();
  await reduced.waitForFunction(
    () => document.querySelector("#turn-label").textContent === "HARVEST COMPLETE",
  );
  await reduced.locator("#pause").click();
  assert.equal(await reduced.locator(".slot-budget").first().textContent(), "6/6");
  assert.deepEqual(errors, []);
  Object.assign(report, {
    stableRows: true,
    keyboard: true,
    hiddenTabFreeze: true,
    silentWhileHiddenAndPaused: true,
    replayAndSpeed: true,
    reducedMotionWithoutAudio: true,
  });
  await writeFile(out + "/browser-check.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
