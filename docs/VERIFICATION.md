# MVP verification

Verified locally on 15 November 2026 against the approved specification and defaults. The implementation includes the physical world, local governments, federations, agent contracts, saved replays and observer interface. The [initial engineering review](DEEP_REVIEW.md) records the rules and service findings. The redesigned game interface has a separate [independent usability review](GAME_UX_REVIEW.md): **8.7/10 overall and 8.7/10 for intuitiveness**, with all eight reviewed newcomer tasks passing.

## Checks

| Check                               | Result                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                     | Formatting, 34 JavaScript tests, all Go packages and the legacy downloadable Go example passed.                                                                                                                                                                                                                                       |
| `go test -race ./pkg/society ./api` | Passed independently, with no reported data races.                                                                                                                                                                                                                                                                                    |
| `go vet ./...`                      | Passed.                                                                                                                                                                                                                                                                                                                               |
| `npm run test:browser:society`      | Actual service and Chromium passed edited behaviour creation through every setup tab, play/pause, phase/day execution, inspection, monthly results, meteor, replay step/play/day seeking without changing live state, delayed replay response isolation when switching saved worlds, native keyboard menus, reload and mobile checks. |
| `npm run test:browser:legacy`       | Legacy builder, library, replay, journal, results, guide and restart persistence passed, including phone widths.                                                                                                                                                                                                                      |
| Custom Go strategies                | Real compilation and workers verified separate individual memory, deterministic private random seeds, invalid-output diagnostics and termination of an infinite loop. Independent HTTP probes also passed.                                                                                                                            |
| Visual review                       | Full-screen game map, context panels and federation tabs inspected at desktop and 390 px mobile widths. Named voters, historical labels and service status verified. No browser exceptions or horizontal mobile overflow in the reviewed flows.                                                                                       |

There are 49 society-engine test functions and four society API test functions. They cover food and mind accounting, deliberate eating, diminishing food returns, linear thinking, weather, storage, inheritance, private observations, zero-rule founding, competing proposals, electorate snapshots, scoped officers, taxation, service funding, historical sanction evidence, federation representation and ratification, joining/leaving, immigration, donations, disputes, paginated records, deterministic boundaries, resets and a complete default year. Individual tests include multiple cases; the count is not a claim of exhaustive coverage.

## Full default year with saved playback

The actual application service ran seed 42 with six behaviours, 50 copies each, six plots, twelve months and 30 days per month. Every daily phase was compressed and written to disk. The measured run completed successfully:

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

For another measurement, start the application, keep the default setup, choose seed 42 and select **Run year**. Saved frames and the index appear in `.local/data/society/runs/`. The headless command `go run ./cmd/society -seed 42 -output experiment.json` runs the same mechanics but does not include the application's per-phase recording cost.

## Scope and practical limits

- The deliverable runs locally from a repository checkout. The legacy hosting configuration does not deploy this persistent service.
- Saved replays survive restarts. An interrupted live simulation becomes a read-only archive after a service restart.
- Imported Go is intended for team-authored local experiments. Its restricted imports, explicit memory and timeouts are not a production hostile-code security boundary.
- The included behaviours are programmed examples. Memory persists as specified; improved learning is an experimental question for the behaviours the group writes.
- Review covered the documented flows and tested rules. It does not establish every policy combination, every browser or full accessibility conformance.
