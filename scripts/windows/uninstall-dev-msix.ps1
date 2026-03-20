param(
  [switch]$FailIfMissing
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$metadataPath = Join-Path $repoRoot "packaging\windows\package-metadata.json"
$metadata = Get-Content $metadataPath | ConvertFrom-Json

$installed = Get-AppxPackage -Name $metadata.identityName -ErrorAction SilentlyContinue
if (-not $installed) {
  if ($FailIfMissing) {
    throw "No installed package found for $($metadata.identityName)"
  }
  Write-Host "[masko-msix] no installed package found for $($metadata.identityName)"
  exit 0
}

foreach ($pkg in $installed) {
  Remove-AppxPackage -Package $pkg.PackageFullName
  Write-Host "[masko-msix] removed $($pkg.PackageFullName)"
}
