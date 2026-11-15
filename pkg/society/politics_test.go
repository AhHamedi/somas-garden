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
	w, err := New(s, []Team{{Name: "Test", Policy: "thinker"}}, 41)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range w.Agents {
		a.Plot = 0
		a.Mind = 12
		a.Influence = 1
	}
	w.Phase = "proposals"
	return w
}
func govern(w *World, plot int) {
	p := w.Plots[plot]
	p.Government = true
	p.Rules = map[string]Rule{}
	p.Officers = map[int]Office{}
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
	w.fundServices()
	w.executePending()
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
	if !p.Government || len(p.Rules) != 0 || len(p.Officers) != 0 || p.Reserve != 0 || p.HardFunded || p.RecordsFunded {
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

func TestOrderedVotesRespectBudgetAndRejectDuplicates(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "policy", Key: "records", Rule: Rule{Mode: "on"}}, {Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 3}}}}})
	p, q := w.Proposals[0], w.Proposals[1]
	w.Agents[1].Mind = .1
	w.Agents[2].Mind = 1
	w.votingPhase(map[int]Decision{1: {OrderedVotes: []VoteChoice{{q.ID, "yes"}, {p.ID, "yes"}}}, 2: {OrderedVotes: []VoteChoice{{p.ID, "yes"}, {p.ID, "no"}}}})
	if q.Votes[1] != "yes" || p.Votes[1] != "" {
		t.Fatal("ordered vote priority ignored")
	}
	if p.Votes[2] != "" || w.Agents[2].Mind != 1 {
		t.Fatal("duplicate choices consumed mind or voted")
	}
}

