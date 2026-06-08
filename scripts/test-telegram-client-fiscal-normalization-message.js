const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const summaryNode = workflow.nodes.find((node) => node.name === "Build PAC Sandbox Action Summary");
assert(summaryNode, "Build PAC Sandbox Action Summary node missing");
const code = summaryNode.parameters.jsCode || "";

const checks = [];
function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("workflow_explica_campos_fiscales_normalizados", () => {
  assert.ok(code.includes("Campos fiscales normalizados:"));
  assert.ok(code.includes("Regimen fiscal receptor normalizado"));
  assert.ok(code.includes("UsoCFDI normalizado"));
  assert.ok(code.includes("El sistema usara claves SAT normalizadas para el payload."));
  return "message branch present";
});

check("workflow_lee_reportes_sanitizados_del_action_layer", () => {
  assert.ok(code.includes("draftOutput.client_fiscal_normalization"));
  assert.ok(code.includes("draftOutput.sat_field_normalization_report"));
  assert.ok(code.includes("normalizationLine"));
  return "report inputs present";
});

check("mensaje_no_agrega_datos_sensibles", () => {
  assert.ok(!code.includes("rfc_redacted: false"));
  assert.ok(!code.includes("UUID completo"));
  assert.ok(!code.includes("UID completo"));
  assert.ok(!code.includes("runtime/"));
  return "safe";
});

const sampleLines = [
  "Campos fiscales normalizados:",
  "Regimen fiscal receptor normalizado: \"Personas Morales con Fines no Lucrativos\" -> 603",
  "UsoCFDI normalizado: \"Gastos en general\" -> G03",
  "El sistema usara claves SAT normalizadas para el payload.",
  "Borrador sujeto a revision humana. No sustituye contador.",
].join("\n");

check("mensaje_simulado_no_expone_rfc_uid_rutas", () => {
  assert.ok(sampleLines.includes("603"));
  assert.ok(sampleLines.includes("G03"));
  assert.ok(!/[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/i.test(sampleLines));
  assert.ok(!/[A-Za-z]:[\\/]/.test(sampleLines));
  assert.ok(!/\b[0-9a-f]{8}-[0-9a-f]{4}/i.test(sampleLines));
  return "sample safe";
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
