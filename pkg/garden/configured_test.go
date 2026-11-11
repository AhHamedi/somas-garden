package garden

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func configured(t *testing.T, s Settings, slots ...Slot) Result {
	t.Helper()
	r := Request{Seed: 19, Settings: &s, Slots: slots}
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	return Run(context.Background(), r)
}
func simple(food, energy Amount) Slot {
	return Slot{Builder: &Builder{Mode: "simple", Fallback: ActionSpec{Food: food, Energy: energy}}}
}
func frame(t *testing.T, r Result, day int, phase string) Frame {
	t.Helper()
	for _, f := range r.Frames {
		if f.Round == day && f.Phase == phase {
			return f
		}
	}
	t.Fatalf("day %d has no %s", day, phase)
	return Frame{}
}

func TestConfiguredDefaultMatchesLegacyChoicesAndOutcomes(t *testing.T) {
	cfg := DefaultSettings()
	for _, seed := range []int64{0, 7, 42, 999999} {
		slots := []Slot{{Policy: "random"}, {Policy: "greedy"}, {Policy: "cooperate"}, {Policy: "cooperate"}, {Policy: "random"}, {Policy: "cooperate"}}
		req := Request{Seed: seed, Slots: slots}
		old := Run(context.Background(), req)
		req.Settings = &cfg
		current := Run(context.Background(), req)
		if current.Version != 4 || current.Rounds != old.Rounds || current.Food != old.Food || len(current.Frames) != len(old.Frames)+old.Rounds {
			t.Fatal(seed, current.Rounds, current.Food, len(current.Frames))
		}
		// The new dawn records actual credit. An already-full wallet gains zero.
		for i := range old.Agents {
			old.Agents[i].Sunlight = current.Agents[i].Sunlight
		}
		if !reflect.DeepEqual(current.Agents, old.Agents) {
			t.Fatal("different outcomes", seed, current.Agents, old.Agents)
		}
		index := 0
		for _, f := range current.Frames {
			if f.Phase == "supper" {
				continue
			}
			o := old.Frames[index]
			index++
			if f.Phase != o.Phase || f.Actor != o.Actor || f.Food != o.Food || f.Energy != o.Energy || f.Pending != o.Pending || f.Created != o.Created {
				t.Fatal("legacy action changed", seed, f.Round, f.Phase)
			}
		}
	}
}

func TestPantryMealsAndDeath(t *testing.T) {
	s := DefaultSettings()
	s.StartingPantry, s.DailyFood, s.CarryFood = 4, 3, true
	a, b := simple("0", "0"), simple("0", "0")
	n := 1
	b.StartingPantry = &n
	result := configured(t, s, a, b)
	if len(result.Agents) != 2 || result.Rounds != 2 {
		t.Fatal(result.Rounds, len(result.Agents))
	}
	expected := []Meal{{0, 4, 3, 1, true}, {1, 1, 1, 0, false}}
	if got := frame(t, result, 1, "supper").Meals; !reflect.DeepEqual(got, expected) {
		t.Fatal(got)
	}
	if got := frame(t, result, 2, "supper").Meals; !reflect.DeepEqual(got, []Meal{{0, 1, 1, 0, false}}) {
		t.Fatal(got)
	}
	if result.Agents[0].Fed != 1 || result.Agents[0].TotalFood != 0 || result.Agents[0].TotalEaten != 4 || result.Agents[1].DiedRound != 1 {
		t.Fatal(result.Agents)
	}

	s.CarryFood = false
	result = configured(t, s, a)
	if m := frame(t, result, 1, "supper").Meals[0]; !m.Fed || m.After != 0 || m.Eaten != 3 || result.Agents[0].TotalEaten != 3 {
		t.Fatal(m)
	}
	s.DailyFood = 0
	result = configured(t, s, a)
	if result.Agents[0].Dead || result.Rounds != 30 || frame(t, result, 1, "supper").Meals[0].Eaten != 0 {
		t.Fatal(result.Agents)
	}
}

