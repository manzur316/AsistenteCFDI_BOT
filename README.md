# Asistente CFDI BOT

Motor offline y workflows n8n locales para sugerir conceptos CFDI desde mensajes cortos. El alcance actual es MVP personal Emberhub: solo ayuda a elegir un concepto para captura manual en SAT.

## Fuente de verdad

El runtime versionado usa:

- `data/concepts.normalized.json`

Ese JSON fue generado desde la base fiscal original y no debe contener conceptos, claves SAT, unidades ni actividades inventadas.

Por seguridad, el Excel fuente `data/base_cfdi_resico_n8n_emberhub_2026.xlsx` no se versiona en Git. Si necesitas regenerar el JSON, coloca el Excel localmente en esa ruta y ejecuta el proceso de normalizacion offline correspondiente, verificando despues los tests.

Los campos de catalogos SAT usados para payloads y validaciones deben operar
como claves, no como descripciones humanas. La fase 7.16E agrega el guard local
de normalizacion segura documentado en `docs/SAT_FIELD_NORMALIZATION_GUARD.md`;
por ejemplo, `Personas Morales con Fines no Lucrativos` se normaliza a `603` y
`Gastos en general` a `G03` antes del payload sandbox, mientras `G1` sigue
bloqueado como formato invalido.

## Seguridad de repositorio

No se deben subir:

- `.env`
- tokens reales de Telegram
- passwords reales de PostgreSQL
- archivos reales de `runtime/`
- logs
- constancias
- archivos de clientes
- Excel fiscal fuente

Usa `.env.example` solo como plantilla de variables.

## Seguridad privada

AsistenteCFDI_BOT es privado por defecto. Antes de operar PAC, estados de cuenta, XML/PDF, reportes con montos o acciones fiscales sensibles, el sistema debe validar usuarios autorizados y roles.

Base de seguridad:

- `docs/SECURITY_PRIVATE_ACCESS_MODEL.md`
- `sql/005_security_access_control.sql`
- `sql/006_seed_authorized_user.example.sql`
- `scripts/lib/security-access-control.js`

Para preparar PostgreSQL local, ejecuta el SQL `sql/005_security_access_control.sql` despues de las migraciones base. Luego copia `sql/006_seed_authorized_user.example.sql` a un archivo local no versionado, reemplaza `REEMPLAZAR_USER_ID`, `REEMPLAZAR_TELEGRAM_CHAT_ID` y `REEMPLAZAR_TELEGRAM_USER_ID`, y ejecuta esa copia local. No subas chat_id, telegram_user_id, credenciales, estados de cuenta, XML/PDF, runtime ni clientes reales al repositorio.

El workflow local ingest valida `telegram_chat_id` + `telegram_user_id` contra `cfdi_authorized_users` antes de comandos, scoring, drafts, action tokens y callbacks. Si no hay usuario autorizado o el rol no tiene permiso, responde `Acceso no autorizado.`, registra `cfdi_security_events`, no ejecuta scoring, no crea drafts y no marca tokens como usados. PAC real, produccion, estados de cuenta y storage sensible siguen bloqueados por fase.

## Pruebas del motor

```bash
node scripts/test-scoring.js
node scripts/test-n8n-contract.js
```

## Sandbox XML/PDF delivery

La fase 7.17E documenta el contrato sandbox actual:

- `sandbox.draft.stamp` persiste `SANDBOX_TIMBRADO` y deja XML/PDF en
  `DOWNLOAD_READY`.
- `sandbox.draft.download-artifacts` descarga, valida y persiste
  `artifact_status=DOWNLOADED`.
- Telegram muestra botones de entrega solo si `persistence_status=UPDATED` y
  XML/PDF son validos.

Ver `docs/PHASE_7_17E_DOWNLOAD_ARTIFACT_PERSISTENCE_TELEGRAM_DELIVERY.md`.

## Workflow manual n8n

Workflow importable:

```text
workflow/cfdi_manual_test.n8n.json
```

Arranque local recomendado:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

El Code Node es autocontenido y lee el catalogo desde:

```text
C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json
```

## Telegram polling con PostgreSQL

Workflow importable:

```text
workflow/cfdi_telegram_postgres_polling.n8n.json
```

Version esperada:

```text
CFDI_POSTGRES_POLLING_V1
```

La memoria, historial, drafts y logs viven en PostgreSQL local (`cfdi_bot`). Ver:

- `workflow/POSTGRES_LOCAL_SETUP.md`
- `workflow/POSTGRES_POLLING_RUNBOOK.md`
- `sql/001_init_cfdi_bot.sql`
- `sql/003_clients_amounts_tax.sql`
- `sql/003_seed_clients.example.sql`
- `sql/004_action_tokens.sql`
- `sql/005_security_access_control.sql`
- `sql/006_seed_authorized_user.example.sql`

Este modo con Schedule Trigger queda como legacy. Funciona, pero puede sentirse lento porque depende del intervalo del Schedule.

## Telegram local runner recomendado

Modo recomendado para baja latencia:

```text
Telegram getUpdates -> runner/telegram-local-runner.js -> http://127.0.0.1:5678/webhook/cfdi-local-ingest -> n8n local -> PostgreSQL -> Telegram sendMessage
```

Workflow importable:

```text
workflow/cfdi_telegram_local_ingest.n8n.json
```

Runner:

```text
runner/telegram-local-runner.js
```

Plantilla local:

```text
.env.local.example
```

