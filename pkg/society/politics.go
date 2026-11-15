package society

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"sort"
	"strconv"
	"strings"
)

func (w *World) politicalState() *politicalState {
	if w.political == nil {
		w.political = &politicalState{FieldOpening: map[int]int{}, Permits: map[string]int{}, Notices: map[int]int{}, LastPlace: map[int]int{}, OrdersUsed: map[string]int{}, DonationsUsed: map[int]int{}, Sanctioned: map[int]bool{}, Authorizations: map[string]*sanctionAuthorization{}, Formations: map[string]*formationAttempt{}, Joins: map[string]bool{}, Ratifications: map[string]bool{}, ExitFederation: map[int]int{}, Evidence: map[int]evidenceRecord{}, SharedEvidence: map[int]bool{}, Records: map[int][]Record{}}
	}
	return w.political
}

func (w *World) govAgent(id int) *Agent {
	for _, a := range w.Agents {
		if a.ID == id {
			return a
		}
	}
	return nil
}
func (w *World) govPlot(id int) *Plot {
	for _, p := range w.Plots {
		if p.ID == id {
			return p
		}
	}
	return nil
}
func (w *World) govFederation(id int) *Federation {
	for _, f := range w.Federations {
		if f.ID == id && !f.Dissolved {
			return f
		}
	}
	return nil
}
func has(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}
func includes(ns []int, n int) bool {
	for _, x := range ns {
		if x == n {
			return true
		}
	}
	return false
}
func on(r Rule) bool { return r.Enabled || r.Mode == "on" }
func mode(rules map[string]Rule, key, fallback string) string {
	if r, ok := rules[key]; ok && r.Mode != "" {
		return r.Mode
	}
	return fallback
}
func policyTarget(key string, target int) int {
	if i := strings.Index(key, ":"); i >= 0 {
		if v, e := strconv.Atoi(key[i+1:]); e == nil {
			return v
		}
	}
	return target
}
func policyBase(key string) string { return strings.SplitN(key, ":", 2)[0] }
func rounded(v float64) float64    { return math.Round(v*1e6) / 1e6 }

func (w *World) politicalEvent(kind string, actor, plot int, text string, amount float64) Event {
	return w.event(kind, actor, plot, text, amount)
}
func (w *World) govSpend(a *Agent, cost float64) bool {
	if a == nil || !a.Alive || cost < 0 || math.IsNaN(cost) || math.IsInf(cost, 0) {
		return false
	}
	available := a.Mind
	for _, v := range a.Pledges {
		available -= v
	}
	if available+0.0000001 < cost {
		return false
	}
	a.Mind = rounded(a.Mind - cost)
	a.PoliticalMind = rounded(a.PoliticalMind + cost)
	return true
}
func (w *World) setPledges(a *Agent, changes map[string]float64) {
	if a == nil || !a.Alive || a.Plot < 0 {
		return
	}
	if a.Pledges == nil {
		a.Pledges = map[string]float64{}
	}
	keys := make([]string, 0, len(changes))
	for k := range changes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		v := changes[k]
		if (k != "local" && k != "federation") || v < 0 || math.IsNaN(v) || math.IsInf(v, 0) {
			continue
		}
		other := 0.0
		for x, b := range a.Pledges {
			if x != k {
				other += b
			}
		}
		if v+other > a.Mind+1e-7 {
			w.politicalEvent("rejected", a.ID, a.Plot, "Pledge exceeds unreserved mind", 0)
			continue
		}
		a.Pledges[k] = rounded(v)
		w.politicalEvent("pledge", a.ID, a.Plot, "Reserved mind for "+k, v)
	}
}

