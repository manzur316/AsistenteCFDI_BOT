# Telegram Screen Navigation Matrix

Fase 3 - Navigation Surface Drift Audit.

Alcance: auditoria estatica de UX/runtime para Private SatBot. No se ejecuto n8n, Telegram real, watcher, smokes live ni promocion runtime.

Fuentes revisadas:

- `docs/PRIVATE_SATBOT_UX_MASTER_PLAN_V0.1.md`
- `docs/PRIVATE_SATBOT_TELEGRAM_UX_CONTRACT_V0.1.md`
- `docs/PRIVATE_SATBOT_RUNTIME_SYNC_RUNBOOK.md`
- `TELEGRAM_UX_MENU_ACTION_AUDIT_REPORT.md`
- `workflow/cfdi_telegram_local_ingest.n8n.json`
- `scripts/qa/telegram-ui-session-watch.js`
- `scripts/test-telegram-ui-state-buttons.js`
- `scripts/test-telegram-ui-button-state-audit.js`
- `scripts/test-telegram-list-navigation-context.js`
- `scripts/test-telegram-ui-session-watch.js`

Convenciones:

- `CONFIRMED`: confirmado por lectura de codigo/tests.
- `HANDLER_NOT_CONFIRMED`: se espera por contrato, pero no se confirmo handler completo.
- `UNKNOWN`: no se pudo confirmar por lectura estatica.
- `cfdi:<token>`: action token persistido en `cfdi_action_tokens`.
- `cfdi_nav:*` / `cfdi_sbx:*`: callback estatico de navegacion o sandbox.

## 1. Resumen ejecutivo

El bot ya tiene una base fuerte para Draft List Navigation en `pendientes` y `aprobadas`: `DRAFTS_PENDING` y `DRAFTS_APPROVED` usan `list_context`, TTL de 15 minutos, page size 5, limite 50, indices globales y comandos por indice para `ver`, `detalle`, `resumen`, `aprobar` y `timbrar`. Tambien hay guards contra contaminacion de `CLIENT_LIST_SELECTION` en comandos de drafts.

El mayor riesgo pendiente de Navigation Surface Drift ya no esta en drafts, sino en clientes/cobranza y en retornos implicitos. `CLIENTS_MENU`, `PRODUCT_CLIENTS`, `COMMAND_CLIENTES`, `CLIENT_SEARCH_OPTIONS` y `CLIENT_DETAIL` comparten la superficie visual "Clientes", pero mezclan menu general, lista seleccionable, busqueda por texto, numero suelto y acciones de detalle sin un `list_context` comun de clientes.

Cobranza mantiene el riesgo mas alto: `CLIENT_INVOICE_LEDGER` puede mostrar acciones de pago sobre la primera factura activa encontrada en una lista general. Esa superficie puede parecer un resumen o ledger general, pero contiene acciones que mutan estado de una factura concreta sin que el usuario haya seleccionado explicitamente esa factura en la pantalla.

La navegacion de delivery/sandbox esta mas controlada por tokens y confirmaciones. Aun asi, los botones `Ver factura`, `Cancelar`, `Menu principal`, `Ver ultimo resultado sandbox` y `Volver PAC Sandbox` no declaran un `return_to` formal; dependen de destino implicito por accion.

Veredicto de auditoria: `PARTIAL_MATCH`. Fase 2 corrigio el drift principal de listas de drafts, pero Fase 4 debe normalizar `screen_id`, `screen_kind`, `return_to` y contexto para clientes, cobranza, recovery y pantallas tecnicas.

## 2. Screens detectadas