func TestRechargeRandomAndIndependentRuleStreams(t *testing.T) {
	s := DefaultSettings()
	s.DailyFood = 0
	s.EnergyCapacity = 5
	s.Sunlight.Value = 2
	a, b := simple("0", "0"), simple("0", "0")
	r := configured(t, s, a, b)
	for day, expected := range []int{2, 4, 5, 5} {
		st := frame(t, r, day+1, "start").Agents[0]
		credits := []int{2, 2, 1, 0}
		if st.EnergyLeft != expected || st.Sunlight != credits[day] {
			t.Fatal(day, st)
		}
	}
	s.Sunlight = DailyRange{Mode: "random", Min: 0, Max: 24}
	s.Price = PriceRule{DailyRange: DailyRange{Mode: "random", Min: 1, Max: 12}}
	s.EnergyCapacity = 24
	a, b = simple("10", "all"), simple("10", "all")
	r = configured(t, s, a, b)
	for _, f := range r.Frames {
		if f.Phase == "start" && (f.Agents[0].Price != f.Agents[1].Price || f.Agents[0].EnergyLeft != f.Agents[1].EnergyLeft && f.Round == 1) {
			t.Fatal(f)
		}
	}
	s.Sunlight.PerAgent = true
	soloSun := configured(t, s, a, b)
	s.Price.PerAgent = true
	both := configured(t, s, a, b)
	if !reflect.DeepEqual(both, configured(t, s, a, b)) {
		t.Fatal("seed cannot reproduce random game")
	}
	sawDifferentSun, sawDifferentPrice := false, false
	for day := 1; day <= Rounds; day++ {
		shared := frame(t, r, day, "start").Agents
		sun := frame(t, soloSun, day, "start").Agents
		dual := frame(t, both, day, "start").Agents
		if shared[0].Price != sun[0].Price || shared[1].Price != sun[1].Price {
			t.Fatal("private sunlight changed shared prices")
		}
		if dual[0].Price != dual[1].Price {
			sawDifferentPrice = true
		}
		if sun[0].Sunlight != sun[1].Sunlight {
			sawDifferentSun = true
		}
	}
	if !sawDifferentSun || !sawDifferentPrice {
		t.Fatal("missing private draws")
	}
}

func TestPriceLockAndDensity(t *testing.T) {
	s := DefaultSettings()
	s.Price.Mode = "random"
	w := world{settings: s, food: 3}
	first := person{state: State{Price: 5, EnergyLeft: 2}}
	second := person{state: State{Price: 1, EnergyLeft: 4}}
	if got := w.plant(&first, 2); !reflect.DeepEqual(got, []Deposit{{5, 2, false}}) || w.pending != 2 || w.lockedPrice != 5 {
		t.Fatal(got)
	}
	w.settings.PlantingMinimum = 4
	if got := w.plant(&second, 4); len(got) != 0 || w.pending != 2 || second.state.EnergyLeft != 4 {
		t.Fatal("planting below minimum", got)
	}
	w.settings.PlantingMinimum = 0
	// Even a different quote on another day must finish the old 5-energy carrot first.
	w.round++
	if got := w.plant(&second, 4); !reflect.DeepEqual(got, []Deposit{{5, 3, true}, {1, 1, true}}) || w.food != 5 || w.lockedPrice != 0 || w.pending != 0 {
		t.Fatal(got)
	}
	for _, endpoints := range [][2]int{{1, 4}, {4, 1}} {
		w := world{settings: DefaultSettings()}
		w.settings.FieldCapacity = 3
		w.settings.Price = PriceRule{DailyRange: DailyRange{Mode: "density"}, Empty: endpoints[0], Full: endpoints[1]}
		p := person{state: State{EnergyLeft: 24}}
		got := w.plant(&p, 24)
		want := []Deposit{{1, 1, true}, {2, 2, true}, {3, 3, true}}
		if endpoints[0] == 4 {
			want = []Deposit{{4, 4, true}, {3, 3, true}, {2, 2, true}}
		}
		if !reflect.DeepEqual(got, want) || w.food != 3 || p.state.EnergyLeft != 24-w.energy || len(w.plant(&p, 24)) != 0 {
			t.Fatal(got, w.energy)
		}
	}
	s = DefaultSettings()
	s.FieldCapacity = 4
	s.StartingField = 2
	s.PlantingMinimum = 2
	s.DailyFood = 0
	r := configured(t, s, simple("1", "6"))
	if f := frame(t, r, 1, "grow"); f.Food != 1 || f.Energy != 0 || f.Created != 0 {
		t.Fatal(f)
	}
}

