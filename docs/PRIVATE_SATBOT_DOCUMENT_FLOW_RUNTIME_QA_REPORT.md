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

## 30. Actualizacion Slice 9R 2.4R

Se agrego la superficie de reenvio y acceso a artefactos para facturas/documentos timbrados ya enviados:

- `SENT/PROTECTED` deja de ocultar acciones documentales. Ahora muestra `Reenviar por correo` y `Reenviar a canal`, con confirmacion obligatoria.
- `Enviar` y `Reenviar` quedan diferenciados en copy, token y auditoria: el envio inicial usa intencion normal; el reenvio usa intencion `RESEND` y requiere accion explicita del usuario.
- `DOCUMENT_DETAIL`, `DOCUMENT_STATUS_DETAIL` e `INVOICE_DETAIL` muestran acceso a `Descargar XML/PDF` cuando el estado documental esta `DOWNLOADED`.
- `DOWNLOAD_READY` muestra solo descarga sandbox con confirmacion; `DOWNLOAD_ERROR` muestra reintento o ultimo resultado; `SANDBOX_ERROR` no muestra descarga, envio ni reenvio.
- `Historial de envios` queda como pantalla de consulta sanitizada basada en `document_delivery_ledger`, sin cambiar schema.
- Si no hay registros de envio, el historial muestra un mensaje humano seguro.
- No se implementa reenvio automatico.
- No se implementa deteccion nueva de archivos locales faltantes; queda como deuda si se requiere comprobar disco de forma segura.
- Facturas y Documentos son entradas distintas a la misma superficie operativa de una factura timbrada.
- Cobranza queda fuera de alcance. No se modifican pagos, PAC/proveedor, cancelacion, eliminacion, `.env`, schema ni datos.

Watcher/classifier actualizado:

- `SENT_DOCUMENT_HIDES_RESEND` detecta detalle/status/factura enviada que oculta reenvio.
- `DOWNLOADED_DOCUMENT_MISSING_ARTIFACT_ACCESS` detecta detalle/status/factura descargada sin acceso XML/PDF.
- `RESEND_PREPARE_SHOWS_SEND_ERROR` detecta preparacion de reenvio renderizada como error o con estados tecnicos.
- `RESEND_CHANNEL_MISMATCH` detecta cruce canal/correo en confirmaciones de reenvio.
- Las listas generales de Documentos no se marcan si solo exponen `Ver N`.

Validacion offline agregada:

```text
node scripts/test-telegram-document-resend-and-artifact-access.js
node scripts/test-telegram-document-status-action-surface.js
node scripts/test-telegram-stable-document-navigation-callbacks.js
node scripts/test-telegram-free-text-precedence-and-callback-recovery-boundary.js
node scripts/test-telegram-delivery-confirm-token-validity-and-error-render.js
node scripts/test-telegram-document-capability-surfaces-and-delivery-confirmation.js
node scripts/test-telegram-downloaded-delivery-cta.js
node scripts/test-telegram-documents-confirmed-actions.js
node scripts/test-telegram-post-stamp-success-download-cta.js
node scripts/test-telegram-stamp-error-document-action-guard.js
node scripts/test-telegram-invoice-fallback-and-borradores-naming.js
node scripts/test-telegram-contextual-recovery-and-placeholder-identity.js
node scripts/test-telegram-entity-state-routing-and-delivery-guard.js
node scripts/test-telegram-runtime-qa-fix-document-isolation.js
node scripts/test-telegram-documents-provider-folio.js
node scripts/test-telegram-invoices-provider-folio.js
node scripts/test-telegram-callback-lifecycle-download-response.js
node scripts/test-telegram-callback-lifecycle-delivery-response.js
node scripts/test-telegram-product-menu-contract.js
node scripts/test-telegram-product-menu-renderer.js
node scripts/test-telegram-product-menu-router-adapter.js
node scripts/test-telegram-product-flow-integration.js
node scripts/test-telegram-client-list-navigation.js
node scripts/test-telegram-list-navigation-context.js
node scripts/test-telegram-ui-state-buttons.js
node scripts/test-telegram-ui-button-state-audit.js
node scripts/test-telegram-ui-session-watch.js
node scripts/test-repo-safety.js
git diff --check
```