func TestBallotSnapshotsInfluenceAndAbstention(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	w.Agents[0].Influence = 3
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 3}}}}})
	w.freezeBallots()
	w.Agents[0].Influence = 0
	p := w.Proposals[0]
	before := w.Agents[1].Mind
	w.votingPhase(map[int]Decision{0: {Votes: map[string]string{p.ID: "yes"}}, 1: {Votes: map[string]string{p.ID: "abstain"}}})
	if p.Total != 5 || p.Yes != 3 || p.Status != "scheduled" {
		t.Fatalf("snapshot lost: %+v", p)
	}
	if w.Agents[1].Mind != before {
		t.Fatal("abstention charged")
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

func TestStorageTaxCancelsEscrowAndConservesCarrots(t *testing.T) {
	w := politicalWorld(t, 2, 1)
	govern(w, 0)
	p := w.Plots[0]
	p.Rules["tax"] = Rule{Mode: "percent", Amount: 50, Exempt: 4}
	a := w.Agents[0]
	a.Food = 12
	w.Offers = []Offer{{ID: 1, From: 0, To: 1, Amount: 10, Expires: 2}}
	w.collectGovernment("tax")
	if a.Food != 8 || p.Reserve != 4 || len(w.Offers) != 0 {
		t.Fatalf("tax/escrow wrong food=%d reserve=%d offers=%d", a.Food, p.Reserve, len(w.Offers))
	}
	p.Reserve = p.ReserveCapacity
	w.collectGovernment("tax")
	if a.Food != 8 {
		t.Fatal("full reserve deleted tax food")
	}
}

func TestPostHarvestPercentageUsesOpeningStock(t *testing.T) {
	w := politicalWorld(t, 2, 1)
	govern(w, 0)
	p := w.Plots[0]
	p.Stock = 20
	p.ReserveCapacity = 100
	p.Rules["collection"] = Rule{Mode: "percentAfter", Amount: 25}
	w.collectGovernment("before")
	p.Stock -= 8
	w.collectGovernment("after")
	if p.Reserve != 5 || p.Stock != 7 {
		t.Fatalf("collection used post-harvest baseline: %d/%d", p.Reserve, p.Stock)
	}
}

func TestServicePriorityAndInsufficientFundsAreAtomic(t *testing.T) {
	w := politicalWorld(t, 50, 1)
	govern(w, 0)
	p := w.Plots[0]
	p.Rules["enforcement"] = Rule{Mode: "hard"}
	p.Rules["records"] = Rule{Mode: "on"}
	w.Agents[0].Pledges["local"] = 1.5
	w.fundServices()
	if p.HardFunded || p.RecordsFunded || w.Agents[0].Pledges["local"] != 1.5 {
		t.Fatal("partial service charge")
	}
	w.Agents[0].Pledges["local"] = 3
	w.fundServices()
	if !p.HardFunded || p.RecordsFunded || w.Agents[0].Pledges["local"] != 1 {
		t.Fatal("wrong service priority")
	}
}

func TestOfficerScopeDailyLimitDelayAndRevocation(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	p := w.Plots[0]
	p.Reserve = 10
	p.Officers[0] = Office{Agent: 0, Powers: []string{"distribution"}, Limit: 6}
	w.officerPhase(map[int]Decision{0: {Orders: []Order{{Kind: "distribution", Target: 1, Amount: 4}, {Kind: "distribution", Target: 2, Amount: 2}, {Kind: "distribution", Target: 2, Amount: 1}, {Kind: "distribution", Target: 0, Amount: 1}}}})
	if len(w.Pending) != 2 || p.Reserve != 10 {
		t.Fatal("officer limits or delayed execution failed")
	}
	tomorrow(w)
	if w.Agents[1].Food != 4 || w.Agents[2].Food != 2 || p.Reserve != 4 {
		t.Fatal("officer transfer failed")
	}
	w.officerPhase(map[int]Decision{0: {Orders: []Order{{Kind: "distribution", Target: 1, Amount: 2}}}})
	delete(p.Officers, 0)
	tomorrow(w)
	if p.Reserve != 4 {
		t.Fatal("revoked officer spent treasury")
	}
}

func TestRecordPermissionsAndEvidenceAreRequired(t *testing.T) {
	w := politicalWorld(t, 3, 2)
	govern(w, 0)
	govern(w, 1)
	w.Agents[2].Plot = 1
	p := w.Plots[0]
	p.Rules["quota"] = Rule{Mode: "limited", Amount: 2}
	p.Rules["sanctions"] = Rule{Mode: "field", Powers: []string{"fine"}}
	p.RecordsFunded = true
	w.harvest(map[int]Decision{1: {Harvest: 4}})
	e := w.Events[len(w.Events)-1]
	for _, x := range w.Events {
		if x.Kind == "ration_breach" {
			e = x
		}
	}
	in := ProposalInput{Kind: "sanction", Target: 1, Evidence: e.ID, Sanction: "fine", Amount: 3}
	if err := w.validateSanction(w.Agents[0], in); err == nil {
		t.Fatal("guessed event ID bypassed paid records")
	}
	rows, err := w.ReadRecords(0, 0, 1, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	w.reads[0] = rows
	if err := w.validateSanction(w.Agents[0], in); err != nil {
		t.Fatal(err)
	}
	if _, err = w.ReadRecords(2, 0, -1, 0, 0); err == nil {
		t.Fatal("outsider read private records")
	}
	p.Rules["recordAccess"] = Rule{Mode: "named", Members: []int{1}}
	if _, err = w.ReadRecords(0, 0, -1, 0, 0); err == nil {
		t.Fatal("record access ignored")
	}
}

func TestSanctionsNeedApplicationAndCannotRepeat(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	p := w.Plots[0]
	p.Stock = 0
	p.Rules["sanctions"] = Rule{Mode: "field", Powers: []string{"fine"}}
	w.Agents[1].Food = 2
	e := w.event("ration_breach", 1, 0, "Breach", 2)
	e.Breach = true
	w.Events[len(w.Events)-1] = e
	w.reads[0] = []Event{e}
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "sanction", Target: 1, Evidence: e.ID, Sanction: "fine", Amount: 3}}}})
	w.votingPhase(yesVotes(w))
	tomorrow(w)
	if w.Agents[1].Food != 2 {
		t.Fatal("vote applied fine without application")
	}
	cases := w.SanctionCases(0)
	if len(cases) != 1 {
		t.Fatal("proposer lacks application case")
	}
	w.officerPhase(map[int]Decision{0: {Orders: []Order{{Kind: "applySanction", Authorization: cases[0].ID}}}})
	tomorrow(w)
	if w.Agents[1].Food != 0 || p.Stock != 2 {
		t.Fatal("fine failed partial transfer")
	}
	if err := w.validateSanction(w.Agents[0], ProposalInput{Kind: "sanction", Target: 1, Evidence: e.ID, Sanction: "fine", Amount: 3}); err == nil {
		t.Fatal("repeated sanction accepted")
	}
}

