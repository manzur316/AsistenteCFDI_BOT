# Phase 7.0 Telegram Product Interface Planning

Estado: planificacion de producto

Fecha: 2026-06-05

## Objetivo

Definir el contrato UX/producto de la interfaz real de Telegram para operacion
diaria, separando usuario final, admin/sandbox, comandos legacy y funciones
futuras antes de implementar Fase 7.1.

Esta fase no implementa workflows, logica fiscal, PAC real, produccion,
timbrado, XML/PDF, interfaz web ni cambios al catalogo.

## Auditoria Del Estado Actual

### workflow/cfdi_telegram_local_ingest.n8n.json

Superficie actual de producto local. Recibe updates del runner local, valida
seguridad privada, maneja comandos de facturas/clientes, estados
conversacionales, drafts, botones inline `cfdi:<token>` y respuestas Telegram.

Comandos y rutas detectadas para UX futura:

- `/factura`
- `/clientes`
- `/cliente TEXTO`
- `/nuevocliente`
- `/editarcliente CLIENT_ID CAMPO VALOR`
- `/validarcliente CLIENT_ID`
- `/pendientes`
- `/aprobadas`
- `/hoy`
- `/aprobar DRAFT_ID`
- `/descartar DRAFT_ID`
- `/detalle DRAFT_ID`
- `/setcliente`
- texto contextual: `confirmar`, `editar`, `cancelar`, `ver`, `estado`

Observacion: esta superficie mezcla funciones de producto con comandos legacy.
Fase 7 debe conservar compatibilidad, pero mover la operacion principal a un
menu claro con botones seguros.

### runner/telegram-local-runner.js

Bridge local de baja latencia:

```text
Telegram getUpdates -> runner local -> n8n local ingest
```

Soporta `message` y `callback_query`, guarda offset local, sanitiza logs y no
expone n8n a internet. Fase 7 no debe cambiarlo en esta etapa; solo debe asumir
que seguira entregando texto y callbacks al ingest local.

### workflow/cfdi_sandbox_action_router.n8n.json

Superficie soportada para acciones sandbox/admin. Usa webhook local,
allowlist de comandos/callbacks, Execute Command controlado y respuesta JSON
segura. No debe mezclarse con el menu diario del usuario final.

Comandos sandbox existentes:

- `/sandbox_menu`
- `/sandbox_preflight`
- `/sandbox_report`
- `/sandbox_package`
- `/sandbox_excel`
- `/sandbox_checklist`
- `/sandbox_full_package`
- `/sandbox_smoke_create`
- `/sandbox_smoke_download`
- `/sandbox_smoke_cancel`

Callbacks sandbox existentes:

- `cfdi_sbx:menu`
- `cfdi_sbx:report`
- `cfdi_sbx:package`
- `cfdi_sbx:excel`
- `cfdi_sbx:checklist`
- `cfdi_sbx:full`
- `cfdi_sbx:preflight`
- `cfdi_sbx:smoke_create`
- `cfdi_sbx:smoke_download`
- `cfdi_sbx:smoke_cancel`
- `cfdi_sbx:smoke_menu`
- `cfdi_sbx:cancel`

Observacion: todo `cfdi_sbx:*` debe permanecer `SANDBOX_ONLY` y oculto al
usuario final salvo rol admin.

### README Y Docs Relevantes

La documentacion actual ya define:

- Bot privado por defecto y roles en `docs/SECURITY_PRIVATE_ACCESS_MODEL.md`.
- Callback seguro `cfdi:<token>` sin datos fiscales.
- Modelo de producto con regla anti-menus en `docs/PRODUCT_OPERATING_MODEL.md`.
- Bloque 6A cerrado como sandbox local en
  `docs/PHASE_6A_SANDBOX_BLOCK_SIGNOFF.md`.

## Principios De Producto Para Telegram

- La primera pantalla debe resolver tareas diarias, no mostrar herramientas
  tecnicas.
- El usuario puede escribir natural, pero los botones deben aparecer cuando ya
  hay contexto.
- Admin/Sandbox existe, pero no compite con la operacion diaria.
- Ningun callback debe contener RFC, UUID, UID, monto, rutas, claves fiscales,
  secretos ni datos de cliente.
- Nunca enviar XML/PDF/ZIP/Excel por Telegram hasta una fase explicita.
- Todo borrador fiscal sigue sujeto a revision humana.

