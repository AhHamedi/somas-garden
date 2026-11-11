import { launchBrowser, testOrigin } from "./support/browser.mjs";
// Audition the production instruments at their exact presentation timestamps.
import { mkdir, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";

const output = ".local/juice-upgrade/review";
await mkdir(output, { recursive: true });

function waveFile(samples, sampleRate) {
  const pcm = Buffer.from(samples, "base64");
  const result = Buffer.alloc(44 + pcm.length);
  result.write("RIFF", 0);
  result.writeUInt32LE(pcm.length + 36, 4);
  result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(2, 22);
  result.writeUInt32LE(sampleRate, 24);
  result.writeUInt32LE(sampleRate * 4, 28);
  result.writeUInt16LE(4, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(pcm.length, 40);
  pcm.copy(result, 44);
  return result;
}

const browser = await launchBrowser({
  headless: true,
});
try {
  const page = await browser.newPage();
  const origin = await testOrigin();
  // This only needs the two published JS modules, never an actual game.
  await page.route(origin + "/audio-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Audio review</title>",
    }),
  );
  await page.goto(origin + "/audio-test");
  const metrics = [];
  for (const mode of ["sunlight", "garden-actions", "sunlight-4x"]) {
    const { pcm, sampleRate, ...summary } = await page.evaluate(async (mode) => {
      const { sequenceFor, timelineEvents } = await import("/animation.js");
      const { createGardenInstrument } = await import("/sound.js");
      const agents = Array.from({ length: 6 }, () => ({
        energyLeft: 6,
        food: 0,
        given: 0,
      }));
      const initial = {
        phase: "start",
        round: 1,
        actor: -1,
        food: 60,
        agents,
      };
      const events = [];
      const speed = mode === "sunlight-4x" ? 2 : 0.5;
      let seconds = 0.06;
      function append(frame, previous, exclude = []) {
        const steps = sequenceFor(frame, previous).filter(
          (step) => !exclude.includes(step.kind),
        );
        for (const event of timelineEvents(steps))
          events.push({ event, when: seconds + event.atMs / (speed * 1000) });
        seconds += steps.reduce((sum, step) => sum + step.ms, 0) / (speed * 1000);
      }
      append(initial, initial, ["shuffle"]);
      if (mode === "garden-actions") {
        seconds += 0.22;
        const harvest = {
          ...initial,
          actor: 0,
          phase: "harvest",
          agents: [{ ...agents[0], food: 6 }],
        };
        append(harvest, initial);
        seconds += 0.15;
        append(
          {
            ...harvest,
            actor: 0,
            phase: "contribute",
            pending: 0,
            agents: [{ ...agents[0], given: 4 }],
          },
          { ...harvest, pending: 0 },
          ["farming_shuffle"],
        );
        seconds += 0.12;
        events.push({ event: { kind: "complete" }, when: seconds });
      }
      const sampleRate = 44100;
      const ctx = new OfflineAudioContext(
        2,
        Math.ceil((seconds + 1.5) * sampleRate),
        sampleRate,
      );
      const instrument = createGardenInstrument(ctx, ctx.destination);
      let maxActiveCues = 0;
      for (const { event, when } of events) {
        instrument.playEvents([event], speed, when);
        maxActiveCues = Math.max(maxActiveCues, instrument.activeCues);
      }
      const rendered = await ctx.startRendering();
      const l = rendered.getChannelData(0),
        r = rendered.getChannelData(1);
      const interleaved = new Int16Array(l.length * 2);
      let peak = 0,
        maxStep = 0,
        tailPeak = 0,
        energy = 0;
      for (let i = 0; i < l.length; i++) {
        peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
        if (i)
          maxStep = Math.max(
            maxStep,
            Math.abs(l[i] - l[i - 1]),
            Math.abs(r[i] - r[i - 1]),
          );
        if (i > l.length - 2000)
          tailPeak = Math.max(tailPeak, Math.abs(l[i]), Math.abs(r[i]));
        energy += l[i] ** 2 + r[i] ** 2;
        interleaved[i * 2] = Math.round(Math.max(-1, Math.min(1, l[i])) * 32767);
        interleaved[i * 2 + 1] = Math.round(Math.max(-1, Math.min(1, r[i])) * 32767);
      }
      const bytes = new Uint8Array(interleaved.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return {
        sampleRate,
        pcm: btoa(binary),
        mode,
        events: events.length,
        arrivals: events.filter((e) => e.event.kind === "sun_land").length,
        maxActiveCues,
        peak,
        rms: Math.sqrt(energy / (2 * l.length)),
        maxStep,
        tailPeak,
      };
    }, mode);
    assert.equal(summary.arrivals, 36);
    assert.ok(summary.maxActiveCues <= 12);
    assert.ok(summary.peak < 0.9 && summary.peak > 0.08);
    assert.ok(summary.maxStep < 0.12 && summary.tailPeak < 0.0001);
    await writeFile(output + "/" + mode + ".wav", waveFile(pcm, sampleRate));
    metrics.push(summary);
  }
  const impacts = await page.evaluate(async () => {
    const { createGardenInstrument } = await import("/sound.js");
    const kinds = ["sun_land", "harvest_land", "energy_land", "convert_land", "sun_full"];
    const ctx = new OfflineAudioContext(2, 44100 * 9, 44100);
    const instrument = createGardenInstrument(ctx, ctx.destination);
    const appointments = kinds.map((kind, index) => {
      const when = 0.12 + index * 1.6;
      instrument.playEvents([{ kind, actor: 2, pip: 3, item: 1 }], 0.5, when);
      return { kind, when };
    });
    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);
    return appointments.map(({ kind, when }) => {
      const start = Math.round(when * ctx.sampleRate);
      const signal = data.subarray(start, start + 4410);
      const peak = signal.reduce((v, x) => Math.max(v, Math.abs(x)), 0);
      const onset = signal.findIndex((x) => Math.abs(x) > peak * 0.05);
      return {
        kind,
        onsetAfterEventMs: onset < 0 ? null : (1000 * onset) / ctx.sampleRate,
      };
    });
  });
  for (const impact of impacts)
    assert.ok(impact.onsetAfterEventMs !== null && impact.onsetAfterEventMs < 40);
  await writeFile(output + "/audio-attack.json", JSON.stringify(impacts, null, 2));
  await writeFile(output + "/audio-levels.json", JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics));
} finally {
  await browser.close();
}
