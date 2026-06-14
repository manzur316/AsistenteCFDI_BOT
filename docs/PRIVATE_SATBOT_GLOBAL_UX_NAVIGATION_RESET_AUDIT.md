# Private SatBot Global UX Navigation Reset Audit

## 1. Resumen ejecutivo

Modo de trabajo: `AUDIT_ONLY_AND_PUSH`.

Alcance revisado de forma estatica:

- `docs/PRIVATE_SATBOT_UX_MASTER_PLAN_V0.1.md`
- `docs/PRIVATE_SATBOT_UX_PRESENTATION_CONTRACT_V0.1.md`
- `docs/PRIVATE_SATBOT_TELEGRAM_UX_CONTRACT_V0.1.md`
- `docs/TELEGRAM_SCREEN_NAVIGATION_MATRIX.md`
- `TELEGRAM_UX_MENU_ACTION_AUDIT_REPORT.md`
- `workflow/cfdi_telegram_local_ingest.n8n.json`
- scripts y tests relacionados con Telegram UI, drafts, clientes, cobranza, ledger, watcher y sandbox

No se ejecuto Telegram real, watcher, n8n, smokes, workflow sync ni PAC. Este documento no implementa cambios.

Veredicto: la UX actual ya tiene mejores contratos internos que en fases anteriores (`screen_id`, `list_context`, `return_to`, parse mode, clientes funcionales y cobranza accionable), pero la arquitectura visible sigue mezclando demasiadas superficies: operacion diaria, administracion, sandbox, QA, proveedor, documentos, facturas, cobranza, pagos y recuperacion aparecen como una sola malla de botones. El problema ya no es un boton aislado; es la falta de separacion de informacion entre modulos.

Nota Slice 9R 2.2: Facturas ya tiene una superficie operativa inicial separada. `/facturas` abre `INVOICES_RECENT_LIST` y `facturas N` desde Clientes abre `CLIENT_INVOICES_LIST`; ambas usan folio proveedor como identidad principal con fallback seguro y no heredan botones de edicion fiscal, cobranza ni pago.

Nota Slice 9R 2.3: Documentos ya tiene una superficie operativa inicial separada. `/documentos` abre `DOCUMENTS_RECENT_LIST`, usa folio proveedor como identidad principal, resume XML/PDF y envio desde `provider_invoice_links`/`document_delivery_ledger`, y bloquea descarga/envio/pago como consulta segura hasta un flujo confirmado posterior.

Nota Slice 9R 2.4: Documentos ya permite descarga y envio con confirmacion tokenizada. `descargar N` abre `DOCUMENT_DOWNLOAD_CONFIRM` y solo el token `DOWNLOAD_SANDBOX_ARTIFACTS` confirmado planea `sandbox.draft.download-artifacts`; `enviar N`, `correo N` y `canal N` abren `DOCUMENT_DELIVERY_CONFIRM` y solo `DELIVERY_CONFIRM_*` ejecuta el envio existente. Pagos, cancelacion, PAC real y envios/descargas en pruebas siguen fuera de alcance.

Nota Slice 9R 2.4F: QA runtime detecto fuga de teclado legacy desde Documentos y acceso normal al ledger tecnico `CLIENT_INVOICE_LEDGER`. El fix aplicado depreca `cfdi_nav:client_ledger`, `cfdi_nav:pay_paid` y `cfdi_nav:pay_cancel` en UX normal, fuerza `CLIENT_INVOICES_LIST` para Facturas del cliente, bloquea pagos si `source_module=DOCUMENTS`, y recupera tokens de Documentos con `DOCUMENT_ACTION_BLOCKED`/teclado propio en lugar de `DRAFT_DETAIL`.

Nota Slice 9R 2.4G: QA runtime posterior confirmo un defecto mas profundo de routing de entidad. El fix aplicado separa `BORRADOR`, `FACTURA TIMBRADA`, `DOCUMENTO` y `COBRANZA`: una entidad timbrada ya no se presenta como "Borrador aprobado", `VIEW_DRAFT` de factura timbrada cae en `INVOICE_DETAIL`, `/start` y `/menu` son rutas absolutas al menu principal, y download/delivery solo se planean desde `DOCUMENT_DOWNLOAD_CONFIRM`/`DOCUMENT_DELIVERY_CONFIRM` con `source_module=DOCUMENTS`, token vigente, estado valido y referencia proveedor suficiente. El fallback visible sin folio ya no expone `SANDBOX-INV-DRAFT-*`; usa `FAC-SBX-<id corto>`.

Nota Slice 9R 2.4H: Se reforzo el fallback visible para ignorar provider ids tecnicos derivados de `DRAFT-*`; Facturas y Documentos usan folio, UUID corto, PAC corto o `FAC-SBX-<id corto>`, nunca `SANDBOX-INV-DRAFT-*`. Borradores fue renombrado en UX normal a `Por revisar` y `Listos para facturar`, y se retiro `Documentos` de ese modulo. El triage del watcher clasifico `DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON` como mismatch de clasificador por boton tokenizado y `TELEGRAM_CHANNEL_SEND_OBSERVED` como falso positivo por ledger historico fuera de una ejecucion delivery real.

La recomendacion central es redisenar la navegacion en dos capas:

- Menu operativo normal: tareas diarias del bot personal.
- Menu Admin/QA restringido: sandbox, smokes, preflight, diagnostico tecnico y proveedor.

El reset debe hacerse por slices. No debe romper los avances recientes: listas de drafts, presentacion humana, clientes por indice, cobranza accionable y confirmacion de pago por factura concreta.

## 2. Diagnostico global

### Problemas principales

1. El menu principal combina operacion diaria con rutas administrativas:
   `Nueva factura`, `Clientes`, `Pendientes`, `Reporte mensual`, `Paquete contador`, `Estado`, `Ayuda` y `Admin/Sandbox`.

2. La pantalla de clientes concentra varias ideas:
   lista de clientes, busqueda, alta, facturas del cliente, resumen de cobranza, vencidos, pendientes de pago, pagadas y canceladas.

3. Draft, factura, documento y pago todavia se tocan en la misma pantalla de detalle:
   `DRAFT_DETAIL` puede mostrar aprobar, descartar, timbrar, descargar, enviar documentos, cancelar sandbox y marcar pago segun estado.

4. Las rutas sandbox/QA estan protegidas por rol, pero siguen siendo parte del arbol visible para owner desde el flujo operativo.

5. El proveedor/PAC aparece como una herramienta de ejecucion tecnica, no como una fuente de verdad separada para sincronizacion y revision.

6. Recuperacion y estados invalidos son correctos como safety net, pero no deben convertirse en navegacion normal.

7. La cobranza accionable ya tiene una base mas segura (`COLLECTION_CLIENTS` -> `COLLECTION_INVOICES` -> confirmacion), pero necesita integrarse como modulo propio, no como subopcion escondida dentro de clientes.

### Diagnostico de producto

Private SatBot debe sentirse como una herramienta operativa personal. La UX actual se siente como una consola de mantenimiento que tambien factura. Antes de agregar funciones nuevas, conviene separar:

- captura y revision de borradores
- clientes
- facturas
- cobranza
- documentos
- proveedor
- admin/QA

## 3. Inventario de pantallas actuales

