# Roadmap SaaS - Product Modes, Approvals and Usage Credits

## Objetivo

Asentar SATBOT como producto SaaS configurable sin agregar complejidad visible
al bot conversacional actual.

## Modos de producto

| Modo | Usuario objetivo | Descripcion | Estado |
| --- | --- | --- | --- |
| `DIRECT_BUSINESS_MODE` | Persona fisica, PyME, negocio propio | El emisor opera sus propios borradores y facturas | Foundation |
| `ACCOUNTING_FIRM_MODE` | Despacho/contador | Un cliente SATBOT administra multiples emisores fiscales | Foundation |

## Actores

| Actor | Significado |
| --- | --- |
| Cliente SATBOT | Quien paga o usa la plataforma |
| Emisor fiscal | RFC que emite CFDI |
| Receptor CFDI | Cliente del emisor fiscal |
| Operador | Persona que usa bot/panel |
| Contador | Operador autorizado, no necesariamente emisor |

## Shared Telegram Bot Access Model

SATBOT usa por default un solo bot Telegram compartido. `telegram_user_id` se
vincula a `user_id` interno; la suscripcion vive en `tenant_id`, no en el canal.
El vencimiento pasa a `READ_ONLY` para consultar historial, renovar, exportar
basico y contactar soporte. Trial Mode queda como roadmap futuro. Bots dedicados
son opcion futura enterprise/white-label.

## Politicas de aprobacion

| Politica | Descripcion | Friccion | Uso sugerido |
| --- | --- | --- | --- |
| `SELF_APPROVAL` | El dueno/emisor aprueba sus propias facturas | Baja | Uso personal o PyME directa |
| `DELEGATED_ACCOUNTANT` | El contador puede crear, aprobar y timbrar | Baja | Despacho con mandato delegado |
| `CLIENT_APPROVAL_REQUIRED` | El emisor debe aprobar cada factura | Media/alta | Clientes que exigen control previo |

Override por factura:

- `SEND_TO_CLIENT_APPROVAL`: enviar un borrador especifico al cliente aunque la
  politica sea delegada.
- `FORCE_DUAL_APPROVAL`: reservado para futuro si se requiere doble aprobacion.

## Approval link futuro

Flujo propuesto:

```text
Contador crea borrador
  -> SATBOT genera snapshot congelada
  -> SATBOT genera link seguro
  -> cliente revisa resumen
  -> aprueba / rechaza / pide correccion
  -> si aprueba, SATBOT timbra automaticamente
```

Reglas:

- El cliente no tiene que entrar al bot.
- El cliente no necesita instalar Telegram.
- El link solo muestra resumen.
- El link no muestra credenciales.
- El link no permite navegar otras facturas.
- El link no descarga XML/PDF.
- El link debe ser temporal.
- El link debe ser revocable.
- El link debe ser de un solo uso para aprobar.
- La aprobacion queda ligada a una snapshot exacta del borrador.

## Regeneracion/reenvio de links

```text
Si el cliente pierde el link, el contador puede reenviar/regenerar desde el borrador.
```

Reglas:

- Si el borrador no cambio: se puede reenviar o regenerar link.
- Si el borrador cambio: el link anterior queda invalido y se crea nueva
  snapshot.
- Si ya fue aprobado: no se regenera para aprobar; solo se consulta evidencia.
- Si fue rechazado: se corrige el borrador y se crea nueva solicitud.
- Si expiro: se puede generar nuevo link si el borrador sigue igual.
- Solo debe existir un approval token activo por `approval_request`.
- Al generar uno nuevo, el anterior se revoca.

## Usage credits

SATBOT no debe depender del termino comercial de un proveedor. El concepto
interno neutral es:

```text
usage_credits
```

Cada timbrado consume 1 credito SATBOT. El proveedor externo puede llamarlo
folio, timbre, invoice credit, API usage u otro modelo.

Movimientos internos:

- `PURCHASE`
- `CONSUME`
- `ADJUST`
- `REFUND`
- `EXPIRE`
- `BONUS`

## Panel web minimo

El panel inicial es principalmente para el dueno/desarrollador SATBOT:

- clientes SaaS;
- despachos;
- emisores activos;
- plan contratado;
- facturas usadas;
- limite mensual;
- estado de pago;
- proveedor conectado;
- errores recientes;
- suspender/activar cuenta.

MRR, churn, margen, ARPU y metricas avanzadas quedan para fase futura.

## Regla anti-complejidad

Toda nueva idea debe evaluarse con:

1. Que problema resuelve.
2. Que problema nuevo crea.
3. Si el usuario lo tiene que ver.
4. Si puede quedar oculto en configuracion.
5. Si puede implementarse despues.

Ejemplo:

```text
Aprobacion por cliente:
Resuelve control.
Crea friccion.
Por eso no es default en despacho; se usa como politica o override por factura.
```

## No-go actual

- No aprobacion por link real.
- No panel web real.
- No WhatsApp real.
- No billing real.
- No suscripciones reales.
- No produccion fiscal real.
- No Facturapi adapter.
- No cambios operativos en Telegram.
