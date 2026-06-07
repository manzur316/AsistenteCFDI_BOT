const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  runSandboxDraftStamp,
  validateDraftForSandboxStamp,
} = require("./lib/sandbox-draft-stamp-action");

const root = path.resolve(__dirname, "..");

function validDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-714E-OK",
    status: "APROBADO",
    invoice_status: "SANDBOX_ERROR",
    payment_status: "NO_APLICA",
    emitter_id: "EMITTER-DEMO",
    message_original: "venta de camara CCTV",
    ready_to_copy: true,
    action: "SUGERIR",
    amount: 600,
    subtotal: 600,
    tax_mode: "ADD_IVA",
    iva_amount: 96,
    iva_retention_amount: 0,
    isr_retention_amount: 0,
    total: 696,
    blockers: [],
    client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      razon_social: "CLIENTE DEMO SA DE CV",
      rfc: "XAXX010101000",
      regimen_fiscal: "616",
      codigo_postal_fiscal: "77500",
      uso_cfdi_default: "S01",
      validated_by_human: true,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "46171610",
      clave_unidad: "H87",
      unidad: "Pieza",
      familia: "CCTV",
      tipo: "PRODUCTO",
      operacion: "VENTA",
      objeto_imp: "02",
    },
    ...overrides,
  };
}

const okAdapter = {
  stampSandbox() {
    return {
      ok: true,
      provider: "Factura.com Sandbox",
      environment: "sandbox",
      status: "SANDBOX_STAMPED",
      uuid: "00000000-0000-4000-8000-000000000714",
      pac_invoice_id: "PAC-SANDBOX-714E",
      requires_human_review: true,
      normalized_warnings: [],
      normalized_errors: [],
    };
  },
};

const failAdapter = {
  stampSandbox() {
    return {
      ok: false,
      provider: "Factura.com Sandbox",
      environment: "sandbox",
      status: "SANDBOX_ERROR",
      normalized_warnings: [],
      normalized_errors: [{ code: "PAC_SANDBOX_TEST_ERROR", message: "fixture error" }],
    };
  },
};

const checks = [];
function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value || "" }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

check("sandbox_error_is_retryable_by_action_layer", async () => {
  const result = await runSandboxDraftStamp({
    draft: validDraft({ invoice_status: "SANDBOX_ERROR", payment_status: "NO_APLICA" }),
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    adapter: okAdapter,
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.draft_status, "APROBADO");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assert.strictEqual(result.output.payment_status, "PENDIENTE");
  assert.strictEqual(result.output.client_display_name, "Real Bilbao");
  assert.strictEqual(result.output.total, 696);
  return result.output.invoice_status;
});

check("timbrando_blocks_only_as_foreign_in_progress_state", () => {
  const validation = validateDraftForSandboxStamp(validDraft({ invoice_status: "SANDBOX_TIMBRANDO" }), {
    FACTURACOM_SANDBOX_LIVE: "1",
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("DRAFT_SANDBOX_IN_PROGRESS"));
  assert(!validation.errors.includes("DRAFT_ALREADY_SANDBOX_STAMPED"));
  return validation.errors.join(",");
});

check("sandbox_error_with_failed_result_still_retries", () => {
  const validation = validateDraftForSandboxStamp(validDraft({
    invoice_status: "SANDBOX_ERROR",
    sandbox_stamp_result: { ok: false, status: "ERROR", error_class: "PAC_SANDBOX_ERROR" },
  }), { FACTURACOM_SANDBOX_LIVE: "1" });
  assert.strictEqual(validation.ok, true);
  assert(!validation.errors.includes("DRAFT_SANDBOX_IN_PROGRESS"));
  assert(!validation.errors.includes("DRAFT_ALREADY_SANDBOX_STAMPED"));
  return validation.status;
});

check("controlled_pac_error_preserves_aprobado_and_sandbox_error", async () => {
  const result = await runSandboxDraftStamp({
    draft: validDraft({ invoice_status: "SANDBOX_ERROR" }),
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    adapter: failAdapter,
  });
  assert.strictEqual(result.status, "ERROR");
  assert.strictEqual(result.output.draft_status, "APROBADO");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_ERROR");
  assert.strictEqual(result.output.payment_status, "NO_APLICA");
  assert.strictEqual(result.output.client_display_name, "Real Bilbao");
  return result.output.invoice_status;
});

check("runtime_not_versioned", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert(gitignore.includes("runtime/**"));
  return "runtime ignored";
});

Promise.all(checks).then((results) => {
  for (const item of results) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
  console.log(`PASS total: ${results.filter((item) => item.pass).length}/${results.length}`);
  if (results.some((item) => !item.pass)) process.exit(1);
});
