# Phase 6A.14 Sandbox Audit Review And Retention

Estado: implementado

## Objetivo

Definir y probar una politica local para revisar, resumir, retener y limpiar de
forma segura el audit sandbox generado por el Action Layer.

Esta fase no cambia logica fiscal, no llama PAC productivo, no timbra, no
implementa Fase 7 y no versiona `runtime/`.

## Archivo Local

El audit sigue viviendo solo en runtime local:

```text
runtime/sandbox-action-audit/actions.jsonl
```

El resumen seguro se genera en:

```text
runtime/sandbox-action-audit/summary.json
```

Ambos archivos estan ignorados por Git.

## Politica De Retencion

Politica por defecto:

- Conservar maximo `500` registros recientes.
- Conservar maximo `30` dias de historial.
- Usar `--dry-run` por defecto.
- Requerir `--apply` para modificar `actions.jsonl`.

La retencion elimina del archivo activo registros que exceden edad o cantidad.
Antes de aplicar limpieza real, el script crea respaldo y archivo local de
registros archivados bajo:

```text
runtime/sandbox-action-audit/archives/
```

El script bloquea cualquier limpieza que dejaria el audit activo vacio. Ese caso
requiere revision humana.

## Que Nunca Debe Borrarse Sin Revision Humana

- El ultimo registro disponible.
- Evidencia de `ERROR`.
- Evidencia de `PACKAGE_SAFETY_ERROR`.
- Evidencia con `sensitive_findings_count > 0`.
- Archivos de respaldo o archivo archivado generado en runtime.
- Cualquier registro necesario para investigar una ejecucion manual reciente.

## Comandos

Dry-run por defecto:

```powershell
node scripts/review-sandbox-action-audit.js
```

Dry-run con politica local:

```powershell
node scripts/review-sandbox-action-audit.js --max-records 500 --max-age-days 30 --dry-run
```

Aplicar retencion:

```powershell
node scripts/review-sandbox-action-audit.js --max-records 500 --max-age-days 30 --apply
```

Validar audit activo:

```powershell
node scripts/analyze-sandbox-action-audit.js
```

Tests:

```powershell
node scripts/test-sandbox-action-audit-retention.js
```

## Resumen Seguro

`summary.json` incluye:

- `total_records`
- `first_timestamp`
- `latest_timestamp`
- `by_action`
- `by_status`
- `by_source_kind`
- `ok_count`
- `error_count`
- `needs_config_count`
- `needs_runtime_count`
- `package_safety_error_count`
- `sensitive_findings_total`
- `latest_action`
- `latest_status`
- conteos de retencion: retenidos y archivados

No incluye payloads completos, artifacts, XML/PDF, ZIP/Excel, rutas runtime
detalladas ni rutas absolutas.

## Datos Prohibidos

Ni el audit activo, ni el resumen, ni los archivos archivados deben contener:

- token Telegram;
- chat_id completo;
- user_id completo;
- RFC;
- UUID;
- UID;
- rutas absolutas;
- rutas runtime detalladas;
- XML/PDF/ZIP/Excel;
- CSD;
- `.env`;
- credenciales PAC;
- datos reales de clientes.

## Siguiente Fase Recomendada

```text
6A.15 Sandbox audit dashboard/export for human review
```
