package society

import (
	"encoding/json"
	"reflect"
	"slices"
	"testing"
)

func TestJusticeDocketIsOrderedByReceipt(t *testing.T) {
	var baseline string
	for trial := 0; trial < 10; trial++ {
		w := politicalWorld(t, 10, 1)
		govern(w, 0)
		w.Plots[0].Roles["justice"] = 0
		for i := 1; i <= 9; i++ {
			w.event("ration_breach", i, 0, "excess harvest", 1)
		}
		cases := w.SanctionCases(0)
		if len(cases) != 9 {
			t.Fatal("missing cases")
		}
		for i, c := range cases {
			if c.Target != i+1 {
				t.Fatal("docket order depends on map iteration")
			}
		}
		raw, err := json.Marshal(cases)
		if err != nil {
			t.Fatal(err)
		}
		if trial > 0 && string(raw) != baseline {
			t.Fatal("identical cases changed between runs")
		}
		baseline = string(raw)
	}
}

func TestPlacementVisibilityAndStableShuffledIDs(t *testing.T) {
	s := DefaultSettings()
	s.Copies, s.Plots, s.Days, s.Months = 8, 3, 1, 2
	teams := []Team{{Name: "A", Policy: "minimalist"}, {Name: "B", Policy: "minimalist"}, {Name: "C", Policy: "minimalist"}}
	type run struct {
		names  []string
		orders [2][]int
	}
	play := func(seed int64) run {
		var result run
		w, err := New(s, teams, seed)
		if err != nil {
			t.Fatal(err)
		}
		settled := map[int]int{}
		prevMonth := 0
		for id, a := range w.Agents {
			if id != a.ID {
				t.Fatal("ID lookup no longer matches agent")
			}
			result.names = append(result.names, a.Name)
			w.Deciders[id] = func(v Observation) Decision {
				if v.Phase != "placement" {
					return Decision{}
				}
				if prevMonth != v.Month {
					clear(settled)
					prevMonth = v.Month
				}
				if v.Self.Name != result.names[v.Self.ID] {
					t.Fatal("ID changed at reset")
				}
				seen := map[int]int{}
				for _, p := range v.Plots {
					for _, other := range p.Residents {
						if _, dup := seen[other]; dup {
							t.Fatal("resident in two plots")
						}
						seen[other] = p.ID
					}
				}
				if !reflect.DeepEqual(seen, settled) || v.Self.Plot != -1 {
					t.Fatal("placement view does not show exactly the earlier picks")
				}
				order := &result.orders[v.Month-1]
				choice := v.Self.ID % len(v.Plots)
				if len(*order) > 0 {
					choice = seen[(*order)[0]]
				} // Follow the first settler.
				*order = append(*order, v.Self.ID)
				settled[v.Self.ID] = choice
				return Decision{PlotChoice: &choice}
			}
		}
		for !w.Done {
			if err := w.Step(); err != nil {
				t.Fatal(err)
			}
		}
		return result
	}
	a, b, c := play(42), play(42), play(43)
	if !reflect.DeepEqual(a, b) || reflect.DeepEqual(a.names, c.names) {
		t.Fatal("seed failed to reproduce or vary the roster")
	}
	if len(a.orders[0]) != 24 || len(a.orders[1]) != 24 || reflect.DeepEqual(a.orders[0], a.orders[1]) || slices.IsSorted(a.orders[0]) {
		t.Fatal("expected a fresh shuffled turn for every resident each month")
	}
	blocked := true
	for id, name := range a.names {
		if name[0] != byte('A'+id/s.Copies) {
			blocked = false
		}
	}
	if blocked {
		t.Fatal("team ID blocks survived the shuffle")
	}
}