// chargePledges is all-or-nothing and uses millionths plus largest remainders.
func (w *World) chargePledges(plots []int, bucket string, amount float64) bool {
	if amount <= 0 {
		return true
	}
	need := int64(math.Round(amount * 1e6))
	type share struct {
		a           *Agent
		units, draw int64
		rem         int64
	}
	var shares []share
	var total int64
	for _, a := range w.Agents {
		if a.Alive && includes(plots, a.Plot) {
			v := int64(math.Round(a.Pledges[bucket] * 1e6))
			if v > 0 {
				shares = append(shares, share{a: a, units: v})
				total += v
			}
		}
	}
	if total < need {
		return false
	}
	used := int64(0)
	for i := range shares {
		product := new(big.Int).Mul(big.NewInt(need), big.NewInt(shares[i].units))
		q, r := new(big.Int), new(big.Int)
		q.QuoRem(product, big.NewInt(total), r)
		shares[i].draw = q.Int64()
		shares[i].rem = r.Int64()
		used += shares[i].draw
	}
	sort.SliceStable(shares, func(i, j int) bool {
		if shares[i].rem != shares[j].rem {
			return shares[i].rem > shares[j].rem
		}
		return shares[i].a.ID < shares[j].a.ID
	})
	for i := int64(0); i < need-used; i++ {
		shares[i%int64(len(shares))].draw++
	}
	for _, s := range shares {
		v := float64(s.draw) / 1e6
		s.a.Pledges[bucket] = rounded(s.a.Pledges[bucket] - v)
		s.a.Mind = rounded(s.a.Mind - v)
		s.a.PoliticalMind = rounded(s.a.PoliticalMind + v)
		w.politicalEvent("funding", s.a.ID, s.a.Plot, "Paid pledged mind for "+bucket, v)
	}
	return true
}
func (w *World) releasePledges(plots []int, bucket string) {
	for _, a := range w.Agents {
		if includes(plots, a.Plot) {
			a.Pledges[bucket] = 0
		}
	}
}

func (w *World) office(a *Agent, power string) bool {
	if a == nil || !a.Alive {
		return false
	}
	p := w.govPlot(a.Plot)
	if p == nil || !p.Government {
		return false
	}
	o, ok := p.Officers[a.ID]
	return ok && (o.Expires == 0 || o.Expires >= w.AbsoluteDay) && has(o.Powers, power)
}
func (w *World) canPropose(a *Agent) bool {
	p := w.govPlot(a.Plot)
	if p == nil {
		return false
	}
	switch mode(p.Rules, "proposers", "all") {
	case "positive":
		return a.Influence > 0
	case "officers":
		o, ok := p.Officers[a.ID]
		return ok && (o.Expires == 0 || o.Expires >= w.AbsoluteDay) && (len(p.Rules["proposers"].Members) == 0 || includes(p.Rules["proposers"].Members, a.ID))
	default:
		return true
	}
}

func (w *World) validateRule(key string, r Rule, federal bool) error {
	base := policyBase(key)
	if strings.Contains(key, ":") && !has([]string{"quota", "influence", "office", "representative"}, base) {
		return errors.New("this policy does not have per-member keys")
	}
	scope := "local"
	if federal {
		scope = "federation"
	}
	var def *PolicyDefinition
	for _, d := range Catalogue() {
		if d.Key == base && d.Scope == scope {
			v := d
			def = &v
			break
		}
	}
	if def == nil {
		return errors.New("unknown policy")
	}
	if len(def.Modes) > 0 && !has(def.Modes, r.Mode) {
		return errors.New("invalid policy mode")
	}
	if math.IsNaN(r.Amount) || math.IsInf(r.Amount, 0) || r.Amount < 0 || r.Limit < 0 || r.Exempt < 0 || r.Expires < 0 {
		return errors.New("policy quantities must be finite and nonnegative")
	}
	if (r.Mode == "percent" || strings.HasPrefix(r.Mode, "percent")) && r.Amount > 100 {
		return errors.New("percentage exceeds 100")
	}
	if base == "influence" && (r.Amount > float64(w.Settings.MaxInfluence) || r.Amount != math.Trunc(r.Amount)) {
		return errors.New("influence is outside its integer range")
	}
	if base == "holding" && r.Amount > float64(w.Settings.PersonalCapacity) {
		return errors.New("holding limit exceeds physical capacity")
	}
	if base == "exit" && r.Mode == "notice" && r.Amount > 1 {
		return errors.New("exit notice exceeds one cycle")
	}
	if r.Amount > 1e9 {
		return errors.New("policy amount exceeds supported physical range")
	}
	if !strings.HasPrefix(r.Mode, "percent") && r.Amount != math.Trunc(r.Amount) {
		return errors.New("carrot quantities must be whole numbers")
	}
	if base == "sanctions" {
		for _, x := range r.Powers {
			if !has([]string{"warning", "fine", "lastPlace", "expulsion"}, x) {
				return errors.New("unknown sanction")
			}
		}
	}
	if base == "office" || base == "representative" {
		for _, x := range r.Powers {
			if !has([]string{"entry", "exit", "sanctions", "applySanction", "records", "distribution", "collection", "donation", "federationPropose", "federationVote", "membership", "charter"}, x) {
				return errors.New("unknown officer power")
			}
		}
		if base == "representative" {
			for _, x := range r.Powers {
				if x != "federationPropose" && x != "federationVote" {
					return errors.New("representatives receive only federation powers")
				}
			}
		}
	}
	if base == "disputes" {
		for _, x := range r.Powers {
			if x != "warning" && x != "transfer" {
				return errors.New("invalid dispute remedy")
			}
		}
	}
	return nil
}

