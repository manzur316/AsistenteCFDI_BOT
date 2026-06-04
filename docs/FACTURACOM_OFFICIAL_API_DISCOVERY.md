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

Para el bot, el punto pendiente es obtener y almacenar el `UID` sandbox del
cliente demo sin guardar clientes reales.

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
- XML/PDF sandbox solo si `FACTURACOM_SANDBOX_DOWNLOAD_TEST=1`

El analizador:

```powershell
node scripts/analyze-factura-com-sandbox-results.js
```

falla si detecta credenciales, produccion, RFC no permitido o artifacts fuera de
`runtime/`.

Produccion sigue bloqueada aunque el host oficial este documentado.
