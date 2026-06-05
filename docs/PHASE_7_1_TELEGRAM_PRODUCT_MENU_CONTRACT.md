# Phase 7.1 Telegram Product Menu Contract

Estado: contrato versionado y testeable

Fecha: 2026-06-05

## Objetivo

Crear el contrato offline del menu producto de Telegram para que Fase 7.2 pueda
renderizarlo sin inventar IDs, roles, callbacks ni rutas. Esta fase no modifica
workflows n8n, no envia mensajes, no llama PAC, no timbra y no cambia logica
fiscal.

## Archivos De Contrato

```text
scripts/lib/telegram-product-menu-contract.js
scripts/test-telegram-product-menu-contract.js
```

Exports principales:

- `TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION`
- `MAIN_MENU`
- `SUBMENUS`
- `LEGACY_COMMANDS`
- `ACTION_CLASSIFICATION`
- `ROLES`
- `getTelegramProductMenu(role, options)`
- `getTelegramSubmenu(menuId, role, options)`
- `validateTelegramCallbackData(callbackData)`
- `classifyTelegramMenuAction(callbackData)`

## Version De Schema

```text
TELEGRAM_PRODUCT_MENU_V1
```

El schema version debe viajar con cada menu renderizado para que el futuro
renderer n8n/Telegram pueda detectar cambios de contrato.

## Menu Principal

El contrato contiene estos accesos minimos:

- Nueva factura / borrador CFDI
- Clientes
- Borradores pendientes
- Reporte mensual
- Paquete para contador
- Estado del sistema
- Ayuda
- Admin/Sandbox

`Admin/Sandbox` existe en el contrato, pero queda oculto por defecto y solo
aparece para `OWNER` cuando el caller pasa `includeAdmin` o `includeSandbox`.

## Submenus

Submenus versionados:

- `invoices`
- `clients`
- `reports`
- `system`
- `admin_sandbox`

Cada submenu devuelve objetos compatibles con Telegram:

```json
{
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "Nueva factura",
          "callback_data": "cfdi_nav:new"
        }
      ]
    ]
  }
}
```

El contrato solo construye objetos. No llama Telegram, no lee runtime y no
depende de n8n.

## Roles

Roles definidos en el contrato:

- `OWNER`
- `ASSISTANT_OPERATOR`
- `ACCOUNTANT_READONLY`
- `ADMIN_FUTURE`

Reglas base:

- `OWNER` puede ver la superficie completa permitida por fase, incluyendo
  sandbox solo si se solicita explicitamente.
- `ASSISTANT_OPERATOR` ve captura, clientes basicos, borradores, estado y ayuda.
- `ACCOUNTANT_READONLY` ve reportes, paquete contador, estado y ayuda.
- `ADMIN_FUTURE` no recibe permisos automaticos.

## Clasificacion De Acciones

Clasificaciones permitidas:

- `USER_SAFE`
- `ADMIN_ONLY`
- `SANDBOX_ONLY`
- `FUTURE`
- `DEPRECATED`

Uso esperado:

- `USER_SAFE`: operacion diaria con guardrails.
- `ADMIN_ONLY`: cambios o validaciones sensibles.
- `SANDBOX_ONLY`: herramientas tecnicas del sandbox 6A.
- `FUTURE`: reservado, no visible por defecto.
- `DEPRECATED`: comandos legacy que se conservan por compatibilidad pero no se
  promueven como UX principal.

## Callback_Data

Namespaces permitidos:

```text
cfdi_nav:*   navegacion producto sin estado
cfdi:<token> acciones tokenizadas existentes
cfdi_sbx:*   sandbox/admin existente
```

Reglas de `cfdi_nav:*`:

- longitud maxima: 32 caracteres;
- caracteres permitidos: `[a-z0-9_:.-]`;
- sin RFC;
- sin UUID;
- sin UID;
- sin montos;
- sin rutas;
- sin XML/PDF/ZIP/Excel;
- sin secretos ni `.env`;
- sin datos fiscales o de cliente.

Reglas de `cfdi:<token>`:

- solo transporta token opaco;
- el token debe validarse fuera del contrato contra PostgreSQL;
- debe estar ligado a chat/user, expirar y fallar cerrado si se reutiliza.

Reglas de `cfdi_sbx:*`:

- queda separado de producto diario;
- solo `SANDBOX_ONLY`;
- no habilita PAC productivo;
- no envia archivos por Telegram.

## Como Se Conectara En 7.2

Fase 7.2 debe consumir este contrato sin cambiar sus IDs:

1. Cargar `scripts/lib/telegram-product-menu-contract.js`.
2. Detectar rol autorizado del usuario.
3. Llamar `getTelegramProductMenu(role, options)`.
4. Enviar `reply_markup.inline_keyboard` desde la capa de renderer.
5. Al recibir callback, validar primero con
   `validateTelegramCallbackData(callbackData)`.
6. Clasificar con `classifyTelegramMenuAction(callbackData)`.
7. Enrutar a handlers existentes o futuros sin poner datos fiscales en
   `callback_data`.

Fase 7.2 no debe inventar callbacks nuevos sin actualizar este contrato y su
test.

## No-Go De 7.1

Esta fase no autoriza:

- modificar workflows n8n;
- tocar `runtime/`;
- cambiar logica fiscal;
- tocar `data/concepts.normalized.json`;
- llamar PAC;
- timbrar;
- enviar XML/PDF/ZIP/Excel por Telegram;
- implementar Fase 7.2;
- usar datos reales.

## Tests

Comando principal:

```bash
node scripts/test-telegram-product-menu-contract.js
```

El test valida:

- version de schema;
- menu principal;
- submenus;
- callbacks seguros;
- filtrado por roles;
- ocultamiento de `ADMIN_ONLY` y `SANDBOX_ONLY` para usuario normal;
- soporte de `cfdi:<token>` y `cfdi_sbx:*`;
- ausencia de token Telegram;
- independencia de n8n, workflows y filesystem.

## Criterios De Salida

- Contrato JS versionado existe.
- Test offline PASS.
- README y roadmap enlazan la fase.
- No se tocaron workflows, runtime, catalogos ni logica fiscal.
- Siguiente fase queda definida como renderer, no ejecucion fiscal.

## Siguiente Fase Recomendada

```text
7.2 Telegram Product Menu Renderer
```

Objetivo recomendado: renderizar el contrato `TELEGRAM_PRODUCT_MENU_V1` en la
superficie Telegram local, sin cambiar reglas fiscales ni habilitar PAC real.