Resultado: PASS. Tambien pasaron los contratos de workflow porque se modifico `cfdi_telegram_local_ingest.n8n.json`:

```text
node scripts/test-n8n-workflow-contract.js
node scripts/test-n8n-workflow-guardrails.js
node scripts/test-local-ingest-workflow-contract.js
```

Veredicto documental post-fix: requiere repetir QA runtime de Facturas/Documentos enfocada en reenviar y acceso XML/PDF. No se ejecuto watcher interactivo en este slice correctivo.

## 31. Actualizacion Slice 9R 2.4S

Se corrigio el flujo minimo de pago local en Cobranza:

- Las listas de Cobranza usan folio proveedor cuando existe, en lugar de mostrar `BOR-*` como identidad principal.
- Si no hay folio/UUID/PAC util, la UX usa `FAC-SBX-*` y deja `BOR-*` solo como origen/fallback explicito.
- `pagar N` y `pagarN` abren `COLLECTION_PAYMENT_CONFIRM`, no aplican pago directo.
- La pantalla de confirmacion declara que el cambio es local, no actualiza SAT/PAC/proveedor y no emite complemento de pago.
- `Confirmar pagada` usa token `MARK_PAYMENT_PAID` con `source_capability=LOCAL_PAYMENT_STATUS`.
- Al confirmar se actualiza el estado local existente (`PAGADO` internamente, `Pagada` en UX) y se registra monto/fecha local cuando las columnas existen.
- `provider_invoice_links.payment_status_local` se actualiza cuando existe el link.
- `provider_invoice_links.payment_status_provider` no se actualiza.
- No se modifican folio, UUID, XML/PDF, delivery ledger, PAC/proveedor, cancelacion, complemento de pago, `.env`, schema ni datos ajenos.

Auditoria previa de columnas existentes:

- `cfdi_drafts.payment_status`
- `cfdi_drafts.payment_amount_paid`
- `cfdi_drafts.payment_paid_at`
- `cfdi_drafts.updated_at`
- `provider_invoice_links.payment_status_local`
- `provider_invoice_links.payment_status_provider`
- `cfdi_payment_status_events`

No se creo schema nuevo. El enum historico usa `PAGADO`, por lo que no se introduce `PAGADA` como valor DB.

Watcher/classifier actualizado:

- `PAYMENT_CONFIRM_WITHOUT_STATE_CHANGE`
- `PAYMENT_CONFIRM_PROVIDER_BOUNDARY_MISSING`
- `COLLECTION_USES_LOCAL_DRAFT_ID_WHEN_PROVIDER_ID_AVAILABLE`
- `PAYMENT_CONFIRMED_BUT_STILL_LISTED_PENDING`

Validacion offline agregada:

```text
node scripts/test-telegram-collection-payment-local-state-and-provider-boundary.js
node scripts/test-telegram-collection-payment-confirmation-observation.js
node scripts/test-telegram-ui-session-watch.js
```

Veredicto post-fix: requiere QA runtime corta de Cobranza. No se ejecuto watcher interactivo en este slice correctivo.

## 25. Actualizacion Slice 9R 2.4M

Se aplico fix correctivo para la navegacion documental rota en preparacion y confirmacion de entrega:

- El guard documental ya no depende exclusivamente de `source_module=DOCUMENTS`.
- Las acciones documentales se autorizan por capacidad y superficie: `DOCUMENT_DOWNLOAD`, `DOCUMENT_DELIVERY`, `POST_STAMP_DOWNLOAD_READY`, `POST_DOWNLOAD_DELIVERY_READY`, `INVOICE_DETAIL`, `DOCUMENT_DETAIL`, `DOCUMENT_DOWNLOAD_CONFIRM` y `DOCUMENT_DELIVERY_CONFIRM`.
- `INVOICE_DETAIL` y `DOCUMENT_DETAIL` ahora son superficies operativas: descarga cuando `artifact_status=DOWNLOAD_READY`, envio cuando `DOWNLOADED + xml=true + pdf=true + delivery=PENDING`, y estado sin envio duplicado cuando `SENT/PROTECTED`.
- `POST_DOWNLOAD_DELIVERY_READY` puede preparar envio por correo o canal despues de una descarga exitosa.
- `Enviar a canal` abre una confirmacion de canal con destino `canal de Telegram` y token `DELIVERY_CONFIRM_TELEGRAM_CHANNEL`.
- `Enviar por correo` abre una confirmacion de correo con destino `correo del cliente/proveedor configurado` y token `DELIVERY_CONFIRM_PROVIDER_EMAIL`.
- La pantalla de preparacion ya no muestra `No se pudo enviar`, `Motivo: READY` ni estados tecnicos como `TOKEN_VALID`, `PENDING` o `GUARD_OK`.
- La pantalla de resultado conserva `No se pudo enviar` solo para errores reales de envio.
- Botones basicos (`Documentos`, `Facturas`, `Menu principal`, `Volver a documento`, `Volver a Documentos`, `Ayuda`) usan callbacks estables o tokens vigentes con handler.
- Se retiro el copy obsoleto `No se envian documentos por Telegram en esta fase`.
- Cobranza funcional, pagos reales, cancelacion, complemento de pago y sincronizacion de pago con PAC/proveedor no fueron modificados.

Watcher/classifier actualizado:

- `DOWNLOADED_MISSING_DELIVERY_BUTTON` aplica en `DOCUMENT_DOWNLOAD_RESULT`, `DOCUMENT_DETAIL` e `INVOICE_DETAIL`.
- El detector ya no exige botones de envio en `DOCUMENTS_RECENT_LIST`, recuperaciones, menus, ayuda, Cobranza ni confirmaciones de pago.
- Se agrego `DELIVERY_CHANNEL_MISMATCH` para romper si canal/correo se cruzan entre boton, payload y texto visible.
- Se agrego `DELIVERY_PREPARE_SHOWS_RESULT_ERROR` para romper si una preparacion se presenta como error de resultado.

Validacion offline agregada:

```text
node scripts/test-telegram-document-capability-surfaces-and-delivery-confirmation.js
node scripts/test-telegram-downloaded-delivery-cta.js
node scripts/test-telegram-documents-confirmed-actions.js
node scripts/test-telegram-post-stamp-success-download-cta.js
node scripts/test-telegram-stamp-error-document-action-guard.js
node scripts/test-telegram-invoice-fallback-and-borradores-naming.js
node scripts/test-telegram-contextual-recovery-and-placeholder-identity.js
node scripts/test-telegram-entity-state-routing-and-delivery-guard.js
node scripts/test-telegram-runtime-qa-fix-document-isolation.js
node scripts/test-telegram-documents-provider-folio.js
node scripts/test-telegram-invoices-provider-folio.js
node scripts/test-telegram-callback-lifecycle-download-response.js
node scripts/test-telegram-callback-lifecycle-delivery-response.js
node scripts/test-telegram-product-menu-contract.js
node scripts/test-telegram-product-menu-renderer.js
node scripts/test-telegram-product-menu-router-adapter.js
node scripts/test-telegram-product-flow-integration.js
node scripts/test-telegram-client-list-navigation.js
node scripts/test-telegram-list-navigation-context.js
node scripts/test-telegram-ui-state-buttons.js
node scripts/test-telegram-ui-button-state-audit.js
node scripts/test-telegram-ui-session-watch.js
node scripts/test-repo-safety.js
git diff --check
node scripts/test-n8n-workflow-contract.js
node scripts/test-n8n-workflow-guardrails.js
node scripts/test-local-ingest-workflow-contract.js
```

Resultado: PASS.

Confirmacion de alcance:

