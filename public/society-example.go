//go:build agent

// somas:api=7
// Import through Team behaviours. Each individual keeps its own memory.
package main

import "encoding/json"

func Decide(v View) Action {
	a := Action{}
	switch v.Phase {
	case "placement":
		// Start at a random plot and choose one of the least crowded fields so far.
		p := NewRandom(v.RandomSeed).Intn(len(v.Plots))
		start := p
		for offset := 1; offset < len(v.Plots); offset++ {
			other := (start + offset) % len(v.Plots)
			if len(v.Plots[other].Residents) < len(v.Plots[p].Residents) {
				p = other
			}
		}
		a.PlotChoice = &p
	case "harvest_order":
		// Rotate which resident goes first each day. Submit every resident once.
		order := v.Plots[v.Self.Plot].Residents
		if len(order) > 0 {
			first := (v.Day - 1) % len(order)
			a.HarvestRanking = append(a.HarvestRanking, order[first:]...)
			a.HarvestRanking = append(a.HarvestRanking, order[:first]...)
		}
	case "harvest":
		a.Harvest = max(0, 2*v.Settings.DailyFood-v.Self.Food)
	case "pledges":
		if !v.Plots[v.Self.Plot].Government {
			a.Pledge = map[string]float64{"local": min(2, max(0, v.Self.Mind-v.Settings.ProposalCost-v.Settings.VoteCost))}
		}
	case "proposals":
		plot := v.Plots[v.Self.Plot]
		if len(plot.Residents) > 0 && plot.Residents[0] == v.Self.ID {
			if !plot.Government {
				a.Proposals = []Proposal{{Kind: "found", Plot: plot.ID}}
			} else if _, ok := plot.Roles["trade"]; !ok {
				a.Proposals = []Proposal{{Kind: "elect", Key: "trade", Target: v.Self.ID, Plot: plot.ID}}
			} else if plot.Rules["harvestOrder"].Mode != "ranked" {
				a.Proposals = []Proposal{{Kind: "policy", Key: "harvestOrder", Rule: Rule{Mode: "ranked"}, Plot: plot.ID}}
			}
		}
	case "voting":
		budget := v.Self.Mind - v.Self.Pledges["local"]
		for _, p := range v.Proposals {
			if budget+1e-7 < v.Settings.VoteCost {
				break
			}
			if p.Plot == v.Self.Plot && p.Status == "open" && len(a.OrderedVotes) < v.Self.VotingTokens {
				budget -= v.Settings.VoteCost
				a.OrderedVotes = append(a.OrderedVotes, VoteChoice{Proposal: p.ID, Choice: "yes", Tokens: 1})
			}
		}
	case "transfers":
		rep, ok := v.Plots[v.Self.Plot].Roles["trade"]
		if !ok {
			break
		}
		spare := max(0, v.Self.Food-v.Settings.DailyFood)
		if rep != v.Self.ID {
			a.Donate = spare
			break
		}
		for _, plot := range v.Plots {
			recipient, exists := plot.Roles["trade"]
			if exists && plot.ID != v.Self.Plot && plot.AidNeeded > 0 && spare > 0 {
				a.Gift = &Offer{To: recipient, Amount: min(spare, plot.AidNeeded)}
				break
			}
		}
	case "eating":
		a.Eat = min(v.Self.Food, v.Settings.DailyFood)
		a.Think = max(0, v.Self.Mind-v.Self.Pledges["local"])
	case "month_end":
		var m struct {
			Months int     `json:"months"`
			Score  float64 `json:"score"`
		}
		_ = json.Unmarshal(v.Memory, &m)
		m.Months++
		m.Score = v.Self.Score
		a.Memory, _ = json.Marshal(m)
	}
	return a
}
