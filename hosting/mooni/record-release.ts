import { config } from "dotenv";
import { pathToFileURL } from "node:url";
config({ path: ".env.local" });
const deploymentId = process.argv[2];
if (!/^dpl_[a-zA-Z0-9]+$/.test(deploymentId || ""))
  throw Error("Supply the verified application deployment ID.");
const root = process.env.MOONI_ROOT;
if (!root)
  throw new Error("Set MOONI_ROOT to your Mooni checkout before recording a release.");
const { createSupabaseRepository } = await import(
  pathToFileURL(root + "/packages/db/src/index.ts").href
);
const repository = createSupabaseRepository({
  url: process.env.SUPABASE_URL!,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});
const site = await repository.getSiteByTenant("tn_somas");
if (site?.siteKey !== "site_somas" || site.status !== "live")
  throw Error("Expected the live SOMAS site.");
const metadata = {
  publicUrl: "https://somas.sites.moonisolutions.net",
  applicationDeploymentId: deploymentId,
  features: [
    "garden_setup",
    "agent_builder",
    "configurable_run_length",
    "garden_results",
    "shared_planting",
    "amoeboid_journal",
    "shareable_agent_perspectives",
  ],
  replayFormat: 4,
};
await repository.saveDeploymentJob({
  tenantId: "tn_somas",
  siteId: "site_somas",
  jobType: "hosted_application_update",
  status: "completed",
  logs: [metadata],
  finishedAt: new Date().toISOString(),
});
await repository.saveAuditEvent({
  tenantId: "tn_somas",
  eventType: "hosted_application.updated",
  source: "system",
  entityType: "tenant_sites",
  entityId: site.id,
  metadata,
});
console.log("SOMAS release recorded in Mooni.");