func (w *World) validateProposal(a *Agent, in ProposalInput, officer bool) error {
	if a == nil || !a.Alive || a.Plot < 0 {
		return errors.New("a living resident is required")
	}
	p := w.govPlot(a.Plot)
	if p == nil {
		return errors.New("unknown plot")
	}
	if in.Kind == "found" {
		if p.Government {
			return errors.New("government already exists")
		}
		return nil
	}
	if !p.Government {
		return errors.New("form a government first")
	}
	if !officer && !strings.HasPrefix(in.Kind, "federationP") && in.Kind != "federationAdmit" && in.Kind != "federationDissolve" && in.Kind != "dispute" && !w.canPropose(a) {
		return errors.New("proposal rights do not include this resident")
	}
	federal := in.Kind == "federationPolicy" || in.Kind == "federationRepeal" || in.Kind == "federationAdmit" || in.Kind == "federationDissolve" || in.Kind == "dispute"
	if federal {
		f := w.govFederation(p.Federation)
		if f == nil || f.ID != in.Federation || !w.office(a, "federationPropose") {
			return errors.New("federation proposal mandate required")
		}
	}
	switch in.Kind {
	case "policy", "federationPolicy":
		if err := w.validateRule(in.Key, in.Rule, federal); err != nil {
			return err
		}
		base := policyBase(in.Key)
		if base == "influence" || base == "office" || base == "representative" {
			target := w.govAgent(policyTarget(in.Key, in.Rule.Target))
			if target == nil || !target.Alive || target.Plot != a.Plot {
				return errors.New("target is not a living resident")
			}
		}
		if base == "representative" && p.Federation < 0 {
			return errors.New("join a federation before appointing representatives")
		}
	case "repeal", "federationRepeal":
		if in.Key == "" {
			return errors.New("policy key required")
		}
		rules := p.Rules
		if federal {
			rules = w.govFederation(p.Federation).Rules
		}
		if _, ok := rules[in.Key]; !ok {
			return errors.New("policy does not exist")
		}
	case "office", "removeOffice":
		t := w.govAgent(in.Target)
		if t == nil || !t.Alive || t.Plot != a.Plot {
			return errors.New("officer must be a living resident")
		}
		if in.Kind == "office" {
			r := in.Rule
			r.Mode = "appoint"
			if err := w.validateRule("office", r, false); err != nil {
				return err
			}
		}
	case "sanction":
		return w.validateSanction(a, in)
	case "distribution":
		if in.Amount < 0 {
			return errors.New("negative distribution")
		}
		if in.Target >= 0 {
			t := w.govAgent(in.Target)
			if t == nil || !t.Alive || t.Plot != a.Plot {
				return errors.New("recipient is not a resident")
			}
		}
	case "permitEntry":
		t := w.govAgent(in.Target)
		if t == nil || !t.Alive {
			return errors.New("unknown applicant")
		}
	case "permitExit":
		t := w.govAgent(in.Target)
		if t == nil || !t.Alive || t.Plot != a.Plot {
			return errors.New("unknown departing resident")
		}
	case "donation":
		return w.validateDonation(a, in, officer)
	case "dissolve":
	case "federationFound":
		if p.Federation >= 0 {
			return errors.New("already in a federation")
		}
		ids := uniqueInts(in.Members)
		if len(ids) < 2 || !includes(ids, p.ID) {
			return errors.New("founding needs two governed plots including this plot")
		}
		for _, id := range ids {
			v := w.govPlot(id)
			if v == nil || !v.Government || v.Federation >= 0 {
				return errors.New("founding member unavailable")
			}
		}
	case "federationJoin":
		if p.Federation >= 0 {
			return errors.New("already in a federation")
		}
		if w.govFederation(in.Federation) == nil {
			return errors.New("unknown federation")
		}
	case "federationLeave":
		if p.Federation < 0 {
			return errors.New("not in a federation")
		}
	case "ratify":
		if w.govFederation(in.Federation) == nil || p.Federation != in.Federation {
			return errors.New("unknown federation")
		}
		if strings.HasPrefix(in.Key, "repeal:") {
			if _, ok := w.govFederation(in.Federation).Rules[strings.TrimPrefix(in.Key, "repeal:")]; !ok {
				return errors.New("federation policy does not exist")
			}
		} else if in.Key != "admit" && in.Key != "dissolve" {
			if err := w.validateRule(in.Key, in.Rule, true); err != nil {
				return err
			}
		}
	case "federationAdmit":
		q := w.govPlot(in.Target)
		if q == nil || !q.Government || q.Federation >= 0 {
			return errors.New("joining plot unavailable")
		}
	case "federationDissolve":
	case "dispute":
		f := w.govFederation(in.Federation)
		r := f.Rules["disputes"]
		if !on(r) || !has(r.Powers, in.Key) {
			return errors.New("remedy not authorised by charter")
		}
		if in.Key == "transfer" {
			if in.Amount < 0 || (r.Limit > 0 && in.Amount > r.Limit) {
				return errors.New("remedy exceeds charter limit")
			}
			q := w.govPlot(in.Plot)
			if q == nil || q.Federation != f.ID {
				return errors.New("remedy source outside federation")
			}
		}
	default:
		return errors.New("unknown proposal kind")
	}
	return nil
}

