# Private SatBot Runtime Sync Runbook

## 1. Proposito

Este runbook formaliza la disciplina de sincronizacion entre:

* `workflow/cfdi_telegram_local_ingest.n8n.json` versionado en el repo.
* El workflow activo `cfdi_telegram_local_ingest` importado y ejecutado por n8n local.

Regla principal: `git commit` y `git push` no actualizan n8n. El workflow activo de n8n es runtime separado y debe promoverse, verificarse y validarse explicitamente.

## 2. Alcance

Este documento aplica a Private SatBot y al workflow primario de Telegram local.

En alcance:

* verificacion de drift entre repo y n8n;
* backup/export previo del workflow activo;
* promocion controlada del workflow del repo a n8n;
* verificacion posterior con `workflow-sync-check` y `workflow-status`;
* reportes sanitizados en `runtime/qa-reports`.

Fuera de alcance:

* Public SatBot;
* Telegram real no controlado;
* smokes live;
* pagos, cobranza, PAC, Factura.com y delivery;
* limpieza de DB;
* cambios a `.env`;
* commit de runtime, XML, PDF, backups o secretos.

## 3. Inventario de scripts existentes

| Archivo | Uso | Seguro por defecto |
| --- | --- | --- |
| `scripts/qa/satbot-e2e-harness.js` | Harness principal. Expone `workflow-status`, `workflow-sync-check`, `workflow-sync`, `workflow-activate` e inspectores de ejecucion. | Parcial: `workflow-status` y `workflow-sync-check` son read-only; `workflow-sync` y `workflow-activate` requieren flag explicito. |
| `scripts/qa/workflow-sync.js` | Helpers de hash, diff, payload de update, preservacion de credenciales y backup sanitizado. | Si se importa como helper, si. No ejecuta cambios por si solo. |
| `scripts/qa/n8n-api-client.js` | Cliente API n8n local con bloqueo de remoto por defecto. | Si, mientras `N8N_BASE_URL` sea local o exista autorizacion explicita. |
| `scripts/qa/report-builder.js` | Escribe reportes sanitizados en `runtime/qa-reports`. | Si; escribe solo runtime ignorado por Git. |
| `scripts/qa/telegram-ui-session-watch.js` | Watcher de UI. Ejecuta `workflow-status` y `workflow-sync-check` al iniciar y falla si hay drift. | Read-only para checks iniciales; no usar modo real sin autorizacion. |
| `scripts/test-qa-workflow-sync-check.js` | Test unitario offline del diff/hash de workflow. | Si; usa fixtures. |
| `scripts/test-qa-workflow-sync-safety.js` | Test unitario offline de guardrails: sync/activate bloqueados sin `--allow-workflow-update`. | Si; usa clientes fake. |
| `scripts/test-qa-active-workflow-version-guard.js` | Test unitario offline de nodos criticos de dispatch. | Si; usa fixtures. |

## 4. Flujo obligatorio

Todo cambio que modifique el workflow debe pasar por esta secuencia:

1. Cambiar el workflow en el repo.
2. Correr pruebas locales del slice.
3. Confirmar que no se tocaron archivos fuera de alcance.
4. Hacer commit y push.
5. Respaldar/exportar el workflow activo de n8n.
6. Promover/importar el workflow del repo a n8n solo en modo `PROMOTE_WORKFLOW_RUNTIME`.
7. Ejecutar `workflow-sync-check` y exigir PASS.
8. Ejecutar `workflow-status` y exigir PASS.
9. Validar en Telegram de forma controlada.
10. Guardar y referenciar el reporte en `runtime/qa-reports`.

Un cambio no se considera activo hasta que `workflow-sync-check` pase contra n8n.

## 5. Checks read-only

