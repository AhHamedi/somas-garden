package society

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
)

var Phases = []string{"environment", "harvest_order", "harvest", "proposals", "voting", "transfers", "eating", "close"}

func New(settings Settings, teams []Team, seed int64) (*World, error) {
	if len(teams) == 0 {
		teams = DefaultTeams()
	}
	if err := settings.Validate(len(teams)); err != nil {
		return nil, err
	}
	for i := range teams {
		if teams[i].Name == "" {
			teams[i].Name = fmt.Sprintf("Team %d", i+1)
		}
		if len(teams[i].Name) > 80 {
			return nil, fmt.Errorf("team names must be short")
		}
		if teams[i].Policy == "" {
			teams[i].Policy = "warden"
		}
		teams[i].Policy = canonicalPolicy(teams[i].Policy)
		if b := teams[i].Builder; b != nil && b.Fallback != "" {
			b.Fallback = canonicalPolicy(b.Fallback)
		}
		if err := settings.validateTeam(teams[i]); err != nil {
			return nil, err
		}
	}
	w := &World{Settings: settings, Teams: teams, Seed: seed, Month: 1, Day: 1, AbsoluteDay: 1, Phase: "ready", Deciders: map[int]Decider{}, receipts: map[int][]Event{}, reads: map[int][]Event{}}
	for t := range teams {
		for n := 0; n < settings.Copies; n++ {
			id := len(w.Agents)
			w.Agents = append(w.Agents, &Agent{ID: id, Team: t, Name: fmt.Sprintf("%s %02d", teams[t].Name, n+1), Memory: json.RawMessage(`{}`)})
		}
	}
	w.resetMonth()
	return w, nil
}
func (w *World) resetMonth() {
	// Historical observer frames are persisted by the host before the next step.
	// No live receipts, records or political evidence cross a meteor boundary.
	w.Events = nil
	w.eventStart = 0
	w.recordCursors = map[string]*recordCursor{}
	w.recordPages = map[int][]RecordPage{}
	w.rng, w.rngSource = newCountedRandom(w.Seed + int64(w.Month)*0x27d4eb2d)
	w.weather = nil
	w.weatherSources = nil
	w.Plots = nil
	w.Proposals = []*Proposal{}
	w.Pending = nil
	w.political = nil
	w.reads = map[int][]Event{}
	w.receipts = map[int][]Event{}
	weights := []float64{.8, 1, 1.2}
	sum := 0.
	for i := 0; i < w.Settings.Plots; i++ {
		sum += weights[i%3]
	}
	total := len(w.Agents) * w.Settings.CapacityPerAgent
	caps := make([]int, w.Settings.Plots)
	rem := make([]float64, w.Settings.Plots)
	used := 0
	for i := range caps {
		x := float64(total) * weights[i%3] / sum
		caps[i] = int(math.Floor(x))
		rem[i] = x - float64(caps[i])
		used += caps[i]
	}
	idx := make([]int, len(caps))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(i, j int) bool { return rem[idx[i]] > rem[idx[j]] })
	for i := 0; i < total-used; i++ {
		caps[idx[i%len(idx)]]++
	}
	for i, k := range caps {
		r, source := newCountedRandom(w.Seed ^ int64((w.Month*104729)+(i+1)*7919))
		weather := r.Intn(3)
		w.weather = append(w.weather, r)
		w.weatherSources = append(w.weatherSources, source)
		w.Plots = append(w.Plots, &Plot{ID: i, Name: fmt.Sprintf("Plot %c", 'A'+i), Capacity: k, Stock: int(float64(k) * w.Settings.StartingStock), Weather: weather, Regeneration: w.Settings.WeatherRates[weather], Rules: map[string]Rule{}, Roles: map[string]int{}, Residents: []int{}})
	}
	for _, a := range w.Agents {
		memory := a.Memory
		id, t, name := a.ID, a.Team, a.Name
		*a = Agent{ID: id, Team: t, Name: name, Plot: -1, Alive: true, Body: w.Settings.BodyCapacity, Mind: w.Settings.StartingMind, Memory: memory, Pledges: map[string]float64{}}
	}
}
func (w *World) Step() error {
	if w.Done {
		return nil
	}
	if w.phaseIndex == 0 && w.advance {
		w.AbsoluteDay++
		if w.Day == w.Settings.Days {
			w.Month++
			w.Day = 1
			w.resetMonth()
		} else {
			w.Day++
		}
		w.advance = false
	}
	w.Meteor = false
	w.eventStart = len(w.Events)
	w.Phase = Phases[w.phaseIndex]
	switch w.Phase {
	case "environment":
		w.environment()
	case "harvest_order":
		w.rankHarvest(w.decisions("harvest_order"))
	case "harvest":
		w.harvest(w.decisions("harvest"))
	case "proposals":
		prep := w.decisions("pledges")
		w.pledgePhase(prep)
		w.recordsPhase()
		w.governancePhase(w.decisions("proposals"))
	case "voting":
		w.freezeBallots()
		w.votingPhase(w.decisions("voting"))
	case "transfers":
		w.transfers()
	case "eating":
		w.eating(w.decisions("eating"))
	case "close":
		w.closeDay()
	}
	w.updateResidents()
	w.phaseIndex = (w.phaseIndex + 1) % len(Phases)
	return nil
}

