# PRIVATE_SATBOT_UX_MASTER_PLAN_V0.1.md

## 1. Estado del documento

* Proyecto: Private SatBot
* Alcance: UX operativa de Telegram antes de go-live personal
* Estado: DRAFT / REVIEW_REQUIRED
* Public SatBot: fuera de alcance
* Facturacion real: bloqueada hasta cerrar gates de UX, sync, watcher y go-live checklist

## 2. Decision estrategica

Private SatBot seguira siendo el bot personal operativo.

Public SatBot queda diferido para despues de 1-2 meses de uso real.

Telegram sera canal de operacion rapida.

Factura.com/PAC sera la plataforma pesada para historial fiscal, gestion masiva, consultas largas y operaciones avanzadas.

El workflow activo de n8n debe considerarse runtime separado del repositorio.

## 3. Principios aprobados

### 3.1 Telegram no es dashboard completo

Telegram debe resolver:

* crear borrador rapido
* seleccionar cliente reciente o buscado
* ver pendientes/aprobados recientes
* aprobar o preparar acciones seguras
* descargar/enviar documentos de una factura concreta
* consultar cobranza accionable ligera

Telegram no debe resolver:

* historial fiscal masivo
* exploracion profunda de cientos de facturas
* edicion fiscal pesada
* reportes contables completos
* conciliacion bancaria
* operaciones PAC avanzadas

### 3.2 Repo no equivale a runtime n8n

Un cambio en GitHub no actualiza automaticamente el workflow activo de n8n.

Toda modificacion del workflow debe pasar por:

1. implementacion en repo
2. pruebas locales
3. commit/push
4. importacion/promocion runtime a n8n
5. workflow-sync-check PASS
6. workflow-status PASS
7. validacion controlada en Telegram

### 3.3 No parchar sin contrato

Antes de modificar UI o navegacion, debe existir contrato/documento o reporte de auditoria que indique:

* bug confirmado
* alcance
* no-alcance
* tests esperados
* rollback
* gates de aceptacion

## 4. Bugs y riesgos ya asentados

### 4.1 Runtime Workflow Drift

Sintoma:
GitHub contiene workflow nuevo, pero n8n ejecuta workflow viejo.

Impacto:
La UI real no refleja cambios implementados.

Regla:
Ningun cambio de workflow se considera activo hasta que workflow-sync-check pase.

### 4.2 Navigation Surface Drift

Sintoma:
Dos pantallas visualmente similares muestran acciones distintas.

Ejemplo:
CLIENTS_MENU y CLIENTS_LIST_SELECTION muestran "Clientes", pero una tiene acciones generales y otra botones Ver 1..N.

Impacto:
El usuario no sabe que contexto esta activo.

Regla:
Toda pantalla debe tener screen_id, screen_kind, contexto activo, return_to y acciones permitidas.

### 4.3 List Navigation Context incompleto

Sintoma:
Las listas tenian indices locales, limite visual de 5, sin paginacion real ni comandos por indice.

Regla:
Toda lista accionable debe tener contexto temporal ligado a chat_id, user_id, kind, page, visibleIndex y entityId.

### 4.4 Paginacion 3+ paginas

Sintoma:
El paginador puede estar pensado solo para 1-10 items.

Regla:
Debe soportar 3+ paginas sin ambiguedad, pero Telegram no debe convertirse en explorador historico infinito.

### 4.5 Datos internos expuestos en UI

Sintoma:
La UI muestra DRAFT-..., CLI-..., validado=no, facturas=0, [APROBADO] redundante.

Regla:
La UI normal debe mostrar texto humano. Los IDs tecnicos quedan para debug/admin.

### 4.6 Cobranza con acciones ambiguas

Sintoma:
Marcar pagada puede aparecer en ledger general sin factura seleccionada.

Regla:
Toda accion de pago debe operar sobre factura concreta y con confirmacion cuando afecte datos reales.

## 5. Contrato de navegacion

Toda pantalla debe declarar:

* screen_id
* screen_kind
* list_context opcional
* selected_entity opcional
* return_to explicito
* botones permitidos
* botones prohibidos
* comandos textuales validos
* contexto que conserva
* contexto que limpia

Ejemplos:

* CLIENTS_MENU
* CLIENTS_LIST_SELECTION
* CLIENT_DETAIL
* DRAFTS_PENDING_LIST
* DRAFTS_APPROVED_LIST
* DRAFT_DETAIL
* COLLECTION_CLIENTS
* COLLECTION_INVOICES
* DELIVERY_STATUS
* RECOVERY

## 6. Contrato de listas

Toda lista accionable debe usar:

* kind
* page
* page_size
* total_count si esta disponible
* visibleIndex global
* entityId real
* expires_at / TTL
* chat_id
* telegram_user_id

Reglas:

* pagina 1 muestra los mas recientes o mas accionables
* paginas siguientes muestran elementos mas antiguos
* primera pagina no muestra anterior
* ultima pagina no muestra siguiente
* pagina intermedia muestra ambos controles
* indice inexistente falla seguro
* contexto expirado falla seguro
* contexto cruzado entre usuarios/chats se bloquea

## 7. Contrato de presentacion humana

### 7.1 Listas

Las listas deben ser compactas, humanas y accionables.

No mostrar:

* DRAFT-* completo
* CLI-* completo
* UUID CFDI completo
* validado=no
* facturas=0 si no aporta
* [APROBADO] dentro de lista de aprobados
* [PENDIENTE] dentro de lista de pendientes
* textos fiscales largos repetidos

Mostrar:

* numero visible
* ID humano corto
* cliente
* titulo humano corto
* total
* estado accionable solo si aporta
* conteo de facturas cuando aporta

### 7.2 Detalles

Los detalles pueden mostrar mas informacion:

* cliente
* concepto fiscal completo
* titulo humano
* total
* forma de pago
* uso CFDI
* estado
* acciones disponibles

### 7.3 Debug/Admin

Solo modo tecnico puede mostrar:

* draft_id completo
* client_id interno
* UUID completo
* callback token
* raw status
* errores tecnicos

## 8. Nomenclatura humana

### 8.1 Borradores

Interno:

* DRAFT-20260611-062403-1736943171

Humano:

* BOR-3171
* BOR-0611-3171 si se requiere desambiguar

Regla:
BOR-* es display-only. La autoridad sigue siendo draft_id.

### 8.2 Facturas

Preferencia:

* serie/folio del PAC si existe

Ejemplo:

* A-1024
* FAC-1024

Fallback:

* FAC-<uuid corto>

Regla:
El UUID completo solo se muestra en detalle tecnico o factura/PDF/XML.

## 9. Titulo humano de factura/borrador

Debe existir o derivarse un display_title.

Ejemplos:

Entrada del usuario:
instale tres camaras CCTV en Real Bilbao

Titulo humano:
Instalacion de 3 camaras CCTV

Concepto fiscal:
SERVICIO DE INSTALACION Y CONFIGURACION DE SISTEMA DE VIDEOVIGILANCIA CCTV

Reglas:

* no inventar cantidades si no estan en el mensaje/fuente
* no reemplazar el concepto fiscal
* usar fallback seguro si no hay confianza
* el titulo humano es para UI, no para CFDI

## 10. Enfasis visual

### 10.1 Texto

Usar negritas solo para valores importantes:

* cliente
* total
* estado accionable
* ID humano
* vencido/pendiente/parcial

No usar negritas en todo el renglon.

No depender de colores en texto.

### 10.2 Botones

Semantica aprobada:

* primary/azul: navegacion, seleccion, ver detalle
* success/verde: aprobar, timbrar, descargar, enviar
* danger/rojo: descartar, cancelar, acciones destructivas

Regla:
Si el runtime n8n/Telegram no preserva style, se debe degradar sin romper funcionalidad.

## 11. Delegacion a Factura.com/PAC

Debe quedarse en Telegram:

* flujo rapido
* acciones recientes
* facturas concretas
* cobranza ligera
* descarga/envio de documentos

Debe delegarse a Factura.com/PAC:

* historial largo
* busqueda avanzada
* gestion fiscal pesada
* reportes masivos
* operaciones fiscales avanzadas
* revision profunda de XML/PDF

## 12. Fases de implementacion

### Fase 1 - Runtime Sync Discipline

Formalizar promocion de workflow a n8n y workflow-sync-check.

### Fase 2 - Draft Pagination 3+ paginas

Cerrar paginacion real en pendientes/aprobados.

### Fase 3 - Navigation Surface Drift Audit

Crear matriz global de pantallas y retornos.

### Fase 4 - Navigation Surface Drift Fix

Corregir retornos, contextos y pantallas inconsistentes.

### Fase 5 - UX Presentation Contract

Crear contrato especifico de presentacion humana.

### Fase 6 - Aplicar presentacion limpia a drafts

Limpiar listas de pendientes/aprobados.

### Fase 7 - Aplicar presentacion limpia a clientes

Limpiar lista/detalle de clientes.

### Fase 8 - Clientes funcionales

Implementar cliente N, facturas N y busqueda conversacional.

### Fase 9 - Cobranza accionable

Implementar COLLECTION_CLIENTS, COLLECTION_INVOICES y pagar N con confirmacion.

### Fase 10 - Button Semantic Styles

Aplicar estilos de botones sin cambiar logica.

### Fase 11 - Private Go-Live Checklist

Preparar uso real personal.

## 13. Reglas para prompts Codex CLI

Cada prompt debe declarar un modo:

* AUDIT_ONLY
* DOCS_ONLY_AND_PUSH
* IMPLEMENT_AND_PUSH
* PROMOTE_WORKFLOW_RUNTIME
* LIVE_VALIDATION

Reglas generales:

* no usar git add .
* no tocar .env
* no subir runtime
* no subir XML/PDF
* no subir backups
* no tocar scripts/local/*.bat ni scripts/local/*.ps1
* no modificar fuera de alcance
* no hacer commit si falla una prueba
* no importar n8n salvo modo PROMOTE_WORKFLOW_RUNTIME
* no tocar PAC real salvo autorizacion explicita

## 14. Gates antes de produccion real

Bloqueantes:

* workflow-sync-check PASS
* workflow-status PASS
* watcher PASS
* repo safety PASS
* UI button state audit PASS
* list navigation tests PASS
* no botones zombies
* no acciones de pago ambiguas
* no workflow viejo activo
* no datos internos visibles en listas normales
* backup DB
* backup workflow activo
* limpieza controlada de drafts/test data
* validacion de usuario autorizado
* validacion Factura.com/PAC

## 15. No objetivos

No hacer ahora:

* Public SatBot
* multiusuario comercial
* dashboard web propio
* suscripciones
* WhatsApp
* migracion completa fuera de n8n
* cobranza bancaria avanzada
* contabilidad completa
* refactor masivo de workflow

## 16. Veredicto

Private SatBot puede avanzar por slices, pero no puede pasar a go-live real hasta cerrar navegacion, presentacion humana, sync runtime, cobranza segura y checklist de produccion privada.
