# TELEGRAM UX MENU ACTION AUDIT REPORT

Auditoria estatica contra `docs/PRIVATE_SATBOT_TELEGRAM_UX_CONTRACT_V0.1.md`.

Alcance revisado:

- `docs/PRIVATE_SATBOT_TELEGRAM_UX_CONTRACT_V0.1.md`
- `workflow/cfdi_telegram_local_ingest.n8n.json`
- `scripts/test-telegram-ui-state-buttons.js`
- `scripts/qa/telegram-ui-button-state-audit.js`
- `scripts/qa/telegram-ui-session-watch.js`
- scripts/lib relacionados con menus, callbacks, tokens, cobranza y payment status

No se ejecutaron n8n, Telegram real, watchers, smokes ni tests. Esta auditoria solo usa lectura estatica del repositorio.

Notas de clasificacion:

- `CONFIRMED`: existe evidencia directa en workflow/scripts.
- `HANDLER_NOT_CONFIRMED`: se ve boton/comando/accion esperada, pero no se confirmo handler completo para el contrato UX.
- `UNKNOWN`: no se pudo confirmar por nombre/imports/codigo estatico.

## 1. Resumen ejecutivo

El workflow actual ya tiene una base solida para botones tokenizados, `callback_data` corto y controles de estado en el ciclo draft -> aprobado -> timbrado sandbox -> descargado -> entrega documental. La matriz actual cubre bien varios bugs tipo "zombie" de draft descartado, restaurado, timbrado y delivery, y el watcher contiene reglas para dispatch faltante, tokens invalidos, descarga y botones de delivery.

El mayor incumplimiento frente al contrato UX v0.1 esta en navegacion por listas: pendientes, aprobados, clientes y cobranza usan listas y botones por indice local, pero no hay un `List Navigation Context` comun con `kind`, pagina, TTL, indices globales y mapeo estable `visibleIndex -> entityId` para comandos cortos como `detalle 10`, `cliente 5`, `facturas 3`, `pagar 2`, `descargar 4` o `enviar 6`.

Cobranza esta parcialmente implementada: existen vistas de ledger, resumen, filtros por pendientes/pagadas/canceladas, calculo de aging y acciones tokenizadas para marcar pago. El problema es que la UI actual puede mostrar acciones de pago desde un ledger general anclandolas al primer registro activo encontrado, no necesariamente a una factura seleccionada explicitamente por el usuario. Esto contradice el contrato: `Marcar pagada` solo debe aparecer cuando hay factura concreta seleccionada.

El primer slice seguro recomendado sigue siendo implementar un contexto comun de lista y aplicarlo primero a `pendientes` y `aprobados`. Despues conviene extenderlo a `clientes`, y finalmente a `cobranza` para que `facturas N` y `pagar N` operen sobre factura concreta.

## 2. Menus detectados

### Menu principal CFDI

Evidencia: workflow `Handle Commands And Scoring`, funciones `buildProductMainMenuKeyboard()` y `handleProductMenuCallback()`.

Botones actuales confirmados:

| Texto | callback_data | Handler | Observacion |
| --- | --- | --- | --- |
| Nueva factura | `cfdi_nav:new` | `CONFIRMED` -> `startInvoiceWizardResult()` | Operativo. |
| Clientes | `cfdi_nav:clients` | `CONFIRMED` -> menu clientes | Operativo. |
| Pendientes | `cfdi_nav:drafts` | `CONFIRMED` -> `pendingDraftsResult()` | Lista limitada. |
| Reporte mensual | `cfdi_nav:report` | `CONFIRMED` -> `summaryResultFromStats()` | Es resumen/cobranza mensual ligera. |
| Paquete contador | `cfdi_nav:acctpkg` | `CONFIRMED`, owner/sandbox | Debe mantenerse fuera de operador normal. |
| Estado | `cfdi_nav:status` | `CONFIRMED` | Operativo. |
| Ayuda | `cfdi_nav:help` | `CONFIRMED` | Operativo. |
| Admin/Sandbox | `cfdi_nav:admin` | `CONFIRMED`, owner | Tecnico/local; no deberia ser flujo diario. |

### Menu Clientes / Cobranza

Evidencia: workflow `buildProductClientsKeyboard()` y handlers `cfdi_nav:*`.

