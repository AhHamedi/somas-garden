package society

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"
)

func (w *World) rawView(id int) Observation {
	if id < 0 || id >= len(w.Agents) {
		return Observation{}
	}
	a := w.Agents[id]
	v := Observation{RecordPages: w.recordPages[id], RandomSeed: w.privateSeed(id, w.Phase), SanctionCases: w.SanctionCases(id), Month: w.Month, Day: w.Day, AbsoluteDay: w.AbsoluteDay, Phase: w.Phase, Self: *a, Memory: append(json.RawMessage{}, a.Memory...), Settings: w.Settings, Plots: []PlotView{}, Proposals: []*Proposal{}, Offers: []Offer{}, Pending: []Pending{}, Receipts: w.receipts[id], Records: w.reads[id]}
	for _, p := range w.Plots {
		pv := PlotView{ID: p.ID, Name: p.Name, Capacity: p.Capacity, Weather: p.Weather, Regeneration: p.Regeneration, Government: p.Government, Federation: p.Federation}
		share := p.ID == a.Plot
		if a.Plot >= 0 && p.Federation >= 0 && p.Federation == w.Plots[a.Plot].Federation {
			for _, f := range w.Federations {
				if f.ID == p.Federation && !f.Dissolved && f.Funded && (f.Rules["data"].Mode == "on" || f.Rules["data"].Enabled) {
					share = true
				}
			}
		}
		if share {
			x, y := p.Stock, p.Reserve
			pv.Stock = &x
			pv.Reserve = &y
		}
		if p.ID == a.Plot {
			pv.Rules = p.Rules
			pv.Officers = p.Officers
			pv.HardFunded = p.HardFunded
			pv.RecordsFunded = p.RecordsFunded
			for _, r := range w.residents(p.ID) {
				pv.Residents = append(pv.Residents, r.ID)
			}
		}
		v.Plots = append(v.Plots, pv)
	}
	if a.Plot >= 0 {
		for _, f := range w.Federations {
			if f.ID == w.Plots[a.Plot].Federation && !f.Dissolved {
				v.Federations = append(v.Federations, f)
			}
		}
	}
	for _, p := range w.Proposals {
		if p.Plot == a.Plot || (a.Plot >= 0 && p.Federation >= 0 && p.Federation == w.Plots[a.Plot].Federation) {
			v.Proposals = append(v.Proposals, p)
		}
	}
	for _, scheduled := range w.Pending {
		visible := scheduled.Actor == id || (a.Plot >= 0 && scheduled.Plot == a.Plot)
		// A prospective entrant or named recipient sees the operation that
		// directly affects them, without seeing the rest of a foreign treasury.
		if has([]string{"distribution", "permitEntry", "permitExit", "sanction", "applySanction", "directSanction", "office"}, scheduled.Input.Kind) && scheduled.Input.Target == id {
			visible = true
		}
		if scheduled.Input.Kind == "distribution" && includes(scheduled.Input.Members, id) {
			visible = true
		}
		if a.Plot >= 0 {
			ownFed := w.Plots[a.Plot].Federation
			if ownFed >= 0 && scheduled.Federation == ownFed && has([]string{"federationPolicy", "federationRepeal", "federationAdmit", "federationDissolve"}, scheduled.Input.Kind) {
				visible = true
			}
			if scheduled.Input.Kind == "createFederation" && includes(scheduled.Input.Members, a.Plot) {
				visible = true
			}
		}
		if visible {
			v.Pending = append(v.Pending, scheduled)
		}
	}
	for _, o := range w.Offers {
		if o.From == id || o.To == id {
			v.Offers = append(v.Offers, o)
		}
	}
	return v
}
func (w *World) View(id int) Observation {
	v := w.rawView(id)
	b, _ := json.Marshal(v)
	var detached Observation
	_ = json.Unmarshal(b, &detached)
	return detached
}