func TestEntryExitPermitsAndFederationFallback(t *testing.T) {
	w := politicalWorld(t, 3, 2)
	govern(w, 0)
	govern(w, 1)
	w.Agents[2].Plot = 1
	p, q := w.Plots[0], w.Plots[1]
	p.Rules["exit"] = Rule{Mode: "notice", Amount: 1}
	q.Rules["entry"] = Rule{Mode: "closed"}
	if w.permitMove(w.Agents[0], 1) {
		t.Fatal("notice ignored")
	}
	w.AbsoluteDay++
	if w.permitMove(w.Agents[0], 1) {
		t.Fatal("closed entry ignored")
	}
	f := &Federation{ID: 1, Plots: []int{0, 1}, Rules: map[string]Rule{"immigration": {Mode: "open"}}, Funded: true}
	w.Federations = []*Federation{f}
	p.Federation = 1
	q.Federation = 1
	if !w.permitMove(w.Agents[0], 1) {
		t.Fatal("open passage failed")
	}
	f.Funded = false
	if w.permitMove(w.Agents[0], 1) {
		t.Fatal("unfunded federation did not restrict entry")
	}
}

func TestFederationFormationNoPowersAndRepresentation(t *testing.T) {
	w := politicalWorld(t, 6, 3)
	for i := 0; i < 3; i++ {
		govern(w, i)
	}
	for i, a := range w.Agents {
		a.Plot = i / 2
		a.Pledges["federation"] = 1
	}
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "federationFound", Members: []int{0, 1, 2}}}}, 2: {Proposals: []ProposalInput{{Kind: "federationFound", Members: []int{0, 1, 2}}}}, 4: {Proposals: []ProposalInput{{Kind: "federationFound", Members: []int{0, 1, 2}}}}})
	w.votingPhase(yesVotes(w))
	for _, p := range w.Proposals {
		if p.Status != "approved" || p.Reason != "Waiting for all member approvals and founding mind" {
			t.Fatalf("unfunded formation must explain the pending requirement: %+v", p)
		}
	}
	for _, a := range w.Agents {
		a.Pledges["federation"] = 9
	}
	w.completeFormations()
	for _, p := range w.Proposals {
		if p.Status != "scheduled" || p.Reason != "" || p.Activate != w.AbsoluteDay+1 {
			t.Fatalf("funded formation retained a stale waiting reason: %+v", p)
		}
	}
	if len(w.Federations) != 0 {
		t.Fatal("same-day federation")
	}
	// Activation must also clean an older scheduled ballot's stale explanation.
	w.Proposals[0].Reason = "Waiting for all member approvals and founding mind"
	tomorrow(w)
	if len(w.Federations) != 1 {
		t.Fatal("federation failed to form")
	}
	for _, p := range w.Proposals {
		if p.Status != "activated" || p.Reason != "" {
			t.Fatalf("activated formation retained a stale waiting reason: %+v", p)
		}
	}
	f := w.Federations[0]
	if len(f.Rules) != 0 || f.Funded {
		t.Fatal("federation enabled initial services")
	}
	for _, p := range w.Plots {
		if len(p.Officers) != 0 {
			t.Fatal("automatic representative")
		}
	}
	for _, a := range w.Agents {
		w.Plots[a.Plot].Officers[a.ID] = Office{Agent: a.ID, Powers: []string{"federationPropose", "federationVote"}}
		w.Plots[a.Plot].Rules["charterMandate"] = Rule{Mode: "officers"}
	}
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "federationPolicy", Federation: f.ID, Key: "gifts", Rule: Rule{Mode: "on"}}}}})
	w.votingPhase(yesVotes(w))
	q := w.Proposals[len(w.Proposals)-1]
	if q.Total != 3 || q.Yes != 3 || q.Threshold != "unanimous" {
		t.Fatalf("plot voting wrong: %+v", q)
	}
	tomorrow(w)
	if !on(f.Rules["gifts"]) {
		t.Fatal("federation charter did not activate")
	}
}

