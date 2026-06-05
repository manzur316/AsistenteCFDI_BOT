const fs = require("fs");
const path = require("path");
const { analyzeAudit, forbiddenPatterns } = require("./analyze-sandbox-action-audit");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, "runtime");
const auditRoot = path.join(runtimeRoot, "sandbox-action-audit");
const defaultAuditPath = path.join(auditRoot, "actions.jsonl");
const defaultSummaryPath = path.join(auditRoot, "summary.json");
const defaultReviewPath = path.join(auditRoot, "review", "audit-review.json");
const defaultOutputDir = path.join(auditRoot, "signoff");

const statuses = ["PASS", "WARN", "FAIL", "MANUAL_REVIEW"];
const csvColumns = ["id", "category", "title", "status", "evidence", "recommendation"];

function ensureRuntimePath(filePath, label = "path") {
  const resolved = path.resolve(filePath);
  const relative = path.relative(runtimeRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} debe vivir bajo runtime/`);
  }
  return resolved;
}

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`JSON_INVALID:${path.basename(filePath)}:${error.message}`);
  }
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function csvEscape(value) {
  const cell = safeString(value);
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function countBy(records, key) {
  const counts = {};
  for (const record of records) {
    const value = String(record[key] ?? "NULL");
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function sumBy(records, key) {
  return records.reduce((sum, record) => sum + Number(record[key] || 0), 0);
}

function item(id, category, title, status, evidence, recommendation) {
  if (!statuses.includes(status)) throw new Error(`STATUS_INVALID:${status}`);
  return { id, category, title, status, evidence, recommendation };
}

function summarizeItems(items) {
  return {
    total_pass: items.filter((entry) => entry.status === "PASS").length,
    total_warn: items.filter((entry) => entry.status === "WARN").length,
    total_fail: items.filter((entry) => entry.status === "FAIL").length,
    total_manual_review: items.filter((entry) => entry.status === "MANUAL_REVIEW").length,
  };
}

function checklistStatus(totals) {
  if (totals.total_fail > 0) return "FAIL";
  if (totals.total_manual_review > 0) return "MANUAL_REVIEW";
  if (totals.total_warn > 0) return "WARN";
  return "PASS";
}

function buildChecklist({ analysis, records, summary, review, parseFailure }) {
  const totalRecords = records.length;
  const sensitiveTotal = sumBy(records, "sensitive_findings_count");
  const warningTotal = sumBy(records, "warnings_count");
  const errorTotal = sumBy(records, "errors_count");
  const byAction = countBy(records, "action");
  const byStatus = countBy(records, "status");
  const summaryRecords = Number(summary?.total_records);
  const reviewRecords = Number(review?.total_actions);
  const analyzerErrors = analysis.errors || [];
  const missingAudit = analyzerErrors.includes("AUDIT_FILE_MISSING");
  const unsafeAuditErrors = analyzerErrors.filter((entry) => /patron sensible|campo prohibido/i.test(entry));

  const items = [];

  items.push(item(
    "AUDIT-001",
    "Integridad del audit",
    "Archivo audit local presente",
    !missingAudit && fs.existsSync(analysis.absolute_audit_path || defaultAuditPath) ? "PASS" : "FAIL",
    missingAudit ? "actions.jsonl no disponible" : "actions.jsonl disponible",
    missingAudit ? "Generar al menos una accion sandbox antes de cerrar 6A." : "Sin accion requerida.",
  ));
  items.push(item(
    "AUDIT-002",
    "Integridad del audit",
    "Analyzer del audit",
    analysis.ok ? "PASS" : "FAIL",
    analysis.ok ? "analyzer OK" : `analyzer reporto ${analyzerErrors.length} hallazgo(s)`,
    analysis.ok ? "Mantener analyzer como gate antes de signoff." : "Corregir hallazgos antes de aprobar.",
  ));
  items.push(item(
    "AUDIT-003",
    "Integridad del audit",
    "Registros parseables",
    parseFailure ? "FAIL" : (totalRecords > 0 ? "PASS" : "WARN"),
    parseFailure ? "JSONL no parseable" : `${totalRecords} registro(s) parseado(s)`,
    parseFailure ? "Corregir el JSONL local antes del signoff." : (totalRecords > 0 ? "Sin accion requerida." : "Ejecutar smoke sandbox local antes del cierre si se requiere evidencia operativa."),
  ));

  items.push(item(
    "SEC-001",
    "Seguridad y datos sensibles",
    "Sensitive findings del audit",
    sensitiveTotal === 0 ? "PASS" : "FAIL",
    `${sensitiveTotal} hallazgo(s) sensible(s) agregado(s)`,
    sensitiveTotal === 0 ? "Sin accion requerida." : "Detener cierre y revisar registros locales.",
  ));
  items.push(item(
    "SEC-002",
    "Seguridad y datos sensibles",
    "Patrones o campos prohibidos",
    unsafeAuditErrors.length === 0 ? "PASS" : "FAIL",
    `${unsafeAuditErrors.length} hallazgo(s) de payload inseguro`,
    unsafeAuditErrors.length === 0 ? "Sin accion requerida." : "Eliminar/rotar evidencia local y corregir origen del dato.",
  ));

  items.push(item(
    "ACT-001",
    "Acciones ejecutadas",
    "Acciones sandbox registradas",
    totalRecords > 0 ? "PASS" : "WARN",
    JSON.stringify(byAction),
    totalRecords > 0 ? "Revisar distribucion de acciones antes de transicionar." : "No hay acciones para revisar.",
  ));
  items.push(item(
    "ACT-002",
    "Acciones ejecutadas",
    "Estados registrados",
    totalRecords > 0 ? "PASS" : "WARN",
    JSON.stringify(byStatus),
    "Confirmar que los estados esperados reflejan solo sandbox local.",
  ));

  items.push(item(
    "ERR-001",
    "Errores y warnings",
    "Errores agregados",
    errorTotal > 0 || (byStatus.ERROR || 0) > 0 ? "WARN" : "PASS",
    `${errorTotal} error(es) agregado(s); status ERROR=${byStatus.ERROR || 0}`,
    errorTotal > 0 || (byStatus.ERROR || 0) > 0 ? "Revisar causa antes de cierre formal." : "Sin accion requerida.",
  ));
  items.push(item(
    "ERR-002",
    "Errores y warnings",
    "Warnings agregados",
    warningTotal > 0 ? "WARN" : "PASS",
    `${warningTotal} warning(s) agregado(s)`,
    warningTotal > 0 ? "Validar si los warnings son esperados del sandbox local." : "Sin accion requerida.",
  ));

  items.push(item(
    "RET-001",
    "Retencion y backup",
    "Resumen de retencion disponible",
    summary ? "PASS" : "FAIL",
    summary ? `summary.json total_records=${Number.isFinite(summaryRecords) ? summaryRecords : "unknown"}` : "summary.json no disponible",
    summary ? "Comparar contra audit activo si hubo nuevas ejecuciones." : "Ejecutar review-sandbox-action-audit antes de signoff.",
  ));
  items.push(item(
    "RET-002",
    "Retencion y backup",
    "Politica dry-run/apply documentada",
    summary?.policy?.delete_requires_apply === true ? "PASS" : "WARN",
    summary?.policy ? "policy presente" : "policy no presente en summary",
    "Confirmar manualmente que cualquier limpieza real mantuvo backup local.",
  ));
  items.push(item(
    "RET-003",
    "Retencion y backup",
    "Conteo summary vs audit activo",
    !summary || !Number.isFinite(summaryRecords) || summaryRecords === totalRecords ? "PASS" : "WARN",
    summary ? `summary=${Number.isFinite(summaryRecords) ? summaryRecords : "unknown"} audit=${totalRecords}` : "summary no disponible",
    "Si hay diferencia, regenerar summary antes de cierre formal.",
  ));

  items.push(item(
    "EXP-001",
    "Export humano",
    "Export humano disponible",
    review ? "PASS" : "FAIL",
    review ? "audit-review.json disponible" : "audit-review.json no disponible",
    review ? "Validar que el humano reviso Markdown/CSV/JSON locales." : "Ejecutar export-sandbox-action-audit-review antes de signoff.",
  ));
  items.push(item(
    "EXP-002",
    "Export humano",
    "Conteo export vs audit activo",
    !review || !Number.isFinite(reviewRecords) || reviewRecords === totalRecords ? "PASS" : "WARN",
    review ? `export=${Number.isFinite(reviewRecords) ? reviewRecords : "unknown"} audit=${totalRecords}` : "export no disponible",
    "Si hay diferencia, regenerar export antes de cierre formal.",
  ));

  items.push(item(
    "PROD-001",
    "Bloqueo produccion/PAC real",
    "Confirmacion de bloqueo productivo",
    "MANUAL_REVIEW",
    "requiere confirmacion humana",
    "Confirmar que no se llamo produccion ni se timbro real.",
  ));
  items.push(item(
    "HUMAN-001",
    "Revision humana pendiente/aprobada",
    "Aprobacion humana final",
    "MANUAL_REVIEW",
    "pendiente hasta ejecutar --mark-reviewed",
    "Ejecutar --mark-reviewed con nota explicita solo despues de revisar los exports locales.",
  ));
  items.push(item(
    "HUMAN-002",
    "Revision humana pendiente/aprobada",
    "Confirmacion de runtime local no compartido",
    "MANUAL_REVIEW",
    "requiere confirmacion humana",
    "Confirmar que runtime y exports locales no se subieron ni compartieron.",
  ));
  items.push(item(
    "HUMAN-003",
    "Revision humana pendiente/aprobada",
    "Confirmacion de datos reales no usados",
    "MANUAL_REVIEW",
    "requiere confirmacion humana",
    "Confirmar que las pruebas sandbox no usaron datos reales de clientes.",
  ));

  return items;
}

function csvFromItems(items) {
  const rows = [csvColumns.join(",")];
  for (const entry of items) {
    rows.push(csvColumns.map((column) => csvEscape(entry[column])).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function markdownFromChecklist(checklist) {
  const rows = checklist.items
    .map((entry) => `| ${entry.id} | ${entry.category} | ${entry.status} | ${entry.title} | ${entry.evidence} | ${entry.recommendation} |`)
    .join("\n");
  return `# Sandbox Audit Signoff Checklist

Estado: ${checklist.checklist_status}

Este checklist es local y sandbox. No representa produccion, no timbra y no
sustituye revision humana.

## Totales

- PASS: ${checklist.total_pass}
- WARN: ${checklist.total_warn}
- FAIL: ${checklist.total_fail}
- MANUAL_REVIEW: ${checklist.total_manual_review}
- Total items: ${checklist.items.length}

## Checklist

| ID | Categoria | Status | Titulo | Evidencia | Recomendacion |
| --- | --- | --- | --- | --- | --- |
${rows}

## Signoff Humano

Ejecutar el modo --mark-reviewed solo despues de revisar el audit, summary y
export local. Si hay algun FAIL, el script rechazara el signoff local.
`;
}

function assertSafeContent(contentsByFile) {
  const extraPatterns = [
    { name: "full_chat_or_user_field", pattern: /\b(chat_id|user_id)\b/i },
    { name: "fiscal_identifier_label", pattern: /\b(RFC|UUID|UID|CSD)\b/i },
  ];
  for (const [fileName, content] of Object.entries(contentsByFile)) {
    for (const item of [...forbiddenPatterns, ...extraPatterns]) {
      if (item.pattern.test(content)) {
        throw new Error(`SIGNOFF_CONTAINS_SENSITIVE_PATTERN:${fileName}:${item.name}`);
      }
    }
  }
}

function parseArgs(argv) {
  const options = {
    auditPath: defaultAuditPath,
    summaryPath: defaultSummaryPath,
    reviewPath: defaultReviewPath,
    outputDir: defaultOutputDir,
    markReviewed: false,
    reviewerNote: "",
    nowMs: Date.now(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--audit-path") options.auditPath = path.resolve(argv[++index]);
    else if (key === "--summary-path") options.summaryPath = path.resolve(argv[++index]);
    else if (key === "--review-path") options.reviewPath = path.resolve(argv[++index]);
    else if (key === "--output-dir") options.outputDir = path.resolve(argv[++index]);
    else if (key === "--mark-reviewed") options.markReviewed = true;
    else if (key === "--reviewer-note") options.reviewerNote = argv[++index] || "";
    else if (key === "--now") options.nowMs = Date.parse(argv[++index]);
  }
  if (!Number.isFinite(options.nowMs)) throw new Error("--now invalido");
  options.auditPath = ensureRuntimePath(options.auditPath, "auditPath");
  options.summaryPath = ensureRuntimePath(options.summaryPath, "summaryPath");
  options.reviewPath = ensureRuntimePath(options.reviewPath, "reviewPath");
  options.outputDir = ensureRuntimePath(options.outputDir, "outputDir");
  return options;
}

function generateSignoffChecklist(inputOptions = {}) {
  const options = {
    auditPath: inputOptions.auditPath || defaultAuditPath,
    summaryPath: inputOptions.summaryPath || defaultSummaryPath,
    reviewPath: inputOptions.reviewPath || defaultReviewPath,
    outputDir: inputOptions.outputDir || defaultOutputDir,
    markReviewed: inputOptions.markReviewed === true,
    reviewerNote: inputOptions.reviewerNote || "",
    nowMs: inputOptions.nowMs || Date.now(),
  };
  options.auditPath = ensureRuntimePath(options.auditPath, "auditPath");
  options.summaryPath = ensureRuntimePath(options.summaryPath, "summaryPath");
  options.reviewPath = ensureRuntimePath(options.reviewPath, "reviewPath");
  options.outputDir = ensureRuntimePath(options.outputDir, "outputDir");

  const analysis = analyzeAudit(options.auditPath);
  analysis.absolute_audit_path = options.auditPath;
  let records = [];
  let parseFailure = null;
  try {
    records = parseJsonl(options.auditPath);
  } catch (error) {
    parseFailure = error;
  }
  const summary = readJsonIfExists(options.summaryPath);
  const review = readJsonIfExists(options.reviewPath);
  const items = buildChecklist({ analysis, records, summary, review, parseFailure });
  const totals = summarizeItems(items);
  const status = checklistStatus(totals);
  const checklist = {
    schema_version: "sandbox_audit_signoff_checklist.v1",
    generated_at: new Date(options.nowMs).toISOString(),
    sandbox_only: true,
    production_disabled: true,
    checklist_status: status,
    source_files: {
      audit: "actions.jsonl",
      summary: summary ? "summary.json" : null,
      review: review ? "audit-review.json" : null,
    },
    output_files: [
      "SANDBOX_AUDIT_SIGNOFF_CHECKLIST.md",
      "sandbox-audit-signoff-checklist.json",
      "sandbox-audit-signoff-checklist.csv",
    ],
    ...totals,
    items,
  };

  const json = `${JSON.stringify(checklist, null, 2)}\n`;
  const csv = csvFromItems(items);
  const markdown = markdownFromChecklist(checklist);
  assertSafeContent({
    "SANDBOX_AUDIT_SIGNOFF_CHECKLIST.md": markdown,
    "sandbox-audit-signoff-checklist.csv": csv,
    "sandbox-audit-signoff-checklist.json": json,
  });

  const files = {
    markdown: path.join(options.outputDir, "SANDBOX_AUDIT_SIGNOFF_CHECKLIST.md"),
    json: path.join(options.outputDir, "sandbox-audit-signoff-checklist.json"),
    csv: path.join(options.outputDir, "sandbox-audit-signoff-checklist.csv"),
  };
  writeText(files.markdown, markdown);
  writeText(files.csv, csv);
  writeText(files.json, json);

  let reviewedFile = null;
  if (options.markReviewed) {
    if (!options.reviewerNote.trim()) throw new Error("REVIEWER_NOTE_REQUIRED");
    assertSafeContent({ "reviewer_note": options.reviewerNote });
    if (totals.total_fail > 0) throw new Error("SIGNOFF_HAS_FAIL_ITEMS_REQUIRES_FIX");
    const reviewed = {
      schema_version: "sandbox_audit_human_reviewed.local.v1",
      timestamp: new Date(options.nowMs).toISOString(),
      reviewer_note: options.reviewerNote.trim(),
      checklist_status: status,
      total_pass: totals.total_pass,
      total_warn: totals.total_warn,
      total_fail: totals.total_fail,
      total_manual_review: totals.total_manual_review,
    };
    assertSafeContent({ "HUMAN_REVIEWED.local.json": JSON.stringify(reviewed) });
    reviewedFile = path.join(options.outputDir, "HUMAN_REVIEWED.local.json");
    writeJson(reviewedFile, reviewed);
  }

  return {
    ok: true,
    checklist_status: status,
    output_dir: "signoff",
    files: {
      markdown: "SANDBOX_AUDIT_SIGNOFF_CHECKLIST.md",
      json: "sandbox-audit-signoff-checklist.json",
      csv: "sandbox-audit-signoff-checklist.csv",
      reviewed: reviewedFile ? "HUMAN_REVIEWED.local.json" : null,
    },
    ...totals,
    checklist,
  };
}

function printResult(result) {
  console.log("Sandbox audit signoff checklist");
  console.log(`OK: ${result.ok}`);
  console.log(`Status: ${result.checklist_status}`);
  console.log(`Output: ${result.output_dir}`);
  console.log(`Files: ${["markdown", "json", "csv"].map((key) => result.files[key]).join(", ")}`);
  console.log(`PASS: ${result.total_pass}`);
  console.log(`WARN: ${result.total_warn}`);
  console.log(`FAIL: ${result.total_fail}`);
  console.log(`MANUAL_REVIEW: ${result.total_manual_review}`);
  if (result.files.reviewed) console.log(`Reviewed file: ${result.files.reviewed}`);
}

if (require.main === module) {
  try {
    const result = generateSignoffChecklist(parseArgs(process.argv.slice(2)));
    printResult(result);
  } catch (error) {
    console.error(`SANDBOX_AUDIT_SIGNOFF_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildChecklist,
  csvColumns,
  generateSignoffChecklist,
  parseArgs,
  summarizeItems,
};