Arranca n8n local:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
$env:N8N_RUNNERS_ENABLED="false"
n8n start
```

Arranca el runner en otra terminal:

```powershell
node runner/telegram-local-runner.js
```

El runner usa `runtime/runner-offset.json` para guardar el offset. Si n8n responde 2xx despues de terminar el ingest, avanza a `update_id + 1`; si n8n falla o supera `N8N_INGEST_TIMEOUT_MS`, no avanza offset. El workflow local valida `X-CFDI-Runner-Secret` contra `runnerSecret` en `Set Config`.

El webhook local responde al runner con JSON 200 tambien en updates duplicados, ignorados o sin accion de Telegram, por ejemplo `{"ok":true,"status":"duplicate"}`. Asi el runner no queda atrapado reintentando un update que n8n ya deduplico o manejo.

No expone n8n a internet: el ingest esperado es solo local:

```text
http://127.0.0.1:5678/webhook/cfdi-local-ingest
```

Deten el runner con `Ctrl+C`.

## Clientes, Montos e Impuestos

Las fases 4.5 y 4.6 agregan soporte local para:

- Clientes y alias en PostgreSQL.
- Montos detectados desde mensajes.
- Modo IVA `MAS_IVA`, `IVA_INCLUIDO` o pendiente.
- Reglas conservadoras RESICO para borradores.
- Line items de borrador en `cfdi_draft_line_items`.
- Flujo conversacional tipo wizard para crear borradores desde Telegram.

El seed `sql/003_seed_clients.example.sql` contiene solo un cliente ficticio (`CLI-DEMO-RIVERA`). No subas clientes reales al repositorio.

Comandos disponibles en Telegram:

- `/factura`
- `/clientes`
- `/cliente TEXTO`
- `/nuevocliente`
- `/editarcliente CLIENT_ID CAMPO VALOR`
- `/validarcliente CLIENT_ID`

Flujo recomendado:

1. Enviar `/factura`.
2. Completar `Cliente`, `Trabajo`, `Tipo`, `Monto` e `IVA`, o mandar algo rapido como `Privada Rivera, revise camaras por 800 + IVA`.
3. Revisar el preview `BORRADOR CFDI`.
4. Responder `confirmar`, `editar` o `cancelar`.

El workflow no crea el draft `PENDIENTE` final hasta recibir `confirmar`. Si el cliente no existe, ofrece crear cliente basico, continuar sin cliente o cancelar. El alta manual con `/nuevocliente` usa plantilla escrita y deja `validated_by_human=false` hasta ejecutar `/validarcliente CLIENT_ID`.

El workflow local ingest tambien puede mostrar botones inline de Telegram para `Confirmar`, `Editar`, `Cancelar` y `Ver detalle`. Cada boton usa `callback_data` corto `cfdi:<token>` guardado en PostgreSQL (`cfdi_action_tokens`); no contiene datos fiscales, claves SAT, cliente ni monto. Los botones ejecutan las mismas rutas conservadoras que los comandos de texto y no timbran CFDI.

El bot es privado. Antes de probar Telegram local, debe existir al menos un registro autorizado en `cfdi_authorized_users`. Para obtener los IDs, puedes enviar un mensaje de prueba con el runner local y revisar logs/runtime locales o la consola de n8n; no copies esos valores a archivos versionados. Sin usuario autorizado, cualquier mensaje o callback debe responder `Acceso no autorizado.`.

## Roadmap PAC, Storage y Reporting

El proyecto no se acoplara directamente a Factura.com ni a ningun PAC especifico. La ruta propuesta es un `PAC Adapter Hub` neutral, con Factura.com solo como primer adapter sandbox, y soporte futuro para Facturama, Facturapi, SW, Finkok u otros proveedores.

El roadmap de fases 6A a 6F tambien contempla Storage Engine, Reporting Engine, Monthly Declaration Assistant y un Web Hub/Miniapp para administrar borradores, clientes, XML/PDF sandbox o futuros, reportes y paquetes mensuales para contador.

La fase 6A.0 define el modelo operativo de producto y el contrato de ledger simple: entrada natural, motor interno completo, pocos accesos principales, cobros/pagos simples y paquete mensual para contador sin convertir el sistema en ERP pesado.

Ver:

- `docs/ROADMAP_PAC_STORAGE_REPORTING.md`
- `docs/PRODUCT_OPERATING_MODEL.md`
- `docs/SIMPLE_LEDGER_AND_CASHFLOW_MODEL.md`
- `docs/CANONICAL_CFDI_CONTRACTS.md`
- `docs/CANCELLATION_LIFECYCLE.md`
- `docs/SIMPLE_PRODUCT_RULES.md`

La fase 6A.2 formaliza contratos internos primero y adapters PAC despues. Storage, reporting, Telegram y Miniapp deben leer contratos canonicos, no formatos particulares de Factura.com, Facturama, Facturapi, SW, Finkok u otros PAC. Las cancelaciones se modelan como cambios de estado con audit trail; nunca como borrado de registros.

La fase 6A.4 agrega builders ejecutables para convertir previews/drafts actuales en contratos canonicos internos:

- `scripts/lib/canonical-draft-builder.js`
- `scripts/lib/canonical-invoice-builder.js`
- `data/sandbox/canonical-test-clients.json`
- `data/sandbox/canonical-test-drafts.json`

El Canonical Draft Builder transforma cliente, concepto, line items, impuestos y blockers en `CanonicalDraft`. El Canonical Invoice Builder promueve solo drafts confirmados explicitamente, sin blockers y con revision humana a `CanonicalInvoiceDocument` sandbox-ready y `CanonicalPacRequest` neutral. No llama PAC, no crea XML/PDF y no abre produccion. La siguiente fase tecnica es Factura.com Payload Mapper; cualquier smoke real debe mantener primero el enforcement privado ya aplicado en 6A.3B.

La fase 6A.5 agrega el `Factura.com Sandbox Mapper` mock-only:

- `scripts/lib/factura-com-payload-mapper.js`
- `scripts/lib/factura-com-sandbox-adapter.js`
- `data/sandbox/facturacom-mock-success-responses.json`
- `data/sandbox/facturacom-mock-error-responses.json`
- `docs/FACTURACOM_SANDBOX_MAPPER.md`

Esta capa traduce contratos canonicos a un payload sandbox de proveedor marcado como `TODO_DOCS_REQUIRED`, normaliza respuestas mock a `CanonicalPacResult` y mantiene Factura.com aislado del nucleo. No hace llamadas live, no usa credenciales, no crea XML/PDF reales y no abre produccion. La siguiente fase recomendada es 6A.6: smoke sandbox controlado con `FACTURACOM_SANDBOX_LIVE=1`, credenciales locales no versionadas y seguridad 6A.3B activa.

La fase 6A.6 agrega un smoke controlado contra Factura.com sandbox, apagado por defecto:

- `scripts/lib/factura-com-live-client.js`
- `scripts/smoke-factura-com-sandbox.js`
- `scripts/analyze-factura-com-sandbox-results.js`
- `.env.pac.sandbox.example`

Dry-run sin llamada real:

```powershell
node scripts/smoke-factura-com-sandbox.js
```

Debe responder:

```text
SKIPPED: live disabled
```

Para live sandbox, copia la plantilla a un archivo local ignorado:

```powershell
Copy-Item .env.pac.sandbox.example .env.pac.sandbox.local
```

Variables requeridas:

```text
FACTURACOM_SANDBOX_LIVE=1
FACTURACOM_BASE_URL=https://sandbox.factura.com/api
FACTURACOM_API_KEY=REEMPLAZAR_LOCALMENTE
FACTURACOM_SECRET_KEY=REEMPLAZAR_LOCALMENTE
FACTURACOM_PLUGIN=REEMPLAZAR_LOCALMENTE
FACTURACOM_SANDBOX_SERIE=REEMPLAZAR_LOCALMENTE
FACTURACOM_SANDBOX_USO_CFDI=G03
FACTURACOM_SANDBOX_FORMA_PAGO=03
FACTURACOM_SANDBOX_METODO_PAGO=PUE
FACTURACOM_SANDBOX_MONEDA=MXN
FACTURACOM_SANDBOX_LUGAR_EXPEDICION=00000
```

Flags opcionales:

```text
FACTURACOM_SANDBOX_CREATE_CLIENTS=0|1
FACTURACOM_SANDBOX_CANCEL_TEST=0|1
FACTURACOM_SANDBOX_DOWNLOAD_TEST=0|1
FACTURACOM_SANDBOX_BATCH_SIZE=1|5
```

Ejecuta live sandbox solo despues de cargar variables localmente:

```powershell
node scripts/preflight-facturacom-auth.js
node scripts/smoke-factura-com-sandbox.js
node scripts/analyze-factura-com-sandbox-results.js
```

Los artifacts quedan en:

```text
runtime/facturacom-sandbox/
```

Si `FACTURACOM_SANDBOX_CREATE_CLIENTS=1`, el smoke resuelve el `Receptor.UID`
en este orden:

- UID existente desde variables locales o `runtime/facturacom-sandbox/client-uids.local.json`.
- Respuesta de `POST /v1/clients/create`.
- Fallback `GET /v1/clients/{RFC}`.
- Fallback `GET /v1/clients?rfc={RFC}`.

El mapa `client-uids.local.json` se persiste solo dentro de `runtime/` y no debe
versionarse. Ese UID pertenece al cliente/receptor (`client_uid`) y nunca debe
usarse como `cfdi_uid` ni como `invoice_id`. Si la creacion del cliente devuelve
HTTP 2xx con `response/status=error`, el smoke lo clasifica como
`CLIENT_CREATE_API_ERROR`; si falla el transporte, como
`CLIENT_CREATE_HTTP_ERROR`. En ambos casos intenta resolver el cliente por RFC
antes de crear CFDI. Si el fallback no encuentra un UID claro, el intento queda
como `CLIENT_CREATE_FAILED`, `CLIENT_UID_MISSING` o `CLIENT_UID_AMBIGUOUS` y no
se intenta `POST /v4/cfdi40/create`. Para reintentar despues de un smoke, revisa
`summary.json`, `manifest.json` y ejecuta:

```powershell
node scripts/analyze-factura-com-sandbox-results.js
```

Fase 6A.6C normaliza identidad CFDI/PAC despues de los smoke live sandbox
validados localmente: create, download XML/PDF, cancelacion sandbox y batch de 5
CFDI. Antes del Storage Engine, cada intento separa:

- `client_uid`: UID del cliente/receptor usado en `Receptor.UID`.
- `cfdi_uid`: UID del CFDI/factura creado por Factura.com.
- `uuid` fiscal cuando venga en create, lookup o XML.
- `pac_invoice_id` si el proveedor lo entrega.
- `internal_invoice_id` y `draft_id` internos del bot.
- `serie`, `folio`, `status`, `lookup_status` y `cancel_status`.
- referencias runtime de XML/PDF sin versionarlas.

Factura.com puede no devolver UUID en `POST /v4/cfdi40/create`; el smoke vuelve
a intentar desde `GET /v4/cfdi/uid/{cfdi_uid}` y desde el XML descargado cuando
`FACTURACOM_SANDBOX_DOWNLOAD_TEST=1`. Si create responde OK pero no hay
`cfdi_uid`, `uuid` ni `pac_invoice_id`, el intento queda como
`CREATE_OK_IDENTITY_MISSING`, no aumenta `successful` y el analyzer reporta
`identity_missing`.

Fase 6A.7D separa HTTP OK de exito de negocio Factura.com. Una respuesta HTTP
200 con cuerpo `{ "response": "error" }` o `{ "status": "error" }` ahora queda
como `http_ok=true`, `api_ok=false`, `ok=false` y el intento se marca
`CREATE_API_ERROR`. Un error de transporte queda como `CREATE_HTTP_ERROR`. En
ambos casos el smoke conserva request/response sanitizados, no hace lookup,
download ni cancel, no cuenta `identity_missing` y el analyzer reporta
`api_errors`, `http_errors`, `create_api_errors`, `create_http_errors`,
`api_error_messages_detected`, `business_successful` e
`identity_missing_after_api_success`.

Fase 6A.7C agrega inspeccion segura de la forma real de respuesta sandbox:

```powershell
node scripts/inspect-facturacom-sandbox-response-shape.js
```

El inspector lee `runtime/facturacom-sandbox/manifest.json` y artifacts
`CFDI_CREATE_RESPONSE`, `CFDI_LOOKUP_RESPONSE` y `CFDI_XML`. Solo imprime rutas,
keys, tipos, longitudes y marcadores como `uid-like`, `uuid-like`,
`rfc-like` o `FORBIDDEN_CLIENT_UID_SOURCE`; no imprime valores completos,
credenciales, XML/PDF completos ni headers de request. El analyzer tambien
reporta `create_response_shapes_detected`, `header_identity_candidates`,
`forbidden_client_uid_candidates_detected`, `cfdi_identity_source` e
`identity_ambiguous`. Para errores de negocio, el inspector puede mostrar
previews cortos de `response`, `status` y `message`, con RFC, secretos e IDs
largos redactados.

Fase 6A.7E mejora esos previews: si Factura.com manda `data.message` como HTML
de error, el sistema quita tags simples, decodifica entidades HTML basicas y
muestra texto plano truncado para diagnostico. CFDI XML real (`<?xml`,
`<cfdi:Comprobante>`, `<tfd:TimbreFiscalDigital>`) y PDF real (`%PDF`) siguen
redactados como marcadores seguros.

Fase 6A.7F agrega diagnostico especifico para creacion/busqueda de clientes
sandbox. El inspector ahora revisa `CLIENT_CREATE_REQUEST`,
`CLIENT_CREATE_RESPONSE` y `CLIENT_LOOKUP_RESPONSE` ademas de respuestas CFDI,
marca `endpoint_type: client_create|client_lookup`, redacta RFC completos e
identifica candidatos UID sin imprimirlos. El analyzer reporta
`client_create_errors`, `client_lookup_errors`, mensajes seguros,
`client_already_exists_detected`, `client_validation_error_detected` y shapes
de cliente. Si el error indica cliente existente, o si `CREATE_CLIENTS=1`, el
smoke intenta lookup por RFC y solo continua a CFDI cuando obtiene `client_uid`.

Fase 6A.7G agrega un preflight de autenticacion Factura.com antes de cualquier
`CLIENT_CREATE`, `CLIENT_LOOKUP` o `CFDI_CREATE`. El smoke llama
`GET /v1/clients?per_page=1` y guarda `PREFLIGHT_AUTH_RESPONSE` sanitizado en
`runtime/facturacom-sandbox/preflight-auth-response.json`. Si falla, el intento
queda `PROVIDER_AUTH_FAILED`, `provider_auth_status` indica
`AUTH_ACCOUNT_NOT_FOUND`, `AUTH_INVALID_KEYS`, `AUTH_ENVIRONMENT_MISMATCH`,
`AUTH_PLAN_REQUIRED`, `AUTH_IP_BLOCKED`, `AUTH_UNKNOWN_API_ERROR` o
`AUTH_HTTP_ERROR`, y no se intenta crear cliente ni CFDI. El mensaje
`La cuenta que intenta autenticarse no existe` se trata como auth/cuenta/ambiente
del proveedor, no como cliente existente ni error de payload CFDI. Las keys
sandbox deben corresponder a `https://sandbox.factura.com/api`; no uses keys de
produccion contra sandbox. `F-PLUGIN` sigue siendo requerido y universal para la
cuenta. No avances contratos canonicos CFDI ni storage/reporting con live smoke
hasta que el preflight marque `AUTH_OK`.

