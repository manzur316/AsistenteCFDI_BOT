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

Este modo con Schedule Trigger queda como legacy. Funciona, pero puede sentirse lento porque depende del intervalo del Schedule.

## Telegram local runner recomendado

Modo recomendado para baja latencia:

```text
Telegram getUpdates -> runner/telegram-local-runner.js -> http://127.0.0.1:5678/webhook/cfdi-local-ingest -> n8n local -> PostgreSQL -> Telegram sendMessage
```

Workflow importable:

```text
workflow/cfdi_telegram_local_ingest.n8n.json
```

Runner:

```text
runner/telegram-local-runner.js
```

Plantilla local:

```text
.env.local.example
```

Arranca n8n local:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
$env:N8N_RUNNERS_ENABLED="false"
n8n start
```

Arranca el runner en otra terminal:

```powershell
node runner/telegram-local-runner.js
```

El runner usa `runtime/runner-offset.json` para guardar el offset. Si n8n responde 2xx despues de terminar el ingest, avanza a `update_id + 1`; si n8n falla o supera `N8N_INGEST_TIMEOUT_MS`, no avanza offset. El workflow local valida `X-CFDI-Runner-Secret` contra `runnerSecret` en `Set Config`.

El webhook local responde al runner con JSON 200 tambien en updates duplicados, ignorados o sin accion de Telegram, por ejemplo `{"ok":true,"status":"duplicate"}`. Asi el runner no queda atrapado reintentando un update que n8n ya deduplico o manejo.

No expone n8n a internet: el ingest esperado es solo local:

```text
http://127.0.0.1:5678/webhook/cfdi-local-ingest
```

Deten el runner con `Ctrl+C`.

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

### Politica conversacional 4.7

El bot mantiene una sola factura activa por chat. Si hay un preview abierto, cualquier mensaje normal actualiza ese borrador en lugar de iniciar otro flujo aislado.

Si el cliente parece tener typo, por ejemplo `Privada Riviera` o `Privada Riveira`, el bot no crea cliente automatico. Primero pregunta si quisiste decir `Privada Rivera` y ofrece usar ese cliente, crear uno nuevo, continuar sin cliente o cancelar.

### Politica de clientes 5D

La busqueda de clientes usa coincidencia exacta normalizada, contains, overlap de tokens distintivos y distancia fuzzy. Palabras genericas como `privada`, `residencial`, `cliente`, `sociedad`, `sa` o `ac` no generan match fuerte por si solas.

Ejemplos esperados:

- `Ariatza`, `Areatza` o `Privada Ariatza` sugieren `Privada Areatza`.
- `Rivera` sugiere `Privada Rivera`.
- `Privada ricrsa` no debe sugerir `Privada Rivera` solo por compartir `privada`.

En `NEEDS_CLIENT_DECISION`, escribir otro nombre de cliente vuelve a buscar desde cero y actualiza `client_query`; ya no queda anclado al intento anterior. Responder `?`, `ayuda`, `que hago` o `que necesitas` muestra ayuda contextual del estado.

Durante un preview puedes responder `editar` o `/editar`. En modo edicion acepta plantilla, lineas numeradas o conceptos separados por coma con montos propios como:

```text
1.instalacion de camaras 800 + IVA
2.- venta de camara CCTV 700 + IVA
```

Tambien acepta mensajes rapidos con varias partidas claras:

```text
Ariatza, instalacion de camara CCTV 800 + IVA, servicio de mantenimiento Equipo CCTV 500 + IVA
```

En ese caso el bot conserva las partidas como line items separados. Cada linea se scorea contra `data/concepts.normalized.json`, usa su propia clave SAT/unidad, calcula impuestos por linea y muestra un preview `BORRADOR CFDI MULTILINEA`. No crea `cfdi_drafts` ni `cfdi_draft_line_items` hasta que respondas `confirmar`.

### Guardrails fiscales 5E

La matriz fiscal del MVP esta documentada en:

- `docs/FISCAL_ACTIVITY_GUARDRAILS.md`
- `docs/BUSINESS_SCENARIO_MATRIX.md`

El bot asume emisor RESICO regimen `626` y solo permite familias relacionadas con las actividades actuales: CCTV, control de acceso, barreras, red/comunicacion y computo. Categorias como software, apps, web, SaaS, n8n, IA, marketing, diseno, video, consultoria profesional, comida, construccion general, plomeria, pintura, renta de equipo y electricidad general no ligada al equipo actual se bloquean o piden revision fiscal.

Si un mensaje mezcla material y mano de obra en un solo monto, el bot entra a `NEEDS_MATERIAL_LABOR_DECISION` y pregunta si se separa, si se trata como servicio integral, si es producto con instalacion incluida o si se cancela. Si varias actividades comparten un monto global, entra a `NEEDS_GLOBAL_AMOUNT_DECISION` y pide dividir por linea o tratarlo como servicio integral. En ambos casos no crea draft final hasta que el usuario resuelva la decision y confirme el preview.

Las facturas largas deben soportar al menos 10 partidas. Si hay mas de 10, el preview se compacta y sugiere usar `/ver`; el contexto completo se conserva para confirmar o editar. Todo sigue siendo BORRADOR SUJETO A REVISION HUMANA.

### Expansion controlada de catalogo 5G

La ampliacion de conceptos no modifica `data/concepts.normalized.json` ni el Excel fuente. Primero requiere colocar un catalogo oficial SAT local en:

```text
data/sat_official/
```

Si falta `catCFDI` oficial, los scripts se detienen con:

```text
Falta catálogo oficial SAT. Coloca el archivo oficial catCFDI del SAT en data/sat_official/ y vuelve a ejecutar.
```

Flujo:

```bash
node scripts/import-sat-catalog.js
node scripts/propose-resico-catalog-expansion.js
node scripts/audit-catalog-gaps.js
```

Salidas:

- `data/catalog_expansion/proposed_concepts.resico_626.json`
- `data/catalog_expansion/concepts.normalized.candidate.json`
- `docs/CATALOG_GAPS_REPORT.md`

El candidate queda sin activar hasta revision humana. No se inventan claves SAT; todo concepto sugerible nuevo debe venir con `source=SAT_OFFICIAL`, `clave_prod_serv`, `clave_unidad` y trazabilidad al archivo SAT local. La vista normal del borrador oculta campos internos como familia, tipo, score, keywords y notas de guardrail.

Comandos utiles durante edicion:

- `/editlinea N TEXTO`
- `/quitarlinea N`
- `/ver`
- `/estado`
- `/cancelar`

Si una linea queda ambigua, el estado pasa a `LINE_NEEDS_CLARIFICATION`. Mensajes como `que necesitas`, `trabajo`, `ayuda` o `?` explican exactamente que falta y muestran como reescribir la linea. Mientras existan blockers, `confirmar` no crea `cfdi_drafts`.

## Limites fiscales

- No timbra CFDI.
- No usa PAC.
- No captura automaticamente en SAT.
- No envia WhatsApp.
- No expone webhook a internet.
- Toda salida requiere revision humana.
- Todo calculo de impuestos es conservador y debe leerse como: BORRADOR SUJETO A REVISION HUMANA.
