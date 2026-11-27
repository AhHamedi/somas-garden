import assert from "node:assert/strict";

export async function checkFoundingVote(browser, origin) {
  const page = await browser.newPage();
  try {
    // Both motions receive 14 Yes tokens. Only the first covers the ten-mind cost.
    for (const [voters, tokens, expectedStatus] of [
      [14, 1, "scheduled"],
      [2, 7, "failed"],
    ]) {
      const runs = `${origin}/api/society/runs`;
      const created = await page.request.post(runs, {
        data: {
          seed: 42,
          settings: { plots: 1, copies: voters, votingTokens: 7 },
          teams: [
            {
              name: "Founders",
              policy: "builder",
              builder: { government: true, vote: "yes", voteTokens: tokens },
            },
          ],
        },
      });
      assert.equal(created.status(), 201, await created.text());
      const { id } = await created.json();
      const stepped = await page.request.post(`${runs}/${id}/step`, {
        data: { count: 5 },
      });
      assert.ok(stepped.ok(), await stepped.text());
      const { snapshot } = await stepped.json();
      const motion = snapshot.proposals.find((p) => p.input.kind === "found");
      assert.deepEqual([motion.yes, motion.no, motion.status], [14, 0, expectedStatus]);
      await page.goto(`${origin}/?run=${id}`);
      await page.waitForFunction(
        (run) => window.amoeboids?.pb.id === run && amoeboids.ix?.s.phase === "voting",
        id,
      );
      await page.click('[data-view="council"]');
      const funding = page.locator("[data-founding-funding]");
      await funding.waitFor();
      assert.match(
        await funding.innerText(),
        new RegExp(`\\b${voters} mind from Yes ballots\\b`, "i"),
      );
      if (expectedStatus === "failed") {
        assert.match(
          await page.locator("[data-motion-outcome]").innerText(),
          /8 mind short/i,
        );
      }
    }
  } finally {
    await page.close();
  }
}
