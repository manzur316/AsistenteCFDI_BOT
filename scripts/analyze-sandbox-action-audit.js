const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const defaultAuditPath = path.join(root, "runtime", "sandbox-action-audit", "actions.jsonl");

const forbiddenPatterns = [
  { name: "telegram_token", pattern: /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/ },
  { name: "facturacom_secret", pattern: /FACTURACOM_|F-Api-Key|F-Secret-Key|F-PLUGIN/i },
  { name: "production_url", pattern: /https:\/\/api\.factura\.com/i },
  { name: "env_reference", pattern: /\.env\b/i },
  { name: "csd_or_private_key", pattern: /\.(?:cer|key|pfx|p12|pem)\b|PRIVATE KEY/i },
  { name: "xml_content", pattern: /<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i },
  { name: "pdf_content", pattern: /%PDF-/i },
  { name: "artifact_file_reference", pattern: /\.(?:xml|pdf|zip|xlsx)\b/i },
  { name: "runtime_path", pattern: /runtime[\\/][A-Za-z0-9_.\\/-]+/i },
  { name: "windows_absolute_path", pattern: /[A-Za-z]:[\\/]/ },
  { name: "uuid_value", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
  { name: "rfc_like_value", pattern: /\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/i },
];

const requiredFields = [
  "schema_version",
  "timestamp",
  "source_kind",
  "action",
  "status",
  "ok",
  "duration_ms",
  "artifacts_count",
  "warnings_count",
  "errors_count",
  "sensitive_findings_count",
];

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = String(item[key] ?? "NULL");
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function parseJsonl(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`JSON invalido en linea ${index + 1}: ${error.message}`);
      }
    });
}

function validateRecord(record, index) {
  const errors = [];
  for (const field of requiredFields) {
    if (!(field in record)) errors.push(`linea ${index + 1}: falta ${field}`);
  }
  if (record.schema_version !== "sandbox_action_audit.v1") errors.push(`linea ${index + 1}: schema_version invalido`);
  for (const forbidden of ["artifacts", "output", "result_path", "latest_path", "xml", "pdf", "zip", "xlsx"]) {
    if (Object.prototype.hasOwnProperty.call(record, forbidden)) errors.push(`linea ${index + 1}: campo prohibido ${forbidden}`);
  }
  const raw = JSON.stringify(record);
  for (const item of forbiddenPatterns) {
    if (item.pattern.test(raw)) errors.push(`linea ${index + 1}: patron sensible ${item.name}`);
  }
  return errors;
}

function analyzeAudit(filePath = defaultAuditPath) {
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      file_path: path.relative(root, filePath).replace(/\\/g, "/"),
      total_records: 0,
      errors: ["AUDIT_FILE_MISSING"],
    };
  }
  let records = [];
  const errors = [];
  try {
    records = parseJsonl(filePath);
  } catch (error) {
    errors.push(error.message);
  }
  records.forEach((record, index) => errors.push(...validateRecord(record, index)));
  return {
    ok: errors.length === 0,
    file_path: path.relative(root, filePath).replace(/\\/g, "/"),
    total_records: records.length,
    by_action: countBy(records, "action"),
    by_status: countBy(records, "status"),
    by_source_kind: countBy(records, "source_kind"),
    latest: records[records.length - 1] || null,
    errors,
  };
}

function printAnalysis(analysis) {
  console.log("Sandbox action audit analysis");
  console.log(`Audit file: ${analysis.file_path}`);
  console.log(`OK: ${analysis.ok}`);
  console.log(`Total records: ${analysis.total_records}`);
  console.log(`By action: ${JSON.stringify(analysis.by_action || {})}`);
  console.log(`By status: ${JSON.stringify(analysis.by_status || {})}`);
  console.log(`By source_kind: ${JSON.stringify(analysis.by_source_kind || {})}`);
  if (analysis.latest) {
    console.log(`Latest action: ${analysis.latest.action}`);
    console.log(`Latest status: ${analysis.latest.status}`);
    console.log(`Latest artifacts_count: ${analysis.latest.artifacts_count}`);
    console.log(`Latest warnings_count: ${analysis.latest.warnings_count}`);
    console.log(`Latest errors_count: ${analysis.latest.errors_count}`);
    console.log(`Latest sensitive_findings_count: ${analysis.latest.sensitive_findings_count}`);
  }
  console.log(`Errors: ${(analysis.errors || []).join(" | ") || "none"}`);
}

if (require.main === module) {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : defaultAuditPath;
  const analysis = analyzeAudit(filePath);
  printAnalysis(analysis);
  if (!analysis.ok) process.exit(1);
}

module.exports = {
  analyzeAudit,
  forbiddenPatterns,
};
