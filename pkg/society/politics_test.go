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
	if len(w.Proposals) != 2 {
		t.Fatalf("proposals %d", len(w.Proposals))
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

func TestTokensCannotBeSpentTwiceAndRulesCanCountTokens(t *testing.T) {
	w := politicalWorld(t, 4, 1)
	govern(w, 0)
	w.Settings.RuleThreshold = "tokens"
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{
		{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 2}},
		{Kind: "policy", Key: "harvestOrder", Rule: Rule{Mode: "random"}},
		{Kind: "elect", Key: "trade", Target: 0},
	}}})
	p, q, seat := w.Proposals[0], w.Proposals[1], w.Proposals[2]
	w.freezeBallots()
	// The configured rule threshold is frozen, and never applies to an election.
	w.Settings.RuleThreshold = "voters"
	w.votingPhase(map[int]Decision{
		0: {OrderedVotes: []VoteChoice{{p.ID, "yes", 5}, {q.ID, "yes", 2}, {seat.ID, "yes", 1}}},
		1: {OrderedVotes: []VoteChoice{{p.ID, "no", 2}, {seat.ID, "yes", 1}}},
		2: {OrderedVotes: []VoteChoice{{p.ID, "no", 1}, {q.ID, "yes", 1}, {q.ID, "yes", 1}}},
		3: {OrderedVotes: []VoteChoice{{p.ID, "abstain", 0}, {seat.ID, "yes", 5}}},
	})
	if p.TallyBasis != "tokens" || p.Yes != 5 || p.No != 3 || p.Total != 8 || p.Status != "scheduled" {
		t.Fatalf("wrong token tally %+v", p)
	}
	if q.Total != 0 || q.Status != "failed" || len(q.TokenSpends) != 0 {
		t.Fatalf("duplicate or over-budget vote counted: %+v", q)
	}
	if seat.Total != 4 || seat.Yes != 2 || seat.Status != "failed" || seat.TallyBasis != "voters" {
		t.Fatalf("election did not require headcount majority: %+v", seat)
	}
	if w.Agents[0].VotingTokens != 0 || w.Agents[1].VotingTokens != 3 || w.Agents[2].VotingTokens != 5 || w.Agents[3].VotingTokens != 6 {
		t.Fatal("incorrect debits")
	}
}

func TestRuleThresholdEdgesAndAbstentions(t *testing.T) {
	for _, test := range []struct {
		basis      string
		fraction   float64
		yes, no, n int
		pass       bool
	}{
		{"voters", .75, 3, 0, 4, false}, {"voters", .75, 4, 0, 4, true}, {"voters", 1, 3, 0, 4, false}, {"voters", 1, 4, 0, 4, true},
		{"tokens", 1, 3, 0, 5, true}, {"tokens", 1, 3, 1, 5, false}, {"tokens", .5, 0, 0, 5, false},
	} {
		p := &Proposal{TallyBasis: test.basis, Fraction: test.fraction, Electorate: map[int]int{}, Votes: map[int]string{}, TokenSpends: map[int]int{}}
		for i := 0; i < test.n; i++ {
			p.Electorate[i] = 1
			if i < test.yes {
				p.Votes[i] = "yes"
				p.TokenSpends[i] = 1
			} else if i < test.yes+test.no {
				p.Votes[i] = "no"
				p.TokenSpends[i] = 1
			}
		}
		if got := tally(p); got != test.pass {
			t.Fatalf("tally %+v = %t", test, got)
		}
	}
}

func TestAllResidentsCanChangeTokenAllocationNextDay(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	w.Agents[0].VotingTokens = 0
	w.Agents[1].Harvested = 5
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "policy", Key: "tokenAllocation", Rule: Rule{Mode: "productivity", Amount: 3, Limit: 2}}}}})
	if len(w.Proposals) != 1 {
		t.Fatal("a zero-balance resident could not propose")
	}
	w.votingPhase(yesVotes(w))
	tomorrow(w)
	if a := w.Agents[1]; a.VotingWeight != 5 || a.VotingTokens != 5 {
		t.Fatalf("previous harvest grant = %d/%d", a.VotingWeight, a.VotingTokens)
	}
	w.governancePhase(map[int]Decision{1: {Proposals: []ProposalInput{{Kind: "policy", Key: "tokenAllocation", Rule: Rule{Mode: "alignment", Amount: 2, Limit: 1}}}}})
	id := w.Proposals[1].ID
	w.votingPhase(map[int]Decision{0: {Votes: map[string]string{id: "no"}}, 1: {Votes: map[string]string{id: "yes"}}, 2: {Votes: map[string]string{id: "yes"}}})
	tomorrow(w)
	if w.Agents[0].VotingTokens != 2 || w.Agents[1].VotingTokens != 3 || w.Agents[2].VotingTokens != 3 {
		t.Fatal("alignment rule did not use yesterday's outcomes")
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
