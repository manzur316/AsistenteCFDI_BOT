const assert = require("assert");
const { listSandboxActions } = require("./lib/sandbox-action-runner");
const { runClientFiscalNormalizeDiagnose } = require("./lib/client-fiscal-normalize-diagnose-action");

const checks = [];
function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("diagnose_normaliza_cliente_local_sin_exponer_rfc", () => {
  const result = runClientFiscalNormalizeDiagnose({
    clientId: "CLI-REAL-BILBAO",
    dbExecMode: "docker",
    execFileSync: () => `${JSON.stringify({
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      rfc: "XAXX010101000",
      regimen_fiscal: "Personas Morales con Fines no Lucrativos",
      uso_cfdi_default: "Gastos en general",
      codigo_postal_fiscal: "77500",
      tipo_persona: "MORAL",
      validated_by_human: true,
    })}\n`,
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.normalization_report.regimen_fiscal.normalized_key, "603");
  assert.strictEqual(result.output.normalization_report.uso_cfdi_default.normalized_key, "G03");
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("XAXX010101000"));
  assert.ok(serialized.includes("[REDACTED_RFC"));
  return result.status;
});

check("sandbox_runner_expone_diagnostico_allowlisted", () => {
  assert.ok(listSandboxActions().includes("sandbox.client.fiscal-normalize.diagnose"));
  return "registered";
});

check("diagnose_reporta_cliente_no_encontrado", () => {
  const result = runClientFiscalNormalizeDiagnose({
    clientId: "CLI-MISSING",
    execFileSync: () => "",
  });
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  assert.ok(result.errors.includes("CLIENT_NOT_FOUND"));
  return result.output.error_class;
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
