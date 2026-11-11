package garden

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func TestDecisionRecordDistinguishesIntentZeroAndFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var v View
		if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
			t.Error(err)
			return
		}
		switch v.Round {
		case 1:
			fmt.Fprint(w, `{"Food":37,"Energy":-12}`)
		case 2:
			fmt.Fprint(w, `{"Food":0,"Energy":0}`)
		default:
			http.Error(w, "stopped", http.StatusInternalServerError)
		}
	}))
	defer server.Close()
	s := DefaultSettings()
	s.RoundLimit, s.DailyFood, s.StartingField = 4, 0, 3
	r := configured(t, s,
		Slot{URL: server.URL, Token: "private-token", PublicStrategyName: "Trial A"},
		Slot{Policy: "failed", Error: "compiled agent unavailable"},
	)
	want := []DecisionRecord{
		{Actor: 0, Status: "ok", ReturnedAction: &ReturnedAction{37, -12}},
		{Actor: 0, Status: "ok", ReturnedAction: &ReturnedAction{0, 0}},
		{Actor: 0, Status: "failed"},
		{Actor: 0, Status: "unavailable"},
	}
	for i, decision := range want {
		start := frame(t, r, i+1, "start")
		if !reflect.DeepEqual(start.Decisions, []DecisionRecord{decision, {Actor: 1, Status: "unavailable"}}) {
			t.Fatalf("day %d: %+v", i+1, start.Decisions)
		}
	}
	if r.Agents[0].TotalFood != 3 || r.Agents[0].TotalEnergy != 0 {
		t.Fatalf("action bounds changed: %+v", r.Agents[0])
	}
	for _, f := range r.Frames {
		if f.Phase != "start" && len(f.Decisions) > 0 {
			t.Errorf("decisions repeated on %s", f.Phase)
		}
	}
	if !reflect.DeepEqual(r.Strategies, []StrategyDescription{{Kind: "go", Name: "Trial A"}, {Kind: "go"}}) {
		t.Fatal(r.Strategies)
	}
	data, err := json.Marshal(r)
	if err != nil || strings.Contains(string(data), "private-token") || strings.Contains(string(data), server.URL) {
		t.Fatal("private runner details in replay or marshal error", err)
	}
	if !strings.Contains(string(data), `{"actor":0,"status":"ok","foodRequested":0,"energyOffered":0}`) ||
		!strings.Contains(string(data), `{"actor":0,"status":"failed"}`) {
		t.Fatal("zero and missing decision have indistinguishable wire records")
	}
}

func TestRecordBuilderBranchAndMemoryOnlyForLivingSeats(t *testing.T) {
	s := DefaultSettings()
	s.RoundLimit, s.DailyFood = 2, 1
	b := Builder{
		Mode: "memory", MemoryName: "my private memory label",
		Rules: []Rule{{Fact: "memory", Op: "eq", Value: 0, Action: ActionSpec{
			Food: "1", Energy: "0", Memory: &MemoryChange{Op: "add", Value: 3},
		}}},
		Fallback: ActionSpec{Food: "1", Energy: "0", Memory: &MemoryChange{Op: "set", Value: 0}},
	}
	a := Builder{Mode: "adaptive", Rules: []Rule{
		{Fact: "day", Op: "eq", Value: 2, Action: ActionSpec{Food: "1", Energy: "4"}},
	}, Fallback: ActionSpec{Food: "1", Energy: "2"}}
	r := configured(t, s, simple("0", "0"), Slot{Builder: &b}, Slot{Builder: &b, PublicStrategyName: "Published builder"}, Slot{Builder: &a}, Slot{Policy: "random"})
	if !reflect.DeepEqual(r.Strategies, []StrategyDescription{
		{Kind: "builder", Mode: "simple"}, {Kind: "builder", Mode: "memory"},
		{Kind: "builder", Mode: "memory", Name: "Published builder"}, {Kind: "builder", Mode: "adaptive"},
		{Kind: "builtin", Policy: "random"},
	}) {
		t.Fatal(r.Strategies)
	}
	for day := 1; day <= 2; day++ {
		records := frame(t, r, day, "start").Decisions
		seen := map[int]bool{}
		for _, d := range records {
			if seen[d.Actor] {
				t.Fatalf("seat %d appears twice", d.Actor)
			}
			seen[d.Actor] = true
			switch d.Actor {
			case 1, 2:
				branch, before, after := 0, 0, 3
				if day == 2 {
					branch, before, after = -1, 3, 0
				}
				if d.MatchedRule == nil || *d.MatchedRule != branch ||
					d.MemoryBefore == nil || *d.MemoryBefore != before || d.MemoryAfter == nil || *d.MemoryAfter != after {
					t.Fatalf("wrong branch/memory for seat %d on day %d", d.Actor, day)
				}
			case 3:
				if d.MatchedRule == nil || *d.MatchedRule != day-2 || d.MemoryBefore != nil || d.MemoryAfter != nil {
					t.Fatalf("wrong adaptive decision on day %d", day)
				}
			default:
				if d.MatchedRule != nil || d.MemoryBefore != nil || d.MemoryAfter != nil {
					t.Fatal("unexpected builder details", d)
				}
			}
		}
		if seen[0] != (day == 1) || !seen[1] || !seen[2] || !seen[3] {
			t.Fatalf("day %d: missing living or present dead seat: %v", day, seen)
		}
	}
	data, err := json.Marshal(r)
	if err != nil || strings.Contains(string(data), b.MemoryName) || strings.Contains(string(data), `"rules"`) || strings.Contains(string(data), `"fallback"`) {
		t.Fatal("private builder configuration in replay or marshal error", err)
	}
}