func uniqueInts(v []int) []int {
	m := map[int]bool{}
	r := []int{}
	for _, n := range v {
		if !m[n] {
			m[n] = true
			r = append(r, n)
		}
	}
	sort.Ints(r)
	return r
}
func canonical(v any) string { b, _ := json.Marshal(v); return string(b) }
func title(in ProposalInput) string {
	switch in.Kind {
	case "found":
		return "Found a government"
	case "policy", "federationPolicy":
		return strings.ReplaceAll(in.Key, ":", " · ") + ": " + in.Rule.Mode
	case "office":
		return fmt.Sprintf("Appoint resident %d", in.Target+1)
	case "federationFound":
		return "Form a federation"
	case "sanction":
		return fmt.Sprintf("%s for resident %d", in.Sanction, in.Target+1)
	default:
		return strings.ReplaceAll(in.Kind, "federation", "Federation ")
	}
}

func (w *World) governancePhase(decisions map[int]Decision) {
	ps := w.politicalState()
	for _, a := range w.Agents {
		d := decisions[a.ID]
		if !a.Alive {
			continue
		}
		if len(d.Pledge) > 0 {
			w.setPledges(a, d.Pledge)
		}
		for _, in := range d.Proposals {
			in = normaliseProposal(in)
			if err := w.validateProposal(a, in, false); err != nil {
				w.politicalEvent("proposal_rejected", a.ID, a.Plot, err.Error(), 0)
				continue
			}
			if !w.govSpend(a, w.Settings.ProposalCost) {
				w.politicalEvent("proposal_rejected", a.ID, a.Plot, "Not enough unpledged mind", 0)
				continue
			}
			ps.NextProposal++
			f := -1
			if in.Kind == "federationPolicy" || in.Kind == "federationRepeal" || in.Kind == "federationAdmit" || in.Kind == "federationDissolve" || in.Kind == "dispute" {
				f = in.Federation
			}
			closes := w.AbsoluteDay
			if in.Kind == "dispute" {
				closes += w.Settings.DisputeWindow - 1
			}
			p := &Proposal{ID: fmt.Sprintf("m%d-p%d", w.Month, ps.NextProposal), Author: a.ID, Plot: a.Plot, Federation: f, Input: in, Title: title(in), Status: "open", Created: w.AbsoluteDay, Closes: closes, Electorate: map[int]int{}, Votes: map[int]string{}, PlotVotes: map[int]string{}, RepresentativePlots: map[int]int{}}
			if in.Kind == "sanction" {
				ps.SharedEvidence[in.Evidence] = true
				for _, e := range w.Events {
					if e.ID == in.Evidence && e.Month == w.Month {
						receipt := e
						p.EvidenceReceipt = &receipt
						break
					}
				}
			}
			w.Proposals = append(w.Proposals, p)
			w.politicalEvent("proposal", a.ID, a.Plot, p.Title, w.Settings.ProposalCost)
		}
	}
}