Botones actuales confirmados:

| Texto | callback_data | Handler | Observacion |
| --- | --- | --- | --- |
| Facturas del cliente | `cfdi_nav:client_ledger` | `CONFIRMED` -> `clientInvoiceLedgerResult('all')` | Ledger general; no selecciona cliente por indice. |
| Resumen cobranza | `cfdi_nav:billing` | `CONFIRMED` -> `clientBillingSummaryResult('all')` | Resume todos los grupos visibles. |
| Resumen vencidos | `cfdi_nav:aging` | `CONFIRMED` -> `clientBillingSummaryResult('aging')` | Aging derivado. |
| Pendientes pago | `cfdi_nav:pay_pending` | `CONFIRMED` -> ledger `pending` | Filtra facturas activas pendientes/parciales/vencidas. |
| Pagadas | `cfdi_nav:pay_paid` | `CONFIRMED` -> ledger `paid` | Correcto como filtro explicito, no default. |
| Canceladas | `cfdi_nav:pay_cancel` | `CONFIRMED` -> ledger `cancelled` | Correcto como filtro explicito. |
| Buscar cliente | `cfdi_nav:client_find` | `CONFIRMED` -> instrucciones `/cliente TEXTO` | No cumple contrato conversacional. |
| Nuevo cliente | `cfdi_nav:client_new` | `CONFIRMED` -> template | Operativo. |
| Menu principal | `cfdi_nav:menu` | `CONFIRMED` | Operativo. |

### Lista de clientes

Evidencia: `clientsListResult()` y `buildClientListKeyboard()`.

Comportamiento actual confirmado:

- Muestra hasta 10 clientes.
- Guarda `chat_state` `CLIENT_LIST_SELECTION` por 30 minutos.
- Botones `Ver 1` a `Ver 10` usan action tokens `VIEW_CLIENT`.
- Un numero suelto funciona solo en estado `CLIENT_LIST_SELECTION`.
- No se confirmo paginacion, `cliente N` por comando, indices globales ni contexto reusable por `kind`.

### Detalle de cliente

Evidencia: `buildClientDetailKeyboard()`.

Botones actuales confirmados:

- `Editar RFC`
- `Editar regimen`
- `Editar CP fiscal`
- `Editar razon social`
- `Editar uso CFDI`
- `Editar tipo persona`
- `Marcar validado` solo owner
- `Facturas del cliente`
- `Resumen cobranza`
- `Volver`
- `Menu principal`

Observacion: es util para operacion rapida, pero las ediciones fiscales son gestion sensible. El contrato permite gestion ligera, pero Factura.com/PAC debe absorber gestion pesada cuando aplique.

### Pendientes

Evidencia: `pendingDraftsResult()` y `buildPendingDraftsKeyboard()`.

Comportamiento actual confirmado:

- `pendingDrafts()` toma maximo 10 drafts recientes.
- El keyboard solo muestra los primeros 5 (`slice(0, 5)`).
- Cada fila visible muestra `Ver N`, `Aprobar N`, `Descartar N`.
- Incluye `Aprobadas` y `Menu`.
- No hay `Siguiente`/`Anterior`.
- Los indices son locales a la pantalla, no globales.
- `Aprobar N` y `Descartar N` usan token con `draft_id`; el callback es seguro, pero no crea contexto comun de lista.

### Aprobadas / aprobados para sandbox

Evidencia: `approvedDraftsResult()`, `buildApprovedDraftsKeyboard()` y `buildSandboxDraftStampSelectionKeyboard()`.

Comportamiento actual confirmado:

- `approvedDrafts()` toma maximo 10 drafts `APROBADO` o `SANDBOX_TIMBRADO`.
- El keyboard solo muestra los primeros 5.
- Cada fila tiene `Ver N`.
- Si aplica, muestra `Timbrar sandbox N`.
- Si aplica, muestra `Cancelar sandbox N`.
- Incluye `Pendientes` y `Menu`.
- No hay paginacion ni indices globales.

### Detalle de draft/factura

Evidencia: `buildDraftDetailKeyboard()`.

Botones por estado confirmados:

