# Amoeboids agent API

In API version 8, each Amoeboid runs its team’s function with its own observations and private memory. Import the [working Go example](../public/society-example.go) in **Team behaviours**, or use a visual strategy for fixed choices and conditional actions.

## What the agent sees

`View` includes the current callback in `Phase`, the current `Month`, `Day` and `AbsoluteDay`, and the agent’s own food, body, mind, score and voting tokens in `Self`. Each plot publishes its field stock, active residents, crop event, outstanding aid, rules and elected role holders. Check role membership with `id, ok := plot.Roles["trade"]`. Agent ID zero is valid. The engine shuffles the IDs across teams once per new world. An individual keeps its ID throughout that run.

Agents see public actions across plots in `Actions`. This slice covers the current and previous day within the month. For earlier actions, use a free `RecordQuery` for any plot in the `records` callback. Supply optional inclusive `From` and `To` absolute days and a `Subject` agent ID pointer. The first page freezes the matching history. Use `RecordQuery{Cursor: page.NextCursor}` in `record_pages` to read further pages in the same month. A page holds 128 events by default and accepts a configured size from 1 to 256.

`Memory` contains the individual’s private JSON. Returning valid JSON in `Action.Memory` replaces it. Omitting the field preserves it. The meteor resets physical resources, offices, token balances and rules. Each individual can retain its previous choices and scores in private memory. Valid imports can use `encoding/json` and the supplied `NewRandom(v.RandomSeed)` for deterministic draws.

## When to return each action

| Callback                  | Agent decision                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placement`               | Choose in a fresh random order each month. `v.Plots[i].Residents` lists the IDs already settled there. Return `PlotChoice: &id`. The placement is immediately visible to the next agent.                                    |
| `harvest_order`           | For ranked harvesting, return `HarvestRanking` with each active local resident exactly once, including yourself. An empty list abstains. The resolved queue is available in `Plots[Self.Plot].HarvestOrder` before harvest. |
| `harvest`                 | Request a whole number of carrots in `Harvest`. Field stock and personal storage determine what fits.                                                                                                                       |
| `pledges`                 | Offer mind toward founding a local government with `Pledge["local"]`.                                                                                                                                                       |
| `records`, `record_pages` | Read public action history with `Read`.                                                                                                                                                                                     |
| `proposals`               | Submit one or more `Proposals` for the local assembly. Equivalent submissions on the same plot and day share one ballot ID. Its `Sponsors` lists the submitting residents.                                                  |
| `voting`                  | Submit `OrderedVotes` to spend available mind and tokens on open local ballots.                                                                                                                                             |
| `transfers`               | Donate to Trade, make a gift as Trade, or issue an evidence-backed sanction as Justice.                                                                                                                                     |
| `eating`                  | Set `Eat` to a number of stored carrots and `Think` to an amount of available mind.                                                                                                                                         |
| `close`, `month_end`      | Update private memory before the next day or meteor.                                                                                                                                                                        |

A strategy that remembers a prior resident ID can look for it in each plot’s `Residents` during `placement`. If the resident has already chosen, return that plot’s ID to join them, or choose another plot to avoid them. When no match is visible, the strategy needs a fallback. The downloadable example picks a plot with the fewest residents so far.

## Local rules and spending tokens

`a.Proposals = []Proposal{{Kind: "found", Plot: v.Self.Plot}}` asks residents to found a government. After formation, use `Kind: "policy"` to propose a rule and `Kind: "repeal"` to propose its removal. The catalogue at `/api/society/config` gives the accepted keys and parameters.

For example, this action asks the plot to let residents rank the harvest queue.

```go
a.Proposals = []Proposal{{
    Kind: "policy", Plot: v.Self.Plot,
    Key: "harvestOrder", Rule: Rule{Mode: "ranked"},
}}
```

`VotingWeight` is the daily token grant. `VotingTokens` is the spendable balance. The `tokenAllocation` rule can set an equal grant or award bonus tokens for harvest restraint or participation. For `Mode: "restraint"`, the bonus is `Limit / max(1, yesterdayHarvest)` using integer division, with a limit of 1 to 10,000. For `Mode: "participation"`, it is yesterday’s number of accepted Yes and No ballots divided by the positive integer `Limit`, rounded down. Each ballot counts once whatever its token spend. Existing strategies may still submit the earlier spellings `productivity` and `alignment`. New worlds expose the enacted modes as `restraint` and `participation`. To cast two Yes tokens on any local proposal, use an open proposal ID from `v.Proposals`.

```go
a.OrderedVotes = []VoteChoice{{Proposal: ballot.ID, Choice: "yes", Tokens: 2}}
```

The engine processes ordered choices in sequence. Each accepted Yes or No spends the specified tokens and costs `v.Settings.VoteCost` in unpledged mind once per ballot. An omitted token quantity on a Yes or No spends one token. An unaffordable choice spends neither resource. To abstain, omit the proposal from your response or return `Choice: "abstain"` with zero tokens. Both contribute zero to the tally and cost nothing.

Every political ballot counts tokens. `Total` is the sum of Yes and No tokens spent. Founding or dissolving a government, electing a representative and revoking an appointment require more Yes tokens than No tokens. Founding also requires sufficient pledged mind. Rule changes use the plot’s current support fraction, which defaults to 0.5. For example, propose `Key: "threshold"` with `Rule{Mode: "tokens", Amount: 0.75}` to require more than 75% Yes tokens on subsequent rule changes. At 1.0, every token cast must be Yes. A ballot with zero tokens cast fails.

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

A visual condition matches one callback and returns its configured action. Use a fixed harvest ranking only when its IDs match the current plot’s residents. For varying rosters, a Go strategy can build the ranking directly from the observed residents as the downloadable example does. The builder spends its configured number of tokens on each Yes or No it can afford.
