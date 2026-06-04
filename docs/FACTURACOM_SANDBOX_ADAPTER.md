# Factura.com Sandbox Adapter

## Objetivo

Esta fase crea la base tecnica del PAC Adapter Hub. Factura.com queda como
primer adapter sandbox, pero el sistema no queda acoplado a ese proveedor.

El adapter solo traduce un borrador interno a un payload sandbox y normaliza
respuestas. No decide conceptos, no corrige impuestos, no timbra en produccion
y no sustituye la revision humana.

Advertencia operativa:

```text
BORRADOR SUJETO A REVISION HUMANA
```

## Contrato Neutral PAC

El contrato minimo vive en:

```text
scripts/lib/pac-adapter-contract.js
```

Metodos requeridos:

- `createDraftPayload(draft, context)`
- `validatePayload(payload, context)`
- `stampSandbox(payload, context)`
- `downloadXml(invoiceRef, context)`
- `downloadPdf(invoiceRef, context)`
- `getStatus(invoiceRef, context)`
- `normalizeError(error)`

Adapters futuros deben cumplir el mismo contrato. Ejemplos previstos:

- `FacturaComSandboxAdapter`
- `FacturamaAdapter`
- `FacturapiAdapter`
- `SWAdapter`
- `FinkokAdapter`

## Variables De Entorno

No guardar credenciales reales en el repositorio. Copiar el ejemplo localmente y
llenarlo fuera de git:

```text
.env.pac.sandbox.example
```

Variables:

```text
FACTURACOM_SANDBOX_LIVE=0
FACTURACOM_SANDBOX_BASE_URL=REEMPLAZAR_SANDBOX_BASE_URL
FACTURACOM_SANDBOX_API_KEY=REEMPLAZAR_SANDBOX_API_KEY
FACTURACOM_SANDBOX_SECRET_KEY=REEMPLAZAR_SANDBOX_SECRET_KEY
FACTURACOM_SANDBOX_TIMEOUT_MS=30000
```

Reglas:

- `FACTURACOM_SANDBOX_LIVE=0` bloquea llamadas reales.
- Las pruebas unitarias usan `httpClient` mock.
- Produccion queda deshabilitada.
- No existe `stampProduction` en esta fase.

## Adapter Factura.com Sandbox

Archivo:

```text
scripts/lib/factura-com-sandbox-adapter.js
```

Responsabilidades:

- Leer configuracion sandbox desde variables de entorno.
- Construir payload CFDI 4.0 sandbox desde un borrador interno.
- Validar que el payload tenga receptor, conceptos y claves minimas.
- Enviar a sandbox solo si se inyecta un `httpClient` mock o si
  `FACTURACOM_SANDBOX_LIVE=1`.
- Descargar XML/PDF sandbox cuando el proveedor lo permita.
- Consultar estatus sandbox.
- Normalizar errores del proveedor.

Fuera de alcance:

- PAC de produccion.
- Timbrado fiscal real.
- XML/PDF fiscal real.
- Cancelacion real.
- Telegram.
- Workflows n8n.
- Modificar `data/concepts.normalized.json`.

## Smoke Sandbox Opcional

El script opcional:

```text
node scripts/smoke-factura-com-sandbox-adapter.js
```

No hace llamadas reales si `FACTURACOM_SANDBOX_LIVE` no vale `1`.

Uso local previsto:

```powershell
$env:FACTURACOM_SANDBOX_LIVE="1"
$env:FACTURACOM_SANDBOX_BASE_URL="REEMPLAZAR_SANDBOX_BASE_URL"
$env:FACTURACOM_SANDBOX_API_KEY="REEMPLAZAR_SANDBOX_API_KEY"
$env:FACTURACOM_SANDBOX_SECRET_KEY="REEMPLAZAR_SANDBOX_SECRET_KEY"
node scripts/smoke-factura-com-sandbox-adapter.js
```

Antes de usarlo con credenciales reales, confirmar que el proveedor esta en
sandbox y que el payload demo no contiene RFC ni clientes reales.

## Pruebas

Unitarias:

```text
node scripts/test-pac-adapter-contract.js
node scripts/test-factura-com-sandbox-adapter.js
```

Seguridad recomendada:

```text
node scripts/test-repo-safety.js
```

Estas pruebas verifican contrato, bloqueo de produccion, uso de mocks,
credenciales no hardcodeadas, placeholders y que no se toquen workflows ni el
catalogo activo.