func TestFederationRatificationAndStrictRepresentativeMajority(t *testing.T) {
	w := politicalWorld(t, 6, 3)
	for i := 0; i < 3; i++ {
		govern(w, i)
	}
	for i, a := range w.Agents {
		if i < 3 {
			a.Plot = 0
		} else if i < 5 {
			a.Plot = 1
		} else {
			a.Plot = 2
		}
		w.Plots[a.Plot].Officers[a.ID] = Office{Agent: a.ID, Powers: []string{"federationPropose", "federationVote"}}
	}
	f := &Federation{ID: 1, Plots: []int{0, 1, 2}, Rules: map[string]Rule{}}
	w.Federations = []*Federation{f}
	for _, p := range w.Plots {
		p.Federation = 1
	}
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "federationPolicy", Federation: 1, Key: "gifts", Rule: Rule{Mode: "on"}}}}})
	w.votingPhase(yesVotes(w))
	q := w.Proposals[0]
	if q.Yes != 0 {
		t.Fatal("federation bypassed resident charter authority")
	}
	for _, p := range w.Plots {
		p.Rules["charterMandate"] = Rule{Mode: "officers"}
	}
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "federationPolicy", Federation: 1, Key: "gifts", Rule: Rule{Mode: "on"}}}}})
	q = w.Proposals[1]
	ds := map[int]Decision{}
	for id, v := range []string{"yes", "yes", "abstain", "yes", "no", "yes"} {
		ds[id] = Decision{Votes: map[string]string{q.ID: v}}
	}
	w.votingPhase(ds)
	if q.Yes != 2 || q.Abstain != 1 || q.Status != "failed" {
		t.Fatalf("strict representative tally %+v", q)
	}
}

func TestDonationCapacityAndFedFunding(t *testing.T) {
	w := politicalWorld(t, 4, 2)
	govern(w, 0)
	govern(w, 1)
	w.Agents[2].Plot = 1
	w.Agents[3].Plot = 1
	p, q := w.Plots[0], w.Plots[1]
	f := &Federation{ID: 1, Plots: []int{0, 1}, Rules: map[string]Rule{"donations": {Mode: "on", Limit: 10}}, Funded: true}
	w.Federations = []*Federation{f}
	p.Federation = 1
	q.Federation = 1
	p.Stock = 20
	q.Stock = q.Capacity - 3
	in := ProposalInput{Kind: "donation", Target: 1, Amount: 10, Source: "field", Destination: "field"}
	if err := w.donate(p, in, 0); err != nil {
		t.Fatal(err)
	}
	if p.Stock != 17 || q.Stock != q.Capacity {
		t.Fatal("donation overflow lost food")
	}
	f.Funded = false
	if err := w.donate(p, in, 0); err == nil {
		t.Fatal("unfunded donation allowed")
	}
}

func TestDeadlockFallbackAndEmptyGovernmentDissolution(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	p := w.Plots[0]
	p.Rules["proposers"] = Rule{Mode: "officers"}
	for _, a := range w.Agents {
		a.Influence = 3
	}
	w.restorePoliticalContinuity()
	if _, exists := p.Rules["proposers"]; exists {
		t.Fatal("proposal deadlock not reset")
	}
	for _, a := range w.Agents {
		if a.Influence != 1 {
			t.Fatal("influence not jointly restored")
		}
	}
	p.Reserve = 10
	p.Stock = p.Capacity - 3
	for _, a := range w.Agents {
		a.Alive = false
	}
	w.dissolveEmpty()
	if p.Government || p.Reserve != 0 || p.Stock != p.Capacity {
		t.Fatal("empty institution did not dissolve")
	}
}