| Superficie actual | screen_id actual | Funcion/nodo que la genera | Comandos o botones | Contexto requerido | Usuario esperado | Tipo | Visible en menu normal | Problemas UX | Recomendacion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Menu principal | `MAIN_MENU` / `PRODUCT_MAIN_MENU` | `productMainMenuResult`, `buildProductMainMenuKeyboard` | `/start`, `/menu`, `cfdi_nav:menu` | ninguno | owner, operador, contador parcial | OPERATIVE | si | mezcla reportes, contador y admin con operacion diaria | REBUILD |
| Nueva factura | `NEW_INVOICE` / `INVOICE_WIZARD` | `startInvoiceWizardResult` | `/factura`, `/nueva`, `cfdi_nav:new` | `INVOICE_WIZARD` | owner, operador | OPERATIVE | si | correcto como primer flujo | KEEP |
| Borrador generado | `DRAFT_CONFIRMED` | confirmacion de draft | botones post-confirmacion | draft_id | owner, operador | OPERATIVE | si | debe vivir bajo modulo Borradores | KEEP |
| Pendientes | `DRAFTS_PENDING_LIST` | `pendingDraftsResult` | `/pendientes`, `cfdi_nav:drafts` | `DRAFTS_PENDING` | owner, operador | OPERATIVE | si | boton principal dice Pendientes, no Borradores | RENAME |
| Aprobadas | `DRAFTS_APPROVED_LIST` | `approvedDraftsResult` | `/aprobadas`, `LIST_APPROVED` | `DRAFTS_APPROVED` | owner | DANGEROUS | parcialmente | timbrar es accion sensible, deberia estar bajo Borradores > Aprobados | MOVE_TO_OPERATIVE_SUBMENU |
| Detalle de borrador | `DRAFT_DETAIL` | `draftDetailResult`, `buildDraftDetailKeyboard` | `ver N`, `detalle N`, `VIEW_DRAFT` | draft_id, return_to | owner, operador | OPERATIVE/DANGEROUS | no directo | demasiadas acciones segun estado en una pantalla | REBUILD |
| Resumen de borrador | `DRAFT_SUMMARY` | `draftSummaryResult` | `resumen N`, `VIEW_SUMMARY` | draft_id | owner, operador | OPERATIVE | no directo | debe ser revisable, no tecnico | KEEP |
| Clientes lista | `CLIENTS_LIST_SELECTION` | `clientsListResult`, `buildClientListKeyboard` | `/clientes`, `cliente N`, `facturas N`, `VIEW_CLIENT` | `CLIENTS` | owner, operador | OPERATIVE | si | comparte menu con cobranza y facturas | KEEP_WITH_RESTRUCTURE |
| Clientes menu historico | `CLIENTS_MENU` | `buildProductClientsKeyboard` | `cfdi_nav:clients` y nav interna | ninguno/list_context | owner, operador | OPERATIVE | si | actua como menu, lista y gateway de cobranza | REBUILD |
| Buscar cliente | `CLIENT_SEARCH` | `productClientFindResult` | `Buscar cliente`, siguiente mensaje | `AWAITING_CLIENT_SEARCH` | owner, operador | OPERATIVE | si | correcto, debe integrarse al modulo clientes | KEEP |
| Opciones de busqueda cliente | `CLIENT_SEARCH_OPTIONS` | resultados de busqueda | `cliente N`, `VIEW_CLIENT` | `CLIENTS` / search results | owner, operador | OPERATIVE | no directo | debe quedar claro que es resultado de busqueda | RENAME |
| Detalle cliente | `CLIENT_DETAIL` | `clientDetailResult`, `buildClientDetailKeyboard` | `VIEW_CLIENT`, `cliente N` | client_id, return_to | owner, operador | OPERATIVE/ADMIN | no directo | edicion fiscal y facturas/cobranza comparten detalle | REBUILD |
| Facturas del cliente / ledger | `CLIENT_INVOICE_LEDGER` | `clientInvoiceLedgerResult` | `cfdi_nav:client_ledger`, facturas de cliente | opcional client_id | owner, contador | OPERATIVE | si desde clientes | mezcla historial, documentos y cobranza | MOVE_TO_FACTURAS |
| Cobranza clientes | `COLLECTION_CLIENTS` | `collectionClientsResult` | `cfdi_nav:pay_pending`, `/cobranza`, `/pendientes_pago` | `COLLECTION_CLIENTS` | owner | OPERATIVE/DANGEROUS | no como modulo propio | esta bajo Clientes, no como Cobranza principal | KEEP_AS_COBRANZA |
| Facturas por cobrar | `COLLECTION_INVOICES` | `collectionInvoicesResult` | `facturas N` | `COLLECTION_INVOICES` | owner | DANGEROUS | no directo | correcto como paso intermedio | KEEP |
| Confirmacion de pago | `PAYMENT_CONFIRMATION` | `handleCollectionPaymentTextCommand`, token `MARK_PAYMENT_PAID` | `pagar N`, `Confirmar pagada` | factura concreta, token | owner | DANGEROUS | no directo | debe mantenerse como unico punto de mutacion de pago | KEEP |
| Resumen cobranza | `CLIENT_BILLING_SUMMARY` | `clientBillingSummaryResult` | `cfdi_nav:billing`, `cfdi_nav:aging` | ledger | owner, contador | OPERATIVE | si desde clientes | summary no es accionable; debe vivir en Cobranza | MOVE_TO_COBRANZA |
| Resumen mensual | `MONTHLY_BILLING_DASHBOARD` | `monthlyBillingDashboardResult` | `/resumen`, `/hoy`, `cfdi_nav:report` | ledger | owner, contador | OPERATIVE/ADMIN | si | puede confundirse con reporte fiscal | RENAME |
| Pagadas | `CLIENT_PAYMENT_PAID` | `clientInvoiceLedgerResult('paid')` | `cfdi_nav:pay_paid` | ledger | owner, contador | OPERATIVE | si desde clientes | filtro, no accion primaria diaria | MOVE_TO_COBRANZA_FILTER |
| Canceladas | `CLIENT_PAYMENT_CANCELLED` | `clientInvoiceLedgerResult('cancelled')` | `cfdi_nav:pay_cancel` | ledger | owner, contador | OPERATIVE | si desde clientes | filtro, no accion primaria diaria | MOVE_TO_COBRANZA_FILTER |
| Download ready | `DRAFT_DETAIL` / sandbox result | `buildDraftDetailKeyboard`, `buildDownloadResultReplyMarkup` | `DOWNLOAD_SANDBOX_ARTIFACTS` | draft_id | owner | DANGEROUS/OPERATIVE | no directo | deberia vivir tambien bajo Documentos | MOVE_TO_DOCUMENTOS |
| Downloaded | `DRAFT_DETAIL` / delivery status | delivery result builders | `DELIVERY_STATUS`, delivery prepare | draft_id | owner | OPERATIVE/DANGEROUS | no directo | documentos y envio se mezclan con draft detail | MOVE_TO_DOCUMENTOS |
| Estado documental | `SANDBOX_DOCUMENT_DELIVERY_STATUS` | delivery status builders | `DELIVERY_STATUS` | draft_id | owner | OPERATIVE | no directo | correcto, falta modulo Documentos | KEEP |
| Delivery Telegram | `SANDBOX_DOCUMENT_DELIVERY_CONFIRM` | delivery prepare/result builders | preparar/confirmar canal | draft_id, token | owner | DANGEROUS | no directo | requiere confirmacion e idempotencia | KEEP_RESTRICTED |
| Delivery email | `SANDBOX_DOCUMENT_DELIVERY_CONFIRM` | delivery prepare/result builders | preparar/confirmar correo | draft_id, token | owner | DANGEROUS | no directo | requiere confirmacion e allowlist | KEEP_RESTRICTED |
| Recovery | `RECOVERY`, token invalid/used/expired | `buildRecoveryKeyboard`, `callbackTokenInvalid` | recuperacion, menu, pendientes | opcional draft_id | todos | RECOVERY | no | correcto como salida segura | KEEP |
| Estado local | `PRODUCT_STATUS` | `productStatusResult` | `/estado`, `cfdi_nav:status` | ninguno | owner, operador | ADMIN/OPERATIVE | si | tecnico para menu diario | MOVE_TO_ADMIN_OR_HELP |
| Ayuda | `PRODUCT_HELP` | `productHelpResult`, `commandHelp` | `/help`, `/ayuda`, `cfdi_nav:help` | ninguno | todos | OPERATIVE | si | correcto | KEEP |
| Admin/Sandbox | `PRODUCT_ADMIN_SANDBOX` | `productAdminResult`, `buildProductAdminKeyboard` | `cfdi_nav:admin` | OWNER | ADMIN | owner-only en menu | no deberia estar en menu operativo | MOVE_TO_ADMIN |
| PAC Sandbox | `PAC_SANDBOX_CONSOLE` | `pacSandboxConsoleResult`, `buildPacSandboxKeyboard` | `cfdi_nav:pac_sbx` | OWNER | QA_SANDBOX | no | correcto si queda oculto | MOVE_TO_QA |
| Borradores aprobados para sandbox | `PAC_SANDBOX_DRAFT_SELECTION` | `sandboxApprovedDraftsForStampResult` | `cfdi_nav:sbx_drafts` | OWNER, aprobados | QA_SANDBOX/DANGEROUS | no | duplica aprobadas operativas | MOVE_TO_QA |
| Full sandbox | sandbox action result | `productSandboxActionResult` | `cfdi_sbx:full` | OWNER | QA_SANDBOX | no | accion tecnica pesada | MOVE_TO_QA |
| Smoke timbrar | sandbox action result | `productSandboxActionResult` | `cfdi_sbx:smoke_create` | OWNER | QA_SANDBOX/DANGEROUS | no | no debe aparecer en UX diaria | MOVE_TO_QA |
| Smoke XML/PDF | sandbox action result | `productSandboxActionResult` | `cfdi_sbx:smoke_download` | OWNER | QA_SANDBOX/DANGEROUS | no | no debe aparecer en UX diaria | MOVE_TO_QA |
| Smoke cancelar | sandbox action result | `productSandboxActionResult` | `cfdi_sbx:smoke_cancel` | OWNER | QA_SANDBOX/DANGEROUS | no | no debe aparecer en UX diaria | MOVE_TO_QA |
| Preflight proveedor | sandbox action result | `productSandboxActionResult` | `cfdi_sbx:preflight` | OWNER | ADMIN/QA_SANDBOX | no | util, pero tecnico | MOVE_TO_ADMIN |
| Ultimo resultado tecnico | sandbox action result | `cfdi_sbx:latest` | OWNER | QA_SANDBOX | no | diagnostico | MOVE_TO_QA |
| Audit sandbox | sandbox action result | `cfdi_sbx:audit` | OWNER | QA_SANDBOX | no | diagnostico | MOVE_TO_QA |
| Paquete contador | accountant package action | `cfdi_nav:acctpkg` | OWNER/contador | ACCOUNTANT_READONLY | ADMIN/OPERATIVE | si por rol | no debe confundirse con Facturas | MOVE_TO_REPORTES_OR_ADMIN |

