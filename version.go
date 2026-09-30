package main

// version diisi otomatis saat build via:
//   wails build -ldflags="-X main.version=1.2.3"
var version = "dev"

// GetVersion mengembalikan versi aplikasi ke frontend
func (a *App) GetVersion() string {
	return version
}
