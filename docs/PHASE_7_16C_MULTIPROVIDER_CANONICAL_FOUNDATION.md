# Fase 7.16C - Multi-Provider Canonical Contracts + Tenant Fiscal Profile Foundation

## Objetivo

Crear foundation para que SATBOT Core evolucione de bot personal a arquitectura
multi-tenant + multi-provider sin casarse con Factura.com ni Facturapi.

Esta fase no implementa Facturapi completo, produccion fiscal real, webhooks,
Stripe, cobros ni UI multi-tenant.

## Terminos

- SATBOT Core
- Provider Adapter
- Canonical Provider Contracts
- Tenant Fiscal Profile
- Fiscal Activity Rules
- Provider Capabilities
- Provider Account
- Provider Client Link
- Provider Invoice Link

## Proveedores

- `factura_com`: provider actual personal/economico para Sandbox Operativo Live.
- `facturapi`: provider SaaS/comercial futuro preferente.

## Ambientes canonicos

```text
SANDBOX
TEST
LIVE
PRODUCTION
```

Mapeo:

- Factura.com Sandbox -> `SANDBOX`
- Factura.com Production futuro -> `PRODUCTION`
- Facturapi Test -> `TEST`
- Facturapi Live futuro -> `LIVE`

## Foundation implementada

### Canonical Provider Contracts

Carpeta:

```text
scripts/lib/provider-contracts/
```

Contratos:

- CanonicalProviderAccount
- CanonicalProviderClient
- CanonicalProviderInvoice
- CanonicalProviderPaymentState
- CanonicalProviderCapabilities
- CanonicalProviderWebhookEvent

### Provider Capabilities Registry

Archivo:

```text
scripts/lib/provider-capabilities-registry.js
```

Registra capacidades iniciales para:

- `factura_com` en `SANDBOX` y `PRODUCTION` futura;
- `facturapi` en `TEST` y `LIVE` futura.

### SQL aditivo

Archivo:

```text
sql/009_provider_multitenant_foundation.sql
```

Tablas:

- `satbot_tenants`
- `tenant_fiscal_profiles`
- `tenant_fiscal_activities`
- `provider_accounts`
- `provider_client_links`
- `provider_invoice_links`
- `provider_usage_ledger`
- `provider_capabilities_snapshot`

La migracion es aditiva. No borra ni renombra tablas existentes.

### Fiscal Activity Rules

Documentacion:

```text
docs/FISCAL_ACTIVITY_RULES_ARCHITECTURE.md
data/fiscal-activity-rules.example.json
```

No modifica `data/concepts.normalized.json`.

## Compatibilidad personal actual

Se define foundation para:

```text
DEFAULT_PERSONAL_TENANT_ID = TENANT_PERSONAL_DEFAULT
```

No se fuerza migracion completa. El flujo actual de Telegram, Factura.com
Sandbox Live, `sandbox.draft.stamp`, `sandbox.draft.download-artifacts` y
`sandbox.facturacom.config.diagnose` deben seguir funcionando.

## Fases futuras

### Fase A - Provider Canonical Contracts

Expandir contratos con casos reales de cada proveedor y fixtures auditados.

### Fase B - Tenant Fiscal Profile + SAT CFDI 4.0 Rules Foundation

Foundation implementada en:

- `docs/PHASE_B_TENANT_FISCAL_PROFILE_ACTIVITY_RULES.md`
- `docs/PHASE_B_SAT_CATALOG_RULE_FOUNDATION.md`
- `docs/CFDI_40_RULE_ENGINE_ARCHITECTURE.md`
- `docs/SAT_CATALOG_IMPORT_RUNBOOK.md`

Una fase posterior debe volver obligatorio el Tenant Fiscal Profile activo antes
de operar un tenant SaaS.

### Fase C - Provider Client Sync

Implementada en 7.16E para Factura.com Sandbox:

- `scripts/lib/factura-com-provider-client-mapper.js`
- `scripts/lib/factura-com-sandbox-client-adapter.js`
- `scripts/lib/provider-client-sync-action.js`
- `sql/012_provider_client_sync_foundation.sql`

El timbrado sandbox live normal usa `provider_client_links.provider_client_uid`.
`FACTURACOM_SANDBOX_RECEIVER_UID` queda solo como fallback legacy/test con
bandera explicita.

### Fase D - Factura.com Adapter Cleanup under Contracts

Encapsular totalmente Factura.com bajo Canonical Provider Contracts.

### Fase E - Facturapi Adapter Skeleton

Crear adapter skeleton sin llamadas live/test reales hasta gate explicito.

### Fase F - Multi-tenant SaaS Provider Accounts

Separar cuentas, credenciales cifradas y roles por tenant.

### Fase G - Usage Ledger / Credits / Timbres

Crear ledger local para consumo, creditos, timbres y conciliacion comercial.

### Fase H - Webhooks / Reconciliation

Procesar eventos provider y reconciliar estado local.

## No-go

- No Facturapi HTTP client.
- No Facturapi API keys.
- No Facturapi live/test calls.
- No produccion fiscal real.
- No `stampProduction`.
- No partner billing.
- No Stripe.
- No webhooks.
- No cifrado real de credenciales todavia.
- No UI multi-tenant.
- No cambios a `data/concepts.normalized.json`.

## Criterio de salida

- Contratos canonicos versionables creados.
- Provider Capabilities Registry creado.
- SQL aditivo creado.
- Fiscal Activity Rules documentado.
- Tests foundation PASS.
- Regresion del flujo personal actual PASS.
