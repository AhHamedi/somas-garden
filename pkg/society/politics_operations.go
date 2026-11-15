package society

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

func boundaryAction(kind string) bool {
	return has([]string{"distribution", "collection", "permitEntry", "permitExit", "donation", "applySanction", "directSanction", "dispute"}, kind)
}

func (w *World) policyBoundary() {
	ps := w.politicalState()
	ps.OrdersUsed = map[string]int{}
	ps.DonationsUsed = map[int]int{}
	for _, p := range w.Plots {
		for id, o := range p.Officers {
			a := w.govAgent(id)
			if a == nil || !a.Alive || a.Plot != p.ID || (o.Expires > 0 && o.Expires < w.AbsoluteDay) {
				delete(p.Officers, id)
			}
		}
	}
	for key, until := range ps.Permits {
		if until < w.AbsoluteDay {
			delete(ps.Permits, key)
		}
	}
	authorizationIDs := make([]string, 0, len(ps.Authorizations))
	for id := range ps.Authorizations {
		authorizationIDs = append(authorizationIDs, id)
	}
	sort.Strings(authorizationIDs)
	for _, id := range authorizationIDs {
		a := ps.Authorizations[id]
		if a.Until < w.AbsoluteDay && !a.Applied {
			delete(ps.Authorizations, id)
			w.politicalEvent("sanction_lapsed", a.Author, a.Plot, "Sanction authorisation expired", 0)
		}
	}
	exitingPlots := make([]int, 0, len(ps.ExitFederation))
	for plot := range ps.ExitFederation {
		exitingPlots = append(exitingPlots, plot)
	}
	sort.Ints(exitingPlots)
	for _, plot := range exitingPlots {
		at := ps.ExitFederation[plot]
		if at <= w.AbsoluteDay {
			w.removeFederationMember(plot)
			delete(ps.ExitFederation, plot)
		}
	}
	var due []Pending
	var rest []Pending
	for _, p := range w.Pending {
		if p.At <= w.AbsoluteDay && !boundaryAction(p.Input.Kind) {
			due = append(due, p)
		} else {
			rest = append(rest, p)
		}
	}
	w.Pending = rest
	priority := func(k string) int {
		switch k {
		case "dissolve", "federationDissolve":
			return 0
		case "found", "createFederation", "federationAdmit":
			return 1
		default:
			return 2
		}
	}
	if w.rng != nil {
		w.rng.Shuffle(len(due), func(i, j int) { due[i], due[j] = due[j], due[i] })
	}
	sort.SliceStable(due, func(i, j int) bool { return priority(due[i].Input.Kind) < priority(due[j].Input.Kind) })
	for _, p := range due {
		err := w.applyInstitution(p)
		w.pendingResult(p, err)
	}
	w.completeFormations()
	w.dissolveEmpty()
	w.restorePoliticalContinuity()
}

func (w *World) pendingResult(p Pending, err error) {
	status := "activated"
	reason := ""
	if err != nil {
		status = "cancelled"
		reason = err.Error()
	}
	for _, b := range w.Proposals {
		if b.ID == p.ID {
			b.Status = status
			b.Reason = reason
		}
	}
	text := title(p.Input) + " activated"
	if err != nil {
		text = title(p.Input) + ": " + reason
	}
	w.politicalEvent(status, p.Actor, p.Plot, text, 0)
}

