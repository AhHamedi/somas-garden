import assert from "node:assert/strict";
import { groupEditKey } from "../../lib/society-groups.mjs";

const behaviour = (harvest) =>
  `package main
func Decide(v View) Action { return Action{Harvest: ${harvest}, Eat: 2} }
`;

// Two independent browser profiles share a library served from the test's temporary disk.
export async function checkGroupLibrary(browser, origin, seed) {
  const owner = await browser.newPage();
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  for (const page of [owner, player]) page.on("pageerror", (e) => errors.push(e.message));
  const key = (group) => groupEditKey(seed, "local", group);
  const groupsURL = `${origin}/api/society/groups`;
  const editor = owner.locator("#group-dialog");
  const openEditor = async (group) => {
    await owner.goto(`${origin}/?groups=${group}#key=${key(group)}`);
    await editor.getByLabel("Team name").waitFor();
    assert.equal(new URL(owner.url()).hash, "", "the edit code leaves the address bar");
  };
  const publish = async (group, revision) => {
    const [response] = await Promise.all([
      owner.waitForResponse(
        (r) => r.url() === `${groupsURL}/${group}` && r.request().method() === "POST",
        { timeout: 60000 },
      ),
      editor.getByRole("button", { name: /Publish (behaviour|update)/i }).click(),
    ]);
    assert.ok(response.ok(), await response.text());
    assert.equal((await response.json()).revision, revision);
    await editor.waitFor({ state: "hidden" });
  };
  try {
    await player.goto(`${origin}/?groups`);
    await player.locator('[data-group-edit="6"]').waitFor();
    assert.equal(await player.locator("[data-group-edit]").count(), 6);
    const initialList = await (await player.request.get(groupsURL)).json();
    assert.deepEqual(
      initialList.groups.map((group) => group.revision),
      [0, 0, 0, 0, 0, 0],
    );
    assert.ok(
      await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );

    await openEditor(1);
    await editor.getByLabel("Team name").fill("Orchard keepers");
    await editor.locator("#group-file").setInputFiles({
      name: "orchard.go",
      mimeType: "text/plain",
      buffer: Buffer.from(behaviour(3)),
    });
    await publish(1, 1);

    await openEditor(2);
    await editor.getByLabel("Behaviour format").selectOption("builder");
    await editor.getByLabel("Team name").fill("Group 2 team");
    await editor.getByRole("button", { name: "Open visual editor" }).click();
    const builder = owner.locator("#strategy-dialog");
    await builder.locator('[data-b="harvest"]').fill("4");
    await builder.getByRole("button", { name: "Use this behaviour" }).click();
    await publish(2, 1);
    for (let group = 3; group <= 6; group++) {
      const response = await owner.request.post(`${groupsURL}/${group}`, {
        data: {
          key: key(group),
          name: `Group ${group} team`,
          expectedRevision: 0,
          builder: { harvest: 2, eat: 2, fallback: "minimalist" },
        },
      });
      assert.ok(response.ok(), await response.text());
    }

    await player.reload();
    const setup = player.locator("#setup-dialog");
    await setup.locator('[data-group-use="1"]').click();
    await setup.locator('[data-team-name][value="Orchard keepers"]').waitFor();
    await setup.locator('[data-stab="groups"]').click();
    await setup.locator("[data-use-six]").click();
    await setup.locator('[data-team-name="5"]').waitFor();
    assert.equal(await setup.locator(".roster-row").count(), 6);
    assert.equal(
      await setup.locator('[data-team-name="0"]').inputValue(),
      "Orchard keepers",
    );
    for (let i = 0; i < 6; i++) await setup.locator(`[data-team-size="${i}"]`).fill("1");

    // The owner changes the publication after the player has selected the first revision.
    await openEditor(1);
    assert.equal(await editor.locator("#group-source").inputValue(), behaviour(3));
    await editor.locator("#group-source").fill(behaviour(5));
    await editor.getByLabel("Team name").fill("Orchard keepers II");
    await publish(1, 2);

    await setup.locator('[data-stab="world"]').click();
    await setup.locator('input[type="number"][data-k="plots"]').fill("1");
    await setup.locator('button[type="submit"]').click();
    await player.waitForFunction(() => window.amoeboids?.ix?.s.teams.length === 6);
    const runId = await player.evaluate(() => amoeboids.pb.id);
    await player.waitForURL(
      (url) => url.searchParams.get("run") === runId && !url.searchParams.has("groups"),
    );
    const response = await player.request.post(
      `${origin}/api/society/runs/${runId}/step`,
      {
        data: { count: 3 },
      },
    );
    assert.ok(response.ok(), await response.text());
    const { snapshot } = await response.json();
    assert.equal(snapshot.phase, "harvest");
    assert.equal(snapshot.teams[0].name, "Orchard keepers");
    assert.equal(snapshot.teams[1].name, "Group 2 team");
    assert.equal(snapshot.teams[1].builder.harvest, 4);
    assert.equal(snapshot.agents.length, 6);
    assert.equal(snapshot.agents.find((a) => a.team === 0).harvested, 3);
    await player.reload();
    await player.waitForFunction(
      (id) => window.amoeboids?.pb.id === id && amoeboids.ix?.s.phase === "harvest",
      runId,
    );

    await player.goto(`${origin}/?groups`);
    await player.getByText("Orchard keepers II", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await Promise.all([owner.close(), player.close()]);
  }
}
