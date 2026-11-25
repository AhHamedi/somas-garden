package society

import (
	"math"
	"testing"
)

func politicalWorld(t *testing.T, n, plots int) *World {
	t.Helper()
	s := DefaultSettings()
	s.Copies = n
	s.Plots = plots
	s.Months = 1
	s.Days = 30
	w, err := New(s, []Team{{Name: "Test", Policy: "sunchaser"}}, 41)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range w.Agents {
		a.Plot = 0
		a.Mind = 12
		a.VotingWeight, a.VotingTokens = s.VotingTokens, s.VotingTokens
	}
	w.Phase = "proposals"
	return w
}
func govern(w *World, plot int) {
	p := w.Plots[plot]
	p.Government = true
	p.Rules = map[string]Rule{}
	p.Roles = map[string]int{}
}
func yesVotes(w *World) map[int]Decision {
	ds := map[int]Decision{}
	for _, a := range w.Agents {
		votes := map[string]string{}
		for _, p := range w.Proposals {
			if p.Status == "open" {
				votes[p.ID] = "yes"
			}
		}
		ds[a.ID] = Decision{Votes: votes}
	}
	return ds
}
func tomorrow(w *World) {
	w.AbsoluteDay++
	w.Day++
	w.policyBoundary()
	w.grantVotingTokens()
}
func closeEnough(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func TestFoundingHasNoPoliciesAndDuplicatesChargeOnce(t *testing.T) {
	w := politicalWorld(t, 10, 1)
	for _, a := range w.Agents {
		a.Pledges["local"] = 1
	}
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "found"}, {Kind: "found", Plot: 99}}}})
	if len(w.Proposals) != 1 || w.Agents[0].Mind != 11 {
		t.Fatalf("expected one ballot and one proposal charge: %d, %v", len(w.Proposals), w.Agents[0].Mind)
	}
	w.votingPhase(yesVotes(w))
	if w.Plots[0].Government {
		t.Fatal("government activated on voting day")
	}
	if len(w.Pending) != 1 {
		t.Fatalf("duplicate founding scheduled %d times", len(w.Pending))
	}
	for _, a := range w.Agents {
		if a.Pledges["local"] != 0 {
			t.Fatal("founding cost not drawn once")
		}
	}
	tomorrow(w)
	p := w.Plots[0]
	if !p.Government || len(p.Rules) != 0 || len(p.Roles) != 0 {
		t.Fatalf("founding enabled powers: %+v", p)
	}
}

func TestConflictingVotesHighestSupportAndTiePreserve(t *testing.T) {
	for _, tie := range []bool{false, true} {
		t.Run(map[bool]string{false: "winner", true: "tie"}[tie], func(t *testing.T) {
			w := politicalWorld(t, 5, 1)
			govern(w, 0)
			w.Plots[0].Rules["quota"] = Rule{Mode: "limited", Amount: 2}
			w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 3}}, {Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 5}}}}})
			p, q := w.Proposals[0], w.Proposals[1]
			ds := map[int]Decision{}
			for i := 0; i < 5; i++ {
				v := map[string]string{p.ID: "no", q.ID: "no"}
				if i < 3 {
					v[p.ID] = "yes"
				}
				limit := 4
				if tie {
					limit = 3
				}
				if i < limit {
					v[q.ID] = "yes"
				}
				ds[i] = Decision{Votes: v}
			}
			w.votingPhase(ds)
			if w.Plots[0].Rules["quota"].Amount != 2 {
				t.Fatal("retroactive quota")
			}
			tomorrow(w)
			want := 5.0
			if tie {
				want = 2
			}
			if w.Plots[0].Rules["quota"].Amount != want {
				t.Fatalf("quota %v want %v", w.Plots[0].Rules["quota"], want)
			}
		})
	}
}

func TestUnlimitedProposalsConstrainedOnlyByMind(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	w.Settings.ProposalCost = .01
	list := []ProposalInput{}
	for i := 0; i < 120; i++ {
		list = append(list, ProposalInput{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: float64(i)}})
	}
	w.governancePhase(map[int]Decision{0: {Proposals: list}})
	if len(w.Proposals) != 120 {
		t.Fatalf("hidden proposal cap: %d", len(w.Proposals))
	}
	if !closeEnough(w.Agents[0].Mind, 10.8) {
		t.Fatalf("wrong proposal charge %f", w.Agents[0].Mind)
	}
}