Fase 6A.7J endurece el corte local antes del PAC para evitar `CFDI40161` por
payload final no evaluado. Antes de `POST /v1/clients/create`, el smoke
normaliza el RFC del fixture y valida su forma; si queda invalido, el intento
termina como `LOCAL_INVALID_RFC_SHAPE`, no se crea `CLIENT_CREATE_REQUEST` y no
hay llamada a Factura.com. Justo antes de escribir y enviar
`CFDI_CREATE_REQUEST`, el smoke valida el `body` final real:
`UsoCFDI`, `Receptor.RegimenFiscalR`, `Receptor.UID` y la forma RFC normalizada
del receptor. El reporte seguro `receptor_compatibility` se guarda tambien en
casos `PASS`.

El analyzer ahora debe mostrar `Effective UsoCFDI`,
`Effective RegimenFiscalR`, `Effective person type`, `Normalized RFC length`,
`RFC hidden characters`, `Receptor compatibility status` y
`Client/CFDI receptor mismatch`. Si existe `CFDI_CREATE_REQUEST` pero no existe
reporte de guard en el artifact o en el intento, reporta
`RECEPTOR_GUARD_NOT_EVALUATED_BUG`; ese caso no debe ignorarse antes de repetir
un smoke live.

Fase 6A.7I agrega un guard local para CFDI40161 antes de
`POST /v4/cfdi40/create`. El mapper valida `Receptor.UID`,
`Receptor.RegimenFiscalR`, `UsoCFDI` y forma de RFC receptor contra la matriz
SAT derivada `data/knowledge_base/cfdi40_uso_cfdi_compatibility.derived.json`.
Si la combinacion no es compatible con el tipo de persona y regimen receptor,
el intento queda `CFDI_LOCAL_RULE_ERROR`, aumenta `local_cfdi_rule_errors` y
`needs_local_config`, guarda un diagnostico sanitizado y no llama al PAC. El
inspector puede mostrar valores seguros de catalogo como `UsoCFDI`, `RegimenFiscalR`,
`FormaPago`, `MetodoPago`, `ClaveProdServ`, `ClaveUnidad`, `ObjetoImp`,
`Impuesto`, `TipoFactor` y `TasaOCuota`; RFC completos, UID largos, secretos,
XML y PDF siguen redactados.

Fase 6A.7K agrega perfiles fiscales sandbox como fuente de verdad del receptor:

- `data/sandbox/facturacom-sandbox-fiscal-profiles.json`
- `scripts/lib/sandbox-fiscal-profile-loader.js`

El primer smoke usa `PF_612_G03_DEMO`: datos de receptor demo SAT para persona
fisica, regimen `612`, CP fiscal `01219` y `UsoCFDI=G03`. `XAXX010101000` queda separado en
`PUBLIC_GENERAL_616_S01_DEMO` y solo debe usarse con combinaciones publicas o
generales compatibles, no con `612/G03`. El smoke aplica el perfil antes de
crear cliente y antes de CFDI; si el perfil es inconsistente, corta localmente
como `LOCAL_INVALID_SANDBOX_FISCAL_PROFILE` sin llamar al PAC. Variables
globales como `FACTURACOM_SANDBOX_USO_CFDI` ya no deben mezclar receptores.
Si el analyzer muestra `303 - El RFC del CSD del Emisor no corresponde`, el
bloqueo pertenece a configuracion sandbox del emisor/CSD/serie de la cuenta
PAC, no al perfil fiscal del receptor.

Fase 6A.7L separa el perfil de emisor sandbox:

- `data/sandbox/facturacom-sandbox-emitter-profiles.json`
- `scripts/lib/sandbox-emitter-profile-loader.js`

El smoke aplica `EMITTER_XAMA_612_DEMO` como emisor sandbox: RFC demo con forma
PF, `RegimenFiscal=612` y `LugarExpedicion=01219`. Este perfil es distinto del
receptor `PF_612_G03_DEMO`, aunque ambos usen datos demo SAT. El perfil
`EMITTER_RESICO_626_REAL_BLOCKED_FOR_SANDBOX` existe solo como bloqueo para no
mezclar el RESICO 626 real del usuario con CSD sandbox. Si el PAC sigue
respondiendo `303`, el analyzer clasifica `EMITTER_CSD_RFC_MISMATCH` y la
accion correcta es revisar panel Factura.com: empresa activa, CSD cargado, RFC
emisor y serie deben pertenecer al mismo emisor sandbox.

Fase 6A.7N limpia falsos positivos de observabilidad despues de un timbrado
sandbox exitoso. Mensajes PAC como `Factura creada y enviada satisfactoriamente`
se reportan como `API success messages detectados`, no como errores, cuando
`api_errors=0` y `business_successful=1`. De la misma forma, una respuesta
`CLIENT_CREATE_RESPONSE` con `status/response=success` no incrementa
`client_validation_error_detected`. La validacion fiscal de RFC ocurre antes de
sanitizar; el inspector solo analiza artifacts sanitizados y marca
`[REDACTED_RFC]` como `REDACTED_NOT_EVALUATED`, nunca como RFC invalido real.

