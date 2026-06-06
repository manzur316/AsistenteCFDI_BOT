const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { hasSandboxStamp, validateDraftForSandboxStamp } = require("./lib/sandbox-draft-stamp-action");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");

function validDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-RETRY-714D",
    status: "APROBADO",
    invoice_status: "SANDBOX_ERROR",
    payment_status: "NO_APLICA",
    client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      rfc: "PRB150731II8",
      regimen_fiscal: "603",
      codigo_postal_fiscal: "77723",
      validated_by_human: true,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA CCTV",
      clave_prod_serv: "45121500",
      clave_unidad: "H87",
      unidad: "Pieza",
    },
    amount: 1000,
    subtotal: 1000,
    iva_amount: 160,
    total: 1160,
    tax_mode: "MAS_IVA",
    blockers: [],
    ...overrides,
  };
}

const checks = [];
function check(name, fn) {
  try { checks.push({ name, pass: true, value: fn() || "" }); } catch (error) { checks.push({ name, pass: false, value: error.message }); }
}

check("sandbox_error_with_failed_result_is_retryable", () => {
  const draft = validDraft({ sandbox_stamp_result: { ok: false, status: "ERROR", error_class: "DRAFT_VALIDATION_ERROR" } });
  assert.strictEqual(hasSandboxStamp(draft), false);
  const validation = validateDraftForSandboxStamp(draft, { FACTURACOM_SANDBOX_LIVE: "1" });
  assert(!validation.errors.includes("DRAFT_ALREADY_SANDBOX_STAMPED"));
  return validation.status;
});

check("sandbox_timbrado_status_counts_as_stamped", () => {
  assert.strictEqual(hasSandboxStamp(validDraft({ invoice_status: "SANDBOX_TIMBRADO" })), true);
  const validation = validateDraftForSandboxStamp(validDraft({ invoice_status: "SANDBOX_TIMBRADO" }), { FACTURACOM_SANDBOX_LIVE: "1" });
  assert(validation.errors.includes("DRAFT_ALREADY_SANDBOX_STAMPED"));
  return validation.errors.join(",");
});

check("successful_pac_identity_counts_as_stamped", () => {
  assert.strictEqual(hasSandboxStamp(validDraft({ sandbox_stamp_result: { ok: true, status: "OK", uuid_present: true } })), true);
  assert.strictEqual(hasSandboxStamp(validDraft({ pac_sandbox_result: { ok: true, status: "OK", pac_invoice_id: "PAC-SANDBOX-ID" } })), true);
  return "identity";
});

check("workflow_can_stamp_allows_sandbox_error_but_not_timbrado", () => {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  const code = workflow.nodes.find((node) => node.name === "Handle Commands And Scoring").parameters.jsCode;
  assert(code.includes("draftAlreadySandboxStamped"));
  assert(code.includes("sandboxResultLooksStamped"));
  assert(!code.includes("draft.sandbox_stamp_result || draft.pac_sandbox_result) return false"));
  return "workflow_semantics";
});

for (const item of checks) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
console.log(`PASS total: ${checks.filter((item) => item.pass).length}/${checks.length}`);
if (checks.some((item) => !item.pass)) process.exit(1);
