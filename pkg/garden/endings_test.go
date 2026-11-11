package garden

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestRoundLimits(t *testing.T) {
	for _, tc := range []struct {
		settings string
		days     int
	}{
		{"{}", Rounds}, {`{"roundLimit":1}`, 1}, {`{"roundLimit":50}`, MaxRounds},
		{`{"roundLimit":0}`, 0}, {`{"roundLimit":51}`, 0}, {`{"roundLimit":1.5}`, 0},
	} {
		var s Settings
		err := json.Unmarshal([]byte(tc.settings), &s)
		if err == nil {
			err = s.Validate()
		}
		if tc.days == 0 {
			if err == nil {
				t.Errorf("accepted invalid limit in %s", tc.settings)
			}
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		r := configured(t, s, simple("2", "4"))
		last := r.Frames[len(r.Frames)-1]
		if r.Settings.RoundLimit != tc.days || r.Rounds != tc.days || last.Phase != "supper" || last.Round != tc.days || !last.Meals[0].Fed {
			t.Fatalf("%s ended at day %d, %s", tc.settings, last.Round, last.Phase)
		}
	}
}

func TestExtinctionOnOrBeforeLastDay(t *testing.T) {
	for _, limit := range []int{1, MaxRounds} {
		s := DefaultSettings()
		s.RoundLimit, s.StartingPantry, s.DailyFood = limit, 1, 2
		r := configured(t, s, simple("0", "0"))
		meal := r.Frames[len(r.Frames)-2]
		last := r.Frames[len(r.Frames)-1]
		if r.Rounds != 1 || r.Settings.RoundLimit != limit || meal.Phase != "supper" || meal.Meals[0].Eaten != 1 || meal.Meals[0].Fed || last.Phase != "death" || !last.Agents[0].Dead {
			t.Fatalf("incorrect ending for %d days: %+v, %+v", limit, meal, last)
		}
	}
}

func TestInterruptedDecisionDoesNotReturnAnEnding(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		<-r.Context().Done()
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	s := DefaultSettings()
	s.RoundLimit = MaxRounds
	r := Run(ctx, Request{Settings: &s, Slots: []Slot{{URL: server.URL}}})
	if !errors.Is(r.Err, context.DeadlineExceeded) || len(r.Frames) != 0 || len(r.Agents) != 0 {
		t.Fatal("a cancelled simulation yielded a game", r.Err, r.Rounds)
	}
	// A seat's own decision deadline is different: its zero action and
	// real supper are still part of an otherwise complete, replayable day.
	r = Run(context.Background(), Request{Settings: &s, Slots: []Slot{{URL: server.URL}}})
	if r.Err != nil || r.Rounds != 1 || !r.Agents[0].Dead || r.Agents[0].Error == "" || r.Frames[len(r.Frames)-1].Phase != "death" {
		t.Fatal("a seat timeout failed to record its resolved day", r.Err, r.Agents)
	}
}

func TestLongRunPreservesFailureDetailsWithinReplayLimit(t *testing.T) {
	s := DefaultSettings()
	s.RoundLimit, s.DailyFood = MaxRounds, 0
	slots := make([]Slot, MaxSeats)
	for i := range slots {
		slots[i] = Slot{Name: strings.Repeat("<", 40), ID: strings.Repeat("t", 64), Error: strings.Repeat("故", 200)}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var v View
		if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
			t.Error(err)
		}
		if v.Round == 3 {
			http.Error(w, "Stopped", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(Action{1, 0})
	}))
	defer server.Close()
	slots[0] = Slot{URL: server.URL}
	slots[1] = simple("2", "4")

	result := configured(t, s, slots...)
	var buf bytes.Buffer
	if err := WriteReplay(&buf, result); err != nil {
		t.Fatal(err)
	}
	if buf.Len() >= 3_000_000 || len(result.Frames) != 751 {
		t.Fatalf("%d bytes / %d frames", buf.Len(), len(result.Frames))
	}
	t.Logf("%d bytes across %d frames with long diagnostics", buf.Len(), len(result.Frames))
	var packed struct {
		Result
		ErrorStarts []int `json:"errorStarts"`
	}
	if err := json.Unmarshal(buf.Bytes(), &packed); err != nil {
		t.Fatal(err)
	}
	if len(packed.ErrorStarts) != MaxSeats || packed.ErrorStarts[1] != -1 || packed.ErrorStarts[2] != 0 || packed.ErrorStarts[0] < 1 || packed.Frames[packed.ErrorStarts[0]].Round != 3 {
		t.Fatal("incorrect error ranges", packed.ErrorStarts)
	}
	for i, frame := range packed.Frames {
		for j, start := range packed.ErrorStarts {
			if start >= 0 && i >= start {
				frame.Agents[j].Error = packed.Agents[j].Error
			}
		}
	}
	if !reflect.DeepEqual(result, packed.Result) || result.Frames[0].Agents[2].Error != slots[2].Error {
		t.Fatal("diagnostics did not reproduce the full original frames")
	}
}
