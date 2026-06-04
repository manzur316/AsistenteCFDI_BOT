# Factura.com Sandbox Payload Mapper

## Estado

Fase 6A.5 agrega un mapper mock/no-live para Factura.com Sandbox.

Este mapper:

- No usa credenciales.
- No lee variables de entorno.
- No llama API.
- No crea XML/PDF.
- No timbra CFDI real.
- No abre produccion.
- No modifica workflows.

## Frontera de arquitectura

El nucleo del bot habla contratos canonicos internos:

```text
CanonicalDraft -> CanonicalInvoiceDocument -> CanonicalPacRequest
```

Factura.com solo existe dentro de:

```text
scripts/lib/factura-com-payload-mapper.js
scripts/lib/factura-com-sandbox-adapter.js
```

Telegram, Storage, Reporting, Draft Engine y Miniapp no deben depender de
campos especificos de Factura.com.

## Mapper

`scripts/lib/factura-com-payload-mapper.js` traduce un
`CanonicalInvoiceDocument` y su contexto canonico a un payload mock de
Factura.com Sandbox.

Fase 6A.5B agrega discovery oficial desde:

- `docs/FACTURACOM_OFFICIAL_API_DISCOVERY.md`
- `data/sandbox/facturacom-official-contract.notes.json`

El mapper conserva su payload mock interno y agrega una seccion
`official_request` con nombres de campo confirmados por documentacion oficial.

Los campos del proveedor que siguen sin dato local se marcan con:

```text
TODO_DOCS_REQUIRED
```

Eso evita presentar esta estructura como integracion productiva o definitiva.

## Campos Confirmados Por Documentacion Oficial

Para `POST /v4/cfdi40/create`, la documentacion oficial confirma:

- `Receptor`
- `Receptor.UID`
- `Receptor.RegimenFiscalR`
- `TipoDocumento`
- `RegimenFiscal`
- `Conceptos`
- `UsoCFDI`
- `Serie`
- `FormaPago`
- `MetodoPago`
- `Moneda`
- `EnviarCorreo`
- `LugarExpedicion`
- `Comentarios`

Para cada concepto confirma:

- `ClaveProdServ`
- `Cantidad`
- `ClaveUnidad`
- `Unidad`
- `ValorUnitario`
- `Descripcion`
- `Importe`
- `ObjetoImp`
- `Impuestos.Traslados`
- `Impuestos.Retenidos`
- `Impuestos.Locales`

El mapper llena esos nombres dentro de:

```text
payload.official_request.body
```

La estructura canonica anterior se mantiene para no acoplar el bot completo a
Factura.com.

## Campos Que Siguen TODO_DOCS_REQUIRED

Estos datos no se inventan:

- `Receptor.UID`: requiere cliente creado en Factura.com sandbox.
- `Serie`: requiere id de serie dado de alta en panel sandbox.
- `FormaPago`: debe capturarse o configurarse.
- `MetodoPago`: debe capturarse o configurarse.
- `Moneda`: debe capturarse o configurarse.
- `LugarExpedicion`: debe confirmarse con CP emisor/sucursal.
- Valor local de `F-PLUGIN`: debe vivir fuera del repo.
- Estructura real de warnings: no quedo confirmada en las paginas auditadas.

## Normalizacion

El mapper tambien normaliza respuestas mock:

- success -> `CanonicalPacResult` con `ok=true`
- error -> `CanonicalPacResult` con `ok=false` y `normalized_errors`
- cancelacion sandbox mock -> operacion `cancelInvoice`

## Adapter Mock

`scripts/lib/factura-com-sandbox-adapter.js` es una fachada mock.

Expone:

- `createSandboxPayload`
- `validateSandboxPayload`
- `mockStampSandbox`
- `mockCancelSandbox`
- metodos del contrato PAC interno para compatibilidad

No contiene transporte, endpoints, llaves ni credenciales.

## Produccion

