# Fase 7.16B - Factura.com Sandbox Operativo Live

## Objetivo

La fase 7.16B separa de forma explicita el sandbox tecnico mock del sandbox
operativo live usado desde Telegram para timbrado de prueba.

Regla central:

```text
Telegram producto no timbra en mock.
```

El modo mock sigue disponible para pruebas unitarias, fixtures y diagnostico
tecnico. La operacion diaria simulada desde Telegram requiere Factura.com
Sandbox Live como proveedor real de prueba.

## Modos permitidos

### Mock sandbox

Uso permitido:

- tests unitarios;
- fixtures;
- smoke controlado sin proveedor externo;
- validacion de contratos locales.

Uso prohibido:

- timbrado operativo desde Telegram producto;
- marcar un borrador como `SANDBOX_TIMBRADO` en flujo producto;
- crear una respuesta de exito operativo.

### Sandbox Operativo Live

Uso permitido:

- timbrado sandbox desde Telegram producto;
- pruebas operativas contra Factura.com Sandbox;
- almacenamiento local de manifests sanitizados;
- descarga posterior de XML/PDF sandbox cuando el proveedor lo permita.

Configuracion requerida:

Valores publicos esperados:

- `FACTURACOM_SANDBOX_MODE`: `live`
- `FACTURACOM_SANDBOX_LIVE`: `1`
- `FACTURACOM_BASE_URL`: `https://sandbox.factura.com/api`

Variables privadas requeridas en configuracion local no versionada:

- `FACTURACOM_API_KEY`
- `FACTURACOM_SECRET_KEY`
- `FACTURACOM_PLUGIN`
- `FACTURACOM_SANDBOX_SERIE`

Desde 7.16E, `FACTURACOM_SANDBOX_RECEIVER_UID` ya no es la ruta normal de
timbrado sandbox live. El receptor se resuelve desde
`provider_client_links.provider_client_uid`. El UID global queda solo como
fallback legacy/test con bandera explicita.

## Resolucion canonica de configuracion

La fase incorpora un resolver interno:

```text
scripts/lib/facturacom-sandbox-config-resolver.js
```

Arquitectura:

```text
Telegram
-> n8n
-> Execute Command allowlisted
-> Action Layer
-> Canonical Provider Config Resolver
-> FacturaComSandboxAdapter
-> Factura.com Sandbox Live
```

El workflow n8n no contiene credenciales PAC. El Action Layer resuelve la
configuracion desde:

1. `process.env`;
2. `.env.pac.sandbox.local` si existe y esta ignorado por Git;
3. una mezcla de ambos cuando algunas variables vienen del proceso y otras del
   archivo local.

Esto corrige el caso donde n8n/Execute Command no hereda todas las variables
del shell, aunque el archivo local exista.

El diagnostico seguro incluye presencia/faltante y fuente de configuracion,
pero nunca imprime valores reales de API key, secret, plugin, receiver UID,
RFC, rutas absolutas ni contenido del archivo `.env`.

Accion local de diagnostico:

```powershell
node scripts/run-sandbox-action.js sandbox.facturacom.config.diagnose
```

Para tests o rutas locales temporales se puede apuntar a otro archivo con la
variable no sensible `FACTURACOM_SANDBOX_ENV_FILE`.

### Produccion fiscal real

Sigue bloqueada. Esta fase no habilita:

- PAC productivo;
- timbrado fiscal real;
- datos reales;
- envio de XML/PDF/ZIP/Excel por Telegram;
- XML/PDF productivos;
- sustitucion de contador.

## Cambios de contrato

El CLI acepta:

```powershell
node scripts/run-sandbox-action.js sandbox.draft.stamp --draft-id DRAFT-... --require-live-sandbox
```

Cuando `--require-live-sandbox` esta activo:

- el Action Layer exige Sandbox Operativo Live;
- el adapter no hace fallback a mock;
- falta de configuracion devuelve `NEEDS_CONFIG`;
- no se debe devolver `SANDBOX_TIMBRADO`;
- no se debe asignar `payment_status=PENDIENTE`;
- no se debe crear manifest de exito.

Errores normalizados principales:

```text
FACTURACOM_SANDBOX_MODE_REQUIRED
FACTURACOM_SANDBOX_LIVE_REQUIRED
FACTURACOM_SANDBOX_BASE_URL_REQUIRED
FACTURACOM_SANDBOX_API_KEY_REQUIRED
FACTURACOM_SANDBOX_SECRET_KEY_REQUIRED
FACTURACOM_SANDBOX_PLUGIN_REQUIRED
PROVIDER_CLIENT_LINK_MISSING
FACTURACOM_SANDBOX_SERIE_REQUIRED
FACTURACOM_SANDBOX_PRODUCTION_URL_BLOCKED
```

## Telegram

El flujo producto `STAMP_DRAFT_SANDBOX` agrega `--require-live-sandbox`.

Si falta configuracion live, Telegram debe responder en lenguaje humano:

```text
Factura.com Sandbox Live no configurado

El modo mock no se usa para timbrado operativo desde Telegram.
Sandbox Operativo Live debe resolver configuracion local segura desde el Action Layer.

Configuracion detectada:
- Modo live: si/no
- Live habilitado: si/no
- URL sandbox: si/no
- API key: presente/faltante
- Secret key: presente/faltante
- Plugin: presente/faltante
- Provider Client Link: presente/faltante
- Serie: presente/faltante

Fuente config: process.env / .env.pac.sandbox.local / mixed / missing
```

Si el timbrado live funciona, el resumen seguro debe indicar:

```text
Timbrado sandbox live OK
Modo: Sandbox Operativo Live
Resultado PAC: live sandbox
```

## Seguridad

- No se guardan credenciales en repo.
- No se versiona `runtime/`.
- No se exponen RFC, UUID, UID, rutas absolutas ni secrets en Telegram.
- No se adjuntan XML/PDF/ZIP/Excel por Telegram.
- `data/concepts.normalized.json` y fuentes SAT no cambian.
- `FACTURACOM_SANDBOX_RECEIVER_UID` queda como fallback legacy/test explicito.

## Deuda siguiente

La sincronizacion completa cliente local -> Factura.com Sandbox se implementa
en 7.16E con `provider_client_links`.

## Criterio de salida

7.16B queda lista cuando:

- mock sigue pasando tests tecnicos;
- Telegram producto requiere live sandbox;
- falta de live devuelve `NEEDS_CONFIG`;
- live fake/controlado devuelve exito operativo;
- regresion de workflows y safety sigue PASS.

Siguiente fase recomendada:

```text
7.17 Monthly Fiscal Sandbox Summary / IVA ISR Estimate
```
