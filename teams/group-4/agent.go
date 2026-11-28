//go:build agent

// somas:api=9
// Dialists v3. Our team's dials are fixed at:
// entrepreneurial 1, power 0.1, generosity 0.5, restraint 0.4.
package main

import "math"

const (
	generosity = 0.5
	restraint  = 0.4
)

func Decide(v View) Action {
	a := Action{}
	if v.Phase == "placement" {
		p := defaultPlot(v)
		a.PlotChoice = &p
		return a
	}
	if v.Self.Plot < 0 || v.Self.Plot >= len(v.Plots) {
		return a
	}
	plot := v.Plots[v.Self.Plot]
	need := v.Settings.DailyFood

	switch v.Phase {
	case "harvest_order":
		// take turns: rotate who goes first each day
		if plot.Rules["harvestOrder"].Mode != "random" && len(plot.Residents) > 0 {
			i := (v.Day - 1) % len(plot.Residents)
			a.HarvestRanking = append(a.HarvestRanking, plot.Residents[i:]...)
			a.HarvestRanking = append(a.HarvestRanking, plot.Residents[:i]...)
		}
	case "harvest":
		a.Harvest = harvest(v)
	case "pledges":
		// help pay for founding a government
		if !plot.Government {
			pledge := math.Min(freeMind(v)-v.Settings.ProposalCost, v.Settings.GovernmentCost/4)
			if pledge > 0 {
				a.Pledge = map[string]float64{"local": pledge}
			}
		}
	case "proposals":
		if p, ok := nextMotion(v); ok {
			if freeMind(v) >= v.Settings.ProposalCost {
				a.Proposals = []Proposal{p}
			}
		}
	case "voting":
		a.OrderedVotes = votes(v)
	case "transfers":
		give(v, &a)
	case "eating":
		a.Eat = min(need, v.Self.Food)
		a.Think = freeMind(v)
	}
	return a
}

func freeMind(v View) float64 {
	m := v.Self.Mind
	for _, p := range v.Self.Pledges {
		m -= p
	}
	return math.Max(0, m)
}

// Same spread as the engine's default placement: plots filled in proportion
// to their capacity, based on our ID.
func defaultPlot(v View) int {
	total := 0
	for _, p := range v.Plots {
		total += p.Capacity
	}
	pop := max(1, total/max(1, v.Settings.CapacityPerAgent))
	mult := 97
	for gcd(mult, pop) != 1 {
		mult--
	}
	slot := (v.Self.ID * mult % pop) * total / pop
	sum := 0
	for _, p := range v.Plots {
		sum += p.Capacity
		if slot < sum {
			return p.ID
		}
	}
	return len(v.Plots) - 1
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	return a
}

// Take what we need today, plus our share of what grows back overnight.
// Never go over the quota.
func harvest(v View) int {
	p := v.Plots[v.Self.Plot]
	need, n := v.Settings.DailyFood, len(p.Residents)
	if n == 0 || p.Stock == nil || p.Capacity == 0 {
		return 0
	}
	rate := float64(v.Settings.DailyGrowthPercent) / 100
	exact := float64(*p.Stock) * rate / (1 + rate) / float64(n)
	share := int(exact)
	if float64(v.RandomSeed%10000)/10000 < exact-math.Floor(exact) {
		share++
	}
	want := max(0, need-v.Self.Food)
	if rep, ok := p.Roles["trade"]; ok && rep == v.Self.ID {
		want = max(want, min(2*need, v.Settings.RepresentativeCapacity-v.Self.Food))
	} else if v.Self.Food <= need {
		want = max(want, share)
	}
	if q := p.Rules["quota"]; q.Mode == "limited" {
		want = min(want, int(q.Amount)-v.Self.Harvested)
	}
	return max(0, want)
}

// Our quota: daily need plus 2 carrots.
func quota(v View) int {
	return v.Settings.DailyFood + int(math.Round((1-restraint)*4))
}