## Menu Principal Propuesto

Menu diario visible para usuario final:

1. Nueva factura / borrador CFDI
2. Clientes
3. Borradores pendientes
4. Reporte mensual
5. Paquete para contador
6. Estado del sistema
7. Ayuda

Acceso oculto o condicionado por rol:

- Admin/Sandbox

Nota de UX: por la regla anti-menus, la pantalla principal puede mostrar solo
los cinco accesos mas usados y dejar `Estado`, `Ayuda` y `Admin/Sandbox` en un
segundo nivel. Esta fase documenta el mapa completo; Fase 7.1 debe decidir la
presentacion exacta.

## Navegacion Por Botones Inline

### Menu Principal

Callbacks estaticos propuestos:

- `cfdi_nav:menu`
- `cfdi_nav:new`
- `cfdi_nav:clients`
- `cfdi_nav:drafts`
- `cfdi_nav:report`
- `cfdi_nav:acctpkg`
- `cfdi_nav:status`
- `cfdi_nav:help`
- `cfdi_nav:admin`

### Submenu Facturas

- Nueva factura: `cfdi_nav:new`
- Borradores pendientes: `cfdi_nav:drafts`
- Ver detalle: `cfdi:<token>`
- Confirmar borrador: `cfdi:<token>`
- Editar borrador: `cfdi:<token>`
- Cancelar borrador: `cfdi:<token>`

Las acciones sobre un borrador deben usar action tokens existentes, no IDs ni
datos fiscales en `callback_data`.

### Submenu Clientes

- Buscar cliente: `cfdi_nav:client_find`
- Nuevo cliente: `cfdi_nav:client_new`
- Editar cliente: `cfdi:<token>`
- Validar cliente: `cfdi:<token>`
- Volver a menu: `cfdi_nav:menu`

Las acciones que cambien datos fiscales del cliente requieren rol permitido,
audit trail y revalidacion humana.

### Submenu Reportes

- Reporte mensual: `cfdi_nav:report`
- Paquete contador: `cfdi_nav:acctpkg`
- Pendientes del mes: `cfdi_nav:drafts`
- Estado del sistema: `cfdi_nav:status`

Mientras no exista fase explicita, el bot solo debe responder resumen seguro y
no adjuntar archivos.

### Submenu Admin/Sandbox

- Menu sandbox: `cfdi_sbx:menu`
- Preflight sandbox: `cfdi_sbx:preflight`
- Reporte sandbox: `cfdi_sbx:report`
- Paquete sandbox: `cfdi_sbx:package`
- Full monthly package sandbox: `cfdi_sbx:full`

Este submenu debe estar oculto por defecto y visible solo para rol admin o modo
sandbox local.

## Clasificacion De Acciones

Estados permitidos para esta planeacion:

- `USER_SAFE`: visible al usuario final con guardrails y revision humana.
- `ADMIN_ONLY`: requiere rol admin/owner o aprobacion elevada.
- `SANDBOX_ONLY`: herramienta tecnica de sandbox; no es producto diario.
- `FUTURE`: documentado, no implementado en 7.0.
- `DEPRECATED`: compatibilidad legacy o comando que no debe promoverse.

## Contrato Callback_Data Para Fase 7

Reglas:

- Preferir `callback_data` menor a 32 caracteres.
- Respetar el limite duro de Telegram de 64 bytes.
- Navegacion sin estado: `cfdi_nav:<key>`.
- Acciones con estado: `cfdi:<token>`.
- Sandbox/admin: `cfdi_sbx:<key>`.
- El token debe vivir en PostgreSQL, expirar y estar ligado a `chat_id` y, si
  existe, `telegram_user_id`.
- Acciones de confirmacion, cancelacion o cambio fiscal deben ser one-time.
- Reuso, expiracion, chat incorrecto o user incorrecto deben fallar cerrado.

Prohibido en `callback_data`:

- RFC.
- UUID.
- UID.
- Montos.
- Rutas locales o runtime.
- Claves SAT, conceptos, cliente o descripcion fiscal.
- XML/PDF/ZIP/Excel.
- Credenciales, `.env`, CSD o secretos.

## Reglas De Privacidad

- Bot privado por defecto.
- `telegram_chat_id` solo no basta para futuras fases sensibles; validar tambien
  `telegram_user_id` cuando este disponible.
