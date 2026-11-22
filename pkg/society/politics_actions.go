package society

import (
	"errors"
	"fmt"
	"sort"
)

func (w *World) HarvestQuota(a *Agent) int {
	if a != nil {
		if plot := w.govPlot(a.Plot); plot != nil && plot.Government {
			if rule := plot.Rules["quota"]; rule.Mode == "limited" {
				return int(rule.Amount)
			}
		}
	}
	return -1
}

// A receipt comes from the harvest engine. No decision can manufacture a breach.
func (w *World) capturePoliticalEvidence(e Event) {
	if e.Kind == "ration_breach" && e.Amount > 0 {
		w.politicalState().Evidence[e.ID] = evidenceRecord{Actor: e.Actor, Plot: e.Plot, Amount: int(e.Amount)}
	}
}

func (w *World) validateSanction(actor int, in ProposalInput) error {
	a := w.govAgent(actor)
	if a == nil || !w.holdsRole(actor, "justice") {
		return errors.New("only the current Department of Justice holder can sanction")
	}
	target := w.govAgent(in.Target)
	if target == nil || !target.Alive || target.Plot != a.Plot {
		return errors.New("subject is no longer an active local resident")
	}
	ps := w.politicalState()
	e, ok := ps.Evidence[in.Evidence]
	if !ok || e.Plot != a.Plot || e.Actor != target.ID || ps.Sanctioned[in.Evidence] {
		return errors.New("no open breach receipt for this resident")
	}
	switch in.Sanction {
	case "warning", "lastPlace":
		return nil
	case "fine":
		if in.Amount > 0 && in.Amount <= e.Amount {
			return nil
		}
		return errors.New("fine must be positive and at most the recorded excess")
	default:
		return errors.New("unknown sanction")
	}
}

func (w *World) queuedSanction(evidence int) bool {
	for _, item := range w.Pending {
		if item.Input.Kind == "sanction" && item.Input.Evidence == evidence {
			return true
		}
	}
	return false
}

func (w *World) justicePhase(decisions map[int]Decision) {
	for _, a := range w.Agents {
		if !a.Alive {
			continue
		}
		for _, order := range decisions[a.ID].Orders {
			if order.Kind != "sanction" {
				w.event("order_rejected", a.ID, a.Plot, "Unknown department order", 0)
				continue
			}
			in := ProposalInput{Kind: order.Kind, Target: order.Target, Sanction: order.Sanction, Evidence: order.Evidence, Amount: order.Amount}
			if err := w.validateSanction(a.ID, in); err != nil {
				w.event("order_rejected", a.ID, a.Plot, err.Error(), 0)
				continue
			}
			if w.queuedSanction(in.Evidence) {
				w.event("order_rejected", a.ID, a.Plot, "This breach already has a pending sanction", 0)
				continue
			}
			if !spend(a, w.Settings.JusticeCost) {
				w.event("order_rejected", a.ID, a.Plot, "Insufficient unpledged mind", 0)
				continue
			}
			w.Pending = append(w.Pending, Pending{ID: fmt.Sprintf("justice/%d/%d", w.AbsoluteDay, in.Evidence), At: w.AbsoluteDay + 1, Actor: a.ID, Plot: a.Plot, Input: in})
			w.event("justice_order", a.ID, a.Plot, fmt.Sprintf("%s scheduled for breach %d", title(in), in.Evidence), 0)
		}
	}
}

func (w *World) applySanction(item Pending) error {
	in := item.Input
	if err := w.validateSanction(item.Actor, in); err != nil {
		return err
	}
	target := w.govAgent(in.Target)
	amount := 0
	switch in.Sanction {
	case "fine":
		amount = min(in.Amount, target.Food)
		target.Food -= amount
	case "lastPlace":
		target.LastPlaceUntil = w.AbsoluteDay
	}
	w.politicalState().Sanctioned[in.Evidence] = true
	w.event("sanction_applied", target.ID, item.Plot, fmt.Sprintf("Justice applied %s for breach %d", in.Sanction, in.Evidence), float64(amount))
	return nil
}

func (w *World) SanctionCases(actor int) []SanctionCase {
	if !w.holdsRole(actor, "justice") {
		return nil
	}
	ps := w.politicalState()
	plot := w.govAgent(actor).Plot
	var out []SanctionCase
	for id, e := range ps.Evidence {
		if e.Plot != plot || ps.Sanctioned[id] || w.queuedSanction(id) {
			continue
		}
		target := w.govAgent(e.Actor)
		if target != nil && target.Alive && target.Plot == plot {
			out = append(out, SanctionCase{Evidence: id, Target: e.Actor, Amount: e.Amount})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Evidence < out[j].Evidence })
	return out
}
