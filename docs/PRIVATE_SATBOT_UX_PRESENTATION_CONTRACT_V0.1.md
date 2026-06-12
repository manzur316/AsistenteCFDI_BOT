# Private SatBot UX Presentation Contract v0.1

## 1. Estado del documento

- Proyecto: Private SatBot
- Alcance: presentacion humana de Telegram
- Estado: DRAFT / REVIEW_REQUIRED
- Fuera de alcance: implementacion, Public SatBot, cobranza avanzada, PAC real

Este documento define como debe presentarse informacion operativa en Telegram antes de modificar textos, listas, botones o mensajes del workflow. No cambia logica, estados, datos ni runtime.

## 2. Principio central

Private SatBot debe hablar como herramienta humana, no como log tecnico.

Los IDs tecnicos siguen existiendo internamente y son la autoridad para persistencia, callbacks, PAC, facturas, drafts y auditoria. Esos IDs no deben contaminar listas normales ni pantallas operativas de uso diario.

Telegram debe mostrar informacion breve, accionable y legible. Cuando una operacion requiera historial largo, revision masiva o datos fiscales profundos, el bot debe dirigir al usuario a Factura.com/PAC o a una pantalla de detalle especifica.

## 3. Capas de presentacion

### Lista

Compacta, humana y accionable.

- Sirve para seleccionar rapido.
- Muestra solo los datos necesarios para elegir el item correcto.
- Usa indices visibles temporales, no IDs tecnicos.
- Debe funcionar con `list_context` cuando la lista sea accionable.

### Detalle

Completa, revisable y sin saturar.

- Muestra la informacion necesaria para decidir una accion.
- Puede mostrar concepto fiscal completo.
- Puede mostrar estado operativo y acciones disponibles.
- Debe conservar `return_to` cuando venga de una lista.

### Debug/Admin

Tecnica y restringida.

- Puede mostrar IDs completos, raw status, UUID, provider invoice id o diagnosticos.
- Debe estar separada de la operacion diaria.
- No debe parecer una lista normal de trabajo.

## 4. Datos que no deben aparecer en listas normales

No mostrar en listas normales:

- `DRAFT-*` completo.
- `CLI-*` completo.
- UUID completo.
- Callback token.
- Raw status tecnico.
- `validado=no`.
- `facturas=0` si no aporta.
- `[APROBADO]` dentro de lista de aprobados.
- `[PENDIENTE]` dentro de lista de pendientes.
- Conceptos fiscales largos repetidos.
- Rutas de archivos.
- Errores tecnicos internos.

Estos datos pueden existir en detalle tecnico, logs, auditorias, runtime QA o pantallas admin.

## 5. Datos que si deben aparecer en listas normales

Mostrar en listas normales:

- Indice visible.
- ID humano corto.
- Cliente.
- Titulo humano corto.
- Total.
- Estado accionable solo si aporta.
- Conteo de facturas cuando aporta.
- Indicador de pendiente, vencida, parcial o cancelada solo cuando sea relevante.

Regla: cada item de lista debe permitir identificar el registro sin obligar al usuario a leer texto fiscal largo.

## 6. Nomenclatura humana

### Borradores

- Borrador interno: `DRAFT-20260611-062403-1736943171`
- Borrador humano: `BOR-3171`
- Borrador humano extendido si hay colision: `BOR-0611-3171`

### Facturas

- Factura con serie/folio PAC: `A-1024`
- Factura fallback: `FAC-<uuid corto>`

Reglas:

- `BOR-*` y `FAC-*` son display-only.
- La autoridad interna sigue siendo `draft_id`, UUID, serie/folio PAC y provider invoice id.
- Si existe serie/folio del PAC, debe preferirse sobre fallback.
- El UUID completo solo pertenece a detalle tecnico, XML/PDF, PAC o auditoria.

## 7. Titulo humano `display_title`

`display_title` es el titulo corto de UI para describir el trabajo o factura en lenguaje humano.

Ejemplo:

- Entrada: "instale tres camaras CCTV en Real Bilbao"
- `display_title`: "Instalacion de 3 camaras CCTV"
- Concepto fiscal: "SERVICIO DE INSTALACION Y CONFIGURACION DE SISTEMA DE VIDEOVIGILANCIA CCTV"