func TestPledgeRoundingConservesExactCharge(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	for i, a := range w.Agents {
		a.Pledges["local"] = float64(i+1) / 10
	}
	before := 0.0
	for _, a := range w.Agents {
		before += a.Mind
	}
	if !w.chargeFoundingPledges(0, .100001) {
		t.Fatal("charge failed")
	}
	after := 0.0
	remaining := 0.0
	for _, a := range w.Agents {
		after += a.Mind
		remaining += a.Pledges["local"]
	}
	if !closeEnough(before-after, .100001) || !closeEnough(remaining, .499999) {
		t.Fatalf("rounding changed money %.9f %.9f", before-after, remaining)
	}
}

func TestTokenBudgetAndFrozenRuleFraction(t *testing.T) {
	w := politicalWorld(t, 4, 1)
	govern(w, 0)
	w.Settings.RuleFraction = .6
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{
		{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 2}},
		{Kind: "policy", Key: "harvestOrder", Rule: Rule{Mode: "random"}},
		{Kind: "elect", Key: "trade", Target: 0},
	}}})
	p, q, seat := w.Proposals[0], w.Proposals[1], w.Proposals[2]
	w.freezeBallots()
	// The configured rule threshold is frozen, and never applies to an election.
	w.Settings.RuleFraction = 1
	w.votingPhase(map[int]Decision{
		0: {OrderedVotes: []VoteChoice{{p.ID, "yes", 5}, {q.ID, "yes", 2}, {seat.ID, "yes", 1}}},
		1: {OrderedVotes: []VoteChoice{{p.ID, "no", 2}, {seat.ID, "yes", 1}}},
		2: {OrderedVotes: []VoteChoice{{p.ID, "no", 1}, {q.ID, "yes", 1}, {q.ID, "yes", 1}}},
		3: {OrderedVotes: []VoteChoice{{p.ID, "abstain", 0}, {seat.ID, "no", 5}}},
	})
	if p.Fraction != .6 || p.Yes != 5 || p.No != 3 || p.Total != 8 || p.Status != "scheduled" {
		t.Fatalf("wrong token tally %+v", p)
	}
	if q.Total != 0 || q.Status != "failed" || len(q.TokenSpends) != 0 {
		t.Fatalf("duplicate or over-budget vote counted: %+v", q)
	}
	if seat.Fraction != .5 || seat.Total != 7 || seat.Yes != 2 || seat.No != 5 || seat.Status != "failed" {
		t.Fatalf("wrong election tally: %+v", seat)
	}
	if w.Agents[0].VotingTokens != 0 || w.Agents[1].VotingTokens != 3 || w.Agents[2].VotingTokens != 5 || w.Agents[3].VotingTokens != 1 {
		t.Fatal("incorrect debits")
	}
}

func TestEveryGovernanceBallotCountsOnlyTokensCast(t *testing.T) {
	for _, input := range []ProposalInput{
		{Kind: "found"}, {Kind: "dissolve"},
		{Kind: "elect", Key: "trade", Target: 1}, {Kind: "revoke", Key: "trade", Target: 1},
		{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 2}}, {Kind: "repeal", Key: "quota"},
	} {
		t.Run(input.Kind, func(t *testing.T) {
			w := politicalWorld(t, 50, 1)
			fraction := .5
			w.Settings.RuleFraction = .95
			if input.Kind == "found" {
				w.Agents[49].Pledges["local"] = w.Settings.GovernmentCost
			} else {
				govern(w, 0)
				w.Plots[0].Rules["threshold"] = Rule{Mode: "tokens", Amount: .55}
			}
			switch input.Kind {
			case "revoke":
				w.Plots[0].Roles["trade"] = input.Target
			case "repeal":
				w.Plots[0].Rules["quota"] = Rule{Mode: "limited", Amount: 2}
				fraction = .55
			case "policy":
				fraction = .55
			}
			w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{input}}})
			if len(w.Proposals) != 1 {
				t.Fatal("missing ballot")
			}
			p := w.Proposals[0]
			w.votingPhase(map[int]Decision{
				0: {OrderedVotes: []VoteChoice{{p.ID, "yes", 3}}},
				1: {Votes: map[string]string{p.ID: "no"}},
				2: {Votes: map[string]string{p.ID: "no"}},
				3: {Votes: map[string]string{p.ID: "abstain"}},
			})
			if p.TallyBasis != "tokens" || p.Threshold != "tokens" || p.Fraction != fraction ||
				p.Yes != 3 || p.No != 2 || p.Abstain != 0 || p.Total != 5 || p.Status != "scheduled" {
				t.Fatalf("unexpected ballot result: %+v", p)
			}
		})
	}
}

