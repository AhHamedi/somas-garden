package society

import (
	"encoding/json"
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
