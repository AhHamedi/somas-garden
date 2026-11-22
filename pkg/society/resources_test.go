package society

import (
	"encoding/json"
	"math"
	"reflect"
	"strings"
	"testing"
)

func smallWorld(t *testing.T, n int) *World {
	t.Helper()
	s := DefaultSettings()
	s.Copies = n
	s.Plots = 1
	s.Months = 2
	s.Days = 3
	w, e := New(s, []Team{{Name: "Test", Policy: "sunchaser"}}, 7)
	if e != nil {
		t.Fatal(e)
	}
	return w
}
func resident(w *World, id int) *Agent {
	a := w.Agents[id]
	a.Plot = 0
	a.VotingWeight = w.Settings.VotingTokens
	a.VotingTokens = a.VotingWeight
	return a
}
func TestDailyMealAndThinking(t *testing.T) {
	w := smallWorld(t, 1)
	a := resident(w, 0)
	a.Food = 9
	a.Mind = 8.9
	w.eating(map[int]Decision{0: {Eat: 5, Think: 6}})
	if !a.Alive || a.Body != 2 || a.Food != 4 || a.Score != 8 || a.Mind != 2.9 {
		t.Fatalf("bad accounting: %+v", a)
	}
	w.eating(map[int]Decision{0: {Eat: 3}})
	if a.Score != 9 {
		t.Fatalf("daily diminishing return did not reset: %v", a.Score)
	}
}
func TestWorldRewardSettings(t *testing.T) {
	for _, test := range []struct{ food, mind float64 }{{0, 0}, {0, 2.5}, {1.5, 0}, {1.5, 2.5}} {
		w := smallWorld(t, 1)
		w.Settings.OvereatingReward, w.Settings.ThinkingReward = test.food, test.mind
		a := resident(w, 0)
		a.Food, a.Mind = 5, 6
		w.eating(map[int]Decision{0: {Eat: 5, Think: 3}})
		want := 2*test.food + 3*test.mind
		snap := w.Snapshot()
		people := SummariseAgents(&snap, 0)
		day := SummariseDay(&snap, 0, nil)
		if a.Score != want || a.Thought != 3 || a.Mind != 3 || people.Thought[0] != 3*test.mind || day.Teams[0].Thought != 3*test.mind {
			t.Fatalf("reward settings %+v: score %v, thought contribution %v", test, a.Score, people.Thought)
		}
		b, err := w.Checkpoint()
		if err != nil {
			t.Fatal(err)
		}
		restored, err := RestoreCheckpoint(b)
		if err != nil || restored.Settings.ThinkingReward != test.mind || restored.Settings.OvereatingReward != test.food {
			t.Fatalf("could not restore reward settings: %v", err)
		}
	}
}

func TestOldSettingsRetainWorkerGrowthAndDefaultRewards(t *testing.T) {
	w := smallWorld(t, 1)
	if err := json.Unmarshal([]byte(`{"growth":2,"productiveCapacity":10}`), &w.Settings); err != nil {
		t.Fatal(err)
	}
	resident(w, 0)
	w.updateResidents()
	p := w.Plots[0]
	p.Capacity, p.Stock = 100, 50
	w.Day = 2
	w.environment()
	if p.Stock != 51 || w.Settings.ThinkingReward != 1 || w.Settings.OvereatingReward != 1 {
		t.Fatal("an old world lost its original growth or reward settings")
	}
}

func TestDailyGrowthCarriesFractionsAndIgnoresResidentCount(t *testing.T) {
	for _, count := range []int{1, 5} {
		w := smallWorld(t, count)
		for i := range w.Agents {
			resident(w, i)
		}
		w.updateResidents()
		w.Day = 2
		w.Settings.DailyGrowthPercent = 10
		p := w.Plots[0]
		p.Capacity, p.Stock = 100, 1
		for i := 0; i < 10; i++ {
			w.environment()
		}
		if p.Stock != 2 {
			t.Fatalf("expected a new carrot after 10 days, got %d", p.Stock)
		}
		p.Stock = 80
		w.environment()
		if p.Stock != 88 {
			t.Fatalf("with %d residents, 80 carrots grew to %d", count, p.Stock)
		}
	}
}

