"use strict";

const ACCOUNTANT_PACKAGE_PRODUCT_VIEW_VERSION = "ACCOUNTANT_PACKAGE_PRODUCT_VIEW_V1";
const ACTION = "sandbox.full.monthly.package";

const SENSITIVE_PATTERNS = [
  /\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  /[A-Za-z]:[\\/][^\s]+/g,
  /\bruntime[\\/][A-Za-z0-9_.\\/-]+/gi,
  /\b(?:token|secret|password|api[_-]?key|csd|\.env)\b/gi,
  /<\?xml[\s\S]*$/i,
  /%PDF[\s\S]*$/i,
];

function safeText(value, fallback = "N/A") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return SENSITIVE_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), raw)
    .replace(/\r?\n/g, " ")
    .trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function findStep(result = {}, action) {
  const steps = safeArray(result.output?.steps);
  return steps.find((step) => step && step.action === action) || null;
}

function detectPeriod(result = {}) {
  const candidates = [
    result.period,
    result.output?.period,
    result.output?.summary?.period,
    result.output?.latest?.period,
    ...safeArray(result.output?.steps).flatMap((step) => [
      step?.period,
      step?.output?.period,
      step?.output?.summary?.period,
      step?.output?.manifest?.period,
    ]),
  ];
  const match = candidates.map((item) => String(item || "").trim()).find((item) => /^\d{4}-\d{2}$/.test(item));
  return match || "N/A";
}

function stepOk(step) {
  return Boolean(step && (step.status === "OK" || step.ok === true || step.output?.ok === true));
}

function buildAccountantPackageProductSummary(result = {}) {
  const warnings = safeArray(result.warnings).map((item) => safeText(item)).filter(Boolean);
  const errors = safeArray(result.errors).map((item) => safeText(item)).filter(Boolean);
  const sensitiveFindings = safeArray(result.sensitive_findings);
  const packageStep = findStep(result, "sandbox.package.generate");
  const excelStep = findStep(result, "sandbox.excel.generate");
  const checklistStep = findStep(result, "sandbox.checklist.generate");

  return {
    version: ACCOUNTANT_PACKAGE_PRODUCT_VIEW_VERSION,
    action: safeText(result.action || ACTION),
    status: safeText(result.status || (result.ok === true ? "OK" : "ERROR")),
    ok: result.ok === true,
    period: detectPeriod(result),
    duration_ms: Number.isFinite(Number(result.duration_ms)) ? Number(result.duration_ms) : null,
    artifacts_count: safeArray(result.artifacts).length,
    warnings_count: warnings.length,
    errors_count: errors.length,
    sensitive_findings_count: sensitiveFindings.length,
    package_generated: stepOk(packageStep),
    excel_generated: stepOk(excelStep),
    checklist_generated: stepOk(checklistStep),
    warnings: warnings.slice(0, 5),
    errors: errors.slice(0, 5),
  };
}

function boolText(value) {
  return value ? "si" : "no";
}

function renderAccountantPackageProductMessage(summary = {}) {
  const status = safeText(summary.status || "ERROR");
  const lines = [
    status === "OK" ? "Paquete contador sandbox generado" : "Paquete contador sandbox no generado",
    "",
    `Periodo: ${safeText(summary.period)}`,
    `Status: ${status}`,
    `Action Layer: ${ACTION}`,
    `Artifacts locales: ${Number(summary.artifacts_count || 0)}`,
    `Package generado: ${boolText(summary.package_generated)}`,
    `Excel generado: ${boolText(summary.excel_generated)}`,
    `Checklist generado: ${boolText(summary.checklist_generated)}`,
    `Warnings: ${Number(summary.warnings_count || 0)}`,
    `Errors: ${Number(summary.errors_count || 0)}`,
    `Sensitive findings: ${Number(summary.sensitive_findings_count || 0)}`,
  ];

  if (safeArray(summary.warnings).length) {
    lines.push("", "Warnings resumidos:", ...summary.warnings.map((item) => `- ${safeText(item)}`));
  }
  if (safeArray(summary.errors).length) {
    lines.push("", "Errors resumidos:", ...summary.errors.map((item) => `- ${safeText(item)}`));
  }

  lines.push(
    "",
    "Paquete sandbox local. No es declaracion fiscal.",
    "No se envian archivos por Telegram. Revisa runtime local solo desde la maquina autorizada.",
    "Borrador sujeto a revision humana. No sustituye contador.",
  );
  return lines.join("\n");
}

function buildAccountantPackageProductKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Ver resumen mensual", callback_data: "cfdi_nav:report" }],
      [{ text: "Menu principal", callback_data: "cfdi_nav:menu" }],
    ],
  };
}

module.exports = {
  ACCOUNTANT_PACKAGE_PRODUCT_VIEW_VERSION,
  buildAccountantPackageProductKeyboard,
  buildAccountantPackageProductSummary,
  renderAccountantPackageProductMessage,
};
