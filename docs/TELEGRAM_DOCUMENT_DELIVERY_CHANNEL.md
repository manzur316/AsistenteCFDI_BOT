# Telegram Document Delivery Channel

## Objetivo

Preparar un canal privado para entrega futura de XML/PDF sandbox por Telegram,
sin activarlo por defecto y sin enviar documentos invalidos.

Esta fase solo agrega diagnostico y dry-run. No cambia el comportamiento
operativo de Telegram: los documentos no se adjuntan automaticamente.

## Modulo

```text
scripts/lib/telegram-document-delivery-channel.js
```

Funciones:

```text
diagnoseDocumentDeliveryConfig(env)
sendSandboxInvoiceDocumentsToTelegram({ chatId, files, caption, telegramBotToken, dryRun })
```

Acciones Action Layer:

```text
sandbox.documents.delivery.diagnose
sandbox.documents.delivery.send
```

## Variables Locales

```text
TELEGRAM_DOCUMENT_DELIVERY_ENABLED=0
TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID=REEMPLAZAR_LOCALMENTE
TELEGRAM_BOT_TOKEN=REEMPLAZAR_LOCALMENTE
```

El default es deshabilitado. Aun con configuracion presente, el envio real
requiere llamada explicita con `--send-real`; `--dry-run` valida sin enviar.

## Guardrails

Antes de cualquier envio:

- XML/PDF deben existir dentro de `runtime/`;
- XML/PDF deben pasar validacion de contenido CFDI/PDF;
- placeholders quedan bloqueados;
- paths absolutos, token y chat_id completo no se imprimen;
- no se aceptan archivos fuera de `runtime/`;
- no se adjuntan ZIP, Excel, JSON ni CSV.

## Estados

- `NEEDS_CONFIG`: canal apagado o incompleto.
- `DRY_RUN`: config y archivos validos, sin enviar.
- `BLOCKED`: archivos faltantes o contenido invalido.
- `OK`: envio real completado cuando se habilite explicitamente.

## Seguridad

No versionar `runtime/`, tokens, `.env`, CSD, XML/PDF ni datos reales. Este canal
no habilita produccion, PAC productivo ni timbrado fiscal real.