func TestExclusionDeletesAllCarrotsUntilReset(t *testing.T) {
	w := smallWorld(t, 2)
	a, other := resident(w, 0), resident(w, 1)
	a.Food, other.Food = 12, 2
	w.eating(map[int]Decision{1: {Eat: 2}})
	if a.Alive || a.Body != 0 || a.Food != 0 || a.Plot != -1 || a.Exclusions != 1 || other.Food != 0 {
		t.Fatalf("exclusion failed or transferred food: %+v, %+v", a, other)
	}
	w.Day, w.AbsoluteDay = 2, 2
	w.environment()
	if a.Alive {
		t.Fatal("excluded resident returned before the meteor")
	}
	deleted := 0
	for _, e := range w.Events {
		if e.Kind == "deleted" {
			deleted += int(e.Amount)
		}
	}
	if deleted != 12 {
		t.Errorf("removed %d carrots, want 12", deleted)
	}
}

func TestPlacementLocksUntilNextReset(t *testing.T) {
	s := DefaultSettings()
	s.Plots, s.Copies, s.Days, s.Months = 2, 2, 2, 2
	w, err := New(s, []Team{{Policy: "warden"}}, 17)
	if err != nil {
		t.Fatal(err)
	}
	a := w.Agents[0]
	w.Deciders[0] = func(v Observation) Decision {
		plot := v.Month % 2
		if v.Phase != "placement" {
			plot = 1 - plot
		}
		return Decision{PlotChoice: &plot, Harvest: 2, Eat: 2}
	}
	for !w.Done {
		if err := w.Step(); err != nil {
			t.Fatal(err)
		}
		if a.Alive && a.Plot != w.Month%2 {
			t.Fatalf("wrong residency at month %d day %d phase %s: plot %d", w.Month, w.Day, w.Phase, a.Plot)
		}
	}
}

func TestRankedHarvestAndPhysicalLimits(t *testing.T) {
	w := smallWorld(t, 4)
	for i := range w.Agents {
		resident(w, i)
	}
	// Residents 0 and 1 agree, resident 2 disagrees, resident 3 submits a duplicate.
	w.rankHarvest(map[int]Decision{
		0: {HarvestRanking: []int{2, 0, 3, 1}},
		1: {HarvestRanking: []int{2, 0, 3, 1}},
		2: {HarvestRanking: []int{3, 1, 2, 0}},
		3: {HarvestRanking: []int{3, 3, 1, 2}},
	})
	p := w.Plots[0]
	if p.HarvestOrder[0] != 2 || p.HarvestOrder[1] != 3 || p.HarvestOrder[2] != 0 || p.HarvestOrder[3] != 1 {
		t.Fatal("ranked outcome:", p.HarvestOrder)
	}
	count := 0
	for _, e := range w.Events {
		if e.Kind == "harvest_ranking" {
			count++
		}
	}
	if count != 3 {
		t.Fatalf("published %d ballots, want 3", count)
	}
	w.Agents[2].Food = 2
	p.Stock = 11
	p.Government = true
	p.Rules["quota"] = Rule{Mode: "limited", Amount: 2}
	w.harvest(map[int]Decision{0: {Harvest: 99}, 1: {Harvest: 99}, 2: {Harvest: 99}, 3: {Harvest: 99}})
	if w.Agents[2].Food != 12 || w.Agents[3].Food != 1 || w.Agents[1].Food+w.Agents[0].Food+p.Stock != 0 {
		t.Fatalf("ranked harvest, stock or personal capacity was violated: %+v", w.Agents)
	}
	found := false
	for _, e := range w.Events {
		if e.Kind == "ration_breach" && e.Actor == 2 && e.Amount == 8 {
			found = true
		}
	}
	if !found {
		t.Fatal("over-quota harvest did not produce public evidence")
	}
	w.Agents[2].LastPlaceUntil = w.AbsoluteDay
	w.rankHarvest(map[int]Decision{0: {HarvestRanking: []int{2, 0, 1, 3}}})
	if p.HarvestOrder[3] != 2 {
		t.Fatal("Justice last-place sanction was skipped")
	}
}

