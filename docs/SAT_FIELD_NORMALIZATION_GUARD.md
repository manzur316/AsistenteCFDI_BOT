# SAT Field Normalization Guard

## Purpose

Phase 7.16E-LOCAL adds a local guard that accepts common human descriptions for
SAT catalog fields only when they can be resolved safely to official keys before
payload validation, provider client sync or sandbox stamping.

The rule is:

```text
SATBOT stores and operates with SAT keys. Human text is accepted only when it is
unambiguous. If ambiguous or malformed, the flow must request correction or
human confirmation.
```

This is sandbox/local only. It does not authorize production, real stamping, CSD
usage, real fiscal data or automatic database mutation.

## Protected Fields

The guard covers:

- `c_RegimenFiscal`
- `c_UsoCFDI`
- `c_FormaPago`
- `c_MetodoPago`
- `c_ObjetoImp`
- `c_ClaveUnidad`
- `c_ClaveProdServ` format only; it never guesses a product/service key
- `c_Moneda`
- fiscal ZIP code format

Examples:

- `Personas Morales con Fines no Lucrativos` -> `603`
- `Regimen Simplificado de Confianza` / `RESICO` -> `626`
- `Gastos en general` -> `G03`
- `Adquisicion de mercancias` -> `G01`
- `Transferencia electronica de fondos` -> `03`
- `Pago en una sola exhibicion` -> `PUE`
- `Pago en parcialidades o diferido` -> `PPD`
- `Pieza` -> `H87`
- `Unidad de servicio` -> `E48`

Counterexamples:

- `G1` remains invalid. It is not padded to `G01`.
- `Tarjeta de transferencia` is not invented as a payment form.
- `Servicio` as unit is `NEEDS_CONFIRMATION` unless service context is explicit.

## Sources

The normalizer prefers:

```text
data/sat_official/imported_sat_catalog.normalized.json
```

If a catalog entry is missing locally, it can use the small non-sensitive seed:

```text
data/sat-catalog-normalization-seed.json
```

The seed is only an operational fallback. It does not replace the official SAT
catalog import.

## Code

Central module:

```text
scripts/lib/sat-catalogs/sat-field-normalizer.js
```

Client wrapper:

```text
scripts/lib/clients/client-fiscal-field-normalizer.js
```

Integrated layers:

- `scripts/lib/canonical-draft-builder.js`
- `scripts/lib/sandbox-draft-db-loader.js`
- `scripts/lib/sandbox-draft-stamp-action.js`
- `scripts/lib/factura-com-payload-mapper.js`
- `scripts/lib/factura-com-provider-client-mapper.js`

## Client Diagnosis

Read-only Action Layer diagnostic:

```powershell
node scripts/run-sandbox-action.js sandbox.client.fiscal-normalize.diagnose --db-exec-mode docker --client-id CLI-REAL-BILBAO
```

It returns normalized keys and blockers without exposing full RFC values.

## Real Bilbao Bug Class

If a local client contains:

```text
regimen_fiscal = Personas Morales con Fines no Lucrativos
uso_cfdi_default = Gastos en general
```

the sandbox stamping path now uses:

```text
RegimenFiscalR = 603
UsoCFDI = G03
```

The Action Layer result can include a safe
`client_fiscal_normalization` / `sat_field_normalization_report` block so the
Telegram summary can explain what was normalized.

## Safety

This guard does not:

- mutate `cfdi_clients` automatically;
- update historical snapshots;
- modify `data/concepts.normalized.json`;
- infer `ClaveProdServ` from generic descriptions;
- expose RFC, UID, UUID, credentials, `.env`, CSD or runtime paths;
- call production PAC;
- replace accountant review.

Every fiscal output remains:

```text
Borrador sujeto a revision humana. No sustituye contador.
```
