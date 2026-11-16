package handler

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"selforg-garden/pkg/society"
)

func forgetSocietyRun(id string) {
	societyRuns.Lock()
	s := societyRuns.runs[id]
	delete(societyRuns.runs, id)
	societyRuns.Unlock()
	if s != nil {
		s.closeWorkers()
	}
}

func TestSocietyCheckpointRestoresLiveRunAndUploadedMemory(t *testing.T) {
	t.Setenv("SELFORG_ENGINE_SECRET", "test-society-secret")
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	goName := "go"
	if runtime.GOOS == "windows" {
		goName += ".exe"
	}
	t.Setenv("GO_BINARY", filepath.Join(runtime.GOROOT(), "bin", goName))
	rec := strategyRecord{ID: newRunID(), Name: "Checkpoint memory", Source: `package main
import "encoding/json"
func Decide(v View) Action {var n int;_ = json.Unmarshal(v.Memory,&n); b,_ := json.Marshal(n+1); return Action{Memory:b,Eat:2,Harvest:3}}`}
	if err := buildSocietyStrategy(rec); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{
		"settings": map[string]int{"copies": 2, "plots": 1, "days": 2, "months": 2},
		"teams":    []society.Team{{Name: "Rememberers", Policy: "thinker", StrategyID: rec.ID}},
	})
	code, result := societyRequest(t, "POST", "runs", string(body))
	if code != 201 {
		t.Fatalf("create: %d %s", code, result["error"])
	}
	var id string
	_ = json.Unmarshal(result["id"], &id)
	defer forgetSocietyRun(id)
	_, result = societyRequest(t, "POST", "runs/"+id+"/step", `{"count":7}`)
	before, err := loadRun(id)
	if err != nil {
		t.Fatal(err)
	}
	privateBefore, err := before.World.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	oldSnapshot := append([]byte{}, result["snapshot"]...)
	forgetSocietyRun(id)
	code, result = societyRequest(t, "GET", "runs/"+id, "")
	if code != 200 || string(result["status"]) != `"paused"` || !bytes.Equal(oldSnapshot, result["snapshot"]) {
		t.Fatalf("run did not resume at the saved phase: %d %s", code, result)
	}
	resumed, err := loadRun(id)
	if err != nil {
		t.Fatal(err)
	}
	privateAfter, err := resumed.World.Checkpoint()
	if err != nil || !bytes.Equal(privateBefore, privateAfter) {
		t.Fatal("private world state changed on process restart", err)
	}
	if len(resumed.workers) != 1 || len(resumed.World.Deciders) != 2 {
		t.Fatal("uploaded deciders were not reattached")
	}
	var prior int
	_ = json.Unmarshal(resumed.World.Agents[0].Memory, &prior)
	_, result = societyRequest(t, "POST", "runs/"+id+"/step", `{"count":10}`)
	var after int
	_ = json.Unmarshal(resumed.World.Agents[0].Memory, &after)
	if after <= prior || resumed.World.Month != 2 {
		t.Fatal("private strategy memory did not advance across the meteor")
	}
	if bytes.Contains(result["snapshot"], []byte(`"memory"`)) {
		t.Fatal("observer response leaked private memory")
	}
	files, _ := filepath.Glob(filepath.Join(runDir(id), "state-*.json.gz"))
	if len(files) != 1 {
		t.Fatalf("kept %d checkpoints instead of the latest committed one", len(files))
	}
}

func TestSocietyCheckpointFailureDoesNotCommitReplayIndex(t *testing.T) {
	t.Setenv("SELFORG_ENGINE_SECRET", "test-society-secret")
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	_, result := societyRequest(t, "POST", "runs", `{"settings":{"copies":1,"plots":2}}`)
	var id string
	_ = json.Unmarshal(result["id"], &id)
	defer forgetSocietyRun(id)
	committed, err := os.ReadFile(filepath.Join(runDir(id), "index.json"))
	if err != nil {
		t.Fatal(err)
	}
	// A directory at the temporary file path reliably rejects checkpoint writes.
	if err := os.Mkdir(checkpointPath(id, 1)+".tmp", 0700); err != nil {
		t.Fatal(err)
	}
	_, result = societyRequest(t, "POST", "runs/"+id+"/step", `{"count":1}`)
	if string(result["status"]) != `"error"` || len(result["error"]) == 0 {
		t.Fatal("checkpoint failure was hidden")
	}
	assertFailedRunUsesCommittedFrame(t, id, result)
	if err := os.Remove(checkpointPath(id, 1) + ".tmp"); err != nil {
		t.Fatal(err)
	}
	assertFailedRunRejectsMutations(t, id)
	actual, _ := os.ReadFile(filepath.Join(runDir(id), "index.json"))
	if !bytes.Equal(committed, actual) {
		t.Fatal("failed checkpoint advanced the committed replay index")
	}
	forgetSocietyRun(id)
	code, result := societyRequest(t, "GET", "runs/"+id, "")
	if code != 200 || string(result["index"]) != "0" {
		t.Fatal("restart selected an uncommitted orphan frame")
	}
}

