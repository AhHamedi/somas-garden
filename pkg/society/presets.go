package society

import (
	"encoding/json"
	"math"
	"slices"
)

// PresetInfo describes a built-in strategy in the setup screen.
type PresetInfo struct {
	Policy  string `json:"policy"`
	Name    string `json:"name"`
	Summary string `json:"summary"`
}

func Presets() []PresetInfo {
	return []PresetInfo{
		{"warden", "Wardens", "Propose fair harvest queues and investigate breaches of the agreed quota"},
		{"tinkerer", "Tinkerers", "Try four strategies across months and use their own scores to choose again"},
		{"locust", "Locusts", "Take extra carrots from bumper crops and rank themselves first at harvest"},
		{"envoy", "Envoys", "Elect Trade representatives and give spare carrots for blight relief"},
		{"baron", "Barons", "Back voting tokens for productivity and spend spare carrots on satisfaction"},
		{"sunchaser", "Sunchasers", "Choose a sunny plot at reset and spend their mind on thinking"},
	}
}

var policyAliases = map[string]string{"steward": "warden", "thinker": "sunchaser", "gatherer": "locust", "diplomat": "envoy", "wanderer": "sunchaser", "learner": "tinkerer"}

func canonicalPolicy(p string) string {
	if to, ok := policyAliases[p]; ok {
		return to
	}
	return p
}

func knownPolicy(p string) bool {
	switch canonicalPolicy(p) {
	case "warden", "tinkerer", "locust", "envoy", "baron", "sunchaser":
		return true
	}
	return false
}

// Tinkerers stagger their first trials, then compare their own monthly mean scores.
var trialPolicies = [...]string{"warden", "envoy", "locust", "sunchaser"}

type trialMemory struct {
	Choice int        `json:"choice"`
	Trials [4]int     `json:"trials"`
	Totals [4]float64 `json:"totals"`
}

func (m trialMemory) next(id int) int {
	best := 0
	for i := range trialPolicies {
		slot := (id + i) % len(trialPolicies)
		if m.Trials[slot] == 0 {
			return slot
		}
		if m.Totals[slot]/float64(m.Trials[slot]) > m.Totals[best]/float64(m.Trials[best]) {
			best = slot
		}
	}
	return best
}

func defaultDecision(v Observation, policy string) Decision {
	policy = canonicalPolicy(policy)
	if policy != "tinkerer" {
		return presetAction(v, policy)
	}
	var trials trialMemory
	_ = json.Unmarshal(v.Memory, &trials)
	trials.Choice = max(0, min(trials.Choice, len(trialPolicies)-1))
	if v.Phase == "placement" {
		trials.Choice = trials.next(v.Self.ID)
	}
	d := presetAction(v, trialPolicies[trials.Choice])
	if v.Phase == "month_end" {
		trials.Trials[trials.Choice]++
		trials.Totals[trials.Choice] += v.Self.Score
	}
	if v.Phase == "placement" || v.Phase == "month_end" {
		d.Memory, _ = json.Marshal(trials)
	}
	return d
}

func presetAction(v Observation, policy string) Decision {
	if v.Phase == "placement" && len(v.Plots) > 0 {
		id := initialPlot(v)
		// Consider one alternative so all sun-seekers need not crowd the same field.
		if policy == "sunchaser" && v.Self.ID%4 == 0 {
			other := (id + 1 + v.Self.ID%len(v.Plots)) % len(v.Plots)
			if v.Plots[other].Regeneration > v.Plots[id].Regeneration {
				id = other
			}
		}
		return Decision{PlotChoice: &id}
	}
	if v.Self.Plot < 0 || v.Self.Plot >= len(v.Plots) {
		return Decision{}
	}
	plot := v.Plots[v.Self.Plot]
	need := v.Settings.DailyFood
	switch v.Phase {
	case "harvest_order":
		if plot.Rules["harvestOrder"].Mode == "random" {
			return Decision{}
		}
		return Decision{HarvestRanking: presetRanking(plot.Residents, v.Self.ID, v.Day, policy)}
	case "harvest":
		return Decision{Harvest: presetHarvest(v, plot, policy)}
	case "pledges":
		if !plot.Government && policy != "sunchaser" && policy != "locust" {
			share := v.Settings.GovernmentCost / float64(max(1, len(plot.Residents)))
			budget := max(0, v.Self.Mind-v.Settings.ProposalCost)
			pledge := min(budget, v.Settings.GovernmentCost, max(1, 2*share))
			return Decision{Pledge: map[string]float64{"local": pledge}}
		}
	case "proposals":
		return presetAgenda(v, plot, policy)
	case "voting":
		return presetVotes(v, policy)
	case "transfers":
		return presetTransfers(v, plot, policy)
	case "eating":
		meal := need
		if policy == "baron" || policy == "locust" {
			meal = max(need, v.Self.Food-need)
		}
		return Decision{Eat: min(meal, v.Self.Food), Think: available(&v.Self)}
	}
	return Decision{}
}

