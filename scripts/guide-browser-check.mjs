import { launchBrowser, testOrigin } from "./support/browser.mjs";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { guideExamples } from "../public/guide-examples.js";
const origin = await testOrigin();
assert.equal(
  (await readFile("public/example.go", "utf8")).replace(
    /^\/\/go:build agent\r?\n\r?\n/,
    "",
  ),
  guideExamples[0].code,
  "Starter download must match the visible example",
);
const browser = await launchBrowser({
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.locator("#slots .slot").first().waitFor();
  await page.getByRole("button", { name: "Go guide", exact: true }).click();
  const dialog = page.locator("#help-dialog");
  assert.ok(await dialog.evaluate((e) => e.open));
  const capabilities = await (
    await page.request.get(origin + "/api/capabilities")
  ).json();
  if (!capabilities.goUploads) {
    assert.equal(await dialog.locator("#guide-open-upload").isDisabled(), true);
    assert.equal(await dialog.locator("#guide-upload-note").isVisible(), true);
  }
  assert.equal(
    await dialog.locator("#guide-example-code").textContent(),
    guideExamples[0].code,
  );
  assert.equal(await dialog.locator(".guide-table tbody tr").count(), 7);
  await page.screenshot({ path: ".local/guide-desktop.png", fullPage: true });
  for (const example of guideExamples) {
    await page.getByRole("tab", { name: example.label, exact: true }).click();
    assert.equal(await dialog.locator("#guide-example-code").textContent(), example.code);
    await page.getByRole("button", { name: "Copy code", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), example.code);
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download this example" }).click();
    const download = await wait;
    assert.equal(await readFile(await download.path(), "utf8"), example.code);
  }
  await page.getByRole("tab", { name: "Simple", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: "Adaptive", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await dialog.locator('.guide-nav a[href="#guide-inputs"]').click();
  await page.waitForTimeout(500);
  assert.equal(
    await dialog.locator(".guide-nav a[aria-current]").getAttribute("href"),
    "#guide-inputs",
  );
  await page.screenshot({ path: ".local/guide-reference.png", fullPage: true });
  assert.equal(
    await dialog.evaluate((e) => e.scrollTop),
    0,
    "Guide toolbar must stay visible",
  );
  await page.keyboard.press("Escape");
  assert.equal(await dialog.evaluate((e) => e.open), false);
  assert.equal(
    await page.locator("#open-help").evaluate((e) => document.activeElement === e),
    true,
  );
  // Only the navigation is exercised; no uploaded code or remote writes are involved.
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ json: { storage: "hosted", goUploads: true } }),
  );
  await page.reload();
  await page.locator("#slots .slot").first().waitFor();
  await page.locator("#garden-setup").click();
  await page.locator("[data-library]").click();
  await page.locator("[data-upload]").click();
  await page.locator("input[name=name]").fill("My preserved agent");
  await page.getByRole("button", { name: "Read the Go guide" }).click();
  assert.equal(await page.locator("#upload-dialog").evaluate((e) => e.open), false);
  await page.getByRole("button", { name: "Close Go guide" }).click();
  await page.waitForFunction(() => document.querySelector("#upload-dialog").open);
  assert.equal(await page.locator("#upload-dialog").evaluate((e) => e.open), true);
  assert.equal(await page.locator("input[name=name]").inputValue(), "My preserved agent");
  await page.locator("#upload-dialog .close").click();
  await page.locator(".gs-close").click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Go guide", exact: true }).click();
    await page.getByRole("tab", { name: "Simple", exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.equal(
      await dialog.evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
      "Dialog overflow",
    );
    assert.equal(
      await dialog
        .locator(".guide-scroll")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
      "Article overflow",
    );
    if (width === 390)
      await page.screenshot({
        path: ".local/guide-mobile.png",
        fullPage: false,
      });
    await dialog.locator('.guide-nav a[href="#guide-upload"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#help-dialog .guide-nav a[aria-current]")
          ?.getAttribute("href") === "#guide-upload",
      null,
      { timeout: 5000 },
    );
    assert.equal(
      await dialog.locator(".guide-nav a[aria-current]").getAttribute("href"),
      "#guide-upload",
    );
    assert.equal(
      await dialog.evaluate((e) => e.scrollTop),
      0,
      "Mobile toolbar must stay visible",
    );
    const close = await page
      .getByRole("button", { name: "Close Go guide" })
      .boundingBox();
    assert.ok(close.y >= 0 && close.y + close.height <= 844);
    await page.getByRole("button", { name: "Upload an agent", exact: true }).click();
    assert.equal(await page.locator("#upload-dialog").evaluate((e) => e.open), true);
    assert.equal(await dialog.evaluate((e) => e.open), false);
    await page.locator("#upload-dialog .close").click();
  }
  await page.goto(new URL("/?guide=1", origin).href);
  await page.waitForFunction(() => document.querySelector("#help-dialog").open);
  assert.equal(await page.locator("#guide-title").textContent(), "Go script guide");
  assert.deepEqual(errors, []);
  const proof = {
    origin,
    examples: guideExamples.map((e) => e.id),
    copyAndDownload: true,
    referenceFields: 7,
    sectionNavigation: true,
    keyboardTabsAndEscape: true,
    uploadFormPreserved: true,
    directGuideLink: true,
    mobileWidths: [390, 320],
    errors,
  };
  await writeFile(".local/guide-browser-check.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} finally {
  await browser.close();
}
