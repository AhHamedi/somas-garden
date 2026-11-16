package society

import (
	"errors"
	"fmt"
	"sort"
	"strings"
)

func (w *World) validateEvidence(in ProposalInput, plot int) error {
	a := w.govAgent(in.Target)
	if a == nil || !a.Alive || a.Plot != plot {
		return errors.New("target is no longer a living resident")
	}
	if w.politicalState().Sanctioned[in.Evidence] {
		return errors.New("this event has already been sanctioned")
	}
	permission, exists := w.politicalState().Evidence[in.Evidence]
	if !exists || !has(permission.AllowedSanctions, in.Sanction) {
		return errors.New("this sanction was not enabled when the breach occurred")
	}
	for _, e := range w.Events {
		if e.ID == in.Evidence && e.Month == w.Month {
			if !e.Breach || e.Kind != "ration_breach" || e.Actor != in.Target || e.Plot != plot || e.Amount <= 0 {
				return errors.New("evidence does not establish a ration breach")
			}
			return nil
		}
	}
	return errors.New("unknown evidence receipt")
}

// Snapshot legal consequences at receipt creation, not when a later accusation
// is proposed. Copy the slice so later rule edits cannot rewrite old permissions.
func (w *World) capturePoliticalEvidence(e Event) {
	if e.Kind != "ration_breach" {
		return
	}
	p := w.govPlot(e.Plot)
	if p == nil {
		return
	}
	w.politicalState().Evidence[e.ID] = evidenceRecord{
		Actor: e.Actor, Plot: e.Plot, Day: e.AbsoluteDay, Amount: int(e.Amount),
		Recorded: e.Recorded, AllowedSanctions: append([]string{}, p.Rules["sanctions"].Powers...),
	}
}
func (w *World) validateSanction(a *Agent, in ProposalInput) error {
	if err := w.validateEvidence(in, a.Plot); err != nil {
		return err
	}
	p := w.govPlot(a.Plot)
	if !has(p.Rules["sanctions"].Powers, in.Sanction) {
		return errors.New("sanction is not enabled")
	}
	if in.Amount < 0 {
		return errors.New("negative sanction quantity")
	}
	if in.Sanction == "lastPlace" && in.Amount > 1 {
		return errors.New("last-place sanction exceeds one harvest")
	}
	known := w.politicalState().SharedEvidence[in.Evidence]
	for _, e := range w.Events {
		if e.ID == in.Evidence && e.Actor == a.ID && e.Month == w.Month {
			known = true
		}
	}
	for _, e := range w.reads[a.ID] {
		if e.ID == in.Evidence {
			known = true
		}
	}
	if !known {
		return errors.New("read an authorised record or disclose your own authentic receipt")
	}
	return nil
}

