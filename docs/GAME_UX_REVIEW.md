# Amoeboids game UI/UX review

Reviewed 15 November 2026 in Chromium at `http://127.0.0.1:8788`, using a 1440 × 1000 desktop viewport and a 390 × 844 phone viewport. This was an independent browser review: the reviewer did not implement the interface and used rendered screens, actual clicks, pointer movement, scrolling, keyboard controls and screenshots. Product files were not edited by the reviewer.

**Final assessment: 8.7/10 overall; 8.7/10 for intuitiveness.** The final interface meets the requested greater-than-8.5 target in this expert review. This is not a measured score from a study of real first-time players.

The world now gives the experience its identity. The isometric fields, visible inhabitants, weather and government buildings make the simulation feel like a place that changes. Controls occupy a small, stable area. Plot inspection, political detail, event history and configuration have distinct places instead of competing for attention on the main screen. The observer role is communicated where it matters: agents vote, and behaviour changes apply to a new world.

## Scores

| Area                    | Weight | Score | Evidence for the judgment                                                                                                                                                                                                                    |
| ----------------------- | -----: | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intuitiveness           |    30% |   8.7 | Play, Step, plot shortcuts and direct selection are immediately available. Resident back navigation and Escape work. Replay now behaves as recorded navigation and requires an explicit return to live.                                      |
| Game feel               |    20% |   8.6 | The living world is the main visual, and institutions appear in it. Dense populations still require zooming to inspect individual inhabitants comfortably.                                                                                   |
| Navigation              |    20% |   9.0 | World, History and Results are stable primary destinations. Inspectors retain plot context. Federation Votes, Charter and Members separate three different questions clearly.                                                                |
| Simulation transparency |    15% |   8.5 | Rules, officers, named voters, influence, thresholds, activation dates and readable history expose the political process. Some deeper concepts still need the help/rules material.                                                           |
| Progressive disclosure  |    15% |   8.8 | Normal observation stays concise. Past decisions, voter detail, additional statistics and advanced configuration remain available through explicit controls. Conditional action JSON and Go import sit inside the optional behaviour editor. |

Weighted score: 8.725, reported as **8.7**. Scores assess the final reviewed interface, after the fixes below.

## Newcomer tasks exercised

| Task                                                                 | Result                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a fresh world, start, pause and advance one phase             | Passed. New world creation preserves the existing run. Pause state and button agree. The current phase changes visibly.                                                                                                                                                                           |
| Select a plot and understand its resources, residents and government | Passed using both the canvas and plot shortcuts. The selected plot is highlighted and focused; field stock, storage, resident composition and government links are readable.                                                                                                                      |
| Find a resident, inspect its actions and return to the map           | Passed. Direct canvas clicks selected residents. Body, mind, carrots and satisfaction are visible; extra political/activity statistics are optional. Back to residents, close and Escape work. The agent's own view distinguishes permitted observations from observer information.               |
| Find the local government, rules and responsible officers            | Passed. Government tabs expose Votes, Rules and Officers. Officer entries lead back to their residents.                                                                                                                                                                                           |
| Understand a vote without being offered a human voting override      | Passed. The UI says agents vote and changes apply the next day. A local ballot exposed its 40-member electorate, influence and Yes/Abstain choices. A council ballot exposed six named representatives and their plot votes.                                                                      |
| Find federation membership, powers and current decisions             | Passed after revision. Current decisions appear first, separate from collapsed past votes. Proposer and plot identify otherwise similar ballots. Charter powers and membership have their own tabs. Member navigation opened the expected plot.                                                   |
| Inspect recorded history and return to live safely                   | Passed after revision. Step moved frame 1 to 2; Play advanced recorded frames; Next day moved to frame 8. Controls stopped at final frame 20. No POST requests occurred during those replay actions. Return to live restored the unchanged live frame 20.                                         |
| Configure a behaviour for the next world and observe its effect      | Passed after revision. Changed team 1's harvest request to 0, renamed the team and visited Environment, Teams & behaviours and Advanced rules before creating a six-agent world. After Harvest, its resident had 0 stored carrots and 0 total harvested; the other five teams harvested normally. |

The detailed behaviour editor, conditional-rule fields, Go import entry point and advanced physical/political settings were also inspected. The audit did not compile a new uploaded Go program or exercise every simulation policy.

## Findings repaired during review

These were actual issues found through the browser, not hypothetical suggestions. Their relevant flows were retested.

