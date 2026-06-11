# PRIVATE_SATBOT_TELEGRAM_UX_CONTRACT_V0.1.md

**Proyecto:** Private SatBot / Asistente CFDI BOT  
**Versión del documento:** v0.1  
**Estado documental:** DRAFT — contrato UX para revisión antes de implementación  
**Estado de implementación:** BLOCKED hasta aprobación humana y slice controlado  
**Fecha:** 2026-06-11  
**Archivo autoritativo propuesto:** `PRIVATE_SATBOT_TELEGRAM_UX_CONTRACT_V0.1.md`  
**Propósito:** definir el contrato de navegación, menús, listas, botones y acciones de Telegram para usar Private SatBot en operación real personal sin convertir Telegram en un panel pesado.

---

## 0. Veredicto de creación

```text
Tarea: crear contrato UX de Telegram para Private SatBot
Veredicto: MATCH
Motivo:
- Private SatBot va a seguir como bot personal operativo.
- Public SatBot queda para después.
- Antes de facturación real personal, hay que corregir navegación, menús, listas y botones.
- Telegram no debe cargar toda la gestión histórica pesada.
- Factura.com / PAC debe absorber gestión pesada cuando sea más eficiente.
```

Este documento **no implementa** cambios. Define el contrato que debe cumplir la siguiente fase de UX.

---

## 1. Decisión de producto

Private SatBot se mantiene como herramienta personal de operación rápida.

```text
Private SatBot = bot personal para captura rápida, acciones inmediatas y asistencia operativa.
Public SatBot = producto futuro para venta, separado y rediseñado con lo aprendido.
```

Para Private SatBot, la interfaz principal diaria sigue siendo Telegram, pero Telegram no debe convertirse en un panel administrativo completo.

La arquitectura operativa queda:

```text
Telegram
  = captura rápida, comandos cortos, acciones frecuentes, alertas y consultas ligeras

Factura.com / PAC
  = gestión fiscal pesada, historial completo, plataforma de facturación, XML/PDF, clientes y operaciones masivas cuando aplique

Private SatBot local
  = orquestador personal, reglas, seguridad, watcher, workflow, auditoría y acciones rápidas
```

---

## 2. Problema que resuelve este contrato

Se detectaron problemas de UX y operación:

```text
- Listas largas con botones limitados a 1-5.
- Botones que aparecen en menús donde no corresponden.
- Botones que no tienen acción real o handler visible.
- Comandos largos como detalle DRAFT-...
- Menús de cobranza mostrando clientes sin deuda.
- Dificultad para seleccionar factura, cliente o draft cuando hay muchos registros.
- Riesgo de que Telegram se vuelva pesado con 20 clientes, 100 facturas o historial de varios meses.
```

Este contrato corrige el enfoque:

```text
No se optimiza un menú aislado.
Se define un sistema común de navegación por listas y acciones válidas por estado.
```

---

## 3. Principio rector UX

```text
Telegram debe reducir fricción.
No debe aumentar carga mental.
No debe pedir IDs largos si ya mostró una lista numerada.
No debe mostrar acciones inválidas.
No debe competir con Factura.com para gestión pesada.
```

Cada pantalla/lista debe responder:

```text
¿Qué estoy viendo?
¿Qué puedo hacer aquí?
¿Qué número corresponde a qué item?
¿Qué acciones son seguras?
¿Qué acciones requieren confirmación?
¿Qué debo hacer en Factura.com si la operación es pesada?
```

---

## 4. Alcance

### 4.1 En alcance

```text
- Menús Telegram de Private SatBot.
- Listas de clientes.
- Listas de drafts/facturas por estado.
- Pendientes.
- Aprobados.
- Descargados.
- Enviados.
- Cobranza.
- Detalle / resumen / acciones por índice.
- Paginación.
- Botones dinámicos por estado.
- Acciones permitidas/prohibidas por menú.
- Confirmaciones para acciones sensibles.
- Watcher coverage.
```

### 4.2 Fuera de alcance

