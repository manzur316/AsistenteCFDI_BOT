param(
  [string]$Container = "cfdi-postgres",
  [string]$Database = "cfdi_bot",
  [string]$User = "cfdi_bot_user"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$sql012 = Join-Path $repoRoot "sql\012_provider_client_sync_foundation.sql"
$sql013 = Join-Path $repoRoot "sql\013_shared_bot_access_subscription_foundation.sql"

function Invoke-PsqlScalar {
  param([string]$Sql)
  $result = docker exec -i $Container psql -U $User -d $Database -tAc $Sql
  return ($result -join "`n").Trim()
}

function Invoke-PsqlFile {
  param([string]$Path)
  Get-Content -LiteralPath $Path | docker exec -i $Container psql -U $User -d $Database
}

function Test-TableExists {
  param([string]$TableName)
  $escaped = $TableName.Replace("'", "''")
  $count = Invoke-PsqlScalar "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$escaped';"
  return $count -eq "1"
}

Write-Output "Validando PostgreSQL local en contenedor '$Container'..."
docker exec -i $Container psql -U $User -d $Database -c "SELECT now();" | Out-Host

$providerTableReady = Test-TableExists "provider_client_links"

if ($providerTableReady) {
  Write-Output "Aplicando sql/012_provider_client_sync_foundation.sql..."
  Invoke-PsqlFile $sql012 | Out-Host
} else {
  Write-Output "SKIP 012: falta la tabla provider_client_links. Aplica primero sql/009_provider_multitenant_foundation.sql si corresponde a tu entorno local."
}

Write-Output "Aplicando sql/013_shared_bot_access_subscription_foundation.sql..."
Invoke-PsqlFile $sql013 | Out-Host

$tables = @(
  "provider_client_links",
  "channel_identities",
  "tenant_memberships",
  "tenant_subscriptions",
  "tenant_entitlements",
  "invitation_tokens",
  "usage_credit_ledger"
)

$inList = ($tables | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ","
$validationSql = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ($inList) ORDER BY table_name;"
Write-Output "Tablas encontradas:"
docker exec -i $Container psql -U $User -d $Database -c $validationSql | Out-Host

if (-not $providerTableReady) {
  Write-Output "Resultado: parcial. 013 aplicado/validado; 012 no aplicado porque falta provider_client_links."
  exit 2
}

Write-Output "Resultado: OK. 012 y 013 aplicados/validados sin borrar datos."
