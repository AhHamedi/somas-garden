package society

import (
	"math"
	"sort"
	"strings"
)

// Study records are compact summaries of saved observer frames for analysis.
// They are derived only from snapshots, never from live engine state, so a
// saved replay and a running world produce identical study data.

// StudyDay summarises the state at nightfall of one day.
type StudyDay struct {
	Frame       int         `json:"frame"`
	Month       int         `json:"month"`
	Day         int         `json:"day"`
	Abs         int         `json:"abs"`
	Teams       []StudyTeam `json:"teams"`
	Plots       []StudyPlot `json:"plots"`
	Gini        float64     `json:"gini"`
	Moves       int         `json:"moves"`
	Deaths      int         `json:"deaths"`
	Harvest     int         `json:"harvest"`
	Eaten       int         `json:"eaten"`
	Field       int         `json:"field"`
	Treasury    int         `json:"treasury"`
	Held        int         `json:"held"`
	Governments int         `json:"governments"`
	Federations int         `json:"federations"`
	plots       []int
	deaths      []int
}

// StudyTeam holds one team's means for a day. Satisfaction, thought and
// political spending are cumulative within the month; harvest and eating are
// that day's amounts. Means over every member unless stated.
type StudyTeam struct {
	Alive     int     `json:"alive"`
	Wilds     int     `json:"wilds"`
	Score     float64 `json:"score"`
	Thought   float64 `json:"thought"`
	Politics  float64 `json:"politics"`
	Harvested float64 `json:"harvested"`
	Eaten     float64 `json:"eaten"`
	Held      float64 `json:"held"`      // living members
	Mind      float64 `json:"mind"`      // living members
	Influence float64 `json:"influence"` // living members
	Officers  int     `json:"officers"`
	Deaths    int     `json:"deaths"` // died that day
	Moves     int     `json:"moves"`  // changed plot that day
}

// StudyPlot is one plot at nightfall.
type StudyPlot struct {
	Residents  int      `json:"residents"`
	Stock      int      `json:"stock"`
	Capacity   int      `json:"capacity"`
	Reserve    int      `json:"reserve"`
	Government bool     `json:"government"`
	Federation int      `json:"federation"`
	Laws       []string `json:"laws"`
	Score      float64  `json:"score"`
	Weather    int      `json:"weather"`
	Teams      []int    `json:"teams"`
}

// StudyAgents holds each Amoeboid's month-to-date totals at one frame.
type StudyAgents struct {
	Frame     int       `json:"frame"`
	Month     int       `json:"month"`
	Day       int       `json:"day"`
	Complete  bool      `json:"complete"`
	Score     []float64 `json:"score"`
	Thought   []float64 `json:"thought"`
	Politics  []float64 `json:"politics"`
	Eaten     []int     `json:"eaten"`
	Harvested []int     `json:"harvested"`
	Deaths    []int     `json:"deaths"`
	Active    []int     `json:"active"`
	Alive     []bool    `json:"alive"`
	Influence []int     `json:"influence"`
	Office    []bool    `json:"office"`
}

// StudyMotion is one motion as decided, with votes counted by team.
type StudyMotion struct {
	ID          string `json:"id"`
	Month       int    `json:"month"`
	Created     int    `json:"created"`
	Abs         int    `json:"abs"`
	Plot        int    `json:"plot"`
	Federation  int    `json:"federation"`
	Kind        string `json:"kind"`
	Key         string `json:"key,omitempty"`
	Mode        string `json:"mode,omitempty"`
	Status      string `json:"status"`
	Yes         int    `json:"yes"`
	No          int    `json:"no"`
	Abstain     int    `json:"abstain"`
	Total       int    `json:"total"`
	Threshold   string `json:"threshold"`
	Electorate  int    `json:"electorate"`
	Author      int    `json:"author"`
	AuthorTeam  int    `json:"authorTeam"`
	TeamYes     []int  `json:"teamYes"`
	TeamNo      []int  `json:"teamNo"`
	TeamAbstain []int  `json:"teamAbstain"`
	PlotYes     int    `json:"plotYes"`
	PlotNo      int    `json:"plotNo"`
}