func (w *World) freezeBallots() {
	for _, p := range w.Proposals {
		if p.Status != "open" || p.Closes != w.AbsoluteDay || p.Total > 0 || len(p.Electorate) > 0 {
			continue
		}
		p.Threshold = "majority"
		if p.Federation >= 0 {
			f := w.govFederation(p.Federation)
			if f == nil {
				p.Status = "cancelled"
				p.Reason = "Federation no longer exists"
				continue
			}
			p.Total = len(f.Plots)
			if p.Input.Kind != "dispute" {
				p.Threshold = "unanimous"
			}
			for _, a := range w.Agents {
				if a.Alive && includes(f.Plots, a.Plot) && w.office(a, "federationVote") {
					p.Electorate[a.ID] = 1
					p.RepresentativePlots[a.ID] = a.Plot
				}
			}
			continue
		}
		plot := w.govPlot(p.Plot)
		if plot == nil || (p.Input.Kind != "found" && !plot.Government) {
			p.Status = "cancelled"
			continue
		}
		if p.Input.Kind != "found" {
			p.Threshold = mode(plot.Rules, "threshold", "majority")
		}
		for _, a := range w.Agents {
			if a.Alive && a.Plot == p.Plot {
				weight := a.Influence
				if p.Input.Kind == "found" {
					weight = 1
				}
				p.Electorate[a.ID] = weight
				p.Total += weight
			}
		}
	}
}

