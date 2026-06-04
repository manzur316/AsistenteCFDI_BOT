const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  analyze,
  renderAnalysis,
} = require("./analyze-activity-scope-shadow-log");

const root = path.resolve(__dirname, "..");
const runtimeDir = path.join(root, "runtime", "test-activity-scope-shadow-log-analyzer");
const analyzerPath = path.join(root, "scripts", "analyze-activity-scope-shadow-log.js");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
}

function runAnalyzer(filePath) {
  return spawnSync(process.execPath, [analyzerPath, filePath], {
    cwd: root,
    encoding: "utf8",
  });
}

function baseRecord(overrides = {}) {
  return {
    timestamp: "2026-06-04T12:00:00.000Z",
    enabled: true,
    non_productive: true,
    current_action: "SUGERIR",
    current_concept_id: "PROD-CCTV-001",
    activity_scope_result: "ALLOW_CANDIDATE",
    detected_activity_ids: ["A4"],
    requires_clarification: false,
    blocked_scope_matches: [],
    semantic_flags: [],
    divergence_type: "NONE",
    reasons: ["input:venta de camara CCTV"],
    ...overrides,
  };
}

if (fs.existsSync(runtimeDir)) fs.rmSync(runtimeDir, { recursive: true, force: true });
fs.mkdirSync(runtimeDir, { recursive: true });

const validPath = path.join(runtimeDir, "valid.jsonl");
writeJsonl(validPath, [
  baseRecord(),
  baseRecord({
    current_action: "BLOQUEAR",
    current_concept_id: null,
    activity_scope_result: "BLOCK_OR_ACTIVITY_REVIEW",
    blocked_scope_matches: [{ id: "NO_SOFTWARE_APPS_WEB_SAAS_IA_N8N" }],
    reasons: ["input:pagina web"],
  }),
  baseRecord({
    current_action: "PEDIR_ACLARACION",
    current_concept_id: null,
    activity_scope_result: "ASK_CLARIFICATION",
    requires_clarification: true,
    reasons: ["input:servicio tecnico"],
  }),
  baseRecord({
    current_action: "SUGERIR",
    current_concept_id: "PROD-CCTV-002",
    activity_scope_result: "ALLOW_CANDIDATE",
    semantic_flags: ["DVR_NOT_CAMERA_GUARD_APPLIED"],
    divergence_type: "CURRENT_SCORING_SEMANTIC_CONTAMINATION",
    reasons: ["input:venta de camara CCTV"],
  }),
]);

const invalidJsonPath = path.join(runtimeDir, "invalid-json.jsonl");
fs.writeFileSync(invalidJsonPath, `${JSON.stringify(baseRecord())}\n{bad-json\n`, "utf8");

const invalidNonProductivePath = path.join(runtimeDir, "invalid-non-productive.jsonl");
writeJsonl(invalidNonProductivePath, [baseRecord({ non_productive: false })]);

const missingRequiredPath = path.join(runtimeDir, "missing-required.jsonl");
writeJsonl(missingRequiredPath, [baseRecord({ divergence_type: "", current_action: "", activity_scope_result: "" })]);

const unlistedCriticalPath = path.join(runtimeDir, "unlisted-critical.jsonl");
writeJsonl(unlistedCriticalPath, [
  baseRecord({
    divergence_type: "CURRENT_SCORING_ALLOWS_OUT_OF_SCOPE",
    reasons: [],
  }),
]);

const checks = [];

const validAnalysis = analyze(validPath);
const validRendered = renderAnalysis(validAnalysis);
checks.push({ name: "logs_validos_pass", pass: validAnalysis.ok === true, value: "valid fixture" });
checks.push({ name: "divergencia_none_contada", pass: validAnalysis.counts.divergence_type.NONE === 3, value: String(validAnalysis.counts.divergence_type.NONE) });
checks.push({ name: "divergencia_critica_listada", pass: validAnalysis.cases.critical_divergences.length === 1 && validRendered.includes("Divergencias criticas listadas"), value: String(validAnalysis.cases.critical_divergences.length) });
checks.push({ name: "bloqueo_reportado", pass: validRendered.includes("Casos BLOCK_OR_ACTIVITY_REVIEW") && validRendered.includes("NO_SOFTWARE_APPS_WEB_SAAS_IA_N8N"), value: "BLOCK_OR_ACTIVITY_REVIEW" });
checks.push({ name: "aclaracion_reportada", pass: validRendered.includes("Casos ASK_CLARIFICATION") && validRendered.includes("servicio tecnico"), value: "ASK_CLARIFICATION" });
checks.push({ name: "top_semantic_flags_reportado", pass: validRendered.includes("DVR_NOT_CAMERA_GUARD_APPLIED"), value: "semantic flag" });

const validCli = runAnalyzer(validPath);
checks.push({ name: "cli_valido_exit_0", pass: validCli.status === 0, value: `exit ${validCli.status}` });
checks.push({ name: "cli_valido_imprime_resumen", pass: validCli.stdout.includes("Total registros: 4") && validCli.stdout.includes("Resultado: PASS"), value: "stdout" });

const invalidCli = runAnalyzer(invalidJsonPath);
checks.push({ name: "json_invalido_exit_1", pass: invalidCli.status === 1 && invalidCli.stdout.includes("JSON invalido"), value: `exit ${invalidCli.status}` });

const missingFileCli = runAnalyzer(path.join(runtimeDir, "does-not-exist.jsonl"));
checks.push({ name: "archivo_inexistente_exit_1", pass: missingFileCli.status === 1 && missingFileCli.stdout.includes("Archivo no existe"), value: `exit ${missingFileCli.status}` });

const invalidNonProductive = analyze(invalidNonProductivePath);
checks.push({ name: "non_productive_false_falla", pass: invalidNonProductive.ok === false && invalidNonProductive.errors.some((error) => error.includes("non_productive")), value: "non_productive" });

const missingRequired = analyze(missingRequiredPath);
checks.push({ name: "campos_requeridos_faltantes_fallan", pass: missingRequired.ok === false && missingRequired.errors.length >= 3, value: String(missingRequired.errors.length) });

const unlistedCritical = analyze(unlistedCriticalPath);
checks.push({ name: "divergencia_critica_sin_listar_falla", pass: unlistedCritical.ok === false && unlistedCritical.errors.some((error) => error.includes("divergencia critica")), value: "critical without input" });

const passCount = checks.filter((check) => check.pass).length;
console.log("Activity scope shadow log analyzer tests");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log(`Runtime test path: ${runtimeDir}`);
console.log(`Resumen: ${passCount}/${checks.length} PASS`);
if (passCount !== checks.length) process.exitCode = 1;
