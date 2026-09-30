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
.\build.ps1 -Version "1.1.0"
```

Add `-Installer` to build an NSIS installer when NSIS is installed. The executable is written to `build/bin`.

## Release

This project uses Wails to generate Windows resources from `wails.json` and `build/windows/info.json`. The version is also injected into `main.version` by `build.ps1`. A separate `go-winres` step is not needed for this Wails app.

1. Update `CHANGELOG.md` and `wails.json` to the new version, then run the checks above.
2. Commit the source changes and create an annotated tag such as `v1.1.0` on that commit.
3. Run `.\build.ps1 -Version "1.1.0" -Installer` and verify the executable version:

   ```powershell
   (Get-Item .\build\bin\minimal-api-tester.exe).VersionInfo | Select-Object FileVersion, ProductVersion
   ```

4. Push the branch and tag after reviewing the release artifacts.

## Data and request behavior

Collections are stored in `%APPDATA%\MinimalAPITester\collections.json`. This file can contain authentication headers and other secrets; keep access to it restricted. Save updates the selected request and preserves its ID. Choosing another collection in the Save dialog moves that request there.

The URL query is shown in the Params tab when a request is loaded or the URL field changes. Changes to Params are included when sending or saving. The response body is limited to 10 MB; larger responses and incomplete reads are reported as errors. Request timeout can be set per request from 1 to 3600 seconds, defaults to 30 seconds, and is saved with the request.

Use the upload button beside **Collections** to import a Postman Collection JSON file. Nested folders become request name prefixes, and collection variables with values are substituted in URLs, headers, and bodies. An imported collection with an existing name gets a numeric suffix. The sidebar reports unresolved variables and any request features that need review. Postman scripts, saved responses, and multipart/file bodies are not imported.