- No se ejecuto watcher interactivo.
- No se ejecutaron smokes live.
- No se llamo PAC/Factura.com real.
- No se timbro CFDI sandbox ni real durante pruebas.
- No se ejecutaron descargas reales.
- No se ejecutaron envios reales por correo o canal.
- No se marcaron pagos reales.
- No se modifico `.env`.
- No se cambio DB schema ni se limpiaron datos.
- No se subieron runtime, XML, PDF, ZIP, backups ni secretos.

Veredicto documental post-fix: requiere nueva QA runtime documental corta enfocada en post-timbrado, post-descarga, `INVOICE_DETAIL`, `DOCUMENT_DETAIL`, confirmacion por correo y confirmacion a canal.

## 26. Actualizacion Slice 9R 2.4N

Se reparo el bloqueo `DOCUMENT_ACTION_BLOCKED` observado al tocar un boton de confirmacion recien generado despues de preparar entrega:

- La confirmacion de entrega ahora usa el contrato `DOCUMENT_DELIVERY_CONFIRM`.
- El token de confirmacion generado por preparacion incluye `source_capability=DOCUMENT_DELIVERY`, `screen_id=DOCUMENT_DELIVERY_CONFIRM`, `requested_channel`, `draft_id`, referencia proveedor/local suficiente, `display_id`, `return_to`, `created_at` y `expires_at`.
- `DELIVERY_PREPARE_*` no marca como usado el token de confirmacion. El consumo queda en `DELIVERY_CONFIRM_PROVIDER_EMAIL` o `DELIVERY_CONFIRM_TELEGRAM_CHANNEL`.
- El guard de confirmacion valida token vigente, accion esperada, canal coherente, factura `SANDBOX_TIMBRADO`, XML/PDF descargados y referencia proveedor/local suficiente.
- Confirmar desde post-descarga, factura detalle o documento detalle es valido porque el origen viaja en `return_to`; `screen_id` permanece en `DOCUMENT_DELIVERY_CONFIRM`.
- `Enviar por correo` prepara copy de correo y confirma con `requested_channel=PROVIDER_EMAIL`.
- `Enviar a canal` prepara copy de canal y confirma con `requested_channel=TELEGRAM_DOCUMENT_CHANNEL`.
- La preparacion no renderiza `No se pudo enviar`, `Motivo: READY`, `TOKEN_VALID`, `GUARD_OK` ni `PENDING`.
- Las ramas de error y recuperacion documental renderizan saltos reales, no `\n` literal.
- La navegacion estable (`Documentos`, `Facturas`, `Menu principal`, `Volver a documento`, `Volver a Documentos`, `Ver estado documental`) no debe nacer vencida.
- Cobranza funcional, pagos, cancelacion, complemento de pago y sincronizacion de pago con PAC/proveedor no fueron modificados.

Watcher/classifier actualizado:

- `DELIVERY_CHANNEL_MISMATCH` se limita a `DOCUMENT_DELIVERY_CONFIRM`, `DELIVERY_PREPARE_PROVIDER_EMAIL` y `DELIVERY_PREPARE_TELEGRAM_CHANNEL`.
- No aplica en `DOCUMENT_DOWNLOAD_RESULT`, `DOCUMENT_DETAIL` ni `INVOICE_DETAIL` cuando muestran correctamente ambos botones de envio.
- `DELIVERY_PREPARE_SHOWS_RESULT_ERROR` cubre preparaciones con copy de resultado fallido o motivos tecnicos.
- `DELIVERY_CONFIRM_TOKEN_INVALID_AFTER_PREPARE` detecta un confirm token fresco que cae en bloqueo sin estar usado ni expirado.

Validacion offline agregada:

```text
node scripts/test-telegram-delivery-confirm-token-validity-and-error-render.js
node scripts/test-telegram-ui-session-watch.js
```

Veredicto documental post-fix: requiere repetir QA runtime documental corta enfocada en post-descarga, confirmacion por correo, confirmacion a canal y recuperacion de error sin `\n` literal. No se ejecuto watcher interactivo en este slice correctivo.

## 27. Actualizacion Slice 9R 2.4O

Se corrigio el bug `BUG-FREE-TEXT-HIJACKED-BY-DOCUMENT_CONTEXT`:

- Un `MESSAGE` de texto libre ya no puede ser tratado como recuperacion de boton vencido.
- La recuperacion de callback/token vencido se ejecuta solo para `CALLBACK_QUERY`.
- Estados de navegacion documental, facturas, cobranza, borradores, menu principal y recuperacion contextual no capturan texto libre.
- Estados text-input-awaiting si pueden capturar texto cuando esperan una respuesta textual real: edicion de borrador, busqueda/edicion de cliente, aclaracion de lineas, decisiones del wizard o tax mode.
- El caso observado `Privada Bilbao, revise camaras Hikvision por 800 + IVA` debe iniciar wizard/borrador y no debe mostrar `El boton de Documentos...` ni `Pantalla anterior: Documentos`.
- Los comandos contextuales conservan precedencia sobre texto libre: `ver N`, `detalle N`, `resumen N`, `timbrar N`, `descargar N`, `enviar N`, `correo N`, `canal N`, `pagar N`; `pagarN` entra como alias de la confirmacion local existente.
- Cobranza funcional no fue modificada; no se agregaron mutaciones de pago, PAC, XML/PDF reales, envios reales ni cancelacion.

Watcher/classifier actualizado:

- `FREE_TEXT_HIJACKED_BY_CALLBACK_RECOVERY` detecta cuando un `MESSAGE` libre cae en una accion de recuperacion de callback.
- `BUTTON_RECOVERY_COPY_ON_MESSAGE` detecta copy de boton vencido renderizado para un `MESSAGE`.
- Ambos detectores ignoran `CALLBACK_QUERY` invalidos reales, que siguen usando recuperacion segura.

Validacion offline agregada:

```text
node scripts/test-telegram-free-text-precedence-and-callback-recovery-boundary.js
node scripts/test-telegram-ui-session-watch.js
```

Veredicto documental post-fix: requiere repetir QA runtime corta con texto libre desde Documentos, texto libre desde Facturas, callback viejo real y flujo documental de confirmacion. No se ejecuto watcher interactivo en este slice correctivo.

## 28. Actualizacion Slice 9R 2.4P

Se estabilizo la navegacion del contenedor `/documentos`:

- Los botones normales de Documentos usan callbacks estables `cfdi_doc:*`.
- `Ver N`, filtros y paginacion no usan `action_tokens` ni callbacks `cfdi:<token>`.
- Los tokens se conservan solo para acciones sensibles: `DOWNLOAD_SANDBOX_ARTIFACTS`, `DELIVERY_CONFIRM_PROVIDER_EMAIL`, `DELIVERY_CONFIRM_TELEGRAM_CHANNEL` y pagos confirmables.
- `cfdi_doc:view:N` abre `DOCUMENT_DETAIL` usando el `list_context` vigente.
- `cfdi_doc:filter:*` abre una lista nueva y guarda un nuevo `list_context`.
- `cfdi_doc:page:N` pagina sin pasar por el resolver de tokens.
- `DOCUMENT_DETAIL` usa callbacks estables para `Ver estado documental`, `Volver a Documentos`, preparar descarga y preparar envio; las confirmaciones finales siguen tokenizadas.
- `/documentos` debe ser operable sin `CALLBACK_TOKEN_INVALID` ni `CALLBACK_TOKEN_CONTEXT_RECOVERED` para botones recien emitidos.
- Cobranza queda fuera de alcance funcional; no se agregaron mutaciones de pago, PAC, XML/PDF reales, envios reales ni cancelacion.

Watcher/classifier actualizado:

- `DOC_NAV_CALLBACK_INVALID` detecta navegacion documental que cae en recuperacion de token.
- `DOCUMENT_NAV_USES_EPHEMERAL_TOKEN` detecta botones normales de navegacion documental con `cfdi:<token>`.
- El detector no aplica a tokens sensibles de confirmacion expirados/usados.

Validacion offline agregada:

```text
node scripts/test-telegram-stable-document-navigation-callbacks.js
```

