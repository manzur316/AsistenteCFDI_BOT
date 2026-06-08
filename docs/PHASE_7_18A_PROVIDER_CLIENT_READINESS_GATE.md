# Fase 7.18A - Provider Client Readiness Gate

## Objetivo

La fase 7.18A agrega un gate local, read-only y reusable para saber si un
cliente local esta listo para timbrado sandbox live contra Factura.com Sandbox.

No habilita produccion, no llama PAC productivo, no usa CSD, no envia SMTP, no
agrega email2/email3, no modifica workflows n8n y no cambia
`data/concepts.normalized.json`.

## Fuente normal de UID proveedor

La ruta normal para timbrar sandbox live es:

```text
cfdi_clients + provider_client_links.provider_client_uid
```

`FACTURACOM_SANDBOX_RECEIVER_UID` queda degradado a fallback legacy/test. Solo
puede usarse si la accion recibe `--allow-legacy-receiver-uid`; sin esa bandera,
un borrador sin `provider_client_link` se bloquea antes de llamar al proveedor.

## Accion nueva

```powershell
node scripts/run-sandbox-action.js sandbox.provider.client.readiness --db-exec-mode docker --client-id CLI-...
```

La accion lee:

- `cfdi_clients`;
- `provider_client_links`;
- datos fiscales normalizados;
- `validated_by_human`;
- email principal;
- `email_confirmed`;
- `provider_email_sync_status`.

No hace `INSERT`, `UPDATE`, `DELETE`, llamada al proveedor, timbrado ni envio de
documentos.

## Contrato

Modulo:

```text
scripts/lib/provider-client/provider-client-readiness-contract.js
```

Schema:

```text
provider_client_readiness.v1
```

Estados estables:

- `CLIENT_PROVIDER_READY`
- `CLIENT_LOCAL_MISSING`
- `CLIENT_FISCAL_DATA_INCOMPLETE`
- `CLIENT_NOT_VALIDATED_BY_HUMAN`
- `CLIENT_PROVIDER_LINK_MISSING`
- `CLIENT_PROVIDER_LINK_FOUND`
- `CLIENT_PROVIDER_LINK_AMBIGUOUS`
- `CLIENT_PROVIDER_EMAIL_NEEDS_SYNC`
- `CLIENT_PROVIDER_EMAIL_SYNCED`
- `CLIENT_PROVIDER_EMAIL_NOT_CONFIRMED`
- `CLIENT_PROVIDER_SYNC_UNKNOWN`
- `CLIENT_PROVIDER_PRECHECK_BLOCKED`

Campos clave:

- `ready_for_provider_stamp`
- `ready_for_provider_email`
- `recommended_action`
- `blockers`
- `warnings`
- `recommended_buttons`
- `safe_summary`

## Interpretacion

Cliente listo:

```text
ready_for_provider_stamp=true
recommended_action=STAMP_SANDBOX
```

Cliente sin link:

```text
ready_for_provider_stamp=false
recommended_action=SYNC_PROVIDER_CLIENT
blockers=["CLIENT_PROVIDER_LINK_MISSING"]
```

Datos incompletos:

```text
recommended_action=COMPLETE_CLIENT_DATA
blockers=["CLIENT_FISCAL_DATA_INCOMPLETE"]
```

Email pendiente:

```text
ready_for_provider_stamp=true
ready_for_provider_email=false
recommended_action=UPDATE_PROVIDER_EMAIL
warnings=["CLIENT_PROVIDER_EMAIL_NEEDS_SYNC"]
```

## Preflight de timbrado

`sandbox.draft.stamp --require-live-sandbox` ahora valida el estado provider
antes de llamar a Factura.com Sandbox:

- con `provider_client_link` valido: timbra como antes;
- sin link y sin legacy flag: `NEEDS_RUNTIME` +
  `PROVIDER_CLIENT_LINK_MISSING`;
- con `--allow-legacy-receiver-uid`: permite fallback legacy y marca
  `legacy_receiver_uid_used=true` + `LEGACY_RECEIVER_UID_USED`.

## Seguridad

El output no expone:

- RFC completo;
- UID completo;
- email completo;
- tokens;
- credenciales;
- rutas runtime;
- XML/PDF/ZIP/Excel;
- CSD;
- `.env`.

## Cierre

La fase prepara la UX posterior, pero no crea botones ni callbacks nuevos. La
siguiente fase recomendada es:

```text
7.18B Provider Client Sync UX Prepare/Confirm
```
