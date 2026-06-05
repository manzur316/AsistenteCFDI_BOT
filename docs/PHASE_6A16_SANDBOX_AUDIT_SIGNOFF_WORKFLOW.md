# Phase 6A.16 Sandbox Audit Signoff Workflow

Estado: implementado

## Objetivo

Crear un flujo local de checklist y signoff humano para revisar el audit sandbox
antes de declarar el bloque 6A listo para cierre formal o transicion planificada
a Fase 7.

Esta fase no crea interfaz web, no modifica workflows, no cambia logica fiscal,
no llama PAC productivo, no timbra y no versiona `runtime/`.

## Entradas

El script lee solo archivos locales:

```text
runtime/sandbox-action-audit/actions.jsonl
runtime/sandbox-action-audit/summary.json
runtime/sandbox-action-audit/review/audit-review.json
```

`summary.json` y `audit-review.json` se usan como evidencia auxiliar. Si faltan,
el checklist queda con FAIL para impedir un signoff prematuro.

## Salidas Locales

El checklist se genera solo bajo runtime local:

```text
runtime/sandbox-action-audit/signoff/SANDBOX_AUDIT_SIGNOFF_CHECKLIST.md
runtime/sandbox-action-audit/signoff/sandbox-audit-signoff-checklist.json
runtime/sandbox-action-audit/signoff/sandbox-audit-signoff-checklist.csv
```

El archivo de aprobacion humana local, cuando se usa `--mark-reviewed`, es:

```text
runtime/sandbox-action-audit/signoff/HUMAN_REVIEWED.local.json
```

Todo permanece ignorado por Git.

## Comandos

Generar checklist:

```powershell
node scripts/generate-sandbox-audit-signoff-checklist.js
```

Marcar revisado localmente:

```powershell
node scripts/generate-sandbox-audit-signoff-checklist.js --mark-reviewed --reviewer-note "Reviewed locally for 6A sandbox transition"
```

Si existe cualquier FAIL, `--mark-reviewed` se rechaza. La nota es obligatoria.

## Secciones Del Checklist

Cada item incluye `id`, `category`, `title`, `status`, `evidence` y
`recommendation`.

Secciones:

- Integridad del audit;
- Seguridad y datos sensibles;
- Acciones ejecutadas;
- Errores y warnings;
- Retencion y backup;
- Export humano;
- Bloqueo produccion/PAC real;
- Revision humana pendiente/aprobada.

Estados permitidos:

- `PASS`
- `WARN`
- `FAIL`
- `MANUAL_REVIEW`

## Reglas De Seguridad

El checklist marca FAIL si:

- el analyzer del audit falla;
- hay hallazgos sensibles;
- faltan archivos minimos;
- el audit contiene payloads, rutas o identificadores prohibidos.

El checklist marca `MANUAL_REVIEW` para:

- aprobacion humana final;
- confirmacion de que runtime local no se compartio;
- confirmacion de que no se usaron datos reales;
- confirmacion de que produccion sigue bloqueada.

## Validacion

```powershell
node scripts/generate-sandbox-audit-signoff-checklist.js
node scripts/generate-sandbox-audit-signoff-checklist.js --mark-reviewed --reviewer-note "Reviewed locally for 6A sandbox transition"
node scripts/test-sandbox-audit-signoff-checklist.js
node scripts/analyze-sandbox-action-audit.js
node scripts/export-sandbox-action-audit-review.js
```

## Siguiente Fase Recomendada

```text
Cierre formal de 6A o transicion planificada a Fase 7.
```
