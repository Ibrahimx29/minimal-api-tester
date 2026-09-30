package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type App struct {
	ctx     context.Context
	storage *Storage
}

func NewApp() *App {
	return &App{
		storage: NewStorage(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

type APIRequest struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type Collection struct {
	ID       string       `json:"id"`
	Name     string       `json:"name"`
	Requests []APIRequest `json:"requests"`
}

type APIResponse struct {
	StatusCode int               `json:"status_code"`
	StatusText string            `json:"status_text"`
	TimeMs     int64             `json:"time_ms"`
	SizeBytes  int               `json:"size_bytes"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	Error      string            `json:"error"`
}

// SendRequest performs the HTTP request
func (a *App) SendRequest(req APIRequest) APIResponse {
	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = bytes.NewBuffer([]byte(req.Body))
	}

	httpReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		return APIResponse{Error: err.Error()}
	}

	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	start := time.Now()
	resp, err := client.Do(httpReq)
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		return APIResponse{Error: err.Error(), TimeMs: elapsed}
	}
	defer resp.Body.Close()

	const maxResponseBytes = 10 << 20
	respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
	if readErr != nil {
		return APIResponse{Error: "failed to read response: " + readErr.Error(), TimeMs: time.Since(start).Milliseconds()}
	}
	if len(respBody) > maxResponseBytes {
		return APIResponse{Error: "response body exceeds 10 MB limit", TimeMs: time.Since(start).Milliseconds()}
	}
	elapsed = time.Since(start).Milliseconds()

	respHeaders := make(map[string]string)
	for k, v := range resp.Header {
		respHeaders[k] = strings.Join(v, ", ")
	}

	return APIResponse{
		StatusCode: resp.StatusCode,
		StatusText: resp.Status,
		TimeMs:     elapsed,
		SizeBytes:  len(respBody),
		Headers:    respHeaders,
		Body:       string(respBody),
	}
}

// Collection Bindings
func (a *App) SaveCollections(collections []Collection) error {
	return a.storage.SaveData("collections.json", collections)
}

func (a *App) LoadCollections() ([]Collection, error) {
	var collections []Collection
	err := a.storage.LoadData("collections.json", &collections)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if collections == nil {
		return []Collection{}, nil
	}
	return collections, nil
}
