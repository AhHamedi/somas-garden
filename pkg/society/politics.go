package society

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"reflect"
	"sort"
	"strings"
)

func (w *World) politicalState() *politicalState {
	if w.political == nil {
		w.political = &politicalState{Evidence: map[int]evidenceRecord{}, Sanctioned: map[int]bool{}, Aligned: map[int]int{}}
	}
	return w.political
}

func (w *World) govAgent(id int) *Agent {
	if id < 0 || id >= len(w.Agents) {
		return nil
	}
	return w.Agents[id]
}
func (w *World) govPlot(id int) *Plot {
	if id < 0 || id >= len(w.Plots) {
		return nil
	}
	return w.Plots[id]
}
func has(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}
func (w *World) setPledges(a *Agent, changes map[string]float64) {
	if a == nil || !a.Alive || a.Plot < 0 || w.Plots[a.Plot].Government {
		return
	}
	v, ok := changes["local"]
	if !ok || v < 0 || math.IsNaN(v) || math.IsInf(v, 0) {
		return
	}
	if v > a.Mind+1e-7 {
		w.reject(a, "Pledge exceeds available mind")
		return
	}
	if a.Pledges == nil {
		a.Pledges = map[string]float64{}
	}
	a.Pledges["local"] = roundMind(v)
	w.event("pledge", a.ID, a.Plot, "Reserved mind for founding", v)
}

// chargeFoundingPledges is all-or-nothing and uses millionths plus largest remainders.
func (w *World) chargeFoundingPledges(plot int, amount float64) bool {
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
		if a.Alive && a.Plot == plot {
			v := int64(math.Round(a.Pledges["local"] * 1e6))
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
		s.a.Pledges["local"] = roundMind(s.a.Pledges["local"] - v)
		s.a.Mind = roundMind(s.a.Mind - v)
		s.a.PoliticalMind = roundMind(s.a.PoliticalMind + v)
		w.event("funding", s.a.ID, s.a.Plot, "Paid pledged mind for founding", v)
	}
	return true
}
func (w *World) releaseFoundingPledges(plot int) {
	for _, a := range w.Agents {
		if a.Plot == plot {
			delete(a.Pledges, "local")
		}
	}
}

func (w *World) roleHolder(plotID int, role string) *Agent {
	p := w.govPlot(plotID)
	if p == nil || !p.Government {
		return nil
	}
	id, ok := p.Roles[role]
	if !ok {
		return nil
	}
	a := w.govAgent(id)
	if a == nil || !a.Alive || a.Plot != plotID {
		return nil
	}
	return a
}

func (w *World) holdsRole(id int, role string) bool {
	a := w.govAgent(id)
	return a != nil && w.roleHolder(a.Plot, role) == a
}

func validateRule(key string, r Rule) error {
	if math.IsNaN(r.Amount) || math.IsInf(r.Amount, 0) {
		return errors.New("rule amount must be finite")
	}
	switch key {
	case "harvestOrder":
		if r.Mode == "ranked" || r.Mode == "random" {
			return nil
		}
	case "quota":
		if r.Mode == "unlimited" || (r.Mode == "limited" && r.Amount >= 0 && r.Amount <= math.MaxInt32 && r.Amount == math.Trunc(r.Amount)) {
			return nil
		}
	case "threshold":
		if (r.Mode == "voters" || r.Mode == "tokens") && r.Amount > 0 && r.Amount <= 1 {
			return nil
		}
	case "tokenAllocation":
		if r.Amount < 1 || r.Amount > 10000 || r.Amount != math.Trunc(r.Amount) {
			return errors.New("daily base grant must be 1 to 10,000 whole tokens")
		}
		if r.Mode == "equal" || ((r.Mode == "productivity" || r.Mode == "alignment") && r.Limit > 0) {
			return nil
		}
	default:
		return errors.New("unknown rule")
	}
	return errors.New("invalid rule mode or parameters")
}

// Canonical inputs contain only the fields that actually affect a decision.
// Two ballots proposing the same change can therefore never conflict merely
// because one included irrelevant metadata.
func normaliseProposal(in ProposalInput) ProposalInput {
	switch in.Kind {
	case "found", "dissolve":
		return ProposalInput{Kind: in.Kind}
	case "elect", "revoke":
		return ProposalInput{Kind: in.Kind, Key: in.Key, Target: in.Target}
	case "repeal":
		return ProposalInput{Kind: in.Kind, Key: in.Key}
	case "policy":
		r := Rule{Mode: in.Rule.Mode}
		switch in.Key {
		case "threshold", "tokenAllocation":
			r.Amount = in.Rule.Amount
		case "quota":
			if r.Mode == "limited" {
				r.Amount = in.Rule.Amount
			}
		}
		if in.Key == "tokenAllocation" && r.Mode != "equal" {
			r.Limit = in.Rule.Limit
		}
		return ProposalInput{Kind: in.Kind, Key: in.Key, Rule: r}
	}
	return in
}

