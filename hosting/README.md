# Hosted development and releases

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

The current public address is `https://somas.sites.moonisolutions.net`. Its host-specific Mooni route forwards to `https://mooni-selforg.vercel.app`. The route definition is `hosting/mooni/route.json`.

The optional TypeScript scripts in `hosting/mooni/` require `MOONI_ROOT` pointing to a Mooni checkout, its TypeScript runner, and its server credentials. Run them from this repository root. `register.ts` registers the tenant and route metadata; `record-release.ts` records an already verified deployment ID. These are owner operations for the existing site.

Hosted requests allow one concurrent run and two compilation checks per environment, with daily and per-client quotas. Runs use at most six isolated agent instances. Agent decisions have a 1.2-second deadline and a game has a 70-second engine deadline. Each agent instance is stopped after the run.
