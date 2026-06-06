# Copy this file to scripts/local/start-n8n-pac-sandbox.local.ps1.
# Do not commit the .local.ps1 copy and do not paste secrets in this example.

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envFile = Join-Path $repoRoot ".env.pac.sandbox.local"

function Import-LocalEnvFile {
  param([string] $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "Optional env file not found: .env.pac.sandbox.local"
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

  Write-Host "Loaded local sandbox env file: .env.pac.sandbox.local"
}

Import-LocalEnvFile -Path $envFile

# Force IPv4 first. This avoids observed Telegram timeouts caused by IPv6 DNS
# resolution on the local n8n + Telegram runner setup.
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"

# Legacy local workflows still use Code Nodes with fs/path. Keep this enabled
# only for the local trusted machine.
$env:NODE_FUNCTION_ALLOW_BUILTIN = "fs,path"

$env:N8N_PORT = "5678"

# Stable local mode for this workflow. Keep runners disabled unless a later
# phase explicitly changes the supported topology.
$env:N8N_RUNNERS_ENABLED = "false"

# Execute Command is required locally because the supported workflow invokes the
# Action Layer through an allowlisted command:
# node scripts/run-sandbox-action.js <sandbox action>
# If you use NODES_EXCLUDE locally, it must NOT include:
# n8n-nodes-base.executeCommand
if ($env:NODES_EXCLUDE -and $env:NODES_EXCLUDE -match "n8n-nodes-base\.executeCommand") {
  throw "NODES_EXCLUDE blocks n8n-nodes-base.executeCommand. Remove it for local sandbox tests."
}

Write-Host "Preflight Action Layer check: node scripts/run-sandbox-action.js sandbox.preflight"
Push-Location $repoRoot
try {
  node scripts/run-sandbox-action.js sandbox.preflight
  Write-Host "Starting n8n on http://127.0.0.1:$env:N8N_PORT"
  n8n start
} finally {
  Pop-Location
}
