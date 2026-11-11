package garden

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/MattSScott/basePlatformSOMAS/v2/pkg/agent"
	"github.com/MattSScott/basePlatformSOMAS/v2/pkg/server"
)

const Rounds = 30

type View struct {
	Round, PatchFood, Energy, AgentCount, LastFood, LastEnergy int
	Seed                                                       int64
	Pantry, DailyFood, Price, LockedPrice, Pending             int
	LastEaten, TotalFood, TotalEnergy, TotalEaten              int
	FieldCapacity, EnergyCapacity, Sunlight                    int
}
type Action struct{ Food, Energy int }
type Slot struct {
	Appearance         *int     `json:"appearance,omitempty"`
	StartingPantry     *int     `json:"startingPantry,omitempty"`
	Builder            *Builder `json:"builder,omitempty"`
	PublicStrategyName string   `json:"publicStrategyName,omitempty"`
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Policy             string   `json:"policy"`
	URL                string   `json:"url,omitempty"`
	Token              string   `json:"token,omitempty"`
	Error              string   `json:"error,omitempty"`
}
type Request struct {
	Settings *Settings `json:"settings,omitempty"`
	Seed     int64     `json:"seed"`
	Slots    []Slot    `json:"slots"`
}
type State struct {
	Appearance  int    `json:"appearance"`
	Pantry      int    `json:"pantry"`
	Eaten       int    `json:"eaten"`
	TotalEaten  int    `json:"totalEaten"`
	Sunlight    int    `json:"sunlight"`
	Price       int    `json:"price"`
	ID          string `json:"id"`
	Name        string `json:"name"`
	Food        int    `json:"food"`
	Given       int    `json:"given"`
	EnergyLeft  int    `json:"energyLeft"`
	TotalFood   int    `json:"totalFood"`
	TotalEnergy int    `json:"totalEnergy"`
	Fed         int    `json:"fed"`
	Dead        bool   `json:"dead"`
	DiedRound   int    `json:"diedRound,omitempty"`
	Error       string `json:"error,omitempty"`
}
type Deposit struct {
	Price   int  `json:"price"`
	Energy  int  `json:"energy"`
	Created bool `json:"created"`
}
type Meal struct {
	Actor  int  `json:"actor"`
	Before int  `json:"before"`
	Eaten  int  `json:"eaten"`
	After  int  `json:"after"`
	Fed    bool `json:"fed"`
}
type Frame struct {
	Decisions   []DecisionRecord `json:"decisions,omitempty"`
	LockedPrice int              `json:"lockedPrice"`
	Deposits    []Deposit        `json:"deposits,omitempty"`
	Meals       []Meal           `json:"meals,omitempty"`
	Round       int              `json:"round"`
	Phase       string           `json:"phase"`
	Actor       int              `json:"actor"`
	Food        int              `json:"food"`
	Energy      int              `json:"energy"`
	Regrew      bool             `json:"regrew"`
	Pending     int              `json:"pending"`
	Created     int              `json:"created"`
	Agents      []State          `json:"agents"`
}
type Result struct {
	// Err is populated instead of a partial replay if the simulation was interrupted.
	Err        error                 `json:"-"`
	Strategies []StrategyDescription `json:"strategies,omitempty"`
	Settings   *Settings             `json:"settings,omitempty"`
	Version    int                   `json:"version"`
	Seed       int64                 `json:"seed"`
	Frames     []Frame               `json:"frames"`
	Agents     []State               `json:"agents"`
	Food       int                   `json:"food"`
	Rounds     int                   `json:"rounds"`
}
type resident interface{ agent.IAgent[resident] }
type person struct {
	*agent.BaseAgent[resident]
	memory int
	slot   Slot
	state  State
	rng    *rand.Rand
}
type world struct {
	*server.BaseServer[resident]
	people                                             []*person
	settings                                           Settings
	legacy                                             bool
	food, energy, round, pending, created, lockedPrice int
	regrew                                             bool
	rng, farmingRng, sunRng, priceRng                  *rand.Rand
	frames                                             []Frame
	ctx                                                context.Context
}

