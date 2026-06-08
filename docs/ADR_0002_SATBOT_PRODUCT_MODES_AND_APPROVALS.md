# ADR 0002 - SATBOT Product Modes and Approval Policy

## Estado

Aceptado como arquitectura foundation. No implementa cambios operativos en
Telegram, workflows n8n, PAC productivo ni aprobacion por link real.

## Contexto

SATBOT debe crecer como producto sin perder el uso personal actual. El modelo
interno necesita soportar varios tenants, emisores fiscales, providers y
politicas de aprobacion, pero la interfaz conversacional debe seguir simple.

Regla central:

```text
Modelo interno robusto.
Interfaz conversacional simple.
Complejidad avanzada oculta en configuracion/panel.
```

## Decision

SATBOT soportara dos modos principales:

```text
DIRECT_BUSINESS_MODE
```

Para persona fisica, PyME o negocio que usa SATBOT para si mismo.

```text
ACCOUNTING_FIRM_MODE
```

Para despacho/contador que administra varios emisores fiscales.

SATBOT no queda limitado solo a contadores ni solo a uso personal.

## Actores

- Cliente SATBOT: quien paga/usa la plataforma.
- Emisor fiscal: RFC que emite CFDI.
- Receptor CFDI: cliente del emisor fiscal.
- Operador: persona que usa el bot para crear/timbrar.
- Contador: operador autorizado, no necesariamente emisor.

Ejemplo:

```text
Despacho Contable Lopez
  -> administra Real Bilbao como emisor fiscal
  -> Real Bilbao factura a sus propios receptores
  -> CFDI sale con RFC de Real Bilbao, no del contador
```

## Politica de aprobacion

SATBOT no debe exponer roles complejos por default. La politica visible se
resume en tres modos:

```text
SELF_APPROVAL
```

El dueno/emisor crea y aprueba sus propias facturas.

```text
DELEGATED_ACCOUNTANT
```

El contador/despacho tiene autoridad para crear, aprobar y timbrar sin pedir
aprobacion cada vez.

```text
CLIENT_APPROVAL_REQUIRED
```

El cliente/emisor debe aprobar cada factura antes de timbrar.

Override por factura:

```text
SEND_TO_CLIENT_APPROVAL
```

Aunque el contador tenga autoridad delegada, puede enviar un borrador especifico
a aprobacion del cliente.

## No-go

- No aprobacion por link real en esta fase.
- No panel web real.
- No WhatsApp real.
- No billing real.
- No suscripciones reales.
- No roles complejos visibles.
- No produccion fiscal real.
- No Facturapi adapter.
- No cambios a workflows n8n.
- No cambios a `data/concepts.normalized.json`.

## Consecuencias

- El uso personal actual se mantiene compatible.
- Despachos contables quedan modelados sin forzar al cliente final a usar
  Telegram.
- La aprobacion por cliente sera politica configurable, no default universal.
- La auditoria y los links viviran en capas internas/panel, no saturaran el bot.

## Revision humana

SATBOT no sustituye contador. Toda aprobacion/timbrado futuro debe conservar
evidencia y revision humana segun politica del tenant.
