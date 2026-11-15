package handler

// The society API is deliberately stateful. It runs in the local Go service,
// with compressed replay frames on disk, rather than a short-lived function.
import (
	"compress/gzip"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"selforg-garden/pkg/society"
)

type societyRun struct {
	mu      sync.Mutex
	ID      string         `json:"id"`
	World   *society.World `json:"-"`
	Status  string         `json:"status"`
	Error   string         `json:"error,omitempty"`
	Frames  []frameIndex   `json:"frames"`
	Created string         `json:"created"`
	stop    bool
	workers []*strategyWorker
}
type frameIndex struct {
	Index  int           `json:"index"`
	Month  int           `json:"month"`
	Day    int           `json:"day"`
	Phase  string        `json:"phase"`
	Meteor bool          `json:"meteor"`
	Stats  society.Stats `json:"stats"`
}

var societyRuns = struct {
	sync.Mutex
	runs map[string]*societyRun
}{runs: map[string]*societyRun{}}

func societyData() string {
	if p := os.Getenv("SOCIETY_DATA_DIR"); p != "" {
		return p
	}
	if p := os.Getenv("LOCAL_DATA_DIR"); p != "" {
		return filepath.Join(p, "society")
	}
	return filepath.Join(".local", "data", "society")
}
func newRunID() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func validRunID(s string) bool {
	if len(s) != 32 {
		return false
	}
	_, e := hex.DecodeString(s)
	return e == nil
}
func jsonReply(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
func apiError(w http.ResponseWriter, code int, e error) {
	jsonReply(w, code, map[string]string{"error": e.Error()})
}
func decodeSociety(w http.ResponseWriter, r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20))
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		return fmt.Errorf("invalid request: %w", e)
	}
	if e := d.Decode(new(any)); e != io.EOF {
		return errors.New("expected one JSON request")
	}
	return nil
}
func runDir(id string) string { return filepath.Join(societyData(), "runs", id) }
func (s *societyRun) saveFrame() error {
	snap := s.World.Snapshot()
	index := len(s.Frames)
	dir := runDir(s.ID)
	if e := os.MkdirAll(dir, 0700); e != nil {
		return e
	}
	name := filepath.Join(dir, fmt.Sprintf("%05d.json.gz", index))
	file, e := os.Create(name + ".tmp")
	if e != nil {
		return e
	}
	z, _ := gzip.NewWriterLevel(file, gzip.BestSpeed)
	e = json.NewEncoder(z).Encode(snap)
	if e2 := z.Close(); e == nil {
		e = e2
	}
	if e2 := file.Close(); e == nil {
		e = e2
	}
	if e != nil {
		_ = os.Remove(name + ".tmp")
		return e
	}
	if e = os.Rename(name+".tmp", name); e != nil {
		return e
	}
	s.Frames = append(s.Frames, frameIndex{index, snap.Month, snap.Day, snap.Phase, snap.Meteor, snap.Stats})
	return s.saveIndex()
}
func (s *societyRun) saveIndex() error {
	b, e := json.Marshal(s)
	if e != nil {
		return e
	}
	p := filepath.Join(runDir(s.ID), "index.json")
	if e = os.WriteFile(p+".tmp", b, 0600); e != nil {
		return e
	}
	return os.Rename(p+".tmp", p)
}
func loadRun(id string) (*societyRun, error) {
	if !validRunID(id) {
		return nil, errors.New("unknown simulation")
	}
	societyRuns.Lock()
	defer societyRuns.Unlock()
	if s := societyRuns.runs[id]; s != nil {
		return s, nil
	}
	b, e := os.ReadFile(filepath.Join(runDir(id), "index.json"))
	if e != nil {
		return nil, errors.New("simulation not found")
	}
	s := new(societyRun)
	if e = json.Unmarshal(b, s); e != nil {
		return nil, e
	}
	if s.Status == "running" || s.Status == "paused" {
		s.Status = "archived"
	}
	societyRuns.runs[id] = s
	return s, nil
}
func readFrame(id string, index int) (json.RawMessage, error) {
	f, e := os.Open(filepath.Join(runDir(id), fmt.Sprintf("%05d.json.gz", index)))
	if e != nil {
		return nil, e
	}
	defer f.Close()
	z, e := gzip.NewReader(f)
	if e != nil {
		return nil, e
	}
	defer z.Close()
	b, e := io.ReadAll(z)
	return json.RawMessage(b), e
}
func (s *societyRun) response() any {
	var snap any
	if s.World != nil {
		snap = s.World.Snapshot()
	} else if len(s.Frames) > 0 {
		snap, _ = readFrame(s.ID, len(s.Frames)-1)
	}
	return map[string]any{"id": s.ID, "snapshot": snap, "status": s.Status, "error": s.Error, "frameIndex": len(s.Frames) - 1, "index": len(s.Frames) - 1, "progress": len(s.Frames) - 1}
}
func (s *societyRun) advance() error {
	if e := s.World.Step(); e != nil {
		return e
	}
	if s.World.Done {
		s.Status = "complete"
		s.closeWorkers()
	}
	return s.saveFrame()
}
func (s *societyRun) closeWorkers() {
	for _, w := range s.workers {
		w.Close()
	}
	s.workers = nil
}

