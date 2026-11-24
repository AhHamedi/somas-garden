package society

// A checkpoint is private server state, never an observer replay. In particular
// it includes individual memories, pending record queries and random-generator state.
import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
)

const checkpointVersion = 3

// Old worlds can be replayed, but their rules and phase sequence cannot be resumed.
var ErrArchivedCheckpoint = errors.New("checkpoint uses the previous MVP rules")

// Keep the original math/rand stream exactly, including Source64 behavior.
// Sources reset at each meteor, so restoring only skips draws within one month.
// World randomness never uses Rand.Read (which has a separate byte cache).
type countedSource struct {
	source rand.Source64
	seed   int64
	draws  uint64
}

func (s *countedSource) Seed(seed int64) {
	s.seed, s.draws = seed, 0
	s.source = rand.NewSource(seed).(rand.Source64)
}
func (s *countedSource) Int63() int64   { s.draws++; return s.source.Int63() }
func (s *countedSource) Uint64() uint64 { s.draws++; return s.source.Uint64() }
func newCountedRandom(seed int64) (*rand.Rand, *countedSource) {
	s := new(countedSource)
	s.Seed(seed)
	return rand.New(s), s
}

type randomCheckpoint struct {
	Seed  int64
	Draws uint64
}

func randomState(s *countedSource) randomCheckpoint {
	return randomCheckpoint{s.seed, s.draws}
}
func restoreRandom(c randomCheckpoint) (*rand.Rand, *countedSource) {
	r, source := newCountedRandom(c.Seed)
	for i := uint64(0); i < c.Draws; i++ {
		source.source.Uint64()
	}
	source.draws = c.Draws
	return r, source
}

type queryCheckpoint struct {
	Actor, Month, Plot, Subject, From, To, Size, Total, Number int
	Rows                                                       []Event
}
type cursorCheckpoint struct {
	Query, Index, Offset int
	Delivered            bool
}

type worldCheckpoint struct {
	Version                          int
	Settings                         Settings
	Teams                            []Team
	TeamTokens                       []string
	Seed                             int64
	Agents                           []*Agent
	Memories                         []json.RawMessage
	Plots                            []*Plot
	GrowthRemainders                 []float64
	Proposals                        []*Proposal
	Pending                          []Pending
	Events                           []Event
	Month, Day, AbsoluteDay          int
	Phase                            string
	Done, Meteor                     bool
	Months                           []MonthlyResult
	Political                        *politicalState
	Random                           randomCheckpoint
	Weather                          []randomCheckpoint
	PhaseIndex                       int
	Advance                          bool
	EventStart, NextEvent, NextQuery int
	Reads, Receipts                  map[int][]Event
	RecordPages                      map[int][]RecordPage
	Queries                          map[int]queryCheckpoint
	Cursors                          map[string]cursorCheckpoint
}

// Checkpoint records all state needed to continue at a phase boundary. The host
// must reattach uploaded deciders after RestoreCheckpoint; functions are not data.
func (w *World) Checkpoint() ([]byte, error) {
	if w.rngSource == nil || len(w.weatherSources) != len(w.Plots) {
		return nil, errors.New("world random state is unavailable")
	}
	c := worldCheckpoint{
		Version: checkpointVersion, Settings: w.Settings, Teams: w.Teams, Seed: w.Seed,
		Agents: w.Agents, Plots: w.Plots, Proposals: w.Proposals,
		Pending: w.Pending, Events: w.Events,
		Month: w.Month, Day: w.Day, AbsoluteDay: w.AbsoluteDay, Phase: w.Phase,
		Done: w.Done, Meteor: w.Meteor, Months: w.Months, Political: w.political,
		Random: randomState(w.rngSource), PhaseIndex: w.phaseIndex, Advance: w.advance,
		EventStart: w.eventStart, NextEvent: w.nextEvent, NextQuery: w.nextQuery,
		Reads: w.reads, Receipts: w.receipts, RecordPages: w.recordPages,
		Queries: map[int]queryCheckpoint{}, Cursors: map[string]cursorCheckpoint{},
	}
	if w.legacyRules {
		c.Version = 2
	}
	for _, t := range w.Teams {
		c.TeamTokens = append(c.TeamTokens, t.Token)
	}
	for _, a := range w.Agents {
		c.Memories = append(c.Memories, a.Memory)
	}
	for _, p := range w.Plots {
		c.GrowthRemainders = append(c.GrowthRemainders, p.GrowthRemainder)
	}
	for _, r := range w.weatherSources {
		c.Weather = append(c.Weather, randomState(r))
	}
	for token, cursor := range w.recordCursors {
		q := cursor.query
		c.Queries[q.number] = queryCheckpoint{q.actor, q.month, q.plot, q.subject, q.from, q.to, q.size, q.total, q.number, q.rows}
		c.Cursors[token] = cursorCheckpoint{q.number, cursor.index, cursor.offset, cursor.delivered}
	}
	return json.Marshal(c)
}

