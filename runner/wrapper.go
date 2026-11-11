//go:build agent

package main

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"os"
	"sync"
)

// These types are supplied by the game. Upload only agent.go.
type Action struct{ Food, Energy int }

func main() {
	var mu sync.Mutex
	mux := http.NewServeMux()
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+os.Getenv("AGENT_TOKEN"))) != 1 {
			http.Error(w, "Unauthorized", 401)
			return
		}
		w.WriteHeader(204)
	})
	mux.HandleFunc("/decide", func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+os.Getenv("AGENT_TOKEN"))) != 1 {
			http.Error(w, "Unauthorized", 401)
			return
		}
		if r.Method != "POST" {
			http.Error(w, "Use POST", 405)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		defer func() {
			if recover() != nil {
				http.Error(w, "Agent panicked", 500)
			}
		}()
		var v View
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048)).Decode(&v) != nil {
			http.Error(w, "Invalid input", 400)
			return
		}
		a := Decide(v)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(a)
	})
	if e := http.ListenAndServe("0.0.0.0:3000", mux); e != nil {
		panic(e)
	}
}
