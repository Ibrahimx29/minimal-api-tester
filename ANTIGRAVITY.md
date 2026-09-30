# ANTIGRAVITY.md — Project Reference for AI Assistant

> File ini adalah referensi bagi Antigravity AI untuk memahami project ini secara menyeluruh.
> Perbarui file ini setiap kali ada perubahan arsitektur, konvensi, atau keputusan desain yang signifikan.

---

## 📌 Project Overview

**Nama:** Minimal API Tester  
**Deskripsi:** Aplikasi desktop ringan untuk melakukan HTTP request (seperti Postman versi minimal), dibangun dengan Wails v2.  
**Author:** Ibrahim (ibrahim@ega-id.com)  
**Platform Target:** Windows (desktop app)

---

## 🛠️ Tech Stack

| Layer        | Teknologi                        |
|--------------|----------------------------------|
| Backend      | Go (Golang) `go 1.25.0`          |
| Frontend     | Vanilla JS + Vite `^7.0.0`       |
| Desktop Framework | Wails v2 `v2.14.0`          |
| Storage      | JSON flat-file (via `os.UserConfigDir`) |
| Styling      | Vanilla CSS (tanpa framework)    |

---

## 📁 Struktur Direktori

```
minimal-api-tester/
├── main.go              # Entry point Wails app (window config, binding)
├── app.go               # Logika utama: SendRequest, SaveCollections, LoadCollections
├── storage.go           # Utility baca/tulis JSON ke UserConfigDir
├── version.go           # Versi app (diisi via ldflags saat build)
├── build.ps1            # Build script dengan versioning + NSIS installer
├── go.mod / go.sum      # Go module dependencies
├── wails.json           # Konfigurasi Wails (build, dev, author, productVersion)
├── frontend/
│   ├── index.html       # HTML entry point
│   ├── package.json     # Vite config & deps
│   ├── src/
│   │   ├── main.js      # Logika UI utama (JavaScript)
│   │   ├── collectionImport.js # Parser Postman Collection JSON
│   │   ├── app.css      # Style komponen
│   │   └── style.css    # Style global
│   └── wailsjs/         # Auto-generated bindings dari Wails (jangan diedit manual)
└── build/               # Output build desktop
```

---

## ⚡ Development Commands

### Menjalankan aplikasi (mode dev dengan hot reload)
```bash
wails dev
```
- Frontend hot reload via Vite
- Backend Go otomatis di-rebuild saat file `.go` berubah
- Browser dev mode tersedia di: `http://localhost:34115`

### Build production (executable saja)
```powershell
.\build.ps1
# atau dengan versi spesifik:
.\build.ps1 -Version "1.2.0"
```
- Output: `build/bin/minimal-api-tester.exe`
- Otomatis update `wails.json` productVersion
- Otomatis inject versi ke binary via `-ldflags`

### Build Windows Installer (NSIS .exe setup)
```powershell
.\build.ps1 -Version "1.2.0" -Installer
```
- Output: `build/bin/minimal-api-tester-amd64-installer.exe`
- Installer otomatis uninstall versi lama sebelum install versi baru
- Butuh NSIS terinstall: https://nsis.sourceforge.io/Download

### Install frontend dependencies
```bash
cd frontend && npm install
```

## 🔢 Versioning

- Format: **MAJOR.MINOR.PATCH** (SemVer)
- Versi disimpan di dua tempat:
  1. `wails.json` → field `info.productVersion` (metadata exe & installer)
  2. Go binary → variable `version` di `version.go`, di-inject via ldflags
- `build.ps1` menyinkronkan keduanya secara otomatis
- Frontend bisa baca versi via `GetVersion()` binding

### Alur update versi:
```
1. Buat perubahan code
2. Jalankan: .\build.ps1 -Version "X.Y.Z" -Installer
3. Distribusikan file installer dari build\bin\
4. User cukup jalankan installer baru — versi lama otomatis tertimpa
```

---

## 🔗 Backend Bindings (Go → JS)

Semua method publik pada struct `App` di `app.go` secara otomatis di-expose ke frontend oleh Wails.

| Go Method | Signature | Deskripsi |
|---|---|---|
| `SendRequest` | `(req APIRequest) APIResponse` | Eksekusi HTTP request |
| `SaveCollections` | `(collections []Collection) error` | Simpan daftar collection ke disk; error diteruskan ke frontend |
| `LoadCollections` | `() ([]Collection, error)` | Muat daftar collection; JSON rusak dilaporkan sebagai error |

