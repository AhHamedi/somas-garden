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
