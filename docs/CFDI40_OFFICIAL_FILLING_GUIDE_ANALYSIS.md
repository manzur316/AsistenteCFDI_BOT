# CFDI 4.0 - Analisis operativo de la guia oficial de llenado

Fuentes oficiales usadas:
- Guia: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/Anexo_20_Guia_de_llenado_CFDI .pdf`
- Catalogo maestro: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls`
- Catalogo activo personal: `data/concepts.normalized.json`

Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.

## Campos criticos localizados

| Campo | Paginas donde aparece |
| --- | --- |
| FormaPago | 6, 7, 11, 69, 71, 72, 73, 74, 75, 84, 86, 96 |
| MetodoPago | 11, 12, 71, 72, 73, 75, 80 |
| TipoDeComprobante | 8, 10, 11, 71, 73, 74, 75 |
| RegimenFiscal | 16, 19, 30, 46, 123 |
| UsoCFDI | 19, 20, 77 |
| ClaveProdServ | 20, 21, 32, 33, 62, 65, 67, 68, 71, 73, 75, 78, 110, 118, 119, 120 |
| ClaveUnidad | 22, 32, 66, 67, 68, 71, 73, 75, 83, 85, 116, 117 |
| ObjetoImp | 25 |
| Impuestos | 8, 10, 11, 25, 27, 35, 36, 37, 38, 40, 53, 56, 57, 72, 74, 75 |
| Exportacion | 11 |

## Reglas operativas extraidas

| Regla | Dominio | Campo | Severidad | Comportamiento |
| --- | --- | --- | --- | --- |
| CFDI40-001 | Comprobante | TipoDeComprobante=I | BLOCKER | Para ingresos de servicios/productos Emberhub usar comprobante de Ingreso antes de cualquier captura manual. |
| CFDI40-002 | Comprobante | Exportacion | BLOCKER | Definir Exportacion con clave vigente del catalogo; para operaciones locales comunes se requiere revisar que sea la clave aplicable antes de emitir. |
| CFDI40-003 | Emisor | RegimenFiscal | BLOCKER | El regimen emisor debe existir en c_RegimenFiscal y corresponder al certificado/CSD. Para este MVP se modela RESICO persona fisica 626 como matriz de decision, no como timbrado. |
| CFDI40-004 | Receptor | RegimenFiscalReceptor | BLOCKER | El regimen receptor debe existir en c_RegimenFiscal y ser compatible con el RFC/tipo persona del receptor. |
| CFDI40-005 | Receptor | UsoCFDI | BLOCKER | UsoCFDI debe existir en c_UsoCFDI y ser compatible con RegimenFiscalReceptor segun la columna Regimen Fiscal Receptor. |
| CFDI40-006 | Concepto | ClaveProdServ | BLOCKER | ClaveProdServ debe provenir del catalogo oficial c_ClaveProdServ y del catalogo activo validado; no se inventan claves. |
| CFDI40-007 | Concepto | ClaveUnidad | BLOCKER | ClaveUnidad debe existir en c_ClaveUnidad. Para servicios tecnicos se prefiere E48 si la base activa lo indica; para productos H87 u otra unidad solo si esta en la base. |
| CFDI40-008 | Concepto | Descripcion | WARNING | La descripcion capturada debe describir el bien o servicio real sin usar texto ambiguo como 'servicio general' cuando falte equipo/sistema. |
| CFDI40-009 | Concepto | ObjetoImp=02 | BLOCKER | Si ObjetoImp es 02, el concepto es objeto de impuesto y debe tener desglose de impuestos aplicable. |
| CFDI40-010 | Concepto | ObjetoImp=01 | BLOCKER | Si ObjetoImp es 01, no se deben capturar traslados del concepto. |
| CFDI40-011 | Concepto | ObjetoImp=03 | WARNING | Si ObjetoImp es 03, el concepto puede ser objeto de impuesto sin obligar al desglose; requiere revision humana por caso. |
| CFDI40-012 | Impuestos | IVA traslado | BLOCKER | IVA debe usar c_Impuesto=002, TipoFactor=Tasa/Exento segun corresponda y tasa vigente de c_TasaOCuota. |
| CFDI40-013 | Impuestos | ISR retencion | WARNING | ISR c_Impuesto=001 es retencion, no traslado; para RESICO se evalua solo como regla fiscal futura, no se automatiza timbrado. |
| CFDI40-014 | Pago | MetodoPago=PUE | BLOCKER | PUE se usa cuando el pago ocurre en una sola exhibicion; FormaPago debe reflejar el medio real si se conoce. |
| CFDI40-015 | Pago | MetodoPago=PPD | WARNING | PPD indica pago diferido/parcialidades; en captura manual se debe revisar FormaPago y complemento de pago futuro. |
| CFDI40-016 | Pago | FormaPago | BLOCKER | FormaPago debe existir en c_FormaPago y respetar restricciones bancarizadas cuando aplique. |
| CFDI40-017 | Totales | Subtotal/Total | BLOCKER | SubTotal, descuentos, impuestos y Total deben cuadrar aritmeticamente; este bot no calcula ni timbra totales finales. |
| CFDI40-018 | Moneda | TipoCambio | BLOCKER | Si la moneda no es MXN, validar moneda vigente y tipo de cambio antes de captura/timbrado. |
| CFDI40-019 | Catalogos | Vigencia | BLOCKER | Toda clave debe estar vigente para la fecha del comprobante segun fechas de inicio/fin del catalogo maestro. |
| CFDI40-020 | Catalogos | Complemento requerido | BLOCKER | Si c_ClaveProdServ indica complemento obligatorio, no usar esa clave en el MVP sin flujo especifico. |
| CFDI40-021 | RESICO | 626 | BLOCKER | El regimen 626 se considera actividad actual solo si la base activa marca current_activity_ok/resico_626_ok. |
| CFDI40-022 | RESICO | software/apps/web/IA | BLOCKER | Software, apps, IA, web, SaaS y automatizacion digital requieren actividad o bloqueo segun base; no se reclasifican como soporte tecnico. |
| CFDI40-023 | Operacion | venta | BLOCKER | Si el mensaje dice venta, priorizar tipo PRODUCTO en base activa y validar ClaveProdServ/ClaveUnidad del producto. |
| CFDI40-024 | Operacion | servicio | BLOCKER | Revision, diagnostico, mantenimiento y configuracion priorizan SERVICIO; no sugerir producto puro sin evidencia de venta. |
| CFDI40-025 | Operacion | instalacion/cambio | WARNING | Instalacion, cambio, sustitucion o reemplazo se tratan como servicio o mixto; si incluye material, pedir desglose o validar concepto mixto. |
| CFDI40-026 | Seguridad | revision humana | BLOCKER | Todos los resultados del bot son sugerencias para captura manual; requires_human_review debe permanecer verdadero. |
| CFDI40-027 | Limite | no PAC | BLOCKER | La knowledge base no autoriza timbrado, PAC, WhatsApp ni envio fiscal automatico. |

## Decision para el bot

- El bot solo sugiere conceptos y claves desde la base activa.
- Las reglas oficiales se usan para validar consistencia, vigencia y riesgos.
- Cualquier salida sigue requiriendo revision humana antes de capturar en SAT.
