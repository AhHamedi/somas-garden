package society

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
)

func DefaultSettings() Settings {
	return Settings{Plots: 6, Copies: 50, Days: 30, Months: 12, CapacityPerAgent: 10, StartingStock: .8, Growth: 4, ProductiveCapacity: 10, DailyFood: 2, BodyCapacity: 2, MindCapacity: 12, StartingMind: 6, PersonalCapacity: 12, HarvestLimit: 4, ReservePerResident: 10, WeatherRates: []float64{12, 8, 4}, WeatherPersistence: .6, OutsideMind: 4, RespawnDelay: -1, StartingInfluence: 1, MaxInfluence: 5, ProposalCost: 1, VoteCost: .1, OfficerCost: .2, ReadCost: .2, OfferCost: .1, GovernmentCost: 10, FederationCost: 50, JoiningCost: 10, EnforcementCost: .04, RecordsCost: .04, FederationRunningCost: .5, FoundingWindow: 5, DisputeWindow: 5, ImmigrationLookback: 10, DecisionMS: 100, MemoryBytes: 1 << 20}
}
func (s *Settings) UnmarshalJSON(b []byte) error {
	type raw Settings
	x := raw(DefaultSettings())
	decoder := json.NewDecoder(bytes.NewReader(b))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&x); err != nil {
		return err
	}
	*s = Settings(x)
	return nil
}
func (s Settings) Validate(teams int) error {
	if teams < 1 || teams > 24 || s.Copies < 1 || s.Copies > 500 || s.Plots < 1 || s.Plots > 48 || s.Days < 1 || s.Days > 365 || s.Months < 1 || s.Months > 24 {
		return fmt.Errorf("choose 1–24 teams, 1–500 copies, 1–48 plots, 1–365 days and 1–24 months")
	}
	if teams*s.Copies > 3000 || s.Days*s.Months > 8760 {
		return fmt.Errorf("run exceeds 3000 individuals or 8760 days")
	}
	if s.CapacityPerAgent < 1 || s.CapacityPerAgent > 1000 || s.Plots > teams*s.Copies*s.CapacityPerAgent || s.PersonalCapacity < 1 || s.PersonalCapacity > 10000 || s.HarvestLimit < 0 || s.HarvestLimit > 1000 || s.ReservePerResident < 0 || s.ReservePerResident > 10000 {
		return fmt.Errorf("invalid storage or harvest capacity")
	}
	vals := []float64{s.StartingStock, s.Growth, s.ProductiveCapacity, s.BodyCapacity, s.MindCapacity, s.StartingMind, s.WeatherPersistence, s.OutsideMind, s.ProposalCost, s.VoteCost, s.OfficerCost, s.ReadCost, s.OfferCost, s.GovernmentCost, s.FederationCost, s.JoiningCost, s.EnforcementCost, s.RecordsCost, s.FederationRunningCost}
	for _, v := range vals {
		if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 100000 {
			return fmt.Errorf("settings must be finite nonnegative numbers")
		}
	}
	if s.StartingStock > 1 || s.WeatherPersistence > 1 || s.BodyCapacity <= 0 || s.ProductiveCapacity <= 0 || s.StartingMind > s.MindCapacity || s.DailyFood < 0 || s.DailyFood > 1000 || s.RespawnDelay < -1 || s.RespawnDelay > 365 || len(s.WeatherRates) != 3 {
		return fmt.Errorf("invalid physical settings")
	}
	for _, v := range s.WeatherRates {
		if v < 0 || v > 10000 || math.IsNaN(v) || math.IsInf(v, 0) {
			return fmt.Errorf("invalid weather rates")
		}
	}
	if s.StartingInfluence < 1 || s.MaxInfluence < s.StartingInfluence || s.MaxInfluence > 100 || s.FoundingWindow < 1 || s.DisputeWindow < 1 || s.ImmigrationLookback < 0 || s.DecisionMS < 1 || s.DecisionMS > 10000 || s.MemoryBytes < 1 || s.MemoryBytes > 16<<20 {
		return fmt.Errorf("invalid political or agent settings")
	}
	return nil
}
func DefaultTeams() []Team {
	colors := []string{"#547b61", "#7e79b2", "#c28b4c", "#5b9da6", "#b47072", "#a39a3b"}
	teams := []Team{}
	for i, p := range Presets() {
		teams = append(teams, Team{Name: p.Name, Policy: p.Policy, Color: colors[i%len(colors)]})
	}
	return teams
}

func (s Settings) validateTeam(t Team) error {
	b := t.Builder
	if t.Policy == "builder" && b == nil {
		return fmt.Errorf("builder behaviour requires a builder configuration")
	}
	if t.StrategyID == "" && !knownPolicy(t.Policy) && t.Policy != "builder" {
		return fmt.Errorf("unknown behaviour %q", t.Policy)
	}
	if b == nil {
		return nil
	}
	if b.Fallback != "" && !knownPolicy(b.Fallback) {
		return fmt.Errorf("unknown builder fallback %q", b.Fallback)
	}
	finite := func(x float64) bool { return !math.IsNaN(x) && !math.IsInf(x, 0) }
	if b.Harvest < 0 || b.Eat < 0 || !finite(b.Think) || b.Think < -1 || !finite(b.KeepMind) || b.KeepMind < 0 || !finite(b.Pledge) || b.Pledge < 0 {
		return fmt.Errorf("builder amounts must be nonnegative; thinking may use -1 for all available mind")
	}
	if b.Vote != "" && b.Vote != "yes" && b.Vote != "no" && b.Vote != "abstain" {
		return fmt.Errorf("builder vote must be yes, no or abstain")
	}
	for _, r := range b.Rules {
		if !has([]string{"movement", "harvest", "pledges", "records", "record_pages", "proposals", "voting", "transfers", "accept", "eating", "close", "month_end"}, r.Phase) {
			return fmt.Errorf("unknown builder phase %q", r.Phase)
		}
		if !has([]string{"always", "eq", "neq", "lt", "lte", "gt", "gte"}, r.Op) {
			return fmt.Errorf("unknown builder comparison %q", r.Op)
		}
		if r.Op != "always" && !has([]string{"food", "mind", "body", "score", "day", "month", "plot", "deaths", "stock", "population", "government", "influence"}, r.Field) {
			return fmt.Errorf("unknown builder observation %q", r.Field)
		}
		if !finite(r.Value) || r.Action.Harvest < 0 || r.Action.Eat < 0 || !finite(r.Action.Think) || r.Action.Think < -1 || r.Action.Deposit < 0 {
			return fmt.Errorf("invalid builder action amount")
		}
		if r.Action.Move != nil && (*r.Action.Move < -1 || *r.Action.Move >= s.Plots) {
			return fmt.Errorf("builder move target does not exist")
		}
		for k, v := range r.Action.Pledge {
			if (k != "local" && k != "federation") || !finite(v) || v < 0 {
				return fmt.Errorf("invalid builder pledge")
			}
		}
		if len(r.Action.Memory) > s.MemoryBytes || (len(r.Action.Memory) > 0 && !json.Valid(r.Action.Memory)) {
			return fmt.Errorf("invalid builder memory")
		}
	}
	return nil
}
