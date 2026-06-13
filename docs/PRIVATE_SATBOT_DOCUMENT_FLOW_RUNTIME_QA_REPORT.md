# Private SatBot Document Flow Runtime QA Report

## 1. Fecha y alcance

- Fecha local: 2026-06-12 23:48:11 -05:00.
- Ventana watcher: 2026-06-12 23:43:59 a 23:47:00 local.
- Fase: 9R Slice 2.4Q, QA runtime controlado del flujo documental.
- Modo ejecutado: watcher observacional por 180 segundos, sin `--fail-fast`.
- Reporte runtime local generado: `20260613044359-telegram-ui-session-slice-2-4q-manual-doc-flow`.

Este reporte esta sanitizado. No incluye RFCs, tokens, secretos, rutas locales completas, XML/PDF, payloads crudos, correos completos ni SQL con datos.

## 2. Commit probado

- Commit: `cc2a935a7b2312c92f1195d9ec17a7f75c8b58c7`.
- Rama observada: `main`.
- Estado del repo antes del watcher: limpio.

## 3. Preflight offline

Ejecutado antes del QA runtime:

```text
node scripts/test-telegram-documents-provider-folio.js
node scripts/test-telegram-documents-confirmed-actions.js
node scripts/test-telegram-invoices-provider-folio.js
node scripts/test-repo-safety.js
git diff --check
```

Resultado: PASS.

Resumen:

- Documentos por folio proveedor: 38/38 PASS.
- Acciones confirmadas de documentos: 37/37 PASS.
- Facturas por folio proveedor: 33/33 PASS.
- Repo safety: 60/60 PASS.
- `git diff --check`: PASS.

## 4. Workflow runtime read-only

Ejecutado antes del watcher:

```text
node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync-check
node scripts/qa/satbot-e2e-harness.js --scenario workflow-status
```

Resultado:

- `workflow-sync-check`: PASS, workflow en sync.
- `workflow-status`: PASS, workflow activo.
- Durante el watcher: workflow activo `true`, workflow sync `true`.

No se ejecuto `workflow-sync`, no se activo/desactivo workflow y no se modifico n8n.

## 5. Comando watcher ejecutado

```text
node scripts/qa/telegram-ui-session-watch.js --watch --since-now --timeout-ms 180000 --poll-ms 2000 --label slice-2.4q-manual-doc-flow
```

Configuracion relevante:

- Duracion: 180 segundos.
- `--fail-fast`: no usado.
- El watcher registro breaks y continuo hasta terminar la ventana.
- No se habilitaron flags de envio real por correo o canal.

## 6. Resumen observado

- Resultado watcher: FAIL.
- Ejecuciones n8n capturadas: 19.
- Latencia: OK en todas las ejecuciones observadas.
- Ejecuciones lentas: 0.
- Maximo aproximado: 214 ms medidos por trazas del watcher.
- Callbacks duplicados: 0.
- Tokens creados: 51.
- Tokens usados: 6.
- Rutas observadas:
  - `sandbox.draft.download-artifacts`
  - `sandbox.documents.delivery.prepare`
  - `sandbox.documents.delivery.status`
- Envios Telegram del bot al usuario: 18.
- Envios reales por proveedor email: 0.
- Envios reales a canal documental: no observados.
- XML/PDF persistidos al final: no.

## 7. Resultado `/documentos`

Observado en runtime:

- `DOCUMENTS_RECENT_LIST` se abrio correctamente.
- Hubo teclado propio de Documentos con `Ver 1`, filtros de documentos y `Menu principal`.
- No se observaron botones de pagos/cobranza/admin directamente en `DOCUMENTS_RECENT_LIST`.

Limitacion:

- El watcher no se uso para pegar texto visible completo ni payloads. Por eso este reporte no confirma visualmente cada linea de texto, folio ni cliente desde captura; solo confirma acciones, rutas y reply markup observados por n8n.

## 8. Resultado `ver 1`

Observacion importante:

