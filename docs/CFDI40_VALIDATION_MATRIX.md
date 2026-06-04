# CFDI 4.0 - Matriz de validacion

Fuentes oficiales usadas:
- Guia: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/Anexo_20_Guia_de_llenado_CFDI .pdf`
- Catalogo maestro: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls`
- Catalogo activo personal: `data/concepts.normalized.json`

Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.

| ID | Validacion | Entrada requerida | Salida esperada | Nivel |
| --- | --- | --- | --- | --- |
| CFDI40-001 | Comprobante.TipoDeComprobante=I | Mensaje, catalogo activo y catalogo maestro SAT | Para ingresos de servicios/productos Emberhub usar comprobante de Ingreso antes de cualquier captura manual. | BLOCKER |
| CFDI40-002 | Comprobante.Exportacion | Mensaje, catalogo activo y catalogo maestro SAT | Definir Exportacion con clave vigente del catalogo; para operaciones locales comunes se requiere revisar que sea la clave aplicable antes de emitir. | BLOCKER |
| CFDI40-003 | Emisor.RegimenFiscal | Mensaje, catalogo activo y catalogo maestro SAT | El regimen emisor debe existir en c_RegimenFiscal y corresponder al certificado/CSD. Para este MVP se modela RESICO persona fisica 626 como matriz de decision, no como timbrado. | BLOCKER |
| CFDI40-004 | Receptor.RegimenFiscalReceptor | Mensaje, catalogo activo y catalogo maestro SAT | El regimen receptor debe existir en c_RegimenFiscal y ser compatible con el RFC/tipo persona del receptor. | BLOCKER |
| CFDI40-005 | Receptor.UsoCFDI | Mensaje, catalogo activo y catalogo maestro SAT | UsoCFDI debe existir en c_UsoCFDI y ser compatible con RegimenFiscalReceptor segun la columna Regimen Fiscal Receptor. | BLOCKER |
| CFDI40-006 | Concepto.ClaveProdServ | Mensaje, catalogo activo y catalogo maestro SAT | ClaveProdServ debe provenir del catalogo oficial c_ClaveProdServ y del catalogo activo validado; no se inventan claves. | BLOCKER |
| CFDI40-007 | Concepto.ClaveUnidad | Mensaje, catalogo activo y catalogo maestro SAT | ClaveUnidad debe existir en c_ClaveUnidad. Para servicios tecnicos se prefiere E48 si la base activa lo indica; para productos H87 u otra unidad solo si esta en la base. | BLOCKER |
| CFDI40-008 | Concepto.Descripcion | Mensaje, catalogo activo y catalogo maestro SAT | La descripcion capturada debe describir el bien o servicio real sin usar texto ambiguo como 'servicio general' cuando falte equipo/sistema. | WARNING |
| CFDI40-009 | Concepto.ObjetoImp=02 | Mensaje, catalogo activo y catalogo maestro SAT | Si ObjetoImp es 02, el concepto es objeto de impuesto y debe tener desglose de impuestos aplicable. | BLOCKER |
| CFDI40-010 | Concepto.ObjetoImp=01 | Mensaje, catalogo activo y catalogo maestro SAT | Si ObjetoImp es 01, no se deben capturar traslados del concepto. | BLOCKER |
| CFDI40-011 | Concepto.ObjetoImp=03 | Mensaje, catalogo activo y catalogo maestro SAT | Si ObjetoImp es 03, el concepto puede ser objeto de impuesto sin obligar al desglose; requiere revision humana por caso. | WARNING |
| CFDI40-012 | Impuestos.IVA traslado | Mensaje, catalogo activo y catalogo maestro SAT | IVA debe usar c_Impuesto=002, TipoFactor=Tasa/Exento segun corresponda y tasa vigente de c_TasaOCuota. | BLOCKER |
| CFDI40-013 | Impuestos.ISR retencion | Mensaje, catalogo activo y catalogo maestro SAT | ISR c_Impuesto=001 es retencion, no traslado; para RESICO se evalua solo como regla fiscal futura, no se automatiza timbrado. | WARNING |
| CFDI40-014 | Pago.MetodoPago=PUE | Mensaje, catalogo activo y catalogo maestro SAT | PUE se usa cuando el pago ocurre en una sola exhibicion; FormaPago debe reflejar el medio real si se conoce. | BLOCKER |
| CFDI40-015 | Pago.MetodoPago=PPD | Mensaje, catalogo activo y catalogo maestro SAT | PPD indica pago diferido/parcialidades; en captura manual se debe revisar FormaPago y complemento de pago futuro. | WARNING |
| CFDI40-016 | Pago.FormaPago | Mensaje, catalogo activo y catalogo maestro SAT | FormaPago debe existir en c_FormaPago y respetar restricciones bancarizadas cuando aplique. | BLOCKER |
| CFDI40-017 | Totales.Subtotal/Total | Mensaje, catalogo activo y catalogo maestro SAT | SubTotal, descuentos, impuestos y Total deben cuadrar aritmeticamente; este bot no calcula ni timbra totales finales. | BLOCKER |
| CFDI40-018 | Moneda.TipoCambio | Mensaje, catalogo activo y catalogo maestro SAT | Si la moneda no es MXN, validar moneda vigente y tipo de cambio antes de captura/timbrado. | BLOCKER |
| CFDI40-019 | Catalogos.Vigencia | Mensaje, catalogo activo y catalogo maestro SAT | Toda clave debe estar vigente para la fecha del comprobante segun fechas de inicio/fin del catalogo maestro. | BLOCKER |
| CFDI40-020 | Catalogos.Complemento requerido | Mensaje, catalogo activo y catalogo maestro SAT | Si c_ClaveProdServ indica complemento obligatorio, no usar esa clave en el MVP sin flujo especifico. | BLOCKER |
| CFDI40-021 | RESICO.626 | Mensaje, catalogo activo y catalogo maestro SAT | El regimen 626 se considera actividad actual solo si la base activa marca current_activity_ok/resico_626_ok. | BLOCKER |
| CFDI40-022 | RESICO.software/apps/web/IA | Mensaje, catalogo activo y catalogo maestro SAT | Software, apps, IA, web, SaaS y automatizacion digital requieren actividad o bloqueo segun base; no se reclasifican como soporte tecnico. | BLOCKER |
| CFDI40-023 | Operacion.venta | Mensaje, catalogo activo y catalogo maestro SAT | Si el mensaje dice venta, priorizar tipo PRODUCTO en base activa y validar ClaveProdServ/ClaveUnidad del producto. | BLOCKER |
| CFDI40-024 | Operacion.servicio | Mensaje, catalogo activo y catalogo maestro SAT | Revision, diagnostico, mantenimiento y configuracion priorizan SERVICIO; no sugerir producto puro sin evidencia de venta. | BLOCKER |
| CFDI40-025 | Operacion.instalacion/cambio | Mensaje, catalogo activo y catalogo maestro SAT | Instalacion, cambio, sustitucion o reemplazo se tratan como servicio o mixto; si incluye material, pedir desglose o validar concepto mixto. | WARNING |
| CFDI40-026 | Seguridad.revision humana | Mensaje, catalogo activo y catalogo maestro SAT | Todos los resultados del bot son sugerencias para captura manual; requires_human_review debe permanecer verdadero. | BLOCKER |
| CFDI40-027 | Limite.no PAC | Mensaje, catalogo activo y catalogo maestro SAT | La knowledge base no autoriza timbrado, PAC, WhatsApp ni envio fiscal automatico. | BLOCKER |
