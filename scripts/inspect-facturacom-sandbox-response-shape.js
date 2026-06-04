const fs = require("fs");
const path = require("path");
const { safeApiMessagePreview } = require("./lib/factura-com-live-client");
const { validateRfcShape } = require("./lib/cfdi-receptor-compatibility-validator");

const root = path.resolve(__dirname, "..");
const DEFAULT_RUNTIME_DIR = path.join(root, "runtime", "facturacom-sandbox");
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const RFC_PATTERN = /\b[A-Z&\u00d1]{3,4}\d{6}[A-Z0-9]{3}\b/i;

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target) {
  const resolved = path.resolve(target || DEFAULT_RUNTIME_DIR);
  const runtimeRoot = path.join(root, "runtime");
  if (!isInside(runtimeRoot, resolved)) {
    throw new Error(`runtime fuera de runtime/: ${resolved}`);
  }
  return resolved;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveArtifactPath(runtimeDir, artifact = {}) {
  const rawPath = text(artifact.path);
  if (!rawPath) return null;
  const resolved = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(root, rawPath);
  if (!isInside(runtimeDir, resolved)) return null;
  return resolved;
}

function classifyString(value, pathLabel = "") {
  const markers = [];
  const cleaned = String(value || "");
  if (UUID_PATTERN.test(cleaned)) markers.push("uuid-like");
  if (RFC_PATTERN.test(cleaned)) markers.push("rfc-like", "REDACTED_RFC_VALUE");
  if (/^[A-Za-z0-9_-]{8,90}$/.test(cleaned) && !UUID_PATTERN.test(cleaned) && !RFC_PATTERN.test(cleaned)) {
    markers.push("uid-like");
  }
  if (/(^|\.)(uid|uid_receptor|client_uid|cliente_uid|customer_uid)$/i.test(pathLabel) || /(^|\.)(cliente|client|customer|receptor)\.(uid|UID)$/i.test(pathLabel)) {
    markers.push("client_uid_candidate");
  }
  if (/request\.body\.Receptor\.UID$/i.test(pathLabel) || /(^|\.)Receptor\.UID$/i.test(pathLabel)) {
    markers.push("FORBIDDEN_CLIENT_UID_SOURCE");
  }
  if (/api[-_ ]?key|secret|plugin|token|authorization|password|f-api-key|f-secret-key|f-plugin/i.test(pathLabel)) {
    markers.push("SECRET_FIELD_REDACTED");
  }
  return markers;
}

function isRedactedRfcValue(value) {
  return /\[REDACTED_RFC(?:_VALUE)?\]/i.test(String(value || ""));
}

function allowsSafePreview(pathLabel = "") {
  const normalized = String(pathLabel || "").replace(/\.\d+\./g, ".").toLowerCase();
  const lastKey = normalized.split(".").filter(Boolean).pop();
  const safeCatalogKeys = new Set([
    "usocfdi",
    "regimenfiscalr",
    "regimenid",
    "regimenfiscal",
    "serie",
    "formapago",
    "metodopago",
    "moneda",
    "lugarexpedicion",
    "tipodocumento",
    "claveunidad",
    "claveprodserv",
    "objetoimp",
    "impuesto",
    "tipofactor",
    "tasaocuota",
  ]);
  if (safeCatalogKeys.has(lastKey)) return true;
  return /(^|\.)(response|status|message|mensaje|error|errors|api_message_summary)$/.test(normalized)
    || /(^|\.)data\.(response|status|message|mensaje|error|errors)$/.test(normalized)
    || /(^|\.)api_error_fields\.(response|status|message|mensaje|error|errors)$/.test(normalized);
}

function safePreview(value) {
  return safeApiMessagePreview(value, {}, 160);
}

function describeValue(value, pathLabel = "") {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (typeof value === "string") {
    const markers = classifyString(value, pathLabel);
    if (/(^|\.)rfc$/i.test(pathLabel) || /(^|\.)(RFC|Rfc)$/.test(pathLabel)) {
      if (isRedactedRfcValue(value)) {
        markers.push(
          "rfc_shape=REDACTED_NOT_EVALUATED",
          "normalized_rfc_length=REDACTED",
          "rfc_hidden=unknown",
        );
      } else {
        const validation = validateRfcShape(value);
        markers.push(
          `rfc_shape=${validation.rfc_shape}`,
          `normalized_rfc_length=${validation.normalized_rfc_length}`,
          `rfc_hidden=${validation.has_hidden_characters ? "true" : "false"}`,
        );
      }
    }
    const preview = allowsSafePreview(pathLabel) ? safePreview(value) : null;
    const previewText = preview ? `, preview="${preview.replace(/"/g, "'")}"` : "";
    const suffix = markers.length ? `(len=${value.length}${previewText}, ${markers.join(", ")})` : `(len=${value.length}${previewText})`;
    return `string${suffix}`;
  }
  if (typeof value === "number") return allowsSafePreview(pathLabel) ? `number(value=${value})` : "number";
  if (typeof value === "boolean") return allowsSafePreview(pathLabel) ? `boolean(value=${value})` : "boolean";
  if (typeof value === "object") return `object(keys=${Object.keys(value).length})`;
  return typeof value;
}

function collectShapeLines(value, prefix = "", options = {}) {
  const lines = [];
  const maxDepth = options.maxDepth ?? 10;
  const seen = new Set();

  function visit(current, pathParts = [], depth = 0) {
    if (depth > maxDepth) {
      lines.push(`- ${pathParts.join(".") || prefix || "root"}: depth_limit`);
      return;
    }
    const label = [prefix, ...pathParts].filter(Boolean).join(".");
    if (current && typeof current === "object") {
      if (seen.has(current)) {
        lines.push(`- ${label || "root"}: circular`);
        return;
      }
      seen.add(current);
    }
    lines.push(`- ${label || "root"}: ${describeValue(current, label)}`);
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.slice(0, 5).forEach((item, index) => visit(item, [...pathParts, String(index)], depth + 1));
      if (current.length > 5) lines.push(`- ${[prefix, ...pathParts, "..."].filter(Boolean).join(".")}: truncated(${current.length - 5})`);
      return;
    }
    for (const key of Object.keys(current).sort()) {
      visit(current[key], [...pathParts, key], depth + 1);
    }
  }

  visit(value);
  return lines;
}

