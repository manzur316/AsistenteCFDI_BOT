# Roadmap PAC Adapter Hub, Storage, Reporting y Declaraciones

## Posicionamiento

AsistenteCFDI_BOT se reposiciona como:

```text
Asistente CFDI privado para tecnicos, RESICO y pymes, con organizacion contable,
reportes mensuales y preparacion para contador.
```

El sistema no debe casarse con un solo PAC. Factura.com sera el primer adapter
sandbox, pero el nucleo debe permitir cambiar o agregar PACs sin reescribir la
logica fiscal, conversacional, de almacenamiento o de reportes.

Regla central:

```text
La constancia fiscal manda. El catalogo SAT valida. La Guia de llenado CFDI 4.0
define reglas CFDI. El bot solo sugiere y organiza BORRADORES SUJETOS A
REVISION HUMANA.
```

Advertencia obligatoria en cualquier salida fiscal:

```text
Borrador sujeto a revisión humana
```

## Alcance Negativo

Este roadmap no implementa PAC, timbrado, XML/PDF real, cancelacion real ni
llamadas a proveedores. Tampoco modifica workflows productivos, credenciales,
clientes reales, `data/concepts.normalized.json` ni fuentes SAT locales.

Queda prohibido para esta etapa:

- Llamar Factura.com, Facturama, Facturapi, SW, Finkok u otro PAC.
- Timbrar CFDI reales.
- Generar folios fiscales reales.
- Generar XML/PDF fiscales reales.
- Subir tokens, passwords, llaves, certificados o clientes reales.
- Usar shadow logging como decision productiva.
- Activar conceptos nuevos sin revision humana.

## Arquitectura Textual

```text
Telegram / Web Hub / Miniapp
        |
        v
Conversation + Draft State
        |
        v
Fiscal Guardrails + Scoring CFDI
        |
        v
Internal CFDI Draft Contract
        |
        +---------------------------+
        |                           |
        v                           v
Storage Engine              PAC Adapter Hub
        |                           |
        |                           +--> FacturaComSandboxAdapter
        |                           +--> FacturamaAdapter futuro
        |                           +--> FacturapiAdapter futuro
        |                           +--> SWAdapter futuro
        |                           +--> FinkokAdapter futuro
        |
        v
Reporting Engine
        |
        v
Monthly Declaration Assistant
        |
        v
Paquete mensual para contador
```

El contrato interno separa claramente el borrador fiscal del proveedor PAC. El
Storage Engine conserva payloads, respuestas sandbox, archivos y metadatos por
proveedor. El Reporting Engine y el asistente mensual leen desde almacenamiento
normalizado, no desde APIs especificas de PAC.

## PAC Adapter Hub

El PAC Adapter Hub debe exponer un contrato interno unico. Los workflows y la
UI no deben conocer detalles de Factura.com ni de ningun proveedor especifico.

Contrato propuesto:

- `createDraftPayload(draft, context)`
- `validatePayload(payload, context)`
- `stampSandbox(payload, context)`
- `stampProduction(payload, context)` futuro
- `cancelInvoice(invoiceRef, context)` futuro
- `downloadXml(invoiceRef, context)`
- `downloadPdf(invoiceRef, context)`
- `getStatus(invoiceRef, context)`

Primer adapter:

- `FacturaComSandboxAdapter`

Adapters futuros:

- `FacturamaAdapter`
- `FacturapiAdapter`
- `SWAdapter`
- `FinkokAdapter`

Reglas de diseno:

- Cada adapter traduce el contrato interno al formato del PAC.
- Cada adapter normaliza errores a un formato comun.
- Ningun adapter debe modificar decisiones fiscales del motor.
- El adapter solo opera con payloads ya revisados por guardrails.
- Produccion queda bloqueada hasta aprobacion humana y fase explicita.

## Factura.com Sandbox

Factura.com sera solamente el primer sandbox adapter.

Objetivos permitidos en sandbox:

- Validar payload CFDI 4.0.
- Observar errores de estructura, catalogos, impuestos y receptor.
- Obtener XML/PDF sandbox si el proveedor lo permite.
- Probar cancelacion sandbox si aplica.
- Guardar evidencia tecnica para mejorar validaciones locales.
- Ejecutar preflight de autenticacion antes de crear clientes o CFDI.

Fuera de alcance:

- Timbrado fiscal real.
- Folios fiscales reales.
- Produccion.
- Automatizar decisiones fiscales por respuesta del PAC.

