$ErrorActionPreference = "Stop"

param(
  [switch]$RemoveAppData,
  [switch]$RemoveClaudeHooks,
  [switch]$RemoveProtocolRegistration
)

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$appDataRoot = Join-Path $env:APPDATA "masko-code-win64"
$homeMaskoRoot = Join-Path $HOME ".masko-code-win64"
$claudeSettingsPath = Join-Path $HOME ".claude\settings.json"
$hookPath = Join-Path $homeMaskoRoot "hooks\hook-sender.ps1"
$protocolKey = "HKCU:\Software\Classes\masko"

Write-Host "[masko-dev-uninstall] repo: $repoRoot"

Get-Process | Where-Object { $_.ProcessName -like "*electron*" -or $_.ProcessName -like "*masko*" } | Stop-Process -Force -ErrorAction SilentlyContinue

if ($RemoveClaudeHooks -and (Test-Path $claudeSettingsPath)) {
  Write-Host "[masko-dev-uninstall] removing Masko Claude hook registrations"
  $nodeScript = @"
import fs from 'node:fs';
import { removeMaskoHookRegistrations } from './apps/windows-shell/services/claude-hook-cleanup.js';
const settingsPath = process.argv[2];
const hookPath = process.argv[3];
const raw = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '{}';
const parsed = JSON.parse(raw);
const result = removeMaskoHookRegistrations(parsed, hookPath);
fs.writeFileSync(settingsPath, JSON.stringify(result.updated, null, 2));
console.log(JSON.stringify({ changed: result.changed, removedEvents: result.removedEvents }));
"@
  $tempScript = Join-Path $repoRoot ".tmp\dev-uninstall-hook-cleanup.mjs"
  New-Item -ItemType Directory -Force -Path (Split-Path $tempScript) | Out-Null
  Set-Content -Path $tempScript -Value $nodeScript -Encoding UTF8
  node $tempScript $claudeSettingsPath $hookPath
  Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
}

if (Test-Path $hookPath) {
  Write-Host "[masko-dev-uninstall] removing hook script path $hookPath"
  Remove-Item $hookPath -Force -ErrorAction SilentlyContinue
}

if ($RemoveAppData) {
  if (Test-Path $appDataRoot) {
    Write-Host "[masko-dev-uninstall] removing app data $appDataRoot"
    Remove-Item $appDataRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $homeMaskoRoot) {
    Write-Host "[masko-dev-uninstall] removing home data $homeMaskoRoot"
    Remove-Item $homeMaskoRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($RemoveProtocolRegistration -and (Test-Path $protocolKey)) {
  Write-Host "[masko-dev-uninstall] removing HKCU masko protocol registration"
  Remove-Item $protocolKey -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "[masko-dev-uninstall] completed"
Write-Host "Options used:"
Write-Host "  RemoveAppData=$RemoveAppData"
Write-Host "  RemoveClaudeHooks=$RemoveClaudeHooks"
Write-Host "  RemoveProtocolRegistration=$RemoveProtocolRegistration"
