package garden

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync/atomic"
	"testing"
)

func TestAccountingAndReplay(t *testing.T) {
	a := Run(context.Background(), Request{Seed: 7})
	b := Run(context.Background(), Request{Seed: 7})
	if !reflect.DeepEqual(a, b) {
		t.Fatal("non-repeatable baseline")
	}
	if a.Food != 60 || len(a.Frames) != 421 {
		t.Fatalf("unexpected result %d frames %d", a.Food, len(a.Frames))
	}
	for _, p := range a.Agents {
		if p.TotalFood != 60 || p.TotalEnergy != 120 || p.Fed != 30 {
			t.Fatal(p)
		}
	}
	for _, f := range a.Frames {
		if f.Food < 0 || f.Food > 60 || f.Energy < 0 || f.Energy > 36 {
			t.Fatal(f)
		}
	}
}
func TestFarmingHasItsOwnDailyShuffle(t *testing.T) {
	result := Run(context.Background(), Request{Seed: 7})
	harvest, farming := map[int][]int{}, map[int][]int{}
	for _, f := range result.Frames {
		if f.Phase == "harvest" {
			harvest[f.Round] = append(harvest[f.Round], f.Actor)
		}
		if f.Phase == "contribute" {
			farming[f.Round] = append(farming[f.Round], f.Actor)
		}
	}
	// Farming must not consume the harvest random stream.
	if !reflect.DeepEqual(harvest[1], []int{2, 0, 5, 3, 1, 4}) || !reflect.DeepEqual(harvest[2], []int{3, 5, 0, 4, 1, 2}) {
		t.Fatal("farming changed the existing harvest shuffle", harvest[1], harvest[2])
	}
	firsts := map[int]bool{}
	different := false
	for day := 1; day <= Rounds; day++ {
		seen := map[int]bool{}
		for _, actor := range farming[day] {
			seen[actor] = true
		}
		if len(farming[day]) != 6 || len(seen) != 6 {
			t.Fatal("invalid farming order", day, farming[day])
		}
		firsts[farming[day][0]] = true
		if !reflect.DeepEqual(harvest[day], farming[day]) {
			different = true
		}
	}
	if len(firsts) < 2 || !different {
		t.Fatal("farming order is fixed or copied from harvesting", farming)
	}
}
func TestRemoteDecisionsAndFailure(t *testing.T) {
	var calls atomic.Int32
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test" {
			t.Error("missing token")
		}
		var v View
		_ = json.NewDecoder(r.Body).Decode(&v)
		if v.AgentCount < 1 || v.AgentCount > 6 || v.Energy != 6 {
			t.Error(v)
		}
		calls.Add(1)
		_ = json.NewEncoder(w).Encode(Action{100, 100})
	}))
	defer remote.Close()
	r := Run(context.Background(), Request{Slots: []Slot{{ID: "a", Name: "Actual code", URL: remote.URL, Token: "test"}}})
	if calls.Load() == 0 || r.Agents[0].TotalEnergy != int(calls.Load())*6 || r.Food == 60 {
		t.Fatal("remote code did not change the outcome")
	}
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "panic", 500) }))
	defer broken.Close()
	r = Run(context.Background(), Request{Slots: []Slot{{ID: "bad", URL: broken.URL}}})
	if r.Agents[0].Error == "" || r.Agents[0].TotalFood != 0 || r.Agents[0].TotalEnergy != 0 {
		t.Fatal("failed policy was not stopped")
	}
}

func TestSnapshotPreviousResultsAndIndependentState(t *testing.T) {
	servers := make([]*httptest.Server, 2)
	// Keep enough garden space for every stateful decision to be accepted,
	// whichever contributor happens to go first.
	quiet := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Action{Food: 1, Energy: 0})
	}))
	defer quiet.Close()
	slots := make([]Slot, 6)
	for i := range slots {
		slots[i] = Slot{ID: fmt.Sprint(i), URL: quiet.URL}
	}
	for i := range servers {
		count := 0
		servers[i] = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var v View
			_ = json.NewDecoder(r.Body).Decode(&v)
			count++
			if count != v.Round || (v.Round > 1 && v.LastEnergy != 5+(count-1)%2) {
				t.Errorf("private state or previous result wrong: %d %+v", count, v)
			}
			if v.Round == 1 && v.PatchFood != 60 {
				t.Error("not round-start snapshot")
			}
			_ = json.NewEncoder(w).Encode(Action{Food: 1, Energy: 5 + count%2})
		}))
		defer servers[i].Close()
		slots[i] = Slot{ID: "stateful", URL: servers[i].URL}
	}
	r := Run(context.Background(), Request{Seed: 3, Slots: slots})
	if r.Agents[0].TotalEnergy != 165 || r.Agents[1].TotalEnergy != 165 {
		t.Fatal(r.Agents)
	}
	r = Run(context.Background(), Request{Slots: []Slot{{Error: "compile failed", Policy: "failed"}}})
	if r.Agents[0].TotalEnergy != 0 || r.Agents[0].TotalFood != 0 || r.Agents[0].Error == "" {
		t.Fatal("startup error silently acted")
	}
}

