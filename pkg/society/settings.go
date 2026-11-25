package society

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
)

func DefaultSettings() Settings {
	return Settings{
		Plots: 6, Copies: 50, Days: 30, Months: 12,
		CapacityPerAgent: 10, StartingStock: .8, DailyGrowthPercent: 40, OvereatingReward: 1, ThinkingReward: 1,
		DailyFood: 2, BodyCapacity: 2, MindCapacity: 12, StartingMind: 6,
		PersonalCapacity: 12, RepresentativeCapacity: 60,
		WeatherRates: []float64{12, 8, 4}, WeatherPersistence: .6, BlightChance: .04, BumperChance: .04,
		VotingTokens: 6, RuleThreshold: "tokens", RuleFraction: .5,
		VoteCost: 1, ProposalCost: 1, JusticeCost: .2, GovernmentCost: 10,
		DecisionMS: 100, MemoryBytes: 1 << 20,
	}
}
func (s *Settings) UnmarshalJSON(b []byte) error {
	type raw Settings
	x := raw(DefaultSettings())
	// Saved configurations and replay frames may contain retired v5 settings.
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(b, &fields); err != nil {
		return err
	}
	if cost, ok := fields["officerCost"]; ok && fields["justiceCost"] == nil {
		fields["justiceCost"] = cost
	}
	for _, k := range []string{"officerCost", "foundingWindow", "harvestLimit", "reservePerResident", "outsideMind", "respawnDelay", "startingInfluence", "maxInfluence", "readCost", "offerCost", "federationCost", "joiningCost", "enforcementCost", "recordsCost", "federationRunningCost", "disputeWindow", "immigrationLookback"} {
		delete(fields, k)
	}
	b, err := json.Marshal(fields)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(b))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&x); err != nil {
		return err
	}
	*s = Settings(x)
	return nil
}
func (s Settings) Validate(teams int) error {
	return s.validatePopulation(teams, teams*s.Copies)
}

func (s Settings) validatePopulation(teams, population int) error {
	if teams < 1 || teams > 24 || s.Copies < 1 || s.Copies > 500 || s.Plots < 1 || s.Plots > 48 || s.Days < 1 || s.Days > 365 || s.Months < 1 || s.Months > 24 {
		return fmt.Errorf("choose 1–24 teams, 1–500 copies, 1–48 plots, 1–365 days and 1–24 months")
	}
	if population > 3000 || s.Days*s.Months > 8760 {
		return fmt.Errorf("run exceeds 3000 individuals or 8760 days")
	}
	if s.CapacityPerAgent < 1 || s.CapacityPerAgent > 1000 || s.Plots > population*s.CapacityPerAgent || s.PersonalCapacity < 1 || s.PersonalCapacity > 10000 || s.RepresentativeCapacity <= s.PersonalCapacity || s.RepresentativeCapacity > 100000 {
		return fmt.Errorf("invalid storage or harvest capacity")
	}
	vals := []float64{s.StartingStock, s.Growth, s.ProductiveCapacity, s.OvereatingReward, s.ThinkingReward, s.BodyCapacity, s.MindCapacity, s.StartingMind, s.WeatherPersistence, s.BlightChance, s.BumperChance, s.RuleFraction, s.VoteCost, s.ProposalCost, s.JusticeCost, s.GovernmentCost}
	for _, v := range vals {
		if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 100000 {
			return fmt.Errorf("settings must be finite nonnegative numbers")
		}
	}
	if s.StartingStock > 1 || s.WeatherPersistence > 1 || s.BodyCapacity <= 0 || s.DailyGrowthPercent < 0 || s.DailyGrowthPercent > 100 || s.OvereatingReward > 100 || s.ThinkingReward > 100 || s.StartingMind > s.MindCapacity || s.DailyFood < 0 || s.DailyFood > 1000 || s.BlightChance+s.BumperChance > 1 || len(s.WeatherRates) != 3 {
		return fmt.Errorf("invalid physical settings")
	}
	for _, v := range s.WeatherRates {
		if v < 0 || v > 10000 || math.IsNaN(v) || math.IsInf(v, 0) {
			return fmt.Errorf("invalid weather rates")
		}
	}
	if s.VotingTokens < 1 || s.VotingTokens > 10000 || (s.RuleThreshold != "voters" && s.RuleThreshold != "tokens") || s.RuleFraction <= 0 || s.RuleFraction > 1 || s.DecisionMS < 1 || s.DecisionMS > 10000 || s.MemoryBytes < 1 || s.MemoryBytes > 16<<20 {
		return fmt.Errorf("invalid political or agent settings")
	}
	return nil
}
func DefaultTeams() []Team {
	colors := []string{"#547b61", "#7e79b2", "#c28b4c", "#5b9da6", "#b47072", "#a39a3b"}
	teams := []Team{}
	// The original six teams form the default experiment. The other presets are opt-in.
	for i, p := range Presets()[:len(colors)] {
		teams = append(teams, Team{Name: p.Name, Policy: p.Policy, Color: colors[i]})
	}
	return teams
}

