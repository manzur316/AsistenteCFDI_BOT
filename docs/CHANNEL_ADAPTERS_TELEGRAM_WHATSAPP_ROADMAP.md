# Channel Adapters Roadmap - Telegram, WhatsApp and Web Approval

## Principio

Los canales no contienen la logica fiscal pesada. Cada canal traduce comandos y
respuestas hacia SATBOT Core.

```text
TelegramAdapter
WhatsAppAdapter
WebApprovalAdapter
  -> Channel Command Contract
  -> SATBOT Core
  -> Action Layer
```

## Canales

| Canal | Estado | Uso |
| --- | --- | --- |
| `TELEGRAM` | MVP actual | Gratuito, simple, canal operativo local |
| `WHATSAPP` | Futuro | Mas usado por clientes, pero con costos/reglas Meta |
| `WEB_APPROVAL` | Futuro | Links de aprobacion por cliente |
| `WEB_ADMIN` | Futuro | Panel minimo SATBOT/admin |

## Telegram

Telegram sigue siendo el canal MVP actual. Debe mantenerse simple:

- crear borradores;
- revisar pendientes;
- confirmar/cancelar;
- ver resumen;
- acciones sandbox/admin solo para owner.

No debe mostrar complejidad de tenant multi-emisor salvo que sea necesario.

## WhatsApp futuro

WhatsApp es canal futuro, no implementado. Requiere:

- decision de proveedor/API;
- costos por conversacion;
- plantillas aprobadas;
- reglas de Meta;
- manejo de opt-in;
- limites de adjuntos y datos sensibles.

No se implementa WhatsApp en 7.16D.

## WebApproval futuro

WebApproval sirve para links de aprobacion:

- resumen congelado;
- aprobar;
- rechazar;
- pedir correccion;
- evidencia de snapshot.

No debe permitir navegar otras facturas ni descargar XML/PDF en esta fase.

## WebAdmin futuro

Panel inicial para dueno/desarrollador SATBOT:

- clientes SaaS;
- despachos;
- emisores activos;
- plan contratado;
- facturas usadas;
- limite mensual;
- estado de pago;
- proveedor conectado;
- errores recientes;
- suspender/activar cuenta.

## Channel Command Contract

Todo adapter debe producir comandos seguros:

- `channel`
- `source_kind`
- `tenant_id`
- `emitter_id`
- `operator_id`
- `command`
- `payload`
- `idempotency_key`
- `requires_human_review`

No debe incluir credenciales, XML/PDF crudos, rutas internas ni datos fiscales
innecesarios.

## No-go

- No WhatsApp real.
- No WebApproval real.
- No WebAdmin real.
- No envio de XML/PDF/ZIP/Excel por Telegram.
- No PAC productivo.
- No timbrado real.