- Roles minimos esperados: `OWNER`, `ASSISTANT_OPERATOR`,
  `ACCOUNTANT_READONLY`, `ADMIN_FUTURE`.
- `OWNER`: puede operar borradores y acciones sandbox permitidas por fase.
- `ASSISTANT_OPERATOR`: puede capturar o preparar, pero no habilita produccion.
- `ACCOUNTANT_READONLY`: puede revisar reportes permitidos, no confirmar cambios
  destructivos.
- `ADMIN_FUTURE`: no concede permisos automaticos hasta fase explicita.
- Mensajes a Telegram deben ser resumidos y seguros.
- No enviar documentos fiscales por Telegram sin fase de seguridad dedicada.

## Telegram Product UX Matrix

| surface | command_or_button | target_action | role | phase | status | risk | notes |
|---|---|---|---|---|---|---|---|
| Main menu | `cfdi_nav:menu` | Mostrar menu producto | OWNER, ASSISTANT_OPERATOR | 7.1 | USER_SAFE | Bajo | No contiene datos. |
| Main menu | `/factura` | Iniciar borrador CFDI | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Medio | Mantener compatibilidad y mover a boton. |
| Main menu | `cfdi_nav:new` | Iniciar borrador CFDI | OWNER, ASSISTANT_OPERATOR | 7.1 | USER_SAFE | Medio | Debe conservar guardrails fiscales. |
| Draft | texto natural | Crear/actualizar preview | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Medio | Pedir aclaracion si falta equipo, cliente, monto o IVA. |
| Draft | `confirmar` | Confirmar borrador local | OWNER | Actual -> 7.1 | USER_SAFE | Alto | No timbra; requiere blockers resueltos. |
| Draft | `cfdi:<token>` Confirmar | Confirmar borrador local | OWNER | 7.1 | USER_SAFE | Alto | Token one-time, ligado a chat/user. |
| Draft | `editar` | Editar borrador activo | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Medio | No cambia catalogo ni PAC. |
| Draft | `cfdi:<token>` Editar | Editar borrador activo | OWNER, ASSISTANT_OPERATOR | 7.1 | USER_SAFE | Medio | Debe mostrar instrucciones breves. |
| Draft | `cancelar` | Cancelar estado/borrador activo | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Medio | Registra evento; no borra audit. |
| Draft | `cfdi:<token>` Cancelar | Cancelar estado/borrador activo | OWNER | 7.1 | USER_SAFE | Medio | Token one-time para evitar reuso. |
| Draft | `ver` / `estado` | Ver preview actual | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Bajo | Resumen seguro, sin XML/PDF. |
| Drafts | `/pendientes` | Listar borradores pendientes | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Medio | Redactar datos sensibles. |
| Drafts | `/aprobadas` | Listar borradores aprobados | OWNER | Actual legacy | USER_SAFE | Medio | Debe seguir sin timbrado. |
| Drafts | `/aprobar DRAFT_ID` | Aprobar borrador local | OWNER | Actual legacy | DEPRECATED | Alto | Preferir boton tokenizado. |
| Drafts | `/descartar DRAFT_ID` | Descartar borrador | OWNER | Actual legacy | DEPRECATED | Medio | Preferir boton tokenizado. |
| Drafts | `/detalle DRAFT_ID` | Ver detalle de borrador | OWNER, ASSISTANT_OPERATOR | Actual legacy | DEPRECATED | Medio | Preferir token; no exponer IDs largos. |
| Clientes | `/clientes` | Listar/buscar clientes | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Medio | Redactar datos fiscales sensibles. |
| Clientes | `/cliente TEXTO` | Buscar cliente | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Medio | No poner RFC completo en Telegram si no es necesario. |
| Clientes | `/nuevocliente` | Crear cliente local | OWNER, ASSISTANT_OPERATOR | Actual -> 7.1 | USER_SAFE | Alto | Queda sin validar hasta revision humana. |
| Clientes | `/editarcliente ...` | Editar cliente local | OWNER | Actual -> 7.1 | USER_SAFE | Alto | Cambios fiscales requieren revalidacion. |
| Clientes | `/validarcliente ...` | Marcar cliente validado | OWNER | Actual -> 7.1 | ADMIN_ONLY | Alto | Debe registrar evidencia/audit. |
| Clientes | `/setcliente` | Asociar cliente al draft activo | OWNER, ASSISTANT_OPERATOR | Actual legacy | DEPRECATED | Medio | Reemplazar por flujo guiado. |
| Reportes | `cfdi_nav:report` | Resumen mensual | OWNER, ACCOUNTANT_READONLY | 7.1 | USER_SAFE | Medio | No adjuntar archivos todavia. |
| Reportes | `cfdi_nav:acctpkg` | Paquete contador seguro | OWNER, ACCOUNTANT_READONLY | 7.1 | USER_SAFE | Alto | Solo resumen; artifacts no van por Telegram. |
| Sistema | `cfdi_nav:status` | Estado del sistema | OWNER | 7.1 | USER_SAFE | Bajo | Sin rutas absolutas ni secretos. |
| Ayuda | `cfdi_nav:help` | Ayuda de producto | Todos autorizados | 7.1 | USER_SAFE | Bajo | Debe ocultar sandbox si no es admin. |
| Sandbox | `/sandbox_menu` | Menu admin sandbox | OWNER | 6A / admin | SANDBOX_ONLY | Alto | Oculto del producto diario. |
| Sandbox | `/sandbox_*` | Acciones sandbox allowlisted | OWNER | 6A / admin | SANDBOX_ONLY | Alto | No PAC productivo; no archivos por Telegram. |
| Sandbox | `cfdi_sbx:*` | Botones sandbox admin | OWNER | 6A / admin | SANDBOX_ONLY | Alto | Mantener separado de `cfdi_nav:*`. |
| PAC futuro | Timbrar produccion | `STAMP_PRODUCTION` | No habilitado | Futuro | FUTURE | Critico | Bloqueado hasta fase explicita. |
| Docs futuro | Enviar XML/PDF/ZIP/Excel | Document delivery | No habilitado | Futuro | FUTURE | Critico | Prohibido por ahora. |
| Web futuro | Miniapp/Web Hub | UI externa | No habilitado | Futuro | FUTURE | Alto | No crear en Fase 7.0. |

