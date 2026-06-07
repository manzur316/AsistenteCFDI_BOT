# ADR 0001 - Multi-Tenant Multi-Provider SATBOT

## Estado

Aceptado para foundation no productiva.

## Contexto

SATBOT empezo como bot personal RESICO para organizar borradores CFDI,
aprobacion humana y operacion sandbox. La arquitectura actual ya permite:

- Telegram -> n8n -> Action Layer -> PostgreSQL;
- Factura.com Sandbox Live como primer proveedor operativo;
- descarga XML/PDF sandbox;
- storage y audit local;
- produccion fiscal real bloqueada.

La siguiente evolucion esperada es SaaS multi-tenant y multi-provider.

## Decision

SATBOT Core no debe depender directamente de `factura_com` ni de `facturapi`.
SATBOT Core habla Canonical Provider Contracts y cada Provider Adapter traduce
esos contratos a su API.

Arquitectura objetivo:

```text
SATBOT Core
  -> Tenant Fiscal Profile
  -> Fiscal Activity Rules
  -> Canonical Draft
  -> Canonical Invoice
  -> Canonical Provider Contracts
  -> Provider Adapter
      -> factura_com
      -> facturapi futuro
```

## Proveedores

### factura_com

`factura_com` queda como Provider Adapter actual para uso personal/economico y
Sandbox Operativo Live del tenant personal.

Factura.com Partner puede crear cuentas cliente, pero la recarga posterior de
folios puede depender de panel/manualidad. Por eso SATBOT debe mantener su
propio ProviderUsageEvent/TenantUsageLedger en fases futuras.

### facturapi

`facturapi` queda como proveedor comercial futuro preferente para SaaS por sus
capacidades esperadas:

- organizaciones;
- clientes;
- facturas;
- cancelaciones;
- webhooks;
- `payment_status`;
- complementos de pago;
- recibos/autofactura;
- Stripe App.

Esta ADR no implementa Facturapi.

## Ambientes canonicos

- Factura.com Sandbox -> `SANDBOX`
- Factura.com Production futuro -> `PRODUCTION`
- Facturapi Test -> `TEST`
- Facturapi Live futuro -> `LIVE`

No usar la frase ambigua "produccion real en sandbox". Para el proveedor actual
se usa "Sandbox Operativo Live".

## Tenant Fiscal Profile

Todo tenant debe tener Tenant Fiscal Profile antes de operar comercialmente:

- RFC;
- razon social;
- regimen fiscal;
- codigo postal fiscal;
- tipo persona;
- revision humana obligatoria.

## Fiscal Activity Rules

Fiscal Activity Rules relaciona actividades fiscales/giro del tenant con
conceptos permitidos o sugeridos. No sustituye contador. Todo timbrado y toda
sugerencia siguen sujetos a revision humana.

## Seguridad

- Produccion fiscal real queda bloqueada hasta gate explicito.
- n8n no debe contener credenciales PAC.
- Credenciales por tenant/proveedor deben almacenarse cifradas en una fase
  futura.
- No se envian XML/PDF/ZIP/Excel por Telegram sin fase explicita.
- Payment status comercial sigue siendo propiedad de SATBOT, aunque algunos
  proveedores expongan `payment_status`.

## Consecuencias

- El core crece alrededor de contratos canonicos.
- Los Provider Adapter quedan aislados.
- Factura.com puede seguir sirviendo al tenant personal actual.
- Facturapi puede agregarse despues sin reescribir SATBOT Core.
- Se requieren Provider Account, Provider Client Link, Provider Invoice Link,
  Provider Webhook Event y Provider Usage Event como modelos foundation.
