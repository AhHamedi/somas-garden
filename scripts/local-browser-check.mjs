import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { launchBrowser, isLocalOrigin, testOrigin } from "./support/browser.mjs";

const origin = await testOrigin();
assert.ok(
  isLocalOrigin(origin),
  "The local smoke check requires a local development server.",
);
const stateFile = process.env.TEST_STATE_FILE;
if (!stateFile) throw new Error("Run this check with npm run test:browser.");
const browser = await launchBrowser();
const errors = [];
try {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const capabilities = await (
    await context.request.get(origin + "/api/capabilities")
  ).json();
  assert.deepEqual(capabilities, { storage: "local", goUploads: false });
  if (process.argv.includes("--reopen")) {
    const saved = JSON.parse(await readFile(stateFile));
    const replay = await context.request.get(origin + "/api/runs/" + saved.run.id);
    assert.equal(replay.status(), 200);
    assert.deepEqual(await replay.json(), saved.run);
    const library = await (await context.request.get(origin + "/api/agents")).json();
    assert.ok(library.agents.some((agent) => agent.id === saved.agent.id));
    await page.goto(origin + "/?run=" + saved.run.id + "&view=results&seat=1");
    await page.locator(".aj-record").waitFor();
    assert.match(await page.locator(".aj-profile").innerText(), /Amoeboid 1/);
    console.log("Saved run and local agent library survived a server restart.");
  } else {
    await page.goto(origin);
    await page.locator("#slots .slot").first().waitFor();
    assert.match(await page.locator("#slots").innerText(), /Amoeboid 1/);
    await page.locator("#garden-setup").click();
    const dialog = page.locator("#garden-setup-dialog");
    await dialog.locator("#gs-pop").selectOption("1");
    await dialog.locator("[data-rules]").click();
    await dialog.locator("[name=roundLimit]").fill("1");
    await dialog.locator("[name=dailyFood]").fill("0");
    await dialog.getByRole("button", { name: "Save rules", exact: true }).click();
    await dialog.locator("[data-seat]").first().click();
    await dialog.locator("[data-change]").click();
    assert.equal(await dialog.locator("[data-upload]").isDisabled(), true);
    await dialog.getByRole("button", { name: "Create an agent", exact: true }).click();
    await dialog.locator("[name=name]").fill("Working memory");
    await dialog.getByRole("button", { name: "Memory", exact: true }).click();
    await dialog.locator(".gs-try summary").click();
    const preview = page.waitForResponse(
      (r) => r.url().endsWith("/api/builder") && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Test decision", exact: true }).click();
    assert.equal((await preview).status(), 200);
    await dialog
      .getByRole("button", { name: "Save & use strategy", exact: true })
      .click();
    await dialog.locator("[data-library]").click();
    await dialog.getByRole("button", { name: "My agents", exact: true }).click();
    const publishing = page.waitForResponse(
      (r) => r.url().endsWith("/api/agents") && r.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Save to local library", exact: true })
      .click();
    const response = await publishing;
    assert.equal(response.status(), 201);
    const { agent } = await response.json();
    await dialog.locator("[data-use]").click();
    await dialog.locator("[data-assign]").first().click();
    await dialog.locator(".gs-close").click();
    await page.selectOption("#speed", "4");
    const returning = page.waitForResponse(
      (r) => r.url().endsWith("/api/runs") && r.request().method() === "POST",
    );
    await page.locator("#run").click();
    const finished = await returning;
    assert.equal(finished.status(), 200);
    const run = await finished.json();
    assert.equal(run.rounds, 1);
    assert.equal(run.agents[0].name, "Amoeboid 1");
    assert.equal(run.strategies[0].mode, "memory");
    await page.locator("#results-title").waitFor();
    assert.equal(
      await page.locator("#results-title").innerText(),
      "The garden reached day 1.",
    );
    await page.getByRole("tab", { name: "Amoeboid journal", exact: true }).click();
    await page.locator(".aj-record").waitFor();
    await page.getByRole("button", { name: "Copy local link", exact: true }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(new URL(link).searchParams.get("seat"), "1");
    await page.goto(link);
    await page.locator(".aj-record").waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    await writeFile(stateFile, JSON.stringify({ run, agent }));
    console.log(
      "Local builder, library, garden, journal and shared view passed at 1440, 390 and 320 pixels.",
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
