# QA Scripts Audit Report

Fecha: 2026-06-11
Alcance: `scripts/`, `scripts/qa/`, `scripts/lib/` y subcarpetas recursivas.
Modo: auditoria estatica. No se ejecutaron scripts de test, smoke, watcher, sync, workflow ni n8n.

## 1. Resumen Ejecutivo

Se inventariaron 424 archivos bajo `scripts/`: 409 .js, 8 .ps1, 6 .bat, 1 .json.
La carpeta combina contratos/regresiones, helpers de dominio, herramientas QA locales, wrappers SAFE, analizadores/reportes, acciones sandbox y clientes/adaptadores de PAC. La consolidacion futura debe hacerse por envoltura primero, no moviendo archivos de entrada, porque hay rutas con efectos reales o locales: n8n, Telegram, Postgres, runtime/artifacts y Factura.com sandbox/live.

Lectura de `UNKNOWN`: no se pudo confirmar con nombre/imports/codigo suficiente; no implica que el script este roto.

Resumen por categoria:
- TEST_REGRESSION: 279
- HELPER_LIB: 85
- LOCAL_WRAPPER: 14
- ANALYZER: 10
- WORKFLOW_SYNC: 6
- GENERATOR: 5
- QA_SCENARIO: 3
- UNKNOWN: 3
- EXPORTER: 2
- IMPORTER: 2
- QA_CLIENT: 2
- REVIEWER: 2
- SMOKE: 2
- BUILDER: 1
- FIXTURE: 1
- PREFLIGHT: 1
- PROPOSER: 1
- QA_ASSERTION_HELPER: 1
- QA_HARNESS: 1
- RUNNER_CLI: 1
- STORAGE_TOOL: 1
- WATCHER: 1

## 2. Inventario Total de Scripts

| Extension | Cantidad |
|---|---:|
| .js | 409 |
| .ps1 | 8 |
| .bat | 6 |
| .json | 1 |

| Grupo funcional | Cantidad |
|---|---:|
| Factura.com sandbox / PAC | 145 |
| otros/UNKNOWN | 89 |
| helpers compartidos | 33 |
| Telegram UI / botones / callbacks | 27 |
| scoring/catalogs | 23 |
| CFDI canonical contracts | 22 |
| SQL / JSON persistence | 21 |
| workflow sync/status | 21 |
| security/access | 18 |
| analyzers/inspectors | 12 |
| wrappers locales | 8 |
| storage sandbox | 3 |
| repo safety | 2 |

## 3. Tabla por Script

Columnas: `Mode` distingue inferencia offline/local/live; `Touch` usa `R` runtime, `N` n8n/workflow, `T` Telegram, `P` PAC/Factura/provider; `IO` es lectura/escritura detectada; `Env` indica uso de variables de entorno o `.env`.