// rangeOrdered is a sorted slice iterator substitute used to retain deterministic requests.
func rangeOrdered(m map[int]Decision) []indexedDecision {
	out := make([]indexedDecision, 0, len(m))
	for i, d := range m {
		out = append(out, indexedDecision{i, d})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].id < out[j].id })
	return out
}

type indexedDecision struct {
	id int
	d  Decision
}

func (w *World) environment() {
	if w.Day == 1 {
		w.place(w.decisions("placement"))
		w.updateResidents()
	}
	w.policyBoundary()
	w.grantVotingTokens()
	for _, a := range w.Agents {
		a.Harvested, a.Eaten = 0, 0
	}
	if w.Day > 1 {
		for i, p := range w.Plots {
			r := w.weather[i]
			if r.Float64() > w.Settings.WeatherPersistence {
				p.Weather = (p.Weather + 1 + r.Intn(2)) % 3
			}
			p.Regeneration = w.Settings.WeatherRates[p.Weather]
		}
		for _, a := range w.Agents {
			if a.Alive && a.Plot >= 0 {
				rate := w.Plots[a.Plot].Regeneration
				a.Mind = roundMind(math.Min(w.Settings.MindCapacity, a.Mind+rate))
			}
		}
	}
	for _, p := range w.Plots {
		n := len(p.Residents)
		if p.Stock <= 0 {
			p.GrowthRemainder = 0
			w.cropEvent(p)
			continue
		}
		if n == 0 {
			w.cropEvent(p)
			continue
		}
		if w.Settings.ProductiveCapacity > 0 {
			// Retain the exact arithmetic order used by older checkpoints.
			p.GrowthRemainder += w.Settings.Growth * math.Min(float64(n), float64(p.Capacity)/w.Settings.ProductiveCapacity) * float64(p.Stock) / float64(p.Capacity)
		} else {
			// Use hundredths so repeated fractional days never lose a whole carrot to rounding.
			hundredths := p.Stock*w.Settings.DailyGrowthPercent + int(math.Round(p.GrowthRemainder*100))
			p.GrowthRemainder = float64(hundredths) / 100
		}
		grown := min(p.Capacity-p.Stock, int(p.GrowthRemainder))
		p.Stock += grown
		p.GrowthRemainder -= float64(grown)
		if p.Stock == p.Capacity {
			p.GrowthRemainder = 0
		}
		if grown > 0 {
			w.event("growth", -1, p.ID, fmt.Sprintf("%d carrots grew in the field", grown), float64(grown))
		}
		w.cropEvent(p)
	}
}
func (w *World) closeDay() {
	for _, a := range w.Agents {
		if a.Alive {
			a.ActiveDays++
		}
	}
	w.decisions("close")
	if w.Day == w.Settings.Days {
		w.decisions("month_end")
		result := MonthlyResult{Month: w.Month, Scores: make([]float64, len(w.Agents)), Teams: make([]TeamResult, len(w.Teams))}
		for i, t := range w.Teams {
			result.Teams[i] = TeamResult{Team: i, Name: t.Name}
		}
		for _, a := range w.Agents {
			result.Scores[a.ID] = a.Score
			result.Teams[a.Team].Score += a.Score
			result.Teams[a.Team].Exclusions += a.Exclusions
			result.Exclusions += a.Exclusions
		}
		for i := range result.Teams {
			result.Teams[i].Mean = result.Teams[i].Score / float64(w.Settings.Copies)
		}
		w.Months = append(w.Months, result)
		for _, proposal := range w.Proposals {
			if has([]string{"scheduled", "approved", "open", "passed"}, proposal.Status) {
				proposal.Status = "cancelled"
				proposal.Reason = "Meteor reset before activation"
			}
		}
		w.Pending = nil
		w.recordCursors = map[string]*recordCursor{}
		w.recordPages = map[int][]RecordPage{}
		w.reads = map[int][]Event{}
		w.Meteor = true
		w.event("meteor", -1, -1, "The month closes. Only private memories cross the reset.", 0)
		if w.Month == w.Settings.Months {
			w.Done = true
			return
		}
		w.advance = true
	} else {
		w.advance = true
	}
}
func (w *World) residents(plot int) []*Agent {
	r := []*Agent{}
	for _, a := range w.Agents {
		if a.Alive && a.Plot == plot {
			r = append(r, a)
		}
	}
	return r
}
func (w *World) updateResidents() {
	for _, p := range w.Plots {
		p.Residents = p.Residents[:0]
	}
	for _, a := range w.Agents {
		if a.Alive && a.Plot >= 0 {
			p := w.Plots[a.Plot]
			p.Residents = append(p.Residents, a.ID)
		}
	}
}
func available(a *Agent) float64 {
	v := a.Mind
	for _, p := range a.Pledges {
		v -= p
	}
	return math.Max(0, roundMind(v))
}
func spend(a *Agent, cost float64) bool {
	if cost < 0 || math.IsNaN(cost) || math.IsInf(cost, 0) || available(a)+1e-7 < cost {
		return false
	}
	a.Mind = roundMind(a.Mind - cost)
	a.PoliticalMind = roundMind(a.PoliticalMind + cost)
	return true
}
func roundMind(x float64) float64 { return math.Round(x*1e6) / 1e6 }
func (w *World) event(kind string, actor, plot int, message string, amount float64, members ...int) Event {
	w.nextEvent++
	e := Event{ID: w.nextEvent, Month: w.Month, Day: w.Day, AbsoluteDay: w.AbsoluteDay, Phase: w.Phase, Kind: kind, Actor: actor, Plot: plot, Message: message, Amount: amount, Target: -1, Members: append([]int(nil), members...), Breach: kind == "ration_breach"}
	if len(members) == 1 && (kind == "gift" || kind == "donation" || kind == "received") {
		e.Target = members[0]
	}
	if actor >= 0 && actor < len(w.Agents) {
		a := w.Agents[actor]
		e.Food = a.Food
		e.Mind = a.Mind
		a.LastResult = message
	}
	e.Recorded = plot >= 0 && plot < len(w.Plots)
	w.capturePoliticalEvidence(e)
	w.Events = append(w.Events, e)
	if actor >= 0 {
		w.receipts[actor] = append(w.receipts[actor], e)
		if len(w.receipts[actor]) > 100 {
			w.receipts[actor] = w.receipts[actor][len(w.receipts[actor])-100:]
		}
	}
	if e.Recorded {
		w.Plots[plot].Records = append(w.Plots[plot].Records, e)
	}
	return e
}
func (w *World) reject(a *Agent, message string) { w.event("rejected", a.ID, a.Plot, message, 0) }
func (w *World) pledgePhase(ds map[int]Decision) {
	for _, item := range rangeOrdered(ds) {
		w.setPledges(w.Agents[item.id], item.d.Pledge)
	}
}
