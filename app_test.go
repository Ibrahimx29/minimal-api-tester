package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSendRequest(t *testing.T) {
	t.Run("normal response", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("ok"))
		}))
		defer server.Close()
		response := NewApp().SendRequest(APIRequest{Method: "GET", URL: server.URL})
		if response.Error != "" || response.StatusCode != 200 || response.Body != "ok" || response.SizeBytes != 2 {
			t.Fatalf("unexpected response: %+v", response)
		}
	})

	t.Run("truncated response", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Length", "10")
			w.Write([]byte("short"))
		}))
		defer server.Close()
		response := NewApp().SendRequest(APIRequest{Method: "GET", URL: server.URL})
		if !strings.Contains(response.Error, "failed to read response") {
			t.Fatalf("expected body read error, got %+v", response)
		}
	})

	t.Run("large response", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(strings.Repeat("x", 10<<20+1)))
		}))
		defer server.Close()
		response := NewApp().SendRequest(APIRequest{Method: "GET", URL: server.URL})
		if !strings.Contains(response.Error, "exceeds 10 MB") {
			t.Fatalf("expected size limit error, got %+v", response)
		}
	})
}

func TestCollectionsStorage(t *testing.T) {
	app := &App{storage: &Storage{configDir: t.TempDir()}}
	want := []Collection{{ID: "c1", Name: "Example", Requests: []APIRequest{{ID: "r1", URL: "https://example.com"}}}}
	if err := app.SaveCollections(want); err != nil {
		t.Fatal(err)
	}
	got, err := app.LoadCollections()
	if err != nil || len(got) != 1 || got[0].Requests[0].ID != "r1" {
		t.Fatalf("unexpected loaded collections: %+v, %v", got, err)
	}
	if err := app.SaveCollections([]Collection{}); err != nil {
		t.Fatal(err)
	}
	got, err = app.LoadCollections()
	if err != nil || len(got) != 0 {
		t.Fatalf("replacement failed: %+v, %v", got, err)
	}
	if err := os.WriteFile(filepath.Join(app.storage.configDir, "collections.json"), []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := app.LoadCollections(); err == nil {
		t.Fatal("expected invalid JSON to be reported")
	}
}
