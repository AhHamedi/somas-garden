package society

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

const DefaultRecordPageSize = 128
const MaxRecordPageSize = 256

// Queries retain a bounded view of the append-only political record log, not
// another full copy of that log. Pages are detached before agents receive them.
type recordSnapshot struct {
	actor, month, plot, subject, from, to, size, total, number int
	rows                                                       []Event
}
type recordCursor struct {
	query         *recordSnapshot
	index, offset int
	delivered     bool
}

func (q *recordSnapshot) matches(e Event) bool {
	return (q.subject < 0 || e.Actor == q.subject) && (q.from == 0 || e.AbsoluteDay >= q.from) && (q.to == 0 || e.AbsoluteDay <= q.to)
}
func (w *World) cursor(q *recordSnapshot, index, offset int) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("records/%d/%d/%d/%d/%d", w.Seed, q.month, q.actor, q.number, index)))
	token := hex.EncodeToString(h[:])
	if w.recordCursors == nil {
		w.recordCursors = map[string]*recordCursor{}
	}
	if _, ok := w.recordCursors[token]; !ok {
		w.recordCursors[token] = &recordCursor{query: q, index: index, offset: offset}
	}
	return token
}

// ReadRecordsPage opens one paid immutable query or resumes a free continuation.
// An opaque cursor is bound to its reader and month. Access is rechecked every
// time; possession of a cursor never grants record access by itself.
func (w *World) ReadRecordsPage(actor int, in RecordQuery) (RecordPage, error) {
	if w.Meteor || w.Done {
		return RecordPage{}, errors.New("record query expired at month close")
	}
	token := in.Cursor
	var state *recordCursor
	if token != "" {
		state = w.recordCursors[token]
		if state == nil || state.query.actor != actor || state.query.month != w.Month {
			return RecordPage{}, errors.New("invalid or expired record cursor")
		}
		q := state.query
		if in.Subject != nil || in.From != 0 || in.To != 0 || (in.Plot != 0 && in.Plot != q.plot) || (in.PageSize != 0 && in.PageSize != q.size) {
			return RecordPage{}, errors.New("continuation cannot change query parameters")
		}
		if _, _, err := w.recordAccess(actor, q.plot, q.subject, q.from, q.to); err != nil {
			return RecordPage{}, err
		}
	} else {
		size := in.PageSize
		if size == 0 {
			size = DefaultRecordPageSize
		}
		if size < 1 || size > MaxRecordPageSize {
			return RecordPage{}, errors.New("record page size must be between 1 and 256")
		}
		subject := -1
		if in.Subject != nil {
			subject = *in.Subject
			if subject < 0 {
				return RecordPage{}, errors.New("record subject must be an individual ID")
			}
		}
		a, p, err := w.recordAccess(actor, in.Plot, subject, in.From, in.To)
		if err != nil {
			return RecordPage{}, err
		}
		if !w.govSpend(a, w.Settings.ReadCost) {
			return RecordPage{}, errors.New("not enough unpledged mind")
		}
		w.nextQuery++
		q := &recordSnapshot{actor: actor, month: w.Month, plot: in.Plot, subject: subject, from: in.From, to: in.To, size: size, number: w.nextQuery, rows: p.Records[:len(p.Records):len(p.Records)]}
		for _, e := range q.rows {
			if q.matches(e) {
				q.total++
			}
		}
		token = w.cursor(q, 0, 0)
		state = w.recordCursors[token]
	}
	q := state.query
	rows := []Event{}
	i := state.index
	for i < len(q.rows) && len(rows) < q.size {
		e := q.rows[i]
		i++
		if q.matches(e) {
			rows = append(rows, e)
		}
	}
	// Skip unmatched records before deciding whether another page exists.
	for i < len(q.rows) && !q.matches(q.rows[i]) {
		i++
	}
	page := RecordPage{Cursor: token, Rows: rows, Total: q.total, Offset: state.offset, PageSize: q.size}
	if i < len(q.rows) {
		page.NextCursor = w.cursor(q, i, state.offset+len(rows))
	}
	state.delivered = true
	encoded, _ := json.Marshal(page)
	var copy RecordPage
	_ = json.Unmarshal(encoded, &copy)
	return copy, nil
}
func (w *World) recordsPhase() {
	w.recordPages = map[int][]RecordPage{}
	apply := func(ds map[int]Decision, continuationsOnly bool) bool {
		w.recordPages = map[int][]RecordPage{}
		progress := false
		for _, item := range rangeOrdered(ds) {
			id := item.id
			for _, q := range item.d.Read {
				if continuationsOnly && q.Cursor == "" {
					w.reject(w.Agents[id], "record_pages accepts continuation cursors only")
					continue
				}
				fresh := q.Cursor == ""
				if c := w.recordCursors[q.Cursor]; c != nil {
					fresh = !c.delivered
				}
				page, err := w.ReadRecordsPage(id, q)
				if err != nil {
					page = RecordPage{Cursor: q.Cursor, Error: err.Error(), Rows: []Event{}}
					w.reject(w.Agents[id], err.Error())
				} else {
					if fresh {
						progress = true
					}
					seen := map[int]bool{}
					for _, e := range w.reads[id] {
						seen[e.ID] = true
					}
					for _, e := range page.Rows {
						if !seen[e.ID] {
							w.reads[id] = append(w.reads[id], e)
							seen[e.ID] = true
						}
					}
				}
				w.recordPages[id] = append(w.recordPages[id], page)
			}
		}
		return progress
	}
	apply(w.decisions("records"), false)
	for {
		more := false
		for _, pages := range w.recordPages {
			for _, p := range pages {
				if p.NextCursor != "" {
					more = true
				}
			}
		}
		if !more {
			break
		}
		ds := w.decisions("record_pages")
		requests := false
		for _, d := range ds {
			if len(d.Read) > 0 {
				requests = true
				break
			}
		}
		if !requests {
			break
		}
		if !apply(ds, true) {
			break
		}
	}
}
