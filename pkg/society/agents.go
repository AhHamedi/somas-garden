package society

import (
	"bytes"
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
	// Recent actions are shared from the engine ledger. The full month's
	// actions are available through free paginated queries on every plot.
	start := sort.Search(len(w.Events), func(i int) bool { return w.Events[i].AbsoluteDay >= w.AbsoluteDay-1 })
	v := Observation{
		RecordPages: w.recordPages[id], RandomSeed: w.privateSeed(id, w.Phase),
		SanctionCases: w.SanctionCases(id), Month: w.Month, Day: w.Day,
		AbsoluteDay: w.AbsoluteDay, Phase: w.Phase, Self: *a, Memory: a.Memory,
		Settings: w.Settings, Plots: make([]PlotView, 0, len(w.Plots)),
		Proposals: w.Proposals, Pending: w.Pending, Receipts: w.receipts[id], Records: w.reads[id],
		Actions: w.Events[start:],
	}
	for _, p := range w.Plots {
		v.Plots = append(v.Plots, PlotView{
			ID: p.ID, Name: p.Name, Capacity: p.Capacity, Stock: &p.Stock, Weather: p.Weather,
			Regeneration: p.Regeneration, Government: p.Government, Residents: p.Residents,
			Roles: p.Roles, Rules: p.Rules, CropEvent: p.CropEvent, AidNeeded: p.AidNeeded,
			HarvestOrder: p.HarvestOrder,
		})
	}
	return v
}
func (w *World) View(id int) Observation {
	return detachView(w.rawView(id))
}

func detachView(v Observation) Observation {
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
		out[a.ID] = w.decide(a, phase)
	}
	return out
}

func (w *World) decide(a *Agent, phase string) Decision {
	v := w.rawView(a.ID)
	if w.Deciders[a.ID] != nil {
		v = detachView(v)
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
		} else if w.Teams[a.Team].StrategyID != "" {
			d = Decision{Error: "Uploaded strategy is unavailable"}
		} else {
			d = builtinDecision(v, w.Teams[a.Team])
		}
	}()
	if time.Since(start) > time.Duration(w.Settings.DecisionMS)*time.Millisecond && w.Deciders[a.ID] != nil && d.Error == "" {
		d = Decision{Error: "Agent exceeded its decision time budget"}
	}
	if d.Error != "" {
		a.Error = d.Error
		w.reject(a, d.Error)
		return Decision{}
	}
	a.Error = ""
	if len(d.Memory) > 0 {
		if len(d.Memory) <= w.Settings.MemoryBytes && json.Valid(d.Memory) {
			a.Memory = append(json.RawMessage{}, d.Memory...)
		} else {
			w.reject(a, "Memory update is invalid or exceeds its configured capacity")
		}
	}
	return d
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
	case "exclusions":
		return float64(v.Self.Exclusions)
	case "votingWeight":
		return float64(v.Self.VotingWeight)
	case "votingTokens":
		return float64(v.Self.VotingTokens)
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
		case "placement":
			if len(v.Plots) > 0 {
				p := initialPlot(v)
				d.PlotChoice = &p
			}
		case "harvest_order":
			d.HarvestRanking = b.HarvestRanking
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
			balance := v.Self.VotingTokens
			tokens := max(1, b.VoteTokens)
			for _, p := range v.Proposals {
				if float64(len(d.OrderedVotes)+1)*v.Settings.VoteCost > available(&v.Self)+1e-7 {
					break
				}
				if p.Status == "open" && p.Plot == v.Self.Plot && balance >= tokens && (b.Vote == "yes" || b.Vote == "no") {
					d.OrderedVotes = append(d.OrderedVotes, VoteChoice{Proposal: p.ID, Choice: b.Vote, Tokens: tokens})
					balance -= tokens
				}
			}
		case "eating":
			d.Eat = b.Eat
			d.Think = b.Think
			if b.Think < 0 {
				d.Think = math.Max(0, available(&v.Self)-b.KeepMind)
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

// Saved visual strategies used "movement" for both initial placement and subsequent
// travel. Reuse a valid destination only at reset, when a plot choice is meaningful.
func (b *Builder) UnmarshalJSON(data []byte) error {
	type current Builder
	var saved struct {
		current
		Migrate json.RawMessage `json:"migrate"`
		Rules   []struct {
			BehaviorRule
			Action struct {
				Decision
				Move *int `json:"move"`
			} `json:"action"`
		} `json:"rules"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&saved); err != nil {
		return err
	}
	*b = Builder(saved.current)
	for _, row := range saved.Rules {
		rule := row.BehaviorRule
		rule.Action = row.Action.Decision
		if rule.Phase == "movement" {
			rule.Phase = "placement"
			if oldPlot := row.Action.Move; oldPlot != nil && *oldPlot >= 0 {
				rule.Action.PlotChoice = oldPlot
			}
		} else if row.Action.Move != nil {
			return fmt.Errorf("plot choice is available only at monthly placement")
		}
		switch rule.Field {
		case "deaths":
			rule.Field = "exclusions"
		case "influence":
			rule.Field = "votingWeight"
		}
		b.Rules = append(b.Rules, rule)
	}
	return nil
}
