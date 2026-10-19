package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"websentinel/core/internal/assess"
	"websentinel/core/internal/collect"
	"websentinel/core/internal/history"
	"websentinel/core/internal/httpapi"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "listen address")
	rdap := flag.String("rdap", "http://127.0.0.1:8082", "local RDAP service")
	data := flag.String("data", "data/history.json", "history file")
	flag.Parse()

	store, err := history.Open(*data)
	if err != nil {
		log.Fatalf("history: %v", err)
	}
	svc := assess.Service{Registry: collect.Registry{Base: *rdap}}
	srv := &http.Server{
		Addr:              *addr,
		Handler:           httpapi.New(svc, store, *rdap).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      40 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("WebSentinel core listening on http://%s", *addr)
	log.Fatal(srv.ListenAndServe())
}
