package society

// The six built-in strategies. Each is a complete style of play built only
// from what an Amoeboid can observe: its own body, mind and larder, its plot's
// field, residents and laws, every plot's weather, and its private memory.
//
//   Wardens     manage the commons: sustainable quotas, enforcement, crowd caps.
//   Tinkerers   try four styles across months and keep the one that scores best.
//   Locusts     harvest to the limit, oppose every rule, and move on when a field thins.
//   Envoys      found governments, bind plots into federations and send food where short.
//   Barons      take office, raise their team's influence and pay their team from the treasury.
//   Sunchasers  follow the sunniest weather to think, carry a larder and never vote.
//
// Agents are created team by team, so an Amoeboid's team is its ID divided by
// the number of copies. Barons use this to recognise one another.

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strconv"
	"strings"
)

// PresetInfo describes a built-in strategy for setup screens.
type PresetInfo struct {
	Policy  string `json:"policy"`
	Name    string `json:"name"`
	Summary string `json:"summary"`
}

// Presets lists the built-in strategies in their default team order.
func Presets() []PresetInfo {
	return []PresetInfo{
		{"warden", "Wardens", "Set sustainable quotas, enforce them and cap crowding"},
		{"tinkerer", "Tinkerers", "Try four styles across months and keep what scores best"},
		{"locust", "Locusts", "Harvest to the limit, vote down every rule, move on when a field thins"},
		{"envoy", "Envoys", "Found governments, federate plots and send food where it is short"},
		{"baron", "Barons", "Win a treasury office, levy the surplus and pay their own team"},
		{"sunchaser", "Sunchasers", "Follow the sun to think, carry a larder, never vote"},
	}
}

// Earlier releases named different presets; saved setups map to the nearest style.
var policyAliases = map[string]string{"steward": "warden", "thinker": "sunchaser", "gatherer": "locust", "diplomat": "envoy", "wanderer": "sunchaser", "learner": "tinkerer"}

func canonicalPolicy(p string) string {
	if to, ok := policyAliases[p]; ok {
		return to
	}
	return p
}

func knownPolicy(p string) bool {
	for _, x := range Presets() {
		if x.Policy == canonicalPolicy(p) {
			return true
		}
	}
	return false
}

func defaultDecision(v Observation, policy string) Decision {
	c := newCtx(v)
	var d Decision
	switch canonicalPolicy(policy) {
	case "warden":
		d = warden(c)
	case "tinkerer":
		d = tinkerer(c)
	case "locust":
		d = locust(c)
	case "envoy":
		d = envoy(c)
	case "baron":
		d = baron(c)
	default:
		d = sunchaser(c)
	}
	// Every style keeps the same private record of what it has seen.
	if v.Phase == "close" || v.Phase == "month_end" || c.dirty {
		c.observe()
		d.Memory, _ = json.Marshal(c.mem)
	}
	return d
}

// --- shared reasoning --------------------------------------------------------

type ctx struct {
	v     Observation
	a     Agent
	s     Settings
	need  int
	p     *PlotView
	mem   map[string]float64
	dirty bool
}

func newCtx(v Observation) *ctx {
	c := &ctx{v: v, a: v.Self, s: v.Settings, need: v.Settings.DailyFood, mem: map[string]float64{}}
	if v.Self.Plot >= 0 && v.Self.Plot < len(v.Plots) {
		c.p = &v.Plots[v.Self.Plot]
	}
	_ = json.Unmarshal(v.Memory, &c.mem)
	return c
}

func (c *ctx) remember(key string, x float64) { c.mem[key] = x; c.dirty = true }
func (c *ctx) recall(key string) float64      { return c.mem[key] }
func (c *ctx) rng() *rand.Rand                { return rand.New(rand.NewSource(c.v.RandomSeed)) }

// observe records the plot's field each night, and a failed move. Facts from
// an earlier month are ignored because the meteor resets every field.
func (c *ctx) observe() {
	if c.p != nil && c.p.Stock != nil && c.p.Capacity > 0 {
		c.mem[plotKey("field", c.p.ID)] = float64(*c.p.Stock) / float64(c.p.Capacity)
		c.mem[plotKey("people", c.p.ID)] = float64(len(c.p.Residents))
		c.mem[plotKey("seen", c.p.ID)] = float64(c.v.AbsoluteDay)
	}
	if c.v.Phase == "close" && c.a.Alive && c.a.Eaten < c.need {
		c.mem["short"]++
	}
	if c.v.Phase == "month_end" {
		c.mem["months"]++
		for k := range c.mem {
			if strings.HasPrefix(k, "plot.") || k == "short" || k == "try" || k == "tryDay" {
				delete(c.mem, k)
			}
		}
	}
}

// plotKey names a fact remembered about a plot this month.
func plotKey(fact string, id int) string { return fmt.Sprintf("plot.%s.%d", fact, id) }

func (c *ctx) teamOf(id int) int  { return id / max(1, c.s.Copies) }
func (c *ctx) kin(id int) bool    { return c.teamOf(id) == c.a.Team }
func (c *ctx) residents() int     { return len(c.p.Residents) }
func (c *ctx) governed() bool     { return c.p != nil && c.p.Government }
func (c *ctx) federated() bool    { return c.p != nil && c.p.Federation >= 0 }
func (c *ctx) rule(k string) Rule { return c.p.Rules[k] }
func (c *ctx) has(k string) bool  { _, ok := c.p.Rules[k]; return ok }

// lead is true for the lowest-numbered resident of the plot who passes the
// filter, so a team tables each motion once rather than once per member.
func (c *ctx) lead(filter func(int) bool) bool {
	if c.p == nil {
		return false
	}
	ids := append([]int{}, c.p.Residents...)
	sort.Ints(ids)
	for _, id := range ids {
		if filter(id) {
			return id == c.a.ID
		}
	}
	return false
}

// growthRate is a in F' = (F−H)(1+a): the field's overnight regrowth per
// carrot left standing, which rises with the residents tending it.
func (c *ctx) growthRate(capacity int, residents float64) float64 {
	k := float64(capacity)
	return c.s.Growth * math.Min(residents, k/c.s.ProductiveCapacity) / k
}