func (w *World) validateProposal(a *Agent, in ProposalInput) error {
	if a == nil || !a.Alive {
		return errors.New("only active residents can propose")
	}
	p := w.govPlot(a.Plot)
	if p == nil {
		return errors.New("plot unavailable")
	}
	if in.Kind == "found" {
		if p.Government {
			return errors.New("government already exists")
		}
		return nil
	}
	if !p.Government {
		return errors.New("found a government first")
	}
	switch in.Kind {
	case "dissolve":
		return nil
	case "policy":
		return validateRule(in.Key, in.Rule)
	case "repeal":
		if _, ok := p.Rules[in.Key]; !ok {
			return errors.New("rule is not in force")
		}
		return nil
	case "elect", "revoke":
		if in.Key != "justice" && in.Key != "trade" {
			return errors.New("unknown department")
		}
		candidate := w.govAgent(in.Target)
		if candidate == nil || !candidate.Alive || candidate.Plot != p.ID {
			return errors.New("candidate must be an active local resident")
		}
		holder := w.roleHolder(p.ID, in.Key)
		if in.Kind == "elect" && holder == candidate {
			return errors.New("candidate already holds this role")
		}
		if in.Kind == "revoke" && holder != candidate {
			return errors.New("resident does not hold this role")
		}
		return nil
	default:
		return errors.New("unknown proposal kind")
	}
}

func title(in ProposalInput) string {
	switch in.Kind {
	case "found":
		return "Found a government"
	case "dissolve":
		return "Dissolve the government"
	case "elect", "revoke":
		return fmt.Sprintf("%s resident %d · %s", in.Kind, in.Target+1, in.Key)
	case "policy":
		return in.Key + " · " + in.Rule.Mode
	case "repeal":
		return "Repeal " + in.Key
	case "sanction":
		return fmt.Sprintf("%s for resident %d", in.Sanction, in.Target+1)
	default:
		return in.Kind
	}
}

func (w *World) governancePhase(decisions map[int]Decision) {
	ps := w.politicalState()
	for _, a := range w.Agents {
		if !a.Alive {
			continue
		}
		d := decisions[a.ID]
		if len(d.Pledge) > 0 {
			w.setPledges(a, d.Pledge)
		}
		for _, input := range d.Proposals {
			in := normaliseProposal(input)
			if err := w.validateProposal(a, in); err != nil {
				w.event("proposal_rejected", a.ID, a.Plot, err.Error(), 0)
				continue
			}
			if !spend(a, w.Settings.ProposalCost) {
				w.event("proposal_rejected", a.ID, a.Plot, "Insufficient unpledged mind", 0)
				continue
			}
			ps.NextProposal++
			p := &Proposal{ID: fmt.Sprintf("m%d-p%d", w.Month, ps.NextProposal), Author: a.ID, Plot: a.Plot, Input: in, Title: title(in), Status: "open", Created: w.AbsoluteDay, Closes: w.AbsoluteDay}
			w.Proposals = append(w.Proposals, p)
			w.event("proposal", a.ID, a.Plot, p.Title, w.Settings.ProposalCost)
		}
	}
}

func (w *World) freezeBallots() {
	for _, p := range w.Proposals {
		if p.Status != "open" || p.Closes != w.AbsoluteDay || p.TallyBasis != "" {
			continue
		}
		plot := w.govPlot(p.Plot)
		if plot == nil || (p.Input.Kind != "found" && !plot.Government) {
			p.Status = "cancelled"
			continue
		}
		p.TallyBasis, p.Fraction = "voters", .5
		if p.Input.Kind == "policy" || p.Input.Kind == "repeal" {
			p.TallyBasis, p.Fraction = w.Settings.RuleThreshold, w.Settings.RuleFraction
			if rule, ok := plot.Rules["threshold"]; ok {
				p.TallyBasis, p.Fraction = rule.Mode, rule.Amount
			}
		}
		p.Threshold = p.TallyBasis
		p.Electorate = make(map[int]int)
		p.Votes = make(map[int]string)
		p.TokenSpends = make(map[int]int)
		for _, a := range w.residents(plot.ID) {
			p.Electorate[a.ID] = 1
		}
		if p.TallyBasis == "voters" {
			p.Total = len(p.Electorate)
		}
	}
}

func voteChoices(d Decision) []VoteChoice {
	if len(d.OrderedVotes) > 0 {
		return d.OrderedVotes
	}
	keys := make([]string, 0, len(d.Votes))
	for id := range d.Votes {
		keys = append(keys, id)
	}
	sort.Strings(keys)
	choices := make([]VoteChoice, 0, len(keys))
	for _, id := range keys {
		choices = append(choices, VoteChoice{Proposal: id, Choice: d.Votes[id]})
	}
	return choices
}

func (w *World) castVote(a *Agent, p *Proposal, c VoteChoice) {
	if p == nil || p.Electorate[a.ID] == 0 || p.Votes[a.ID] != "" {
		return
	}
	choice := strings.ToLower(c.Choice)
	if choice == "abstain" && c.Tokens == 0 {
		p.Votes[a.ID] = choice
		return
	}
	if choice != "yes" && choice != "no" {
		return
	}
	tokens := c.Tokens
	if tokens == 0 {
		tokens = 1
	}
	if tokens < 1 || (p.TallyBasis == "voters" && tokens != 1) || tokens > a.VotingTokens {
		w.event("vote_rejected", a.ID, a.Plot, "Invalid token spend on "+p.ID, 0)
		return
	}
	a.VotingTokens -= tokens
	p.Votes[a.ID] = choice
	p.TokenSpends[a.ID] = tokens
}

