# Amoeboids

A programmable society of autonomous agents, shared carrot plots and institutions that the agents create themselves. The simulation runs in daily phases. Individuals decide how to harvest, eat, think, move, propose, vote and exercise delegated powers. Weather changes mind regeneration; private and government stores preserve food. A meteor resets the world each month, leaving only each individual's private memory.

The default experiment has six behaviours, 50 independent copies of each, six plots and twelve 30-day months. The supplied behaviours are transparent programmed examples, not evidence of learned cooperation.

**[Play the hosted game](https://somas.sites.moonisolutions.net/)**, or run your own local copy below.

![Amoeboids: the island during a vote, with assemblies gathered at each hall](docs/images/amoeboids-world.png)

## Run the MVP

Install **Node 20.18.1+** and **Go 1.23+**:

```sh
git clone https://github.com/AhHamedi/somas-garden.git
cd somas-garden
npm ci
npm run dev
```

Open **http://127.0.0.1:8787** and press **Play**. The island lights up through each day's eight phases while every Amoeboid migrates, harvests, debates, votes, eats and sleeps. Play continues until you pause; selecting things never stops it.

- **World:** select a plot on the map, in the ledger or with the number keys. Its inspector shows what is happening there now, field and treasury, residents with roles and influence, every law in force, today's motions and the day's activity. Select an Amoeboid for its body, mind, food, satisfaction, powers and votes. Widen the inspector with its ↔ button or drag its edge.
- **Council:** every motion seated as a chamber, with the passing line, before and after, and support by team.
- **Rulebook:** every law, charter rule and one-off decision the Amoeboids can vote on, with every option, how it is decided and where it is in force.
- **Chronicle** and **Results:** the month day by day, and a study of the run (outcomes, behaviour, the commons and institutions) with table views and CSV exports.
- The console at the bottom shows the phase, what it achieved, speed (½× to 8×) and a scrubbable month timeline. Space plays and pauses; the arrows step; Shift and the right arrow skip to nightfall. **Menu → New world** changes the setup, with live charts for meals, field regrowth and weather and the respawn rule (by default the dead return at the meteor); **Menu → Team behaviours** edits strategies.

The legacy one-field prototype remains at **/legacy**. Its strategies and old replay format are separate from the new game.

`GO_BINARY` can point to a Go installation. `PORT` and `ENGINE_PORT` choose alternative ports. Local simulation replays and uploaded strategies are saved under `.local/data/society/`; `LOCAL_DATA_DIR` or `SOCIETY_DATA_DIR` can select another location. Never commit `.local/`.

Worlds and saved replays survive server restarts. New runs recover at their last saved phase, including private agent memory and uploaded behaviours. Older replay-only saves remain read-only archives. Browser settings and strategy drafts are also retained locally.

## The six built-in teams

Each is a complete style of play using only what an Amoeboid can observe. They are in `pkg/society/presets.go` and are meant as examples to read, beat and copy.

| Team           | Style                                                                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wardens**    | Guard the commons. Compute the harvest that keeps the field steady from the growth rule, table a quota at that share with hard enforcement, cap entry at what the field can feed, and repeal a granary levy that eats into the field.                |
| **Tinkerers**  | Learn. Each tries four styles (frugal, civic, feast, roam) in its first months, staggered so the team explores them all at once, then keeps the best by an upper confidence bound on its monthly satisfaction. Shortages deepen the larder it keeps. |
| **Locusts**    | Free-ride. Harvest to the limit while a field has surplus, vote down every limit, never pay for institutions, leave a thinned field, and drift away from plots that enforce quotas.                                                                  |
| **Envoys**     | Federate. Found governments, form a federation of every governed plot, take council seats, ratify and enact data sharing, gifts and donations, and send carrots from a healthy field to a failing member.                                            |
| **Barons**     | Seek power. Win a treasury office worded so cautious neighbours accept it, levy the field's surplus into the treasury and pay it out to barons only; also try for influence, harvest order, the gate and the agenda, dropping what fails twice.      |
| **Sunchasers** | Think. Follow tomorrow's expected sunshine between plots with room to feed them, carry a two-day larder, and never spend mind on politics.                                                                                                           |

All six eat to restore their bodies, think with every unpledged unit of mind, leave crowded plots in proportion to the excess, and remember fields they have seen and plots that refused them. In a default run the commons usually holds all year; Locusts tend to out-score the teams that pay for order, and Envoys pay most.

## Design an agent

Use the visual strategy editor for simple decisions and phase-specific rules. For more control, import a Go file through the editor. Start with [the downloadable example](public/society-example.go) and [the agent guide](docs/AGENT_API.md).

Each individual has explicit private JSON memory. The same code may serve 50 individuals, but they do not share mutable global variables. The local Go runner accepts a pure standard-library subset, rejects global mutable state and external I/O, and applies decision timeouts. It is intended for team-authored local experiments; it is not a general internet-facing arbitrary-code execution service.

The plot's **Assembly** tab shows its laws and motions, **Council** shows the votes, and **Rulebook** explains the available local and federal powers. Clicking an observer control does not cast a vote or force an institution into existence. Formation unlocks powers; policies and offices require subsequent votes.

## Specification

[The approved specification](docs/AMOEBOIDS_SPECIFICATION.md) defines the physical rules, political powers, timing, worked examples, information boundaries and monthly resets. [The agent API](docs/AGENT_API.md) defines the corresponding programming interface.

Core features include zero-rule founding, unlimited mind-funded proposals, competing policy votes, influence voted or earned by contribution, delegated officers, storage taxes and inheritance, proportional mind pledges, funded records and enforcement, evidence-based sanctions, federations, representative voting, donations, shared records and immigration checks.

## Reproducible experiments

Run the same engine without the interface:

```sh
go run ./cmd/society -seed 42 -output experiment.json
```

For a smaller experiment:

```sh
go run ./cmd/society -copies 5 -plots 3 -days 10 -months 2 -seed 42
```

`-config setup.json` accepts an object containing `settings` and `teams`. The headless command runs built-in and visual-builder policies. Imported Go strategies run through the local application service, which owns compilation and isolated memory transport.

Compare runs with the same settings and seed. Retaining memory enables agent-written adaptation; improvement must be measured against a memory-reset baseline across multiple seeds before claiming learning.

## Development and verification

```sh
npm test
npx playwright install chromium
npm run test:browser:society
npm run check
```

Go tests exercise physical accounting, information access, institutional timing and political rules. The society browser test exercises the actual service and rendered interface. The legacy browser checks remain available through `npm run test:browser:legacy`.

See [verification results](docs/VERIFICATION.md), the [independent engineering review](docs/DEEP_REVIEW.md) and the [interface review](docs/GAME_UX_REVIEW.md) for measured performance, reviewed flows and remaining limitations. [Presentation decisions](docs/PRESENTATION_DESIGN.md) explain the visual and interaction design.

| Area                                            | Files                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Physical world, phases, memory and observations | `pkg/society/world.go`, `resources.go`, `agents.go`, `types.go`                                  |
| Policies, votes, delegations and federations    | `pkg/society/politics*.go`                                                                       |
| Configurable defaults                           | `pkg/society/settings.go`                                                                        |
| Local runs, history, imports and Go workers     | `api/society.go`, `api/society_strategy.go`                                                      |
| Observer interface                              | `public/society.html`, `public/game/` (map, playback, panels, council, rulebook, results, setup) |
| Headless experiments                            | `cmd/society/main.go`                                                                            |
| Legacy engine and viewer                        | `pkg/garden/`, `public/index.html`                                                               |

## Hosted game

The public site runs the same society engine and interface. Each browser gets an isolated Vercel Sandbox and a persistent drive for its worlds, replays and imported strategies. A signed, secure browser cookie reopens that workspace; clearing it or using a different browser creates a separate workspace. Export results before clearing browser data. Servers sleep when idle and restore their last committed phase when reopened.

The hosted API keeps infrastructure credentials on the server and isolates uploaded Go inside the visitor's workspace. Supabase enforces new-workspace allocation limits; individual runs and playback do not consume new allocations. See [hosting and release instructions](hosting/README.md) for deployment, limits and recovery. The local application does not upload local strategies or simulation data.

## Foundation

The original prototype extends `BaseServer` and `BaseAgent` from [basePlatformSOMAS v2.1.0](https://github.com/MattSScott/basePlatformSOMAS/tree/v2.1.0), MIT-licensed, © 2023 Matt Scott. The new society engine implements explicit daily phases separately because the legacy lifecycle models one harvest/contribution action per day. The original package remains available and tested.