// A size of zero follows the world default, including in older saves.
func (t Team) size(defaultSize int) int {
	if t.Copies == 0 {
		return defaultSize
	}
	return t.Copies
}

func (s Settings) rosterSize(teams []Team) (int, error) {
	total := 0
	for _, team := range teams {
		if team.Copies < 0 || team.Copies > 500 {
			return 0, fmt.Errorf("team size must be between 1 and 500")
		}
		total += team.size(s.Copies)
	}
	return total, s.validatePopulation(len(teams), total)
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
	if b.VoteTokens < 0 || b.Harvest < 0 || b.Eat < 0 || !finite(b.Think) || b.Think < -1 || !finite(b.KeepMind) || b.KeepMind < 0 || !finite(b.Pledge) || b.Pledge < 0 {
		return fmt.Errorf("builder amounts must be nonnegative; thinking may use -1 for all available mind")
	}
	if b.Vote != "" && b.Vote != "yes" && b.Vote != "no" && b.Vote != "abstain" {
		return fmt.Errorf("builder vote must be yes, no or abstain")
	}
	for _, r := range b.Rules {
		if !has([]string{"placement", "harvest_order", "harvest", "pledges", "records", "record_pages", "proposals", "voting", "transfers", "eating", "close", "month_end"}, r.Phase) {
			return fmt.Errorf("unknown builder phase %q", r.Phase)
		}
		if !has([]string{"always", "eq", "neq", "lt", "lte", "gt", "gte"}, r.Op) {
			return fmt.Errorf("unknown builder comparison %q", r.Op)
		}
		if r.Op != "always" && !has([]string{"food", "mind", "body", "score", "day", "month", "plot", "exclusions", "stock", "population", "government", "votingWeight", "votingTokens"}, r.Field) {
			return fmt.Errorf("unknown builder observation %q", r.Field)
		}
		if !finite(r.Value) || r.Action.Harvest < 0 || r.Action.Eat < 0 || !finite(r.Action.Think) || r.Action.Think < -1 || r.Action.Donate < 0 || (r.Action.Gift != nil && r.Action.Gift.Amount < 0) {
			return fmt.Errorf("invalid builder action amount")
		}
		if r.Action.PlotChoice != nil && (*r.Action.PlotChoice < 0 || *r.Action.PlotChoice >= s.Plots) {
			return fmt.Errorf("builder placement plot does not exist")
		}
		for k, v := range r.Action.Pledge {
			if k != "local" || !finite(v) || v < 0 {
				return fmt.Errorf("invalid builder pledge")
			}
		}
		if len(r.Action.Memory) > s.MemoryBytes || (len(r.Action.Memory) > 0 && !json.Valid(r.Action.Memory)) {
			return fmt.Errorf("invalid builder memory")
		}
	}
	return nil
}
