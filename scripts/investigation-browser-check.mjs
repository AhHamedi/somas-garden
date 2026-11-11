import {
  launchBrowser,
  testOrigin,
  engineUrl,
  engineHeaders,
} from "./support/browser.mjs";
// An eight-day scarce field makes a reproducible cross-day planting and an unfilled request.
import assert from "node:assert/strict";

const origin = await testOrigin();
const hosted = process.env.RESEARCH_TEST_RUN;
const id = hosted || "00000000-0000-4000-8000-000000000016";
let recording;
if (!hosted) {
  const builders = [
    {
      mode: "memory",
      rules: [
        {
          fact: "memory",
          op: "gte",
          value: 2,
          action: { food: 5, energy: 3, memory: { op: "set", value: 0 } },
        },
      ],
      fallback: { food: 3, energy: 5, memory: { op: "add", value: 1 } },
    },
    {
      mode: "adaptive",
      rules: [
        {
          fact: "perAgent",
          op: "lt",
          value: 2,
          action: { food: 2, energy: "all" },
        },
      ],
      fallback: { food: 4, energy: 3 },
    },
    { mode: "simple", fallback: { food: 4, energy: 3 } },
    { mode: "simple", fallback: { food: 2, energy: 2 } },
  ];
  const slots = ["Clover", "Fern", "Hazel", "Sorrel"].map((name, index) => ({
    id: name.toLowerCase(),
    name,
    appearance: [2, 4, 1, 0][index],
    startingPantry: 4,
    builder: builders[index],
  }));
  const response = await fetch(await engineUrl(), {
    method: "POST",
    headers: await engineHeaders(),
    body: JSON.stringify({
      settings: {
        roundLimit: 8,
        startingField: 17,
        fieldCapacity: 30,
        dailyFood: 2,
        carryFood: true,
        energyCapacity: 8,
        sunlight: { value: 4 },
        price: { value: 4 },
      },
      slots,
      seed: 37,
    }),
  });
  assert.equal(response.status, 200);
  recording = { id, ...(await response.json()) };
}
const browser = await launchBrowser({});
const errors = [];
try {
  for (const width of [1440, 390, 320]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: width === 320 ? "reduce" : "no-preference",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    if (recording)
      await page.route("**/api/runs/" + id, (r) => r.fulfill({ json: recording }));
    const report = origin + "/?run=" + id + "&view=results";
    await page.goto(report + "&day=3");
    await page.locator("#results-title").waitFor();
    assert.equal(
      await page.locator("[data-garden-day-title]").innerText(),
      "Inside day 3",
    );
    assert.equal(await page.locator("[data-pool-count]").innerText(), "3 / 3");
    assert.match(await page.locator("[data-pool-pending]").innerText(), /2 of 4 energy/);
    assert.deepEqual(
      await page.locator("[data-queue-list] tr").first().locator("td").allTextContents(),
      ["5", "3", "0"],
    );
    await page.getByRole("button", { name: "Open Sorrel’s journal on day 2" }).click();
    assert.match(page.url(), /seat=4&day=2$/);
    await page.locator("[data-aj-seat='0']").click();
    await page.locator("[data-aj-day]").selectOption("3");
    assert.match(
      await page.locator(".aj-choice").textContent(),
      /Rule 1 matched.*Stored memory 2 to 0/,
    );
    await page.selectOption("[data-aj-metric]", "energyGiven");
    await page.locator("[data-result='share']").click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(link, report + "&seat=1&day=3&metric=energyGiven");
    await page.goto(link);
    await page.locator(".aj-choice").waitFor();
    assert.equal(await page.inputValue("[data-aj-metric]"), "energyGiven");
    assert.equal(await page.inputValue("[data-aj-day]"), "3");
    await page.locator(".aj-track").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.inputValue("[data-aj-day]"), "4");
    await page.locator("#tab-journal").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.locator("#tab-overview").getAttribute("aria-selected"),
      "true",
    );
    assert.match(await page.locator("[data-garden-day-title]").textContent(), /day 4$/);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.locator(".gr-settings summary").click();
    assert.match(await page.locator(".gr-settings dl").innerText(), /Random seed\s+37/);
    await page.goto(report + "&seat=99&day=99&metric=bogus");
    await page.locator("#results-title").waitFor();
    assert.equal(page.url(), report);
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      origin,
      hosted: Boolean(hosted),
      widths: [1440, 390, 320],
      crossDayFunding: true,
      sharedMetric: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
