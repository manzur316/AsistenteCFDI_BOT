# Catalog Expansion Policy

Esta politica controla la ampliacion del catalogo CFDI para el MVP personal Emberhub bajo RESICO 626.

## Fuente Oficial

La unica fuente valida para `c_ClaveProdServ` y `c_ClaveUnidad` es un archivo oficial SAT local colocado en:

```text
data/sat_official/
```

Si falta el archivo, el flujo se bloquea con:

```text
Falta catálogo oficial SAT. Coloca el archivo oficial catCFDI del SAT en data/sat_official/ y vuelve a ejecutar.
```

No se deben proponer claves desde memoria, blogs, ejemplos de internet, catalogos de terceros o inferencias.

## Alcance Fiscal

Regimen emisor:

- 626 Regimen Simplificado de Confianza.

Actividades soportadas:

1. Otras instalaciones y equipamiento en construcciones.
2. Reparacion y mantenimiento de maquinaria y equipo comercial y de servicios.
3. Reparacion y mantenimiento de otro equipo electronico y de equipo de precision.
4. Comercio al por menor de telefonos, otros aparatos de comunicacion, refacciones y accesorios.
5. Comercio al por menor de computadoras y sus accesorios.

Familias permitidas para propuesta:

- CCTV / videovigilancia.
- Control de acceso.
- Barreras vehiculares / equipo comercial.
- Redes / comunicacion.
- Computo fisico.

Categorias fuera de alcance:

- Software, apps, web, SaaS, n8n, IA.
- Marketing, diseno, video.
- Consultoria fiscal, contable o legal.
- Comida.
- Construccion civil general, plomeria, pintura.
- Electricidad general no ligada al equipo permitido.
- Renta de equipo.

## Precision

`precision_level` puede ser:

- `EXACT`: la descripcion SAT y la partida recomendada coinciden estrechamente.
- `BROAD_ALLOWED`: la clave SAT es amplia, pero fiscalmente plausible para la actividad actual; requiere revision humana.
- `GAP_REQUIRES_REVIEW`: no hay clave oficial adecuada o la relacion es demasiado incierta; no es sugerible.

Todo concepto propuesto con `source=SAT_OFFICIAL` debe tener:

- `clave_prod_serv` existente en el catalogo SAT oficial importado.
- `clave_unidad` existente en el catalogo SAT oficial importado.
- `source_catalog_file`.
- `source_catalog_row_or_key`.
- `requiere_revision_humana=true`.

## Reglas Semanticas Criticas

- Si el texto dice camara, no sugerir DVR/NVR salvo que tambien diga DVR/NVR/grabador.
- Si el texto dice DVR/NVR/grabador, no sugerir camara.
- Si el texto dice fuente de poder, no sugerir camara ni DVR/NVR.
- SSD, RAM, laptop y perifericos pertenecen a COMPUTO.
- Router, switch y access point pertenecen a RED.
- Desarrollo de software, apps, web, SaaS, IA y n8n siguen bloqueados.

## Material Y Mano De Obra

Si un solo monto incluye material y mano de obra:

1. Preguntar si se separa material y mano de obra.
2. Permitir tratarlo como servicio integral con advertencia.
3. Permitir tratarlo como producto con instalacion incluida con advertencia.
4. Permitir cancelar.

No se debe decidir automaticamente ni confirmar hasta que el usuario resuelva.

## Vista Publica

El preview normal debe mostrar datos utiles para captura manual:

- Cliente, RFC, regimen receptor, estado cliente y revision humana.
- Por linea: cantidad, descripcion, clave SAT, unidad, precio, subtotal, IVA, retenciones y total neto estimado.
- Resumen: subtotal, IVA trasladado, retenciones y total estimado.

No debe mostrar en la vista normal:

- familia.
- subfamilia.
- tipo interno.
- score.
- keywords.
- action/debug.
- activity support.
- notas internas.
- source row.
- precision internals.

Esos datos quedan para `/debug`, `/detalle_tecnico DRAFT_ID` o `json_debug` interno.