func (w *World) applyInstitution(p Pending) error {
	i := p.Input
	plot := w.govPlot(p.Plot)
	if p.Officer {
		a := w.govAgent(p.Actor)
		if err := w.orderAuthority(a, i); err != nil {
			return err
		}
	}
	if i.Kind == "createFederation" {
		for _, id := range i.Members {
			q := w.govPlot(id)
			if q == nil || !q.Government || q.Federation >= 0 {
				return errors.New("founding member no longer eligible")
			}
		}
		ps := w.politicalState()
		ps.NextFederation++
		f := &Federation{ID: ps.NextFederation, Name: fmt.Sprintf("Federation %d", ps.NextFederation), Plots: uniqueInts(i.Members), Rules: map[string]Rule{}, Founded: w.AbsoluteDay}
		w.Federations = append(w.Federations, f)
		for _, id := range f.Plots {
			w.govPlot(id).Federation = f.ID
		}
		for _, b := range w.Proposals {
			if b.Input.Kind == "federationFound" && canonical(uniqueInts(b.Input.Members)) == canonical(f.Plots) && b.Status == "scheduled" {
				b.Status = "activated"
				b.Reason = ""
			}
		}
		return nil
	}
	if plot == nil {
		return errors.New("plot no longer exists")
	}
	if i.Kind == "found" {
		if plot.Government {
			return errors.New("government already exists")
		}
		if len(w.residents(plot.ID)) == 0 {
			return errors.New("plot has no living residents")
		}
		plot.Government = true
		plot.Rules = map[string]Rule{}
		plot.Officers = map[int]Office{}
		plot.Reserve = 0
		return nil
	}
	if !plot.Government {
		return errors.New("government no longer exists")
	}
	switch i.Kind {
	case "policy":
		return w.enactLocal(plot, i.Key, i.Rule)
	case "repeal":
		base := policyBase(i.Key)
		target := policyTarget(i.Key, i.Rule.Target)
		if base == "office" {
			delete(plot.Officers, target)
		}
		if base == "representative" {
			w.removeRepresentative(plot, target)
		}
		if base == "influence" {
			if a := w.govAgent(target); a != nil && a.Alive && a.Plot == plot.ID {
				a.Influence = w.Settings.StartingInfluence
			}
		}
		delete(plot.Rules, i.Key)
	case "office":
		r := i.Rule
		r.Mode = "appoint"
		r.Target = i.Target
		return w.enactLocal(plot, fmt.Sprintf("office:%d", i.Target), r)
	case "removeOffice":
		delete(plot.Officers, i.Target)
		delete(plot.Rules, fmt.Sprintf("office:%d", i.Target))
		delete(plot.Rules, fmt.Sprintf("representative:%d", i.Target))
	case "dissolve":
		w.dissolveGovernment(plot)
	case "sanction":
		if err := w.validateEvidence(i, p.Plot); err != nil {
			return err
		}
		a := w.govAgent(i.Target)
		if a == nil || !a.Alive || a.Plot != p.Plot {
			return errors.New("target left or died")
		}
		w.politicalState().Authorizations[p.ID] = &sanctionAuthorization{ID: p.ID, Input: i, Plot: p.Plot, Author: p.Actor, Start: w.AbsoluteDay, Until: w.AbsoluteDay}
	case "federationJoin":
		if plot.Federation >= 0 {
			return errors.New("plot already joined a federation")
		}
		if w.govFederation(i.Federation) == nil {
			return errors.New("federation dissolved")
		}
		w.politicalState().Joins[fmt.Sprintf("%d/%d", plot.ID, i.Federation)] = true
	case "federationLeave":
		if plot.Federation < 0 {
			return errors.New("plot has no federation")
		}
		w.politicalState().ExitFederation[plot.ID] = w.AbsoluteDay + 1
	case "ratify":
		if plot.Federation != i.Federation {
			return errors.New("plot left federation")
		}
		w.politicalState().Ratifications[ratifyKey(plot.ID, i.Federation, i)] = true
	case "federationPolicy", "federationRepeal", "federationAdmit", "federationDissolve":
		f := w.govFederation(p.Federation)
		if f == nil || plot.Federation != f.ID {
			return errors.New("federation no longer exists")
		}
		switch i.Kind {
		case "federationPolicy":
			f.Rules[i.Key] = i.Rule
		case "federationRepeal":
			delete(f.Rules, i.Key)
		case "federationDissolve":
			w.dissolveFederation(f)
		case "federationAdmit":
			q := w.govPlot(i.Target)
			if q == nil || !q.Government || q.Federation >= 0 || !w.politicalState().Joins[fmt.Sprintf("%d/%d", i.Target, f.ID)] {
				return errors.New("joining plot has not authorised membership")
			}
			if !w.chargePledges([]int{q.ID}, "federation", w.Settings.JoiningCost) {
				return errors.New("joining mind not pledged")
			}
			q.Federation = f.ID
			f.Plots = uniqueInts(append(f.Plots, q.ID))
			delete(w.politicalState().Joins, fmt.Sprintf("%d/%d", i.Target, f.ID))
		}
	default:
		return errors.New("unknown institutional operation")
	}
	return nil
}

