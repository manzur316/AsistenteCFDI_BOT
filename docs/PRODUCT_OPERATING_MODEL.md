# Product Operating Model

## Proposito

AsistenteCFDI_BOT debe ser un asistente privado para tecnicos, RESICO y pymes:
rapido para capturar trabajo diario, completo para ordenar evidencia y seguro
para preparar revision humana.

No debe sentirse como un bot limitado que manda todo al contador. Tampoco debe
convertirse en un sistema pesado con demasiadas pantallas. El producto debe ser:

- Simple por fuera.
- Completo por dentro.
- Rapido para uso diario.
- Guiado cuando falte informacion.
- Seguro fiscalmente cuando exista riesgo real.

Principio central:

```text
Entrada simple, motor completo.
```

El usuario debe poder escribir como trabaja. El bot interpreta, completa,
ordena y pregunta solo lo necesario. El contador revisa evidencia ordenada, no
reconstruye todo desde cero.

## Modos de Operacion

### Modo Rapido

El usuario escribe una actividad en lenguaje natural:

```text
Privada Rivera, revise camaras por 800 + IVA
```

El bot intenta detectar:

- Cliente.
- Trabajo realizado.
- Monto.
- IVA.
- Concepto CFDI permitido.
- Estado del borrador.
- Estado de pago cuando venga en el mensaje.

Si todo esta dentro de guardrails, el bot prepara un borrador listo para
confirmacion humana. La salida sigue siendo `Borrador sujeto a revisión humana`.

### Modo Guiado

El bot pregunta solo el dato faltante. No debe reiniciar el flujo ni abrir menus
innecesarios.

Ejemplos:

- Falta cliente: preguntar cliente o permitir continuar como no validado.
- Falta monto: pedir monto.
- Falta IVA: pedir si es `+ IVA` o `IVA incluido`.
- Falta equipo/sistema: pedir una aclaracion concreta.
- Hay material y mano de obra mezclados: pedir decision de separacion.
- Hay varias actividades con un solo monto: pedir desglose o decision.

### Modo Revision

El modo revision se activa solo ante riesgo fiscal real, no por flojera del bot.

Debe escalar a revision cuando exista:

- Actividad fuera de constancia.
- Cliente no validado.
- Retenciones dudosas.
- Material/mano de obra sin desglose.
- Cancelacion real.
- Discrepancia PAC.
- Declaracion mensual final.

La revision no bloquea la organizacion. El bot debe guardar evidencia, explicar
la causa y dejar el caso ordenado para el usuario o contador.

## Regla Anti-Menus

No crear flujos con demasiados submenus. La interfaz principal debe tener como
maximo cinco accesos:

- Nueva factura.
- Pendientes.
- Pagos/Cobros.
- Reporte del mes.
- Ayuda.

Los menus secundarios deben aparecer solo cuando ya hay contexto. Por ejemplo,
un borrador puede mostrar Confirmar, Editar, Cancelar y Ver detalle; eso no debe
convertirse en un arbol de opciones.

## Regla Anti-Simplificacion Excesiva

No mandar todo al contador. El bot debe resolver lo resoluble con datos locales,
catalogos y guardrails.

El bot debe intentar resolver:

- Cliente conocido.
- Concepto permitido.
- Monto.
- IVA.
- Estado de pago.
- Draft.
- Resumen mensual.
- Organizacion por cliente y periodo.
- Paquete contador.

El contador debe recibir evidencia ordenada y alertas claras, no mensajes
sueltos ni decisiones que el sistema pudo estructurar.

## Guardrails de Producto

El bot puede sugerir, organizar y preparar. No debe:

- Timbrar CFDI en esta etapa.
- Llamar PACs reales.
- Generar XML/PDF fiscales reales.
- Presentar declaraciones.
- Sustituir la revision humana.
- Activar conceptos nuevos automaticamente.
- Inventar claves SAT, unidades o actividades.

Todo resultado fiscal debe conservar:

```text
Borrador sujeto a revisión humana
```

## Escritura Natural Esperada

El usuario puede escribir frases como:

```text
Revise camaras en Rivera por 800 + IVA
```

```text
Venta de router para Areatza, 1200 IVA incluido
```

```text
Instale chapa magnetica y boton de salida en caseta, 1500 + IVA
```

```text
Marca Rivera como pagada
```

```text
Cuanto cobre este mes
```

El producto debe preferir interpretar antes que forzar formularios.

## Comandos y Accesos Naturales

El bot debe soportar comandos formales y lenguaje natural equivalente.

Ejemplos esperados:

- `Muestrame pendientes`
- `Que me deben`
- `Marca Rivera como pagada`
- `Cuanto cobre este mes`
- `Reporte de junio`
- `Paquete contador de junio`
- `Que facturas estan vencidas`
- `Cuanto tengo pendiente por cobrar`

Estos accesos deben mapear a acciones simples:

- Ver pendientes.
- Ver deuda por cliente.
- Registrar cobro.
- Ver cobrado del periodo.
- Generar reporte mensual.
- Generar paquete contador.
- Ver vencidas.
- Ver saldo pendiente.

## Asistente del Asistente

El modo ayuda debe explicar el estado actual y el siguiente paso concreto. No
debe responder con ayuda generica cuando ya hay contexto.

Debe poder explicar:

- Por que algo esta bloqueado.
- Que falta para confirmar.
- Como escribir rapido.
- Que significan pendientes y cobros.
- Que incluye el reporte mensual.
- Que debe revisar el contador.

Ejemplos de ayuda contextual:

```text
No puedo confirmar todavia porque falta validar el cliente. Puedes elegir un
cliente existente, crear cliente basico o continuar como borrador no validado.
```

```text
Detecte material y mano de obra en un mismo monto. Puedes separarlos o tratarlo
como servicio integral. En ambos casos queda sujeto a revision humana.
```

```text
Ese trabajo parece fuera de tus actividades actuales. Puedo guardarlo como
evento, pero no sugerirlo como factura lista.
```

## Relacion con Contador

El contador no debe reconstruir la operacion desde cero. El sistema debe preparar
un paquete revisable:

- Borradores confirmados.
- Facturas pendientes.
- Cobros registrados.
- Canceladas visibles.
- Estimados de impuestos.
- Alertas de cliente no validado.
- Alertas de actividad o retenciones.
- Evidencia por cliente y periodo.

El contador revisa y corrige. El bot organiza y reduce friccion.

## Principios de Interaccion

- Una pregunta por vez cuando falte informacion.
- Mantener contexto de la factura activa.
- Evitar menus largos.
- Mostrar acciones directas cuando hay estado.
- No pedir datos que ya se puedan inferir con seguridad.
- No inferir fiscalmente cuando hay riesgo real.
- Mantener trazabilidad del mensaje original.

## Fuera de Alcance

Esta fase no implementa:

- PAC real.
- Factura.com sandbox.
- Timbrado.
- XML/PDF real.
- Cambios a workflows productivos.
- Cambios al catalogo fiscal activo.
- Credenciales.
- Datos reales de clientes.