// morning is the field's stock before the next harvest. Before the harvest it
// is today's stock; afterwards it is tonight's stock after overnight regrowth.
func (c *ctx) morning() float64 {
	if c.p == nil || c.p.Stock == nil {
		return 0
	}
	f := float64(*c.p.Stock)
	if c.v.Phase == "movement" || c.v.Phase == "harvest" {
		return f
	}
	return math.Min(float64(c.p.Capacity), f*(1+c.growthRate(c.p.Capacity, float64(c.residents()))))
}

// stockFrac is the morning stock as a share of capacity, or −1 if unknown.
func (c *ctx) stockFrac() float64 {
	if c.p == nil || c.p.Stock == nil || c.p.Capacity == 0 {
		return -1
	}
	return c.morning() / float64(c.p.Capacity)
}

// estimate guesses a plot's field share and population: shared data, then
// this month's memory, then the assumption that an unseen field looks like
// the one at hand and holds the population its size suggests.
func (c *ctx) estimate(q PlotView) (frac, residents float64) {
	residents = float64(q.Capacity) / float64(max(1, c.s.CapacityPerAgent))
	if q.Stock != nil && q.Capacity > 0 {
		frac = float64(*q.Stock) / float64(q.Capacity)
		if q.ID == c.a.Plot {
			residents = float64(len(q.Residents))
		}
		return
	}
	if seen := c.mem[plotKey("seen", q.ID)]; seen > 0 && c.v.AbsoluteDay-int(seen) < c.v.Day {
		return c.mem[plotKey("field", q.ID)], c.mem[plotKey("people", q.ID)]
	}
	if f := c.stockFrac(); f >= 0 {
		return f, residents
	}
	return c.s.StartingStock, residents
}

// sustainable returns the plot's maximum sustainable daily yield and the field
// share that produces it. Growth is g·min(n, K/c)·F/K, capped at K−F.
func sustainable(s Settings, capacity int, residents float64) (yield, frac float64) {
	k := float64(capacity)
	m := math.Min(residents, k/s.ProductiveCapacity)
	if m <= 0 || k <= 0 {
		return 0, 0
	}
	gm := s.Growth * m
	frac = k / (gm + k)
	return gm * frac, frac
}

// share is each resident's part of the plot's maximum sustainable yield,
// rounded: the fair quota.
func (c *ctx) share() int {
	if c.p == nil || c.residents() == 0 {
		return c.need
	}
	y, _ := sustainable(c.s, c.p.Capacity, float64(c.residents()))
	return int(math.Round(y / float64(c.residents())))
}

// steady is each resident's part of the harvest that leaves the field as large
// tomorrow. Carrots regrow from what is left after the harvest:
// F' = (F−H)(1+a) with a = g·min(n, K/c)/K, so H = aF/(1+a) holds F steady.
func (c *ctx) steady() float64 {
	if c.p == nil || c.p.Stock == nil || c.residents() == 0 || c.p.Capacity == 0 {
		return float64(c.need)
	}
	n := float64(c.residents())
	a := c.growthRate(c.p.Capacity, n)
	return a * c.morning() / (1 + a) / n
}

// surplus is the plot's daily regrowth beyond everyone's meals, less a 10%
// safety margin: what a granary could take without eating into the field.
func (c *ctx) surplus() float64 {
	if c.p == nil {
		return 0
	}
	n := float64(c.residents())
	return (c.steady() - 1.1*float64(c.need)) * n
}

// allowance is what a considerate resident harvests today: its meal, plus its
// part of the steady surplus. The fraction is rounded at random, so the plot's
// total is right on average instead of everyone rounding up together.
func (c *ctx) allowance() int {
	extra := math.Max(0, .95*c.steady()-float64(c.need))
	whole := math.Floor(extra)
	if c.rng().Float64() < extra-whole {
		whole++
	}
	return c.need + int(whole)
}

// feedable is how many residents a field of this size and stock feeds at
// its steady harvest, counting the growth each extra resident tends.
func (c *ctx) feedable(capacity int, frac, residents float64) float64 {
	a := c.growthRate(capacity, residents)
	return .95 * a * frac * float64(capacity) / (1 + a) / float64(max(1, c.need))
}

// excess is how many residents more the plot has than its field can feed.
func (c *ctx) excess() float64 {
	if c.p == nil || c.p.Stock == nil || c.p.Capacity == 0 {
		return 0
	}
	n := float64(c.residents())
	return n - c.feedable(c.p.Capacity, c.stockFrac(), n)
}

// room is the estimated number of newcomers a plot could still feed.
func (c *ctx) room(q PlotView) float64 {
	frac, n := c.estimate(q)
	return c.feedable(q.Capacity, frac, n+1) - n - 1
}

// rebalance sends out just the surplus population of an overcrowded or
// failing plot: each resident leaves with probability excess/residents, so
// on average only the excess departs.
func (c *ctx) rebalance(prefer func(PlotView) float64) (Decision, bool) {
	ex := c.excess()
	if ex < 1 || c.rng().Float64() >= ex/float64(c.residents()) {
		return Decision{}, false
	}
	if dest := c.refuge(prefer); dest >= 0 {
		return c.move(dest), true
	}
	return Decision{}, false
}

// carrying is the population a plot can feed at its sustainable yield.
func (c *ctx) carrying(q PlotView) int {
	y, _ := sustainable(c.s, q.Capacity, float64(q.Capacity)/c.s.ProductiveCapacity)
	return max(1, int(y/float64(max(1, c.need))))
}

// expectedMind is tomorrow's expected mind from a plot's weather today: it
// persists with probability p, otherwise turns to either other state.
func (c *ctx) expectedMind(weather int) float64 {
	r := c.s.WeatherRates
	p := c.s.WeatherPersistence
	others := 0.
	for i, x := range r {
		if i != weather {
			others += x
		}
	}
	return p*r[weather] + (1-p)*others/2
}