func (w *World) enactLocal(p *Plot, key string, r Rule) error {
	if err := w.validateRule(key, r, false); err != nil {
		return err
	}
	base := policyBase(key)
	target := policyTarget(key, r.Target)
	switch base {
	case "influence":
		a := w.govAgent(target)
		if a == nil || !a.Alive || a.Plot != p.ID {
			return errors.New("influence target left or died")
		}
		a.Influence = int(r.Amount)
		key = fmt.Sprintf("influence:%d", target)
	case "office":
		a := w.govAgent(target)
		if a == nil || !a.Alive || a.Plot != p.ID {
			return errors.New("officer left or died")
		}
		key = fmt.Sprintf("office:%d", target)
		if r.Mode == "remove" {
			delete(p.Officers, target)
			delete(p.Rules, key)
			return nil
		}
		if p.Officers == nil {
			p.Officers = map[int]Office{}
		}
		p.Officers[target] = Office{Agent: target, Powers: append([]string{}, r.Powers...), Members: append([]int{}, r.Members...), Limit: r.Limit, Expires: r.Expires, Self: r.Enabled}
	case "representative":
		a := w.govAgent(target)
		if a == nil || !a.Alive || a.Plot != p.ID || p.Federation < 0 {
			return errors.New("representative is not an eligible federation resident")
		}
		o := p.Officers[target]
		powers := []string{}
		for _, v := range o.Powers {
			if v != "federationVote" && v != "federationPropose" {
				powers = append(powers, v)
			}
		}
		if r.Mode != "remove" {
			powers = append(powers, r.Powers...)
		}
		o.Agent = target
		o.Powers = powers
		if r.Expires > 0 {
			o.Expires = r.Expires
		}
		if p.Officers == nil {
			p.Officers = map[int]Office{}
		}
		p.Officers[target] = o
		key = fmt.Sprintf("representative:%d", target)
		if r.Mode == "remove" {
			delete(p.Rules, key)
			return nil
		}
	case "quota":
		if strings.Contains(key, ":") {
			a := w.govAgent(target)
			if a == nil || !a.Alive || a.Plot != p.ID {
				return errors.New("quota target is not a resident")
			}
		}
	case "inheritance":
		if r.Mode == "named" {
			a := w.govAgent(r.Target)
			if a == nil || !a.Alive || a.Plot != p.ID {
				return errors.New("beneficiary is not a resident")
			}
		}
	}
	if p.Rules == nil {
		p.Rules = map[string]Rule{}
	}
	p.Rules[key] = r
	return nil
}

func (w *World) restorePoliticalContinuity() {
	for _, p := range w.Plots {
		if !p.Government {
			continue
		}
		members := w.residents(p.ID)
		influence, proposers := 0, 0
		for _, a := range members {
			influence += a.Influence
			if w.canPropose(a) {
				proposers++
			}
		}
		if len(members) > 0 && (influence == 0 || proposers == 0) {
			delete(p.Rules, "proposers")
			for _, a := range members {
				a.Influence = w.Settings.StartingInfluence
				delete(p.Rules, fmt.Sprintf("influence:%d", a.ID))
			}
			w.politicalEvent("continuity", -1, p.ID, "Proposal access and starting influence restored", 0)
		}
	}
}

func (w *World) fundServices() {
	for _, p := range w.Plots {
		p.HardFunded = false
		p.RecordsFunded = false
		if !p.Government {
			continue
		}
		count := float64(len(w.residents(p.ID)))
		if mode(p.Rules, "enforcement", "soft") == "hard" {
			p.HardFunded = w.chargePledges([]int{p.ID}, "local", count*w.Settings.EnforcementCost)
		}
		if on(p.Rules["records"]) {
			p.RecordsFunded = w.chargePledges([]int{p.ID}, "local", count*w.Settings.RecordsCost)
		}
	}
	for _, f := range w.Federations {
		f.Funded = false
		if f.Dissolved {
			continue
		}
		active := false
		for _, key := range []string{"donations", "gifts", "data", "sharedRecords", "disputes", "delegation"} {
			if on(f.Rules[key]) {
				active = true
			}
		}
		if mode(f.Rules, "immigration", "restricted") != "restricted" {
			active = true
		}
		if active {
			f.Funded = w.chargePledges(f.Plots, "federation", float64(len(f.Plots))*w.Settings.FederationRunningCost)
		}
	}
}

