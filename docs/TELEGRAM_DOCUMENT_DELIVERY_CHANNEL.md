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
sandbox.documents.provider-email.diagnose
sandbox.documents.provider-email.send
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
- PDF debe pasar validacion visual (`pdf_visual_content_present=true`);
- placeholders quedan bloqueados;
- paths absolutos, token y chat_id completo no se imprimen;
- no se aceptan archivos fuera de `runtime/`;
- no se adjuntan ZIP, Excel, JSON ni CSV.
- se usan aliases humanos seguros cuando existen, no rutas internas
  `cfdi.xml/cfdi.pdf` para el nombre visible del documento.

## Estados

- `NEEDS_CONFIG`: canal apagado o incompleto.
- `DRY_RUN`: config y archivos validos, sin enviar.
- `BLOCKED`: archivos faltantes o contenido invalido.
- `OK`: envio real completado cuando se habilite explicitamente.

## Seguridad

No versionar `runtime/`, tokens, `.env`, CSD, XML/PDF ni datos reales. Este canal
no habilita produccion, PAC productivo ni timbrado fiscal real.

## Relacion con Provider Email

Telegram Document Channel es un canal interno/privado para historial documental.
El canal principal para cliente es Provider Email via PAC sandbox, documentado en:

```text
docs/PROVIDER_EMAIL_DELIVERY_ARCHITECTURE.md
docs/DOCUMENT_DELIVERY_CANONICAL_CONTRACT.md
```

SMTP no es flujo principal y no se implementa en esta fase.
