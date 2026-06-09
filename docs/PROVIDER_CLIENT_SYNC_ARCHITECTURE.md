# Provider Client Sync Architecture

## Principio

Los UIDs de cliente proveedor no viven en variables por cliente. La fuente
normal es PostgreSQL local:

```text
provider_client_links.provider_client_uid
```

Las variables `.env` solo configuran el proveedor de forma global: credenciales
sandbox, modo sandbox, serie y opciones operativas globales. No deben contener
clientes reales ni UIDs por cliente.

## Capas

```text
cfdi_clients
  datos fiscales locales normalizados y revisados

provider_client_links
  vinculo local cliente -> proveedor

sandbox.provider.client.readiness
  gate read-only para decidir si el cliente esta listo

sandbox.draft.stamp
  consume provider_client_links o bloquea antes del PAC
```

## Acciones existentes

- `sandbox.provider.client.lookup`: busca en proveedor sin mutar local.
- `sandbox.provider.client.sync`: busca/crea/actualiza proveedor si se pide
  explicitamente y guarda link local.
- `sandbox.provider.client.link`: crea link manual revisado.
- `sandbox.provider.client.diagnose`: diagnostico simple de link.
- `sandbox.provider.client.email.diagnose`: diagnostico de email principal.
- `sandbox.provider.client.readiness`: preflight read-only de cliente.

## UID legacy

`FACTURACOM_SANDBOX_RECEIVER_UID` se conserva solo para pruebas heredadas. No es
flujo normal de UX. Para usarlo en timbrado sandbox live se requiere:

```text
--allow-legacy-receiver-uid
```

El resultado debe marcar:

```text
provider_client_uid_source=legacy_env
legacy_receiver_uid_used=true
warnings=["LEGACY_RECEIVER_UID_USED"]
```

## Politica de readiness

Readiness separa dos decisiones:

- `ready_for_provider_stamp`: permite timbrado sandbox live.
- `ready_for_provider_email`: permite entrega por Provider Email.

Un cliente puede estar listo para timbrar, pero no para Provider Email si falta
confirmacion o sincronizacion del email.

## Fuera de alcance

- Produccion fiscal real.
- PAC productivo.
- CSD.
- SMTP.
- email2/email3.
- Botones de sincronizacion desde Telegram.
- Datos reales versionados.
- Cambios a `data/concepts.normalized.json`.

## Nota 7.17C

La estabilizacion de callbacks Telegram es requisito antes de implementar la UX
7.18B de sync/link desde botones. El backend de `sandbox.provider.client.sync`
ya existe, pero la experiencia diaria debe seguir usando un unico ciclo seguro:

```text
boton -> token -> contexto -> accion -> respuesta visible -> nuevos botones
```

No agregar botones de sync proveedor hasta que el lifecycle de
`STAMP_DRAFT_SANDBOX`, `DOWNLOAD_SANDBOX_ARTIFACTS` y delivery quede validado en
Telegram real.
