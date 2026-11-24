package society

import "encoding/json"

const ReplayVersion = 7

func (w *World) Snapshot() Snapshot {
	w.updateResidents()
	s := Snapshot{Pending: append([]Pending{}, w.Pending...), Version: ReplayVersion, Seed: w.Seed, Settings: w.Settings, Teams: w.Teams, Month: w.Month, Day: w.Day, AbsoluteDay: w.AbsoluteDay, Phase: w.Phase, Done: w.Done, Meteor: w.Meteor, Agents: w.Agents, Plots: w.Plots, Proposals: w.Proposals, Events: append([]Event{}, w.Events[w.eventStart:]...), Months: w.Months, Stats: Stats{Population: len(w.Agents)}}
	if w.legacyRules {
		s.Version = 6
	}
	for _, a := range w.Agents {
		if a.Alive {
			s.Stats.Alive++
		}
		s.Stats.Stored += a.Food
		s.Stats.Satisfaction += a.Score
		s.Stats.Exclusions += a.Exclusions
	}
	for _, p := range w.Plots {
		s.Stats.Food += p.Stock
		if p.Government {
			s.Stats.Governments++
		}
	}
	b, _ := json.Marshal(s)
	var copy Snapshot
	_ = json.Unmarshal(b, &copy)
	return copy
}