func TestRecordedAmountsPreserveExtremeGoRequests(t *testing.T) {
	if strconv.IntSize < 64 {
		t.Skip("all requests on a 32-bit runner fit JavaScript integers")
	}
	for _, tc := range []struct{ input, wire string }{
		{"9007199254740991", "9007199254740991"},
		{"9007199254740992", `"9007199254740992"`},
		{"-9223372036854775808", `"-9223372036854775808"`},
		{"9223372036854775807", `"9223372036854775807"`},
	} {
		n, err := strconv.Atoi(tc.input)
		if err != nil {
			t.Fatal(err)
		}
		wire, err := json.Marshal(recordedAmount(n))
		if err != nil || string(wire) != tc.wire {
			t.Fatalf("encoded %s as %s, error %v", tc.input, wire, err)
		}
		var decoded recordedAmount
		if err := json.Unmarshal(wire, &decoded); err != nil || int(decoded) != n {
			t.Fatalf("failed round trip: %d, %v", decoded, err)
		}
	}
}

func TestLegacyRunOmitsNewEvidence(t *testing.T) {
	r := Run(context.Background(), Request{Seed: 3})
	if r.Version != 3 || len(r.Strategies) != 0 {
		t.Fatal("legacy result shape changed")
	}
	for _, f := range r.Frames {
		if len(f.Decisions) != 0 {
			t.Fatal("unexpected evidence in legacy result")
		}
	}
}

func TestFiftyDaysOfMemoryDecisionsFitReplayLimit(t *testing.T) {
	s := DefaultSettings()
	s.RoundLimit, s.DailyFood, s.CarryFood = MaxRounds, 0, true
	s.FieldCapacity, s.StartingField, s.EnergyCapacity = 120, 120, 24
	s.Sunlight.Value, s.Price.Value = 24, 1
	b := Builder{Mode: "memory", Fallback: ActionSpec{Food: "10", Energy: "all", Memory: &MemoryChange{Op: "add", Value: 10_000}}}
	slots := make([]Slot, MaxSeats)
	for i := range slots {
		slots[i] = Slot{ID: strings.Repeat("s", 63) + strconv.Itoa(i), Name: strings.Repeat("実", 40), Builder: &b}
	}
	r := configured(t, s, slots...)
	var buf bytes.Buffer
	if err := WriteReplay(&buf, r); err != nil {
		t.Fatal(err)
	}
	if buf.Len() >= 3_000_000 {
		t.Fatalf("maximum garden replay too large: %d bytes", buf.Len())
	}
	for i := 1; i <= MaxRounds; i++ {
		records := frame(t, r, i, "start").Decisions
		if len(records) != MaxSeats {
			t.Fatalf("day %d has %d decisions", i, len(records))
		}
		for seat, d := range records {
			if d.Actor != seat || d.MemoryAfter == nil || *d.MemoryAfter != i*10_000 || d.FoodRequested != 10 {
				t.Fatalf("day %d seat %d record: %+v", i, seat, d)
			}
		}
	}
	t.Logf("%d bytes with all %d daily decision records", buf.Len(), MaxRounds*MaxSeats)
}
