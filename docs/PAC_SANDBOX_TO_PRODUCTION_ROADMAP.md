# PAC Sandbox To Production Roadmap

## Proposito

Este documento formaliza la transicion desde Telegram + Factura.com Sandbox
hacia una produccion futura, sin abrir produccion ni implementar las fases
posteriores todavia.

La intencion es mantener la arquitectura alineada antes de conectar borradores
reales del bot con el ciclo completo de timbrado sandbox y, mas adelante, con
un gate explicito de produccion.

## Terminologia

- `Factura.com`: proveedor PAC productivo futuro.
- `Factura.com Sandbox`: ambiente de prueba del proveedor.
- `timbrado sandbox`: CFDI de prueba contra Factura.com Sandbox, sin validez
  fiscal real.
- `timbrado productivo`: CFDI fiscal real contra Factura.com produccion, fase
  futura.
- `PAC Adapter Hub`: capa neutral del sistema.
- `FacturaComSandboxAdapter`: primer adapter sandbox.
- `FacturaComProductionAdapter`: adapter productivo futuro, bloqueado hasta un
  gate explicito.
- Telegram: interfaz conversacional.
- n8n: orquestador.
- Action Layer / PAC Adapter Hub: capas que ejecutan logica sensible.

## Principios Obligatorios

1. El bot no debe acoplarse a Factura.com como core.
2. Factura.com Sandbox es el proveedor de prueba para validar el flujo.
3. n8n no debe llamar directo a Factura.com.
4. n8n no debe contener `F-Api-Key`, `F-Secret-Key`, `F-PLUGIN`, CSD, `.env`
   ni credenciales.
5. Telegram no debe exponer XML/PDF/ZIP/Excel por defecto.
6. Sandbox y production deben tener estados, storage, reportes y carpetas
   separadas.
7. Toda cancelacion debe tener doble confirmacion.
8. Toda factura debe tener historial/timeline.
9. Timbrado y pago son estados separados.
10. Produccion real no se abre sin fase gate explicita.

## Arquitectura Objetivo

```text
Telegram
  -> runner/telegram-local-runner.js
  -> workflow/cfdi_telegram_local_ingest.n8n.json
  -> Router interno
  -> Action Layer allowlisted
  -> PAC Adapter Hub
  -> FacturaComSandboxAdapter o adapter futuro
  -> Storage sandbox o production separado
  -> Reporting separado por ambiente
```

n8n sigue siendo orquestador. No conoce headers de proveedor, no guarda
credenciales PAC, no construye requests directos a Factura.com y no decide
reglas fiscales.

## Separacion Sandbox / Production

Sandbox y production deben mantenerse separados en:

- estados de factura;
- storage fisico;
- reportes;
- audit;
- credenciales;
- rutas;
- paquetes para contador;
- indices por cliente, periodo y estado.

Ejemplos de separacion:

```text
runtime/storage-sandbox/
runtime/reports-sandbox/
runtime/action-results-sandbox/
runtime/sandbox-action-audit/
```

Una fase futura podra definir rutas equivalentes de production, pero no deben
mezclarse con sandbox ni compartir conteos fiscales reales.

## Fase 7.5 - Telegram PAC Sandbox Stamping Console

Proposito: agregar consola OWNER/admin en Telegram para operar Factura.com
Sandbox como proveedor PAC de prueba.

Debe incluir:

- `PAC Sandbox` en Admin/Sandbox.
- `Proveedor actual: Factura.com Sandbox`.
- Preflight.
- Borradores aprobados para timbrar con `sandbox.draft.stamp`.
- Smoke: timbrar fixture sandbox.
- Smoke: timbrar + XML/PDF.
- Smoke: timbrar + cancelar.
- Ultimo resultado tecnico.
- Ver audit sandbox.

No debe:

- usar produccion fiscal real;
- enviar XML/PDF por Telegram;
- exponer credenciales;
- acoplar workflow a Factura.com directamente.

Estado esperado: consola sandbox por Action Layer allowlisted. Produccion fiscal
real sigue bloqueada.

## Fase 7.6 - Approved Draft To PAC Sandbox

Proposito: tomar un borrador aprobado real creado desde Telegram y enviarlo a
timbrado sandbox.

Estado: implementada como fase sandbox-only. Ver
`docs/PHASE_7_6_APPROVED_DRAFT_TO_PAC_SANDBOX.md`.

Flujo objetivo:

```text
BORRADOR
  -> APROBADO
  -> CanonicalDraft
  -> CanonicalInvoiceDocument
  -> CanonicalPacRequest
  -> FacturaComSandboxAdapter
  -> stampSandbox
```

Debe incluir:

- validacion previa del cliente;
- validacion de receptor;
- validacion de impuestos y concepto;
- bloqueo si hay blockers;
- respuesta segura en Telegram;
- idempotencia para evitar doble timbrado por doble clic;
- timeline de eventos desde aprobacion hasta resultado sandbox.

No abre produccion. No envia documentos por Telegram por defecto.

## Fase 7.7 - Sandbox CFDI Lifecycle And Cancellation

Proposito: manejar el ciclo completo de CFDI sandbox.

Estados minimos:

