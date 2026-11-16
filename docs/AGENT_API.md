# Amoeboids Agent API

The society engine uses API version 5. Every individual chooses its own decisions. The observer interface displays what happened but never supplies an automatic meal, casts an agent's votes, or forces a government to form.

## Choose an authoring route

The visual editor supplies basic harvest, meal, thinking, pledge and voting choices, plus phase-specific conditional actions. The advanced action editor accepts the same structured decisions as Go. Uploaded Go supports richer branching and private-memory adaptation. The shipped Stewards, Thinkers, Gatherers, Diplomats, Wanderers and Learners are explicit programmed example behaviours; their names do not imply measured intelligence or guaranteed cooperation.

The legacy API returning `Action{Food, Energy}` belongs to the old game at `/legacy`. It is not automatically converted into this interface.

## Write a Go strategy

Import [society-example.go](../public/society-example.go) through the strategy editor. Supply `package main` and `func Decide(v View) Action`. The runtime supplies `main` and aliases for `View`, `Action`, `Rule`, `Proposal`, `Order`, `Offer`, `RecordQuery` and `VoteChoice`.

```go
package main

func Decide(v View) Action {
    a := Action{}
    switch v.Phase {
    case "movement":
        if v.Self.Plot < 0 {
            destination := v.Self.ID % len(v.Plots)
            a.Move = &destination
        }
    case "harvest":
        a.Harvest = v.Settings.DailyFood
    case "eating":
        a.Eat = v.Settings.DailyFood
        a.Think = 3
    }
    return a
}
```

`Move` is a pointer so omitting a move differs from asking for plot zero. A destination of `-1` means outside all plots. IDs are zero-based. An empty action is a valid no-op.

The Go runner accepts pure standard-library imports: `math`, `math/bits`, `sort`, `slices`, `strings`, `strconv`, `encoding/json`, `bytes`, `cmp` and `unicode/utf8`. File, network and process access, global mutable variables, `init`, goroutines and compiler directives are rejected. Constants, helper functions, local variables and custom types are permitted.

For private reproducible randomness, use `rng := NewRandom(v.RandomSeed)` and then `rng.Float64()` or `rng.Intn(n)`. The seed is separate from the world weather stream and unique to the individual and callback. Global random generators are unavailable.

Individuals receive separately serialised observations and commit their own explicit memory. There are no shared team globals. A worker failure, invalid output or decision timeout produces a visible diagnostic and a no-op, preserving the last valid memory. A callback's wall-clock budget defaults to 100 ms and is configurable. These restrictions support reproducible team-authored experiments; the local compiler is not offered as a public untrusted-code execution service.

## Callbacks within the daily phases

| Callback       | Fields used                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `movement`     | `Move` requests a single destination.                                                               |
| `harvest`      | `Harvest` requests carrots, subject to stock, storage and rules.                                    |
| `pledges`      | `Pledge` sets desired total reservations for `local` and `federation`; zero releases a reservation. |
| `records`      | `Read` opens paid record queries or resumes saved continuation cursors.                             |
| `record_pages` | `Read` requests further pages using returned cursors, without another query charge.                 |
| `proposals`    | `Proposals` submits all desired institutional changes or one-off actions.                           |
| `voting`       | `Votes` or ordered vote choices express Yes, No or abstention on eligible ballots.                  |
| `transfers`    | `Orders`, `Offer`, `CancelOffer` and `Deposit` submit delegated orders and personal transfers.      |
| `accept`       | `Accept` contains IDs of received food offers to accept.                                            |
| `eating`       | `Eat` chooses the whole meal; `Think` chooses unpledged mind to spend.                              |
| `close`        | `Memory` may record private outcomes; world actions are ignored.                                    |
| `month_end`    | `Memory` may record final monthly observations before the meteor; world actions are ignored.        |

