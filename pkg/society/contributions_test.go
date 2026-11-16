package society

import (
	"strings"
	"testing"
)

func influenceOf(w *World) []int {
	out := []int{}
	for _, a := range w.Agents {
		out = append(out, a.Influence)
	}
	return out
}

func sameInts(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func contributionPlot(t *testing.T, n int, r Rule) *World {
	t.Helper()
	w := politicalWorld(t, n, 1)
	govern(w, 0)
	w.Plots[0].ReserveCapacity = 1000
	if err := w.enactLocal(w.Plots[0], "influenceBasis", r); err != nil {
		t.Fatal(err)
	}
	return w
}

// Every kind of contribution reaches the ledger through the engine's own
// actions, counts from the next morning, and drops out after the window.
func TestContributionsSetTomorrowsInfluence(t *testing.T) {
	w := contributionPlot(t, 4, Rule{Mode: "contribution", Amount: 2, Limit: 3})
	p := w.Plots[0]
	for i, a := range w.Agents {
		a.Food = []int{6, 8, 0, 0}[i]
		w.Deciders[a.ID] = func(v Observation) Decision {
			if v.Phase == "transfers" && v.Self.ID == 0 {
				return Decision{Deposit: 4}
			}
			if v.Phase == "transfers" && v.Self.ID == 3 {
				return Decision{Deposit: 1}
			}
			return Decision{}
		}
	}
	w.Agents[3].Food = 1
	// Ada deposits 4 and Di 1; Bo pays 2 in storage tax; Cy's pledge pays 3
	// mind for services; Di receives 2 from the treasury.
	w.transfers()
	p.Rules["tax"] = Rule{Mode: "fixed", Amount: 2}
	w.Agents[0].Food, w.Agents[3].Food = 0, 0
	w.collectGovernment("tax")
	w.Agents[2].Pledges["local"] = 5
	if !w.chargePledges([]int{0}, "local", 3) {
		t.Fatal("services were not funded")
	}
	if w.distribute(p, 3, nil, 2, -1) != 2 {
		t.Fatal("distribution failed")
	}
	delete(p.Rules, "tax")

	w.recalculateInfluence()
	if got := influenceOf(w); !sameInts(got, []int{1, 1, 1, 1}) {
		t.Fatalf("today's contributions counted today: %v", got)
	}
	tomorrow(w)
	if got := influenceOf(w); !sameInts(got, []int{3, 2, 2, 1}) {
		t.Fatalf("influence %v, want [3 2 2 1]", got)
	}
	di := p.Contributions[3]
	if di.Deposits != 1 || di.Received != 2 || di.Points != 0 {
		t.Fatalf("net standing below zero must show as zero points: %+v", di)
	}
	if bo := p.Contributions[1]; bo.Tax != 2 || bo.Points != 2 {
		t.Fatalf("tax not credited: %+v", bo)
	}
	if cy := p.Contributions[2]; !closeEnough(cy.Services, 3) {
		t.Fatalf("service mind not credited: %+v", cy)
	}
	tomorrow(w)
	tomorrow(w)
	if got := influenceOf(w); !sameInts(got, []int{3, 2, 2, 1}) {
		t.Fatalf("a three-day window lost the first day early: %v", got)
	}
	tomorrow(w)
	if got := influenceOf(w); !sameInts(got, []int{1, 1, 1, 1}) {
		t.Fatalf("contributions outlived the window: %v", got)
	}
}

func TestContributionPointsNetTheWholeWindow(t *testing.T) {
	w := contributionPlot(t, 2, Rule{Mode: "contribution", Amount: 1, Limit: 5})
	w.contribute(0, 0, func(c *ContributionDay) { c.Deposits = 4 })
	tomorrow(w)
	w.contribute(0, 0, func(c *ContributionDay) { c.Received = 3 })
	tomorrow(w)
	if got := w.Agents[0].Influence; got != 2 {
		t.Fatalf("4 given and 3 received over the window is 1 point: influence %d", got)
	}
	w.contribute(0, 1, func(c *ContributionDay) { c.Deposits = 40 })
	tomorrow(w)
	if got := w.Agents[1].Influence; got != w.Settings.MaxInfluence {
		t.Fatalf("influence %d exceeds or misses the configured maximum", got)
	}
	if got := w.Agents[0].Influence; got != 2 {
		t.Fatalf("a large newcomer diluted another resident: %d", got)
	}
}

func TestContributionOnlyHasNoFloor(t *testing.T) {
	w := contributionPlot(t, 3, Rule{Mode: "contributionOnly", Amount: 2, Limit: 2})
	tomorrow(w)
	if got := influenceOf(w); !sameInts(got, []int{1, 1, 1}) {
		t.Fatalf("with no points anywhere everyone keeps the starting influence: %v", got)
	}
	w.contribute(0, 0, func(c *ContributionDay) { c.Services = 4 })
	tomorrow(w)
	if got := influenceOf(w); !sameInts(got, []int{2, 0, 0}) {
		t.Fatalf("influence %v, want [2 0 0]", got)
	}
	// A newcomer starts at the floor.
	out := w.Agents[2]
	w.leaving(out, 0)
	out.Plot = -1
	dest := 0
	w.movement(map[int]Decision{2: {Move: &dest}})
	if out.Plot != 0 || out.Influence != 0 {
		t.Fatalf("newcomer influence %d at plot %d", out.Influence, out.Plot)
	}
}

func TestContributionOnlyContinuityAfterDeparture(t *testing.T) {
	for _, anotherContributor := range []bool{false, true} {
		name := "sole contributor leaves"
		if anotherContributor {
			name = "another contributor remains"
		}
		t.Run(name, func(t *testing.T) {
			w := contributionPlot(t, 3, Rule{Mode: "contributionOnly", Amount: 2, Limit: 5})
			p := w.Plots[0]
			if err := w.enactLocal(p, "influence:1", Rule{Target: 1, Amount: 4}); err != nil {
				t.Fatal(err)
			}
			p.Rules["proposers"] = Rule{Mode: "positive"}
			w.contribute(0, 0, func(c *ContributionDay) { c.Deposits = 4 })
			if anotherContributor {
				w.contribute(0, 1, func(c *ContributionDay) { c.Deposits = 2 })
			}
			tomorrow(w)
			outside := -1
			w.movement(map[int]Decision{0: {Move: &outside}})
			want := []int{0, 1, 1}
			if anotherContributor {
				want[2] = 0
			}
			if got := influenceOf(w); !sameInts(got, want) {
				t.Fatalf("post-movement influence %v, want %v", got, want)
			}
			if p.Rules["influence:1"].Amount != 4 {
				t.Fatal("continuity discarded a suspended voted grant")
			}
			if !w.canPropose(w.Agents[1]) {
				t.Fatal("remaining residents cannot propose")
			}
			w.governancePhase(map[int]Decision{1: {Proposals: []ProposalInput{{Kind: "policy", Key: "threshold", Rule: Rule{Mode: "majority"}}}}})
			w.votingPhase(yesVotes(w))
			if len(w.Proposals) != 1 || w.Proposals[0].Total == 0 || w.Proposals[0].Status != "scheduled" {
				t.Fatalf("remaining residents could not pass today's motion: %+v", w.Proposals)
			}
			if err := w.applyInstitution(Pending{Actor: 1, Plot: 0, Input: ProposalInput{Kind: "repeal", Key: "influenceBasis"}}); err != nil {
				t.Fatal(err)
			}
			if w.Agents[1].Influence != 4 {
				t.Fatal("suspended voted influence was not restored on repeal")
			}
		})
	}
}

func TestVotedGrantsAreSuspendedAndRestored(t *testing.T) {
	w := politicalWorld(t, 3, 1)
	govern(w, 0)
	p := w.Plots[0]
	if err := w.enactLocal(p, "influence:1", Rule{Target: 1, Amount: 4}); err != nil {
		t.Fatal(err)
	}
	if err := w.enactLocal(p, "influenceBasis", Rule{Mode: "contribution", Amount: 3, Limit: 5}); err != nil {
		t.Fatal(err)
	}
	w.recalculateInfluence()
	if got := influenceOf(w); !sameInts(got, []int{1, 1, 1}) {
		t.Fatalf("a voted grant survived the switch: %v", got)
	}
	err := w.validateProposal(w.Agents[0], ProposalInput{Kind: "policy", Plot: 0, Key: "influence", Target: 2, Rule: Rule{Target: 2, Amount: 5}}, false)
	if err == nil || !strings.Contains(err.Error(), "contributions") {
		t.Fatalf("individual grant accepted under contribution influence: %v", err)
	}
	// A grant already scheduled is kept on the books but has no effect.
	if err := w.enactLocal(p, "influence:2", Rule{Target: 2, Amount: 3}); err != nil {
		t.Fatal(err)
	}
	if w.Agents[2].Influence != 1 {
		t.Fatal("scheduled grant applied under contribution influence")
	}
	if err := w.applyInstitution(Pending{Actor: 0, Plot: 0, Input: ProposalInput{Kind: "repeal", Key: "influenceBasis"}}); err != nil {
		t.Fatal(err)
	}
	if got := influenceOf(w); !sameInts(got, []int{1, 4, 3}) {
		t.Fatalf("voted influence not restored on repeal: %v", got)
	}
	if err := w.enactLocal(p, "influenceBasis", Rule{Mode: "contribution", Amount: 3, Limit: 5}); err != nil {
		t.Fatal(err)
	}
	w.recalculateInfluence()
	if err := w.enactLocal(p, "influenceBasis", Rule{Mode: "voted"}); err != nil {
		t.Fatal(err)
	}
	if got := influenceOf(w); !sameInts(got, []int{1, 4, 3}) || p.Contributions != nil {
		t.Fatalf("voted influence not restored by a voted basis: %v", got)
	}
}

func TestLeavingForfeitsAndDissolutionClearsContributions(t *testing.T) {
	w := contributionPlot(t, 3, Rule{Mode: "contribution", Amount: 1, Limit: 5})
	w.contribute(0, 0, func(c *ContributionDay) { c.Deposits = 3 })
	w.contribute(0, 1, func(c *ContributionDay) { c.Deposits = 2 })
	w.leaving(w.Agents[0], 0)
	w.Agents[0].Plot = -1
	for _, r := range w.political.Ledger[0] {
		if r.Agent == 0 {
			t.Fatal("a departed resident kept their points")
		}
	}
	tomorrow(w)
	if w.Agents[1].Influence != 3 {
		t.Fatalf("remaining contributor influence %d", w.Agents[1].Influence)
	}
	w.dissolveGovernment(w.Plots[0])
	if w.Agents[1].Influence != w.Settings.StartingInfluence || len(w.political.Ledger[0]) != 0 || w.Plots[0].Contributions != nil {
		t.Fatal("dissolution left contribution influence or accounts behind")
	}
}

func TestInfluenceBasisValidation(t *testing.T) {
	w := politicalWorld(t, 1, 1)
	for _, tc := range []struct {
		r  Rule
		ok bool
	}{
		{Rule{Mode: "voted"}, true},
		{Rule{Mode: "contribution", Amount: 2, Limit: 5}, true},
		{Rule{Mode: "contributionOnly", Amount: 1, Limit: MaxContributionWindow}, true},
		{Rule{Mode: "contribution", Amount: 2}, false},
		{Rule{Mode: "contribution", Amount: 2, Limit: MaxContributionWindow + 1}, false},
		{Rule{Mode: "contribution", Limit: 5}, false},
		{Rule{Mode: "contribution", Amount: 1.5, Limit: 5}, false},
		{Rule{Mode: "weighted", Amount: 2, Limit: 5}, false},
	} {
		if err := w.validateRule("influenceBasis", tc.r, false); (err == nil) != tc.ok {
			t.Errorf("%+v: %v", tc.r, err)
		}
	}
}

// The accounts are public to residents while the law is in force, and only
// then; other plots never see them.
func TestContributionAccountsArePublicUnderTheLaw(t *testing.T) {
	w := politicalWorld(t, 3, 2)
	govern(w, 0)
	w.Agents[2].Plot = 1
	w.contribute(0, 0, func(c *ContributionDay) { c.Deposits = 2 })
	tomorrow(w)
	if v := w.View(1); len(v.Plots[0].Contributions) != 0 {
		t.Fatal("accounts visible without the law")
	}
	if err := w.enactLocal(w.Plots[0], "influenceBasis", Rule{Mode: "contribution", Amount: 1, Limit: 5}); err != nil {
		t.Fatal(err)
	}
	w.contribute(0, 1, func(c *ContributionDay) { c.Tax = 1 })
	v := w.View(1)
	rows := v.Plots[0].Contributions
	if len(rows) != 1 || rows[0].Agent != 0 || rows[0].Deposits != 2 {
		t.Fatalf("residents should see completed days only: %+v", rows)
	}
	if v := w.View(2); len(v.Plots[0].Contributions) != 0 {
		t.Fatal("another plot's resident saw the accounts")
	}
}

// End to end with scripted agents: one resident funds the treasury, the plot
// adopts the law, and the next ballot is weighted by contribution.
func TestScriptedAgentsWeighBallotsByContribution(t *testing.T) {
	w := politicalWorld(t, 4, 1)
	w.Plots[0].Capacity, w.Plots[0].Stock = 1000, 900
	law := ProposalInput{Kind: "policy", Plot: 0, Key: "influenceBasis", Rule: Rule{Mode: "contribution", Amount: 2, Limit: 5}}
	for _, a := range w.Agents {
		w.Deciders[a.ID] = func(v Observation) Decision {
			d := Decision{}
			switch v.Phase {
			case "pledges":
				d.Pledge = map[string]float64{"local": 3}
			case "proposals":
				if v.Self.ID == 0 && !v.Plots[0].Government {
					d.Proposals = []ProposalInput{{Kind: "found", Plot: 0}}
				} else if v.Self.ID == 0 && v.Plots[0].Rules["influenceBasis"].Mode == "" {
					d.Proposals = []ProposalInput{law}
				} else if v.Self.ID == 1 && v.AbsoluteDay >= 4 {
					d.Proposals = []ProposalInput{{Kind: "policy", Plot: 0, Key: "threshold", Rule: Rule{Mode: "majority"}}}
				}
			case "voting":
				d.Votes = map[string]string{}
				for _, q := range v.Proposals {
					if q.Status == "open" {
						d.Votes[q.ID] = "yes"
					}
				}
			case "transfers":
				if v.Self.ID == 0 && v.Self.Food > 2 {
					d.Deposit = v.Self.Food - 2
				}
			case "harvest":
				d.Harvest = 4
			case "eating":
				d.Eat = 2
			}
			return d
		}
	}
	for w.AbsoluteDay < 6 && !w.Done {
		if err := w.Step(); err != nil {
			t.Fatal(err)
		}
	}
	p := w.Plots[0]
	if _, _, ok := w.contributionBasis(p); !ok {
		t.Fatalf("the law did not pass: %+v", p.Rules)
	}
	ada, bo := w.Agents[0].Influence, w.Agents[1].Influence
	if ada <= bo {

		t.Fatalf("the depositor (%d) should outweigh the others (%d): %+v", ada, bo, p.Contributions)
	}
	var latest *Proposal
	for _, q := range w.Proposals {
		if len(q.Electorate) > 0 {
			latest = q
		}
	}
	if latest == nil || latest.Electorate[0] <= latest.Electorate[1] {
		t.Fatalf("ballot weights do not follow contribution influence: %+v", latest)
	}
}

func TestContributionAccountsSurviveCheckpoints(t *testing.T) {
	w := contributionPlot(t, 3, Rule{Mode: "contribution", Amount: 1, Limit: 5})
	w.contribute(0, 1, func(c *ContributionDay) { c.Deposits, c.Services = 2, 1.5 })
	tomorrow(w)
	data, err := w.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	r, err := RestoreCheckpoint(data)
	if err != nil {
		t.Fatal(err)
	}
	r.recalculateInfluence()
	if got := influenceOf(r); !sameInts(got, influenceOf(w)) || r.Agents[1].Influence != 4 {
		t.Fatalf("restored influence %v, want %v", got, influenceOf(w))
	}
	if rows := r.political.Ledger[0]; len(rows) != 1 || !closeEnough(rows[0].Services, 1.5) {
		t.Fatalf("ledger lost in checkpoint: %+v", rows)
	}
}