func (w *World) orderAuthority(a *Agent, in ProposalInput) error {
	if a == nil || !a.Alive || a.Plot < 0 {
		return errors.New("officer left or died")
	}
	p := w.govPlot(a.Plot)
	if p == nil || !p.Government {
		return errors.New("government dissolved")
	}
	if in.Kind == "applySanction" {
		s := w.politicalState().Authorizations[in.Authorization]
		if s == nil || s.Plot != a.Plot {
			return errors.New("sanction authorisation unavailable")
		}
		hasOfficer := false
		for id, o := range p.Officers {
			v := w.govAgent(id)
			if v != nil && v.Alive && v.Plot == p.ID && has(o.Powers, "applySanction") {
				hasOfficer = true
			}
		}
		if w.office(a, "applySanction") {
			o := p.Officers[a.ID]
			// Resolve scope from the signed authorisation, never from the
			// caller's target/amount placeholders on an application order.
			if len(o.Members) > 0 && !includes(o.Members, s.Input.Target) {
				return errors.New("sanction target outside officer scope")
			}
			if o.Limit > 0 && s.Input.Amount > o.Limit {
				return errors.New("sanction quantity exceeds officer limit")
			}
			return nil
		}
		if !hasOfficer && s.Author == a.ID {
			return nil
		}
		return errors.New("only the sanctions officer or authorised proposer can apply this sanction")
	}
	power := map[string]string{"distribution": "distribution", "collection": "collection", "permitEntry": "entry", "permitExit": "exit", "directSanction": "sanctions", "sanction": "sanctions", "donation": "donation", "federationFound": "membership", "federationJoin": "membership", "federationLeave": "membership", "ratify": "charter"}[in.Kind]
	if power == "" {
		return errors.New("unknown officer action")
	}
	if !w.office(a, power) {
		return errors.New("required officer power has not been delegated")
	}
	o := p.Officers[a.ID]
	if power == "membership" {
		r := p.Rules["membershipMandate"]
		if r.Mode != "officers" || (len(r.Members) > 0 && !includes(r.Members, a.ID)) {
			return errors.New("membership decisions remain with residents")
		}
	}
	if power == "charter" {
		r := p.Rules["charterMandate"]
		if r.Mode != "officers" || (len(r.Members) > 0 && !includes(r.Members, a.ID)) {
			return errors.New("charter decisions remain with residents")
		}
	}
	if in.Kind == "distribution" {
		targets := in.Members
		if len(targets) == 0 && in.Target >= 0 {
			targets = []int{in.Target}
		}
		if len(targets) == 0 {
			for _, r := range w.residents(p.ID) {
				targets = append(targets, r.ID)
			}
		}
		for _, id := range targets {
			target := w.govAgent(id)
			if target == nil || !target.Alive || target.Plot != p.ID {
				return errors.New("distribution recipient is not a resident")
			}
			if id == a.ID && !o.Self {
				return errors.New("officer may not pay itself")
			}
			if len(o.Members) > 0 && !includes(o.Members, id) {
				return errors.New("recipient outside officer scope")
			}
		}
	}
	if in.Kind == "permitEntry" || in.Kind == "permitExit" || in.Kind == "sanction" || in.Kind == "directSanction" {
		if len(o.Members) > 0 && !includes(o.Members, in.Target) {
			return errors.New("target outside officer scope")
		}
	}
	if in.Amount < 0 {
		return errors.New("negative officer quantity")
	}
	if o.Limit > 0 && in.Amount > o.Limit {
		return errors.New("quantity exceeds officer limit")
	}
	return nil
}

func (w *World) officerPhase(decisions map[int]Decision) {
	ps := w.politicalState()
	for _, a := range w.Agents {
		if !a.Alive {
			continue
		}
		for _, order := range decisions[a.ID].Orders {
			in := ProposalInput{Kind: order.Kind, Target: order.Target, Plot: order.Plot, Amount: order.Amount, Members: order.Members, Evidence: order.Evidence, Source: order.Source, Destination: order.Destination, Sanction: order.Sanction, Authorization: order.Authorization, Federation: order.Federation, Key: order.Key, Rule: order.Rule}
			if err := w.orderAuthority(a, in); err != nil {
				w.politicalEvent("order_rejected", a.ID, a.Plot, err.Error(), 0)
				continue
			}
			if in.Kind == "applySanction" {
				s := ps.Authorizations[in.Authorization]
				if s.Applied || s.Start > w.AbsoluteDay || s.Until < w.AbsoluteDay {
					w.politicalEvent("order_rejected", a.ID, a.Plot, "Sanction authorisation expired or already used", 0)
					continue
				}
				in.Target = s.Input.Target
				in.Evidence = s.Input.Evidence
				in.Sanction = s.Input.Sanction
				in.Amount = s.Input.Amount
			}
			if in.Kind == "sanction" {
				if err := w.validateSanction(a, in); err != nil {
					w.politicalEvent("order_rejected", a.ID, a.Plot, err.Error(), 0)
					continue
				}
				in.Kind = "directSanction"
			} else if in.Kind == "donation" {
				if err := w.validateDonation(a, in, true); err != nil {
					w.politicalEvent("order_rejected", a.ID, a.Plot, err.Error(), 0)
					continue
				}
			} else if in.Kind != "applySanction" && in.Kind != "collection" {
				if err := w.validateProposal(a, in, true); err != nil {
					w.politicalEvent("order_rejected", a.ID, a.Plot, err.Error(), 0)
					continue
				}
			}
			p := w.govPlot(a.Plot)
			o := p.Officers[a.ID]
			usageKey := fmt.Sprintf("%d/%d", w.AbsoluteDay, a.ID)
			if o.Limit > 0 && ps.OrdersUsed[usageKey]+in.Amount > o.Limit {
				w.politicalEvent("order_rejected", a.ID, a.Plot, "Cumulative officer daily limit exceeded", 0)
				continue
			}
			if !w.govSpend(a, w.Settings.OfficerCost) {
				w.politicalEvent("order_rejected", a.ID, a.Plot, "Not enough unpledged mind", 0)
				continue
			}
			ps.OrdersUsed[usageKey] += in.Amount
			if in.Kind == "directSanction" {
				ps.SharedEvidence[in.Evidence] = true
			}
			if in.Kind == "applySanction" {
				ps.Authorizations[in.Authorization].Applied = true
			}
			if in.Kind == "federationFound" {
				members := uniqueInts(in.Members)
				key := canonical(members)
				attempt := ps.Formations[key]
				if attempt == nil {
					attempt = &formationAttempt{Members: members, Approvals: map[int]bool{}, First: w.AbsoluteDay}
					ps.Formations[key] = attempt
				}
				attempt.Approvals[a.Plot] = true
				w.completeFormations()
			} else {
				w.Pending = append(w.Pending, Pending{ID: fmt.Sprintf("order/%d/%d/%d", w.AbsoluteDay, a.ID, len(w.Pending)), At: w.AbsoluteDay + 1, Actor: a.ID, Plot: a.Plot, Federation: in.Federation, Input: in, Officer: true})
			}
			w.politicalEvent("officer_order", a.ID, a.Plot, title(in)+" scheduled for next cycle", w.Settings.OfficerCost)
		}
	}
}

