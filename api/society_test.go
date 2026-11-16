package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"selforg-garden/pkg/society"
	"strings"
	"testing"
	"time"
)

func societyRequest(t *testing.T, method, path, body string) (int, map[string]json.RawMessage) {
	t.Helper()
	r := httptest.NewRequest(method, "/api/society/"+path, strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer test-society-secret")
	w := httptest.NewRecorder()
	SocietyHandler(w, r)
	var v map[string]json.RawMessage
	if e := json.Unmarshal(w.Body.Bytes(), &v); e != nil {
		t.Fatalf("%s: %v, %s", path, e, w.Body.String())
	}
	return w.Code, v
}
func TestSocietyHTTPReplaySurvivesSessionLoss(t *testing.T) {
	t.Setenv("SELFORG_ENGINE_SECRET", "test-society-secret")
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	code, v := societyRequest(t, "POST", "runs", `{"seed":4,"settings":{"copies":2,"plots":3,"days":2,"months":2}}`)
	if code != 201 {
		t.Fatalf("create: %d %s", code, v["error"])
	}
	var id string
	_ = json.Unmarshal(v["id"], &id)
	code, v = societyRequest(t, "POST", "runs/"+id+"/step", `{"count":32}`)
	if code != 200 {
		t.Fatal(code, v)
	}
	if string(v["status"]) != `"complete"` {
		t.Fatalf("expected completion: %s", v["status"])
	}
	_, v = societyRequest(t, "POST", "runs/"+id+"/pause", "{}")
	if string(v["status"]) != `"complete"` {
		t.Fatal("pausing a completed run changed its terminal status")
	}
	latest := append([]byte(nil), v["snapshot"]...)
	if bytes.Contains(latest, []byte(`"memory"`)) {
		t.Fatal("observer snapshot leaked memory")
	}
	_, history := societyRequest(t, "GET", "runs/"+id+"/history", "")
	var frames []frameIndex
	_ = json.Unmarshal(history["frames"], &frames)
	if len(frames) != 33 {
		t.Fatalf("expected 32 phases plus initial frame, got %d", len(frames))
	}
	societyRuns.Lock()
	delete(societyRuns.runs, id)
	societyRuns.Unlock()
	code, v = societyRequest(t, "GET", "runs/"+id, "")
	if code != 200 || !bytes.Equal(bytes.TrimSpace(latest), bytes.TrimSpace(v["snapshot"])) {
		t.Fatal("saved final replay did not survive in-memory session loss")
	}
	_, v = societyRequest(t, "GET", "runs/"+id+"/frames/0", "")
	var first struct {
		Phase string `json:"phase"`
	}
	_ = json.Unmarshal(v["snapshot"], &first)
	if first.Phase != "ready" {
		t.Fatal("initial replay frame missing")
	}
	code, _ = societyRequest(t, "GET", "runs/../../etc/passwd", "")
	if code == 200 {
		t.Fatal("invalid path accepted")
	}
}
func TestSocietyAsyncRunAndAuth(t *testing.T) {
	t.Setenv("SELFORG_ENGINE_SECRET", "test-society-secret")
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	r := httptest.NewRequest("GET", "/api/society/config", nil)
	w := httptest.NewRecorder()
	SocietyHandler(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatal("engine endpoint was not authenticated")
	}
	_, v := societyRequest(t, "POST", "runs", `{"settings":{"copies":1,"plots":2,"days":2,"months":1}}`)
	var id string
	_ = json.Unmarshal(v["id"], &id)
	code, _ := societyRequest(t, "POST", "runs/"+id+"/run", `{"until":"year"}`)
	if code != 200 {
		t.Fatal("run did not start")
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		_, v = societyRequest(t, "GET", "runs/"+id, "")
		if string(v["status"]) == `"complete"` {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("asynchronous run did not complete: %s", v["status"])
}
func TestStrategySourceCannotShareMutableStateOrUseIO(t *testing.T) {
	cases := []string{
		"package main\nimport \"os\"\nfunc Decide(v View) Action{return Action{}}",
		"package main\nvar shared int\nfunc Decide(v View) Action{shared++;return Action{}}",
		"package main\nfunc init(){}\nfunc Decide(v View) Action{return Action{}}",
		"package main\nfunc Decide(v View) Action{go func(){}();return Action{}}",
		"//go:linkname x runtime.foo\npackage main\nfunc Decide(v View) Action{return Action{}}",
		"package main\nimport \"unicode\"\nfunc Decide(v View) Action{delete(unicode.Categories,\"L\");return Action{}}",
		"package main\nimport \"strconv\"\nfunc Decide(v View) Action{strconv.ErrRange=nil;return Action{}}",
	}
	for _, src := range cases {
		if validateSocietySource(src) == nil {
			t.Fatalf("unsafe strategy accepted: %s", src)
		}
	}
	if e := validateSocietySource("package main\nimport \"math\"\nfunc Decide(v View) Action{return Action{Think:math.Max(0,v.Self.Mind-2)}}"); e != nil {
		t.Fatal(e)
	}
}

func TestCompiledStrategyMemoryIsolationAndTimeout(t *testing.T) {
	t.Setenv("SOCIETY_DATA_DIR", t.TempDir())
	goName := "go"
	if runtime.GOOS == "windows" {
		goName += ".exe"
	}
	t.Setenv("GO_BINARY", filepath.Join(runtime.GOROOT(), "bin", goName))
	rec := strategyRecord{ID: newRunID(), Name: "Memory test", Source: `package main
import("encoding/json";"math")
func Decide(v View) Action { if v.Phase=="invalid"{return Action{Think:math.NaN()}};var m map[string]int; _=json.Unmarshal(v.Memory,&m);if m==nil{m=map[string]int{}};m["n"]++;m["random"]=int(NewRandom(v.RandomSeed).Int31());b,_:=json.Marshal(m);return Action{Memory:b} }`}
	if e := buildSocietyStrategy(rec); e != nil {
		t.Fatal(e)
	}
	worker := &strategyWorker{id: rec.ID, budget: time.Second}
	defer worker.Close()
	a := worker.Decide(society.Observation{RandomSeed: 42, Memory: json.RawMessage(`{"n":0}`)})
	b := worker.Decide(society.Observation{RandomSeed: 42, Memory: json.RawMessage(`{"n":10}`)})
	var first, second map[string]int
	_ = json.Unmarshal(a.Memory, &first)
	_ = json.Unmarshal(b.Memory, &second)
	if first["n"] != 1 || second["n"] != 11 || first["random"] != second["random"] {
		t.Fatalf("private memory/randomness not isolated: %+v %+v; %s %s", first, second, a.Error, b.Error)
	}
	invalid := worker.Decide(society.Observation{Phase: "invalid"})
	if !strings.Contains(invalid.Error, "invalid decision") {
		t.Fatalf("non-finite output failed silently: %+v", invalid)
	}
	worker.Close()
	slow := strategyRecord{ID: newRunID(), Name: "Timeout test", Source: `package main
func Decide(v View) Action { for {} }`}
	if e := buildSocietyStrategy(slow); e != nil {
		t.Fatal(e)
	}
	timed := &strategyWorker{id: slow.ID, budget: 25 * time.Millisecond}
	defer timed.Close()
	result := timed.Decide(society.Observation{})
	if !strings.Contains(result.Error, "time limit") {
		t.Fatalf("nonterminating strategy was not stopped: %+v", result)
	}
}