### Cara panggil dari JS (via auto-generated bindings di `wailsjs/`)
```js
import { SendRequest, SaveCollections, LoadCollections } from '../wailsjs/go/main/App';

const response = await SendRequest({ method: 'GET', url: 'https://...', headers: {}, body: '' });
```

---

## 🗃️ Data Types

### `Collection`
```go
type Collection struct {
    ID       string       `json:"id"`
    Name     string       `json:"name"`
    Requests []APIRequest `json:"requests"`
}
```

### `APIRequest`
```go
type APIRequest struct {
    ID      string            `json:"id"`
    Name    string            `json:"name"`
    Method  string            `json:"method"`   // GET, POST, PUT, DELETE, HEAD, OPTIONS
    URL     string            `json:"url"`
    Headers map[string]string `json:"headers"`
    Body    string            `json:"body"`
}
```

### `APIResponse`
```go
type APIResponse struct {
    StatusCode int               `json:"status_code"`
    StatusText string            `json:"status_text"`
    TimeMs     int64             `json:"time_ms"`
    SizeBytes  int               `json:"size_bytes"`
    Headers    map[string]string `json:"headers"`
    Body       string            `json:"body"`
    Error      string            `json:"error"`  // Non-empty jika ada error
}
```

---

## 💾 Storage

- Data disimpan di: `%APPDATA%\MinimalAPITester\` (via `os.UserConfigDir()`)
- Format: JSON indent
- File yang digunakan:
  - `collections.json` — menyimpan daftar `APIRequest`

Jangan hardcode path storage; selalu gunakan `Storage` struct dari `storage.go`.

---

## 🎨 Frontend Conventions

- **Framework:** Tidak ada (Vanilla JS). Tidak perlu React/Vue/dll.
- **Styling:** Vanilla CSS. Gunakan CSS custom properties untuk theming.
- **Bundler:** Vite
- **Wails bindings:** Selalu import dari `../wailsjs/go/main/App` — file ini auto-generated, **jangan diedit manual**.
- **Import collection:** File Postman JSON dibaca di frontend dan dipetakan ke model `Collection`; variabel yang punya nilai disubstitusi, sedangkan variabel kosong dilaporkan di UI.
- **HTTP Timeout:** 30 detik (dikonfigurasi di `app.go`)
- **Batas respons:** 10 MB; error baca respons dan respons terlalu besar ditampilkan sebagai error

---

## 🧩 Arsitektur Pattern

```
[Frontend JS] → [Wails Bridge] → [Go App Methods] → [HTTP Client / Storage]
```

- Frontend **tidak** melakukan HTTP request langsung — semua melalui Go backend via Wails.
- Go backend **stateless per request**: setiap `SendRequest` membuat `http.Client` baru.
- Storage **tidak menggunakan database** — cukup JSON file untuk scope minimal ini. Penulisan menggunakan file sementara lalu rename agar data lama tetap utuh jika penulisan gagal.

---

## ✅ Coding Conventions

### Go
- Gunakan `gofmt` untuk formatting
- Error handling: kembalikan error sebagai field `Error string` dalam response struct (tidak panic)
- Semua method yang di-bind ke Wails harus berada di `app.go`
- Utility/helper yang tidak di-bind ke Wails, taruh di file `.go` terpisah (contoh: `storage.go`)

### JavaScript
- Gunakan `async/await` untuk semua call ke Wails binding
- Selalu handle error dari response (`if (response.error)`)
- Tidak perlu transpiler/TypeScript — cukup ES modules modern

### CSS
- Gunakan CSS custom properties (`--var-name`) untuk warna dan ukuran yang berulang
- File `style.css` untuk reset/global, `app.css` untuk komponen spesifik

---

## 🚫 Yang Tidak Boleh Dilakukan

- **Jangan edit file di `frontend/wailsjs/`** — auto-generated oleh Wails CLI
- **Jangan gunakan database** (SQLite, dll.) kecuali diminta — scope proyek adalah minimal
- **Jangan tambahkan framework JS** (React, Vue, Svelte) kecuali ada keputusan eksplisit
- **Jangan hardcode path file** — selalu gunakan `os.UserConfigDir()` atau `filepath.Join`
- **Jangan lupa** jalankan `wails dev` (bukan `npm run dev` langsung) untuk development penuh

---

## 🔄 Cara Update File Ini

Perbarui `ANTIGRAVITY.md` setiap kali:
1. Menambahkan Go method baru yang di-bind ke Wails
2. Mengubah struktur data (`APIRequest` / `APIResponse`)
3. Menambahkan file storage baru
4. Mengubah konvensi coding atau arsitektur
5. Menambahkan dependency baru (Go module atau npm package)
