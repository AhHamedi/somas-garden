import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { link, mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { db } from "./db.mjs";

const groups = [1, 2, 3, 4, 5, 6];
const maxRevision = 2147483647;
const error = (status, message) => Object.assign(new Error(message), { status });
const conflict = () =>
  error(
    409,
    "Another group member saved a revision. Reopen the latest version before saving.",
  );

function metadata(group, record) {
  return {
    group,
    name: record?.name ?? `Group ${group}`,
    revision: record?.revision ?? 0,
    kind: record?.kind ?? null,
    updatedAt: record?.updatedAt ?? null,
  };
}

export function groupEditKey(secret, scope, group) {
  if (typeof secret !== "string" || secret.length < 32)
    throw error(503, "Group editing has not been configured.");
  if (!["local", "preview", "production"].includes(scope) || !groups.includes(group))
    throw new TypeError("Invalid group or environment.");
  return createHmac("sha256", secret)
    .update(`amoeboids:group-edit:v1:${scope}:${group}`)
    .digest()
    .subarray(0, 18)
    .toString("base64url");
}

export function groupKeyHash(key) {
  return createHash("sha256").update(key).digest("hex");
}

// Hard-link a completed file so another process can never see a partial revision
// or overwrite an existing one. The same primitive persists the local edit seed.
async function createFileOnce(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
    await link(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function localGroupSecret(directory) {
  const path = join(directory, "group-key-seed");
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const seed = randomBytes(32).toString("base64url");
  try {
    await createFileOnce(path, seed + "\n");
    return seed;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return (await readFile(path, "utf8")).trim();
  }
}

export function createLocalGroupStore(directory) {
  async function get(group, revision) {
    const folder = join(directory, `group-${group}`);
    try {
      if (revision === undefined) {
        revision = 0;
        for (const file of await readdir(folder)) {
          const match = /^(\d+)\.json$/.exec(file);
          if (match) revision = Math.max(revision, Number(match[1]));
        }
        if (!revision) return null;
      }
      return JSON.parse(await readFile(join(folder, `${revision}.json`), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  return {
    get,
    list: async () =>
      (await Promise.all(groups.map((group) => get(group)))).filter(Boolean),
    async insert(record) {
      try {
        const path = join(directory, `group-${record.group}`, `${record.revision}.json`);
        await createFileOnce(path, JSON.stringify(record));
      } catch (e) {
        if (e.code === "EEXIST") throw conflict();
        throw e;
      }
      return record;
    },
  };
}

export function createCloudGroupStore(scope, request = db) {
  if (!["preview", "production"].includes(scope))
    throw new TypeError("Invalid hosted group environment.");
  const rows = "selforg_society_group_behaviours";
  const columns = "group:group_no,revision,name,kind,updatedAt:updated_at";
  const filter = `environment=eq.${scope}`;
  return {
    async verifyKey(group, key) {
      if (typeof key !== "string" || !key) return false;
      const [record] = await request(
        `selforg_society_group_keys?select=key_hash&${filter}&group_no=eq.${group}&limit=1`,
      );
      if (!/^[a-f0-9]{64}$/.test(record?.key_hash ?? ""))
        throw error(503, "Group editing has not been configured.");
      return timingSafeEqual(
        Buffer.from(record.key_hash, "hex"),
        Buffer.from(groupKeyHash(key), "hex"),
      );
    },
    list: () =>
      request(
        `selforg_society_group_heads?select=${columns}&${filter}&order=group_no.asc`,
      ),
    async get(group, revision) {
      const byRevision = revision === undefined ? "" : `&revision=eq.${revision}`;
      const records = await request(
        `${rows}?select=${columns},payload&${filter}&group_no=eq.${group}${byRevision}&order=revision.desc&limit=1`,
      );
      return records[0] ?? null;
    },
    async insert(record) {
      const [row] = await request(`${rows}?select=${columns}`, {
        method: "POST",
        body: {
          environment: scope,
          group_no: record.group,
          revision: record.revision,
          name: record.name,
          kind: record.kind,
          payload: record.payload,
        },
      });
      return row;
    },
  };
}

function requestObject(body) {
  let value = body;
  if (Buffer.isBuffer(body) || typeof body === "string") {
    try {
      value = JSON.parse(body.toString());
    } catch {
      throw error(400, "Send a valid JSON object.");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw error(400, "Send a valid JSON object.");
  return value;
}

function publication(group, data) {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name || Buffer.byteLength(name) > 80)
    throw error(400, "Give the behaviour a name of 1–80 bytes.");
  if (
    !Number.isInteger(data.expectedRevision) ||
    data.expectedRevision < 0 ||
    data.expectedRevision >= maxRevision
  )
    throw error(400, "Choose the revision you are replacing.");
  if ((data.source !== undefined) === (data.builder !== undefined))
    throw error(400, "Supply one Go source file or one visual behaviour.");
  let payload, kind;
  if (data.source !== undefined) {
    if (typeof data.source !== "string" || !data.source.trim())
      throw error(400, "Choose a Go source file.");
    if (Buffer.byteLength(data.source) > 65536)
      throw error(413, "Go source must fit within 64 KiB.");
    payload = { source: data.source };
    kind = "go";
  } else {
    if (
      !data.builder ||
      typeof data.builder !== "object" ||
      Array.isArray(data.builder) ||
      (data.policy !== undefined &&
        (typeof data.policy !== "string" || data.policy.length > 80))
    )
      throw error(400, "Supply a visual behaviour object.");
    if (Buffer.byteLength(JSON.stringify(data.builder)) > 65536)
      throw error(413, "A visual behaviour must fit within 64 KiB.");
    payload = { policy: data.policy || "builder", builder: data.builder };
    kind = "builder";
  }
  return {
    group,
    revision: data.expectedRevision + 1,
    name,
    kind,
    payload,
    updatedAt: new Date().toISOString(),
  };
}

export function createGroupService({
  store,
  secret,
  scope,
  compile,
  validate = compile,
}) {
  return async function groupRoute({ method, path, body }) {
    if (path === "groups") {
      if (method !== "GET") throw error(405, "Use GET to list the six groups.");
      const rows = await store.list();
      return {
        groups: groups.map((group) =>
          metadata(
            group,
            rows.find((row) => row.group === group),
          ),
        ),
      };
    }
    const match = /^groups\/([1-6])(?:\/(edit|use))?$/.exec(path);
    if (!match) throw error(404, "Group not found.");
    if (method !== "POST") throw error(405, "Use POST for this group action.");
    const group = Number(match[1]);
    const action = match[2];
    const data = requestObject(body);
    if (action === "use") {
      if (
        !Number.isInteger(data.revision) ||
        data.revision < 1 ||
        data.revision > maxRevision
      )
        throw error(400, "Choose a published revision.");
      const record = await store.get(group, data.revision);
      if (!record) throw error(404, "This group revision has not been published.");
      const behaviour = { name: record.name, ...record.payload };
      return record.kind === "builder" ? behaviour : compile(behaviour);
    }
    const key = typeof data.key === "string" ? data.key.trim() : "";
    const allowed = store.verifyKey
      ? await store.verifyKey(group, key)
      : timingSafeEqual(
          Buffer.from(groupKeyHash(groupEditKey(secret, scope, group)), "hex"),
          Buffer.from(groupKeyHash(key), "hex"),
        );
    if (!allowed) throw error(403, "Enter the edit code for this group.");
    const current = await store.get(group);
    if (action === "edit") return { ...metadata(group, current), ...current?.payload };
    const record = publication(group, data);
    async function verifyRetry() {
      const existing = await store.get(group, record.revision);
      if (
        existing &&
        existing.name === record.name &&
        isDeepStrictEqual(existing.payload, record.payload)
      )
        return metadata(group, existing);
      throw conflict();
    }
    if ((current?.revision ?? 0) !== data.expectedRevision) return verifyRetry();
    await validate({ name: record.name, ...record.payload });
    try {
      return metadata(group, await store.insert(record));
    } catch (e) {
      if (e.status === 409) return verifyRetry();
      throw e;
    }
  };
}