## 4. Clasificacion OPERATIVE / ADMIN / QA_SANDBOX / DANGEROUS / DEPRECATED / RECOVERY

| Categoria | Superficies |
| --- | --- |
| OPERATIVE | Menu principal, Nueva factura, Borradores, Pendientes, Aprobadas, Clientes, Buscar cliente, Detalle cliente, Facturas, Cobranza, Documentos, Ayuda |
| ADMIN | Estado tecnico, proveedor/credenciales, paquete contador, reportes tecnicos, configuracion, validacion fiscal manual de cliente |
| QA_SANDBOX | PAC Sandbox, Full sandbox, Smoke timbrar, Smoke XML/PDF, Smoke cancelar, Preflight proveedor, Ultimo resultado tecnico, Audit sandbox, seleccion sandbox de borradores |
| DANGEROUS | Timbrar, cancelar CFDI/sandbox, descartar, marcar pagada, marcar parcial, marcar vencida, enviar documentos, reenviar documentos, sync proveedor si muta estado |
| DEPRECATED | Pantallas duplicadas o demasiado genericas: `CLIENTS_MENU` como contenedor de todo, ledger general como ruta de pago, aprobadas sandbox separada del modulo Borradores |
| RECOVERY | Token usado, token expirado, token invalido, contexto vencido, contexto incompatible, recuperacion de draft, menu seguro |

## 5. Menu principal actual: problemas

Menu actual confirmado por `buildProductMainMenuKeyboard()`:

```text
Nueva factura
Clientes | Pendientes
Reporte mensual | Paquete contador
Estado | Ayuda
Admin/Sandbox   owner only
```

Problemas:

- `Clientes` es una puerta a clientes, facturas, cobranza, pagadas, canceladas y busqueda.
- `Pendientes` abre solo drafts pendientes, no un modulo completo de borradores.
- `Reporte mensual` mezcla cobranza operativa con reporte contable.
- `Paquete contador` es una accion de reporte/administracion, no tarea diaria de captura.
- `Estado` muestra diagnostico local tecnico; puede quedarse como `/status` o admin.
- `Admin/Sandbox` no debe competir visualmente con acciones de facturacion diaria, aunque sea owner-only.
- No existe boton normal de `Facturas`.
- No existe boton normal de `Documentos`.
- No existe boton normal de `Cobranza`; aparece como `Pendientes pago` dentro de Clientes.
- No existe una division clara entre `Borradores` y `Facturas`.

## 6. Menu principal propuesto

Objetivo: que el usuario entienda el mapa en menos de 5 segundos.

```text
Menu principal

Nueva factura
Borradores
Clientes
Facturas
Cobranza
Documentos
Sincronizar proveedor
Ayuda
```

| Boton | Proposito | Destino propuesto | Comandos equivalentes | Contexto requerido | Estado |
| --- | --- | --- | --- | --- | --- |
| Nueva factura | Captura rapida de borrador | `INVOICE_WIZARD` | `/nueva`, `/factura` | ninguno | actual |
| Borradores | Revision antes de timbrar | submenu `DRAFTS_MENU` | `/borradores`, `/pendientes`, `/aprobadas` | ninguno | requiere slice |
| Clientes | Buscar, abrir detalle y facturas por cliente | `CLIENTS_MENU_CLEAN` | `/clientes`, `/cliente TEXTO`, `cliente N` | opcional list_context | actual con reestructura |
| Facturas | Historial reciente y facturas por cliente | `INVOICES_MENU` | `/facturas`, `facturas N` | opcional cliente/list_context | futuro/parcial |
| Cobranza | Clientes con saldo y facturas por cobrar | `COLLECTION_CLIENTS` | `/cobranza`, `/pendientes_pago`, `facturas N`, `pagar N` | contexto de cobranza | actual con reestructura |
| Documentos | XML/PDF, estado documental y envios | `DOCUMENTS_RECENT_LIST` / `DOCUMENT_DETAIL` | `/documentos`, `descargar N`, `enviar N`, `correo N`, `canal N` | factura/draft concreta | implementado con confirmacion |
| Sincronizar proveedor | Sync/consulta con Factura.com/PAC | `PROVIDER_SYNC_MENU` | `/sync`, `/proveedor` | OWNER | futuro |
| Ayuda | Comandos y explicacion breve | `HELP` | `/help`, `/ayuda` | ninguno | actual |

Regla: `Admin/QA`, `smoke`, `sandbox`, `preflight`, `latest`, `audit`, `estado tecnico` y `paquete contador` no deben estar en el menu operativo normal.

## 7. Menu Admin/QA propuesto

Debe ser owner-only o debug-only. No debe aparecer en el menu operativo normal.

```text
Admin / QA

Estado tecnico
Sandbox
Preflight proveedor
Smoke tests
Workflow status
Proveedor / credenciales
Diagnostico
Volver al menu
```

