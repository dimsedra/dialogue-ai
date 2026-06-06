#!/usr/bin/env pwsh
# Start tauri dev in the background and log to .tauri-dev.log.

$ErrorActionPreference = "Stop"
$repo = "D:\Project Hub\dialogue-ai"
$logFile = Join-Path $repo ".tauri-dev.log"
$errFile = Join-Path $repo ".tauri-dev.err"
$pidFile = Join-Path $repo ".tauri-dev.pid"

# Clear previous logs.
"" | Set-Content -Path $logFile
"" | Set-Content -Path $errFile

# Build the command line as a single string so Start-Process parses quoting correctly.
$scriptPath = Join-Path $repo "scripts\dev-tauri.ps1"
$argLine = "-NoLogo -NoProfile -File `"$scriptPath`" dev"

Write-Host "Starting: pwsh $argLine"
$proc = Start-Process -FilePath "pwsh" `
    -ArgumentList $argLine `
    -WorkingDirectory $repo `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $errFile `
    -PassThru `
    -WindowStyle Hidden

$proc.Id | Set-Content -Path $pidFile
Write-Host "PID: $($proc.Id)"
Write-Host "Log: $logFile"
Write-Host "Err: $errFile"