Estos comandos consultan n8n local y no deben modificar el workflow:

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario workflow-status
node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync-check
```

Interpretacion:

* `workflow-status PASS`: existe workflow esperado, esta activo y tiene nodos criticos.
* `workflow-sync-check PASS`: hash significativo del repo y hash significativo de n8n coinciden.
* `workflow-sync-check FAIL` con `workflow_diff_detected`: n8n esta ejecutando un workflow distinto al repo.

El reporte queda en:

```text
runtime/qa-reports/<timestamp>-workflow-status/
runtime/qa-reports/<timestamp>-workflow-sync-check/
```

`runtime/` no debe commitearse.

## 6. Backup/export previo

Antes de promover un workflow, debe existir respaldo del workflow activo.

Opciones actuales:

1. Export manual desde la UI/API de n8n, guardado fuera del repo o en un lugar ignorado por Git.
2. Promocion con el harness existente: `workflow-sync` genera un backup sanitizado del workflow activo dentro del `workflow-diff.sanitized.json` del reporte runtime antes de actualizar.

Reglas:

* No subir backups.
* No subir credenciales.
* No subir runtime.
* No copiar tokens ni secretos al reporte manual.

Gap conocido: no existe todavia un wrapper standalone `export-active-workflow` que solo exporte backup sin actualizar. `DEFERRED_RUNTIME_SYNC_EXPORT_SCRIPT`.

## 7. Promocion controlada a n8n

Solo usar en modo `PROMOTE_WORKFLOW_RUNTIME`, no en `IMPLEMENT_AND_PUSH`.

Comando de promocion:

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync --allow-workflow-update
```

Que hace:

* carga `workflow/cfdi_telegram_local_ingest.n8n.json`;
* lee el workflow existente en n8n;
* preserva credenciales existentes por nombre de nodo;
* bloquea si se perderian credenciales criticas;
* captura backup sanitizado previo;
* actualiza el workflow de n8n;
* escribe reporte en `runtime/qa-reports`.

Si el workflow queda inactivo o requiere activacion:

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario workflow-activate --allow-workflow-update
```

El flag `--allow-workflow-update` es obligatorio. Sin ese flag, el harness debe bloquear con `WORKFLOW_UPDATE_BLOCKED_BY_DEFAULT`.

## 8. Verificacion posterior

Despues de promover:

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync-check
node scripts/qa/satbot-e2e-harness.js --scenario workflow-status
```

Ambos deben pasar antes de validar Telegram.

Luego ejecutar una validacion controlada de UX segun el slice:

```powershell
node scripts/qa/telegram-ui-session-watch.js --guided
```

No usar Telegram real, smokes live, Factura.com real ni envio real si el prompt no declara `LIVE_VALIDATION` con permisos explicitos.

## 9. Senales de workflow viejo

Tratar como drift runtime:

* Telegram muestra texto o botones ya eliminados del repo.
* `workflow-sync-check` reporta `requires_import: true`.
* El reporte muestra `changed_fields_summary` con `nodes`, `connections` o `settings`.
* El workflow activo no contiene marcas nuevas del slice.
* El watcher rompe con `WORKFLOW_OUT_OF_SYNC`.

Diagnostico rapido:

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync-check
node scripts/qa/satbot-e2e-harness.js --scenario workflow-status
```

## 10. Rollback basico

Si la promocion rompe UX o dispatch:

1. Detener validacion real.
2. Conservar reportes runtime de la promocion.
3. Reimportar el backup/export previo en n8n o usar la UI de n8n para restaurar la version anterior.
4. Ejecutar:

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario workflow-status
node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync-check
```

5. Si el rollback deja n8n intencionalmente distinto al repo, documentar el drift y bloquear go-live hasta reconciliar.

## 11. Que no hacer

* No asumir que `git push` actualiza n8n.
* No usar `git add .`.
* No commitear `runtime/qa-reports`.
* No commitear exports de n8n con credenciales.
* No tocar `.env`.
* No promover workflow en modo `IMPLEMENT_AND_PUSH`.
* No usar `workflow-sync` ni `workflow-activate` sin `--allow-workflow-update`.
* No ejecutar smokes live ni Telegram real sin modo `LIVE_VALIDATION`.
* No tocar PAC/Factura.com real desde este flujo.

## 12. Gates de cierre

Para declarar cerrada una promocion runtime:

* repo safety PASS;
* pruebas locales del slice PASS;
* workflow backup/export disponible;
* `workflow-sync-check PASS`;
* `workflow-status PASS`;
* watcher o validacion controlada PASS;
* reporte runtime guardado en `runtime/qa-reports`;
* ningun secreto, backup, XML, PDF ni runtime commiteado.