Reglas:

- No inventar cantidades.
- No reemplazar el concepto fiscal.
- No usar el mensaje crudo completo en listas.
- Usar fallback seguro si no hay confianza.
- El titulo humano es para UI, no para CFDI.
- Si no existe `display_title`, usar un resumen corto derivado del concepto o una etiqueta neutral como "Servicio facturable".

## 8. Reglas de negritas

Usar negritas solo para valores importantes:

- Cliente.
- Total.
- Estado accionable.
- ID humano corto.
- Vencida, pendiente, parcial o cancelada.

No hacer:

- No poner todo el renglon en negritas.
- No depender de colores en texto.
- No poner en negrita etiquetas si no aporta.
- No combinar demasiados valores fuertes en un solo item.

Ejemplos correctos:

```text
Cliente: **Real Bilbao**
Total: **$11,020.00**
Estado: **cancelada**
```

## 9. Reglas de botones

Semantica aprobada:

- `primary / azul`: navegacion, seleccion, ver detalle.
- `success / verde`: aprobar, timbrar, descargar, enviar.
- `danger / rojo`: descartar, cancelar, acciones destructivas.

Reglas:

- Si n8n/Telegram no preserva style, debe degradar sin romper funcionalidad.
- No usar color como unica senal; el texto del boton debe ser claro.
- Las acciones sensibles deben seguir usando confirmacion o token seguro cuando aplique.
- Un boton visible debe tener handler confirmado o quedar marcado como `HANDLER_NOT_CONFIRMED` en auditoria.

## 10. Ejemplos canonicos

### A. Lista de clientes

```text
Clientes

1. Juan David Manzur
2. Privada Aretza · 1 factura
3. Privada Rivera · 1 factura
4. Real Bilbao · 47 facturas
```

### B. Borradores aprobados

```text
Borradores aprobados

6. **BOR-3171** · Real Bilbao
   Instalacion de 3 camaras CCTV
   Total: **$11,020.00**

7. **BOR-4723** · Privada Rivera
   Revision de sistema CCTV
   Total: **$1,142.68**
```

### C. Pendientes

```text
Borradores pendientes

1. **BOR-8120** · Real Bilbao
   Revision CCTV
   Total: **$1,142.68**
```

### D. Detalle de borrador

```text
Borrador aprobado

ID: **BOR-3171**
Cliente: **Real Bilbao**
Titulo: Instalacion de 3 camaras CCTV
Concepto fiscal: SERVICIO DE INSTALACION Y CONFIGURACION DE SISTEMA DE VIDEOVIGILANCIA CCTV
Total: **$11,020.00**

Estado: listo para timbrar.
```

### E. Factura cancelada

```text
Factura cancelada

ID: **A-1024**
Cliente: **Real Bilbao**
Total: **$11,020.00**
Estado: **cancelada**

Acuse de cancelacion disponible.
```

## 11. Presentacion por superficie

### Menu principal

- Debe mostrar opciones operativas, no diagnosticos.
- No debe mostrar draft_id, client_id, tokens ni raw status.
- Debe mantener comandos claros para iniciar flujos.

### Clientes

- El menu de clientes debe distinguirse de la lista de clientes.
- Debe evitar mezclar busqueda, alta y seleccion numerica en una misma superficie sin contexto.
- Si muestra conteos, solo mostrar conteos utiles.

### Lista de clientes

- Mostrar nombre humano y conteo de facturas solo si aporta.
- No mostrar `CLI-*` ni RFC salvo que sea necesario para desambiguar.
- Debe usar indices visibles ligados a contexto cuando sea accionable.

### Detalle de cliente

- Puede mostrar mas informacion que la lista.
- Puede mostrar RFC, regimen y datos fiscales si son necesarios para revisar.
- Debe ofrecer rutas claras a facturas, cobranza ligera y volver al origen.

### Pendientes

- Mostrar `BOR-*`, cliente, titulo corto y total.
- No repetir `[PENDIENTE]`.
- No mostrar acciones de timbrado en items no aprobados.
- Pagina 1 debe mostrar lo mas reciente o accionable.

### Aprobadas