Veredicto documental post-fix: requiere repetir QA runtime de Documentos sin tocar flujos nuevos, cubriendo `/documentos`, filtros, paginacion, `Ver N` y callback viejo real. No se ejecuto watcher interactivo en este slice correctivo.

## 29. Actualizacion Slice 9R 2.4Q

Se convirtio `Estado documental` en una pantalla accionable del documento actual:

- `Ver estado documental` desde `DOCUMENT_DETAIL` ya no regresa a `DOCUMENTS_RECENT_LIST` ni dispara `DOCUMENT_LIST_ITEM_CHANGED`.
- La nueva superficie `DOCUMENT_STATUS_DETAIL` conserva el `draft_id` actual en contexto y respuesta, con `source_capability=DOCUMENT_STATUS`.
- `INVOICE_DETAIL` tambien resuelve el estado del mismo documento/factura, sin usar estado global de Documentos.
- `DOWNLOAD_READY` muestra descarga con confirmacion y ultimo resultado sandbox; no muestra envio.
- `DOWNLOADED` con envio pendiente muestra correo/canal y actualizar estado; no descarga duplicada.
- `SENT/PROTECTED` muestra estado sin reenvio duplicado.
- `DOWNLOAD_ERROR` muestra error humano seguro y reintento de descarga via confirmacion; no ejecuta descarga directa.
- `SANDBOX_ERROR` muestra que no hay documento fiscal valido, y no expone descarga, envio, cancelacion, eliminacion, cobranza ni ledger.
- `TELEGRAM_EDIT_MESSAGE_TEXT_FAILED` se clasifica como warning recuperado cuando hubo fallback visible correcto; sin fallback util sigue siendo fallo.
- Cobranza funcional queda fuera de alcance.

Watcher/classifier actualizado:

- `DOCUMENT_STATUS_RETURNS_TO_LIST` detecta estado documental que vuelve a listas.
- `DOCUMENT_STATUS_LOST_CURRENT_ITEM` detecta perdida/cambio del documento actual.
- `DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS` valida acciones por estado.
- `TELEGRAM_EDIT_MESSAGE_TEXT_FAILED_RECOVERED` documenta edit fallido con fallback visible correcto.

Validacion offline agregada:

```text
node scripts/test-telegram-document-status-action-surface.js
```

Veredicto documental post-fix: requiere repetir QA runtime de Documentos enfocada en `Ver estado documental`. No se ejecuto watcher interactivo en este slice correctivo.

## 23. Actualizacion Slice 9R 2.4K

Se corrigio el caso watcher `DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON` observado en execution 3498:

- Cuando el resultado final de `sandbox.draft.stamp` queda `SANDBOX_TIMBRADO + DOWNLOAD_READY`, el resumen post-stamp muestra `Descargar XML/PDF sandbox`.
- El primer CTA no descarga directo. Usa token `DOWNLOAD_SANDBOX_ARTIFACTS` con contexto `POST_STAMP_DOWNLOAD_READY` y abre `DOCUMENT_DOWNLOAD_CONFIRM`.
- La confirmacion secundaria mantiene los guards documentales existentes antes de ejecutar `sandbox.draft.download-artifacts`.
- `SANDBOX_ERROR` mantiene bloqueo de acciones documentales.
- `DOWNLOADED` no muestra descarga primaria duplicada.
- `DOWNLOAD_ERROR` muestra motivo humano seguro y ruta a Documentos/Admin QA sin payloads, rutas ni UUID completo.
- El clasificador watcher sigue marcando BREAK si `DOWNLOAD_READY` no tiene accion/token/texto de descarga, pero no lo exige para `SANDBOX_ERROR` ni `DOWNLOADED`.

Validacion offline agregada:

```text
node scripts/test-telegram-post-stamp-success-download-cta.js
```

Veredicto documental post-fix: requiere nueva QA runtime observacional corta. No se ejecuto watcher en este slice correctivo.

## 25. Actualizacion correctiva - Token recovery documental estable