Estado real actual: si sandbox crea CFDI pero no devuelve identidad en create,
headers, lookup, XML o busqueda oficial documentada, el flujo se queda como
observabilidad local y no debe avanzar a Reporting Engine.

Fase 6A.7 agrega el Storage Engine sandbox local. Despues de un smoke sandbox,
organiza artifacts ya existentes sin llamar Factura.com:

```powershell
node scripts/store-facturacom-sandbox-artifacts.js
node scripts/analyze-storage-sandbox.js
```

La salida queda solo en runtime:

```text
runtime/storage-sandbox/
  emitters/EMITTER-DEMO/2026/06/clients/CLIENT-DEMO-PF-GENERIC/invoices/<cfdi_uid_uuid_pac_o_internal_id>/
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

En sandbox, `cfdi_uid` es la identidad principal del proveedor. `uuid` es
nullable; si hay `cfdi_uid` sin UUID, la identidad queda como
`PARTIAL_PROVIDER_UID`, valida para organizar Storage Engine sandbox pero no
como folio fiscal real. Si falta `cfdi_uid` real, Storage puede usar
`uuid`, `pac_invoice_id`, `internal_invoice_id` o `draft_id + attempt index`
como ruta tecnica, pero marca la identidad como `PARTIAL_INTERNAL_ID` o
`MISSING`. Si dos drafts generan el mismo invoice id, Storage agrega un sufijo
estable `__<draft_id>` y reporta `identity_collisions`; no debe sobrescribir
silenciosamente documentos.

No subas `.env.pac.sandbox.local`, credenciales, XML/PDF, responses, manifests,
runtime, estados de cuenta ni clientes reales. Produccion sigue bloqueada por
codigo; `https://api.factura.com` no es aceptado por el cliente live.

Fase 6A.7O cierra el ciclo operativo sandbox local con dos smoke runs separados:
uno para crear y descargar XML/PDF, y otro para crear y cancelar. El storage
debe registrar documentos `CREATED` y `CANCELLED`, conservar `cfdi_uid`, `uuid`
cuando exista, `serie`, `folio`, checksums de XML/PDF y respuesta de cancelacion
sin versionar ningun artifact de `runtime/`. El analyzer debe reportar
`Sensitive findings: none`, `identity missing=0` para documentos almacenados con
identidad completa y rutas bajo `runtime/storage-sandbox`.

Fase 6A.8 agrega Reporting Engine sandbox local. Lee solo
`runtime/storage-sandbox`, no llama Factura.com y escribe reportes bajo
`runtime/reports-sandbox/YYYY-MM/`:

```powershell
node scripts/generate-sandbox-monthly-report.js
node scripts/analyze-sandbox-reporting.js
```

Genera `monthly-summary`, `client-summary`, `document-control` y
`accountant-review` en JSON/CSV. Los reportes incluyen el aviso
`Borrador sujeto a revisión humana. No sustituye contador.`, separan
`CREATED`, `CANCELLED` y `ERROR`, cuentan XML/PDF disponibles y marcan montos
como `UNKNOWN` cuando no se pueden extraer de manifest/XML sanitizado. Los
cancelados se cuentan aparte y no se suman como ingresos vigentes. Futuro:
paquete contador ZIP/Excel.

Fase 6A.8B agrega el paquete mensual sandbox para contador. Lee los reportes de
`runtime/reports-sandbox` y los artifacts disponibles en `runtime/storage-sandbox`,
crea una carpeta local y un ZIP bajo `runtime/accountant-packages-sandbox/YYYY-MM/`:

```powershell
node scripts/generate-sandbox-accountant-package.js
node scripts/analyze-sandbox-accountant-package.js
```

El paquete contiene `README_CONTADOR.txt`, `manifest.json`, los reportes
JSON/CSV, `accountant-review.json` y carpetas `XML/`, `PDF/`, `CREATED/`,
`CANCELLED/` y `ERROR/`. No envia email, no envia WhatsApp, no llama PAC, no
timbra y no sustituye contador. El ZIP, XML/PDF y todo `runtime/` quedan fuera
de Git. Futuro: export Excel real para paquete mensual.

Fase 6A.8C agrega el Excel sandbox mensual para revision contable. Genera un
OOXML `.xlsx` real con Node puro, sin macros y sin formulas, bajo
`runtime/accountant-packages-sandbox/YYYY-MM/accountant-review-YYYY-MM.xlsx`:

```powershell
node scripts/generate-sandbox-accountant-excel.js
node scripts/analyze-sandbox-accountant-excel.js
```

El libro contiene hojas `RESUMEN`, `FACTURAS`, `CLIENTES`, `CANCELADAS`,
`CONTROL`, `ALERTAS` y `README`. No incrusta XML/PDF completos; solo usa
metadatos y rutas relativas. Las celdas que empiezan con `=`, `+`, `-` o `@`
se escapan como texto para evitar formula injection. Si el Excel ya existe,
el package sandbox lo incluye en `package/` y en el ZIP. Sigue siendo
`Borrador sujeto a revisión humana. No sustituye contador.`

Fase 6A.8D agrega el checklist mensual sandbox de validacion para contador y
usuario. Genera `VALIDATION_CHECKLIST.md`, `validation-checklist.json` y
`validation-checklist.csv` dentro de `package/`:

```powershell
node scripts/generate-sandbox-accountant-checklist.js
node scripts/analyze-sandbox-accountant-checklist.js
```

El checklist revisa identidad fiscal, documentos, montos, archivos, seguridad
y pendientes de revision humana. Marca XML/PDF/UUID faltantes, identity missing,
amount `UNKNOWN`, cancelados separados y hallazgos sensibles. Al regenerar el
package, si el checklist existe se preserva, se declara en `manifest.json` y
entra al ZIP. No llama PAC, no usa produccion, no timbra, no cancela, no envia
mensajes y no sustituye contador.

Fase 6A.9 agrega una capa local de acciones sandbox estable para que n8n o
Telegram puedan invocar funciones sin conocer detalles fiscales internos:

```powershell
node scripts/run-sandbox-action.js sandbox.report.generate
node scripts/run-sandbox-action.js sandbox.package.generate
node scripts/run-sandbox-action.js sandbox.excel.generate
node scripts/run-sandbox-action.js sandbox.checklist.generate
node scripts/run-sandbox-action.js sandbox.full.monthly.package
node scripts/analyze-sandbox-action-result.js
```

Acciones disponibles:

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

Cada accion devuelve JSON estable con `status` en `OK`, `ERROR`,
`SKIPPED`, `NEEDS_RUNTIME`, `NEEDS_CONFIG` o `PACKAGE_SAFETY_ERROR`, escribe resultados solo bajo
`runtime/action-results-sandbox/`, redacta secretos, bloquea produccion y no
llama PAC salvo las acciones smoke sandbox explicitas. El full monthly package
refresca storage si hay runtime smoke valido, genera reportes, paquete, Excel,
checklist, regenera el paquete y analiza el resultado. Sigue siendo sandbox:
no PAC productivo, no timbrado, no XML/PDF real fiscal y no sustitucion del
contador.

Fase 6A.11B endurece el paquete mensual sandbox y la respuesta del webhook:
los `.xlsx` se analizan como OOXML, no como texto plano, para evitar falsos
positivos de `absolute_path` por bytes internos del ZIP. Si aparece una ruta
absoluta real, el reporte debe indicar workbook, entry interna y celda aproximada.
Los bloqueos de paquete se clasifican como `PACKAGE_SAFETY_ERROR`, no como
`NEEDS_RUNTIME`. El router n8n debe responder siempre con body JSON visible en
las acciones, incluyendo `ok`, `status`, `action`, `message`, `warnings` y
`errors`.

Fase 6A.11C fija el body HTTP del webhook sandbox en n8n: el workflow prepara
un item final con `ok`, `status`, `action`, `source_kind`, `callback_data`,
`message`, `warnings` y `errors`, y el nodo `Respond to Webhook` responde ese
primer item como JSON. Si `latest.json` queda `OK` pero PowerShell muestra
`RawContentLength=0`, la accion corrio, pero n8n sigue usando un workflow viejo
o mal importado. Despues de `git pull`, reimporta
`workflow/cfdi_sandbox_action_router.n8n.json` en n8n.

Fase 6A.11D elimina `fs/path` del workflow sandbox de n8n. Los Code Nodes no
usan `require`, `readFileSync` ni lectura del filesystem; `Build Safe Action
Summary` parsea exclusivamente el JSON estable que `Execute Command` entrega en
`stdout`/`data`. `latest.json` queda para diagnostico externo y no para lectura
interna de n8n. No habilites `NODE_FUNCTION_ALLOW_BUILTIN` para este flujo.

