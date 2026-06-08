const crypto = require("crypto");
const zlib = require("zlib");

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
  const rawText = body.toString("latin1");
  const pdfMagicPresent = body.subarray(0, 8).toString("latin1").startsWith("%PDF");
  const pdfEofPresent = rawText.includes("%%EOF");
  const visual = inspectPdfVisualContent(body);
  const basePdfFlags = {
    pdf_magic_present: pdfMagicPresent,
    pdf_eof_present: pdfEofPresent,
    pdf_page_count_estimate: visual.page_count_estimate,
    pdf_content_streams_present: visual.content_streams_present,
    pdf_visual_content_present: visual.visual_content_present,
    pdf_text_present: visual.text_present,
    pdf_graphics_present: visual.graphics_present,
    pdf_image_xobject_present: visual.image_xobject_present,
  };
  if (body.length === 0) {
    return {
      ...baseResult("PDF", body, { status: "INVALID_EMPTY", errors: ["PDF_EMPTY"] }),
      ...basePdfFlags,
    };
  }
  if (isPlaceholder(body)) {
    return {
      ...baseResult("PDF", body, { status: "INVALID_PLACEHOLDER", errors: ["PDF_PLACEHOLDER_CONTENT"] }),
      ...basePdfFlags,
    };
  }
  if (!pdfMagicPresent) {
    return {
      ...baseResult("PDF", body, { status: "PDF_MAGIC_MISSING", errors: ["PDF_MAGIC_MISSING"] }),
      ...basePdfFlags,
    };
  }
  if (body.length < minBytes) {
    return {
      ...baseResult("PDF", body, { status: "PDF_TOO_SMALL", errors: ["PDF_TOO_SMALL"], safe_summary: { min_bytes: minBytes } }),
      ...basePdfFlags,
    };
  }
  if (!pdfEofPresent) {
    return {
      ...baseResult("PDF", body, { status: "PDF_EOF_MISSING", errors: ["PDF_EOF_MISSING"] }),
      ...basePdfFlags,
    };
  }
  if (visual.page_count_estimate < 1) {
    return {
      ...baseResult("PDF", body, { status: "PDF_PAGE_TREE_MISSING", errors: ["PDF_PAGE_TREE_MISSING"] }),
      ...basePdfFlags,
    };
  }
  if (!visual.content_streams_present) {
    return {
      ...baseResult("PDF", body, { status: "PDF_CONTENT_STREAMS_MISSING", errors: ["PDF_CONTENT_STREAMS_MISSING"] }),
      ...basePdfFlags,
    };
  }
  if (visual.visual_content_present !== true) {
    const status = visual.visual_content_uncertain ? "PDF_VISUAL_CONTENT_UNCERTAIN" : "PDF_VISUAL_CONTENT_MISSING";
    return {
      ...baseResult("PDF", body, {
        status,
        errors: [status],
        warnings: visual.warnings,
      }),
      ...basePdfFlags,
    };
  }
  return {
    ...baseResult("PDF", body, {
      ok: true,
      status: "VALID",
      warnings: visual.warnings,
      safe_summary: {
        min_bytes: minBytes,
        page_count_estimate: visual.page_count_estimate,
      },
    }),
    ...basePdfFlags,
  };
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function inspectVisualMarkers(text) {
  const normalized = String(text || "");
  const textPresent = /\bBT\b[\s\S]{0,2000}\bET\b|\bTj\b|\bTJ\b|'\s*\)|"\s*\)|\bTf\b/.test(normalized);
  const graphicsPresent = /(?:^|\s)(?:m|l|c|v|y|h|re|S|s|f|F|B|b|n|cm)(?:\s|$)/.test(normalized);
  const imageXobjectPresent = /\/XObject\b|\/Subtype\s*\/Image\b|(?:^|\s)Do(?:\s|$)/.test(normalized);
  return {
    textPresent,
    graphicsPresent,
    imageXobjectPresent,
    visualPresent: textPresent || graphicsPresent || imageXobjectPresent,
  };
}

function cleanPdfStreamBytes(buffer) {
  let start = 0;
  let end = buffer.length;
  if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
  else if (buffer[start] === 0x0a || buffer[start] === 0x0d) start += 1;
  if (buffer[end - 2] === 0x0d && buffer[end - 1] === 0x0a) end -= 2;
  else if (buffer[end - 1] === 0x0a || buffer[end - 1] === 0x0d) end -= 1;
  return buffer.subarray(start, Math.max(start, end));
}

function hasFlateDecode(dictionary) {
  return /\/Filter\s*(?:\[[^\]]*)?\/FlateDecode\b/i.test(String(dictionary || ""))
    || /\/FlateDecode\b/i.test(String(dictionary || ""));
}

function tryDecodeFlate(buffer) {
  const attempts = [
    ["inflateSync", () => zlib.inflateSync(buffer)],
    ["inflateRawSync", () => zlib.inflateRawSync(buffer)],
  ];
  const errors = [];
  for (const [method, fn] of attempts) {
    try {
      return { ok: true, method, buffer: fn(buffer), errors };
    } catch (error) {
      errors.push(`${method}:${error.code || error.message}`);
    }
  }
  return { ok: false, method: null, buffer: Buffer.alloc(0), errors };
}

