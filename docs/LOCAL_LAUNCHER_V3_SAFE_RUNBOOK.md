# Local Launcher V3 SAFE Runbook

The local operational launcher validated for this phase is:

```text
scripts/local/99_START_ALL_LOCAL_V3_SAFE.bat
```

Those `scripts/local/*_V3_SAFE*` files are local operator scripts and are not
versioned by this phase. They must remain outside commits unless explicitly
requested.

## What V3 SAFE Must Preserve

- Load `.env.local`.
- Load `.env.pac.sandbox.local`.
- Keep `n8n-nodes-base.executeCommand` available.
- Avoid duplicate Telegram runners.
- Keep PostgreSQL access compatible with `--db-exec-mode docker`.
- Keep Telegram Document Channel environment variables available to the Action
  Layer.

## Quick Local Checks

1. Start Docker/PostgreSQL.
2. Start n8n and runner with the V3 SAFE launcher.
3. Confirm n8n activates `workflow/cfdi_telegram_local_ingest.n8n.json`.
4. Confirm there is only one runner process.
5. Run an Action Layer smoke:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.status --db-exec-mode docker --draft-id DRAFT-...
```

## Safety

Do not commit:

- `.env.local`;
- `.env.pac.sandbox.local`;
- runtime files;
- tokens or credentials;
- XML/PDF artifacts;
- CSD/key material.