| Boton | Destino | Reglas |
| --- | --- | --- |
| Estado tecnico | `PRODUCT_STATUS` / workflow status | solo lectura, owner/debug |
| Sandbox | `PAC_SANDBOX_CONSOLE` | no produccion real, owner |
| Preflight proveedor | `cfdi_sbx:preflight` | solo diagnostico, no mutar datos |
| Smoke tests | smoke submenu | confirmacion o entorno sandbox, owner |
| Workflow status | harness/status si se expone en Telegram futuro | solo lectura |
| Proveedor / credenciales | diagnostico redacted | nunca mostrar secretos |
| Diagnostico | ultimo resultado, audit sandbox, logs resumidos | ocultar rutas/runtime sensibles |

Reglas de Admin/QA:

- No ejecutar acciones peligrosas sin confirmacion.
- No mostrar secretos, tokens, rutas locales completas ni payloads fiscales crudos.
- No mezclar smoke tests con facturacion diaria.
- No permitir acceso a `ASSISTANT_OPERATOR` salvo rutas explicitamente seguras.

## 8. Arbol de navegacion objetivo

### 8.1 Nueva factura

```text
Menu principal
  -> Nueva factura
    -> Captura
    -> Borrador generado
      -> Ver detalle
      -> Aprobar
      -> Descartar con confirmacion
      -> Menu / Borradores
```

### 8.2 Borradores

```text
Borradores
  -> Pendientes
    -> Detalle
    -> Resumen
    -> Aprobar
    -> Descartar con confirmacion
  -> Aprobados
    -> Detalle
    -> Timbrar con confirmacion/sandbox guard
    -> Regresar a borrador
  -> Timbrados sandbox / Download ready
    -> Descargar XML/PDF
    -> Ver factura
  -> Descargados
    -> Estado documental
    -> Enviar documentos con confirmacion
  -> Descartados
    -> Ver detalle limitado
    -> Restaurar si se permite en futuro
```

### 8.3 Clientes

```text
Clientes
  -> Lista de clientes
  -> Buscar cliente
  -> Detalle cliente
    -> Facturas del cliente
    -> Cobranza del cliente
    -> Editar datos fiscales owner/confirmado
```

### 8.4 Facturas

```text
Facturas
  -> Historial reciente
  -> Por cliente
  -> Timbradas sandbox
  -> Descargadas
  -> Canceladas
  -> Ver detalle fiscal/documental
```

### 8.5 Cobranza

```text
Cobranza
  -> Clientes con saldo
    -> facturas N
      -> Facturas por cobrar del cliente
        -> pagar N
          -> Confirmacion de pago local
  -> Pagadas
  -> Parciales
  -> Vencidas
```

### 8.6 Documentos

```text
Documentos
  -> XML/PDF listos para descargar
  -> Descargados
  -> Enviados
  -> Errores de envio
  -> Estado documental por factura
```

### 8.7 Proveedor

```text
Proveedor
  -> Sync manual read-only
  -> Estado proveedor
  -> Ultima reconciliacion
  -> Errores
```

El proveedor no debe ser un menu pesado diario. Factura.com/PAC sigue absorbiendo historial fiscal y gestion avanzada.

## 9. Separacion de conceptos

| Concepto | Definicion UX | Pantalla responsable | No debe confundirse con |
| --- | --- | --- | --- |
| Cliente | Persona/empresa a facturar | Clientes | cobranza completa, historial fiscal masivo |
| Facturas del cliente | Facturas asociadas a un cliente | Facturas por cliente | lista de clientes |
| Historial de facturas | Consulta reciente o filtrada | Facturas | Borradores pendientes |
| Cobranza | Estado operativo de pago local | Cobranza | estado fiscal/PAC |
| Facturas por cobrar | Facturas concretas con saldo abierto | `COLLECTION_INVOICES` | ledger general |
| Estado fiscal | Timbrada, cancelada, UUID, acuse | Facturas/Proveedor | estado de pago |
| Estado de pago | Pendiente, parcial, pagada, vencida | Cobranza | estado fiscal |
| Estado documental | XML/PDF descargado/enviado | Documentos | pago |
| Sandbox | Pruebas controladas locales/PAC sandbox | Admin/QA | operacion diaria |
| PAC/proveedor | Fuente de verdad fiscal despues de timbrar | Proveedor/Admin | cache local del bot |

## 10. Comandos actuales vs propuestos

| Comando | Destino actual observado | Destino propuesto | Debe existir | Movimiento |
| --- | --- | --- | --- | --- |
| `/start` | menu/ayuda | menu principal limpio | si | operativo |
| `/menu` | menu principal | menu principal limpio | si | operativo |
| `/help`, `/ayuda` | ayuda | ayuda | si | operativo |
| `/factura`, `/nueva` | nueva factura | nueva factura | si | operativo |
| `/borradores` | parcial/pendientes o no canonico | submenu Borradores | si | operativo |
| `/pendientes` | pendientes drafts | Borradores > Pendientes | si | operativo |
| `/aprobadas` | aprobadas drafts | Borradores > Aprobados | si | operativo/danger gated |
| `/clientes` | lista clientes | Clientes > Lista | si | operativo |
| `/cliente TEXTO` | busqueda cliente | busqueda cliente | si | operativo |
| `cliente N`, `/cliente N` | seleccion cliente desde contexto | seleccion cliente desde contexto | si | operativo |
| `facturas N`, `/facturas N` | cliente/cobranza segun contexto | abrir facturas del cliente o cobranza | si | operativo |
| `/facturas` | parcial/no menu claro | Facturas menu | si | nuevo |
| `/cobranza`, `/pendientes_pago` | cobranza accionable | Cobranza | si | operativo |
| `pagar N`, `/pagar N` | confirmacion desde `COLLECTION_INVOICES` | igual | si | peligroso con confirmacion |
| `/documentos` | no canonico | Documentos menu | si | nuevo |
| `/estado`, `/status` | estado tecnico/local | Admin/QA o Ayuda avanzada | si | mover |
| `/debug` | debug | Admin/QA | si solo owner | mover |
| `/sandbox` | sandbox | Admin/QA | si solo owner | mover |
| `/admin` | admin | Admin/QA | si solo owner | mover |
| `/preflight` | preflight proveedor si existe | Admin/QA | opcional | mover |
| `/smoke` | smoke si existe | Admin/QA | opcional | mover |
| `/validarcliente` | validacion cliente | Detalle cliente owner/admin | si | restringir |
| `/nuevocliente` | alta cliente | Clientes | si | operativo con revision |
| `/setcliente`, `/editarcliente` | edicion fiscal | Detalle cliente owner/admin | si | restringir |
| `/cancelar` | cancelar flujo/draft | segun contexto | si | peligroso si cancela entidad |

Regla para comandos ambiguos:

- Un numero suelto solo selecciona cuando el bot espera seleccion.
- `cliente N` solo resuelve contra contexto `CLIENTS`.
- `facturas N` resuelve contra `CLIENTS` o `COLLECTION_CLIENTS`, no contra drafts.
- `pagar N` solo resuelve contra `COLLECTION_INVOICES`.
- `detalle N` y `ver N` resuelven contra drafts/facturas segun contexto compatible.

## 11. Botones peligrosos y confirmaciones

