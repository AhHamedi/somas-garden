package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"selforg-garden/pkg/society"
)

func TestCourseworkSourceMatchesGroupAndBehaviour(t *testing.T) {
	source := society.CourseworkSource{Group: 3, Path: "teams/group-3/agent.go", Revision: strings.Repeat("a", 64), Repository: "class/team", Commit: strings.Repeat("b", 40)}
	team := society.Team{Name: "Group 3", Policy: "custom", StrategyID: strings.Repeat("1", 32)}
	settings := society.DefaultSettings()
	for _, change := range []func(*society.CourseworkSource){
		func(s *society.CourseworkSource) { s.Group = 4 },
		func(s *society.CourseworkSource) { s.Path = "teams/group-3/builder.json" },
		func(s *society.CourseworkSource) { s.Revision = "latest" },
		func(s *society.CourseworkSource) { s.Commit = "main" },
		func(s *society.CourseworkSource) { s.Repository = "class/../other" },
	} {
		bad := source
		change(&bad)
		team.Coursework = &bad
		if err := settings.ValidateBehaviour(team); err == nil {
			t.Errorf("accepted invalid source %+v", bad)
		}
	}
}

// Test the same files a group edits in a fork, with the production compiler,
// worker deadlines and simulation callbacks. An empty slot has no behaviour.
func TestCourseworkAgents(t *testing.T) {
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	binary := "go"
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	t.Setenv("GO_BINARY", filepath.Join(runtime.GOROOT(), "bin", binary))
	root := filepath.Join("..", "..")
	t.Run("starter", func(t *testing.T) {
		source, err := os.ReadFile(filepath.Join(root, "public", "society-example.go"))
		if err != nil {
			t.Fatal(err)
		}
		exerciseCoursework(t, map[string]any{"name": "Starter", "source": string(source)})
	})
	for group := 1; group <= 6; group++ {
		slot := fmt.Sprintf("group-%d", group)
		t.Run(slot, func(t *testing.T) {
			dir := filepath.Join(root, "teams", slot)
			manifest, err := os.ReadFile(filepath.Join(dir, "team.json"))
			if err != nil {
				t.Fatal(err)
			}
			var team struct {
				Name string `json:"name"`
			}
			if err := decodeSocietyJSON(bytes.NewReader(manifest), &team); err != nil {
				t.Fatal(err)
			}
			behaviour := map[string]any{"name": team.Name}
			for _, filename := range []string{"agent.go", "builder.json"} {
				content, err := os.ReadFile(filepath.Join(dir, filename))
				if os.IsNotExist(err) {
					continue
				}
				if err != nil {
					t.Fatal(err)
				}
				if filename == "agent.go" {
					behaviour["source"] = string(content)
				} else {
					behaviour["builder"] = json.RawMessage(content)
				}
			}
			if len(behaviour) == 1 {
				t.Skip("No agent submitted")
			}
			exerciseCoursework(t, behaviour)
		})
	}
}

func exerciseCoursework(t *testing.T, behaviour map[string]any) {
	t.Helper()
	body, err := json.Marshal(behaviour)
	if err != nil {
		t.Fatal(err)
	}
	result, err := ImportGroupBehaviour(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	var team society.Team
	switch compiled := result.(type) {
	case map[string]string:
		team = society.Team{Name: compiled["name"], Policy: "custom", StrategyID: compiled["id"]}
	case society.Team:
		team = compiled
	default:
		t.Fatalf("unexpected imported behaviour %T", result)
	}
	settings := society.DefaultSettings()
	settings.Copies, settings.Days, settings.Months = 2, 2, 1
	// A builder may legally name any plot, even one outside the default six.
	if team.Builder != nil {
		for _, rule := range team.Builder.Rules {
			if plot := rule.Action.PlotChoice; plot != nil {
				settings.Plots = max(settings.Plots, *plot+1)
			}
		}
		settings.CapacityPerAgent = max(settings.CapacityPerAgent, settings.Plots)
	}
	world, err := society.New(settings, []society.Team{team, {Name: "Wardens", Policy: "warden"}}, 42)
	if err != nil {
		t.Fatal(err)
	}
	match := societyRun{World: world}
	defer match.closeWorkers()
	if err := match.attachStrategies(); err != nil {
		t.Fatal(err)
	}
	// Some phases call Decide more than once. Catch an error before the next
	// successful callback clears the individual's error.
	for id, decide := range world.Deciders {
		world.Deciders[id] = func(view society.Observation) society.Decision {
			action := decide(view)
			if action.Error != "" {
				t.Fatalf("day %d, %s, agent %d: %s", view.Day, view.Phase, view.Self.ID, action.Error)
			}
			return action
		}
	}
	for !world.Done {
		if err := world.Step(); err != nil {
			t.Fatal(err)
		}
		for _, agent := range world.Agents {
			if agent.Error != "" {
				t.Fatalf("day %d, %s, agent %d: %s", world.Day, world.Phase, agent.ID, agent.Error)
			}
		}
	}
}