```text
- Public SatBot.
- Dashboard web propio.
- Migración fuera de n8n.
- Refactor masivo de scripts.
- Multiusuario comercial.
- Suscripciones.
- WhatsApp productivo.
- Reemplazar Factura.com como plataforma de gestión pesada.
- Implementar provider/PAC nuevo.
```

---

## 5. División de responsabilidades: Telegram vs Factura.com/PAC

### 5.1 Telegram debe manejar

```text
- Crear borrador rápido.
- Buscar cliente rápido.
- Seleccionar cliente de una lista reciente.
- Ver pendientes relevantes.
- Ver aprobados recientes.
- Ver detalle/resumen por índice.
- Timbrar un draft específico.
- Descargar XML/PDF de un draft/factura específica.
- Enviar documentos por Telegram/email si el estado lo permite.
- Consultar cobranza accionable.
- Registrar acción rápida de pago cuando sea seguro y auditado.
```

### 5.2 Factura.com/PAC debe manejar o complementar

```text
- Historial fiscal completo.
- Búsquedas masivas complejas.
- Gestión pesada de clientes fiscales.
- Revisión de XML/PDF históricos.
- Operaciones fiscales avanzadas.
- Reportes/historial si el PAC ya lo resuelve mejor.
- Administración que no requiere acción inmediata en campo.
```

### 5.3 Regla de delegación

Si una operación requiere revisar muchas filas, filtrar por periodos largos, comparar historiales o hacer administración pesada, Private SatBot debe ofrecer una ruta corta y, cuando aplique, sugerir revisar en Factura.com/PAC.

```text
Bot = acción rápida.
PAC = gestión pesada.
```

---

## 6. List Navigation Contract

Cada vez que el bot muestre una lista seleccionable, debe crear un contexto temporal de lista.

### 6.1 Modelo conceptual

```ts
type TelegramListContext = {
  contextId: string;
  chatId: string;
  userId: string;
  kind:
    | 'CLIENTS'
    | 'DRAFTS_PENDING'
    | 'DRAFTS_APPROVED'
    | 'DRAFTS_DOWNLOADED'
    | 'DRAFTS_SENT'
    | 'DRAFTS_DISCARDED'
    | 'COLLECTION_CLIENTS'
    | 'COLLECTION_INVOICES'
    | 'SEARCH_RESULTS';
  page: number;
  pageSize: number;
  totalItems: number;
  sort: string;
  filter: Record<string, unknown>;
  items: Array<{
    visibleIndex: number;
    entityType: 'CLIENT' | 'DRAFT' | 'INVOICE' | 'PAYMENT' | 'DOCUMENT';
    entityId: string;
    displayLabel: string;
    status?: string;
    amount?: number;
  }>;
  createdAt: string;
  expiresAt: string;
};
```

El índice visible no sustituye el ID real. Solo funciona como alias temporal.

```text
visibleIndex -> entityId real
```

---

## 7. Reglas de índices

### 7.1 Índices globales por lista

Si una lista tiene más de una página, los índices deben ser globales.

Correcto:

```text
Página 1:
1. Draft A
2. Draft B
3. Draft C
4. Draft D
5. Draft E

Página 2:
6. Draft F
7. Draft G
8. Draft H
9. Draft I
10. Draft J
```

Incorrecto:

```text
Página 1: Ver 1-5
Página 2: Ver 1-5 otra vez sin contexto claro
```

### 7.2 Comandos por índice

El usuario puede usar comandos cortos:

```text
ver 5
detalle 5
resumen 5
cliente 5
facturas 5
pagar 5
descargar 5
enviar 5
```

El bot debe resolver el número contra la última lista activa compatible.

### 7.3 Número suelto

Un número suelto solo es válido cuando el bot está esperando explícitamente una selección.

Permitido:

```text
Bot: ¿Qué cliente quieres abrir?
Usuario: 5
```

No permitido por default:

```text
Usuario: 5
```

sin contexto de espera.

### 7.4 Expiración

Cada lista debe expirar.

Sugerencia inicial:

```text
TTL: 15 minutos para listas normales.
TTL: 5 minutos para acciones sensibles.
```

Si el contexto expiró:

```text
Esa lista ya expiró. Vuelve a abrir pendientes/clientes/cobranza.
```

---

