# Factura.com Official API Discovery

Fase 6A.5B convierte documentacion oficial publica de Factura.com en un
contrato tecnico local para el PAC Adapter Hub.

Esta fase es documental y no-live:

- No llama Factura.com.
- No usa credenciales.
- No descarga XML/PDF.
- No timbra CFDI real ni sandbox.
- No modifica workflows.
- No modifica catalogos fiscales ni datos reales.

Todo payload sigue siendo `BORRADOR SUJETO A REVISION HUMANA`.

## Fuentes Oficiales

Se usaron solamente paginas oficiales en `https://factura.com/apidocs/`:

- Entornos: https://factura.com/apidocs/entornos.html
- Primeros pasos: https://factura.com/apidocs/primeros-pasos.html
- Crear CFDI 4.0: https://factura.com/apidocs/crear-cfdi-40.html
- Buscar CFDI: https://factura.com/apidocs/buscar-cfdi.html
- Descargar CFDI: https://factura.com/apidocs/descargar-cfdi.html
- Cancelar CFDI 4.0: https://factura.com/apidocs/cancelar-cfdi-40.html
- Clientes: https://factura.com/apidocs/clientes.html
- Productos: https://factura.com/apidocs/productos.html
- Catalogos: https://factura.com/apidocs/catalogos.html

## A. Ambientes

Factura.com documenta dos hosts:

| Ambiente | Host oficial | Estado en este repo |
| --- | --- | --- |
| Sandbox | `https://sandbox.factura.com/api` | Permitido solo para smoke controlado futuro |
| Produccion | `https://api.factura.com` | Bloqueado |

Produccion queda documentada solo para contexto. El adapter actual bloquea
`PRODUCTION` y no hay credenciales versionadas.

## B. Autenticacion

La documentacion oficial indica peticiones JSON con headers:

| Header | Uso |
| --- | --- |
| `Content-Type` | `application/json` |
| `F-PLUGIN` | Identificador requerido por Factura.com |
| `F-Api-Key` | API key de la cuenta |
| `F-Secret-Key` | Secret key de la cuenta |

Politica local:

- No se guarda API key en el repo.
- No se guarda secret key en el repo.
- No se guarda token ni valor real de `F-PLUGIN` en esta fase.
- Cualquier smoke futuro debe leer credenciales desde variables de entorno no
  versionadas.
- Las keys sandbox deben usarse contra `https://sandbox.factura.com/api`.
- Las keys de produccion no deben usarse contra sandbox, ni sandbox contra
  produccion.
- `F-PLUGIN` sigue siendo universal para la cuenta y tambien se lee desde env.
- Antes de crear cliente, buscar cliente o crear CFDI, el smoke ejecuta auth
  preflight con `GET /v1/clients?per_page=1`.

## C. Endpoints Oficiales

| Operacion | Metodo | Endpoint oficial | Estado local |
| --- | --- | --- | --- |
| Crear CFDI 4.0 | `POST` | `/v4/cfdi40/create` | Sandbox futuro, no-live ahora |
| Buscar CFDI por UID | `GET` | `/v4/cfdi/uid/{UID}` | Documentado, no-live |
| Buscar CFDI por UUID | `GET` | `/v4/cfdi/uuid/{UUID}` | Documentado, no-live |
| Descargar PDF | `GET` | `/v4/cfdi40/{cfdi_uid}/pdf` | Prohibido en esta fase |
| Descargar XML | `GET` | `/v4/cfdi40/{cfdi_uid}/xml` | Prohibido en esta fase |
| Cancelar CFDI 4.0 | `POST` | `/v4/cfdi40/{cfdi_uid}/cancel` | Sandbox futuro, no-live ahora |
| Listar clientes | `GET` | `/v1/clients` | Documentado, no-live |
| Buscar cliente | `GET` | `/v1/clients/{RFC}` o `/v1/clients/{UID}` | Documentado, no-live |
| Crear cliente | `POST` | `/v1/clients/create` | Pendiente de politica de clientes demo |
| Crear producto | `POST` | `/v3/products/create` | Pendiente; no necesario para crear CFDI |
| Catalogo SAT generico | `GET` | `/v3/catalogo/{nombre_catalogo}` | Documentado, no-live |
| Uso CFDI | `GET` | `/v4/catalogo/UsoCfdi` | Documentado, no-live |