// RestoreCheckpoint consumes trusted private persistence, not uploaded replays.
// Keeping this separate from Snapshot prevents private data reaching observers.
func RestoreCheckpoint(data []byte) (*World, error) {
	var header struct{ Version int }
	if err := json.Unmarshal(data, &header); err != nil {
		return nil, fmt.Errorf("invalid checkpoint: %w", err)
	}
	if header.Version == 1 {
		return nil, ErrArchivedCheckpoint
	}
	var c worldCheckpoint
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("invalid checkpoint: %w", err)
	}
	if c.Version != 2 && c.Version != checkpointVersion {
		return nil, fmt.Errorf("unsupported checkpoint version %d", c.Version)
	}
	if c.Version == 2 {
		c.Settings.VoteCost = 0
	}
	population, err := c.Settings.rosterSize(c.Teams)
	if err != nil {
		return nil, fmt.Errorf("invalid checkpoint settings: %w", err)
	}
	if len(c.Agents) != population || len(c.Memories) != len(c.Agents) || len(c.TeamTokens) != len(c.Teams) || len(c.Plots) != c.Settings.Plots || len(c.GrowthRemainders) != len(c.Plots) || len(c.Weather) != len(c.Plots) || c.PhaseIndex < 0 || c.PhaseIndex >= len(Phases) || c.EventStart < 0 || c.EventStart > len(c.Events) {
		return nil, errors.New("checkpoint state is incomplete")
	}
	w := &World{
		legacyRules: c.Version == 2, Settings: c.Settings, Teams: c.Teams, Seed: c.Seed, Agents: c.Agents, Plots: c.Plots,
		Proposals: c.Proposals, Pending: c.Pending,
		Events: c.Events, Month: c.Month, Day: c.Day, AbsoluteDay: c.AbsoluteDay,
		Phase: c.Phase, Done: c.Done, Meteor: c.Meteor, Months: c.Months, political: c.Political,
		phaseIndex: c.PhaseIndex, advance: c.Advance, eventStart: c.EventStart,
		nextEvent: c.NextEvent, nextQuery: c.NextQuery,
		reads: c.Reads, receipts: c.Receipts, recordPages: c.RecordPages,
		recordCursors: map[string]*recordCursor{}, Deciders: map[int]Decider{},
	}
	for i := range w.Teams {
		w.Teams[i].Token = c.TeamTokens[i]
	}
	for i, a := range w.Agents {
		if a == nil || a.ID != i || a.Team < 0 || a.Team >= len(w.Teams) {
			return nil, errors.New("invalid checkpoint individual")
		}
		a.Memory = c.Memories[i]
	}
	for i, p := range w.Plots {
		if p == nil || p.ID != i {
			return nil, errors.New("invalid checkpoint plot")
		}
		p.GrowthRemainder = c.GrowthRemainders[i]
	}
	for _, event := range w.Events {
		if event.Recorded && event.Plot >= 0 && event.Plot < len(w.Plots) {
			p := w.Plots[event.Plot]
			p.Records = append(p.Records, event)
		}
	}
	for _, p := range w.Proposals {
		if p == nil {
			return nil, errors.New("invalid checkpoint proposal")
		}
	}
	w.rng, w.rngSource = restoreRandom(c.Random)
	for _, state := range c.Weather {
		r, source := restoreRandom(state)
		w.weather, w.weatherSources = append(w.weather, r), append(w.weatherSources, source)
	}
	queries := map[int]*recordSnapshot{}
	for id, q := range c.Queries {
		queries[id] = &recordSnapshot{q.Actor, q.Month, q.Plot, q.Subject, q.From, q.To, q.Size, q.Total, q.Number, q.Rows}
	}
	for token, cursor := range c.Cursors {
		q := queries[cursor.Query]
		if q == nil || cursor.Index < 0 || cursor.Index > len(q.rows) {
			return nil, errors.New("invalid checkpoint record cursor")
		}
		w.recordCursors[token] = &recordCursor{q, cursor.Index, cursor.Offset, cursor.Delivered}
	}
	return w, nil
}
