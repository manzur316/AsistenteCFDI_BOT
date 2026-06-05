# Phase 7.2 Telegram Product Menu Renderer

Estado: renderer puro offline

Fecha: 2026-06-05

## Objetivo

Crear una capa presentacional pura para convertir el contrato
`TELEGRAM_PRODUCT_MENU_V1` en payloads seguros compatibles con Telegram. Esta
fase no envia mensajes, no modifica workflows n8n, no ejecuta acciones, no
llama PAC y no cambia logica fiscal.

## Archivos

```text
scripts/lib/telegram-product-menu-renderer.js
scripts/test-telegram-product-menu-renderer.js
```

El renderer importa:

```text
scripts/lib/telegram-product-menu-contract.js
```

## Exports

- `TELEGRAM_PRODUCT_MENU_RENDERER_VERSION`
- `renderTelegramMainMenu(role, options)`
- `renderTelegramSubmenu(menuId, role, options)`
- `renderTelegramHelp(role, options)`
- `renderTelegramUnauthorized(options)`
- `renderTelegramMenuError(errorCode, options)`

Version actual:

```text
TELEGRAM_PRODUCT_MENU_RENDERER_V1
```

## Contrato De Salida

Cada funcion devuelve un objeto serializable con:

- `text`
- `reply_markup.inline_keyboard` cuando aplica

No usa `parse_mode` por ahora para mantener texto simple y evitar problemas de
escape.

Ejemplo de menu principal:

```json
{
  "text": "Menu CFDI\n\nOrganizo borradores CFDI para captura y revision manual.\nElige una opcion para continuar.\n\nBorrador sujeto a revision humana. No sustituye contador.",
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "Nueva factura / borrador CFDI",
          "callback_data": "cfdi_nav:new"
        }
      ],
      [
        {
          "text": "Clientes",
          "callback_data": "cfdi_nav:clients"
        }
      ]
    ]
  }
}
```

Ejemplo de acceso no autorizado:

```json
{
  "text": "Acceso no autorizado.\n\nEste bot es privado. Pide al propietario que revise tu acceso.\n\nBorrador sujeto a revision humana. No sustituye contador."
}
```

## Textos Minimos Cubiertos

- Menu principal: explica que el bot organiza borradores CFDI sujetos a revision
  humana.
- Facturas: crear y revisar borradores.
- Clientes: buscar, crear y validar clientes.
- Reportes: resumen mensual y paquete contador en modo seguro.
- Sistema: estado y ayuda.
- Admin/Sandbox: visible solo para admin/owner con bandera explicita.

Todos los textos incluyen:

```text
Borrador sujeto a revision humana. No sustituye contador.
```

## Seguridad

El renderer no incluye en payloads:

- tokens;
- chat_id;
- user_id;
- RFC;
- UUID;
- UID;
- montos;
- rutas;
- documentos fiscales o paquetes de archivos;
- CSD;
- `.env`;
- credenciales;
- datos reales.

El renderer tampoco:

- lee `runtime/`;
- usa filesystem;
- depende de n8n;
- llama Telegram;
- ejecuta acciones;
- envia archivos;
- llama PAC;
- timbra.

## Roles

El renderer delega el filtrado al contrato 7.1:

- Usuario normal no ve `ADMIN_ONLY` ni `SANDBOX_ONLY`.
- `OWNER` puede ver `Admin/Sandbox` solo cuando el caller pasa `includeAdmin` o
  `includeSandbox`.
- `FUTURE` no aparece por defecto.
- `DEPRECATED` no se promueve como boton principal.

## Como Se Conectara En 7.3

Fase 7.3 debe crear un adapter de router que:

1. Reciba un comando o callback.
2. Valide usuario y rol.
3. Llame a este renderer.
4. Entregue el payload a la capa que ya envia mensajes.
5. Mantenga los callbacks dentro de la allowlist del contrato.

Fase 7.3 no debe cambiar IDs ni textos criticos sin actualizar este renderer y
su test.

## Tests

Comando principal:

```bash
node scripts/test-telegram-product-menu-renderer.js
```

El test valida:

- menu principal con texto y teclado;
- submenus con texto y teclado;
- ocultamiento de admin/sandbox para usuario normal;
- visibilidad admin/sandbox para owner con bandera explicita;
- callbacks seguros y cortos;
- ausencia de datos sensibles;
- ausencia de tokens y rutas;
- independencia de runtime, n8n y red;
- que el renderer no envia mensajes.

## No-Go De 7.2

Esta fase no autoriza:

- modificar workflows;
- tocar `runtime/`;
- cambiar logica fiscal;
- tocar `data/concepts.normalized.json`;
- llamar PAC;
- timbrar;
- enviar archivos por Telegram;
- implementar Fase 7.3;
- usar datos reales.

## Siguiente Fase Recomendada

```text
7.3 Telegram Product Menu Router Adapter
```

Objetivo recomendado: conectar el renderer al router local como adapter, sin
cambiar decisiones fiscales ni habilitar PAC real.
