package society

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestDefaultTeamsAndPresetCatalogue(t *testing.T) {
	presets, teams := Presets(), DefaultTeams()
	if len(presets) != 9 || len(teams) != 6 {
		t.Fatal("expected nine presets and six default teams")
	}
	for i, p := range presets {
		if !knownPolicy(p.Policy) || p.Summary == "" {
			t.Fatalf("incomplete preset: %+v", p)
		}
		if i < len(teams) && (teams[i].Policy != p.Policy || teams[i].Name != p.Name) {
			t.Fatalf("team and strategy catalogue disagree: %#v vs %#v", teams[i], p)
		}
	}
	for alias, policy := range policyAliases {
		if canonicalPolicy(alias) != policy || !knownPolicy(alias) {
			t.Fatalf("saved policy alias %q is unavailable", alias)
		}
	}
}

func TestPresetsRankOnlyTheirResidents(t *testing.T) {
	v := Observation{Day: 2, Phase: "harvest_order", Self: Agent{ID: 8, Plot: 0}, Plots: []PlotView{{ID: 0, Residents: []int{2, 4, 8}, Rules: map[string]Rule{"harvestOrder": {Mode: "ranked"}}}}}
	for _, p := range Presets() {
		d := defaultDecision(v, p.Policy)
		if p.Policy == "locust" && (len(d.HarvestRanking) == 0 || d.HarvestRanking[0] != 8) {
			t.Fatalf("self-interested agent cast %v", d.HarvestRanking)
		}
		got := slices.Clone(d.HarvestRanking)
		slices.Sort(got)
		if !slices.Equal(got, []int{2, 4, 8}) || !slices.Equal(v.Plots[0].Residents, []int{2, 4, 8}) {
			t.Fatalf("invalid %s ranking %v or observation mutation", p.Name, d.HarvestRanking)
		}
	}
}

func TestBuilderSpendsTokensInOrderAndRanks(t *testing.T) {
	tm := Team{Builder: &Builder{Vote: "yes", VoteTokens: 2, HarvestRanking: []int{4, 0}}}
	v := Observation{Self: Agent{Plot: 0, VotingTokens: 3}, Phase: "voting", Proposals: []*Proposal{
		{ID: "first", Status: "open", Input: ProposalInput{Kind: "found"}, TallyBasis: "tokens"},
		{ID: "second", Status: "open", Input: ProposalInput{Kind: "policy"}, TallyBasis: "tokens"},
	}}
	d := builtinDecision(v, tm)
	if len(d.OrderedVotes) != 1 || d.OrderedVotes[0].Tokens != 2 || d.OrderedVotes[0].Proposal != "first" {
		t.Fatalf("budget of three cast %+v", d.OrderedVotes)
	}
	v.Self.VotingTokens = 4
	d = builtinDecision(v, tm)
	if len(d.OrderedVotes) != 2 || d.OrderedVotes[0].Tokens != 2 || d.OrderedVotes[1].Tokens != 2 {
		t.Fatalf("budget of four cast %+v", d.OrderedVotes)
	}
	v.Phase = "harvest_order"
	if got := builtinDecision(v, tm).HarvestRanking; !slices.Equal(got, tm.Builder.HarvestRanking) {
		t.Fatalf("builder ranking %v", got)
	}
}

func TestEnvoyGiftsToForeignRepresentative(t *testing.T) {
	v := Observation{Phase: "transfers", Settings: DefaultSettings(), Self: Agent{ID: 3, Food: 11, Plot: 0}, Plots: []PlotView{
		{ID: 0, Roles: map[string]int{"trade": 3}},
		{ID: 1, AidNeeded: 4},
		{ID: 2, AidNeeded: 7, Roles: map[string]int{"trade": 0}},
	}}
	if gift := defaultDecision(v, "envoy").Gift; gift == nil || gift.To != 0 || gift.Amount != 7 {
		t.Fatalf("envoy gift = %+v", gift)
	}
	v.Self.ID = 4
	if d := defaultDecision(v, "envoy"); d.Gift != nil || d.Donate != 9 {
		t.Fatalf("resident's donation = %+v", d)
	}
}

func TestTinkerersRetainResultsAcrossMonths(t *testing.T) {
	v := Observation{Settings: DefaultSettings(), Phase: "placement", Self: Agent{ID: 1, Plot: -1}, Plots: []PlotView{{ID: 0, Capacity: 20}}}
	trials := trialMemory{Trials: [4]int{1, 1, 1, 1}, Totals: [4]float64{10, 25, 80, 35}}
	v.Memory, _ = json.Marshal(trials)
	choice := defaultDecision(v, "tinkerer")
	if choice.PlotChoice == nil || json.Unmarshal(choice.Memory, &trials) != nil || trials.Choice != 2 {
		t.Fatalf("failed to choose most successful tried strategy: %s", choice.Memory)
	}
	v.Phase = "month_end"
	v.Memory = choice.Memory
	v.Self.Score = 70
	result := defaultDecision(v, "tinkerer")
	if json.Unmarshal(result.Memory, &trials) != nil || trials.Trials[2] != 2 || trials.Totals[2] != 150 {
		t.Fatalf("failed to record individual score: %s", result.Memory)
	}
}

