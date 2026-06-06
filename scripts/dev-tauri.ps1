# Dialogue Tauri dev wrapper (Windows)
#
# Problem: VS Build Tools 2019 ships `link.exe` and the MSVC toolchain, but cargo
# spawned from a vanilla pwsh doesn't inherit those env vars. Tauri 2.x on Windows
# needs the MSVC linker, otherwise `cargo tauri dev` fails with "linker `link.exe`
# not found".
#
# Fix: source `vcvars64.bat` in a cmd subshell, then re-export the resulting env vars
# back into pwsh and run the requested cargo command.
#
# Usage:
#   pwsh scripts/dev-tauri.ps1 dev
#   pwsh scripts/dev-tauri.ps1 build
#
# Requires:
#   - Visual Studio Build Tools 2019+ with the C++ workload
#   - Rust toolchain on PATH (rustup default toolchain is fine)
#   - @tauri-apps/cli installed (`npm install`)

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("dev", "build", "info", "icon")]
    [string]$Command,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TauriArgs
)

$ErrorActionPreference = "Stop"

$vcvarsCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
)

$vcvars = $vcvarsCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $vcvars) {
    throw "vcvars64.bat not found. Install Visual Studio Build Tools (2019 or 2022) with the C++ workload."
}

Write-Host ">> Sourcing $vcvars" -ForegroundColor Cyan

$cmdLine = "`"$vcvars`" && set"
$envDump = cmd /c $cmdLine
foreach ($line in $envDump) {
    if ($line -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        if ($name -in @(
            "PATH", "INCLUDE", "LIB", "LIBPATH",
            "VCINSTALLDIR", "VCToolsInstallDir", "VSINSTALLDIR",
            "WindowsSdkDir", "WindowsSDKVersion",
            "UCRTVersion", "UniversalCRTSdkDir",
            "DevEnvDir", "FrameworkDir", "FrameworkVersion",
            "FrameworkDir64", "FrameworkVersion64"
        )) {
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "cargo not found on PATH after PATH update. Install Rust via rustup or winget install Rustlang.Rustup."
}

Write-Host ">> cargo: $(& cargo --version)" -ForegroundColor Cyan
Write-Host ">> rustc: $(& rustc --version)" -ForegroundColor Cyan
Write-Host ">> MSVC: $env:VCToolsInstallDir" -ForegroundColor Cyan
Write-Host ">> Windows SDK: $env:WindowsSdkDir$env:WindowsSDKVersion" -ForegroundColor Cyan
Write-Host ""

Push-Location $PSScriptRoot\..
try {
    Write-Host ">> npx tauri $Command $($TauriArgs -join ' ')" -ForegroundColor Green
    & npx tauri $Command @TauriArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
