import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const problem = (status, message) => Object.assign(new Error(message), { status });
const teamFields = new Set([
  "name",
  "policy",
  "strategyId",
  "builder",
  "coursework",
  "copies",
  "color",
]);

// JSON.parse takes the last duplicate key; Go can merge duplicate object fields.
// Check the original JSON so both decoders agree on every attributed behaviour.
function checkUniqueKeys(text) {
  const objects = [];
  for (const [token, field] of text.matchAll(/"(?:[^"\\]|\\.)*"(\s*:)?|[{}]/gu)) {
    if (token === "{") objects.push(new Set());
    else if (token === "}") objects.pop();
    else if (field) {
      const key = JSON.parse(token.slice(0, -field.length));
      const keys = objects.at(-1);
      if (keys.has(key))
        throw problem(400, "Use each field once in a coursework roster.");
      keys.add(key);
    }
  }
}

// Only new worlds pass through this check. Replays and resumed worlds use
// their recorded roster even after the next upstream release.
export async function verifyCourseworkRun(body, getCatalog) {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : body;
  // Ordinary requests continue through the game's own JSON validation. Unicode
  // escapes can also encode field names, so those requests take the checked path.
  if (!/coursework|\\u/iu.test(text)) return;
  let run;
  try {
    run = JSON.parse(text);
  } catch {
    throw problem(400, "Send a valid JSON world setup.");
  }
  checkUniqueKeys(text);
  const teamKeys = Object.keys(run ?? {}).filter((k) => /^teams$/iu.test(k));
  const claimed = [];
  for (const key of teamKeys) {
    if (!Array.isArray(run[key])) continue;
    for (const team of run[key]) {
      if (!team || !Object.keys(team).some((k) => /^coursework$/iu.test(k))) continue;
      if (
        key !== "teams" ||
        teamKeys.length !== 1 ||
        Object.keys(team).some((field) => !teamFields.has(field))
      )
        throw problem(400, "Use standard team field names for a coursework agent.");
      if (team.coursework != null) claimed.push(team);
    }
  }
  if (!claimed.length) return;
  const catalog = await getCatalog();
  for (const team of claimed) {
    const origin = team.coursework;
    const entry = catalog.find((slot) => slot.group === origin.group);
    if (!entry?.revision || origin.revision !== entry.revision)
      throw problem(
        409,
        "The selected group revision has changed. Refresh the groups and add the current agent to your roster.",
      );
    const { group, path, revision, commit, repository } = entry;
    const expected = { group, path, revision };
    if (commit) expected.commit = commit;
    if (repository) expected.repository = repository;
    if (!isDeepStrictEqual(origin, expected))
      throw problem(
        409,
        "The group source has changed. Refresh the groups and add the current agent to your roster.",
      );
    const sameBehaviour =
      entry.kind === "go"
        ? team.policy === "custom" &&
          team.builder == null &&
          team.strategyId ===
            createHash("sha256")
              .update(entry.name + "\0" + entry.payload.source)
              .digest("hex")
              .slice(0, 32)
        : team.policy === "builder" &&
          !team.strategyId &&
          isDeepStrictEqual(team.builder, entry.payload.builder);
    if (team.name !== entry.name || !sameBehaviour)
      throw problem(
        400,
        `Group ${group} differs from its registered behaviour. Add the agent again or use a custom team.`,
      );
  }
}
