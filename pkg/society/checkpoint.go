package society

// A checkpoint is private server state, never an observer replay. In particular
// it includes individual memories, record permissions and random-generator state.
import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
)

const checkpointVersion = 1

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

type agentPrivateState struct {
	Memory  json.RawMessage
	Permits map[string]int
}
type plotPrivateState struct {
	GrowthRemainder float64
	Rotation        []int
	Records         []Event
}
type queryCheckpoint struct {
	Actor, Month, Plot, Subject, From, To, Size, Total, Number int
	Rows                                                       []Event
}
type ballotCheckpoint struct {
	Electorate, RepresentativePlots map[int]int
	Votes, PlotVotes                map[int]string
}
type cursorCheckpoint struct {
	Query, Index, Offset int
	Delivered            bool
}

type worldCheckpoint struct {
	Version                                     int
	Settings                                    Settings
	Teams                                       []Team
	TeamTokens                                  []string
	Seed                                        int64
	Agents                                      []*Agent
	AgentPrivate                                []agentPrivateState
	Plots                                       []*Plot
	PlotPrivate                                 []plotPrivateState
	Federations                                 []*Federation
	Proposals                                   []*Proposal
	Ballots                                     []ballotCheckpoint
	Pending                                     []Pending
	Events                                      []Event
	Offers                                      []Offer
	Month, Day, AbsoluteDay                     int
	Phase                                       string
	Done, Meteor                                bool
	Months                                      []MonthlyResult
	Political                                   *politicalState
	Random                                      randomCheckpoint
	Weather                                     []randomCheckpoint
	PhaseIndex                                  int
	Advance                                     bool
	EventStart, NextEvent, NextOffer, NextQuery int
	Reads, Receipts                             map[int][]Event
	RecordPages                                 map[int][]RecordPage
	Queries                                     map[int]queryCheckpoint
	Cursors                                     map[string]cursorCheckpoint
}

// Checkpoint records all state needed to continue at a phase boundary. The host
// must reattach uploaded deciders after RestoreCheckpoint; functions are not data.
func (w *World) Checkpoint() ([]byte, error) {
	if w.rngSource == nil || len(w.weatherSources) != len(w.Plots) {
		return nil, errors.New("world random state is unavailable")
	}
	c := worldCheckpoint{
		Version: checkpointVersion, Settings: w.Settings, Teams: w.Teams, Seed: w.Seed,
		Agents: w.Agents, Plots: w.Plots, Federations: w.Federations, Proposals: w.Proposals,
		Pending: w.Pending, Events: w.Events, Offers: w.Offers,
		Month: w.Month, Day: w.Day, AbsoluteDay: w.AbsoluteDay, Phase: w.Phase,
		Done: w.Done, Meteor: w.Meteor, Months: w.Months, Political: w.political,
		Random: randomState(w.rngSource), PhaseIndex: w.phaseIndex, Advance: w.advance,
		EventStart: w.eventStart, NextEvent: w.nextEvent, NextOffer: w.nextOffer, NextQuery: w.nextQuery,
		Reads: w.reads, Receipts: w.receipts, RecordPages: w.recordPages,
		Queries: map[int]queryCheckpoint{}, Cursors: map[string]cursorCheckpoint{},
	}
	for _, t := range w.Teams {
		c.TeamTokens = append(c.TeamTokens, t.Token)
	}
	for _, a := range w.Agents {
		c.AgentPrivate = append(c.AgentPrivate, agentPrivateState{a.Memory, a.Permits})
	}
	for _, p := range w.Plots {
		c.PlotPrivate = append(c.PlotPrivate, plotPrivateState{p.GrowthRemainder, p.Rotation, p.Records})
	}
	for _, r := range w.weatherSources {
		c.Weather = append(c.Weather, randomState(r))
	}
	for _, p := range w.Proposals {
		c.Ballots = append(c.Ballots, ballotCheckpoint{p.Electorate, p.RepresentativePlots, p.Votes, p.PlotVotes})
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
	var c worldCheckpoint
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("invalid checkpoint: %w", err)
	}
	if c.Version != checkpointVersion {
		return nil, fmt.Errorf("unsupported checkpoint version %d", c.Version)
	}
	if err := c.Settings.Validate(len(c.Teams)); err != nil {
		return nil, fmt.Errorf("invalid checkpoint settings: %w", err)
	}
	if len(c.Agents) != len(c.Teams)*c.Settings.Copies || len(c.AgentPrivate) != len(c.Agents) || len(c.TeamTokens) != len(c.Teams) || len(c.Plots) != c.Settings.Plots || len(c.PlotPrivate) != len(c.Plots) || len(c.Weather) != len(c.Plots) || len(c.Ballots) != len(c.Proposals) || c.PhaseIndex < 0 || c.PhaseIndex >= len(Phases) || c.EventStart < 0 || c.EventStart > len(c.Events) {
		return nil, errors.New("checkpoint state is incomplete")
	}
	w := &World{
		Settings: c.Settings, Teams: c.Teams, Seed: c.Seed, Agents: c.Agents, Plots: c.Plots,
		Federations: c.Federations, Proposals: c.Proposals, Pending: c.Pending,
		Events: c.Events, Offers: c.Offers, Month: c.Month, Day: c.Day, AbsoluteDay: c.AbsoluteDay,
		Phase: c.Phase, Done: c.Done, Meteor: c.Meteor, Months: c.Months, political: c.Political,
		phaseIndex: c.PhaseIndex, advance: c.Advance, eventStart: c.EventStart,
		nextEvent: c.NextEvent, nextOffer: c.NextOffer, nextQuery: c.NextQuery,
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
		a.Memory, a.Permits = c.AgentPrivate[i].Memory, c.AgentPrivate[i].Permits
	}
	for i, p := range w.Plots {
		if p == nil || p.ID != i {
			return nil, errors.New("invalid checkpoint plot")
		}
		p.GrowthRemainder, p.Rotation, p.Records = c.PlotPrivate[i].GrowthRemainder, c.PlotPrivate[i].Rotation, c.PlotPrivate[i].Records
	}
	for i, p := range w.Proposals {
		if p == nil {
			return nil, errors.New("invalid checkpoint proposal")
		}
		p.Electorate, p.RepresentativePlots = c.Ballots[i].Electorate, c.Ballots[i].RepresentativePlots
		p.Votes, p.PlotVotes = c.Ballots[i].Votes, c.Ballots[i].PlotVotes
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