- Tras `DOCUMENTS_RECENT_LIST`, el watcher observo una recuperacion de callback hacia una pantalla con teclado de borrador/draft, no una confirmacion limpia de `DOCUMENT_DETAIL`.
- El teclado recuperado incluyo acciones prohibidas para Documentos:
  - descargar sandbox directo desde contexto de borrador,
  - acciones de envio heredadas,
  - cancelar CFDI sandbox,
  - marcar pendiente/pagada/parcial/vencida,
  - regresar a borrador,
  - ver resumen/ledger.

Impacto:

- Esto viola screen ownership para Documentos.
- Esto tambien expone pagos/cancelacion en una ruta que debia permanecer documental.

Severidad: BLOCKER.

## 9. Resultado `descargar 1`

Observado:

- Se ejecuto la ruta `sandbox.draft.download-artifacts` una vez durante la ventana.
- La accion no dejo la DB en estado documental descargado.
- Estado final observado para el draft principal redacted:
  - factura fiscal: timbrada sandbox,
  - artifact status: `DOWNLOAD_ERROR`,
  - XML descargado: false,
  - PDF descargado: false,
  - documentos validos: false.

Impacto:

- La prueba de descarga controlada no completo como `Descargados`.
- No se observaron rutas locales completas ni XML/PDF en la salida sanitizada.

Severidad: HIGH.

## 10. Resultado intento duplicado

Observado:

- No se detectaron callbacks/interacciones duplicadas en la ventana del watcher.
- Se observo una recuperacion segura para token ya usado: `CALLBACK_TOKEN_USED_RECOVERY`.

Resultado: PASS para proteccion de reuso observada.

## 11. Resultado `enviar 1`, `correo 1`, `canal 1`

Observado:

- Se observo `sandbox.documents.delivery.prepare`.
- El ledger documental registro preparacion bloqueada por documentos invalidos/no descargados.
- No hubo envio real por proveedor email.
- No se observo envio real a canal documental.
- Se observo `sandbox.documents.delivery.status`.

Resultado:

- PASS para no enviar sin documentos validos.
- PASS para no envio real en esta fase.
- WARN porque `delivery.prepare` y `delivery.status` no cambiaron snapshot DB, aunque esto puede ser esperado para consulta/preparacion bloqueada.

## 12. Comandos bloqueados y acciones peligrosas

Hallazgo critico:

- El watcher observo una accion de pago `PAYMENT_STATUS_MARKED_PARTIAL` durante la ventana.
- Luego se observo `PAYMENT_STATUS_ALREADY_PENDIENTE`.
- Esto confirma que hubo botones/acciones de pago alcanzables durante la navegacion observada.

Impacto:

- La fase exigia no tocar pagos/cobranza funcional.
- Documentos no debe heredar ni exponer botones de pago.

Severidad: BLOCKER.

## 13. Bugs encontrados

### BLOCKER

1. `DOCUMENT_DETAIL` o su ruta de recuperacion puede caer en pantalla/teclado de borrador con acciones prohibidas.
   - Evidencia: despues de Documentos se observo recuperacion con botones de borrador, pago, cancelacion y delivery heredado.
   - Riesgo: screen ownership roto; acciones peligrosas fuera de contexto documental.

2. Acciones de pago fueron alcanzables durante QA documental.
   - Evidencia: accion runtime de pago parcial observada.
   - Riesgo: mutacion de cobranza/pagos desde una fase que debia ser documental y de consulta/confirmacion.

### HIGH

3. Descarga documental no completo.
   - Evidencia: ruta `sandbox.draft.download-artifacts` ejecutada y estado final `DOWNLOAD_ERROR`, XML/PDF false.
   - Riesgo: el flujo confirmado llega al action layer pero no produce estado `Descargados`.

4. Boton de descarga aparece en estados donde el watcher lo clasifica como invalido.
   - Evidencia: `APPROVED_BEFORE_STAMP_SHOWS_DOWNLOAD` repetido.
   - Nota: el draft tenia factura fiscal timbrada sandbox, por lo que puede haber mismatch entre modelo del watcher y combinacion `status`/`invoice_status`; requiere triage antes de clasificarlo como falso positivo.

### MEDIUM

5. Una ejecucion no despacho respuesta Telegram.
   - Evidencia: `TELEGRAM_DISPATCH_MISSING`.
   - Riesgo: usuario puede quedar sin respuesta en una accion.