func TestRankingsRejectShortForeignOrExcludedIDs(t *testing.T) {
	w := smallWorld(t, 4)
	for i := range w.Agents {
		resident(w, i)
	}
	w.exclude(w.Agents[3], "Excluded for test")
	for _, bad := range [][]int{{0, 1}, {0, 1, 1}, {0, 1, 3}, {0, 1, -1}, {0, 1, 99}} {
		if w.validHarvestRanking(bad, 0, 3) {
			t.Errorf("accepted %v", bad)
		}
	}
}

func TestGrowthUsesOnlyFieldAndResidents(t *testing.T) {
	w := smallWorld(t, 50)
	for _, a := range w.Agents {
		a.Plot = 0
	}
	p := w.Plots[0]
	p.Capacity, p.Stock = 500, 400
	w.updateResidents()
	w.Day, w.AbsoluteDay = 2, 2
	w.environment()
	if p.Stock != 500 {
		t.Fatalf("growth must cap at 500, got %d", p.Stock)
	}
	p.Stock, p.GrowthRemainder = 0, .9
	w.environment()
	if p.Stock != 0 || p.GrowthRemainder != 0 {
		t.Fatal("an empty field regrew spontaneously")
	}
}

func TestBumperCanRestartExhaustedStandingCrop(t *testing.T) {
	w := smallWorld(t, 2)
	for i := range w.Agents {
		resident(w, i)
	}
	w.Day, w.AbsoluteDay = 4, 4
	w.Settings.BlightChance, w.Settings.BumperChance = 0, 1
	p := w.Plots[0]
	p.Stock = 0
	w.environment()
	if p.Stock != 4 || p.CropEvent != "bumper" {
		t.Fatalf("bumper left %d carrots, event %q", p.Stock, p.CropEvent)
	}
	p.Stock = p.Capacity - 1
	w.cropEvent(p)
	if p.Stock != p.Capacity {
		t.Fatal("bumper exceeded field capacity")
	}
}

func TestTradeDonationsAndBlightRelief(t *testing.T) {
	for _, enough := range []bool{true, false} {
		s := DefaultSettings()
		s.Copies, s.Plots = 5, 2
		w, err := New(s, []Team{{Policy: "warden"}}, 19)
		if err != nil {
			t.Fatal(err)
		}
		// 0 and 1 can send aid to the three residents of plot 1.
		for _, a := range w.Agents {
			a.Plot = 0
			if a.ID >= 2 {
				a.Plot = 1
			}
			w.Deciders[a.ID] = func(v Observation) Decision { return Decision{} }
		}
		for i, id := range []int{0, 2} {
			w.Plots[i].Government = true
			w.Plots[i].Roles = map[string]int{"trade": id}
		}
		w.Day, w.AbsoluteDay = 4, 4
		w.Settings.BlightChance, w.Settings.BumperChance = 1, 0
		p := w.Plots[1]
		p.Stock = 16
		w.cropEvent(p)
		if p.AidNeeded != 3 || p.Stock != 10 {
			t.Fatalf("blight did not damage field or call for relief: %+v", p)
		}
		w.Agents[1].Food, w.Agents[3].Food, w.Agents[4].Food = 4, 2, 1
		gift := 3
		if !enough {
			gift = 2
		}
		w.Deciders[1] = func(v Observation) Decision { return Decision{Donate: 4} }
		w.Deciders[3] = func(v Observation) Decision { return Decision{Donate: 2} }
		w.Deciders[0] = func(v Observation) Decision { return Decision{Gift: &Offer{To: 2, Amount: gift}} }
		w.Deciders[4] = func(v Observation) Decision { return Decision{Gift: &Offer{To: 0, Amount: 1}} }
		w.transfers()
		if enough {
			if p.CropEvent != "rescued" || w.Agents[2].Food != 2 || w.Agents[0].Food != 1 || w.Agents[4].Food != 1 || p.Stock != 13 {
				t.Fatalf("unexpected relief result: %+v", p)
			}
		} else {
			if p.CropEvent != "failed" || p.Stock != 0 || w.roleHolder(1, "trade") != nil {
				t.Fatalf("plot survived inadequate external aid: %+v", p)
			}
			for _, id := range []int{2, 3, 4} {
				if w.Agents[id].Alive || w.Agents[id].Food != 0 {
					t.Fatal("resident or personal carrots survived failed blight")
				}
			}
		}
	}
}

