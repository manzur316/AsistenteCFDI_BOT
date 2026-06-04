# RESICO 626 - Auditoria y replanteamiento del motor fiscal

## Alcance

Proyecto: AsistenteCFDI_BOT.

Este documento no activa conceptos nuevos, no modifica `data/concepts.normalized.json`, no cambia `scripts/scoring.js`, no toca workflows, no genera XML/PDF y no implementa PAC.

Regla central:

> La constancia fiscal manda. El catalogo SAT valida. La Guia de llenado define reglas CFDI. El bot solo sugiere borradores sujetos a revision humana.

Fuentes auditadas:

- `data/concepts.normalized.json`
- `scripts/scoring.js`
- `docs/FISCAL_ACTIVITY_GUARDRAILS.md`
- `docs/RESICO_626_DECISION_MATRIX.md`
- `docs/CFDI40_OFFICIAL_FILLING_GUIDE_ANALYSIS.md`
- `docs/CFDI40_MASTER_CATALOG_MAP.md`
- `docs/CFDI40_CLAVEPRODSERV_ANALYSIS.md`
- `docs/CFDI40_CLAVEUNIDAD_ANALYSIS.md`
- `data/knowledge_base/cfdi40_master_knowledge.json`
- `data/knowledge_base/cfdi40_claveprodserv_index.json`

## Hallazgo ejecutivo

El motor actual ya respeta una base activa auditada y bloqueos importantes, pero la seleccion semantica sigue dependiendo demasiado de keywords manuales por familia. Esto funciono para cerrar falsos positivos inmediatos, pero no escala bien a toda la constancia RESICO 626 porque reduce el universo permitido a familias operativas predefinidas: CCTV, RED, COMPUTO, CONTROL_ACCESO y BARRERA.

El cambio recomendado no es "meter mas keywords". La capa correcta debe iniciar por `emitter_activity_scope`: actividades economicas vigentes del emisor, regimen 626, validacion SAT y reglas de Guia CFDI 4.0. Las keywords actuales deben quedar como evidencia auxiliar.

## Donde ocurre la dependencia a keywords

### 1. Familias fijas en codigo

En `scripts/scoring.js`, el objeto `FAMILY_HINTS` declara familias cerradas:

- `CCTV`
- `RED`
- `COMPUTO`
- `CONTROL_ACCESO`
- `BARRERA`

Ubicacion: `scripts/scoring.js:5`.

Riesgo:

- Cualquier actividad valida de la constancia que no caiga en esas familias empieza sin familia fuerte.
- Terminos fisicamente validos dentro de A1/A2/A3/A4/A5 pueden terminar como ambiguos por no existir en `FAMILY_HINTS`.
- Para crecer, hoy hay que editar codigo o catalogo activo con mas keywords.

### 2. Extraccion de contexto depende de esas familias

`extractContext()` inicializa `familyHits` solo para esas cinco familias y suma puntos con `FAMILY_HINTS`.

Ubicacion: `scripts/scoring.js:295-369`.

Impacto:

- `hasAnyFamily`, `strongFamily` y `hasEvidence` dependen de si hubo match en esos hints.
- Si un mensaje describe "equipo electronico de precision", "aparato de comunicacion", "refaccion de telefono" o "equipo comercial" sin palabras actuales, puede caer en `PEDIR_ACLARACION` aunque fiscalmente este dentro de la constancia.

### 3. El score premia familia manual

`scoreConcept()` agrega confianza por:

- `familyScore`
- `strongFamily`
- coincidencia con `matchedInclude`
- operacion detectada

Ubicacion: `scripts/scoring.js:372-490`.

Impacto:

- La familia manual puede dominar sobre el alcance fiscal real.
- La similitud SAT oficial y las actividades del emisor no son una capa independiente.
- `fiscal_fit.current_activity_ok` y `resico_626_ok` existen, pero operan como limitadores despues de la seleccion, no como puerta principal de scope.

### 4. La decision de sugerir exige evidencia de familia o venta

`classifyMessage()` considera ambiguo si no hay familia o evidencia suficiente.

Ubicacion: `scripts/scoring.js:557-639`.

Impacto:

- El motor es conservador, lo cual es bueno fiscalmente.
- Pero la evidencia fiscal posible esta reducida a "familia manual + accion", no a "actividad economica vigente + clave SAT + regla CFDI".

### 5. El catalogo activo tambien codifica keywords manuales

`data/concepts.normalized.json` tiene:

- `scoring_fields.include_keywords`
- `scoring_fields.exclude_keywords`
- `keyword_rules`
- `concepts[].scoring.match_keywords`
- `concepts[].scoring.exclude_keywords`

Ubicacion: `data/concepts.normalized.json:84-93` y `data/concepts.normalized.json:95-150`.

Impacto:

- La base ya contiene actividades A1-A5, pero los conceptos concretos siguen siendo principalmente familias operativas.
- Es correcto no inventar conceptos, pero la arquitectura debe separar "actividad fiscal posible" de "concepto activo sugerible".

## Hallazgo sobre c_ClaveProdServ oficial

El indice oficial profundo encontro que el texto bruto de `c_ClaveProdServ` tiene muchos homonimos:

- "red" aparece como color o nombre comercial, no solo red de datos.
- "fuente" aparece en contextos no electricos/electronicos.
- "camara" puede aparecer fuera de videovigilancia.
- "control" puede aparecer en contextos no relacionados con control de acceso.

Riesgo:

No se debe usar el maestro SAT como buscador de palabras sueltas. El maestro valida existencia y aporta descripciones, pero la clasificacion fiscal debe usar actividad, jerarquia, contexto y catalogo activo.

## Matriz propuesta: emitter_activity_scope

Archivo propuesto:

- `data/knowledge_base/emitter_activity_scope.proposed.json`

Estado:

- `PROPOSED_NOT_ACTIVE`
- No productivo
- No modifica catalogo activo
- No activa conceptos nuevos

Actividades vigentes modeladas:

| ID | Actividad | Uso propuesto |
| --- | --- | --- |
| A1 | Otras instalaciones y equipamiento en construcciones | Instalacion/equipamiento tecnico, cableado ligado a equipo, seguridad electronica, control de acceso y comunicacion cuando exista equipo. |
| A2 | Reparacion y mantenimiento de maquinaria y equipo comercial y de servicios | Mantenimiento, diagnostico y reparacion de equipo comercial/de servicios, barreras, caseta y equipo tecnico. |
| A3 | Reparacion y mantenimiento de otro equipo electronico y equipo de precision | Equipo electronico fisico, sensores, fuentes, lectores, CCTV, comunicacion, computo y hardware. |
| A4 | Comercio al por menor de telefonos, aparatos de comunicacion, refacciones y accesorios | Venta de comunicacion, telefonos, routers, switches, AP, cables, conectores, refacciones y accesorios. |
| A5 | Comercio al por menor de computadoras y accesorios | Venta de computadoras, laptops, monitores, almacenamiento, memoria, perifericos y accesorios de computo. |

## Clasificacion SAT compatible propuesta

La propuesta no se limita a CCTV. Agrupa claves activas ya validadas contra `catCFDI_V_4_20260603.xls`:

| Categoria propuesta | Actividades | Claves activas candidatas |
| --- | --- | --- |
| Instalacion/equipamiento en construcciones | A1 | 72151604, 72151605, 72151701, 72151702, 72151704, 81111809 |
| Mantenimiento tecnico equipo comercial/de servicios | A2 | 72151704, 81111811, 81111812 |
| Equipo electronico y precision | A3 | 39121004, 39121011, 43191500, 43191600, 43201800, 43211710, 45121500, 45121600, 46171619, 46171621, 46171622, 81111811, 81111812 |
| Aparatos de comunicacion/refacciones/accesorios | A4 | 26121607, 26121609, 39121446, 43191500, 43191600, 43202222, 43222600, 43222609, 43222612, 43222640 |
| Computadoras y accesorios | A5 | 43201800, 43211500, 43211600, 43211902, 43202222 |
| Seguridad electronica justificada | A1, A2, A3, A4 | 45121500, 45121600, 46171619, 46171621, 46171622, 72151701, 72151702, 72151704 |

## Scoring por capas propuesto

Orden recomendado:

1. `emitter_activity_scope`: verificar si la operacion cabe en A1-A5.
2. `cfdi40_filling_rules`: regimen 626, receptor, UsoCFDI, ObjetoImp, metodo/forma de pago, vigencia, revision humana.
3. `sat_master_catalog_validation`: confirmar claves y unidades en catalogo maestro SAT.
4. `operation_type`: venta, instalacion, mantenimiento, reparacion, diagnostico o configuracion.
5. `sat_description_similarity`: comparar descripcion SAT con contexto, evitando tokens aislados.
6. `active_catalog_concept`: elegir solo conceptos existentes en `data/concepts.normalized.json`.
7. `manual_keywords_current`: usar keywords actuales como evidencia secundaria.
8. `semantic_exclusions_and_ambiguity`: bloquear contaminacion semantica o pedir aclaracion.

Esto mantiene el contrato actual de no inventar conceptos ni claves.

## Bloqueos que deben mantenerse

Mantener como bloqueo o agregar actividad:

- software;
- apps moviles;
- web;
- SaaS;
- IA;
- n8n como servicio;
- marketing;
- diseno grafico;
- video;
- comida;
- plomeria;
- pintura;
- albanileria;
- construccion civil general;
- consultoria fiscal/legal/contable;
- renta de equipo.

## Contaminacion semantica detectada y regla propuesta

1. Camara no debe sugerir DVR/NVR salvo que el texto diga DVR/NVR/grabador/disco/almacenamiento.
2. DVR/NVR no debe sugerir camara salvo que tambien diga camara.
3. Fuente de poder para camara no debe sugerir DVR/NVR/disco.
4. Sistema CCTV completo puede usarse solo si el texto indica sistema completo o contexto integral.
5. "Sistema", "equipo", "caseta", "servicio tecnico general" y "falla" sin equipo deben pedir aclaracion.

## Cambios minimos propuestos

### P1 - Auditoria no productiva

Ya propuesta en este cambio:

- Crear `data/knowledge_base/emitter_activity_scope.proposed.json`.
- Crear este reporte.
- Crear test contractual.
- No tocar scoring, workflows ni catalogo activo.

### P2 - Shadow scoring

Agregar un evaluador offline que calcule:

- `activity_scope_score`
- `sat_scope_score`
- `operation_score`
- `manual_keyword_score`
- `semantic_contamination_penalty`

Sin cambiar `accion_n8n` final.

### P3 - Gate fiscal antes de keywords

Mover `current_activity_ok`, `resico_626_ok`, actividad A1-A5 y riesgo fiscal a una compuerta antes de ranking.

### P4 - Expansion controlada

Si una actividad esta cubierta fiscalmente pero no hay concepto activo:

- generar propuesta;
- no sugerir;
- no activar automaticamente;
- requerir reporte y aprobacion humana.

## Pruebas nuevas propuestas

Archivo:

- `scripts/test-emitter-activity-scope-proposal.js`

Debe validar:

- existen A1-A5;
- los bloqueos explicitos estan documentados;
- la propuesta no esta activa;
- hay categorias mas amplias que CCTV;
- las claves candidatas activas existen en `cfdi40_claveprodserv_index.json`;
- el orden de scoring pone actividad fiscal antes de keywords manuales;
- hay reglas de contaminacion semantica camara/DVR/fuente;
- no se modifico `data/concepts.normalized.json`, Excel, scoring ni workflows.

## Riesgos detectados

- El indice SAT profundo por keywords brutas no es suficiente para decidir familia fiscal.
- El scoring actual puede seguir resolviendo bien casos conocidos, pero crecer por keywords aumenta mantenimiento y falsos positivos.
- Algunas claves activas son amplias, por ejemplo soporte tecnico o mesa de ayuda; requieren contexto humano y descripcion precisa.
- RESICO 626 y actividad actual no sustituyen validacion de receptor, UsoCFDI, ObjetoImp, impuestos, forma/metodo de pago y totales.

## Criterio final recomendado

Un concepto solo debe ser candidato si:

1. Esta dentro de las actividades economicas reales del emisor.
2. Es compatible con RESICO 626.
3. Existe en el catalogo maestro SAT.
4. Cumple las reglas CFDI 4.0 de la Guia de llenado.
5. Existe en el catalogo activo auditado del bot.
6. Queda marcado como `BORRADOR SUJETO A REVISION HUMANA`.