// Build the plot's institutions in order: government, Trade rep, ranked
// harvest, then our quota once the field is down to 70%.
func nextMotion(v View) (Proposal, bool) {
	p := v.Plots[v.Self.Plot]
	if len(p.Residents) == 0 {
		return Proposal{}, false
	}
	var options []Proposal
	if !p.Government {
		options = append(options, Proposal{Kind: "found", Plot: p.ID})
	} else {
		if _, ok := p.Roles["trade"]; !ok {
			options = append(options, Proposal{Kind: "elect", Plot: p.ID, Key: "trade", Target: p.Residents[0]})
		}
		if p.Rules["harvestOrder"].Mode != "ranked" {
			options = append(options, Proposal{Kind: "policy", Plot: p.ID, Key: "harvestOrder", Rule: Rule{Mode: "ranked"}})
		}
		q := Proposal{Kind: "policy", Plot: p.ID, Key: "quota", Rule: Rule{Mode: "limited", Amount: float64(quota(v))}}
		cur := p.Rules["quota"]
		low := p.Stock != nil && float64(*p.Stock) <= (0.5+0.5*restraint)*float64(p.Capacity)
		if (cur.Mode == "limited" && math.Abs(cur.Amount-q.Rule.Amount) >= 1) || (cur.Mode != "limited" && low) {
			options = append(options, q)
		}
	}
	for _, o := range options {
		if !pending(v, o) {
			return o, true
		}
	}
	return Proposal{}, false
}

// Is the same kind of motion already on the table for this plot?
func pending(v View, o Proposal) bool {
	for _, q := range v.Proposals {
		if q.Plot == o.Plot && (q.Status == "open" || q.Status == "scheduled") && q.Input.Kind == o.Kind && q.Input.Key == o.Key {
			return true
		}
	}
	for _, q := range v.Pending {
		if q.Plot == o.Plot && q.Input.Kind == o.Kind && q.Input.Key == o.Key {
			return true
		}
	}
	return false
}

// Back institutions and our quota, oppose anything that weakens them.
func votes(v View) []VoteChoice {
	var out []VoteChoice
	for _, q := range v.Proposals {
		if q.Status != "open" || q.Plot != v.Self.Plot || len(out) >= v.Self.VotingTokens {
			continue
		}
		choice := ""
		in := q.Input
		switch {
		case in.Kind == "found" || in.Kind == "elect":
			choice = "yes"
		case in.Kind == "revoke" || in.Kind == "dissolve":
			choice = "no"
		case in.Key == "quota":
			level := float64(quota(v))
			if in.Kind != "policy" || in.Rule.Mode != "limited" {
				choice = "no"
			} else if math.Abs(in.Rule.Amount-level) <= 1 {
				choice = "yes"
			} else if in.Rule.Amount < level-1 {
				choice = "no" // too tight, nothing left to donate
			}
		case in.Kind == "repeal" && in.Key == "harvestOrder":
			choice = "no"
		case in.Kind == "policy" && in.Key == "harvestOrder":
			choice = "yes"
			if in.Rule.Mode == "random" {
				choice = "no"
			}
		case in.Kind == "policy" && in.Key == "threshold":
			choice = "no"
		case in.Kind == "policy" && in.Key == "tokenAllocation":
			choice = "no"
			if in.Rule.Mode == "equal" {
				choice = "yes"
			}
		}
		if choice != "" {
			out = append(out, VoteChoice{Proposal: q.ID, Choice: choice, Tokens: 1})
		}
	}
	return out
}

// Justice gives warnings. Everyone gives half their spare food to Trade, and
// Trade sends food to the plot that needs the most blight relief.
func give(v View, a *Action) {
	p := v.Plots[v.Self.Plot]
	if j, ok := p.Roles["justice"]; ok && j == v.Self.ID && len(v.SanctionCases) > 0 {
		c := v.SanctionCases[0]
		a.Orders = []Order{{Kind: "sanction", Plot: p.ID, Target: c.Target, Evidence: c.Evidence, Sanction: "warning"}}
	}
	rep, ok := p.Roles["trade"]
	spare := v.Self.Food - v.Settings.DailyFood
	if !ok || spare <= 0 {
		return
	}
	share := int(math.Round(generosity * float64(spare)))
	if rep != v.Self.ID {
		if share > 0 && !repNearlyFull(v, rep) {
			a.Donate = share
		}
		return
	}
	// the plot with the biggest unmet need, first one wins a tie
	target := -1
	for i, o := range v.Plots {
		if _, has := o.Roles["trade"]; has && o.ID != p.ID && o.AidNeeded > 0 {
			if target < 0 || o.AidNeeded > v.Plots[target].AidNeeded {
				target = i
			}
		}
	}
	if target < 0 {
		return
	}
	need := v.Plots[target].AidNeeded
	amount := max(share, min(need, spare))
	a.Gift = &Offer{To: v.Plots[target].Roles["trade"], Amount: min(amount, spare)}
}

// Don't donate if the rep's store is already 3/4 full.
func repNearlyFull(v View, rep int) bool {
	for i := len(v.Actions) - 1; i >= 0; i-- {
		if e := v.Actions[i]; e.Actor == rep {
			return e.Food >= v.Settings.RepresentativeCapacity*3/4
		}
	}
	return false
}