func TestRepresentativeCapacityAndTransferPermissions(t *testing.T) {
	w := smallWorld(t, 3)
	for i := range w.Agents {
		resident(w, i)
	}
	p := w.Plots[0]
	p.Government = true
	p.Roles = map[string]int{"trade": 0}
	p.Stock = 100
	w.rankHarvest(map[int]Decision{0: {HarvestRanking: []int{0, 1, 2}}})
	w.harvest(map[int]Decision{0: {Harvest: 100}, 1: {Harvest: 100}})
	if w.Agents[0].Food != w.Settings.RepresentativeCapacity || w.Agents[1].Food != w.Settings.PersonalCapacity {
		t.Fatal("role-specific capacity not enforced")
	}
	delete(p.Roles, "trade")
	w.harvest(map[int]Decision{0: {Harvest: 100}})
	if w.Agents[0].Food != w.Settings.RepresentativeCapacity {
		t.Fatal("revocation collected excess food or allowed new harvesting")
	}
	w.Deciders[0] = func(v Observation) Decision { return Decision{Gift: &Offer{To: 2, Amount: 2}} }
	w.Deciders[1] = func(v Observation) Decision { return Decision{Donate: 3} }
	w.Deciders[2] = func(v Observation) Decision { return Decision{} }
	w.transfers()
	if w.Agents[2].Food != 0 || w.Agents[1].Food != w.Settings.PersonalCapacity {
		t.Fatal("unauthorised gift or donation to vacant office executed")
	}
}

