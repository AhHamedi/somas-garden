# Hosted development and releases

## Current Amoeboids game

The public address is **https://somas.sites.moonisolutions.net/**. Mooni's existing host-specific route forwards to `https://mooni-selforg.vercel.app`; keep that route and DNS unchanged when releasing this application.

The static game calls `api/society-hosted.mjs`. Its signed HttpOnly cookie selects a browser's isolated named Vercel Sandbox, with a 1 GiB persistent Drive mounted at `/data`. No platform credential is passed to the sandbox. Its engine receives a workspace-specific bearer token; arbitrary callers cannot read or modify worlds through the engine's public port. The sandbox denies outbound network access, including for uploaded Go.

Every phase commits an observer replay and a private checkpoint before publishing the new history index. Checkpoints retain private memory, political state and exact random streams. A sleeping/restarted workspace resumes at the last committed phase; older saves without checkpoints remain archives. Failed persistence returns committed state and rejects further changes, avoiding gaps in history.

The browser cookie is the workspace key: different browsers get separate worlds. Clearing it loses access to that workspace. Run URLs are not cross-browser sharing links; use the game's exports to share results. A new workspace is not created for each new world. Hosted allocation is currently capped at 30 new workspaces per environment/day and 4 per connection/day; returning workspaces are admitted without counting again. Idle runtimes stop after their timeout, renewed by activity. Under storage pressure, the proxy moves a stopped, inactive workspace to the private `selforg-society-archives` bucket. It reads the uploaded archive back and verifies its SHA-256 checksum before releasing the Drive. The same browser restores its files, including replay history, checkpoints and compiled Go strategies, before the engine starts. Active workspaces still need a Drive and an available Sandbox. The archive registry and short database leases coordinate requests across server instances.

### Release the current game

Use Node 20.18.1+ and Go 1.23+, with this checkout linked to the existing `mooni-selforg` Vercel project. The project needs the existing `SELFORG_ENGINE_SECRET`, `SELFORG_GO_SNAPSHOT`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` settings. The Go snapshot supplies `/vercel/go/bin/go` and writable Go caches. Vercel's OIDC credentials authorize the proxy's Sandbox and Drive calls; keep them out of the browser and engine.

Apply the society session and workspace archive migrations in `supabase/migrations/` to the configured database. Only the server can access the archive bucket and workspace registry.

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser:society
npm run build:hosted
vercel deploy --prod --skip-domain
```

Always run `build:hosted` immediately before deployment: it builds the Linux engine and its Go contract sources into private, Git-ignored assets under `runner/`. Both are included in the hosted proxy function, never in `public/`. A bare Git deployment without this build step is insufficient. `.vercelignore` excludes the local Go API helpers from serverless function discovery.

Verify the staged production URL, including creating/playing a world, Results, saved-world reload and an imported Go strategy. Then promote that exact deployment:

```sh
vercel promote <verified-production-deployment>
```

Verify the Mooni address after promotion. Roll back by promoting the preceding verified production deployment. Local development remains `npm run dev` and does not require cloud credentials. Use a separate browser workspace for hosted checks; never test against a user's existing world.

## Legacy one-field prototype

The original app remains at `/legacy`. The instructions below concern only its agent library, replay storage and older execution runner.

The hosted app stores agents and runs in Supabase and executes uploaded Go in Vercel Sandbox. The normal `npm run dev` command uses local files. Use a separate Supabase project or the preview environment for hosted development.

## Configure hosted mode

Copy `.env.example` to `.env.local` and supply the server settings below.

| Setting                     | Purpose                                             |
| --------------------------- | --------------------------------------------------- |
| `SUPABASE_URL`              | Supabase project URL                                |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for agents, runs and rate limits    |
| `SELFORG_ENGINE_SECRET`     | Shared authentication secret for the Go engine      |
| `SELFORG_ADMIN_PASSWORD`    | Password for `/manage`                              |
| `SELFORG_GO_SNAPSHOT`       | Vercel Sandbox snapshot containing the Go toolchain |

Apply the SQL files in `supabase/migrations/` in filename order to a new project's database. They define the tables, server-only access, and hosted request limits. Preview and production records occupy separate environment partitions.

For Go uploads, authenticate with Vercel and obtain development credentials for the linked project. The launcher loads `.local/runner.env` after `.env.local`; it can hold the development `VERCEL_OIDC_TOKEN`. The runner needs a snapshot with Go at `/vercel/go/bin/go`, a writable `/vercel/work`, and `/vercel/gocache` and `/vercel/gopath` directories. The process builds agents inside the sandbox with network access denied.

```sh
npm run dev:hosted
```

Built-ins and builder agents work with Supabase and the engine settings. A configured sandbox snapshot and Vercel credentials enable Go uploads. The Go protocol is described by the in-app guide and the `runner/` files.

## Verify and deploy

Run the ordinary checks before creating a preview. Hosted runner and upload checks have explicit `test:hosted:*` package commands; they require the selected test origin and may create and hide test agents. Use a preview deployment for them.

Configure the same server settings in the linked Vercel project. Preview and production must have their own appropriate values. Keep credentials in environment configuration.

```sh
vercel deploy --target preview
vercel deploy --prod --skip-domain
vercel promote <verified-production-deployment>
```

The staged production deployment lets you check its configuration before assigning the production address. Verify a new run, saved replay, and agent upload against the intended environment. Roll back by promoting the preceding verified production deployment.

## Existing Mooni site

The hosted site is a separate release and may lag behind this repository. The public address is `https://somas.sites.moonisolutions.net`. Its host-specific Mooni route forwards to `https://mooni-selforg.vercel.app`. The route definition is `hosting/mooni/route.json`.

The optional TypeScript scripts in `hosting/mooni/` require `MOONI_ROOT` pointing to a Mooni checkout, its TypeScript runner, and its server credentials. Run them from this repository root. `register.ts` registers the tenant and route metadata; `record-release.ts` records an already verified deployment ID. These are owner operations for the existing site.

Hosted requests allow one concurrent run and two compilation checks per environment, with daily and per-client quotas. Runs use at most six isolated agent instances. Agent decisions have a 1.2-second deadline and a game has a 70-second engine deadline. Each agent instance is stopped after the run.