| Accion peligrosa | Donde aparece hoy | Donde debe aparecer | Confirmacion requerida | Token/idempotencia | Recomendacion |
| --- | --- | --- | --- | --- | --- |
| Timbrar sandbox | detalle aprobado, aprobadas/admin sandbox | Borradores > Aprobados > detalle | si para real; sandbox con guard | si | mantener fuera de menu general |
| Cancelar CFDI sandbox | detalle timbrado | Factura/Documentos/Admin sandbox | si | si | no mostrar en listas generales |
| Cancelar CFDI real | futuro | Factura concreta | si fuerte | si + provider truth | ocultar hasta fase dedicada |
| Descartar | detalle/pendientes | Draft concreto | si | si | preparar/confirmar |
| Marcar pagada | `PAYMENT_CONFIRMATION`, detalle draft/factura | Cobranza > factura concreta | si | si | no en ledger general ambiguo |
| Marcar parcial | detalle draft/factura | Cobranza > factura concreta con monto | si | si | diferir monto parcial |
| Marcar vencida | detalle draft/factura | admin/override o estado derivado | si | si | no accion primaria |
| Enviar por correo | detalle/documentos | Documentos > factura concreta | si | si + allowlist | mantener confirmacion |
| Enviar a canal | detalle/documentos | Documentos > factura concreta | si | si | mantener confirmacion |
| Reenviar documentos | delivery duplicate | Documentos > estado envio | si | si | solo si duplicate block lo permite |
| Descargar XML/PDF | detalle/download ready/ledger artifact | Documentos o factura concreta | no destructiva, pero tokenizada | si | visible cuando DOWNLOAD_READY |
| Sync proveedor mutante | futuro | Admin/Proveedor | si | si | separar read-only de mutante |
| Validar cliente | detalle cliente | Admin/cliente owner | si o owner-only | si | no operador normal |
| Editar datos fiscales | detalle cliente | Cliente > Editar | confirmacion/revision | si | no mezclar con lista |

## 12. Superficies obsoletas o tecnicas

| Superficie/boton | Estado | Accion recomendada |
| --- | --- | --- |
| `Admin/Sandbox` en menu principal | tecnico owner-only | mover a `/admin`, ocultar del menu operativo |
| `Full sandbox` | QA_SANDBOX | mantener en Admin/QA |
| `Smoke: timbrar fixture sandbox` | QA_SANDBOX/DANGEROUS | mantener en Admin/QA |
| `Smoke: timbrar + XML/PDF` | QA_SANDBOX/DANGEROUS | mantener en Admin/QA |
| `Smoke: timbrar + cancelar` | QA_SANDBOX/DANGEROUS | mantener en Admin/QA |
| `Preflight proveedor` | ADMIN/QA | mover a Admin/QA |
| `Ultimo resultado tecnico` | QA | mover a Admin/QA |
| `Audit sandbox` | QA | mover a Admin/QA |
| `Estado` tecnico en menu normal | ADMIN/OPERATIVE | mover a Admin/QA o Ayuda avanzada |
| `Paquete contador` en menu normal | ADMIN/ACCOUNTANT | mover a Reportes/Admin segun rol |
| `Facturas del cliente` como boton global en Clientes | mezcla de conceptos | mover a Facturas o Detalle cliente |
| `Resumen cobranza` dentro de Clientes | mezcla de conceptos | mover a Cobranza |
| `Pagadas` y `Canceladas` dentro de Clientes | filtros de cobranza/facturas | mover a Cobranza/Facturas |
| `CLIENTS_MENU` como contenedor unico | duplicado conceptual | reemplazar por Clientes limpio |

No se recomienda eliminar nada en esta fase. Primero mover/ocultar y mantener rutas directas para debug durante una ventana de estabilizacion.

## 13. Provider Source of Truth en navegacion

Politica de verdad:

- Antes de timbrar, el bot puede ser fuente de verdad del borrador.
- Despues de timbrar, Factura.com/PAC debe ser fuente de verdad fiscal.
- El bot conserva snapshot/cache operativo.
- XML/PDF, UUID, cancelacion y acuses deben depender del proveedor/PAC.
- Pagos provider-backed deben reconciliarse por webhook, sync bajo demanda o sync manual futuro.

Diseno recomendado:

```text
Facturas / Documentos
  -> muestran snapshot local
  -> ofrecen "Sincronizar proveedor" cuando aplique

Proveedor
  -> muestra estado de sync, ultima reconciliacion y errores
  -> no reemplaza Factura.com como dashboard pesado

Admin/QA
  -> preflight, smoke, credenciales redacted, workflow status
```

No implementar reconciliacion en este documento. Registrar como siguiente linea de producto:

```text
DEFERRED_PROVIDER_PAYMENT_RECONCILIATION
DEFERRED_PROVIDER_FISCAL_RECONCILIATION
```

## 14. Roadmap por slices

### Slice 1: ocultar Admin/Sandbox/Smoke del menu principal

- Objetivo: sacar QA del flujo diario.
- Archivos probables: workflow principal, tests de product menu.
- Pruebas: product menu, role visibility, repo safety, watcher offline.
- Requiere workflow-sync: si.
- Requiere watcher/manual: si, navegacion basica.
- Riesgos: owner pierde acceso visible si no se documenta `/admin`.
- No-alcance: cambiar acciones sandbox.

### Slice 2: crear menu principal operativo limpio

- Objetivo: introducir `Nueva factura`, `Borradores`, `Clientes`, `Facturas`, `Cobranza`, `Documentos`, `Sincronizar proveedor`, `Ayuda`.
- Archivos probables: workflow, tests UI menu, screen matrix.
- Pruebas: botones, handlers, comandos equivalentes, no botones sin handler.
- Requiere workflow-sync: si.
- Requiere watcher/manual: si.
- Riesgos: rutas futuras deben mostrarse como preparacion segura o no mostrarse.
- No-alcance: implementar modulos completos.

### Slice 3: separar Borradores de Facturas

- Objetivo: `Borradores` administra pendientes/aprobados/descartados; `Facturas` administra timbradas/canceladas/historial reciente.
- Archivos probables: workflow draft list/detail, tests list navigation.
- Pruebas: pending/approved pagination, return_to, state boundaries.
- Requiere workflow-sync: si.
- Requiere watcher/manual: si.
- Riesgos: no perder acceso a download ready.
- No-alcance: historial fiscal masivo.

### Slice 4: reestructurar Clientes

- Objetivo: Clientes = lista, busqueda, detalle, editar fiscal con guard, facturas/cobranza del cliente como rutas claras.
- Archivos probables: workflow clientes, `test-telegram-client-list-navigation.js`.
- Pruebas: `cliente N`, busqueda conversacional, return_to, no `CLI-*` en listas.
- Requiere workflow-sync: si.
- Requiere watcher/manual: si.
- Riesgos: contexto `CLIENTS` no debe contaminar drafts/cobranza.
- No-alcance: pagos.

### Slice 5: reestructurar Cobranza

- Objetivo: Cobranza = `COLLECTION_CLIENTS` -> `COLLECTION_INVOICES` -> confirmacion.
- Archivos probables: workflow collection, ledger, payment tests.
- Pruebas: saldo cero oculto, `facturas N`, `pagar N`, confirm token, duplicate guard.
- Requiere workflow-sync: si.
- Requiere watcher/manual: revision sin confirmar pago real salvo autorizacion.
- Riesgos: mutaciones locales de pago.
- No-alcance: Mercado Pago, PAC payment reconciliation.

### Slice 6: Documentos

- Objetivo: modulo para XML/PDF, download ready, downloaded, envios, errores.
- Archivos probables: workflow delivery/download, watcher/audit.
- Pruebas: `DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON`, confirmacion de descarga, confirmacion de envio, token usado/vencido, duplicate send guard.
- Requiere workflow-sync: si.
- Requiere watcher/manual: si, sin envios reales salvo confirmacion controlada/allowlist.
- Riesgos: reenvio duplicado.
- No-alcance: storage historico masivo.

### Slice 7: Provider Truth & Reconciliation

- Objetivo: separar sync/consulta proveedor de operacion diaria.
- Archivos probables: docs, workflow proveedor, action layer.
- Pruebas: read-only sync, redaction, no secrets.
- Requiere workflow-sync: si si se expone en Telegram.
- Requiere watcher/manual: si.
- Riesgos: credenciales y verdad fiscal.
- No-alcance: cancelacion real.

### Slice 8: Cancelacion + acuse