Fase 6A.11E agrega guardrails permanentes para workflows n8n:

```text
docs/N8N_WORKFLOW_GUARDRAILS.md
scripts/test-n8n-workflow-guardrails.js
```

N8n debe seguir siendo solo orquestador: sin `fs/path`, sin filesystem, sin PAC
directo, sin headers de proveedor, sin `process.env` en Code Nodes y consumiendo
solo `stdout` JSON del Action Layer. Workflows historicos se reportan como deuda
legacy; el router sandbox soportado debe pasar reglas estrictas.

Fase 6A.10 agrega el router n8n sandbox sobre esa Action Layer:

```text
workflow/cfdi_sandbox_action_router.n8n.json
workflow/CFDI_SANDBOX_ACTION_ROUTER_SETUP.md
```

El workflow usa un Webhook local, valida `CFDI_ALLOWED_TELEGRAM_CHAT_ID`, mapea
solo comandos permitidos y ejecuta un unico patron:

```powershell
node scripts/run-sandbox-action.js <action>
```

Comandos:

- `/sandbox_menu`
- `/sandbox_preflight`
- `/sandbox_report`
- `/sandbox_package`
- `/sandbox_excel`
- `/sandbox_checklist`
- `/sandbox_full_package`
- `/sandbox_smoke_create`
- `/sandbox_smoke_download`
- `/sandbox_smoke_cancel`

N8n no conoce Factura.com, PAC, XML/PDF, headers ni contratos fiscales internos.
Si `TELEGRAM_BOT_TOKEN` existe localmente, puede responder por `sendMessage`; si
no, responde por webhook local. No envia XML/PDF, ZIP, Excel ni otros archivos
por Telegram en esta fase. Este router sandbox tampoco requiere `fs/path` en
Code Nodes.

Fase 6A.11 agrega botones inline sandbox sobre el mismo router:

```text
workflow/CFDI_SANDBOX_TELEGRAM_BUTTONS.md
```

El menu se abre con `/sandbox_menu` y usa `callback_data` corto de allowlist,
por ejemplo `cfdi_sbx:report`, `cfdi_sbx:full`, `cfdi_sbx:smoke_menu` y
`cfdi_sbx:cancel`. Los callbacks no contienen RFC, UUID, UID, montos, rutas,
XML/PDF, ZIP, Excel, credenciales ni secretos. Los botones solo disparan
acciones sandbox permitidas y siguen sin enviar archivos por Telegram.

Fase 6A.12 agrega un plan manual E2E para probar Telegram + n8n + Action
Layer sandbox sin agregar features productivas:

```text
workflow/CFDI_SANDBOX_E2E_TEST_PLAN.md
scripts/test-sandbox-e2e-readiness.js
docs/PHASE_6A12_SANDBOX_E2E_SIGNOFF.md
```

Orden recomendado: correr readiness, importar/activar el workflow, probar
`/sandbox_menu` por webhook local, probar `cfdi_sbx:full`, revisar
`runtime/action-results-sandbox/latest.json`, probar Telegram real solo con
`CFDI_ALLOWED_TELEGRAM_CHAT_ID` y confirmar que no se envian archivos por
Telegram. El cierre de 6A requiere `sensitive_findings=none` o alerta resumida
sin exponer datos sensibles. Para callbacks como `cfdi_sbx:full`, el webhook
debe regresar HTTP 200 con contenido JSON no vacio aun si la accion termina en
error controlado.

Cierre 6A.12: PASS documentado en
`docs/PHASE_6A12_SANDBOX_E2E_SIGNOFF.md`. Siguiente fase recomendada:
`6A.13 Sandbox action audit history`.

Fase 6A.13 agrega historial auditable local para acciones sandbox:

```text
docs/PHASE_6A13_SANDBOX_ACTION_AUDIT_HISTORY.md
runtime/sandbox-action-audit/actions.jsonl
scripts/analyze-sandbox-action-audit.js
scripts/test-sandbox-action-audit-history.js
```

Cada ejecucion del Action Layer agrega un registro JSONL con estado, conteos y
metadata redacted. N8n sigue sin leer ni escribir filesystem; solo pasa metadata
segura `--audit-*` al mismo comando allowlisted. No se guardan tokens, chat_id
completo, RFC, UUID, UID, rutas, XML/PDF, ZIP/Excel, CSD, `.env`, credenciales
PAC ni datos reales.

Fase 6A.14 agrega politica local de revision, resumen, retencion y limpieza
segura del audit sandbox:

```text
docs/PHASE_6A14_SANDBOX_AUDIT_REVIEW_RETENTION.md
runtime/sandbox-action-audit/summary.json
scripts/review-sandbox-action-audit.js
scripts/test-sandbox-action-audit-retention.js
```

La revision es `--dry-run` por defecto. La limpieza real requiere `--apply`,
crea respaldo/archivo local en runtime antes de modificar `actions.jsonl` y no
versiona audit, resumen, XML/PDF, ZIP/Excel, credenciales ni datos reales.

Fase 6A.15 agrega export local para revision humana del audit sandbox:

```text
docs/PHASE_6A15_SANDBOX_AUDIT_DASHBOARD_EXPORT.md
runtime/sandbox-action-audit/review/audit-review.md
runtime/sandbox-action-audit/review/audit-review.csv
runtime/sandbox-action-audit/review/audit-review.json
scripts/export-sandbox-action-audit-review.js
scripts/test-sandbox-action-audit-export.js
```

El export no modifica `actions.jsonl`, falla si el analyzer detecta datos
sensibles y solo produce reportes locales ignorados por Git.

Fase 6A.16 agrega checklist y signoff humano local para cerrar el bloque
sandbox 6A:

```text
docs/PHASE_6A16_SANDBOX_AUDIT_SIGNOFF_WORKFLOW.md
runtime/sandbox-action-audit/signoff/SANDBOX_AUDIT_SIGNOFF_CHECKLIST.md
runtime/sandbox-action-audit/signoff/sandbox-audit-signoff-checklist.json
runtime/sandbox-action-audit/signoff/sandbox-audit-signoff-checklist.csv
scripts/generate-sandbox-audit-signoff-checklist.js
scripts/test-sandbox-audit-signoff-checklist.js
```

El modo `--mark-reviewed` exige `--reviewer-note`, se niega si hay FAIL y solo
crea `HUMAN_REVIEWED.local.json` en runtime.

Cierre formal del bloque 6A:

```text
docs/PHASE_6A_SANDBOX_BLOCK_SIGNOFF.md
```

6A queda cerrado como sandbox local: no autoriza produccion, timbrado real ni
datos reales.

Fase 7.0 documenta la planeacion de interfaz producto Telegram, sin implementar
workflows ni PAC real:

```text
docs/PHASE_7_0_TELEGRAM_PRODUCT_INTERFACE_PLANNING.md
```

Fase 7.1 agrega el contrato versionado del menu producto Telegram, sin tocar
workflows ni logica fiscal:

```text
docs/PHASE_7_1_TELEGRAM_PRODUCT_MENU_CONTRACT.md
scripts/lib/telegram-product-menu-contract.js
```

Fase 7.1B define la topologia oficial Telegram/n8n: un unico punto de entrada
operativo para Telegram, con crecimiento preferente en Action Layer, PostgreSQL,
contratos y modulos testeables:

```text
docs/PHASE_7_1B_TELEGRAM_N8N_WORKFLOW_TOPOLOGY.md
```

Fase 7.1C estabiliza la UX real de borradores en Telegram: preview corto,
botones de edicion por campo, aprobacion explicita, regreso a borrador y
`Ver resumen` no ambiguo:

```text
docs/PHASE_7_1C_TELEGRAM_DRAFT_UX_STABILIZATION.md
```

Fase 7.2 agrega el renderer puro del menu producto Telegram. Produce payloads
seguros de texto y `inline_keyboard`, pero no envia mensajes ni toca workflows:

```text
docs/PHASE_7_2_TELEGRAM_PRODUCT_MENU_RENDERER.md
scripts/lib/telegram-product-menu-renderer.js
```

Fase 7.3 conecta los callbacks visibles del menu producto con el router
primario de Telegram; cada boton navega, ejecuta una accion segura existente o
responde pendiente explicito:

```text
docs/PHASE_7_3_TELEGRAM_PRODUCT_MENU_ROUTER_ADAPTER.md
scripts/test-telegram-product-menu-router-adapter.js
```

Fase 7.4 integra el flujo de producto diario dentro del workflow primario:
`/start` abre el menu producto, clientes/reportes/estado tienen respuestas
claras y las acciones sensibles siguen usando action tokens:

