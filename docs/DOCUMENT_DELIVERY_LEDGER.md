# Document Delivery Ledger

Phase 7.17 adds a local sandbox delivery ledger for document delivery attempts.
It is not a production fiscal ledger and does not authorize real PAC production
or real tax operations.

## Table

Migration:

```text
sql/016_document_delivery_ledger.sql
```

Table:

```text
document_delivery_ledger
```

The ledger records:

- draft id, client id, provider and sandbox environment;
- delivery channel: `PROVIDER_EMAIL` or `TELEGRAM_DOCUMENT_CHANNEL`;
- delivery status: `DRY_RUN`, `READY`, `SENT`, `BLOCKED_DUPLICATE`,
  `NEEDS_CONFIG`, `NEEDS_DOCUMENTS`, `NEEDS_RECIPIENT`,
  `BLOCKED_INVALID_DOCUMENTS`, `BLOCKED_PROVIDER_PDF_INVALID`,
  `PROVIDER_ERROR`, `TELEGRAM_ERROR`, `ERROR`;
- redacted recipient evidence only;
- XML/PDF content-valid booleans;
- XML/PDF hashes and sizes;
- safe relative runtime paths when applicable;
- sanitized provider/Telegram evidence.

## Idempotency

The canonical idempotency key is:

```text
document_delivery:<environment>:<draft_id>:<channel>:<destination_hash>:<xml_sha256>:<pdf_sha256>
```

If a previous `SENT` exists for the same key, a new send is blocked by default.
The Action Layer can override this only with `--force` plus explicit
confirmation.

Dry-runs and prepare checks are recorded with unique attempt keys so they do not
block the later real `SENT`.

## Safety

The ledger must never store:

- Telegram bot token;
- full chat id or user id;
- full email address;
- RFC, UUID, UID;
- XML/PDF/ZIP/Excel contents;
- absolute paths;
- CSD or `.env` data;
- PAC credentials.

All document delivery remains sandbox-only in this phase.