func (w *World) votingPhase(decisions map[int]Decision) {
	w.freezeBallots()
	byID := map[string]*Proposal{}
	for _, p := range w.Proposals {
		if p.Status == "open" && p.Closes == w.AbsoluteDay {
			byID[p.ID] = p
		}
	}
	for _, a := range w.Agents {
		if !a.Alive {
			continue
		}
		d := decisions[a.ID]
		choices := append([]VoteChoice{}, d.OrderedVotes...)
		if len(choices) == 0 {
			keys := make([]string, 0, len(d.Votes))
			for k := range d.Votes {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				choices = append(choices, VoteChoice{Proposal: k, Choice: d.Votes[k]})
			}
		}
		counts := map[string]int{}
		for _, c := range choices {
			counts[c.Proposal]++
		}
		for _, choice := range choices {
			id := choice.Proposal
			if counts[id] != 1 {
				continue
			}
			p := byID[id]
			if p == nil {
				continue
			}
			if _, ok := p.Electorate[a.ID]; !ok {
				continue
			}
			v := strings.ToLower(choice.Choice)
			if v != "yes" && v != "no" && v != "abstain" {
				continue
			}
			if _, done := p.Votes[a.ID]; done {
				continue
			}
			if p.Federation >= 0 && v == "yes" && p.Threshold == "unanimous" && !w.charterAuthorized(a, p) {
				w.politicalEvent("vote_rejected", a.ID, a.Plot, "Local charter authorisation required", 0)
				continue
			}
			if v != "abstain" && !w.govSpend(a, w.Settings.VoteCost) {
				w.politicalEvent("vote_rejected", a.ID, a.Plot, "Not enough unpledged mind", 0)
				continue
			}
			p.Votes[a.ID] = v
		}
	}
	var passing []*Proposal
	for _, p := range w.Proposals {
		if p.Status != "open" || p.Closes != w.AbsoluteDay {
			continue
		}
		w.tally(p)
		passed := p.Total > 0 && p.Yes*2 > p.Total
		if p.Threshold == "twoThirds" {
			passed = p.Total > 0 && p.Yes*3 >= p.Total*2
		}
		if p.Threshold == "unanimous" {
			passed = p.Total > 0 && p.Yes == p.Total
		}
		if passed {
			p.Status = "passed"
			passing = append(passing, p)
		} else {
			p.Status = "failed"
			p.Reason = "Insufficient support"
		}
		w.politicalEvent("ballot", p.Author, p.Plot, fmt.Sprintf("%s: %d yes of %d — %s", p.Title, p.Yes, p.Total, p.Status), 0)
	}
	groups := map[string][]*Proposal{}
	for _, p := range passing {
		key := w.conflictKey(p)
		groups[key] = append(groups[key], p)
	}
	keys := make([]string, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		group := groups[key]
		best := -1
		values := map[string]bool{}
		var winner *Proposal
		for _, p := range group {
			value := proposalValue(p.Input)
			if p.Yes > best {
				best = p.Yes
				values = map[string]bool{value: true}
				winner = p
			} else if p.Yes == best {
				values[value] = true
			}
		}
		if len(values) > 1 {
			for _, p := range group {
				p.Status = "tied"
				p.Reason = "Equal support for conflicting values; existing rule preserved"
			}
			continue
		}
		for _, p := range group {
			if p != winner {
				p.Status = "superseded"
				p.Reason = "Another ballot determines the same decision"
			}
		}
		w.schedulePassed(winner)
	}
	// A failed local founding releases its escrow; successful duplicates charge once.
	for _, plot := range w.Plots {
		if plot.Government {
			continue
		}
		had, scheduled := false, false
		for _, p := range w.Proposals {
			if p.Plot == plot.ID && p.Input.Kind == "found" && p.Closes == w.AbsoluteDay {
				had = true
				if p.Status == "scheduled" {
					scheduled = true
				}
			}
		}
		if had && !scheduled {
			w.releasePledges([]int{plot.ID}, "local")
		}
	}
	w.completeFormations()
}

func (w *World) tally(p *Proposal) {
	p.Yes, p.No, p.Abstain = 0, 0, 0
	if p.Federation < 0 {
		for id, weight := range p.Electorate {
			switch p.Votes[id] {
			case "yes":
				p.Yes += weight
			case "no":
				p.No += weight
			default:
				p.Abstain += weight
			}
		}
		return
	}
	f := w.govFederation(p.Federation)
	if f == nil {
		return
	}
	for _, plot := range f.Plots {
		total, y, n := 0, 0, 0
		for id := range p.Electorate {
			if p.RepresentativePlots[id] != plot {
				continue
			}
			total++
			if p.Votes[id] == "yes" {
				y++
			}
			if p.Votes[id] == "no" {
				n++
			}
		}
		v := "abstain"
		if y*2 > total {
			v = "yes"
			p.Yes++
		} else if n*2 > total {
			v = "no"
			p.No++
		} else {
			p.Abstain++
		}
		p.PlotVotes[plot] = v
	}
}

