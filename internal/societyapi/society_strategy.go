package handler

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"selforg-garden/pkg/society"
)

// Team code is a stateless function of its permitted observation and explicit
// private memory. Reject global state and side-effecting imports before building.
// A worker receives one JSON value at a time; no agent ever receives another's
// memory or a reference into the authoritative world.
func validateSocietySource(source string) error {
	if len(source) == 0 || len(source) > 65536 {
		return errors.New("choose a Go strategy between 1 byte and 64 KB")
	}
	for _, line := range strings.Split(source, "\n") {
		if strings.Contains(line, "//go:") && strings.TrimSpace(line) != "//go:build agent" {
			return errors.New("compiler directives are not supported in strategies")
		}
	}
	f, e := parser.ParseFile(token.NewFileSet(), "agent.go", source, parser.AllErrors)
	if e != nil {
		return e
	}
	if f.Name.Name != "main" {
		return errors.New("use package main")
	}
	allowed := map[string]bool{"math": true, "math/bits": true, "sort": true, "slices": true, "strings": true, "strconv": true, "encoding/json": true, "bytes": true, "cmp": true, "unicode/utf8": true}
	imports := map[string]bool{}
	for _, im := range f.Imports {
		p, _ := strconv.Unquote(im.Path.Value)
		if !allowed[p] {
			return fmt.Errorf("import %q is unavailable: strategies use explicit private memory and pure standard-library functions", p)
		}
		name := filepath.Base(p)
		if im.Name != nil {
			name = im.Name.Name
		}
		if name == "." || name == "_" {
			return errors.New("use a named standard-library import")
		}
		imports[name] = true
	}
	found := false
	for _, d := range f.Decls {
		switch x := d.(type) {
		case *ast.GenDecl:
			if x.Tok == token.VAR {
				return errors.New("package variables would share state between individuals; use v.Memory instead")
			}
		case *ast.FuncDecl:
			if x.Name.Name == "main" || x.Name.Name == "init" {
				return errors.New("the runtime supplies main; init functions are not supported")
			}
			if x.Name.Name == "Decide" {
				found = true
			}
		}
	}
	if !found {
		return errors.New("provide func Decide(v View) Action")
	}
	var invalid error
	var importedRoot func(ast.Expr) bool
	importedRoot = func(e ast.Expr) bool {
		switch x := e.(type) {
		case *ast.Ident:
			return imports[x.Name]
		case *ast.SelectorExpr:
			return importedRoot(x.X)
		case *ast.IndexExpr:
			return importedRoot(x.X)
		case *ast.StarExpr:
			return importedRoot(x.X)
		case *ast.ParenExpr:
			return importedRoot(x.X)
		case *ast.UnaryExpr:
			return importedRoot(x.X)
		}
		return false
	}
	ast.Inspect(f, func(n ast.Node) bool {
		if _, ok := n.(*ast.GoStmt); ok {
			invalid = errors.New("background goroutines are unavailable; return one decision per phase")
		}
		switch x := n.(type) {
		case *ast.AssignStmt:
			for _, lhs := range x.Lhs {
				if importedRoot(lhs) {
					invalid = errors.New("standard-library state cannot be changed; use private memory")
				}
			}
		case *ast.UnaryExpr:
			if x.Op == token.AND && importedRoot(x.X) {
				invalid = errors.New("pointers to standard-library state are unavailable")
			}
		}
		return invalid == nil
	})
	return invalid
}

const societyWrapper = `package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"runtime/debug"

	"selforg-garden/pkg/society"
)

type View = society.Observation
type Action = society.Decision
type Rule = society.Rule
type Proposal = society.ProposalInput
type Order = society.Order
type Offer = society.Offer
type RecordQuery = society.RecordQuery
type VoteChoice = society.VoteChoice

func NewRandom(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

func invoke(v View) (a Action) {
	defer func() {
		if recover() != nil {
			a = Action{Error: "strategy panicked"}
		}
	}()
	return Decide(v)
}

func main() {
	debug.SetMemoryLimit(64 << 20)
	reader := json.NewDecoder(bufio.NewReader(os.Stdin))
	writer := bufio.NewWriter(os.Stdout)
	fmt.Fprintln(os.Stdout, "ready")
	for {
		var v View
		if err := reader.Decode(&v); err != nil {
			return
		}
		decision, err := json.Marshal(invoke(v))
		if err != nil {
			decision = []byte("{\"error\":\"strategy returned an invalid decision: values must be finite and memory valid JSON\"}")
		}
		if _, err := fmt.Fprintln(writer, string(decision)); err != nil {
			return
		}
		if err := writer.Flush(); err != nil {
			return
		}
	}
}
`

