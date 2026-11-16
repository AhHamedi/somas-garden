// Run the same society engine headlessly for reproducible experiments.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"runtime"
	"selforg-garden/pkg/society"
	"time"
)

func main() {
	cfg := society.DefaultSettings()
	teams := society.DefaultTeams()
	seed := flag.Int64("seed", 42, "world random seed")
	flag.IntVar(&cfg.Copies, "copies", cfg.Copies, "independent individuals per team")
	flag.IntVar(&cfg.Plots, "plots", cfg.Plots, "plots")
	flag.IntVar(&cfg.Days, "days", cfg.Days, "days per month")
	flag.IntVar(&cfg.Months, "months", cfg.Months, "months")
	config := flag.String("config", "", "optional JSON with settings and teams")
	output := flag.String("output", "", "write final snapshot and metrics to this file")
	flag.Parse()
	if *config != "" {
		b, e := os.ReadFile(*config)
		if e != nil {
			fail(e)
		}
		in := struct {
			Settings society.Settings `json:"settings"`
			Teams    []society.Team   `json:"teams"`
		}{cfg, teams}
		if e = json.Unmarshal(b, &in); e != nil {
			fail(e)
		}
		cfg, teams = in.Settings, in.Teams
	}
	w, e := society.New(cfg, teams, *seed)
	if e != nil {
		fail(e)
	}
	start := time.Now()
	steps := 0
	for !w.Done {
		if e = w.Step(); e != nil {
			fail(e)
		}
		steps++
	}
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	result := struct {
		Snapshot       society.Snapshot `json:"snapshot"`
		Steps          int              `json:"steps"`
		Seconds        float64          `json:"seconds"`
		AllocatedBytes uint64           `json:"allocatedBytes"`
	}{w.Snapshot(), steps, time.Since(start).Seconds(), m.Alloc}
	var out *os.File = os.Stdout
	if *output != "" {
		out, e = os.Create(*output)
		if e != nil {
			fail(e)
		}
		defer out.Close()
	}
	if e = json.NewEncoder(out).Encode(result); e != nil {
		fail(e)
	}
	fmt.Fprintf(os.Stderr, "%d individuals · %d cycles · %d phases · %.2fs\n", len(w.Agents), cfg.Days*cfg.Months, steps, result.Seconds)
}
func fail(e error) { fmt.Fprintln(os.Stderr, e); os.Exit(1) }
