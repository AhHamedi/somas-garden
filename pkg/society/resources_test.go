package society

import (
	"encoding/json"
	"math"
	"reflect"
	"testing"
)

func smallWorld(t *testing.T, n int) *World {
	t.Helper()
	s := DefaultSettings()
	s.Copies = n
	s.Plots = 1
	s.Months = 2
	s.Days = 3
	w, e := New(s, []Team{{Name: "Test", Policy: "thinker"}}, 7)
	if e != nil {
		t.Fatal(e)
	}
	return w
}
func resident(w *World, id int) *Agent { a := w.Agents[id]; a.Plot = 0; a.Influence = 1; return a }
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
func TestEatingIsNeverAutomatic(t *testing.T) {
	w := smallWorld(t, 1)
	a := resident(w, 0)
	a.Food = 12
	w.eating(map[int]Decision{})
	if a.Alive || a.Body != 0 || a.Food != 0 || a.RespawnAt != 3 {
		t.Fatalf("unrequested meal occurred or bad respawn: %+v", a)
	}
	if len(w.Events) < 2 {
		t.Fatal("missing death receipt")
	}
}
func TestStorageAndFieldLimits(t *testing.T) {
	w := smallWorld(t, 2)
	a := resident(w, 0)
	resident(w, 1)
	a.Food = 11
	w.Plots[0].Stock = 3
	w.harvest(map[int]Decision{0: {Harvest: 100}, 1: {Harvest: 100}})
	total := w.Agents[0].Food + w.Agents[1].Food + w.Plots[0].Stock
	if total != 14 || a.Food > 12 || w.Agents[1].Food > 4 || w.Plots[0].Stock < 0 {
		t.Fatal("harvesting violated conservation or capacity")
	}
}
func TestGrowthUsesOnlyFieldAndResidents(t *testing.T) {
	w := smallWorld(t, 50)
	for _, a := range w.Agents {
		a.Plot = 0
	}
	p := w.Plots[0]
	p.Capacity = 500
	p.Stock = 400
	p.Reserve = 200
	w.environment()
	if p.Stock != 500 {
		t.Fatalf("growth must cap at500: %d", p.Stock)
	}
	p.Stock = 0
	p.GrowthRemainder = .9
	w.environment()
	if p.Stock != 0 || p.GrowthRemainder != 0 {
		t.Fatal("empty field regrew from reserves/remainder")
	}
}
func TestFirstDaySunlightAndRespawn(t *testing.T) {
	w := smallWorld(t, 1)
	a := w.Agents[0]
	w.environment()
	if a.Mind != 6 {
		t.Fatal("first day must keep starting mind")
	}
	a.Alive = false
	a.Mind = 0
	a.RespawnAt = 3
	w.Day = 2
	w.AbsoluteDay = 2
	w.environment()
	if a.Alive {
		t.Fatal("respawn skipped missed day")
	}
	w.Day = 3
	w.AbsoluteDay = 3
	w.environment()
	if !a.Alive || a.Mind != 6 || a.Plot != -1 {
		t.Fatal("respawn failed or added same-morning sunlight")
	}
}
func TestEstateAllocationAndDefaultDeletion(t *testing.T) {
	w := smallWorld(t, 4)
	for _, a := range w.Agents {
		a.Plot = 0
		a.Food = 2
	}
	p := w.Plots[0]
	p.Government = true
	p.Rules["inheritance"] = Rule{Mode: "equal"}
	w.Agents[0].Food = 9
	w.Agents[1].Food = 11
	w.Agents[2].Food = 8
	w.Agents[3].Food = 2
	w.Agents[0].Alive = false
	w.death(w.Agents[0])
	want := []int{0, 12, 12, 6}
	for i, a := range w.Agents {
		if a.Food != want[i] {
			t.Fatalf("estate%d got%d want%d", i, a.Food, want[i])
		}
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
	if w.Month != 2 || w.Day != 1 || a.Score != 0 || a.Food != 0 || a.Plot != -1 || !a.Alive || w.Plots[0].Government || string(a.Memory) != `{"learned":7}` {
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
	maxFed, maxOff := 0, 0
	steps := 0
	for !w.Done {
		if e = w.Step(); e != nil {
			t.Fatal(e)
		}
		steps++
		for _, a := range w.Agents {
			if a.Food < 0 || a.Food > w.Settings.PersonalCapacity || a.Mind < -1e-6 || a.Mind > w.Settings.MindCapacity+1e-6 {
				t.Fatalf("invalid balance day%d: %+v", w.AbsoluteDay, a)
			}
			pledged := 0.
			for _, v := range a.Pledges {
				pledged += v
			}
			if pledged > a.Mind+1e-6 {
				t.Fatal("reserved mind exceeds actual mind")
			}
		}
		off := 0
		fed := 0
		for _, p := range w.Plots {
			off += len(p.Officers)
			if p.Stock < 0 || p.Stock > p.Capacity || p.Reserve < 0 || p.Reserve > p.ReserveCapacity {
				t.Fatal("invalid plot balance")
			}
		}
		for _, f := range w.Federations {
			if !f.Dissolved {
				fed++
			}
		}
		maxOff = max(maxOff, off)
		maxFed = max(maxFed, fed)
	}
	if steps != 360*8 || len(w.Months) != 12 || len(w.Agents) != 300 || maxOff == 0 || maxFed == 0 {
		t.Fatalf("full year incomplete steps%d months%d officers%d feds%d", steps, len(w.Months), maxOff, maxFed)
	}
	for _, a := range w.Agents {
		var m map[string]float64
		json.Unmarshal(a.Memory, &m)
		if m["months"] != 12 {
			t.Fatalf("private memory did not survive year: %s", a.Memory)
		}
	}
}
func TestOnlyFundedEventFamiliesEnterPoliticalRecords(t *testing.T) {
	w := smallWorld(t, 1)
	a := resident(w, 0)
	p := w.Plots[0]
	p.Government = true
	p.RecordsFunded = true
	w.event("think", a.ID, p.ID, "private thought", 2)
	w.event("eat", a.ID, p.ID, "private meal", 2)
	w.event("harvest", a.ID, p.ID, "public recorded harvest", 2)
	if len(p.Records) != 1 || p.Records[0].Kind != "harvest" {
		t.Fatal("records captured private consumption/thinking")
	}
}
func TestUnknownStrategyAndInvalidBuilderFailClearly(t *testing.T) {
	s := DefaultSettings()
	s.Copies = 1
	s.Plots = 1
	if _, e := New(s, []Team{{Policy: "typo"}}, 1); e == nil {
		t.Fatal("unknown strategy silently replaced")
	}
	if _, e := New(s, []Team{{Policy: "steward", Builder: &Builder{Eat: -2}}}, 1); e == nil {
		t.Fatal("negative builder amount accepted")
	}
	if _, e := New(s, []Team{{Policy: "steward", Builder: &Builder{Rules: []BehaviorRule{{Phase: "unknown", Op: "always"}}}}}, 1); e == nil {
		t.Fatal("unknown phase accepted")
	}
}
func TestBuilderPolicyRunsConfiguredFirstDay(t *testing.T) {
	for _, policy := range []string{"builder", "thinker"} {
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
	if len(w.View(0).Receipts) != 0 || len(w.View(0).Records) != 0 || len(w.Plots[0].Records) != 0 {
		t.Fatal("meteor retained agent-visible receipts or records")
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

func TestPendingObservationIsRelevantAndDetached(t *testing.T) {
	s := DefaultSettings()
	s.Copies = 4
	s.Plots = 3
	w, e := New(s, []Team{{Name: "Review", Policy: "steward"}}, 9)
	if e != nil {
		t.Fatal(e)
	}
	w.Agents[0].Plot = 0
	w.Agents[1].Plot = 1
	w.Agents[2].Plot = 2
	w.Plots[0].Federation = 1
	w.Plots[1].Federation = 1
	w.Plots[2].Federation = 2
	w.Pending = []Pending{
		{ID: "local", Actor: 1, Plot: 0, Federation: -1, Input: ProposalInput{Kind: "distribution", Target: 0, Members: []int{0}, Amount: 2}},
		{ID: "foreignTreasury", Actor: 1, Plot: 1, Federation: 1, Input: ProposalInput{Kind: "distribution", Target: 1, Members: []int{1}, Amount: 10}},
		{ID: "sharedConstitution", Actor: 1, Plot: 1, Federation: 1, Input: ProposalInput{Kind: "federationPolicy", Key: "gifts", Rule: Rule{Mode: "on"}}},
		{ID: "foreignConstitution", Actor: 2, Plot: 2, Federation: 2, Input: ProposalInput{Kind: "federationPolicy", Key: "data", Rule: Rule{Mode: "on"}}},
		{ID: "myEntry", Actor: 2, Plot: 2, Federation: 2, Input: ProposalInput{Kind: "permitEntry", Target: 0}},
		{ID: "ownOrder", Actor: 0, Plot: 2, Federation: 2, Input: ProposalInput{Kind: "policy", Key: "entry", Rule: Rule{Mode: "open"}}},
		{ID: "ourFormation", Actor: 2, Plot: 2, Federation: -1, Input: ProposalInput{Kind: "createFederation", Members: []int{0, 2}}},
	}
	view := w.View(0)
	visible := map[string]bool{}
	for _, p := range view.Pending {
		visible[p.ID] = true
	}
	if len(visible) != 5 || visible["foreignTreasury"] || visible["foreignConstitution"] || !visible["local"] || !visible["myEntry"] || !visible["sharedConstitution"] || !visible["ownOrder"] || !visible["ourFormation"] {
		t.Fatalf("incorrect pending scope: %+v", visible)
	}
	view.Pending[0].Input.Members[0] = 999
	view.Pending[0].Input.Amount = 999
	if w.Pending[0].Input.Members[0] != 0 || w.Pending[0].Input.Amount != 2 {
		t.Fatal("private pending view aliases world")
	}
	observer := w.Snapshot()
	if len(observer.Pending) != len(w.Pending) {
		t.Fatal("observer cannot inspect full authorised queue")
	}
	observer.Pending[0].Input.Members[0] = 999
	if w.Pending[0].Input.Members[0] != 0 {
		t.Fatal("observer pending snapshot aliases world")
	}
	outside := w.View(3)
	if len(outside.Pending) != 0 {
		t.Fatal("unrelated outsider sees private pending operations")
	}
}