func TestFederationJoinAndExitKeepLocalGovernment(t *testing.T) {
	w := politicalWorld(t, 6, 3)
	for i := range w.Plots {
		govern(w, i)
	}
	for i, a := range w.Agents {
		a.Plot = i / 2
	}
	f := &Federation{ID: 1, Plots: []int{0, 1}, Rules: map[string]Rule{}}
	w.Federations = []*Federation{f}
	w.Plots[0].Federation = 1
	w.Plots[1].Federation = 1
	if err := w.applyInstitution(Pending{Actor: 4, Plot: 2, Input: ProposalInput{Kind: "federationJoin", Federation: 1}}); err != nil {
		t.Fatal(err)
	}
	w.Agents[4].Pledges["federation"] = 5
	w.Agents[5].Pledges["federation"] = 5
	if err := w.applyInstitution(Pending{Actor: 0, Plot: 0, Federation: 1, Input: ProposalInput{Kind: "federationAdmit", Target: 2, Federation: 1}}); err != nil {
		t.Fatal(err)
	}
	if len(f.Plots) != 3 || w.Plots[2].Federation != 1 {
		t.Fatal("joining failed")
	}
	if w.Agents[4].Pledges["federation"] != 0 {
		t.Fatal("joining fee missing")
	}
	if err := w.applyInstitution(Pending{Actor: 4, Plot: 2, Input: ProposalInput{Kind: "federationLeave"}}); err != nil {
		t.Fatal(err)
	}
	if w.Plots[2].Federation < 0 {
		t.Fatal("exit notice was not observed")
	}
	tomorrow(w)
	if w.Plots[2].Federation != -1 || !w.Plots[2].Government || f.Dissolved {
		t.Fatal("leaving damaged local government or remaining federation")
	}
}

func TestDisputeWaitsFiveCyclesAndExecutesOnlyPublicRemedy(t *testing.T) {
	w := politicalWorld(t, 6, 3)
	for i := range w.Plots {
		govern(w, i)
		w.Plots[i].Federation = 1
	}
	for i, a := range w.Agents {
		a.Plot = i / 2
		w.Plots[a.Plot].Officers[a.ID] = Office{Agent: a.ID, Powers: []string{"federationPropose", "federationVote"}}
	}
	f := &Federation{ID: 1, Plots: []int{0, 1, 2}, Rules: map[string]Rule{"disputes": {Mode: "on", Powers: []string{"transfer"}, Limit: 5}}, Funded: true}
	w.Federations = []*Federation{f}
	w.Plots[0].Reserve = 9
	w.Plots[1].Reserve = 0
	beforeFood := w.Agents[0].Food
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{{Kind: "dispute", Federation: 1, Key: "transfer", Plot: 0, Target: 1, Amount: 5}}}})
	p := w.Proposals[0]
	w.votingPhase(yesVotes(w))
	if p.Status != "open" || p.Closes != 5 {
		t.Fatal("dispute skipped five-cycle window")
	}
	w.AbsoluteDay = 5
	w.Day = 5
	w.votingPhase(yesVotes(w))
	if p.Status != "scheduled" || p.Yes != 3 {
		t.Fatal("dispute vote failed")
	}
	w.AbsoluteDay = 6
	w.executePending()
	if w.Plots[0].Reserve != 4 || w.Plots[1].Reserve != 5 || w.Agents[0].Food != beforeFood {
		t.Fatal("dispute transfer did not stay within public reserves")
	}
}

