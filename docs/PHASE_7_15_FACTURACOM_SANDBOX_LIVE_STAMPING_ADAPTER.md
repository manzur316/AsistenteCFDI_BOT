# Fase 7.15 - Factura.com Sandbox Live Stamping Adapter

## Objetivo

La fase 7.15 agrega timbrado sandbox live de Factura.com al `FacturaComSandboxAdapter`
sin cambiar decisiones fiscales productivas. El flujo conserva el modo mock como
default y solo usa live cuando la configuracion local lo habilita explicitamente.

## Alcance

- Adapter neutral: `scripts/lib/factura-com-sandbox-adapter.js`.
- Accion sandbox: `sandbox.draft.stamp`.
- Endpoint live sandbox: `POST /v4/cfdi40/create`.
- Storage local sanitizado bajo `runtime/storage-sandbox/draft-stamps/`.
- Telegram muestra solo presencia de identidad, no UUID/UID reales.

Fuera de alcance:

- Produccion.
- Timbrado fiscal real.
- Descarga XML/PDF. Queda para fase 7.16.
- Envio de XML/PDF/ZIP/Excel por Telegram.
- Cambios a catalogo fiscal o reglas CFDI.

## Gating live

Variables locales requeridas:

```text
FACTURACOM_SANDBOX_MODE -> live
FACTURACOM_SANDBOX_LIVE -> 1
FACTURACOM_BASE_URL -> https://sandbox.factura.com/api
FACTURACOM_API_KEY -> valor local no versionado
FACTURACOM_SECRET_KEY -> valor local no versionado
FACTURACOM_PLUGIN -> valor local no versionado
FACTURACOM_SANDBOX_RECEIVER_UID -> valor local no versionado
FACTURACOM_SANDBOX_SERIE -> valor local no versionado
FACTURACOM_SANDBOX_USO_CFDI -> G03
FACTURACOM_SANDBOX_FORMA_PAGO -> 03
FACTURACOM_SANDBOX_METODO_PAGO -> PUE
FACTURACOM_SANDBOX_MONEDA -> MXN
FACTURACOM_SANDBOX_LUGAR_EXPEDICION -> CP sandbox local
```

Si falta configuracion o la URL apunta a produccion, el resultado es
`NEEDS_CONFIG` y no se llama al proveedor.

## Storage local

Cada stamp exitoso puede generar:

- `sandbox-stamp-manifest.json`
- `canonical-request.sanitized.json`
- `provider-response.sanitized.json`
- `normalized-result.json`

Estos archivos viven solo en `runtime/` y no se versionan. La sanitizacion evita
guardar credenciales, RFC, UUID/UID completos, rutas sensibles o documentos.

## Telegram

El mensaje seguro puede indicar:

- proveedor: Factura.com Sandbox;
- modo: `live sandbox` o `mock sandbox`;
- UUID sandbox: presente/oculto o no disponible;
- PAC/CFDI ID sandbox: presente/oculto o no disponible;
- XML/PDF disponible: si/no.

No se imprimen IDs reales ni se envian documentos.

## Tests

Pruebas agregadas:

- `scripts/test-factura-com-sandbox-live-adapter-contract.js`
- `scripts/test-factura-com-sandbox-live-gating.js`
- `scripts/test-sandbox-draft-stamp-live-mode.js`
- `scripts/test-sandbox-live-stamp-storage-manifest.js`

## Cierre

La fase 7.15 habilita un ciclo sandbox live controlado para crear CFDI de prueba
con Factura.com, manteniendo todos los guardrails de sandbox. El siguiente paso
recomendado es `7.16 Sandbox XML/PDF Download and Client Storage`.