```text
docs/PHASE_7_4_PRODUCT_FLOW_INTEGRATION.md
scripts/test-telegram-product-flow-integration.js
```

Fase 7.5 agrega una consola OWNER/admin de PAC Sandbox dentro del workflow
primario. Usa Factura.com Sandbox como proveedor de prueba por Action Layer
allowlisted; permite timbrado sandbox, pero mantiene bloqueado el timbrado
productivo fiscal real:

```text
docs/PHASE_7_5_TELEGRAM_PAC_SANDBOX_STAMPING_CONSOLE.md
scripts/test-telegram-pac-sandbox-console.js
```

Fase 7.6 conecta borradores `APROBADO` reales del flujo Telegram con el Action
Layer `sandbox.draft.stamp`. El workflow usa `cfdi:<token>`, no construye
payload PAC, no llama Factura.com directo y no envia XML/PDF/ZIP/Excel por
Telegram:

```text
docs/PHASE_7_6_APPROVED_DRAFT_TO_PAC_SANDBOX.md
scripts/test-approved-draft-to-pac-sandbox.js
```

Fase 7.7 agrega el ciclo de cancelacion sandbox para CFDI en estado
`SANDBOX_TIMBRADO`: doble confirmacion por action token, Action Layer
`sandbox.draft.cancel`, estado `SANDBOX_CANCELADO`/`SANDBOX_CANCEL_ERROR`,
evento local y manifest seguro bajo `runtime/storage-sandbox/`, sin
cancelacion productiva ni envio de XML/PDF/ZIP/Excel por Telegram:

```text
docs/PHASE_7_7_SANDBOX_CFDI_LIFECYCLE_CANCELLATION.md
scripts/test-sandbox-cfdi-lifecycle-cancellation.js
```

Fase 7.8 agrega revision local del lifecycle storage sandbox y nombres
human-readable seguros para artifacts locales. Genera reportes bajo
`runtime/storage-sandbox/reports/`, indexa documentos por cliente, periodo,
estatus e ids internos, valida checksums y evita exponer RFC, UUID, UID, rutas
absolutas, XML/PDF completos, secretos o credenciales:

```text
docs/PHASE_7_8_SANDBOX_LIFECYCLE_STORAGE_REVIEW.md
scripts/review-sandbox-lifecycle-storage.js
scripts/lib/sandbox-human-readable-storage-naming.js
```

Fase 7.9 separa formalmente `invoice_status` de `payment_status`, agrega
migracion SQL aditiva, eventos de pago y helpers puros para resumen por cliente,
pendientes, pagadas, vencidas y canceladas sin activar produccion:

```text
docs/PHASE_7_9_INVOICE_PAYMENT_STATUS_MODEL.md
sql/007_invoice_payment_status.sql
scripts/lib/invoice-payment-status-model.js
```

Fase 7.10 agrega una vista segura de ledger por cliente en el flujo primario de
Telegram. Muestra `invoice_status`, `payment_status`, pendientes, pagadas y
canceladas separadas, sin cobro automatico ni envio de XML/PDF/ZIP/Excel:

```text
docs/PHASE_7_10_CLIENT_INVOICE_LEDGER_VIEW.md
scripts/lib/client-invoice-ledger-view.js
scripts/test-client-invoice-ledger-view.js
```

Fase 7.10B endurece la UX PAC Sandbox: renombra los smoke como fixtures
tecnicos, agrega lista de borradores `APROBADO` para `sandbox.draft.stamp` y
reduce duplicados de callback a respuestas minimas:

```text
docs/PHASE_7_10B_TELEGRAM_PAC_SANDBOX_DRAFT_SELECTION_UX.md
scripts/test-telegram-pac-sandbox-draft-selection-ux.js
```

Fase 7.10C agrega observabilidad local de latencia para el flujo principal de
Telegram. Registra eventos seguros `TELEGRAM_LATENCY_EVENT` en `bot_events`,
analiza ACK de callbacks, duplicados, locks, `sendMessage` y tiempo total sin
cambiar decisiones de negocio:

```text
docs/PHASE_7_10C_TELEGRAM_BOT_PERFORMANCE_OBSERVABILITY.md
scripts/analyze-telegram-bot-latency.js
scripts/test-telegram-bot-latency-observability.js
```

Fase 7.10D agrega el export seguro desde PostgreSQL hacia JSONL para analizar
eventos reales de latencia y diagnosticar callbacks donde el ACK es rapido pero
`total_ms` queda alto:

```text
docs/PHASE_7_10D_TELEGRAM_LATENCY_DB_EXPORT_DIAGNOSIS.md
scripts/export-telegram-latency-events.js
scripts/test-telegram-latency-db-export.js
```

Fase 7.10E agrega plantillas locales de arranque para n8n/runner con
`NODE_OPTIONS=--dns-result-order=ipv4first`, diagnostico seguro de stdout/stderr
del Action Layer y ayuda Telegram con comandos de usuario y OWNER separados:

```text
docs/PHASE_7_10E_LOCAL_RUNTIME_STARTUP_AND_STAMP_DIAGNOSTICS.md
scripts/local/start-n8n-pac-sandbox.example.ps1
scripts/test-local-startup-and-stamp-diagnostics.js
```

Fase 7.11 agrega botones Telegram con `cfdi:<token>` para cambiar manualmente
`payment_status` de facturas `SANDBOX_TIMBRADO`, registra eventos auditables y
mantiene `invoice_status` intacto:

```text
docs/PHASE_7_11_PAYMENT_STATUS_COMMAND_ADAPTER.md
scripts/lib/payment-status-action.js
scripts/test-payment-status-command-adapter.js
```

Fase 7.12 agrega una vista de resumen de cobranza y antiguedad de saldos por
cliente, solo lectura, sin cobro automatico ni conciliacion bancaria:

```text
docs/PHASE_7_12_CLIENT_BILLING_SUMMARY_AGING_VIEW.md
scripts/lib/client-billing-summary-view.js
scripts/test-client-billing-summary-view.js
```

Fase 7.13 agrega un dashboard mensual global de cobranza sandbox desde Telegram,
usando `invoice_status`, `payment_status`, ledger por cliente y aging global:

```text
docs/PHASE_7_13_MONTHLY_BILLING_DASHBOARD.md
scripts/lib/monthly-billing-dashboard-view.js
scripts/test-monthly-billing-dashboard-view.js
```

Fase 7.14 conecta `Paquete contador` del menu producto con el Action Layer
`sandbox.full.monthly.package`. Genera artifacts solo en `runtime/` y devuelve
un resumen seguro por Telegram, sin adjuntar ZIP/Excel/XML/PDF/CSV/JSON:

```text
docs/PHASE_7_14_ACCOUNTANT_PACKAGE_PRODUCT_INTEGRATION.md
scripts/lib/accountant-package-product-view.js
scripts/test-accountant-package-product-integration.js
```

Fase 7.14B corrige la semantica de tokens/callbacks de Telegram para que
menu y vistas sean reutilizables, mientras las acciones sensibles siguen siendo
one-time/idempotentes. Tambien estabiliza el contrato stdout de
`sandbox.draft.stamp` para n8n:

```text
docs/PHASE_7_14B_TOKEN_SEMANTICS_AND_DRAFT_STAMP_CONTRACT.md
scripts/test-telegram-token-semantics.js
scripts/test-sandbox-draft-stamp-stdout-contract.js
```

Fase 7.14C corrige el flujo real `sandbox.draft.stamp --draft-id`: carga el
borrador desde PostgreSQL local cuando no hay snapshot embebido, mantiene JSON
estable con exit code 0 para errores controlados y separa correctamente
`status`, `invoice_status` y `payment_status`:

```text
docs/PHASE_7_14C_DRAFT_LOADER_STATUS_MAPPING_EXECUTE_COMMAND_CONTRACT.md
scripts/test-sandbox-draft-stamp-db-loader.js
scripts/test-sandbox-action-cli-json-contract.js
scripts/test-sandbox-draft-status-mapping.js
```

Fase 7.14D hidrata el perfil fiscal vigente del cliente desde PostgreSQL antes
del timbrado sandbox, corrige validacion por indice visual de clientes y
preserva contexto de borrador/cliente/total en errores reintentables:

```text
docs/PHASE_7_14D_CLIENT_FISCAL_PROFILE_DRAFT_HYDRATION_FIX.md
scripts/test-client-fiscal-profile-ux.js
scripts/test-sandbox-draft-client-hydration.js
scripts/test-sandbox-draft-stamp-context-preservation.js
```