func TestLegacyThresholdSettingsAndProposalsUseTokens(t *testing.T) {
	settings := DefaultSettings()
	if settings.RuleThreshold != "tokens" {
		t.Fatal("new games should default to tokens")
	}
	settings.RuleThreshold, settings.RuleFraction = "voters", .75
	w, err := New(settings, []Team{{Name: "Test", Policy: "sunchaser"}}, 41)
	if err != nil {
		t.Fatal(err)
	}
	if w.Settings.RuleThreshold != "tokens" || w.Settings.RuleFraction != .75 {
		t.Fatalf("legacy settings restored incorrectly: %+v", w.Settings)
	}
	govern(w, 0)
	a := w.Agents[0]
	a.Plot, a.Mind, a.VotingTokens = 0, 12, 6
	var motions []ProposalInput
	for _, mode := range []string{"voters", "tokens", "", "invalid"} {
		motions = append(motions, ProposalInput{Kind: "policy", Key: "threshold", Rule: Rule{Mode: mode, Amount: .8}})
	}
	w.governancePhase(map[int]Decision{a.ID: {Proposals: motions}})
	if len(w.Proposals) != 1 || w.Proposals[0].Input.Rule.Mode != "tokens" || a.Mind != 11 {
		t.Fatal("equivalent threshold changes should produce one token ballot")
	}
	p := w.Proposals[0]
	w.votingPhase(map[int]Decision{a.ID: {Votes: map[string]string{p.ID: "yes"}}})
	tomorrow(w)
	rule := w.Plots[0].Rules["threshold"]
	if p.Fraction != .75 || p.Status != "activated" || rule.Mode != "tokens" || rule.Amount != .8 {
		t.Fatalf("legacy threshold change produced ballot %+v and rule %+v", p, rule)
	}
}

func TestRuleThresholdEdgesAndAbstentions(t *testing.T) {
	for _, test := range []struct {
		fraction   float64
		yes, no, n int
		pass       bool
	}{
		{.5, 1, 0, 50, true}, {.5, 25, 25, 50, false}, {.75, 3, 1, 10, false}, {.75, 4, 1, 10, true},
		{1, 3, 0, 5, true}, {1, 3, 1, 5, false}, {.5, 0, 0, 5, false},
	} {
		p := &Proposal{TallyBasis: "tokens", Fraction: test.fraction, Electorate: map[int]int{}, Votes: map[int]string{}, TokenSpends: map[int]int{}}
		for i := 0; i < test.n; i++ {
			p.Electorate[i] = 1
			if i < test.yes {
				p.Votes[i] = "yes"
				p.TokenSpends[i] = 1
			} else if i < test.yes+test.no {
				p.Votes[i] = "no"
				p.TokenSpends[i] = 1
			} else if i == test.yes+test.no {
				p.Votes[i] = "abstain"
			}
		}
		if got := tally(p); got != test.pass || p.Total != test.yes+test.no || p.Abstain != 0 {
			t.Fatalf("tally %+v = %t with %d total and %d abstaining tokens", test, got, p.Total, p.Abstain)
		}
	}
}