- `PENDIENTE`: `Aprobar`, `Descartar`, `Volver a pendientes`, `Ver resumen`.
- `APROBADO`: `Timbrar sandbox` si aplica, `Regresar a borrador`, `Volver a pendientes`, `Ver resumen`.
- `SANDBOX_TIMBRADO` con artifacts/cancelable: `Descargar XML/PDF sandbox`, `Ver estado documental`, `Enviar por correo`, `Enviar a canal documentos`, `Cancelar CFDI sandbox`.
- Si la factura puede cambiar estado de pago: `Marcar pendiente`, `Marcar pagada`, `Marcar parcial`, `Marcar vencida`, y `Ver ledger cliente`.
- `DESCARTADO`: `Ver pendientes`, `Crear nuevo borrador`, `Menu principal`, `Ayuda`. No muestra `Ver resumen`.

Observacion: la correccion del caso `COMMAND_RESUMEN` post-descartar queda reflejada en la matriz actual: descartado ya no conserva `Ver resumen`.

### Resumen mensual / cobranza

Evidencia: `monthlyBillingDashboardResult()`, `buildMonthlyDashboardKeyboard()`.

Botones actuales confirmados:

- `Ver clientes con saldo` -> `cfdi_nav:billing`
- `Ver vencidas` -> `cfdi_nav:aging`
- `Ver pagadas` -> `cfdi_nav:pay_paid`
- `Ver canceladas` -> `cfdi_nav:pay_cancel`
- `Paquete contador` para owner
- `Menu principal`

Observacion: el texto del resumen mensual calcula `topClients` desde `open_rows`, lo cual respeta el enfoque de clientes con saldo para el resumen. Sin embargo, el boton `Ver clientes con saldo` abre `clientBillingSummaryResult('all')`, que agrupa hasta 5 clientes con todos sus estados, no una lista seleccionable de cobranza accionable con contexto.

### Ledger / facturas por cliente

Evidencia: `clientInvoiceLedgerResult()`, `clientInvoiceLedgerMessage()`, `buildClientInvoiceLedgerKeyboard()`.

Comportamiento actual confirmado:

- Filtros: `all`, `pending`, `paid`, `cancelled`.
- Agrupa hasta 5 clientes.
- Muestra hasta 5 facturas por cliente.
- Botones de pago se generan si existe al menos una fila activa.
- Los botones de pago usan el primer registro activo encontrado (`visibleRows.find(...)`).

Problema UX: en un ledger general, el usuario ve varias facturas, pero los botones `Marcar pagada/parcial/vencida` no indican explicitamente que factura modifican. Esto es un candidato fuerte a boton peligroso, aunque tecnicamente tenga handler.

### Sandbox / PAC tecnico

Evidencia: `buildProductAdminKeyboard()`, `buildPacSandboxKeyboard()`.

Botones actuales confirmados:

- `PAC Sandbox`
- `Full sandbox`
- `Preflight proveedor`
- `Borradores aprobados para timbrar`
- `Smoke: timbrar fixture sandbox`
- `Smoke: timbrar + XML/PDF`
- `Smoke: timbrar + cancelar`
- `Ultimo resultado tecnico`
- `Audit sandbox`
- `Volver`

Observacion: estan owner-only y clasificados como sandbox/tecnicos. Para go-live real privado no son zombies, pero deben seguir separados de la experiencia diaria.

### Entrega documental

Evidencia: `buildDeliveryPrepareKeyboard()`, `buildDeliveryStatusKeyboard()`, `buildDownloadResultReplyMarkup()`, `buildDeliveryResultReplyMarkup()`, `buildDeliveryPostSendReplyMarkup()`.

Botones actuales confirmados:

- `Ver estado documental`
- `Enviar por correo`
- `Enviar a canal documentos`
- `Confirmar envio correo`
- `Confirmar envio canal`
- `Reenviar de todos modos`
- `Cancelar`
- `Ver factura`
- `Menu principal`

Observacion: las acciones sensibles de envio tienen confirmacion y tokens de accion. Esta zona esta mucho mas cerca del contrato que las listas largas.

### Recuperacion

Evidencia: `buildRecoveryKeyboard()`, tests y watcher.

Botones actuales confirmados:

- `Ver pendientes`
- `Crear nuevo borrador`
- `Menu principal`
- `Ayuda`