func (w *World) applySanction(p Pending) error {
	i := p.Input
	if err := w.validateEvidence(i, p.Plot); err != nil {
		return err
	}
	plot := w.govPlot(p.Plot)
	if !has(plot.Rules["sanctions"].Powers, i.Sanction) {
		return errors.New("sanction is no longer enabled")
	}
	a := w.govAgent(i.Target)
	amount := 0
	switch i.Sanction {
	case "warning":
	case "fine":
		reserved := 0
		for _, o := range w.Offers {
			if o.From == a.ID {
				reserved += o.Amount
			}
		}
		room := max(0, plot.Capacity-plot.Stock)
		if mode(plot.Rules, "sanctions", "field") == "reserve" {
			room = max(0, plot.ReserveCapacity-plot.Reserve)
		}
		amount = min(i.Amount, max(0, a.Food-reserved), room)
		a.Food -= amount
		if mode(plot.Rules, "sanctions", "field") == "reserve" {
			plot.Reserve += amount
		} else {
			plot.Stock += amount
		}
	case "lastPlace":
		a.LastPlaceUntil = w.AbsoluteDay
		w.politicalState().LastPlace[a.ID] = w.AbsoluteDay
	case "expulsion":
		w.leaving(a, a.Plot)
		a.Plot = -1
	default:
		return errors.New("unknown sanction")
	}
	w.politicalState().Sanctioned[i.Evidence] = true
	w.politicalEvent("sanction_applied", a.ID, p.Plot, fmt.Sprintf("%s applied for recorded ration breach", i.Sanction), float64(amount))
	return nil
}

func (w *World) validateDonation(a *Agent, in ProposalInput, officer bool) error {
	p := w.govPlot(a.Plot)
	target := w.govPlot(in.Target)
	if p == nil || target == nil || p.ID == target.ID || p.Federation < 0 || target.Federation != p.Federation {
		return errors.New("donation requires two member plots in the same federation")
	}
	f := w.govFederation(p.Federation)
	if f == nil || !on(f.Rules["donations"]) {
		return errors.New("federation donations are not enabled")
	}
	if officer && !on(f.Rules["delegation"]) {
		return errors.New("federation has not enabled delegated donations")
	}
	if in.Amount < 0 {
		return errors.New("negative donation")
	}
	if in.Source != "" && in.Source != "field" && in.Source != "reserve" {
		return errors.New("unknown donation source")
	}
	if in.Destination != "" && in.Destination != "field" && in.Destination != "reserve" {
		return errors.New("unknown donation destination")
	}
	return nil
}