// Estimate how many carrots can be taken while overnight growth returns the field
// to its current size. Strategies can still take more, especially after a bumper crop.
func presetHarvest(v Observation, p PlotView, policy string) int {
	need, n := v.Settings.DailyFood, len(p.Residents)
	if n == 0 || p.Stock == nil || p.Capacity == 0 {
		return 0
	}
	k := v.Settings.Growth * min(float64(n), float64(p.Capacity)/v.Settings.ProductiveCapacity)
	regrowingShare := k * float64(*p.Stock) / (float64(p.Capacity) + k) / float64(n)
	share := int(regrowingShare)
	// Spread fractional shares across different individuals on different days.
	if float64(v.RandomSeed%10000)/10000 < regrowingShare-math.Floor(regrowingShare) {
		share++
	}
	request := max(0, need-v.Self.Food)
	rep, hasRep := p.Roles["trade"]
	if hasRep && rep == v.Self.ID {
		request = max(request, min(2*need, v.Settings.RepresentativeCapacity-v.Self.Food))
	} else {
		switch policy {
		case "envoy", "warden":
			// An additional carrot can be saved or donated while the field is healthy.
			if v.Self.Food <= need {
				request = max(request, share)
			}
		case "locust", "baron":
			if p.CropEvent == "bumper" {
				request = max(request, min(2*need, v.Settings.PersonalCapacity-v.Self.Food))
			} else {
				request = max(request, min(share, 2*need-v.Self.Food))
			}
		default:
			request = max(request, min(share, need+1-v.Self.Food))
		}
	}
	if q := p.Rules["quota"]; q.Mode == "limited" && policy != "locust" {
		request = min(request, int(q.Amount))
	}
	return request
}

func presetRanking(residents []int, self, day int, policy string) []int {
	if len(residents) == 0 {
		return nil
	}
	// Rotate the starting point each day. Self-interested voters move themselves to the front.
	offset := max(0, day-1) % len(residents)
	ranking := make([]int, 0, len(residents))
	ranking = append(ranking, residents[offset:]...)
	ranking = append(ranking, residents[:offset]...)
	if policy == "locust" || policy == "baron" {
		if i := slices.Index(ranking, self); i > 0 {
			copy(ranking[1:i+1], ranking[:i])
			ranking[0] = self
		}
	}
	return ranking
}

func presetAgenda(v Observation, p PlotView, policy string) Decision {
	if len(p.Residents) == 0 || policy == "sunchaser" || policy == "locust" {
		return Decision{}
	}
	// One rotating volunteer per plot avoids spending mind and tokens on duplicate motions.
	if p.Residents[(v.Day-1)%len(p.Residents)] != v.Self.ID {
		return Decision{}
	}
	in := ProposalInput{Kind: "found", Plot: p.ID}
	if p.Government {
		first, last := p.Residents[0], p.Residents[len(p.Residents)-1]
		_, hasTrade := p.Roles["trade"]
		_, hasJustice := p.Roles["justice"]
		switch {
		case !hasTrade:
			in = ProposalInput{Kind: "elect", Plot: p.ID, Key: "trade", Target: first}
		case !hasJustice && len(p.Residents) > 1:
			in = ProposalInput{Kind: "elect", Plot: p.ID, Key: "justice", Target: last}
		// Select a queue or allocation rule from the team's public preferences.
		case policy == "warden" && p.Rules["harvestOrder"].Mode != "ranked":
			in = ProposalInput{Kind: "policy", Plot: p.ID, Key: "harvestOrder", Rule: Rule{Mode: "ranked"}}
		case policy == "warden" && p.Rules["quota"].Mode != "limited":
			in = ProposalInput{Kind: "policy", Plot: p.ID, Key: "quota", Rule: Rule{Mode: "limited", Amount: float64(max(1, v.Settings.DailyFood))}}
		case policy == "baron" && p.Rules["tokenAllocation"].Mode != "productivity":
			in = ProposalInput{Kind: "policy", Plot: p.ID, Key: "tokenAllocation", Rule: Rule{Mode: "productivity", Amount: float64(v.Settings.VotingTokens), Limit: max(1, v.Settings.DailyFood)}}
		default:
			return Decision{}
		}
	}
	return Decision{Proposals: []ProposalInput{in}}
}

func presetVotes(v Observation, policy string) Decision {
	if policy == "sunchaser" {
		return Decision{}
	}
	d := Decision{}
	for _, q := range v.Proposals {
		if q.Status != "open" || q.Plot != v.Self.Plot || len(d.OrderedVotes) >= v.Self.VotingTokens {
			continue
		}
		choice := "yes"
		switch q.Input.Kind {
		case "found", "elect":
		case "policy":
			key := q.Input.Key
			if (policy == "locust" && key == "quota") || (key == "tokenAllocation" && policy == "warden" && q.Input.Rule.Mode != "equal") {
				choice = "no"
			}
		default:
			continue
		}
		d.OrderedVotes = append(d.OrderedVotes, VoteChoice{Proposal: q.ID, Choice: choice, Tokens: 1})
	}
	return d
}

func presetTransfers(v Observation, p PlotView, policy string) Decision {
	if justice, ok := p.Roles["justice"]; ok && justice == v.Self.ID && len(v.SanctionCases) > 0 {
		c := v.SanctionCases[0]
		return Decision{Orders: []Order{{Kind: "sanction", Plot: p.ID, Target: c.Target, Evidence: c.Evidence, Sanction: "warning"}}}
	}
	rep, ok := p.Roles["trade"]
	if !ok {
		return Decision{}
	}
	spare := max(0, v.Self.Food-v.Settings.DailyFood)
	if v.Self.ID != rep {
		if spare > 0 && (policy == "envoy" || policy == "warden") {
			// Read the representative's most recent public balance. Leave some
			// capacity for other residents making decisions in this same phase.
			for i := len(v.Actions) - 1; i >= 0; i-- {
				e := v.Actions[i]
				if e.Actor == rep {
					if e.Food >= v.Settings.RepresentativeCapacity*3/4 {
						return Decision{}
					}
					break
				}
			}
			return Decision{Donate: spare}
		}
		return Decision{}
	}
	for _, other := range v.Plots {
		if target, exists := other.Roles["trade"]; other.ID != p.ID && exists && other.AidNeeded > 0 && spare > 0 {
			return Decision{Gift: &Offer{To: target, Amount: min(spare, other.AidNeeded)}}
		}
	}
	return Decision{}
}