func (w *World) conflictKey(p *Proposal) string {
	i := p.Input
	base := fmt.Sprintf("%d/%d/", p.Plot, p.Federation)
	if p.Federation >= 0 {
		base = fmt.Sprintf("f%d/", p.Federation)
	}
	switch i.Kind {
	case "policy", "repeal", "federationPolicy", "federationRepeal":
		key := i.Key
		if policyBase(key) == "office" || policyBase(key) == "representative" {
			return base + fmt.Sprintf("office/%d", policyTarget(key, i.Rule.Target))
		}
		return base + "rule/" + key
	case "office", "removeOffice":
		return base + fmt.Sprintf("office/%d", i.Target)
	case "sanction":
		return base + fmt.Sprintf("sanction/%d", i.Evidence)
	case "found", "dissolve", "federationDissolve":
		return base + i.Kind
	case "federationFound", "federationJoin", "federationLeave":
		return base + "membership"
	case "ratify":
		return base + "ratify/" + canonical(i)
	default:
		return base + "action/" + actionIdentity(i)
	}
}

func (w *World) schedulePassed(p *Proposal) {
	i := p.Input
	if i.Kind == "found" && !w.chargePledges([]int{p.Plot}, "local", w.Settings.GovernmentCost) {
		p.Status = "failed"
		p.Reason = "Founding mind was not pledged"
		return
	}
	if i.Kind == "federationFound" {
		ps := w.politicalState()
		members := uniqueInts(i.Members)
		key := canonical(members)
		// A plot has one current founding mandate; a later local membership
		// decision cannot leave its same pledge backing incompatible attempts.
		for oldKey, old := range ps.Formations {
			if oldKey != key && !old.Scheduled {
				delete(old.Approvals, p.Plot)
			}
		}
		attempt := ps.Formations[key]
		if attempt == nil {
			attempt = &formationAttempt{Members: members, Approvals: map[int]bool{}, First: w.AbsoluteDay}
			ps.Formations[key] = attempt
		}
		attempt.Approvals[p.Plot] = true
		p.Status = "approved"
		p.Reason = "Waiting for all member approvals and founding mind"
		return
	}
	if p.Federation >= 0 && p.Threshold == "unanimous" {
		in := p.Input
		if in.Kind == "federationAdmit" {
			in.Key = "admit"
		}
		if in.Kind == "federationDissolve" {
			in.Key = "dissolve"
		}
		if in.Kind == "federationRepeal" {
			in.Key = "repeal:" + in.Key
		}
		if f := w.govFederation(p.Federation); f != nil {
			for _, plot := range f.Plots {
				delete(w.politicalState().Ratifications, ratifyKey(plot, p.Federation, in))
			}
		}
	}
	p.Activate = w.AbsoluteDay + 1
	p.Status = "scheduled"
	w.Pending = append(w.Pending, Pending{ID: p.ID, At: p.Activate, Actor: p.Author, Plot: p.Plot, Federation: p.Federation, Input: i})
}

func ratifyKey(plot, fed int, in ProposalInput) string {
	return fmt.Sprintf("%d/%d/%s/%s/%d", plot, fed, in.Key, canonical(in.Rule), in.Target)
}
func (w *World) charterAuthorized(a *Agent, p *Proposal) bool {
	plot := w.govPlot(a.Plot)
	if plot == nil {
		return false
	}
	r := plot.Rules["charterMandate"]
	if r.Mode == "officers" && (len(r.Members) == 0 || includes(r.Members, a.ID)) {
		return true
	}
	if w.office(a, "charter") {
		return true
	}
	in := p.Input
	if in.Kind == "federationAdmit" {
		in.Key = "admit"
	}
	if in.Kind == "federationDissolve" {
		in.Key = "dissolve"
	}
	if in.Kind == "federationRepeal" {
		in.Key = "repeal:" + in.Key
	}
	return w.politicalState().Ratifications[ratifyKey(a.Plot, p.Federation, in)]
}

