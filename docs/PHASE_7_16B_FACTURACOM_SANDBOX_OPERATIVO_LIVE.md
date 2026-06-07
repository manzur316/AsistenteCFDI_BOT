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
- `FACTURACOM_SANDBOX_RECEIVER_UID`
- `FACTURACOM_SANDBOX_SERIE`

Las credenciales y UIDs se mantienen solo en configuracion local no versionada.

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

Error normalizado principal:

```text
FACTURACOM_SANDBOX_LIVE_OPERATIONAL_MODE_REQUIRED
```

## Telegram

El flujo producto `STAMP_DRAFT_SANDBOX` agrega `--require-live-sandbox`.

Si falta configuracion live, Telegram debe responder en lenguaje humano:

```text
Factura.com Sandbox Live no configurado

El modo mock no se usa para timbrado operativo desde Telegram.
Para operar como proveedor real de prueba necesitas configurar Sandbox Operativo Live.
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
