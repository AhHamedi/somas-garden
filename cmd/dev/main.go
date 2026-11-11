package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	handler "selforg-garden/api"
)

func main() {
	port := os.Getenv("ENGINE_PORT")
	if port == "" {
		port = "8802"
	}
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/engine", handler.Handler)
	fmt.Printf("SOMAS_ENGINE_URL=http://%s\n", listener.Addr())
	log.Fatal(http.Serve(listener, mux))
}
