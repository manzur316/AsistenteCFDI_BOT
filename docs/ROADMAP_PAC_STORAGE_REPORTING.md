# Roadmap PAC Adapter Hub, Storage, Reporting y Declaraciones

## Posicionamiento

AsistenteCFDI_BOT se reposiciona como:

```text
Asistente CFDI privado para tecnicos, RESICO y pymes, con organizacion contable,
reportes mensuales y preparacion para contador.
```

El sistema no debe casarse con un solo PAC. Factura.com sera el primer adapter
sandbox, pero el nucleo debe permitir cambiar o agregar PACs sin reescribir la
logica fiscal, conversacional, de almacenamiento o de reportes.

Regla central:

```text
La constancia fiscal manda. El catalogo SAT valida. La Guia de llenado CFDI 4.0
define reglas CFDI. El bot solo sugiere y organiza BORRADORES SUJETOS A
REVISION HUMANA.
```

Advertencia obligatoria en cualquier salida fiscal:

```text
Borrador sujeto a revisión humana
```

## Alcance Negativo

Este roadmap no implementa PAC, timbrado, XML/PDF real, cancelacion real ni
llamadas a proveedores. Tampoco modifica workflows productivos, credenciales,
clientes reales, `data/concepts.normalized.json` ni fuentes SAT locales.

Queda prohibido para esta etapa:

- Llamar Factura.com, Facturama, Facturapi, SW, Finkok u otro PAC.
- Timbrar CFDI reales.
- Generar folios fiscales reales.
- Generar XML/PDF fiscales reales.
- Subir tokens, passwords, llaves, certificados o clientes reales.
- Usar shadow logging como decision productiva.
- Activar conceptos nuevos sin revision humana.

## Arquitectura Textual

```text
Telegram / Web Hub / Miniapp
        |
        v
Conversation + Draft State
        |
        v
Fiscal Guardrails + Scoring CFDI
        |
        v
Internal CFDI Draft Contract
        |
        +---------------------------+
        |                           |
        v                           v
Storage Engine              PAC Adapter Hub
        |                           |
        |                           +--> FacturaComSandboxAdapter
        |                           +--> FacturamaAdapter futuro
        |                           +--> FacturapiAdapter futuro
        |                           +--> SWAdapter futuro
        |                           +--> FinkokAdapter futuro
        |
        v
Reporting Engine
        |
        v
Monthly Declaration Assistant
        |
        v
Paquete mensual para contador
```

El contrato interno separa claramente el borrador fiscal del proveedor PAC. El
Storage Engine conserva payloads, respuestas sandbox, archivos y metadatos por
proveedor. El Reporting Engine y el asistente mensual leen desde almacenamiento
normalizado, no desde APIs especificas de PAC.

## PAC Adapter Hub

El PAC Adapter Hub debe exponer un contrato interno unico. Los workflows y la
UI no deben conocer detalles de Factura.com ni de ningun proveedor especifico.

Contrato propuesto:

- `createDraftPayload(draft, context)`
- `validatePayload(payload, context)`
- `stampSandbox(payload, context)`
- `stampProduction(payload, context)` futuro
- `cancelInvoice(invoiceRef, context)` futuro
- `downloadXml(invoiceRef, context)`
- `downloadPdf(invoiceRef, context)`
- `getStatus(invoiceRef, context)`

Primer adapter:

- `FacturaComSandboxAdapter`

Adapters futuros:

- `FacturamaAdapter`
- `FacturapiAdapter`
- `SWAdapter`
- `FinkokAdapter`

Reglas de diseno:

- Cada adapter traduce el contrato interno al formato del PAC.
- Cada adapter normaliza errores a un formato comun.
- Ningun adapter debe modificar decisiones fiscales del motor.
- El adapter solo opera con payloads ya revisados por guardrails.
- Produccion queda bloqueada hasta aprobacion humana y fase explicita.

## Factura.com Sandbox

Factura.com sera solamente el primer sandbox adapter.

Objetivos permitidos en sandbox:

- Validar payload CFDI 4.0.
- Observar errores de estructura, catalogos, impuestos y receptor.
- Obtener XML/PDF sandbox si el proveedor lo permite.
- Probar cancelacion sandbox si aplica.
- Guardar evidencia tecnica para mejorar validaciones locales.

Fuera de alcance:

- Timbrado fiscal real.
- Folios fiscales reales.
- Produccion.
- Automatizar decisiones fiscales por respuesta del PAC.

## Storage Engine

El Storage Engine debe organizar documentos y metadatos por una ruta logica
estable, independiente del proveedor PAC.

Dimensiones de organizacion:

- Emisor.
- Cliente.
- Ano.
- Mes.
- Estatus.
- XML.
- PDF.
- JSON payload.
- Draft original.
- PAC provider.
- UUID sandbox o produccion cuando exista.

Estructura conceptual:

```text
storage/
  <emisor_id>/
    <cliente_id>/
      <yyyy>/
        <mm>/
          pendientes/
          sandbox/
          emitidas/
          canceladas/
          payloads/
          drafts/
          xml/
          pdf/
          logs/
```

Los nombres fisicos no deben incluir RFC, razon social completa ni datos
sensibles si el repositorio o backups no estan cifrados. Los identificadores
internos deben mapearse desde PostgreSQL.

Metadatos minimos por documento:

