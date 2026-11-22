# Amoeboids agent API

In API version 6, each Amoeboid runs its team’s function with its own observations and private memory. Import the [working Go example](../public/society-example.go) in **Team behaviours**, or use a visual strategy for fixed choices and conditional actions.

## What the agent sees

`View` includes the current callback in `Phase`, the current `Month`, `Day` and `AbsoluteDay`, and the agent’s own food, body, mind, score and voting tokens in `Self`. Each plot publishes its field stock, active residents, crop event, outstanding aid, rules and elected role holders. Check role membership with `id, ok := plot.Roles["trade"]`. Agent ID zero is valid.

Agents see public actions across plots in `Actions`. This slice covers the current and previous day within the month. For earlier actions, use a free `RecordQuery` for any plot in the `records` callback. Supply optional inclusive `From` and `To` absolute days and a `Subject` agent ID pointer. The first page freezes the matching history. Use `RecordQuery{Cursor: page.NextCursor}` in `record_pages` to read further pages in the same month. A page holds 128 events by default and accepts a configured size from 1 to 256.

`Memory` contains the individual’s private JSON. Returning valid JSON in `Action.Memory` replaces it. Omitting the field preserves it. The meteor resets physical resources, offices, token balances and rules. Each individual can retain its previous choices and scores in private memory. Valid imports can use `encoding/json` and the supplied `NewRandom(v.RandomSeed)` for deterministic draws.

## When to return each action

| Callback                  | Agent decision                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placement`               | Return `PlotChoice: &id` at the start of each month. The chosen plot is home until the next reset.                                                                                                                          |
| `harvest_order`           | For ranked harvesting, return `HarvestRanking` with each active local resident exactly once, including yourself. An empty list abstains. The resolved queue is available in `Plots[Self.Plot].HarvestOrder` before harvest. |
| `harvest`                 | Request a whole number of carrots in `Harvest`. Field stock and personal storage determine what fits.                                                                                                                       |
| `pledges`                 | Offer mind toward founding a local government with `Pledge["local"]`.                                                                                                                                                       |
| `records`, `record_pages` | Read public action history with `Read`.                                                                                                                                                                                     |
| `proposals`               | Submit one or more `Proposals` for the local assembly. Every active resident can propose.                                                                                                                                   |
| `voting`                  | Submit `OrderedVotes` to spend available tokens on open local ballots.                                                                                                                                                      |
| `transfers`               | Donate to Trade, make a gift as Trade, or issue an evidence-backed sanction as Justice.                                                                                                                                     |
| `eating`                  | Set `Eat` to a number of stored carrots and `Think` to an amount of available mind.                                                                                                                                         |
| `close`, `month_end`      | Update private memory before the next day or meteor.                                                                                                                                                                        |

## Local rules and spending tokens

`a.Proposals = []Proposal{{Kind: "found", Plot: v.Self.Plot}}` asks residents to found a government. After formation, use `Kind: "policy"` to propose a rule and `Kind: "repeal"` to propose its removal. The catalogue at `/api/society/config` gives the accepted keys and parameters.

For example, this action asks the plot to let residents rank the harvest queue.

```go
a.Proposals = []Proposal{{
    Kind: "policy", Plot: v.Self.Plot,
    Key: "harvestOrder", Rule: Rule{Mode: "ranked"},
}}
```

`VotingWeight` is the daily token grant. `VotingTokens` is the spendable balance. The `tokenAllocation` rule can set an equal grant or award bonus tokens for productivity or alignment. To cast two tokens for a rule, use an open proposal ID from `v.Proposals`.

```go
a.OrderedVotes = []VoteChoice{{Proposal: ballot.ID, Choice: "yes", Tokens: 2}}
```

The engine processes ordered choices in sequence. An unaffordable choice cannot spend another agent’s balance. An omitted token quantity on a yes/no ballot requests one token. A voter-count ballot accepts exactly one token per yes/no voter. An attempted spend of two is rejected and leaves the balance intact. A token-count ballot accepts two tokens as two units of support. A plot can change its rule threshold with `Key: "threshold"`, `Rule.Mode` of `"voters"` or `"tokens"` and `Rule.Amount` equal to the desired fraction. Role elections have their own decision rule.

## Trade and Justice

Nominate a local resident with `Proposal{Kind: "elect", Plot: plot.ID, Key: "trade", Target: residentID}`. Use the key `"justice"` to elect Justice. A resident may propose `Kind: "revoke"` for either office.

A resident can send spare carrots to the local Trade representative with `Action{Donate: 3}`. The carrots occupy the representative’s expanded personal storage. Trade can give from that storage to a local resident or a different plot’s elected Trade representative. Check `AidNeeded` to prioritise a plot facing blight. The receiving representative plants incoming carrots toward the rescue target first. Personal storage capacity applies to any surplus.

```go
a.Gift = &Offer{To: recipientID, Amount: 3}
```

The Justice holder receives eligible breaches in `v.SanctionCases`. Use the supplied target and evidence ID to issue a warning, a fine or last place in the harvest queue. A sanction order is submitted during transfers.

```go
if len(v.SanctionCases) > 0 {
    c := v.SanctionCases[0]
    a.Orders = []Order{{Kind: "sanction", Plot: v.Self.Plot, Target: c.Target,
        Evidence: c.Evidence, Sanction: "warning"}}
}
```

## Import and visual builder

Go strategies supply `package main` and `func Decide(v View) Action`. The runtime provides aliases for `View`, `Action`, `Rule`, `Proposal`, `Order`, `Offer`, `RecordQuery` and `VoteChoice`. Uploaded strategies run with a time budget and explicit private memory. The nine built-in strategies also work as visual builder fallbacks. The two concrete contracts are [world and agent types](../pkg/society/types.go) and [political types](../pkg/society/politics_types.go).

A visual condition matches one callback and returns its configured action. Use a fixed harvest ranking only when its IDs match the current plot’s residents. For varying rosters, a Go strategy can build the ranking directly from the observed residents as the downloadable example does. The builder spends one token on a voter-count ballot and its configured amount on a token-count ballot while it can afford each choice.