func (w *World) executePending() {
	var due []Pending
	var rest []Pending
	for _, p := range w.Pending {
		if p.At <= w.AbsoluteDay && boundaryAction(p.Input.Kind) {
			due = append(due, p)
		} else {
			rest = append(rest, p)
		}
	}
	w.Pending = rest
	// Seeded random order removes author/arrival advantage among resource races.
	if w.rng != nil {
		w.rng.Shuffle(len(due), func(i, j int) { due[i], due[j] = due[j], due[i] })
	}
	for _, p := range due {
		err := w.executeAction(p)
		w.pendingResult(p, err)
	}
	for _, p := range w.Plots {
		if !p.Government {
			continue
		}
		r := p.Rules["distribution"]
		if r.Enabled && r.Amount > 0 {
			target := r.Target
			if r.Mode == "equal" || r.Mode == "perMember" {
				target = -1
			}
			if r.Mode == "perMember" {
				members := []int{}
				for _, a := range w.residents(p.ID) {
					if len(r.Members) == 0 || includes(r.Members, a.ID) {
						members = append(members, a.ID)
					}
				}
				if w.rng != nil {
					w.rng.Shuffle(len(members), func(i, j int) { members[i], members[j] = members[j], members[i] })
				}
				for _, id := range members {
					w.distribute(p, id, nil, int(r.Amount), -1)
				}
			} else {
				w.distribute(p, target, r.Members, int(r.Amount), -1)
			}
		}
	}
}

func (w *World) executeAction(p Pending) error {
	i := p.Input
	plot := w.govPlot(p.Plot)
	if plot == nil || !plot.Government {
		return errors.New("government no longer exists")
	}
	if p.Officer {
		if err := w.orderAuthority(w.govAgent(p.Actor), i); err != nil {
			return err
		}
		o := plot.Officers[p.Actor]
		key := fmt.Sprintf("execute/%d/%d", w.AbsoluteDay, p.Actor)
		if o.Limit > 0 && w.politicalState().OrdersUsed[key]+i.Amount > o.Limit {
			return errors.New("current cumulative officer limit exceeded")
		}
		w.politicalState().OrdersUsed[key] += i.Amount
	}
	switch i.Kind {
	case "distribution":
		if i.Target >= 0 {
			a := w.govAgent(i.Target)
			if a == nil || !a.Alive || a.Plot != plot.ID {
				return errors.New("distribution recipient left or died")
			}
		}
		w.distribute(plot, i.Target, i.Members, i.Amount, p.Actor)
	case "collection":
		n := min(max(0, i.Amount), plot.Stock, max(0, plot.ReserveCapacity-plot.Reserve))
		plot.Stock -= n
		plot.Reserve += n
		w.politicalEvent("collection", p.Actor, plot.ID, "Officer collected field carrots into government storage", float64(n))
	case "permitEntry", "permitExit":
		a := w.govAgent(i.Target)
		if a == nil || !a.Alive {
			return errors.New("applicant died")
		}
		if i.Kind == "permitExit" && a.Plot != plot.ID {
			return errors.New("applicant already left")
		}
		w.politicalState().Permits[fmt.Sprintf("%s/%d/%d", i.Kind, a.ID, plot.ID)] = w.AbsoluteDay
	case "donation":
		return w.donate(plot, i, p.Actor)
	case "applySanction", "directSanction":
		return w.applySanction(p)
	case "dispute":
		f := w.govFederation(p.Federation)
		if f == nil || !f.Funded || !on(f.Rules["disputes"]) {
			return errors.New("federation dispute service unavailable")
		}
		if i.Key == "warning" {
			w.politicalEvent("warning", p.Actor, plot.ID, "Federation dispute warning", 0)
		} else if i.Key == "transfer" {
			donor := w.govPlot(i.Plot)
			if donor == nil || donor.Federation != f.ID {
				return errors.New("donor is not a federation member")
			}
			target := w.govPlot(i.Target)
			if target == nil || target.Federation != f.ID || !target.Government {
				return errors.New("remedy recipient outside federation")
			}
			// Every member ratified the charter's bounded public-reserve remedy.
			// This authority never reaches private food or growing field stock.
			limit := f.Rules["disputes"].Limit
			if limit <= 0 || i.Amount > limit {
				return errors.New("transfer remedy needs an explicit positive charter limit")
			}
			n := min(i.Amount, donor.Reserve, max(0, target.ReserveCapacity-target.Reserve))
			donor.Reserve -= n
			target.Reserve += n
			w.politicalEvent("dispute_remedy", p.Actor, donor.ID, "Charter-authorised public reserve transfer", float64(n))
		}
	default:
		return errors.New("unknown queued action")
	}
	return nil
}