- `draft_id`
- `invoice_id` interno
- `pac_provider`
- `pac_environment`: `SANDBOX` o `PRODUCTION`
- `uuid`
- `status`
- `client_id`
- `emitter_id`
- `created_at`
- `updated_at`
- `source_message_id`
- `requires_human_review`

## Reporting Engine

El Reporting Engine debe generar reportes locales para revisar actividad del
periodo y preparar paquete para contador.

Reportes por:

- Cliente.
- Periodo.
- Facturas emitidas.
- Facturas pendientes.
- Facturas canceladas.
- Subtotal.
- IVA trasladado estimado.
- ISR retenido estimado.
- IVA retenido estimado.
- Total cobrado.
- Total por cobrar.
- Paquete mensual para contador.

La fuente primaria debe ser la base local y los documentos almacenados. Si un
PAC no esta disponible o cambia API, los reportes deben seguir funcionando con
datos ya guardados.

## Monthly Declaration Assistant

El asistente de declaracion mensual no presenta declaraciones y no sustituye al
contador.

Objetivos:

- Calcular estimados a partir de facturas almacenadas.
- Separar IVA trasladado, IVA retenido e ISR retenido.
- Separar facturas canceladas, pendientes, sandbox y produccion.
- Exportar resumen para contador.
- Marcar todo como `BORRADOR SUJETO A REVISION HUMANA`.

Salidas propuestas:

- Resumen mensual en JSON.
- Resumen mensual en CSV.
- Resumen legible para contador.
- Checklist de pendientes fiscales.
- Lista de facturas sin cliente validado.
- Lista de facturas con datos incompletos.

Restricciones:

- No declarar ante SAT.
- No calcular pagos definitivos sin revision humana.
- No mezclar sandbox con produccion en totales fiscales reales.
- No ocultar canceladas ni pendientes.

## Web Hub / Miniapp Futuro

El Hub Padre administrara:

- Borradores.
- Clientes.
- Facturas.
- XML/PDF.
- Reportes.
- Contador.
- Adapters PAC.
- Workflows hijos.

Responsabilidades:

- Mostrar estados y blockers.
- Permitir revision humana antes de cualquier accion fiscal sensible.
- Orquestar adapter sandbox o produccion segun permisos.
- Concentrar reportes y paquetes mensuales.
- Evitar que Telegram sea la unica interfaz de control.

## Fases Propuestas

### Fase 6A - PAC Adapter Hub Contract

- Definir tipos internos de payload CFDI.
- Crear interfaz neutral del PAC Adapter Hub.
- Crear fixtures de payloads sin enviar a ningun PAC.
- Agregar pruebas de contrato para adapters.
- Mantener produccion deshabilitada.

Criterio de salida: payload interno validable sin depender de Factura.com.

### Fase 6B - Factura.com Sandbox Adapter

- Implementar `FacturaComSandboxAdapter` detras del contrato neutral.
- Usar solo sandbox.
- Guardar request/response sanitizados.
- Normalizar errores.
- Probar XML/PDF sandbox si aplica.

Criterio de salida: sandbox probado sin folios reales ni produccion.

### Fase 6C - Storage Engine

- Definir tabla/metadata de documentos CFDI.
- Definir layout local o compatible con storage futuro.
- Guardar JSON payload, draft original y respuestas sandbox.
- Separar `SANDBOX` de `PRODUCTION`.

Criterio de salida: todo documento queda trazable por emisor, cliente, periodo,
estatus y proveedor.

### Fase 6D - Reporting Engine

- Crear agregados por cliente y periodo.
- Calcular subtotales e impuestos estimados.
- Separar emitidas, pendientes y canceladas.
- Exportar CSV/JSON para revision.

Criterio de salida: reporte mensual local consistente con la base almacenada.

### Fase 6E - Monthly Declaration Assistant

- Generar resumen mensual para contador.
- Incluir checklist de pendientes.
- Marcar todo como borrador.
- Separar IVA trasladado, IVA retenido e ISR retenido.

Criterio de salida: paquete mensual revisable por contador, sin declaracion SAT.

### Fase 6F - Web Hub / Miniapp

- Crear panel padre para borradores, clientes, facturas, documentos y reportes.
- Administrar adapters PAC desde configuracion.
- Mostrar blockers y estados fiscales.
- Orquestar workflows hijos sin acoplarlos a un PAC especifico.

Criterio de salida: operacion visual centralizada sin exponer datos reales en
repositorio ni saltar guardrails.

## Criterios de Seguridad Fiscal

- Todo resultado debe decir `Borrador sujeto a revisión humana`.
- El motor no debe inventar conceptos, claves SAT, unidades ni regimenes.
- La constancia fiscal del emisor y el regimen 626 RESICO siguen mandando.
- Produccion PAC queda bloqueada hasta fase explicita.
- Sandbox no equivale a factura fiscal real.
- No se deben mezclar totales sandbox con totales fiscales reales.
- Cliente no validado debe conservar marca de riesgo.
- Retenciones e impuestos son estimados hasta revision humana.
- Cancelaciones reales requieren confirmacion humana y fase futura.
- Cualquier adapter nuevo debe pasar pruebas de contrato antes de usarse.

## Decision Arquitectonica

El proyecto debe avanzar como plataforma neutral:

```text
Bot privado + guardrails fiscales + storage propio + reporting propio + adapters PAC intercambiables
```

Factura.com entra como primer sandbox adapter, no como dependencia central del
producto.