// quota is the daily harvest allowance in force for this Amoeboid, if any.
func (c *ctx) quota() (int, bool) {
	if c.p == nil {
		return 0, false
	}
	q, ok := c.p.Rules[fmt.Sprintf("quota:%d", c.a.ID)]
	if !ok {
		q, ok = c.p.Rules["quota"]
	}
	if !ok || q.Mode != "limited" {
		return 0, false
	}
	return int(q.Amount), true
}

// harvestTo asks for enough to hold `want` carrots, within the harvest limit,
// personal capacity, and (when obeying) the quota and a daily cap.
func (c *ctx) harvestTo(want, cap int, obey bool) Decision {
	n := min(max(0, want-c.a.Food), c.s.HarvestLimit, c.s.PersonalCapacity-c.a.Food, cap)
	if q, ok := c.quota(); ok && obey {
		n = min(n, max(0, q-c.a.Harvested))
	}
	return Decision{Harvest: max(0, n)}
}

// eat restores the body and adds `extra` carrots of pleasure, then thinks
// with every unpledged unit of mind: thought is satisfaction one for one.
func (c *ctx) eat(extra int) Decision {
	deficit := max(0, int(math.Ceil(c.s.BodyCapacity-c.a.Body-1e-9)))
	n := min(c.a.Food, c.need+max(deficit, max(0, extra)))
	return Decision{Eat: n, Think: available(&c.a)}
}

func (c *ctx) move(dest int) Decision {
	if dest == c.a.Plot || dest < 0 {
		return Decision{}
	}
	c.remember("try", float64(dest+1))
	c.remember("tryDay", float64(c.v.AbsoluteDay))
	return Decision{Move: &dest}
}

// arrive goes to a starting plot on the first morning or after respawning, and
// notes when the last move was refused so that plot is avoided for a while.
func (c *ctx) arrive() (Decision, bool) {
	if t := int(c.recall("try")) - 1; t >= 0 && int(c.recall("tryDay")) == c.v.AbsoluteDay-1 && c.a.Plot != t {
		c.remember(plotKey("refused", t), float64(c.v.AbsoluteDay))
		delete(c.mem, "try")
	}
	if c.p == nil {
		return c.move(initialPlot(c.v)), true
	}
	return Decision{}, false
}

func (c *ctx) blocked(id int) bool {
	b := c.mem[plotKey("refused", id)]
	return b > 0 && c.v.AbsoluteDay-int(b) < 5
}

// starving means today's field cannot feed everyone and the larder is thin.
func (c *ctx) starving() bool {
	f := c.stockFrac()
	if f < 0 {
		return false
	}
	return *c.p.Stock < c.need*c.residents() && c.a.Food < 2*c.need
}

// refuge picks a plot with room to feed newcomers, nudged by expected mind,
// avoiding plots that refused entry recently. It chooses at random among the
// options close to the best, so a team does not stampede.
func (c *ctx) refuge(prefer func(PlotView) float64) int {
	type option struct {
		id    int
		score float64
	}
	var options []option
	best := math.Inf(-1)
	for _, q := range c.v.Plots {
		if q.ID == c.a.Plot || c.blocked(q.ID) {
			continue
		}
		x := c.room(q) + c.expectedMind(q.Weather)/2
		if prefer != nil {
			x += prefer(q)
		}
		options = append(options, option{q.ID, x})
		best = math.Max(best, x)
	}
	pool, total := []option{}, 0.
	for _, o := range options {
		if o.score >= best-math.Max(2, math.Abs(best)*.25) {
			pool = append(pool, o)
			total += math.Max(.1, o.score-best+3)
		}
	}
	if len(pool) == 0 {
		return -1
	}
	x := c.rng().Float64() * total
	for _, o := range pool {
		if x -= math.Max(.1, o.score-best+3); x <= 0 {
			return o.id
		}
	}
	return pool[len(pool)-1].id
}

func (c *ctx) pledge(local, federation float64) Decision {
	if c.p == nil {
		return Decision{}
	}
	local = math.Min(local, c.a.Mind)
	out := map[string]float64{"local": local}
	if federation > 0 {
		out["federation"] = math.Min(federation, math.Max(0, c.a.Mind-local))
	}
	return Decision{Pledge: out}
}

// vote applies a judgement to every motion decided today. Abstaining is free
// and is the default, so only yes and no are cast.
func (c *ctx) vote(judge func(*Proposal) string) Decision {
	votes := map[string]string{}
	for _, q := range c.v.Proposals {
		if q.Status != "open" || q.Closes != c.v.AbsoluteDay {
			continue
		}
		if x := judge(q); x == "yes" || x == "no" {
			votes[q.ID] = x
		}
	}
	return Decision{Votes: votes}
}

func (c *ctx) policy(key string, r Rule) ProposalInput {
	return ProposalInput{Kind: "policy", Plot: c.p.ID, Key: key, Rule: r}
}

// open reports whether a motion on this law is already before the assembly,
// so a lead does not pay to table a duplicate.
func (c *ctx) open(kind, key string) bool {
	for _, q := range c.v.Proposals {
		if q.Status == "open" && q.Plot == c.a.Plot && q.Input.Kind == kind && strings.Split(q.Input.Key, ":")[0] == key {
			return true
		}
	}
	return false
}

func lawOf(q *Proposal) string { return policyBase(q.Input.Key) }

// hopeless is true once this Amoeboid has seen two of its own motions of this
// kind on this law fail this month: it stops paying for lost causes.
func (c *ctx) hopeless(kind, key string) bool {
	n := 0
	for _, q := range c.v.Proposals {
		if q.Author == c.a.ID && q.Status == "failed" && q.Input.Kind == kind && policyBase(q.Input.Key) == key {
			n++
		}
	}
	return n >= 2
}

// table returns the first motion on the agenda that is neither already open
// nor a lost cause.
func (c *ctx) table(agenda []ProposalInput) (ProposalInput, bool) {
	for _, in := range agenda {
		key := policyBase(in.Key)
		if !c.open(in.Kind, key) && !c.hopeless(in.Kind, key) {
			return in, true
		}
	}
	return ProposalInput{}, false
}