No se agrego transporte HTTP al mapper. La implementacion real debe vivir en el
adapter sandbox y pasar por 6A.6 con opt-in explicito.

No quedo documentado en las fuentes locales un endpoint oficial de listado o
busqueda estricta de CFDI recien creado por serie, folio, receptor, fecha,
rango de fechas, total, RFC receptor o comentarios. Por eso el fallback
post-create por busqueda queda apagado por defecto. Solo puede activarse si una
fase posterior confirma endpoint oficial y criterios suficientemente estrictos.

## D. Campos Requeridos Para CFDI

### Crear CFDI 4.0

Campos confirmados por la documentacion oficial para `POST /v4/cfdi40/create`:

| Campo | Estado | Nota |
| --- | --- | --- |
| `Receptor.UID` | Confirmado | Requiere cliente creado en Factura.com |
| `Receptor.RegimenFiscalR` | Confirmado en ejemplo | Debe venir de datos fiscales del receptor |
| `TipoDocumento` | Confirmado | Ejemplo oficial: `factura` |
| `RegimenFiscal` | Confirmado como opcional | Regimen emisor; si falta, Factura.com usa configuracion de empresa |
| `Conceptos` | Confirmado | Arreglo requerido |
| `UsoCFDI` | Confirmado | Debe ser clave SAT valida |
| `Serie` | Confirmado | Id de serie dada de alta en panel |
| `FormaPago` | Confirmado | Clave SAT |
| `MetodoPago` | Confirmado | Clave SAT |
| `Moneda` | Confirmado | Clave SAT, por ejemplo `MXN` |
| `EnviarCorreo` | Confirmado como opcional | Default oficial: true si no se envia |
| `LugarExpedicion` | Confirmado como opcional | CP de 5 caracteres |

### Conceptos

Campos confirmados dentro de `Conceptos[]`:

- `ClaveProdServ`
- `NoIdentificacion`
- `Cantidad`
- `ClaveUnidad`
- `Unidad`
- `Descripcion`
- `ValorUnitario`
- `Importe`
- `Descuento`
- `ObjetoImp`
- `Impuestos.Traslados[].Base`
- `Impuestos.Traslados[].Impuesto`
- `Impuestos.Traslados[].TipoFactor`
- `Impuestos.Traslados[].TasaOCuota`
- `Impuestos.Traslados[].Importe`
- `Impuestos.Retenidos`
- `Impuestos.Locales`

### Receptor/Cliente

Para crear cliente, la documentacion confirma campos de entrada con nombres
propios de Factura.com:

- `rfc`
- `razons`
- `codpos`
- `email`
- `usocfdi`
- `regimen`
- `calle`
- `numero_exterior`
- `numero_interior`
- `colonia`
- `ciudad`
- `delegacion`
- `localidad`
- `estado`
- `pais`
- `numregidtrib`
- `nombre`
- `apellidos`

Para el bot, el smoke sandbox obtiene y almacena el `UID` sandbox del cliente
demo solo en runtime local como `client_uid`. Este valor pertenece al receptor
y no debe confundirse con el UID del CFDI. La prioridad para resolver cliente es:

1. UID existente desde variable local o `client-uids.local.json`.
2. UID devuelto por `POST /v1/clients/create`.
3. Fallback `GET /v1/clients/{RFC}`.
4. Fallback `GET /v1/clients?rfc={RFC}`.

Si hay varios clientes con el mismo RFC y no se puede elegir por `client_id` o
razon social, el smoke marca `CLIENT_UID_AMBIGUOUS`. Si no aparece UID, marca
`CLIENT_UID_MISSING`. En ambos casos no intenta crear CFDI.