| screen_id sugerido | screen_kind | Funcion/codigo | Texto principal | Botones visibles | Callback/action | Comandos | Contexto requerido | list_context | selected_entity | return_to actual | Debe conservar | Debe limpiar | Permitidas | Prohibidas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PRODUCT_MAIN_MENU` | `MENU` | `productMainMenuResult()`, `buildProductMainMenuKeyboard()` | `Menu CFDI` | Nueva factura, Clientes, Pendientes, Reporte mensual, Paquete contador, Estado, Ayuda, Admin/Sandbox | `cfdi_nav:new`, `cfdi_nav:clients`, `cfdi_nav:drafts`, `cfdi_nav:report`, `cfdi_nav:acctpkg`, `cfdi_nav:status`, `cfdi_nav:help`, `cfdi_nav:admin` | `/start`, `/help`, `/ayuda` parcial | usuario autorizado/rol | no | no | N/A | rol, workflowVersion | seleccion temporal vencida si se entra como reset | navegar, crear draft, ver estado/ayuda | acciones sensibles directas |
| `PRODUCT_CLIENTS` | `MENU` | `handleProductMenuCallback('cfdi_nav:clients')`, `buildProductClientsKeyboard()` | `Clientes` heredado de `clientsListResult()` pero con keyboard de menu | Facturas del cliente, Resumen cobranza, Resumen vencidos, Pendientes pago, Pagadas, Canceladas, Buscar cliente, Nuevo cliente, Menu principal | `cfdi_nav:client_ledger`, `cfdi_nav:billing`, `cfdi_nav:aging`, `cfdi_nav:pay_pending`, `cfdi_nav:pay_paid`, `cfdi_nav:pay_cancel`, `cfdi_nav:client_find`, `cfdi_nav:client_new`, `cfdi_nav:menu` | `/clientes` produce `COMMAND_CLIENTES`; `cliente N` no confirmado | clientes cargados | no | no | Menu principal | rol, cliente search state si se inicia | `CLIENT_LIST_SELECTION` si se decide entrar como menu puro | navegar a clientes/cobranza | interpretar numero suelto |
| `CLIENT_LIST_SELECTION` | `LIST` | `clientsListResult()`, `buildClientListKeyboard()` | `Clientes:` con hasta 10 clientes | Ver 1..10, mas menu completo de clientes | `VIEW_CLIENT` tokens y `cfdi_nav:*` | numero suelto en estado `CLIENT_LIST_SELECTION`; `/cliente TEXTO` busca | `chat_state.state=CLIENT_LIST_SELECTION` | no, usa `client_selection` legacy | `client_id` al seleccionar | `LIST_CLIENTS` vuelve a lista/menu clientes | `client_selection` | drafts list_context no debe ser consumido | Ver cliente | `facturas N`, `cliente N`, paginacion |
| `CLIENT_SEARCH_OPTIONS` | `LIST` | rama `/cliente ARG` con candidatos | `Coincidencias de cliente:` | Ver 1..N, menu clientes | `VIEW_CLIENT` tokens | numero suelto en `CLIENT_LIST_SELECTION` | `chat_state.state=CLIENT_LIST_SELECTION` | no | candidatos de cliente | menu clientes | candidatos | contexto previo de draft no debe contaminar | Ver cliente | pago, factura, draft action |
| `CLIENT_DETAIL` | `DETAIL` | `clientDetailResult()`, `buildClientDetailKeyboard()` | detalle fiscal de cliente | Editar RFC/regimen/CP/razon/uso/tipo, Marcar validado, Facturas del cliente, Resumen cobranza, Volver, Menu principal; opcional Volver al borrador/Reintentar timbrado sandbox | `EDIT_CLIENT_*`, `VALIDATE_CLIENT`, `CLIENT_LEDGER`, `CLIENT_BILLING`, `LIST_CLIENTS`, `MENU`, opcional `VIEW_DRAFT`, `STAMP_DRAFT_SANDBOX` | `/cliente TEXTO` puede abrir detalle por alias; `/validarcliente` usa referencia | `client_id`; rol owner para validar | no | `client_id`; opcional `draft_id` | `LIST_CLIENTS` siempre; `VIEW_DRAFT` solo si viene de draft | `client_id`; opcional draft origin | seleccion numerica al salir | editar/validar/ver ledger | acciones de pago sin factura concreta |
| `DRAFTS_PENDING_LIST` | `LIST` | `pendingDraftsResult()`, `buildPendingDraftsKeyboard()` | `Pendientes (X-Y de N)` | Ver N, Aprobar N, Descartar N, Mas antiguos, Mas recientes, Aprobadas, Menu | `VIEW_DRAFT`, `APPROVE_DRAFT`, `DISCARD_DRAFT`, `LIST_PENDING`, `LIST_APPROVED`, `MENU` tokens | `ver N`, `detalle N`, `resumen N`, `aprobar N`; `descartar N` diferido | `recent_drafts`; chat/user | `DRAFTS_PENDING` | `draft_id` por item | Menu o Aprobadas; detalle vuelve a pendientes | list_context de drafts | contexto de clientes no debe decidir drafts | detalle, resumen, aprobar | timbrar, descargar, enviar |
| `DRAFTS_APPROVED_LIST` | `LIST` | `approvedDraftsResult()`, `buildApprovedDraftsKeyboard()` | `Aprobadas (X-Y de N)` | Ver N, Timbrar sandbox N, Mas antiguos, Mas recientes, Pendientes, Menu | `VIEW_DRAFT`, `STAMP_DRAFT_SANDBOX`, `LIST_APPROVED`, `LIST_PENDING`, `MENU` tokens | `ver N`, `detalle N`, `resumen N`, `timbrar N` | `recent_drafts`; chat/user | `DRAFTS_APPROVED` | `draft_id` por item | Menu o Pendientes; detalle vuelve a pendientes por ahora | list_context de drafts | contexto de clientes | detalle, resumen, preparar timbrado | aprobar, descartar, cancelar sandbox |
| `DRAFT_DETAIL` | `DETAIL` | `buildDraftDetailKeyboard()`, `handleActionCallback(VIEW_DRAFT)`, `attachUiForResponse(COMMAND_DETALLE)` | `draftDetail()` | Por estado: Aprobar/Descartar, Timbrar sandbox, Regresar a borrador, Descargar XML/PDF, Estado documental, Enviar, Cancelar CFDI sandbox, Marcar pago, Volver a pendientes, Ver resumen | tokens `APPROVE_DRAFT`, `DISCARD_DRAFT`, `STAMP_DRAFT_SANDBOX`, `RESTORE_DRAFT`, `DOWNLOAD_SANDBOX_ARTIFACTS`, `DELIVERY_*`, `REQUEST_CANCEL_SANDBOX`, `MARK_PAYMENT_*`, `BACK_PENDING`, `VIEW_SUMMARY` | `/detalle DRAFT_ID`; `detalle N`; `ver N` | `draft_id` en token o list_context | opcional para comandos N | `draft_id` | `BACK_PENDING` fijo aunque origen sea aprobadas | draft_id, current state | list_context solo si no obstruye | acciones validas por estado | acciones de otro estado |
| `DRAFT_SUMMARY` | `DETAIL` | `handleDraftListTextCommand(resumen)`, `VIEW_SUMMARY` en detalle | `Resumen de borrador` o resumen mensual legacy segun accion | buildDraftDetailKeyboard o dashboard mensual | `VIEW_SUMMARY` token actualmente deriva a `summaryResultFromStats()` en callbacks | `resumen N`; `VIEW_SUMMARY` boton | para `resumen N`: list_context; para boton: draft token pero handler va a resumen global | `DRAFTS_PENDING/APPROVED` si comando N | `draft_id` para comando N | detalle/lista esperado; actual boton puede ir a resumen mensual | draft_id si es resumen de draft | no aplica | ver resumen | mostrar resumen en descartado |
| `DRAFT_CONFIRMED` | `STATUS` | `confirmDraftFromContext()`, `buildAfterConfirmKeyboard()` | borrador confirmado / BORRADOR | Ver borrador, Pendientes, Nueva factura, Menu principal | `VIEW_DRAFT`, `LIST_PENDING`, `NEW_INVOICE`, `MENU` tokens | confirmar desde preview | `pending_invoice_context` | no | `draft_id` | Menu/Pendientes/Nuevo | draft_id | preview state | ver o listar | timbrar |
| `DISCARDED_SAFE_NAV` | `RECOVERY` | `discardedDraftMessage()`, `buildDraftDetailKeyboard(status=DESCARTADO)` | borrador descartado | Ver pendientes, Crear nuevo borrador, Menu principal, Ayuda | `LIST_PENDING`, `NEW_INVOICE`, `MENU`, `HELP` tokens | `/descartar DRAFT_ID`; boton `DISCARD_DRAFT` | draft_id | no | draft_id | safe nav | nada sensible | botones de draft accionable | navegacion segura | resumen, aprobar, timbrar |
| `DRAFT_RESTORED` | `DETAIL` | `restoreDraftFromButton()` | Estado actual BORRADOR | Aprobar, Descartar, Volver a pendientes, Ver resumen | tokens de draft pendiente | boton `RESTORE_DRAFT` | draft_id | no | draft_id | pendientes | draft_id | estado aprobado anterior | editar/aprobar/descartar | timbrar |
| `DRAFT_SANDBOX_STAMP_READY` | `CONFIRMATION` | `stampDraftFromListCommand()` | `Borrador aprobado listo para timbrado sandbox` | Timbrar sandbox N, Volver a aprobadas, Menu principal | token `STAMP_DRAFT_SANDBOX`, `LIST_APPROVED`, `MENU` | `timbrar N` | `DRAFTS_APPROVED` | `DRAFTS_APPROVED` | draft_id | aprobadas | draft_id/list_context | nada | confirmar timbrado sandbox | auto-ejecutar sin boton |
| `SANDBOX_STAMP_RESULT` | `RESULT` | `buildSandboxDraftStampResultKeyboard()`, `Build PAC Sandbox Action Summary` | resultado de timbrado sandbox | Descargar XML/PDF sandbox, Ver estado documental, Ver borrador, Ver ultimo resultado sandbox, Menu principal | `DOWNLOAD_SANDBOX_ARTIFACTS`, `DELIVERY_STATUS`, `VIEW_DRAFT`, `cfdi_sbx:latest`, `cfdi_nav:menu` | none confirmed | draft_id | no | draft_id | detalle/menu/latest | draft_id | aprobado-list action | descargar/estado | timbrar otra vez |
| `SANDBOX_DOWNLOAD_RESULT` | `RESULT` | `buildSandboxDraftDownloadResultKeyboard()`, `buildDownloadResultReplyMarkup()` | descarga XML/PDF sandbox | Ver borrador/Ver factura, Ver estado documental, Enviar por correo, Enviar a canal documentos, Ver ultimo resultado sandbox, Menu principal | `VIEW_DRAFT`, `DELIVERY_STATUS`, `DELIVERY_PREPARE_PROVIDER_EMAIL`, `DELIVERY_PREPARE_TELEGRAM_CHANNEL`, `cfdi_sbx:latest`, `cfdi_nav:menu` | none confirmed | draft_id | no | draft_id | detalle/menu/latest | draft_id | stamp action | delivery/estado | timbrar, aprobar |
| `DOCUMENT_DELIVERY_STATUS` | `STATUS` | `buildDeliveryStatusKeyboard()` | estado documental | Enviar por correo, Enviar a canal documentos, Ver borrador, Menu principal | `DELIVERY_PREPARE_PROVIDER_EMAIL`, `DELIVERY_PREPARE_TELEGRAM_CHANNEL`, `VIEW_DRAFT`, `MENU` tokens | none confirmed | draft descargado/timbrado | no | draft_id | detalle/menu | draft_id | none | preparar delivery | enviar sin confirmacion |
| `DOCUMENT_DELIVERY_CONFIRMATION` | `CONFIRMATION` | `buildDeliveryPrepareKeyboard()`, `buildDeliveryResultReplyMarkup()` | preparar entrega | Confirmar envio correo/canal, Ver estado documental, Cancelar | `DELIVERY_CONFIRM_*`, `DELIVERY_STATUS`, `VIEW_DRAFT` tokens | none confirmed | draft_id + channel | no | draft_id, channel | `VIEW_DRAFT` como cancelar | confirm token/channel | old confirm token al usar | confirmar/cancelar/status | ejecutar send sin confirmacion |
| `DOCUMENT_DELIVERY_SENT` | `RESULT` | `buildDeliveryPostSendReplyMarkup()` | envio documental | Ver estado documental, Enviar a canal documentos, Enviar por correo, Ver factura, Menu principal; Reenviar si duplicado bloqueado | `DELIVERY_STATUS`, `DELIVERY_PREPARE_*`, `DELIVERY_FORCE_*`, `VIEW_DRAFT`, `MENU` | none confirmed | draft_id + delivery ledger | no | draft_id | status/detail/menu | draft_id | confirm token usado | status, preparar nuevo envio | repetir sensible sin proteccion |
| `SANDBOX_CANCEL_CONFIRMATION` | `CONFIRMATION` | `buildSandboxDraftCancelConfirmationKeyboard()` | cancelar CFDI sandbox | Si, cancelar sandbox; No, volver | `CONFIRM_CANCEL_SANDBOX`, `VIEW_DRAFT` | none confirmed | draft cancelable | no | draft_id | detalle | draft_id | old token al usar | confirmar/cancelar | cancelar sin confirmacion |
| `SANDBOX_CANCEL_RESULT` | `RESULT` | `buildSandboxDraftCancelResultKeyboard()` | resultado cancelacion | Ver detalle, Ver ultimo resultado sandbox, Menu principal | `VIEW_DRAFT`, `cfdi_sbx:latest`, `cfdi_nav:menu` | none confirmed | draft_id | no | draft_id | detalle/menu/latest | draft_id | confirm token | ver resultado | acciones de draft vivo si cancelado |
| `PRODUCT_ADMIN_SANDBOX` | `ADMIN` | `productAdminResult()`, `buildProductAdminKeyboard()` | `Admin/Sandbox` | PAC Sandbox, Full sandbox, Preflight proveedor, Menu principal | `cfdi_nav:pac_sbx`, `cfdi_sbx:full`, `cfdi_sbx:preflight`, `cfdi_nav:menu` | `/sandbox_menu` expected by help, handler not fully confirmed here | owner | no | no | menu | role | user contexts | herramientas tecnicas | operador normal |
| `PRODUCT_PAC_SANDBOX` | `ADMIN` | `pacSandboxConsoleResult()`, `buildPacSandboxKeyboard()` | `PAC Sandbox` | Preflight proveedor, Borradores aprobados para timbrar, smoke fixture/download/cancel, Ultimo resultado tecnico, Audit sandbox, Volver | `cfdi_sbx:*`, `cfdi_nav:sbx_drafts`, `cfdi_nav:admin` | none confirmed | owner | no | no | admin | role | none | sandbox tecnico | produccion real |
| `PAC_SANDBOX_DRAFT_SELECTION` | `ADMIN_LIST` | `sandboxApprovedDraftsForStampResult()`, `buildSandboxDraftStampSelectionKeyboard()` | `Borradores aprobados para timbrado sandbox` | Timbrar sandbox 1..5, Volver PAC Sandbox, Menu principal | `STAMP_DRAFT_SANDBOX` tokens, `cfdi_nav:pac_sbx`, `cfdi_nav:menu` | none confirmed | owner + approved drafts | no, legacy 5 | draft_id | PAC Sandbox | role/draft_id | normal approved list context | timbrar sandbox tecnico | mezclar con aprobadas operativas |
| `MONTHLY_BILLING_DASHBOARD` | `DASHBOARD` | `monthlyBillingDashboardResult()`, `buildMonthlyDashboardKeyboard()` | resumen mensual | Ver clientes con saldo, Ver vencidas, Ver pagadas, Ver canceladas, Paquete contador, Menu principal | `cfdi_nav:billing`, `cfdi_nav:aging`, `cfdi_nav:pay_paid`, `cfdi_nav:pay_cancel`, `cfdi_nav:acctpkg`, `cfdi_nav:menu` | `/hoy`, `/resumen` via summary paths partially | ledger/stats | no | no | menu/client billing | period | none | resumen ligero | pago directo |
| `CLIENT_BILLING_SUMMARY` | `SUMMARY` | `clientBillingSummaryResult()`, `buildBillingSummaryKeyboard()` | resumen cobranza | Ver pendientes, Ver pagadas, Ver vencidas, Ver canceladas, Ver ledger cliente, Volver | `cfdi_nav:pay_pending`, `cfdi_nav:pay_paid`, `cfdi_nav:aging`, `cfdi_nav:pay_cancel`, `cfdi_nav:client_ledger`, `cfdi_nav:clients` | `facturas N` not confirmed | optional client_id | no | optional client_id | clientes | filter/client_id | none | consultar cobranza | pago directo |
| `CLIENT_INVOICE_LEDGER` | `LEDGER` | `clientInvoiceLedgerResult()`, `buildClientInvoiceLedgerKeyboard()` | ledger/facturas por cliente o general | Marcar pendiente/pagada/parcial/vencida si hay fila activa, mas menu clientes | `MARK_PAYMENT_*` tokens, `cfdi_nav:*` | `pagar N` not confirmed | ledger rows; optional client_id | no | active first draft_id, optional client_id | clientes | filter/client_id | none | consultar, cambiar pago si factura concreta | cambiar pago desde ledger general ambiguo |
| `RECOVERY` | `RECOVERY` | `buildRecoveryKeyboard()`, `callbackTokenInvalid()` | recovery por token/contexto invalido | Ver pendientes, Crear nuevo borrador, Menu principal, Ayuda | `LIST_PENDING`, `NEW_INVOICE`, `MENU`, `HELP` tokens | none | token invalido o contexto inseguro | no | optional draft_id if recoverable | safe menu | nothing sensitive | stale token | recuperacion segura | accion sensible |
| `PRODUCT_STATUS` | `STATUS` | `productStatusResult()` | Estado local seguro | menu principal completo | `cfdi_nav:*` | `/estado`, `/debug` | auth/role | no | no | menu | diagnostics sanitized | none | diagnostico local | secretos |
| `PRODUCT_HELP` | `HELP` | `productHelpResult()` | Ayuda CFDI | menu principal completo | `cfdi_nav:*` | `/help`, `/ayuda` | none | no | no | menu | none | none | ayuda | acciones sensibles |
| `PREVIEW_READY` / `NEEDS_CONFIRM_DRAFT` | `DRAFT_PREVIEW` | `buildActionKeyboard()`, `confirmDraftFromContext()` | preview de borrador | confirmar/editar/cancelar/ver, botones de edicion | tokens de preview/edit | confirmar, editar, cancelar, ver | `pending_invoice_context` | no | draft preview | menu/cancel/draft confirmed | invoice context | previous list contexts if confirmed/cancelled | confirmar/editar | timbrar |
| `EDITING_PREVIEW` | `EDIT` | `buildEditingKeyboard()` | edicion de preview | cancelar/volver acciones edit | edit tokens | texto libre, confirmar, ver | preview context | no | draft preview | preview | invoice context | none | editar | timbrar |
| `CLIENT_NOT_FOUND` / `LIST_NAV_*` / `COMMAND_UNKNOWN` | `ERROR` | `clientDetailResult()`, `draftListErrorResult()`, `commandHelp()` | error seguro | recovery/menu/clientes segun caso | tokens o nav | varios | depende | no | depende | recovery/menu/lista | contexto seguro si aplica | accion incompatible | reintentar seguro | ejecutar accion |

## 3. Matriz screen_id -> funcion -> botones -> comandos -> contexto

| screen_id | Funcion principal | Botones/callbacks | Comandos confirmados | Contexto activo |
| --- | --- | --- | --- | --- |
| `PRODUCT_MAIN_MENU` | `productMainMenuResult()` | `cfdi_nav:*` menu principal | `/start`, `/help`, `/ayuda` | rol |
| `PRODUCT_CLIENTS` | `handleProductMenuCallback('cfdi_nav:clients')` | menu clientes sin botones `Ver N` | `/clientes` lleva a lista con UI adjunta | ninguno o clientes cargados |
| `CLIENT_LIST_SELECTION` | `clientsListResult()` | `VIEW_CLIENT` tokens + menu clientes | numero suelto solo con `CLIENT_LIST_SELECTION` | `chat_state.client_selection` |
| `CLIENT_DETAIL` | `clientDetailResult()` | `EDIT_CLIENT_*`, `VALIDATE_CLIENT`, `CLIENT_LEDGER`, `CLIENT_BILLING`, `LIST_CLIENTS`, `MENU` | `/cliente TEXTO`, no `cliente N` confirmado | `client_id` |
| `DRAFTS_PENDING_LIST` | `pendingDraftsResult()` | `VIEW_DRAFT`, `APPROVE_DRAFT`, `DISCARD_DRAFT`, page tokens | `ver/detalle/resumen/aprobar N`; `descartar N` diferido | `list_context.kind=DRAFTS_PENDING` |
| `DRAFTS_APPROVED_LIST` | `approvedDraftsResult()` | `VIEW_DRAFT`, `STAMP_DRAFT_SANDBOX`, page tokens | `ver/detalle/resumen/timbrar N` | `list_context.kind=DRAFTS_APPROVED` |
| `DRAFT_DETAIL` | `buildDraftDetailKeyboard()` | botones por estado de draft | `/detalle DRAFT_ID`, `detalle N`, `ver N` | `draft_id`, opcional list context |
| `DRAFT_SUMMARY` | `handleDraftListTextCommand(resumen)` | detail keyboard | `resumen N` | draft list context |
| `MONTHLY_BILLING_DASHBOARD` | `monthlyBillingDashboardResult()` | billing filters | `COMMAND_RESUMEN` por resumen mensual | stats/ledger |
| `CLIENT_BILLING_SUMMARY` | `clientBillingSummaryResult()` | billing filters y volver clientes | `facturas N` no confirmado | optional client_id |
| `CLIENT_INVOICE_LEDGER` | `clientInvoiceLedgerResult()` | `MARK_PAYMENT_*` y menu clientes | `pagar N` no confirmado | ledger rows, optional client_id |
| `DOCUMENT_DELIVERY_STATUS` | `buildDeliveryStatusKeyboard()` | `DELIVERY_PREPARE_*`, `VIEW_DRAFT`, `MENU` | no textual confirmado | draft_id |
| `DOCUMENT_DELIVERY_CONFIRMATION` | `buildDeliveryPrepareKeyboard()` | `DELIVERY_CONFIRM_*`, `DELIVERY_STATUS`, `VIEW_DRAFT` | no textual confirmado | draft_id + channel |
| `SANDBOX_*` result/confirm | sandbox keyboard builders | sandbox tokens + `cfdi_sbx:*` | no textual confirmado | draft_id / owner |
| `RECOVERY` | `buildRecoveryKeyboard()` | safe nav tokens | no textual confirmado | invalid/expired token |

## 4. Matriz boton de regreso -> origen -> destino actual -> destino esperado

| Boton | Origen | Destino actual | Destino esperado | Contexto correcto | Riesgo |
| --- | --- | --- | --- | --- | --- |
| `Menu principal` / `Menu` | global, detail, recovery, delivery | `PRODUCT_MAIN_MENU` via `MENU` o `cfdi_nav:menu` | `PRODUCT_MAIN_MENU` | limpia o ignora contexto viejo | LOW |
| `Volver` | `CLIENT_DETAIL` | `LIST_CLIENTS` -> `clientsListResult()` | volver a la lista real de clientes o al menu clientes segun origen | no conserva page/lista; no hay `return_to` | MEDIUM |
| `Volver` | `CLIENT_BILLING_SUMMARY` | `cfdi_nav:clients` -> `PRODUCT_CLIENTS` | si venia de cliente detalle, volver a `CLIENT_DETAIL`; si venia de menu, volver a `PRODUCT_CLIENTS` | no conserva `client_id` de origen | MEDIUM |
| `Volver PAC Sandbox` | `PAC_SANDBOX_DRAFT_SELECTION` | `cfdi_nav:pac_sbx` | correcto para consola tecnica | owner/admin | LOW |
| `No, volver` | `SANDBOX_CANCEL_CONFIRMATION` | `VIEW_DRAFT` | `DRAFT_DETAIL` | conserva draft_id por token | LOW |
| `Cancelar` | `DOCUMENT_DELIVERY_CONFIRMATION` | `VIEW_DRAFT` | `DRAFT_DETAIL`, texto deberia comunicar "cancelar envio" | conserva draft_id/channel | LOW |
| `Ver pendientes` | descartado/recovery | `LIST_PENDING` -> `DRAFTS_PENDING_LIST` | correcto | crea draft list context nuevo | LOW |
| `Pendientes` | aprobadas/main/confirmed | `LIST_PENDING` o `cfdi_nav:drafts` | correcto | crea draft list context nuevo | LOW |
| `Aprobadas` | pendientes | `LIST_APPROVED` | correcto | crea approved list context nuevo | LOW |
| `Volver a pendientes` | `DRAFT_DETAIL` de cualquier estado no descartado | `BACK_PENDING` -> `pendingDraftsResult()` | si origen fue aprobadas, expected `return_to=DRAFTS_APPROVED_LIST`; si origen fue pendientes, pending | no conserva origen de lista | HIGH |
| `Volver a aprobadas` | `DRAFT_SANDBOX_STAMP_READY` | `LIST_APPROVED` | correcto | conserva lista aprobadas nueva, no necesariamente page original | LOW |
| `Ver factura` / `Ver borrador` | delivery/download/stamp result | `VIEW_DRAFT` -> `DRAFT_DETAIL` | correcto | conserva draft_id | LOW |
| `Ver estado documental` | detail/download/send | `DELIVERY_STATUS` | correcto si draft tiene documentos/timbrado | conserva draft_id | LOW |
| `Facturas del cliente` | `CLIENT_DETAIL` | `CLIENT_LEDGER` con client_id por token | correcto para detalle cliente | conserva client_id | LOW |
| `Facturas del cliente` | `PRODUCT_CLIENTS` menu | `cfdi_nav:client_ledger` general sin client_id | esperado deberia ser seleccionar cliente o pedir busqueda | no selected_entity | HIGH |
| `Ver ledger cliente` | `DRAFT_DETAIL` payment surface | `cfdi_nav:client_ledger` general | deberia abrir ledger del cliente del draft | no pasa client_id desde product nav | HIGH |
| `Resumen cobranza` | `CLIENT_DETAIL` | `CLIENT_BILLING` con client_id por token | correcto | conserva client_id | LOW |
| `Resumen cobranza` | `PRODUCT_CLIENTS` menu | `cfdi_nav:billing` general | correcto como resumen general, no como cliente concreto | no selected_entity | LOW |
| `Recovery: Ayuda` | recovery/token invalido | `HELP` | correcto | no sensible | LOW |

## 5. Hallazgos de Navigation Surface Drift

| ID | Severidad | Tipo | Evidencia | Impacto | Recomendacion |
| --- | --- | --- | --- | --- | --- |
| NSD-001 | HIGH | `SURFACE_DRIFT` | `PRODUCT_CLIENTS`, `COMMAND_CLIENTES`, `CLIENT_LIST_SELECTION` y `CLIENT_SEARCH_OPTIONS` muestran "Clientes" o coincidencias, pero mezclan menu general, lista seleccionable y numero suelto. | El usuario no sabe si esta en menu, lista o busqueda. | Definir `CLIENTS_MENU`, `CLIENTS_LIST`, `CLIENT_SEARCH_RESULTS` con screen_id visible internamente y return_to. |
| NSD-002 | HIGH | `RETURN_TO_MISMATCH` | `DRAFT_DETAIL` siempre agrega `Volver a pendientes` cuando no esta descartado. | Si el usuario viene de `DRAFTS_APPROVED_LIST`, vuelve a pendientes y pierde contexto semantico. | Guardar `return_to` en token/list_context y renderizar `Volver a aprobadas` cuando aplique. |
| NSD-003 | HIGH | `DANGEROUS_ACTION_SURFACE` | `buildClientInvoiceLedgerKeyboard()` toma `visibleRows.find(...)` y muestra `MARK_PAYMENT_*` en ledger general. | Puede marcar estado de una factura no seleccionada explicitamente. | Retirar acciones de pago del ledger general; exigir `COLLECTION_INVOICES` o detalle factura. |
| NSD-004 | MEDIUM | `DUPLICATE_SCREEN` | `DRAFTS_APPROVED_LIST` y `PAC_SANDBOX_DRAFT_SELECTION` listan aprobados para timbrar, pero una usa paginacion/list_context y otra legacy 5 items tecnico. | Dos superficies similares con semantica distinta. | Mantener `PAC_SANDBOX_DRAFT_SELECTION` como admin-only o migrarla a helper comun con screen_kind `ADMIN_LIST`. |
| NSD-005 | MEDIUM | `SURFACE_DRIFT` | `VIEW_SUMMARY` desde detail llama `summaryResultFromStats()`; `resumen N` si genera resumen de borrador. | Boton "Ver resumen" puede significar resumen mensual/global o resumen del draft segun ruta. | Separar `VIEW_DRAFT_SUMMARY` de `VIEW_MONTHLY_BILLING_DASHBOARD`. |
| NSD-006 | MEDIUM | `RETURN_TO_MISMATCH` | `Ver ledger cliente` desde `DRAFT_DETAIL` usa `cfdi_nav:client_ledger`, que abre ledger general. | El usuario espera ledger del cliente asociado al draft. | Crear token `CLIENT_LEDGER` con `client_id` desde draft o deshabilitar en detalle si no se puede resolver. |
| NSD-007 | MEDIUM | `DUPLICATE_SCREEN` | `PRODUCT_ADMIN_SANDBOX`, `PRODUCT_PAC_SANDBOX`, `PAC_SANDBOX_DRAFT_SELECTION`, `SANDBOX_*_RESULT` comparten textos sandbox pero objetivos distintos. | Riesgo bajo para owner, alto si se mezcla con uso diario. | Mantener owner-only y prefijar screen_kind tecnico. |
| NSD-008 | LOW | `DUPLICATE_SCREEN` | `PRODUCT_HELP`, `COMMAND_UNKNOWN` e `IDLE_HELP` terminan en menu principal. | Aceptable, pero no distingue ayuda de recovery. | Sin fix urgente; watcher puede validar que todos hagan dispatch y menu seguro. |

## 6. Hallazgos de contaminacion de contexto

| ID | Severidad | Tipo | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| CTX-001 | MEDIUM | `CONTEXT_LEAK` | `CLIENT_LIST_SELECTION` sigue existiendo como `chat_state` legacy por 30 minutos. | Draft commands por indice ya validan `list_context`; riesgo restante en numeros sueltos y cliente/cobranza. |
| CTX-002 | LOW | `CONTEXT_LEAK` | Tests de Fase 2 cubren `slash_ver_10_no_cae_en_client_list_selection` y `slash_detalle_10_usa_contexto_draft_aunque_estado_sea_clientes`. | Mitigado para drafts. |
| CTX-003 | HIGH | `AMBIGUOUS_COMMAND` | `/cliente 2` no esta confirmado como indice; la auditoria previa observo que se trata como busqueda textual. | Pendiente para Fase clientes. |
| CTX-004 | HIGH | `AMBIGUOUS_COMMAND` | `facturas N`, `pagar N`, `cobranza N`, `descargar N`, `enviar N` no tienen handlers confirmados por indice. | Pendiente para cobranza/documentos. |
| CTX-005 | MEDIUM | `CONTEXT_LEAK` | `LIST_CLIENTS` desde `CLIENT_DETAIL` no preserva pagina/origen; clientes no tienen list_context comun. | Pendiente. |
| CTX-006 | MEDIUM | `CONTEXT_LEAK` | `VIEW_SUMMARY` token conserva draft_id pero handler actual va a resumen global. | Requiere separacion de acciones. |
| CTX-007 | MEDIUM | `CONTEXT_LEAK` | `CLIENT_LEDGER` token desde cliente conserva client_id, pero `cfdi_nav:client_ledger` global no; ambas pantallas se llaman parecido. | Requiere screen_id/return_to. |

## 7. Comandos ambiguos

| Comando | Estado actual | Riesgo | Recomendacion |
| --- | --- | --- | --- |
| `ver N` | CONFIRMED para drafts con list_context | Bajo | Mantener validacion por kind. |
| `/ver N` | CONFIRMED para drafts con list_context | Bajo | Mantener tests contra `CLIENT_LIST_SELECTION`. |
| `detalle N` / `/detalle N` | CONFIRMED para drafts | Bajo | Agregar watcher de return_to correcto por origen. |
| `resumen N` / `/resumen N` | CONFIRMED para drafts | Medio | Alinear con boton `Ver resumen`. |
| `aprobar N` / `/aprobar N` | CONFIRMED solo pendientes | Medio | Asegurar confirm/dispatch y watcher. |
| `descartar N` / `/descartar N` | CONFIRMED como `DEFERRED_CONFIRM_DISCARD` | Medio | Implementar confirmacion dos pasos en slice posterior. |
| `timbrar N` / `/timbrar N` | CONFIRMED solo aprobadas, prepara boton seguro | Medio | Watcher de doble click y token usado. |
| `cliente N` | HANDLER_NOT_CONFIRMED | Alto | Implementar `CLIENTS` list_context antes de habilitar. |
| numero suelto `N` | CONFIRMED solo en `CLIENT_LIST_SELECTION` | Medio | Agregar mensaje de error cuando no se espera seleccion. |
| `facturas N` | HANDLER_NOT_CONFIRMED | Alto | Requiere `COLLECTION_CLIENTS`. |
| `pagar N` | HANDLER_NOT_CONFIRMED | BLOCKER para cobranza real | Requiere `COLLECTION_INVOICES` y confirmacion. |
| `descargar N` | HANDLER_NOT_CONFIRMED | Medio | Requiere lista de download-ready/downloaded. |
| `enviar N` | HANDLER_NOT_CONFIRMED | Alto | Requiere factura concreta y confirmacion. |
| `cobranza N` | HANDLER_NOT_CONFIRMED | Medio | Requiere contexto de cobranza. |
| aliases `p`, `c`, `co`, `a`, `m` | HANDLER_NOT_CONFIRMED | Bajo | Implementar despues de screen_id basico. |

## 8. Pantallas duplicadas

| Grupo | Pantallas | Tipo | Riesgo | Accion sugerida |
| --- | --- | --- | --- | --- |
| Clientes | `PRODUCT_CLIENTS`, `CLIENT_LIST_SELECTION`, `CLIENT_SEARCH_OPTIONS`, `CLIENT_DETAIL` | `DUPLICATE_SCREEN` | HIGH | Separar menu, lista, busqueda y detalle con `screen_kind` y `return_to`. |
| Drafts aprobados | `DRAFTS_APPROVED_LIST`, `PAC_SANDBOX_DRAFT_SELECTION`, `DRAFT_SANDBOX_STAMP_READY` | `DUPLICATE_SCREEN` | MEDIUM | Marcar admin list como tecnico o unificar helper. |
| Resumen | `DRAFT_SUMMARY`, `MONTHLY_BILLING_DASHBOARD`, `summaryResultFromStats()` | `SURFACE_DRIFT` | MEDIUM | Separar acciones `VIEW_DRAFT_SUMMARY` y `VIEW_MONTHLY_SUMMARY`. |
| Cobranza | `MONTHLY_BILLING_DASHBOARD`, `CLIENT_BILLING_SUMMARY`, `CLIENT_INVOICE_LEDGER` | `SURFACE_DRIFT` | HIGH | Crear `COLLECTION_CLIENTS` y `COLLECTION_INVOICES`. |
| Delivery | `DOCUMENT_DELIVERY_STATUS`, `DOCUMENT_DELIVERY_CONFIRMATION`, `DOCUMENT_DELIVERY_SENT` | `DUPLICATE_SCREEN` controlado | LOW | Mantener, pero declarar `return_to`. |
| Recovery | `RECOVERY`, `PRODUCT_MAIN_MENU`, `PRODUCT_HELP` | `DUPLICATE_SCREEN` seguro | LOW | Mantener recovery como screen separado. |

## 9. Riesgos con latencia/doble click

El watcher ya soporta:

- `LATENCY_OK`
- `LATENCY_WARN`
- `LATENCY_FAIL`
- `DUPLICATE_INTERACTION_WARN`
- `OUT_OF_ORDER_RESPONSE_WARN`
- `SENSITIVE_ACTION_DUPLICATE_FAIL`

Pantallas que deben entrar a validacion de latencia/doble click en Fase 4:

| Flujo | Riesgo | Resultado esperado |
| --- | --- | --- |
| `DRAFTS_APPROVED_LIST` -> `timbrar N` -> confirm token | doble click de accion sensible | segundo click debe ser token usado/context recovered, no segundo efecto |
| `DRAFT_DETAIL` -> `Descartar` | destructiva | requiere confirmacion o bloqueo idempotente |
| `CLIENT_INVOICE_LEDGER` -> `MARK_PAYMENT_*` | pago ambiguo/sensible | no debe existir en ledger general; si existe, watcher debe marcar superficie peligrosa |
| `DOCUMENT_DELIVERY_CONFIRMATION` -> `Confirmar envio` | envio duplicado | duplicate protection o force path explicito |
| `SANDBOX_CANCEL_CONFIRMATION` -> `Si, cancelar sandbox` | cancelacion duplicada | token one-time y recovery correcto |
| `CLIENT_LIST_SELECTION` -> doble `Ver N` | navegacion duplicada | solo warn, sin efecto sensible |
| `Mas antiguos/Mas recientes` en drafts | respuestas fuera de orden | la pantalla mas nueva no debe ser sobrescrita por menu atrasado incompatible |
| `Recovery` despues de token usado/expirado | menu tardio | debe refrescar contexto seguro, no ejecutar accion |

## 10. Casos watcher faltantes

| Caso | Severidad | Tipo |
| --- | --- | --- |
| Abrir `CLIENTS_MENU`, luego `CLIENT_LIST_SELECTION`, validar que botones y screen_id no se mezclen | HIGH | `WATCHER_COVERAGE_GAP` |
| En `CLIENT_LIST_SELECTION`, enviar `/detalle 10` y verificar que no use cliente context | MEDIUM | `CONTEXT_LEAK` |
| En `DRAFTS_APPROVED_LIST` abrir detalle desde pagina 2 y presionar volver; debe volver a aprobadas pagina/semantica correcta | HIGH | `RETURN_TO_MISMATCH` |
| En `CLIENT_DETAIL`, `Volver` debe regresar a lista o menu correcto segun origen | MEDIUM | `RETURN_TO_MISMATCH` |
| En `DRAFT_DETAIL`, `Ver ledger cliente` no debe abrir ledger general si hay cliente del draft | HIGH | `SURFACE_DRIFT` |
| Ledger general no debe mostrar `Marcar pagada/parcial/vencida` | BLOCKER | `DANGEROUS_ACTION_SURFACE` |
| `pagar N` sin `COLLECTION_INVOICES` debe fallar seguro | BLOCKER | `AMBIGUOUS_COMMAND` |
| Boton `Ver resumen` desde draft debe mostrar resumen del draft o renombrarse si es resumen mensual | MEDIUM | `SURFACE_DRIFT` |
| Doble click en `Ver N` debe producir duplicate warn seguro | LOW | `WATCHER_COVERAGE_GAP` |
| Doble click en `timbrar/cancelar/enviar/pago` debe producir token usado/proteccion o fail | HIGH | `DANGEROUS_ACTION_SURFACE` |
| `PAC_SANDBOX_DRAFT_SELECTION` debe quedar owner-only y no confundirse con aprobadas operativas | MEDIUM | `DUPLICATE_SCREEN` |

## 11. Slices de correccion propuestos

### Slice A: normalizar screen_id / return_to

Objetivo: agregar metadatos internos consistentes sin cambiar copy visible salvo donde sea necesario.

- Definir `screen_id`, `screen_kind`, `return_to`, `selected_entity`, `list_context` en respuestas principales.
- Incluir `return_to` en payload de tokens de `VIEW_DRAFT`, `LIST_CLIENTS`, `CLIENT_LEDGER`, `CLIENT_BILLING`.
- Ajustar `DRAFT_DETAIL` para que `Volver` dependa de origen: pendientes, aprobadas, delivery, recovery.
- Tests: matrix offline + watcher no real.

### Slice B: clientes menu vs lista clientes

Objetivo: separar `CLIENTS_MENU` de `CLIENTS_LIST_SELECTION`.

- `cfdi_nav:clients` debe escoger explicitamente menu o lista, no una mezcla.
- Crear `CLIENTS_LIST` con list context comun (`kind=CLIENTS`, page, visibleIndex, client_id, TTL).
- Implementar `cliente N` solo contra `CLIENTS`.
- Numero suelto solo cuando la pantalla esta esperando seleccion.

### Slice C: detalle cliente -> volver correcto

Objetivo: que `Volver` respete origen.

- Desde lista clientes: vuelve a `CLIENTS_LIST` misma pagina si se puede.
- Desde draft: `Volver al borrador`.
- Desde cobranza: vuelve a `COLLECTION_CLIENTS` o `COLLECTION_INVOICES`.
- Desde menu: vuelve a `CLIENTS_MENU`.

### Slice D: comandos ambiguos

Objetivo: bloquear o implementar comandos cortos segun contexto.

- Implementar/fallar seguro: `facturas N`, `pagar N`, `descargar N`, `enviar N`.
- Mantener `descartar N` como diferido hasta confirmacion de dos pasos.
- Agregar errores claros de contexto incompatible y lista expirada.

### Slice E: watcher coverage para navegacion/volver

Objetivo: watcher debe detectar drift, no solo botones zombies.

- Validar `screen_id`, `screen_kind`, `return_to`, `list_context.kind`.
- Marcar `RETURN_TO_MISMATCH` cuando `Volver` cae en seccion incorrecta.
- Marcar `CONTEXT_LEAK` si un comando de draft usa `CLIENT_LIST_SELECTION` o viceversa.
- Marcar `DANGEROUS_ACTION_SURFACE` si pago aparece sin factura concreta.

### Slice F: limpieza de superficies peligrosas

Objetivo: eliminar acciones contables o fiscales ambiguas.

- Quitar `MARK_PAYMENT_*` de ledger general.
- Mover pago a factura concreta con confirmacion.
- Mantener `Marcar vencida` como derivado o owner-only con confirmacion.
- Mantener sandbox tecnico owner-only y separado del flujo operativo.

## 12. Excepcion aceptada de watcher

### WATCHER-DISPATCH-RECOVERY-001

Regla operacional para validaciones runtime:

- `editMessageText` fallido con fallback `sendMessage` exitoso debe tratarse como `WARN` recuperado, no como `FAIL` funcional del producto.
- Doble click humano en navegacion debe tratarse como `WARN`.
- Doble click en accion sensible debe ser `FAIL` solo si hay evidencia de efecto real duplicado sin proteccion.
- Si la validacion humana presiona manualmente enviar canal, enviar correo o descargar documentos, esos efectos deben reportarse como actividad observada, no como bug automatico, salvo que excedan allowlist o se dupliquen sin proteccion.

## 13. Veredicto final

Fase 3 queda documentada como auditoria estatica. No hay evidencia de drift critico en las listas de drafts posteriores a Fase 2; esa superficie esta mucho mejor que en el contrato inicial. Los riesgos importantes se concentran en clientes, cobranza, `return_to` implicito y duplicacion de pantallas sandbox/admin.

Bloqueantes para go-live real privado:

- `CLIENT_INVOICE_LEDGER` no debe exponer acciones de pago ambiguas.
- `CLIENTS_MENU` y `CLIENT_LIST_SELECTION` deben separarse formalmente.
- `DRAFT_DETAIL` debe volver a la superficie correcta segun origen.
- Comandos de cobranza por indice deben fallar seguro o implementarse con contexto.

## 14. Criterios para cerrar Fase 3

Fase 3 se considera cerrada cuando:

- Este documento existe en `docs/TELEGRAM_SCREEN_NAVIGATION_MATRIX.md`.
- La matriz cubre menus, listas, detalles, recovery, admin/sandbox, cobranza y delivery.
- Los hallazgos usan severidad y tipo.
- Los slices de Fase 4 estan propuestos sin implementar.
- `git diff --check` pasa.
- `node scripts/test-repo-safety.js` pasa.
- Solo se modifica este documento.
- El commit queda pusheado a `main`.