func TestEveryResourceMovement(t *testing.T) {
	r := Run(context.Background(), Request{Seed: 42, Slots: []Slot{{Policy: "random"}, {Policy: "greedy"}}})
	for _, f := range r.Frames {
		harvested, spent := 0, 0
		for _, a := range f.Agents {
			harvested += a.TotalFood
			spent += a.TotalEnergy
			if a.EnergyLeft < 0 || a.EnergyLeft > 6 {
				t.Fatal("invalid personal energy", a)
			}
		}
		if f.Food+harvested != 60+spent/2 || f.Pending != spent%2 {
			t.Fatal("2:1 conservation failed", f.Round, f.Phase, f.Food, harvested, spent, f.Pending)
		}
		if f.Food < 0 || f.Food > 60 {
			t.Fatal("garden capacity", f.Food)
		}
	}
}

func TestStarvationStopsFutureDecisions(t *testing.T) {
	var calls atomic.Int32
	starving := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_ = json.NewEncoder(w).Encode(Action{Food: 0, Energy: 6})
	}))
	defer starving.Close()
	slots := []Slot{{Name: "Starves", URL: starving.URL}}
	for i := 1; i < 6; i++ {
		slots = append(slots, Slot{Policy: "greedy"})
	}
	result := Run(context.Background(), Request{Seed: 7, Slots: slots})
	a := result.Agents[0]
	if !a.Dead || a.DiedRound != 1 || a.TotalFood != 0 || a.TotalEnergy != 6 || calls.Load() != 1 {
		t.Fatal("dead agent acted again", a, calls.Load())
	}
	deaths := 0
	for _, f := range result.Frames {
		if f.Phase == "death" && f.Actor == 0 {
			deaths++
		}
		if f.Round > 1 && f.Actor == 0 {
			t.Fatal("dead agent received an action frame", f)
		}
	}
	if deaths != 1 {
		t.Fatal("death must be recorded exactly once", deaths)
	}
}
func TestSurvivalAndAllDeadGameEnd(t *testing.T) {
	survivors := Run(context.Background(), Request{Seed: 7})
	for _, a := range survivors.Agents {
		if a.Dead {
			t.Fatal("fed creature died", a)
		}
	}
	slots := make([]Slot, 6)
	for i := range slots {
		slots[i] = Slot{ID: fmt.Sprint(i), Policy: "failed", Error: "Stopped"}
	}
	result := Run(context.Background(), Request{Slots: slots})
	if result.Rounds != 1 {
		t.Fatal("empty game kept running", result.Rounds)
	}
	for _, a := range result.Agents {
		if !a.Dead || a.DiedRound != 1 {
			t.Fatal(a)
		}
	}
}

func TestConversionFromAnEmptyGarden(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Action{Food: 10, Energy: 6})
	}))
	defer remote.Close()
	slots := make([]Slot, 6)
	for i := range slots {
		slots[i] = Slot{URL: remote.URL, ID: fmt.Sprint(i)}
	}
	result := Run(context.Background(), Request{Seed: 7, Slots: slots})
	for _, f := range result.Frames {
		if f.Round == 1 && f.Phase == "grow" {
			if f.Food != 18 || f.Energy != 36 || f.Pending != 0 || f.Created != 18 {
				t.Fatal("36 energy should make 18 carrots with no seed threshold", f)
			}
			return
		}
	}
	t.Fatal("missing conversion result")
}
func TestOddTokenWaitsAcrossRoundsAndFullGardenRejectsEnergy(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		energy := 0
		if r.Header.Get("Authorization") == "Bearer odd" {
			energy = 1
		}
		_ = json.NewEncoder(w).Encode(Action{Food: 1, Energy: energy})
	}))
	defer remote.Close()
	slots := make([]Slot, 6)
	for i := range slots {
		slots[i] = Slot{URL: remote.URL, ID: fmt.Sprint(i)}
	}
	slots[0].Token = "odd"
	result := Run(context.Background(), Request{Seed: 7, Slots: slots})
	for _, f := range result.Frames {
		if f.Round == 1 && f.Phase == "grow" && (f.Pending != 1 || f.Created != 0) {
			t.Fatal("unmatched token disappeared", f)
		}
		if f.Round == 2 && f.Phase == "start" && f.Pending != 1 {
			t.Fatal("token did not survive sunrise", f)
		}
		if f.Round == 2 && f.Phase == "grow" && (f.Pending != 0 || f.Created != 1 || f.Food != 49) {
			t.Fatal("odd pair was not converted", f)
		}
	}
	full := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Action{Food: 0, Energy: 6})
	}))
	defer full.Close()
	for i := range slots {
		slots[i].URL = full.URL
	}
	result = Run(context.Background(), Request{Slots: slots})
	for _, a := range result.Agents {
		if a.TotalEnergy != 0 {
			t.Fatal("full garden accepted wasted energy", a)
		}
	}
}