func TestViewHasNoOtherPrivateBalancesAndDetachedMaps(t *testing.T) {
	w := smallWorld(t, 2)
	resident(w, 0)
	a := resident(w, 1)
	a.Food = 11
	a.Mind = 3.14159
	a.Memory = json.RawMessage(`{"secret":999}`)
	w.Plots[0].Rules["quota"] = Rule{Mode: "limited", Amount: 2}
	v := w.View(0)
	v.Plots[0].Rules["quota"] = Rule{Amount: 99}
	v.Self.Pledges["local"] = 999
	if w.Plots[0].Rules["quota"].Amount != 2 || w.Agents[0].Pledges["local"] != 0 {
		t.Fatal("view aliases world state")
	}
	b, _ := json.Marshal(v)
	var raw map[string]any
	_ = json.Unmarshal(b, &raw)
	if _, ok := raw["agents"]; ok {
		t.Fatal("view leaks all agents")
	}
	v2 := w.View(1)
	if string(v2.Memory) != `{"secret":999}` {
		t.Fatal("own private memory unavailable")
	}
}
func TestMeteorOnlyMemorySurvives(t *testing.T) {
	w := smallWorld(t, 2)
	w.Settings.Days = 1
	w.Agents[0].Memory = json.RawMessage(`{"learned":7}`)
	w.Deciders[0] = func(v Observation) Decision { return Decision{} }
	w.Agents[0].Score = 14
	w.Agents[0].Food = 3
	w.Plots[0].Government = true
	w.Phase = "close"
	w.closeDay()
	if !w.Meteor || len(w.Months) != 1 || w.Months[0].Scores[0] != 14 {
		t.Fatal("terminal report missing")
	}
	w.phaseIndex = 0
	_ = w.Step()
	a := w.Agents[0]
	if w.Month != 2 || w.Day != 1 || a.Score != 0 || a.Food != 0 || a.Plot != 0 || !a.Alive || w.Plots[0].Government || string(a.Memory) != `{"learned":7}` {
		t.Fatalf("bad reset %+v", a)
	}
}
func TestSettingsRejectNonFiniteAndInvalid(t *testing.T) {
	s := DefaultSettings()
	s.Growth = math.Inf(1)
	if s.Validate(6) == nil {
		t.Fatal("infinite growth accepted")
	}
	s = DefaultSettings()
	s.PersonalCapacity = -1
	if s.Validate(6) == nil {
		t.Fatal("negative capacity accepted")
	}
}
func TestSeedReproducible(t *testing.T) {
	s := DefaultSettings()
	s.Copies = 3
	s.Plots = 3
	s.Days = 4
	s.Months = 2
	a, _ := New(s, DefaultTeams(), 912)
	b, _ := New(s, DefaultTeams(), 912)
	for !a.Done {
		_ = a.Step()
		_ = b.Step()
	}
	if !reflect.DeepEqual(a.Snapshot(), b.Snapshot()) {
		t.Fatal("identical seeded simulations diverged")
	}
}
func TestMemoryLimitPreservesCommittedValue(t *testing.T) {
	w := smallWorld(t, 1)
	w.Settings.MemoryBytes = 8
	w.Agents[0].Memory = json.RawMessage(`{"a":1}`)
	w.Deciders[0] = func(Observation) Decision {
		return Decision{Memory: json.RawMessage(`{"long":"this update is too large"}`)}
	}
	w.decisions("close")
	if string(w.Agents[0].Memory) != `{"a":1}` {
		t.Fatal("oversized memory altered committed memory")
	}
}
func BenchmarkYear(b *testing.B) {
	for i := 0; i < b.N; i++ {
		w, _ := New(DefaultSettings(), DefaultTeams(), 7)
		for !w.Done {
			_ = w.Step()
		}
	}
}
func TestFullYearAccountingAndMemory(t *testing.T) {
	w, e := New(DefaultSettings(), DefaultTeams(), 7)
	if e != nil {
		t.Fatal(e)
	}
	steps := 0
	for !w.Done {
		if e = w.Step(); e != nil {
			t.Fatal(e)
		}
		steps++
		for _, a := range w.Agents {
			if a.Food < 0 || a.Food > w.Settings.RepresentativeCapacity || a.Mind < -1e-6 || a.Mind > w.Settings.MindCapacity+1e-6 {
				t.Fatalf("invalid balance day %d: %+v", w.AbsoluteDay, a)
			}
			if !a.Alive && (a.Plot != -1 || a.Food != 0 || a.VotingTokens != 0) {
				t.Fatalf("excluded agent retained resources: %+v", a)
			}
		}
		for _, p := range w.Plots {
			if p.Stock < 0 || p.Stock > p.Capacity {
				t.Fatal("invalid field balance")
			}
		}
	}
	if steps != 360*len(Phases) || len(w.Months) != 12 || len(w.Agents) != 300 {
		t.Fatalf("full year incomplete: %d phases, %d months", steps, len(w.Months))
	}
	for _, a := range w.Agents {
		if w.Teams[a.Team].Policy != "tinkerer" {
			continue
		}
		var memory struct{ Trials []int }
		if err := json.Unmarshal(a.Memory, &memory); err != nil {
			t.Fatal(err)
		}
		months := 0
		for _, trials := range memory.Trials {
			months += trials
		}
		if months != w.Settings.Months {
			t.Fatalf("resident %d remembers %d monthly trials", a.ID, months)
		}
	}
}