Regla 6A.7G: cualquier adapter sandbox con credenciales debe validar primero el
ambiente proveedor. Para Factura.com, el preflight usa
`GET /v1/clients?per_page=1` contra `https://sandbox.factura.com/api`. Si devuelve
`AUTH_ACCOUNT_NOT_FOUND`, `AUTH_INVALID_KEYS`, `AUTH_ENVIRONMENT_MISMATCH`,
`AUTH_PLAN_REQUIRED`, `AUTH_IP_BLOCKED`, `AUTH_UNKNOWN_API_ERROR` o
`AUTH_HTTP_ERROR`, el flujo no debe crear cliente, buscar cliente ni crear CFDI.
El mensaje `La cuenta que intenta autenticarse no existe` es un problema de
auth/cuenta/ambiente proveedor, no un error del contrato canonico CFDI.

Regla 6A.7J: antes de cualquier intento sandbox de CFDI, el adapter debe validar
localmente el receptor final. La creacion de cliente usa RFC normalizado y corta
sin llamar al PAC si la forma es invalida. El request final CFDI debe incluir un
reporte local `receptor_compatibility=PASS|FAIL`; si el analyzer detecta un
`CFDI_CREATE_REQUEST` sin ese reporte, se considera bug de integracion
(`RECEPTOR_GUARD_NOT_EVALUATED_BUG`). Esta regla aplica al Hub neutral de PAC,
no solo a Factura.com.

## Storage Engine

El Storage Engine debe organizar documentos y metadatos por una ruta logica
estable, independiente del proveedor PAC.

Dimensiones de organizacion:

- Emisor.
- Cliente.
- Ano.
- Mes.
- Estatus.
- XML.
- PDF.
- JSON payload.
- Draft original.
- PAC provider.
- UUID sandbox o produccion cuando exista.
- Identidad separada: `client_uid` del receptor, `cfdi_uid` del CFDI,
  `uuid`, `pac_invoice_id`, `internal_invoice_id` y `draft_id`.

Estructura conceptual:

```text
storage/
  <emisor_id>/
    <cliente_id>/
      <yyyy>/
        <mm>/
          pendientes/
          sandbox/
          emitidas/
          canceladas/
          payloads/
          drafts/
          xml/
          pdf/
          logs/
```

Los nombres fisicos no deben incluir RFC, razon social completa ni datos
sensibles si el repositorio o backups no estan cifrados. Los identificadores
internos deben mapearse desde PostgreSQL.

Metadatos minimos por documento:

- `draft_id`
- `invoice_id` interno
- `pac_provider`
- `pac_environment`: `SANDBOX` o `PRODUCTION`
- `uuid`
- `client_uid`
- `cfdi_uid`
- `pac_invoice_id`
- `internal_invoice_id`
- `draft_id`
- `identity_status`
- `identity_collisions`
- `status`
- `client_id`
- `emitter_id`
- `created_at`
- `updated_at`
- `source_message_id`
- `requires_human_review`

### Sandbox Storage Engine 6A.7

Los smoke live sandbox de Factura.com ya validaron creacion, descarga XML/PDF,
cancelacion sandbox y batch de 5 CFDI sin findings sensibles. La fase 6A.7
agrega un Storage Engine local que solo copia artifacts ya existentes desde:

```text
runtime/facturacom-sandbox/
```

hacia:

```text
runtime/storage-sandbox/
  emitters/EMITTER-DEMO/<yyyy>/<mm>/clients/<client_id>/invoices/<cfdi_uid_o_id>/
    manifest.json
    canonical-summary.json
    request/
    response/
    xml/
    pdf/
    cancel/
  reports/storage-index.json
  reports/storage-summary.json
```

Reglas especificas sandbox:

- No llama Factura.com.
- No crea XML/PDF nuevo.
- No toca workflows productivos.
- No versiona runtime.
- `client_uid` es solo UID del receptor y nunca debe usarse como `invoice_id`.
- `cfdi_uid` es la identidad principal del CFDI/proveedor en sandbox.
- `uuid` es nullable.
- Si hay `cfdi_uid` sin `uuid`, la identidad queda `PARTIAL_PROVIDER_UID`.
- Si falta `cfdi_uid`, Storage puede usar `uuid`, `pac_invoice_id`,
  `internal_invoice_id` o `draft_id + attempt index`, pero marca
  `PARTIAL_INTERNAL_ID` o `MISSING`.
- Si create devuelve `CREATE_API_ERROR` o `CREATE_HTTP_ERROR`, Storage guarda
  evidencia tecnica con status `ERROR` e `identity_status=MISSING`; no debe
  presentarlo como CFDI creado aunque exista `internal_invoice_id`.
- Si dos drafts chocan en el mismo invoice id, Storage agrega sufijo
  `__<draft_id>` y reporta `identity_collisions`/`duplicate_invoice_ids`.
- Todo documento conserva `BORRADOR SUJETO A REVISION HUMANA`.

### Factura.com Identity Discovery 6A.7C

El fix de 6A.7B separo correctamente `client_uid` de `cfdi_uid`. El estado real
observado despues de esa separacion puede quedar con create OK pero sin
identidad CFDI clara. En ese caso:

- `client_uid` nunca vuelve a ser invoice id.
- `successful` no aumenta sin `cfdi_uid`, `uuid` o `pac_invoice_id`.
- Storage puede guardar evidencia con `PARTIAL_INTERNAL_ID`, pero Reporting no
  debe avanzar como si fueran CFDI identificados.
- El inspector local `scripts/inspect-facturacom-sandbox-response-shape.js`
  permite revisar shapes sin exponer valores completos.
- El fallback post-create por busqueda queda apagado hasta que exista endpoint
  oficial documentado por serie/folio/receptor/fecha/total/comentarios con
  criterios estrictos.

### Factura.com API Error Normalization 6A.7D

Factura.com puede devolver HTTP 200 con error de negocio dentro del JSON. El
cliente live normaliza esas respuestas con `http_ok`, `api_ok`, `api_status`,
`api_status_unknown`, `api_message_summary` y `api_error_fields`. La decision
operativa usa `ok = http_ok && api_ok !== false`.

Estados nuevos:

- `CREATE_API_ERROR`: HTTP OK, pero `response/status=error`.
- `CREATE_HTTP_ERROR`: HTTP no OK.

El analyzer reporta `api_errors`, `http_errors`, `create_api_errors`,
`create_http_errors`, `api_error_messages_detected`, `business_successful` e
`identity_missing_after_api_success`. Reporting debe usar estos campos para no
confundir error de negocio con CFDI creado sin identidad.

### Factura.com Auth Preflight 6A.7G

Antes de `CLIENT_CREATE`, `CLIENT_LOOKUP` o `CFDI_CREATE`, el smoke ejecuta
`scripts/preflight-facturacom-auth.js` o la misma rutina interna. El resultado se
guarda como `PREFLIGHT_AUTH_RESPONSE` sanitizado y el analyzer reporta
`provider_auth_status`. Solo `AUTH_OK` permite continuar. Las credenciales deben
ser del ambiente correcto: sandbox keys contra `https://sandbox.factura.com/api`;
production keys quedan fuera de alcance y produccion sigue bloqueada. `F-PLUGIN`
se mantiene como identificador requerido de la cuenta.

### UsoCFDI/Receptor Compatibility Guard 6A.7I

Antes de cualquier `stampSandbox`, el Adapter Hub debe ejecutar validaciones
locales CFDI 4.0 de receptor. Para Factura.com sandbox esto ya se modela como:

- normalizar y validar forma de RFC receptor sin exponer el RFC completo;
- inferir `PF`, `PM`, `GENERIC_NATIONAL` o `GENERIC_FOREIGN`;
- validar `UsoCFDI` contra tipo de persona y `RegimenFiscalR` usando
  `c_UsoCFDI` derivado del catalogo SAT;
- cortar como `CFDI_LOCAL_RULE_ERROR` si aparece una combinacion equivalente a
  CFDI40161;
- no mandar placeholders, RFC mal formado ni combinaciones SAT invalidas al PAC.

Esta regla pertenece al contrato neutral del Hub, no al proveedor. Factura.com
solo es el primer adapter sandbox que la consume.

### Sandbox Fiscal Profiles 6A.7K

El receptor de pruebas sandbox debe salir de perfiles fiscales explicitos, no
de combinaciones improvisadas por variables de entorno. La fuente local es
`data/sandbox/facturacom-sandbox-fiscal-profiles.json`.

Reglas del Hub:

- El perfil fiscal sandbox manda sobre fixtures parciales y variables globales.
- Antes de crear cliente y antes de CFDI se valida RFC, tipo de persona,
  `RegimenFiscalR` y `UsoCFDI`.
- `XAXX010101000` pertenece a publico general y no debe usarse con `612/G03`.
- Un perfil inconsistente corta localmente como
  `LOCAL_INVALID_SANDBOX_FISCAL_PROFILE` y no llama al PAC.
- Los perfiles sandbox no representan clientes reales ni datos productivos.

Esto prepara el mismo patron para futuros adapters: cada proveedor puede tener
clientes sandbox distintos, pero el contrato neutral conserva receptor,
regimen, uso y validaciones SAT antes de cualquier `stampSandbox`.

### Sandbox Emitter Profiles 6A.7L

El Hub tambien debe separar perfil receptor y perfil emisor. Para sandbox:

- El receptor valida `RegimenFiscalR`, `UsoCFDI`, RFC shape y UID.
- El emisor valida `RegimenFiscal`, `LugarExpedicion`, RFC/CSD esperado y serie.
- El perfil `EMITTER_XAMA_612_DEMO` solo aplica a smoke sandbox.
- El perfil `EMITTER_RESICO_626_REAL_BLOCKED_FOR_SANDBOX` bloquea cualquier
  mezcla del RESICO 626 real del usuario con CSD sandbox.
