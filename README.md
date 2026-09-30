# Minimal API Tester

A small Windows desktop app for sending HTTP requests and saving them in collections. Built with Wails v2, Go, and vanilla JavaScript.

## Development

Requirements: Go, Node.js, npm, and Wails CLI.

```powershell
cd frontend
npm install
cd ..
wails dev
```

Run checks:

```powershell
cd frontend
npm test
npm run build
cd ..
go test ./...
```

The Go test command needs `frontend/dist`, so build the frontend first. On PowerShell systems that block `npm.ps1`, use `npm.cmd` in the commands above.

## Build

```powershell
.\build.ps1 -Version "1.0.1"
```

Add `-Installer` to build an NSIS installer when NSIS is installed. The executable is written to `build/bin`.

## Data and request behavior

Collections are stored in `%APPDATA%\MinimalAPITester\collections.json`. This file can contain authentication headers and other secrets; keep access to it restricted. Save updates the selected request and preserves its ID. Choosing another collection in the Save dialog moves that request there.

The URL query is shown in the Params tab when a request is loaded or the URL field changes. Changes to Params are included when sending or saving. The response body is limited to 10 MB; larger responses and incomplete reads are reported as errors. Request timeout is 30 seconds.