func TestUnknownStrategyAndInvalidBuilderFailClearly(t *testing.T) {
	s := DefaultSettings()
	s.Copies = 1
	s.Plots = 1
	if _, e := New(s, []Team{{Policy: "typo"}}, 1); e == nil {
		t.Fatal("unknown strategy silently replaced")
	}
	if _, e := New(s, []Team{{Policy: "warden", Builder: &Builder{Eat: -2}}}, 1); e == nil {
		t.Fatal("negative builder amount accepted")
	}
	if _, e := New(s, []Team{{Policy: "warden", Builder: &Builder{Rules: []BehaviorRule{{Phase: "unknown", Op: "always"}}}}}, 1); e == nil {
		t.Fatal("unknown phase accepted")
	}
}
func TestBuilderPolicyRunsConfiguredFirstDay(t *testing.T) {
	for _, policy := range []string{"builder", "sunchaser"} {
		t.Run(policy, func(t *testing.T) {
			s := DefaultSettings()
			s.Copies, s.Plots, s.Months, s.Days = 1, 1, 1, 3
			w, err := New(s, []Team{{Name: "Builder", Policy: policy, Builder: &Builder{Harvest: 3, Eat: 2, Think: 1}}}, 7)
			if err != nil {
				t.Fatal(err)
			}
			for w.Day == 1 && !w.Done {
				if err := w.Step(); err != nil {
					t.Fatal(err)
				}
			}
			a := w.Agents[0]
			if !a.Alive || a.Plot != 0 || a.TotalHarvested != 3 || a.TotalEaten != 2 || a.Food != 1 || a.Score != 1 {
				t.Fatalf("configured harvest, meal and thinking did not execute: %+v", a)
			}
		})
	}
}
func TestBuilderPolicyRequiresValidPayload(t *testing.T) {
	s := DefaultSettings()
	s.Copies, s.Plots = 1, 1
	for name, team := range map[string]Team{
		"missing":             {Policy: "builder"},
		"missingWithStrategy": {Policy: "builder", StrategyID: "uploaded"},
		"negativeMeal":        {Policy: "builder", Builder: &Builder{Eat: -1}},
		"unknownPhase":        {Policy: "builder", Builder: &Builder{Rules: []BehaviorRule{{Phase: "unknown", Op: "always"}}}},
		"unknownFallback":     {Policy: "builder", Builder: &Builder{Fallback: "builder"}},
		"unknownPolicy":       {Policy: "typo", Builder: &Builder{Harvest: 3, Eat: 2}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := New(s, []Team{team}, 7); err == nil {
				t.Fatal("invalid builder team accepted")
			}
		})
	}
}
func TestPrivateRandomStreamsAreStableAndDistinct(t *testing.T) {
	w := smallWorld(t, 2)
	a, b := w.View(0), w.View(1)
	if a.RandomSeed == b.RandomSeed || a.RandomSeed != w.View(0).RandomSeed {
		t.Fatal("private random seed is shared or unstable")
	}
	a.Memory = json.RawMessage(`{"changed":true}`)
	if a.RandomSeed != w.View(0).RandomSeed {
		t.Fatal("memory unexpectedly shifts RNG")
	}
}
func TestMeteorClearsLiveEventsAndKeepsEventIdentityMonotonic(t *testing.T) {
	w := smallWorld(t, 1)
	w.Settings.Days = 1
	w.event("harvest", 0, 0, "previous month's private history", 2)
	oldID := w.Events[len(w.Events)-1].ID
	w.closeDay()
	w.phaseIndex = 0
	if e := w.Step(); e != nil {
		t.Fatal(e)
	}
	for _, e := range w.Events {
		if e.Month != 2 {
			t.Fatal("previous-month political evidence remains in live world")
		}
	}
	for _, e := range w.View(0).Receipts {
		if e.Month != 2 {
			t.Fatal("meteor retained prior receipts")
		}
	}
	e := w.event("harvest", 0, 0, "new month's event", 1)
	if e.ID <= oldID || e.Month != 2 {
		t.Fatal("event identity was reused across observer archives")
	}
	snap := w.Snapshot()
	for _, e := range snap.Events {
		if e.Month != 2 {
			t.Fatal("new snapshot includes old-month events")
		}
	}
}

