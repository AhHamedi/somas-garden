import { db, environment } from "./db.mjs";

export function createCloudStore() {
  return {
    mode: "hosted",

    listAgents(includeHidden = false) {
      const visibility = includeHidden ? "" : "&visible=eq.true";
      const fields = includeHidden
        ? "id,name,visible,created_at"
        : "id,name,kind,mode:builder->>mode,created_at";
      const limit = includeHidden ? 300 : 200;
      return db(
        `selforg_agents?environment=eq.${environment()}${visibility}&select=${fields}&order=created_at.desc&limit=${limit}`,
      );
    },

    getAgents(ids) {
      if (!ids.length) return Promise.resolve([]);
      return db(
        `selforg_agents?id=in.(${ids.join(",")})&environment=eq.${environment()}&visible=eq.true&select=id,name,kind,source,builder,api_version`,
      );
    },

    async saveAgent(record) {
      const [agent] = await db("selforg_agents", {
        method: "POST",
        body: { ...record, environment: environment() },
      });
      return agent;
    },

    hideAgent(id) {
      return db(`selforg_agents?id=eq.${id}&environment=eq.${environment()}`, {
        method: "PATCH",
        body: { visible: false },
      });
    },

    saveRun(record) {
      return db("selforg_runs", {
        method: "POST",
        body: { ...record, environment: environment() },
        minimal: true,
      });
    },

    async getRun(id) {
      const [run] = await db(
        `selforg_runs?id=eq.${id}&environment=eq.${environment()}&select=id,trace`,
      );
      return run;
    },

    claim(kind, client) {
      return db("rpc/selforg_claim", {
        method: "POST",
        body: { p_env: environment(), p_kind: kind, p_client: client },
      });
    },

    release(lease) {
      return db("rpc/selforg_release", {
        method: "POST",
        body: { p_env: environment(), p_lease: lease },
      });
    },
  };
}
