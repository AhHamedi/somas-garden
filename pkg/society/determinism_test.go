package society

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestSanctionLapsesHaveSeedReproducibleEventOrder(t *testing.T) {
	var baseline string
	for trial := 0; trial < 10; trial++ {
		w := politicalWorld(t, 12, 1)
		govern(w, 0)
		w.AbsoluteDay = 3
		for i := 0; i < 12; i++ {
			id := fmt.Sprintf("case-%02d", i)
			w.politicalState().Authorizations[id] = &sanctionAuthorization{ID: id, Plot: 0, Author: i, Start: 1, Until: 2}
		}
		w.policyBoundary()
		raw, _ := json.Marshal(w.Events)
		current := string(raw)
		if trial == 0 {
			baseline = current
		} else if current != baseline {
			t.Fatalf("identical world and seed produced different lapse event order at trial%d", trial)
		}
	}
}

func TestSimultaneousFederationExitsAreSeedReproducible(t *testing.T) {
	var baseline string
	for trial := 0; trial < 10; trial++ {
		w := politicalWorld(t, 8, 8)
		w.AbsoluteDay = 3
		members := []int{}
		for i, p := range w.Plots {
			govern(w, i)
			p.Federation = 1
			w.Agents[i].Plot = i
			members = append(members, i)
			w.politicalState().ExitFederation[i] = 3
		}
		w.Federations = []*Federation{{ID: 1, Plots: members, Rules: map[string]Rule{}}}
		w.policyBoundary()
		for _, p := range w.Plots {
			if p.Federation != -1 {
				t.Fatal("departing plot retained federation membership")
			}
		}
		if !w.Federations[0].Dissolved {
			t.Fatal("empty federation survived")
		}
		raw, _ := json.Marshal(w.Federations)
		current := string(raw)
		if trial == 0 {
			baseline = current
		} else if current != baseline {
			t.Fatalf("identical exits produced different federation archive at trial%d", trial)
		}
	}
}
