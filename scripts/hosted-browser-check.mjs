import { launchBrowser, testOrigin, requireHostedWrites } from "./support/browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env.local" });
requireHostedWrites();
const origin = await testOrigin();
const browser = await launchBrowser({
  headless: true,
});
await mkdir(".local", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
let uploaded;
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(origin);
  await page.locator("#slots .slot").first().waitFor();
  await page.screenshot({ path: ".local/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Go guide", exact: true }).click();
  assert.equal(await page.locator("#help-dialog").evaluate((e) => e.open), true);
  await page.locator("#help-dialog .close").click();
  {
    await page.locator(".slot-edit").first().click();
    await page.locator("[data-change]").click();
    await page.locator("[data-upload]").click();
    await page.locator("input[name=name]").fill("QA · Browser");
    await page.locator("input[name=file]").setInputFiles({
      name: "agent.go",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "package main\nfunc Decide(v View) Action{return Action{Food:0,Energy:6}}",
      ),
    });
    const checked = page.waitForResponse(
      (r) => r.url().endsWith("/api/agents") && r.request().method() === "POST",
    );
    await page.locator("#submit-upload").click();
    const response = await checked;
    assert.equal(response.status(), 201, await response.text());
    uploaded = (await response.json()).agent;
    await page.locator("#upload-dialog").waitFor({ state: "hidden" });
    await page.locator("[data-library]").click();
    await page.locator('[data-tab="public"]').click();
    await page.locator(`[data-agent="${uploaded.id}"]`).click();
    await page.getByRole("button", { name: "View Go" }).click();
    await page.locator("#source-dialog").waitFor({ state: "visible" });
    assert.match(await page.locator("#source-code").textContent(), /Energy:6/);
    await page.locator("#source-dialog .close").click();
    await page.locator(".gs-close").click();
  }
  await page.locator(".slot-edit").nth(1).click();
  await page.locator("[data-change]").click();
  await page.locator('[data-tab="examples"]').click();
  await page.locator('[data-agent="greedy"]').click();
  await page.locator("[data-use]").click();
  await page.locator(".gs-close").click();
  const runResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/runs") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run garden" }).click();
  const gameResponse = await runResponse;
  assert.equal(gameResponse.status(), 200, await gameResponse.text());
  if (uploaded) assert.equal((await gameResponse.json()).agents[0].totalEnergy, 6);
  await page.waitForFunction(
    () => Number(document.querySelector("#round").textContent) > 0,
    null,
    { timeout: 120000 },
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const round = await page.locator("#round").textContent();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#round").textContent(), round);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.selectOption("#speed", "4");
  await page.getByRole("button", { name: "Replay this game" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator("#garden-setup").click();
  await page.locator("[data-library]").click();
  await page.locator("[data-upload]").click();
  assert.equal(await page.locator("#upload-dialog").evaluate((e) => e.open), true);
  await page.locator("#upload-dialog .close").click();
  await page.locator(".gs-close").click();
  {
    const saved = await browser.newPage();
    await saved.goto(page.url());
    await saved.locator("#replay:not([disabled])").waitFor();
    await saved.getByRole("button", { name: "Replay this game" }).click();
    await saved.waitForFunction(
      () => Number(document.querySelector("#round").textContent) > 0,
    );
    await saved.close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".local/mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.deepEqual(errors, []);
  if (uploaded) {
    await page.goto(origin + "/manage");
    await page.locator("#password").fill(process.env.SELFORG_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Open moderation" }).click();
    const row = page.locator(".manage-row").filter({ hasText: "QA · Browser" }).first();
    await row.getByRole("button", { name: "Hide", exact: true }).click();
    await row.getByRole("button", { name: "Hidden", exact: true }).waitFor();
    assert.ok(
      !(await (await fetch(origin + "/api/agents")).json()).agents.some(
        (a) => a.id === uploaded.id,
      ),
    );
  }
  await writeFile(
    ".local/browser-check.json",
    JSON.stringify(
      {
        origin,
        passed: true,
        consoleErrors: errors,
        mobileOverflow: false,
        uploadAndExecution: true,
        savedReplayReload: true,
        moderation: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      browser: "passed",
      origin,
      errors,
      mobileOverflow: false,
      hosted: true,
    }),
  );
} finally {
  if (uploaded)
    await fetch(origin + "/api/moderate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.SELFORG_ADMIN_PASSWORD,
      },
      body: JSON.stringify({ action: "hide", id: uploaded.id }),
    }).catch(() => {});
  await browser.close();
}