func Run(ctx context.Context, r Request) Result {
	cfg := DefaultSettings()
	count := MaxSeats
	if r.Settings != nil {
		cfg = *r.Settings
		count = len(r.Slots)
	}
	w := &world{
		BaseServer: server.CreateBaseServer[resident](1, cfg.RoundLimit, time.Second, 1), food: cfg.StartingField,
		settings: cfg, legacy: r.Settings == nil, ctx: ctx,
		rng: rand.New(rand.NewSource(r.Seed)), farmingRng: rand.New(rand.NewSource(r.Seed ^ 0x4f1bbcdc6762c685)),
		sunRng: rand.New(rand.NewSource(r.Seed ^ 0x6124081843344)), priceRng: rand.New(rand.NewSource(r.Seed ^ 0x323a315b294a)),
	}
	for i := 0; i < count; i++ {
		s := Slot{ID: fmt.Sprintf("example-%d", i+1), Name: fmt.Sprintf("Amoeboid %d", i+1), Policy: "cooperate"}
		if i < len(r.Slots) {
			s = r.Slots[i]
		}
		pantry, appearance := cfg.StartingPantry, i
		if s.StartingPantry != nil {
			pantry = *s.StartingPantry
		}
		if s.Appearance != nil {
			appearance = *s.Appearance
		}
		state := State{ID: s.ID, Name: s.Name, Error: s.Error, Pantry: pantry, Appearance: appearance}
		if w.legacy {
			state.EnergyLeft = 6
		}
		p := &person{BaseAgent: agent.CreateBaseAgent[resident](w), slot: s, state: state, rng: rand.New(rand.NewSource(r.Seed + int64(i)*7919))}
		w.people = append(w.people, p)
		w.AddAgent(p)
	}
	w.record("ready", -1)
	w.SetGameRunner(w)
	w.Start()
	if err := ctx.Err(); err != nil {
		return Result{Err: err}
	}
	version := 4
	var strategies []StrategyDescription
	if w.legacy {
		version = 3
	} else {
		for _, p := range w.people {
			strategies = append(strategies, p.slot.strategyDescription())
		}
	}
	return Result{Version: version, Strategies: strategies, Seed: r.Seed, Settings: r.Settings, Frames: w.frames, Agents: w.states(), Food: w.food, Rounds: w.round}
}
func (w *world) RunStartOfIteration(int) {}
func (w *world) RunEndOfIteration(int)   {}
func (w *world) states() []State {
	s := make([]State, len(w.people))
	for i, p := range w.people {
		s[i] = p.state
	}
	return s
}
func (w *world) record(phase string, actor int) *Frame {
	w.frames = append(w.frames, Frame{Round: w.round, Phase: phase, Actor: actor, Food: w.food, Energy: w.energy, Regrew: w.regrew, Pending: w.pending, LockedPrice: w.lockedPrice, Created: w.created, Agents: w.states()})
	return &w.frames[len(w.frames)-1]
}

// Resources are drawn in roster order before any parallel agent decisions. The
// streams are independent of each other, harvest order and contribution order.
func (w *world) dawn() {
	sun, price := w.settings.Sunlight, w.settings.Price
	sharedSun, sharedPrice := sun.Value, price.Value
	if sun.Mode == "random" && !sun.PerAgent {
		sharedSun = sun.draw(w.sunRng)
	}
	if price.Mode == "random" && !price.PerAgent {
		sharedPrice = price.draw(w.priceRng)
	}
	for _, p := range w.people {
		s := &p.state
		s.Sunlight = 0
		if s.Dead {
			continue
		}
		light, cost := sharedSun, sharedPrice
		if sun.Mode == "random" && sun.PerAgent {
			light = sun.draw(w.sunRng)
		}
		if price.Mode == "random" && price.PerAgent {
			cost = price.draw(w.priceRng)
		}
		if w.legacy {
			s.EnergyLeft = 0
		}
		s.Sunlight = min(light, w.settings.EnergyCapacity-s.EnergyLeft)
		s.EnergyLeft += s.Sunlight
		s.Price = price.quote(w.food, w.settings.FieldCapacity, cost)
	}
}

func (w *world) view(p *person, alive int) View {
	s := p.state
	return View{Round: w.round, PatchFood: w.food, Energy: s.EnergyLeft, AgentCount: alive, LastFood: s.Food, LastEnergy: s.Given, Seed: p.rng.Int63(),
		Pantry: s.Pantry, DailyFood: w.settings.DailyFood, Price: s.Price, LockedPrice: w.lockedPrice, Pending: w.pending, LastEaten: s.Eaten,
		TotalFood: s.TotalFood, TotalEnergy: s.TotalEnergy, TotalEaten: s.TotalEaten, FieldCapacity: w.settings.FieldCapacity, EnergyCapacity: w.settings.EnergyCapacity, Sunlight: s.Sunlight}
}

func (w *world) plant(p *person, offer int) []Deposit {
	capacity := w.settings.FieldCapacity
	if w.food < w.settings.PlantingMinimum {
		return nil
	}
	available := min(max(0, offer), p.state.EnergyLeft)
	var deposits []Deposit
	for available > 0 && w.food < capacity {
		if w.pending == 0 {
			w.lockedPrice = w.settings.Price.quote(w.food, capacity, p.state.Price)
		}
		accepted := min(available, w.lockedPrice-w.pending)
		w.pending += accepted
		available -= accepted
		d := Deposit{Price: w.lockedPrice, Energy: accepted, Created: w.pending == w.lockedPrice}
		if d.Created {
			w.pending, w.lockedPrice = 0, 0
			w.food++
			w.created++
		}
		p.state.Given += accepted
		p.state.EnergyLeft -= accepted
		p.state.TotalEnergy += accepted
		w.energy += accepted
		if !w.legacy {
			deposits = append(deposits, d)
		}
	}
	return deposits
}

