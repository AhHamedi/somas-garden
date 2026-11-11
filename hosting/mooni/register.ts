import { config } from "dotenv";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../../lib/db.mjs";
config({ path: ".env.local" });
const mooniRoot = process.env.MOONI_ROOT;
if (!mooniRoot)
  throw new Error(
    "Set MOONI_ROOT to your Mooni checkout before registering the hosted site.",
  );
const { createSupabaseRepository } = await import(
  pathToFileURL(mooniRoot + "/packages/db/src/index.ts").href
);
const repository = createSupabaseRepository({
  url: process.env.SUPABASE_URL!,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});
const live = process.argv.includes("--live"),
  domain = "somas.sites.moonisolutions.net",
  origin = "https://mooni-selforg.vercel.app";
const template = {
  id: "somas",
  name: "SOMAS",
  version: "0.2.0",
  riskProfile: "custom_application",
  contentTypes: [],
  tools: [],
};
let tenant = await repository.getTenant("tn_somas");
if (!tenant)
  tenant = await repository.createHostedTenant({
    tenantKey: "tn_somas",
    displayName: "SOMAS",
    timezone: "Europe/London",
    currency: "GBP",
    settings: { application: "somas", runtime: "custom_application" },
  });
const existing = await repository.getSiteByTenant("tn_somas");
if (existing && existing.siteKey !== "site_somas")
  throw Error("SOMAS already has a different site; inspect before assigning.");
const site = await repository.assignHostedSite({
  tenantId: "tn_somas",
  siteKey: "site_somas",
  template,
  status: live ? "live" : "draft",
  liveUrl: "https://" + domain,
  settings: {
    application: "somas",
    runtime: "custom_application",
    applicationOrigin: origin,
    mooniProjectId: "prj_76xCPpgl6XkdCFUsjmneL8zzlAiz",
  },
  env: { MOONI_HOSTED_SITE_DOMAIN: "sites.moonisolutions.net" },
});
await db("tenants?tenant_key=eq.tn_somas", {
  method: "PATCH",
  body: {
    primary_locale: "en",
    secondary_locale: null,
    status: live ? "active" : "draft",
  },
});
await db("templates?id=eq.somas", {
  method: "PATCH",
  body: {
    runtime_package: {
      manifest: template,
      kind: "custom_application",
      origin,
      managedDomain: domain,
      mooniProjectId: "prj_76xCPpgl6XkdCFUsjmneL8zzlAiz",
      routeDefinition: "hosting/mooni/route.json",
    },
    quality_gate: {
      status: live ? "verified" : "staged",
      entrypoint: "https://" + domain,
    },
  },
});
if (live) {
  await repository.saveAuditEvent({
    tenantId: "tn_somas",
    eventType: "hosted_application.published",
    source: "system",
    entityType: "tenant_sites",
    entityId: site.id,
    metadata: {
      publicUrl: "https://" + domain,
      applicationOrigin: origin,
      route: "SOMAS hosted application",
    },
  });
  await repository.saveDeploymentJob({
    tenantId: "tn_somas",
    siteId: "site_somas",
    jobType: "hosted_application_publish",
    status: "completed",
    logs: [{ publicUrl: "https://" + domain, applicationOrigin: origin }],
    finishedAt: new Date().toISOString(),
  });
}
const detail = await repository.getHostedSiteDetail({
  tenantId: "tn_somas",
  previewOrigin: "https://preview.moonisolutions.net",
});
if (live && detail?.publicUrl !== "https://" + domain)
  throw Error("Mooni did not resolve the expected public URL.");
await mkdir(".local", { recursive: true });
await writeFile(
  ".local/mooni-registration.json",
  JSON.stringify(
    {
      tenantId: tenant.tenantKey,
      siteId: site.siteKey,
      status: site.status,
      publicUrl: detail?.publicUrl,
      domain,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    tenant: tenant.tenantKey,
    site: site.siteKey,
    status: site.status,
    publicUrl: detail?.publicUrl,
  }),
);