// SocietyHandler is mounted behind the loopback proxy with the engine secret.
func SocietyHandler(w http.ResponseWriter, r *http.Request) {
	secret := os.Getenv("SELFORG_ENGINE_SECRET")
	if secret == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+secret)) != 1 {
		apiError(w, 401, errors.New("unauthorised"))
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/society"), "/")
	parts := strings.Split(path, "/")
	if path == "config" && r.Method == "GET" {
		jsonReply(w, 200, map[string]any{"settings": society.DefaultSettings(), "teams": society.DefaultTeams(), "catalogue": society.Catalogue(), "phases": []string{"environment", "movement", "harvest", "proposals", "voting", "transfers", "eating", "close"}, "goUploads": true})
		return
	}
	if parts[0] == "strategies" {
		strategyAPI(w, r, parts)
		return
	}
	if path == "runs" && r.Method == "GET" {
		entries, _ := os.ReadDir(filepath.Join(societyData(), "runs"))
		var out []any
		for _, ent := range entries {
			if !validRunID(ent.Name()) {
				continue
			}
			s, e := loadRun(ent.Name())
			if e != nil {
				continue
			}
			s.mu.Lock()
			out = append(out, map[string]any{"id": s.ID, "created": s.Created, "status": s.Status, "frames": len(s.Frames)})
			s.mu.Unlock()
		}
		jsonReply(w, 200, map[string]any{"runs": out})
		return
	}
	if path == "runs" && r.Method == "POST" {
		input := struct {
			Settings society.Settings `json:"settings"`
			Teams    []society.Team   `json:"teams"`
			Seed     int64            `json:"seed"`
		}{Settings: society.DefaultSettings(), Teams: society.DefaultTeams(), Seed: 42}
		if e := decodeSociety(w, r, &input); e != nil {
			apiError(w, 400, e)
			return
		}
		world, e := society.New(input.Settings, input.Teams, input.Seed)
		if e != nil {
			apiError(w, 400, e)
			return
		}
		s := &societyRun{ID: newRunID(), World: world, Status: "paused", Created: time.Now().UTC().Format(time.RFC3339)}
		if e = s.attachStrategies(); e != nil {
			s.closeWorkers()
			apiError(w, 400, e)
			return
		}
		if e = s.saveFrame(); e != nil {
			s.closeWorkers()
			apiError(w, 500, e)
			return
		}
		societyRuns.Lock()
		societyRuns.runs[s.ID] = s
		societyRuns.Unlock()
		jsonReply(w, 201, s.response())
		return
	}
	if len(parts) < 2 || parts[0] != "runs" {
		apiError(w, 404, errors.New("endpoint not found"))
		return
	}
	s, e := loadRun(parts[1])
	if e != nil {
		apiError(w, 404, e)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(parts) == 2 && r.Method == "GET" {
		jsonReply(w, 200, s.response())
		return
	}
	if len(parts) == 3 && parts[2] == "history" && r.Method == "GET" {
		var months any
		if s.World != nil {
			months = s.World.Months
		} else if b, e := readFrame(s.ID, len(s.Frames)-1); e == nil {
			var f society.Snapshot
			_ = json.Unmarshal(b, &f)
			months = f.Months
		}
		jsonReply(w, 200, map[string]any{"frames": s.Frames, "months": months})
		return
	}
	if len(parts) == 3 && parts[2] == "events" && r.Method == "GET" {
		start := 0
		if q := r.URL.Query().Get("afterFrame"); q != "" {
			if n, e := strconv.Atoi(q); e == nil {
				start = n + 1
			}
		}
		if start < 0 {
			start = 0
		}
		events := []society.Event{}
		plot, actor := -2, -2
		if q := r.URL.Query().Get("plot"); q != "" {
			plot, _ = strconv.Atoi(q)
		}
		if q := r.URL.Query().Get("actor"); q != "" {
			actor, _ = strconv.Atoi(q)
		}
		for i := start; i < len(s.Frames); i++ {
			b, e := readFrame(s.ID, i)
			if e != nil {
				continue
			}
			var f struct {
				Events []society.Event `json:"events"`
			}
			if json.Unmarshal(b, &f) != nil {
				continue
			}
			for _, event := range f.Events {
				if (plot == -2 || event.Plot == plot) && (actor == -2 || event.Actor == actor) {
					events = append(events, event)
				}
			}
		}
		jsonReply(w, 200, map[string]any{"events": events, "lastFrame": len(s.Frames) - 1})
		return
	}
	if len(parts) == 4 && parts[2] == "frames" && r.Method == "GET" {
		n, e := strconv.Atoi(parts[3])
		if e != nil || n < 0 || n >= len(s.Frames) {
			apiError(w, 404, errors.New("frame not found"))
			return
		}
		frame, e := readFrame(s.ID, n)
		if e != nil {
			apiError(w, 500, e)
			return
		}
		jsonReply(w, 200, map[string]any{"id": s.ID, "snapshot": frame, "status": s.Status, "frameIndex": n, "index": n})
		return
	}
	if len(parts) == 4 && parts[2] == "agents" && r.Method == "GET" {
		n, e := strconv.Atoi(parts[3])
		if s.World == nil {
			apiError(w, 409, errors.New("private observations are available in a live simulation"))
			return
		}
		if e != nil || n < 0 || n >= len(s.World.Agents) {
			apiError(w, 404, errors.New("individual not found"))
			return
		}
		jsonReply(w, 200, s.World.View(n))
		return
	}
	if len(parts) == 3 && parts[2] == "export" && r.Method == "GET" {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", `attachment; filename="amoeboids-`+s.ID+`.json"`)
		_, _ = io.WriteString(w, `{"version":5,"id":"`+s.ID+`","frames":[`)
		for i := range s.Frames {
			b, e := readFrame(s.ID, i)
			if e != nil {
				return
			}
			if i > 0 {
				_, _ = io.WriteString(w, ",")
			}
			_, _ = w.Write(b)
		}
		_, _ = io.WriteString(w, "]}")
		return
	}
	if r.Method != "POST" || len(parts) != 3 {
		apiError(w, 405, errors.New("unsupported request"))
		return
	}
	if parts[2] == "pause" {
		s.stop = true
		_ = s.saveIndex()
		jsonReply(w, 200, s.response())
		return
	}
	if s.World == nil {
		apiError(w, 409, errors.New("this saved replay is read-only; start a new simulation to run again"))
		return
	}
	if s.Status == "running" {
		apiError(w, 409, errors.New("pause the simulation before stepping or starting another run"))
		return
	}
	if s.World.Done {
		jsonReply(w, 200, s.response())
		return
	}
	switch parts[2] {
	case "step":
		in := struct {
			Count int `json:"count"`
		}{1}
		if e = decodeSociety(w, r, &in); e != nil || in.Count < 1 || in.Count > 64 {
			apiError(w, 400, errors.New("step count must be between 1 and 64"))
			return
		}
		for i := 0; i < in.Count && !s.World.Done; i++ {
			if e = s.advance(); e != nil {
				s.Status = "error"
				s.Error = e.Error()
				break
			}
		}
		jsonReply(w, 200, s.response())
	case "run":
		in := struct {
			Until string `json:"until"`
		}{"year"}
		if e = decodeSociety(w, r, &in); e != nil {
			apiError(w, 400, e)
			return
		}
		if in.Until != "day" && in.Until != "month" && in.Until != "year" {
			apiError(w, 400, errors.New("choose day, month or year"))
			return
		}
		s.Status = "running"
		s.stop = false
		day, month := s.World.AbsoluteDay, s.World.Month
		go func() {
			for {
				s.mu.Lock()
				if s.stop || s.World.Done {
					if !s.World.Done {
						s.Status = "paused"
					}
					_ = s.saveIndex()
					s.mu.Unlock()
					return
				}
				e := s.advance()
				halt := e != nil || s.World.Done || (in.Until == "day" && s.World.AbsoluteDay != day) || (in.Until == "month" && s.World.Month != month)
				if e != nil {
					s.Status = "error"
					s.Error = e.Error()
				} else if halt && !s.World.Done {
					s.Status = "paused"
				}
				if halt {
					_ = s.saveIndex()
					s.mu.Unlock()
					return
				}
				s.mu.Unlock()
				// Yield the mutex between phases so pause and progress requests stay responsive.
				time.Sleep(time.Millisecond)
			}
		}()
		jsonReply(w, 200, s.response())
	default:
		apiError(w, 404, errors.New("endpoint not found"))
	}
}