- Un error PAC 303 se clasifica como `EMITTER_CSD_RFC_MISMATCH`, no como
  problema de concepto ni de receptor.

La serie queda fuera del repositorio y debe confirmarse en el panel del PAC.
No se versionan CSD, `.key`, `.cer`, passwords ni credenciales.

### Sandbox Analyzer Hygiene 6A.7N

El analyzer sandbox debe distinguir transporte/API/business success de errores.
Mensajes de exito del proveedor, por ejemplo `Factura creada y enviada
satisfactoriamente`, no son errores y deben mostrarse como mensajes de exito
cuando `successful=1`, `business_successful=1` y `api_errors=0`.

La validacion fiscal de RFC se ejecuta antes de sanitizar artifacts. Los
inspectores de runtime trabajan sobre datos redactados, por lo que
`[REDACTED_RFC]` no debe evaluarse como RFC real ni reportarse como `INVALID`;
debe marcarse `REDACTED_NOT_EVALUATED`. Esta regla evita falsos positivos en
observabilidad sin relajar ningun guard fiscal previo al PAC.

### Sandbox Cancel + Storage Verification 6A.7O

La fase 6A.7O verifica el ciclo operativo completo en sandbox sin abrir
produccion: create, descarga XML/PDF, cancelacion sandbox, analisis, storage y
analisis de storage. La verificacion mantiene dos smoke runs separados para no
mezclar download y cancelacion en el mismo intento:

- Smoke de descarga con `FACTURACOM_SANDBOX_DOWNLOAD_TEST=1`,
  `FACTURACOM_SANDBOX_CANCEL_TEST=0` y batch 1.
- Smoke de cancelacion con `FACTURACOM_SANDBOX_DOWNLOAD_TEST=0`,
  `FACTURACOM_SANDBOX_CANCEL_TEST=1` y batch 1.

Criterios de salida:

- `successful=1`, `errors=0` y `business_successful=1` en ambos caminos.
- XML y PDF descargados en el camino de descarga.
- `Cancelaciones OK=1` y `Cancelaciones error=0` en el camino de cancelacion.
- UID/UUID presentes e identidad completa en analyzer/storage cuando existan.
- Storage bajo `runtime/storage-sandbox/` con status `CREATED` y `CANCELLED`,
  XML/PDF checksums, `cancel_status` y respuesta de cancelacion.
- `Sensitive findings=none`.
- Ningun runtime, XML/PDF, CSD, `.env`, credencial ni cliente real se versiona.

### Sandbox Action Layer 6A.9

La fase 6A.9 agrega una capa local de acciones sandbox para que n8n, Telegram o
una miniapp futura invoquen capacidades por nombre estable sin conocer el motor
fiscal, el PAC adapter, storage ni reporting.

Entrypoint:

```powershell
node scripts/run-sandbox-action.js <action>
node scripts/analyze-sandbox-action-result.js
```

Contrato de salida:

- JSON estable con `schema_version=sandbox_action_result.v1`.
- `status`: `OK`, `ERROR`, `SKIPPED`, `NEEDS_RUNTIME` o `NEEDS_CONFIG`.
- `artifacts`, `warnings`, `errors` y `sensitive_findings` siempre presentes.
- Resultados bajo `runtime/action-results-sandbox/`.
- Sin credenciales, XML/PDF embebido, CSD, `.env` ni rutas fuera de runtime.

Acciones:

- `sandbox.preflight`
- `sandbox.smoke.create`
- `sandbox.smoke.download`
- `sandbox.smoke.cancel`
- `sandbox.storage.refresh`
- `sandbox.report.generate`
- `sandbox.package.generate`
- `sandbox.excel.generate`
- `sandbox.checklist.generate`
- `sandbox.full.monthly.package`

Reglas de seguridad:

- Las acciones `report`, `package`, `excel`, `checklist` y
  `full.monthly.package` no llaman PAC.
- Las acciones smoke solo llaman sandbox si `FACTURACOM_SANDBOX_LIVE=1`.
- Cualquier intento de usar `https://api.factura.com` queda bloqueado.
- Produccion, PAC real, XML/PDF fiscal real y timbrado siguen fuera de alcance.

Orden de `sandbox.full.monthly.package`:

1. Refrescar storage si hay runtime smoke valido.
2. Generar reporting.
3. Generar paquete contador.
4. Generar Excel.
5. Generar checklist.
6. Regenerar paquete para incluir Excel/checklist.
7. Analizar paquete.

### n8n Sandbox Action Router 6A.10

La fase 6A.10 conecta n8n con la Action Layer sin duplicar logica fiscal dentro
del workflow.

Workflow:

```text
workflow/cfdi_sandbox_action_router.n8n.json
```

Runbook:

```text
workflow/CFDI_SANDBOX_ACTION_ROUTER_SETUP.md
```

Responsabilidades de n8n:

- Recibir un mensaje por Webhook local de prueba.
- Extraer `chat_id`, `user_id` y `text`.
- Validar `chat_id` contra `CFDI_ALLOWED_TELEGRAM_CHAT_ID`.
- Convertir comandos sandbox a acciones por allowlist.
- Ejecutar `node scripts/run-sandbox-action.js <action>`.
- Leer `runtime/action-results-sandbox/latest.json`.
- Responder un resumen seguro por webhook y, si hay token local, por Telegram.

Responsabilidades que n8n no tiene:

- No decide conceptos fiscales.
- No conoce contratos internos CFDI.
- No conoce headers ni endpoints Factura.com.
- No muta catalogos ni storage directamente.
- No envia XML/PDF, ZIP ni Excel por Telegram.
- No permite comandos de shell libres.

Comandos del router:

- `/sandbox_menu` -> muestra menu de botones
- `/sandbox_preflight` -> `sandbox.preflight`
- `/sandbox_report` -> `sandbox.report.generate`
- `/sandbox_package` -> `sandbox.package.generate`
- `/sandbox_excel` -> `sandbox.excel.generate`
- `/sandbox_checklist` -> `sandbox.checklist.generate`
- `/sandbox_full_package` -> `sandbox.full.monthly.package`
- `/sandbox_smoke_create` -> `sandbox.smoke.create`
- `/sandbox_smoke_download` -> `sandbox.smoke.download`
- `/sandbox_smoke_cancel` -> `sandbox.smoke.cancel`

### Telegram Sandbox UI Buttons 6A.11

La fase 6A.11 agrega `inline_keyboard` para operar el router sandbox desde
Telegram sin abrir comandos libres ni exponer datos fiscales en callbacks.

Documento:

```text
workflow/CFDI_SANDBOX_TELEGRAM_BUTTONS.md
```

Botones del menu principal:

- Resumen mensual sandbox -> `cfdi_sbx:report`
- Generar paquete contador -> `cfdi_sbx:package`
- Generar Excel -> `cfdi_sbx:excel`
- Generar checklist -> `cfdi_sbx:checklist`
- Paquete completo -> `cfdi_sbx:full`
- Smoke sandbox -> `cfdi_sbx:smoke_menu`
- Estado / preflight -> `cfdi_sbx:preflight`
- Cancelar -> `cfdi_sbx:cancel`

Submenu smoke:

- Crear CFDI sandbox -> `cfdi_sbx:smoke_create`
- Crear + XML/PDF -> `cfdi_sbx:smoke_download`
- Crear + cancelar -> `cfdi_sbx:smoke_cancel`
- Volver -> `cfdi_sbx:menu`

Reglas:

- `callback_data` mide menos de 32 caracteres y solo contiene tokens
  `cfdi_sbx:*` de allowlist.
- No contiene RFC, UUID, UID, montos, rutas, XML/PDF, ZIP, Excel, credenciales,
  headers ni secretos.
- No envia documentos por Telegram; solo resumen seguro y botones siguientes.
- Smoke sigue siendo sandbox y requiere opt-in local.

### Manual E2E Sandbox Telegram/n8n Test Plan 6A.12

La fase 6A.12 documenta la prueba manual completa entre Telegram, n8n y Action
Layer sandbox. No cambia logica fiscal, no agrega PAC productivo y no envia
archivos por Telegram.

Documento:

```text
workflow/CFDI_SANDBOX_E2E_TEST_PLAN.md
```

Verificacion local:

```text
scripts/test-sandbox-e2e-readiness.js
```

Orden recomendado:

1. Validar readiness.
2. Importar y activar el workflow local.
3. Probar `/sandbox_menu` con webhook local.
4. Probar `cfdi_sbx:full` y confirmar `latest.json`.
5. Probar `cfdi_sbx:report`, `cfdi_sbx:smoke_menu`, callback desconocido y
   chat no autorizado.
6. Probar Telegram real solo con chat allowlisted.
7. Confirmar que no se envio XML/PDF/ZIP/Excel por Telegram.
8. Confirmar `sensitive_findings=none` o alerta resumida sin datos sensibles.

Criterio para cerrar 6A: pruebas offline PASS, smoke local OK y checklist E2E
manual sin credenciales, produccion, CSD, runtime versionado ni datos reales.

### Sandbox Package Safety + Webhook Response 6A.11B

La fase 6A.11B corrige dos riesgos del E2E local sin tocar produccion ni
workflows productivos:

- El paquete mensual ya no escanea `.xlsx` como texto plano. El analizador abre
  el workbook OOXML, revisa strings visibles y reporta `absolute_path_findings`
  con workbook, entry y celda aproximada cuando aplica.
