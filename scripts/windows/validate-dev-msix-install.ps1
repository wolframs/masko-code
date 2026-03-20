param(
  [switch]$ExpectInstalled
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$metadataPath = Join-Path $repoRoot "packaging\windows\package-metadata.json"
$metadata = Get-Content $metadataPath | ConvertFrom-Json
$installed = Get-AppxPackage -Name $metadata.identityName -ErrorAction SilentlyContinue

if ($ExpectInstalled -and -not $installed) {
  throw "Expected package $($metadata.identityName) to be installed, but it was not found."
}

if (-not $ExpectInstalled -and $installed) {
  throw "Expected package $($metadata.identityName) to be absent, but it is still installed."
}

if ($installed) {
  $manifest = Get-AppxPackageManifest -Package $installed.PackageFullName
  $protocolNames = @($manifest.Package.Applications.Application.Extensions.Extension.Protocol.Name)
  Write-Host "[masko-msix] package present: $($installed.PackageFullName)"
  Write-Host "[masko-msix] install location: $($installed.InstallLocation)"
  Write-Host "[masko-msix] protocols: $($protocolNames -join ', ')"
} else {
  Write-Host "[masko-msix] package absent: $($metadata.identityName)"
}
