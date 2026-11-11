// Small, locally made instruments. The modes are [partial, strength, decay in
// seconds]. A soft mechanical attack and two early reflections give each
// struck object a body. Samples are generated once per audio context.
const instruments = {
  bite: {
    midi: 64,
    length: 0.115,
    attack: 0.0014,
    tap: 1.3,
    bend: 0.65,
    modes: [
      [1, 0.32, 0.018],
      [2.73, 0.13, 0.012],
      [4.95, 0.07, 0.007],
    ],
  },
  porcelain: {
    midi: 74,
    length: 0.43,
    tap: 0.075,
    bend: 0.08,
    modes: [
      [1, 0.8, 0.093],
      [2.01, 0.19, 0.046],
      [3.91, 0.1, 0.024],
      [6.28, 0.055, 0.014],
    ],
  },
  drop: {
    midi: 60,
    length: 0.27,
    tap: 0.12,
    bend: 1.05,
    modes: [
      [1, 0.9, 0.046],
      [1.98, 0.28, 0.022],
      [3.09, 0.09, 0.015],
    ],
  },
  wood: {
    midi: 62,
    length: 0.38,
    tap: 0.22,
    bend: 0.06,
    modes: [
      [1, 0.82, 0.065],
      [2.74, 0.18, 0.031],
      [4.31, 0.1, 0.013],
    ],
  },
  bell: {
    midi: 74,
    length: 0.74,
    tap: 0.025,
    bend: 0.008,
    modes: [
      [1, 0.75, 0.16],
      [2.003, 0.2, 0.09],
      [3.007, 0.14, 0.075],
      [4.19, 0.06, 0.04],
    ],
  },
  reed: {
    midi: 62,
    length: 0.84,
    attack: 0.045,
    tap: 0.01,
    bend: -0.05,
    modes: [
      [1, 0.72, 0.19],
      [2, 0.24, 0.13],
      [3.01, 0.12, 0.09],
    ],
  },
  brush: {
    midi: 62,
    length: 0.18,
    attack: 0.009,
    tap: 1.1,
    bend: -0.14,
    modes: [
      [1, 0.12, 0.035],
      [2.5, 0.08, 0.04],
    ],
  },
};
const biteCrackles = [
  [0.014, 0.84],
  [0.034, 0.52],
  [0.059, 0.19],
];
const sampleCache = new WeakMap();
const midiHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function sample(context, name) {
  if (!sampleCache.has(context)) sampleCache.set(context, new Map());
  const cache = sampleCache.get(context);
  if (cache.has(name)) return cache.get(name);
  const spec = instruments[name];
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(spec.length * rate), rate);
  const data = buffer.getChannelData(0);
  const attack = spec.attack ?? 0.0018;
  const frequency = midiHz(spec.midi);
  let seed = 1733,
    softNoise = 0,
    lastNoise = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const phase =
      2 * Math.PI * frequency * (t + spec.bend * 0.018 * (1 - Math.exp(-t / 0.018)));
    let pressure = 0;
    for (const [partial, strength, decay] of spec.modes) {
      pressure += strength * Math.exp(-t / decay) * Math.sin(partial * phase);
    }
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    softNoise += 0.27 * (seed / 2147483648 - 1 - softNoise);
    lastNoise += 0.055 * (softNoise - lastNoise);
    let contact =
      spec.tap *
      (softNoise - lastNoise) *
      Math.exp(-t / (name === "brush" ? 0.034 : 0.009));
    if (name === "bite") {
      // A carrot first gives under the teeth, then breaks along two fibres.
      // A few milliseconds of band-limited skin noise keep the snap soft.
      for (const [offset, weight] of biteCrackles) {
        const u = t - offset;
        if (u >= 0)
          contact +=
            weight *
            (softNoise - lastNoise) *
            (1 - Math.exp(-u / 0.0011)) *
            Math.exp(-u / 0.007);
      }
    }
    const onset = 1 - Math.exp(-t / attack);
    const end = Math.min(1, (spec.length - t) / 0.014);
    data[i] = 0.78 * (pressure + contact) * onset * end * end;
  }
  // Add reflections backwards to read the dry signal only.
  const wall = Math.round(0.023 * rate),
    leaf = Math.round(0.041 * rate);
  for (let i = data.length - 1; name !== "bite" && i >= wall; i--) {
    const tail = Math.min(1, (data.length - 1 - i) / (rate * 0.013));
    data[i] += tail * (0.076 * data[i - wall] + (i >= leaf ? 0.041 * data[i - leaf] : 0));
  }
  cache.set(name, buffer);
  return buffer;
}