func (w *World) decisions(phase string) map[int]Decision {
	out := map[int]Decision{}
	w.updateResidents()
	for _, a := range w.Agents {
		if !a.Alive && phase != "month_end" && phase != "close" {
			continue
		}
		v := w.rawView(a.ID)
		if w.Deciders[a.ID] != nil {
			v = w.View(a.ID)
		} else {
			v.Receipts = nil
			v.Records = nil
		}
		v.Phase = phase
		v.RandomSeed = w.privateSeed(a.ID, phase)
		start := time.Now()
		var d Decision
		func() {
			defer func() {
				if recover() != nil {
					d = Decision{Error: "Agent panicked while deciding"}
				}
			}()
			if custom := w.Deciders[a.ID]; custom != nil {
				d = custom(v)
			} else {
				if w.Teams[a.Team].StrategyID != "" {
					d = Decision{Error: "Uploaded strategy is unavailable"}
				} else {
					d = builtinDecision(v, w.Teams[a.Team])
				}
			}
		}()
		if time.Since(start) > time.Duration(w.Settings.DecisionMS)*time.Millisecond && w.Deciders[a.ID] != nil && d.Error == "" {
			d = Decision{Error: "Agent exceeded its decision time budget"}
		}
		if d.Error != "" {
			a.Error = d.Error
			w.reject(a, d.Error)
			out[a.ID] = Decision{}
			continue
		}
		a.Error = ""
		if len(d.Memory) > 0 {
			if len(d.Memory) <= w.Settings.MemoryBytes && json.Valid(d.Memory) {
				a.Memory = append(json.RawMessage{}, d.Memory...)
			} else {
				w.reject(a, "Memory update is invalid or exceeds its configured capacity")
			}
		}
		out[a.ID] = d
	}
	return out
}
func field(v Observation, name string) float64 {
	switch name {
	case "food":
		return float64(v.Self.Food)
	case "mind":
		return available(&v.Self)
	case "body":
		return v.Self.Body
	case "score":
		return v.Self.Score
	case "day":
		return float64(v.Day)
	case "month":
		return float64(v.Month)
	case "plot":
		return float64(v.Self.Plot)
	case "deaths":
		return float64(v.Self.Deaths)
	case "stock":
		if v.Self.Plot >= 0 && v.Plots[v.Self.Plot].Stock != nil {
			return float64(*v.Plots[v.Self.Plot].Stock)
		}
	case "population":
		if v.Self.Plot >= 0 {
			return float64(len(v.Plots[v.Self.Plot].Residents))
		}
	case "government":
		if v.Self.Plot >= 0 && v.Plots[v.Self.Plot].Government {
			return 1
		}
	}
	return 0
}
func compare(x, y float64, op string) bool {
	switch op {
	case "lt":
		return x < y
	case "lte":
		return x <= y
	case "gt":
		return x > y
	case "gte":
		return x >= y
	case "neq":
		return x != y
	case "always":
		return true
	default:
		return x == y
	}
}
func builtinDecision(v Observation, t Team) Decision {
	if b := t.Builder; b != nil {
		for _, r := range b.Rules {
			if r.Phase == v.Phase && compare(field(v, r.Field), r.Value, r.Op) {
				d := r.Action
				if d.Think == -1 {
					d.Think = math.Max(0, available(&v.Self)-b.KeepMind)
				}
				return d
			}
		}
		if len(b.Rules) > 0 && b.Fallback != "" {
			return defaultDecision(v, b.Fallback)
		}
		d := Decision{}
		switch v.Phase {
		case "movement":
			if v.Self.Plot < 0 || b.Migrate {
				p := v.Self.ID % len(v.Plots)
				d.Move = &p
			}
		case "harvest":
			d.Harvest = b.Harvest
		case "pledges":
			if v.Self.Plot >= 0 {
				d.Pledge = map[string]float64{"local": math.Min(b.Pledge, v.Self.Mind)}
			}
		case "proposals":
			if v.Self.Plot >= 0 {
				p := v.Plots[v.Self.Plot]
				if b.Government && !p.Government {
					d.Proposals = append(d.Proposals, ProposalInput{Kind: "found", Plot: p.ID})
				}
				d.Proposals = append(d.Proposals, b.Proposals...)
			}
		case "voting":
			d.Votes = map[string]string{}
			for _, p := range v.Proposals {
				if p.Status == "open" {
					d.Votes[p.ID] = b.Vote
				}
			}
		case "eating":
			d.Eat = b.Eat
			d.Think = b.Think
			if b.Think < 0 {
				d.Think = math.Max(0, available(&v.Self)-b.KeepMind)
			}
		case "accept":
			for _, o := range v.Offers {
				if o.To == v.Self.ID {
					d.Accept = append(d.Accept, o.ID)
				}
			}
		}
		return d
	}
	return defaultDecision(v, t.Policy)
}
func defaultDecision(v Observation, policy string) Decision {
	d := Decision{}
	a := v.Self
	var p *PlotView
	if a.Plot >= 0 {
		p = &v.Plots[a.Plot]
	}
	leader := false
	if p != nil && len(p.Residents) > 0 {
		ids := append([]int{}, p.Residents...)
		sort.Ints(ids)
		leader = ids[0] == a.ID
	}
	social := policy == "steward" || policy == "diplomat" || policy == "learner"
	keep := 2.
	if policy == "thinker" {
		keep = .5
	}
	memory := map[string]float64{}
	_ = json.Unmarshal(v.Memory, &memory)
	switch v.Phase {
	case "movement":
		if a.Plot < 0 {
			dest := initialPlot(v)
			d.Move = &dest
		} else if (policy == "wanderer" && v.Day%7 == 0) || (p.Stock != nil && *p.Stock < len(p.Residents)*v.Settings.DailyFood/2) {
			best := a.Plot
			score := -1.
			for _, q := range v.Plots {
				value := float64(q.Capacity)/100 + q.Regeneration
				if q.ID == a.Plot {
					value += 2
				}
				if value > score {
					best = q.ID
					score = value
				}
			}
			if best != a.Plot {
				d.Move = &best
			}
		}
	case "harvest":
		d.Harvest = v.Settings.HarvestLimit
		if policy != "gatherer" {
			target := v.Settings.DailyFood
			if p != nil && p.Stock != nil && *p.Stock < p.Capacity/2 {
				target = v.Settings.DailyFood
			}
			if policy == "learner" && memory["shortages"] > 0 {
				target = v.Settings.DailyFood
			}
			d.Harvest = max(0, target-a.Food)
		}
	case "pledges":
		if p != nil {
			pledge := .15
			if !p.Government {
				pledge = .4
			}
			if policy == "thinker" {
				pledge = .05
			}
			if policy == "gatherer" {
				pledge = .1
			}
			d.Pledge = map[string]float64{"local": math.Min(pledge, available(&a)+a.Pledges["local"])}
			if p.Government && v.Day >= 8 && social {
				d.Pledge["federation"] = math.Min(.6, math.Max(0, available(&a)+a.Pledges["federation"]-pledge))
			}
		}
	case "proposals":
		if p == nil || !leader {
			return d
		}
		if !p.Government {
			d.Proposals = []ProposalInput{{Kind: "found", Plot: p.ID}}
			return d
		}
		propose := func(key string, r Rule) {
			if _, ok := p.Rules[key]; !ok {
				d.Proposals = append(d.Proposals, ProposalInput{Kind: "policy", Plot: p.ID, Key: key, Rule: r})
			}
		}
		switch {
		case v.Day >= 2 && v.Day <= 3:
			propose("quota", Rule{Mode: "limited", Amount: float64(v.Settings.DailyFood)})
		case v.Day == 4:
			propose("enforcement", Rule{Mode: "hard"})
		case v.Day == 5:
			propose("records", Rule{Mode: "on"})
		case v.Day == 6:
			propose("recordAccess", Rule{Mode: "all"})
			d.Proposals = append(d.Proposals, ProposalInput{Kind: "office", Plot: p.ID, Target: a.ID, Rule: Rule{Powers: []string{"distribution", "donation", "entry", "exit", "sanctions", "applySanction"}, Limit: 6}})
		case v.Day == 7:
			propose("inheritance", Rule{Mode: "government"})
			propose("tax", Rule{Mode: "percent", Amount: 25, Exempt: 4})
		case v.Day == 8:
			propose("collection", Rule{Mode: "fixedAfter", Amount: 2})
		case v.Day >= 9 && v.Day <= 12 && p.Federation < 0:
			members := []int{}
			for _, q := range v.Plots {
				if q.Government && q.Federation < 0 {
					members = append(members, q.ID)
				}
			}
			if len(members) >= 2 {
				d.Proposals = append(d.Proposals, ProposalInput{Kind: "federationFound", Plot: p.ID, Members: members})
			}
		}
		if p.Federation >= 0 {
			propose(fmt.Sprintf("representative:%d", a.ID), Rule{Mode: "appoint", Powers: []string{"federationPropose", "federationVote"}})
			propose("charterMandate", Rule{Mode: "officers", Members: []int{a.ID}})
			if len(v.Federations) > 0 {
				f := v.Federations[0]
				for _, key := range []string{"donations", "data", "gifts", "sharedRecords"} {
					if _, ok := f.Rules[key]; !ok {
						d.Proposals = append(d.Proposals, ProposalInput{Kind: "federationPolicy", Federation: f.ID, Key: key, Rule: Rule{Mode: "on", Enabled: true}})
						break
					}
				}
			}
		}
	case "voting":
		d.Votes = map[string]string{}
		for _, q := range v.Proposals {
			if q.Status != "open" {
				continue
			}
			vote := "yes"
			if policy == "gatherer" && (q.Input.Key == "quota" || q.Input.Key == "tax" || q.Input.Key == "enforcement") {
				vote = "no"
			}
			if policy == "thinker" && q.Input.Kind != "found" {
				vote = "abstain"
			}
			d.Votes[q.ID] = vote
		}
	case "transfers":
		if p != nil && p.Government && a.Food > v.Settings.DailyFood+2 && social {
			d.Deposit = 1
		}
		if p != nil && p.Reserve != nil && *p.Reserve > 0 {
			if _, ok := p.Officers[a.ID]; ok && v.Day%2 == 0 {
				recipients := []int{}
				for _, id := range p.Residents {
					if id != a.ID {
						recipients = append(recipients, id)
					}
				}
				d.Orders = []Order{{Kind: "distribution", Plot: p.ID, Target: -1, Amount: min(6, *p.Reserve), Members: recipients}}
			}
		}
	case "accept":
		for _, o := range v.Offers {
			if o.To == a.ID {
				d.Accept = append(d.Accept, o.ID)
			}
		}
	case "eating":
		d.Eat = min(a.Food, v.Settings.DailyFood+1)
		if policy == "gatherer" {
			d.Eat = a.Food
		}
		if policy == "learner" && memory["shortages"] > 0 {
			d.Eat = min(a.Food, v.Settings.DailyFood)
		}
		d.Think = math.Max(0, available(&a)-keep)
	case "close":
		if a.Eaten < v.Settings.DailyFood {
			memory["shortages"]++
		}
		memory["lastScore"] = a.Score
		d.Memory, _ = json.Marshal(memory)
	case "month_end":
		memory["months"]++
		memory["previousScore"] = a.Score
		d.Memory, _ = json.Marshal(memory)
	}
	return d
}

func initialPlot(v Observation) int {
	total := 0
	for _, p := range v.Plots {
		total += p.Capacity
	}
	population := max(1, total/max(1, v.Settings.CapacityPerAgent))
	mult := 97
	gcd := func(a, b int) int {
		for b != 0 {
			a, b = b, a%b
		}
		return a
	}
	for gcd(mult, population) != 1 {
		mult--
	}
	slot := (v.Self.ID * mult % population) * total / population
	sum := 0
	for _, p := range v.Plots {
		sum += p.Capacity
		if slot < sum {
			return p.ID
		}
	}
	return len(v.Plots) - 1
}

func (w *World) privateSeed(id int, phase string) int64 {
	h := sha256.Sum256([]byte(fmt.Sprintf("private/%d/%d/%d/%d/%s", w.Seed, w.Month, w.Day, id, phase)))
	return int64(binary.LittleEndian.Uint64(h[:8]) & 0x7fffffffffffffff)
}