| Ruta | Tipo probable | Proposito | Tags | Mode | Touch | IO | Env | scripts/lib imports | Relacion | Riesgo | Recomendacion |
|---|---|---|---|---|---|---|---|---|---|---|---|
| scripts/analyze-activity-scope-shadow-log.js | ANALYZER | Analizador offline/QA para activity scope shadow log | analyzer, runtime/storage, catalog/scoring/cfdi | OFFLINE_STATIC | R | R | NO | - | activity-scope-shadow-log (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/analyze-factura-com-sandbox-results.js | ANALYZER | Analizador offline/QA para factura com sandbox results | analyzer, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | R | YES | factura-com-live-client | factura-com-sandbox (4) | HIGH | WRAP_IN_RUNNER |
| scripts/analyze-sandbox-accountant-checklist.js | ANALYZER | Analizador offline/QA para sandbox accountant checklist | analyzer, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-accountant-checklist | sandbox-accountant-checklist (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/analyze-sandbox-accountant-excel.js | ANALYZER | Analizador offline/QA para sandbox accountant excel | analyzer, sandbox, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | - | NO | sandbox-accountant-excel | sandbox-accountant-excel (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/analyze-sandbox-accountant-package.js | ANALYZER | Analizador offline/QA para sandbox accountant package | analyzer, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R | NO | sandbox-accountant-package | sandbox-accountant-package (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/analyze-sandbox-action-audit.js | ANALYZER | Analizador offline/QA para sandbox action audit | auditor, analyzer, sandbox, telegram, pac/provider, db/sql +1 | SANDBOX_OR_MOCK | RTP | R | YES | - | sandbox-action (5) | HIGH | WRAP_IN_RUNNER |
| scripts/analyze-sandbox-action-result.js | ANALYZER | Analizador offline/QA para sandbox action result | analyzer, sandbox, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | - | NO | sandbox-action-runner | sandbox-action (5) | MEDIUM | WRAP_IN_RUNNER |
| scripts/analyze-sandbox-reporting.js | ANALYZER | Analizador offline/QA para sandbox reporting | analyzer, sandbox, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R | NO | sandbox-reporting-engine | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/analyze-storage-sandbox.js | ANALYZER | Analizador offline/QA para storage sandbox | analyzer, sandbox, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R | NO | sandbox-storage-engine | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/analyze-telegram-bot-latency.js | ANALYZER | Analizador offline/QA para telegram bot latency | analyzer, workflow/n8n, telegram, pac/provider, db/sql, runtime/storage +1 | LIVE_CAPABLE | RNTP | R/W | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/audit-catalog-gaps.js | UNKNOWN | UNKNOWN | auditor, workflow/n8n, pac/provider, security/access, catalog/scoring/cfdi | LOCAL_INTEGRATION | NP | R/W | NO | - | - | HIGH | UNKNOWN |
| scripts/build-cfdi40-knowledge-base.js | BUILDER | Constructor/generador de base para cfdi40 knowledge base | workflow/n8n, pac/provider, db/sql, runtime/storage, security/access, catalog/scoring/cfdi | LOCAL_INTEGRATION | RNP | R/W | YES | - | cfdi40-knowledge-base (2) | HIGH | MERGE_LATER |
| scripts/export-sandbox-action-audit-review.js | EXPORTER | Exportador para sandbox action audit review | auditor, workflow/n8n, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RNP | R/W | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/export-telegram-latency-events.js | EXPORTER | Exportador para telegram latency events | workflow/n8n, telegram, db/sql, runtime/storage, catalog/scoring/cfdi | LOCAL_INTEGRATION | RNT | W | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/fixtures/n8n-execution-post-action-dispatch-missing-chat.sanitized.json | FIXTURE | Fixture/dato estatico para n8n execution post action dispatch missing chat.sanitized | workflow/n8n, sandbox, telegram, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | NTP | - | NO | - | - | HIGH | MERGE_LATER |
| scripts/generate-sandbox-accountant-checklist.js | GENERATOR | Generador de artefactos/reportes para sandbox accountant checklist | sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-accountant-checklist | sandbox-accountant-checklist (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/generate-sandbox-accountant-excel.js | GENERATOR | Generador de artefactos/reportes para sandbox accountant excel | sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-accountant-package, sandbox-accountant-excel | sandbox-accountant-excel (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/generate-sandbox-accountant-package.js | GENERATOR | Generador de artefactos/reportes para sandbox accountant package | sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R | NO | sandbox-accountant-package | sandbox-accountant-package (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/generate-sandbox-audit-signoff-checklist.js | GENERATOR | Generador de artefactos/reportes para sandbox audit signoff checklist | auditor, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | NO | - | sandbox-audit-signoff-checklist (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/generate-sandbox-monthly-report.js | GENERATOR | Generador de artefactos/reportes para sandbox monthly report | sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | NO | sandbox-reporting-engine, sandbox-storage-engine | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/import-sat-catalog.js | IMPORTER | Importador para sat catalog | pac/provider, runtime/storage, security/access, catalog/scoring/cfdi | OFFLINE_STATIC | RP | R/W | YES | - | - | MEDIUM | MERGE_LATER |
| scripts/import-sat-catalogs.js | IMPORTER | Importador para sat catalogs | runtime/storage, catalog/scoring/cfdi | OFFLINE_STATIC | R | W | NO | sat-catalogs/sat-catalog-loader | - | MEDIUM | MERGE_LATER |
| scripts/inspect-facturacom-sandbox-response-shape.js | UNKNOWN | UNKNOWN | sandbox, pac/provider, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | RP | R | NO | factura-com-live-client, cfdi-receptor-compatibility-validator | - | HIGH | UNKNOWN |
| scripts/lib/access-control/access-gate.js | HELPER_LIB | Helper/lib para access gate | helper/lib, sandbox, pac/provider, db/sql, security/access, catalog/scoring/cfdi | SANDBOX_OR_MOCK | P | - | NO | access-control/entitlements-contract, access-control/subscription-status-enums | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/access-control/channel-identity-contract.js | HELPER_LIB | Helper/lib para channel identity contract | helper/lib, telegram, security/access | OFFLINE_STATIC | T | - | NO | product-modes/product-mode-enums, access-control/subscription-status-enums | - | HIGH | KEEP_SEPARATE |
| scripts/lib/access-control/entitlements-contract.js | HELPER_LIB | Helper/lib para entitlements contract | helper/lib, sandbox, pac/provider, db/sql, security/access | SANDBOX_OR_MOCK | P | - | NO | access-control/subscription-status-enums | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/access-control/invitation-contract.js | HELPER_LIB | Helper/lib para invitation contract | helper/lib, telegram, security/access, catalog/scoring/cfdi | OFFLINE_STATIC | T | - | NO | product-modes/product-mode-enums | invitation (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/access-control/subscription-status-enums.js | HELPER_LIB | Helper/lib para subscription status enums | helper/lib, sandbox, pac/provider, db/sql, security/access | SANDBOX_OR_MOCK | P | - | NO | - | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/accountant-package-product-view.js | HELPER_LIB | Helper/lib para accountant package product view | helper/lib, sandbox, telegram, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RTP | - | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/lib/canonical-cfdi-contracts.js | HELPER_LIB | Helper/lib para canonical cfdi contracts | auditor, helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | - | YES | - | canonical-cfdi (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/canonical-draft-builder.js | HELPER_LIB | Helper/lib para canonical draft builder | helper/lib, pac/provider, catalog/scoring/cfdi | LOCAL_INTEGRATION | NTP | - | NO | canonical-cfdi-contracts, clients/client-fiscal-field-normalizer, sat-catalogs/sat-field-normalizer | canonical-draft-builder (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/canonical-invoice-builder.js | HELPER_LIB | Helper/lib para canonical invoice builder | auditor, helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | - | YES | canonical-cfdi-contracts, canonical-draft-builder | canonical-invoice-builder (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/cfdi-receptor-compatibility-validator.js | HELPER_LIB | Helper/lib para cfdi receptor compatibility validator | helper/lib, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX_OR_MOCK | P | R | NO | - | cfdi-receptor-compatibility-validator (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/cfdi-rules/cfdi-rule-contract.js | HELPER_LIB | Helper/lib para cfdi rule contract | helper/lib, pac/provider | OFFLINE_STATIC | P | - | NO | cfdi-rules/cfdi-rule-enums | cfdi-rule (2) | LOW | KEEP_SEPARATE |
| scripts/lib/cfdi-rules/cfdi-rule-engine.js | HELPER_LIB | Helper/lib para cfdi rule engine | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | cfdi-rules/cfdi-rule-enums, cfdi-rules/cfdi-rule-evaluator, cfdi-rules/cfdi-rule-registry, cfdi-rules/cfdi-rule-result | - | LOW | KEEP_SEPARATE |
| scripts/lib/cfdi-rules/cfdi-rule-enums.js | HELPER_LIB | Helper/lib para cfdi rule enums | helper/lib | OFFLINE_STATIC | - | - | NO | - | - | LOW | KEEP_SEPARATE |
| scripts/lib/cfdi-rules/cfdi-rule-evaluator.js | HELPER_LIB | Helper/lib para cfdi rule evaluator | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | cfdi-rules/cfdi-rule-enums, cfdi-rules/cfdi-rule-result | - | LOW | KEEP_SEPARATE |
| scripts/lib/cfdi-rules/cfdi-rule-registry.js | HELPER_LIB | Helper/lib para cfdi rule registry | helper/lib, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | P | - | NO | cfdi-rules/cfdi-rule-enums, cfdi-rules/cfdi-rule-contract | - | LOW | KEEP_SEPARATE |
| scripts/lib/cfdi-rules/cfdi-rule-result.js | HELPER_LIB | Helper/lib para cfdi rule result | helper/lib | OFFLINE_STATIC | - | - | NO | - | cfdi-rule (2) | LOW | KEEP_SEPARATE |
| scripts/lib/client-billing-summary-view.js | HELPER_LIB | Helper/lib para client billing summary view | helper/lib, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | YES | - | client-billing-summary-view (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/client-fiscal-normalize-diagnose-action.js | HELPER_LIB | Helper/lib para client fiscal normalize diagnose action | helper/lib, db/sql, runtime/storage | LOCAL_INTEGRATION | R | - | YES | local-db-psql-runner, clients/client-fiscal-field-normalizer | client-fiscal-normalize-diagnose (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/client-invoice-ledger-view.js | HELPER_LIB | Helper/lib para client invoice ledger view | helper/lib, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | YES | invoice-payment-status-model | client-invoice-ledger-view (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/clients/client-fiscal-field-normalizer.js | HELPER_LIB | Helper/lib para client fiscal field normalizer | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | sat-catalogs/sat-field-normalizer | client-fiscal-field-normalizer (2) | LOW | KEEP_SEPARATE |
| scripts/lib/document-delivery/canonical-document-delivery-contract.js | HELPER_LIB | Helper/lib para canonical document delivery contract | helper/lib, sandbox, telegram, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | TP | - | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/lib/document-delivery/document-delivery-ledger-store.js | HELPER_LIB | Helper/lib para document delivery ledger store | helper/lib, sandbox, telegram, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RTP | R | YES | document-delivery/canonical-document-delivery-contract, local-db-psql-runner | document-delivery-ledger-store (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/document-rendering/local-cfdi-pdf-renderer.js | HELPER_LIB | Helper/lib para local cfdi pdf renderer | helper/lib, sandbox, pac/provider, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX_OR_MOCK | RP | R/W | NO | sandbox-artifact-content-validator | local-cfdi-pdf-renderer (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/emitter-activity-scope-evaluator.js | HELPER_LIB | Helper/lib para emitter activity scope evaluator | helper/lib, workflow/n8n, security/access | LOCAL_INTEGRATION | N | - | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/lib/emitter-activity-scope-loader.js | HELPER_LIB | Helper/lib para emitter activity scope loader | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | R | NO | - | - | LOW | KEEP_SEPARATE |
| scripts/lib/emitter-activity-shadow-logger.js | HELPER_LIB | Helper/lib para emitter activity shadow logger | helper/lib, workflow/n8n, pac/provider, runtime/storage, catalog/scoring/cfdi | LOCAL_INTEGRATION | RNP | W | YES | emitter-activity-scope-loader, emitter-activity-scope-evaluator | - | HIGH | KEEP_SEPARATE |
| scripts/lib/factura-com-live-client.js | HELPER_LIB | Helper/lib para factura com live client | helper/lib, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | RP | - | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/lib/factura-com-payload-mapper.js | HELPER_LIB | Helper/lib para factura com payload mapper | helper/lib, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | P | - | YES | canonical-cfdi-contracts, cfdi-receptor-compatibility-validator, sat-catalogs/sat-field-normalizer | factura-com-payload-mapper (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/factura-com-provider-client-mapper.js | HELPER_LIB | Helper/lib para factura com provider client mapper | helper/lib, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX_OR_MOCK | P | - | NO | provider-contracts/provider-contract-index, sat-catalogs/sat-field-normalizer | factura-com-provider-client-mapper (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/factura-com-sandbox-adapter.js | HELPER_LIB | Helper/lib para factura com sandbox adapter | helper/lib, sandbox, pac/provider, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | RP | W | YES | pac-adapter-contract, factura-com-live-client, factura-com-payload-mapper, sandbox-artifact-content-validator | factura-com-sandbox (4) | HIGH | KEEP_SEPARATE |
| scripts/lib/factura-com-sandbox-client-adapter.js | HELPER_LIB | Helper/lib para factura com sandbox client adapter | helper/lib, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | P | - | YES | factura-com-live-client, factura-com-provider-client-mapper | - | HIGH | KEEP_SEPARATE |
| scripts/lib/facturacom-sandbox-config-resolver.js | HELPER_LIB | Helper/lib para facturacom sandbox config resolver | helper/lib, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | P | R | YES | - | facturacom-sandbox-config-resolver (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/fiscal-activities/concept-eligibility-engine.js | HELPER_LIB | Helper/lib para concept eligibility engine | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | - | concept-eligibility-engine (2) | LOW | KEEP_SEPARATE |
| scripts/lib/fiscal-activities/fiscal-activity-contract.js | HELPER_LIB | Helper/lib para fiscal activity contract | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | - | - | LOW | KEEP_SEPARATE |
| scripts/lib/invoice-payment-status-model.js | HELPER_LIB | Helper/lib para invoice payment status model | helper/lib, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | YES | - | invoice-payment-status-model (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/local-db-psql-runner.js | HELPER_LIB | Helper/lib para local db psql runner | helper/lib, db/sql | LOCAL_INTEGRATION | - | - | YES | - | local-db-psql (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/monthly-billing-dashboard-view.js | HELPER_LIB | Helper/lib para monthly billing dashboard view | helper/lib, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | YES | client-billing-summary-view | monthly-billing-dashboard-view (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/pac-adapter-contract.js | HELPER_LIB | Helper/lib para pac adapter contract | helper/lib, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | YES | - | pac-adapter (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/payment-status-action.js | HELPER_LIB | Helper/lib para payment status action | helper/lib, sandbox, telegram, pac/provider, db/sql | SANDBOX_OR_MOCK | TP | - | YES | invoice-payment-status-model | - | HIGH | KEEP_SEPARATE |
| scripts/lib/pdf/pdf-render-visual-checker.js | HELPER_LIB | Helper/lib para pdf render visual checker | helper/lib, runtime/storage | OFFLINE_STATIC | R | R/W | YES | - | pdf-render-visual-checker (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/product-modes/approval-policy-contract.js | HELPER_LIB | Helper/lib para approval policy contract | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | product-modes/product-mode-enums | - | LOW | KEEP_SEPARATE |
| scripts/lib/product-modes/channel-adapter-contract.js | HELPER_LIB | Helper/lib para channel adapter contract | helper/lib, telegram | OFFLINE_STATIC | T | - | NO | product-modes/product-mode-enums | - | HIGH | KEEP_SEPARATE |
| scripts/lib/product-modes/product-mode-enums.js | HELPER_LIB | Helper/lib para product mode enums | helper/lib, telegram | OFFLINE_STATIC | T | - | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/lib/provider-capabilities-registry.js | HELPER_LIB | Helper/lib para provider capabilities registry | helper/lib, sandbox, telegram, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | TP | - | NO | provider-contracts/provider-contract-index | provider-capabilities-registry (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/provider-client-link-store.js | HELPER_LIB | Helper/lib para provider client link store | helper/lib, sandbox, pac/provider, db/sql | LOCAL_INTEGRATION/SANDBOX | P | - | YES | local-db-psql-runner, factura-com-provider-client-mapper | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/provider-client-sync-action.js | HELPER_LIB | Helper/lib para provider client sync action | helper/lib, sandbox, pac/provider, db/sql | LOCAL_INTEGRATION/SANDBOX | P | - | YES | factura-com-sandbox-client-adapter, factura-com-provider-client-mapper, provider-client-link-store, local-db-psql-runner | provider-client-sync (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/provider-client/provider-client-readiness-action.js | HELPER_LIB | Helper/lib para provider client readiness action | helper/lib, sandbox, pac/provider, db/sql, runtime/storage | LOCAL_INTEGRATION/SANDBOX | RP | - | YES | local-db-psql-runner, provider-client-link-store, provider-client/provider-client-readiness-contract | provider-client-readiness (4) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/provider-client/provider-client-readiness-contract.js | HELPER_LIB | Helper/lib para provider client readiness contract | helper/lib, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | YES | provider-client-link-store, factura-com-provider-client-mapper | provider-client-readiness (4) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/provider-contracts/provider-account.contract.js | HELPER_LIB | Helper/lib para provider account.contract | helper/lib, pac/provider | OFFLINE_STATIC | P | - | YES | provider-contracts/provider-enums, provider-contracts/provider-capabilities.contract | - | LOW | KEEP_SEPARATE |
| scripts/lib/provider-contracts/provider-capabilities.contract.js | HELPER_LIB | Helper/lib para provider capabilities.contract | helper/lib, telegram, pac/provider | LIVE_CAPABLE | TP | - | YES | provider-contracts/provider-enums | - | HIGH | KEEP_SEPARATE |
| scripts/lib/provider-contracts/provider-client.contract.js | HELPER_LIB | Helper/lib para provider client.contract | helper/lib, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | P | - | YES | provider-contracts/provider-enums | - | LOW | KEEP_SEPARATE |
| scripts/lib/provider-contracts/provider-contract-index.js | HELPER_LIB | Helper/lib para provider contract index | helper/lib, pac/provider | LOCAL_INTEGRATION | P | - | NO | provider-contracts/provider-enums, provider-contracts/provider-capabilities.contract, provider-contracts/provider-account.contract, provider-contracts/provider-client.contract +3 | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/provider-contracts/provider-enums.js | HELPER_LIB | Helper/lib para provider enums | helper/lib, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | P | - | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/lib/provider-contracts/provider-invoice.contract.js | HELPER_LIB | Helper/lib para provider invoice.contract | helper/lib, pac/provider | OFFLINE_STATIC | P | - | YES | provider-contracts/provider-enums | - | LOW | KEEP_SEPARATE |
| scripts/lib/provider-contracts/provider-payment.contract.js | HELPER_LIB | Helper/lib para provider payment.contract | helper/lib, pac/provider | OFFLINE_STATIC | P | - | YES | provider-contracts/provider-enums | - | LOW | KEEP_SEPARATE |
| scripts/lib/provider-contracts/provider-webhook.contract.js | HELPER_LIB | Helper/lib para provider webhook.contract | helper/lib, pac/provider | LOCAL_INTEGRATION | P | - | YES | provider-contracts/provider-enums | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-accountant-checklist.js | HELPER_LIB | Helper/lib para sandbox accountant checklist | helper/lib, sandbox, pac/provider, db/sql, runtime/storage, security/access | SANDBOX_OR_MOCK | RP | R/W | YES | sandbox-accountant-package | sandbox-accountant-checklist (4) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-accountant-excel.js | HELPER_LIB | Helper/lib para sandbox accountant excel | helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | NO | sandbox-accountant-package | sandbox-accountant-excel (4) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-accountant-package.js | HELPER_LIB | Helper/lib para sandbox accountant package | helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | NO | sandbox-reporting-engine, sandbox-storage-engine, sandbox-accountant-excel | sandbox-accountant-package (4) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-action-runner.js | HELPER_LIB | Helper/lib para sandbox action runner | auditor, helper/lib, workflow/n8n, sandbox, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RNP | R/W | YES | sandbox-draft-cancel-action, sandbox-draft-download-artifacts-action, sandbox-draft-recover-artifact-state-action, sandbox-draft-stamp-action +9 | sandbox-action (5) | HIGH | KEEP_SEPARATE |
| scripts/lib/sandbox-artifact-content-validator.js | HELPER_LIB | Helper/lib para sandbox artifact content validator | helper/lib, sandbox, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX_OR_MOCK | RP | - | NO | - | sandbox-artifact-content-validator (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-document-delivery-action.js | HELPER_LIB | Helper/lib para sandbox document delivery action | helper/lib, sandbox, telegram, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | R | YES | sandbox-draft-stamp-action, factura-com-sandbox-adapter, sandbox-draft-download-artifacts-action, document-delivery/canonical-document-delivery-contract +3 | - | HIGH | KEEP_SEPARATE |
| scripts/lib/sandbox-draft-cancel-action.js | HELPER_LIB | Helper/lib para sandbox draft cancel action | helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | W | YES | canonical-cfdi-contracts, factura-com-sandbox-adapter, sandbox-draft-stamp-action | - | HIGH | KEEP_SEPARATE |
| scripts/lib/sandbox-draft-db-loader.js | HELPER_LIB | Helper/lib para sandbox draft db loader | helper/lib, sandbox, telegram, pac/provider, db/sql, catalog/scoring/cfdi | LOCAL_INTEGRATION/SANDBOX | TP | - | NO | local-db-psql-runner, clients/client-fiscal-field-normalizer | sandbox-draft-db-loader (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/sandbox-draft-download-artifacts-action.js | HELPER_LIB | Helper/lib para sandbox draft download artifacts action | helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | YES | canonical-cfdi-contracts, factura-com-sandbox-adapter, document-rendering/local-cfdi-pdf-renderer, sandbox-draft-stamp-persistence +1 | sandbox-draft-download-artifacts (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-draft-recover-artifact-state-action.js | HELPER_LIB | Helper/lib para sandbox draft recover artifact state action | helper/lib, sandbox, telegram, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RTP | R | YES | canonical-cfdi-contracts, sandbox-draft-db-loader, sandbox-draft-stamp-persistence, telegram-document-delivery-channel | - | HIGH | KEEP_SEPARATE |
| scripts/lib/sandbox-draft-stamp-action.js | HELPER_LIB | Helper/lib para sandbox draft stamp action | helper/lib, sandbox, pac/provider, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | RTP | W | YES | canonical-cfdi-contracts, canonical-draft-builder, canonical-invoice-builder, factura-com-sandbox-adapter +7 | sandbox-draft-stamp (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/sandbox-draft-stamp-persistence.js | HELPER_LIB | Helper/lib para sandbox draft stamp persistence | helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | - | YES | local-db-psql-runner, canonical-cfdi-contracts | sandbox-draft-stamp (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/sandbox-emitter-profile-loader.js | HELPER_LIB | Helper/lib para sandbox emitter profile loader | helper/lib, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | R | NO | cfdi-receptor-compatibility-validator | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-fiscal-profile-loader.js | HELPER_LIB | Helper/lib para sandbox fiscal profile loader | helper/lib, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | R | NO | cfdi-receptor-compatibility-validator | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-human-readable-storage-naming.js | HELPER_LIB | Helper/lib para sandbox human readable storage naming | helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | - | NO | - | sandbox-human-readable-storage-naming (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-pdf-diagnose-action.js | HELPER_LIB | Helper/lib para sandbox pdf diagnose action | helper/lib, sandbox, pac/provider, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | factura-com-sandbox-adapter, sandbox-draft-download-artifacts-action, sandbox-draft-stamp-action, pdf/pdf-render-visual-checker | - | HIGH | KEEP_SEPARATE |
| scripts/lib/sandbox-reporting-engine.js | HELPER_LIB | Helper/lib para sandbox reporting engine | helper/lib, sandbox, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R | NO | sandbox-storage-engine | sandbox-reporting-engine (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sandbox-storage-engine.js | HELPER_LIB | Helper/lib para sandbox storage engine | helper/lib, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | YES | - | sandbox-storage-engine (2) | MEDIUM | KEEP_SEPARATE |
| scripts/lib/sat-catalogs/sat-catalog-loader.js | HELPER_LIB | Helper/lib para sat catalog loader | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | R | NO | sat-catalogs/sat-source-registry, sat-catalogs/sat-catalog-normalizer | sat-catalog-loader (2) | LOW | KEEP_SEPARATE |
| scripts/lib/sat-catalogs/sat-catalog-normalizer.js | HELPER_LIB | Helper/lib para sat catalog normalizer | helper/lib, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | - | - | LOW | KEEP_SEPARATE |
| scripts/lib/sat-catalogs/sat-field-normalizer.js | HELPER_LIB | Helper/lib para sat field normalizer | helper/lib, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | P | R | NO | - | sat-field-normalizer (2) | LOW | KEEP_SEPARATE |
| scripts/lib/sat-catalogs/sat-source-registry.js | HELPER_LIB | Helper/lib para sat source registry | helper/lib, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | P | R | NO | - | sat-source-registry (2) | LOW | KEEP_SEPARATE |
| scripts/lib/sat-cfdi-rules-diagnose-action.js | HELPER_LIB | Helper/lib para sat cfdi rules diagnose action | helper/lib, pac/provider, db/sql, catalog/scoring/cfdi | OFFLINE_STATIC | P | R | NO | sat-catalogs/sat-source-registry, sat-catalogs/sat-catalog-loader, cfdi-rules/cfdi-rule-registry | - | MEDIUM | KEEP_SEPARATE |
| scripts/lib/security-access-control.js | HELPER_LIB | Helper/lib para security access control | helper/lib, sandbox, telegram, pac/provider, db/sql, security/access | SANDBOX_OR_MOCK | TP | - | YES | - | security-access-control (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/telegram-action-token-utils.js | HELPER_LIB | Helper/lib para telegram action token utils | helper/lib, sandbox, telegram, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | - | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/lib/telegram-document-delivery-channel.js | HELPER_LIB | Helper/lib para telegram document delivery channel | helper/lib, sandbox, telegram, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RTP | R | YES | sandbox-artifact-content-validator | - | HIGH | KEEP_SEPARATE |
| scripts/lib/telegram-product-menu-contract.js | HELPER_LIB | Helper/lib para telegram product menu contract | helper/lib, sandbox, telegram, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RTP | - | YES | - | telegram-product-menu (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/telegram-product-menu-renderer.js | HELPER_LIB | Helper/lib para telegram product menu renderer | helper/lib, sandbox, telegram, pac/provider, db/sql | SANDBOX_OR_MOCK | TP | - | NO | telegram-product-menu-contract | telegram-product-menu-renderer (2) | HIGH | KEEP_SEPARATE |
| scripts/lib/test-telegram-delivery-workflow-harness.js | HELPER_LIB | Helper/lib para telegram delivery workflow harness | helper/lib, workflow/n8n, sandbox, telegram, pac/provider, db/sql +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/00_LOAD_LOCAL_ENV_V3_SAFE.ps1 | LOCAL_WRAPPER | Wrapper local SAFE/arranque para 00_LOAD_LOCAL_ENV_V3_SAFE | workflow/n8n, sandbox, pac/provider, db/sql, security/access, wrapper | LOCAL_INTEGRATION/SANDBOX | NP | R/W | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/01_START_N8N_LOCAL_V3_SAFE.bat | LOCAL_WRAPPER | Wrapper local SAFE/arranque para 01_START_N8N_LOCAL_V3_SAFE | workflow/n8n, sandbox, pac/provider, db/sql, wrapper | LOCAL_INTEGRATION/SANDBOX | NP | R/UNKNOWN | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/02_START_TELEGRAM_RUNNER_LOCAL_V3_SAFE.bat | LOCAL_WRAPPER | Wrapper local SAFE/arranque para 02_START_TELEGRAM_RUNNER_LOCAL_V3_SAFE | sandbox, telegram, pac/provider, db/sql, wrapper | SANDBOX_OR_MOCK | TP | R/UNKNOWN | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/03_DIAGNOSE_LOCAL_ENV_V3_SAFE.bat | LOCAL_WRAPPER | Wrapper local SAFE/arranque para 03_DIAGNOSE_LOCAL_ENV_V3_SAFE | wrapper | OFFLINE_STATIC | - | R/UNKNOWN | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE.bat | LOCAL_WRAPPER | Wrapper local SAFE/arranque para 80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE | sandbox, db/sql, wrapper | SANDBOX_OR_MOCK | P | R/UNKNOWN | NO | - | 80_run_sandbox_action_with_env_v3_safe (2) | HIGH | KEEP_SEPARATE |
| scripts/local/80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE.ps1 | LOCAL_WRAPPER | Wrapper local SAFE/arranque para 80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE | sandbox, telegram, db/sql, wrapper | SANDBOX/LIVE_CAPABLE | TP | R/UNKNOWN | YES | - | 80_run_sandbox_action_with_env_v3_safe (2) | HIGH | KEEP_SEPARATE |
| scripts/local/81_TEST_TELEGRAM_DOCUMENT_DELIVERY_V3_SAFE.bat | LOCAL_WRAPPER | Wrapper local SAFE/arranque para 81_TEST_TELEGRAM_DOCUMENT_DELIVERY_V3_SAFE | sandbox, telegram, db/sql, catalog/scoring/cfdi, wrapper | SANDBOX/LIVE_CAPABLE | TP | R/UNKNOWN | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/99_START_ALL_LOCAL_V3_SAFE.bat | LOCAL_WRAPPER | Wrapper local SAFE/arranque para 99_START_ALL_LOCAL_V3_SAFE | workflow/n8n, sandbox, telegram, pac/provider, db/sql, catalog/scoring/cfdi +1 | LOCAL_INTEGRATION/SANDBOX | NTP | R/UNKNOWN | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/apply-local-foundation-sql.ps1 | LOCAL_WRAPPER | Wrapper local SAFE/arranque para apply local foundation sql | pac/provider, db/sql, security/access, wrapper | LOCAL_INTEGRATION | P | R/UNKNOWN | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/start-n8n-pac-sandbox.example.ps1 | LOCAL_WRAPPER | Wrapper local SAFE/arranque para start n8n pac sandbox.example | workflow/n8n, sandbox, telegram, pac/provider, db/sql, wrapper | LOCAL_INTEGRATION/SANDBOX | NTP | R/UNKNOWN | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/start-n8n-pac-sandbox.local.ps1 | LOCAL_WRAPPER | Wrapper local SAFE/arranque para start n8n pac sandbox.local | workflow/n8n, sandbox, telegram, pac/provider, db/sql, wrapper | LOCAL_INTEGRATION/SANDBOX | NTP | R/W | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/start-runner.local.example.ps1 | LOCAL_WRAPPER | Wrapper local SAFE/arranque para start runner.local.example | telegram, wrapper | OFFLINE_STATIC | T | R/UNKNOWN | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/start-runner.local.ps1 | LOCAL_WRAPPER | Wrapper local SAFE/arranque para start runner.local | telegram, wrapper | OFFLINE_STATIC | T | R/UNKNOWN | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/local/start-telegram-runner-pac-sandbox.local.ps1 | LOCAL_WRAPPER | Wrapper local SAFE/arranque para start telegram runner pac sandbox.local | sandbox, telegram, pac/provider, db/sql, wrapper | SANDBOX_OR_MOCK | TP | R/UNKNOWN | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/preflight-facturacom-auth.js | PREFLIGHT | Preflight/diagnostico previo para facturacom auth | sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | W | YES | factura-com-live-client | - | HIGH | WRAP_IN_RUNNER |
| scripts/propose-resico-catalog-expansion.js | PROPOSER | UNKNOWN | pac/provider, security/access, catalog/scoring/cfdi | LOCAL_INTEGRATION | NP | R/W | NO | - | - | HIGH | MERGE_LATER |
| scripts/qa/n8n-api-client.js | WORKFLOW_SYNC | Herramienta QA para n8n api client | workflow/n8n, runtime/storage | LOCAL_INTEGRATION | RN | - | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/qa/postgres-qa-client.js | WORKFLOW_SYNC | Herramienta QA para postgres qa client | sandbox, telegram, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RTP | - | YES | local-db-psql-runner | - | HIGH | MERGE_LATER |
| scripts/qa/qa-assertions.js | QA_ASSERTION_HELPER | Herramienta QA para qa assertions | workflow/n8n, sandbox, telegram, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/qa/report-builder.js | WORKFLOW_SYNC | Herramienta QA para report builder | workflow/n8n, telegram, db/sql, runtime/storage, catalog/scoring/cfdi | LIVE_CAPABLE | RNT | W | NO | - | - | HIGH | MERGE_LATER |
| scripts/qa/sanitize-report.js | QA_CLIENT | Herramienta QA para sanitize report | telegram, pac/provider, runtime/storage | OFFLINE_STATIC | RTP | - | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/qa/satbot-e2e-harness.js | WORKFLOW_SYNC | Herramienta QA para satbot e2e harness | workflow/n8n, sandbox, telegram, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/qa/scenarios/delivery-prepare-flow.js | QA_SCENARIO | Herramienta QA para delivery prepare flow | sandbox, telegram, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | TP | - | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/qa/scenarios/sandbox-callback-dispatch.js | QA_SCENARIO | Herramienta QA para sandbox callback dispatch | workflow/n8n, sandbox, telegram, db/sql | SANDBOX/LIVE_CAPABLE | NTP | - | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/qa/scenarios/sandbox-existing-draft-document-flow.js | QA_SCENARIO | Herramienta QA para sandbox existing draft document flow | sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | - | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/qa/telegram-ui-button-acceptance.js | QA_CLIENT | Herramienta QA para telegram ui button acceptance | workflow/n8n, sandbox, telegram, pac/provider, db/sql, runtime/storage +2 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | telegram-action-token-utils, local-db-psql-runner | telegram-ui-button-acceptance (2) | HIGH | KEEP_SEPARATE |
| scripts/qa/telegram-ui-button-state-audit.js | QA_HARNESS | Herramienta QA para telegram ui button state audit | auditor, workflow/n8n, sandbox, telegram, pac/provider, db/sql +3 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | telegram-action-token-utils, telegram-product-menu-contract, test-telegram-delivery-workflow-harness | telegram-ui-button-state (2) | HIGH | KEEP_SEPARATE |
| scripts/qa/telegram-ui-session-watch.js | WATCHER | Herramienta QA para telegram ui session watch | watcher, auditor, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | local-db-psql-runner | telegram-ui-session-watch (2) | HIGH | KEEP_SEPARATE |
| scripts/qa/telegram-webhook-simulator.js | WORKFLOW_SYNC | Herramienta QA para telegram webhook simulator | workflow/n8n, telegram, runtime/storage | LOCAL_INTEGRATION | RNT | - | YES | - | - | HIGH | MERGE_LATER |
| scripts/qa/workflow-sync.js | WORKFLOW_SYNC | Herramienta QA para workflow sync | workflow/n8n, telegram, db/sql | LIVE_CAPABLE | NT | R | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/review-sandbox-action-audit.js | REVIEWER | Revisor/auditoria para sandbox action audit | auditor, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | NO | - | sandbox-action (5) | MEDIUM | WRAP_IN_RUNNER |
| scripts/review-sandbox-lifecycle-storage.js | REVIEWER | Revisor/auditoria para sandbox lifecycle storage | sandbox, telegram, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RTP | R/W | YES | sandbox-storage-engine, sandbox-human-readable-storage-naming | - | HIGH | WRAP_IN_RUNNER |
| scripts/run-sandbox-action.js | RUNNER_CLI | CLI runner para sandbox action | auditor, workflow/n8n, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RNP | - | YES | sandbox-action-runner | - | HIGH | WRAP_IN_RUNNER |
| scripts/scoring.js | UNKNOWN | UNKNOWN | workflow/n8n, pac/provider, runtime/storage, security/access, catalog/scoring/cfdi | LOCAL_INTEGRATION | RNP | - | YES | emitter-activity-shadow-logger | scoring (2) | HIGH | UNKNOWN |
| scripts/smoke-factura-com-sandbox-adapter.js | SMOKE | Smoke manual/seguro para factura com sandbox adapter | smoke, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | P | - | YES | factura-com-sandbox-adapter | factura-com-sandbox (4) | HIGH | WRAP_IN_RUNNER |
| scripts/smoke-factura-com-sandbox.js | SMOKE | Smoke manual/seguro para factura com sandbox | smoke, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | R/W | NO | canonical-draft-builder, canonical-invoice-builder, factura-com-payload-mapper, cfdi-receptor-compatibility-validator +3 | - | HIGH | WRAP_IN_RUNNER |
| scripts/store-facturacom-sandbox-artifacts.js | STORAGE_TOOL | Persistencia/almacenamiento para facturacom sandbox artifacts | sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | NO | sandbox-storage-engine | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-access-gate-read-only.js | TEST_REGRESSION | Prueba/regresion/contrato para access gate read only | test, regression, telegram, pac/provider, security/access | OFFLINE_STATIC | TP | - | NO | access-control/access-gate | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-accountant-package-product-integration.js | TEST_REGRESSION | Prueba/regresion/contrato para accountant package product integration | test, regression, auditor, workflow/n8n, sandbox, telegram +5 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | telegram-product-menu-contract, accountant-package-product-view | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-activity-scope-shadow-log-analyzer.js | TEST_REGRESSION | Prueba/regresion/contrato para activity scope shadow log analyzer | test, regression, workflow/n8n, runtime/storage, catalog/scoring/cfdi | LOCAL_INTEGRATION | RN | R/W | NO | - | activity-scope-shadow-log (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-approved-draft-to-pac-sandbox.js | TEST_REGRESSION | Prueba/regresion/contrato para approved draft to pac sandbox | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | sandbox-action-runner, sandbox-draft-stamp-action, telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-business-scenario-suite.js | TEST_REGRESSION | Prueba/regresion/contrato para business scenario suite | test, regression, workflow/n8n, telegram, db/sql, security/access +1 | LOCAL_INTEGRATION | NT | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-canonical-cfdi-contracts.js | TEST_REGRESSION | Prueba/regresion/contrato para canonical cfdi contracts | test, regression, auditor, sandbox, telegram, pac/provider +2 | SANDBOX_OR_MOCK | RTP | - | NO | canonical-cfdi-contracts | canonical-cfdi (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-canonical-draft-builder.js | TEST_REGRESSION | Prueba/regresion/contrato para canonical draft builder | test, regression, auditor, telegram, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | TP | - | NO | canonical-cfdi-contracts, canonical-draft-builder | canonical-draft-builder (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-canonical-invoice-builder.js | TEST_REGRESSION | Prueba/regresion/contrato para canonical invoice builder | test, regression, auditor, sandbox, telegram, pac/provider +3 | SANDBOX_OR_MOCK | RTP | - | YES | canonical-cfdi-contracts, canonical-draft-builder, canonical-invoice-builder | canonical-invoice-builder (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-canonical-sandbox-fixtures.js | TEST_REGRESSION | Prueba/regresion/contrato para canonical sandbox fixtures | test, regression, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | R | NO | canonical-cfdi-contracts, canonical-draft-builder, canonical-invoice-builder, cfdi-receptor-compatibility-validator +2 | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-catalog-expansion-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para catalog expansion contract | test, regression, workflow/n8n, pac/provider, catalog/scoring/cfdi | LOCAL_INTEGRATION | NP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-cfdi-receptor-compatibility-validator.js | TEST_REGRESSION | Prueba/regresion/contrato para cfdi receptor compatibility validator | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | cfdi-receptor-compatibility-validator | cfdi-receptor-compatibility-validator (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-cfdi-rules-diagnose-action.js | TEST_REGRESSION | Prueba/regresion/contrato para cfdi rules diagnose action | test, regression, auditor, sandbox, db/sql, catalog/scoring/cfdi | SANDBOX_OR_MOCK | P | - | NO | sandbox-action-runner | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-cfdi40-core-rule-registry.js | TEST_REGRESSION | Prueba/regresion/contrato para cfdi40 core rule registry | test, regression, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | P | - | NO | cfdi-rules/cfdi-rule-registry | - | LOW | WRAP_IN_RUNNER |
| scripts/test-cfdi40-filling-guide-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para cfdi40 filling guide contract | test, regression, workflow/n8n, pac/provider, catalog/scoring/cfdi | LOCAL_INTEGRATION | NP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-cfdi40-knowledge-base.js | TEST_REGRESSION | Prueba/regresion/contrato para cfdi40 knowledge base | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LOCAL_INTEGRATION | NTP | R | NO | - | cfdi40-knowledge-base (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-cfdi40-rule-engine.js | TEST_REGRESSION | Prueba/regresion/contrato para cfdi40 rule engine | test, regression, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | cfdi-rules/cfdi-rule-engine | - | LOW | WRAP_IN_RUNNER |
| scripts/test-client-billing-summary-view.js | TEST_REGRESSION | Prueba/regresion/contrato para client billing summary view | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | telegram-product-menu-contract, client-billing-summary-view | client-billing-summary-view (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-client-fiscal-field-normalizer.js | TEST_REGRESSION | Prueba/regresion/contrato para client fiscal field normalizer | test, regression, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | clients/client-fiscal-field-normalizer | client-fiscal-field-normalizer (2) | LOW | WRAP_IN_RUNNER |
| scripts/test-client-fiscal-normalize-diagnose-action.js | TEST_REGRESSION | Prueba/regresion/contrato para client fiscal normalize diagnose action | test, regression, sandbox, db/sql, runtime/storage | LOCAL_INTEGRATION/SANDBOX | RP | - | NO | sandbox-action-runner, client-fiscal-normalize-diagnose-action | client-fiscal-normalize-diagnose (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-client-fiscal-profile-ux.js | TEST_REGRESSION | Prueba/regresion/contrato para client fiscal profile ux | test, regression, workflow/n8n, telegram, db/sql, security/access +1 | LOCAL_INTEGRATION | NT | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-client-fuzzy-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para client fuzzy contract | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-client-invoice-ledger-view.js | TEST_REGRESSION | Prueba/regresion/contrato para client invoice ledger view | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | NTP | R | YES | telegram-product-menu-contract, client-invoice-ledger-view | client-invoice-ledger-view (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-client-primary-email-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para client primary email contract | test, regression, pac/provider, db/sql | LIVE_CAPABLE | P | R | NO | factura-com-provider-client-mapper | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-client-search-selection-ux.js | TEST_REGRESSION | Prueba/regresion/contrato para client search selection ux | test, regression, workflow/n8n, telegram, db/sql, security/access +1 | LOCAL_INTEGRATION | NT | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-client-validation-persistence.js | TEST_REGRESSION | Prueba/regresion/contrato para client validation persistence | test, regression, workflow/n8n, telegram, db/sql, catalog/scoring/cfdi | LOCAL_INTEGRATION | NT | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-command-router-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para command router contract | test, regression, workflow/n8n, telegram, runtime/storage, catalog/scoring/cfdi | LIVE_CAPABLE | RNT | R/W | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-compact-catalog-analysis-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para compact catalog analysis contract | test, regression, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | P | R | NO | - | - | LOW | WRAP_IN_RUNNER |
| scripts/test-concept-eligibility-engine.js | TEST_REGRESSION | Prueba/regresion/contrato para concept eligibility engine | test, regression, catalog/scoring/cfdi | OFFLINE_STATIC | - | R | NO | fiscal-activities/concept-eligibility-engine | concept-eligibility-engine (2) | LOW | WRAP_IN_RUNNER |
| scripts/test-conversation-policy-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para conversation policy contract | test, regression, workflow/n8n, telegram, pac/provider, db/sql +2 | LOCAL_INTEGRATION | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-document-delivery-canonical-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para document delivery canonical contract | test, regression, sandbox, telegram, pac/provider, db/sql +1 | SANDBOX/LIVE_CAPABLE | RTP | - | NO | document-delivery/canonical-document-delivery-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-document-delivery-idempotency-key-stable.js | TEST_REGRESSION | Prueba/regresion/contrato para document delivery idempotency key stable | test, regression, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | P | R | NO | document-delivery/document-delivery-ledger-store | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-document-delivery-idempotency.js | TEST_REGRESSION | Prueba/regresion/contrato para document delivery idempotency | test, regression, sandbox, telegram, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | TP | - | NO | document-delivery/document-delivery-ledger-store | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-document-delivery-ledger-store.js | TEST_REGRESSION | Prueba/regresion/contrato para document delivery ledger store | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | document-delivery/document-delivery-ledger-store | document-delivery-ledger-store (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-document-delivery-ready-does-not-block-send.js | TEST_REGRESSION | Prueba/regresion/contrato para document delivery ready does not block send | test, regression, sandbox, telegram, db/sql | SANDBOX/LIVE_CAPABLE | TP | - | NO | document-delivery/document-delivery-ledger-store | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-document-delivery-security.js | TEST_REGRESSION | Prueba/regresion/contrato para document delivery security | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | document-delivery/canonical-document-delivery-contract, telegram-document-delivery-channel | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-document-delivery-sent-blocks-duplicate.js | TEST_REGRESSION | Prueba/regresion/contrato para document delivery sent blocks duplicate | test, regression, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | P | - | NO | document-delivery/document-delivery-ledger-store | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-document-delivery-status-summary.js | TEST_REGRESSION | Prueba/regresion/contrato para document delivery status summary | test, regression, workflow/n8n, sandbox, telegram, pac/provider +1 | SANDBOX/LIVE_CAPABLE | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-emitter-activity-scope-offline-evaluator.js | TEST_REGRESSION | Prueba/regresion/contrato para emitter activity scope offline evaluator | test, regression, workflow/n8n, telegram, db/sql, security/access +1 | LOCAL_INTEGRATION | NT | - | NO | emitter-activity-scope-loader, emitter-activity-scope-evaluator | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-emitter-activity-scope-proposal.js | TEST_REGRESSION | Prueba/regresion/contrato para emitter activity scope proposal | test, regression, auditor, workflow/n8n, telegram, pac/provider +3 | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-emitter-activity-shadow-comparator.js | TEST_REGRESSION | Prueba/regresion/contrato para emitter activity shadow comparator | test, regression, workflow/n8n, telegram, db/sql, runtime/storage +1 | LOCAL_INTEGRATION | RNT | R/W | YES | emitter-activity-scope-loader, emitter-activity-scope-evaluator, emitter-activity-shadow-logger | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-factura-com-payload-mapper.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com payload mapper | test, regression, sandbox, pac/provider, db/sql, security/access +1 | SANDBOX_OR_MOCK | P | R | YES | canonical-cfdi-contracts, canonical-draft-builder, canonical-invoice-builder, factura-com-payload-mapper | factura-com-payload-mapper (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-factura-com-payload-normalizes-regimen-uso.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com payload normalizes regimen uso | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX_OR_MOCK | P | R | NO | canonical-draft-builder, canonical-invoice-builder, factura-com-payload-mapper | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-factura-com-provider-client-mapper-normalization.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com provider client mapper normalization | test, regression, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | P | - | NO | factura-com-provider-client-mapper | - | LOW | WRAP_IN_RUNNER |
| scripts/test-factura-com-provider-client-mapper.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com provider client mapper | test, regression, pac/provider | OFFLINE_STATIC | P | - | NO | factura-com-provider-client-mapper | factura-com-provider-client-mapper (2) | LOW | WRAP_IN_RUNNER |
| scripts/test-factura-com-sandbox-adapter-mock.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com sandbox adapter mock | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R | YES | pac-adapter-contract, canonical-draft-builder, canonical-invoice-builder, factura-com-sandbox-adapter | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-factura-com-sandbox-adapter.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com sandbox adapter | test, regression, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | - | factura-com-sandbox (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-factura-com-sandbox-client-adapter-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com sandbox client adapter contract | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX_OR_MOCK | P | - | NO | factura-com-sandbox-client-adapter | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-factura-com-sandbox-download-gating.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com sandbox download gating | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | - | YES | factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-factura-com-sandbox-live-adapter-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com sandbox live adapter contract | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | R | YES | canonical-draft-builder, canonical-invoice-builder, factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-factura-com-sandbox-live-download-adapter-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com sandbox live download adapter contract | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-factura-com-sandbox-live-gating.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com sandbox live gating | test, regression, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | P | R | YES | canonical-draft-builder, canonical-invoice-builder, factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-factura-com-sandbox-smoke-safety.js | TEST_REGRESSION | Prueba/regresion/contrato para factura com sandbox smoke safety | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RNP | R/W | YES | factura-com-live-client | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-artifact-raw-buffer-not-sanitized.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom artifact raw buffer not sanitized | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | - | YES | factura-com-live-client | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-download-rejects-blank-pdf.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom download rejects blank pdf | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-download-rejects-placeholder-artifacts.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom download rejects placeholder artifacts | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-official-api-discovery.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom official api discovery | test, regression, workflow/n8n, sandbox, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RNP | R | YES | canonical-cfdi-contracts, canonical-draft-builder, canonical-invoice-builder, factura-com-payload-mapper | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-pdf-download-retry-not-ready.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom pdf download retry not ready | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | P | - | YES | factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-pdf-root-cause-diagnose-action.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom pdf root cause diagnose action | test, regression, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-pdf-diagnose-action | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-facturacom-provider-email-delivery-adapter.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom provider email delivery adapter | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | - | YES | factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-sandbox-config-resolver.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom sandbox config resolver | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | facturacom-sandbox-config-resolver | facturacom-sandbox-config-resolver (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-sandbox-payload-unresolved-diagnostics.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom sandbox payload unresolved diagnostics | test, regression, sandbox, telegram, pac/provider, db/sql +1 | SANDBOX/LIVE_CAPABLE | TP | - | YES | factura-com-sandbox-adapter, canonical-invoice-builder, canonical-draft-builder | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-facturacom-uso-cfdi-invalid-diagnostic.js | TEST_REGRESSION | Prueba/regresion/contrato para facturacom uso cfdi invalid diagnostic | test, regression, pac/provider, catalog/scoring/cfdi | OFFLINE_STATIC | P | - | NO | cfdi-receptor-compatibility-validator | - | LOW | WRAP_IN_RUNNER |
| scripts/test-fiscal-activity-guardrails.js | TEST_REGRESSION | Prueba/regresion/contrato para fiscal activity guardrails | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-fiscal-activity-rules-foundation.js | TEST_REGRESSION | Prueba/regresion/contrato para fiscal activity rules foundation | test, regression, catalog/scoring/cfdi | OFFLINE_STATIC | - | R | NO | fiscal-activities/fiscal-activity-contract | - | LOW | WRAP_IN_RUNNER |
| scripts/test-history-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para history contract | test, regression, workflow/n8n, telegram, pac/provider, runtime/storage +1 | LIVE_CAPABLE | RNTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-invitation-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para invitation contract | test, regression, telegram, security/access | OFFLINE_STATIC | T | - | NO | access-control/invitation-contract | invitation (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-invoice-payment-status-model.js | TEST_REGRESSION | Prueba/regresion/contrato para invoice payment status model | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R | NO | invoice-payment-status-model | invoice-payment-status-model (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-invoice-wizard-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para invoice wizard contract | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-local-cfdi-pdf-renderer.js | TEST_REGRESSION | Prueba/regresion/contrato para local cfdi pdf renderer | test, regression, sandbox, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX_OR_MOCK | RP | R/W | NO | document-rendering/local-cfdi-pdf-renderer | local-cfdi-pdf-renderer (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-local-db-psql-runner.js | TEST_REGRESSION | Prueba/regresion/contrato para local db psql runner | test, regression, db/sql | LOCAL_INTEGRATION | - | - | YES | local-db-psql-runner | local-db-psql (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-local-ingest-response-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para local ingest response contract | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-local-ingest-security-enforcement.js | TEST_REGRESSION | Prueba/regresion/contrato para local ingest security enforcement | test, regression, workflow/n8n, telegram, pac/provider, db/sql +2 | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-local-ingest-workflow-callback-lifecycle.js | TEST_REGRESSION | Prueba/regresion/contrato para local ingest workflow callback lifecycle | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-local-ingest-workflow-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para local ingest workflow contract | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-local-ingest-workflow-post-action-dispatch.js | TEST_REGRESSION | Prueba/regresion/contrato para local ingest workflow post action dispatch | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-local-runner-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para local runner contract | test, regression, workflow/n8n, telegram, runtime/storage | LIVE_CAPABLE | RNT | R/W | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-local-startup-and-stamp-diagnostics.js | TEST_REGRESSION | Prueba/regresion/contrato para local startup and stamp diagnostics | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-long-invoice-and-material-labor.js | TEST_REGRESSION | Prueba/regresion/contrato para long invoice and material labor | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-monthly-billing-dashboard-view.js | TEST_REGRESSION | Prueba/regresion/contrato para monthly billing dashboard view | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | telegram-product-menu-contract, monthly-billing-dashboard-view | monthly-billing-dashboard-view (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-multiconcept-segmentation-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para multiconcept segmentation contract | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-n8n-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para n8n contract | test, regression, workflow/n8n, telegram, pac/provider, catalog/scoring/cfdi | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-n8n-webhook-response-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para n8n webhook response contract | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-n8n-workflow-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para n8n workflow contract | test, regression, workflow/n8n, telegram, pac/provider, catalog/scoring/cfdi | LOCAL_INTEGRATION | NTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-n8n-workflow-guardrails.js | TEST_REGRESSION | Prueba/regresion/contrato para n8n workflow guardrails | test, regression, workflow/n8n, sandbox, telegram, pac/provider +1 | SANDBOX/LIVE_CAPABLE | NTP | R/W | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-n8n-workflow-topology-policy.js | TEST_REGRESSION | Prueba/regresion/contrato para n8n workflow topology policy | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | LOCAL_INTEGRATION/SANDBOX | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-pac-adapter-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para pac adapter contract | test, regression, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | YES | pac-adapter-contract | pac-adapter (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-pac-sandbox-to-production-roadmap.js | TEST_REGRESSION | Prueba/regresion/contrato para pac sandbox to production roadmap | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | LOCAL_INTEGRATION/SANDBOX | RNTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-payment-status-command-adapter.js | TEST_REGRESSION | Prueba/regresion/contrato para payment status command adapter | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | invoice-payment-status-model, payment-status-action, client-invoice-ledger-view | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-pdf-render-check-blank-page-detected.js | TEST_REGRESSION | Prueba/regresion/contrato para pdf render check blank page detected | test, regression, runtime/storage | OFFLINE_STATIC | R | W | NO | pdf/pdf-render-visual-checker | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-pdf-render-check-visible-page-detected.js | TEST_REGRESSION | Prueba/regresion/contrato para pdf render check visible page detected | test, regression, runtime/storage | OFFLINE_STATIC | R | W | NO | pdf/pdf-render-visual-checker | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-pdf-render-visual-checker.js | TEST_REGRESSION | Prueba/regresion/contrato para pdf render visual checker | test, regression, runtime/storage | OFFLINE_STATIC | R | W | NO | pdf/pdf-render-visual-checker | pdf-render-visual-checker (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-postgres-polling-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para postgres polling contract | test, regression, workflow/n8n, telegram, db/sql, catalog/scoring/cfdi | LIVE_CAPABLE | NTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-postgres-schema.js | TEST_REGRESSION | Prueba/regresion/contrato para postgres schema | test, regression, telegram, db/sql, catalog/scoring/cfdi | LOCAL_INTEGRATION | T | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-preview-public-output-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para preview public output contract | test, regression, workflow/n8n, telegram, db/sql, runtime/storage +1 | LOCAL_INTEGRATION | RNT | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-product-modes-approval-contracts.js | TEST_REGRESSION | Prueba/regresion/contrato para product modes approval contracts | test, regression, auditor, telegram, catalog/scoring/cfdi | OFFLINE_STATIC | T | - | NO | product-modes/product-mode-enums, product-modes/approval-policy-contract, product-modes/channel-adapter-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-product-roadmap-docs.js | TEST_REGRESSION | Prueba/regresion/contrato para product roadmap docs | test, regression, auditor, workflow/n8n, sandbox, telegram +3 | LOCAL_INTEGRATION/SANDBOX | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-project-readiness.js | TEST_REGRESSION | Prueba/regresion/contrato para project readiness | test, regression, workflow/n8n, telegram, pac/provider, catalog/scoring/cfdi | LOCAL_INTEGRATION | NTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-provider-canonical-contracts.js | TEST_REGRESSION | Prueba/regresion/contrato para provider canonical contracts | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | P | - | YES | provider-contracts/provider-contract-index | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-provider-capabilities-registry.js | TEST_REGRESSION | Prueba/regresion/contrato para provider capabilities registry | test, regression, sandbox, pac/provider, db/sql | LOCAL_INTEGRATION/SANDBOX | P | - | NO | provider-capabilities-registry | provider-capabilities-registry (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-email-sync-diagnose.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client email sync diagnose | test, regression, auditor, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-action-runner | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-link-action.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client link action | test, regression, auditor, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-action-runner, provider-client-link-store | provider-client-link (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-link-docker-db-mode.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client link docker db mode | test, regression, auditor, sandbox, pac/provider, db/sql | LOCAL_INTEGRATION/SANDBOX | P | - | YES | provider-client-link-store, sandbox-action-runner | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-link-security.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client link security | test, regression, auditor, workflow/n8n, sandbox, pac/provider +3 | SANDBOX_OR_MOCK | RNP | R | YES | sandbox-action-runner | provider-client-link (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-provider-client-readiness-action.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client readiness action | test, regression, auditor, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-action-runner, provider-client/provider-client-readiness-action | provider-client-readiness (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-readiness-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client readiness contract | test, regression, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | provider-client/provider-client-readiness-contract | provider-client-readiness (4) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-readiness-email-states.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client readiness email states | test, regression, pac/provider | OFFLINE_STATIC | P | - | NO | provider-client/provider-client-readiness-contract | - | LOW | WRAP_IN_RUNNER |
| scripts/test-provider-client-readiness-incomplete-fiscal-data.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client readiness incomplete fiscal data | test, regression, pac/provider | OFFLINE_STATIC | P | - | NO | provider-client/provider-client-readiness-contract | - | LOW | WRAP_IN_RUNNER |
| scripts/test-provider-client-readiness-missing-link.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client readiness missing link | test, regression, auditor, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-action-runner | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-readiness-no-db-mutation.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client readiness no db mutation | test, regression, auditor, sandbox, pac/provider, db/sql | LOCAL_INTEGRATION/SANDBOX | P | - | NO | sandbox-action-runner | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-readiness-no-hardcoded-client.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client readiness no hardcoded client | test, regression, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | R | NO | - | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-sync-action.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client sync action | test, regression, auditor, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-action-runner | provider-client-sync (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-sync-ambiguous.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client sync ambiguous | test, regression, auditor, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | sandbox-action-runner | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-client-sync-email-mapper.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client sync email mapper | test, regression, pac/provider | OFFLINE_STATIC | P | - | NO | factura-com-provider-client-mapper, provider-client-sync-action | - | LOW | WRAP_IN_RUNNER |
| scripts/test-provider-client-sync-updates-email.js | TEST_REGRESSION | Prueba/regresion/contrato para provider client sync updates email | test, regression, auditor, sandbox, pac/provider, db/sql | SANDBOX_OR_MOCK | P | - | NO | factura-com-provider-client-mapper, sandbox-action-runner | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-provider-email-blocked-when-provider-pdf-invalid.js | TEST_REGRESSION | Prueba/regresion/contrato para provider email blocked when provider pdf invalid | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | W | NO | sandbox-document-delivery-action, document-rendering/local-cfdi-pdf-renderer | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-provider-email-delivery-blocks-when-pdf-invalid.js | TEST_REGRESSION | Prueba/regresion/contrato para provider email delivery blocks when pdf invalid | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-provider-email-delivery-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para provider email delivery contract | test, regression, sandbox, telegram, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | TP | - | NO | provider-capabilities-registry, document-delivery/canonical-document-delivery-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-provider-email-delivery-duplicate-block.js | TEST_REGRESSION | Prueba/regresion/contrato para provider email delivery duplicate block | test, regression, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | P | - | NO | document-delivery/document-delivery-ledger-store | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-provider-foundation-backward-compatibility.js | TEST_REGRESSION | Prueba/regresion/contrato para provider foundation backward compatibility | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | sandbox-action-runner, provider-capabilities-registry | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-provider-multitenant-schema-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para provider multitenant schema contract | test, regression, pac/provider, db/sql, catalog/scoring/cfdi | OFFLINE_STATIC | P | R | NO | - | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-qa-active-workflow-version-guard.js | TEST_REGRESSION | Prueba/regresion/contrato para qa active workflow version guard | test, regression, workflow/n8n, telegram, db/sql | LIVE_CAPABLE | NT | - | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-cli-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para qa cli contract | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | - | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-dispatch-assertions.js | TEST_REGRESSION | Prueba/regresion/contrato para qa dispatch assertions | test, regression, sandbox, telegram, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | TP | - | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-n8n-execution-inspector.js | TEST_REGRESSION | Prueba/regresion/contrato para qa n8n execution inspector | test, regression, workflow/n8n, telegram | LOCAL_INTEGRATION | NT | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-postgres-delivery-ledger-query.js | TEST_REGRESSION | Prueba/regresion/contrato para qa postgres delivery ledger query | test, regression, sandbox, telegram, pac/provider, db/sql +1 | SANDBOX/LIVE_CAPABLE | RTP | - | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-provider-email-real-smoke-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para qa provider email real smoke contract | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | - | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-real-send-guardrails.js | TEST_REGRESSION | Prueba/regresion/contrato para qa real send guardrails | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | - | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-report-builder.js | TEST_REGRESSION | Prueba/regresion/contrato para qa report builder | test, regression, workflow/n8n, telegram, db/sql, catalog/scoring/cfdi | LOCAL_INTEGRATION | NT | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-report-real-mode-sanitization.js | TEST_REGRESSION | Prueba/regresion/contrato para qa report real mode sanitization | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-sandbox-button-smoke-safe.js | TEST_REGRESSION | Prueba/regresion/contrato para qa sandbox button smoke safe | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-sanitize-report-does-not-redact-normal-words.js | TEST_REGRESSION | Prueba/regresion/contrato para qa sanitize report does not redact normal words | test, regression, telegram, pac/provider | LIVE_CAPABLE | TP | - | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-sanitize-report.js | TEST_REGRESSION | Prueba/regresion/contrato para qa sanitize report | test, regression, workflow/n8n, telegram | LIVE_CAPABLE | NT | - | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-telegram-document-real-smoke-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para qa telegram document real smoke contract | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | - | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-telegram-webhook-simulator.js | TEST_REGRESSION | Prueba/regresion/contrato para qa telegram webhook simulator | test, regression, telegram | LOCAL_INTEGRATION | T | - | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-qa-workflow-sync-check.js | TEST_REGRESSION | Prueba/regresion/contrato para qa workflow sync check | test, regression, workflow/n8n, telegram, db/sql, runtime/storage +1 | LIVE_CAPABLE | RNT | W | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/test-qa-workflow-sync-payload-not-sanitized.js | TEST_REGRESSION | Prueba/regresion/contrato para qa workflow sync payload not sanitized | test, regression, workflow/n8n, telegram, pac/provider, runtime/storage | LIVE_CAPABLE | RNTP | - | YES | - | - | HIGH | KEEP_SEPARATE |
| scripts/test-qa-workflow-sync-safety.js | TEST_REGRESSION | Prueba/regresion/contrato para qa workflow sync safety | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | W | NO | - | - | HIGH | KEEP_SEPARATE |
| scripts/test-repo-safety.js | TEST_REGRESSION | Prueba/regresion/contrato para repo safety | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-accountant-checklist.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox accountant checklist | test, regression, sandbox, pac/provider, db/sql, runtime/storage | LOCAL_INTEGRATION/SANDBOX | RNP | R/W | YES | sandbox-accountant-package, sandbox-accountant-checklist | sandbox-accountant-checklist (4) | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-accountant-excel.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox accountant excel | test, regression, workflow/n8n, sandbox, pac/provider, db/sql +1 | LOCAL_INTEGRATION/SANDBOX | RNP | R/W | YES | sandbox-accountant-package, sandbox-accountant-excel | sandbox-accountant-excel (4) | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-accountant-package.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox accountant package | test, regression, workflow/n8n, sandbox, pac/provider, db/sql +1 | LOCAL_INTEGRATION/SANDBOX | RNP | R/W | YES | sandbox-accountant-package | sandbox-accountant-package (4) | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-action-audit-export.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox action audit export | test, regression, auditor, workflow/n8n, sandbox, pac/provider +2 | SANDBOX_OR_MOCK | RNTP | R/W | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-action-audit-history.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox action audit history | test, regression, auditor, workflow/n8n, sandbox, telegram +3 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | sandbox-action-runner | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-action-audit-retention.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox action audit retention | test, regression, auditor, workflow/n8n, sandbox, telegram +3 | SANDBOX_OR_MOCK | RNTP | R/W | YES | sandbox-action-runner | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-action-cli-json-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox action cli json contract | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | - | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-action-router-workflow-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox action router workflow contract | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-action-runner.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox action runner | test, regression, auditor, workflow/n8n, sandbox, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | sandbox-action-runner, sandbox-accountant-package | sandbox-action (5) | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-artifact-content-validator.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox artifact content validator | test, regression, sandbox, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX_OR_MOCK | RP | - | NO | sandbox-artifact-content-validator | sandbox-artifact-content-validator (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-audit-signoff-checklist.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox audit signoff checklist | test, regression, auditor, workflow/n8n, sandbox, pac/provider +2 | SANDBOX_OR_MOCK | RNTP | R/W | YES | - | sandbox-audit-signoff-checklist (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-cfdi-lifecycle-cancellation.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox cfdi lifecycle cancellation | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | NO | sandbox-action-runner, sandbox-draft-cancel-action, telegram-action-token-utils, telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-delivery-status-after-download-downloaded.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox delivery status after download downloaded | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-delivery-status-no-documents-valid-with-not-requested.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox delivery status no documents valid with not requested | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-delivery-action.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents delivery action | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-delivery-channel-routing.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents delivery channel routing | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-delivery-confirm-action.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents delivery confirm action | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-delivery-docker-db-mode.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents delivery docker db mode | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | - | YES | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-delivery-ledger-action.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents delivery ledger action | test, regression, auditor, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RTP | - | NO | sandbox-document-delivery-action, sandbox-action-runner | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-delivery-prepare-action.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents delivery prepare action | test, regression, auditor, sandbox, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RP | R/W | NO | sandbox-document-delivery-action, sandbox-action-runner | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-delivery-send-ledger.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents delivery send ledger | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-delivery-status-action.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents delivery status action | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-documents-provider-email-action.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox documents provider email action | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-artifact-semantics.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download artifact semantics | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-content-validation-action.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download content validation action | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-draft-download-artifacts-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-generates-local-pdf-fallback.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download generates local pdf fallback | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | W | YES | sandbox-draft-download-artifacts-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-human-file-names.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download human file names | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-draft-download-artifacts-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-no-client-storage-for-blank-pdf.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download no client storage for blank pdf | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-draft-download-artifacts-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-no-client-storage-for-invalid-content.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download no client storage for invalid content | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-draft-download-artifacts-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-pdf-source-metadata.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download pdf source metadata | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | W | YES | sandbox-draft-download-artifacts-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-pdf-visual-valid-required.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download pdf visual valid required | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | R/W | NO | sandbox-draft-download-artifacts-action | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-persistence-preserves-pac-identity.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download persistence preserves pac identity | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX/LIVE_CAPABLE | RP | - | NO | sandbox-draft-stamp-persistence | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-persistence-preserves-provider-client-link.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download persistence preserves provider client link | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | - | NO | sandbox-draft-stamp-persistence | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-persists-downloaded-status.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download persists downloaded status | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-draft-download-artifacts-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-download-storage-client-layout.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox download storage client layout | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-draft-download-artifacts-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-already-stamped-semantics.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft already stamped semantics | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | R | NO | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-client-hydration.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft client hydration | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | P | - | NO | sandbox-draft-db-loader, sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-client-normalization.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft client normalization | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX_OR_MOCK | P | - | NO | sandbox-draft-db-loader, sandbox-draft-stamp-action | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-db-loader-docker-db-mode.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft db loader docker db mode | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | LOCAL_INTEGRATION/SANDBOX | P | - | YES | sandbox-draft-db-loader | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-db-loader.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft db loader | test, regression, sandbox, db/sql | SANDBOX_OR_MOCK | P | - | NO | - | sandbox-draft-db-loader (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-download-artifacts-action.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft download artifacts action | test, regression, auditor, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RTP | R/W | YES | sandbox-action-runner, sandbox-draft-download-artifacts-action | sandbox-draft-download-artifacts (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-context-preservation.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp context preservation | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-db-loader.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp db loader | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | P | - | YES | sandbox-draft-db-loader, sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-legacy-receiver-uid-gated.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp legacy receiver uid gated | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | - | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-live-mode.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp live mode | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-missing-provider-client-link.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp missing provider client link | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | - | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-payload-unresolved-error-class.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp payload unresolved error class | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX/LIVE_CAPABLE | P | - | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-provider-link-preflight.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp provider link preflight | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | - | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-require-live-mode.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp require live mode | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-stdout-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp stdout contract | test, regression, auditor, workflow/n8n, sandbox, telegram +4 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | sandbox-action-runner | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-stamp-uses-provider-client-link.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft stamp uses provider client link | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | - | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-draft-status-mapping.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox draft status mapping | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-e2e-readiness.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox e2e readiness | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-emitter-profiles.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox emitter profiles | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-emitter-profile-loader | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-fiscal-profiles.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox fiscal profiles | test, regression, sandbox, pac/provider, db/sql, catalog/scoring/cfdi | SANDBOX_OR_MOCK | P | R | NO | sandbox-fiscal-profile-loader, sandbox-emitter-profile-loader | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-human-readable-storage-naming.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox human readable storage naming | test, regression, sandbox, db/sql, runtime/storage | SANDBOX_OR_MOCK | RP | - | NO | sandbox-human-readable-storage-naming | sandbox-human-readable-storage-naming (2) | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-lifecycle-storage-review.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox lifecycle storage review | test, regression, workflow/n8n, sandbox, pac/provider, db/sql +2 | SANDBOX_OR_MOCK | RNP | R/W | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-live-stamp-storage-manifest.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox live stamp storage manifest | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | R/W | YES | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-operational-live-config-source.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox operational live config source | test, regression, auditor, sandbox, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RP | R/W | YES | sandbox-action-runner, sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-operational-live-provider-mode.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox operational live provider mode | test, regression, sandbox, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | P | R | YES | canonical-draft-builder, canonical-invoice-builder, factura-com-sandbox-adapter | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-pdf-diagnose-render-check.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox pdf diagnose render check | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX_OR_MOCK | RP | W | NO | sandbox-pdf-diagnose-action | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-pdf-flate-stream-visual-detection.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox pdf flate stream visual detection | test, regression, sandbox, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX_OR_MOCK | RP | - | NO | sandbox-artifact-content-validator | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-pdf-visual-content-validator.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox pdf visual content validator | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX_OR_MOCK | RP | - | NO | sandbox-artifact-content-validator | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-recover-artifact-state-from-runtime.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox recover artifact state from runtime | test, regression, auditor, sandbox, pac/provider, db/sql +2 | SANDBOX_OR_MOCK | RP | W | NO | sandbox-action-runner | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sandbox-reporting-engine.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox reporting engine | test, regression, sandbox, pac/provider, db/sql, runtime/storage | SANDBOX_OR_MOCK | RNP | R/W | YES | sandbox-reporting-engine | sandbox-reporting-engine (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-stamp-in-progress-self-blocking.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox stamp in progress self blocking | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RP | R | NO | sandbox-draft-stamp-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sandbox-storage-engine.js | TEST_REGRESSION | Prueba/regresion/contrato para sandbox storage engine | test, regression, sandbox, pac/provider, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RNP | R/W | YES | sandbox-storage-engine | sandbox-storage-engine (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-sat-catalog-loader.js | TEST_REGRESSION | Prueba/regresion/contrato para sat catalog loader | test, regression, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | sat-catalogs/sat-catalog-loader, sat-catalogs/sat-catalog-normalizer | sat-catalog-loader (2) | LOW | WRAP_IN_RUNNER |
| scripts/test-sat-catalog-relationship-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para sat catalog relationship contract | test, regression, catalog/scoring/cfdi | OFFLINE_STATIC | - | R | NO | - | - | LOW | WRAP_IN_RUNNER |
| scripts/test-sat-catalog-schema-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para sat catalog schema contract | test, regression, db/sql, catalog/scoring/cfdi | OFFLINE_STATIC | - | R | NO | - | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-sat-field-normalizer.js | TEST_REGRESSION | Prueba/regresion/contrato para sat field normalizer | test, regression, catalog/scoring/cfdi | OFFLINE_STATIC | - | - | NO | sat-catalogs/sat-field-normalizer | sat-field-normalizer (2) | LOW | WRAP_IN_RUNNER |
| scripts/test-sat-official-import-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para sat official import contract | test, regression, workflow/n8n, pac/provider, catalog/scoring/cfdi | LOCAL_INTEGRATION | NP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-sat-source-registry.js | TEST_REGRESSION | Prueba/regresion/contrato para sat source registry | test, regression, catalog/scoring/cfdi | OFFLINE_STATIC | - | R | NO | sat-catalogs/sat-source-registry | sat-source-registry (2) | LOW | WRAP_IN_RUNNER |
| scripts/test-scoring.js | TEST_REGRESSION | Prueba/regresion/contrato para scoring | test, regression, workflow/n8n, pac/provider, security/access, catalog/scoring/cfdi | LOCAL_INTEGRATION | NP | R | NO | - | scoring (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-security-access-control.js | TEST_REGRESSION | Prueba/regresion/contrato para security access control | test, regression, sandbox, telegram, pac/provider, db/sql +1 | SANDBOX_OR_MOCK | TP | R | YES | security-access-control | security-access-control (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-semantic-concept-guardrails.js | TEST_REGRESSION | Prueba/regresion/contrato para semantic concept guardrails | test, regression, workflow/n8n, pac/provider, db/sql, runtime/storage +2 | LOCAL_INTEGRATION | RNP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-shared-bot-access-contracts.js | TEST_REGRESSION | Prueba/regresion/contrato para shared bot access contracts | test, regression, workflow/n8n, sandbox, telegram, db/sql +2 | LOCAL_INTEGRATION/SANDBOX | NTP | R | NO | access-control/channel-identity-contract, access-control/access-gate | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-shared-bot-access-schema-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para shared bot access schema contract | test, regression, db/sql, security/access | OFFLINE_STATIC | - | R | NO | - | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-subscription-entitlements.js | TEST_REGRESSION | Prueba/regresion/contrato para subscription entitlements | test, regression, sandbox, pac/provider, db/sql, security/access | SANDBOX_OR_MOCK | P | - | NO | access-control/entitlements-contract, access-control/subscription-status-enums | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-tax-client-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para tax client contract | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LOCAL_INTEGRATION | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-bot-latency-observability.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram bot latency observability | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | LOCAL_INTEGRATION/SANDBOX | RNTP | R/W | NO | telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-callback-action-executed-response-built.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram callback action executed response built | test, regression, auditor, workflow/n8n, sandbox, telegram +3 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-callback-lifecycle-download-response.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram callback lifecycle download response | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-callback-lifecycle-stamp-response.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram callback lifecycle stamp response | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-callback-reliability-idempotency.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram callback reliability idempotency | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | NTP | R | NO | telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-callback-token-used-recovery.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram callback token used recovery | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-client-fiscal-normalization-message.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram client fiscal normalization message | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | LOCAL_INTEGRATION/SANDBOX | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-allows-local-rendered-pdf.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery allows local rendered pdf | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | W | NO | sandbox-document-delivery-action, document-rendering/local-cfdi-pdf-renderer | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-confirm-send-action.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery confirm send action | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-confirm-token-created.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery confirm token created | test, regression, workflow/n8n, sandbox, telegram, pac/provider +1 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-confirm-token-routing.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery confirm token routing | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-confirmation-tokens.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery confirmation tokens | test, regression, sandbox, telegram, pac/provider, db/sql | SANDBOX/LIVE_CAPABLE | TP | - | NO | telegram-action-token-utils | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-duplicate-block.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery duplicate block | test, regression, workflow/n8n, telegram, pac/provider | LIVE_CAPABLE | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-force-token-created.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery force token created | test, regression, workflow/n8n, sandbox, telegram, pac/provider +1 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-no-force-without-sent.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery no force without sent | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-token-db-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery token db contract | test, regression, workflow/n8n, telegram, pac/provider, db/sql +1 | LIVE_CAPABLE | NTP | R | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-ux-buttons.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery ux buttons | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-delivery-ux-copy.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram delivery ux copy | test, regression, workflow/n8n, sandbox, telegram, pac/provider +1 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-document-delivery-blocks-when-pdf-invalid.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram document delivery blocks when pdf invalid | test, regression, sandbox, telegram, pac/provider, db/sql +2 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | sandbox-document-delivery-action | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-document-delivery-config.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram document delivery config | test, regression, telegram | LIVE_CAPABLE | T | - | NO | telegram-document-delivery-channel | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-document-delivery-human-filenames.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram document delivery human filenames | test, regression, sandbox, telegram, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | telegram-document-delivery-channel | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-document-delivery-security.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram document delivery security | test, regression, sandbox, telegram, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | telegram-document-delivery-channel | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-document-delivery-send-dry-run.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram document delivery send dry run | test, regression, sandbox, telegram, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | telegram-document-delivery-channel | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-document-send-error-diagnostics.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram document send error diagnostics | test, regression, sandbox, telegram, db/sql, runtime/storage +1 | SANDBOX/LIVE_CAPABLE | RTP | R/W | NO | telegram-document-delivery-channel | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-download-invalid-artifact-message.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram download invalid artifact message | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | LOCAL_INTEGRATION/SANDBOX | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-inline-action-tokens.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram inline action tokens | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | R | NO | telegram-action-token-utils | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-latency-db-export.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram latency db export | test, regression, workflow/n8n, telegram, db/sql, runtime/storage +1 | LOCAL_INTEGRATION | RNT | R/W | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-pac-sandbox-console.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram pac sandbox console | test, regression, auditor, workflow/n8n, sandbox, telegram +5 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-pac-sandbox-draft-selection-ux.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram pac sandbox draft selection ux | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-polling-behavior.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram polling behavior | test, regression, workflow/n8n, telegram, runtime/storage, catalog/scoring/cfdi | LIVE_CAPABLE | RNT | R/W | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-polling-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram polling contract | test, regression, workflow/n8n, telegram, catalog/scoring/cfdi | LIVE_CAPABLE | NT | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-confirm-token-in-reply-markup.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action confirm token in reply markup | test, regression, workflow/n8n, sandbox, telegram, pac/provider +1 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-dispatch-context-preserved.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action dispatch context preserved | test, regression, workflow/n8n, sandbox, telegram, pac/provider +1 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-dispatch-delivery-prepare-channel.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action dispatch delivery prepare channel | test, regression, workflow/n8n, sandbox, telegram, db/sql | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-dispatch-delivery-prepare-email.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action dispatch delivery prepare email | test, regression, workflow/n8n, sandbox, telegram, pac/provider +1 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-dispatch-download.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action dispatch download | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | test-telegram-delivery-workflow-harness | telegram-post-action-dispatch (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-dispatch-requires-token-or-safe-block.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action dispatch requires token or safe block | test, regression, workflow/n8n, telegram | LIVE_CAPABLE | NT | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-dispatch-stamp.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action dispatch stamp | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | - | NO | test-telegram-delivery-workflow-harness | telegram-post-action-dispatch (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-no-silent-success.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action no silent success | test, regression, workflow/n8n, sandbox, telegram, db/sql | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-post-action-send-fallback.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram post action send fallback | test, regression, workflow/n8n, telegram, db/sql | LIVE_CAPABLE | NT | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-product-flow-integration.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram product flow integration | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-product-menu-contract.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram product menu contract | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | NO | telegram-product-menu-contract | telegram-product-menu (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-product-menu-renderer.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram product menu renderer | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | telegram-product-menu-contract, telegram-product-menu-renderer | telegram-product-menu-renderer (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-product-menu-router-adapter.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram product menu router adapter | test, regression, auditor, workflow/n8n, sandbox, telegram +5 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | telegram-product-menu-contract, telegram-product-menu-renderer | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-product-stamp-requires-live-sandbox.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram product stamp requires live sandbox | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-sandbox-download-summary-security.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram sandbox download summary security | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-sandbox-download-token-routing.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram sandbox download token routing | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-sandbox-live-config-diagnostics.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram sandbox live config diagnostics | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | RNTP | R | YES | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-sandbox-payload-unresolved-message.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram sandbox payload unresolved message | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-sandbox-stamp-workflow-state-order.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram sandbox stamp workflow state order | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-sql-json-persistence-hardening.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram sql json persistence hardening | test, regression, auditor, workflow/n8n, sandbox, telegram +4 | SANDBOX/LIVE_CAPABLE | RNTP | - | YES | local-db-psql-runner, test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-token-semantics.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram token semantics | test, regression, workflow/n8n, sandbox, telegram, pac/provider +4 | SANDBOX/LIVE_CAPABLE | RNTP | R | NO | telegram-action-token-utils, telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-token-used-recovery-confirm-token.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram token used recovery confirm token | test, regression, workflow/n8n, sandbox, telegram, pac/provider +2 | SANDBOX/LIVE_CAPABLE | NTP | - | NO | test-telegram-delivery-workflow-harness | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-ui-button-acceptance.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram ui button acceptance | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | SANDBOX/LIVE_CAPABLE | RNTP | W | NO | - | telegram-ui-button-acceptance (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-ui-button-state-audit.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram ui button state audit | test, regression, auditor, telegram | OFFLINE_STATIC | T | - | NO | - | telegram-ui-button-state (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-ui-session-watch.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram ui session watch | test, regression, auditor, workflow/n8n, sandbox, telegram +4 | SANDBOX/LIVE_CAPABLE | RNTP | R/W | YES | - | telegram-ui-session-watch (2) | HIGH | WRAP_IN_RUNNER |
| scripts/test-telegram-ui-state-buttons.js | TEST_REGRESSION | Prueba/regresion/contrato para telegram ui state buttons | test, regression, workflow/n8n, sandbox, telegram, pac/provider +3 | LOCAL_INTEGRATION/SANDBOX | RNTP | R | NO | telegram-action-token-utils, telegram-product-menu-contract | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-tenant-fiscal-profile-foundation.js | TEST_REGRESSION | Prueba/regresion/contrato para tenant fiscal profile foundation | test, regression, db/sql | OFFLINE_STATIC | - | R | NO | - | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-trial-mode-roadmap-docs.js | TEST_REGRESSION | Prueba/regresion/contrato para trial mode roadmap docs | test, regression, sandbox, telegram, pac/provider, db/sql +1 | SANDBOX_OR_MOCK | TP | R | NO | - | - | HIGH | WRAP_IN_RUNNER |
| scripts/test-xml-raw-artifact-not-redacted.js | TEST_REGRESSION | Prueba/regresion/contrato para xml raw artifact not redacted | test, regression, sandbox, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX_OR_MOCK | RP | - | NO | sandbox-artifact-content-validator | - | MEDIUM | WRAP_IN_RUNNER |
| scripts/test-xml-redacted-artifact-rejected.js | TEST_REGRESSION | Prueba/regresion/contrato para xml redacted artifact rejected | test, regression, sandbox, db/sql, runtime/storage, catalog/scoring/cfdi | SANDBOX_OR_MOCK | RP | - | NO | sandbox-artifact-content-validator | - | MEDIUM | WRAP_IN_RUNNER |

## 4. Grupos Funcionales

### Factura.com sandbox / PAC
Cantidad: 145.
Ejemplos: `scripts/analyze-factura-com-sandbox-results.js`, `scripts/analyze-sandbox-accountant-checklist.js`, `scripts/analyze-sandbox-accountant-excel.js`, `scripts/analyze-sandbox-accountant-package.js`, `scripts/analyze-sandbox-action-audit.js`, `scripts/analyze-sandbox-action-result.js`, `scripts/analyze-sandbox-reporting.js`, `scripts/analyze-storage-sandbox.js`, `scripts/export-sandbox-action-audit-review.js`, `scripts/generate-sandbox-accountant-checklist.js`, `scripts/generate-sandbox-accountant-excel.js`, `scripts/generate-sandbox-accountant-package.js`, ....

### otros/UNKNOWN
Cantidad: 89.
Ejemplos: `scripts/qa/qa-assertions.js`, `scripts/qa/scenarios/delivery-prepare-flow.js`, `scripts/qa/telegram-webhook-simulator.js`, `scripts/test-business-scenario-suite.js`, `scripts/test-cfdi-receptor-compatibility-validator.js`, `scripts/test-client-billing-summary-view.js`, `scripts/test-client-fiscal-field-normalizer.js`, `scripts/test-client-fiscal-normalize-diagnose-action.js`, `scripts/test-client-fiscal-profile-ux.js`, `scripts/test-client-fuzzy-contract.js`, `scripts/test-client-primary-email-contract.js`, `scripts/test-client-search-selection-ux.js`, ....

### helpers compartidos
Cantidad: 33.
Ejemplos: `scripts/lib/cfdi-receptor-compatibility-validator.js`, `scripts/lib/client-billing-summary-view.js`, `scripts/lib/client-fiscal-normalize-diagnose-action.js`, `scripts/lib/clients/client-fiscal-field-normalizer.js`, `scripts/lib/document-rendering/local-cfdi-pdf-renderer.js`, `scripts/lib/emitter-activity-scope-evaluator.js`, `scripts/lib/emitter-activity-scope-loader.js`, `scripts/lib/emitter-activity-shadow-logger.js`, `scripts/lib/fiscal-activities/fiscal-activity-contract.js`, `scripts/lib/invoice-payment-status-model.js`, `scripts/lib/monthly-billing-dashboard-view.js`, `scripts/lib/payment-status-action.js`, ....

### Telegram UI / botones / callbacks
Cantidad: 27.
Ejemplos: `scripts/qa/telegram-ui-button-acceptance.js`, `scripts/qa/telegram-ui-button-state-audit.js`, `scripts/qa/telegram-ui-session-watch.js`, `scripts/test-local-ingest-workflow-callback-lifecycle.js`, `scripts/test-qa-sandbox-button-smoke-safe.js`, `scripts/test-telegram-callback-action-executed-response-built.js`, `scripts/test-telegram-callback-lifecycle-download-response.js`, `scripts/test-telegram-callback-lifecycle-stamp-response.js`, `scripts/test-telegram-callback-reliability-idempotency.js`, `scripts/test-telegram-callback-token-used-recovery.js`, `scripts/test-telegram-delivery-ux-buttons.js`, `scripts/test-telegram-inline-action-tokens.js`, ....

### scoring/catalogs
Cantidad: 23.
Ejemplos: `scripts/audit-catalog-gaps.js`, `scripts/import-sat-catalog.js`, `scripts/import-sat-catalogs.js`, `scripts/lib/fiscal-activities/concept-eligibility-engine.js`, `scripts/lib/sat-catalogs/sat-catalog-loader.js`, `scripts/lib/sat-catalogs/sat-catalog-normalizer.js`, `scripts/lib/sat-catalogs/sat-field-normalizer.js`, `scripts/lib/sat-catalogs/sat-source-registry.js`, `scripts/propose-resico-catalog-expansion.js`, `scripts/qa/satbot-e2e-harness.js`, `scripts/scoring.js`, `scripts/test-catalog-expansion-contract.js`, ....

### CFDI canonical contracts
Cantidad: 22.
Ejemplos: `scripts/build-cfdi40-knowledge-base.js`, `scripts/lib/canonical-cfdi-contracts.js`, `scripts/lib/canonical-draft-builder.js`, `scripts/lib/canonical-invoice-builder.js`, `scripts/lib/cfdi-rules/cfdi-rule-contract.js`, `scripts/lib/cfdi-rules/cfdi-rule-engine.js`, `scripts/lib/cfdi-rules/cfdi-rule-enums.js`, `scripts/lib/cfdi-rules/cfdi-rule-evaluator.js`, `scripts/lib/cfdi-rules/cfdi-rule-registry.js`, `scripts/lib/cfdi-rules/cfdi-rule-result.js`, `scripts/lib/document-delivery/canonical-document-delivery-contract.js`, `scripts/lib/sat-cfdi-rules-diagnose-action.js`, ....

### SQL / JSON persistence
Cantidad: 21.
Ejemplos: `scripts/lib/client-invoice-ledger-view.js`, `scripts/lib/document-delivery/document-delivery-ledger-store.js`, `scripts/lib/local-db-psql-runner.js`, `scripts/lib/sandbox-draft-db-loader.js`, `scripts/lib/sandbox-draft-stamp-persistence.js`, `scripts/qa/postgres-qa-client.js`, `scripts/test-client-invoice-ledger-view.js`, `scripts/test-client-validation-persistence.js`, `scripts/test-document-delivery-ledger-store.js`, `scripts/test-local-db-psql-runner.js`, `scripts/test-postgres-polling-contract.js`, `scripts/test-postgres-schema.js`, ....

### workflow sync/status
Cantidad: 21.
Ejemplos: `scripts/fixtures/n8n-execution-post-action-dispatch-missing-chat.sanitized.json`, `scripts/lib/test-telegram-delivery-workflow-harness.js`, `scripts/local/01_START_N8N_LOCAL_V3_SAFE.bat`, `scripts/local/start-n8n-pac-sandbox.example.ps1`, `scripts/local/start-n8n-pac-sandbox.local.ps1`, `scripts/qa/n8n-api-client.js`, `scripts/qa/workflow-sync.js`, `scripts/test-local-ingest-workflow-contract.js`, `scripts/test-local-ingest-workflow-post-action-dispatch.js`, `scripts/test-n8n-contract.js`, `scripts/test-n8n-webhook-response-contract.js`, `scripts/test-n8n-workflow-contract.js`, ....

### security/access
Cantidad: 18.
Ejemplos: `scripts/lib/access-control/access-gate.js`, `scripts/lib/access-control/channel-identity-contract.js`, `scripts/lib/access-control/entitlements-contract.js`, `scripts/lib/access-control/invitation-contract.js`, `scripts/lib/access-control/subscription-status-enums.js`, `scripts/lib/security-access-control.js`, `scripts/test-access-gate-read-only.js`, `scripts/test-document-delivery-security.js`, `scripts/test-invitation-contract.js`, `scripts/test-local-ingest-security-enforcement.js`, `scripts/test-provider-client-link-security.js`, `scripts/test-provider-multitenant-schema-contract.js`, ....

### analyzers/inspectors
Cantidad: 12.
Ejemplos: `scripts/analyze-activity-scope-shadow-log.js`, `scripts/analyze-telegram-bot-latency.js`, `scripts/export-telegram-latency-events.js`, `scripts/qa/report-builder.js`, `scripts/qa/sanitize-report.js`, `scripts/test-activity-scope-shadow-log-analyzer.js`, `scripts/test-preview-public-output-contract.js`, `scripts/test-qa-report-builder.js`, `scripts/test-qa-report-real-mode-sanitization.js`, `scripts/test-qa-sanitize-report-does-not-redact-normal-words.js`, `scripts/test-qa-sanitize-report.js`, `scripts/test-telegram-latency-db-export.js`.

### wrappers locales
Cantidad: 8.
Ejemplos: `scripts/local/00_LOAD_LOCAL_ENV_V3_SAFE.ps1`, `scripts/local/02_START_TELEGRAM_RUNNER_LOCAL_V3_SAFE.bat`, `scripts/local/03_DIAGNOSE_LOCAL_ENV_V3_SAFE.bat`, `scripts/local/81_TEST_TELEGRAM_DOCUMENT_DELIVERY_V3_SAFE.bat`, `scripts/local/99_START_ALL_LOCAL_V3_SAFE.bat`, `scripts/local/apply-local-foundation-sql.ps1`, `scripts/local/start-runner.local.example.ps1`, `scripts/local/start-runner.local.ps1`.

### storage sandbox
Cantidad: 3.
Ejemplos: `scripts/test-telegram-download-invalid-artifact-message.js`, `scripts/test-xml-raw-artifact-not-redacted.js`, `scripts/test-xml-redacted-artifact-rejected.js`.

### repo safety
Cantidad: 2.
Ejemplos: `scripts/test-project-readiness.js`, `scripts/test-repo-safety.js`.

## 5. Dependencias/imports Detectados

Top `scripts/lib` importados por scripts:

| Helper lib | Usos detectados |
|---|---:|
| sandbox-action-runner | 26 |
| test-telegram-delivery-workflow-harness | 24 |
| sandbox-draft-stamp-action | 22 |
| telegram-product-menu-contract | 18 |
| factura-com-sandbox-adapter | 17 |
| sandbox-document-delivery-action | 16 |
| canonical-cfdi-contracts | 14 |
| canonical-draft-builder | 14 |
| sandbox-draft-download-artifacts-action | 13 |
| canonical-invoice-builder | 12 |
| local-db-psql-runner | 12 |
| sandbox-accountant-package | 10 |
| factura-com-live-client | 9 |
| factura-com-provider-client-mapper | 9 |
| cfdi-receptor-compatibility-validator | 8 |
| sandbox-artifact-content-validator | 8 |
| sandbox-storage-engine | 8 |
| telegram-document-delivery-channel | 8 |
| document-delivery/document-delivery-ledger-store | 7 |
| provider-contracts/provider-enums | 7 |
| sandbox-draft-db-loader | 7 |
| telegram-action-token-utils | 7 |
| provider-client-link-store | 6 |
| clients/client-fiscal-field-normalizer | 5 |
| document-delivery/canonical-document-delivery-contract | 5 |
| factura-com-payload-mapper | 5 |
| product-modes/product-mode-enums | 5 |
| provider-client/provider-client-readiness-contract | 5 |
| sandbox-draft-stamp-persistence | 5 |
| sat-catalogs/sat-field-normalizer | 5 |
| access-control/subscription-status-enums | 4 |
| cfdi-rules/cfdi-rule-enums | 4 |
| document-rendering/local-cfdi-pdf-renderer | 4 |
| invoice-payment-status-model | 4 |
| pdf/pdf-render-visual-checker | 4 |
| sandbox-accountant-excel | 4 |
| sandbox-emitter-profile-loader | 4 |
| sandbox-reporting-engine | 4 |
| cfdi-rules/cfdi-rule-registry | 3 |
| emitter-activity-scope-evaluator | 3 |
| emitter-activity-scope-loader | 3 |
| facturacom-sandbox-config-resolver | 3 |
| pac-adapter-contract | 3 |
| provider-capabilities-registry | 3 |
| provider-contracts/provider-contract-index | 3 |
| sandbox-accountant-checklist | 3 |
| sandbox-fiscal-profile-loader | 3 |
| sandbox-pdf-diagnose-action | 3 |
| sat-catalogs/sat-catalog-loader | 3 |
| sat-catalogs/sat-source-registry | 3 |

Observaciones de dependencias:
- `scripts/lib/test-telegram-delivery-workflow-harness.js` aparece como base compartida para pruebas Telegram/sandbox que ejecutan nodos Code de workflow en aislamiento.
- `scripts/lib/local-db-psql-runner.js` concentra acceso local a Postgres/psql; cualquier runner futuro debe tratarlo como integracion local, no como test offline puro.
- `scripts/qa/n8n-api-client.js`, `scripts/qa/workflow-sync.js` y `scripts/qa/satbot-e2e-harness.js` son infraestructura QA de alto riesgo de movimiento por credenciales, workflow activo y preservacion de credenciales.
- `scripts/lib/factura-com-*`, `sandbox-*`, `provider-*` y `document-delivery-*` mezclan contratos offline con capacidad live/sandbox; separar por suite antes de mover.

## 6. Candidatos a Consolidacion

Familias con tres o mas archivos relacionados por nombre/ruta. Son candidatos a runner central o suites, no a fusion inmediata:

| Familia | Cantidad | Archivos ejemplo | Recomendacion |
|---|---:|---|---|
| sandbox-action | 5 | scripts/analyze-sandbox-action-audit.js, scripts/analyze-sandbox-action-result.js, scripts/lib/sandbox-action-runner.js, scripts/review-sandbox-action-audit.js, scripts/test-sandbox-action-runner.js | EXTRACT_HELPER / KEEP_LIB |
| factura-com-sandbox | 4 | scripts/analyze-factura-com-sandbox-results.js, scripts/lib/factura-com-sandbox-adapter.js, scripts/smoke-factura-com-sandbox-adapter.js, scripts/test-factura-com-sandbox-adapter.js | EXTRACT_HELPER / KEEP_LIB |
| provider-client-readiness | 4 | scripts/lib/provider-client/provider-client-readiness-action.js, scripts/lib/provider-client/provider-client-readiness-contract.js, scripts/test-provider-client-readiness-action.js, scripts/test-provider-client-readiness-contract.js | EXTRACT_HELPER / KEEP_LIB |
| sandbox-accountant-checklist | 4 | scripts/analyze-sandbox-accountant-checklist.js, scripts/generate-sandbox-accountant-checklist.js, scripts/lib/sandbox-accountant-checklist.js, scripts/test-sandbox-accountant-checklist.js | EXTRACT_HELPER / KEEP_LIB |
| sandbox-accountant-excel | 4 | scripts/analyze-sandbox-accountant-excel.js, scripts/generate-sandbox-accountant-excel.js, scripts/lib/sandbox-accountant-excel.js, scripts/test-sandbox-accountant-excel.js | EXTRACT_HELPER / KEEP_LIB |
| sandbox-accountant-package | 4 | scripts/analyze-sandbox-accountant-package.js, scripts/generate-sandbox-accountant-package.js, scripts/lib/sandbox-accountant-package.js, scripts/test-sandbox-accountant-package.js | EXTRACT_HELPER / KEEP_LIB |

Duplicacion posible detectada sin modificar nada:
- Helpers repetidos: `executeCode`, `getNodeCode`, lectura de workflow JSON, `check()`/`assert` printer y `callbackInput` fixtures aparecen en varias pruebas Telegram/workflow.
- SQL helpers repetidos: `sqlQuote`, `sqlJson`, acceso `runPsqlJson` y escapes de JSON aparecen en QA, stores y acciones sandbox.
- Lectura de runtime/artifacts: acciones de sandbox, analizadores y validadores PDF/XML comparten patron de manifest/artifacts.
- Sanitizacion: tokens/RFC/rutas/XML/PDF se redaccionan en QA reports, Action Layer y workflow summary con variantes similares.
- Telegram/buttons: validacion de callback_data, reply_markup, estados de botones y dispatch aparecen en pruebas unitarias, watcher y audit scripts.
- Factura.com artifacts: descarga, validacion, persistencia y diagnostico de XML/PDF tienen multiples regresiones pequenas complementarias.

## 7. Scripts que NO Deben Fusionarse

Mantener separados por ahora los scripts de alto riesgo o helpers centrales:

| Ruta | Motivo | Riesgo |
|---|---|---|
| scripts/analyze-factura-com-sandbox-results.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/analyze-sandbox-action-audit.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/analyze-telegram-bot-latency.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/audit-catalog-gaps.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/build-cfdi40-knowledge-base.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/export-sandbox-action-audit-review.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/export-telegram-latency-events.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/fixtures/n8n-execution-post-action-dispatch-missing-chat.sanitized.json | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/inspect-facturacom-sandbox-response-shape.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/lib/access-control/access-gate.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/access-control/channel-identity-contract.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/access-control/entitlements-contract.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/access-control/invitation-contract.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/access-control/subscription-status-enums.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/accountant-package-product-view.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/canonical-cfdi-contracts.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/canonical-draft-builder.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/canonical-invoice-builder.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/cfdi-receptor-compatibility-validator.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/cfdi-rules/cfdi-rule-contract.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/cfdi-rules/cfdi-rule-engine.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/cfdi-rules/cfdi-rule-enums.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/cfdi-rules/cfdi-rule-evaluator.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/cfdi-rules/cfdi-rule-registry.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/cfdi-rules/cfdi-rule-result.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/client-billing-summary-view.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/client-fiscal-normalize-diagnose-action.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/client-invoice-ledger-view.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/clients/client-fiscal-field-normalizer.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/document-delivery/canonical-document-delivery-contract.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/document-delivery/document-delivery-ledger-store.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/document-rendering/local-cfdi-pdf-renderer.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/emitter-activity-scope-evaluator.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/emitter-activity-scope-loader.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/emitter-activity-shadow-logger.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/factura-com-live-client.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/factura-com-payload-mapper.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/factura-com-provider-client-mapper.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/factura-com-sandbox-adapter.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/factura-com-sandbox-client-adapter.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/facturacom-sandbox-config-resolver.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/fiscal-activities/concept-eligibility-engine.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/fiscal-activities/fiscal-activity-contract.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/invoice-payment-status-model.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/local-db-psql-runner.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/monthly-billing-dashboard-view.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/pac-adapter-contract.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/payment-status-action.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/pdf/pdf-render-visual-checker.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/product-modes/approval-policy-contract.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/product-modes/channel-adapter-contract.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/product-modes/product-mode-enums.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/provider-capabilities-registry.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/provider-client-link-store.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/provider-client-sync-action.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/provider-client/provider-client-readiness-action.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/provider-client/provider-client-readiness-contract.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/provider-contracts/provider-account.contract.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/provider-contracts/provider-capabilities.contract.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/provider-contracts/provider-client.contract.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/provider-contracts/provider-contract-index.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/provider-contracts/provider-enums.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/provider-contracts/provider-invoice.contract.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/provider-contracts/provider-payment.contract.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/provider-contracts/provider-webhook.contract.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-accountant-checklist.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-accountant-excel.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-accountant-package.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-action-runner.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/sandbox-artifact-content-validator.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-document-delivery-action.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/sandbox-draft-cancel-action.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/sandbox-draft-db-loader.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/sandbox-draft-download-artifacts-action.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-draft-recover-artifact-state-action.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/sandbox-draft-stamp-action.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/sandbox-draft-stamp-persistence.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/sandbox-emitter-profile-loader.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-fiscal-profile-loader.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-human-readable-storage-naming.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-pdf-diagnose-action.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/sandbox-reporting-engine.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sandbox-storage-engine.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/sat-catalogs/sat-catalog-loader.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/sat-catalogs/sat-catalog-normalizer.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/sat-catalogs/sat-field-normalizer.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/sat-catalogs/sat-source-registry.js | API/helper compartido usado por otros scripts | LOW |
| scripts/lib/sat-cfdi-rules-diagnose-action.js | API/helper compartido usado por otros scripts | MEDIUM |
| scripts/lib/security-access-control.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/telegram-action-token-utils.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/telegram-document-delivery-channel.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/telegram-product-menu-contract.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/telegram-product-menu-renderer.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/lib/test-telegram-delivery-workflow-harness.js | API/helper compartido usado por otros scripts | HIGH |
| scripts/local/00_LOAD_LOCAL_ENV_V3_SAFE.ps1 | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/01_START_N8N_LOCAL_V3_SAFE.bat | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/02_START_TELEGRAM_RUNNER_LOCAL_V3_SAFE.bat | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/03_DIAGNOSE_LOCAL_ENV_V3_SAFE.bat | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE.bat | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE.ps1 | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/81_TEST_TELEGRAM_DOCUMENT_DELIVERY_V3_SAFE.bat | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/99_START_ALL_LOCAL_V3_SAFE.bat | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/apply-local-foundation-sql.ps1 | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/start-n8n-pac-sandbox.example.ps1 | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/start-n8n-pac-sandbox.local.ps1 | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/start-runner.local.example.ps1 | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/start-runner.local.ps1 | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/local/start-telegram-runner-pac-sandbox.local.ps1 | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/preflight-facturacom-auth.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/propose-resico-catalog-expansion.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/n8n-api-client.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/postgres-qa-client.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/qa-assertions.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/report-builder.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/sanitize-report.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/satbot-e2e-harness.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/scenarios/delivery-prepare-flow.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/scenarios/sandbox-callback-dispatch.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/scenarios/sandbox-existing-draft-document-flow.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |
| scripts/qa/telegram-ui-button-acceptance.js | Toca live/local/n8n/Telegram/PAC/runtime o wrappers SAFE | HIGH |

## 8. Riesgos de Compactacion

- Alto: mover `scripts/qa/workflow-sync.js`, `satbot-e2e-harness.js` o `n8n-api-client.js` puede romper preservacion de credenciales n8n o apuntar al workflow equivocado.
- Alto: wrappers `scripts/local/*SAFE*` pueden codificar orden de arranque/env y no deben mezclarse con tests.
- Alto: scripts con Telegram real o provider email real deben permanecer detras de guardrails/allowlist.
- Medio: tests con Postgres local o Docker no son offline; un runner central debe etiquetar dependencia `LOCAL_DB`.
- Medio: runtime/artifacts pueden crecer o contener datos sensibles; cualquier runner debe respetar sanitizacion actual.
- Bajo: contratos puros offline pueden agruparse primero en suites, manteniendo archivos como wrappers.

## 9. Arquitectura Recomendada

Sin implementarla ahora, una estructura futura razonable seria:

- `scripts/qa/run-suite.js`: orquestador que ejecuta listas declarativas, con flags `--offline`, `--local-db`, `--telegram`, `--n8n`, `--live-capable`.
- `scripts/qa/lib/`: helpers QA comunes (`check`, `loadWorkflow`, `executeCode`, report sanitized, fixtures, import graph).
- `scripts/qa/suites/`: manifests de suites (`repo-safety`, `telegram-ui`, `sandbox`, `provider`, `postgres`, `workflow`).
- `scripts/qa/watchers/`: wrappers para watchers interactivos y acceptance manual/Telegram.
- `scripts/qa/audits/`: auditorias estaticas o matrices como button-state y SQL/JSON persistence.
- `scripts/qa/regressions/`: tests de regresion puntuales, manteniendo archivos existentes como entradas o wrappers.
- `scripts/qa/integration/`: escenarios que tocan Postgres, n8n, Telegram o Action Layer local.

## 10. Fases de Migracion

1. Fase 1: inventario sin cambios. Este reporte.
2. Fase 2: runner central sin mover scripts. Crear manifests que llamen scripts existentes por ruta y etiqueten dependencias.
3. Fase 3: extraer helpers comunes. Prioridad: `check()` printer, workflow loader, `executeCode`, fixtures Telegram, sanitizacion QA y psql helpers de test.
4. Fase 4: convertir scripts existentes en wrappers. Cada script mantiene CLI estable y delega a helpers/suites.
5. Fase 5: deprecar duplicados solo cuando todas las suites pasen y exista historial de equivalencia.

## 11. Preguntas Abiertas

- Cuales scripts deben considerarse parte de una suite minima diaria vs. suite local completa?
- Que scripts live-capable deben quedar bloqueados salvo allowlist explicita y variable `*_REAL_SEND_ENABLED`?
- Que fixtures runtime/artifacts pueden regenerarse y cuales deben conservarse como golden files?
- Se desea conservar compatibilidad CLI exacta de todos los `test-*.js` aunque pasen a runner central?
- Cuales scripts bajo `scripts/local/` son versionados intencionalmente y cuales son plantillas/SAFE locales no versionables?

## 12. Veredicto Final

El repositorio tiene cobertura amplia pero dispersa. La compactacion segura no debe empezar moviendo archivos: primero conviene envolverlos con un runner declarativo y clasificar dependencias por riesgo. Los helpers mas obvios para extraer despues son carga/ejecucion de workflow, reporting/assertions, sanitizacion, fixtures Telegram y utilidades Postgres. Los scripts de n8n sync, watchers interactivos, wrappers SAFE, Telegram real y Factura.com/PAC live-capable deben mantenerse separados hasta que el runner tenga guardrails equivalentes.

