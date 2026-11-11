package garden

import (
	"encoding/json"
	"errors"
	"fmt"
	"go/format"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Amount is a literal integer or a supported resource choice ("supper", "all").
type Amount string

func (a *Amount) UnmarshalJSON(b []byte) error {
	var s string
	if len(b) > 0 && b[0] == '"' {
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		if s != "all" && s != "supper" {
			return errors.New("unknown amount choice")
		}
	} else {
		var n int
		if string(b) == "null" || json.Unmarshal(b, &n) != nil {
			return errors.New("amount must be a whole number or resource choice")
		}
		s = strconv.Itoa(n)
	}
	*a = Amount(s)
	return nil
}

func (a Amount) MarshalJSON() ([]byte, error) {
	if n, err := strconv.Atoi(string(a)); err == nil {
		return json.Marshal(n)
	}
	return json.Marshal(string(a))
}

type MemoryChange struct {
	Op    string `json:"op"`
	Value int    `json:"value"`
}
type ActionSpec struct {
	Food   Amount        `json:"food"`
	Energy Amount        `json:"energy"`
	Memory *MemoryChange `json:"memory,omitempty"`
}
type Rule struct {
	Fact   string     `json:"fact"`
	Op     string     `json:"op"`
	Value  int        `json:"value"`
	Action ActionSpec `json:"action"`
}
type Builder struct {
	Mode       string     `json:"mode"`
	MemoryName string     `json:"memoryName,omitempty"`
	Rules      []Rule     `json:"rules,omitempty"`
	Fallback   ActionSpec `json:"fallback"`
}

type fact struct {
	code    string
	read    func(View, int) int
	history bool
}

var facts = map[string]fact{
	"field":       {"v.PatchFood", func(v View, _ int) int { return v.PatchFood }, false},
	"perAgent":    {"v.PatchFood / max(1, v.AgentCount)", func(v View, _ int) int { return v.PatchFood / max(1, v.AgentCount) }, false},
	"pantry":      {"v.Pantry", func(v View, _ int) int { return v.Pantry }, false},
	"energy":      {"v.Energy", func(v View, _ int) int { return v.Energy }, false},
	"price":       {"v.Price", func(v View, _ int) int { return v.Price }, false},
	"day":         {"v.Round", func(v View, _ int) int { return v.Round }, false},
	"lastFood":    {"v.LastFood", func(v View, _ int) int { return v.LastFood }, true},
	"lastEnergy":  {"v.LastEnergy", func(v View, _ int) int { return v.LastEnergy }, true},
	"lastEaten":   {"v.LastEaten", func(v View, _ int) int { return v.LastEaten }, true},
	"totalFood":   {"v.TotalFood", func(v View, _ int) int { return v.TotalFood }, true},
	"totalEnergy": {"v.TotalEnergy", func(v View, _ int) int { return v.TotalEnergy }, true},
	"totalEaten":  {"v.TotalEaten", func(v View, _ int) int { return v.TotalEaten }, true},
	"memory":      {"memory", func(_ View, m int) int { return m }, true},
}
var comparisons = map[string]string{"lt": "<", "lte": "<=", "eq": "==", "gte": ">=", "gt": ">"}

func (a Amount) valid(high int, food bool) bool {
	if a == "all" || (a == "supper" && food) {
		return true
	}
	n, err := strconv.Atoi(string(a))
	return err == nil && between(n, 0, high)
}
func (a ActionSpec) validate(mode string) error {
	if !a.Food.valid(10, true) || !a.Energy.valid(24, false) {
		return errors.New("choose a valid food request and energy offer")
	}
	if m := a.Memory; m != nil && (mode != "memory" || (m.Op != "set" && m.Op != "add") || !between(m.Value, -10000, 10000)) {
		return errors.New("invalid memory update")
	}
	return nil
}
func (b Builder) Validate() error {
	if b.Mode != "simple" && b.Mode != "adaptive" && b.Mode != "memory" {
		return errors.New("unknown agent mode")
	}
	if len(b.Rules) > 4 || (b.Mode == "simple" && len(b.Rules) > 0) {
		return errors.New("choose up to four rules in adaptive or memory mode")
	}
	// MemoryName is only a UI label, never incorporated into executable code.
	if utf8.RuneCountInString(b.MemoryName) > 40 || strings.IndexFunc(b.MemoryName, unicode.IsControl) >= 0 {
		return errors.New("invalid memory name")
	}
	for _, r := range b.Rules {
		f, ok := facts[r.Fact]
		if !ok || (f.history && b.Mode != "memory") || comparisons[r.Op] == "" || !between(r.Value, -1000000, 1000000) {
			return errors.New("invalid builder condition")
		}
		if err := r.Action.validate(b.Mode); err != nil {
			return err
		}
	}
	return b.Fallback.validate(b.Mode)
}
func matches(left, right int, op string) bool {
	switch op {
	case "lt":
		return left < right
	case "lte":
		return left <= right
	case "eq":
		return left == right
	case "gte":
		return left >= right
	case "gt":
		return left > right
	}
	return false
}
func (a Amount) resolve(v View, food bool) (int, string) {
	switch a {
	case "supper":
		return max(0, v.DailyFood-v.Pantry), "max(0, v.DailyFood - v.Pantry)"
	case "all":
		if food {
			return 10, "10"
		}
		return v.Energy, "v.Energy"
	default:
		n, _ := strconv.Atoi(string(a))
		return n, strconv.Itoa(n)
	}
}

type Decision struct {
	Action      Action `json:"action"`
	MatchedRule int    `json:"matchedRule"`
	Memory      int    `json:"memory"`
}

func (b Builder) Decide(v View, memory int) Decision {
	a, idx := b.Fallback, -1
	for i, r := range b.Rules {
		if matches(facts[r.Fact].read(v, memory), r.Value, r.Op) {
			a, idx = r.Action, i
			break
		}
	}
	food, _ := a.Food.resolve(v, true)
	energy, _ := a.Energy.resolve(v, false)
	if m := a.Memory; m != nil {
		if m.Op == "add" {
			memory += m.Value
		} else {
			memory = m.Value
		}
	}
	return Decision{Action: Action{food, energy}, MatchedRule: idx, Memory: memory}
}
func writeAction(buf *strings.Builder, a ActionSpec) {
	if m := a.Memory; m != nil {
		op := "="
		if m.Op == "add" {
			op = "+="
		}
		fmt.Fprintf(buf, "memory %s %d\n", op, m.Value)
	}
	_, food := a.Food.resolve(View{}, true)
	_, energy := a.Energy.resolve(View{}, false)
	fmt.Fprintf(buf, "return Action{Food: %s, Energy: %s}\n", food, energy)
}
func (b Builder) GoSource() (string, error) {
	if err := b.Validate(); err != nil {
		return "", err
	}
	var buf strings.Builder
	buf.WriteString("// somas:api=2\npackage main\n\n")
	if b.Mode == "memory" {
		buf.WriteString("// Private to this amoeboid for the duration of a game.\nvar memory int\n\n")
	}
	buf.WriteString("func Decide(v View) Action {\n")
	for _, r := range b.Rules {
		fmt.Fprintf(&buf, "if %s %s %d {\n", facts[r.Fact].code, comparisons[r.Op], r.Value)
		writeAction(&buf, r.Action)
		buf.WriteString("}\n")
	}
	writeAction(&buf, b.Fallback)
	buf.WriteString("}\n")
	src, err := format.Source([]byte(buf.String()))
	return string(src), err
}
