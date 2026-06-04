# Mapa de relacion de catalogos SAT para el bot CFDI

Este mapa separa catalogos de scoring de concepto contra catalogos utiles para validacion CFDI/timbrado futuro.

## Catalogos principales

- `c_ClaveProdServ`: define el producto o servicio facturado. Es el catalogo critico para proponer conceptos nuevos.
- `c_ClaveUnidad`: define unidad de medida. Para este MVP se usan principalmente `E48` para servicios y `H87` para productos.
- `c_ObjetoImp`: define si el concepto es objeto de impuesto. El bot normalmente trabaja con `02` cuando hay IVA trasladado.
- `c_Impuesto`: define IVA, ISR e IEPS.
- `c_TipoFactor`: define tasa, cuota o exento.
- `c_TasaOCuota`: define tasas aplicables para impuestos.
- `c_RegimenFiscal`: valida regimen del receptor/emisor, incluido 626 RESICO.
- `c_UsoCFDI`: valida el uso fiscal del receptor.
- `c_MetodoPago` y `c_FormaPago`: utiles para pago y timbrado futuro; no clasifican conceptos.
- `c_TipoDeComprobante`: util para CFDI futuro, normalmente ingreso en este MVP.

## Catalogos geograficos

CP, colonia, estado, municipio, localidad y pais son utiles para validacion fiscal/timbrado. No deben afectar el scoring de concepto.

## Relacion con RESICO 626

Las actividades permitidas para este proyecto cubren instalacion/equipamiento, mantenimiento/reparacion de equipo comercial/electronico, comercio de telefonos/comunicacion y computadoras/accesorios. Software, SaaS, web, IA, marketing digital, PAC, timbrado y WhatsApp quedan fuera del MVP.

## Estado de importacion local

| catalogo | importadas | uso |
| --- | --- | --- |
| c_ClaveProdServ | 0 | scoring/propuesta de conceptos |
| c_ClaveUnidad | 2418 | unidad SAT |
| c_ObjetoImp | 4 | impuestos por concepto |
| c_Impuesto | 3 | IVA/ISR/IEPS |
| c_RegimenFiscal | 19 | validacion fiscal |
| c_UsoCFDI | 24 | uso receptor |
| c_TasaOCuota | 3 | tasas |
| c_MetodoPago | 2 | pago futuro |
| c_FormaPago | 22 | pago futuro |
| c_TipoDeComprobante | 5 | CFDI futuro |
| c_TipoFactor | 3 | impuestos |