Observacion: adecuado para `CALLBACK_TOKEN_INVALID` sin contexto seguro y para estados invalidos.

## 3. Matriz menu -> botones actuales -> problema -> recomendacion

| Menu | Botones actuales | Problema frente al contrato | Recomendacion |
| --- | --- | --- | --- |
| Principal | Nueva factura, Clientes, Pendientes, Reporte mensual, Paquete contador, Estado, Ayuda, Admin/Sandbox | En general correcto. `Admin/Sandbox` y `Paquete contador` no son experiencia diaria. | Mantener owner-only. En go-live, confirmar que no aparecen a operador normal. |
| Clientes | Facturas del cliente, Resumen cobranza, Resumen vencidos, Pendientes pago, Pagadas, Canceladas, Buscar cliente, Nuevo cliente | `Buscar cliente` pide `/cliente TEXTO`, no inicia `AWAITING_CLIENT_SEARCH`. No hay paginacion ni `cliente N`. | Implementar busqueda conversacional despues del primer slice de listas. |
| Lista clientes | `Ver 1..10`, menu clientes | Tiene `chat_state` temporal, pero no `List Navigation Context` comun ni comandos `cliente N`/`facturas N`. | Migrar a contexto comun con `kind=CLIENTS`, TTL e indices globales. |
| Pendientes | `Ver 1`, `Aprobar 1`, `Descartar 1`, hasta 5; Aprobadas, Menu | Botones limitados a 5, sin siguiente/anterior. `Descartar` parece ejecutar directamente con token, sin segunda confirmacion. | Primer slice: contexto/paginacion. Agregar confirmacion para descartar. |
| Aprobadas | `Ver N`, `Timbrar sandbox N` si aplica, `Cancelar sandbox N` si aplica, hasta 5 | Sin paginacion ni `detalle 10`/`timbrar 10`. Mezcla aprobados y timbrados en fuente `approvedDrafts()`. | Contexto `DRAFTS_APPROVED`, separar estados o validar acciones por item. |
| Detalle pendiente | Aprobar, Descartar, Volver, Ver resumen | `Descartar` requiere confirmacion por contrato. | Mantener botones, pero convertir descartar en prepare/confirm. |
| Detalle aprobado | Timbrar sandbox, Regresar a borrador, Volver, Ver resumen | No muestra descartar; politica actual es mas estricta que contrato. | Mantener si esa es politica vigente. Documentar decision. |
| Detalle descartado | Ver pendientes, Crear nuevo borrador, Menu, Ayuda | Cumple contrato; no muestra resumen zombie. | Mantener como matriz base. |
| Detalle timbrado/download ready | Descargar XML/PDF, estado documental, delivery, cancelar sandbox | Cumple en sandbox. | Validar transicion real antes de go-live real. |
| Detalle descargado | Delivery status, preparar envio, factura, menu | Cerca del contrato. | Mantener confirmaciones de envio y reenvio. |
| Ledger/cobranza general | Marcar pendiente, pagada, parcial, vencida si hay fila activa | Riesgo alto: accion de pago en vista general puede apuntar a la primera fila activa, no a una factura seleccionada explicitamente. | Retirar botones de pago de ledger general; mostrar solo despues de `facturas N`/detalle factura. |
| Resumen mensual | Ver clientes con saldo, vencidas, pagadas, canceladas | No crea lista accionable de cobranza; filtros explicitos estan bien. | `Cobranza` default debe listar solo clientes con saldo y contexto `COLLECTION_CLIENTS`. |
| Sandbox tecnico | Smoke/preflight/audit/full | No es UX operativa diaria. | Mantener owner-only; no mezclar con cobranza/facturacion real. |
| Recuperacion | Ver pendientes, nuevo borrador, menu, ayuda | Correcto. | Usarlo tambien para lista expirada/contexto invalido. |

## 4. Matriz estado del item -> acciones permitidas/prohibidas