- Un bloqueo real de paquete, ruta absoluta o finding sensible se clasifica como
  `PACKAGE_SAFETY_ERROR`, con `needs_runtime=false` y `safety_blocked=true`.
- El router sandbox de n8n debe devolver body JSON no vacio en el path de accion:
  `ok`, `status`, `action`, `message`, `warnings` y `errors`.

El hotfix mantiene la restriccion de no versionar `runtime/`, Excel, ZIP,
XML/PDF, CSD, `.env`, credenciales ni datos reales. Tampoco envia archivos por
Telegram.

La fase 6A.11C separa la ejecucion local del Action Layer de la respuesta HTTP
del webhook. `latest.json` con `status=OK` confirma ejecucion; el webhook solo
queda aprobado si PowerShell muestra `StatusCode=200`, `RawContentLength > 0` y
`Content` parseable como JSON. El workflow prepara un item final minimo y
`Respond to Webhook` responde ese primer item, evitando defaults o expresiones
que puedan producir body vacio en n8n. Despues de `git pull`, el JSON debe
reimportarse en n8n porque los workflows importados no se actualizan solos.

### Sandbox Reporting Engine 6A.8

La fase 6A.8 agrega reportes mensuales locales a partir de
`runtime/storage-sandbox/`. No llama PAC, no timbra, no cancela, no descarga
archivos y no toca workflows productivos.

Salidas:

- `monthly-summary.json/csv`: conteo mensual general, status, XML/PDF,
  identidad y totales sandbox.
- `client-summary.json/csv`: agregados por cliente.
- `document-control.json/csv`: sin XML, sin PDF, sin UUID, cancelados,
  `identity_status=MISSING`, errores y sensitive findings.
- `accountant-review.json`: paquete JSON consolidado para revision humana.

Reglas fiscales de reporte:

- Todos los reportes dicen `Borrador sujeto a revisión humana. No sustituye contador.`
- Los cancelados no se suman como ingresos vigentes; se reportan en campos
  separados como `cancelled_total`.
- Si no hay monto extraible desde manifest, metadata sanitizada o XML local, se
  marca `amount_status=UNKNOWN`.
- IVA trasladado es solo suma informativa de CFDI `CREATED` con importe
  extraible; no calcula ISR definitivo ni presenta declaracion.
- Futuro: empaquetar ZIP/Excel mensual para contador sin mezclar sandbox con
  produccion.

### Accountant Package Sandbox 6A.8B

La fase 6A.8B crea un paquete mensual sandbox para revision del contador a
partir de `runtime/reports-sandbox/` y `runtime/storage-sandbox/`. El resultado
vive solo en `runtime/accountant-packages-sandbox/YYYY-MM/` y contiene una
carpeta `package/` mas un ZIP local.

Contenido:

- `README_CONTADOR.txt` con leyenda de revision humana.
- `manifest.json` del paquete.
- Reportes JSON/CSV de monthly, client, document-control y accountant-review.
- `XML/` y `PDF/` con artifacts disponibles.
- `CREATED/`, `CANCELLED/` y `ERROR/` con indices por estatus.

Restricciones:

- No llama PAC, no timbra, no cancela, no envia email y no envia WhatsApp.
- No versiona ZIP, XML/PDF, `.env`, CSD, credenciales ni datos reales.
- Cancelados van separados y no se suman como ingresos vigentes.
- Si falta XML/PDF, UUID o identidad, se reporta como alerta para revision.
- Futuro: export Excel real y ZIP mensual para contador, sin mezclar sandbox
  con produccion fiscal.

### Accountant Excel Sandbox 6A.8C

La fase 6A.8C agrega un workbook mensual local para contador. Se genera bajo
`runtime/accountant-packages-sandbox/YYYY-MM/accountant-review-YYYY-MM.xlsx` y
se alimenta del package sandbox ya creado. Si el workbook existe antes de
regenerar el paquete, queda incluido tambien en `package/`, el ZIP y el
`manifest.json`.

Hojas:

- `RESUMEN`: periodo, conteos, totales activos, cancelados y leyenda.
- `FACTURAS`: metadata por documento, estatus, UUID/UID y montos si existen.
- `CLIENTES`: resumen por cliente sandbox.
- `CANCELADAS`: documentos cancelados separados, no sumados como ingreso.
- `CONTROL`: faltantes de XML/PDF/UUID, identity missing, amount unknown y
  sensitive findings.
- `ALERTAS`: alertas y recomendaciones de revision humana.
- `README`: alcance sandbox, no produccion y advertencias fiscales.

Restricciones:

- OOXML `.xlsx` real generado con Node puro, sin macros y sin formulas.
- Cualquier texto que inicia con `=`, `+`, `-` o `@` se escapa para evitar
  formula injection.