// LawKey returns the law a rule key belongs to: "quota:12" is a quota.
func LawKey(key string) string {
	if i := strings.IndexByte(key, ':'); i >= 0 {
		return key[:i]
	}
	return key
}

// Gini returns the Gini coefficient of non-negative values (0 equal, 1 unequal).
func Gini(values []float64) float64 {
	n := len(values)
	if n == 0 {
		return 0
	}
	x := append([]float64{}, values...)
	sort.Float64s(x)
	sum, weighted := 0., 0.
	for i, v := range x {
		v = math.Max(0, v)
		sum += v
		weighted += float64(i+1) * v
	}
	if sum == 0 {
		return 0
	}
	return (2*weighted)/(float64(n)*sum) - float64(n+1)/float64(n)
}

func round(x float64, places int) float64 {
	p := math.Pow(10, float64(places))
	return math.Round(x*p) / p
}

// SummariseDay derives a day record from a nightfall snapshot. prev is the
// previous nightfall's record; on a month's first day, or with no record,
// everyone starts the day in the wilds with no deaths.
func SummariseDay(s *Snapshot, frame int, prev *StudyDay) StudyDay {
	teams := len(s.Teams)
	d := StudyDay{Frame: frame, Month: s.Month, Day: s.Day, Abs: s.AbsoluteDay, Teams: make([]StudyTeam, teams), Plots: make([]StudyPlot, len(s.Plots)), plots: make([]int, len(s.Agents)), deaths: make([]int, len(s.Agents))}
	if prev != nil && prev.Month != s.Month {
		prev = nil
	}
	members := make([]int, teams)
	living := make([]int, teams)
	officers := map[int]bool{}
	for _, p := range s.Plots {
		for id := range p.Officers {
			officers[id] = true
		}
	}
	scores := make([]float64, len(s.Agents))
	for i, a := range s.Agents {
		t := &d.Teams[a.Team]
		members[a.Team]++
		scores[i] = a.Score
		d.plots[i] = a.Plot
		d.deaths[i] = a.Deaths
		t.Score += a.Score
		t.Thought += a.Thought
		t.Politics += a.PoliticalMind
		t.Harvested += float64(a.Harvested)
		t.Eaten += float64(a.Eaten)
		d.Harvest += a.Harvested
		d.Eaten += a.Eaten
		before, died := -1, 0
		if prev != nil && i < len(prev.plots) {
			before, died = prev.plots[i], prev.deaths[i]
		}
		if n := a.Deaths - died; n > 0 {
			t.Deaths += n
			d.Deaths += n
		}
		if a.Alive {
			living[a.Team]++
			t.Alive++
			t.Held += float64(a.Food)
			t.Mind += a.Mind
			t.Influence += float64(a.Influence)
			d.Held += a.Food
			if a.Plot < 0 {
				t.Wilds++
			}
			if a.Plot != before {
				t.Moves++
				d.Moves++
			}
			if officers[a.ID] {
				t.Officers++
			}
		}
	}
	for i := range d.Teams {
		t := &d.Teams[i]
		if m := float64(members[i]); m > 0 {
			t.Score = round(t.Score/m, 4)
			t.Thought = round(t.Thought/m, 4)
			t.Politics = round(t.Politics/m, 4)
			t.Harvested = round(t.Harvested/m, 4)
			t.Eaten = round(t.Eaten/m, 4)
		}
		if l := float64(living[i]); l > 0 {
			t.Held = round(t.Held/l, 4)
			t.Mind = round(t.Mind/l, 4)
			t.Influence = round(t.Influence/l, 4)
		}
	}
	for i, p := range s.Plots {
		sp := StudyPlot{Stock: p.Stock, Capacity: p.Capacity, Reserve: p.Reserve, Government: p.Government, Federation: p.Federation, Weather: p.Weather, Teams: make([]int, teams), Laws: []string{}}
		seen := map[string]bool{}
		for k := range p.Rules {
			if base := LawKey(k); !seen[base] {
				seen[base] = true
				sp.Laws = append(sp.Laws, base)
			}
		}
		if len(p.Officers) > 0 && !seen["office"] {
			sp.Laws = append(sp.Laws, "office")
		}
		sort.Strings(sp.Laws)
		sum := 0.
		for _, id := range p.Residents {
			if id >= 0 && id < len(s.Agents) {
				a := s.Agents[id]
				sp.Teams[a.Team]++
				sum += a.Score
			}
		}
		sp.Residents = len(p.Residents)
		if sp.Residents > 0 {
			sp.Score = round(sum/float64(sp.Residents), 4)
		}
		d.Field += p.Stock
		d.Treasury += p.Reserve
		if p.Government {
			d.Governments++
		}
		d.Plots[i] = sp
	}
	for _, f := range s.Federations {
		if !f.Dissolved {
			d.Federations++
		}
	}
	d.Gini = round(Gini(scores), 4)
	return d
}