func (w *World) distribute(p *Plot, target int, targets []int, amount, actor int) int {
	amount = min(amount, p.Reserve)
	if amount <= 0 {
		return 0
	}
	candidates := []*Agent{}
	for _, a := range w.Agents {
		if a.Alive && a.Plot == p.ID && (target < 0 || a.ID == target) && (len(targets) == 0 || includes(targets, a.ID)) && a.Food < w.Settings.PersonalCapacity {
			candidates = append(candidates, a)
		}
	}
	if w.rng != nil {
		w.rng.Shuffle(len(candidates), func(i, j int) { candidates[i], candidates[j] = candidates[j], candidates[i] })
	}
	given := map[int]int{}
	sent := 0
	for amount > 0 {
		progress := false
		for _, a := range candidates {
			if amount == 0 {
				break
			}
			if a.Food >= w.Settings.PersonalCapacity {
				continue
			}
			a.Food++
			amount--
			p.Reserve--
			given[a.ID]++
			sent++
			progress = true
		}
		if !progress {
			break
		}
	}
	ids := make([]int, 0, len(given))
	for id := range given {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		w.politicalEvent("distribution", id, p.ID, fmt.Sprintf("Received %d carrots from government storage", given[id]), float64(given[id]))
	}
	return sent
}

func (w *World) collectGovernment(when string) {
	for _, p := range w.Plots {
		if !p.Government {
			continue
		}
		r := p.Rules["collection"]
		if when == "before" {
			w.politicalState().FieldOpening[p.ID] = p.Stock
		}
		if when == "before" || when == "after" {
			match := strings.HasSuffix(strings.ToLower(r.Mode), when)
			if !match {
				continue
			}
			amount := int(r.Amount)
			if strings.HasPrefix(r.Mode, "percent") {
				amount = int(math.Floor(float64(w.politicalState().FieldOpening[p.ID]) * r.Amount / 100))
			}
			n := min(max(0, amount), p.Stock, p.ReserveCapacity-p.Reserve)
			p.Stock -= n
			p.Reserve += n
			if n > 0 {
				w.politicalEvent("collection", -1, p.ID, "Carrots collected from field into government storage", float64(n))
			}
			continue
		}
		if when != "tax" {
			continue
		}
		residents := w.residents(p.ID)
		if w.rng != nil {
			w.rng.Shuffle(len(residents), func(i, j int) { residents[i], residents[j] = residents[j], residents[i] })
		}
		for _, a := range residents {
			tax := p.Rules["tax"]
			base := max(0, a.Food-tax.Exempt)
			amount := 0
			if tax.Mode == "fixed" {
				amount = min(base, int(tax.Amount))
			} else if tax.Mode == "percent" {
				amount = int(math.Floor(float64(base) * tax.Amount / 100))
			}
			n := min(amount, a.Food, max(0, p.ReserveCapacity-p.Reserve))
			if n > 0 {
				w.cancelTaxOffer(a, n)
				a.Food -= n
				p.Reserve += n
			}
			if amount > 0 {
				w.politicalEvent("tax", a.ID, p.ID, fmt.Sprintf("Storage tax collected %d of %d due; uncollected carrots remain owned", n, amount), float64(n))
			}
			limit := p.Rules["holding"]
			if limit.Mode == "collect" {
				n = min(max(0, a.Food-int(limit.Amount)), max(0, p.ReserveCapacity-p.Reserve))
				if n > 0 {
					w.cancelTaxOffer(a, n)
					a.Food -= n
					p.Reserve += n
					w.politicalEvent("holding", a.ID, p.ID, "Excess holdings collected", float64(n))
				}
				if a.Food > int(limit.Amount) {
					w.politicalEvent("holding_unenforced", a.ID, p.ID, "Government storage full; remaining excess stays with its owner", float64(a.Food-int(limit.Amount)))
				}
			}
		}
	}
}
func (w *World) cancelTaxOffer(a *Agent, take int) {
	reserved := 0
	for _, o := range w.Offers {
		if o.From == a.ID {
			reserved += o.Amount
		}
	}
	if a.Food-reserved >= take {
		return
	}
	remaining := []Offer{}
	for _, o := range w.Offers {
		if o.From == a.ID {
			w.politicalEvent("offer_cancelled", a.ID, a.Plot, "Food offer cancelled because enacted collection needs reserved carrots", float64(o.Amount))
			if recipient := w.govAgent(o.To); recipient != nil {
				w.politicalEvent("offer_cancelled", recipient.ID, recipient.Plot, "Incoming food offer cancelled by enacted storage collection", float64(o.Amount))
			}
		} else {
			remaining = append(remaining, o)
		}
	}
	w.Offers = remaining
}

