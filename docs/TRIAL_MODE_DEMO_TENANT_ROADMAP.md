# Trial Mode / Demo Tenant Roadmap

## Objetivo

Trial Mode servira para demos privadas y controladas sin abrir produccion fiscal
real.

## Propuesta futura

- Duracion inicial: 3 dias.
- Limite: 5 facturas de prueba.
- Activacion por invitacion.
- Un trial por identidad de canal.
- Storage separado.
- Marca visual obligatoria: `MODO PRUEBA`.
- CFDI sin validez fiscal real.

## Proveedores de prueba

- Factura.com Sandbox puede usarse para demos internas/controladas.
- Facturapi Test es candidato preferente para SaaS formal futuro.

## Limites anti-abuso

- Un trial por `channel_user_id`.
- Limite bajo de facturas.
- Expiracion automatica.
- No CSD real.
- No produccion.
- No timbrado fiscal real.
- No XML/PDF productivo.

## Estado

Roadmap. No implementado operativo en Fase 7.16F.