func TestAllResidentsCanChangeTokenAllocationNextDay(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	w.Agents[0].VotingTokens = 0
	w.Agents[1].Harvested = 5
	w.Agents[2].Harvested = 1
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "policy", Key: "tokenAllocation", Rule: Rule{Mode: "productivity", Amount: 3, Limit: 2}}}}})
	if len(w.Proposals) != 1 {
		t.Fatal("a zero-balance resident could not propose")
	}
	w.votingPhase(yesVotes(w))
	tomorrow(w)
	if a := w.Agents[1]; a.VotingWeight != 3 || a.VotingTokens != 3 || w.Agents[0].VotingWeight != 5 || w.Agents[2].VotingWeight != 5 || w.Plots[0].Rules["tokenAllocation"].Mode != "restraint" {
		t.Fatalf("previous harvest grant = %d/%d", a.VotingWeight, a.VotingTokens)
	}
	w.governancePhase(map[int]Decision{1: {Proposals: []ProposalInput{{Kind: "policy", Key: "tokenAllocation", Rule: Rule{Mode: "alignment", Amount: 2, Limit: 1}}}}})
	id := w.Proposals[1].ID
	w.votingPhase(map[int]Decision{0: {Votes: map[string]string{id: "no"}}, 1: {Votes: map[string]string{id: "yes"}}, 2: {Votes: map[string]string{id: "yes"}}})
	tomorrow(w)
	if w.Agents[0].VotingTokens != 3 || w.Agents[1].VotingTokens != 3 || w.Agents[2].VotingTokens != 3 || w.Plots[0].Rules["tokenAllocation"].Mode != "participation" {
		t.Fatal("participation must count both sides equally")
	}
}

func TestUniversalProposalRightsDoNotRestoreRemovedInstitutions(t *testing.T) {
	w := politicalWorld(t, 2, 1)
	govern(w, 0)
	for _, k := range []string{"tax", "collection", "distribution", "inheritance", "proposers", "entry", "exit", "immigration", "office", "enforcement", "influence", "representative", "sanctions", "recordAccess", "federationPolicy", "quota:0"} {
		w.governancePhase(map[int]Decision{1: {Proposals: []ProposalInput{{Kind: "policy", Key: k, Rule: Rule{Mode: "on"}}}}})
	}
	for _, k := range []string{"federationFound", "sanction", "donation", "office", "removeOffice", "permitExit"} {
		w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: k}}}})
	}
	if len(w.Proposals) > 0 || w.Agents[1].Mind != 12 {
		t.Fatal("removed power entered a ballot or charged its proposer")
	}
}

func TestJusticeAndTradeRevocationPrecedesPendingActions(t *testing.T) {
	w := politicalWorld(t, 4, 2)
	w.Agents[3].Plot = 1
	govern(w, 0)
	w.governancePhase(map[int]Decision{1: {Proposals: []ProposalInput{
		{Kind: "elect", Key: "justice", Target: 0}, {Kind: "elect", Key: "trade", Target: 1},
		{Kind: "elect", Key: "trade", Target: 3},
	}}})
	if len(w.Proposals) != 2 {
		t.Fatal("non-local candidate accepted")
	}
	w.votingPhase(yesVotes(w))
	if w.roleHolder(0, "justice") != nil {
		t.Fatal("office activated on election day")
	}
	tomorrow(w)
	if !w.holdsRole(0, "justice") || !w.holdsRole(1, "trade") {
		t.Fatal("wrong role holders")
	}
	e := w.event("ration_breach", 2, 0, "excess harvest", 2)
	order := Decision{Orders: []Order{{Kind: "sanction", Target: 2, Evidence: e.ID, Sanction: "fine", Amount: 2}}}
	w.justicePhase(map[int]Decision{1: order})
	if len(w.Pending) != 0 || len(w.SanctionCases(0)) != 1 {
		t.Fatal("Trade acquired a Justice power")
	}
	w.Agents[2].Food = 4
	w.justicePhase(map[int]Decision{0: order})
	if len(w.Pending) != 1 || len(w.SanctionCases(0)) != 0 {
		t.Fatal("queued breach remained open")
	}
	w.governancePhase(map[int]Decision{1: {Proposals: []ProposalInput{{Kind: "revoke", Key: "justice", Target: 0}, {Kind: "revoke", Key: "trade", Target: 1}}}})
	w.votingPhase(yesVotes(w))
	tomorrow(w)
	if w.holdsRole(0, "justice") || w.holdsRole(1, "trade") || w.Agents[2].Food != 4 {
		t.Fatal("revoked power affected target at activation")
	}
	if w.politicalState().Sanctioned[e.ID] {
		t.Fatal("cancelled order used evidence")
	}
}

