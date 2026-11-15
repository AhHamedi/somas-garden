# Independent MVP review

**Assessment after corrections: 8.6/10.** This meets the requested 8.5 threshold for a polished, working local MVP. No material unresolved blocker was found within the reviewed scope. This is an engineering judgment supported by the checks below, not a guarantee that every possible policy combination is defect-free.

Reviewed on 15 November 2026 by an independent review agent after the initial implementation. A separate visual reviewer inspected the rendered application. The implementation agents made the corrections; the reviewer independently reproduced defects, inspected corrections and reran checks. The reviewer added the permanent determinism regressions, not product behavior.

| Dimension                                 | Score | Assessment                                                                                                                                             |
| ----------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rules and political behavior              |   8.8 | Broad implementation of the approved institutional rules, with explicit timing, authority and accounting.                                              |
| Private agents and information boundaries |   8.7 | Detached observations, separate private memory, restricted Go workers, genuine timeouts and scoped records.                                            |
| API lifecycle and replay                  |   8.5 | Actual local service, saved phase history, reproducible runs and clear restart behavior.                                                               |
| Visual design and interaction             |   8.6 | Cohesive world atlas, useful inspection hierarchy, legible political detail and functional mobile layout.                                              |
| Maintainability and handoff               |   8.4 | Separate engine/API/UI concerns, meaningful regression tests and documented contracts; complex political interactions still warrant continued testing. |

**Consequential findings corrected during review**

1. **P2 — A sanctions officer could exceed its delegated target scope.** An officer whose scope contained individual 1 successfully fined individual 2 by applying a valid authorization. The independent reproduction took three carrots from the out-of-scope target. The application path returned before checking scope and resolved the true target later. [politics_actions.go](../pkg/society/politics_actions.go#L99) now checks the authorization's actual target and quantity at submission and execution. The permanent regression at [politics_test.go](../pkg/society/politics_test.go#L638) also covers a misleading caller-supplied target and authority narrowed before execution. Both cases pass.

2. **P2 — Agent observations omitted pending government operations.** Recipients could not inspect an officer's authorized distribution for the next morning. This contradicted the approved observation contract. [agents.go](../pkg/society/agents.go#L57) now exposes relevant pending operations while keeping unrelated foreign treasury activity private. [resources_test.go](../pkg/society/resources_test.go#L339) verifies residents, affected recipients, outsiders and detached nested data. The observer also receives the scheduled queue.

3. **P2 — Same-seed political boundaries could produce different histories.** Iterating the authorization map while emitting lapse events assigned event IDs in Go's unspecified map order. The independent reproduction diverged on its second identical world. Simultaneous federation exits also had order-dependent archived remnants. [politics_operations.go](../pkg/society/politics_operations.go#L32) now sorts both sets before processing. [determinism_test.go](../pkg/society/determinism_test.go) compares repeated same-seed worlds for both cases; ten repeated test runs passed.

4. **P2 — Final-month decisions remained misleadingly scheduled.** The terminal meteor left pending operations and proposal statuses promising a cycle that would never occur. [world.go](../pkg/society/world.go#L215) now clears pending operations and marks unfinished proposals cancelled with a meteor reason, preserving completed outcomes. [records_test.go](../pkg/society/records_test.go#L132) verifies the final boundary. The interface warns about late-month expiry and shows cancelled outcomes.

5. **Specification gap — Record query pagination was missing.** The initial implementation returned an entire matching history. [records.go](../pkg/society/records.go#L44) now provides bounded, immutable query pages with reader/month-bound cursors, permission rechecks and free continuations. Tests verify one initial charge, stable results after new events, detached page data, rejection of foreign/expired cursors, revocation and death, invalid-query handling, and duplicate-free delivered evidence. The additional callback is documented in [AGENT_API.md](AGENT_API.md).

The visual review also found and verified corrections for raw internal officer/power labels, false zero-electorate thresholds before voting, weak small-text contrast, mobile phase captions, and overlapping atlas labels/metrics. Final desktop and mobile rectangle checks found no material collisions, and the 390-pixel layout had no horizontal document overflow. The visual reviewer scored hierarchy 8.8, craft 8.9, readability 8.5, interaction 8.6 and accessibility 8.1; this was a focused accessibility review, not a conformance certification.

**Verification evidence**

- Independently read the approved specification and the physical, political, observation, storage, strategy-worker and API implementations. Traced zero-rule founding; competing proposals; frozen electorates; proportional pledge spending; officer scopes and limits; storage taxes, offers and inheritance; funded enforcement and evidence; federation membership and representative voting; immigration; disputes; daily food/thought scoring; ordinary death; and meteor memory boundaries.
- Ran `.tools/go/bin/go test ./...` successfully across all packages. This includes the 300-individual, 360-day accounting/memory test, private-view tests, political regressions and API replay/authentication checks.
- Ran `.tools/go/bin/go test -race ./pkg/society ./api` successfully with no reported data races, then repeated it after the final record/reset corrections.
- Independently exercised actual uploaded Go code through the running HTTP service. Two individuals completed two two-day months; memory-dependent final scores were exactly `0.2` and `0.4`, with no agent errors and no private memory in observer snapshots. Local evidence run: `0ede33c4fdba925a8426f27197719d49`.
- Independently uploaded an infinite-loop strategy with a 20 ms decision budget. Its one-day experiment completed in 0.28 seconds, reported the explicit time-limit diagnostic and performed no fallback eating or harvesting. Local evidence run: `053c2a1fff9e1c58bd1bbb5b2b673402`.
- The separate visual reviewer exercised the actual atlas, plot/individual inspection, government rules and ballots, federation council, results, setup validation and mobile layout. No browser errors were reported in those flows. Rendered evidence is retained locally in `../tmp/society-visual-review/`, including `world-final.png`, `mobile-final.png`, `governance-revised.png` and `results-revised.png`.

**Practical limits**

Saved replays survive a service restart, but interrupted live simulations reopen as read-only archives rather than resumable processes. The Go worker is a constrained local strategy runner, not a certified general-purpose operating-system sandbox or a production multi-user hosting service. The visual review covered the tested Chromium desktop/mobile states, not every browser, assistive technology or possible institutional configuration. Exhaustive model checking and prolonged adversarial load testing were outside this review.

The supplied strategies are programmed examples. Private memory makes agent-written adaptation possible; these checks do not establish learned cooperation or improvement. Those claims require separate controlled experiments across multiple seeds.
