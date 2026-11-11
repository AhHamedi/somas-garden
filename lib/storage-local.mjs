import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { uuid } from "./roster.mjs";

// One launcher serves each data directory. Sharing its queue also keeps multiple
// store handles in the same process from racing a read/modify/write operation.
const directories = new Map();

export function createLocalStore(directory) {
  const root = resolve(directory);
  if (!directories.has(root))
    directories.set(root, { writes: Promise.resolve(), leases: new Map() });
  const state = directories.get(root);

  function file(collection, id) {
    if (!uuid.test(id)) throw new Error("Invalid saved record ID.");
    return join(root, collection, id + ".json");
  }

  function change(operation) {
    const pending = state.writes.then(operation);
    state.writes = pending.catch(() => {});
    return pending;
  }

  async function read(collection, id) {
    try {
      return JSON.parse(await readFile(file(collection, id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw new Error("Could not read the local " + collection + " data.", {
        cause: error,
      });
    }
  }

  async function write(collection, id, record) {
    const destination = file(collection, id);
    const temporary = destination + "." + randomUUID() + ".tmp";
    let handle;
    try {
      await mkdir(join(root, collection), { recursive: true });
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(JSON.stringify(record));
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, destination);
    } catch (error) {
      throw new Error("Could not save the local " + collection + " data.", {
        cause: error,
      });
    } finally {
      await handle?.close().catch(() => {});
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  return {
    mode: "local",

    async listAgents(includeHidden = false) {
      let files;
      try {
        files = await readdir(join(root, "agents"));
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw new Error("Could not read the local agents data.", { cause: error });
      }
      const records = await Promise.all(
        files
          .filter((name) => name.endsWith(".json"))
          .map((name) => read("agents", name.slice(0, -5))),
      );
      return records
        .filter((agent) => agent && (includeHidden || agent.visible))
        .sort(
          (a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
        )
        .slice(0, includeHidden ? 300 : 200)
        .map((agent) =>
          includeHidden
            ? {
                id: agent.id,
                name: agent.name,
                visible: agent.visible,
                created_at: agent.created_at,
              }
            : {
                id: agent.id,
                name: agent.name,
                kind: agent.kind,
                mode: agent.builder?.mode,
                created_at: agent.created_at,
              },
        );
    },

    async getAgents(ids) {
      const records = await Promise.all(ids.map((id) => read("agents", id)));
      return records.filter((agent) => agent?.visible);
    },

    saveAgent(record) {
      return change(async () => {
        const agent = {
          ...record,
          id: randomUUID(),
          visible: true,
          created_at: new Date().toISOString(),
        };
        await write("agents", agent.id, agent);
        return agent;
      });
    },

    hideAgent(id) {
      return change(async () => {
        const agent = await read("agents", id);
        if (agent) await write("agents", id, { ...agent, visible: false });
      });
    },

    saveRun(record) {
      return change(async () => {
        if (await read("runs", record.id)) throw new Error("This run is already saved.");
        await write("runs", record.id, record);
      });
    },

    getRun(id) {
      return read("runs", id);
    },

    async claim(kind) {
      if (kind !== "run" && kind !== "compile") throw new Error("Invalid operation.");
      const limit = kind === "run" ? 1 : 2;
      const count = [...state.leases.values()].filter((entry) => entry === kind).length;
      if (count >= limit) {
        const error = new Error(
          "The garden is busy. Try again when the current operation finishes.",
        );
        error.status = 429;
        throw error;
      }
      const lease = randomUUID();
      state.leases.set(lease, kind);
      return lease;
    },

    async release(lease) {
      state.leases.delete(lease);
    },
  };
}