- `BORRADOR`
- `APROBADO`
- `SANDBOX_TIMBRANDO`
- `SANDBOX_TIMBRADO`
- `SANDBOX_ERROR`
- `SANDBOX_CANCELACION_PENDIENTE`
- `SANDBOX_CANCELADO`
- `SANDBOX_CANCEL_ERROR`

Requisitos:

- doble confirmacion para cancelar;
- no cancelar si no esta timbrado sandbox;
- registrar respuesta de cancelacion;
- registrar evento/timeline;
- actualizar estado;
- no borrar evidencia;
- no mezclar con produccion.

Toda cancelacion debe preservar evidencia y quedar fuera de ingresos activos en
reportes sandbox.

## Fase 7.8 - Human-Readable CFDI Storage Naming

Proposito: organizar XML/PDF/JSON sandbox con nombres legibles y estructura por
cliente, periodo y estado.

Estructura sugerida:

```text
runtime/storage-sandbox/emitters/<emitter_id>/<yyyy>/<mm>/clients/<client_id>/invoices/<invoice_id>/
```

Debe incluir:

- `manifest.json`;
- `canonical-summary.json`;
- request/response sanitizados;
- `xml/`;
- `pdf/`;
- `cancel/`;
- `status-history.json`;
- checksums;
- indices por cliente/periodo/estado.

Reglas:

- no RFC en nombres;
- no razon social completa si es sensible;
- usar slugs seguros;
- no rutas absolutas en reportes;
- no borrar al cancelar;
- al cancelar, reclasificar, copiar o indexar como cancelada sin perder
  evidencia.

## Fase 7.9 - Invoice Status And Payment Status Model

Proposito: separar estado fiscal/documental de estado de pago.

`invoice_status`:

- `BORRADOR`
- `APROBADO`
- `SANDBOX_TIMBRADO`
- `SANDBOX_CANCELADO`
- `PRODUCCION_TIMBRADO` futuro
- `PRODUCCION_CANCELADO` futuro
- `ERROR`

`payment_status`:

- `NO_APLICA`
- `PENDIENTE`
- `PARCIAL`
- `PAGADO`
- `VENCIDO`

Debe permitir:

- ver facturas por cliente;
- ver pendientes de pago;
- marcar pagado;
- mantener canceladas fuera de ingresos activos;
- preparar reportes mensuales.

Timbrado y pago no deben colapsarse en un mismo campo.

## Fase 7.10 - Sandbox End-To-End Signoff

Proposito: cerrar ciclo sandbox completo antes de produccion.

Debe validar:

- crear borrador desde Telegram;
- aprobar;
- timbrar sandbox;
- descargar/guardar XML/PDF sandbox;
- cancelar sandbox;
- actualizar estado;
- reclasificar storage;
- actualizar reportes;
- generar paquete contador sandbox;
- mostrar resumen en Telegram;
- audit sin findings sensibles.

Criterio de salida: el ciclo sandbox opera de punta a punta sin credenciales,
datos reales, rutas sensibles ni documentos enviados por Telegram.

## Fase 8.0 - Production Readiness Gate

Proposito: preparar produccion sin abrirla automaticamente.

Debe revisar:

- CSD real;
- credenciales Factura.com produccion;
- separacion sandbox/production;
- roles OWNER/admin;
- doble confirmacion;
- backups;
- contador/revision humana;
- terminos de uso;
- manejo de datos reales;
- storage cifrado o ruta segura;
- pruebas sandbox cerradas.

No debe timbrar produccion todavia.

Produccion real queda bloqueada hasta que este gate quede aprobado de forma
explicita y versionada.

## Fase 8.1+ - Factura.com Production Adapter

Proposito futuro: activar `FacturaComProductionAdapter` y `stampProduction`
solo despues de 8.0.

Requiere:

- gate aprobado;
- confirmacion humana;
- pruebas con monto controlado;
- rollback;
- auditoria;
- no mezclar sandbox con produccion.

Factura.com Production Adapter debe seguir el contrato del PAC Adapter Hub y no
convertirse en dependencia central del bot.

## Gates De Seguridad

Antes de cualquier paso hacia produccion debe cumplirse:

- `data/concepts.normalized.json` sigue siendo fuente controlada y no se toca
  sin aprobacion humana.
- Workflows no contienen credenciales PAC, CSD, `.env` ni headers de proveedor.
- n8n no llama directo a Factura.com.
- Telegram no envia XML/PDF/ZIP/Excel por defecto.
- Toda factura tiene historial/timeline.
- Toda cancelacion tiene doble confirmacion.
- `invoice_status` y `payment_status` estan separados.
- Sandbox y production tienen storage/reporting separados.
- Produccion fiscal real sigue bloqueada hasta gate explicito.

## Decision Arquitectonica

La ruta aprobada es:

```text
Bot privado + Telegram UI + n8n orquestador + Action Layer + PAC Adapter Hub + storage/reporting separados
```

Factura.com Sandbox es el primer proveedor de prueba. Factura.com produccion es
un adapter futuro bloqueado. El core del producto debe permanecer neutral para
permitir futuros adapters como Facturama, Facturapi, SW, Finkok u otros.

## Siguiente Fase Recomendada

Continuar con `7.6 Approved Draft to PAC Sandbox` cuando la consola 7.5 quede
cerrada y se decida conectar un borrador aprobado real del bot con
`stampSandbox`.
