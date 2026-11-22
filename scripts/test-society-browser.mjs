// End-to-end check of the observer interface against the real simulation
// service. Set SOCIETY_ORIGIN to test an already running server instead.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const temp = await mkdtemp(join(tmpdir(), "amoeboids-browser-"));
const evidence = resolve(".local/verification/browser");
await mkdir(evidence, { recursive: true });
let server = null,
  exited = Promise.resolve(),
  output = "";
let origin = process.env.SOCIETY_ORIGIN;
if (!origin) {
  const sessionFile = join(temp, "dev.json");
  server = spawn(process.execPath, ["scripts/dev.mjs"], {
    env: {
      ...process.env,
      PORT: "0",
      ENGINE_PORT: "0",
      DEV_SESSION_FILE: sessionFile,
      LOCAL_DATA_DIR: join(temp, "data"),
      SOCIETY_DATA_DIR: join(temp, "data", "society"),
      DEV_CONTROL_STDIN: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  server.stdout.on("data", (x) => (output += x));
  server.stderr.on("data", (x) => (output += x));
  exited = new Promise((done) => server.once("exit", done));
  for (let i = 0; i < 1200 && !origin; i++) {
    if (server.exitCode !== null) throw Error(output);
    try {
      origin = JSON.parse(await readFile(sessionFile)).origin;
    } catch {}
    await delay(100);
  }
}
let browser;
const failures = [];
const state = (page) =>
  page.evaluate(() => ({
    month: amoeboids.ix.s.month,
    day: amoeboids.ix.s.day,
    phase: amoeboids.ix.s.phase,
    playing: amoeboids.pb.playing,
    cur: amoeboids.pb.cur,
  }));
try {
  assert.ok(origin, "server started");
  browser = await chromium.launch({ headless: true });
  // Hosted checks can reuse a dedicated test workspace across staged releases.
  const storageState = process.env.SOCIETY_BROWSER_STATE || undefined;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    storageState,
  });
  page.on("pageerror", (e) => failures.push(e.message));
  const startupRequests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/society")) startupRequests.push(new URL(r.url()).pathname);
  });
  await page.goto(origin);
  await page.waitForSelector("#setup-dialog[open]");
  assert.deepEqual(
    startupRequests,
    ["/api/society/config"],
    "a passive first visit allocates no world",
  );
  await page.click('#setup-dialog button[type="submit"]');
  await page.waitForFunction(() => window.amoeboids?.ix, null, { timeout: 30000 });
  const initialRunId = await page.evaluate(() => amoeboids.pb.id);

  // Every inhabited field is selectable.
  assert.equal(await page.locator(".plaque").count(), 6);
  assert.equal(await page.locator("#ledger .plot-row").count(), 6);
  assert.match(await page.locator("#vitals").innerText(), /300/);
  assert.equal(await page.locator("#inspector").isVisible(), false);
  await page.screenshot({ path: join(evidence, "world.png") });

  // Play runs continuously across days at the fastest speed, with no pause.
  for (let i = 0; i < 4; i++) await page.keyboard.press("]");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => amoeboids.pb.playing);
  await page.waitForFunction(
    () => amoeboids.ix.s.day >= 2 && amoeboids.ix.s.phase === "harvest",
    null,
    { timeout: 30000 },
  );
  assert.equal((await state(page)).playing, true, "play continues into the next day");

  // Inspecting a plot does not pause the world.
  await page.keyboard.press("1");
  await page.waitForSelector("#inspector:not([hidden]) .insp-title h2");
  assert.equal(await page.locator(".insp-title h2").innerText(), "Plot A");
  const before = await state(page);
  await page.waitForFunction((cur) => amoeboids.pb.cur > cur + 2, before.cur, {
    timeout: 15000,
  });
  assert.equal((await state(page)).playing, true, "selection leaves playback running");
  for (const tab of ["residents", "assembly", "activity", "overview"]) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForSelector(`[data-tab="${tab}"][aria-selected="true"]`);
  }
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !amoeboids.pb.playing);

  // The statute book shows every local law, and a law unfolds in place with each option.
  await page.click('[data-tab="assembly"]');
  await page.click('[data-amode="laws"]');
  assert.equal(await page.locator(".lc-grid").first().locator(".lawcard").count(), 2);
  assert.ok((await page.locator(".lawcard").count()) === 4, "all local rules are listed");
  await page.click('[data-law="local:harvestOrder"]');
  await page.waitForSelector(".lawx .lx-opt");
  assert.equal(
    await page.locator(".lawx .lx-opt:not(.base)").count(),
    2,
    "both harvest order options are shown",
  );
  assert.equal(
    await page.locator(".lawx .lx-opt.current, .lawx .lx-opt.default").count(),
    1,
    "the option in force or the default is marked",
  );
  await page.screenshot({ path: join(evidence, "law-options.png") });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".lawx", { state: "detached" });

  // The inspector widens on request and the choice is kept.
  const inspectorWidth = () =>
    page.evaluate(
      () => document.getElementById("inspector").getBoundingClientRect().width,
    );
  const compact = await inspectorWidth();
  await page.click("#inspector [data-expand]");
  await page.waitForFunction(
    (w) => document.getElementById("inspector").getBoundingClientRect().width > w + 150,
    compact,
  );
  await page.screenshot({ path: join(evidence, "inspector-wide.png") });
  await page.click("#inspector [data-expand]");
  await page.waitForFunction(
    (w) =>
      Math.abs(document.getElementById("inspector").getBoundingClientRect().width - w) <
      4,
    compact,
  );
  await page.click('[data-tab="residents"]');
  const residents = await page.evaluate(() => amoeboids.ix.residents.get(0).length);
  assert.equal(
    await page.locator(".res-table tbody tr").count(),
    residents,
    "every resident is listed",
  );
  await page.locator(".res-table tbody tr").first().click();
  await page.waitForSelector(".agent-head h2");
  assert.match(
    await page.locator(".stat-rows").innerText(),
    /Body[\s\S]*Mind[\s\S]*Carrots[\s\S]*Voting weight[\s\S]*Voting tokens[\s\S]*Satisfaction/,
  );
  await page.screenshot({ path: join(evidence, "agent.png") });
  await page.keyboard.press("Escape");

  // Reviewing history never changes the world.
  const writes = [];
  const watch = (r) => r.method() !== "GET" && writes.push(r.url());
  page.on("request", watch);
  await page.click('#rail [data-phase="environment"]');
  await page.waitForFunction(() => amoeboids.ix.s.phase === "environment");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => amoeboids.pb.cur >= 0 && !amoeboids.pb.atEdge);
  assert.match(await page.locator("#edge").innerText(), /behind/);
  await page.click("#to-live");
  await page.waitForFunction(() => amoeboids.pb.atEdge);
  page.off("request", watch);
  assert.deepEqual(writes, [], "replay does not step the engine");

  // The council seats every voter of the selected motion.
  await page.evaluate(() =>
    amoeboids.pb.fastForward((f) => f.phase === "voting" && f.day >= 2, undefined, 16),
  );
  await page.click('[data-view="council"]');
  await page.waitForSelector("#view-council:not([hidden]) .page-head");
  const motion = await page.evaluate(() => {
    const id = document.querySelector(".q-item.selected")?.dataset.q;
    const p = amoeboids.ix.s.proposals.find((x) => x.id === id);
    return p ? Object.keys(p.electorate || {}).length : null;
  });
  if (motion !== null)
    assert.equal(await page.locator(".hemicycle .seat").count(), motion);
  await page.screenshot({ path: join(evidence, "council.png") });
  await page.click('[data-view="chronicle"]');
  assert.ok((await page.locator(".day-card").count()) >= 1);
  // Results: a study of the run so far, every chart readable as a table.
  await page.click('[data-view="results"]');
  await page.waitForSelector("#view-results figure.viz-strip svg", { timeout: 15000 });
  assert.equal(await page.locator(".rstat").count(), 5);
  const study = await page.evaluate(() => ({
    data: amoeboids.study.data,
    cur: amoeboids.pb.cur,
  }));
  assert.ok(
    study.data.days.length >= 1 && study.data.days.every((d) => d.frame <= study.cur),
    "nothing beyond the phase on screen",
  );
  assert.equal(
    await page.locator("#view-results .viz-strip .rowlabel").count(),
    6,
    "one row per team",
  );
  await page.click('[data-table-toggle="r-dist"]');
  await page.waitForSelector('[data-viz="r-dist"] table');
  await page.click('[data-table-toggle="r-dist"]');
  await page.click('[data-rteam="0"]');
  await page.waitForFunction(
    () => document.querySelectorAll("#view-results .viz-strip .rowlabel").length === 5,
  );
  await page.click('[data-rteam="0"]');
  for (const section of ["behaviour", "commons", "institutions"]) {
    await page.click(`[data-rsec="${section}"]`);
    await page.waitForSelector(`[data-rsec="${section}"][aria-selected="true"]`);
    await page.waitForSelector("#view-results figure.viz svg");
  }
  await page.screenshot({ path: join(evidence, "results.png") });
  await page.click(".export-menu summary");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('[data-export="motions"]'),
  ]);
  const csv = await readFile(await download.path(), "utf8");
  assert.match(csv.split("\n")[0], /^id,month,tabled_day,decided_day,plot/);

  // Rulebook: every local rule and decision, searchable.
  await page.click('[data-view="rulebook"]');
  await page.waitForSelector("#rb-index .rb-item");
  assert.equal(await page.locator("#rb-index .rb-item").count(), 1 + 4 + 5);
  await page.fill("#rb-q", "quota");
  await page.waitForFunction(
    () => document.querySelectorAll("#rb-index .rb-item").length < 10,
  );
  await page.click('[data-rb="local:quota"]');
  await page.waitForSelector(".rb-head h2");
  assert.equal(await page.locator(".rb-head h2").innerText(), "Harvest quota");
  assert.equal(await page.locator(".rb-opts .rb-opt").count(), 2);
  assert.equal(
    await page.locator(".rb-plots .rb-plot").count(),
    await page.evaluate(() => amoeboids.ix.s.plots.length),
    "the law's standing in every plot",
  );
  await page.fill("#rb-q", "");
  await page.click('[data-rb="local:harvestOrder"]');
  await page.waitForFunction(
    () => document.querySelector(".rb-head h2")?.textContent === "Harvest order",
  );
  assert.equal(
    await page.locator(".rb-opts .rb-opt").count(),
    2,
    "both harvest order choices",
  );
  await page.screenshot({ path: join(evidence, "rulebook.png") });
  await page.keyboard.press("Escape");

  // Editing a behaviour changes the next world's actual engine configuration.
  await page.click("#menu-button");
  await page.click('[data-action="behaviours"]');
  await page.waitForSelector("#setup-dialog[open]");
  await page.fill('[data-team-name="0"]', "Browser stewards");
  await page.click('[data-edit-team="0"]');
  await page.waitForSelector("#strategy-dialog[open]");
  await page.fill('#strategy-dialog [data-b="harvest"]', "4");
  await page.click("#save-strategy");
  await page.waitForSelector("#strategy-dialog[open]", { state: "detached" });
  assert.equal(await page.locator('[data-team-policy="0"]').inputValue(), "custom");

  // A small new world runs to its meteor and reports the month.
  await page.click('[data-stab="world"]');
  for (const [key, value] of Object.entries({ copies: 4, plots: 4, days: 3, months: 2 }))
    await page
      .locator(`#setup-dialog input[type="number"][data-k="${key}"]`)
      .fill(String(value));
  assert.equal(await page.locator('#setup-dialog [data-chart="plots"] rect').count(), 4);
  await page.click('[data-stab="food"]');
  await page.waitForSelector('[data-chart="meal"] svg');
  assert.ok(
    (await page.locator("#setup-dialog .cfg-chart").count()) >= 2,
    "food charts are drawn",
  );
  await page.screenshot({ path: join(evidence, "new-world.png") });
  await page.click('#setup-dialog button[type="submit"]');
  await page.waitForFunction(
    () => amoeboids.ix?.s.plots.length === 4 && amoeboids.ix.s.agents.length === 24,
    null,
    { timeout: 20000 },
  );
  const editedRunId = await page.evaluate(() => amoeboids.pb.id);
  assert.notEqual(editedRunId, initialRunId);
  const createdResponse = await page.request.get(
    `${origin}/api/society/runs/${editedRunId}`,
  );
  assert.equal(createdResponse.status(), 200);
  const created = await createdResponse.json();
  assert.equal(created.snapshot.teams[0].name, "Browser stewards");
  assert.equal(created.snapshot.teams[0].policy, "builder");
  assert.equal(created.snapshot.teams[0].builder.harvest, 4);
  assert.equal(await page.evaluate(() => amoeboids.ix.s.settings.votingTokens), 6);
  assert.equal(await page.locator(".plaque").count(), 4);
  await page.click("#menu-button");
  await page.click('[data-action="to-meteor"]');
  await page.waitForFunction(() => amoeboids.ix.s.meteor, null, { timeout: 30000 });
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.waitForSelector("#month-card:not([hidden])", { timeout: 15000 });
  await page.screenshot({ path: join(evidence, "meteor.png") });
  await page.click("#month-continue");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => amoeboids.ix.s.month === 2, null, { timeout: 20000 });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !amoeboids.pb.playing);

  // Saved-world selection survives reload and a visit without a run URL.
  const savedWrites = [];
  const watchSaved = (r) => r.method() !== "GET" && savedWrites.push(r.url());
  page.on("request", watchSaved);
  await page.click("#menu-button");
  await page.click('[data-action="saved"]');
  await page.waitForSelector(`#saved-dialog[open] [data-run="${initialRunId}"]`);
  assert.equal(
    await page.locator("#saved-dialog [data-run]").first().getAttribute("data-run"),
    editedRunId,
  );
  assert.match(await page.locator("#saved-dialog .saved-current").innerText(), /Month 2/);
  await page.fill("#saved-search", "no matching world");
  assert.equal(await page.locator("#saved-dialog [data-run]").count(), 0);
  await page.fill("#saved-search", "");
  assert.equal(
    await page.locator(`#saved-dialog [data-run="${editedRunId}"]`).count(),
    1,
  );
  await page.click(`#saved-dialog [data-run="${initialRunId}"]`);
  await page.waitForFunction(
    (id) => amoeboids.pb.id === id && amoeboids.ix.s.agents.length === 300,
    initialRunId,
  );
  assert.equal(new URL(page.url()).searchParams.get("run"), initialRunId);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("amoeboids.society.active")),
    initialRunId,
  );
  const [mainResponse] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === "/game/main.js"),
    page.reload(),
  ]);
  assert.ok(
    [200, 304].includes(mainResponse.status()),
    "reload serves or revalidates the rebuilt game entry point",
  );
  await page.waitForFunction(
    (id) => window.amoeboids?.pb.id === id && amoeboids.ix?.s.agents.length === 300,
    initialRunId,
  );
  assert.equal(await page.locator(".plaque").count(), 6);
  assert.equal(await page.locator("canvas#world").isVisible(), true);
  await page.goto(origin);
  await page.waitForFunction(
    (id) => window.amoeboids?.pb.id === id && amoeboids.ix?.s.agents.length === 300,
    initialRunId,
  );
  page.off("request", watchSaved);
  assert.deepEqual(savedWrites, [], "opening and restoring a saved world creates no run");

  // Phone layout: nothing spills sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("1");
  await page.waitForTimeout(500);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "no horizontal scroll on a phone",
  );
  await page.screenshot({ path: join(evidence, "phone.png") });

  // Reduced motion still plays.
  const calm = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
    storageState,
  });
  calm.on("pageerror", (e) => failures.push(e.message));
  await calm.goto(origin);
  await calm.waitForSelector("#setup-dialog[open]");
  await calm.click('#setup-dialog button[type="submit"]');
  await calm.waitForFunction(() => window.amoeboids?.ix);
  await calm.keyboard.press("ArrowRight");
  await calm.waitForFunction(
    () => amoeboids.ix.s.phase !== "ready" || amoeboids.ix.s.day > 1,
  );

  assert.deepEqual(failures, []);
  await writeFile(
    join(evidence, "result.json"),
    JSON.stringify({ passed: true, browserErrors: failures }, null, 2),
  );
  console.log(
    "Society browser flow passed: continuous play, inspection, law options, wide inspector, agent card, replay, council, chronicle, results study and export, rulebook, edited behaviour, new world, meteor, saved worlds and reload, phone and reduced motion.",
  );
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.stdin.end("stop\n");
    const timeout = setTimeout(() => server.kill(), 10000);
    await exited;
    clearTimeout(timeout);
  }
  await rm(temp, { recursive: true, force: true });
}