func TestIndependentSeatMemoryAndRunReset(t *testing.T) {
	s := DefaultSettings()
	s.DailyFood = 0
	s.CarryFood = true
	b := Builder{Mode: "memory", Rules: []Rule{
		{Fact: "memory", Op: "gt", Value: 0, Action: ActionSpec{Food: "1", Energy: "0"}},
		{Fact: "pantry", Op: "gte", Value: 10, Action: ActionSpec{Food: "0", Energy: "0", Memory: &MemoryChange{"set", 1}}},
	}, Fallback: ActionSpec{Food: "0", Energy: "0"}}
	n := 10
	for i := 0; i < 2; i++ {
		r := configured(t, s, Slot{Builder: &b, StartingPantry: &n}, Slot{Builder: &b})
		if r.Agents[0].TotalFood != 29 || r.Agents[1].TotalFood != 0 {
			t.Fatal(r.Agents)
		}
	}
}

func TestBuilderExportRunsTheSameDecisions(t *testing.T) {
	b := Builder{Mode: "memory", Rules: []Rule{
		{Fact: "memory", Op: "gte", Value: 2, Action: ActionSpec{Food: "supper", Energy: "all", Memory: &MemoryChange{"set", 0}}},
		{Fact: "perAgent", Op: "lt", Value: 2, Action: ActionSpec{Food: "1", Energy: "4", Memory: &MemoryChange{"add", 1}}},
		{Fact: "lastFood", Op: "eq", Value: 0, Action: ActionSpec{Food: "all", Energy: "1", Memory: &MemoryChange{"add", 2}}},
	}, Fallback: ActionSpec{Food: "3", Energy: "0", Memory: &MemoryChange{"add", -1}}}
	source, err := b.GoSource()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	write := func(name, s string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(s), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("agent.go", source)
	view, err := os.ReadFile("../../runner/view2.go")
	if err != nil {
		t.Fatal(err)
	}
	write("view.go", string(view))
	write("main.go", `package main
import ("encoding/json"; "fmt"; "os")
type Action struct{Food,Energy int}
func main(){var views []View;if err:=json.NewDecoder(os.Stdin).Decode(&views);err!=nil{panic(err)};for _,v:=range views{a:=Decide(v);fmt.Println(a.Food,a.Energy,memory)}}
`)
	views := []View{{PatchFood: 0, AgentCount: 3}, {PatchFood: 30, AgentCount: 3, LastFood: 0}, {PatchFood: 0, AgentCount: 2, DailyFood: 3, Pantry: 1, Energy: 9}, {PatchFood: 30, AgentCount: 3, LastFood: 4}}
	var want strings.Builder
	memory := 0
	for _, v := range views {
		d := b.Decide(v, memory)
		memory = d.Memory
		fmt.Fprintln(&want, d.Action.Food, d.Action.Energy, memory)
	}
	data, _ := json.Marshal(views)
	cmd := exec.Command(filepath.Join(runtime.GOROOT(), "bin", "go"), "run", "main.go", "agent.go", "view.go")
	cmd.Dir = dir
	cmd.Stdin = bytes.NewReader(data)
	got, err := cmd.CombinedOutput()
	if err != nil || string(got) != want.String() {
		t.Fatalf("export mismatch: %v\n%s\nwant %s", err, got, want.String())
	}
}

func TestConfiguredTraceFitsReplayStore(t *testing.T) {
	s := DefaultSettings()
	s.RoundLimit = MaxRounds
	s.FieldCapacity, s.StartingField, s.DailyFood, s.EnergyCapacity, s.Sunlight.Value, s.Price.Value = 120, 120, 0, 24, 24, 1
	var slots []Slot
	for i := 0; i < MaxSeats; i++ {
		a := simple("all", "all")
		a.Name = strings.Repeat("<", 40)
		a.ID = fmt.Sprint(i) + strings.Repeat("x", 63)
		slots = append(slots, a)
	}
	r := configured(t, s, slots...)
	data, err := json.Marshal(r)
	if err != nil || len(data) >= 3000000 || len(r.Frames) != 751 || r.Rounds != MaxRounds {
		t.Fatal(err, len(data))
	}
	t.Logf("%d bytes across %d frames", len(data), len(r.Frames))
	for _, f := range r.Frames {
		if f.Phase != "contribute" {
			continue
		}
		n := 0
		for _, d := range f.Deposits {
			n += d.Energy
		}
		if n != f.Agents[f.Actor].Given {
			t.Fatal("transactions disagree with contribution", f)
		}
	}
}