func (w *World) dissolveGovernment(p *Plot) {
	if !p.Government {
		return
	}
	returned := min(p.Reserve, max(0, p.Capacity-p.Stock))
	deleted := p.Reserve - returned
	p.Stock += returned
	p.Reserve = 0
	p.Government = false
	p.Rules = map[string]Rule{}
	p.Officers = map[int]Office{}
	p.HardFunded = false
	p.RecordsFunded = false
	w.releasePledges([]int{p.ID}, "local")
	w.releasePledges([]int{p.ID}, "federation")
	w.removeFederationMember(p.ID)
	for _, b := range w.Proposals {
		if b.Plot == p.ID && (b.Status == "open" || b.Status == "scheduled") {
			b.Status = "cancelled"
			b.Reason = "Government dissolved"
		}
	}
	w.politicalEvent("dissolution", -1, p.ID, fmt.Sprintf("Government dissolved; %d carrots returned and %d deleted", returned, deleted), float64(deleted))
}
func (w *World) dissolveEmpty() {
	for _, p := range w.Plots {
		if p.Government && len(w.residents(p.ID)) == 0 {
			w.dissolveGovernment(p)
		}
	}
}
func (w *World) dissolveFederation(f *Federation) {
	if f == nil || f.Dissolved {
		return
	}
	f.Dissolved = true
	f.Funded = false
	w.releasePledges(f.Plots, "federation")
	for _, id := range f.Plots {
		if p := w.govPlot(id); p != nil {
			p.Federation = -1
			for aid, o := range p.Officers {
				powers := []string{}
				for _, x := range o.Powers {
					if x != "federationVote" && x != "federationPropose" {
						powers = append(powers, x)
					}
				}
				o.Powers = powers
				p.Officers[aid] = o
				delete(p.Rules, fmt.Sprintf("representative:%d", aid))
			}
		}
	}
	for _, b := range w.Proposals {
		if b.Federation == f.ID && (b.Status == "open" || b.Status == "scheduled") {
			b.Status = "cancelled"
			b.Reason = "Federation dissolved"
		}
	}
}
func (w *World) removeFederationMember(plot int) {
	p := w.govPlot(plot)
	if p == nil || p.Federation < 0 {
		return
	}
	f := w.govFederation(p.Federation)
	p.Federation = -1
	for id := range p.Officers {
		w.removeRepresentative(p, id)
	}
	w.releasePledges([]int{plot}, "federation")
	if f == nil {
		return
	}
	ids := []int{}
	for _, id := range f.Plots {
		if id != plot {
			ids = append(ids, id)
		}
	}
	f.Plots = ids
	if len(ids) < 2 {
		w.dissolveFederation(f)
	}
}

func (w *World) leaving(a *Agent, oldPlot int) {
	if a == nil {
		return
	}
	if p := w.govPlot(oldPlot); p != nil {
		delete(p.Officers, a.ID)
		for _, key := range []string{"office", "representative", "influence", "quota"} {
			delete(p.Rules, fmt.Sprintf("%s:%d", key, a.ID))
		}
	}
	a.Pledges = map[string]float64{}
	a.Influence = 0
	a.LastPlaceUntil = 0
	a.NoticeAt = 0
	ps := w.politicalState()
	delete(ps.Notices, a.ID)
	delete(ps.LastPlace, a.ID)
	for id, s := range ps.Authorizations {
		if s.Input.Target == a.ID {
			delete(ps.Authorizations, id)
		}
	}
}

