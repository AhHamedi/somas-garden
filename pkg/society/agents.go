package society

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
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
