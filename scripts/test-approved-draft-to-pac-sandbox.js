const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { runSandboxAction, ACTIONS } = require("./lib/sandbox-action-runner");
const {
  hasSandboxStamp,
  validateDraftForSandboxStamp,
} = require("./lib/sandbox-draft-stamp-action");
const { ROLES } = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const tempRoot = path.join(root, "runtime", "test-approved-draft-to-pac-sandbox");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

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

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-7-6-${role}`,
    telegram_chat_id: "CHAT-7-6",
    telegram_user_id: "TGUSER-7-6",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseInput(text, role = ROLES.OWNER, extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 7601,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 7601,
    chat_id: "CHAT-7-6",
    telegram_user_id: "TGUSER-7-6",
    message_id: String((extra.update_id || 7601) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_callback_events: [],
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "MESSAGE",
    callback_query_id: "",
    callback_message_id: "",
    source_message_id: "",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function callbackInput(token, action, draft, extra = {}) {
  return baseInput(`cfdi:${token}`, ROLES.OWNER, {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-7-6-${extra.update_id || 1}`,
    callback_message_id: "88",
    source_message_id: "88",
    action_token: {
      token,
      chat_id: "CHAT-7-6",
      draft_id: draft?.draft_id,
      action,
      payload: { draft_id: draft?.draft_id, action },
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    },
    recent_drafts: draft ? [draft] : [],
    ...extra,
  });
}

function callbacks(result) {
  return (result.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => ({ text: String(button.text || ""), callback_data: String(button.callback_data || "") }));
}

function callbackForText(result, text) {
  const item = callbacks(result).find((button) => button.text === text || button.text.includes(text));
  return item?.callback_data || "";
}

function safeCallbacks(result) {
  for (const button of callbacks(result)) {
    assert(button.callback_data.length <= 32, `${button.text}: ${button.callback_data}`);
    assert(/^[a-zA-Z0-9_:.-]+$/.test(button.callback_data), button.callback_data);
    assert(!/[A-Z&]{3,4}\d{6}[A-Z0-9]{3}/i.test(button.callback_data), "RFC in callback");
    assert(!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(button.callback_data), "UUID in callback");
    assert(!/\d+\.\d{2}/.test(button.callback_data), "amount in callback");
    assert(!/[\\/]/.test(button.callback_data), "path in callback");
  }
  return true;
}

function validDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-76-OK",
    status: "APROBADO",
    emitter_id: "EMITTER-DEMO",
    update_id: 7600,
    message_original: "venta de camara CCTV",
    ready_to_copy: true,
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

function sandboxStdout(action, status = "OK", output = {}) {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action,
    status,
    ok: status === "OK",
    duration_ms: 77,
    artifacts: output.artifacts || [{ key: "output.manifest_path", path: "runtime/storage-sandbox/draft-stamps/demo/manifest.json" }],
    warnings: output.warnings || [],
    errors: output.errors || [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-76-OK",
      provider: "Factura.com Sandbox",
      invoice_status: status === "OK" ? "SANDBOX_TIMBRADO" : "SANDBOX_ERROR",
      client_display_name: "Cliente Demo",
      total: 1160,
      artifacts_count: 1,
      ...output,
    },
  });
}

function toBase64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function assertNoSensitive(value) {
  const text = JSON.stringify(value);
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production URL");
  assert(!/F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(text), "PAC credentials");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF-|sendDocument|sendMediaGroup|sendPhoto/i.test(text), "document leak/send");
}

cleanTemp();

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("stamp_action_allowlisted", () => {
  assert(ACTIONS.includes("sandbox.draft.stamp"));
  assert(handleCode.includes("STAMP_DRAFT_SANDBOX"));
  assert(handleCode.includes("sandbox.draft.stamp"));
  return "sandbox.draft.stamp";
});

check("no_stamp_button_for_pending_draft", () => {
  const draft = validDraft({ status: "PENDIENTE", draft_id: "DRAFT-PENDING" });
  const result = executeCode(handleCode, baseInput("/pendientes", ROLES.OWNER, { update_id: 7610, recent_drafts: [draft] }));
  assert(!callbacks(result).some((button) => button.text.includes("Timbrar sandbox")));
  safeCallbacks(result);
  return "hidden";
});

check("stamp_button_for_approved_draft_uses_safe_token", () => {
  const draft = validDraft();
  const result = executeCode(handleCode, baseInput("/aprobadas", ROLES.OWNER, { update_id: 7611, recent_drafts: [draft] }));
  const callbackData = callbackForText(result, "Timbrar sandbox");
  assert(callbackData.startsWith("cfdi:"), callbackData);
  assert(callbackData.length <= 32, callbackData);
  safeCallbacks(result);
  return callbackData;
});

