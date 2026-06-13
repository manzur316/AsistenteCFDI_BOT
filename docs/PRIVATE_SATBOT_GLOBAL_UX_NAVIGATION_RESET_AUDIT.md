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

Nota Slice 9R 2.2: Facturas ya tiene una superficie operativa inicial separada. `/facturas` abre `INVOICES_RECENT_LIST` y `facturas N` desde Clientes abre `CLIENT_INVOICES_LIST`; ambas usan folio proveedor como identidad principal con fallback seguro y no heredan botones de edicion fiscal, cobranza ni pago. Documentos sigue pendiente como modulo propio.

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
| Documentos | XML/PDF, estado documental y envios | `DOCUMENTS_MENU` | `/documentos`, `descargar N`, `enviar N` | factura/draft concreta | futuro/parcial |
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
- Pruebas: `DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON`, delivery buttons, duplicate send guard.
- Requiere workflow-sync: si.
- Requiere watcher/manual: si, sin envios reales salvo dry-run/allowlist.
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