func TestSavedBuilderUsesItsOldDestinationOnlyAtReset(t *testing.T) {
	var b Builder
	if err := json.Unmarshal([]byte(`{"migrate":true,"harvest":3,"rules":[{"phase":"movement","op":"always","action":{"move":1}},{"phase":"harvest","field":"influence","op":"gt","value":2,"action":{"harvest":6}}]}`), &b); err != nil {
		t.Fatal(err)
	}
	if b.Harvest != 3 || len(b.Rules) != 2 || b.Rules[1].Field != "votingWeight" {
		t.Fatalf("did not preserve builder configuration: %+v", b)
	}
	v := Observation{Phase: "placement", Plots: []PlotView{{ID: 0}, {ID: 1}}}
	d := builtinDecision(v, Team{Builder: &b})
	if d.PlotChoice == nil || *d.PlotChoice != 1 {
		t.Fatal("lost the existing plot preference")
	}
	if err := json.Unmarshal([]byte(`{"rules":[{"phase":"harvest","action":{"typo":1}}]}`), &b); err == nil {
		t.Fatal("invalid builder action was silently ignored")
	}
}

func TestDefaultMonthSustainsPlotsAndExercisesRelief(t *testing.T) {
	s := DefaultSettings()
	s.Months = 1
	w, err := New(s, nil, 42)
	if err != nil {
		t.Fatal(err)
	}
	for !w.Done {
		if err := w.Step(); err != nil {
			t.Fatal(err)
		}
	}
	events := map[string]int{}
	for _, e := range w.Events {
		events[e.Kind]++
	}
	if live := w.Snapshot().Stats.Alive; live < len(w.Agents)/2 {
		t.Fatalf("only %d of %d active at month end", live, len(w.Agents))
	}
	for _, kind := range []string{"ballot", "donation", "gift", "blight_rescued", "justice_order"} {
		if events[kind] == 0 {
			t.Errorf("default strategies never exercised %s", kind)
		}
	}
}

func TestBasicPresets(t *testing.T) {
	v := Observation{Settings: DefaultSettings(), Self: Agent{ID: 0, Food: 1, Mind: 5, Plot: 0}, Plots: []PlotView{{Residents: []int{0}}}}
	for _, tc := range []struct {
		policy       string
		harvest, eat int
		think        float64
	}{{"minimalist", 1, 2, 0}, {"stockpiler", 5, 2, 5}, {"feaster", 11, 7, 0}} {
		v.Self.Food = 1
		v.Phase = "harvest"
		if got := defaultDecision(v, tc.policy).Harvest; got != tc.harvest {
			t.Errorf("%s harvest = %d", tc.policy, got)
		}
		v.Self.Food = 7
		v.Phase = "eating"
		if d := defaultDecision(v, tc.policy); d.Eat != tc.eat || d.Think != tc.think {
			t.Errorf("%s meal = %+v", tc.policy, d)
		}
	}
}

func TestUnequalTeamSizes(t *testing.T) {
	s := DefaultSettings()
	s.Copies, s.Days, s.Months, s.Plots = 4, 1, 1, 1
	teams := []Team{{Policy: "minimalist", Copies: 2}, {Policy: "stockpiler"}}
	w, err := New(s, teams, 42)
	if err != nil {
		t.Fatal(err)
	}
	var counts [2]int
	for _, a := range w.Agents {
		counts[a.Team]++
	}
	if counts != [2]int{2, 4} || w.Plots[0].Capacity != 6*s.CapacityPerAgent {
		t.Fatal("wrong team sizes or field capacity")
	}
	b, err := w.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	w, err = RestoreCheckpoint(b)
	if err != nil {
		t.Fatal(err)
	}
	for !w.Done {
		if err := w.Step(); err != nil {
			t.Fatal(err)
		}
	}
	for i, size := range []int{2, 4} {
		r := w.Months[0].Teams[i]
		if r.Mean != r.Score/float64(size) {
			t.Errorf("team %d mean = %g, total = %g", i, r.Mean, r.Score)
		}
	}
	for _, size := range []int{-1, 501} {
		teams[0].Copies = size
		if _, err := New(s, teams, 42); err == nil {
			t.Errorf("accepted size %d", size)
		}
	}
}