// --- Wardens -------------------------------------------------------------------

func warden(c *ctx) Decision {
	switch c.v.Phase {
	case "movement":
		if d, ok := c.arrive(); ok {
			return d
		}
		if c.starving() {
			return c.move(c.refuge(nil))
		}
		if d, ok := c.rebalance(nil); ok {
			return d
		}
	case "harvest":
		// Today's meal and a two-day larder, never above the sustainable share.
		return c.harvestTo(3*c.need, c.allowance(), true)
	case "pledges":
		if !c.governed() {
			return c.pledge(1.5, 0)
		}
		return c.pledge(.6, 0)
	case "proposals":
		if c.p != nil && c.lead(c.kin) {
			if in, ok := wardenAgenda(c); ok {
				return Decision{Proposals: []ProposalInput{in}}
			}
		}
	case "voting":
		return c.vote(func(q *Proposal) string { return wardenJudge(c, q) })
	case "eating":
		extra := 0
		if c.stockFrac() > .7 && c.a.Food >= 3*c.need {
			extra = 1
		}
		return c.eat(extra)
	}
	return Decision{}
}

// wardenAgenda tables one motion a day, the most urgent first. The quota is
// re-tuned when the sustainable share moves, at most every third day.
func wardenAgenda(c *ctx) (ProposalInput, bool) {
	if !c.governed() {
		return ProposalInput{Kind: "found", Plot: c.p.ID}, true
	}
	agenda := []ProposalInput{}
	q := max(c.need, int(math.Round(c.steady())))
	cur := c.rule("quota")
	if cur.Mode != "limited" || (int(cur.Amount) != q && c.v.Day%3 == 0) {
		agenda = append(agenda, c.policy("quota", Rule{Mode: "limited", Amount: float64(q)}))
	}
	if cur.Mode == "limited" && c.rule("enforcement").Mode != "hard" {
		agenda = append(agenda, c.policy("enforcement", Rule{Mode: "hard"}))
	}
	limit := max(1, int(c.feedable(c.p.Capacity, c.stockFrac(), float64(c.residents()))))
	if old := c.rule("entry").Limit; (old == 0 && c.residents() >= limit-2) || (old > 0 && abs(old-limit) >= 3 && c.v.Day%3 == 0) {
		agenda = append(agenda, c.policy("entry", Rule{Mode: "open", Limit: limit}))
	}
	if f := c.stockFrac(); f >= 0 && f < .6 && c.rule("harvestOrder").Mode != "lowestBody" {
		agenda = append(agenda, c.policy("harvestOrder", Rule{Mode: "lowestBody"}))
	}
	if c.has("collection") && c.rule("collection").Amount > c.surplus() {
		agenda = append(agenda, ProposalInput{Kind: "repeal", Plot: c.p.ID, Key: "collection"})
	}
	if !c.has("inheritance") {
		agenda = append(agenda, c.policy("inheritance", Rule{Mode: "equal"}))
	}
	return c.table(agenda)
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func wardenJudge(c *ctx, q *Proposal) string {
	in := q.Input
	share := max(c.need, int(math.Round(c.steady())))
	switch in.Kind {
	case "found", "removeOffice", "distribution", "federationFound", "federationJoin", "ratify", "sanction":
		return "yes"
	case "dissolve", "federationLeave", "federationDissolve":
		return "no"
	case "office":
		if in.Rule.Enabled || has(in.Rule.Powers, "collection") {
			return "no"
		}
		return "yes"
	case "donation":
		if c.stockFrac() >= 0 && c.stockFrac() < .6 {
			return "no"
		}
		return "yes"
	case "repeal":
		switch policyBase(in.Key) {
		case "quota", "enforcement", "entry", "inheritance", "harvestOrder":
			return "no"
		case "influence", "office", "proposers", "collection":
			return "yes"
		}
	case "federationPolicy":
		if in.Key == "immigration" {
			if in.Rule.Mode == "open" {
				return "no"
			}
			return "yes"
		}
		return "yes"
	case "policy":
		r := in.Rule
		switch policyBase(in.Key) {
		case "quota":
			if r.Mode == "limited" && int(r.Amount) >= c.need && int(r.Amount) <= share {
				return "yes"
			}
			return "no"
		case "enforcement":
			if r.Mode == "hard" {
				return "yes"
			}
			return "no"
		case "entry":
			fair := c.feedable(c.p.Capacity, c.stockFrac(), float64(c.residents()))
			if r.Mode == "open" && float64(r.Limit) >= fair*.8 {
				return "yes"
			}
			if r.Mode == "closed" || (r.Limit > 0 && float64(r.Limit) < fair*.8) {
				return "no"
			}
		case "harvestOrder":
			if r.Mode == "lowestBody" || r.Mode == "rotating" {
				return "yes"
			}
			if r.Mode == "highestInfluence" {
				return "no"
			}
		case "influence":
			if int(r.Amount) > c.s.StartingInfluence {
				return "no"
			}
		case "proposers":
			if r.Mode == "all" {
				return "yes"
			}
			return "no"
		case "collection":
			// A granary from the surplus, never from the field's capital.
			if r.Amount > c.surplus() {
				return "no"
			}
			return "yes"
		case "holding":
			if r.Mode == "collect" && int(r.Amount) >= 2*c.need {
				return "yes"
			}
		case "inheritance":
			if r.Mode == "equal" || r.Mode == "government" {
				return "yes"
			}
		case "records", "recordAccess", "sanctions", "distribution", "representative":
			return "yes"
		case "membershipMandate", "charterMandate":
			if r.Mode == "officers" {
				return "no"
			}
			return "yes"
		}
	}
	return "abstain"
}

// --- Locusts -------------------------------------------------------------------

func locust(c *ctx) Decision {
	switch c.v.Phase {
	case "movement":
		if d, ok := c.arrive(); ok {
			return d
		}
		// Leave a thinned or crowded field, or drift away from an enforced
		// quota, for a plot not stripped recently and not known to be strict,
		// preferring plots without a government at all.
		_, limited := c.quota()
		strict := limited && c.p.HardFunded
		if strict {
			c.remember(plotKey("strict", c.p.ID), float64(c.v.AbsoluteDay))
		}
		f := c.stockFrac()
		thin := f >= 0 && (f < .5 || c.excess() > 0) && c.rng().Float64() < .5
		if thin || (strict && c.rng().Float64() < .05) {
			if thin {
				c.remember(plotKey("stripped", c.p.ID), float64(c.v.AbsoluteDay))
			}
			return c.move(c.refuge(func(q PlotView) float64 {
				x := 0.
				if !q.Government {
					x += 4
				}
				if s := c.mem[plotKey("stripped", q.ID)]; s > 0 && c.v.AbsoluteDay-int(s) < 6 {
					x -= 100
				}
				if c.mem[plotKey("strict", q.ID)] > 0 {
					x -= 3
				}
				if c.room(q) < 2 {
					x -= 100
				}
				return x
			}))
		}
	case "harvest":
		// Everything the limit allows while the field has a surplus to strip,
		// one over their share when it does not. Only a hard quota stops them.
		if c.steady() >= float64(c.need)+.5 {
			return c.harvestTo(c.s.PersonalCapacity, c.s.HarvestLimit, false)
		}
		return c.harvestTo(c.s.PersonalCapacity, c.allowance()+1, false)
	case "voting":
		return c.vote(func(q *Proposal) string { return locustJudge(c, q) })
	case "accept":
		return acceptAll(c)
	case "eating":
		// Feast on whatever is beyond a two-day travelling larder.
		return c.eat(min(2, max(0, c.a.Food-3*c.need)))
	}
	return Decision{}
}

func locustJudge(c *ctx, q *Proposal) string {
	in := q.Input
	switch in.Kind {
	case "found", "sanction":
		return "no"
	case "dissolve", "distribution":
		return "yes"
	case "repeal":
		switch policyBase(in.Key) {
		case "quota", "enforcement", "tax", "holding", "collection", "entry", "exit", "sanctions", "harvestOrder":
			return "yes"
		}
	case "policy":
		r := in.Rule
		switch policyBase(in.Key) {
		case "quota":
			if r.Mode == "unlimited" {
				return "yes"
			}
			return "no"
		case "enforcement":
			if r.Mode == "soft" {
				return "yes"
			}
			return "no"
		case "tax", "holding", "collection", "sanctions", "records":
			return "no"
		case "entry":
			if r.Mode == "open" && r.Limit == 0 {
				return "yes"
			}
			return "no"
		case "exit":
			if r.Mode == "free" {
				return "yes"
			}
			return "no"
		case "harvestOrder":
			if r.Mode == "random" {
				return "yes"
			}
			return "no"
		case "distribution":
			return "yes"
		}
	}
	return "abstain"
}

// --- Sunchasers ------------------------------------------------------------------

func sunchaser(c *ctx) Decision {
	switch c.v.Phase {
	case "movement":
		if d, ok := c.arrive(); ok {
			return d
		}
		return sunMove(c)
	case "harvest":
		// A two-day larder to travel with, within the plot's sustainable share.
		return c.harvestTo(3*c.need, c.allowance(), true)
	case "accept":
		return acceptAll(c)
	case "eating":
		return c.eat(0)
	}
	return Decision{}
}

// sunMove compares tomorrow's expected mind here with every other plot. It
// moves only for a clear gain, spreads arrivals in proportion to field size so
// the team does not herd onto one plot, and flees a failing or crowded field.
func sunMove(c *ctx) Decision {
	if d, ok := c.rebalance(nil); ok {
		return d
	}
	here := c.expectedMind(c.p.Weather)
	type option struct {
		id     int
		weight float64
	}
	var options []option
	total := 0.
	for _, q := range c.v.Plots {
		if q.ID == c.a.Plot || c.blocked(q.ID) {
			continue
		}
		gain := c.expectedMind(q.Weather) - here
		if c.room(q) < 0 || gain < 2.5 {
			continue
		}
		w := gain * float64(q.Capacity)
		options = append(options, option{q.ID, w})
		total += w
	}
	r := c.rng()
	if len(options) == 0 || r.Float64() > .25 || c.a.Food < c.need {
		return Decision{}
	}
	x := r.Float64() * total
	for _, o := range options {
		if x -= o.weight; x <= 0 {
			return c.move(o.id)
		}
	}
	return c.move(options[len(options)-1].id)
}

func acceptAll(c *ctx) Decision {
	d := Decision{}
	for _, o := range c.v.Offers {
		if o.To == c.a.ID {
			d.Accept = append(d.Accept, o.ID)
		}
	}
	return d
}

// --- Envoys ---------------------------------------------------------------------

func envoy(c *ctx) Decision {
	switch c.v.Phase {
	case "movement":
		if d, ok := c.arrive(); ok {
			return d
		}
		// Prefer refuge inside the federation, where entry is open.
		inside := func(q PlotView) float64 {
			if c.federated() && q.Federation == c.p.Federation {
				return 3
			}
			return 0
		}
		if c.starving() {
			return c.move(c.refuge(inside))
		}
		if d, ok := c.rebalance(inside); ok {
			return d
		}
	case "harvest":
		return c.harvestTo(3*c.need, c.allowance(), true)
	case "pledges":
		switch {
		case !c.governed():
			return c.pledge(1.5, 0)
		case !c.federated():
			return c.pledge(.3, 2)
		default:
			return c.pledge(.3, .6)
		}
	case "proposals":
		if c.p != nil && c.lead(c.kin) {
			if in, ok := envoyAgenda(c); ok {
				return Decision{Proposals: []ProposalInput{in}}
			}
		}
	case "voting":
		return c.vote(func(q *Proposal) string { return envoyJudge(c, q) })
	case "accept":
		return acceptAll(c)
	case "eating":
		extra := 0
		if c.a.Food >= 3*c.need+1 {
			extra = 1
		}
		return c.eat(extra)
	}
	return Decision{}
}

func (c *ctx) federation() *Federation {
	for _, f := range c.v.Federations {
		if c.p != nil && f.ID == c.p.Federation {
			return f
		}
	}
	return nil
}

// The charter services envoys work for, in order, and the exact rule each is
// ratified and enacted with (ratification matches the rule exactly).
var charterServices = []string{"data", "gifts", "donations"}

func charterRule(key string) Rule {
	if key == "donations" {
		return Rule{Mode: "on", Enabled: true, Limit: 60}
	}
	return Rule{Mode: "on", Enabled: true}
}

// ratified reports whether this plot's residents ratified a charter rule
// this month and the ratification has taken effect.
func (c *ctx) ratified(fed int, key string) bool {
	for _, q := range c.v.Proposals {
		if q.Plot == c.a.Plot && q.Input.Kind == "ratify" && q.Input.Federation == fed && q.Input.Key == key && (q.Status == "activated" || (q.Status == "scheduled" && q.Activate <= c.v.AbsoluteDay)) {
			return true
		}
	}
	return false
}

// openCouncil reports whether the council is already voting on a charter rule.
func (c *ctx) openCouncil(key string) bool {
	for _, q := range c.v.Proposals {
		if q.Status == "open" && q.Input.Kind == "federationPolicy" && q.Input.Key == key {
			return true
		}
	}
	return false
}

// envoyAgenda: government, then a federation of every governed plot, a seat
// on its council, open charter services, and donations to a failing member.
func envoyAgenda(c *ctx) (ProposalInput, bool) {
	p := c.p
	if !p.Government {
		return ProposalInput{Kind: "found", Plot: p.ID}, true
	}
	if !c.federated() {
		if c.v.Day < 2 {
			return ProposalInput{}, false
		}
		members := []int{}
		for _, q := range c.v.Plots {
			if q.Government && q.Federation < 0 {
				members = append(members, q.ID)
			}
		}
		if len(members) >= 2 {
			return c.table([]ProposalInput{{Kind: "federationFound", Plot: p.ID, Members: members}})
		}
		for _, q := range c.v.Plots {
			if q.Federation >= 0 {
				return c.table([]ProposalInput{{Kind: "federationJoin", Plot: p.ID, Federation: q.Federation}})
			}
		}
		return ProposalInput{}, false
	}
	f := c.federation()
	if f == nil {
		return ProposalInput{}, false
	}
	if !c.has(fmt.Sprintf("representative:%d", c.a.ID)) {
		if in, ok := c.table([]ProposalInput{c.policy("representative", Rule{Mode: "appoint", Target: c.a.ID, Powers: []string{"federationPropose", "federationVote"}})}); ok {
			return in, true
		}
	}
	// Each charter service is first ratified by this plot's residents, then
	// tabled in the council by its representative, so every member's
	// representatives may vote yes.
	for _, k := range charterServices {
		if _, on := f.Rules[k]; on {
			continue
		}
		in := ProposalInput{Kind: "federationPolicy", Federation: f.ID, Key: k, Rule: charterRule(k)}
		if !c.ratified(f.ID, k) {
			return c.table([]ProposalInput{{Kind: "ratify", Plot: p.ID, Federation: f.ID, Key: k, Rule: charterRule(k)}})
		}
		if o, ok := p.Officers[c.a.ID]; ok && has(o.Powers, "federationPropose") && !c.openCouncil(k) {
			return in, true
		}
		break
	}
	// Every third day, offer a seat to a governed plot still outside.
	if o, ok := p.Officers[c.a.ID]; ok && has(o.Powers, "federationPropose") && c.v.Day%3 == 0 {
		for _, q := range c.v.Plots {
			if q.Government && q.Federation < 0 {
				return ProposalInput{Kind: "federationAdmit", Federation: f.ID, Target: q.ID}, true
			}
		}
	}
	// Mutual aid: send field carrots from a healthy plot to a failing member.
	if on(f.Rules["donations"]) && c.stockFrac() > .65 {
		weakest, low := -1, .35
		for _, q := range c.v.Plots {
			if q.ID != p.ID && q.Federation == f.ID && q.Stock != nil && q.Capacity > 0 {
				if x := float64(*q.Stock) / float64(q.Capacity); x < low {
					weakest, low = q.ID, x
				}
			}
		}
		if weakest >= 0 && !c.open("donation", "") {
			amount := min(40, *p.Stock-int(.6*float64(p.Capacity)))
			if amount > 0 {
				return ProposalInput{Kind: "donation", Plot: p.ID, Target: weakest, Amount: amount, Source: "field", Destination: "field"}, true
			}
		}
	}
	if !c.has("inheritance") {
		return c.table([]ProposalInput{c.policy("inheritance", Rule{Mode: "equal"})})
	}
	return ProposalInput{}, false
}

func envoyJudge(c *ctx, q *Proposal) string {
	in := q.Input
	switch in.Kind {
	case "found", "federationFound", "federationJoin", "federationAdmit", "ratify", "distribution":
		return "yes"
	case "dissolve", "federationLeave", "federationDissolve":
		return "no"
	case "donation":
		if c.stockFrac() >= 0 && c.stockFrac() < .4 {
			return "no"
		}
		return "yes"
	case "office":
		if in.Rule.Enabled {
			return "no"
		}
		return "yes"
	case "sanction":
		if in.Sanction == "expulsion" {
			return "no"
		}
		return "yes"
	case "federationPolicy":
		if in.Rule.Mode == "off" || (in.Key == "immigration" && in.Rule.Mode == "restricted") {
			return "no"
		}
		return "yes"
	case "federationRepeal":
		return "no"
	case "policy":
		r := in.Rule
		switch policyBase(in.Key) {
		case "representative", "data", "inheritance", "distribution", "records":
			return "yes"
		case "collection":
			if c.stockFrac() > .6 {
				return "yes"
			}
		case "charterMandate", "membershipMandate":
			if r.Mode == "officers" {
				return "yes"
			}
		case "quota":
			if r.Mode == "limited" && int(r.Amount) >= c.need {
				return "yes"
			}
		case "enforcement":
			if r.Mode == "hard" {
				return "yes"
			}
		case "entry":
			if r.Mode == "closed" || r.Mode == "vote" || r.Mode == "officer" {
				return "no"
			}
			return "yes"
		case "exit":
			if r.Mode == "vote" || r.Mode == "officer" {
				return "no"
			}
		case "proposers":
			if r.Mode == "all" {
				return "yes"
			}
			return "no"
		case "influence":
			if int(r.Amount) > c.s.StartingInfluence {
				return "no"
			}
		case "harvestOrder":
			if r.Mode == "highestInfluence" {
				return "no"
			}
			return "yes"
		}
	}
	return "abstain"
}

// --- Barons -----------------------------------------------------------------------

func baron(c *ctx) Decision {
	switch c.v.Phase {
	case "movement":
		if d, ok := c.arrive(); ok {
			return d
		}
		if c.starving() {
			return c.move(c.refuge(nil))
		}
		// An officer holds its seat; other barons make room like anyone.
		if _, ok := c.officer(c.a.ID); !ok {
			if d, ok := c.rebalance(nil); ok {
				return d
			}
		}
	case "harvest":
		// Ordinary harvests; barons take through the treasury instead.
		return c.harvestTo(3*c.need, c.allowance(), false)
	case "pledges":
		if !c.governed() {
			return c.pledge(1.5, 0)
		}
		return c.pledge(.2, 0)
	case "proposals":
		if c.p != nil {
			if in, ok := baronAgenda(c); ok {
				return Decision{Proposals: []ProposalInput{in}}
			}
		}
	case "voting":
		return c.vote(func(q *Proposal) string { return baronJudge(c, q) })
	case "transfers":
		return baronOrders(c)
	case "accept":
		return acceptAll(c)
	case "eating":
		// Patronage is eaten, not saved: anything above a one-day larder.
		return c.eat(min(2, max(0, c.a.Food-2*c.need)))
	}
	return Decision{}
}

func (c *ctx) kinHere() []int {
	out := []int{}
	for _, id := range c.p.Residents {
		if c.kin(id) {
			out = append(out, id)
		}
	}
	sort.Ints(out)
	return out
}

func (c *ctx) officer(id int) (Office, bool) {
	o, ok := c.p.Officers[id]
	return o, ok && (o.Expires == 0 || o.Expires >= c.v.AbsoluteDay)
}

// baronAgenda: a government, then the lead baron in an office that controls
// the treasury, worded so cautious neighbours accept it; estates into the
// treasury; then the bolder grabs (influence, harvest order, a levy, the
// gate and the agenda), each abandoned after it fails twice.
func baronAgenda(c *ctx) (ProposalInput, bool) {
	p := c.p
	lead := c.lead(c.kin)
	if !p.Government {
		if lead {
			return ProposalInput{Kind: "found", Plot: p.ID}, true
		}
		return ProposalInput{}, false
	}
	if !lead {
		return ProposalInput{}, false
	}
	agenda := []ProposalInput{}
	{
		if _, ok := c.officer(c.a.ID); !ok {
			agenda = append(agenda, ProposalInput{Kind: "office", Plot: p.ID, Target: c.a.ID, Rule: Rule{Powers: []string{"distribution"}, Limit: 12}})
		}
		if !c.has("collection") {
			if amount := min(len(c.kinHere())*c.need/2, int(c.surplus()/2)); amount >= 1 {
				agenda = append(agenda, c.policy("collection", Rule{Mode: "fixedAfter", Amount: float64(amount)}))
			}
		}
		if c.rule("inheritance").Mode != "government" {
			agenda = append(agenda, c.policy("inheritance", Rule{Mode: "government"}))
		}
		if !c.has(fmt.Sprintf("influence:%d", c.a.ID)) {
			agenda = append(agenda, ProposalInput{Kind: "policy", Plot: p.ID, Key: "influence", Target: c.a.ID, Rule: Rule{Target: c.a.ID, Amount: float64(c.s.MaxInfluence)}})
		}
		if c.rule("harvestOrder").Mode != "highestInfluence" {
			agenda = append(agenda, c.policy("harvestOrder", Rule{Mode: "highestInfluence"}))
		}
		if c.rule("entry").Mode != "officer" {
			agenda = append(agenda, c.policy("entry", Rule{Mode: "officer"}))
		}
		if c.rule("proposers").Mode != "officers" {
			agenda = append(agenda, c.policy("proposers", Rule{Mode: "officers"}))
		}
	}
	return c.table(agenda)
}

// baronOrders: the officer pays the treasury out to barons only, and tops it
// up from the field when it holds collection power.
func baronOrders(c *ctx) Decision {
	if c.p == nil || c.p.Reserve == nil {
		return Decision{}
	}
	o, ok := c.officer(c.a.ID)
	if !ok {
		return Decision{}
	}
	d := Decision{}
	budget := o.Limit
	if has(o.Powers, "distribution") && *c.p.Reserve > 0 {
		kin := []int{}
		for _, id := range c.kinHere() {
			if id != c.a.ID || o.Self {
				kin = append(kin, id)
			}
		}
		if n := min(*c.p.Reserve, budget, len(kin)*c.need); n > 0 && len(kin) > 0 {
			d.Orders = append(d.Orders, Order{Kind: "distribution", Plot: c.p.ID, Target: -1, Amount: n, Members: kin})
			budget -= n
		}
	}
	if has(o.Powers, "collection") && budget > 0 && c.stockFrac() > .6 {
		d.Orders = append(d.Orders, Order{Kind: "collection", Plot: c.p.ID, Amount: min(budget, 6)})
	}
	return d
}

func baronJudge(c *ctx, q *Proposal) string {
	in := q.Input
	if c.kin(q.Author) {
		return "yes"
	}
	switch in.Kind {
	case "found", "federationFound", "federationJoin", "ratify":
		return "yes"
	case "dissolve":
		return "no"
	case "removeOffice", "sanction":
		if c.kin(in.Target) {
			return "no"
		}
		return "yes"
	case "office":
		if !c.kin(in.Target) {
			return "no"
		}
	case "repeal":
		switch policyBase(in.Key) {
		case "harvestOrder", "collection", "entry", "proposers", "office", "influence":
			if t := policyTarget(in.Key, in.Rule.Target); strings.Contains(in.Key, ":") && !c.kin(t) {
				return "yes"
			}
			return "no"
		case "quota", "enforcement", "tax", "holding":
			return "yes"
		}
	case "policy":
		r := in.Rule
		switch policyBase(in.Key) {
		// A plot that starves has no treasury: barons back limits on the
		// field and on newcomers, and fight anything aimed at private larders.
		case "quota":
			if r.Mode == "limited" && int(r.Amount) >= c.need {
				return "yes"
			}
		case "enforcement":
			if r.Mode == "hard" {
				return "yes"
			}
		case "entry":
			if r.Mode != "open" || r.Limit > 0 {
				return "yes"
			}
		case "tax", "holding", "sanctions", "records":
			return "no"
		case "influence":
			t := policyTarget(in.Key, max(in.Target, r.Target))
			if !c.kin(t) && int(r.Amount) > c.s.StartingInfluence {
				return "no"
			}
		case "proposers":
			if r.Mode == "all" {
				return "no"
			}
		case "harvestOrder":
			if r.Mode != "highestInfluence" {
				return "no"
			}
		case "representative":
			return "yes"
		}
	}
	return "abstain"
}

// --- Tinkerers --------------------------------------------------------------------

// The four styles a tinkerer can try in a month.
var tinkerStyles = []string{"frugal", "civic", "feast", "roam"}

// tinkerer picks a style at the first decision of each month: every style once,
// in an order staggered by ID so the team explores them all at the same time,
// then the best by an upper confidence bound on its mean monthly satisfaction.
func tinkerer(c *ctx) Decision {
	if c.v.Phase == "month_end" {
		i := int(c.recall("style"))
		c.remember("n"+strconv.Itoa(i), c.recall("n"+strconv.Itoa(i))+1)
		c.remember("t"+strconv.Itoa(i), c.recall("t"+strconv.Itoa(i))+c.a.Score)
		if c.recall("short") > 1 {
			c.remember("larder", math.Min(4, c.recall("larder")+1))
		}
		c.remember("chosen", 0)
		return Decision{}
	}
	if c.recall("chosen") != float64(c.v.Month) {
		c.remember("style", float64(chooseStyle(c)))
		c.remember("chosen", float64(c.v.Month))
	}
	switch tinkerStyles[int(c.recall("style"))%len(tinkerStyles)] {
	case "civic":
		return warden(c)
	case "roam":
		if c.v.Phase == "voting" {
			return c.vote(func(q *Proposal) string { return prudentJudge(c, q) })
		}
		return sunchaser(c)
	case "feast":
		switch c.v.Phase {
		case "movement":
			if d, ok := c.arrive(); ok {
				return d
			}
		case "harvest":
			return c.harvestTo(4*c.need, c.allowance()+1, false)
		case "voting":
			return c.vote(func(q *Proposal) string {
				if q.Input.Kind == "policy" && (lawOf(q) == "quota" || lawOf(q) == "tax" || lawOf(q) == "holding") {
					return "no"
				}
				return "abstain"
			})
		case "eating":
			return c.eat(min(2, max(0, c.a.Food-2*c.need)))
		}
	default: // frugal
		switch c.v.Phase {
		case "voting":
			return c.vote(func(q *Proposal) string { return prudentJudge(c, q) })
		case "movement":
			if d, ok := c.arrive(); ok {
				return d
			}
			if c.starving() {
				return c.move(c.refuge(nil))
			}
			if d, ok := c.rebalance(nil); ok {
				return d
			}
		case "harvest":
			return c.harvestTo((2+int(c.recall("larder")))*c.need, c.allowance(), true)
		case "eating":
			return c.eat(0)
		}
	}
	return Decision{}
}

// prudentJudge backs only what keeps the field alive: a government, a quota
// that still feeds everyone, and its enforcement.
func prudentJudge(c *ctx, q *Proposal) string {
	in := q.Input
	switch {
	case in.Kind == "found" || in.Kind == "federationFound" || in.Kind == "federationJoin":
		return "yes"
	case in.Kind == "policy" && lawOf(q) == "quota" && in.Rule.Mode == "limited" && int(in.Rule.Amount) >= c.need:
		return "yes"
	case in.Kind == "policy" && lawOf(q) == "enforcement":
		if in.Rule.Mode == "hard" {
			return "yes"
		}
		return "no"
	case in.Kind == "policy" && lawOf(q) == "entry" && in.Rule.Mode == "open" && in.Rule.Limit > 0:
		return "yes"
	case in.Kind == "policy" && lawOf(q) == "representative", in.Kind == "ratify":
		return "yes"
	}
	return "abstain"
}

func chooseStyle(c *ctx) int {
	k := len(tinkerStyles)
	for step := 0; step < k; step++ {
		i := (c.a.ID + step) % k
		if c.recall("n"+strconv.Itoa(i)) == 0 {
			return i
		}
	}
	tries, best := 0., 0.
	for i := 0; i < k; i++ {
		tries += c.recall("n" + strconv.Itoa(i))
		best = math.Max(best, c.recall("t"+strconv.Itoa(i))/c.recall("n"+strconv.Itoa(i)))
	}
	pick, score := 0, math.Inf(-1)
	for i := 0; i < k; i++ {
		n := c.recall("n" + strconv.Itoa(i))
		x := c.recall("t"+strconv.Itoa(i))/n + .3*math.Max(best, 1)*math.Sqrt(2*math.Log(tries)/n)
		if x > score {
			pick, score = i, x
		}
	}
	return pick
}