Fase 7.14E evita el auto-bloqueo `DRAFT_SANDBOX_IN_PROGRESS` del timbrado
sandbox desde Telegram/n8n: el workflow ya no pre-marca
`invoice_status=SANDBOX_TIMBRANDO` ni envia snapshots stale por
`--draft-json-b64`; el Action Layer carga fresco por `--draft-id`:

```text
docs/PHASE_7_14E_SANDBOX_STAMP_IN_PROGRESS_SELF_BLOCKING_FIX.md
scripts/test-sandbox-stamp-in-progress-self-blocking.js
scripts/test-telegram-sandbox-stamp-workflow-state-order.js
```

Fase 7.15 agrega timbrado live contra Factura.com Sandbox en el adapter, con
modo mock por defecto y live solo con `FACTURACOM_SANDBOX_MODE=live` +
`FACTURACOM_SANDBOX_LIVE=1`. El Action Layer guarda manifests sanitizados bajo
`runtime/storage-sandbox/draft-stamps/` y Telegram solo muestra presencia de
UUID/PAC ID/XML/PDF, sin valores ni documentos:

```text
docs/PHASE_7_15_FACTURACOM_SANDBOX_LIVE_STAMPING_ADAPTER.md
scripts/test-factura-com-sandbox-live-adapter-contract.js
scripts/test-factura-com-sandbox-live-gating.js
scripts/test-sandbox-draft-stamp-live-mode.js
scripts/test-sandbox-live-stamp-storage-manifest.js
```

Siguiente fase recomendada: `7.16 Sandbox XML/PDF Download and Client Storage`.

### Fase 7.16 - Sandbox XML/PDF Download and Client Storage

La fase 7.16 agrega la accion allowlisted
`sandbox.draft.download-artifacts` para descargar XML/PDF de Factura.com
Sandbox hacia `runtime/storage-sandbox/` y storage por cliente/factura. Corrige
la semantica: `xml_provider_available/pdf_provider_available` solo significa
descargable por proveedor; `xml_downloaded/pdf_downloaded` significa archivo
local guardado. Telegram muestra solo resumen seguro y no envia documentos.

Documento: `docs/PHASE_7_16_SANDBOX_XML_PDF_DOWNLOAD_CLIENT_STORAGE.md`.

7.16B endurece el timbrado producto desde Telegram: `STAMP_DRAFT_SANDBOX`
requiere Factura.com Sandbox Live con `--require-live-sandbox`. El mock queda
solo para tests/fixtures y ya no se usa como fallback operativo desde Telegram.
El Action Layer resuelve configuracion con un resolver canonico desde
`process.env` o `.env.pac.sandbox.local`; n8n no contiene credenciales PAC.

Documento: `docs/PHASE_7_16B_FACTURACOM_SANDBOX_OPERATIVO_LIVE.md`.

### SATBOT multi-provider evolution

7.16C agrega foundation multi-tenant + multi-provider: Factura.com sigue como
provider personal actual, Facturapi queda como provider comercial futuro
preferente y SATBOT Core usa Canonical Provider Contracts. Tenant Fiscal
Profile sera obligatorio antes de vender el bot; Fiscal Activity Rules permitira
sugerir conceptos segun regimen/giro con revision humana.

Documentos:

- `docs/ADR_0001_MULTITENANT_MULTIPROVIDER_SATBOT.md`
- `docs/PHASE_7_16C_MULTIPROVIDER_CANONICAL_FOUNDATION.md`
- `docs/FISCAL_ACTIVITY_RULES_ARCHITECTURE.md`
- `docs/PHASE_B_TENANT_FISCAL_PROFILE_ACTIVITY_RULES.md`
- `docs/CFDI_40_RULE_ENGINE_ARCHITECTURE.md`
- `docs/SAT_CATALOG_IMPORT_RUNBOOK.md`

Fase B agrega foundation de fuentes SAT, catalogo CFDI 4.0, Rule Engine
advisory, Tenant Fiscal Profile y Fiscal Activity Rules. Sigue bloqueado
produccion/PAC real/timbrado productivo; todo requiere revision humana.

7.16D asienta los modos de producto SATBOT, politicas de aprobacion y roadmap
SaaS sin cambios operativos visibles: `docs/ADR_0002_SATBOT_PRODUCT_MODES_AND_APPROVALS.md`,
`docs/ROADMAP_SAAS_PRODUCT_MODES_APPROVALS.md`,
`docs/APPROVAL_POLICY_ARCHITECTURE.md` y
`docs/CHANNEL_ADAPTERS_TELEGRAM_WHATSAPP_ROADMAP.md`.

7.16E agrega Factura.com Sandbox Provider Client Sync:
`sandbox.provider.client.lookup`, `sandbox.provider.client.sync`,
`sandbox.provider.client.link` y `sandbox.provider.client.diagnose`. El
timbrado sandbox live normal usa `provider_client_links.provider_client_uid`;
`FACTURACOM_SANDBOX_RECEIVER_UID` queda solo como fallback legacy/test con
bandera explicita. Ver
`docs/PHASE_7_16E_FACTURACOM_PROVIDER_CLIENT_SYNC.md` y
`docs/PROVIDER_CLIENT_LINK_ARCHITECTURE.md`.

En entorno local Docker, las acciones del Action Layer que consultan
PostgreSQL pueden usar `CFDI_DB_EXEC_MODE=docker` con el contenedor
`cfdi-postgres` para evitar password TCP contra `127.0.0.1:5432`.

7.16I agrega validacion de contenido XML/PDF sandbox antes de marcar descargas
como validas o copiarlas a storage por cliente. Placeholders como `CFDI XML` o
`CFDI PDF` quedan en error seguro, no como `*_downloaded=true`. Tambien deja
preparado un canal privado de entrega documental por Telegram, deshabilitado por
default y en dry-run salvo opt-in explicito. Ver
`docs/SANDBOX_XML_PDF_CONTENT_VALIDATION.md` y
`docs/TELEGRAM_DOCUMENT_DELIVERY_CHANNEL.md`.

7.16J fortalece esa capa con validacion visual de PDF, aliases humanos seguros
para XML/PDF bajo `exports/`, contrato canonico de entrega documental y Provider
Email Delivery sandbox via Factura.com. SMTP queda solo como opcion futura no
implementada. Ver `docs/PDF_VISUAL_CONTENT_VALIDATION.md`,
`docs/DOCUMENT_DELIVERY_CANONICAL_CONTRACT.md` y
`docs/PROVIDER_EMAIL_DELIVERY_ARCHITECTURE.md`.

7.16K agrega diagnostico no destructivo de PDF sandbox, retry acotado para PDF
no listo, ruteo correcto de Provider Email Delivery, verificacion de
`--db-exec-mode docker` y diagnostico/sync de email principal del cliente. Ver
`docs/PHASE_7_16K_FACTURACOM_PDF_PROVIDER_EMAIL_SYNC.md`.
Validacion local live: PDF sandbox confirmado visualmente y almacenado con
`human_pdf_path`; provider email diagnose listo con email primario sincronizado.

7.16L corrige integridad raw de XML/PDF sandbox: los artifacts finales ya no
pueden contener `[REDACTED_]`, XObject/Image no basta para validar PDF, y existe
fallback local `pdf_source=LOCAL_RENDERED_FROM_XML` desde XML raw validado. Ver
`docs/PHASE_7_16L_PDF_ARTIFACT_REALITY_FIX.md` y
`docs/PDF_LOCAL_RENDERED_FALLBACK.md`.

7.17 conecta la UX Telegram/n8n de entrega documental sandbox con confirmacion
humana, acciones Action Layer `sandbox.documents.delivery.status|prepare|confirm|send|ledger`,
ledger local `document_delivery_ledger`, bloqueo de duplicados por idempotencia
y diagnostico seguro de errores Telegram/Provider Email. V3 SAFE queda como
launcher local recomendado, sin versionar sus scripts locales. Ver
`docs/PHASE_7_17_TELEGRAM_DELIVERY_UX_LEDGER.md`,
`docs/DOCUMENT_DELIVERY_LEDGER.md`, `docs/TELEGRAM_DELIVERY_UX_RUNBOOK.md` y
`docs/LOCAL_LAUNCHER_V3_SAFE_RUNBOOK.md`.
7.17B corrige la persistencia de tokens `DELIVERY_CONFIRM_*`; reimporta
`workflow/cfdi_telegram_local_ingest.n8n.json` en n8n para activar el fix.
Ver `docs/PHASE_7_17B_TELEGRAM_DELIVERY_CONFIRM_TOKEN_FIX.md`.
7.17C recupera callbacks usados/expirados en timbrado sandbox, descarga XML/PDF
y delivery: un segundo click debe mostrar estado actual y botones frescos, no
un callejon sin salida con `token_usado`. Reimporta el workflow principal.
Ver `docs/PHASE_7_17C_TELEGRAM_CALLBACK_LIFECYCLE_RECOVERY.md`.

