// Frame playback. Every phase the engine completes is a saved frame, so live
// play and replay are the same thing: a cursor over frames, with the engine
// stepped ahead of the cursor whenever play reaches the newest frame.

const LOOKAHEAD = 3;
const CACHE_LIMIT = 64;

export const SPEEDS = [
  { id: "0.5", label: "½×", ms: 4400 },
  { id: "1", label: "1×", ms: 2200 },
  { id: "2", label: "2×", ms: 1100 },
  { id: "4", label: "4×", ms: 550 },
  { id: "8", label: "8×", ms: 260 },
];

/** Relative time a phase deserves, so quiet phases pass quickly. */
export function phaseWeight(s) {
  const ev = s.events || [];
  const has = (kind) => ev.some((e) => e.kind === kind);
  switch (s.phase) {
    case "environment":
      return s.day === 1 ? 1.1 : 0.85;
    case "movement":
      return has("move") ? 1.25 : 0.45;
    case "harvest":
      return has("harvest") ? 1 : 0.45;
    case "proposals":
      return (s.proposals || []).some((p) => p.created === s.absoluteDay) ? 0.9 : 0.4;
    case "voting":
      return (s.proposals || []).some((p) => p.closes === s.absoluteDay) ? 1.6 : 0.4;
    case "transfers":
      return has("officer_order") || has("offer") ? 0.7 : 0.35;
    case "eating":
      return 1.05;
    case "close":
      return s.meteor ? 2.4 : 0.9;
    default:
      return 1;
  }
}

