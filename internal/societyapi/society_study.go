package handler

// Study data for the Results view, derived from saved frames. Summaries of
// completed days, votes and months never change, so they are cached per run.
import (
	"encoding/json"

	"selforg-garden/pkg/society"
)

type studyCache struct {
	days    map[int]*society.StudyDay
	motions map[int][]society.StudyMotion
	months  map[int]*society.StudyAgents
}

func (s *societyRun) snapshotAt(i int) (*society.Snapshot, error) {
	b, e := readFrame(s.ID, i)
	if e != nil {
		return nil, e
	}
	snap := new(society.Snapshot)
	if err := json.Unmarshal(b, snap); err != nil {
		return nil, err
	}
	if snap.Version < 6 {
		var old struct {
			Agents []struct {
				Deaths    int `json:"deaths"`
				Influence int `json:"influence"`
			}
		}
		if err := json.Unmarshal(b, &old); err != nil {
			return nil, err
		}
		for i, a := range old.Agents {
			snap.Agents[i].Exclusions = a.Deaths
			snap.Agents[i].VotingWeight = a.Influence
		}
	}
	return snap, nil
}

// study summarises the run up to and including frame upto: every nightfall,
// every decided vote and each month's totals. The month in progress is
// summarised at frame upto itself, so nothing beyond it is revealed.
func (s *societyRun) study(upto int) (map[string]any, error) {
	if s.studyData == nil {
		s.studyData = &studyCache{map[int]*society.StudyDay{}, map[int][]society.StudyMotion{}, map[int]*society.StudyAgents{}}
	}
	c := s.studyData
	if upto >= len(s.Frames) {
		upto = len(s.Frames) - 1
	}
	days := []society.StudyDay{}
	motions := []society.StudyMotion{}
	lastOfMonth := map[int]int{}
	order := []int{}
	var prev *society.StudyDay
	for i := 0; i <= upto; i++ {
		f := s.Frames[i]
		if f.Month > 0 {
			if _, seen := lastOfMonth[f.Month]; !seen {
				order = append(order, f.Month)
			}
			lastOfMonth[f.Month] = i
		}
		switch f.Phase {
		case "close":
			d := c.days[i]
			if d == nil {
				snap, e := s.snapshotAt(i)
				if e != nil {
					return nil, e
				}
				summary := society.SummariseDay(snap, i, prev)
				d = &summary
				c.days[i] = d
			}
			prev = d
			days = append(days, *d)
		case "voting":
			ms, ok := c.motions[i]
			if !ok {
				snap, e := s.snapshotAt(i)
				if e != nil {
					return nil, e
				}
				ms = society.SummariseMotions(snap)
				c.motions[i] = ms
			}
			motions = append(motions, ms...)
		}
	}
	months := []*society.StudyAgents{}
	var teams []int
	var names []string
	for _, m := range order {
		i := lastOfMonth[m]
		a := c.months[i]
		if a == nil {
			snap, e := s.snapshotAt(i)
			if e != nil {
				return nil, e
			}
			summary := society.SummariseAgents(snap, i)
			a = &summary
			if s.Frames[i].Meteor {
				c.months[i] = a
			}
			if teams == nil {
				for _, ag := range snap.Agents {
					teams = append(teams, ag.Team)
					names = append(names, ag.Name)
				}
			}
		}
		months = append(months, a)
	}
	if teams == nil && upto >= 0 {
		if snap, e := s.snapshotAt(upto); e == nil {
			for _, ag := range snap.Agents {
				teams = append(teams, ag.Team)
				names = append(names, ag.Name)
			}
		}
	}
	return map[string]any{"frame": upto, "days": days, "motions": motions, "months": months, "agentTeams": teams, "agentNames": names}, nil
}
