const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { runSandboxAction } = require("./lib/sandbox-action-runner");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const tempRoot = path.join(root, "runtime", "test-sandbox-draft-stamp-stdout-contract");

const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function validDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-STDOUT-OK",
    status: "APROBADO",
    emitter_id: "EMITTER-DEMO",
    update_id: 71430,
    message_original: "venta de camara CCTV",
    ready_to_copy: true,
    requires_human_review: true,
    action: "SUGERIR",
    amount: 1000,
    subtotal: 1000,
    tax_mode: "ADD_IVA",
    iva_amount: 160,
    iva_retention_amount: 0,
    isr_retention_amount: 0,
    total: 1160,
    blockers: [],
    client_snapshot: {
      client_id: "CLIENT-DEMO",
      display_name: "Cliente Demo",
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

function toBase64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function assertStableResult(result) {
  assert.strictEqual(typeof result, "object");
  assert.strictEqual(result.action, "sandbox.draft.stamp");
  assert.strictEqual(typeof result.ok, "boolean");
  assert(result.status, "status requerido");
  assert(Array.isArray(result.errors), "errors requerido");
  assert(Array.isArray(result.warnings), "warnings requerido");
  assert(Array.isArray(result.sensitive_findings), "sensitive_findings requerido");
  assert(Array.isArray(result.artifacts), "artifacts requerido");
}

function assertNoSensitive(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!/(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}/.test(text), "telegram token");
  assert(!/(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*(?!\[redacted\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(text), "PAC secret");
  assert(!/(FACTURACOM_(?:API|SECRET)_KEY|FACTURACOM_PLUGIN)\s*=\s*(?!\[redacted\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(text), "PAC secret");
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production url");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF-|sendDocument|sendMediaGroup|sendPhoto/i.test(text), "document leak/send");
}

cleanTemp();

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("cli_missing_draft_stdout_is_json_stable", () => {
  const child = spawnSync(process.execPath, ["scripts/run-sandbox-action.js", "sandbox.draft.stamp"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FACTURACOM_SANDBOX_LIVE: "1" },
  });
  assert.notStrictEqual(child.status, 0);
  assert.strictEqual(child.stderr.trim(), "");
  const parsed = JSON.parse(child.stdout);
  assertStableResult(parsed);
  assert.strictEqual(parsed.status, "ERROR");
  assert(parsed.errors.includes("DRAFT_NOT_FOUND"));
  assert.strictEqual(parsed.error_class, "DRAFT_CONTEXT_MISSING");
  assert(parsed.output.validation_error_codes.includes("DRAFT_CONTEXT_MISSING"));
  assertNoSensitive(parsed);
  return parsed.error_class;
});

check("cli_validation_error_stdout_is_json_stable", () => {
  const encoded = toBase64UrlJson(validDraft({
    status: "APROBADO",
    client_snapshot: { client_id: "CLIENT-BAD", validated_by_human: false },
    concept: {},
    amount: null,
    subtotal: null,
    tax_mode: null,
    iva_amount: null,
  }));
  const child = spawnSync(process.execPath, [
    "scripts/run-sandbox-action.js",
    "sandbox.draft.stamp",
    "--draft-json-b64",
    encoded,
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FACTURACOM_SANDBOX_LIVE: "1" },
  });
  assert.notStrictEqual(child.status, 0);
  const parsed = JSON.parse(child.stdout);
  assertStableResult(parsed);
  assert.strictEqual(parsed.error_class, "DRAFT_VALIDATION_ERROR");
  for (const expected of ["CLIENT_NOT_VALIDATED", "RFC_MISSING", "REGIMEN_MISSING", "FISCAL_ZIP_MISSING", "CONCEPT_MISSING", "AMOUNT_MISSING", "TAX_MODE_MISSING"]) {
    assert(parsed.output.validation_error_codes.includes(expected), expected);
  }
  assertNoSensitive(parsed);
  return parsed.error_class;
});

check("run_sandbox_action_success_json_shape", async () => {
  const result = await runSandboxAction("sandbox.draft.stamp", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft: validDraft(),
    actionResultsRoot: path.join(tempRoot, "success", "results"),
    actionAuditRoot: path.join(tempRoot, "success", "audit"),
    storageRoot: path.join(tempRoot, "success", "storage"),
  });
  assertStableResult(result);
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assertNoSensitive(result);
  return result.status;
});

check("n8n_summary_parses_last_json_object_from_noisy_stdout", () => {
  const source = {
    update_id: 71431,
    max_seen_update_id: 71431,
    chat_id: "CHAT-7-14B",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-7-14B",
    callback_message_id: "88",
    requested_sandbox_action: "sandbox.draft.stamp",
    sandbox_draft_id: "DRAFT-STDOUT-OK",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
  };
  const stdout = `log suelto que no debe romper n8n\n${JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status: "ERROR",
    ok: false,
    error_class: "DRAFT_CONTEXT_MISSING",
    errors: ["DRAFT_NOT_FOUND"],
    warnings: [],
    sensitive_findings: [],
    artifacts: [],
    output: { invoice_status: "SANDBOX_ERROR", draft_id: null, validation_error_codes: ["DRAFT_CONTEXT_MISSING"] },
  })}`;
  const result = executeCode(summaryCode, { stdout, exitCode: 1 }, () => [{ json: source }]);
  assert.strictEqual(result.sandbox_action_status, "ERROR");
  assert.strictEqual(result.sandbox_action_summary.error_class, "DRAFT_CONTEXT_MISSING");
  assert.strictEqual(result.sandbox_action_summary.diagnostics.parse_mode, "last_json_object");
  assert(result.telegram_message.includes("Timbrado sandbox no realizado"));
  assertNoSensitive(result);
  return result.sandbox_action_summary.diagnostics.parse_mode;
});

check("n8n_summary_invalid_stdout_diagnostic_safe", () => {
  const source = {
    update_id: 71432,
    max_seen_update_id: 71432,
    chat_id: "CHAT-7-14B",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-7-14B",
    callback_message_id: "88",
    requested_sandbox_action: "sandbox.draft.stamp",
    sandbox_draft_id: "DRAFT-STDOUT-ERR",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
  };
  const result = executeCode(summaryCode, {
    stdout: "LOG NO JSON C:/Users/Juandi Gamer/Documents/secret.xml",
    stderr: "FACTURACOM_" + "API_KEY=SECRET_VALUE",
    exitCode: 1,
  }, () => [{ json: source }]);
  assert.strictEqual(result.sandbox_action_status, "ERROR");
  assert.strictEqual(result.sandbox_action_summary.error_class, "ACTION_LAYER_STDOUT_INVALID");
  assert(result.telegram_message.includes("stdout del Action Layer"));
  assertNoSensitive(result);
  return result.sandbox_action_summary.error_class;
});

check("workflow_json_valid_and_safe", () => {
  assert(workflow.nodes.length > 0);
  assert(!/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|sendDocument|sendMediaGroup|sendPhoto|<\?xml|%PDF-/i.test(workflowText));
  return `${workflow.nodes.length} nodes`;
});

check("runtime_not_versioned", () => {
  const tracked = require("child_process").execFileSync("git", ["ls-files", "runtime"], { cwd: root, encoding: "utf8" });
  assert.strictEqual(tracked.trim(), "runtime/.gitkeep");
  return "runtime ignored";
});

(async () => {
  const results = await Promise.all(checks);
  console.log("Sandbox Draft Stamp Stdout Contract Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
})();
