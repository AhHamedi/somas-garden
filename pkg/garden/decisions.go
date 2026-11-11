package garden

import (
	"context"
	"strconv"
)

// StrategyDescription contains only public identity and type. The controller
// supplies Name only for published library entries. Draft rules and Go runner
// credentials belong to the input slot and never travel with the replay.
type StrategyDescription struct {
	Kind   string `json:"kind"`
	Name   string `json:"name,omitempty"`
	Policy string `json:"policy,omitempty"`
	Mode   string `json:"mode,omitempty"`
}

func (s Slot) strategyDescription() StrategyDescription {
	if s.Builder != nil {
		return StrategyDescription{Kind: "builder", Mode: s.Builder.Mode, Name: s.PublicStrategyName}
	}
	if s.URL != "" || s.Policy == "failed" || s.Error != "" {
		return StrategyDescription{Kind: "go", Name: s.PublicStrategyName}
	}
	switch s.Policy {
	case "greedy", "random":
		return StrategyDescription{Kind: "builtin", Policy: s.Policy}
	default:
		return StrategyDescription{Kind: "builtin", Policy: "cooperate"}
	}
}

// Go agents can return integers that JavaScript cannot represent exactly.
// Keep normal quantities numeric and transport only those extremes as strings.
type recordedAmount int

func (n recordedAmount) MarshalJSON() ([]byte, error) {
	const maxSafe = 1<<53 - 1
	digits := strconv.Itoa(int(n))
	if int64(n) < -maxSafe || int64(n) > maxSafe {
		digits = strconv.Quote(digits)
	}
	return []byte(digits), nil
}

func (n *recordedAmount) UnmarshalJSON(data []byte) error {
	if len(data) >= 2 && data[0] == '"' && data[len(data)-1] == '"' {
		data = data[1 : len(data)-1]
	}
	value, err := strconv.Atoi(string(data))
	if err == nil {
		*n = recordedAmount(value)
	}
	return err
}

type ReturnedAction struct {
	FoodRequested recordedAmount `json:"foodRequested"`
	EnergyOffered recordedAmount `json:"energyOffered"`
}

type DecisionRecord struct {
	Actor  int    `json:"actor"`
	Status string `json:"status"`
	*ReturnedAction
	MatchedRule  *int `json:"matchedRule,omitempty"`
	MemoryBefore *int `json:"memoryBefore,omitempty"`
	MemoryAfter  *int `json:"memoryAfter,omitempty"`
}

type seatChoice struct {
	action Action
	issue  string
	record DecisionRecord
}

func decide(ctx context.Context, p *person, v View) seatChoice {
	var choice seatChoice
	if b := p.slot.Builder; b != nil {
		before := p.memory
		d := b.Decide(v, before)
		p.memory = d.Memory
		choice.action = d.Action
		if b.Mode != "simple" {
			choice.record.MatchedRule = &d.MatchedRule
		}
		if b.Mode == "memory" {
			choice.record.MemoryBefore = &before
			choice.record.MemoryAfter = &d.Memory
		}
	} else {
		choice.action, choice.issue = runPolicy(ctx, p, v)
	}
	if choice.issue != "" {
		choice.record.Status = "failed"
		return choice
	}
	choice.record.Status = "ok"
	choice.record.ReturnedAction = &ReturnedAction{recordedAmount(choice.action.Food), recordedAmount(choice.action.Energy)}
	return choice
}
