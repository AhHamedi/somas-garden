//go:build agent

// somas:api=5
// Import this file through the strategy editor. Each copy has its own v.Memory.
package main

import "encoding/json"

func Decide(v View) Action {
	var memory struct {
		Months        int     `json:"months"`
		PreviousScore float64 `json:"previousScore"`
	}
	_ = json.Unmarshal(v.Memory, &memory)
	a := Action{}
	switch v.Phase {
	case "movement":
		if v.Self.Plot < 0 && len(v.Plots) > 0 {
			plot := v.Self.ID % len(v.Plots)
			a.Move = &plot
		}
	case "harvest":
		a.Harvest = v.Settings.DailyFood
	case "pledges":
		if v.Self.Plot >= 0 {
			a.Pledge = map[string]float64{"local": 2}
			// Where influence is earned by contribution, funding the plot's
			// services buys a say: pledge more until influence is at its top.
			basis := v.Plots[v.Self.Plot].Rules["influenceBasis"].Mode
			if (basis == "contribution" || basis == "contributionOnly") && v.Self.Influence < v.Settings.MaxInfluence {
				a.Pledge["local"] = 4
			}
		}
	case "proposals":
		if v.Self.Plot >= 0 && !v.Plots[v.Self.Plot].Government && v.Self.Mind >= 3 {
			a.Proposals = []Proposal{{Kind: "found"}}
		}
	case "voting":
		a.Votes = map[string]string{}
		for _, p := range v.Proposals {
			if p.Status == "open" && p.Input.Kind == "found" {
				a.Votes[p.ID] = "yes"
			}
		}
	case "eating":
		a.Eat = v.Settings.DailyFood // Chosen explicitly, never supplied by the engine.
		a.Think = v.Self.Mind - 2
		if a.Think < 0 {
			a.Think = 0
		}
	case "month_end":
		memory.Months++
		memory.PreviousScore = v.Self.Score
	}
	a.Memory, _ = json.Marshal(memory)
	return a
}
