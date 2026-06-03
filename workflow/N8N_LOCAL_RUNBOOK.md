# N8N Local Runbook

Runbook operativo para probar el MVP personal Emberhub en n8n local antes de Telegram real.

## Entorno

- n8n local self-hosted
- URL: `http://localhost:5678`
- Puerto: `5678`
- Catalogo fuente:
  `C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json`

## Arrancar n8n en Windows

Ejecutar en PowerShell:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

Despues abrir:

```text
http://localhost:5678
```

## Importar y probar el workflow manual

1. En n8n, usar `Import from file`.
2. Importar `workflow/cfdi_manual_test.n8n.json`.
3. Confirmar que existan estos nodos:
   - `Manual Trigger`
   - `Set Manual Message`
   - `Run Scoring`
4. En `Set Manual Message`, mantener:
   - `catalogPath`: `C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json`
5. Cambiar solo `message` para probar casos.
6. Ejecutar el workflow manualmente.

## Mensajes base de prueba

Usar estos mensajes en el campo `message`:

```text
revisé cámaras hikvision sin imagen
servicio técnico general
desarrollé una app móvil
venta de fuente de poder para cámara
```

Resultados esperados:

- `revisé cámaras hikvision sin imagen`: `SUGERIR`, `ready_to_copy=true`.
- `servicio técnico general`: `PEDIR_ACLARACION`, `ready_to_copy=false`.
- `desarrollé una app móvil`: `BLOQUEAR` o `AGREGAR_ACTIVIDAD`, `ready_to_copy=false`.
- `venta de fuente de poder para cámara`: `SUGERIR`, concepto `PROD-CCTV-007`.

## Errores conocidos y solucion

### Module 'fs' is disallowed

Causa: n8n no permite built-ins dentro del Code Node si no se autorizan al arrancar.

Solucion:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

### process is not defined

Causa: el Code Node de n8n local no expone `process` como Node.js normal.

Solucion: no usar `process`, `process.cwd`, `process.env`, `__dirname` ni `__filename` dentro del workflow importable. El workflow actual obtiene `catalogPath` desde el input del nodo `Set Manual Message`.

### Module 'C:\...\scripts\scoring.js' is disallowed

Causa: n8n permite built-ins autorizados como `fs` y `path`, pero no permite `require()` de archivos `.js` locales arbitrarios en el Code Node.

Solucion: usar el workflow manual autocontenido. El nodo `Run Scoring` debe contener todo el codigo necesario y solo puede requerir `fs` y `path`.

## Limites de esta fase

- No Telegram real todavia.
- No webhook.
- No WhatsApp.
- No PAC.
- No timbrado CFDI.
- Solo sugerencia para captura manual y revision humana.