## 8. Paginación

### 8.1 Page size inicial

Recomendación:

```text
Clientes: 10 por página.
Drafts/facturas: 5 por página si tienen mucho detalle; 10 si el texto es compacto.
Cobranza: 10 clientes por página.
Facturas de cliente: 5-10 por página según detalle.
```

### 8.2 Botones de paginación

Cada lista paginada debe tener:

```text
[Anterior]
[Siguiente]
[Buscar]
[Menú]
```

Si no hay siguiente página, no mostrar `[Siguiente]`.

Si no hay página anterior, no mostrar `[Anterior]`.

### 8.3 Botones numéricos

Los botones numéricos deben corresponder a la página actual.

Ejemplo página 2:

```text
[6] [7] [8] [9] [10]
```

No:

```text
[1] [2] [3] [4] [5]
```

si visualmente la lista muestra 6-10.

---

## 9. Menu Action Matrix

Cada menú debe tener una matriz de acciones permitidas.

### 9.1 Regla principal

```text
No mostrar botones sin handler real.
No mostrar acciones inválidas por estado.
No mostrar acciones destructivas sin confirmación.
```

### 9.2 Estados base de draft/factura

Estados esperados iniciales:

```text
DRAFT
PENDING_REVIEW
APPROVED
SANDBOX_TIMBRADO
DOWNLOAD_READY
DOWNLOADED
SENT
DISCARDED
CANCELLED
PAID
PARTIAL_PAID
OVERDUE
```

No todos aplican a todos los objetos. El contrato debe mapear por entidad.

---

## 10. Matriz inicial por estado

### 10.1 Draft pendiente / pendiente de revisión

Permitido:

```text
- Ver detalle
- Ver resumen
- Editar
- Aprobar
- Descartar con confirmación
```

Prohibido:

```text
- Descargar XML/PDF
- Enviar documentos
- Marcar pagada
```

### 10.2 Draft aprobado

Permitido:

```text
- Ver detalle
- Ver resumen
- Timbrar sandbox/real según modo permitido
- Descartar solo si aún no está timbrado, con confirmación
```

Prohibido:

```text
- Aprobar de nuevo
- Descargar si no hay XML/PDF
- Enviar si no hay documentos válidos
```

### 10.3 Timbrado / download ready

Permitido:

```text
- Ver detalle
- Descargar XML/PDF
- Ver estado de documentos
```

Prohibido:

```text
- Aprobar
- Descartar
- Timbrar de nuevo sin idempotencia controlada
- Enviar si todavía no está descargado o validado
```

### 10.4 Descargado

Permitido:

```text
- Ver detalle
- Enviar documentos
- Reenviar con confirmación si ya fue enviado antes
- Ver archivos
```

Prohibido:

```text
- Aprobar
- Descartar
- Timbrar de nuevo
```

### 10.5 Enviado

Permitido:

```text
- Ver detalle
- Ver estado de envío
- Reenviar con confirmación
- Ver archivos
```

Prohibido:

```text
- Aprobar
- Descartar
- Timbrar de nuevo
```

### 10.6 Descartado

Permitido:

```text
- Ver pendientes
- Crear nuevo borrador
- Menú principal
- Ayuda
```

Prohibido:

```text
- Ver resumen
- Aprobar
- Timbrar
- Descargar
- Enviar
```

---

## 11. Cobranza UX Contract

### 11.1 Regla principal

Cobranza no debe mostrar clientes con saldo cero por default.

Por default, `Cobranza` muestra solo:

```text
- clientes con saldo pendiente
- clientes con facturas vencidas
- clientes con facturas por vencer
- clientes con pagos parciales pendientes
```

No muestra:

```text
- clientes sin deuda
- clientes con todo pagado
- clientes inactivos
```

A menos que el usuario pida explícitamente:

```text
cobranza todos
cobranza pagados
cliente 5 historial
```

### 11.2 Vista de cobranza por cliente

Ejemplo:

```text
Cobranza pendiente

1. Real Bilbao — $4,500 vencido — 3 facturas
2. Privada Rivera — $1,200 pendiente — 1 factura
3. Cliente X — $800 por vencer — 1 factura

Comandos:
facturas 1
pagar 1
recordar 1
```