// Six short variations in D major. The pitch rises by wallet level; accents
// inside each wave keep a full garden's thirty-six contacts individually tactile.
const sunPhrase = [
  [62, 69, 66, 69, 62, 66],
  [64, 69, 71, 69, 64, 71],
  [66, 69, 74, 69, 66, 74],
  [69, 74, 71, 74, 69, 71],
  [71, 74, 78, 74, 71, 74],
  [74, 78, 76, 78, 74, 81],
];
const harvestPitch = [0, 2, 4, 7, 9, 7, 4, 7, 9, 12];
const makeNote = (instrument, midi, gain, delay = 0) => ({
  instrument,
  midi,
  gain,
  delay,
});

function voicing(event) {
  const item = event.item || 0;
  const pip = Math.max(0, event.pip || 0) % 6;
  const slot = ((event.actor ?? 0) + 4) % 6;
  switch (event.kind) {
    case "sun_launch":
      return [makeNote("brush", 62, 0.13), makeNote("reed", 69, 0.051, 0.018)];
    case "sun_land":
      return [
        makeNote(
          "porcelain",
          sunPhrase[pip][slot],
          [0.29, 0.195, 0.23, 0.185, 0.25, 0.18][slot],
        ),
      ];
    case "sun_full":
      return [
        makeNote("wood", 62, 0.21),
        makeNote("bell", 69, 0.13, 0.008),
        makeNote("bell", 78, 0.125, 0.021),
        makeNote("porcelain", 83, 0.055, 0.041),
      ];
    case "harvest_land": {
      const pitch = harvestPitch[Math.max(0, item - 1) % harvestPitch.length];
      return [
        makeNote("drop", 55 + pitch / 2, 0.33),
        makeNote("wood", 69 + pitch, 0.14, 0.006),
      ];
    }
    case "harvest_done":
      return [makeNote("wood", 66, 0.16), makeNote("bell", 74, 0.165, 0.012)];
    case "energy_land":
      return [
        makeNote("wood", pip ? 69 : 64, 0.23),
        makeNote("porcelain", pip ? 76 : 71, 0.095, 0.003),
      ];
    case "convert_land":
      return [
        makeNote("drop", 59, 0.19),
        makeNote("bell", 78, 0.16),
        makeNote("porcelain", 81, 0.12, 0.032),
      ];
    case "bite":
      return [makeNote("bite", [64, 63.5, 64.7][item % 3], 0.44)];
    case "shuffle":
      return [makeNote("brush", 66, 0.19), makeNote("wood", 57, 0.055, 0.025)];
    case "grow":
      return [makeNote("wood", 62, 0.15), makeNote("porcelain", 69, 0.09, 0.036)];
    case "death":
      return [
        makeNote("brush", 49, 0.16),
        makeNote("reed", 66, 0.17),
        makeNote("reed", 62, 0.11, 0.14),
      ];
    case "select":
      return [makeNote("wood", 74, 0.125)];
    case "start":
      return [makeNote("wood", 62, 0.13), makeNote("porcelain", 69, 0.115, 0.043)];
    case "confirm":
      return [makeNote("wood", 69, 0.13), makeNote("porcelain", 74, 0.12, 0.04)];
    case "complete":
      return [
        makeNote("wood", 62, 0.21),
        makeNote("bell", 69, 0.13, 0.04),
        makeNote("bell", 74, 0.16, 0.095),
      ];
    default:
      return [];
  }
}

export const MAX_CUES = 12;

