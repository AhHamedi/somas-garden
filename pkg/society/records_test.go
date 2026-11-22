package society

import (
	"strings"
	"testing"
)

func recordWorld(t *testing.T) *World {
	w := smallWorld(t, 2)
	resident(w, 0)
	resident(w, 1)
	for i := 0; i < 5; i++ {
		w.event("harvest", i%2, 0, "recorded harvest", 1)
	}
	return w
}
func TestPublicRecordPaginationIsFreeAndFreezesSnapshot(t *testing.T) {
	w := recordWorld(t)
	a := w.Agents[0]
	first, e := w.ReadRecordsPage(0, RecordQuery{Plot: 0, PageSize: 2})
	if e != nil {
		t.Fatal(e)
	}
	if len(first.Rows) != 2 || first.Total != 5 || first.Offset != 0 || first.NextCursor == "" || a.Mind != 6 {
		t.Fatalf("invalid first page: %+v mind%v", first, a.Mind)
	}
	first.Rows[0].Message = "mutated"
	w.event("harvest", 1, 0, "later event", 1)
	second, e := w.ReadRecordsPage(0, RecordQuery{Cursor: first.NextCursor})
	if e != nil {
		t.Fatal(e)
	}
	third, e := w.ReadRecordsPage(0, RecordQuery{Cursor: second.NextCursor})
	if e != nil {
		t.Fatal(e)
	}
	if len(second.Rows) != 2 || len(third.Rows) != 1 || third.NextCursor != "" || third.Total != 5 || third.Offset != 4 || a.Mind != 6 {
		t.Fatal("continuation changed query, repeated charge or exceeded page")
	}
	again, e := w.ReadRecordsPage(0, RecordQuery{Cursor: first.Cursor})
	if e != nil || again.Rows[0].Message == "mutated" || len(again.Rows) != 2 || a.Mind != 6 {
		t.Fatal("repeated page is not detached, stable or free")
	}
	fresh, e := w.ReadRecordsPage(0, RecordQuery{Plot: 0})
	if e != nil || fresh.Total != 6 || a.Mind != 6 {
		t.Fatal("new query did not capture new snapshot without charge")
	}
}
func TestRecordCursorScopePermissionsAndReset(t *testing.T) {
	w := recordWorld(t)
	first, e := w.ReadRecordsPage(0, RecordQuery{Plot: 0, PageSize: 2})
	if e != nil {
		t.Fatal(e)
	}
	otherMind := w.Agents[1].Mind
	if _, e = w.ReadRecordsPage(1, RecordQuery{Cursor: first.NextCursor}); e == nil || w.Agents[1].Mind != otherMind {
		t.Fatal("another individual could use cursor")
	}
	mind := w.Agents[0].Mind
	if _, e = w.ReadRecordsPage(0, RecordQuery{Cursor: "invented"}); e == nil || w.Agents[0].Mind != mind {
		t.Fatal("invalid cursor was charged or accepted")
	}
	subject := 1
	if _, e = w.ReadRecordsPage(0, RecordQuery{Cursor: first.NextCursor, Subject: &subject}); e == nil {
		t.Fatal("cursor changed filter")
	}
	// Moving the reader out of this plot does not hide public records.
	w.Agents[0].Plot = -1
	if _, e = w.ReadRecordsPage(0, RecordQuery{Cursor: first.NextCursor}); e != nil {
		t.Fatal(e)
	}
	w.Agents[0].Alive = false
	if _, e = w.ReadRecordsPage(0, RecordQuery{Cursor: first.NextCursor}); e == nil {
		t.Fatal("excluded agent read records")
	}
	w.Agents[0].Alive = true
	if _, e = w.ReadRecordsPage(0, RecordQuery{Cursor: first.NextCursor}); e != nil || w.Agents[0].Mind != mind {
		t.Fatal("restored eligible reader cannot resume free query")
	}
	w.Month++
	w.resetMonth()
	if _, e = w.ReadRecordsPage(0, RecordQuery{Cursor: first.NextCursor}); e == nil || !strings.Contains(e.Error(), "expired") {
		t.Fatal("meteor retained query cursor")
	}
	if len(w.recordPages) != 0 || len(w.recordCursors) != 0 {
		t.Fatal("query caches survived meteor")
	}
}
func TestRecordPageBoundsAndInvalidQueriesDoNotCharge(t *testing.T) {
	w := recordWorld(t)
	before := w.Agents[0].Mind
	for _, q := range []RecordQuery{{Plot: 0, PageSize: -1}, {Plot: 0, PageSize: 257}, {Plot: 0, From: 10, To: 1}, {Plot: 0, From: -1}} {
		if _, e := w.ReadRecordsPage(0, q); e == nil {
			t.Fatal("invalid record page accepted")
		}
	}
	if before != w.Agents[0].Mind {
		t.Fatal("invalid queries consumed mind")
	}
}
func TestRecordsPhaseCanContinueWithoutDuplicateEvidence(t *testing.T) {
	w := recordWorld(t)
	w.Deciders[0] = func(v Observation) Decision {
		if v.Phase == "records" {
			return Decision{Read: []RecordQuery{{Plot: 0, PageSize: 2}}}
		}
		if v.Phase == "record_pages" && len(v.RecordPages) > 0 {
			next := v.RecordPages[len(v.RecordPages)-1].NextCursor
			if next != "" {
				return Decision{Read: []RecordQuery{{Cursor: next}, {Cursor: next}}}
			}
		}
		return Decision{}
	}
	w.recordsPhase()
	if len(w.reads[0]) != 5 || w.Agents[0].Mind != 6 {
		t.Fatalf("duplicate/paid continuations records%d mind%v", len(w.reads[0]), w.Agents[0].Mind)
	}
	v := w.View(0)
	if len(v.RecordPages) == 0 || len(v.RecordPages[0].Rows) == 0 {
		t.Fatal("page responses unavailable to agent")
	}
	v.RecordPages[0].Rows[0].Message = "altered"
	if w.recordPages[0][0].Rows[0].Message == "altered" {
		t.Fatal("observation aliases paginated records")
	}
}
func TestFinalMeteorCancelsPendingDecisionsImmediately(t *testing.T) {
	w := smallWorld(t, 1)
	w.Settings.Months = 1
	w.Settings.Days = 1
	w.Pending = []Pending{{ID: "waiting", At: 2, Input: ProposalInput{Kind: "policy"}}}
	for _, status := range []string{"scheduled", "approved", "open", "passed", "failed", "activated"} {
		w.Proposals = append(w.Proposals, &Proposal{ID: status, Status: status})
	}
	w.closeDay()
	if !w.Done || !w.Meteor || len(w.Pending) != 0 || len(w.Snapshot().Pending) != 0 {
		t.Fatal("final meteor retained scheduled actions")
	}
	for i, p := range w.Proposals {
		if i < 4 && (p.Status != "cancelled" || !strings.Contains(p.Reason, "Meteor")) {
			t.Fatal("meteor cancellation not explained")
		}
		if i >= 4 && p.Status != p.ID {
			t.Fatal("meteor overwrote completed outcome")
		}
	}
}

func TestFinalMeteorExpiresRecordCursorsAtClose(t *testing.T) {
	w := recordWorld(t)
	w.Settings.Months = 1
	w.Settings.Days = 1
	page, e := w.ReadRecordsPage(0, RecordQuery{Plot: 0, PageSize: 2})
	if e != nil {
		t.Fatal(e)
	}
	w.closeDay()
	if len(w.recordCursors) != 0 || len(w.recordPages) != 0 || len(w.reads) != 0 {
		t.Fatal("final meteor kept private query state")
	}
	if _, e = w.ReadRecordsPage(0, RecordQuery{Cursor: page.NextCursor}); e == nil {
		t.Fatal("final-month cursor still usable")
	}
}