### LOW/WARN

6. `delivery.prepare` y `delivery.status` no cambiaron snapshot DB.
   - Evidencia: `DB_UNCHANGED_AFTER_ACTION`.
   - Nota: puede ser esperado si solo consulta o bloquea por documentos invalidos.

## 14. Evidencia sanitizada

Resumen del watcher:

```text
Result: FAIL
Workflow active: true
Workflow sync: true
Total executions: 19
Slow executions: 0
Duplicate callbacks/interactions: 0
Provider email sends: 0
Routes observed: sandbox.draft.download-artifacts, sandbox.documents.delivery.prepare, sandbox.documents.delivery.status
Final documents state: DOWNLOAD_ERROR, XML false, PDF false
```

Codigos de falla:

```text
TELEGRAM_DISPATCH_MISSING
APPROVED_BEFORE_STAMP_SHOWS_DOWNLOAD
DOWNLOAD_ACTION_DB_NOT_DOWNLOADED
DB_UNCHANGED_AFTER_ACTION
```

## 15. Confirmacion de seguridad

Confirmado:

- No se modifico codigo.
- No se modifico workflow.
- No se ejecuto workflow-sync.
- No se ejecuto smoke live.
- No se timbro CFDI.
- No se llamo PAC/Factura.com para timbrado.
- No se envio correo real.
- No se envio a canal documental real.
- No se modifico `.env`.
- No se cambio DB schema.
- No se subieron runtime, XML, PDF, ZIP, backups ni secretos.
- El watcher continuo ante breaks y termino por timeout configurado.

Observacion:

- Se observo una ejecucion de descarga sandbox/local dentro de la ventana autorizada por el usuario. No produjo XML/PDF descargados y no se imprimieron rutas ni payloads.
- Se observo accion de pago durante navegacion manual; queda documentada como bug y no se corrige en esta fase.

## 16. Veredicto

FAIL.

El modulo Documentos abre lista reciente, pero el flujo runtime aun no cumple la garantia de acciones documentales aisladas. Antes de avanzar, hay que corregir la recuperacion/contexto de `DOCUMENT_DETAIL`, retirar acciones de pago/cancelacion heredadas de rutas documentales, y triagear por que la descarga confirmada termina en `DOWNLOAD_ERROR`.

## 17. Siguiente paso recomendado

Crear slice correctivo antes de repetir QA:

1. Fijar screen ownership en rutas recuperadas desde tokens de Documentos.
2. Bloquear acciones de pago/cancelacion cuando `source_module=DOCUMENTS`.
3. Asegurar que `ver N` desde `DOCUMENTS_RECENT_LIST` abre siempre `DOCUMENT_DETAIL`.
4. Diagnosticar `DOWNLOAD_ERROR` sin imprimir XML/PDF ni rutas sensibles.
5. Repetir watcher 3 minutos y checklist manual sin tocar pagos ni envios reales.

## 18. Actualizacion Slice 9R 2.4F

Se aplico fix correctivo para los blockers del QA runtime anterior:

- `cfdi_nav:client_ledger`, `cfdi_nav:pay_paid` y `cfdi_nav:pay_cancel` ya no abren `CLIENT_INVOICE_LEDGER` en UX normal. Responden con aviso `CLIENT_INVOICE_LEDGER_DEPRECATED` y rutas seguras a Facturas, Clientes, Cobranza y Menu principal.
- `CLIENT_LEDGER` desde `CLIENT_DETAIL` y `facturas N` desde lista de clientes siguen abriendo `CLIENT_INVOICES_LIST` por folio proveedor.
- Las recuperaciones de token `used/expired/context recovered` con `source_module=DOCUMENTS` usan teclado documental propio y no vuelven a `DRAFT_DETAIL`.
- Cualquier token de pago con payload documental queda bloqueado con `DOCUMENT_ACTION_BLOCKED`; no muta `payment_status`.
- El resultado documental de `DOWNLOAD_ERROR` muestra motivo humano seguro y no imprime rutas, payload crudo, UUID completo ni errores tecnicos con pipes.

Validacion offline agregada:

```text
node scripts/test-telegram-runtime-qa-fix-document-isolation.js
node scripts/test-telegram-callback-lifecycle-delivery-response.js
```

Siguiente paso: repetir QA runtime controlado para confirmar en Telegram/n8n que la navegacion ya no hereda teclados de borrador y que `DOWNLOAD_ERROR`, si reaparece, queda como error humano seguro.

## 19. Actualizacion Slice 9R 2.4G

Se aplico fix correctivo adicional porque el QA posterior mostro que el problema no era solo teclado heredado: el bot aun mezclaba entidad, pantalla y accion.

Cambios aplicados:

- `VIEW_DRAFT` y detalle de draft ahora enrutan una entidad ya timbrada (`SANDBOX_TIMBRADO`, `DOWNLOAD_READY`, `DOWNLOADED` o identidad proveedor) a `INVOICE_DETAIL`, no a una pantalla de "Borrador aprobado".
- `INVOICE_DETAIL` de factura timbrada muestra folio proveedor/fallback seguro, `Borrador origen: BOR-*`, proveedor y estados humanos; no muestra `DRAFT-*`, `SANDBOX_TIMBRADO`, pipes, pago, cancelacion ni delivery directo.
- El fallback visible sin folio/UUID/provider id usa `FAC-SBX-<id corto>` y no `SANDBOX-INV-DRAFT-*`.
- `/start` y `/menu` son rutas absolutas al menu principal y no recuperan estados o resultados de acciones previas.
- `DOWNLOAD_SANDBOX_ARTIFACTS` solo se planea desde `DOCUMENT_DOWNLOAD_CONFIRM` con `source_module=DOCUMENTS`, token vigente, `draft_id`, referencia proveedor suficiente y estado descargable.
- `DELIVERY_CONFIRM_*` solo se planea desde `DOCUMENT_DELIVERY_CONFIRM` con `source_module=DOCUMENTS`, token vigente, XML/PDF descargados y contexto documental valido.
- Los resultados post-descarga/post-delivery ya no regeneran botones de envio directo fuera del detalle documental confirmado.
- `DOWNLOAD_ERROR` queda clasificado con motivo humano seguro y sin rutas locales, payloads, UUID completo ni estados crudos.

Validacion offline agregada:

```text
node scripts/test-telegram-entity-state-routing-and-delivery-guard.js
node scripts/test-telegram-runtime-qa-fix-document-isolation.js
node scripts/test-telegram-documents-confirmed-actions.js
node scripts/test-telegram-callback-lifecycle-download-response.js
node scripts/test-telegram-callback-lifecycle-delivery-response.js
node scripts/test-telegram-ui-state-buttons.js
node scripts/test-telegram-ui-button-state-audit.js
```

Veredicto documental post-fix: requiere nueva QA runtime observacional corta. No se ejecuto watcher en este slice correctivo.

## 22. Actualizacion Slice 9R 2.4J

Se corrigio el caso detectado por watcher `APPROVED_BEFORE_STAMP_SHOWS_DOWNLOAD`:

- La solicitud `DRAFT_SANDBOX_STAMP_REQUESTED` ya no prepara botones documentales antes de saber si el timbrado fue exitoso.
- El resumen de `sandbox.draft.stamp` en error ya no reutiliza `source.sandbox_reply_markup`; usa un teclado seguro de error.
- `SANDBOX_ERROR` no muestra descarga, estado documental, envio, pago, cancelacion ni ledger.
- El mensaje de error queda humano y sanitizado: `No se pudo timbrar sandbox`, borrador origen `BOR-*`, cliente, estado `error de timbrado` y acciones de recuperacion.
- Se agrego auditoria local read-only de identidad de factura para explicar folio proveedor vs fallback `FAC-SBX-*`.

Resultado dry-run sanitizado de identidad (`--limit 50`):

- Total analizado: 50.
- Con folio proveedor: 41.
- Con serie+folio: 41.
- Sin folio pero con UUID: 0.
- Sin folio pero con provider id: 0.
- Fallback `FAC-SBX-*`: 9.
- `SANDBOX_ERROR`: 2.
- `DOWNLOAD_ERROR`: 4.
- Mock/legacy sospechoso: 4.
- Identidad proveedor incompleta: 4.

