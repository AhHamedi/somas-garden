package society

import (
	"encoding/json"
	"math"
	"testing"
)

func TestDefaultTeamsAreTheSixPresets(t *testing.T) {
	teams := DefaultTeams()
	presets := Presets()
	if len(teams) != 6 || len(presets) != 6 {
		t.Fatalf("want six default teams, got %d teams and %d presets", len(teams), len(presets))
	}
	seen := map[string]bool{}
	for i, p := range presets {
		if teams[i].Policy != p.Policy || teams[i].Name != p.Name || !knownPolicy(p.Policy) || p.Summary == "" || seen[p.Policy] {
			t.Fatalf("preset %d is inconsistent: %+v / %+v", i, p, teams[i])
		}
		seen[p.Policy] = true
	}
}

func TestEarlierPolicyNamesStillLoad(t *testing.T) {
	s := DefaultSettings()
	s.Copies, s.Plots = 1, 1
	old := []string{"steward", "thinker", "gatherer", "diplomat", "wanderer", "learner"}
	teams := []Team{}
	for _, p := range old {
		teams = append(teams, Team{Name: p, Policy: p})
	}
	w, err := New(s, teams, 1)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"warden", "sunchaser", "locust", "envoy", "sunchaser", "tinkerer"}
	for i, team := range w.Teams {
		if team.Policy != want[i] {
			t.Fatalf("%s loaded as %s, want %s", old[i], team.Policy, want[i])
		}
	}
}

// The steady harvest must leave the field exactly as large after the
// engine's overnight regrowth.
func TestSteadyHarvestHoldsTheField(t *testing.T) {
	s := DefaultSettings()
	for _, tc := range []struct{ capacity, stock, residents int }{{500, 400, 50}, {400, 250, 30}, {600, 300, 70}} {
		residents := make([]int, tc.residents)
		for i := range residents {
			residents[i] = i
		}
		stock := tc.stock
		v := Observation{Phase: "harvest", Settings: s, Self: Agent{ID: 0, Plot: 0}, Plots: []PlotView{{ID: 0, Capacity: tc.capacity, Stock: &stock, Residents: residents}}}
		c := newCtx(v)
		h := c.steady() * float64(tc.residents)
		left := float64(tc.stock) - h
		growth := s.Growth * math.Min(float64(tc.residents), float64(tc.capacity)/s.ProductiveCapacity) * left / float64(tc.capacity)
		if after := left + math.Min(growth, float64(tc.capacity)-left); math.Abs(after-float64(tc.stock)) > 1e-6 {
			t.Fatalf("%+v: steady harvest %.2f leaves %.2f tomorrow, want %d", tc, h, after, tc.stock)
		}
	}
}

func judgeWith(policy string, q *Proposal, plot PlotView, self int) string {
	s := DefaultSettings()
	v := Observation{Phase: "voting", AbsoluteDay: 3, Day: 3, Settings: s, Self: Agent{ID: self, Plot: 0, Team: self / s.Copies}, Plots: []PlotView{plot}, Proposals: []*Proposal{q}}
	d := defaultDecision(v, policy)
	if x, ok := d.Votes[q.ID]; ok {
		return x
	}
	return "abstain"
}

func TestPresetsVoteTheirInterests(t *testing.T) {
	stock := 400
	residents := make([]int, 50)
	for i := range residents {
		residents[i] = i * 6
	}
	plot := PlotView{ID: 0, Capacity: 500, Stock: &stock, Government: true, Federation: -1, Residents: residents, Rules: map[string]Rule{}}
	motion := func(author int, in ProposalInput) *Proposal {
		in.Plot = 0
		return &Proposal{ID: "m", Author: author, Plot: 0, Federation: -1, Status: "open", Closes: 3, Input: in}
	}
	fair := motion(0, ProposalInput{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 2}})
	greedy := motion(0, ProposalInput{Kind: "policy", Key: "quota", Rule: Rule{Mode: "limited", Amount: 4}})
	grant := motion(200, ProposalInput{Kind: "policy", Key: "influence:200", Target: 200, Rule: Rule{Target: 200, Amount: 5}})
	cases := []struct {
		policy string
		q      *Proposal
		self   int
		want   string
	}{
		{"warden", fair, 0, "yes"},
		{"warden", greedy, 0, "no"},
		{"warden", grant, 0, "no"},
		{"locust", fair, 100, "no"},
		{"baron", fair, 200, "yes"},
		{"baron", grant, 206, "yes"},
		{"envoy", grant, 150, "no"},
		{"sunchaser", fair, 250, "abstain"},
	}
	for _, tc := range cases {
		if got := judgeWith(tc.policy, tc.q, plot, tc.self); got != tc.want {
			t.Errorf("%s on %s %v: %s, want %s", tc.policy, tc.q.Input.Key, tc.q.Input.Rule, got, tc.want)
		}
	}
}

