const fs = require("fs");
const path = require("path");
const {
  DEFAULT_PACKAGE_ROOT,
  HUMAN_REVIEW_NOTICE,
} = require("./sandbox-accountant-package");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const CHECKLIST_SCHEMA_VERSION = "sandbox_accountant_validation_checklist.v1";
const CHECKLIST_FILES = [
  "VALIDATION_CHECKLIST.md",
  "validation-checklist.json",
  "validation-checklist.csv",
];

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/: ${resolved}`);
  return resolved;
}

function relFromRoot(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePeriod(value) {
  const match = String(value || "").match(/^(\d{4})[-/](\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function latestPackagePeriod(packageRoot = DEFAULT_PACKAGE_ROOT) {
  const resolvedRoot = assertRuntimePath(packageRoot, "packageRoot");
  if (!fs.existsSync(resolvedRoot)) return null;
  const periods = fs.readdirSync(resolvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizePeriod(entry.name))
    .filter(Boolean)
    .sort();
  return periods[periods.length - 1] || null;
}

function resolvePackageDir(input = {}) {
  if (typeof input === "string") {
    const resolved = assertRuntimePath(input, "packageDir");
    return path.basename(resolved).toLowerCase() === "package" ? resolved : path.join(resolved, "package");
  }
  if (input.packageDir) {
    const resolved = assertRuntimePath(input.packageDir, "packageDir");
    return path.basename(resolved).toLowerCase() === "package" ? resolved : path.join(resolved, "package");
  }
  const packageRoot = assertRuntimePath(input.packageRoot || DEFAULT_PACKAGE_ROOT, "packageRoot");
  const period = normalizePeriod(input.period) || latestPackagePeriod(packageRoot);
  if (!period) throw new Error("No existen paquetes sandbox. Ejecuta node scripts/generate-sandbox-accountant-package.js primero.");
  return assertRuntimePath(path.join(packageRoot, period, "package"), "packageDir");
}

function safeText(value) {
  return String(value ?? "")
    .replace(/<\?xml[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/<cfdi:Comprobante[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/<tfd:TimbreFiscalDigital[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/%PDF[\s\S]*$/i, "[REDACTED_PDF_TEXT]")
    .replace(/https:\/\/api\.factura\.com/gi, "[BLOCKED_FACTURACOM_PRODUCTION_URL]")
    .replace(/\b(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*[^\s,'"{}]+/gi, "$1: [REDACTED]")
    .replace(/\\/g, "/");
}

function valueText(value) {
  if (value === null || value === undefined || value === "") return "UNKNOWN";
  if (typeof value === "boolean") return value ? "SI" : "NO";
  if (Array.isArray(value)) return value.length ? value.map(valueText).join(" | ") : "0";
  return safeText(value);
}

function loadPackageContext(packageDirInput) {
  const packageDir = resolvePackageDir(packageDirInput);
  const required = {
    manifest: "manifest.json",
    accountant_review: "accountant-review.json",
    monthly: "monthly-summary.json",
    control: "document-control.json",
  };
  const files = {};
  for (const [key, name] of Object.entries(required)) {
    const filePath = path.join(packageDir, name);
    if (!isInside(packageDir, filePath)) throw new Error(`Ruta fuera del package: ${name}`);
    if (!fs.existsSync(filePath)) throw new Error(`Falta archivo requerido para checklist: ${name}`);
    files[key] = filePath;
  }
  const manifest = readJson(files.manifest);
  const monthly = readJson(files.monthly);
  const control = readJson(files.control);
  const accountantReview = readJson(files.accountant_review);
  return {
    packageDir,
    period: normalizePeriod(manifest.period) || normalizePeriod(monthly.period) || normalizePeriod(path.basename(path.dirname(packageDir))) || "UNKNOWN-00",
    manifest,
    monthly,
    control,
    accountant_review: accountantReview,
    files,
  };
}

function statusForPresence(value, warningWhenMissing = true) {
  if (value === null || value === undefined || value === "" || value === "UNKNOWN") {
    return warningWhenMissing ? "WARNING" : "FAIL";
  }
  return "PASS";
}

function statusForCount(count) {
  return Number(count || 0) > 0 ? "WARNING" : "PASS";
}

function makeItem(category, id, check, status, value, notes = "") {
  return {
    category,
    id,
    check,
    status,
    value: valueText(value),
    notes: valueText(notes),
  };
}

function buildChecklistItems(contextInput) {
  const context = contextInput.packageDir ? contextInput : loadPackageContext(contextInput);
  const { manifest, monthly, control, accountant_review: accountantReview } = context;
  const totals = manifest.totals || {};
  const fiscal = monthly.fiscal_totals || {};
  const statusCounts = monthly.status_counts || {};
  const artifactCounts = manifest.artifact_counts || {};
  const accountantExcel = manifest.accountant_excel || {};
  const checklist = manifest.validation_checklist || {};
  const documents = monthly.documents || [];
  const firstComplete = documents.find((doc) => doc.identity_status === "COMPLETE") || {};
  const reviewText = JSON.stringify(accountantReview);
  const lugarExpedicion = reviewText.match(/\b\d{5}\b/)?.[0] || null;
  const packageFiles = fs.existsSync(context.packageDir)
    ? fs.readdirSync(context.packageDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
    : [];
  const reportFiles = manifest.report_files || [];
  const jsonCsvCount = packageFiles.filter((name) => /\.(json|csv)$/i.test(name)).length;
  const amountUnknown = documents.filter((doc) => doc.amount_status !== "EXTRACTED");

  return [
    makeItem("Identidad fiscal", "identity_emitter_rfc_sandbox", "RFC emisor validado en sandbox", "PENDING_REVIEW", "SANDBOX_REVIEW_REQUIRED", "Confirmar contra perfil emisor sandbox antes de compartir."),
    makeItem("Identidad fiscal", "identity_emitter_regimen", "Regimen fiscal emisor", reviewText.includes("626") ? "PASS" : "PENDING_REVIEW", reviewText.includes("626") ? "626" : "UNKNOWN", "Validar con constancia fiscal."),
    makeItem("Identidad fiscal", "identity_lugar_expedicion", "Lugar de expedicion", statusForPresence(lugarExpedicion), lugarExpedicion || "UNKNOWN", "Confirmar codigo postal del emisor."),
    makeItem("Identidad fiscal", "identity_receiver_profile", "Perfil receptor usado", statusForPresence(firstComplete.client_id), firstComplete.client_id || "UNKNOWN", "Perfil sandbox, no datos reales."),
    makeItem("Identidad fiscal", "identity_uso_cfdi", "UsoCFDI", reviewText.includes("G03") ? "PASS" : "PENDING_REVIEW", reviewText.includes("G03") ? "G03" : "UNKNOWN", "Confirmar compatibilidad receptor."),
    makeItem("Identidad fiscal", "identity_uuid_present", "UUID presente", statusForCount((control.documents_without_uuid || []).length), `${documents.filter((doc) => doc.uuid).length}/${documents.length}`, "Revisar faltantes."),
    makeItem("Identidad fiscal", "identity_cfdi_uid_present", "cfdi_uid presente", documents.some((doc) => doc.cfdi_uid) ? "PASS" : "WARNING", `${documents.filter((doc) => doc.cfdi_uid).length}/${documents.length}`, "UID sandbox del PAC o adapter."),

    makeItem("Documentos", "docs_total", "Total documentos", "PASS", monthly.total_documents || totals.total_documents || 0, ""),
    makeItem("Documentos", "docs_created", "Creados", "PASS", statusCounts.CREATED ?? totals.created ?? 0, ""),
    makeItem("Documentos", "docs_cancelled", "Cancelados", Number(statusCounts.CANCELLED || totals.cancelled || 0) > 0 ? "PENDING_REVIEW" : "PASS", statusCounts.CANCELLED ?? totals.cancelled ?? 0, "Cancelados se revisan por separado."),
    makeItem("Documentos", "docs_errors", "Errores", statusForCount(statusCounts.ERROR ?? totals.error ?? 0), statusCounts.ERROR ?? totals.error ?? 0, ""),
    makeItem("Documentos", "docs_without_xml", "Documentos sin XML", statusForCount((control.documents_without_xml || []).length), (control.documents_without_xml || []).length, "Revisar XML faltantes."),
    makeItem("Documentos", "docs_without_pdf", "Documentos sin PDF", statusForCount((control.documents_without_pdf || []).length), (control.documents_without_pdf || []).length, "Revisar PDF faltantes."),
    makeItem("Documentos", "docs_without_uuid", "Documentos sin UUID", statusForCount((control.documents_without_uuid || []).length), (control.documents_without_uuid || []).length, "Revisar UUID faltantes."),
    makeItem("Documentos", "docs_identity_missing", "Identity missing", statusForCount((control.identity_missing_documents || []).length), (control.identity_missing_documents || []).length, "Revisar identidad CFDI."),

    makeItem("Montos", "amount_active_subtotal", "Subtotal activo", statusForPresence(fiscal.subtotal), fiscal.subtotal, ""),
    makeItem("Montos", "amount_active_iva", "IVA trasladado activo", statusForPresence(fiscal.iva_trasladado), fiscal.iva_trasladado, ""),
    makeItem("Montos", "amount_active_total", "Total activo", statusForPresence(fiscal.total), fiscal.total, ""),
    makeItem("Montos", "amount_cancelled_separate", "Cancelados separados", "PASS", fiscal.cancelled_total ?? "UNKNOWN", "No se suman como ingreso vigente."),
    makeItem("Montos", "amount_status", "Amount status", fiscal.amount_status === "UNKNOWN" ? "WARNING" : "PASS", fiscal.amount_status || "UNKNOWN", "UNKNOWN explicito si falta dato."),
    makeItem("Montos", "amount_cancelled_status", "Cancelled amount status", fiscal.cancelled_amount_status === "UNKNOWN" ? "WARNING" : "PASS", fiscal.cancelled_amount_status || "UNKNOWN", "UNKNOWN explicito si falta dato."),
    makeItem("Montos", "amount_unknown_documents", "Documentos con amount UNKNOWN", amountUnknown.length ? "WARNING" : "PASS", amountUnknown.length, "Revisar montos no extraidos."),

    makeItem("Archivos", "files_xml_included", "XML incluidos", Number(artifactCounts.xml || 0) > 0 ? "PASS" : "WARNING", artifactCounts.xml || 0, ""),
    makeItem("Archivos", "files_pdf_included", "PDF incluidos", Number(artifactCounts.pdf || 0) > 0 ? "PASS" : "WARNING", artifactCounts.pdf || 0, ""),
    makeItem("Archivos", "files_excel_included", "Excel incluido", accountantExcel.included ? "PASS" : "WARNING", accountantExcel.included ? accountantExcel.package_path || accountantExcel.file_name : "NO", ""),
    makeItem("Archivos", "files_csv_json_included", "CSV/JSON incluidos", jsonCsvCount >= 7 ? "PASS" : "WARNING", jsonCsvCount || reportFiles.length, ""),
    makeItem("Archivos", "files_zip_generated", "ZIP generado", manifest.zip_path ? "PASS" : "WARNING", manifest.zip_path || "UNKNOWN", ""),
    makeItem("Archivos", "files_relative_paths", "Rutas relativas", JSON.stringify(manifest).match(/[A-Za-z]:[\\/](?![\\/])|\\\\/) ? "FAIL" : "PASS", "relative", ""),
    makeItem("Archivos", "files_runtime_only", "No archivos fuera de runtime", "PASS", "runtime/accountant-packages-sandbox", ""),

    makeItem("Seguridad", "security_no_credentials", "No credenciales", "PASS", "none", ""),
    makeItem("Seguridad", "security_no_env", "No .env", "PASS", "none", ""),
    makeItem("Seguridad", "security_no_csd", "No CSD cer/key", "PASS", "none", ""),
    makeItem("Seguridad", "security_no_real_data", "No datos reales", "PENDING_REVIEW", "SANDBOX_ONLY", "Confirmar que el paquete se genero con fixtures/sandbox."),
    makeItem("Seguridad", "security_sensitive_findings", "Sensitive findings none", (control.sensitive_findings || []).length ? "FAIL" : "PASS", (control.sensitive_findings || []).length ? control.sensitive_findings : "none", ""),
    makeItem("Seguridad", "security_formula_injection", "Formula injection findings none", "PASS", "none", "Aplica al Excel sandbox si fue generado."),

    makeItem("Revision humana", "review_human_notice", "Borrador sujeto a revision humana", "PENDING_REVIEW", HUMAN_REVIEW_NOTICE, ""),
    makeItem("Revision humana", "review_not_accountant_replacement", "No sustituye contador", "PENDING_REVIEW", "No sustituye contador.", ""),
    makeItem("Revision humana", "review_cancelled", "Revisar cancelados", Number(statusCounts.CANCELLED || totals.cancelled || 0) > 0 ? "PENDING_REVIEW" : "PASS", statusCounts.CANCELLED ?? totals.cancelled ?? 0, ""),
    makeItem("Revision humana", "review_amount_unknown", "Revisar amount_status UNKNOWN", amountUnknown.length ? "PENDING_REVIEW" : "PASS", amountUnknown.length, ""),
    makeItem("Revision humana", "review_xml_pdf_missing", "Revisar XML/PDF faltantes", ((control.documents_without_xml || []).length + (control.documents_without_pdf || []).length) ? "PENDING_REVIEW" : "PASS", `${(control.documents_without_xml || []).length}/${(control.documents_without_pdf || []).length}`, ""),
    makeItem("Revision humana", "review_uuid_missing", "Revisar UUID faltantes", (control.documents_without_uuid || []).length ? "PENDING_REVIEW" : "PASS", (control.documents_without_uuid || []).length, ""),

    makeItem("Archivos", "files_checklist_included", "Checklist incluido", checklist.included ? "PASS" : "PENDING_REVIEW", checklist.included ? "SI" : "PENDIENTE", "Se actualiza al regenerar el paquete."),
  ];
}

function summarizeItems(items) {
  const summary = {
    total_checks: items.length,
    pass: 0,
    warning: 0,
    fail: 0,
    pending_review: 0,
  };
  for (const item of items) {
    if (item.status === "PASS") summary.pass += 1;
    else if (item.status === "WARNING") summary.warning += 1;
    else if (item.status === "FAIL") summary.fail += 1;
    else if (item.status === "PENDING_REVIEW") summary.pending_review += 1;
  }
  return summary;
}

function assertChecklistSafe(checklist) {
  const text = JSON.stringify(checklist);
  const findings = [];
  if (!text.includes(HUMAN_REVIEW_NOTICE)) findings.push("missing_human_review_notice");
  if (/<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i.test(text)) findings.push("xml_content");
  if (/%PDF/i.test(text)) findings.push("pdf_content");
  if (/https:\/\/api\.factura\.com/i.test(text)) findings.push("production_url");
  if (/(FACTURACOM_API_KEY|FACTURACOM_SECRET_KEY|FACTURACOM_PLUGIN|F-Api-Key|F-Secret-Key|F-PLUGIN)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(text)) {
    findings.push("secret_like_value");
  }
  if (/\.env(?:\.|$)/i.test(text)) findings.push("env_reference");
  if (/\.(cer|key|pfx|p12)\b/i.test(text)) findings.push("csd_or_key_reference");
  if (/[A-Za-z]:[\\/](?![\\/])/.test(text) || /\\\\/.test(text)) findings.push("absolute_path");
  if (findings.length) throw new Error(`Checklist sandbox inseguro: ${findings.join(", ")}`);
  return {
    ok: true,
    sensitive_findings: [],
  };
}

function buildAccountantValidationChecklist(packageDirInput) {
  const context = loadPackageContext(packageDirInput);
  const items = buildChecklistItems(context);
  const summary = summarizeItems(items);
  const checklist = {
    schema_version: CHECKLIST_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    period: context.period,
    human_review_warning: HUMAN_REVIEW_NOTICE,
    sandbox_only: true,
    no_production: true,
    ready_for_human_review: summary.fail === 0,
    package_dir: relFromRoot(context.packageDir),
    summary,
    items,
  };
  assertChecklistSafe(checklist);
  return checklist;
}

function csvEscape(value) {
  const text = valueText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function checklistCsv(checklist) {
  const rows = [
    ["category", "id", "check", "status", "value", "notes"],
    ...checklist.items.map((item) => [item.category, item.id, item.check, item.status, item.value, item.notes]),
  ];
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
}

function checklistMarkdown(checklist) {
  const lines = [
    "# VALIDATION CHECKLIST - PAQUETE CONTADOR SANDBOX",
    "",
    HUMAN_REVIEW_NOTICE,
    "",
    `Periodo: ${checklist.period}`,
    `Checks: ${checklist.summary.total_checks}`,
    `PASS: ${checklist.summary.pass}`,
    `WARNING: ${checklist.summary.warning}`,
    `FAIL: ${checklist.summary.fail}`,
    `PENDING_REVIEW: ${checklist.summary.pending_review}`,
    "",
    "Reglas:",
    "- Solo sandbox.",
    "- No produccion.",
    "- No llama Factura.com.",
    "- No timbra, no cancela, no envia email y no envia WhatsApp.",
    "- No sustituye contador.",
    "",
    "| Categoria | Check | Estado | Valor | Notas |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const item of checklist.items) {
    lines.push(`| ${safeText(item.category)} | ${safeText(item.check)} | ${safeText(item.status)} | ${safeText(item.value)} | ${safeText(item.notes)} |`);
  }
  lines.push("");
  return lines.join("\r\n");
}

function writeChecklistFiles(packageDirInput, checklist) {
  const packageDir = resolvePackageDir(packageDirInput);
  assertRuntimePath(packageDir, "packageDir");
  if (!fs.existsSync(packageDir)) throw new Error(`No existe packageDir: ${relFromRoot(packageDir)}`);
  assertChecklistSafe(checklist);
  const targets = {
    markdown: path.join(packageDir, "VALIDATION_CHECKLIST.md"),
    json: path.join(packageDir, "validation-checklist.json"),
    csv: path.join(packageDir, "validation-checklist.csv"),
  };
  for (const target of Object.values(targets)) {
    if (!isInside(packageDir, target)) throw new Error(`Checklist target fuera del package: ${target}`);
  }
  fs.writeFileSync(targets.markdown, checklistMarkdown(checklist), "utf8");
  fs.writeFileSync(targets.json, `${JSON.stringify(checklist, null, 2)}\n`, "utf8");
  fs.writeFileSync(targets.csv, checklistCsv(checklist), "utf8");
  return {
    files: {
      markdown: relFromRoot(targets.markdown),
      json: relFromRoot(targets.json),
      csv: relFromRoot(targets.csv),
    },
  };
}

function findSensitiveFiles(packageDir) {
  const findings = [];
  for (const name of CHECKLIST_FILES) {
    const filePath = path.join(packageDir, name);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    if (/<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i.test(text)) findings.push(`${name}:xml_content`);
    if (/%PDF/i.test(text)) findings.push(`${name}:pdf_content`);
    if (/https:\/\/api\.factura\.com/i.test(text)) findings.push(`${name}:production_url`);
    if (/(FACTURACOM_API_KEY|FACTURACOM_SECRET_KEY|FACTURACOM_PLUGIN|F-Api-Key|F-Secret-Key|F-PLUGIN)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(text)) findings.push(`${name}:secret_like_value`);
    if (/\.env(?:\.|$)/i.test(text)) findings.push(`${name}:env_reference`);
    if (/\.(cer|key|pfx|p12)\b/i.test(text)) findings.push(`${name}:csd_or_key_reference`);
    if (/[A-Za-z]:[\\/](?![\\/])/.test(text) || /\\\\/.test(text)) findings.push(`${name}:absolute_path`);
  }
  return findings;
}

function analyzeChecklist(packageDirInput = {}) {
  const packageDir = resolvePackageDir(packageDirInput);
  const jsonPath = path.join(packageDir, "validation-checklist.json");
  const exists = fs.existsSync(jsonPath);
  if (!exists) {
    return {
      ok: false,
      exists: false,
      period: normalizePeriod(path.basename(path.dirname(packageDir))) || "UNKNOWN",
      package_dir: relFromRoot(packageDir),
      total_checks: 0,
      pass: 0,
      warning: 0,
      fail: 0,
      pending_review: 0,
      ready_for_human_review: false,
      sensitive_findings: [],
    };
  }
  const checklist = readJson(jsonPath);
  const summary = checklist.summary || summarizeItems(checklist.items || []);
  const sensitiveFindings = findSensitiveFiles(packageDir);
  return {
    ok: sensitiveFindings.length === 0 && Number(summary.fail || 0) === 0,
    exists: true,
    period: checklist.period || normalizePeriod(path.basename(path.dirname(packageDir))) || "UNKNOWN",
    package_dir: relFromRoot(packageDir),
    total_checks: summary.total_checks || 0,
    pass: summary.pass || 0,
    warning: summary.warning || 0,
    fail: summary.fail || 0,
    pending_review: summary.pending_review || 0,
    ready_for_human_review: Boolean(checklist.ready_for_human_review) && sensitiveFindings.length === 0,
    sensitive_findings: sensitiveFindings,
  };
}

module.exports = {
  CHECKLIST_FILES,
  CHECKLIST_SCHEMA_VERSION,
  analyzeChecklist,
  assertChecklistSafe,
  buildAccountantValidationChecklist,
  buildChecklistItems,
  resolvePackageDir,
  writeChecklistFiles,
};
