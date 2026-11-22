# Amoeboids

Amoeboids is a programmable society game. Each individual chooses a carrot plot at the start of the month and shares its harvest with the same neighbours until the reset. Residents rank one another for harvest, spend voting tokens on decisions and elect representatives. A blighted plot needs food from another plot’s Trade representative by the end of the day.

The default run has six teams of 50 individuals, six plots and twelve 30-day months. Each individual chooses how much to harvest, eat and think. Extra food and thinking earn satisfaction. Private memory lets a strategy use its experience when the next month begins.

## Run locally

Install Node 20.18.1 or later and Go 1.23 or later.

```sh
git clone https://github.com/AhHamedi/somas-garden.git
cd somas-garden
npm ci
npm run dev
```

Open **http://127.0.0.1:8787** and press **Play**. Use **World** to inspect a plot and its residents, **Council** to see the ballots, and **Rulebook** to look up institutional rules. The chronicle and results let you inspect how a run unfolded. Menu controls open the setup and team strategy editor.

`GO_BINARY` can select a Go installation. `PORT` and `ENGINE_PORT` choose alternative ports. The local service saves its data under `.local/data/society/`. Set `LOCAL_DATA_DIR` or `SOCIETY_DATA_DIR` to use another location. The original one-field prototype and its replay viewer remain available at **/legacy**.

## The decisions

| Question                           | Who decides                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who harvests first?                | By default each resident ranks everyone on its plot. Borda points determine the order. Each individual then requests a quantity, limited by the remaining crop and room in its store. |
| What can residents change?         | Every active resident may propose. Plot rules set harvest order, advisory quotas, voting thresholds and how many voting tokens each resident receives.                                |
| How do votes count?                | Rule ballots can use the share of eligible residents supporting a change, or the share of tokens cast for it. Founding, elections and revocations use a fixed resident majority.      |
| Who can give food to another plot? | Residents can donate to their local Trade representative. The representative can send food directly to the recipient plot’s elected representative.                                   |
| Who handles a breach?              | Justice reviews a public record of the breach and can issue a sanction. Residents can revoke either department holder.                                                                |
| What happens at a crop shock?      | A bumper crop adds carrots. A blighted plot must receive enough outside aid by the end of transfers or all its residents are excluded.                                                |

The [MVP specification](docs/AMOEBOIDS_SPECIFICATION.md) gives the daily sequence, parameters and worked examples for harvest ranking, voting and relief.

## Design an agent

Use the visual strategy editor or import a Go file. Start with the [downloadable Go example](public/society-example.go) and [agent API](docs/AGENT_API.md). The six built-in teams are programmed examples with policies in [presets.go](pkg/society/presets.go). The same code may serve many individuals, each with separate memory. The runner restricts imports, global state and external I/O and applies decision timeouts.

| Built-in team | Example behaviour                                                                  |
| ------------- | ---------------------------------------------------------------------------------- |
| Wardens       | Propose harvest rules and use Justice to respond to quota breaches.                |
| Tinkerers     | Try four strategies across months and use their own scores to choose the next one. |
| Locusts       | Rank themselves first and try to fill their stores.                                |
| Envoys        | Elect Trade representatives and direct spare carrots toward blighted plots.        |
| Barons        | Support productivity-based voting tokens and eat spare carrots for satisfaction.   |
| Sunchasers    | Choose a promising plot for sunlight at reset and spend mind on thinking.          |

All residents can observe public actions. The observer interface lets the person running the experiment inspect decisions, outcomes and monthly results while the agents make their own choices.

## Reproducible experiments

Run the engine with the default teams and save an experiment.

```sh
go run ./cmd/society -seed 42 -output experiment.json
```

For a smaller run, adjust the number of copies, plots, days and months.

```sh
go run ./cmd/society -copies 5 -plots 3 -days 10 -months 2 -seed 42
```

`-config setup.json` accepts an object containing `settings` and `teams`. The headless command runs built-in and visual-builder policies. Imported Go strategies run through the local application service, which compiles them and transports private memory between callbacks. Hold settings and seed fixed to compare replay outcomes. To study adaptation, compare strategies with and without retained memory across several seeds.

## Development and verification

```sh
npm test
npx playwright install chromium
npm run test:browser:society
npm run check
```

| Area                                             | Files                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Daily phases, resources, observations and agents | `pkg/society/world.go`, `resources.go`, `agents.go`, `types.go` |
| Rules, votes and departments                     | `pkg/society/politics*.go`                                      |
| World settings                                   | `pkg/society/settings.go`                                       |
| Local runs, history, imports and Go workers      | `api/society.go`, `api/society_strategy.go`                     |
| Observer interface                               | `public/society.html`, `public/game/`                           |
| Headless experiments                             | `cmd/society/main.go`                                           |
| Original one-field experiment                    | `pkg/garden/`, `public/index.html`                              |

## Hosting

The [hosted game](https://somas.sites.moonisolutions.net/) provides browser workspaces using Vercel Sandbox, with a persistent drive for worlds, replays and imported strategies. A signed browser cookie reopens the workspace. The [hosting instructions](hosting/README.md) cover deployment, workspace limits and recovery. Local runs keep strategies and simulation data on your machine.

## Foundation

The original prototype extends `BaseServer` and `BaseAgent` from [basePlatformSOMAS v2.1.0](https://github.com/MattSScott/basePlatformSOMAS/tree/v2.1.0), MIT-licensed, © 2023 Matt Scott. The society engine implements the daily phases separately. The original package remains available and tested.
