const crypto = require("crypto");

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const PLACEHOLDER_RE = /^(?:cfdi\s+)?(?:xml|pdf)|ok|success|descarga\s+exitosa$/i;

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value === null || value === undefined) return Buffer.alloc(0);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value), "utf8");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeTextPreview(buffer, max = 160) {
  return buffer.toString("utf8", 0, Math.min(buffer.length, max)).replace(/\s+/g, " ").trim();
}

function isPlaceholder(buffer) {
  const preview = safeTextPreview(buffer, 256);
  if (!preview) return false;
  if (PLACEHOLDER_RE.test(preview)) return true;
  if (/^\{/.test(preview) && /"status"\s*:\s*"?(success|ok)"?/i.test(preview)) return true;
  return false;
}

function baseResult(kind, buffer, extra = {}) {
  return {
    ok: extra.ok === true,
    kind,
    content_valid: extra.ok === true,
    status: extra.status,
    size_bytes: buffer.length,
    sha256: sha256(buffer),
    errors: extra.errors || [],
    warnings: extra.warnings || [],
    safe_summary: extra.safe_summary || {},
  };
}

function validateSandboxXmlArtifact(bufferOrText, context = {}) {
  const buffer = asBuffer(bufferOrText);
  if (buffer.length === 0) {
    return {
      ...baseResult("XML", buffer, { status: "INVALID_EMPTY", errors: ["XML_EMPTY"] }),
      uuid_present: false,
      cfdi_comprobante_present: false,
      timbre_fiscal_present: false,
    };
  }
  if (isPlaceholder(buffer)) {
    return {
      ...baseResult("XML", buffer, { status: "INVALID_PLACEHOLDER", errors: ["XML_PLACEHOLDER_CONTENT"] }),
      uuid_present: false,
      cfdi_comprobante_present: false,
      timbre_fiscal_present: false,
    };
  }
  const text = buffer.toString("utf8");
  if (!/<\?xml|<[^>]*Comprobante/i.test(text)) {
    return {
      ...baseResult("XML", buffer, { status: "INVALID_XML", errors: ["XML_TEXT_NOT_DETECTED"] }),
      uuid_present: false,
      cfdi_comprobante_present: false,
      timbre_fiscal_present: false,
    };
  }
  const cfdiComprobantePresent = /<cfdi:Comprobante\b|<Comprobante\b/i.test(text) && (/xmlns:cfdi=|xmlns=['"]http:\/\/www\.sat\.gob\.mx\/cfd/i.test(text) || /Version=['"]4\.0['"]/i.test(text));
  const timbreFiscalPresent = /TimbreFiscalDigital/i.test(text);
  const uuidMatch = text.match(UUID_RE);
  const versionWarning = /Version=['"]4\.0['"]/i.test(text) ? [] : ["XML_VERSION_40_NOT_EXPLICIT"];
  if (!cfdiComprobantePresent || !timbreFiscalPresent) {
    return {
      ...baseResult("XML", buffer, {
        status: "CFDI_MARKERS_MISSING",
        errors: [
          !cfdiComprobantePresent && "CFDI_COMPROBANTE_MISSING",
          !timbreFiscalPresent && "TIMBRE_FISCAL_DIGITAL_MISSING",
        ].filter(Boolean),
        warnings: versionWarning,
        safe_summary: {
          file_name_present: Boolean(context.fileName),
          content_type: context.contentType || null,
        },
      }),
      uuid_present: Boolean(uuidMatch),
      cfdi_comprobante_present: cfdiComprobantePresent,
      timbre_fiscal_present: timbreFiscalPresent,
    };
  }
  if (!uuidMatch) {
    return {
      ...baseResult("XML", buffer, {
        status: "UUID_MISSING",
        errors: ["UUID_MISSING"],
        warnings: versionWarning,
      }),
      uuid_present: false,
      cfdi_comprobante_present: true,
      timbre_fiscal_present: true,
    };
  }
  return {
    ...baseResult("XML", buffer, {
      ok: true,
      status: "VALID",
      warnings: versionWarning,
      safe_summary: {
        uuid_present: true,
        expected_identity_present: Boolean(context.expectedIdentity),
      },
    }),
    uuid_present: true,
    cfdi_comprobante_present: true,
    timbre_fiscal_present: true,
  };
}

function validateSandboxPdfArtifact(buffer, context = {}) {
  const body = asBuffer(buffer);
  const minBytes = Number(context.pdfMinBytes || context.PDF_MIN_BYTES || 1024);
  const pdfMagicPresent = body.subarray(0, 8).toString("latin1").startsWith("%PDF");
  const pdfEofPresent = body.toString("latin1").includes("%%EOF");
  if (body.length === 0) {
    return {
      ...baseResult("PDF", body, { status: "INVALID_EMPTY", errors: ["PDF_EMPTY"] }),
      pdf_magic_present: false,
      pdf_eof_present: false,
    };
  }
  if (isPlaceholder(body)) {
    return {
      ...baseResult("PDF", body, { status: "INVALID_PLACEHOLDER", errors: ["PDF_PLACEHOLDER_CONTENT"] }),
      pdf_magic_present: false,
      pdf_eof_present: false,
    };
  }
  if (!pdfMagicPresent) {
    return {
      ...baseResult("PDF", body, { status: "PDF_MAGIC_MISSING", errors: ["PDF_MAGIC_MISSING"] }),
      pdf_magic_present: false,
      pdf_eof_present: pdfEofPresent,
    };
  }
  if (body.length < minBytes) {
    return {
      ...baseResult("PDF", body, { status: "PDF_TOO_SMALL", errors: ["PDF_TOO_SMALL"], safe_summary: { min_bytes: minBytes } }),
      pdf_magic_present: true,
      pdf_eof_present: pdfEofPresent,
    };
  }
  if (!pdfEofPresent) {
    return {
      ...baseResult("PDF", body, { status: "PDF_EOF_MISSING", errors: ["PDF_EOF_MISSING"] }),
      pdf_magic_present: true,
      pdf_eof_present: false,
    };
  }
  return {
    ...baseResult("PDF", body, {
      ok: true,
      status: "VALID",
      safe_summary: {
        min_bytes: minBytes,
      },
    }),
    pdf_magic_present: true,
    pdf_eof_present: true,
  };
}

function validateSandboxArtifactContent({ kind, buffer, contentType, fileName, expectedIdentity, pdfMinBytes } = {}) {
  const artifactKind = String(kind || "").toUpperCase() === "PDF" ? "PDF" : "XML";
  if (artifactKind === "PDF") return validateSandboxPdfArtifact(buffer, { contentType, fileName, expectedIdentity, pdfMinBytes });
  return validateSandboxXmlArtifact(buffer, { contentType, fileName, expectedIdentity });
}

module.exports = {
  validateSandboxArtifactContent,
  validateSandboxPdfArtifact,
  validateSandboxXmlArtifact,
};
