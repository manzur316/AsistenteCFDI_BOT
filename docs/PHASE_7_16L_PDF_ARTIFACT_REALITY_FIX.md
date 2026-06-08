# Phase 7.16L PDF Artifact Reality Fix

## Scope

Phase 7.16L hardens sandbox document artifacts so SATBOT does not confuse
sanitized diagnostics or structural PDF markers with usable customer documents.

No production PAC, CSD, SMTP primary flow, automatic delivery, runtime
versioning, catalog mutation, or real customer send is enabled.

## Root Cause

The artifact downloader was consuming `rawText` after HTTP normalization had
already redacted sensitive values. That made the saved XML contain
`[REDACTED_...]` markers and could also distort PDF validation. The fix keeps
raw artifact bytes in a non-enumerable buffer for the downloader while keeping
logs, manifests, action outputs, and diagnostics sanitized.

## Changes

- XML final validation rejects `[REDACTED_...]` markers with
  `XML_SANITIZED_ARTIFACT_INVALID`.
- XObject/Image markers no longer imply visible PDF content.
- `--render-check --debug-render` reports real render fields when a renderer is
  available and `UNAVAILABLE` when it is not.
- `sandbox.draft.download-artifacts` can generate a local sandbox PDF from raw
  validated XML when provider PDF is not usable.
- `pdf_source` differentiates `PROVIDER` from `LOCAL_RENDERED_FROM_XML`.
- Provider Email Delivery blocks local fallback PDFs by default with
  `PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID`.
- Telegram Document Channel may use a local rendered PDF only when explicitly
  configured.

## Local E2E Evidence

Validated locally on 2026-06-08 with draft:

```text
DRAFT-20260608-143125-173694510
```

Final sandbox download result:

```json
{
  "artifact_status": "DOWNLOADED",
  "xml_content_valid": true,
  "xml_validation_status": "VALID",
  "pdf_source": "PROVIDER",
  "provider_pdf_content_valid": true,
  "pdf_content_valid": true,
  "pdf_visual_content_present": true,
  "pdf_text_present": true,
  "pdf_graphics_present": true
}
```

The final XML alias had zero `[REDACTED_]` markers. The final PDF alias existed
under runtime and passed local validation as `VALID`.

Render-check was requested. No external renderer was installed locally, so the
diagnostic reported:

```json
{
  "render_check_requested": true,
  "render_check_available": false,
  "render_status": "UNAVAILABLE"
}
```

Because the raw provider PDF now contains text and graphics evidence, the
operational closure path is case A: provider PDF usable after raw artifact
integrity was fixed.

## References

```text
docs/PDF_VISUAL_CONTENT_VALIDATION.md
docs/PDF_LOCAL_RENDERED_FALLBACK.md
docs/SANDBOX_XML_PDF_CONTENT_VALIDATION.md
docs/DOCUMENT_DELIVERY_CANONICAL_CONTRACT.md
```
