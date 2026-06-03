# Asistente CFDI BOT

Motor offline y workflows n8n locales para sugerir conceptos CFDI desde mensajes cortos. El alcance actual es MVP personal Emberhub: solo ayuda a elegir un concepto para captura manual en SAT.

## Fuente de verdad

El runtime versionado usa:

- `data/concepts.normalized.json`

Ese JSON fue generado desde la base fiscal original y no debe contener conceptos, claves SAT, unidades ni actividades inventadas.

Por seguridad, el Excel fuente `data/base_cfdi_resico_n8n_emberhub_2026.xlsx` no se versiona en Git. Si necesitas regenerar el JSON, coloca el Excel localmente en esa ruta y ejecuta el proceso de normalizacion offline correspondiente, verificando despues los tests.

## Seguridad de repositorio

No se deben subir:

- `.env`
- tokens reales de Telegram
- passwords reales de PostgreSQL
- archivos reales de `runtime/`
- logs
- constancias
- archivos de clientes
- Excel fiscal fuente

Usa `.env.example` solo como plantilla de variables.

## Pruebas del motor

```bash
node scripts/test-scoring.js
node scripts/test-n8n-contract.js
```

## Workflow manual n8n

Workflow importable:

```text
workflow/cfdi_manual_test.n8n.json
```

Arranque local recomendado:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

El Code Node es autocontenido y lee el catalogo desde:

```text
C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json
```

## Telegram polling con PostgreSQL

Workflow importable:

```text
workflow/cfdi_telegram_postgres_polling.n8n.json
```

Version esperada:

```text
CFDI_POSTGRES_POLLING_V1
```

La memoria, historial, drafts y logs viven en PostgreSQL local (`cfdi_bot`). Ver:

- `workflow/POSTGRES_LOCAL_SETUP.md`
- `workflow/POSTGRES_POLLING_RUNBOOK.md`
- `sql/001_init_cfdi_bot.sql`
- `sql/003_clients_amounts_tax.sql`
- `sql/003_seed_clients.example.sql`

## Clientes, Montos e Impuestos

Las fases 4.5 y 4.6 agregan soporte local para:

- Clientes y alias en PostgreSQL.
- Montos detectados desde mensajes.
- Modo IVA `MAS_IVA`, `IVA_INCLUIDO` o pendiente.
- Reglas conservadoras RESICO para borradores.
- Line items de borrador en `cfdi_draft_line_items`.
- Flujo conversacional tipo wizard para crear borradores desde Telegram.

El seed `sql/003_seed_clients.example.sql` contiene solo un cliente ficticio (`CLI-DEMO-RIVERA`). No subas clientes reales al repositorio.

Comandos disponibles en Telegram:

- `/factura`
- `/clientes`
- `/cliente TEXTO`
- `/nuevocliente`
- `/editarcliente CLIENT_ID CAMPO VALOR`
- `/validarcliente CLIENT_ID`

Flujo recomendado:

1. Enviar `/factura`.
2. Completar `Cliente`, `Trabajo`, `Tipo`, `Monto` e `IVA`, o mandar algo rapido como `Privada Rivera, revise camaras por 800 + IVA`.
3. Revisar el preview `BORRADOR CFDI`.
4. Responder `confirmar`, `editar` o `cancelar`.

El workflow no crea el draft `PENDIENTE` final hasta recibir `confirmar`. Si el cliente no existe, ofrece crear cliente basico, continuar sin cliente o cancelar. El alta manual con `/nuevocliente` usa plantilla escrita y deja `validated_by_human=false` hasta ejecutar `/validarcliente CLIENT_ID`.

## Limites fiscales

- No timbra CFDI.
- No usa PAC.
- No captura automaticamente en SAT.
- No envia WhatsApp.
- No expone webhook.
- Toda salida requiere revision humana.
- Todo calculo de impuestos es conservador y debe leerse como: BORRADOR SUJETO A REVISION HUMANA.