// SummariseAgents records every Amoeboid's month-to-date totals.
func SummariseAgents(s *Snapshot, frame int) StudyAgents {
	n := len(s.Agents)
	out := StudyAgents{Frame: frame, Month: s.Month, Day: s.Day, Complete: s.Meteor, Score: make([]float64, n), Thought: make([]float64, n), Politics: make([]float64, n), Eaten: make([]int, n), Harvested: make([]int, n), Deaths: make([]int, n), Active: make([]int, n), Alive: make([]bool, n), Influence: make([]int, n), Office: make([]bool, n)}
	for _, p := range s.Plots {
		for id := range p.Officers {
			if id >= 0 && id < n {
				out.Office[id] = true
			}
		}
	}
	for i, a := range s.Agents {
		out.Score[i] = round(a.Score, 4)
		out.Thought[i] = round(a.Thought, 4)
		out.Politics[i] = round(a.PoliticalMind, 4)
		out.Eaten[i] = a.TotalEaten
		out.Harvested[i] = a.TotalHarvested
		out.Deaths[i] = a.Deaths
		out.Active[i] = a.ActiveDays
		out.Alive[i] = a.Alive
		out.Influence[i] = a.Influence
	}
	return out
}

// SummariseMotions records the motions decided on the snapshot's day. Use the
// frame straight after the vote, before a meteor cancels pending changes.
func SummariseMotions(s *Snapshot) []StudyMotion {
	teams := len(s.Teams)
	out := []StudyMotion{}
	for _, p := range s.Proposals {
		if p.Closes != s.AbsoluteDay || p.Status == "open" {
			continue
		}
		m := StudyMotion{ID: p.ID, Month: s.Month, Created: p.Created, Abs: p.Closes, Plot: p.Plot, Federation: p.Federation, Kind: p.Input.Kind, Key: LawKey(p.Input.Key), Mode: p.Input.Rule.Mode, Status: p.Status, Yes: p.Yes, No: p.No, Abstain: p.Abstain, Total: p.Total, Threshold: p.Threshold, Electorate: len(p.Electorate), Author: p.Author, AuthorTeam: -1, TeamYes: make([]int, teams), TeamNo: make([]int, teams), TeamAbstain: make([]int, teams)}
		if p.Author >= 0 && p.Author < len(s.Agents) {
			m.AuthorTeam = s.Agents[p.Author].Team
		}
		for id, v := range p.Votes {
			if id < 0 || id >= len(s.Agents) {
				continue
			}
			t := s.Agents[id].Team
			switch v {
			case "yes":
				m.TeamYes[t]++
			case "no":
				m.TeamNo[t]++
			default:
				m.TeamAbstain[t]++
			}
		}
		for _, v := range p.PlotVotes {
			if v == "yes" {
				m.PlotYes++
			} else if v == "no" {
				m.PlotNo++
			}
		}
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}