## No-Go De Fase 7.0

Queda explicitamente fuera de alcance:

- Implementar o modificar workflows.
- Llamar PAC real o produccion.
- Timbrar CFDI.
- Usar datos reales.
- Modificar logica fiscal.
- Tocar catalogo SAT ni `data/concepts.normalized.json`.
- Enviar XML/PDF/ZIP/Excel por Telegram.
- Crear interfaz web.
- Implementar Fase 7.1.

## Riesgos Y Deuda Antes De Implementar

- El ingest local actual mezcla comandos legacy, producto y acciones de draft.
- El router sandbox esta bien delimitado, pero debe quedar oculto para usuario
  final.
- Hay que resolver si el menu principal muestra cinco accesos o siete; la regla
  anti-menus favorece cinco visibles y el resto en segundo nivel.
- Las acciones con IDs textuales (`/aprobar DRAFT_ID`) deben migrar a botones
  tokenizados para reducir exposicion.
- Validar cliente es una accion fiscalmente sensible y debe ser owner/admin.
- Antes de operar con datos reales se requiere una fase explicita de privacidad,
  roles y manejo de documentos.

## Criterios De Entrada Para 7.1

- Cierre 6A documentado.
- Plan 7.0 aprobado.
- Matriz UX revisada.
- Contrato de `callback_data` aprobado.
- Roles y acciones admin-only aprobados.
- Decision tomada sobre menu visible de cinco vs siete accesos.
- Confirmacion de que `cfdi_sbx:*` queda admin/sandbox.
- Repo safety PASS.

## Criterios De Salida De 7.0

- Documento de planeacion creado.
- README y roadmap enlazan esta fase.
- No se modificaron workflows.
- No se modifico runtime.
- No se modifico `data/concepts.normalized.json`.
- No se llamo PAC ni produccion.
- Fase 7.1 queda lista para definir contrato implementable, sin ejecutar aun.

## Siguiente Fase Recomendada

```text
7.1 Telegram Product Menu Contract
```

Objetivo recomendado: convertir esta planeacion en un contrato testeable de menu
Telegram, callback allowlist, roles y respuestas esperadas, todavia sin activar
PAC real ni enviar documentos por Telegram.
