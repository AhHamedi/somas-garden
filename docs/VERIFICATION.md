# MVP verification

The implementation includes the physical world, local governments, federations, agent contracts, saved replays and observer interface. The [initial engineering review](DEEP_REVIEW.md) records the rules and service findings. The [interface review](GAME_UX_REVIEW.md) records the rebuilt observer interface. Results below distinguish the current release checks from earlier measurements. Functional test results do not establish design quality.

## Release checks — 16 November 2026

- Hosted release: all 78 JavaScript tests and Go packages pass, including signed workspace cookies, cross-origin rejection, request bounds, streaming exports and atomic session allocation. Checkpoint tests compare uninterrupted execution with restart after every phase across meteors, including private memories, ballots and records. Persistence-failure tests ensure no uncommitted phase can be returned or skipped in later history.
- An actual named Vercel Sandbox with a persistent Drive accepted the Go example, ran through a meteor, stopped and resumed with identical world, private observation and study data, then advanced into month two. Unauthenticated engine requests returned 401.
- `npm run check`: formatting, all 65 JavaScript tests, all Go packages and the downloadable legacy Go example passed.
- `go vet ./...` and `npm run test:go -- --race`: passed.
- Results regression tests cover exact-frame data after rewind and forward playback, late responses when changing runs, shared Rulebook updates, and consistent periods for completed-month and month-to-date comparisons.
- `npm run test:browser:society`: passed against the actual development launcher and service in Chromium. The suite now also checks that edited team behaviours reach the engine, saved worlds can be opened, and reloading or revisiting the home URL restores the selected world. Its temporary service uses isolated data directories.

## Interface rebuild checks

The observer interface was rebuilt on 15 November 2026 (see [presentation](PRESENTATION_DESIGN.md) and [review](GAME_UX_REVIEW.md)). Agent contracts and the replay format remain compatible. The default respawn delay changed from one day to the monthly meteor (`respawnDelay: -1`); other delays remain configurable.

- `test/game-model.test.mjs` covers law sentences, grouping and funding state, roles, motion titles, before/after text, tallies and thresholds in residents, influence and plots, phase stories, notable events, plot averages, event wording and hemicycle seating for 1 to 300 voters.
- `test/game-statutes.test.mjs` parses the engine's policy catalogue and checks that the statute book offers exactly the options the engine accepts for all 28 laws, that options only name defined parameters, and that one-off decisions are real proposal kinds.
- `pkg/society/contributions_test.go` checks the influence basis law with small scripted agents: deposits, storage tax, service mind and treasury receipts reach the accounts through the engine's own actions; they count from the next morning, net across the whole window and drop out after it; the floor, the cap and the no-floor case where nobody has earned a level; suspension and restoration of voted grants; forfeiture on leaving and clearing on dissolution; validation; accounts visible only to residents and only under the law; checkpoint survival; and a full run in which the depositor's contribution outweighs the others' on the next ballot.
- `pkg/society/presets_test.go` checks the six default teams, nine selectable presets, previous policy names, basic feeding strategies, ranked harvest ballots, blight relief, Tinkerer memory and unequal team sizes through a checkpoint and monthly report.
- `pkg/society/study_test.go` runs a world for a month and checks that every nightfall summary agrees with the engine's own totals (living, field, stores, residents plus the wilds, daily deaths against month totals), that votes counted by team match each ballot, the Gini coefficient and first-day arrivals.
- `test/game-study.test.mjs` covers the Results analysis: quantiles, Gini and Lorenz curves, scoping to completed months, per-team tables and distributions, motion subjects including charter changes, voting by team, law adoption compared at the same day of the month, residence shares and CSV quoting.
- `test/game-playback.test.mjs` covers opening at the newest frame, replay without re-simulating, the look-ahead buffer while playing, bounded fast-forward, read-only replays and phase pacing.
- `npm run test:browser:society` drives the real society service in Chromium: continuous play across days at 8×, selection without pausing, every inspector tab, the statute book and a law unfolding in place with all its options, widening and narrowing the inspector, the full resident list, the Amoeboid card, phase and day replay with no write requests, council seats matching the electorate, chronicle, every Results section with a table view, a team filter and a CSV export, study data never beyond the phase on screen, the Rulebook's 45 entries, search and option lists, the new-world charts and the meteor respawn default, creating a 26-Amoeboid world with mixed team sizes, the meteor and month card, a phone layout without horizontal scroll, and reduced motion. It accepts `SOCIETY_ORIGIN` to target a running server.

