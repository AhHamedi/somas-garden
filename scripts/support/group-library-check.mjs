import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const go = (harvest) =>
  `package main
func Decide(v View) Action { return Action{Harvest: ${harvest}, Eat: 2} }
`;
const builder = (harvest) => JSON.stringify({ harvest, eat: 2, fallback: "minimalist" });

export async function seedTestTeams(teamsDir) {
  for (let group = 1; group <= 6; group++) {
    const dir = join(teamsDir, `group-${group}`);
    await mkdir(dir, { recursive: true });
    const name = group === 1 ? "Orchard keepers" : `Group ${group} team`;
    await writeFile(join(dir, "team.json"), JSON.stringify({ name }));
    if (group === 1) await writeFile(join(dir, "agent.go"), go(3));
    else if (group < 6) await writeFile(join(dir, "builder.json"), builder(2));
  }
}

// Run the game against a disposable checkout; an edit there models a group's next revision.
export async function checkGroupLibrary(browser, origin, teamsDir) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const setup = page.locator("#setup-dialog");
  const groupsURL = `${origin}/api/society/groups`;
  const listOn = async (action) => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url() === groupsURL && r.request().method() === "GET",
      ),
      action(),
    ]);
    assert.ok(response.ok(), await response.text());
    return (await response.json()).groups;
  };
  try {
    const groups = await listOn(() => page.goto(`${origin}/?groups=1#key=retired`));
    await setup.locator('[data-group-slot="6"]').waitFor();
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(await setup.locator("[data-group-slot]").count(), 6);
    assert.equal(await setup.locator("[data-group-edit]").count(), 0);
    assert.equal(await setup.locator("[data-use-six]").isDisabled(), true);
    assert.deepEqual(
      groups.map((g) => g.kind),
      ["go", "builder", "builder", "builder", "builder", null],
    );
    assert.ok(
      await setup
        .locator("#cfg-body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );

    await setup.locator('[data-group-use="1"]').click();
    await setup.locator('[data-team-name][value="Orchard keepers"]').waitFor();
    const existingRoster = await setup
      .locator("[data-team-name]")
      .evaluateAll((els) => els.map((el) => el.value));

    const file6 = join(teamsDir, "group-6", "builder.json");
    await writeFile(file6, builder(2));
    await listOn(() => setup.locator('[data-stab="groups"]').click());
    await writeFile(file6, builder(3));
    const [stale] = await Promise.all([
      page.waitForResponse((r) => r.url() === `${groupsURL}/6/use`),
      setup.locator("[data-use-six]").click(),
    ]);
    assert.equal(stale.status(), 409);
    await setup.getByRole("alert").waitFor();
    await setup.locator('[data-stab="teams"]').click();
    assert.deepEqual(
      await setup
        .locator("[data-team-name]")
        .evaluateAll((els) => els.map((el) => el.value)),
      existingRoster,
      "a stale group cannot partially replace the roster",
    );

    const selected = await listOn(() => setup.locator('[data-stab="groups"]').click());
    await setup.locator("[data-use-six]").click();
    await setup.locator('[data-team-name="0"][value="Orchard keepers"]').waitFor();
    assert.equal(await setup.locator(".roster-row").count(), 6);
    for (let i = 0; i < 6; i++) await setup.locator(`[data-team-size="${i}"]`).fill("1");
    await setup.locator('[data-edit-team="2"]').click();
    await page.locator('#strategy-dialog [data-b="harvest"]').fill("4");
    await page.locator("#save-strategy").click();
    await page.locator("#strategy-dialog").waitFor({ state: "hidden" });

    await setup.locator('[data-stab="world"]').click();
    await setup.locator('input[type="number"][data-k="plots"]').fill("1");
    await setup.locator('button[type="submit"]').click();
    await page.waitForFunction(() => window.amoeboids?.ix?.s.teams.length === 6);
    const runId = await page.evaluate(() => amoeboids.pb.id);
    await page.waitForURL(
      (url) => url.searchParams.get("run") === runId && !url.searchParams.has("groups"),
    );
    // The running match keeps its selected behaviour after the repository changes.
    await writeFile(join(teamsDir, "group-1", "agent.go"), go(5));
    const response = await page.request.post(`${origin}/api/society/runs/${runId}/step`, {
      data: { count: 3 },
    });
    assert.ok(response.ok(), await response.text());
    const { snapshot } = await response.json();
    assert.equal(snapshot.phase, "harvest");
    assert.deepEqual(
      snapshot.teams.map((team) => team.name),
      selected.map((group) => group.name),
    );
    for (const [index, team] of snapshot.teams.entries()) {
      if (index === 2) {
        assert.equal(team.builder.harvest, 4);
        assert.equal(
          team.coursework,
          undefined,
          "an edited behaviour is a local variant",
        );
      } else {
        assert.equal(team.coursework.group, selected[index].group);
        assert.equal(team.coursework.revision, selected[index].revision);
        assert.equal(team.coursework.path, selected[index].path);
      }
    }
    assert.equal(snapshot.agents.length, 6);
    assert.equal(snapshot.agents.find((a) => a.team === 0).harvested, 3);
    await page.reload();
    await page.waitForFunction(
      (id) => window.amoeboids?.pb.id === id && amoeboids.ix?.s.phase === "harvest",
      runId,
    );
    assert.equal(
      await page.evaluate(() => amoeboids.ix.s.teams[0].coursework.revision),
      selected[0].revision,
    );
    await page.locator('[data-view="results"]').click();
    await page.getByRole("tab", { name: "Behaviour" }).click();
    const sources = page.locator("#view-results section").filter({
      has: page.getByRole("heading", { name: "Group agents used in this run" }),
    });
    const pinned = sources.getByRole("row", { name: /Orchard keepers/ });
    await pinned.waitFor();
    assert.ok((await pinned.innerText()).includes(selected[0].path));
    assert.equal(
      await pinned.locator("code[title]").getAttribute("title"),
      selected[0].revision,
    );
    assert.equal(await sources.getByRole("row", { name: /Group 3 team/ }).count(), 0);
    const latest = await listOn(() => page.goto(`${origin}/?groups`));
    assert.notEqual(latest[0].revision, selected[0].revision);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}