### 11.3 Vista de facturas por cliente

Ejemplo:

```text
Real Bilbao — Facturas pendientes

1. FAC-001 — $1,500 — VENCIDA
2. FAC-002 — $2,000 — PENDIENTE
3. FAC-003 — $1,000 — PENDIENTE

Comandos:
ver 1
pagar 1
pago parcial 2
recordar 3
```

### 11.4 Marcar pagada

`Marcar pagada` solo debe aparecer si hay factura concreta seleccionada.

Permitido:

```text
pagar 2
```

dentro de una lista de facturas pendientes o vencidas.

No permitido:

```text
Marcar pagada
```

en un menú general sin factura seleccionada.

### 11.5 Marcar vencida

`Marcar vencida` no debe ser acción principal.

Una factura vencida debería derivarse de:

```text
due_date < today
payment_status != PAID
```

Si se permite override manual, debe ser:

```text
- acción administrativa
- con confirmación
- auditada
- rara
```

### 11.6 Delegación a Factura.com

Si cobranza requiere historial masivo, filtros complejos o revisión de muchas facturas, Private SatBot puede responder:

```text
Para historial completo y revisión masiva, revisa Factura.com.
Desde aquí puedo ayudarte con pendientes accionables y acciones rápidas.
```

---

## 12. Clientes UX Contract

### 12.1 Listar clientes

`clientes` debe mostrar lista paginada.

Ejemplo:

```text
Clientes

1. Real Bilbao — RFC ... — activo
2. Privada Rivera — RFC ... — activo
3. Cliente X — pendiente validar

Comandos:
cliente 1
facturas 1
cobranza 1
buscar <texto>
```

### 12.2 Buscar cliente

El botón `Buscar cliente` no debe obligar a escribir `/cliente Rivera`.

Debe iniciar un estado conversacional:

```text
Bot: ¿Qué cliente buscas?
Usuario: Rivera
Bot: muestra resultados
```

Estado de sesión:

```text
AWAITING_CLIENT_SEARCH
```

### 12.3 Cliente por índice

Si el bot mostró una lista de clientes, el usuario puede escribir:

```text
cliente 5
```

El bot resuelve `5 -> client_id` desde el contexto de lista activo.

---

## 13. Drafts / facturas UX Contract

### 13.1 Pendientes

`pendientes` debe mostrar drafts accionables.

```text
1. Cliente — concepto — monto — estado
2. Cliente — concepto — monto — estado
```

Comandos:

```text
detalle 1
resumen 1
aprobar 1
descartar 1
```

### 13.2 Aprobados

`aprobados` debe mostrar aprobados recientes/paginados.

Comandos:

```text
detalle 10
resumen 10
timbrar 10
```

### 13.3 Descargados / enviados

Debe permitir:

```text
detalle 7
enviar 7
reenviar 7
archivos 7
```

solo si el estado lo permite.

---

## 14. Comandos cortos permitidos

Aliases iniciales sugeridos:

```text
p = pendientes
c = clientes
co = cobranza
a = aprobados
m = menú
ayuda = ayuda
```

Acciones por índice:

```text
ver N
detalle N
resumen N
cliente N
facturas N
cobranza N
aprobar N
descartar N
timbrar N
descargar N
enviar N
pagar N
```

No todos los comandos aplican a todas las listas. Deben validarse por `kind` y estado.

---

## 15. Confirmaciones obligatorias

Deben pedir confirmación:

```text
- descartar draft
- timbrar real
- enviar documentos reales
- reenviar documentos ya enviados
- marcar factura pagada si afecta cobranza real
- revertir pago
- cancelar CFDI
```

No deben pedir confirmación:

```text
- ver detalle
- ver resumen
- listar pendientes
- listar clientes
- buscar cliente
```

---

## 16. Errores esperados

### 16.1 Índice inexistente

```text
No encontré el número 15 en la lista actual.
Usa siguiente o vuelve a abrir la lista.
```

### 16.2 Lista expirada

```text
Esa lista ya expiró.
Vuelve a abrir pendientes, clientes o cobranza.
```