func (w *World) completeFormations() {
	ps := w.politicalState()
	keys := make([]string, 0, len(ps.Formations))
	for k := range ps.Formations {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if w.rng != nil {
		w.rng.Shuffle(len(keys), func(i, j int) { keys[i], keys[j] = keys[j], keys[i] })
	}
	reservedPlots := map[int]bool{}
	for _, a := range ps.Formations {
		if a.Scheduled {
			for _, id := range a.Members {
				reservedPlots[id] = true
			}
		}
	}
	for _, key := range keys {
		f := ps.Formations[key]
		if f.Scheduled {
			continue
		}
		valid := true
		for _, id := range f.Members {
			p := w.govPlot(id)
			if p == nil || !p.Government || p.Federation >= 0 {
				valid = false
			}
		}
		if w.AbsoluteDay >= f.First+w.Settings.FoundingWindow || !valid {
			w.releasePledges(f.Members, "federation")
			delete(ps.Formations, key)
			continue
		}
		all := true
		for _, id := range f.Members {
			if !f.Approvals[id] {
				all = false
			}
		}
		conflict := false
		for _, id := range f.Members {
			if reservedPlots[id] {
				conflict = true
			}
		}
		if conflict {
			for _, p := range w.Proposals {
				if p.Input.Kind == "federationFound" && canonical(uniqueInts(p.Input.Members)) == key && p.Status == "approved" {
					p.Status = "cancelled"
					p.Reason = "Another federation formation already reserves a member plot"
				}
			}
			delete(ps.Formations, key)
			continue
		}
		if !all || !w.chargePledges(f.Members, "federation", w.Settings.FederationCost) {
			continue
		}
		f.Scheduled = true
		for _, id := range f.Members {
			reservedPlots[id] = true
		}
		w.Pending = append(w.Pending, Pending{ID: "formation/" + key, At: w.AbsoluteDay + 1, Plot: -1, Federation: -1, Actor: -1, Input: ProposalInput{Kind: "createFederation", Members: f.Members}})
		for _, p := range w.Proposals {
			if p.Input.Kind == "federationFound" && canonical(uniqueInts(p.Input.Members)) == key && p.Status == "approved" {
				p.Status = "scheduled"
				p.Activate = w.AbsoluteDay + 1
			}
		}
	}
}

func proposalValue(in ProposalInput) string {
	switch in.Kind {
	case "found", "dissolve", "federationDissolve":
		return in.Kind
	case "policy", "federationPolicy":
		return canonical(struct {
			Key  string
			Rule Rule
		}{in.Key, in.Rule})
	case "repeal", "federationRepeal":
		return "repeal/" + in.Key
	case "office":
		return canonical(struct {
			Target int
			Rule   Rule
		}{in.Target, in.Rule})
	case "removeOffice":
		return fmt.Sprintf("remove/%d", in.Target)
	default:
		return actionIdentity(in)
	}
}

func normaliseProposal(in ProposalInput) ProposalInput {
	if in.Kind == "office" {
		in.Rule.Mode = "appoint"
	}
	in.Members = uniqueInts(in.Members)
	in.Rule.Members = uniqueInts(in.Rule.Members)
	powers := append([]string{}, in.Rule.Powers...)
	sort.Strings(powers)
	in.Rule.Powers = []string{}
	for _, p := range powers {
		if !has(in.Rule.Powers, p) {
			in.Rule.Powers = append(in.Rule.Powers, p)
		}
	}
	if in.Kind == "policy" && has([]string{"influence", "office", "representative"}, policyBase(in.Key)) {
		target := in.Rule.Target
		if in.Target != 0 {
			target = in.Target
		}
		target = policyTarget(in.Key, target)
		in.Rule.Target = target
		in.Key = fmt.Sprintf("%s:%d", policyBase(in.Key), target)
	}
	return in
}

func actionIdentity(in ProposalInput) string {
	switch in.Kind {
	case "distribution":
		return canonical(struct {
			Kind           string
			Target, Amount int
			Members        []int
		}{in.Kind, in.Target, in.Amount, in.Members})
	case "permitEntry", "permitExit":
		return fmt.Sprintf("%s/%d", in.Kind, in.Target)
	case "donation":
		source, destination := in.Source, in.Destination
		if source == "" {
			source = "field"
		}
		if destination == "" {
			destination = "field"
		}
		return canonical(struct {
			Kind                string
			Target, Amount      int
			Source, Destination string
		}{in.Kind, in.Target, in.Amount, source, destination})
	case "sanction":
		return canonical(struct {
			Kind, Sanction           string
			Target, Amount, Evidence int
		}{in.Kind, in.Sanction, in.Target, in.Amount, in.Evidence})
	default:
		return canonical(in)
	}
}
