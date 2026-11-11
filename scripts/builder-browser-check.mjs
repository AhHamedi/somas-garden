import { launchBrowser, testOrigin } from "./support/browser.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const origin = await testOrigin();
const browser = await launchBrowser({
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 390, height: 850 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Exercise the real compiler/evaluator. Keep public publishing and game creation out of this UI regression check.
const testId = "00000000-0000-4000-8000-000000000044";
let record, input;
await page.route("**/api/agents", async (route) => {
  if (route.request().method() === "GET")
    return route.fulfill({
      json: {
        agents: record
          ? [
              {
                id: testId,
                name: record.name,
                kind: "builder",
                mode: record.builder.mode,
              },
            ]
          : [],
      },
    });
  record = route.request().postDataJSON();
  return route.fulfill({
    status: 201,
    json: {
      agent: {
        id: testId,
        name: record.name,
        kind: "builder",
        mode: record.builder.mode,
      },
    },
  });
});
await page.route("**/api/agents/*/source", (route) => route.fulfill({ json: record }));
await page.route("**/api/runs", (route) => {
  input = route.request().postDataJSON();
  return route.fulfill({
    status: 409,
    json: { error: "UI test captured the setup." },
  });
});
const dialog = page.locator("#garden-setup-dialog");
const button = (name) => dialog.getByRole("button", { name, exact: true });
const field = (name) => dialog.locator(`[name="${name}"]`);
const stored = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("somas.garden.setup.v1")));
try {
  await page.goto(origin);
  await page.locator("#mobile-setup").click();
  await dialog.getByLabel("Number of amoeboids").selectOption("2");
  const seats = (await stored()).roster;
  await button("Garden rules").click();
  const days = field("roundLimit");
  assert.equal(await days.inputValue(), "30");
  for (const invalid of ["0", "51", "1.5", ""]) {
    await days.fill(invalid);
    await button("Save rules").click();
    assert.equal(await days.evaluate((el) => el.checkValidity()), false);
  }
  await days.fill("1");
  await button("Save rules").click();
  assert.equal((await stored()).settings.roundLimit, 1);
  await button("Garden rules").click();
  await button("Use default rules").click();
  assert.equal(await days.inputValue(), "30");
  await days.fill("50");
  await field("fieldCapacity").fill("15");
  await button("Save rules").click();
  assert.equal(
    await field("startingField").evaluate((e) => e.validity.rangeOverflow),
    true,
  );
  await field("startingField").fill("9");
  await field("sunlight.mode").selectOption("random");
  await field("sunlight.min").fill("2");
  await field("sunlight.max").fill("8");
  await field("sunlight.perAgent").check();
  await field("price.mode").selectOption("density");
  await field("price.empty").fill("6");
  await field("price.full").fill("2");
  await field("dailyFood").fill("3");
  await field("carryFood").check();
  await button("Save rules").click();
  await dialog.locator("[data-seat]").first().click();
  await field("seatName").fill("Cress");
  await field("pantry").fill("0");
  await dialog.locator("[data-change]").click();
  await button("Create an agent").click();
  await field("name").fill("Counter");
  await button("Memory").click();
  await field("memoryName").fill("Visits");
  await field("rule.0.fact").selectOption("memory");
  await field("rule.0.value").fill("2");
  await field("rule.0.action.food").selectOption("supper");
  await field("rule.0.action.energy").selectOption("all");
  await field("rule.0.action.memoryOp").selectOption("add");
  await field("rule.0.action.memoryValue").fill("3");
  await button("＋ Add a rule").click();
  await button("Move rule 2 up").click();
  await button("Remove rule 1").click();
  await dialog.locator(".gs-try summary").click();
  for (const [fact, key, limit] of [
    ["totalFood", "TotalFood", "500"],
    ["totalEnergy", "TotalEnergy", "1200"],
    ["totalEaten", "TotalEaten", "500"],
  ]) {
    await field("rule.0.fact").selectOption(fact);
    assert.equal(await field(key).getAttribute("max"), limit);
    await field(key).fill(limit);
  }
  await field("rule.0.fact").selectOption("memory");
  assert.equal(await field("Round").getAttribute("max"), "50");
  assert.equal(await field("Pantry").getAttribute("max"), "560");
  await field("Round").fill("50");
  await field("memory").fill("2");
  await field("Pantry").fill("1");
  await field("Energy").fill("7");
  await button("Test decision").click();
  await dialog
    .getByText("Rule 1 · Ask for 2 carrots and offer 7 energy. Visits tomorrow: 5.")
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await button("Download Go").click();
  const download = await downloadPromise;
  assert.match(await readFile(await download.path(), "utf8"), /somas:api=2/);
  await button("Save & use strategy").click();
  const first = (await stored()).roster[0];
  assert.equal(first.name, "Cress");
  assert.equal(first.appearance, seats[0].appearance);
  assert.equal(first.id, seats[0].id);
  assert.equal(first.startingPantry, 0);
  await dialog.locator("[data-seat]").first().click();
  await field("copies").selectOption("2");
  await button("Duplicate amoeboid").click();
  const copies = (await stored()).roster;
  assert.equal(copies.length, 4);
  assert.equal(copies[2].strategy, first.strategy);
  assert.equal(new Set(copies.map((s) => s.appearance)).size, 4);
  await button("Browse strategies").click();
  await button("My agents").click();
  await button("Save to local library").click();
  await button("Remix privately").click();
  await field("name").fill("Counter remix");
  await button("Save private agent").click();
  assert.equal((await stored()).drafts.length, 2);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.locator("#mobile-setup").click();
  await button("Run this setup").click();
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("captured"),
  );
  assert.equal(input.roster.length, 4);
  assert.equal(input.roster[0].builder.mode, "memory");
  assert.equal(input.roster[0].startingPantry, 0);
  assert.equal(input.roster[1].strategy, "cooperate");
  assert.equal(input.settings.sunlight.perAgent, true);
  assert.equal(input.settings.price.mode, "density");
  assert.equal(input.settings.startingField, 9);
  assert.equal(input.settings.roundLimit, 50);
  // A garden saved before the length control keeps its seats, agents and other rules.
  await page.evaluate(() => {
    const key = "somas.garden.setup.v1";
    const old = JSON.parse(localStorage.getItem(key));
    delete old.settings.roundLimit;
    localStorage.setItem(key, JSON.stringify(old));
  });
  await page.reload();
  await page.locator("#mobile-setup").click();
  await button("Garden rules").click();
  assert.equal(await days.inputValue(), "30");
  assert.equal(await field("startingField").inputValue(), "9");
  await button("Save rules").click();
  assert.deepEqual((await stored()).roster, copies);
  assert.equal((await stored()).drafts.length, 2);
  assert.deepEqual(errors, []);
  console.log(
    "Passed ordered rules, memory preview & export, private/public/remix, named seat copies, bounds, persistence and next-run input.",
  );
} finally {
  await browser.close();
}