7.18A agrega el gate read-only `sandbox.provider.client.readiness`: valida
`cfdi_clients + provider_client_links` antes de timbrado sandbox live, separa
`ready_for_provider_stamp` de `ready_for_provider_email`, y deja
`FACTURACOM_SANDBOX_RECEIVER_UID` solo como fallback legacy con
`--allow-legacy-receiver-uid`. Ver
`docs/PHASE_7_18A_PROVIDER_CLIENT_READINESS_GATE.md`,
`docs/PROVIDER_CLIENT_SYNC_ARCHITECTURE.md` y
`docs/PROVIDER_CLIENT_READINESS_RUNBOOK.md`.

7.16F agrega foundation para un bot Telegram compartido:
`telegram_user_id` es identidad de canal, `tenant_id` conserva la suscripcion y
los entitlements resuelven acciones permitidas. Una suscripcion vencida pasa a
`READ_ONLY`, no a bloqueo total. Trial/demo y bots dedicados quedan como futuro.
Ver `docs/ADR_0003_SHARED_TELEGRAM_BOT_ACCESS_MODEL.md` y
`docs/ROADMAP_SHARED_BOT_SUBSCRIPTION_ACCESS.md`.

Siguiente fase recomendada: cerrar 7.17 con evidencia E2E local o documentar
`NO VALIDADO END-TO-END` cuando falte Docker, n8n, Telegram o credenciales.

El roadmap formal de transicion desde Telegram + Factura.com Sandbox hacia
produccion futura queda fijado en:

- `docs/PAC_SANDBOX_TO_PRODUCTION_ROADMAP.md`

### Politica conversacional 4.7

El bot mantiene una sola factura activa por chat. Si hay un preview abierto, cualquier mensaje normal actualiza ese borrador en lugar de iniciar otro flujo aislado.

Si el cliente parece tener typo, por ejemplo `Privada Riviera` o `Privada Riveira`, el bot no crea cliente automatico. Primero pregunta si quisiste decir `Privada Rivera` y ofrece usar ese cliente, crear uno nuevo, continuar sin cliente o cancelar.

### Politica de clientes 5D

La busqueda de clientes usa coincidencia exacta normalizada, contains, overlap de tokens distintivos y distancia fuzzy. Palabras genericas como `privada`, `residencial`, `cliente`, `sociedad`, `sa` o `ac` no generan match fuerte por si solas.

Ejemplos esperados:

- `Ariatza`, `Areatza` o `Privada Ariatza` sugieren `Privada Areatza`.
- `Rivera` sugiere `Privada Rivera`.
- `Privada ricrsa` no debe sugerir `Privada Rivera` solo por compartir `privada`.

En `NEEDS_CLIENT_DECISION`, escribir otro nombre de cliente vuelve a buscar desde cero y actualiza `client_query`; ya no queda anclado al intento anterior. Responder `?`, `ayuda`, `que hago` o `que necesitas` muestra ayuda contextual del estado.

Durante un preview puedes responder `editar` o `/editar`. En modo edicion acepta plantilla, lineas numeradas o conceptos separados por coma con montos propios como:

```text
1.instalacion de camaras 800 + IVA
2.- venta de camara CCTV 700 + IVA
```

Tambien acepta mensajes rapidos con varias partidas claras:

```text
Ariatza, instalacion de camara CCTV 800 + IVA, servicio de mantenimiento Equipo CCTV 500 + IVA
```

En ese caso el bot conserva las partidas como line items separados. Cada linea se scorea contra `data/concepts.normalized.json`, usa su propia clave SAT/unidad, calcula impuestos por linea y muestra un preview `BORRADOR CFDI MULTILINEA`. No crea `cfdi_drafts` ni `cfdi_draft_line_items` hasta que respondas `confirmar`.

### Guardrails fiscales 5E

La matriz fiscal del MVP esta documentada en:

- `docs/FISCAL_ACTIVITY_GUARDRAILS.md`
- `docs/BUSINESS_SCENARIO_MATRIX.md`

El bot asume emisor RESICO regimen `626` y solo permite familias relacionadas con las actividades actuales: CCTV, control de acceso, barreras, red/comunicacion y computo. Categorias como software, apps, web, SaaS, n8n, IA, marketing, diseno, video, consultoria profesional, comida, construccion general, plomeria, pintura, renta de equipo y electricidad general no ligada al equipo actual se bloquean o piden revision fiscal.

Si un mensaje mezcla material y mano de obra en un solo monto, el bot entra a `NEEDS_MATERIAL_LABOR_DECISION` y pregunta si se separa, si se trata como servicio integral, si es producto con instalacion incluida o si se cancela. Si varias actividades comparten un monto global, entra a `NEEDS_GLOBAL_AMOUNT_DECISION` y pide dividir por linea o tratarlo como servicio integral. En ambos casos no crea draft final hasta que el usuario resuelva la decision y confirme el preview.

Las facturas largas deben soportar al menos 10 partidas. Si hay mas de 10, el preview se compacta y sugiere usar `/ver`; el contexto completo se conserva para confirmar o editar. Todo sigue siendo BORRADOR SUJETO A REVISION HUMANA.

### Expansion controlada de catalogo 5G

La ampliacion de conceptos no modifica `data/concepts.normalized.json` ni el Excel fuente. Primero requiere colocar un catalogo oficial SAT local en:

```text
data/sat_official/
```

Si falta `catCFDI` oficial, los scripts se detienen con:

```text
Falta catálogo oficial SAT. Coloca el archivo oficial catCFDI del SAT en data/sat_official/ y vuelve a ejecutar.
```

Flujo:

```bash
node scripts/import-sat-catalog.js --source "C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD"
node scripts/propose-resico-catalog-expansion.js
node scripts/audit-catalog-gaps.js
```

Salidas:

- `data/catalog_expansion/proposed_concepts.resico_626.json`
- `data/catalog_expansion/concepts.normalized.candidate.json`
- `data/sat_official/imported_sat_catalog.normalized.json`
- `docs/SAT_COMPACT_FILES_INVENTORY.md`
- `docs/COMPACT_CATALOG_ANALYSIS.md`
- `docs/SAT_CATALOG_RELATIONSHIP_MAP.md`
- `docs/CATALOG_GAPS_REPORT.md`

El candidate queda sin activar hasta revision humana. No se inventan claves SAT; todo concepto sugerible nuevo debe venir con `source=SAT_OFFICIAL`, `clave_prod_serv`, `clave_unidad` y trazabilidad al archivo SAT local. La vista normal del borrador oculta campos internos como familia, tipo, score, keywords y notas de guardrail.

Si la carpeta trae catalogos auxiliares SAT pero no trae `c_ClaveProdServ` oficial, la propuesta queda bloqueada como `BLOCKED_MISSING_OFFICIAL_CLAVE_PROD_SERV`. El PDF Compact solo se usa como referencia; sus claves quedan como `NEEDS_OFFICIAL_CONFIRMATION` hasta cruzarlas contra un catalogo SAT oficial local de producto/servicio.

Comandos utiles durante edicion:

- `/editlinea N TEXTO`
- `/quitarlinea N`
- `/ver`
- `/estado`
- `/cancelar`

Si una linea queda ambigua, el estado pasa a `LINE_NEEDS_CLARIFICATION`. Mensajes como `que necesitas`, `trabajo`, `ayuda` o `?` explican exactamente que falta y muestran como reescribir la linea. Mientras existan blockers, `confirmar` no crea `cfdi_drafts`.

## Limites fiscales

- No timbra CFDI productivo fiscal real.
- No usa PAC de produccion.
- No captura automaticamente en SAT.
- No envia WhatsApp.
- No expone webhook a internet.
- Toda salida requiere revision humana.
- Todo calculo de impuestos es conservador y debe leerse como: BORRADOR SUJETO A REVISION HUMANA.

## Fase 7.17F: dispatch Telegram post-action

La UX sandbox debe mostrar respuesta visible despues de cada callback exitoso.
El workflow local ahora planea el dispatch, intenta editar el mensaje del
callback y cae a `sendMessage` si Telegram no permite editar.

Contratos cubiertos:

- timbrado sandbox muestra el boton `Descargar XML/PDF sandbox`;
- descarga XML/PDF muestra botones de entrega;
- prepare de canal/correo muestra confirmacion con el token confirm real;
- si un prepare ya fue usado pero el confirm token sigue vigente, se reconstruye
  el menu de confirmacion;
- no se implementa 7.18B ni Provider Client Sync UX.

Runbook: `docs/PHASE_7_17F_TELEGRAM_POST_ACTION_RESPONSE_DISPATCH.md`.