export class Playback extends EventTarget {
  constructor(api) {
    super();
    this.api = api;
    this.reset();
  }
  reset() {
    this.id = null;
    this.frames = []; // index entries: {index, month, day, phase, meteor, stats}
    this.cache = new Map();
    this.cur = -1;
    this.snapshot = null;
    this.prev = null;
    this.status = "paused";
    this.playing = false;
    this.stepping = null;
    this.loading = null;
    this.waiting = false;
    this.liveIndex = null;
    this.chain = Promise.resolve();
    this.generation = (this.generation || 0) + 1;
  }
  get max() {
    return this.frames.length - 1;
  }
  get done() {
    return !!this.frames.length && !!this.cache.get(this.max)?.done;
  }
  get readOnly() {
    return this.status === "archived" || this.status === "error";
  }
  /** True when showing the newest phase reached by playing forward. */
  get atEdge() {
    return this.cur >= Math.min(this.max, this.liveIndex ?? this.max);
  }
  get canAdvance() {
    return this.cur < this.max || (!this.readOnly && !this.isFinished());
  }
  isFinished() {
    const last = this.cache.get(this.max);
    return last ? !!last.done : this.status === "complete";
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  remember(index, snapshot) {
    this.cache.set(index, snapshot);
    if (this.cache.size > CACHE_LIMIT) {
      const far = [...this.cache.keys()].sort(
        (a, b) => Math.abs(b - this.cur) - Math.abs(a - this.cur),
      );
      for (const k of far.slice(0, this.cache.size - CACHE_LIMIT))
        if (k !== this.cur && k !== this.max) this.cache.delete(k);
    }
  }
  entry(snapshot, index) {
    return {
      index,
      month: snapshot.month,
      day: snapshot.day,
      phase: snapshot.phase,
      meteor: snapshot.meteor,
      stats: snapshot.stats,
    };
  }

  async open(id, response) {
    this.reset();
    const generation = this.generation;
    this.id = id;
    let data = response || (await this.api(`/runs/${id}`));
    if (data.status === "running") {
      await this.api(`/runs/${id}/pause`, {});
      data = await this.api(`/runs/${id}`);
    }
    if (generation !== this.generation) return;
    this.status = data.status || "paused";
    const history = await this.api(`/runs/${id}/history`).catch(() => ({ frames: [] }));
    if (generation !== this.generation) return;
    this.frames = history.frames?.length ? history.frames : [];
    this.months = history.months || [];
    const index = data.index ?? data.frameIndex ?? this.frames.length - 1;
    if (!this.frames[index]) this.frames[index] = this.entry(data.snapshot, index);
    this.liveIndex = index;
    this.remember(index, data.snapshot);
    this.show(index, data.snapshot, null, 1);
    this.emit("status");
  }

  /** Loads a frame from cache or the server. */
  async load(index) {
    if (this.cache.has(index)) return this.cache.get(index);
    const generation = this.generation;
    const data = await this.api(`/runs/${this.id}/frames/${index}`);
    if (generation !== this.generation) throw new Error("stale");
    this.remember(index, data.snapshot);
    return data.snapshot;
  }

  /** Asks the engine for the next phase. Serialised: one request at a time. */
  stepServer() {
    if (this.stepping) return this.stepping;
    if (this.readOnly || this.isFinished()) return Promise.resolve(false);
    const generation = this.generation;
    this.stepping = this.api(`/runs/${this.id}/step`, { count: 1 })
      .then((data) => {
        if (generation !== this.generation) return false;
        const index = data.index ?? data.frameIndex;
        this.status = data.status || this.status;
        this.frames[index] = this.entry(data.snapshot, index);
        this.remember(index, data.snapshot);
        if (data.error) throw new Error(data.error);
        this.emit("frames");
        return true;
      })
      .catch((error) => {
        if (generation === this.generation) {
          if (error.status === 409) this.status = "archived";
          this.emit("error", error);
          this.pause();
        }
        return false;
      })
      .finally(() => {
        if (generation === this.generation) this.stepping = null;
      });
    return this.stepping;
  }

  /** Keeps a few frames ready beyond the cursor while playing. */
  prefetch() {
    if (this.prefetching) return this.prefetching;
    this.prefetching = (async () => {
      while (
        this.playing &&
        this.max - this.cur < LOOKAHEAD &&
        !this.readOnly &&
        !this.isFinished()
      ) {
        if (!(await this.stepServer())) break;
      }
      for (let i = this.cur + 1; i <= Math.min(this.max, this.cur + LOOKAHEAD); i++)
        if (!this.cache.has(i)) await this.load(i).catch(() => {});
    })().finally(() => {
      this.prefetching = null;
    });
    return this.prefetching;
  }

  show(index, snapshot, prev, progress = 0) {
    this.cur = index;
    this.prev = prev;
    this.snapshot = snapshot;
    this.emit("frame", { snapshot, prev, progress });
  }

  /** Runs cursor moves one after another, so quick key presses cannot race. */
  queue(fn) {
    const run = (this.chain || Promise.resolve()).then(fn);
    this.chain = run.catch(() => {});
    return run;
  }

  /** Moves to the next phase. Resolves false when nothing is available. */
  advance() {
    if (this.waiting) return Promise.resolve(false);
    this.waiting = true;
    const generation = this.generation;
    return this.queue(async () => {
      const next = this.cur + 1;
      if (next > this.max && !(await this.stepServer())) return false;
      if (generation !== this.generation) return false;
      const snapshot = await this.load(next);
      if (generation !== this.generation) return false;
      if (next > (this.liveIndex ?? -1) || this.cur >= (this.liveIndex ?? -1))
        this.liveIndex = Math.max(next, this.liveIndex ?? -1);
      this.show(next, snapshot, this.snapshot, 0);
      if (this.playing) this.prefetch();
      return true;
    })
      .catch((error) => {
        if (error.message !== "stale") this.emit("error", error);
        return false;
      })
      .finally(() => {
        this.waiting = false;
      });
  }

  play() {
    if (!this.canAdvance) return;
    this.playing = true;
    this.emit("status");
    this.prefetch();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.emit("status");
  }

  /** Jumps to a frame without animating the phase. */
  seek(index) {
    const generation = this.generation;
    return this.queue(async () => {
      index = Math.max(0, Math.min(this.max, index));
      const snapshot = await this.load(index);
      if (generation !== this.generation) return;
      const prev =
        index > 0 && this.cache.has(index - 1) ? this.cache.get(index - 1) : null;
      if (index >= (this.liveIndex ?? -1)) this.liveIndex = index;
      this.show(index, snapshot, prev, 1);
    }).catch((error) => {
      if (error.message !== "stale") this.emit("error", error);
    });
  }

  /**
   * Advances quickly until `until(entry)` matches, stepping the engine when
   * needed. Reports progress; `cancel()` stops it.
   */
  async fastForward(until, onProgress, estimate = 0) {
    const generation = (this.ffGeneration = (this.ffGeneration || 0) + 1);
    const wasPlaying = this.playing;
    this.pause();
    let target = this.frames.findIndex((f, i) => i > this.cur && f && until(f));
    let steps = 0;
    while (target < 0) {
      if (this.ffGeneration !== generation) return;
      if (this.readOnly || this.isFinished()) {
        target = this.max;
        break;
      }
      const remaining = estimate ? Math.max(1, Math.min(64, estimate - steps)) : 64;
      const data = await this.api(`/runs/${this.id}/step`, { count: remaining }).catch(
        (error) => {
          this.emit("error", error);
          return null;
        },
      );
      if (!data || this.ffGeneration !== generation) return;
      this.status = data.status || this.status;
      const history = await this.api(`/runs/${this.id}/history`);
      this.frames = history.frames;
      this.months = history.months || this.months;
      const index = data.index ?? data.frameIndex;
      this.remember(index, data.snapshot);
      steps += remaining;
      onProgress?.(steps);
      this.emit("frames");
      target = this.frames.findIndex((f, i) => i > this.cur && f && until(f));
      if (target < 0 && this.isFinished()) target = this.max;
    }
    if (this.ffGeneration !== generation) return;
    await this.seek(target);
    if (wasPlaying) this.play();
  }
  cancelFastForward() {
    this.ffGeneration = (this.ffGeneration || 0) + 1;
  }

  /** Every cached-or-fetched snapshot of the displayed day up to the cursor. */
  async dayFrames(index = this.cur) {
    const f = this.frames[index];
    if (!f) return [];
    let start = index;
    while (
      start > 0 &&
      this.frames[start - 1]?.month === f.month &&
      this.frames[start - 1]?.day === f.day
    )
      start--;
    const out = [];
    for (let i = start; i <= index; i++) out.push(await this.load(i));
    return out;
  }

  async refreshHistory() {
    const history = await this.api(`/runs/${this.id}/history`);
    this.frames = history.frames || this.frames;
    this.months = history.months || this.months;
    this.emit("frames");
  }
}