Recomendacion: no borrar datos historicos en esta fase. Primero ocultar o marcar historicos incompletos de la UX normal, o decidir reset sandbox/reconciliacion futura con autorizacion explicita.

Veredicto documental post-fix: requiere nueva QA runtime observacional corta. No se ejecuto watcher en este slice correctivo.

## 21. Actualizacion Slice 9R 2.4I

Se aplico fix correctivo para los fallos visibles posteriores al Slice 2.4H:

- UUIDs placeholder (`00000000`, UUIDs con primer bloque `00000000`, `UUID-00000000`, `SIN_UUID`, `NO_APLICA`, `DUMMY`, `TEST`) ya no cuentan como identidad proveedor visible.
- Facturas y Documentos caen a fallback limpio (`FAC-SBX-<id corto>`) cuando no hay folio/UUID/provider uid real.
- Tokens vencidos/usados/invalidos recuperan por modulo:
  - Documentos: Documentos, Facturas, Menu principal, Ayuda.
  - Facturas: Facturas, Documentos, Menu principal, Ayuda.
  - Borradores: Por revisar, Listos para facturar, Crear nuevo borrador, Menu principal, Ayuda.
  - Desconocido: Menu principal, Facturas, Documentos, Ayuda.
- La recuperacion ya no muestra por defecto botones de Borradores desde contexto de Facturas/Documentos.
- Se elimina el texto basura `Factura: Factura` / `Documento: Documento` en recuperaciones sin identidad real.
- `editMessageText` fallido debe tratarse como WARN recuperado si el fallback visible entrega contexto y teclado correctos.

Validacion offline agregada:

```text
node scripts/test-telegram-contextual-recovery-and-placeholder-identity.js
node scripts/test-telegram-list-navigation-context.js
node scripts/test-telegram-ui-button-state-audit.js
```

Veredicto documental post-fix: requiere nueva QA runtime observacional corta. No se ejecuto watcher en este slice correctivo.

## 20. Actualizacion Slice 9R 2.4H

Se corrigieron inconsistencias visibles detectadas en QA runtime posterior:

- Facturas y Documentos ya no usan provider ids tecnicos tipo `SANDBOX-INV-DRAFT-*` como identidad visible. Si no hay folio, UUID ni provider uid/id usable, la UX muestra `FAC-SBX-<id corto>` y conserva `BOR-*` solo como borrador origen.
- `INVOICE_DETAIL` y `DOCUMENT_DETAIL` dejan de listar texto redundante de `Opciones:` cuando los botones ya estan en el teclado.
- El modulo `Borradores` ahora usa `Por revisar` y `Listos para facturar`; `/aprobadas` queda como alias operativo, pero la pantalla visible se titula `Listos para facturar`.
- `Borradores` ya no incluye `Documentos`; XML/PDF y envios viven en `/documentos`.

Triage watcher sin ejecutar watcher nuevo:

- `DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON`: clasificado como `CLASSIFIER_NEEDS_UPDATE`. En la evidencia de execution 3396 el reply_markup si tenia boton visible `Descargar XML/PDF sandbox`, pero el watcher lo veia con `action=null` por ser tokenizado. Se actualizo el clasificador para aceptar el texto visible del boton como evidencia de descarga disponible.
- `TELEGRAM_CHANNEL_SEND_OBSERVED x2`: clasificado como `WATCHER_FALSE_POSITIVE`. Las executions 3402/3403 fueron `INVOICE_DETAIL` sin route `sandbox.documents.delivery.send`; el watcher conto filas historicas `SENT` del `document_delivery_ledger`. Se ajusto para contar envios observados solo cuando pertenecen a una ejecucion real de `sandbox.documents.delivery.send` y caen dentro de la ventana de ejecucion.

Validacion offline agregada:

```text
node scripts/test-telegram-invoice-fallback-and-borradores-naming.js
node scripts/test-telegram-ui-session-watch.js
```

Veredicto documental post-fix: requiere nueva QA runtime observacional corta. No se ejecuto watcher en este slice correctivo.