Fase 6A.7F normaliza tambien fallos de `POST /v1/clients/create` antes de
perseguir errores de CFDI. Si el transporte fue 2xx pero Factura.com responde
`response/status=error`, el smoke marca `CLIENT_CREATE_API_ERROR`; si falla el
transporte, marca `CLIENT_CREATE_HTTP_ERROR`. El mensaje se guarda solo como
preview seguro. Cuando el error sugiere que el cliente ya existe, o cuando
`FACTURACOM_SANDBOX_CREATE_CLIENTS=1`, el smoke intenta los dos lookups por RFC.
Solo si encuentra un UID claro persiste `client-uids.local.json` y continua al
`POST /v4/cfdi40/create`; si no, detiene el intento como `CLIENT_CREATE_FAILED`
o estado de UID faltante/ambiguo.

Fase 6A.7G agrega un gate anterior a todo lo anterior: `PREFLIGHT_AUTH_RESPONSE`.
El smoke llama `GET /v1/clients?per_page=1`, no crea datos y clasifica la
respuesta como `AUTH_OK`, `AUTH_ACCOUNT_NOT_FOUND`, `AUTH_INVALID_KEYS`,
`AUTH_ENVIRONMENT_MISMATCH`, `AUTH_PLAN_REQUIRED`, `AUTH_IP_BLOCKED`,
`AUTH_UNKNOWN_API_ERROR` o `AUTH_HTTP_ERROR`. Si no hay `AUTH_OK`, el intento
queda `PROVIDER_AUTH_FAILED` y no se ejecutan `CLIENT_CREATE`, `CLIENT_LOOKUP`
ni `CFDI_CREATE`. El error `La cuenta que intenta autenticarse no existe` se
clasifica como problema de autenticacion/cuenta/ambiente proveedor, no como
cliente existente.

## E. Errores

La documentacion muestra respuestas de error JSON. Formas observadas:

```json
{
  "status": "error",
  "message": "mensaje de error"
}
```

```json
{
  "status": "error",
  "message": {
    "campo": ["detalle del error"]
  }
}
```

```json
{
  "response": "error",
  "message": "mensaje de error"
}
```

Tambien se advierte que el mensaje puede variar segun el nodo/campo incorrecto.
Por eso el adapter debe normalizar tanto `status` como `response`, y aceptar
`message` como string u objeto.

Regla local 6A.7D: HTTP 2xx no equivale automaticamente a exito de negocio.
El cliente sandbox separa:

- `http_ok`: transporte HTTP 2xx.
- `api_ok`: `false` si el cuerpo trae `response/status=error`; `true` si trae
  `response/status=success|ok|created`; `null` si el estado API no aparece.
- `ok`: `http_ok && api_ok !== false`.
- `api_status_unknown`: `true` cuando no existe `response` ni `status` semantico.

Si `POST /v4/cfdi40/create` devuelve HTTP 200 con `response=error` o
`status=error`, el smoke marca `CREATE_API_ERROR`, guarda request/response
sanitizados y no intenta lookup, download ni cancel. `CREATE_OK_IDENTITY_MISSING`
solo aplica despues de un exito semantico real sin identidad CFDI clara.

Si `POST /v1/clients/create` devuelve HTTP 200 con `response=error` o
`status=error`, el smoke marca el problema como cliente, no como CFDI:
`CLIENT_CREATE_API_ERROR`. El analyzer reporta `client_create_errors`,
`client_create_error_messages`, `client_already_exists_detected` y
`client_validation_error_detected`. El inspector local puede revisar
`CLIENT_CREATE_REQUEST`, `CLIENT_CREATE_RESPONSE` y `CLIENT_LOOKUP_RESPONSE` sin
imprimir RFC completos, credenciales ni UID largos.

Si el preflight de autenticacion falla, el analyzer reporta
`provider_auth_errors`, `provider_auth_status`, `provider_auth_message`,
`auth_preflight_ok` y `auth_preflight_response_shape`. En ese caso el diagnostico
correcto es proveedor/cuenta/ambiente, no payload CFDI.