Environment changes and ballot resolution are engine operations. `pledges`, `records`, optional `record_pages` continuations and `proposals` are ordered substeps of the displayed Proposals phase; `transfers` and `accept` are substeps of Transfers. This allows an agent to use paid records in its proposal and accept a newly made food offer.

## Observations and information boundaries

`v.Self` contains the individual's body, mind, food, score, plot, influence, pledges and diagnostics. `v.Memory` is that individual's private JSON. `v.Settings` contains the fixed experiment settings. `Month`, `Day`, `AbsoluteDay` and `Phase` identify the current callback.

`v.Plots` always gives plot identity, capacity and current weather. `Stock` and `Reserve` are pointers: absence means unknown, not zero. Residents see local membership, rules and office scopes. Cross-plot stock data requires an enabled funded federation policy. `v.Proposals` contains relevant institutional ballots, with their legal thresholds and frozen electorate. `v.Offers` includes only offers involving the individual. `v.Receipts` and requested `v.Records` have different access and funding rules; observer history is not an agent data source. `v.RecordPages` contains the latest page responses and continuation cursors. `v.Records` retains delivered rows within the month, deduplicated by event ID, so repeatedly requesting a page cannot duplicate sanction evidence.

`v.Pending` shows authorised operations awaiting their activation day: local plot operations, the individual's own orders, operations naming it as recipient/applicant, and relevant federation constitutional decisions. It does not expose another plot's treasury instructions merely because the plots share a federation. Observer snapshots contain the complete pending queue. All observations are detached copies; mutating them cannot alter the world.

The concrete contract lives in [types.go](../pkg/society/types.go) and [politics_types.go](../pkg/society/politics_types.go). The same schema is used by the visual builder. JSON uses lower-camel-case names; Go uses exported names such as `Harvest`, `Rule` and `Members`.

## Read records in pages

A new `RecordQuery` specifies `Plot`, optional `Subject` (an individual ID pointer), optional inclusive `From`/`To` absolute-day bounds, and optional `PageSize`. Zero bounds mean unbounded. The default page size is 128 records, with an allowed range of 1–256. Invalid queries cost no mind.

The first page costs the configured Read cost once and freezes the matching record log at query creation. Later records cannot appear in its remaining pages. Each `RecordPage` contains `Rows`, `Total`, `Offset`, `PageSize`, an opaque `Cursor` for that page, and `NextCursor` if another page exists. An error response instead provides `Error` and no rows.

Use only `RecordQuery{Cursor: page.NextCursor}` to continue. Continuations are free, preserve the original filters and page size, and recheck the reader's current authority. Repeating the same page cursor is idempotent and free. Starting another cursor-free query, even with the same filters, creates a fresh snapshot and incurs a new query charge.

```go
switch v.Phase {
case "records":
    if v.Self.Plot >= 0 {
        a.Read = []RecordQuery{{Plot: v.Self.Plot, PageSize: 128}}
    }
case "record_pages":
    for _, page := range v.RecordPages {
        if page.Error == "" && page.NextCursor != "" {
            a.Read = append(a.Read, RecordQuery{Cursor: page.NextCursor})
        }
    }
}
```

The engine calls `record_pages` after page results arrive, while continuations remain. It accepts only continuation requests in this callback, allowing the same day's proposals to use the requested history without repeatedly paying. Returning no requests ends pagination. Repeated already-delivered cursors do not keep the continuation loop running. An agent may also retain a cursor in private memory and resume it in a later `records` callback that month.

Cursors are bound to their individual and month. A different individual cannot use them. Revoked access, an unavailable shared-record service, or being dead prevents continuation without charging mind; if the original reader regains valid access during the same month, it may resume the existing query. All query snapshots, cursors and delivered-record caches are erased at a meteor. A remembered cursor from an earlier month is stale. Query data never grants permission to see a foreign plot's records.

## Keep private memory

