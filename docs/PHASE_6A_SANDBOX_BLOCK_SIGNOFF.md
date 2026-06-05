# Phase 6A Sandbox Block Signoff

Estado: cerrado como sandbox local

Fecha de cierre: 2026-06-05

## Objetivo Del Cierre

Cerrar formalmente el bloque `6A Sandbox PAC/Storage/Reporting/Telegram Audit
Readiness` como completado para operacion local sandbox, sin autorizar
produccion, timbrado real, Fase 7, datos reales ni uso sin revision humana.

## Alcance Cerrado

El bloque 6A queda documentado como completo para los siguientes componentes:

- Action Layer sandbox local.
- Factura.com sandbox adapter y smoke controlado.
- Storage sandbox.
- Reporting sandbox.
- Accountant package sandbox.
- Excel/checklist sandbox para contador.
- n8n Sandbox Action Router.
- Telegram Sandbox UI buttons.
- E2E manual 6A.12.
- Audit history 6A.13.
- Audit retention/review 6A.14.
- Human review export 6A.15.
- Signoff workflow 6A.16.

## Evidencia Resumida

Commits de cierre documentados en este tramo:

```text
2ec88ba0cc50728ffa674754ef7b02fe464687c6  docs: close sandbox telegram e2e phase 6a12
65a7f405981d9f86f27752a909c3a1c438e1ea49  feat: add sandbox action audit history
df8f517d807de4a696dfb6d8ffaedee9e10b895f  feat: add sandbox audit retention review
ee691771268aef73d780735f5c49d95990e156bc  feat: add sandbox audit human review export
b6e27500807ef540e2f9b62f9820e8d1d2aa0ce7  feat: add sandbox audit signoff checklist
```

Gates recientes:

- Audit analyzer: OK.
- Audit activo: 37 registros locales.
- `sensitive_findings`: 0.
- Checklist 6A.16 real: PASS=11, WARN=3, FAIL=0, MANUAL_REVIEW=4.
- `--mark-reviewed` local ejecutado correctamente.
- Repo safety: PASS.
- n8n workflow guardrails: PASS para workflow soportado.
- Sandbox E2E readiness: PASS.
- No XML/PDF/ZIP/Excel enviados por Telegram.
- `runtime/` no versionado.
- Produccion y PAC real siguen bloqueados.

Los `LEGACY-WARN` de workflows historicos se mantienen como deuda documentada y
no son blocker del workflow soportado `workflow/cfdi_sandbox_action_router.n8n.json`.

## Criterio De Cierre

6A se considera completo para sandbox local porque:

- Las acciones sandbox se ejecutan por Action Layer allowlisted.
- n8n orquesta sin duplicar logica fiscal ni leer filesystem desde Code Nodes
  del workflow soportado.
- Telegram sandbox UI usa botones y comandos controlados.
- Los artifacts y reportes viven bajo runtime local ignorado por Git.
- El audit local tiene analyzer, retencion, export humano y checklist de
  signoff.
- El cierre conserva revision humana como requisito.

Este cierre no autoriza:

- produccion;
- timbrado real;
- uso de datos reales sin fase explicita;
- envio de artifacts por Telegram;
- sustitucion de contador;
- Fase 7;
- apertura de PAC productivo.

## Known Debt / Before Fase 7

- Separar UX Telegram operativa de sandbox tecnico.
- Revisar si `workflow/cfdi_telegram_local_ingest.n8n.json` debe migrarse a los
  guardrails nuevos o mantenerse como legacy controlado.
- Definir menu producto Telegram para usuario final.
- Decidir que acciones sandbox aparecen al usuario final y cuales quedan
  admin-only.
- Preparar control de roles antes de cualquier operacion real.
- Mantener los workflows historicos como deuda no blocker hasta una fase de
  migracion o retiro explicita.

## Fase 7 Entry Criteria

Antes de iniciar Fase 7 debe cumplirse:

- Signoff de 6A documentado.
- Audit analyzer OK.
- Checklist de signoff sin FAIL.
- Repo safety PASS.
- Produccion bloqueada.
- Plan UX Telegram aprobado.
- Definicion explicita de roles y acciones admin-only.
- Confirmacion de que no se usaran datos reales sin una fase de habilitacion
  dedicada.

## Siguiente Fase Recomendada

```text
7.0 Telegram Product Interface Planning
```

La siguiente fase debe ser planeacion de interfaz producto, no implementacion
directa de produccion ni PAC real.