Los mensajes de error pueden venir como texto plano, objeto JSON o HTML corto
dentro de `message`. Para diagnostico local, 6A.7E convierte HTML simple
(`<br>`, `<b>`, `<strong>`, listas y parrafos) a texto plano seguro, decodifica
entidades basicas y trunca el preview. XML CFDI real y PDF real siguen
redactados completos; el preview nunca debe exponer credenciales, RFC completo,
tokens ni IDs largos.

No se encontro una estructura oficial unica de warnings en las paginas
auditadas. Queda pendiente confirmar si Factura.com devuelve warnings separados
del error principal.

## F. Cancelacion

Endpoint oficial:

```text
POST /v4/cfdi40/{cfdi_uid}/cancel
```

Campos confirmados:

- `cfdi_uid` en URL: UID o UUID del CFDI.
- `motivo` en body.
- `folioSustituto` en body cuando aplique.

Motivos documentados:

| Clave | Motivo |
| --- | --- |
| `01` | Comprobante emitido con errores con relacion |
| `02` | Comprobante emitido con errores sin relacion |
| `03` | No se llevo a cabo la operacion |
| `04` | Operacion nominativa relacionada en factura global |

La respuesta exitosa documentada incluye `response`, `message` y
`respuestaapi`, con acuse XML dentro de la respuesta. Esta fase no solicita ni
almacena acuses.

## G. Descargas

Endpoints oficiales:

```text
GET /v4/cfdi40/{cfdi_uid}/pdf
GET /v4/cfdi40/{cfdi_uid}/xml
```

La documentacion indica que `cfdi_uid` puede ser UID o UUID. Esta fase no
descarga archivos y no versiona XML/PDF.

## H. Identidad CFDI/PAC Sandbox

Los smoke live sandbox locales ya validaron create, descarga XML/PDF,
cancelacion sandbox y batch de 5 CFDI sin findings sensibles. El pendiente para
Storage Engine no es timbrado productivo, sino normalizar identidad:

- `client_uid`: UID del cliente/receptor enviado en `Receptor.UID`.
- `cfdi_uid`: UID del CFDI/factura devuelto por create/lookup CFDI.
- `uuid` fiscal.
- `pac_invoice_id` cuando exista.
- `internal_invoice_id` y `draft_id` internos.
- `serie` y `folio`.
- `status` / `lookup_status`.
- `cancel_status` y posible identidad dentro de la respuesta de cancelacion.
- referencias runtime de XML/PDF.

El extractor CFDI nunca toma `Receptor.UID`, `client_uid`,
`client-uids.local.json`, headers, request body ni payload canonical como
`cfdi_uid`. `extractCfdiUid` solo revisa respuestas CFDI (`data`, `Data`,
`response`, `respuestaapi` o `rawText` JSON parseable). Fase 6A.7C agrega
headers de respuesta sanitizados; `Location` puede registrarse como candidato
de identidad si contiene UID/UUID, pero nunca se usan headers de request.

Si create devuelve OK pero no hay `cfdi_uid`, `uuid` ni `pac_invoice_id`, el
smoke marca `CREATE_OK_IDENTITY_MISSING`, no incrementa `successful` y el
analyzer reporta `identity_missing`.

El UUID puede no venir en la respuesta de `POST /v4/cfdi40/create`. El smoke lo
busca en estructuras anidadas de create, lookup, `respuestaapi`, timbre fiscal y
XML descargado. El extractor solo acepta UUID con forma valida y no interpreta
RFC como UUID.

## Campos Confirmados En Mapper

El mapper conserva el payload interno mock y agrega `official_request` con:

- endpoint `POST /v4/cfdi40/create`;
- `Receptor`;
- `TipoDocumento`;
- `RegimenFiscal`;
- `Conceptos`;
- `UsoCFDI`;
- `Serie`;
- `FormaPago`;
- `MetodoPago`;
- `Moneda`;
- `EnviarCorreo`;
- `LugarExpedicion`;
- campos oficiales de `Conceptos[]`.

Los valores que requieren cuenta sandbox, cliente sandbox, serie o politica de
pago no se inventan y quedan en `unresolved_fields`.

