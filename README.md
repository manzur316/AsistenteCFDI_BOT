# Asistente CFDI BOT

Motor offline y workflows n8n locales para sugerir conceptos CFDI desde mensajes cortos. El alcance actual es MVP personal Emberhub: solo ayuda a elegir un concepto para captura manual en SAT.

## Fuente de verdad

El runtime versionado usa:

- `data/concepts.normalized.json`

Ese JSON fue generado desde la base fiscal original y no debe contener conceptos, claves SAT, unidades ni actividades inventadas.

Por seguridad, el Excel fuente `data/base_cfdi_resico_n8n_emberhub_2026.xlsx` no se versiona en Git. Si necesitas regenerar el JSON, coloca el Excel localmente en esa ruta y ejecuta el proceso de normalizacion offline correspondiente, verificando despues los tests.

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

- No timbra CFDI.
- No usa PAC.
- No captura automaticamente en SAT.
- No envia WhatsApp.
- No expone webhook a internet.
- Toda salida requiere revision humana.
- Todo calculo de impuestos es conservador y debe leerse como: BORRADOR SUJETO A REVISION HUMANA.