func TestJusticeCannotSanctionAnInventedOrSpentBreach(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	w.Plots[0].Roles["justice"] = 0
	target := w.Agents[1]
	target.Food = 5
	e := w.event("ration_breach", 1, 0, "took excess", 2)
	order := Order{Kind: "sanction", Target: 1, Evidence: e.ID, Sanction: "fine", Amount: 2}
	fake := order
	fake.Evidence += 10
	wrong := order
	wrong.Target = 2
	excess := order
	excess.Amount++
	w.justicePhase(map[int]Decision{0: {Orders: []Order{fake, wrong, excess, order, order}}})
	if len(w.Pending) != 1 {
		t.Fatalf("%d sanctions queued", len(w.Pending))
	}
	tomorrow(w)
	if target.Food != 3 || len(w.SanctionCases(0)) != 0 {
		t.Fatal("sanction missing or reusable")
	}
	w.justicePhase(map[int]Decision{0: {Orders: []Order{order}}})
	if len(w.Pending) != 0 {
		t.Fatal("same evidence reused")
	}
}

func TestSameMotionHasOneBallotAndIndependentPlotAndDay(t *testing.T) {
	w := politicalWorld(t, 51, 2)
	w.Agents[50].Plot = 1
	govern(w, 0)
	govern(w, 1)
	motion := ProposalInput{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 3}}
	submissions := map[int]Decision{}
	for _, a := range w.Agents {
		variant := motion
		variant.Target, variant.Plot, variant.Rule.Source = a.ID, 42, "irrelevant metadata"
		submissions[a.ID] = Decision{Proposals: []ProposalInput{motion, variant}}
	}
	w.governancePhase(submissions)
	if len(w.Proposals) != 2 || len(w.Proposals[0].Sponsors) != 50 || len(w.Proposals[1].Sponsors) != 1 {
		t.Fatal("motions should merge within each plot")
	}
	for _, a := range w.Agents {
		if a.Mind != 11 {
			t.Fatalf("resident %d paid more than once", a.ID)
		}
	}
	p := w.Proposals[0]
	votes := map[int]Decision{}
	for _, id := range p.Sponsors {
		choice := "no"
		if id == 0 {
			choice = "yes"
		}
		votes[id] = Decision{Votes: map[string]string{p.ID: choice}}
	}
	w.votingPhase(votes)
	if p.Yes != 1 || p.No != 49 || p.Status != "failed" || len(w.Pending) != 0 {
		t.Fatalf("split ballot loophole: %+v", p)
	}
	tomorrow(w)
	w.governancePhase(submissions)
	if len(w.Proposals) != 4 || w.Proposals[2].ID == p.ID {
		t.Fatal("a new day's ballot was lost")
	}
}

func TestVoteMindAndTokensAreDebitedTogether(t *testing.T) {
	w := politicalWorld(t, 4, 1)
	govern(w, 0)
	w.Settings.VoteCost = .5
	w.governancePhase(map[int]Decision{3: {Proposals: []ProposalInput{{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 1}}, {Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 2}}}}})
	p, q := w.Proposals[0], w.Proposals[1]
	a := w.Agents[0]
	a.Mind, a.Pledges["local"] = 1.5, 1
	w.Plots[0].Rules["tokenAllocation"] = Rule{Mode: "participation", Amount: 2, Limit: 1}
	w.votingPhase(map[int]Decision{
		0: {OrderedVotes: []VoteChoice{{p.ID, "no", 3}, {q.ID, "yes", 1}}},
		1: {OrderedVotes: []VoteChoice{{p.ID, "yes", 7}, {q.ID, "abstain", 0}}},
		2: {OrderedVotes: []VoteChoice{{p.ID, "yes", 2}}},
	})
	if a.Mind != 1 || a.PoliticalMind != .5 || a.VotingTokens != 3 || q.Votes[0] != "" || p.TokenSpends[0] != 3 {
		t.Fatal("ordered votes spent pledged mind or partially debited a rejected vote")
	}
	if w.Agents[1].VotingTokens != 6 || w.Agents[1].Mind != 12 || q.Votes[1] != "abstain" {
		t.Fatal("invalid vote or abstention cost resources")
	}
	tomorrow(w)
	if w.Agents[0].VotingTokens != 3 || w.Agents[2].VotingTokens != 3 || w.Agents[1].VotingTokens != 2 {
		t.Fatal("turnout should count accepted ballots on either side once")
	}
}