| Estado | Permitidas por contrato | Estado actual | Brecha |
| --- | --- | --- | --- |
| Preview inicial / `NEEDS_CONFIRM_DRAFT` | Confirmar, editar, cancelar, ver detalle | `CONFIRMED` por tests de UI | Sin brecha critica. |
| `DRAFT_CONFIRMED` | Ver borrador, pendientes, nueva factura, menu | `CONFIRMED` | Sin brecha critica. |
| `PENDIENTE` / `BORRADOR` | Detalle, resumen, editar, aprobar, descartar con confirmacion | `Aprobar`, `Descartar`, `Ver resumen` confirmados | Falta confirmacion para descartar. |
| `APROBADO` | Detalle, resumen, timbrar, descartar solo si no timbrado con confirmacion | Timbrar/restaurar/resumen confirmados; aprobar/descartar no visibles | Politica actual no permite descartar aprobado. OK si se documenta. |
| `SANDBOX_TIMBRADO` + `DOWNLOAD_READY` | Descargar, estado documental | `CONFIRMED` | Sin brecha critica. |
| `DOWNLOADED` | Enviar documentos, reenvio con confirmacion, ver archivos | `CONFIRMED` | Sin brecha critica en sandbox. |
| `SENT` | Estado envio, reenviar con confirmacion, archivos | `CONFIRMED` por delivery post-send markup | Validar con watcher real antes de go-live. |
| `DESCARTADO` | Ver pendientes, nuevo borrador, menu, ayuda | `CONFIRMED` | Cumple; no `Ver resumen`. |
| `CANCELLED` / sandbox cancelado | Ver resultado tecnico, menu | `CONFIRMED` en auditoria de botones | OK para sandbox. |
| `PAID` / `PARTIAL_PAID` / `OVERDUE` | Acciones por factura concreta, confirmacion si afecta real | Payment model y token actions confirmados | UI no garantiza seleccion explicita de factura en ledger general. |
| `TOKEN_EXPIRED` / `TOKEN_USED` / `CALLBACK_TOKEN_INVALID` | No ejecutar sensible; recuperar contexto seguro o menu recovery | `CONFIRMED` en watcher/auditoria | Falta cubrir lista expirada, no solo token expirado. |

## 5. Auditoria de listas largas y paginacion

Resultado: incumplimiento principal del contrato.

Evidencia confirmada:

- `pendingDrafts()` y `approvedDrafts()` cargan hasta 10 items, pero sus keyboards solo muestran `slice(0, 5)`.
- `clientsListResult()` muestra hasta 10 clientes y guarda `chat_state=CLIENT_LIST_SELECTION` por 30 minutos.
- `buildClientListKeyboard()` crea `Ver 1..10` con action tokens.
- No se confirmo ningun `Siguiente` / `Anterior`.
- No se confirmo page size configurable.
- No se confirmo contexto `kind` para `DRAFTS_PENDING`, `DRAFTS_APPROVED`, `COLLECTION_CLIENTS`, `COLLECTION_INVOICES`.
- No se confirmaron indices globales. En pagina unica, los indices son locales.
- No se confirmo seleccion de item 10 en pendientes/aprobados por comando corto.
- No se confirmo expiracion de lista con mensaje especifico. Existe expiracion de `chat_state`, pero no el error UX "Esa lista ya expiro".

Comandos revisados por busqueda estatica en el workflow:

| Comando esperado | Estado |
| --- | --- |
| `cliente 5` | `HANDLER_NOT_CONFIRMED` |
| `detalle 10` | `HANDLER_NOT_CONFIRMED` |
| `resumen 10` | `HANDLER_NOT_CONFIRMED` |
| `facturas 3` | `HANDLER_NOT_CONFIRMED` |
| `pagar 2` | `HANDLER_NOT_CONFIRMED` |
| `descargar 4` | `HANDLER_NOT_CONFIRMED` |
| `enviar 6` | `HANDLER_NOT_CONFIRMED` |
| numero suelto para cliente selection | `CONFIRMED`, solo en `CLIENT_LIST_SELECTION` |

Recomendacion:

1. Crear `List Navigation Context` comun.
2. Resolver `visibleIndex -> entityId` por `chat_id`, `telegram_user_id`, `kind`, `page` y TTL.
3. Mantener botones tokenizados, pero hacer que los botones numericos correspondan a indices globales visibles.
4. Agregar errores de indice inexistente, lista expirada y accion incompatible.

## 6. Auditoria especifica de cobranza

Lo confirmado:

- Existen funciones de ledger y billing: `clientInvoiceLedgerResult()`, `clientBillingSummaryResult()`, `monthlyBillingDashboardResult()`.
- `ledgerRowMatchesFilter()` filtra `pending`, `paid`, `cancelled`.
- `billingSummary()` calcula pendientes, parciales, pagadas, vencidas, canceladas y saldo abierto.
- `monthlyTopClients()` usa `open_rows` y ordena por saldo abierto.
- `clientBillingSummaryMessage()` agrupa hasta 5 clientes.
- `clientInvoiceLedgerMessage()` agrupa hasta 5 clientes y hasta 5 facturas por cliente.
- Existen acciones `MARK_PAYMENT_PENDING`, `MARK_PAYMENT_PAID`, `MARK_PAYMENT_PARTIAL`, `MARK_PAYMENT_OVERDUE`.
- `invoice-payment-status-model.js` bloquea cambios sobre facturas no activas/canceladas/futuras.

Problemas:

- `buildClientInvoiceLedgerKeyboard()` usa `visibleRows.find(...)` y crea botones de pago para la primera factura activa, sin que el usuario haya seleccionado una factura concreta.
- En un ledger con multiples clientes/facturas, `Marcar pagada` no comunica que factura afectara.
- `Marcar vencida` aparece como accion primaria junto a `Marcar pagada`, aunque el contrato indica que vencida debe derivarse de fecha y solo ser override administrativo raro.
- `clientBillingSummaryMessage('all')` puede mostrar clientes sin saldo abierto dentro de grupos, porque resume pagadas/canceladas/borradores tambien. El resumen mensual usa `topClients` con saldo, pero el boton "Ver clientes con saldo" abre vista `billing all`, no una lista pura `COLLECTION_CLIENTS`.
- No se confirmo flujo `facturas N` -> lista de facturas del cliente -> `pagar N`.
- No se confirmo que una accion de pago real pida confirmacion obligatoria antes de mutar cobranza.

Recomendacion:

- Cobranza default debe mostrar solo clientes con saldo abierto o vencido.
- Desde esa lista, `facturas N` debe abrir `COLLECTION_INVOICES` para un cliente.
- `Marcar pagada/parcial` debe aparecer solo en detalle o lista de facturas donde `N` resuelve a factura concreta.
- `Marcar vencida` no debe estar en boton primario; usar estado derivado por fecha o un override owner-only con confirmacion.

## 7. Acciones sin handler confirmado

Acciones o comandos esperados por el contrato sin handler confirmado:

| Accion esperada | Estado |
| --- | --- |
| `p` alias de pendientes | `HANDLER_NOT_CONFIRMED` |
| `c` alias de clientes | `HANDLER_NOT_CONFIRMED` |
| `co` alias de cobranza | `HANDLER_NOT_CONFIRMED` |
| `a` alias de aprobados | `HANDLER_NOT_CONFIRMED` |
| `m` alias de menu | `HANDLER_NOT_CONFIRMED` |
| `ver N` | `HANDLER_NOT_CONFIRMED` |
| `detalle N` | `HANDLER_NOT_CONFIRMED` |
| `resumen N` | `HANDLER_NOT_CONFIRMED` |
| `cliente N` | `HANDLER_NOT_CONFIRMED` |
| `facturas N` | `HANDLER_NOT_CONFIRMED` |
| `cobranza N` | `HANDLER_NOT_CONFIRMED` |
| `aprobar N` | `HANDLER_NOT_CONFIRMED` |
| `descartar N` con confirmacion | `HANDLER_NOT_CONFIRMED` |
| `timbrar N` | `HANDLER_NOT_CONFIRMED` |
| `descargar N` | `HANDLER_NOT_CONFIRMED` |
| `enviar N` | `HANDLER_NOT_CONFIRMED` |
| `pagar N` | `HANDLER_NOT_CONFIRMED` |
| `buscar <texto>` dentro de clientes | `HANDLER_NOT_CONFIRMED`; actual usa `/cliente TEXTO` |

Acciones con handler confirmado pero con brecha UX:

| Accion | Estado |
| --- | --- |
| `cfdi_nav:client_find` | Handler confirmado, pero no inicia estado conversacional `AWAITING_CLIENT_SEARCH`. |
| `MARK_PAYMENT_*` | Handler confirmado, pero puede aparecer en ledger general sin factura seleccionada explicitamente. |
| `DISCARD_DRAFT` | Handler confirmado, pero ejecuta cambio de estado desde boton tokenizado sin segunda confirmacion visible. |

## 8. Botones zombies o sospechosos

No se detecto, por lectura estatica, el zombie especifico `Ver resumen` despues de `DESCARTADO`; la matriz actual lo prohibe.

Sospechosos por UX, aunque tengan handler:

| Boton | Donde aparece | Motivo |
| --- | --- | --- |
| `Marcar pagada` | Detalle y ledger | En detalle de factura es razonable; en ledger general puede afectar la primera factura activa sin seleccion explicita. |
| `Marcar vencida` | Detalle y ledger | El contrato lo considera derivado/administrativo, no accion primaria. |
| `Descartar N` | Pendientes | Accion destructiva sin confirmacion secundaria confirmada. |
| `Timbrar sandbox N` | Aprobadas | Correcto para sandbox, pero en lista sin paginacion puede ocultar items 6-10. |
| `Buscar cliente` | Menu clientes | Handler muestra instrucciones `/cliente TEXTO`, no flujo conversacional. |
| `Smoke:*` | PAC Sandbox | No zombie tecnico, pero debe permanecer owner-only y fuera de go-live operativo. |

## 9. Comandos cortos faltantes

El contrato pide comandos por indice y aliases. No se confirmaron en el workflow actual.

Faltantes de mayor prioridad:

- `detalle N` en pendientes/aprobados/descargados/enviados.
- `resumen N` en pendientes/aprobados.
- `aprobar N` y `descartar N` en pendientes, con confirmacion para descartar.
- `timbrar N` en aprobados.
- `descargar N` en download ready.
- `enviar N` en descargados/enviados.
- `cliente N` en lista de clientes.
- `facturas N` en cobranza/clientes.
- `pagar N` en facturas pendientes/vencidas.
- Aliases `p`, `c`, `co`, `a`, `m`.

El unico patron numerico confirmado es numero suelto dentro de `CLIENT_LIST_SELECTION`, ligado a `chat_state`.

## 10. Delegacion recomendada a Factura.com/PAC

Debe quedarse en Telegram:

- Crear borrador rapido.
- Seleccionar cliente reciente o resultado de busqueda.
- Ver pendientes/aprobados recientes.
- Ver detalle/resumen por indice.
- Aprobar/descartar con confirmacion cuando aplique.
- Timbrar sandbox/real solo bajo modo permitido.
- Descargar/enviar documentos de una factura concreta.
- Ver cobranza accionable con saldo abierto.
- Marcar pago solo sobre factura concreta y auditada.

Debe delegarse o complementarse con Factura.com/PAC:

- Historial fiscal completo.
- Revision masiva de XML/PDF.
- Busquedas historicas por periodos largos.
- Gestion pesada de clientes fiscales.
- Operaciones fiscales avanzadas.
- Reportes contables completos.
- Conciliacion bancaria o cobranza masiva.

Boton recomendado para futuras vistas pesadas:

- `Gestionar en Factura.com` o texto equivalente cuando una consulta exceda el scope ligero de Telegram.

## 11. Cobertura actual del watcher

Evidencia: `scripts/qa/telegram-ui-session-watch.js` y `scripts/qa/telegram-ui-button-state-audit.js`.

Cobertura confirmada:

- Botones visibles con action token o `cfdi_nav`/`cfdi_sbx`.
- `TELEGRAM_DISPATCH_MISSING` para botones visibles sin dispatch.
- Deteccion de `DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON`.
- Deteccion de timbrar visible en estado descargado/timbrado.
- Deteccion de botones de delivery faltantes despues de download.
- Tokens usados/invalidos/expirados y recuperacion de contexto por draft.
- Menus por estado: pendiente, aprobado, descartado, restaurado, timbrado, downloaded, delivery prepare/send.
- Confirmaciones de delivery y cancelacion sandbox.
- Respuesta post-action para download/stamp/delivery.

## 12. Casos watcher faltantes

Faltan antes de go-live:

