# Shared Telegram Bot UX Access Rules

## Principio

Telegram debe seguir siendo simple. La resolucion de tenant, emisor,
suscripcion y entitlements vive en SATBOT Core y configuracion, no en mensajes
largos al usuario.

## Usuario no registrado

```text
No encontre tu acceso a SATBOT.
Pega tu codigo de invitacion o contacta al administrador.
```

Botones futuros:

```text
[Tengo codigo]
[Contactar soporte]
```

## Plan vencido READ_ONLY

```text
Tu plan esta vencido.

Puedes seguir consultando tus facturas anteriores, pero para crear o timbrar nuevas facturas necesitas renovar.

[Renovar plan]
[Ver facturas]
[Contactar soporte]
```

Reglas:

- No crear borradores nuevos.
- No timbrar sandbox ni produccion.
- Si se permite export basico, debe ser seguro y sin secretos.

## Trial

```text
Modo prueba activo.
Te quedan X dias y Y facturas de prueba.
Estos CFDI no tienen validez fiscal real.
```

Reglas:

- Solo sandbox/test.
- No produccion fiscal real.
- Mostrar `MODO PRUEBA`.
- Mantener storage separado.

## Admin/white-label

Bots dedicados por tenant/despacho son futuro enterprise/white-label. El MVP
usa un bot compartido.

## No-go UX

- No pedir al usuario elegir tenant/emisor en cada mensaje si ya hay uno activo.
- No mostrar IDs internos completos.
- No mostrar token Telegram.
- No mostrar RFC/UUID/UID completos innecesariamente.
- No enviar XML/PDF/ZIP/Excel por Telegram hasta fase explicita.