### 16.3 Acción incompatible

```text
Esta acción no aplica para este estado.
Estado actual: DESCARTADO.
Acciones disponibles: Ver pendientes, Crear nuevo borrador, Menú principal.
```

### 16.4 Item cambió de estado

```text
El elemento cambió de estado desde que abriste la lista.
Actualicé la información. Revisa de nuevo antes de continuar.
```

---

## 17. Seguridad

Cada list context debe estar ligado a:

```text
chat_id
telegram_user_id
session_id opcional
```

No se permite usar un índice generado en otro chat, otro usuario o una sesión no autorizada.

Los `callback_data` no deben contener:

```text
RFC completo
cliente real
monto
concepto
DRAFT_ID completo si no es necesario
payload fiscal
XML/PDF
secretos
```

---

## 18. Watcher coverage

El watcher debe cubrir mínimo:

```text
- listar pendientes
- detalle por índice
- resumen por índice
- aprobar por índice
- descartar por índice con confirmación
- descartado no muestra acciones zombie
- listar aprobados con más de 5 items
- siguiente/anterior
- seleccionar item 6-10
- cobranza no muestra clientes saldo cero
- facturas de cobranza permiten pagar factura específica
- botón sin handler no aparece
- acción inválida por estado queda bloqueada
- lista expirada produce mensaje claro
```

---

## 19. Criterios de aceptación del primer slice

Primer slice recomendado:

```text
List Navigation + Pendientes/Aprobados
```

Debe cumplir:

```text
- pendientes muestra lista numerada
- aprobados muestra lista numerada
- si hay más de 5 items, existe siguiente/anterior
- índices globales 1-10 funcionan
- detalle 10 funciona si el item existe
- resumen 10 funciona si el item existe
- botones de página actual coinciden con números visibles
- botones no muestran acciones inválidas
- watcher cubre el flujo
```

Segundo slice:

```text
Cobranza accionable
```

Debe cumplir:

```text
- cobranza muestra solo clientes con saldo pendiente por default
- cliente con saldo cero no aparece
- facturas N lista facturas pendientes/vencidas del cliente
- pagar N solo funciona sobre factura concreta
- marcar vencida no aparece como acción primaria
```

Tercer slice:

```text
Clientes + búsqueda conversacional
```

Debe cumplir:

```text
- clientes lista paginada
- cliente 5 abre detalle del cliente
- buscar cliente pregunta texto
- usuario escribe solo el nombre
- resultados se muestran numerados
```

---

## 20. Reglas para Codex

Si Codex implementa este contrato:

```text
- No debe reescribir todo el workflow.
- No debe tocar providers reales.
- No debe activar timbrado real nuevo.
- No debe cambiar Factura.com/PAC.
- No debe borrar tests actuales.
- No debe fusionar scripts.
- Debe implementar por slices.
- Debe actualizar o crear watcher/regresiones para cada slice.
- Debe reportar botones eliminados y botones agregados.
- Debe reportar acciones que quedan intencionalmente fuera.
```

---

## 21. Archivos probables a tocar en implementación futura

No confirmado. Antes de tocar, Codex debe auditar.

Probables:

```text
workflow/cfdi_telegram_local_ingest.n8n.json
scripts/test-telegram-ui-state-buttons.js
scripts/qa/telegram-ui-button-state-audit.js
scripts/qa/telegram-ui-session-watch.js
scripts/test-telegram-ui-session-watch.js
scripts/lib/telegram-product-menu-contract.js
scripts/lib/telegram-product-menu-renderer.js
scripts/lib/telegram-action-token-utils.js
```

Posibles nuevos tests:

```text
scripts/test-telegram-list-navigation-contract.js
scripts/test-telegram-collection-menu-action-matrix.js
scripts/test-telegram-client-list-navigation.js
```

---

## 22. Estado final del documento

```text
Documento: PRIVATE_SATBOT_TELEGRAM_UX_CONTRACT_V0.1.md
Estado: DRAFT para revisión humana
Uso permitido: contrato previo de UX para implementación por slices
Uso no permitido: implementar todo de golpe o desbloquear producción real sin watcher
```