check("stamp_button_hidden_after_sandbox_stamp", () => {
  const draft = validDraft({ status: "SANDBOX_TIMBRADO", sandbox_stamped: true });
  const result = executeCode(handleCode, baseInput("/detalle DRAFT-76-OK", ROLES.OWNER, { update_id: 7612, recent_drafts: [draft] }));
  assert(!callbacks(result).some((button) => button.text.includes("Timbrar sandbox")));
  assert(hasSandboxStamp(draft));
  return "hidden";
});

check("stamp_callback_invokes_action_layer_and_marks_in_progress", () => {
  const draft = validDraft();
  const token = "STAMP76TOKEN1";
  const result = executeCode(handleCode, callbackInput(token, "STAMP_DRAFT_SANDBOX", draft, { update_id: 7613 }));
  assert.strictEqual(result.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.draft.stamp");
  assert(result.sandbox_execute_command.startsWith("node scripts/run-sandbox-action.js sandbox.draft.stamp"));
  assert(result.sandbox_execute_command.includes("--draft-id DRAFT-76-OK"));
  assert(result.sandbox_execute_command.includes("--draft-json-b64 "));
  assert(result.callback_processing_sql.includes("SANDBOX_TIMBRANDO"));
  assert(result.callback_processing_sql.includes("DRAFT_SANDBOX_STAMP_IN_PROGRESS"));
  assert(result.callback_processing_sql.includes("passthrough_b64"));
  assert(!/[;&|`$<>]/.test(result.sandbox_execute_command), result.sandbox_execute_command);
  assertNoSensitive(result);
  return "execute";
});

check("stamp_duplicate_in_progress_is_blocked", () => {
  const draft = validDraft();
  const token = "STAMP76TOKEN2";
  const result = executeCode(handleCode, callbackInput(token, "STAMP_DRAFT_SANDBOX", draft, {
    update_id: 7614,
    recent_callback_events: [{
      event_type: "DRAFT_SANDBOX_STAMP_IN_PROGRESS",
      created_at: new Date().toISOString(),
      idempotency_key: "draft_sandbox_stamp:DRAFT-76-OK",
      idempotency_status: "IN_PROGRESS",
      draft_id: "DRAFT-76-OK",
      sandbox_action: "sandbox.draft.stamp",
    }],
  }));
  assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
  assert.strictEqual(result.callback_ack_text, "Accion ya en proceso.");
  return "blocked";
});

check("normal_user_cannot_stamp_callback", () => {
  const draft = validDraft();
  const result = executeCode(handleCode, callbackInput("STAMP76TOKEN3", "STAMP_DRAFT_SANDBOX", draft, {
    update_id: 7615,
    authorized_user: authorizedUser(ROLES.ASSISTANT_OPERATOR),
    security_role: ROLES.ASSISTANT_OPERATOR,
  }));
  assert.strictEqual(result.action, "ACCESS_DENIED");
  return "denied";
});

check("summary_success_updates_draft_to_sandbox_timbrado", () => {
  const source = executeCode(handleCode, callbackInput("STAMP76TOKEN4", "STAMP_DRAFT_SANDBOX", validDraft(), { update_id: 7616 }));
  const result = executeCode(summaryCode, { stdout: sandboxStdout("sandbox.draft.stamp", "OK") }, () => [{ json: source }]);
  assert.strictEqual(result.sandbox_draft_status, "SANDBOX_TIMBRADO");
  assert(result.telegram_message.includes("Timbrado sandbox OK"));
  assert(result.telegram_message.includes("Factura.com Sandbox: CFDI de prueba"));
  assert(result.telegram_message.includes("No se envian documentos por Telegram"));
  assert(result.persistence_sql.includes("DRAFT_SANDBOX_STAMP_RESULT"));
  assert(result.persistence_sql.includes("SANDBOX_TIMBRADO"));
  assertNoSensitive(result);
  return result.sandbox_draft_status;
});

check("summary_error_updates_draft_to_sandbox_error", () => {
  const source = executeCode(handleCode, callbackInput("STAMP76TOKEN5", "STAMP_DRAFT_SANDBOX", validDraft(), { update_id: 7617 }));
  const result = executeCode(summaryCode, { stdout: sandboxStdout("sandbox.draft.stamp", "ERROR", { errors: ["VALIDATION_ERROR"] }) }, () => [{ json: source }]);
  assert.strictEqual(result.sandbox_draft_status, "SANDBOX_ERROR");
  assert(result.telegram_message.includes("Timbrado sandbox no realizado"));
  assert(result.persistence_sql.includes("SANDBOX_ERROR"));
  return result.sandbox_draft_status;
});

check("action_layer_blocks_missing_draft", async () => {
  const result = await runSandboxAction("sandbox.draft.stamp", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    actionResultsRoot: path.join(tempRoot, "missing", "results"),
    actionAuditRoot: path.join(tempRoot, "missing", "audit"),
    storageRoot: path.join(tempRoot, "missing", "storage"),
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("DRAFT_NOT_FOUND"));
  return result.status;
});

check("action_layer_blocks_not_approved", async () => {
  const result = await runSandboxAction("sandbox.draft.stamp", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft: validDraft({ status: "PENDIENTE" }),
    actionResultsRoot: path.join(tempRoot, "not-approved", "results"),
    actionAuditRoot: path.join(tempRoot, "not-approved", "audit"),
    storageRoot: path.join(tempRoot, "not-approved", "storage"),
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("DRAFT_NOT_APPROVED"));
  return result.status;
});

check("action_layer_blocks_already_stamped", async () => {
  const result = await runSandboxAction("sandbox.draft.stamp", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft: validDraft({ status: "SANDBOX_TIMBRADO", sandbox_stamped: true }),
    actionResultsRoot: path.join(tempRoot, "already", "results"),
    actionAuditRoot: path.join(tempRoot, "already", "audit"),
    storageRoot: path.join(tempRoot, "already", "storage"),
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("DRAFT_ALREADY_SANDBOX_STAMPED"));
  return result.status;
});

check("action_layer_blocks_missing_live", async () => {
  const result = await runSandboxAction("sandbox.draft.stamp", {
    env: { FACTURACOM_SANDBOX_LIVE: "0" },
    draft: validDraft(),
    actionResultsRoot: path.join(tempRoot, "live-missing", "results"),
    actionAuditRoot: path.join(tempRoot, "live-missing", "audit"),
    storageRoot: path.join(tempRoot, "live-missing", "storage"),
  });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert(result.errors.includes("FACTURACOM_SANDBOX_LIVE_REQUIRED"));
  return result.status;
});

check("action_layer_blocks_client_concept_tax_validation", () => {
  const result = validateDraftForSandboxStamp(validDraft({
    client_snapshot: { client_id: "CLIENT-BAD", validated_by_human: false },
    concept: {},
    amount: null,
    subtotal: null,
    tax_mode: null,
    iva_amount: null,
  }), { FACTURACOM_SANDBOX_LIVE: "1" });
  for (const expected of [
    "client_not_validated",
    "client_rfc_required",
    "client_regimen_required",
    "client_fiscal_zip_required",
    "concept_required",
    "clave_prod_serv_required",
    "clave_unidad_required",
    "amount_required",
    "tax_method_required",
    "iva_amount_required",
  ]) assert(result.errors.includes(expected), expected);
  return `${result.errors.length} errors`;
});

check("action_layer_success_creates_storage_manifest", async () => {
  const result = await runSandboxAction("sandbox.draft.stamp", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft: validDraft(),
    actionResultsRoot: path.join(tempRoot, "success", "results"),
    actionAuditRoot: path.join(tempRoot, "success", "audit"),
    storageRoot: path.join(tempRoot, "success", "storage"),
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assert.strictEqual(result.output.provider, "Factura.com Sandbox");
  assert.strictEqual(result.output.pac_result.uuid_present, true);
  assert(result.output.artifacts_count >= 1);
  assert(fs.existsSync(path.join(tempRoot, "success", "storage")));
  assert.strictEqual(result.sensitive_findings.length, 0);
  return result.output.invoice_status;
});

check("cli_accepts_draft_json_b64_without_draft_id", () => {
  const encoded = toBase64UrlJson(validDraft({ draft_id: "DRAFT-76-CLI" }));
  const child = spawnSync(process.execPath, [
    "scripts/run-sandbox-action.js",
    "sandbox.draft.stamp",
    "--draft-json-b64",
    encoded,
    "--audit-source-kind",
    "CALLBACK_QUERY",
    "--audit-callback-data",
    "cfdi:<token>",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      FACTURACOM_SANDBOX_LIVE: "1",
    },
  });
  assert.strictEqual(child.status, 0, child.stderr || child.stdout);
  const parsed = JSON.parse(child.stdout);
  assert.strictEqual(parsed.action, "sandbox.draft.stamp");
  assert.strictEqual(parsed.status, "OK");
  assert.strictEqual(parsed.output.invoice_status, "SANDBOX_TIMBRADO");
  assertNoSensitive(parsed);
  return parsed.status;
});

check("workflow_no_direct_pac_production_or_file_send", () => {
  assert(!/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction|sendDocument|sendMediaGroup|sendPhoto|<\?xml|%PDF-/i.test(workflowText));
  assert(workflowText.includes("node scripts/run-sandbox-action.js"));
  return "safe";
});

check("runtime_not_versioned", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert(gitignore.includes("runtime/**"));
  return "runtime ignored";
});

(async () => {
  const results = await Promise.all(checks);
  console.log("Approved Draft To PAC Sandbox Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();
