const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const code = workflow.nodes.find((node) => node.name === "Handle Commands And Scoring").parameters.jsCode;

const checks = [];
function check(name, fn) {
  try { checks.push({ name, pass: true, value: fn() || "" }); } catch (error) { checks.push({ name, pass: false, value: error.message }); }
}

check("validation_sql_requires_fiscal_identity", () => {
  assert(code.includes("WITH updated AS (UPDATE cfdi_clients SET validated_by_human = true"));
  assert(code.includes("NULLIF(rfc, '')"));
  assert(code.includes("NULLIF(regimen_fiscal, '')"));
  assert(code.includes("NULLIF(codigo_postal_fiscal, '')"));
  assert(code.includes("RETURNING client_id"));
  return "guarded_update";
});

check("validation_event_is_registered", () => {
  assert(code.includes("CLIENT_FISCAL_PROFILE_VALIDATED"));
  assert(code.includes("jsonb_build_object"));
  return "event";
});

check("critical_edits_mark_unvalidated", () => {
  for (const field of ["rfc", "regimen_fiscal", "codigo_postal_fiscal", "razon_social", "uso_cfdi_default", "tipo_persona"]) {
    assert(code.includes(field), field);
  }
  assert(code.includes("validated_by_human = false"));
  assert(code.includes("CLIENT_FISCAL_PROFILE_UPDATED"));
  return "unvalidate";
});

check("numeric_index_validation_is_not_confirmed_without_context", () => {
  assert(code.includes("No puedo resolver el numero de cliente"));
  assert(!code.includes("Cliente \" + arg + \" marcado como validado por humano"));
  return "blocked";
});

for (const item of checks) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
console.log(`PASS total: ${checks.filter((item) => item.pass).length}/${checks.length}`);
if (checks.some((item) => !item.pass)) process.exit(1);