- No incrusta XML/PDF completos; solo metadatos y rutas relativas.
- No versionar el Excel generado, ZIP, XML/PDF, `.env`, CSD, credenciales ni
  datos reales.
- Todo el archivo mantiene la advertencia `Borrador sujeto a revisión humana. No sustituye contador.`

### Accountant Validation Checklist Sandbox 6A.8D

La fase 6A.8D agrega una lista de validacion mensual legible antes de compartir
el paquete con contador o usuario. Se genera dentro de `package/` como Markdown,
JSON y CSV:

- `VALIDATION_CHECKLIST.md`
- `validation-checklist.json`
- `validation-checklist.csv`

Categorias:

- Identidad fiscal: RFC emisor sandbox, regimen, lugar de expedicion, perfil
  receptor, UsoCFDI, UUID y cfdi_uid.
- Documentos: total, creados, cancelados, errores, documentos sin XML, sin PDF,
  sin UUID e identity missing.
- Montos: subtotal, IVA y total activo; cancelados separados; amount status,
  cancelled amount status y `UNKNOWN` explicito.
- Archivos: XML, PDF, Excel, CSV/JSON, ZIP, rutas relativas y runtime-only.
- Seguridad: sin credenciales, sin `.env`, sin CSD, sin datos reales, sensitive
  findings none y formula injection findings none.
- Revision humana: borrador sujeto a revision humana, no sustituye contador,
  revisar cancelados, `UNKNOWN`, XML/PDF faltantes y UUID faltantes.

Restricciones:

- Solo sandbox; no produccion.
- No llama PAC, no timbra, no cancela, no envia email y no envia WhatsApp.
- No versiona runtime, ZIP, Excel, XML/PDF, `.env`, CSD, credenciales ni datos
  reales.
- Si el checklist existe, el package lo preserva, lo declara en `manifest.json`
  y lo incluye en el ZIP. Si no existe, el package no falla y lo marca como
  opcional no incluido.

## Reporting Engine

El Reporting Engine debe generar reportes locales para revisar actividad del
periodo y preparar paquete para contador.

Reportes por:

- Cliente.
- Periodo.
- Facturas emitidas.
- Facturas pendientes.
- Facturas canceladas.
- Subtotal.
- IVA trasladado estimado.
- ISR retenido estimado.
- IVA retenido estimado.
- Total cobrado.
- Total por cobrar.
- Paquete mensual para contador.

La fuente primaria debe ser la base local y los documentos almacenados. Si un
PAC no esta disponible o cambia API, los reportes deben seguir funcionando con
datos ya guardados.

## Monthly Declaration Assistant

El asistente de declaracion mensual no presenta declaraciones y no sustituye al
contador.

Objetivos:

- Calcular estimados a partir de facturas almacenadas.
- Separar IVA trasladado, IVA retenido e ISR retenido.
- Separar facturas canceladas, pendientes, sandbox y produccion.
- Exportar resumen para contador.
- Marcar todo como `BORRADOR SUJETO A REVISION HUMANA`.

Salidas propuestas:

- Resumen mensual en JSON.
- Resumen mensual en CSV.
- Resumen legible para contador.
- Checklist de pendientes fiscales.
- Lista de facturas sin cliente validado.
- Lista de facturas con datos incompletos.

Restricciones:

- No declarar ante SAT.
- No calcular pagos definitivos sin revision humana.
- No mezclar sandbox con produccion en totales fiscales reales.
- No ocultar canceladas ni pendientes.

## Web Hub / Miniapp Futuro

El Hub Padre administrara:

- Borradores.
- Clientes.
- Facturas.
- XML/PDF.
- Reportes.
- Contador.
- Adapters PAC.
- Workflows hijos.

Responsabilidades:

- Mostrar estados y blockers.
- Permitir revision humana antes de cualquier accion fiscal sensible.
- Orquestar adapter sandbox o produccion segun permisos.
- Concentrar reportes y paquetes mensuales.
- Evitar que Telegram sea la unica interfaz de control.

## Fases Propuestas

### Fase 6A.3 - Security Boundary

- Definir modelo privado de acceso y roles.
- Crear tablas `cfdi_authorized_users`, `cfdi_security_events` y bitacora de
  acciones sensibles.
- Clasificar acciones sensibles antes de PAC real, storage sensible o miniapp.
- Mantener credenciales, estados de cuenta, XML/PDF y clientes reales fuera de
  Git.
- Preparar enforcement en workflow local ingest como fase 6A.3B.

Criterio de salida: existe barrera privada versionada sin tocar workflows
productivos ni llamar ningun PAC.

### Fase 6A.4 - Canonical Draft/Invoice Builders

