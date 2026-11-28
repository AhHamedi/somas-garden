import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const groups = [1, 2, 3, 4, 5, 6];
const files = new Set(["team.json", "agent.go", "builder.json", "README.md"]);
const systemFile = (name) => name === ".DS_Store" || name === "Thumbs.db";
const error = (status, message) => Object.assign(new Error(message), { status });
const invalid = (message) => error(422, message);
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function parseObject(raw, path) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw invalid(`${path} must contain a valid JSON object.`);
  }
  if (!object(data)) throw invalid(`${path} must contain a JSON object.`);
  return data;
}

async function readText(directory, file, path) {
  const filename = join(directory, file);
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.size > 65536)
    throw invalid(`${path} must be a regular file of at most 64 KiB.`);
  const bytes = await readFile(filename);
  if (bytes.length > 65536) throw invalid(`${path} exceeds 64 KiB.`);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw invalid(`${path} must be UTF-8 text.`);
  }
}

async function readSlot(directory, group, provenance) {
  const folder = `group-${group}`;
  const path = `teams/${folder}`;
  const slot = join(directory, folder);
  const entries = await readdir(slot, { withFileTypes: true });
  for (const entry of entries) {
    if (systemFile(entry.name) && entry.isFile()) continue;
    if (!entry.isFile() || !files.has(entry.name))
      throw invalid(
        `Unexpected entry ${path}/${entry.name}. Use team.json, one behaviour file, and an optional README.md.`,
      );
  }
  if (!entries.some((entry) => entry.name === "team.json"))
    throw invalid(`${path}/team.json is missing.`);
  const manifest = parseObject(
    await readText(slot, "team.json", path + "/team.json"),
    path + "/team.json",
  );
  if (
    Object.keys(manifest).length !== 1 ||
    typeof manifest.name !== "string" ||
    !manifest.name.trim() ||
    manifest.name.trim() !== manifest.name ||
    Buffer.byteLength(manifest.name) > 80
  )
    throw invalid(
      `${path}/team.json must contain only a name of 1–80 UTF-8 bytes without surrounding whitespace.`,
    );
  const base = { group, name: manifest.name, path, ...provenance };
  const sources = entries.filter(
    (entry) => entry.name === "agent.go" || entry.name === "builder.json",
  );
  if (sources.length === 0) return { ...base, kind: null, revision: null };
  if (sources.length !== 1)
    throw invalid(`Choose either agent.go or builder.json in ${path}.`);
  const filename = sources[0].name;
  const sourcePath = `${path}/${filename}`;
  const raw = await readText(slot, filename, sourcePath);
  if (!raw.trim()) throw invalid(`${sourcePath} is empty.`);
  const kind = filename === "agent.go" ? "go" : "builder";
  const payload =
    kind === "go"
      ? { source: raw }
      : { policy: "builder", builder: parseObject(raw, sourcePath) };
  const revision = createHash("sha256")
    .update(JSON.stringify([base.name, kind, raw]))
    .digest("hex");
  return { ...base, path: sourcePath, kind, revision, payload };
}

// The build reads the checked-out tree once. Local development reads on each request.
export async function readGroupCatalog(directory, provenance = {}) {
  if (!(await lstat(directory)).isDirectory())
    throw invalid("teams must be a directory.");
  const entries = await readdir(directory, { withFileTypes: true });
  const expected = new Set(groups.map((n) => `group-${n}`));
  for (const entry of entries) {
    if (
      entry.isFile() &&
      (entry.name === "README.md" || entry.name === "go.mod" || systemFile(entry.name))
    )
      continue;
    if (!entry.isDirectory() || !expected.delete(entry.name))
      throw invalid(
        `Unexpected entry teams/${entry.name}. Expected directories group-1 through group-6.`,
      );
  }
  if (expected.size)
    throw invalid(`Missing team directories: ${[...expected].join(", ")}.`);
  return Promise.all(groups.map((group) => readSlot(directory, group, provenance)));
}

// A CLI or local build may have no verifiable Git metadata. Its content digest
// still identifies the selected behaviour. Only GitHub deployments get permalinks.
export function deploymentProvenance(env) {
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  if (
    env.VERCEL_GIT_PROVIDER !== "github" ||
    typeof commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(commit) ||
    typeof owner !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner) ||
    typeof repo !== "string" ||
    !/^[A-Za-z0-9_.-]+$/.test(repo) ||
    repo === "." ||
    repo === ".."
  )
    return {};
  return { commit, repository: `${owner}/${repo}` };
}

function metadata({ payload, ...entry }) {
  return entry;
}

export function createGroupService({ getCatalog, compile }) {
  return async function serveGroups({ method, path, body }) {
    if (path === "groups") {
      if (method !== "GET") throw error(405, "Use GET to list the six groups.");
      return { groups: (await getCatalog()).map(metadata) };
    }
    const match = /^groups\/([1-6])\/use$/.exec(path);
    if (!match) throw error(404, "Group endpoint not found.");
    if (method !== "POST") throw error(405, "Use POST to import this group.");
    let data = body;
    if (Buffer.isBuffer(body) || typeof body === "string") {
      try {
        data = JSON.parse(body.toString());
      } catch {
        throw error(400, "Send a JSON object with the selected revision.");
      }
    }
    if (
      !object(data) ||
      typeof data.revision !== "string" ||
      !/^[0-9a-f]{64}$/.test(data.revision)
    )
      throw error(400, "Select a revision from the coursework teams.");
    const group = Number(match[1]);
    const entry = (await getCatalog())[group - 1];
    if (data.revision !== entry.revision)
      throw error(
        409,
        "This group has changed. Refresh the coursework teams and select it again.",
      );
    const { kind, name, ...coursework } = metadata(entry);
    const behaviour = { name, ...entry.payload };
    const result = kind === "go" ? await compile(behaviour) : behaviour;
    return { ...result, coursework };
  };
}
