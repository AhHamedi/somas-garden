package society

import (
	"math"
	"testing"
)

func TestGiniBounds(t *testing.T) {
	for _, c := range []struct {
		in   []float64
		want float64
	}{{nil, 0}, {[]float64{3, 3, 3}, 0}, {[]float64{0, 0, 0}, 0}, {[]float64{0, 0, 1}, 2. / 3}, {[]float64{1, 2, 3, 4}, 0.25}} {
		if got := Gini(c.in); math.Abs(got-c.want) > 1e-9 {
			t.Fatalf("Gini(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestLawKeyGroupsPersonalRules(t *testing.T) {
	if LawKey("quota:12") != "quota" || LawKey("tax") != "tax" || LawKey("representative:3") != "representative" {
		t.Fatal("law keys are not grouped by law")
	}
}

// Running a default world for a month and summarising every nightfall must
// agree with the engine's own totals.
func TestStudySummariesAgreeWithTheEngine(t *testing.T) {
	settings := DefaultSettings()
	settings.Copies, settings.Days, settings.Months = 6, 6, 1
	settings.DailyFood = 3
	w, err := New(settings, nil, 7)
	if err != nil {
		t.Fatal(err)
	}
	var prev *StudyDay
	days, exclusions, motions := 0, 0, 0
	for frame := 1; !w.Done; frame++ {
		if err := w.Step(); err != nil {
			t.Fatal(err)
		}
		snap := w.Snapshot()
		if snap.Phase == "voting" {
			for _, m := range SummariseMotions(&snap) {
				motions++
				cast := 0
				for i := range m.TeamYes {
					cast += m.TeamYes[i] + m.TeamNo[i] + m.TeamAbstain[i]
				}
				for _, p := range snap.Proposals {
					if p.ID == m.ID && cast != len(p.Votes) {
						t.Fatalf("motion %s counts %d votes by team, engine has %d", m.ID, cast, len(p.Votes))
					}
				}
				if m.Abs != snap.AbsoluteDay || m.Status == "open" {
					t.Fatalf("motion %s summarised on the wrong day or undecided", m.ID)
				}
			}
		}
		if snap.Phase != "close" {
			continue
		}
		d := SummariseDay(&snap, frame, prev)
		prev = &d
		days++
		alive, residents := 0, 0
		for _, team := range d.Teams {
			alive += team.Alive
		}
		for _, p := range d.Plots {
			residents += p.Residents
		}
		if alive != snap.Stats.Alive || d.Field != snap.Stats.Food || d.Treasury+d.Held != snap.Stats.Stored {
			t.Fatalf("day %d: alive %d/%d field %d/%d stored %d/%d", d.Day, alive, snap.Stats.Alive, d.Field, snap.Stats.Food, d.Treasury+d.Held, snap.Stats.Stored)
		}
		wilds := 0
		for _, team := range d.Teams {
			wilds += team.Wilds
		}
		if residents+wilds != alive {
			t.Fatalf("day %d: %d residents and %d in the wilds of %d alive", d.Day, residents, wilds, alive)
		}
		if d.Gini < 0 || d.Gini > 1 {
			t.Fatalf("gini out of range: %v", d.Gini)
		}
		exclusions += d.Exclusions
		if snap.Meteor {
			a := SummariseAgents(&snap, frame)
			total := 0
			for _, n := range a.Exclusions {
				total += n
			}
			if !a.Complete || total != exclusions || total != snap.Stats.Exclusions {
				t.Fatalf("daily exclusions %d, month totals %d, engine %d", exclusions, total, snap.Stats.Exclusions)
			}
		}
	}
	if days != settings.Days {
		t.Fatalf("summarised %d nightfalls, want %d", days, settings.Days)
	}
	if motions == 0 {
		t.Fatal("expected the default teams to vote on something")
	}
}

func TestSettlementDoesNotCountAsDailyMovement(t *testing.T) {
	w := smallWorld(t, 3)
	resident(w, 0)
	resident(w, 1)
	w.Day, w.Phase = 1, "close"
	snap := w.Snapshot()
	d := SummariseDay(&snap, 8, nil)
	if d.Moves != 0 {
		t.Fatalf("moves = %d, monthly settlement is not migration", d.Moves)
	}
	next := SummariseDay(&snap, 16, &d)
	if next.Moves != 0 {
		t.Fatalf("nobody moved, yet %d moves were counted", next.Moves)
	}
}
