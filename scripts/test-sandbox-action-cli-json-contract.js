const assert = require("assert");
const { spawnSync } = require("child_process");

const { parseArgs } = require("./run-sandbox-action");

const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function runCli(args, env = {}) {
  const child = spawnSync(process.execPath, ["scripts/run-sandbox-action.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const parsed = JSON.parse(child.stdout);
  return { child, parsed };
}

function assertStableJson(result) {
  assert.strictEqual(typeof result.ok, "boolean");
  assert(result.status);
  assert(result.action);
  assert(Array.isArray(result.errors));
  assert(Array.isArray(result.warnings));
  assert(Array.isArray(result.artifacts));
  assert(Array.isArray(result.sensitive_findings));
  assert(result.output && typeof result.output === "object");
  const raw = JSON.stringify(result);
  assert(!/https:\/\/api\.factura\.com/i.test(raw));
  assert(!/F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(raw));
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|sendDocument|sendMediaGroup/i.test(raw));
}

function toBase64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function validationDraft() {
  return {
    draft_id: "DRAFT-CLI-VALIDATION",
    status: "APROBADO",
    client_snapshot: { client_id: "CLIENT-BAD", validated_by_human: false },
    concept: {},
    amount: null,
    subtotal: null,
    iva_amount: null,
    total: null,
    tax_mode: "",
    blockers: [],
  };
}

check("parse_args_accepts_draft_id", () => {
  const parsed = parseArgs(["sandbox.draft.stamp", "--draft-id", "DRAFT-1", "--idempotency-key", "IDEMP-1", "--require-live-sandbox"]);
  assert.strictEqual(parsed.action, "sandbox.draft.stamp");
  assert.strictEqual(parsed.options.draftId, "DRAFT-1");
  assert.strictEqual(parsed.options.idempotencyKey, "IDEMP-1");
  assert.strictEqual(parsed.options.requireLiveSandbox, true);
  return parsed.options.draftId;
});

check("parse_args_accepts_provider_client_sync_flags", () => {
  const parsed = parseArgs([
    "sandbox.provider.client.sync",
    "--client-id", "CLIENT-1",
    "--provider-client-uid", "CLIENTUID-1",
    "--rfc", "ABC010203AB1",
    "--legal-name", "Cliente Demo",
    "--fiscal-zip", "77500",
    "--fiscal-regime", "601",
    "--cfdi-use", "G03",
    "--validated-by-human",
    "--create-if-missing",
    "--allow-legacy-receiver-uid",
  ]);
  assert.strictEqual(parsed.action, "sandbox.provider.client.sync");
  assert.strictEqual(parsed.options.clientId, "CLIENT-1");
  assert.strictEqual(parsed.options.providerClientUid, "CLIENTUID-1");
  assert.strictEqual(parsed.options.createIfMissing, true);
  assert.strictEqual(parsed.options.validatedByHuman, true);
  assert.strictEqual(parsed.options.allowLegacyReceiverUid, true);
  return parsed.options.clientId;
});

check("parse_args_accepts_db_exec_mode_flag", () => {
  const parsed = parseArgs([
    "sandbox.provider.client.link",
    "--db-exec-mode", "docker",
    "--client-id", "CLIENT-1",
    "--provider-client-uid", "CLIENTUID-1",
  ]);
  assert.strictEqual(parsed.action, "sandbox.provider.client.link");
  assert.strictEqual(parsed.options.dbExecMode, "docker");
  assert.strictEqual(parsed.options.clientId, "CLIENT-1");
  assert.strictEqual(parsed.options.providerClientUid, "CLIENTUID-1");
  return parsed.options.dbExecMode;
});

check("parse_args_accepts_document_delivery_flags", () => {
  const parsed = parseArgs([
    "sandbox.documents.delivery.send",
    "--draft-id", "DRAFT-1",
    "--channel", "PROVIDER_EMAIL",
    "--send-real",
    "--confirmed",
    "--force",
    "--confirm-recipient",
  ]);
  assert.strictEqual(parsed.action, "sandbox.documents.delivery.send");
  assert.strictEqual(parsed.options.draftId, "DRAFT-1");
  assert.strictEqual(parsed.options.channel, "PROVIDER_EMAIL");
  assert.strictEqual(parsed.options.dryRun, false);
  assert.strictEqual(parsed.options.confirmed, true);
  assert.strictEqual(parsed.options.force, true);
  assert.strictEqual(parsed.options.confirmRecipient, true);
  return parsed.options.channel;
});

check("parse_args_accepts_pdf_diagnose_identity_flags", () => {
  const parsed = parseArgs([
    "sandbox.documents.pdf.diagnose",
    "--cfdi-uid", "CFDIUID-1",
    "--pac-invoice-id", "PAC-1",
    "--uuid", "00000000-0000-4000-8000-000000000716",
    "--db-exec-mode", "docker",
    "--render-check",
    "--debug-render",
  ]);
  assert.strictEqual(parsed.action, "sandbox.documents.pdf.diagnose");
  assert.strictEqual(parsed.options.cfdiUid, "CFDIUID-1");
  assert.strictEqual(parsed.options.pacInvoiceId, "PAC-1");
  assert.strictEqual(parsed.options.uuid, "00000000-0000-4000-8000-000000000716");
  assert.strictEqual(parsed.options.dbExecMode, "docker");
  assert.strictEqual(parsed.options.renderCheck, true);
  assert.strictEqual(parsed.options.debugRender, true);
  return parsed.options.cfdiUid;
});

check("parse_args_accepts_provider_email_sync_update_flag", () => {
  const parsed = parseArgs([
    "sandbox.provider.client.sync",
    "--client-id", "CLIENT-1",
    "--update-provider",
  ]);
  assert.strictEqual(parsed.options.clientId, "CLIENT-1");
  assert.strictEqual(parsed.options.updateProvider, true);
  return "update-provider";
});

check("controlled_missing_draft_exits_zero_with_json", () => {
  const { child, parsed } = runCli(["sandbox.draft.stamp"], { FACTURACOM_SANDBOX_LIVE: "1" });
  assert.strictEqual(child.status, 0);
  assert.strictEqual(child.stderr.trim(), "");
  assertStableJson(parsed);
  assert.strictEqual(parsed.status, "ERROR");
  assert.strictEqual(parsed.error_class, "DRAFT_CONTEXT_MISSING");
  assert(parsed.errors.includes("DRAFT_NOT_FOUND"));
  return parsed.error_class;
});

check("controlled_validation_error_exits_zero_with_json", () => {
  const encoded = toBase64UrlJson(validationDraft());
  const { child, parsed } = runCli(["sandbox.draft.stamp", "--draft-json-b64", encoded], { FACTURACOM_SANDBOX_LIVE: "1" });
  assert.strictEqual(child.status, 0);
  assertStableJson(parsed);
  assert.strictEqual(parsed.status, "ERROR");
  assert.strictEqual(parsed.error_class, "DRAFT_VALIDATION_ERROR");
  assert(parsed.output.validation_error_codes.includes("CLIENT_NOT_VALIDATED"));
  assert(parsed.output.validation_error_codes.includes("RFC_MISSING"));
  return parsed.error_class;
});

check("controlled_needs_config_exits_zero_with_json", () => {
  const goodEnough = {
    ...validationDraft(),
    client_snapshot: { client_id: "CLIENT-DEMO", display_name: "Cliente Demo", rfc: "XAXX010101000", regimen_fiscal: "616", codigo_postal_fiscal: "77500", validated_by_human: true },
    concept: { id: "PROD-CCTV-001", concepto_factura: "VENTA DE CAMARA", clave_prod_serv: "45121500", clave_unidad: "H87" },
    amount: 100,
    subtotal: 100,
    iva_amount: 16,
    total: 116,
    tax_mode: "ADD_IVA",
  };
  const { child, parsed } = runCli(["sandbox.draft.stamp", "--draft-json-b64", toBase64UrlJson(goodEnough), "--require-live-sandbox"], { FACTURACOM_SANDBOX_LIVE: "0" });
  assert.strictEqual(child.status, 0);
  assertStableJson(parsed);
  assert.strictEqual(parsed.status, "NEEDS_CONFIG");
  assert(parsed.errors.includes("FACTURACOM_SANDBOX_LIVE_REQUIRED"));
  return parsed.status;
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