The initial rebuild checks ran in a container that could not download npm or Go modules. Its browser flow used the same Go society handler served directly rather than through `scripts/dev.mjs`; the JavaScript tests ran under Node 22. In that headless, GPU-less browser the map drew in about 11 ms per frame for the whole island and 15 ms zoomed in, and a phase change cost about 8 ms. These are historical measurements, not a measurement of the release checkout or a performance guarantee.

## Previous foundation checks

| Check                               | Result                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                     | Formatting, 34 JavaScript tests, all Go packages and the legacy downloadable Go example passed.                                                                                                                                                                                                                                       |
| `go test -race ./pkg/society ./api` | Passed independently, with no reported data races.                                                                                                                                                                                                                                                                                    |
| `go vet ./...`                      | Passed.                                                                                                                                                                                                                                                                                                                               |
| `npm run test:browser:society`      | Actual service and Chromium passed edited behaviour creation through every setup tab, play/pause, phase/day execution, inspection, monthly results, meteor, replay step/play/day seeking without changing live state, delayed replay response isolation when switching saved worlds, native keyboard menus, reload and mobile checks. |
| `npm run test:browser:legacy`       | Legacy builder, library, replay, journal, results, guide and restart persistence passed, including phone widths.                                                                                                                                                                                                                      |
| Custom Go strategies                | Real compilation and workers verified separate individual memory, deterministic private random seeds, invalid-output diagnostics and termination of an infinite loop. Independent HTTP probes also passed.                                                                                                                            |
| Visual review                       | Full-screen game map, context panels and federation tabs inspected at desktop and 390 px mobile widths. Named voters, historical labels and service status verified. No browser exceptions or horizontal mobile overflow in the reviewed flows.                                                                                       |

Those foundation checks included 49 society-engine test functions and four society API test functions. They covered food and mind accounting, deliberate eating, diminishing food returns, linear thinking, weather, storage, inheritance, private observations, zero-rule founding, competing proposals, electorate snapshots, scoped officers, taxation, service funding, historical sanction evidence, federation representation and ratification, joining/leaving, immigration, donations, disputes, paginated records, deterministic boundaries, resets and a complete default year. Individual tests include multiple cases; the count is not a claim of exhaustive coverage.

## Previous full-year benchmark with saved playback

Before the interface rebuild, the actual application service ran seed 42 with six behaviours, 50 copies each, six plots, twelve months and 30 days per month, using the previous one-day respawn default. Every daily phase was compressed and written to disk. The measured run completed successfully:

| Measurement                                                     | Result                       |
| --------------------------------------------------------------- | ---------------------------- |
| Individuals                                                     | 300                          |
| Daily cycles                                                    | 360                          |
| Executed phases                                                 | 2,880                        |
| Saved frames, including initial world                           | 2,881                        |
| Recorded meteor boundaries                                      | 12                           |
| Elapsed time, including recording and sampled playback requests | 21.33 seconds                |
| Replay directory size, including index                          | 73,504,919 bytes (70.10 MiB) |
| Pending operations after final meteor                           | 0                            |

Initial, middle and final saved frames (0, 1,440 and 2,880) were retrieved and checked for the expected population and absence of private memory. The browser suite separately verified timeline seeking and returning to the live frame. This is a measurement on the development machine, not a performance guarantee for other hardware or arbitrary uploaded strategies.

For a new measurement, start the application, choose seed 42 and the desired respawn setting, and use **Menu → Skip to the end of the month** for each month. Saved frames and the index appear in `.local/data/society/runs/`. The headless command `go run ./cmd/society -seed 42 -output experiment.json` runs the current default mechanics but does not include the application's per-phase recording cost. The old numbers above should not be treated as a benchmark of the new defaults.

## Scope and practical limits

- The game runs locally or through the hosted proxy and isolated persistent workspaces described in [hosting](../hosting/README.md).
- New simulations recover from a private checkpoint after restart. Older replay-only saves remain read-only archives.
- Imported Go is intended for team-authored local experiments. Its restricted imports, explicit memory and timeouts are not a production hostile-code security boundary.
- The included behaviours are programmed examples. Memory persists as specified; improved learning is an experimental question for the behaviours the group writes.
- Review covered the documented flows and tested rules. It does not establish every policy combination, every browser or full accessibility conformance.