- Construir builders desde draft conversacional hacia contratos canonicos.
- Validar cliente, line items, impuestos estimados y warnings fiscales.
- Mantener `BORRADOR SUJETO A REVISION HUMANA`.
- No depender de formato Factura.com ni de otro PAC.

Criterio de salida: draft e invoice internos se generan con contrato canonico
estable.

### Fase 6A.5 - Factura.com Sandbox Mapper

- Mapear contrato canonico a payload Factura.com sandbox.
- Normalizar respuesta sandbox hacia `CanonicalPacResult`.
- No llamar produccion.
- No filtrar detalles Factura.com hacia Telegram, reporting ni storage.

Criterio de salida: mapper sandbox probado con fixtures y mocks, sin PAC real.

### Fase 6A.6 - Sandbox Smoke Tests

- Ejecutar smoke sandbox solo con `FACTURACOM_SANDBOX_LIVE=1`.
- Guardar resultados sanitizados como artifacts locales no versionados.
- Verificar errores, XML/PDF sandbox si aplica y cancelacion sandbox si aplica.
- Confirmar que produccion sigue deshabilitada.

Criterio de salida: smoke sandbox controlado y documentado, sin folios reales ni
datos reales en Git.

### Fase 6A - PAC Adapter Hub Contract

- Definir tipos internos de payload CFDI.
- Crear interfaz neutral del PAC Adapter Hub.
- Crear fixtures de payloads sin enviar a ningun PAC.
- Agregar pruebas de contrato para adapters.
- Mantener produccion deshabilitada.

Criterio de salida: payload interno validable sin depender de Factura.com.

### Fase 6B - Factura.com Sandbox Adapter

- Implementar `FacturaComSandboxAdapter` detras del contrato neutral.
- Usar solo sandbox.
- Guardar request/response sanitizados.
- Normalizar errores.
- Probar XML/PDF sandbox si aplica.

Criterio de salida: sandbox probado sin folios reales ni produccion.

### Fase 6C - Storage Engine

- Definir tabla/metadata de documentos CFDI.
- Definir layout local o compatible con storage futuro.
- Guardar JSON payload, draft original y respuestas sandbox.
- Separar `SANDBOX` de `PRODUCTION`.
- En 6A.7, organizar artifacts sandbox locales por emisor, cliente, periodo,
  estatus y documento usando `cfdi_uid` como identidad principal sandbox.
- En 6A.7B, separar `client_uid` de `cfdi_uid`, bloquear overwrite silencioso y
  hacer que Reporting no avance con documentos pisados o colisiones sin
  resolver.
- En 6A.7C, descubrir de forma segura el shape real de respuesta Factura.com y
  mantener Reporting bloqueado si solo existen identidades internas parciales.

Criterio de salida: todo documento queda trazable por emisor, cliente, periodo,
estatus y proveedor.

### Fase 6D - Reporting Engine

- Crear agregados por cliente y periodo.
- Calcular subtotales e impuestos estimados.
- Separar emitidas, pendientes y canceladas.
- Exportar CSV/JSON para revision.

Criterio de salida: reporte mensual local consistente con la base almacenada.

### Fase 6E - Monthly Declaration Assistant

- Generar resumen mensual para contador.
- Incluir checklist de pendientes.
- Marcar todo como borrador.
- Separar IVA trasladado, IVA retenido e ISR retenido.

Criterio de salida: paquete mensual revisable por contador, sin declaracion SAT.

### Fase 6F - Web Hub / Miniapp

- Crear panel padre para borradores, clientes, facturas, documentos y reportes.
- Administrar adapters PAC desde configuracion.
- Mostrar blockers y estados fiscales.
- Orquestar workflows hijos sin acoplarlos a un PAC especifico.

Criterio de salida: operacion visual centralizada sin exponer datos reales en
repositorio ni saltar guardrails.

## Criterios de Seguridad Fiscal

- Todo resultado debe decir `Borrador sujeto a revisión humana`.
- El motor no debe inventar conceptos, claves SAT, unidades ni regimenes.
- La constancia fiscal del emisor y el regimen 626 RESICO siguen mandando.
- Produccion PAC queda bloqueada hasta fase explicita.
- Sandbox no equivale a factura fiscal real.
- No se deben mezclar totales sandbox con totales fiscales reales.
- Cliente no validado debe conservar marca de riesgo.
- Retenciones e impuestos son estimados hasta revision humana.
- Cancelaciones reales requieren confirmacion humana y fase futura.
- Cualquier adapter nuevo debe pasar pruebas de contrato antes de usarse.

## Decision Arquitectonica

El proyecto debe avanzar como plataforma neutral:

```text
Bot privado + guardrails fiscales + storage propio + reporting propio + adapters PAC intercambiables
```

Factura.com entra como primer sandbox adapter, no como dependencia central del
producto.
