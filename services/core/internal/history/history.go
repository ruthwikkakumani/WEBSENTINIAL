package history

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"websentinel/core/internal/model"
)

// Store keeps recent case files on this machine. Paths and queries are not
// part of an assessment, so they are not in the file either.
type Store struct {
	mu    sync.Mutex
	path  string
	items []model.Assessment
}

func Open(path string) (*Store, error) {
	s := &Store{path: path, items: []model.Assessment{}}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, err
	}
	if len(b) == 0 {
		return s, nil
	}
	if err := json.Unmarshal(b, &s.items); err != nil {
		s.items = []model.Assessment{}
	}
	return s, nil
}

func (s *Store) Add(a model.Assessment) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items = append([]model.Assessment{a}, s.items...)
	if len(s.items) > 40 {
		s.items = s.items[:40]
	}
	_ = s.saveLocked()
}

func (s *Store) List() []model.Assessment {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]model.Assessment, len(s.items))
	copy(out, s.items)
	return out
}

func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items = []model.Assessment{}
	_ = s.saveLocked()
}

func (s *Store) saveLocked() error {
	b, err := json.MarshalIndent(s.items, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