func (w *World) permitMove(a *Agent, dest int) bool {
	if a == nil || !a.Alive || dest == a.Plot {
		return true
	}
	ps := w.politicalState()
	origin := w.govPlot(a.Plot)
	target := w.govPlot(dest)
	if dest >= 0 && target == nil {
		return false
	}
	if origin != nil && origin.Government {
		switch mode(origin.Rules, "exit", "free") {
		case "notice":
			at, ok := ps.Notices[a.ID]
			if !ok {
				ps.Notices[a.ID] = w.AbsoluteDay
				a.NoticeAt = w.AbsoluteDay
				w.politicalEvent("exit_request", a.ID, a.Plot, "Exit notice filed; movement possible next cycle", 0)
				return false
			}
			if w.AbsoluteDay <= at {
				return false
			}
		case "vote", "officer":
			if ps.Permits[fmt.Sprintf("permitExit/%d/%d", a.ID, origin.ID)] != w.AbsoluteDay {
				w.politicalEvent("exit_request", a.ID, origin.ID, "Exit approval requested", 0)
				return false
			}
		}
	}
	if target == nil || !target.Government {
		return true
	}
	r := target.Rules["entry"]
	if r.Limit > 0 && len(w.residents(target.ID)) >= r.Limit {
		return false
	}
	if origin != nil && origin.Federation >= 0 && origin.Federation == target.Federation {
		f := w.govFederation(target.Federation)
		if f != nil && f.Funded {
			switch mode(f.Rules, "immigration", "restricted") {
			case "open":
				return true
			case "checked":
				if on(f.Rules["sharedRecords"]) && w.chargePledges([]int{target.ID}, "local", w.Settings.ReadCost) {
					for _, id := range f.Plots {
						p := w.govPlot(id)
						for _, e := range p.Records {
							if e.Kind == "sanction_applied" && e.Actor == a.ID && e.AbsoluteDay >= w.AbsoluteDay-w.Settings.ImmigrationLookback {
								return false
							}
						}
					}
					return true
				}
			}
		}
	}
	switch mode(target.Rules, "entry", "open") {
	case "open":
		return true
	case "closed":
		return false
	case "vote", "officer":
		if ps.Permits[fmt.Sprintf("permitEntry/%d/%d", a.ID, target.ID)] == w.AbsoluteDay {
			return true
		}
		w.politicalEvent("entry_request", a.ID, target.ID, "Entry approval requested", 0)
		return false
	}
	return false
}

func (w *World) recordAccess(actor, plot, subject, from, to int) (*Agent, *Plot, error) {
	a := w.govAgent(actor)
	p := w.govPlot(plot)
	if from < 0 || to < 0 || (to > 0 && from > to) || subject >= len(w.Agents) {
		return nil, nil, errors.New("invalid record query range or subject")
	}
	if a == nil || !a.Alive || p == nil || !p.Government {
		return nil, nil, errors.New("records unavailable")
	}
	access := p.Rules["recordAccess"]
	if access.Mode == "" {
		access.Mode = "all"
	}
	if a.Plot != plot {
		own := w.govPlot(a.Plot)
		if own == nil || own.Federation < 0 || own.Federation != p.Federation {
			return nil, nil, errors.New("records are private to the plot")
		}
		f := w.govFederation(p.Federation)
		if f == nil || !f.Funded || !on(f.Rules["sharedRecords"]) {
			return nil, nil, errors.New("shared records are not funded")
		}
		access = f.Rules["recordAccess"]
		if access.Mode == "" {
			access.Mode = "all"
		}
	}
	allowed := access.Mode == "all"
	if access.Mode == "named" {
		allowed = includes(access.Members, a.ID)
	}
	if access.Mode == "officers" {
		own := w.govPlot(a.Plot)
		_, allowed = own.Officers[a.ID]
	}
	if !allowed {
		return nil, nil, errors.New("record access not granted")
	}
	return a, p, nil
}

func (w *World) ReadRecords(actor, plot, subject, from, to int) ([]Event, error) {
	a, p, err := w.recordAccess(actor, plot, subject, from, to)
	if err != nil {
		return nil, err
	}
	if !w.govSpend(a, w.Settings.ReadCost) {
		return nil, errors.New("not enough unpledged mind")
	}
	var out []Event
	for _, e := range p.Records {
		if (subject < 0 || e.Actor == subject) && (from <= 0 || e.AbsoluteDay >= from) && (to <= 0 || e.AbsoluteDay <= to) {
			out = append(out, e)
		}
	}
	return out, nil
}

func (w *World) removeRepresentative(p *Plot, id int) {
	o, ok := p.Officers[id]
	if !ok {
		return
	}
	powers := []string{}
	for _, power := range o.Powers {
		if power != "federationPropose" && power != "federationVote" {
			powers = append(powers, power)
		}
	}
	o.Powers = powers
	p.Officers[id] = o
	delete(p.Rules, fmt.Sprintf("representative:%d", id))
}
