package society

import (
	"errors"
	"sort"
)

// Dissolutions and role changes take effect before Justice can exercise a
// mandate granted yesterday. Resident ballots survive the loss of their author.
func (w *World) policyBoundary() {
	var due, later []Pending
	for _, item := range w.Pending {
		if item.At <= w.AbsoluteDay {
			due = append(due, item)
		} else {
			later = append(later, item)
		}
	}
	w.Pending = later
	priority := func(p Pending) int {
		switch p.Input.Kind {
		case "dissolve":
			return 0
		case "sanction":
			return 2
		default:
			return 1
		}
	}
	sort.SliceStable(due, func(i, j int) bool { return priority(due[i]) < priority(due[j]) })
	for _, item := range due {
		err := w.applyInstitution(item)
		status, reason := "activated", ""
		message := title(item.Input) + " activated"
		if err != nil {
			status, reason = "cancelled", err.Error()
			message = reason
		}
		for _, p := range w.Proposals {
			if p.ID == item.ID {
				p.Status, p.Reason = status, reason
				break
			}
		}
		w.event(status, item.Actor, item.Plot, message, 0)
	}
	w.dissolveEmpty()
}

func (w *World) applyInstitution(item Pending) error {
	in := item.Input
	p := w.govPlot(item.Plot)
	if p == nil {
		return errors.New("plot unavailable")
	}
	if in.Kind == "found" {
		if p.Government || len(w.residents(p.ID)) == 0 {
			return errors.New("plot no longer eligible for founding")
		}
		p.Government = true
		p.Rules = map[string]Rule{}
		p.Roles = map[string]int{}
		return nil
	}
	if !p.Government {
		return errors.New("government dissolved")
	}
	switch in.Kind {
	case "dissolve":
		w.dissolveGovernment(p)
	case "policy":
		if err := validateRule(in.Key, in.Rule); err != nil {
			return err
		}
		p.Rules[in.Key] = in.Rule
	case "repeal":
		delete(p.Rules, in.Key)
	case "elect":
		candidate := w.govAgent(in.Target)
		if candidate == nil || !candidate.Alive || candidate.Plot != p.ID {
			return errors.New("candidate is no longer an active local resident")
		}
		if p.Roles == nil {
			p.Roles = map[string]int{}
		}
		p.Roles[in.Key] = in.Target
	case "revoke":
		if id, ok := p.Roles[in.Key]; !ok || id != in.Target {
			return errors.New("mandate is no longer held by this resident")
		}
		delete(p.Roles, in.Key)
	case "sanction":
		return w.applySanction(item)
	default:
		return errors.New("unknown institutional decision")
	}
	return nil
}

func (w *World) dissolveGovernment(p *Plot) {
	p.Government = false
	// The public action log survives dissolution, but a successor government
	// cannot prosecute breaches under a previous government's mandate.
	ps := w.politicalState()
	for id, e := range ps.Evidence {
		if e.Plot == p.ID {
			delete(ps.Evidence, id)
			delete(ps.Sanctioned, id)
		}
	}
	p.Rules = map[string]Rule{}
	p.Roles = map[string]int{}
	w.releaseFoundingPledges(p.ID)
	w.event("dissolution", -1, p.ID, "Plot government dissolved", 0)
}

func (w *World) dissolveEmpty() {
	for _, p := range w.Plots {
		if p.Government && len(w.residents(p.ID)) == 0 {
			w.dissolveGovernment(p)
		}
	}
}

func (w *World) leaving(a *Agent, plot int) {
	if p := w.govPlot(plot); p != nil {
		for role, id := range p.Roles {
			if id == a.ID {
				delete(p.Roles, role)
			}
		}
	}
	a.Pledges = map[string]float64{}
	a.VotingWeight, a.VotingTokens, a.LastPlaceUntil = 0, 0, 0
	delete(w.politicalState().Aligned, a.ID)
}

// Every active individual may audit every plot's public actions for the month.
func (w *World) recordAccess(actor, plot, subject, from, to int) (*Agent, *Plot, error) {
	if from < 0 || to < 0 || (to > 0 && from > to) || subject < -1 || subject >= len(w.Agents) {
		return nil, nil, errors.New("invalid record query range or subject")
	}
	a, p := w.govAgent(actor), w.govPlot(plot)
	if a == nil || !a.Alive || p == nil {
		return nil, nil, errors.New("records unavailable")
	}
	return a, p, nil
}

func (w *World) ReadRecords(actor, plot, subject, from, to int) ([]Event, error) {
	_, p, err := w.recordAccess(actor, plot, subject, from, to)
	if err != nil {
		return nil, err
	}
	var out []Event
	for _, e := range p.Records {
		if (subject < 0 || e.Actor == subject) && (from == 0 || e.AbsoluteDay >= from) && (to == 0 || e.AbsoluteDay <= to) {
			out = append(out, e)
		}
	}
	return out, nil
}
