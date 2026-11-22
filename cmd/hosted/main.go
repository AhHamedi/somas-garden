// The hosted society engine runs inside one visitor's isolated sandbox.
// Only its authenticated application proxy can reach simulation data.
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	handler "selforg-garden/internal/societyapi"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--config" {
		if err := json.NewEncoder(os.Stdout).Encode(handler.SocietyConfig()); err != nil {
			log.Fatal(err)
		}
		return
	}
	secret := os.Getenv("SELFORG_ENGINE_SECRET")
	if secret == "" {
		log.Fatal("engine authentication is required")
	}
	port := os.Getenv("ENGINE_PORT")
	if port == "" {
		port = "8802"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+secret)) != 1 {
			http.Error(w, "unauthorised", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"version": os.Getenv("SOCIETY_ENGINE_VERSION")})
	})
	mux.HandleFunc("/api/society/", handler.SocietyHandler)
	server := &http.Server{Addr: "0.0.0.0:" + port, Handler: mux, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second}
	stopping := make(chan os.Signal, 1)
	signal.Notify(stopping, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-stopping
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