Produccion queda bloqueada. Cualquier payload o request que no sea `SANDBOX`
debe fallar de forma controlada.

## Siguiente Fase

La fase 6A.6 puede agregar un smoke controlado contra sandbox real solo si:

- `FACTURACOM_SANDBOX_LIVE=1`
- existen credenciales locales no versionadas
- existe `Receptor.UID` sandbox de cliente demo
- existe `Serie` sandbox
- estan definidas `FormaPago`, `MetodoPago`, `Moneda`, `UsoCFDI` y
  `LugarExpedicion`
- 6A.3B sigue activo antes de cualquier prueba real
- la prueba no toca produccion
- la prueba no sube XML/PDF reales al repo

Todo resultado sigue siendo:

```text
BORRADOR SUJETO A REVISION HUMANA
```

## Smoke Sandbox Controlado 6A.6

La fase 6A.6 agrega un arnes local, apagado por defecto:

- `scripts/lib/factura-com-live-client.js`
- `scripts/smoke-factura-com-sandbox.js`
- `scripts/analyze-factura-com-sandbox-results.js`

Dry-run sin llamadas:

```powershell
node scripts/smoke-factura-com-sandbox.js
```

Debe imprimir:

```text
SKIPPED: live disabled
```

Smoke live sandbox, solo con opt-in local:

```powershell
$env:FACTURACOM_SANDBOX_LIVE="1"
$env:FACTURACOM_BASE_URL="https://sandbox.factura.com/api"
$env:FACTURACOM_API_KEY="REEMPLAZAR_LOCALMENTE"
$env:FACTURACOM_SECRET_KEY="REEMPLAZAR_LOCALMENTE"
$env:FACTURACOM_PLUGIN="REEMPLAZAR_LOCALMENTE"
$env:FACTURACOM_SANDBOX_SERIE="REEMPLAZAR_LOCALMENTE"
$env:FACTURACOM_SANDBOX_USO_CFDI="G03"
$env:FACTURACOM_SANDBOX_FORMA_PAGO="03"
$env:FACTURACOM_SANDBOX_METODO_PAGO="PUE"
$env:FACTURACOM_SANDBOX_MONEDA="MXN"
$env:FACTURACOM_SANDBOX_LUGAR_EXPEDICION="00000"
node scripts/smoke-factura-com-sandbox.js
```

Los flags separados son:

- `FACTURACOM_SANDBOX_CREATE_CLIENTS=0|1`
- `FACTURACOM_SANDBOX_DOWNLOAD_TEST=0|1`
- `FACTURACOM_SANDBOX_CANCEL_TEST=0|1`
- `FACTURACOM_SANDBOX_BATCH_SIZE=1|5`
- `FACTURACOM_SKIP_AUTH_PREFLIGHT=1` solo para pruebas unitarias controladas.

Preflight live local recomendado antes del smoke:

```powershell
node scripts/preflight-facturacom-auth.js
```

El preflight usa las mismas variables locales, llama solo
`GET /v1/clients?per_page=1`, no crea clientes, no crea CFDI, no descarga
XML/PDF y guarda `runtime/facturacom-sandbox/preflight-auth-response.json`
sanitizado. Debe pasar como `AUTH_OK` antes de perseguir errores de payload CFDI.
El error `La cuenta que intenta autenticarse no existe` indica autenticacion,
cuenta o ambiente Factura.com; no debe contarse como cliente existente.

Cuando `FACTURACOM_SANDBOX_CREATE_CLIENTS=1`, el smoke puede crear clientes demo
en sandbox y resolver `Receptor.UID` sin tocar datos reales. Si la respuesta de
creacion no trae UID, o si Factura.com devuelve HTTP 2xx con
`response/status=error`, busca por RFC en:

- `GET /v1/clients/{RFC}`
- `GET /v1/clients?rfc={RFC}`

