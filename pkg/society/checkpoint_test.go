package society

import (
	"bytes"
	"encoding/json"
	"math/rand"
	"reflect"
	"testing"
)

func TestCountedRandomPreservesOriginalStream(t *testing.T) {
	want := rand.New(rand.NewSource(-7823))
	got, source := newCountedRandom(-7823)
	for i := 0; i < 1000; i++ {
		if want.Int63() != got.Int63() || want.Uint64() != got.Uint64() || want.Float64() != got.Float64() || !reflect.DeepEqual(want.Perm(31), got.Perm(31)) {
			t.Fatal("counted source changed the original random stream")
		}
	}
	resumed, _ := restoreRandom(randomState(source))
	for i := 0; i < 1000; i++ {
		if want.Uint64() != resumed.Uint64() {
			t.Fatal("restored source diverged")
		}
	}
}

func TestCheckpointResumesEveryPhaseAndMeteorWithPrivateMemory(t *testing.T) {
	s := DefaultSettings()
	s.Copies, s.Days, s.Months = 3, 4, 3
	want, err := New(s, DefaultTeams(), 243)
	if err != nil {
		t.Fatal(err)
	}
	attach := func(w *World) {
		w.Deciders[0] = func(v Observation) Decision {
			d := builtinDecision(v, w.Teams[0])
			var n int
			_ = json.Unmarshal(v.Memory, &n)
			d.Memory, _ = json.Marshal(n + 1)
			return d
		}
	}
	attach(want)
	state, err := want.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	got, err := RestoreCheckpoint(state)
	if err != nil {
		t.Fatal(err)
	}
	meteors := 0
	for phase := 0; !want.Done; phase++ {
		attach(got)
		if err := want.Step(); err != nil {
			t.Fatal(err)
		}
		if err := got.Step(); err != nil {
			t.Fatal(err)
		}
		expected, err := want.Checkpoint()
		if err != nil {
			t.Fatal(err)
		}
		actual, err := got.Checkpoint()
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(expected, actual) {
			t.Fatalf("private state diverged after phase %d (%s, month %d day %d)", phase, want.Phase, want.Month, want.Day)
		}
		if !reflect.DeepEqual(want.View(0), got.View(0)) {
			t.Fatalf("private observation diverged after phase %d", phase)
		}
		if want.Meteor {
			meteors++
		}
		got, err = RestoreCheckpoint(actual)
		if err != nil {
			t.Fatal(err)
		}
	}
	if meteors != 3 {
		t.Fatalf("tested %d meteors", meteors)
	}
	var count int
	_ = json.Unmarshal(got.Agents[0].Memory, &count)
	if count < 3 {
		t.Fatal("explicit strategy memory did not survive resets")
	}
}

