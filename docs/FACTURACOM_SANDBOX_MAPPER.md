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

Los resultados viven solo en:

```text
runtime/facturacom-sandbox/
```

Analisis local:

```powershell
node scripts/analyze-factura-com-sandbox-results.js
```

No subas `.env.pac.sandbox.local`, XML/PDF, responses, manifests ni runtime.
