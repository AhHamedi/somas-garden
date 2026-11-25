import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { groupEditKey, groupKeyHash, localGroupSecret } from "../lib/society-groups.mjs";

const { values } = parseArgs({
  options: {
    provision: { type: "string" },
    scope: { type: "string" },
    origin: { type: "string", default: "https://somas.sites.moonisolutions.net" },
  },
});
if (!values.provision || !["local", "preview", "production"].includes(values.scope)) {
  console.error(
    "Usage: node scripts/group-edit-codes.mjs --provision <private directory> --scope production|preview|local [--origin <game URL>]",
  );
  process.exit(1);
}
const base = new URL(values.origin);
if (!["https:", "http:"].includes(base.protocol) || base.username || base.password)
  throw new Error("Use the game's HTTP or HTTPS origin.");
if (values.scope !== "local" && base.protocol !== "https:")
  throw new Error("Use HTTPS for a hosted game.");
const directory = resolve(values.provision);
await mkdir(directory, { recursive: true, mode: 0o700 });
if (process.platform !== "win32" && ((await stat(directory)).mode & 0o077) !== 0)
  throw new Error("Choose a private directory with permissions 0700.");
const seed = await localGroupSecret(directory);
async function savePrivate(name, contents) {
  const path = join(directory, name);
  try {
    await writeFile(path, contents, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    if ((await readFile(path, "utf8")) !== contents)
      throw new Error(
        `An existing ${name} has different settings. Use a separate directory.`,
      );
  }
}
const hashes = [];
for (let group = 1; group <= 6; group++) {
  const key = groupEditKey(seed, values.scope, group);
  hashes.push({
    environment: values.scope,
    group_no: group,
    key_hash: groupKeyHash(key),
  });
  const link = new URL("/", base);
  link.searchParams.set("groups", String(group));
  link.hash = new URLSearchParams({ key }).toString();
  const handout = `SOMAS Group ${group}\n\nOpen your group's private link to publish or update your amoeboid behaviour. Share this link only with your group.\n\n${link.href}\n\nYour edit code is ${key}\n`;
  await savePrivate(`group-${group}.txt`, handout);
}
await savePrivate("group-edit-hashes.json", JSON.stringify(hashes, null, 2) + "\n");
console.log("Six private group handouts and their provisioning hashes are ready.");
