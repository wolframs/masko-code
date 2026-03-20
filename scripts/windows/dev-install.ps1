$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

Write-Host "[masko-dev-install] repo: $repoRoot"

Write-Host "[masko-dev-install] installing npm workspaces"
npm install

Write-Host "[masko-dev-install] running tests"
npm test

Write-Host "[masko-dev-install] starting windows shell once so protocol/login/runtime state can initialize"
$env:MASKO_SMOKE_TEST_MS = "3000"
npm run smoke:windows-shell
Remove-Item Env:\MASKO_SMOKE_TEST_MS -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[masko-dev-install] completed"
Write-Host "Next steps:"
Write-Host "  1. Run 'npm --workspace @masko/windows-shell run start' for interactive use."
Write-Host "  2. Open Diagnostics in the app and install Claude hooks for the current Windows profile."
Write-Host "  3. If you test website handoff later, verify masko:// links open this app instance."
