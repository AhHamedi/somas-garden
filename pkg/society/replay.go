package society

import "encoding/json"

func (w *World) Snapshot() Snapshot {
	w.updateResidents()
	s := Snapshot{Pending: append([]Pending{}, w.Pending...), Version: 5, Seed: w.Seed, Settings: w.Settings, Teams: w.Teams, Month: w.Month, Day: w.Day, AbsoluteDay: w.AbsoluteDay, Phase: w.Phase, Done: w.Done, Meteor: w.Meteor, Agents: w.Agents, Plots: w.Plots, Federations: w.Federations, Proposals: w.Proposals, Events: append([]Event{}, w.Events[w.eventStart:]...), Months: w.Months, Stats: Stats{Population: len(w.Agents)}}
	for _, a := range w.Agents {
		if a.Alive {
			s.Stats.Alive++
		}
		s.Stats.Stored += a.Food
		s.Stats.Satisfaction += a.Score
		s.Stats.Deaths += a.Deaths
	}
	for _, p := range w.Plots {
		s.Stats.Food += p.Stock
		s.Stats.Stored += p.Reserve
		if p.Government {
			s.Stats.Governments++
		}
	}
	for _, f := range w.Federations {
		if !f.Dissolved {
			s.Stats.Federations++
		}
	}
	b, _ := json.Marshal(s)
	var copy Snapshot
	_ = json.Unmarshal(b, &copy)
	return copy
}
