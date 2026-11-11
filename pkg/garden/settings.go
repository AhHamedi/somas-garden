package garden

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"unicode/utf8"
)

const MaxSeats = 6
const MaxRounds = 50

type DailyRange struct {
	Mode     string `json:"mode"`
	Value    int    `json:"value"`
	Min      int    `json:"min"`
	Max      int    `json:"max"`
	PerAgent bool   `json:"perAgent"`
}

type PriceRule struct {
	DailyRange
	Empty int `json:"empty"`
	Full  int `json:"full"`
}

type Settings struct {
	RoundLimit      int        `json:"roundLimit"`
	Sunlight        DailyRange `json:"sunlight"`
	EnergyCapacity  int        `json:"energyCapacity"`
	DailyFood       int        `json:"dailyFood"`
	CarryFood       bool       `json:"carryFood"`
	StartingPantry  int        `json:"startingPantry"`
	FieldCapacity   int        `json:"fieldCapacity"`
	StartingField   int        `json:"startingField"`
	PlantingMinimum int        `json:"plantingMinimum"`
	Price           PriceRule  `json:"price"`
}

// Partial JSON settings inherit garden defaults. Explicit zero is meaningful.
func (s *Settings) UnmarshalJSON(data []byte) error {
	type wire Settings
	cfg := wire(DefaultSettings())
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&cfg); err != nil {
		return err
	}
	*s = Settings(cfg)
	return nil
}

func DefaultSettings() Settings {
	return Settings{
		RoundLimit: Rounds,
		Sunlight:   DailyRange{Mode: "fixed", Value: 6, Min: 0, Max: 6}, EnergyCapacity: 6,
		DailyFood: 1, StartingField: 60, FieldCapacity: 60,
		Price: PriceRule{DailyRange: DailyRange{Mode: "fixed", Value: 2, Min: 1, Max: 3}, Empty: 3, Full: 1},
	}
}

func between(n, low, high int) bool { return n >= low && n <= high }

func (r DailyRange) validate(label string, low, high int, density bool) error {
	switch r.Mode {
	case "fixed":
		if between(r.Value, low, high) {
			return nil
		}
	case "random":
		if between(r.Min, low, high) && between(r.Max, r.Min, high) {
			return nil
		}
	case "density":
		if density {
			return nil
		}
	}
	return fmt.Errorf("invalid %s rule", label)
}

func (s Settings) Validate() error {
	if !between(s.RoundLimit, 1, MaxRounds) {
		return fmt.Errorf("choose a run length between 1 and %d days", MaxRounds)
	}
	if !between(s.EnergyCapacity, 0, 24) || !between(s.DailyFood, 0, 10) || !between(s.StartingPantry, 0, 60) {
		return errors.New("garden energy or pantry settings are out of range")
	}
	if !between(s.FieldCapacity, 1, 120) || !between(s.StartingField, 0, s.FieldCapacity) || !between(s.PlantingMinimum, 0, s.FieldCapacity) {
		return errors.New("starting field and planting minimum must fit the field capacity")
	}
	if err := s.Sunlight.validate("sunlight", 0, 24, false); err != nil {
		return err
	}
	if err := s.Price.validate("price", 1, 12, true); err != nil {
		return err
	}
	if s.Price.Mode == "density" && (!between(s.Price.Empty, 1, 12) || !between(s.Price.Full, 1, 12)) {
		return errors.New("empty and full field prices must be between 1 and 12")
	}
	return nil
}

func (r Request) Validate() error {
	if len(r.Slots) > MaxSeats || (r.Settings != nil && len(r.Slots) == 0) {
		return errors.New("choose between one and six amoeboids")
	}
	if r.Settings != nil {
		if err := r.Settings.Validate(); err != nil {
			return err
		}
	}
	for _, slot := range r.Slots {
		if utf8.RuneCountInString(slot.Name) > 40 || len(slot.ID) > 64 {
			return errors.New("amoeboid name or ID is too long")
		}
		if utf8.RuneCountInString(slot.PublicStrategyName) > 40 {
			return errors.New("published strategy name is too long")
		}
		if slot.Appearance != nil && !between(*slot.Appearance, 0, 5) {
			return errors.New("unknown amoeboid portrait")
		}
		if slot.StartingPantry != nil && !between(*slot.StartingPantry, 0, 60) {
			return errors.New("starting pantry must be between 0 and 60")
		}
		if slot.Builder != nil {
			if err := slot.Builder.Validate(); err != nil {
				return err
			}
		}
	}
	return nil
}

func (r DailyRange) draw(rng *rand.Rand) int {
	if r.Mode == "random" {
		return r.Min + rng.Intn(r.Max-r.Min+1)
	}
	return r.Value
}

func (r PriceRule) quote(stock, capacity, daily int) int {
	if r.Mode == "density" {
		// Interpolate exact integers, rounding ties up for either slope.
		return (2*(r.Empty*(capacity-stock)+r.Full*stock) + capacity) / (2 * capacity)
	}
	return daily
}
