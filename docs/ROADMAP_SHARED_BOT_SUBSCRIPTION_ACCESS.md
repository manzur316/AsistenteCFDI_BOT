# Roadmap - Shared Bot Subscription Access

## Objetivo

Preparar SATBOT para operar con un solo bot Telegram compartido, controlando
acceso por tenant, suscripcion y entitlements sin agregar complejidad visible a
la conversacion.

## Etapa 1 - Foundation

Estado: Fase 7.16F.

- ADR de bot compartido.
- Contratos puros de identidad, suscripcion, entitlements e invitaciones.
- SQL aditivo.
- Docs UX.
- Sin cambios al workflow Telegram operativo.

## Etapa 2 - Access Gate advisory

- Resolver `telegram_user_id` a `user_id`.
- Resolver tenant activo y emisor activo.
- Evaluar `evaluateAccess`.
- Registrar decision en modo observabilidad.
- No bloquear todavia acciones reales.

## Etapa 3 - Access Gate operativo

- Bloquear crear/timbrar si tenant no esta activo.
- Permitir lectura limitada en `READ_ONLY`.
- Permitir renovar, soporte y export basico.
- Mensajes humanos simples en Telegram.

## Etapa 4 - Billing integration

- Payment links.
- Webhooks de pago.
- Renovacion automatica.
- Conciliacion de estado de suscripcion.
- Sin mezclar billing con logica fiscal.

## Etapa 5 - Trial Mode

- Demo privada por invitacion.
- 3 dias.
- 5 facturas de prueba.
- Proveedor sandbox/test.
- Sin validez fiscal real.
- Storage separado y marca visual `MODO PRUEBA`.

## Etapa 6 - WhatsApp / WebAdmin

- WhatsApp futuro como Channel Adapter.
- WebAdmin futuro para configuracion, roles y suscripciones.
- WebApproval futuro para aprobaciones fuera de Telegram.

## Politica read-only

Vencimiento no significa bloqueo total. Un tenant vencido debe conservar acceso
limitado para consultar informacion previa, renovar y contactar soporte.

## No-go actual

- No billing real.
- No pasarela de pago.
- No trial funcional real.
- No cambios operativos n8n.
- No WhatsApp real.
- No WebAdmin real.
- No produccion fiscal real.
