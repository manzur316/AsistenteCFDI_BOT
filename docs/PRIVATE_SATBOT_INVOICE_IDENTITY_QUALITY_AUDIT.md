# Private SatBot Invoice Identity Quality Audit

## 1. Objetivo

Clasificar de forma local y solo lectura la calidad de identidad de facturas sandbox para entender por que algunas facturas se muestran con folio proveedor real (`F-68`, `F-67`) y otras requieren fallback operativo (`FAC-SBX-*`).

Esta auditoria no borra datos, no cambia estados, no ejecuta backfill, no llama PAC/Factura.com y no descarga XML/PDF.

## 2. F-XX vs FAC-SBX

`F-XX` o `SERIE-FOLIO` significa que existe folio proveedor usable en `provider_invoice_links` o en `cfdi_drafts.sandbox_pac_summary`.

`FAC-SBX-*` significa que la UX no encontro folio, UUID real ni provider id/uid usable para construir identidad proveedor. Es un fallback local limpio para no exponer `DRAFT-*` ni placeholders como `UUID-00000000`.

## 3. Por que no todas tienen folio

Hay registros historicos creados antes de que `ProviderInvoiceIdentity` gobernara la UX y la persistencia hacia `provider_invoice_links`. Tambien hay registros con:

- `SANDBOX_ERROR`, donde no existe factura timbrada valida.
- `DOWNLOAD_ERROR`, donde el timbrado pudo existir pero la descarga documental fallo.
- identidades mock/legacy derivadas de `DRAFT-*` o sin folio consolidado.

## 4. Herramienta read-only

Script:

```bash
node scripts/audit-provider-invoice-identity-quality.js --dry-run
node scripts/audit-provider-invoice-identity-quality.js --json
node scripts/audit-provider-invoice-identity-quality.js --limit 50
```

La herramienta lee en modo solo consulta:

- `provider_invoice_links`
- `cfdi_drafts`
- `cfdi_drafts.sandbox_pac_summary`

No imprime RFCs, UUID completos, `draft_id` completos, rutas locales, payloads, XML/PDF, tokens ni secretos.

## 5. Resultado dry-run local

Comando ejecutado:

```bash
node scripts/audit-provider-invoice-identity-quality.js --dry-run --limit 50
```

Resumen sanitizado:

| Categoria | Conteo |
| --- | ---: |
| Total facturas analizadas | 50 |
| Con folio proveedor | 41 |
| Con serie+folio | 41 |
| Sin folio pero con UUID | 0 |
| Sin folio pero con provider id | 0 |
| Fallback `FAC-SBX-*` | 9 |
| `SANDBOX_ERROR` | 2 |
| `DOWNLOAD_ERROR` | 4 |
| Mock/legacy sospechoso | 4 |
| Identidad proveedor incompleta | 4 |

## 6. Recomendacion

- Mantener visibles como facturas operativas las que tienen folio proveedor real.
- No borrar registros historicos incompletos sin autorizacion explicita.
- Ocultar o marcar como historicas las facturas `FAC-SBX-*` si contaminan la UX normal.
- Revisar/archivar `SANDBOX_ERROR` como intentos fallidos, no como facturas.
- Revisar/archivar `DOWNLOAD_ERROR` como casos documentales pendientes de diagnostico.
- Considerar un reset sandbox local solo si el entorno se decide como desechable.
- Considerar reconciliacion futura con proveedor para recuperar folio/UUID cuando exista fuente de verdad externa.

## 7. Siguiente decision

Antes de limpiar datos, decidir una de estas rutas:

1. Ocultar historicos incompletos de la UX normal.
2. Resetear sandbox local completo con autorizacion.
3. Ejecutar una reconciliacion futura contra proveedor/manifest, sin borrar datos.
