const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftStamp } = require("./lib/sandbox-draft-stamp-action");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");

function executeCode(code, input, itemsProvider = () => []) {
  return new Function("require", "$json", "$node", "$items", "$itemIndex", code)(require, input, {}, itemsProvider, 0)[0].json;
}

function invalidDraft() {
  return {
    draft_id: "DRAFT-20260606-071142-173694258",
    status: "APROBADO",
    invoice_status: "SANDBOX_ERROR",
    payment_status: "NO_APLICA",
    client_id: "CLI-REAL-BILBAO",
    client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      validated_by_human: false,
    },
    client_snapshot: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      validated_by_human: false,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA CCTV",
      clave_prod_serv: "45121500",
      clave_unidad: "H87",
      unidad: "Pieza",
    },
    amount: 7887,
    subtotal: 7887,
    iva_amount: 1261.92,
    total: 9148.92,
    tax_mode: "MAS_IVA",
    blockers: [],
  };
}

const checks = [];
function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value || "" }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

check("action_layer_error_preserves_draft_context", async () => {
  const result = await runSandboxDraftStamp({
    draft: invalidDraft(),
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
  });
  assert.strictEqual(result.status, "ERROR");
  assert.strictEqual(result.output.draft_id, "DRAFT-20260606-071142-173694258");
  assert.strictEqual(result.output.client_id, "CLI-REAL-BILBAO");
  assert.strictEqual(result.output.client_display_name, "Real Bilbao");
  assert.strictEqual(result.output.total, 9148.92);
  assert(result.output.validation_error_codes.includes("CLIENT_NOT_VALIDATED"));
  return result.output.client_display_name;
});

check("workflow_summary_uses_output_context", async () => {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  const summaryCode = workflow.nodes.find((node) => node.name === "Build PAC Sandbox Action Summary").parameters.jsCode;
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status: "ERROR",
    ok: false,
    duration_ms: 12,
    artifacts: [],
    warnings: [],
    errors: ["client_not_validated"],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-20260606-071142-173694258",
      client_id: "CLI-REAL-BILBAO",
      client_display_name: "Real Bilbao",
      total: 9148.92,
      invoice_status: "SANDBOX_ERROR",
      payment_status: "NO_APLICA",
      validation_error_codes: ["CLIENT_NOT_VALIDATED"],
    },
  });
  const source = {
    update_id: 71450,
    chat_id: "CHAT-714D",
    sandbox_draft_id: "DRAFT-20260606-071142-173694258",
    sandbox_draft_context: {
      client_id: "CLI-REAL-BILBAO",
      client_display_name: "Real Bilbao",
      total: 9148.92,
      invoice_status: "SANDBOX_ERROR",
      payment_status: "NO_APLICA",
    },
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
  };
  const result = executeCode(summaryCode, { stdout }, () => [{ json: source }]);
  assert(result.telegram_message.includes("No se pudo timbrar sandbox"));
  assert(result.telegram_message.includes("Borrador: DRAFT-20260606-071142-173694258"));
  assert(result.telegram_message.includes("Cliente: Real Bilbao"));
  assert(result.telegram_message.includes("Total: 9148.92"));
  assert(result.telegram_message.includes("Estado factura: SANDBOX_ERROR"));
  assert(!result.telegram_message.includes("Cliente: N/A"));
  assert(!result.telegram_message.includes("Total: N/A"));
  assert(result.telegram_message.includes("Completar cliente"));
  return result.sandbox_draft_status;
});

Promise.all(checks).then((results) => {
  for (const item of results) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
  console.log(`PASS total: ${results.filter((item) => item.pass).length}/${results.length}`);
  if (results.some((item) => !item.pass)) process.exit(1);
});
