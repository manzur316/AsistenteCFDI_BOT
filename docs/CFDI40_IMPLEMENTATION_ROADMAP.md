# CFDI 4.0 - Roadmap de implementacion

Fuentes oficiales usadas:
- Guia: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/Anexo_20_Guia_de_llenado_CFDI .pdf`
- Catalogo maestro: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls`
- Catalogo activo personal: `data/concepts.normalized.json`

Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.

## Estado actual

- Knowledge base oficial creada desde Anexo 20 y catCFDI maestro.
- Motor de scoring productivo no modificado.
- Workflows n8n no modificados por esta fase.

## Siguientes pasos recomendados

| Fase | Objetivo | Notas |
| --- | --- | --- |
| 5G.4 | Usar knowledge base solo para validacion offline | No cambiar sugerencias hasta tener tests de regresion. |
| 5G.5 | Agregar auditoria de claves activas contra maestro | Solo reportes; no mutar catalogo activo. |
| Futura | Wizard de captura fiscal completa | Receptor, uso CFDI, metodo/forma pago, totales e impuestos. |
| Fuera de alcance MVP | PAC/timbrado/WhatsApp | No implementar sin decision explicita. |
