# Workflow n8n manual de prueba (Fase 3A.1)

Esta carpeta contiene el workflow de validación offline del motor de scoring para probarlo desde n8n de forma manual, antes de integrar Telegram.

## Entorno validado

- n8n local: `2.4.4`
- Puerto usado: `5678`
- Usuario de Windows: `Juandi Gamer`
- Ruta absoluta del catálogo (catálogo fuente):  
  `C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json`

## Arranque de n8n en Windows

Para permitir `fs`/`path` en Code Node (requisito de n8n 2.4.4):

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

## Archivos del workflow

- `cfdi_manual_test.n8n.json`: Workflow importable.
- `code-node-n8n-bundle.js`: helper de ejecución de scoring para pruebas locales.

## Importar workflow

1. Abrir n8n (localhost:5678).
2. Ir a `Import from file` y seleccionar `workflow/cfdi_manual_test.n8n.json`.
3. Verificar nodos:
   - `Manual Trigger`
   - `Set Manual Message`
   - `Run Scoring`
4. Ejecutar manualmente (`Run workflow` o botón de prueba).

> Nota: en este flujo de n8n **no se usa webhook** ni credenciales.

## Configuración de prueba

En el nodo `Set Manual Message`:

- `message`: texto a clasificar.
- `catalogPath`: debe ser un **path absoluto con forward slashes**:
  `C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json`

Si `catalogPath` llega relativo, el nodo debe devolver error explícito.

### Casos sugeridos de prueba

Puedes cambiar solo el campo `message` por:

- `revisé un sistema de control de acceso zkteco que no leía tags`
- `servicio técnico general`
- `desarrollé una app móvil`
- `venta de fuente de poder para cámara`

## Qué devuelve el Code Node

El nodo usa la lógica de `scoring.js` y construye el contrato para n8n:

- `action`
- `ready_to_copy`
- `requires_human_review`
- `message_original`
- `decision_confidence`
- `candidate_confidence`
- `safety_level`
- `concept` (`id`, `concepto_factura`, `clave_prod_serv`, `clave_unidad`, `unidad`, `familia`, `tipo`, `operacion`)
- `top_3`
- `telegram_message`
- `json_debug`

## Reglas importantes

- `catalogPath` debe ser absoluto en n8n 2.4.4.
- No inventar conceptos, claves SAT ni unidades.
- `require(process)` no se usa en el workflow.
- Se usan rutas con slash `/` en JSON de configuración.

## Comportamiento esperado

- Caso claro (ej. cámara/revisión): `action = SUGERIR`, `ready_to_copy = true`
- Caso ambiguo (ej. técnico general): `action = PEDIR_ACLARACION`, `ready_to_copy = false`
- Caso bloqueado (ej. app/móvil, IA, n8n, web): `action = BLOQUEAR` o `AGREGAR_ACTIVIDAD`, `ready_to_copy = false`
- `venta de fuente de poder para cámara` debe sugerir `PROD-CCTV-007` según catálogo normalizado

## Límites

- Sin timbrado CFDI, sin PAC y sin Telegram en esta fase.
- Sólo sugerencias para captura manual.