func tally(p *Proposal) bool {
	p.Yes, p.No, p.Abstain = 0, 0, 0
	for id := range p.Electorate {
		units := 1
		if p.TallyBasis == "tokens" {
			units = p.TokenSpends[id]
		}
		switch p.Votes[id] {
		case "yes":
			p.Yes += units
		case "no":
			p.No += units
		default:
			p.Abstain += units
		}
	}
	p.Total = p.Yes + p.No + p.Abstain
	if p.Total == 0 {
		return false
	}
	if p.Fraction == 1 {
		return p.Yes == p.Total
	}
	return float64(p.Yes)/float64(p.Total) > p.Fraction
}

func conflictKey(p *Proposal) string {
	subject := p.Input.Kind
	switch subject {
	case "elect", "revoke":
		subject = "role/" + p.Input.Key
	case "policy", "repeal":
		subject = "rule/" + p.Input.Key
	}
	return fmt.Sprintf("%d/%s", p.Plot, subject)
}

func (w *World) votingPhase(decisions map[int]Decision) {
	w.freezeBallots()
	open := map[string]*Proposal{}
	for _, p := range w.Proposals {
		if p.Status == "open" && p.Closes == w.AbsoluteDay {
			open[p.ID] = p
		}
	}
	for _, a := range w.Agents {
		if !a.Alive {
			continue
		}
		choices := voteChoices(decisions[a.ID])
		counts := make(map[string]int, len(choices))
		for _, c := range choices {
			counts[c.Proposal]++
		}
		for _, c := range choices {
			if counts[c.Proposal] == 1 {
				w.castVote(a, open[c.Proposal], c)
			}
		}
	}
	groups := map[string][]*Proposal{}
	var groupOrder []string
	foundingPlots := map[int]bool{}
	for _, p := range w.Proposals {
		if open[p.ID] == nil {
			continue
		}
		passed := tally(p)
		for id, choice := range p.Votes {
			if (passed && choice == "yes") || (!passed && choice == "no") {
				w.politicalState().Aligned[id]++
			}
		}
		if p.Input.Kind == "found" {
			foundingPlots[p.Plot] = true
		}
		if passed {
			p.Status = "passed"
			key := conflictKey(p)
			if groups[key] == nil {
				groupOrder = append(groupOrder, key)
			}
			groups[key] = append(groups[key], p)
		} else {
			p.Status, p.Reason = "failed", "Insufficient support"
		}
		w.event("ballot", p.Author, p.Plot, fmt.Sprintf("%s received %d of %d %s", p.Title, p.Yes, p.Total, p.TallyBasis), 0)
	}
	for _, key := range groupOrder {
		w.resolveBallots(groups[key])
	}
	for id := range foundingPlots {
		w.releaseFoundingPledges(id)
	}
}

func (w *World) resolveBallots(group []*Proposal) {
	winner := group[0]
	tied := false
	for _, p := range group[1:] {
		if p.Yes > winner.Yes {
			winner, tied = p, false
		} else if p.Yes == winner.Yes {
			if !reflect.DeepEqual(p.Input, winner.Input) {
				tied = true
			}
		}
	}
	for _, p := range group {
		if tied {
			p.Status, p.Reason = "tied", "Equal support for conflicting decisions"
		} else if p != winner {
			p.Status, p.Reason = "superseded", "Another ballot determines this decision"
		}
	}
	if tied {
		return
	}
	if winner.Input.Kind == "found" && !w.chargeFoundingPledges(winner.Plot, w.Settings.GovernmentCost) {
		winner.Status, winner.Reason = "failed", "Insufficient founding pledges"
		return
	}
	winner.Status, winner.Activate = "scheduled", w.AbsoluteDay+1
	w.Pending = append(w.Pending, Pending{ID: winner.ID, At: winner.Activate, Actor: winner.Author, Plot: winner.Plot, Input: winner.Input})
}

// Refresh after today's laws activate, while Harvested still describes yesterday.
func (w *World) grantVotingTokens() {
	ps := w.politicalState()
	for _, a := range w.Agents {
		a.VotingWeight, a.VotingTokens = 0, 0
		if !a.Alive {
			continue
		}
		grant := w.Settings.VotingTokens
		if p := w.govPlot(a.Plot); p != nil {
			if r, ok := p.Rules["tokenAllocation"]; ok {
				grant = int(r.Amount)
				switch r.Mode {
				case "productivity":
					grant += a.Harvested / r.Limit
				case "alignment":
					grant += ps.Aligned[a.ID] / r.Limit
				}
			}
		}
		a.VotingWeight, a.VotingTokens = grant, grant
	}
	ps.Aligned = map[int]int{}
}