El UID encontrado se guarda en `runtime/facturacom-sandbox/client-uids.local.json`.
Ese archivo es local, contiene identificadores sandbox y no debe versionarse. Si
el lookup no encuentra UID o encuentra multiples clientes indistinguibles, el
intento queda detenido como `CLIENT_CREATE_FAILED`, `CLIENT_UID_MISSING` o
`CLIENT_UID_AMBIGUOUS`; no se manda `POST /v4/cfdi40/create`.

Ese UID se guarda como `client_uid`. No es identidad de factura, no debe usarse
como `cfdi_uid` y no debe convertirse en `invoice_id` de Storage.

## Guard Local UsoCFDI/Receptor 6A.7I

Antes de llamar `POST /v4/cfdi40/create`, el mapper ejecuta
`scripts/lib/cfdi-receptor-compatibility-validator.js`. La validacion usa la
matriz derivada `data/knowledge_base/cfdi40_uso_cfdi_compatibility.derived.json`,
generada desde `cfdi40_master_knowledge.json`, que a su vez viene del catalogo
SAT `catCFDI_V_4_20260603.xls`.

Campos obligatorios antes de PAC:

- `Receptor.UID`.
- `Receptor.RegimenFiscalR`.
- `UsoCFDI`.
- RFC receptor con forma valida normalizada.
- Tipo de persona inferido desde RFC.

Si falla, el intento queda `CFDI_LOCAL_RULE_ERROR`, aumenta
`local_cfdi_rule_errors`, `receptor_compatibility_errors` y
`needs_local_config`, guarda un artifact `CFDI_LOCAL_RULE_ERROR` sanitizado y no
manda el request CFDI al PAC. Codigos locales esperados:

- `LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH`.
- `LOCAL_INVALID_RFC_SHAPE`.
- `LOCAL_RFC_HAS_HIDDEN_CHARACTERS` como warning cuando el RFC se puede evaluar
  por forma normalizada sin imprimirlo completo.
- `LOCAL_USO_CFDI_REQUIRED`.
- `LOCAL_REGIMEN_FISCAL_RECEPTOR_REQUIRED`.
- `LOCAL_RECEPTOR_UID_REQUIRED`.

El analyzer reporta `effective_uso_cfdi`,
`effective_regimen_fiscal_receptor`, `effective_person_type`, `rfc_shape`,
`local_cfdi_rule_errors`, `invalid_rfc_shape_detected` y estado de
compatibilidad UsoCFDI. El inspector puede mostrar valores exactos de catalogo
seguros (`UsoCFDI`, `RegimenFiscalR`, `FormaPago`, `MetodoPago`,
`ClaveProdServ`, `ClaveUnidad`, `ObjetoImp`, `Impuesto`, `TipoFactor`,
`TasaOCuota`) pero mantiene redactados RFC completo, secretos, UID largos,
XML/PDF y tokens.

## Guard Final Receptor/Payload 6A.7J

El mapper puede construir un payload valido en abstracto, pero el smoke debe
validar el `body` final que realmente se va a guardar y enviar. Desde 6A.7J:

- `buildClientCreateBody` usa RFC normalizado; el RFC raw nunca debe llegar al
  cuerpo de `CLIENT_CREATE`.
- Si el RFC normalizado queda con forma invalida, se corta en
  `LOCAL_INVALID_RFC_SHAPE` antes de `CLIENT_CREATE_REQUEST`.
- `validateFinalCfdiReceptorPayload` revisa `body.UsoCFDI`,
  `body.Receptor.RegimenFiscalR`, `body.Receptor.UID` y la forma RFC segura
  justo antes de `CFDI_CREATE_REQUEST`.
- `attempt.receptor_compatibility` y el artifact `CFDI_CREATE_REQUEST` incluyen
  el reporte seguro tambien cuando `compatibility_status=PASS`.
- Si existe respuesta de cliente sandbox, se cruzan `RegimenId`, `UsoCFDI`,
  presencia de UID y forma RFC contra el body final. Un mismatch que afecte
  regimen/UsoCFDI/persona corta como `CLIENT_CFDI_RECEPTOR_MISMATCH`.