func TestSocietyLegacyReplayStillOpensWithoutCheckpoint(t *testing.T) {
	t.Setenv("SELFORG_ENGINE_SECRET", "test-society-secret")
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	_, result := societyRequest(t, "POST", "runs", `{"settings":{"copies":1,"plots":2}}`)
	var id string
	_ = json.Unmarshal(result["id"], &id)
	defer forgetSocietyRun(id)
	if err := os.Remove(checkpointPath(id, 0)); err != nil {
		t.Fatal(err)
	}
	forgetSocietyRun(id)
	code, result := societyRequest(t, "GET", "runs/"+id, "")
	if code != 200 || string(result["status"]) != `"archived"` {
		t.Fatal("older replay-only saves should remain readable")
	}
}

func TestSocietyIndexFailureKeepsPreviousCheckpointAuthoritative(t *testing.T) {
	t.Setenv("SELFORG_ENGINE_SECRET", "test-society-secret")
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	_, result := societyRequest(t, "POST", "runs", `{"settings":{"copies":1,"plots":2}}`)
	var id string
	_ = json.Unmarshal(result["id"], &id)
	defer forgetSocietyRun(id)
	if err := os.Mkdir(filepath.Join(runDir(id), "index.json.tmp"), 0700); err != nil {
		t.Fatal(err)
	}
	_, result = societyRequest(t, "POST", "runs/"+id+"/step", `{"count":1}`)
	if string(result["status"]) != `"error"` {
		t.Fatal("index persistence failure was hidden")
	}
	assertFailedRunUsesCommittedFrame(t, id, result)
	if _, err := os.Stat(checkpointPath(id, 1)); err != nil {
		t.Fatal("test did not reach the new checkpoint", err)
	}
	if err := os.Remove(filepath.Join(runDir(id), "index.json.tmp")); err != nil {
		t.Fatal(err)
	}
	assertFailedRunRejectsMutations(t, id)
	forgetSocietyRun(id)
	code, result := societyRequest(t, "GET", "runs/"+id, "")
	var snap society.Snapshot
	_ = json.Unmarshal(result["snapshot"], &snap)
	if code != 200 || string(result["index"]) != "0" || snap.Phase != "ready" {
		t.Fatal("restart selected a checkpoint newer than the committed index")
	}
}

func TestSocietyAsyncCheckpointFailureIsReadOnly(t *testing.T) {
	t.Setenv("SELFORG_ENGINE_SECRET", "test-society-secret")
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	_, result := societyRequest(t, "POST", "runs", `{"settings":{"copies":1,"plots":2}}`)
	var id string
	_ = json.Unmarshal(result["id"], &id)
	defer forgetSocietyRun(id)
	if err := os.Mkdir(checkpointPath(id, 1)+".tmp", 0700); err != nil {
		t.Fatal(err)
	}
	code, _ := societyRequest(t, "POST", "runs/"+id+"/run", `{"until":"day"}`)
	if code != 200 {
		t.Fatalf("could not start async run: %d", code)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		_, result = societyRequest(t, "GET", "runs/"+id, "")
		if string(result["status"]) == `"error"` {
			assertFailedRunUsesCommittedFrame(t, id, result)
			assertFailedRunRejectsMutations(t, id)
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("async persistence error did not stop the run")
}

func assertFailedRunUsesCommittedFrame(t *testing.T, id string, result map[string]json.RawMessage) {
	t.Helper()
	var snap society.Snapshot
	if err := json.Unmarshal(result["snapshot"], &snap); err != nil {
		t.Fatal(err)
	}
	if string(result["index"]) != "0" || snap.Phase != "ready" {
		t.Fatalf("failed mutation returned uncommitted state: index %s, phase %s", result["index"], snap.Phase)
	}
	run, err := loadRun(id)
	if err != nil {
		t.Fatal(err)
	}
	if run.World != nil || len(run.workers) != 0 {
		t.Fatal("failed mutation retained its uncommitted world or workers")
	}
	_, latest := societyRequest(t, "GET", "runs/"+id, "")
	if !bytes.Equal(result["snapshot"], latest["snapshot"]) {
		t.Fatal("GET returned a different state after failure")
	}
}

func assertFailedRunRejectsMutations(t *testing.T, id string) {
	t.Helper()
	for _, next := range []struct{ action, body string }{{"step", `{"count":1}`}, {"run", `{"until":"day"}`}, {"pause", `{}`}} {
		code, result := societyRequest(t, "POST", "runs/"+id+"/"+next.action, next.body)
		if code != 409 || len(result["error"]) == 0 {
			t.Fatalf("%s continued a failed simulation: %d %s", next.action, code, result)
		}
	}
	_, result := societyRequest(t, "GET", "runs/"+id, "")
	assertFailedRunUsesCommittedFrame(t, id, result)
	_, history := societyRequest(t, "GET", "runs/"+id+"/history", "")
	var frames []frameIndex
	_ = json.Unmarshal(history["frames"], &frames)
	if len(frames) != 1 || frames[0].Phase != "ready" {
		t.Fatal("failed simulation skipped a phase in its replay")
	}
}
