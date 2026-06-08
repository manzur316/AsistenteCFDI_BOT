# ADR 0003 - Shared Telegram Bot Access Model

## Estado

Aceptado como foundation de Fase 7.16F.

## Decision

SATBOT usara por default un solo bot Telegram compartido.

No se creara un bot Telegram por cliente en el MVP. Los bots dedicados quedan
como opcion futura enterprise/white-label bajo `WHITE_LABEL_BOT`.

## Regla central

```text
Telegram ID = identidad de canal.
Tenant/subscription = derecho de uso.
Entitlements = acciones permitidas.
```

## Modelo

- `telegram_user_id` identifica una identidad de canal, no una suscripcion.
- `username` no es llave primaria porque puede cambiar.
- `chat_id` y `telegram_user_id` pueden ser distintos.
- Un usuario SATBOT interno puede pertenecer a uno o varios tenants.
- Un tenant puede tener uno o varios emisores fiscales.
- Un usuario puede tener un `active_emitter_id`.
- La suscripcion vive en `tenant_id`, no en `telegram_user_id`.
- Los permisos de uso se resuelven con entitlements.

## Suspension read-only

Si una suscripcion vence, el usuario entra a `READ_ONLY`; no se le corta todo el
chat.

En `READ_ONLY` puede:

- consultar historial;
- ver facturas previas;
- exportar informacion basica;
- renovar;
- contactar soporte.

En `READ_ONLY` no puede:

- crear nuevas facturas;
- timbrar;
- consumir creditos;
- ejecutar automatizaciones premium.

## Canales

Telegram sigue siendo MVP actual. WhatsApp, WebApproval y WebAdmin quedan como
canales futuros. La complejidad debe vivir en SATBOT Core, configuracion y panel;
Telegram debe mantenerse conversacional y simple.

## Seguridad

- No guardar tokens de Telegram en contratos o docs.
- No exponer IDs completos en mensajes publicos.
- No usar `telegram_user_id` como `tenant_id`.
- No usar `username` como llave primaria.
- No habilitar produccion fiscal real en esta fase.

## Consecuencias

El workflow Telegram futuro debera resolver:

```text
telegram_user_id
  -> user_id
  -> tenant_memberships
  -> tenant_subscriptions
  -> active_emitter_id
  -> entitlements
```

La Fase 7.16F solo crea foundation documental, SQL y contratos puros. No cambia
el workflow operativo ni el runner.