type strategyRecord struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Source string `json:"source"`
}

var strategyBuildMu sync.Mutex

func strategyDir(id string) string { return filepath.Join(societyData(), "strategies", id) }
func strategyExecutable(dir string) string {
	name := "strategy"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(dir, name)
}
func buildSocietyStrategy(rec strategyRecord) error {
	if e := validateSocietySource(rec.Source); e != nil {
		return e
	}
	strategyBuildMu.Lock()
	defer strategyBuildMu.Unlock()
	dir, e := filepath.Abs(strategyDir(rec.ID))
	if e != nil {
		return e
	}
	if e = os.MkdirAll(dir, 0700); e != nil {
		return e
	}
	if e = os.WriteFile(filepath.Join(dir, "agent.go"), []byte(rec.Source), 0600); e != nil {
		return e
	}
	if e = os.WriteFile(filepath.Join(dir, "wrapper.go"), []byte(societyWrapper), 0600); e != nil {
		return e
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	binary := os.Getenv("GO_BINARY")
	if binary == "" {
		binary = "go"
	}
	cmd := exec.CommandContext(ctx, binary, "build", "-trimpath", "-o", strategyExecutable(dir), filepath.Join(dir, "agent.go"), filepath.Join(dir, "wrapper.go"))
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOTOOLCHAIN=local")
	output, e := cmd.CombinedOutput()
	if e != nil {
		if len(output) > 4000 {
			output = output[:4000]
		}
		return fmt.Errorf("strategy could not compile: %s", strings.ReplaceAll(string(output), dir+string(filepath.Separator), ""))
	}
	b, _ := json.Marshal(rec)
	return os.WriteFile(filepath.Join(dir, "strategy.json"), b, 0600)
}
func strategyAPI(w http.ResponseWriter, r *http.Request, parts []string) {
	if len(parts) == 2 && r.Method == "GET" {
		if !validRunID(parts[1]) {
			apiError(w, 404, errors.New("strategy not found"))
			return
		}
		b, e := os.ReadFile(filepath.Join(strategyDir(parts[1]), "strategy.json"))
		if e != nil {
			apiError(w, 404, errors.New("strategy not found"))
			return
		}
		var rec strategyRecord
		if json.Unmarshal(b, &rec) != nil {
			apiError(w, 500, errors.New("saved strategy could not be read"))
			return
		}
		jsonReply(w, 200, rec)
		return
	}
	if len(parts) == 1 && r.Method == "GET" {
		entries, _ := os.ReadDir(filepath.Join(societyData(), "strategies"))
		out := []strategyRecord{}
		for _, ent := range entries {
			if !validRunID(ent.Name()) {
				continue
			}
			b, e := os.ReadFile(filepath.Join(strategyDir(ent.Name()), "strategy.json"))
			if e != nil {
				continue
			}
			var rec strategyRecord
			if json.Unmarshal(b, &rec) == nil {
				out = append(out, rec)
			}
		}
		jsonReply(w, 200, map[string]any{"strategies": out})
		return
	}
	if len(parts) != 1 || r.Method != "POST" {
		apiError(w, 405, errors.New("unsupported strategy request"))
		return
	}
	in := struct {
		Name   string `json:"name"`
		Source string `json:"source"`
	}{}
	if e := decodeSociety(w, r, &in); e != nil {
		apiError(w, 400, e)
		return
	}
	if len(strings.TrimSpace(in.Name)) == 0 || len(in.Name) > 80 {
		apiError(w, 400, errors.New("give the strategy a name of 1–80 characters"))
		return
	}
	rec := strategyRecord{newRunID(), in.Name, in.Source}
	if e := buildSocietyStrategy(rec); e != nil {
		_ = os.RemoveAll(strategyDir(rec.ID))
		apiError(w, 400, e)
		return
	}
	jsonReply(w, 201, rec)
}

type strategyWorker struct {
	mu     sync.Mutex
	id     string
	cmd    *exec.Cmd
	input  io.WriteCloser
	output *bufio.Reader
	budget time.Duration
}

func (w *strategyWorker) start() error {
	dir, e := filepath.Abs(strategyDir(w.id))
	if e != nil {
		return e
	}
	w.cmd = exec.Command(strategyExecutable(dir))
	w.cmd.Dir = dir
	w.cmd.Env = []string{"GOMAXPROCS=1", "GOMEMLIMIT=64MiB"}
	w.input, e = w.cmd.StdinPipe()
	if e != nil {
		return e
	}
	out, e := w.cmd.StdoutPipe()
	if e != nil {
		return e
	}
	w.output = bufio.NewReader(out)
	w.cmd.Stderr = io.Discard
	if err := w.cmd.Start(); err != nil {
		w.closeLocked()
		return err
	}
	// Loading the executable belongs to world setup, outside the first ballot
	// or placement decision's budget. No agent callback runs during this handshake.
	ready := make(chan error, 1)
	go func(reader *bufio.Reader) {
		var marker [6]byte
		_, err := io.ReadFull(reader, marker[:])
		if err == nil && string(marker[:]) != "ready\n" {
			err = errors.New("unexpected strategy startup response")
		}
		ready <- err
	}(w.output)
	select {
	case err := <-ready:
		if err != nil {
			w.closeLocked()
		}
		return err
	case <-time.After(5 * time.Second):
		w.closeLocked()
		<-ready
		return errors.New("strategy worker timed out during startup")
	}
}
func (w *strategyWorker) closeLocked() {
	if w.cmd != nil && w.cmd.Process != nil {
		_ = w.cmd.Process.Kill()
		_ = w.cmd.Wait()
	}
	if w.input != nil {
		_ = w.input.Close()
	}
	w.cmd = nil
}
func (w *strategyWorker) Close() { w.mu.Lock(); defer w.mu.Unlock(); w.closeLocked() }
func (w *strategyWorker) Decide(v society.Observation) society.Decision {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cmd == nil {
		if e := w.start(); e != nil {
			return society.Decision{Error: "strategy worker could not start"}
		}
	}
	b, e := json.Marshal(v)
	if e != nil {
		return society.Decision{Error: "observation could not be encoded"}
	}
	type result struct {
		b []byte
		e error
	}
	done := make(chan result, 1)
	go func() {
		_, e := w.input.Write(append(b, '\n'))
		if e != nil {
			done <- result{nil, e}
			return
		}
		var buf bytes.Buffer
		for {
			piece, more, e := w.output.ReadLine()
			if e != nil {
				done <- result{nil, e}
				return
			}
			if buf.Len()+len(piece) > 32<<20 {
				done <- result{nil, errors.New("decision exceeds transport size")}
				return
			}
			buf.Write(piece)
			if !more {
				done <- result{buf.Bytes(), nil}
				return
			}
		}
	}()
	select {
	case r := <-done:
		if r.e != nil {
			w.closeLocked()
			return society.Decision{Error: "strategy stopped or returned an oversized decision"}
		}
		var a society.Decision
		d := json.NewDecoder(bytes.NewReader(r.b))
		d.DisallowUnknownFields()
		if e = d.Decode(&a); e != nil {
			return society.Decision{Error: "strategy returned an invalid decision"}
		}
		return a
	case <-time.After(w.budget):
		w.closeLocked()
		<-done
		return society.Decision{Error: "strategy exceeded the decision time limit; this phase was skipped"}
	}
}
func (s *societyRun) attachStrategies() error {
	for team, t := range s.World.Teams {
		if t.StrategyID == "" {
			continue
		}
		if !validRunID(t.StrategyID) {
			return errors.New("unknown uploaded strategy")
		}
		var rec strategyRecord
		b, e := os.ReadFile(filepath.Join(strategyDir(t.StrategyID), "strategy.json"))
		if e != nil {
			return errors.New("uploaded strategy no longer exists")
		}
		if e = json.Unmarshal(b, &rec); e != nil {
			return e
		}
		// Recompile against the current versioned contract after a source update.
		if e = buildSocietyStrategy(rec); e != nil {
			return e
		}
		worker := &strategyWorker{id: t.StrategyID, budget: time.Duration(s.World.Settings.DecisionMS) * time.Millisecond}
		if e = worker.start(); e != nil {
			return e
		}
		s.workers = append(s.workers, worker)
		for _, a := range s.World.Agents {
			if a.Team == team {
				s.World.Deciders[a.ID] = worker.Decide
			}
		}
	}
	return nil
}
