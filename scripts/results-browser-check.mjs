import {
  launchBrowser,
  testOrigin,
  engineUrl,
  engineHeaders,
} from "./support/browser.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = await testOrigin();
const output = process.env.REVIEW_DIR || ".local/endings-review/browser";
await mkdir(output, { recursive: true });
const browser = await launchBrowser({
  headless: true,
});
const id = "00000000-0000-4000-8000-000000000053";
const errorMessages = [];
async function recorded(settings, slots) {
  const response = await fetch(await engineUrl(), {
    method: "POST",
    headers: await engineHeaders(),
    body: JSON.stringify({ seed: 84, settings, slots }),
  });
  assert.equal(response.status, 200);
  return { id, ...(await response.json()) };
}
function seat(name, food, energy, appearance, startingPantry = 0) {
  return {
    id: name.toLowerCase(),
    name,
    appearance,
    startingPantry,
    builder: { mode: "simple", fallback: { food, energy } },
  };
}
const mixed = await recorded(
  {
    roundLimit: 8,
    startingField: 47,
    fieldCapacity: 60,
    dailyFood: 2,
    carryFood: true,
    energyCapacity: 9,
    sunlight: { mode: "random", min: 4, max: 7 },
    price: { mode: "density", empty: 4, full: 2 },
  },
  [
    seat("Clover", 2, 6, 2),
    seat("Fern", 2, 5, 4),
    seat("Hazel", 3, 3, 1),
    seat("Sorrel", 0, 2, 0, 4),
    seat("Basil", 2, "all", 3),
  ],
);
const solo = await recorded({ roundLimit: 1, startingField: 0, dailyFood: 2 }, [
  seat("Clover", 0, 0, 2, 1),
]);
const survivor = await recorded({ roundLimit: 1, startingField: 6, dailyFood: 0 }, [
  seat("Fern", 2, 0, 4),
]);
const options = { permissions: ["clipboard-read", "clipboard-write"] };
async function open(page, trace, results = false) {
  await page.route("**/api/runs/" + id, (r) => r.fulfill({ json: trace }));
  await page.route("**/api/agents", (r) => r.fulfill({ json: { agents: [] } }));
  await page.goto(origin + "/?run=" + id + (results ? "&view=results" : ""));
  await page.locator(results ? "#results-title" : "#view-results").waitFor();
}
const resultsVisible = (p) => p.locator("#run-results").isVisible();
try {
  for (const width of [1440, 390, 320]) {
    const ctx = await browser.newContext({
      ...options,
      viewport: { width, height: 920 },
      reducedMotion: width === 320 ? "reduce" : "no-preference",
    });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errorMessages.push(e.message));
    await open(p, mixed);
    assert.equal(await resultsVisible(p), false);
    assert.equal(await p.locator("#round-limit").innerText(), "8");
    await p.selectOption("#speed", "4");
    await p.click("#replay");
    await p.waitForFunction(
      () => document.querySelector("#turn-label").textContent === "SUNLIGHT",
    );
    await p.click("#view-results");
    assert.equal(
      await p.locator("#results-title").innerText(),
      "The garden reached day 8.",
    );
    assert.equal(await p.evaluate(() => document.activeElement.id), "results-title");
    const held = await p.locator("#turn-box").textContent();
    await p.waitForTimeout(200);
    await p.locator('[data-result="return"]').click();
    assert.equal(await p.locator("#turn-box").textContent(), held);
    assert.equal(await p.locator("#pause").innerText(), "Resume");
    assert.equal(await p.evaluate(() => document.activeElement.id), "view-results");
    await p.click("#view-results");
    await p.locator('[data-result="share"]').click();
    assert.equal(
      await p.evaluate(() => navigator.clipboard.readText()),
      origin + "/?run=" + id + "&view=results",
    );
    await p.reload();
    await p.locator("#results-title").waitFor();
    assert.equal(await p.locator("#outcome-announcement").innerText(), "");
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: output + "/mixed-" + width + ".png",
      fullPage: true,
    });
    await p.locator(".gr-values summary").click();
    assert.equal(await p.locator(".gr-values tbody tr").count(), 8);
    await p.locator('[data-result="setup"]').click();
    await p.locator("[data-rules]").click();
    await p.locator('input[name="roundLimit"]').fill("50");
    await p.getByRole("button", { name: "Save rules", exact: true }).click();
    await p.locator(".gs-close").click();
    assert.equal(
      await p.locator("#results-title").innerText(),
      "The garden reached day 8.",
    );
    await p.locator('[data-result="replay"]').click();
    assert.equal(await resultsVisible(p), false);
    assert.equal(await p.locator("#round").innerText(), "00");
    assert.equal(await p.locator("#round-limit").innerText(), "8");
    await ctx.close();
  }
  for (const [trace, expected] of [
    [solo, "The amoeboid has died."],
    [survivor, "The garden reached day 1."],
  ]) {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on("pageerror", (e) => errorMessages.push(e.message));
    await open(p, trace);
    await p.selectOption("#speed", "4");
    await p.click("#replay");
    // Preserve an actively focused keyboard control on the automatic transition.
    await p.locator("#speed").focus();
    await p.keyboard.press("Tab");
    await p.locator("#speed").focus();
    if (trace === solo) {
      await p.waitForFunction(
        () => document.querySelector("#turn-label").textContent === "STARVATION",
      );
      await p.waitForTimeout(150);
      assert.equal(await resultsVisible(p), false);
    }
    await p.locator("#results-title").waitFor();
    assert.equal(await p.locator("#results-title").innerText(), expected);
    assert.equal(await p.evaluate(() => document.activeElement.id), "speed");
    assert.ok(
      (await p.locator("#outcome-announcement").textContent()).startsWith(expected),
    );
    await p.keyboard.press("Tab");
    assert.ok(
      await p.evaluate(() =>
        document.querySelector("#run-results").contains(document.activeElement),
      ),
    );
    assert.equal(await p.locator('[data-result="return"]').isVisible(), false);
    await p.locator('[data-result="replay"]').click();
    assert.equal(await resultsVisible(p), false);
    await p.close();
  }
  assert.deepEqual(errorMessages, []);
  await writeFile(
    output + "/checks.json",
    JSON.stringify(
      {
        origin,
        widths: [1440, 390, 320],
        natural: ["survival", "extinction"],
        manualPositionPreserved: true,
        focusPreserved: true,
        savedSetupSeparate: true,
        errors: errorMessages,
      },
      null,
      2,
    ),
  );
  console.log(
    "Garden endings passed on desktop and phones, including natural finish, keyboard focus, exact paused return, shared link, and separate next-run settings.",
  );
} finally {
  await browser.close();
}