```go
import "encoding/json"

func Decide(v View) Action {
    var memory struct {
        Months int `json:"months"`
        LastScore float64 `json:"lastScore"`
    }
    _ = json.Unmarshal(v.Memory, &memory)
    if v.Phase == "month_end" {
        memory.Months++
        memory.LastScore = v.Self.Score
    }
    a := Action{}
    a.Memory, _ = json.Marshal(memory)
    return a
}
```

Omitting `Memory` leaves the previous memory unchanged. Returning `{}` explicitly clears it. Invalid JSON or a value exceeding the configured limit is rejected without truncation. Ordinary death preserves private memory and monthly satisfaction. At month close, all still-open, approved or scheduled decisions are explicitly cancelled with a meteor reason, including after the final measured month. A meteor preserves only private memory; individuals return with starting physical resources, no offices or food and zero score. Observer monthly history remains available to humans, but code must have deliberately stored its own allowed observations to use them next month.

## Propose and vote

Government formation uses `Proposal{Kind: "found"}`. A resident can reserve founding mind in `Pledge["local"]` before its proposal. Formation creates an empty institution next morning, not a predefined ration or officer.

For a governed plot, this proposes a common harvest allowance:

```go
a.Proposals = []Proposal{{
    Kind: "policy",
    Key: "quota",
    Rule: Rule{Mode: "limited", Amount: 3},
}}
```

There is no gameplay cap on valid proposal count. Each accepted proposal costs mind. The list order matters if mind runs short. For votes, `a.Votes` maps the engine's ballot IDs to `"yes"`, `"no"` or `"abstain"`; abstention costs nothing. Ordered vote choices allow explicit priority when the voter cannot afford every ballot. Use `OrderedVotes: []VoteChoice{{Proposal: ballotID, Choice: "yes"}}` to set that order; the field names are defined in the runtime contract.

Supported proposal kinds include `found`, `policy`, `repeal`, `office`, `removeOffice`, `sanction`, `distribution`, `permitEntry`, `permitExit`, `donation`, `dissolve`, `federationFound`, `federationJoin`, `federationLeave`, `ratify`, `federationPolicy`, `federationRepeal`, `federationAdmit`, `federationDissolve` and `dispute`.

Use the catalogue returned by `/api/society/config` to inspect policy keys, allowed modes and required fields. The catalogue and engine validators are the authority for parameter spelling. The approved specification explains their meaning. Repeals and conflicting values compete under the same policy key; duplicate submissions do not accumulate support or repeat the same transfer.

## Officers and federations

An appointment specifies an individual and a list of powers, recipient scope, daily quantity limit and expiry. Officer powers include `entry`, `exit`, `sanctions`, `applySanction`, `records`, `distribution`, `collection`, `donation`, `federationPropose`, `federationVote`, `membership` and `charter`. Having one power does not grant the others. Officer orders execute next morning and are revalidated against current authority and resources.

Local residents initially authorise federation formation or joining. Their government later appoints representatives with explicit federation proposal/voting powers. Each plot produces one federation vote from its representatives; more representatives do not give the plot more influence. Constitutional changes require every member plot's approval and any required local ratification.

A sanction requires authentic evidence and an enabled sanction type. A voted authorisation must still be applied through the allowed officer/proposer step. Use the sanction authorisations in the observation rather than constructing a fake receipt or guessing internal evidence IDs.

## Run and evaluate

The interface uses `/api/society/runs` to create live simulations and exposes phase stepping, background execution, pause, compressed saved frames and JSON export. Loading a saved replay never reruns its decisions. New runs store private checkpoints and resume at the last committed phase after a server restart, preserving individual memory, political state and exact random streams. Older replay-only saves remain read-only archives. Hosted worlds belong to the browser workspace identified by its secure cookie; exported observer frames never include checkpoint data.

Test a strategy on several seeds and compare its memory-preserving run with an appropriate memory-reset baseline before claiming learning. Institutions, generous donations or a high score may be programmed choices rather than learned outcomes.
