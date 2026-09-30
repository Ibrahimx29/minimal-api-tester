package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Storage struct {
	configDir string
	initErr   error
}

func NewStorage() *Storage {
	dir, err := os.UserConfigDir()
	if err != nil {
		return &Storage{initErr: err}
	}
	appDir := filepath.Join(dir, "MinimalAPITester")
	return &Storage{configDir: appDir}
}

func (s *Storage) SaveData(filename string, data interface{}) error {
	if s.initErr != nil {
		return s.initErr
	}
	path := filepath.Join(s.configDir, filename)
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.configDir, 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.configDir, ".collections-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(bytes); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

func (s *Storage) LoadData(filename string, dest interface{}) error {
	if s.initErr != nil {
		return s.initErr
	}
	path := filepath.Join(s.configDir, filename)
	bytes, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(bytes, dest)
}
