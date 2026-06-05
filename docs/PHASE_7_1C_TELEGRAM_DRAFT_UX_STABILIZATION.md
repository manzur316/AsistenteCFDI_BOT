# Phase 7.1C Telegram Draft UX Stabilization

## Objetivo

Estabilizar la experiencia real de borradores CFDI en Telegram dentro del
workflow operativo principal:

```text
workflow/cfdi_telegram_local_ingest.n8n.json
```

Esta fase no cambia scoring, reglas fiscales, catalogo SAT, PAC, produccion ni
timbrado. Solo mejora mensajes, botones y transiciones de UX para evitar que el
usuario tenga que recordar comandos tecnicos durante el flujo diario.

## Cambios De UX

### Preview principal

El preview por defecto ahora muestra una vista corta:

- cliente;
- total estimado;
- estado `BORRADOR`;
- advertencias principales;
- recordatorio de revision humana.

El detalle SAT/fiscal completo queda accesible desde el boton `Ver detalle`.
El mensaje principal ya no muestra instrucciones tipo `Responder: confirmar,
editar, cancelar`.

### Botones principales

El preview conserva cuatro acciones:

```text
Confirmar | Editar
Cancelar  | Ver detalle
```

Estas acciones siguen usando action tokens seguros con callback_data corto
`cfdi:<token>`.

### Edicion por campos

El modo edicion ahora muestra botones orientados a campos:

```text
Cliente | Concepto / descripcion
Monto   | IVA
Agregar linea | Editar linea
Eliminar linea | Regresar
```

Los botones de campo que aun no ejecutan edicion especifica responden con un
mensaje claro y vuelven al menu de edicion. El usuario tambien puede escribir
cambios en texto libre.

### Aprobacion

Al aprobar un borrador, el bot responde de forma explicita:

- `Borrador aprobado`;
- ID del borrador;
- cliente;
- total estimado;
- estado actual `APROBADO`;
- siguiente paso futuro como emision fiscal real.

No se emite CFDI real, no se llama PAC y no se envia documento por Telegram.

### Regresar A Borrador

Los borradores `APROBADO` pueden regresar a borrador operativo mediante el boton
`Regresar a borrador`, siempre que aun no exista una fase futura de timbrado o
cancelacion real.

Internamente, el estado operativo vuelve a `PENDIENTE`; en UX se muestra como
`BORRADOR`.

### Ver Resumen

`Ver resumen` ya no abre menu/ayuda de forma silenciosa. Ahora devuelve un
resumen mensual basico cuando hay datos o:

```text
No hay datos suficientes para mostrar resumen mensual.
```

## Estados Actuales

Estados operativos actuales:

- `PENDIENTE`: borrador pendiente; se muestra al usuario como `BORRADOR`.
- `APROBADO`: borrador aprobado por humano, sin emision fiscal real.
- `DESCARTADO`: borrador descartado.

## Estados Futuros Planeados

Estados para fases posteriores:

- `BORRADOR`;
- `APROBADO`;
- `TIMBRADO`;
- `ENVIADO`;
- `PENDIENTE_PAGO`;
- `PAGADO`;
- `CANCELADO`.

La transicion `APROBADO -> BORRADOR` solo aplica mientras no exista estado
fiscal real posterior.

## No-Go

Esta fase no implementa:

- PAC real o produccion;
- timbrado CFDI;
- XML/PDF/ZIP/Excel por Telegram;
- nuevos workflows;
- cambio de scoring o reglas fiscales;
- cambios en `data/concepts.normalized.json`;
- Fase 7.3.

## Pruebas

Prueba principal:

```bash
node scripts/test-telegram-ui-state-buttons.js
```

Validaciones agregadas:

- preview principal sin comandos legacy visibles;
- menu de edicion por campos;
- aprobacion con respuesta clara y botones posteriores;
- regreso de `APROBADO` a borrador operativo;
- `Ver resumen` no abre menu de forma silenciosa;
- callback_data sigue seguro y corto;
- no se crean drafts nuevos al aprobar/descartar/regresar;
- no se envia documento por Telegram.

## Siguiente Fase Recomendada

`7.3 Telegram Product Menu Router Adapter`
