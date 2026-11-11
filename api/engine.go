package handler

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"selforg-garden/pkg/garden"
	"time"
)

func readRequest(w http.ResponseWriter, r *http.Request, dest any) error {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 30000))
	if err != nil {
		return errors.New("garden request is too large")
	}
	// Optional settings use omission for defaults. Go otherwise silently
	// accepts null into integers, even when it would change the requested rule.
	if bytes.Contains(body, []byte("null")) {
		scanner := json.NewDecoder(bytes.NewReader(body))
		for {
			token, err := scanner.Token()
			if err == io.EOF {
				break
			}
			if err != nil || token == nil {
				return errors.New("garden values must be supplied or omitted")
			}
		}
	}
	d := json.NewDecoder(bytes.NewReader(body))
	d.DisallowUnknownFields()
	if err := d.Decode(dest); err != nil {
		return errors.New("invalid garden request")
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return errors.New("expected one garden request")
	}
	return nil
}

func builderPreview(w http.ResponseWriter, r *http.Request) {
	input := struct {
		Builder garden.Builder `json:"builder"`
		View    garden.View    `json:"view"`
		Memory  int            `json:"memory"`
	}{View: garden.View{Round: 1, PatchFood: 60, AgentCount: 6, Energy: 6, Price: 2, DailyFood: 1, FieldCapacity: 60, EnergyCapacity: 6, Sunlight: 6}}
	if err := readRequest(w, r, &input); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	if input.Memory < -1000000 || input.Memory > 1000000 {
		http.Error(w, "invalid sample memory", 400)
		return
	}
	v := input.View
	if v.Round < 1 || v.Round > garden.MaxRounds || v.AgentCount < 1 || v.AgentCount > garden.MaxSeats ||
		v.PatchFood < 0 || v.PatchFood > 120 || v.Energy < 0 || v.Energy > 24 || v.Pantry < 0 || v.Pantry > 60+10*garden.MaxRounds ||
		v.DailyFood < 0 || v.DailyFood > 10 || v.Price < 1 || v.Price > 12 || v.LastFood < 0 || v.LastFood > 10 ||
		v.LastEnergy < 0 || v.LastEnergy > 24 || v.LastEaten < 0 || v.LastEaten > 10 || v.TotalFood < 0 || v.TotalFood > 10*garden.MaxRounds ||
		v.TotalEnergy < 0 || v.TotalEnergy > 24*garden.MaxRounds || v.TotalEaten < 0 || v.TotalEaten > 10*garden.MaxRounds {
		http.Error(w, "sample day values are outside the garden's range", 400)
		return
	}
	source, err := input.Builder.GoSource()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	output := struct {
		garden.Decision
		Source string `json:"source"`
	}{input.Builder.Decide(input.View, input.Memory), source}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(output)
}

func Handler(w http.ResponseWriter, r *http.Request) {
	secret := os.Getenv("SELFORG_ENGINE_SECRET")
	if secret == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+secret)) != 1 {
		http.Error(w, "Unauthorized", 401)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Use POST", 405)
		return
	}
	operation := r.URL.Query().Get("operation")
	if operation == "builder" {
		builderPreview(w, r)
		return
	}
	if operation != "" && operation != "validate" {
		http.Error(w, "unknown operation", 400)
		return
	}
	var input garden.Request
	if err := readRequest(w, r, &input); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	if err := input.Validate(); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if operation == "validate" {
		_ = json.NewEncoder(w).Encode(struct{}{})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 70*time.Second)
	defer cancel()
	result := garden.Run(ctx, input)
	if result.Err != nil {
		http.Error(w, "The garden was interrupted. Please run it again.", http.StatusServiceUnavailable)
		return
	}
	_ = garden.WriteReplay(w, result)
}
