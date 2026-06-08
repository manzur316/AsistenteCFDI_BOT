# PDF Local Rendered Fallback

## Scope

SATBOT can generate a sandbox-only visual PDF from a validated raw CFDI XML when
Factura.com Sandbox returns a provider PDF that is structurally present but not
usable for delivery.

This is not production stamping, not a PAC replacement, and not a fiscal PDF for
production. It is a local visual representation for sandbox review.

## Rules

- XML must be raw CFDI and pass content validation.
- XML containing `[REDACTED_...]` is rejected with
  `XML_SANITIZED_ARTIFACT_INVALID`.
- Provider PDF is preferred when it validates as visible.
- XObject/Image markers alone do not prove visible PDF content.
- If provider PDF is invalid and XML is valid, SATBOT may generate:
  `pdf_source=LOCAL_RENDERED_FROM_XML`.
- Human file names use `_LOCAL.pdf` when the final PDF is locally rendered.
- Provider Email Delivery stays blocked when provider PDF is invalid because
  Factura.com would send provider-side documents, not SATBOT's local PDF.
- Telegram Document Channel may use a locally rendered PDF only when explicitly
  enabled and documents pass validation.

## Metadata

Provider PDF:

```json
{
  "pdf_source": "PROVIDER",
  "provider_pdf_content_valid": true,
  "pdf_content_valid": true
}
```

Local fallback:

```json
{
  "pdf_source": "LOCAL_RENDERED_FROM_XML",
  "provider_pdf_content_valid": false,
  "provider_pdf_validation_status": "PDF_RENDER_CHECK_REQUIRED",
  "pdf_content_valid": true,
  "human_pdf_path": "runtime/..._LOCAL.pdf"
}
```

## 2026-06-08 Evidence

During phase 7.16L, the real root cause for the Real Bilbao sandbox artifact was
not a permanent provider PDF limitation. The HTTP layer sanitized `rawText`
before artifact extraction. Once raw artifact bytes were preserved through a
non-enumerable buffer, XML validated as raw CFDI and provider PDF validated with
text and graphics markers.

Render-check was requested, but no external renderer (`pdftoppm`, `mutool`,
`magick`, or `gs`) was available in the local environment, so it reported
`render_status=UNAVAILABLE` instead of pretending to render.