func (w *World) donate(p *Plot, in ProposalInput, actor int) error {
	target := w.govPlot(in.Target)
	f := w.govFederation(p.Federation)
	if target == nil || f == nil || target.Federation != f.ID || !f.Funded || !on(f.Rules["donations"]) {
		return errors.New("funded federation donation service unavailable")
	}
	amount := max(0, in.Amount)
	limit := f.Rules["donations"].Limit
	ps := w.politicalState()
	if limit > 0 {
		amount = min(amount, max(0, limit-ps.DonationsUsed[p.ID]))
	}
	stock := p.Stock
	if in.Source == "reserve" {
		stock = p.Reserve
	}
	room := max(0, target.Capacity-target.Stock)
	if in.Destination == "reserve" {
		if !target.Government {
			return errors.New("destination government dissolved")
		}
		room = max(0, target.ReserveCapacity-target.Reserve)
	}
	amount = min(amount, stock, room)
	if in.Source == "reserve" {
		p.Reserve -= amount
	} else {
		p.Stock -= amount
	}
	if in.Destination == "reserve" {
		target.Reserve += amount
	} else {
		target.Stock += amount
	}
	ps.DonationsUsed[p.ID] += amount
	w.politicalEvent("donation", actor, p.ID, fmt.Sprintf("Sent %d carrots to %s", amount, target.Name), float64(amount))
	return nil
}

// Public read-only helpers keep the agent view and resource engine on one policy
// implementation rather than reinterpreting permissions in the interface.
func (w *World) CanShareData(from, to int) bool {
	p, q := w.govPlot(from), w.govPlot(to)
	if p == nil || q == nil || p.Federation < 0 || p.Federation != q.Federation {
		return false
	}
	f := w.govFederation(p.Federation)
	return f != nil && f.Funded && on(f.Rules["data"])
}
func (w *World) CanGift(from, to int) bool {
	a, b := w.govAgent(from), w.govAgent(to)
	if a == nil || b == nil || !a.Alive || !b.Alive {
		return false
	}
	if a.Plot >= 0 && a.Plot == b.Plot {
		return true
	}
	p, q := w.govPlot(a.Plot), w.govPlot(b.Plot)
	if p == nil || q == nil || p.Federation < 0 || p.Federation != q.Federation {
		return false
	}
	f := w.govFederation(p.Federation)
	return f != nil && f.Funded && on(f.Rules["gifts"])
}
func (w *World) HarvestQuota(a *Agent) int {
	if a == nil {
		return -1
	}
	p := w.govPlot(a.Plot)
	if p == nil || !p.Government {
		return -1
	}
	r, ok := p.Rules[fmt.Sprintf("quota:%d", a.ID)]
	if !ok {
		r, ok = p.Rules["quota"]
	}
	if !ok || r.Mode == "unlimited" {
		return -1
	}
	return max(0, int(r.Amount))
}

// LegalOfficerPowers is exported for a builder or authoring guide.
func LegalOfficerPowers() []string {
	return strings.Fields("entry exit sanctions applySanction records distribution collection donation federationPropose federationVote membership charter")
}

func (w *World) SanctionCases(actor int) []SanctionCase {
	out := []SanctionCase{}
	a := w.govAgent(actor)
	if a == nil || !a.Alive {
		return out
	}
	for id, s := range w.politicalState().Authorizations {
		if s.Applied || s.Start > w.AbsoluteDay || s.Until < w.AbsoluteDay {
			continue
		}
		if w.orderAuthority(a, ProposalInput{Kind: "applySanction", Authorization: id}) != nil {
			continue
		}
		out = append(out, SanctionCase{ID: id, Target: s.Input.Target, Sanction: s.Input.Sanction, Amount: s.Input.Amount, Evidence: s.Input.Evidence, Until: s.Until})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}