- Lista pendientes con mas de 5 items y navegacion `Siguiente`.
- Lista aprobados con mas de 5 items y seleccion item 6-10.
- Verificar que botones numericos coincidan con indices visibles globales.
- `detalle 10` y `resumen 10` contra contexto de lista.
- `aprobar N` y `descartar N` con confirmacion.
- Lista expirada: mensaje claro y sin ejecutar accion.
- Contexto de lista cruzado entre `chat_id`/`telegram_user_id`: debe bloquear.
- Cobranza default sin clientes saldo cero.
- `facturas N` desde cliente de cobranza.
- `pagar N` solo desde factura concreta.
- Ausencia de `Marcar pagada` en menus generales.
- Ausencia de `Marcar vencida` como accion primaria.
- `Buscar cliente` conversacional.
- Botones de sandbox tecnico no visibles para rol no-owner.
- Boton handlerless en menus `cfdi_nav:*` y tokens de pago.

## 13. Primer slice seguro de implementacion

Sin implementar en esta auditoria, el primer slice recomendado es:

1. Crear `List Navigation Context` comun.
2. Aplicarlo solo a `pendientes` y `aprobados`.
3. Mantener los action tokens actuales como mecanismo de callback seguro.
4. Agregar `Siguiente` / `Anterior` cuando haya mas de 5 items.
5. Usar indices globales: pagina 2 muestra `6..10`.
6. Implementar `detalle N`, `resumen N`, `aprobar N`, `descartar N`, `timbrar N` solo para `DRAFTS_PENDING` y `DRAFTS_APPROVED`.
7. Hacer `descartar N` en dos pasos: preparar confirmacion y confirmar.
8. Agregar watcher/test del contrato de listas para item 6-10.

Despues:

- Slice 2: `clientes` con `cliente N`, `facturas N` y busqueda conversacional.
- Slice 3: `cobranza` con `COLLECTION_CLIENTS`, `COLLECTION_INVOICES` y `pagar N` sobre factura concreta.
- Slice 4: limpiar botones de pago por estado usando Menu Action Matrix.

## 14. Riesgos

Riesgos tecnicos:

- El workflow contiene logica extensa embebida en n8n JSON. Cambios de listas pueden tener efecto lateral en callbacks, chat state y persistencia SQL.
- Hay dos modelos cercanos: `chat_state` para conversacion y `cfdi_action_tokens` para botones. El nuevo contexto debe convivir con ambos sin duplicar autoridad.
- `recent_drafts` se carga limitado desde DB. Una paginacion real puede requerir cambios en el query de contexto o una tabla de list context.
- Cobranza lee ledger limitado y summary local. Para historial pesado no conviene ampliar Telegram sin una estrategia de delegacion a Factura.com/PAC.
- Payment status actions existen; si se dejan en ledger general, hay riesgo operativo de marcar la factura incorrecta.

Riesgos de UX:

- Botones de accion directa son rapidos, pero acciones destructivas o contables necesitan confirmacion.
- Si `Siguiente`/`Anterior` se implementa solo visualmente sin contexto seguro, se pueden crear indices ambiguos.
- Si se mezclan listas de clientes, drafts y cobranza en un solo estado sin `kind`, comandos como `pagar 2` pueden resolver contra la lista equivocada.

Riesgos abiertos por auditoria estatica:

- No se valido comportamiento real de n8n ni Telegram.
- No se probo watcher.
- No se confirmo rol real de usuario en runtime.
- No se confirmo existencia de todas las tablas runtime para un nuevo list context.

## 15. Veredicto final

Veredicto: `PARTIAL_MATCH`.

El sistema actual cumple bien la parte de botones por estado para draft/sandbox/delivery y ya evita el zombie critico de `Ver resumen` sobre descartado. Tambien tiene handlers confirmados para menus `cfdi_nav:*`, action tokens y varias vistas de cobranza.

No cumple todavia el contrato operativo central de Private SatBot: listas navegables por indices globales, paginacion, comandos cortos por indice y cobranza accionable por factura concreta. Esos puntos son bloqueantes UX antes de go-live real controlado.

Recomendacion final: no hacer refactor grande. Implementar por slices, empezando por `List Navigation Context` en `pendientes` y `aprobados`, y no mover cobranza a acciones por pago hasta que exista seleccion explicita de factura y confirmacion auditada.
