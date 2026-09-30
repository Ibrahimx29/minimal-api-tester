<#
.SYNOPSIS
    Build script untuk Minimal API Tester — menghasilkan .exe dan NSIS installer (.exe setup)

.PARAMETER Version
    Versi aplikasi, format: MAJOR.MINOR.PATCH (contoh: 1.0.0)
    Default: membaca dari wails.json jika tidak disertakan

.PARAMETER Installer
    Jika disertakan, generate NSIS Windows Installer (.exe setup)
    Membutuhkan NSIS terinstall (https://nsis.sourceforge.io)

.PARAMETER SkipFrontend
    Skip build frontend (untuk iterasi cepat saat frontend tidak berubah)

.EXAMPLE
    # Build executable biasa (versi dari wails.json)
    .\build.ps1

    # Build dengan versi baru
    .\build.ps1 -Version "1.2.0"

    # Build installer NSIS
    .\build.ps1 -Version "1.2.0" -Installer

    # Build installer tanpa rebuild frontend
    .\build.ps1 -Version "1.2.0" -Installer -SkipFrontend
#>

param(
    [string]$Version = "",
    [switch]$Installer,
    [switch]$SkipFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Warna output ───────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "  > $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  WARN $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ERROR $msg" -ForegroundColor Red }

# ─── Baca wails.json ─────────────────────────────────────────────
$wailsJson = Get-Content "wails.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$appName   = $wailsJson.info.productName
$outFile   = $wailsJson.outputfilename

# Tentukan versi
if ($Version -eq "") {
    $Version = $wailsJson.info.productVersion
}

# Validasi format versi (MAJOR.MINOR.PATCH)
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Fail "Format versi tidak valid: '$Version'. Gunakan format MAJOR.MINOR.PATCH (contoh: 1.0.0)"
    exit 1
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor DarkCyan
Write-Host "   Minimal API Tester - Build Script" -ForegroundColor DarkCyan
Write-Host "===========================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  App     : $appName" -ForegroundColor White
Write-Host "  Version : $Version" -ForegroundColor White
Write-Host "  Mode    : $(if ($Installer) { 'NSIS Installer' } else { 'Executable only' })" -ForegroundColor White
Write-Host ""

# ─── Update wails.json productVersion ────────────────────────────
Write-Step "Mengupdate versi di wails.json: $Version"
$wailsJson.info.productVersion = $Version
$json = $wailsJson | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "wails.json"), $json, [System.Text.UTF8Encoding]::new($false))
Write-OK "wails.json diperbarui"

# ─── Build ───────────────────────────────────────────────────────
$ldflags = "-X main.version=$Version"
$buildArgs = @("-ldflags", $ldflags, "-clean")

if ($Installer) {
    # Cek apakah NSIS tersedia
    $nsisPath = Get-Command "makensis" -ErrorAction SilentlyContinue
    if (-not $nsisPath) {
        $nsisDefault = "C:\Program Files (x86)\NSIS\makensis.exe"
        if (Test-Path $nsisDefault) {
            $env:PATH += ";C:\Program Files (x86)\NSIS"
            Write-OK "NSIS ditemukan di: $nsisDefault"
        } else {
            Write-Warn "makensis tidak ditemukan di PATH."
            Write-Warn "Install NSIS dari: https://nsis.sourceforge.io/Download"
            Write-Warn "Melanjutkan build tanpa installer..."
            $Installer = $false
        }
    } else {
        Write-OK "NSIS ditemukan: $($nsisPath.Source)"
    }
}

if ($Installer) {
    $buildArgs += "-nsis"
    Write-Step "Building dengan NSIS installer (versi $Version)..."
} else {
    Write-Step "Building executable (versi $Version)..."
}

try {
    $wailsCommand = Get-Command "wails" -ErrorAction SilentlyContinue
    if ($wailsCommand) {
        & wails build @buildArgs
    } else {
        Write-Warn "Wails CLI tidak ada di PATH; menjalankan CLI dari modul Go v2.14.0"
        & go run "github.com/wailsapp/wails/v2/cmd/wails@v2.14.0" build @buildArgs
    }
    if ($LASTEXITCODE -ne 0) { throw "wails build gagal dengan exit code $LASTEXITCODE" }
} catch {
    Write-Fail "Build gagal: $_"
    exit 1
}

# ─── Output artifacts ────────────────────────────────────────────
Write-Host ""
Write-OK "Build selesai!"
Write-Host ""
Write-Host "  Artifacts:" -ForegroundColor White

$buildDir = Join-Path $PSScriptRoot "build\bin"
if (Test-Path $buildDir) {
    Get-ChildItem $buildDir | ForEach-Object {
        $size = "{0:N2} MB" -f ($_.Length / 1MB)
        Write-Host "  $($_.Name) ($size)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "  Versi   : v$Version" -ForegroundColor Cyan
Write-Host "  Output  : build\bin\" -ForegroundColor Cyan
Write-Host ""

# ─── Tips update ─────────────────────────────────────────────────
if ($Installer) {
    Write-Host "  Installer akan otomatis uninstall versi lama saat dijalankan di atas instalasi yang sudah ada." -ForegroundColor DarkGray
    Write-Host ""
}
