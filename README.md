# SOMAS Amoeboids

A shared-resource simulation for investigating self-organising multi-agent systems. Amoeboids request carrots, contribute energy to the shared field, and eat at the end of each day. The Go engine records their decisions; the browser plays the run and lets you inspect each agent.

[Live site](https://somas.sites.moonisolutions.net) · [Agent-writing guide](https://somas.sites.moonisolutions.net/?guide=1)

## Run locally

Install **Node 20.18.1+** and **Go 1.23+**, then run these commands from the cloned repository.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:8787**. Create agents with the builder, change Garden rules, run a simulation, and open the Amoeboid journal in its results.

Local agents and replays are saved in `.local/data/`. Browser drafts stay in that browser. Local replay links work on the computer running the server. Press Ctrl+C to stop it.

Go must be on your `PATH`; `GO_BINARY` can point to another installation. `PORT` and `ENGINE_PORT` override the default ports 8787 and 8802. `LOCAL_DATA_DIR` selects a different data directory.

Uploaded Go runs in an isolated cloud runner. For that setup or deployment, see [hosting](hosting/README.md).

## Find the code

| Change                             | Start here                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Simulation rules and daily turns   | `pkg/garden/garden.go`, `settings.go`                                  |
| Builder decisions and generated Go | `pkg/garden/builder.go`                                                |
| Default setup and strategy choices | `public/setup-model.js`                                                |
| Setup forms and the agent builder  | `public/setup.js`, `garden-rules.js`, `agent-builder.js`               |
| Animation, characters, and sound   | `public/scene.js`, `characters.js`, `sound.js`                         |
| Results and agent comparisons      | `public/results-data.js`, `run-investigation.js`, `agent-inspector.js` |
| HTTP routes and saved data         | `api/controller.mjs`, `lib/storage-*.mjs`                              |

To change a default rule, update the Go default in `settings.go` and the browser default in `setup-model.js`. To add a built-in strategy, add its policy in `garden.go`, its accepted identifier in `lib/roster.mjs`, and its menu entry in `setup-model.js`. Builder strategies can also be created directly in the app.

## Check a change

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run check
```

`npm test` runs JavaScript and Go tests. The browser check starts a temporary local server and exercises real saves, runs, and results. `npm run check` checks formatting and runs the unit tests; `npm run format` applies formatting. Go packages can also be tested directly with `go test ./...`.

Work on a branch, run the relevant checks, and open a pull request explaining the behaviour you changed. Keep recorded replay compatibility in mind when changing simulation output. CI runs unit checks on Linux, macOS and Windows, plus browser checks on Linux.

## Foundation

The engine extends `BaseServer` and `BaseAgent` from [basePlatformSOMAS v2.1.0](https://github.com/MattSScott/basePlatformSOMAS/tree/v2.1.0). That dependency is MIT-licensed, © 2023 Matt Scott. Game rules live in this repository; the platform runs the turn lifecycle.
