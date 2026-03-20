param(
  [string]$PackagePath = ".\packaging\windows\out\MaskoCode-dev.msix",
  [switch]$ForceShutdown,
  [switch]$LaunchAfterInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedPackagePath = Join-Path $repoRoot $PackagePath
$metadataPath = Join-Path $repoRoot "packaging\windows\package-metadata.json"

if (-not (Test-Path $resolvedPackagePath)) {
  throw "MSIX package was not found at $resolvedPackagePath"
}

$metadata = Get-Content $metadataPath | ConvertFrom-Json
$existing = Get-AppxPackage -Name $metadata.identityName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "[masko-msix] existing package detected; removing before install"
  foreach ($pkg in $existing) {
    Remove-AppxPackage -Package $pkg.PackageFullName
  }
}

$installArgs = @{
  Path = $resolvedPackagePath
}

if ($ForceShutdown) {
  $installArgs["ForceApplicationShutdown"] = $true
}

Add-AppxPackage @installArgs
Write-Host "[masko-msix] installed $resolvedPackagePath"

$installed = Get-AppxPackage -Name $metadata.identityName -ErrorAction Stop
Write-Host "[masko-msix] installed package full name: $($installed.PackageFullName)"

if ($LaunchAfterInstall) {
  Start-Process "shell:AppsFolder\$($metadata.identityName)!$($metadata.applicationId)"
}
