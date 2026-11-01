package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"websentinel/core/internal/assess"
	"websentinel/core/internal/collect"
	"websentinel/core/internal/history"
	"websentinel/core/internal/model"
)

// Server is the only process the browser talks to.
type Server struct {
	Assess   assess.Service
	History  *history.Store
	RDAPBase string
	limit    *limiter
}

func New(svc assess.Service, store *history.Store, rdapBase string) *Server {
	return &Server{Assess: svc, History: store, RDAPBase: rdapBase, limit: &limiter{hits: map[string][]time.Time{}}}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", s.root)
	mux.HandleFunc("GET /api/v1/health", s.health)
	mux.HandleFunc("POST /api/v1/assess", s.assess)
	mux.HandleFunc("GET /api/v1/history", s.history)
	mux.HandleFunc("DELETE /api/v1/history", s.clearHistory)
	mux.HandleFunc("OPTIONS /api/v1/assess", s.preflight)
	mux.HandleFunc("OPTIONS /api/v1/history", s.preflight)
	mux.HandleFunc("OPTIONS /api/v1/health", s.preflight)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Cache-Control", "no-store")
		if !s.cors(w, r) {
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func (s *Server) root(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found.", "code": "not_found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"service": "websentinel",
		"ui":      "http://127.0.0.1:5173",
	})
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	rdap := "down"
	if s.rdapUp() {
		rdap = "ok"
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"bind":    "127.0.0.1",
		"rdap":    rdap,
		"version": "1.0.0",
	})
}

func (s *Server) assess(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !s.limit.allow(ip) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": "Too many checks from this machine in a short time. Wait a minute and try again.",
			"code":  "rate_limited",
		})
		return
	}
	body := http.MaxBytesReader(w, r.Body, 8192)
	defer body.Close()
	var req struct {
		URL string `json:"url"`
	}
	dec := json.NewDecoder(body)
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "The request could not be read. Send a short JSON object with a url field.",
			"code":  "invalid_json",
		})
		return
	}
	started := time.Now()
	result, err := s.Assess.Run(r.Context(), req.URL)
	if err != nil {
		var rej *assess.Reject
		if errors.As(err, &rej) {
			log.Printf("assess refused code=%s", rej.Code)
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": rej.Msg, "code": rej.Code})
			return
		}
		log.Printf("assess failed")
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error": "The check could not be completed.",
			"code":  "unavailable",
		})
		return
	}
	if s.History != nil {
		s.History.Add(result)
	}
	log.Printf("assess origin=%s verdict=%s rule=%d advisory=%d ms=%d", result.Origin, result.Verdict, result.RuleScore, result.AdvisoryScore, time.Since(started).Milliseconds())
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) history(w http.ResponseWriter, _ *http.Request) {
	if s.History == nil {
		writeJSON(w, http.StatusOK, []model.Assessment{})
		return
	}
	writeJSON(w, http.StatusOK, s.History.List())
}

func (s *Server) clearHistory(w http.ResponseWriter, _ *http.Request) {
	if s.History != nil {
		s.History.Clear()
	}
	writeJSON(w, http.StatusOK, map[string]bool{"cleared": true})
}

func (s *Server) preflight(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) rdapUp() bool {
	return (collect.Registry{Base: s.RDAPBase}).Health(context.Background())
}

func (s *Server) cors(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin != "" && allowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "600")
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return false
	}
	return true
}

func allowedOrigin(origin string) bool {
	if strings.HasPrefix(origin, "chrome-extension://") {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "http" || u.Host == "" {
		return false
	}
	host := u.Hostname()
	return host == "127.0.0.1" || host == "localhost"
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(true)
	_ = enc.Encode(v)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type limiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func (l *limiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cut := now.Add(-time.Minute)
	prev := l.hits[ip]
	kept := prev[:0]
	for _, t := range prev {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= 30 {
		l.hits[ip] = kept
		return false
	}
	l.hits[ip] = append(kept, now)
	return true
}