- Objetivo: flujo seguro para cancelacion y acuse.
- Archivos probables: workflow, action layer PAC, tests de cancelacion.
- Pruebas: confirmacion fuerte, idempotencia, acuse, provider sync.
- Requiere workflow-sync: si.
- Requiere watcher/manual: controlado, no produccion sin autorizacion.
- Riesgos: fiscal alto.
- No-alcance: dashboard PAC completo.

### Slice 9: estilos semanticos de botones

- Objetivo: primary/success/danger como contrato visual degradable.
- Archivos probables: workflow keyboard builders, tests UI.
- Pruebas: textos claros aunque Telegram no preserve color.
- Requiere workflow-sync: si.
- Requiere watcher/manual: visual.
- Riesgos: Telegram no soporta estilos reales de inline buttons.
- No-alcance: redisenar logica.

## 15. Criterios de aceptacion

La UX queda limpia cuando:

- El menu principal no muestra QA, sandbox ni smoke.
- El menu principal permite explicar el bot en una frase: facturar, revisar borradores, clientes, facturas, cobranza y documentos.
- Cliente no mezcla cobranza ni historial sin contexto.
- Cobranza no muestra acciones de pago ambiguas.
- Facturas no se confunden con borradores.
- Documentos no se confunden con pago.
- Admin/QA existe separado, restringido y accesible por `/admin`.
- Cada pantalla tiene `screen_id`, `screen_kind` y `return_to`.
- Cada lista seleccionable tiene `list_context` con `kind`, indices globales, entidad real, chat/user y TTL.
- Cada accion sensible tiene confirmacion, token e idempotencia.
- Las listas son humanas: sin `DRAFT-*`/`CLI-*` largos, sin estados redundantes y con totales claros.
- El usuario puede saber donde esta, que puede hacer y como volver.
- Watcher cubre navegacion, return_to, latencia, duplicados, dispatch, HTML raw y botones por estado.

## 15.1 Nota Slice 9R 2.4I

Se reforzo la recuperacion contextual y la identidad visible:

- UUIDs y provider IDs placeholder ya no se usan como identidad de Facturas/Documentos.
- `UUID-00000000`, UUIDs con primer bloque `00000000`, `NO_APLICA`, `SIN_UUID`, `DUMMY`, `TEST` y valores derivados de `DRAFT-*` caen a fallback seguro.
- Facturas/Documentos usan `FAC-SBX-<id corto>` cuando no hay identidad proveedor real.
- La recuperacion de botones vencidos/invalidos ya no abre Borradores por default; usa el modulo detectado por `source_module`, `screen_id`, `chat_state` o contexto de lista.
- Borradores conserva su recuperacion propia solo cuando el contexto es realmente Draft/Borradores.
- `Factura: Factura` y `Documento: Documento` quedan prohibidos como texto de recuperacion.

Nueva QA runtime observacional requerida: repetir navegacion corta sin smokes, timbrado, descargas reales ni envios reales.

## 15.2 Nota Slice 9R 2.4J

Se reforzo el guard contra acciones documentales cuando el timbrado sandbox falla:

- `SANDBOX_ERROR` ya no muestra `Descargar XML/PDF sandbox`, `Ver estado documental`, envio, pago, cancelacion ni ledger.
- `DRAFT_SANDBOX_STAMP_REQUESTED` muestra solo recuperacion segura mientras no exista resultado final OK.
- El resultado de error de timbrado muestra `No se pudo timbrar sandbox`, `Borrador: BOR-*`, cliente, estado de error y acciones seguras.
- Los labels residuales `Borrador regresado a borrador` y `Volver a aprobadas` fueron reemplazados por `Borrador devuelto a revision` y `Volver a listos para facturar`.
- La auditoria `scripts/audit-provider-invoice-identity-quality.js` clasifica calidad de identidad sin mutar DB ni imprimir datos fiscales.

Resultado local sanitizado del dry-run `--limit 50`: 41 con folio proveedor, 9 con fallback `FAC-SBX-*`, 2 `SANDBOX_ERROR`, 4 `DOWNLOAD_ERROR`, 4 mock/legacy sospechosos y 4 con identidad proveedor incompleta.

Nueva QA runtime observacional requerida: repetir navegacion corta y confirmar que un error de timbrado no deja botones documentales.

## 15.3 Nota Slice 9R 2.4K

Se corrigio el flujo post-timbrado exitoso:

- `SANDBOX_TIMBRADO + DOWNLOAD_READY` ahora muestra `Descargar XML/PDF sandbox` en el resumen final del timbrado.
- El CTA queda tokenizado y abre confirmacion documental; no descarga XML/PDF en el primer toque.
- El payload conserva `draft_id`, `display_id` seguro, `source_module=DOCUMENTS` y `screen_id=POST_STAMP_DOWNLOAD_READY`.
- `SANDBOX_ERROR` sigue sin mostrar acciones documentales.
- `DOWNLOADED` no muestra descarga primaria; muestra Documentos y estado documental.
- `DOWNLOAD_ERROR` muestra ruta humana segura hacia Documentos/Admin QA sin rutas, payloads ni UUID completo.
- El watcher acepta boton tokenizado o texto visible `Descargar XML/PDF` como evidencia valida para `DOWNLOAD_READY`, y no exige descarga en `SANDBOX_ERROR` ni `DOWNLOADED`.

Nueva QA runtime observacional requerida: repetir timbrado sandbox controlado solo cuando se autorice, o navegar resultados existentes sin ejecutar descargas reales.

## 15.4 Nota Slice 9R 2.4L

Se completo la superficie posterior a descarga documental:

- `DOCUMENT_DOWNLOAD_RESULT` exitoso con `DOWNLOADED`, XML y PDF validos ahora muestra `Enviar por correo`, `Enviar a canal`, `Ver estado documental`, `Documentos` y `Menu principal`.
- Los botones de envio preparan entrega y abren confirmacion; no ejecutan envio directo.
- `DOCUMENT_DETAIL` sigue siendo la superficie principal para acciones documentales: descarga si esta listo, envio si XML/PDF ya estan descargados y solo estado si ya fue enviado/protegido.
- El watcher `DOWNLOADED_MISSING_DELIVERY_BUTTON` se limita a `DOCUMENT_DOWNLOAD_RESULT` y `DOCUMENT_DETAIL`; no aplica en listas, recuperaciones, menus ni Cobranza.
- Cobranza queda fuera de alcance funcional en este slice. Hallazgo registrado: `COLLECTION-PAYMENT-CONFIRMATION-001`, donde QA runtime vio confirmacion de pago pero no ejecucion posterior de `MARK_PAYMENT_PAID`.
- Decision de arquitectura: `Marcar pagada` es estado local de cobranza salvo integracion futura explicita; no debe actualizar PAC/proveedor ni emitir complemento de pago de forma silenciosa.

Nueva QA runtime documental requerida: repetir descarga controlada y verificar que el siguiente paso natural sea preparar entrega o revisar estado documental.

## 15.5 Nota Slice 9R 2.4M

Se corrigio la navegacion documental rota detectada por video. La decision de arquitectura queda ajustada: las acciones documentales pertenecen a la factura timbrada, no exclusivamente al modulo `/documentos`.

Superficies validas para iniciar o confirmar capacidades documentales:

- `POST_STAMP_DOWNLOAD_READY`
- `POST_DOWNLOAD_DELIVERY_READY`
- `INVOICE_DETAIL`
- `DOCUMENT_DETAIL`
- `DOCUMENT_DOWNLOAD_CONFIRM`
- `DOCUMENT_DELIVERY_CONFIRM`

Reglas actualizadas:

- `/documentos` es una entrada de consulta y operacion, no el unico origen autorizado.
- `INVOICE_DETAIL` y `DOCUMENT_DETAIL` son superficies operativas: muestran descarga si hay `DOWNLOAD_READY`, envio por correo/canal si XML/PDF estan descargados y solo estado si ya fue enviado/protegido.
- `Enviar a canal` abre confirmacion de canal y confirma con `DELIVERY_CONFIRM_TELEGRAM_CHANNEL`; no debe renderizar copy ni boton de correo.
- `Enviar por correo` abre confirmacion de correo y confirma con `DELIVERY_CONFIRM_PROVIDER_EMAIL`; no debe renderizar copy ni boton de canal.
- La preparacion de entrega renderiza `Confirmar envio...`; `No se pudo enviar` queda reservado para resultado de envio fallido.
- Estados tecnicos como `READY`, `TOKEN_VALID`, `PENDING` o `GUARD_OK` no son motivos humanos visibles.
- Botones basicos (`Documentos`, `Facturas`, `Menu principal`, `Volver a documento`, `Volver a Documentos`, `Ayuda`) usan navegacion estable y no deben nacer vencidos.
- Se retiro el copy obsoleto `No se envian documentos por Telegram en esta fase`.
- Cobranza, pagos, cancelacion, complemento de pago y sincronizacion de pago con PAC/proveedor quedan fuera de alcance funcional.

Watcher/classifier:

- `DOWNLOADED_MISSING_DELIVERY_BUTTON` aplica solo en `DOCUMENT_DOWNLOAD_RESULT`, `DOCUMENT_DETAIL` e `INVOICE_DETAIL`.
- No aplica en listas, menus, recuperaciones, Cobranza, ayuda ni confirmaciones de pago.
- Se agregan detectores para mismatch canal/correo y para preparacion renderizada como error de resultado.

Nueva QA runtime documental requerida: repetir una navegacion corta sin smokes live, sin watcher interactivo durante el fix, sin timbrado nuevo, sin descargas reales y sin envios reales.

## 15.6 Nota Slice 9R 2.4N

Se reparo el ciclo de confirmacion de entrega documental posterior a descarga:

- La preparacion `DELIVERY_PREPARE_PROVIDER_EMAIL` y `DELIVERY_PREPARE_TELEGRAM_CHANNEL` ahora genera tokens de confirmacion con `screen_id=DOCUMENT_DELIVERY_CONFIRM`, `source_capability=DOCUMENT_DELIVERY`, `requested_channel`, `draft_id`, referencia proveedor suficiente, `return_to`, `created_at` y `expires_at`.
- `PREPARE` no consume el token de confirmacion; el token se consume solo al confirmar.
- El guard de confirmacion acepta la capacidad `DOCUMENT_DELIVERY` y la pantalla `DOCUMENT_DELIVERY_CONFIRM`; ya no depende de venir exclusivamente desde `/documentos`.
- `Enviar por correo` confirma con `DELIVERY_CONFIRM_PROVIDER_EMAIL` y `requested_channel=PROVIDER_EMAIL`.
- `Enviar a canal` confirma con `DELIVERY_CONFIRM_TELEGRAM_CHANNEL` y `requested_channel=TELEGRAM_DOCUMENT_CHANNEL`.
- La preparacion sigue siendo una pantalla de confirmacion, no un resultado de error: no debe renderizar `No se pudo enviar`, `Motivo: READY`, `TOKEN_VALID`, `GUARD_OK` ni `PENDING`.
- Las ramas de error/recuperacion documental renderizan saltos reales y no `\n` literal.
- La navegacion basica (`Documentos`, `Facturas`, `Menu principal`, `Volver a documento`, `Volver a Documentos`, `Ver estado documental`) conserva callback estable o token vigente.
- Cobranza funcional queda fuera de alcance y no se modifica.

Watcher/classifier:

- `DELIVERY_CHANNEL_MISMATCH` aplica solo a preparaciones/confirmaciones de entrega, no a pantallas post-descarga o detalle que muestran ambos canales correctamente.
- `DELIVERY_PREPARE_SHOWS_RESULT_ERROR` rompe si una preparacion se renderiza como resultado fallido.
- `DELIVERY_CONFIRM_TOKEN_INVALID_AFTER_PREPARE` rompe si un token de confirmacion recien generado cae en `DOCUMENT_ACTION_BLOCKED` sin estar usado ni expirado.

Siguiente QA runtime requerida: repetir QA runtime documental corta enfocada en post-descarga, confirmacion por correo y confirmacion a canal, sin watcher interactivo durante el fix.

## 15.7 Nota Slice 9R 2.4O

Se corrigio la frontera entre texto libre y recuperacion de callbacks:

- Un evento `MESSAGE` de texto libre tiene precedencia sobre la recuperacion de boton vencido.
- La recuperacion de boton/token vencido queda limitada a eventos `CALLBACK_QUERY`.
- Estados normales de navegacion como `DOCUMENTS_RECENT_LIST`, `DOCUMENT_DETAIL`, `INVOICE_DETAIL`, `COLLECTION_INVOICES`, `DRAFTS_MENU`, `PRODUCT_MENU_MAIN` y `CALLBACK_TOKEN_CONTEXT_RECOVERED` no capturan texto libre.
- Solo estados explicitamente text-input-awaiting pueden capturar `MESSAGE` antes del wizard, por ejemplo busqueda/edicion de cliente, edicion de borrador, aclaracion de lineas, tax mode o wizard activo.
- El caso observado `Privada Bilbao, revise camaras Hikvision por 800 + IVA` debe abrir captura de borrador/factura con `Confirmar`, `Editar`, `Cancelar` y `Ver detalle`; no debe responder con copy de boton vencido ni `Pantalla anterior: Documentos`.
- Se mantiene el manejo de comandos contextuales (`ver N`, `descargar N`, `enviar N`, `correo N`, `canal N`, `pagar N`) antes del texto libre. Se agrego alias `pagarN` hacia la misma confirmacion local existente, sin mutar cobranza en este slice.
- Cobranza funcional, PAC, XML/PDF reales, envios reales, pagos reales, cancelacion, `.env`, schema y datos quedan fuera de alcance.

Watcher/classifier:

- `FREE_TEXT_HIJACKED_BY_CALLBACK_RECOVERY` rompe si un `MESSAGE` libre cae en recuperacion de callback.
- `BUTTON_RECOVERY_COPY_ON_MESSAGE` rompe si un `MESSAGE` libre renderiza copy como `El boton de...`, `boton ya no corresponde` o `accion vigente`.
- Estos detectores no aplican a callbacks invalidos reales.

Siguiente QA runtime requerida: repetir una QA corta con texto libre desde Documentos, texto libre desde Facturas, callback viejo real y flujo documental de confirmacion.

## 15.8 Nota Slice 9R 2.4P

Se estabilizo la navegacion normal del contenedor `/documentos`:

- La navegacion documental usa callbacks estables `cfdi_doc:*`.
- Tokens efimeros `cfdi:<token>` quedan reservados para acciones sensibles o confirmables: confirmar descarga, confirmar envio por correo, confirmar envio a canal y confirmaciones mutantes.
- `Ver N`, filtros (`Recientes`, `Pendientes/listos`, `Descargados`, `Enviados`, `Errores`) y paginacion (`Mas documentos`) ya no dependen de `action_tokens`.
- `/documentos` debe ser operable sin caer en `CALLBACK_TOKEN_INVALID` ni `CALLBACK_TOKEN_CONTEXT_RECOVERED` para botones recien emitidos.
- `DOCUMENT_DETAIL` usa callbacks estables para volver, ver estado documental y preparar descarga/envio; los botones finales de confirmacion siguen tokenizados.
- `Ver N` resuelve contra `chat_state.context.list_context` y abre `DOCUMENT_DETAIL`; si la lista ya no existe, muestra una recuperacion humana para abrir Documentos.
- Los filtros y la paginacion crean una lista nueva y guardan un `list_context` nuevo.
- Cobranza queda fuera de alcance funcional; no se modifican pagos ni confirmaciones de pago.

Watcher/classifier:

- `DOC_NAV_CALLBACK_INVALID` rompe si navegacion documental vigente cae en recuperacion de token.
- `DOCUMENT_NAV_USES_EPHEMERAL_TOKEN` rompe si botones normales de navegacion documental usan `cfdi:<token>`.
- No se marca este bug para tokens sensibles de confirmacion vencidos/usados.

Siguiente QA runtime requerida: repetir QA runtime de Documentos sin tocar flujos nuevos, enfocada en lista, filtros, paginacion, `Ver N` y callback viejo real.

## 15.9 Nota Slice 9R 2.4Q

Se normalizo `Estado documental` como superficie accionable del documento actual:

- `Ver estado documental` abre `DOCUMENT_STATUS_DETAIL` o refresca detalle accionable del mismo documento; no debe volver automaticamente a listas ni ejecutar `DOCUMENT_LIST_ITEM_CHANGED`.
- La pantalla conserva identidad operativa (`draft_id` interno en contexto, folio visible seguro, UUID/PAC corto si aplica), cliente, estado fiscal, estado XML/PDF, estado de envio y pago local solo como lectura.
- `DOWNLOAD_READY` muestra descarga y ultimo resultado sandbox; no muestra envio.
- `DOWNLOADED` con envio pendiente muestra `Enviar por correo`, `Enviar a canal` y actualizar estado; no duplica descarga primaria.
- `SENT/PROTECTED` muestra estado y navegacion; no implementa reenvio en este slice.
- `DOWNLOAD_ERROR` muestra error humano seguro y reintento de descarga via confirmacion; no muestra envio listo.
- `SANDBOX_ERROR` muestra que no hay documento fiscal valido y oculta descarga, envio, cancelacion, eliminacion, cobranza y ledger.
- `Ver estado documental` desde `INVOICE_DETAIL`, `DOCUMENT_DETAIL`, post-descarga y confirmaciones mantiene el documento actual en `selected_document`.
- `TELEGRAM_EDIT_MESSAGE_TEXT_FAILED` puede clasificarse como warning recuperado si existe fallback visible correcto; si no hay pantalla util, sigue siendo fallo.
- Cobranza funcional, PAC real, XML/PDF reales, envios reales, pagos, cancelacion, eliminacion, `.env`, schema y datos quedan fuera de alcance.

Watcher/classifier:

- `DOCUMENT_STATUS_RETURNS_TO_LIST` rompe si el estado documental vuelve a una lista o a `DOCUMENT_LIST_ITEM_CHANGED`.
- `DOCUMENT_STATUS_LOST_CURRENT_ITEM` rompe si la accion pierde/cambia el `draft_id` actual.
- `DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS` rompe si las acciones no corresponden al estado documental.
- `TELEGRAM_EDIT_MESSAGE_TEXT_FAILED_RECOVERED` registra recuperacion cuando el fallback visible fue correcto.

Siguiente QA runtime requerida: repetir QA runtime de Documentos enfocada en `Ver estado documental`.

## 15.10 Nota Slice 9R 2.4R

Se amplio la superficie documental para facturas ya enviadas. Esta nota supersede la limitacion del Slice 2.4Q donde `SENT/PROTECTED` solo mostraba estado y navegacion:

- Una factura timbrada ya enviada puede reenviarse de forma explicita, siempre con confirmacion.
- `SENT/PROTECTED` ya no oculta acciones documentales; convierte `Enviar por correo` y `Enviar a canal` en `Reenviar por correo` y `Reenviar a canal`.
- El reenvio no es automatico: requiere que el usuario toque `Reenviar...`, vea una pantalla de confirmacion de reenvio y confirme con token vigente.
- Toda factura timbrada conserva acceso documental. Si XML/PDF ya estan descargados, la UX muestra `Descargar XML/PDF` como acceso seguro a artefactos, sin imprimir rutas locales.
- Si `DOWNLOAD_READY`, se muestra `Descargar XML/PDF sandbox`; si `DOWNLOAD_ERROR`, se muestra `Reintentar descarga XML/PDF sandbox` via confirmacion; si `SANDBOX_ERROR`, no se muestra descarga, envio ni reenvio.
- `Facturas` y `Documentos` son entradas distintas a la misma superficie operativa de la factura timbrada: `INVOICE_DETAIL`, `DOCUMENT_DETAIL` y `DOCUMENT_STATUS_DETAIL` respetan las mismas reglas de acceso, envio y reenvio.
- Se agrego `Historial de envios` como consulta sanitizada basada en el ledger existente, sin cambiar schema ni exponer emails completos, UUID completo, rutas, payloads o IDs tecnicos.
- La deteccion de archivos locales faltantes queda como deuda si no hay comprobacion segura disponible; por ahora la accion `Descargar XML/PDF` se basa en estado documental registrado.
- Cobranza queda fuera de alcance funcional. No se toca pago local, proveedor/PAC, complemento de pago, cancelacion, eliminacion, `.env`, schema ni datos.

Watcher/classifier:

- `SENT_DOCUMENT_HIDES_RESEND` rompe si una factura descargada y enviada/protegida no muestra reenvio explicito en detalle/status/factura.
- `DOWNLOADED_DOCUMENT_MISSING_ARTIFACT_ACCESS` rompe si una factura con artefactos descargados no ofrece acceso a XML/PDF.
- `RESEND_PREPARE_SHOWS_SEND_ERROR` rompe si una preparacion de reenvio se renderiza como error o muestra estados tecnicos.
- `RESEND_CHANNEL_MISMATCH` rompe si reenvio a canal/correo cruza el destino en la confirmacion.
- Estos detectores no aplican a listas generales que solo muestran `Ver N`.

Siguiente QA runtime requerida: repetir QA runtime de Facturas/Documentos enfocada en reenviar y acceso XML/PDF.

## 16. Riesgos

| Riesgo | Severidad | Mitigacion |
| --- | --- | --- |
| Ocultar admin sin ruta alternativa clara | HIGH | documentar `/admin`, mantener owner-only |
| Crear botones futuros sin handler | HIGH | no mostrar futuros o usar pantalla `PRODUCT_PENDING` explicita |
| Romper rutas de drafts ya estabilizadas | HIGH | tests de list navigation y watcher real |
| Confundir facturas timbradas con borradores aprobados | HIGH | separar Borradores vs Facturas |
| Acciones de pago fuera de contexto | BLOCKER | mantener `pagar N` solo en `COLLECTION_INVOICES` |
| Reenvio documental duplicado | HIGH | confirmacion y duplicate guard |
| Exponer datos tecnicos en listas | MEDIUM | contrato de presentacion y tests |
| Volver a mezclar sandbox con UX diaria | MEDIUM | Admin/QA separado |
| Provider sync mal entendido como verdad local | MEDIUM | copy claro: snapshot local vs PAC |
| Runtime drift n8n/repo | HIGH | runbook y workflow-sync-check antes de validar |

## 17. Veredicto final

Private SatBot debe pausar la expansion funcional y ejecutar un reset de navegacion. La base tecnica reciente es aprovechable: hay `screen_id`, contextos de listas, return_to, presentacion humana, watcher, clientes por indice y cobranza accionable. El siguiente paso no es agregar mas botones; es reducir y ordenar la superficie.

Decision recomendada:

1. Mover Admin/Sandbox/Smoke fuera del menu operativo.
2. Crear menu principal operativo limpio.
3. Separar Borradores, Facturas, Cobranza y Documentos como modulos visibles.
4. Mantener todas las acciones peligrosas detras de contexto concreto, confirmacion e idempotencia.
5. Dejar Factura.com/PAC como fuente de verdad fiscal despues de timbrar y no intentar convertir Telegram en dashboard historico completo.

No se recomienda eliminar rutas tecnicas todavia. Primero hay que ocultarlas, restringirlas y cubrirlas con tests/watcher. Luego, cuando las rutas nuevas pasen gates, se podran deprecar duplicados.