- Mostrar solo borradores listos para timbrar.
- Mostrar `BOR-*`, cliente, titulo corto y total.
- No repetir `[APROBADO]`.
- No mezclar `SANDBOX_TIMBRADO`, `DOWNLOAD_READY` o `DOWNLOADED` como si fueran aprobados listos para timbrar.

### Detalle de borrador

- Mostrar ID humano, cliente, titulo, concepto fiscal, total, estado y acciones.
- Puede mostrar concepto fiscal completo.
- No necesita mostrar `draft_id` completo salvo modo debug/admin.
- Debe conservar `return_to` hacia pendientes o aprobadas cuando venga de lista.

### Resumen

- Debe ser legible para validacion rapida.
- Debe conservar importes con `$` visibles.
- Debe evitar raw JSON o campos tecnicos.
- Si el borrador ya no permite resumen, debe ofrecer recuperacion segura.

### Ledger/cobranza

- Debe operar sobre facturas concretas cuando haya acciones de pago.
- No debe mostrar acciones ambiguas sin factura seleccionada en fases futuras.
- Si una factura esta `DOWNLOAD_READY`, debe ofrecer ruta visible de descarga.
- Si una factura esta `DOWNLOADED`, debe ofrecer ruta documental visible.
- Para historial pesado, debe delegar o complementar con Factura.com/PAC.

### Download ready

- Debe mostrar claramente que XML/PDF estan disponibles para descargar.
- Debe mostrar boton de descarga visible.
- No debe mostrar timbrar de nuevo como accion principal.

### Downloaded

- Debe mostrar rutas documentales: ver estado, enviar documentos o ver factura.
- Re-descarga solo debe aparecer si es explicita y segura.
- No debe ocultar que los documentos ya existen.

### Cancelada

- Debe mostrar estado **cancelada**.
- Debe mostrar acuse o ruta a acuse cuando exista.
- No debe ofrecer acciones incompatibles con factura cancelada.

### Recovery

- Debe ser corta y segura.
- Debe ofrecer menu principal, pendientes, aprobadas o ayuda segun contexto.
- No debe reusar botones viejos ni tokens vencidos.

## 12. Relacion con proveedor

Antes de timbrar, el bot puede mostrar estado local del draft y validaciones operativas.

Despues de timbrar, estado fiscal, cancelacion, XML/PDF, acuse y datos finales deben depender del proveedor/PAC.

El bot muestra snapshot/cache operativo, no verdad fiscal final. Para operaciones fiscales avanzadas, historial completo o revision masiva, Factura.com/PAC es la fuente de gestion pesada.

## 13. Reglas de no saturacion

- Maximo 3 datos principales por item de lista.
- Detalles largos solo en pantalla de detalle.
- No repetir informacion obvia del encabezado.
- Si la lista es de aprobados, no repetir `[APROBADO]`.
- Si la lista es de pendientes, no repetir `[PENDIENTE]`.
- No convertir Telegram en explorador historico infinito.
- Si se alcanza el limite operativo de lista, mostrar aviso y delegar historico completo.

## 14. Criterios de aceptacion para implementacion futura

La futura Fase 6 debe verificar:

- No `DRAFT-*` largo en listas normales.
- No `CLI-*` en listas normales.
- No `[APROBADO]` redundante.
- No `[PENDIENTE]` redundante.
- Listas con `BOR-*`.
- Total en negritas.
- Titulo humano corto.
- Detalles conservan concepto fiscal completo.
- Tests actualizados.
- Watcher visual/controlado.
- Importes visibles conservan `$`.
- Botones siguen apuntando a acciones validas por estado.

## 15. No objetivos

No implementar aqui:

- Cambios al workflow.
- Botones de colores reales.
- `display_title` persistido.
- Cancelacion PAC.
- Cobranza avanzada.
- Clientes funcionales.
- Public SatBot.
- Cambios de DB.
- Promocion runtime n8n.
- Watcher o validacion Telegram real.

## 16. Veredicto

Este contrato deja lista la base de presentacion humana para Fase 6 y fases posteriores. La implementacion futura debe limpiar listas y detalles sin cambiar la autoridad interna de datos, sin esconder estados importantes y sin convertir Telegram en dashboard historico.