## Pendientes Antes De 6A.6

- Cuenta sandbox disponible.
- Variables locales no versionadas para credenciales.
- Valor local de `F-PLUGIN` sin versionarlo.
- Cliente demo creado en Factura.com sandbox y `Receptor.UID` obtenido.
- Serie sandbox creada y confirmada.
- Politica local para `FormaPago`, `MetodoPago`, `Moneda`, `UsoCFDI` y
  `LugarExpedicion`.
- Fixture sandbox sin RFC/clientes reales.
- Confirmar estructura de error real de sandbox con smoke opt-in.

Recomendacion: 6A.6 puede proceder solo como smoke sandbox controlado si esos
pendientes quedan resueltos localmente y con `FACTURACOM_SANDBOX_LIVE=1`.

## 6A.6 Smoke Sandbox Controlado

El discovery oficial alimenta un smoke controlado, pero el smoke sigue apagado
por defecto.

### Dry-Run

```powershell
node scripts/smoke-factura-com-sandbox.js
```

Resultado esperado sin variables live:

```text
SKIPPED: live disabled
```

En dry-run no se llama a Factura.com y no se crean artifacts runtime.

### Configuracion Local

Copia la plantilla a un archivo local ignorado:

```powershell
Copy-Item .env.pac.sandbox.example .env.pac.sandbox.local
```

Llena solamente en local:

- `FACTURACOM_SANDBOX_LIVE=1`
- `FACTURACOM_BASE_URL=https://sandbox.factura.com/api`
- `FACTURACOM_API_KEY`
- `FACTURACOM_SECRET_KEY`
- `FACTURACOM_PLUGIN`
- `FACTURACOM_SANDBOX_SERIE`
- `FACTURACOM_SANDBOX_USO_CFDI`
- `FACTURACOM_SANDBOX_FORMA_PAGO`
- `FACTURACOM_SANDBOX_METODO_PAGO`
- `FACTURACOM_SANDBOX_MONEDA`
- `FACTURACOM_SANDBOX_LUGAR_EXPEDICION`

Flags opcionales:

- `FACTURACOM_SANDBOX_CREATE_CLIENTS=0|1`
- `FACTURACOM_SANDBOX_DOWNLOAD_TEST=0|1`
- `FACTURACOM_SANDBOX_CANCEL_TEST=0|1`
- `FACTURACOM_SANDBOX_BATCH_SIZE=1|5`

### Artifacts

El smoke escribe solo en:

```text
runtime/facturacom-sandbox/
```

Archivos esperados:

- `manifest.json`
- `summary.json`
- request/response JSON sanitizados
- `client-uids.local.json` solo si se encontro UID de cliente sandbox demo
- XML/PDF sandbox solo si `FACTURACOM_SANDBOX_DOWNLOAD_TEST=1`
- campos normalizados de identidad CFDI en `manifest.attempts[]`

El analizador:

```powershell
node scripts/analyze-factura-com-sandbox-results.js
```

falla si detecta credenciales, produccion, RFC no permitido, artifacts fuera de
`runtime/` o un posible `client_uid` usado como `cfdi_uid`. Tambien reporta
clientes creados, UIDs de cliente encontrados, UIDs faltantes, clientes
ambiguos, si existe `client-uids.local.json`, CFDI UIDs, UUIDs,
`pac_invoice_id`, identidades completas/parciales/faltantes, IDs duplicados por
draft y UUID encontrado en XML. La falta de UUID se reporta como observabilidad,
no como error de seguridad.

Inspector de shape local:

```powershell
node scripts/inspect-facturacom-sandbox-response-shape.js
```

Este comando no llama Factura.com. Lee artifacts locales runtime y muestra solo
shape: rutas de campos, keys, tipos, longitudes aproximadas y marcadores
`uid-like`, `uuid-like`, `rfc-like` o `FORBIDDEN_CLIENT_UID_SOURCE`. No imprime
valores completos, XML/PDF completos, credenciales ni headers de request.

Produccion sigue bloqueada aunque el host oficial este documentado.