function inspectXmlText(content, prefix = "xml") {
  const markers = [];
  if (UUID_PATTERN.test(content)) markers.push("uuid-like");
  if (/<[^>]+>/.test(content)) markers.push("xml-like");
  return [`- ${prefix}: string(${markers.join(", ") || "text"}, len=${content.length})`];
}

function inspectArtifact(runtimeDir, artifact = {}) {
  const artifactPath = resolveArtifactPath(runtimeDir, artifact);
  const title = `${artifact.type || "UNKNOWN"} ${artifact.draft_id || ""}`.trim();
  const endpointType = endpointTypeForArtifact(artifact);
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    return [`${title} paths:`, `- endpoint_type: ${endpointType}`, "- artifact: missing_or_outside_runtime"];
  }
  const raw = fs.readFileSync(artifactPath, "utf8");
  const lines = [`${title} paths:`, `- endpoint_type: ${endpointType}`];
  if (/XML/i.test(String(artifact.type || "")) || artifactPath.toLowerCase().endsWith(".xml")) {
    lines.push(...inspectXmlText(raw, "xml"));
    return lines;
  }
  if (/PDF/i.test(String(artifact.type || "")) || artifactPath.toLowerCase().endsWith(".pdf")) {
    lines.push(`- pdf: binary_or_text(len=${raw.length})`);
    return lines;
  }
  try {
    const parsed = JSON.parse(raw);
    lines.push(...collectShapeLines(parsed));
  } catch (_error) {
    lines.push(`- rawText: string(len=${raw.length})`);
  }
  return lines;
}

function endpointTypeForArtifact(artifact = {}) {
  const type = String(artifact.type || "");
  if (type.startsWith("CLIENT_CREATE")) return "client_create";
  if (type.startsWith("CLIENT_LOOKUP")) return "client_lookup";
  if (type.startsWith("PREFLIGHT_AUTH")) return "auth_preflight";
  if (type.startsWith("CFDI_CREATE")) return "cfdi_create";
  if (type.startsWith("CFDI_LOOKUP")) return "cfdi_lookup";
  if (type.startsWith("CFDI_XML")) return "cfdi_xml";
  return "unknown";
}

function inspectRuntime(runtimeArg = DEFAULT_RUNTIME_DIR) {
  const runtimeDir = assertRuntimePath(runtimeArg);
  const manifestPath = path.join(runtimeDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`No existe manifest: ${manifestPath}`);
  const manifest = readJson(manifestPath);
  const summaryPath = path.join(runtimeDir, "summary.json");
  const summary = fs.existsSync(summaryPath) ? readJson(summaryPath) : {};
  const allowedTypes = new Set([
    "CLIENT_CREATE_REQUEST",
    "CLIENT_CREATE_RESPONSE",
    "CLIENT_LOOKUP_RESPONSE",
    "PREFLIGHT_AUTH_RESPONSE",
    "CFDI_CREATE_REQUEST",
    "CFDI_LOCAL_RULE_ERROR",
    "CFDI_CREATE_RESPONSE",
    "CFDI_LOOKUP_RESPONSE",
    "CFDI_XML",
  ]);
  const artifacts = (manifest.artifacts || []).filter((artifact) => allowedTypes.has(String(artifact.type || "")));
  const output = [
    "Factura.com sandbox response shape inspection",
    `Runtime: ${path.relative(root, runtimeDir).replace(/\\/g, "/")}`,
    `Artifacts inspected: ${artifacts.length}`,
    `Active sandbox emitter profile: ${summary.active_sandbox_emitter_profile_id || manifest.active_sandbox_emitter_profile_id || "none"}`,
    `Effective emitter RegimenFiscal: ${summary.effective_emitter_regimen || manifest.effective_emitter_regimen || "none"}`,
    `Effective LugarExpedicion: ${summary.effective_lugar_expedicion || manifest.effective_lugar_expedicion || "none"}`,
    `Emitter RFC shape: ${summary.emitter_rfc_shape || manifest.emitter_rfc_shape || "none"}`,
    `Emitter profile status: ${summary.emitter_profile_status || manifest.emitter_profile_status || "none"}`,
  ];
  for (const artifact of artifacts) {
    output.push("", ...inspectArtifact(runtimeDir, artifact));
  }
  return output.join("\n");
}

if (require.main === module) {
  try {
    console.log(inspectRuntime(process.argv[2] || DEFAULT_RUNTIME_DIR));
  } catch (error) {
    console.error(`FACTURACOM_RESPONSE_SHAPE_INSPECT_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  collectShapeLines,
  describeValue,
  inspectRuntime,
  endpointTypeForArtifact,
};
