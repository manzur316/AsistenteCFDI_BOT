# Phase 7.4 Product Flow Integration

Fecha: 2026-06-05

Estado: implementado para el workflow primario local de Telegram.

## Alcance

La fase 7.4 pule la navegacion diaria del usuario dentro de Telegram usando el
workflow primario:

```text
workflow/cfdi_telegram_local_ingest.n8n.json
```

No se modifica el router tecnico sandbox, no se cambia scoring fiscal, no se
toca el catalogo de conceptos y no se implementa produccion.

## Flujos integrados

### Inicio y ayuda

- `/start` muestra el menu producto principal.
- `/help` muestra ayuda contextual de producto.
- Los botones de regreso apuntan al menu producto cuando corresponde.
- Los callbacks visibles tienen respuesta concreta.

### Nueva factura / borrador

- `cfdi_nav:new` inicia el flujo existente de `/factura`.
- El mensaje inicial explica que puede enviarse plantilla o texto rapido.
- El preview del borrador conserva botones tokenizados para acciones sensibles:
  ver detalle, editar, confirmar y cancelar.

### Edicion de borrador

- El menu de edicion por campos sigue disponible con action tokens.
- Las acciones de edicion no implementadas responden:

```text
Esta edicion aun esta en preparacion.
```

- Las vistas con botones priorizan navegacion por botones y no dependen de
comandos legacy.

### Confirmar / aprobar / regresar

- Confirmar borrador muestra feedback claro y estado resultante.
- Aprobar borrador conserva botones de detalle, regreso a borrador y menu.
- Regresar aprobado a borrador cambia el estado a `PENDIENTE` y responde con
confirmacion clara.

### Clientes

- `cfdi_nav:clients` lista clientes o responde que no hay clientes cargados.
- El submenu de clientes muestra:
  - Facturas del cliente.
  - Pendientes pago.
  - Pagadas.
  - Canceladas.
  - Buscar cliente.
  - Nuevo cliente.
  - Validar cliente, solo OWNER.
  - Menu principal.

### Pendientes

- `cfdi_nav:drafts` lista borradores pendientes.
- Si no hay pendientes, responde explicitamente.
- Los borradores pendientes conservan acciones tokenizadas para ver, aprobar o
descartar.

### Reportes

- `cfdi_nav:report` muestra resumen seguro.
- Si no hay datos, responde:

```text
No hay datos suficientes para mostrar resumen mensual.
```

### Estado del sistema

`cfdi_nav:status` muestra un estado local seguro:

- bot activo;
- base conectada;
- usuario autorizado;
- modo local/sandbox;
- produccion bloqueada;
- version del workflow;
- chatState sin contenido sensible.

No muestra secretos, rutas absolutas, tokens, CSD ni archivos.

### Admin/Sandbox

- `cfdi_nav:admin` y `cfdi_sbx:*` son solo OWNER.
- Para usuario normal responden `ACCESS_DENIED`.
- El mensaje aclara que sandbox no es produccion.
- El workflow primario no ejecuta acciones tecnicas sandbox; solo responde de
forma segura o remite al router tecnico.

## Seguridad

Se mantiene:

- no PAC productivo;
- no timbrado real;
- no envio de XML/PDF/ZIP/Excel por Telegram;
- no tokens ni credenciales;
- no `.env`;
- no CSD;
- no rutas absolutas;
- no cambios en `data/concepts.normalized.json`;
- no versionado de `runtime/`.

## Pruebas

Se agrega:

```text
scripts/test-telegram-product-flow-integration.js
```

Valida:

- `/start` como menu producto;
- `/help` como ayuda contextual;
- navegacion del menu principal;
- clientes con opciones claras;
- OWNER ve admin/sandbox;
- usuario normal no ve ni ejecuta admin/sandbox;
- confirmacion de borrador con feedback;
- regreso de aprobado a borrador;
- resumen sin datos explicito;
- estado seguro sin secretos;
- botones visibles con respuesta;
- ausencia de documentos o produccion en Telegram;
- `runtime/.tmp-handle-local-ingest.js` no versionado.

## Limites

Esta fase no implementa:

- PAC real;
- timbrado;
- produccion;
- envio de documentos por Telegram;
- interfaz web;
- cambios de scoring fiscal;
- cambios al catalogo SAT/conceptos.

## Siguiente fase recomendada

`7.5 Telegram Product E2E Manual Validation`
