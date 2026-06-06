# Copy this file to scripts/local/start-runner.local.ps1.
# Do not commit the .local.ps1 copy and do not paste bot tokens here.

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envFile = Join-Path $repoRoot ".env.local"

function Import-LocalEnvFile {
  param([string] $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "Optional env file not found: .env.local"
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) { return }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($name) { Set-Item -Path "Env:$name" -Value $value }
  }

  Write-Host "Loaded local runner env file: .env.local"
}

Import-LocalEnvFile -Path $envFile

$env:NODE_OPTIONS = "--dns-result-order=ipv4first"

Push-Location $repoRoot
try {
  Write-Host "Starting local Telegram runner"
  node runner/telegram-local-runner.js
} finally {
  Pop-Location
}
