# Phase 6A.15 Sandbox Audit Dashboard Export

Estado: implementado

## Objetivo

Crear una salida local revisable por humano del audit sandbox, sin interfaz web,
sin Fase 7, sin PAC productivo, sin datos reales y sin enviar archivos por
Telegram.

Esta fase no cambia logica fiscal, no modifica workflows, no llama PAC
productivo y no versiona `runtime/`.

## Entradas Y Salidas

Entrada local:

```text
runtime/sandbox-action-audit/actions.jsonl
runtime/sandbox-action-audit/summary.json
```

Salida local ignorada por Git:

```text
runtime/sandbox-action-audit/review/audit-review.md
runtime/sandbox-action-audit/review/audit-review.csv
runtime/sandbox-action-audit/review/audit-review.json
```

## Comando

```powershell
node scripts/export-sandbox-action-audit-review.js
```

Opciones locales:

```powershell
node scripts/export-sandbox-action-audit-review.js --latest-limit 10
node scripts/export-sandbox-action-audit-review.js --audit-path runtime/sandbox-action-audit/actions.jsonl --output-dir runtime/sandbox-action-audit/review
```

El script no modifica `actions.jsonl`, no borra registros y no aplica retencion.
La retencion sigue viviendo en `scripts/review-sandbox-action-audit.js`.

## Contenido Del Reporte

Los exports incluyen:

- periodo analizado;
- total de acciones;
- acciones por tipo;
- estados por tipo;
- fuentes por tipo;
- ultimos eventos;
- errores y warnings agregados;
- `sensitive_findings_total`;
- recomendaciones de revision humana;
- advertencia de sandbox/no produccion.

El CSV solo contiene columnas seguras:

```text
timestamp,source_kind,action,status,ok,duration_ms,artifacts_count,warnings_count,errors_count,sensitive_findings_count,callback_data,command_token,workflow_version
```

## Datos Prohibidos

El export no debe incluir:

- token Telegram;
- chat_id completo;
- user_id completo;
- RFC;
- UUID;
- UID;
- rutas absolutas;
- rutas runtime detalladas;
- referencias a artifacts con extension sensible;
- CSD;
- archivo de variables locales;
- credenciales PAC;
- datos reales de cliente.

Si el analyzer detecta datos sensibles en el audit, el export falla antes de
generar archivos.

## Validacion

```powershell
node scripts/export-sandbox-action-audit-review.js
node scripts/test-sandbox-action-audit-export.js
node scripts/analyze-sandbox-action-audit.js
```

El test valida que:

- se generen Markdown, CSV y JSON;
- no se modifique el JSONL original;
- el contenido no tenga datos sensibles, rutas absolutas ni referencias de
  artifacts;
- audit vacio o faltante se maneje como export controlado de cero registros;
- el analyzer siga PASS despues del export.

## Siguiente Fase Recomendada

```text
6A.16 Sandbox audit review checklist and signoff workflow
```