El analyzer imprime longitud RFC normalizada, flag de caracteres ocultos,
estado de compatibilidad y mismatch cliente/CFDI. Si encuentra
`CFDI_CREATE_REQUEST` sin reporte del guard, emite
`RECEPTOR_GUARD_NOT_EVALUATED_BUG`; no se debe repetir smoke live hasta
corregirlo.

## Sandbox Fiscal Profiles 6A.7K

El smoke sandbox ya no debe derivar receptor fiscal desde variables globales.
La fuente de verdad local es:

```text
data/sandbox/facturacom-sandbox-fiscal-profiles.json
```

El loader:

```text
scripts/lib/sandbox-fiscal-profile-loader.js
```

aplica el perfil al cliente sandbox antes de crear cliente y antes de construir
CFDI. Perfiles minimos:

- `PF_612_G03_DEMO`: persona fisica demo compatible con `RegimenFiscalR=612`,
  CP fiscal `01219` y `UsoCFDI=G03`.
- `PUBLIC_GENERAL_616_S01_DEMO`: publico general nacional con `XAXX010101000`,
  `RegimenFiscalR=616` y `UsoCFDI=S01`.
- `PM_601_G03_DEMO`: persona moral demo compatible con `601/G03`.

Reglas:

- `G03 + 612` requiere RFC demo con forma de persona fisica.
- `XAXX010101000` nunca debe mezclarse con `612/G03`.
- `[REDACTED_RFC]` nunca es dato valido para validacion.
- Si el perfil falla, el intento queda
  `LOCAL_INVALID_SANDBOX_FISCAL_PROFILE`, aumenta
  `sandbox_fiscal_profile_errors` y no llama al PAC.
- Si el perfil receptor pasa y Factura.com responde `303 - El RFC del CSD del
  Emisor no corresponde`, el bloqueo es de configuracion del emisor sandbox
  (CSD/serie/cuenta), no de receptor.

## Sandbox Emitter Profiles 6A.7L

El emisor sandbox se configura con un perfil separado del receptor:

```text
data/sandbox/facturacom-sandbox-emitter-profiles.json
scripts/lib/sandbox-emitter-profile-loader.js
```

`EMITTER_XAMA_612_DEMO` aplica al smoke:

- `RegimenFiscal=612`.
- `LugarExpedicion=01219`.
- RFC/CSD esperado con forma PF demo, sin imprimir RFC completo.
- Sin credenciales, certificados `.cer/.key` ni datos reales.

`EMITTER_RESICO_626_REAL_BLOCKED_FOR_SANDBOX` existe para cortar localmente si
alguien intenta mezclar el RESICO 626 real del usuario con CSD/serie sandbox.
El mapper debe usar `RegimenFiscal` y `LugarExpedicion` del perfil de emisor en
el body final. Si Factura.com responde `303`, el analyzer clasifica
`EMITTER_CSD_RFC_MISMATCH` y recomienda revisar que empresa Factura.com, CSD,
RFC emisor y serie pertenezcan al mismo emisor sandbox.

## Analyzer/Inspector Success Semantics 6A.7N

El analyzer separa mensajes de exito y error del PAC. Un mensaje como
`Factura creada y enviada satisfactoriamente` debe aparecer en
`api_success_messages_detected` cuando el intento tiene `api_ok=true`,
`response/status=success` o `status=CREATE_OK`. Solo se reporta en
`api_error_messages_detected` si el intento o artifact indica error:
`api_ok=false`, `ok=false`, `response/status=error` o status de intento de
error.

Las respuestas de cliente siguen la misma regla: `CLIENT_CREATE_RESPONSE` o
`CLIENT_LOOKUP_RESPONSE` con success puede mostrarse como mensaje de exito, pero
no aumenta `client_validation_error_detected`. Los mensajes de validacion de
cliente solo cuentan cuando tambien existe `client_create_errors` o
`client_lookup_errors`.