func (w *world) supper() []Meal {
	var meals []Meal
	for i, p := range w.people {
		s := &p.state
		if s.Dead {
			continue
		}
		before := s.Pantry
		s.Eaten = min(before, w.settings.DailyFood)
		s.TotalEaten += s.Eaten
		s.Pantry -= s.Eaten
		if !w.settings.CarryFood {
			s.Pantry = 0
		}
		fed := s.Eaten == w.settings.DailyFood
		if fed && !w.legacy {
			s.Fed++
		}
		meals = append(meals, Meal{Actor: i, Before: before, Eaten: s.Eaten, After: s.Pantry, Fed: fed})
	}
	return meals
}

func (w *world) RunTurn(_, t int) {
	defer func() {
		for _, p := range w.people {
			p.SignalMessagingComplete()
		}
	}()
	alive := 0
	for _, p := range w.people {
		if !p.state.Dead {
			alive++
		}
	}
	if alive == 0 || w.ctx.Err() != nil {
		return
	}
	w.round = t + 1
	w.energy, w.created, w.regrew = 0, 0, false
	w.dawn()
	choices := make([]seatChoice, len(w.people))
	var wg sync.WaitGroup
	for i, p := range w.people {
		if p.state.Dead {
			continue
		}
		if p.state.Error != "" {
			choices[i].record.Status = "unavailable"
			continue
		}
		v := w.view(p, alive)
		wg.Add(1)
		go func(i int, p *person) { defer wg.Done(); choices[i] = decide(w.ctx, p, v) }(i, p)
	}
	wg.Wait()
	// A single runner timeout is a seat error. A cancelled game has no ending.
	if w.ctx.Err() != nil {
		return
	}
	var decisions []DecisionRecord
	for i, p := range w.people {
		p.state.Food, p.state.Given, p.state.Eaten = 0, 0, 0
		choice := choices[i]
		if choice.issue != "" {
			p.state.Error = choice.issue
		}
		if !w.legacy && !p.state.Dead {
			choice.record.Actor = i
			decisions = append(decisions, choice.record)
		}
	}
	w.record("start", -1).Decisions = decisions
	for _, i := range w.rng.Perm(len(w.people)) {
		p := w.people[i]
		if p.state.Dead {
			continue
		}
		n := min(max(choices[i].action.Food, 0), 10, w.food)
		p.state.Food = n
		p.state.TotalFood += n
		p.state.Pantry += n
		if w.legacy && n >= 1 {
			p.state.Fed++
		}
		w.food -= n
		w.record("harvest", i)
	}
	for _, i := range w.farmingRng.Perm(len(w.people)) {
		p := w.people[i]
		if p.state.Dead {
			continue
		}
		deposits := w.plant(p, choices[i].action.Energy)
		w.record("contribute", i).Deposits = deposits
	}
	w.regrew = w.created > 0
	w.record("grow", -1)
	meals := w.supper()
	if !w.legacy {
		w.record("supper", -1).Meals = meals
	}
	for _, m := range meals {
		if m.Fed {
			continue
		}
		s := &w.people[m.Actor].state
		s.Dead = true
		s.EnergyLeft = 0
		s.DiedRound = w.round
		w.record("death", m.Actor)
	}
}
func runPolicy(ctx context.Context, p *person, v View) (Action, string) {
	if p.slot.URL == "" {
		switch p.slot.Policy {
		case "greedy":
			return Action{10, 0}, ""
		case "random":
			r := rand.New(rand.NewSource(v.Seed))
			return Action{r.Intn(11), r.Intn(7)}, ""
		default:
			return Action{2, 4}, ""
		}
	}
	body, _ := json.Marshal(v)
	ctx, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
	defer cancel()
	req, e := http.NewRequestWithContext(ctx, http.MethodPost, p.slot.URL+"/decide", bytes.NewReader(body))
	if e != nil {
		return Action{}, "Agent could not start"
	}
	req.Header.Set("Authorization", "Bearer "+p.slot.Token)
	req.Header.Set("Content-Type", "application/json")
	client := http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, e := client.Do(req)
	if e != nil {
		return Action{}, "Agent timed out or stopped responding"
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return Action{}, "Agent crashed while deciding"
	}
	var a Action
	dec := json.NewDecoder(io.LimitReader(res.Body, 2048))
	if dec.Decode(&a) != nil {
		return Action{}, "Agent returned an invalid decision"
	}
	if dec.Decode(new(any)) != io.EOF {
		return Action{}, "Agent returned an invalid decision"
	}
	return a, ""
}