func TestTinkerersKeepTheBestStyle(t *testing.T) {
	s := DefaultSettings()
	mem := map[string]float64{}
	scores := []float64{180, 260, 200, 190}
	for i, x := range scores {
		mem["n"+string(rune('0'+i))] = 2
		mem["t"+string(rune('0'+i))] = 2 * x
	}
	raw, _ := json.Marshal(mem)
	for id := 50; id < 60; id++ {
		c := newCtx(Observation{Month: 9, Settings: s, Self: Agent{ID: id}, Memory: raw})
		if got := chooseStyle(c); got != 1 {
			t.Fatalf("agent %d chose style %s after eight months, want civic", id, tinkerStyles[got])
		}
	}
	c := newCtx(Observation{Month: 1, Settings: s, Self: Agent{ID: 53}, Memory: json.RawMessage(`{}`)})
	if got := chooseStyle(c); got != 53%4 {
		t.Fatalf("first month style %d, want the staggered %d", got, 53%4)
	}
}

// A default month: the commons holds, institutions emerge, and each style is
// visible in what its members actually do.
func TestDefaultWorldShowsEveryStyle(t *testing.T) {
	if testing.Short() {
		t.Skip("simulates a full month")
	}
	s := DefaultSettings()
	s.Months = 1
	w, err := New(s, nil, 42)
	if err != nil {
		t.Fatal(err)
	}
	moves := make([]int, len(w.Teams))
	tabled := map[string]int{}
	officers := make([]int, len(w.Teams))
	for !w.Done {
		if err := w.Step(); err != nil {
			t.Fatal(err)
		}
		for _, e := range w.Events[w.eventStart:] {
			if e.Kind == "move" && e.Actor >= 0 {
				moves[w.Agents[e.Actor].Team]++
			}
		}
		if w.Phase == "close" && w.Day == 15 {
			for _, p := range w.Plots {
				for id := range p.Officers {
					officers[w.Agents[id].Team]++
				}
			}
		}
	}
	for _, p := range w.Proposals {
		tabled[w.Teams[w.Agents[p.Author].Team].Policy+"/"+p.Input.Kind+"/"+policyBase(p.Input.Key)]++
	}
	month := w.Months[0]
	if month.Deaths > 15 {
		t.Fatalf("%d deaths in a default month; the presets should keep the commons alive", month.Deaths)
	}
	team := func(policy string) int {
		for i, x := range w.Teams {
			if x.Policy == policy {
				return i
			}
		}
		t.Fatalf("no %s team", policy)
		return -1
	}
	if moves[team("sunchaser")] <= moves[team("warden")] || moves[team("locust")] <= moves[team("warden")] {
		t.Fatalf("sunchasers and locusts should roam more than wardens: %v", moves)
	}
	for _, k := range []string{"warden/policy/quota", "warden/policy/enforcement", "envoy/federationFound/", "envoy/ratify/data", "baron/office/"} {
		if tabled[k] == 0 {
			t.Fatalf("expected motions %s; tabled %v", k, tabled)
		}
	}
	if tabled["sunchaser/found/"]+tabled["locust/found/"] > 0 {
		t.Fatal("sunchasers and locusts never table motions")
	}
	if officers[team("baron")] == 0 {
		t.Fatalf("barons should hold office by mid-month: %v", officers)
	}
	if month.Teams[team("locust")].Mean <= month.Teams[team("envoy")].Mean {
		t.Fatal("free riders should out-score the team paying for the federation")
	}
}