El inspector analiza artifacts ya sanitizados. La validacion fiscal y de forma
de RFC se hace antes de redactar; por eso un valor `[REDACTED_RFC]` o
`[REDACTED_RFC_VALUE]` se muestra como
`rfc_shape=REDACTED_NOT_EVALUATED`, `normalized_rfc_length=REDACTED` y
`rfc_hidden=unknown`, no como RFC real invalido.

Fase 6A.6C agrega normalizacion de identidad CFDI/PAC para preparar Storage
Engine. Los smoke live sandbox ya validaron crear CFDI, descargar XML/PDF,
cancelar en sandbox y procesar batch de 5. Cada intento puede conservar:

- `client_uid`: UID del receptor usado en `Receptor.UID`.
- `cfdi_uid`: UID real del CFDI/factura devuelto por respuesta CFDI.
- `uuid` fiscal si aparece en create, lookup o XML.
- `pac_invoice_id`, `serie`, `folio` y `status` si Factura.com los devuelve.
- `internal_invoice_id` y `draft_id` para trazabilidad local.
- `lookup_status`, `cancel_status` y `cancel_response_identity`.
- `identity_completeness`: `complete`, `partial` o `missing`.

El extractor de `cfdi_uid` no revisa `Receptor.UID`, request body, headers,
cliente, payload canonical ni `client-uids.local.json`. Solo revisa ramas de
respuesta CFDI (`data`, `Data`, `response`, `respuestaapi`) y `rawText` si es
JSON. Fase 6A.7C agrega captura de headers de respuesta sanitizados: `Location`
puede ser candidato de identidad, sin imprimir valores completos y sin usar
headers de request.

El smoke tambien manda una referencia interna demo en `Comentarios`:

```text
SANDBOX_DEMO <draft_id> <internal_invoice_id>
```

Esto no contiene datos reales y permite una busqueda futura si Factura.com
documenta oficialmente un endpoint por comentarios o criterios estrictos.

Si create responde OK pero no hay `cfdi_uid`, `uuid` ni `pac_invoice_id`, el
intento queda `CREATE_OK_IDENTITY_MISSING`, no aumenta `successful` y el
analyzer reporta `identity_missing`.

El UUID puede no venir en create response. El smoke busca en `Data`, `data`,
`response`, `respuestaapi`, `TimbreFiscalDigital`, `Comprobante` y XML descargado.
No usa XML/PDF para produccion y no versiona runtime.

## Storage Engine Sandbox 6A.7

El Storage Engine sandbox toma artifacts ya generados por el smoke y los copia
dentro de `runtime/storage-sandbox/`. No llama Factura.com, no hace HTTP, no
genera XML/PDF nuevo y no toca workflows.

Comandos locales:

```powershell
node scripts/store-facturacom-sandbox-artifacts.js
node scripts/analyze-storage-sandbox.js
```

Estructura:

```text
runtime/storage-sandbox/
  emitters/EMITTER-DEMO/<yyyy>/<mm>/clients/<client_id>/invoices/<cfdi_uid_uuid_pac_o_internal_id>/
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

Para sandbox, `cfdi_uid` funciona como identidad principal del proveedor. `uuid`
es nullable porque Factura.com sandbox puede no devolverlo en el analyzer. Una
factura con `cfdi_uid` y sin `uuid` queda como `PARTIAL_PROVIDER_UID`.

Storage nunca usa `client_uid` como `invoice_id`. El orden de ruta es:

1. `cfdi_uid`
2. `uuid`
3. `pac_invoice_id`
4. `internal_invoice_id`
5. `draft_id + attempt index`

Si dos drafts distintos generan el mismo invoice id, Storage crea un sufijo
estable `__<draft_id>`, conserva ambos documentos y reporta
`identity_collisions`/`duplicate_invoice_ids`. Reporting no debe avanzar con
documentos pisados ni colisiones sin revisar.

Inspeccion segura local de response shape:

```powershell
node scripts/inspect-facturacom-sandbox-response-shape.js
```

El inspector solo muestra shape y marcadores. No imprime valores completos,
credenciales, XML/PDF completos ni headers de request. Desde 6A.7D tambien
muestra previews seguros y truncados de `response`, `status` y `message` para
diagnosticar errores de negocio Factura.com sin abrir el JSON completo.
Desde 6A.7E, si `message` contiene HTML de error, el preview elimina tags
simples, decodifica entidades HTML basicas y conserva texto util como
`El campo X es requerido`. XML CFDI real y PDF real se mantienen redactados como
`[REDACTED_XML_TEXT ...]` o `[REDACTED_PDF_TEXT ...]`.
Desde 6A.7F, el inspector incluye tambien `CLIENT_CREATE_REQUEST`,
`CLIENT_CREATE_RESPONSE` y `CLIENT_LOOKUP_RESPONSE`. Cada artifact muestra
`endpoint_type: client_create|client_lookup|cfdi_create`, marca RFC como
`REDACTED_RFC_VALUE` y detecta candidatos `client_uid_candidate` sin imprimir
valores largos.

El smoke distingue errores HTTP de errores API de Factura.com:

- `PROVIDER_AUTH_FAILED`: auth preflight fallo antes de tocar clientes o CFDI.
- `AUTH_ACCOUNT_NOT_FOUND`: cuenta sandbox no existe o keys no corresponden.
- `AUTH_INVALID_KEYS`: credenciales invalidas.
- `AUTH_ENVIRONMENT_MISMATCH`: keys/host de ambiente incorrecto.
- `AUTH_PLAN_REQUIRED`: plan o API no habilitada.
- `AUTH_IP_BLOCKED`: IP no autorizada.
- `AUTH_UNKNOWN_API_ERROR`: error API no clasificado en preflight.
- `AUTH_HTTP_ERROR`: fallo de transporte en preflight.
- `CREATE_HTTP_ERROR`: el transporte no fue OK.
- `CREATE_API_ERROR`: el transporte fue OK, pero el cuerpo trae
  `response/status=error`.
- `CLIENT_CREATE_HTTP_ERROR`: fallo de transporte al crear cliente sandbox.
- `CLIENT_CREATE_API_ERROR`: transporte OK al crear cliente, pero cuerpo con
  `response/status=error`.
- `CREATE_OK_IDENTITY_MISSING`: solo despues de `ok=true` semantico sin
  `cfdi_uid`, `uuid` ni `pac_invoice_id`.

`CREATE_API_ERROR` conserva artifacts de request/response, incrementa
`api_errors`/`create_api_errors`, no ejecuta lookup/download/cancel y Storage lo
clasifica como `ERROR` con `identity_status=MISSING`.

`CLIENT_CREATE_API_ERROR` conserva artifacts de cliente, incrementa
`client_create_errors`, reporta previews seguros en
`client_create_error_messages`, detecta cliente existente o validacion, intenta
fallback por RFC y solo continua a CFDI si obtiene `client_uid`.

`PROVIDER_AUTH_FAILED` conserva `PREFLIGHT_AUTH_RESPONSE`, incrementa
`provider_auth_errors`, reporta `provider_auth_status` y corta antes de
`CLIENT_CREATE`, `CLIENT_LOOKUP` y `CFDI_CREATE`. Las keys sandbox deben venir
del ambiente `https://sandbox.factura.com/api`; no uses produccion contra
sandbox. `F-PLUGIN` sigue siendo requerido por Factura.com.

Los resultados viven solo en:

```text
runtime/facturacom-sandbox/
```

Analisis local:

```powershell
node scripts/analyze-factura-com-sandbox-results.js
```

No subas `.env.pac.sandbox.local`, XML/PDF, responses, manifests ni runtime.