Se corrigio el caso observado en watcher donde una pantalla `DOCUMENTS_RECENT_LIST` seguida por un callback tokenizado viejo terminaba como `CALLBACK_TOKEN_CONTEXT_RECOVERED` y el watcher lo marcaba como `DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON`.

Decision tecnica:

- `cfdi_doc:*` es navegacion estable y se resuelve antes de `cfdi:<token>`.
- `cfdi:<token>` queda para acciones sensibles o confirmables.
- Si un token documental viejo esta usado/vencido pero trae contexto suficiente (`draft_id`, `provider_invoice_link_id`, `source_module=DOCUMENTS`), la recuperacion reconstruye `DOCUMENT_DETAIL` actual con botones frescos.
- Esa recuperacion no ejecuta accion sensible y queda marcada con `action_executed=false`.
- El watcher no audita pantallas no accionables de recuperacion como si fueran detalle documental; si el detalle real no muestra descarga/envio esperado, sigue rompiendo.

Cobranza revisada durante este correctivo:

- `pagar N` / `pagarN` abren confirmacion `MARK_PAYMENT_PAID`.
- `Confirmar pagada` persiste estado local y conserva `provider_update=false` / `pac_update=false`.
- La identidad visible de Cobranza usa folio/identidad proveedor cuando existe.
- El enlace PAC/proveedor es de identidad y auditoria; no implica sincronizar pago con PAC, SAT o Factura.com.

Validacion offline principal:

```text
node scripts/test-telegram-stable-document-navigation-callbacks.js
node scripts/test-telegram-ui-session-watch.js
node scripts/test-telegram-collection-payment-local-state-and-provider-boundary.js
node scripts/test-telegram-callback-lifecycle-delivery-response.js
```

Veredicto: requiere repetir QA runtime corta sin watcher interactivo continuo: `/documentos`, `Ver N`, callback viejo real si existe, `/cobranza`, `pagar N`, confirmacion y vista de pagadas.

## 24. Actualizacion Slice 9R 2.4L

Se corrigio el caso watcher `DOWNLOADED_MISSING_DELIVERY_BUTTON` observado despues de una descarga exitosa:

- `DOCUMENT_DOWNLOAD_RESULT` con `SANDBOX_TIMBRADO + DOWNLOADED + xml=true + pdf=true` ahora muestra `Enviar por correo`, `Enviar a canal`, `Ver estado documental`, `Documentos` y `Menu principal`.
- Esos botones no envian directo. Crean tokens de preparacion `DELIVERY_PREPARE_PROVIDER_EMAIL` y `DELIVERY_PREPARE_TELEGRAM_CHANNEL`; el envio real sigue reservado para `DELIVERY_CONFIRM_PROVIDER_EMAIL` y `DELIVERY_CONFIRM_TELEGRAM_CHANNEL` despues de confirmacion.
- `DOCUMENT_DETAIL` conserva la superficie contextual: descarga cuando esta listo, envio cuando XML/PDF estan descargados, y solo estado si ya fue enviado/protegido.
- `DOCUMENTS_RECENT_LIST` puede seguir simple con `Ver N`; el detalle es la superficie de accion.
- El watcher ya no exige boton de envio en listas, recuperaciones, menu principal, Cobranza ni pantallas de ayuda.

Observacion read-only de Cobranza:

- `COLLECTION-PAYMENT-CONFIRMATION-001`: se observo `PAYMENT_ACTION_CONFIRMATION_REQUIRED` y boton `Confirmar pagada:MARK_PAYMENT_PAID`, pero esa QA runtime no observo ejecucion posterior de `MARK_PAYMENT_PAID`.
- No hay evidencia en esa observacion de que el pago local haya cambiado a pagado.
- No hay evidencia de actualizacion PAC/proveedor ni complemento de pago.
- Decision: marcar pagada debe seguir siendo estado local de cobranza salvo integracion futura explicita.
- Siguiente slice propuesto: `Fase 9R Slice 2.4M - Collection Payment Confirmation Persistence + Provider Payment Boundary`.

Veredicto documental post-fix: requiere nueva QA runtime documental corta. No se ejecuto watcher en este slice correctivo.

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