func TestRepealingOfficeAndInfluenceRevokesEffects(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	p := w.Plots[0]
	if err := w.enactLocal(p, "office:0", Rule{Mode: "appoint", Powers: []string{"distribution"}, Limit: 4}); err != nil {
		t.Fatal(err)
	}
	if err := w.enactLocal(p, "influence:1", Rule{Amount: 4}); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"office:0", "influence:1"} {
		if err := w.applyInstitution(Pending{Actor: 2, Plot: 0, Input: ProposalInput{Kind: "repeal", Key: key}}); err != nil {
			t.Fatal(err)
		}
	}
	if w.office(w.Agents[0], "distribution") || w.Agents[1].Influence != w.Settings.StartingInfluence {
		t.Fatal("repealed policy left effects behind")
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
	if !w.chargePledges([]int{0}, "local", .100001) {
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

func TestSanctionTypesAreFrozenAtBreachAndMustRemainEnabled(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	p := w.Plots[0]
	p.Rules["quota"] = Rule{Mode: "limited", Amount: 2}
	p.Rules["sanctions"] = Rule{Mode: "field", Powers: []string{"warning"}}
	p.RecordsFunded = true
	w.harvest(map[int]Decision{1: {Harvest: 4}})
	var receipt Event
	for _, e := range w.Events {
		if e.Kind == "ration_breach" {
			receipt = e
		}
	}
	if receipt.ID == 0 {
		t.Fatal("missing breach receipt")
	}
	w.reads[0] = []Event{receipt}
	p.Rules["sanctions"] = Rule{Mode: "field", Powers: []string{"warning", "fine"}}
	fine := ProposalInput{Kind: "sanction", Target: 1, Evidence: receipt.ID, Sanction: "fine", Amount: 3}
	if err := w.validateSanction(w.Agents[0], fine); err == nil {
		t.Fatal("newly enabled fine punished an older breach")
	}
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{fine}}})
	if len(w.Proposals) != 0 {
		t.Fatal("retroactive sanction became a ballot")
	}
	warning := fine
	warning.Sanction = "warning"
	warning.Amount = 0
	if err := w.validateSanction(w.Agents[0], warning); err != nil {
		t.Fatalf("historically permitted warning rejected: %v", err)
	}
	p.Rules["sanctions"] = Rule{Mode: "field", Powers: []string{"fine"}}
	if err := w.validateSanction(w.Agents[0], warning); err == nil {
		t.Fatal("repealed warning remained available")
	}
	if err := w.applySanction(Pending{Plot: 0, Actor: 0, Input: fine}); err == nil {
		t.Fatal("officer execution bypassed historical permission")
	}
}

func TestSanctionApplicationChecksResolvedOfficerScopeAtBothBoundaries(t *testing.T) {
	for _, revokeBeforeExecution := range []bool{false, true} {
		name := "submission"
		if revokeBeforeExecution {
			name = "execution"
		}
		t.Run(name, func(t *testing.T) {
			w := politicalWorld(t, 3, 1)
			govern(w, 0)
			p := w.Plots[0]
			p.Stock = 0
			p.Rules["sanctions"] = Rule{Mode: "field", Powers: []string{"fine"}}
			members := []int{1}
			if revokeBeforeExecution {
				members = []int{2}
			}
			p.Officers[0] = Office{Agent: 0, Powers: []string{"applySanction"}, Members: members, Limit: 5}
			w.Agents[2].Food = 4
			e := w.event("ration_breach", 2, 0, "Breach", 2)
			e.Breach = true
			w.Events[len(w.Events)-1] = e
			w.reads[1] = []Event{e}
			w.governancePhase(map[int]Decision{1: {Proposals: []ProposalInput{{Kind: "sanction", Target: 2, Evidence: e.ID, Sanction: "fine", Amount: 3}}}})
			w.votingPhase(yesVotes(w))
			tomorrow(w)
			var id string
			for key := range w.politicalState().Authorizations {
				id = key
			}
			if id == "" {
				t.Fatal("missing authorised sanction")
			}
			// A caller-supplied in-scope target cannot change the authorised target.
			w.officerPhase(map[int]Decision{0: {Orders: []Order{{Kind: "applySanction", Target: 1, Amount: 0, Authorization: id}}}})
			if !revokeBeforeExecution && len(w.Pending) != 0 {
				t.Fatal("out-of-scope sanction was scheduled")
			}
			if revokeBeforeExecution {
				o := p.Officers[0]
				o.Members = []int{1}
				p.Officers[0] = o
			}
			tomorrow(w)
			if w.Agents[2].Food != 4 || p.Stock != 0 {
				t.Fatal("officer applied sanction outside current delegated scope")
			}
		})
	}
}