export function createGardenInstrument(context, output) {
  // The master remains quiet between actions. All cue paths, including the
  // quick secondary resonance at high speed, pass through this compressor.
  const mix = context.createGain();
  mix.gain.value = 0.86;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -15;
  compressor.knee.value = 10;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.085;
  mix.connect(compressor).connect(output);
  const active = new Set();
  const clusters = new Map();

  function release(cue, now) {
    active.delete(cue);
    const gain = cue.gain.gain;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(0, now, 0.0025);
    for (const source of cue.sources) source.stop(now + 0.016);
  }

  function begin(event, when) {
    for (const cue of active) if (cue.until <= when) active.delete(cue);
    if (active.size >= MAX_CUES) release(active.values().next().value, when);
    const gain = context.createGain();
    const pan = context.createStereoPanner?.();
    if (pan) {
      pan.pan.value = event.pan || 0;
      gain.connect(pan).connect(mix);
    } else gain.connect(mix);
    const cue = {
      gain,
      pan,
      sources: new Set(),
      until: when,
      started: when,
      layered: false,
    };
    active.add(cue);
    return cue;
  }

  function strike(cue, note, when, speed, level = 1) {
    const { instrument, midi, gain, delay } = note;
    const source = context.createBufferSource();
    const envelope = context.createGain();
    source.buffer = sample(context, instrument);
    const ratio = 2 ** ((midi - instruments[instrument].midi) / 12);
    source.playbackRate.value = ratio;
    const start = when + delay / Math.max(1, speed * 2);
    const duration = Math.min(source.buffer.duration / ratio, speed >= 1 ? 0.24 : 1.25);
    const end = start + duration;
    envelope.gain.setValueAtTime(gain * level, start);
    envelope.gain.setValueAtTime(gain * level, end - Math.min(0.025, duration / 2));
    envelope.gain.linearRampToValueAtTime(0, end);
    source.connect(envelope).connect(cue.gain);
    cue.sources.add(source);
    cue.until = Math.max(cue.until, end);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
      cue.sources.delete(source);
      if (cue.sources.size === 0) {
        active.delete(cue);
        cue.gain.disconnect();
        cue.pan?.disconnect();
      }
    };
    source.start(start);
    source.stop(end);
  }

  function playEvents(events, speed = 0.5, when = context.currentTime) {
    for (const event of events) {
      const notes = voicing(event);
      if (!notes.length) continue;
      const grouped = ["sun_land", "energy_land", "convert_land"].includes(event.kind);
      const cluster = grouped ? clusters.get(event.kind) : null;
      if (
        cluster &&
        active.has(cluster) &&
        when - cluster.started < (speed >= 1 ? 0.044 : 0.012)
      ) {
        // Sound close contacts as one two-note harmony and let the rest of
        // this group reinforce the visual wave. Never enqueue overdue notes.
        if (!cluster.layered) {
          strike(cluster, notes[0], when, speed, 0.58);
          cluster.layered = true;
        }
        continue;
      }
      const cue = begin(event, when);
      if (grouped) clusters.set(event.kind, cue);
      for (const note of notes) strike(cue, note, when, speed);
    }
  }

  return {
    playEvents,
    warm() {
      for (const name of Object.keys(instruments)) sample(context, name);
    },
    get activeCues() {
      return active.size;
    },
    silence() {
      clusters.clear();
      for (const cue of active) release(cue, context.currentTime);
    },
  };
}

// Retain the small standalone cue renderer used by diagnostic tools.
function legacyEvent(frame) {
  if (frame.kind) return frame;
  const names = {
    sun_charge: "sun_launch",
    pop: "harvest_land",
    energy: "energy_land",
    convert: "convert_land",
  };
  const actor = frame.agents?.[frame.actor];
  let kind = names[frame.cue] || frame.cue;
  if (!kind) {
    if (frame.phase === "harvest" && actor?.food > 0) kind = "harvest_land";
    if (frame.phase === "contribute" && actor?.given > 0) kind = "energy_land";
    if (frame.phase === "grow" && frame.regrew) kind = "grow";
    if (frame.phase === "death") kind = "death";
  }
  return { kind, actor: frame.actor, item: frame.n || 1 };
}
const renderers = new WeakMap();
export function playGardenCue(context, output, frame) {
  if (!renderers.has(output))
    renderers.set(output, createGardenInstrument(context, output));
  renderers.get(output).playEvents([legacyEvent(frame)]);
}

export function createGardenSound() {
  let enabled = true,
    context,
    instrument;
  try {
    enabled = localStorage.getItem("somas-sound") !== "off";
  } catch {}
  async function unlock() {
    if (!enabled || document.hidden) return;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio({ latencyHint: "interactive" });
        instrument = createGardenInstrument(context, context.destination);
        instrument.warm();
      }
      if (context.state === "suspended" || context.state === "interrupted")
        await context.resume();
    } catch {
      /* A later gesture can retry playback. */
    }
  }
  function silence() {
    instrument?.silence();
  }
  function playEvents(events, speed) {
    if (enabled && !document.hidden && context?.state === "running")
      instrument?.playEvents(events, speed);
  }
  return {
    get supported() {
      return Boolean(window.AudioContext || window.webkitAudioContext);
    },
    get enabled() {
      return enabled;
    },
    unlock,
    silence,
    playEvents,
    toggle() {
      enabled = !enabled;
      try {
        localStorage.setItem("somas-sound", enabled ? "on" : "off");
      } catch {}
      if (enabled) void unlock();
      else silence();
      return enabled;
    },
    play(frame) {
      playEvents([legacyEvent(frame)]);
    },
    playUi(kind) {
      playEvents([{ kind, actor: -1 }]);
    },
  };
}
