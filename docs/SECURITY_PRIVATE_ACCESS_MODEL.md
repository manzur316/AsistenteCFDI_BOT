# Security Private Access Model

## Principio

AsistenteCFDI_BOT es privado por defecto.

Todo acceso debe pasar por allowlist o autenticacion antes de operar datos
fiscales, clientes, reportes, documentos, payloads PAC o acciones futuras de
timbrado/cancelacion.

Telegram `chat_id` no debe considerarse suficiente por si solo para produccion
futura. En el MVP local puede funcionar como primer factor, pero debe
acompanarse de `telegram_user_id` cuando Telegram lo permita y de una tabla de
usuarios autorizados.

Regla central:

```text
Ninguna accion fiscal sensible debe ejecutarse sin autenticacion y autorizacion.
```

## Niveles De Seguridad

- `LOCAL_DEV`: desarrollo local, datos demo, sin PAC real, sin estados de cuenta
  reales.
- `PRIVATE_SINGLE_USER`: operacion privada del propietario, allowlist estricta.
- `MULTI_USER_FUTURE`: varios usuarios autorizados con roles diferenciados.
- `MULTI_EMITTER_FUTURE`: varios emisores, aislamiento fuerte por emisor,
  auditoria y permisos por tenant.

## Roles

- `OWNER`: propietario. Puede operar todo en local/single-user excepto acciones
  bloqueadas por fase, como `STAMP_PRODUCTION`.
- `ACCOUNTANT_READONLY`: lectura para contador. Puede ver reportes/exportar
  paquete contador y documentos permitidos; no puede timbrar, cancelar, modificar
  clientes ni configurar PAC.
- `ASSISTANT_OPERATOR`: operador asistente. Puede crear y confirmar borradores
  conservadores, pero no configurar PAC, ver credenciales, timbrar produccion,
  cancelar facturas timbradas ni ver estados de cuenta.
- `ADMIN_FUTURE`: reservado. No debe recibir permisos automaticos hasta una fase
  explicita.

## Acciones Sensibles

Acciones sensibles actuales o futuras:

- Confirmar borrador.
- Aprobar factura.
- Timbrar sandbox.
- Timbrar produccion futura.
- Cancelar factura.
- Descargar XML/PDF.
- Ver estados de cuenta.
- Exportar paquete contador.
- Ver reportes con montos.
- Modificar cliente.
- Validar cliente.
- Configurar PAC.
- Leer credenciales.

Lista tecnica inicial:

- `VIEW_BASIC_HELP`
- `CREATE_DRAFT`
- `CONFIRM_DRAFT`
- `APPROVE_DRAFT`
- `STAMP_SANDBOX`
- `STAMP_PRODUCTION`
- `CANCEL_DRAFT`
- `CANCEL_INVOICE`
- `VIEW_REPORTS`
- `DOWNLOAD_XML`
- `DOWNLOAD_PDF`
- `EXPORT_ACCOUNTANT_PACKAGE`
- `VIEW_BANK_STATEMENTS`
- `MANAGE_CLIENTS`
- `CONFIGURE_PAC`

## Reglas De Autorizacion

- Acciones sensibles requieren usuario autorizado.
- Consultas sensibles tambien requieren autorizacion.
- Accion desconocida falla cerrada.
- Usuario inexistente o deshabilitado falla cerrado.
- `STAMP_PRODUCTION` queda bloqueado por ahora para todos los roles.
- `ADMIN_FUTURE` no implica permisos automaticos.
- Acciones destructivas o irreversibles deben registrar audit trail.
- Cancelar nunca borra registros; cambia estado y registra evento.

## Callback Tokens

- `callback_data` debe contener solo un token corto, por ejemplo `cfdi:<token>`.
- No poner RFC, cliente, monto, clave SAT, concepto, XML, PDF ni payload PAC en
  `callback_data`.
- El token debe estar ligado a `chat_id`.
- Cuando Telegram lo permita, el token tambien debe estar ligado a
  `telegram_user_id`.
- Tokens deben expirar.
- Acciones destructivas o de confirmacion deben ser one-time.
- Reusar un token usado debe fallar cerrado.

## Logs Y Eventos

Los logs deben sanitizar:

- API keys.
- Secret keys.
- Tokens.
- RFC.
- Cuentas bancarias.
- XML.
- PDF.
- Payloads PAC crudos.

`cfdi_security_events` debe guardar evidencia de decisiones de acceso sin
exponer secretos. Si se necesita conservar payload tecnico, debe ir a Storage
Engine con marca `contains_sensitive_data=true`, no a logs de Telegram ni git.

## Datos Que Nunca Van En Git

- `.env`
- Credenciales sandbox o produccion.
- Estados de cuenta.
- XML/PDF.
- Payloads PAC con datos reales.
- RFC/clientes reales.
- Runtime/logs.
- Llaves, certificados o passwords.

## Enforcement Workflow

Esta fase crea la base de seguridad, schema y modulo local. El workflow
`cfdi_telegram_local_ingest.n8n.json` no se modifica en 6A.3 para evitar tocar
rutas criticas de Telegram, drafts y tokens sin una prueba dedicada.

La fase recomendada 6A.3B debe integrar enforcement real:

1. Cargar usuario autorizado por `telegram_chat_id` y `telegram_user_id`.
2. Si no existe o esta deshabilitado, responder `Acceso no autorizado`.
3. Registrar `cfdi_security_events`.
4. No procesar comandos, scoring, drafts ni tokens.
5. Verificar permisos antes de cada accion sensible.