func TestCheckpointPreservesPrivateRecordsAndCursorSnapshots(t *testing.T) {
	w := recordWorld(t)
	w.Teams[0].Token = "private-team-token"
	w.Agents[0].Memory = json.RawMessage(`{"private":19}`)
	w.Agents[0].VotingTokens = 2
	w.Plots[0].GrowthRemainder = 0.3
	w.Plots[0].HarvestOrder = []int{1, 0}
	page, err := w.ReadRecordsPage(0, RecordQuery{Plot: 0, PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	w.event("harvest", 0, 0, "after frozen cursor", 1)
	checkpoint, err := w.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	got, err := RestoreCheckpoint(checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	for page.NextCursor != "" {
		wantNext, e := w.ReadRecordsPage(0, RecordQuery{Cursor: page.NextCursor})
		if e != nil {
			t.Fatal(e)
		}
		gotNext, e := got.ReadRecordsPage(0, RecordQuery{Cursor: page.NextCursor})
		if e != nil {
			t.Fatal(e)
		}
		if !reflect.DeepEqual(wantNext, gotNext) {
			t.Fatal("record continuation changed after restoration")
		}
		page = wantNext
	}
	wantState, _ := w.Checkpoint()
	gotState, _ := got.Checkpoint()
	if !bytes.Equal(wantState, gotState) {
		t.Fatal("private records or balances were lost")
	}
	observer, _ := json.Marshal(got.Snapshot())
	if bytes.Contains(observer, []byte("private-team-token")) || bytes.Contains(observer, []byte(`"private"`)) || bytes.Contains(observer, []byte(`"memory"`)) {
		t.Fatal("private checkpoint fields leaked into observer snapshots")
	}
}

func TestPreviousCheckpointKeepsItsRulesAcrossRestarts(t *testing.T) {
	w := politicalWorld(t, 4, 1)
	// Simulate the on-disk v2 format, before the vote mind cost existed.
	data, err := w.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	var stored map[string]json.RawMessage
	if err := json.Unmarshal(data, &stored); err != nil {
		t.Fatal(err)
	}
	stored["Version"] = json.RawMessage("2")
	var settings map[string]json.RawMessage
	if err := json.Unmarshal(stored["Settings"], &settings); err != nil {
		t.Fatal(err)
	}
	delete(settings, "voteCost")
	stored["Settings"], _ = json.Marshal(settings)
	data, _ = json.Marshal(stored)
	w, err = RestoreCheckpoint(data)
	if err != nil {
		t.Fatal(err)
	}
	if snap := w.Snapshot(); snap.Version != ReplayVersion || !snap.LegacyRules || w.Settings.VoteCost != 0 {
		t.Fatal("v6 world lost its original vote cost or legacy mechanics marker")
	}
	govern(w, 0)
	motion := ProposalInput{Kind: "policy", Key: "tokenAllocation", Rule: Rule{Mode: "productivity", Amount: 3, Limit: 2}}
	w.governancePhase(map[int]Decision{0: {Proposals: []ProposalInput{motion, motion}}})
	if len(w.Proposals) != 2 {
		t.Fatal("existing run switched its ballot rules")
	}
	w.Agents[0].Harvested = 6
	w.votingPhase(yesVotes(w))
	if w.Agents[0].Mind != 10 {
		t.Fatal("v6 vote spent mind")
	}
	tomorrow(w)
	if w.Agents[0].VotingTokens != 6 {
		t.Fatal("v6 allocation changed")
	}
	w.Agents[0].Food = 5
	w.eating(map[int]Decision{0: {Eat: 5}})
	if w.Agents[0].Score != 2 {
		t.Fatal("v6 food score changed")
	}
	data, err = w.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	restarted, err := RestoreCheckpoint(data)
	if err != nil || !restarted.legacyRules {
		t.Fatalf("v6 checkpoint failed second restart: %v", err)
	}
}

func TestV7CheckpointMigratesOnlyLiveVoting(t *testing.T) {
	w := politicalWorld(t, 4, 1)
	govern(w, 0)
	w.Settings.RuleThreshold = "voters"
	w.Plots[0].Rules["threshold"] = Rule{Mode: "voters", Amount: .6}
	change := ProposalInput{Kind: "policy", Key: "threshold", Rule: Rule{Mode: "voters", Amount: .75}}
	w.Pending = []Pending{{ID: "prior-decision", At: w.AbsoluteDay + 1, Input: change}}
	tokens := change
	tokens.Rule.Mode = "tokens"
	w.Proposals = []*Proposal{
		{ID: "closed", Status: "failed", TallyBasis: "voters", Threshold: "voters", Input: change, Yes: 2, Abstain: 2, Total: 4, Fraction: .5},
		{ID: "frozen", Status: "open", TallyBasis: "voters", Threshold: "voters", Fraction: .6, Electorate: map[int]int{0: 1, 1: 1, 2: 1, 3: 1}, Abstain: 4, Total: 4},
		{ID: "first", Status: "open", Input: change, Sponsors: []int{0, 1}},
		{ID: "second", Status: "open", Input: tokens, Sponsors: []int{1, 2}},
	}
	data, err := w.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	var stored worldCheckpoint
	if err := json.Unmarshal(data, &stored); err != nil {
		t.Fatal(err)
	}
	stored.Version = 3
	data, err = json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	got, err := RestoreCheckpoint(data)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Proposals[0], w.Proposals[0]) {
		t.Fatal("historical ballot changed during migration")
	}
	if got.Settings.RuleThreshold != "tokens" || !reflect.DeepEqual(got.Plots[0].Rules["threshold"], Rule{Mode: "tokens", Amount: .6}) || !reflect.DeepEqual(got.Pending[0].Input, tokens) {
		t.Fatal("world, standing law or pending threshold changed the wrong voting terms")
	}
	if len(got.Proposals) != 3 || got.Proposals[2].ID != "first" || !reflect.DeepEqual(got.Proposals[2].Input, tokens) || !reflect.DeepEqual(got.Proposals[2].Sponsors, []int{0, 1, 2}) {
		t.Fatal("equivalent open ballots were not combined with all sponsors")
	}
	frozen := got.Proposals[1]
	if frozen.TallyBasis != "tokens" || frozen.Threshold != "tokens" || frozen.Fraction != .6 || frozen.Total != 0 {
		t.Fatal("open ballot kept its headcount or lost its required share")
	}
	got.castVote(got.Agents[0], frozen, VoteChoice{Choice: "yes", Tokens: 3})
	got.castVote(got.Agents[1], frozen, VoteChoice{Choice: "no", Tokens: 1})
	if !tally(frozen) || frozen.Yes != 3 || frozen.No != 1 || frozen.Total != 4 || frozen.Abstain != 0 {
		t.Fatal("frozen ballot did not accept weighted votes after restore")
	}
	data, err = got.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	restarted, err := RestoreCheckpoint(data)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Snapshot(), restarted.Snapshot()) || restarted.Snapshot().LegacyRules {
		t.Fatal("migrated v7 world changed on its second restart")
	}
}