func TestPublicActionsReachAnotherPlotWithoutSharingPrivateMemory(t *testing.T) {
	s := DefaultSettings()
	s.Copies, s.Plots = 2, 2
	w, err := New(s, []Team{{Policy: "warden"}}, 9)
	if err != nil {
		t.Fatal(err)
	}
	w.Agents[0].Plot, w.Agents[1].Plot = 0, 1
	w.Agents[1].Memory = json.RawMessage(`{"secret":999}`)
	e := w.event("harvest_ranking", 1, 1, "Ranked", 0, 1)
	seen := false
	view := w.View(0)
	for _, action := range view.Actions {
		if action.ID == e.ID && action.Actor == 1 && reflect.DeepEqual(action.Members, []int{1}) {
			seen = true
		}
	}
	if !seen {
		t.Fatal("resident cannot inspect ranked action on another plot")
	}
	b, _ := json.Marshal(view)
	if strings.Contains(string(b), "secret") {
		t.Fatal("view exposed another agent's private memory")
	}
}

func TestFullTradeStoreStillReceivesAndPlantsRelief(t *testing.T) {
	s := DefaultSettings()
	s.Copies, s.Plots = 2, 2
	w, err := New(s, []Team{{Policy: "warden"}}, 23)
	if err != nil {
		t.Fatal(err)
	}
	for id, a := range w.Agents {
		a.Plot = id
		w.Plots[id].Government = true
		w.Plots[id].Roles = map[string]int{"trade": id}
	}
	from, to := w.Agents[0], w.Agents[1]
	from.Food, to.Food = 6, s.RepresentativeCapacity
	p := w.Plots[1]
	p.CropEvent, p.AidNeeded, p.Stock = "blight", 3, p.Capacity-2
	w.Deciders[0] = func(v Observation) Decision { return Decision{Gift: &Offer{To: 1, Amount: 6}} }
	w.Deciders[1] = func(v Observation) Decision { return Decision{} }
	w.transfers()
	if p.CropEvent != "rescued" || p.Stock != p.Capacity || to.Food != s.RepresentativeCapacity || from.Food != 3 {
		t.Fatalf("full rep did not protect its plot or accepted excess beyond capacity: %+v", p)
	}
	used, planted := 0, 0
	for _, e := range w.Events {
		if e.Kind == "relief_used" {
			used += int(e.Amount)
		}
		if e.Kind == "relief_planted" {
			planted += int(e.Amount)
		}
	}
	if used != 1 || planted != 2 {
		t.Fatalf("relief accounting used %d, planted %d", used, planted)
	}
}

func TestTradeGiftMustReachDestinationRepresentative(t *testing.T) {
	s := DefaultSettings()
	s.Plots, s.Copies = 2, 3
	w, err := New(s, []Team{{Policy: "warden"}}, 11)
	if err != nil {
		t.Fatal(err)
	}
	for id, a := range w.Agents {
		a.Plot = min(id, 1)
		w.Deciders[id] = func(v Observation) Decision { return Decision{} }
	}
	for i, p := range w.Plots {
		p.Government = true
		p.Roles = map[string]int{"trade": i}
	}
	w.Agents[0].Food = 4
	w.Deciders[0] = func(v Observation) Decision { return Decision{Gift: &Offer{To: 2, Amount: 4}} }
	w.transfers()
	if w.Agents[0].Food != 4 || w.Agents[2].Food != 0 {
		t.Fatal("direct cross-plot gift bypassed Trade")
	}
	w.Deciders[0] = func(v Observation) Decision { return Decision{Gift: &Offer{To: 1, Amount: 4}} }
	w.Deciders[1] = func(v Observation) Decision { return Decision{Gift: &Offer{To: 2, Amount: 4}} }
	w.transfers()
	if w.Agents[1].Food != 4 || w.Agents[2].Food != 0 {
		t.Fatal("incoming aid was forwarded before the next decision")
	}
	w.transfers()
	if w.Agents[1].Food != 0 || w.Agents[2].Food != 4 {
		t.Fatal("receiving representative could not gift to a local resident")
	}
}