1. **Pause status disagreed with the button.** The simulation stopped but the status remained “Playing.” The final version updates both together.
2. **Opening Advanced rules could prevent world creation.** The default proposal cost was invalid against its HTML number-step constraint. The final form has no invalid default fields and can submit from that tab.
3. **Edited behaviours could not create a world.** Saving everyday choices produced a builder behaviour that the server rejected. The final end-to-end creation and zero-harvest effect were verified.
4. **Replay controls silently advanced the live world.** Step from a historical frame jumped to the live run and mutated it. The final controls navigate recorded frames, stop at the end and require explicit Return to live.
5. **Federation current business was buried beneath membership, powers and resolved ballots.** The final tabbed inspector prioritises current votes and collapses history. Proposer identities distinguish separate proposals.
6. **History exposed internal policy names and omitted event actors.** The final view uses readable policy labels and resident names. Examples include “Field collection: Fixed collection after harvest” and “Federation representative · Stewards 01.”
7. **Two historical ballot labels were misleading.** “Appoint Individual NaN” now reads “Appoint Stewards 01”; an activated federation no longer claims it is waiting for founding approvals. Both were checked on the saved review world.

## Evidence

Screenshots are retained under `.local/verification/game-ux-audit/`. Key final or still-representative captures:

- `01-first-load.png`: uncluttered desktop world and primary controls.
- `21-mature-plot.png`: later world with visible government buildings and plot resources.
- `31-mobile-canvas-tap.png`: actual phone-sized canvas selection and resident inspector.
- `35-zero-harvest-resident.png`: edited behaviour's observable result.
- `36-replay-end.png`: historical final frame with controls stopped and Return to live available.
- `37-fixed-federation-votes.png`: current council vote, threshold, origin and collapsed history.
- `38-frozen-electorate.png`: named council representatives and their votes.
- `39-human-history.png`: readable policy history with actors.
- `40-local-electorate.png`: named local electorate and influence. The later label correction is shown in the next capture.
- `41-mobile-federation-final.png`: final phone-sized council navigation.
- `42-final-government-labels.png`: corrected historical appointment and federation wording.

Earlier numbered captures preserve the issues before their fixes. Audit worlds were created separately from the user's preview: `531de14fa05f76d702f748eb17f6ed87` was the default seed-7 institution fixture, and `ccc92fecf39ae2a13ae4f55a47d88f2c` was the edited-behaviour fixture. The first became a saved replay when the preview server restarted. API stepping was used only to prepare later states in the reviewer's own worlds; the inspected tasks were performed through the UI.

## Remaining limits

- At 300 residents, individual figures are dense. The mobile Fit view makes the whole world quite small; zoom and plot shortcuts are important to comfortable inspection. This prevents a higher game-feel score.
- Concepts such as mind, influence and satisfaction are discoverable through the guide/rules, but short contextual definitions could make the first learning session easier.
- History is now readable, but a direct route from a history actor to that resident would further reduce navigation effort.
- No browser page exceptions or horizontal page overflow were observed in the reviewed desktop and phone flows. This does not replace cross-browser, accessibility or participant testing.

No unresolved blocker remained in the eight reviewed newcomer tasks at the final pass.

## Follow-up spot-check: keyboard menus and delayed replay responses

A separate code audit subsequently found two additional issues: Space on an expandable menu could also toggle playback, and a delayed replay response from one world could overwrite the display after switching to another world. These findings came from the code reviewer, not this UX review. After the repairs, this reviewer independently checked both in Chromium at 1440 × 1000.

- **Keyboard menus passed.** Focused Menu, pressed Space and confirmed it opened natively. Repeated with More playback options. Both left the world paused at Day 2, Nightfall; no POST requests occurred. Evidence: `43-menu-space-check.png` and `44-time-options-space-check.png`.
- **Delayed world-switch response passed.** Created separate seed-103 and seed-104 audit worlds. Held the actual response for world A's historical frame 2, switched through Menu → Saved worlds to world B, then released A's response. World B remained selected, displaying seed 104, Day 1 Harvest, and its own live timeline at frame 3 of 3. The old response did not overwrite it. No POST requests or browser exceptions occurred during this interaction. Evidence: `45-delayed-frame-world-switch.png`.

The follow-up used reviewer-created worlds `4041ab860ce53a51676dd84e259db2c5` and `5eefcea2fb2f361dc0f98a07df1c12aa`; the user's preview was not advanced. The final scores remain **8.7/10 overall and 8.7/10 intuitiveness**. This addendum is a targeted check, not a repeat of the full review.
