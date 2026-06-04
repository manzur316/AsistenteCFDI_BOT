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

Como no hay documentacion local oficial del payload Factura.com en el repo, los
campos del proveedor se marcan con:

```text
TODO_DOCS_REQUIRED
```

Eso evita presentar esta estructura como integracion productiva o definitiva.

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
- 6A.3B sigue activo antes de cualquier prueba real
- la prueba no toca produccion
- la prueba no sube XML/PDF reales al repo

Todo resultado sigue siendo:

```text
BORRADOR SUJETO A REVISION HUMANA
```
