package society

import (
	"fmt"
	"math"
	"sort"
)

// MaxContributionWindow is the longest look-back the influence basis law may
// use, and how many completed days of contributions a plot keeps.
const MaxContributionWindow = 10

// ContributionDay is one resident's net giving to their plot on one day:
// carrots deposited into the treasury, storage tax and excess holdings
// collected from them, pledged mind spent on the plot's services, and carrots
// they received from the treasury.
type ContributionDay struct {
	Agent    int     `json:"agent"`
	Day      int     `json:"day"`
	Deposits int     `json:"deposits,omitempty"`
	Tax      int     `json:"tax,omitempty"`
	Holding  int     `json:"holding,omitempty"`
	Services float64 `json:"services,omitempty"`
	Received int     `json:"received,omitempty"`
}

// Net is the day's contribution in points: one per carrot or unit of mind
// given, less one per carrot received.
func (c ContributionDay) Net() float64 {
	return float64(c.Deposits+c.Tax+c.Holding-c.Received) + c.Services
}

// ContributionTotal is one resident's standing under the influence basis law:
// the totals over the law's window and the resulting points.
type ContributionTotal struct {
	Agent    int     `json:"agent"`
	Deposits int     `json:"deposits,omitempty"`
	Tax      int     `json:"tax,omitempty"`
	Holding  int     `json:"holding,omitempty"`
	Services float64 `json:"services,omitempty"`
	Received int     `json:"received,omitempty"`
	Points   float64 `json:"points"`
}

// contributionBasis reports whether a plot's influence follows contributions,
// and the starting level everyone holds before earning any.
func (w *World) contributionBasis(p *Plot) (Rule, int, bool) {
	if p == nil || !p.Government {
		return Rule{}, 0, false
	}
	r, ok := p.Rules["influenceBasis"]
	switch {
	case !ok:
		return r, 0, false
	case r.Mode == "contribution":
		return r, w.Settings.StartingInfluence, true
	case r.Mode == "contributionOnly":
		return r, 0, true
	}
	return r, 0, false
}

// contributionInfluence turns points into influence: the floor plus one level
// per rate points, up to the configured maximum.
func (w *World) contributionInfluence(r Rule, floor int, points float64) int {
	rate := math.Max(1, r.Amount)
	return min(w.Settings.MaxInfluence, floor+int(math.Floor(points/rate+1e-9)))
}

// contribute adds to a resident's entry for today on the plot they gave to.
func (w *World) contribute(plot, agent int, add func(*ContributionDay)) {
	if plot < 0 || plot >= len(w.Plots) || agent < 0 {
		return
	}
	ps := w.politicalState()
	if ps.Ledger == nil {
		ps.Ledger = map[int][]ContributionDay{}
	}
	rows := ps.Ledger[plot]
	for i := len(rows) - 1; i >= 0 && rows[i].Day == w.AbsoluteDay; i-- {
		if rows[i].Agent == agent {
			add(&rows[i])
			return
		}
	}
	row := ContributionDay{Agent: agent, Day: w.AbsoluteDay}
	add(&row)
	ps.Ledger[plot] = append(rows, row)
}

// forfeitContributions drops a resident's entries when they leave a plot.
func (w *World) forfeitContributions(plot, agent int) {
	if w.political == nil || len(w.political.Ledger[plot]) == 0 {
		return
	}
	rows := w.political.Ledger[plot]
	kept := rows[:0]
	for _, r := range rows {
		if r.Agent != agent {
			kept = append(kept, r)
		}
	}
	w.political.Ledger[plot] = kept
}

// completedContributions lists a plot's entries for the last `days` completed
// days, oldest first. Today's contributions count from tomorrow.
func (w *World) completedContributions(plot, days int) []ContributionDay {
	if w.political == nil || w.political.Ledger == nil {
		return nil
	}
	out := []ContributionDay{}
	for _, r := range w.political.Ledger[plot] {
		if r.Day < w.AbsoluteDay && r.Day >= w.AbsoluteDay-days {
			out = append(out, r)
		}
	}
	return out
}

// contributionTotals sums each resident's entries over the window. Points are
// the window's net, never below zero; a negative day is not discarded.
func (w *World) contributionTotals(p *Plot, window int) []ContributionTotal {
	by := map[int]*ContributionTotal{}
	for _, a := range w.residents(p.ID) {
		by[a.ID] = &ContributionTotal{Agent: a.ID}
	}
	net := map[int]float64{}
	for _, r := range w.completedContributions(p.ID, window) {
		t := by[r.Agent]
		if t == nil {
			continue
		}
		t.Deposits += r.Deposits
		t.Tax += r.Tax
		t.Holding += r.Holding
		t.Services = rounded(t.Services + r.Services)
		t.Received += r.Received
		net[r.Agent] += r.Net()
	}
	out := make([]ContributionTotal, 0, len(by))
	for id, t := range by {
		t.Points = rounded(math.Max(0, net[id]))
		out = append(out, *t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Agent < out[j].Agent })
	return out
}

// recalculateInfluence runs each morning after rule changes apply, so a basis
// adopted today governs today's ballots. It also prunes old entries.
func (w *World) recalculateInfluence() {
	ps := w.politicalState()
	for plot, rows := range ps.Ledger {
		kept := rows[:0]
		for _, r := range rows {
			if r.Day >= w.AbsoluteDay-MaxContributionWindow {
				kept = append(kept, r)
			}
		}
		ps.Ledger[plot] = kept
	}
	for _, p := range w.Plots {
		r, floor, ok := w.contributionBasis(p)
		if !ok {
			p.Contributions = nil
			continue
		}
		totals := w.contributionTotals(p, r.Limit)
		levels := map[int]int{}
		earned := false
		for _, t := range totals {
			levels[t.Agent] = w.contributionInfluence(r, floor, t.Points)
			earned = earned || levels[t.Agent] > 0
		}
		for _, a := range w.residents(p.ID) {
			// With no floor and nobody yet earning a level, everyone keeps the
			// starting influence rather than leaving a plot unable to decide.
			if earned {
				a.Influence = levels[a.ID]
			} else {
				a.Influence = w.Settings.StartingInfluence
			}
		}
		p.Contributions = totals
	}
}

// restoreVotedInfluence returns a plot to individually voted influence: each
// resident's suspended grant if one is on the books, otherwise the start.
func (w *World) restoreVotedInfluence(p *Plot) {
	for _, a := range w.residents(p.ID) {
		a.Influence = w.Settings.StartingInfluence
		if r, ok := p.Rules[fmt.Sprintf("influence:%d", a.ID)]; ok {
			a.Influence = int(r.Amount)
		}
	}
	p.Contributions = nil
}