function decodePdfStreams(buffer) {
  const raw = buffer.toString("latin1");
  const streams = [];
  const streamRegex = /(<<[\s\S]{0,4000}?>>)\s*stream([\s\S]*?)endstream/g;
  let match = streamRegex.exec(raw);
  while (match) {
    const dictionary = match[1] || "";
    const rawBodyBuffer = cleanPdfStreamBytes(Buffer.from(match[2] || "", "latin1"));
    const compressed = hasFlateDecode(dictionary);
    const dictionaryMarkers = inspectVisualMarkers(dictionary);
    let decoded = rawBodyBuffer.toString("latin1");
    let decodedOk = !compressed;
    let decodedMethod = compressed ? null : "identity";
    let decodeErrors = [];
    if (compressed) {
      const decodedAttempt = tryDecodeFlate(rawBodyBuffer);
      decodedOk = decodedAttempt.ok;
      decodedMethod = decodedAttempt.method;
      decodeErrors = decodedAttempt.errors;
      if (decodedAttempt.ok) {
        decoded = decodedAttempt.buffer.toString("latin1");
      } else {
        decoded = "";
      }
    }
    const bodyMarkers = inspectVisualMarkers(decodedOk ? decoded : rawBodyBuffer.toString("latin1"));
    streams.push({
      dictionary,
      compressed,
      raw_size_bytes: rawBodyBuffer.length,
      decoded_size_bytes: decodedOk ? Buffer.byteLength(decoded, "latin1") : 0,
      decoded_empty: decodedOk && decoded.trim().length === 0,
      decoded,
      decodedOk,
      decodedMethod,
      decodeErrors,
      markers: {
        textPresent: bodyMarkers.textPresent || dictionaryMarkers.textPresent,
        graphicsPresent: bodyMarkers.graphicsPresent || dictionaryMarkers.graphicsPresent,
        imageXobjectPresent: bodyMarkers.imageXobjectPresent || dictionaryMarkers.imageXobjectPresent,
        visualPresent: bodyMarkers.visualPresent || dictionaryMarkers.visualPresent,
      },
    });
    match = streamRegex.exec(raw);
  }
  return streams;
}

function inspectPdfVisualContent(buffer) {
  const raw = buffer.toString("latin1");
  const pageCount = Math.max(countMatches(raw, /\/Type\s*\/Page\b/g), countMatches(raw, /\/Page\b/g) - countMatches(raw, /\/Pages\b/g));
  const hasPages = /\/Type\s*\/Pages\b|\/Pages\b/.test(raw);
  const streams = decodePdfStreams(buffer);
  const contentStreamsPresent = streams.length > 0 || /\/Contents\b|\/XObject\b|\/Subtype\s*\/Image\b/i.test(raw);
  const streamMarkers = streams.reduce((acc, stream) => ({
    textPresent: acc.textPresent || stream.markers.textPresent,
    graphicsPresent: acc.graphicsPresent || stream.markers.graphicsPresent,
    imageXobjectPresent: acc.imageXobjectPresent || stream.markers.imageXobjectPresent,
    visualPresent: acc.visualPresent || stream.markers.visualPresent,
  }), { textPresent: false, graphicsPresent: false, imageXobjectPresent: false, visualPresent: false });
  const failedCompressedVisualStreams = streams.filter((stream) => stream.compressed && !stream.decodedOk && /\/Length\b/.test(stream.dictionary));
  const emptyDecodedStreams = streams.filter((stream) => stream.decodedOk && stream.decoded_empty);
  const warnings = [];
  if (failedCompressedVisualStreams.length) warnings.push("PDF_FLATE_STREAM_UNREADABLE");
  if (emptyDecodedStreams.length && streams.length === emptyDecodedStreams.length) warnings.push("PDF_CONTENT_STREAMS_EMPTY");
  const textPresent = streamMarkers.textPresent;
  const graphicsPresent = streamMarkers.graphicsPresent;
  const imageXobjectPresent = streamMarkers.imageXobjectPresent;
  const visualContentPresent = textPresent || graphicsPresent || imageXobjectPresent;
  const visualUncertain = !visualContentPresent && failedCompressedVisualStreams.length > 0 && contentStreamsPresent;
  return {
    page_count_estimate: pageCount || (hasPages ? 1 : 0),
    content_streams_present: contentStreamsPresent,
    visual_content_present: visualContentPresent,
    visual_content_uncertain: visualUncertain,
    text_present: textPresent,
    graphics_present: graphicsPresent,
    image_xobject_present: imageXobjectPresent,
    stream_count: streams.length,
    flate_stream_count: streams.filter((stream) => stream.compressed).length,
    flate_decode_error_count: failedCompressedVisualStreams.length,
    empty_decoded_stream_count: emptyDecodedStreams.length,
    warnings,
  };
}

function validateSandboxArtifactContent({ kind, buffer, contentType, fileName, expectedIdentity, pdfMinBytes } = {}) {
  const artifactKind = String(kind || "").toUpperCase() === "PDF" ? "PDF" : "XML";
  if (artifactKind === "PDF") return validateSandboxPdfArtifact(buffer, { contentType, fileName, expectedIdentity, pdfMinBytes });
  return validateSandboxXmlArtifact(buffer, { contentType, fileName, expectedIdentity });
}

module.exports = {
  inspectPdfVisualContent,
  validateSandboxArtifactContent,
  validateSandboxPdfArtifact,
  validateSandboxXmlArtifact,
};
