const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const n8nStartExamplePath = path.join(root, "scripts", "local", "start-n8n-pac-sandbox.example.ps1");
const runnerStartExamplePath = path.join(root, "scripts", "local", "start-runner.local.example.ps1");
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

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function authorizedUser(role = "ASSISTANT_OPERATOR") {
  return {
    user_id: `USER-7-10E-${role}`,
    telegram_chat_id: "CHAT-7-10E",
    telegram_user_id: "TGUSER-7-10E",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseInput(text, role = "ASSISTANT_OPERATOR", extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 71050,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 71050,
    chat_id: "CHAT-7-10E",
    telegram_user_id: "TGUSER-7-10E",
    message_id: String((extra.update_id || 71050) + 100),
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

function assertNoSensitive(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert(!/(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}/.test(text), "telegram token");
  assert(!/(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*(?!\[redacted\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(text), "PAC secret");
  assert(!/(FACTURACOM_(?:API|SECRET)_KEY|FACTURACOM_PLUGIN)\s*=\s*(?!\[redacted\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(text), "PAC secret");
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production url");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF-|sendDocument|sendMediaGroup|sendPhoto/i.test(text), "document leak/send");
  assert(!/\b[A-Za-z]:[\\/][^\s"]+/.test(text), "absolute path");
  assert(!/\.env\.pac\.sandbox\.local=.*[A-Za-z0-9]{8,}/i.test(text), "env secret");
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("startup_examples_exist_and_are_safe", () => {
  assert(fs.existsSync(n8nStartExamplePath));
  assert(fs.existsSync(runnerStartExamplePath));
  const n8nText = fs.readFileSync(n8nStartExamplePath, "utf8");
  const runnerText = fs.readFileSync(runnerStartExamplePath, "utf8");
  assert(n8nText.includes(".env.pac.sandbox.local"));
  assert(n8nText.includes("NODE_OPTIONS = \"--dns-result-order=ipv4first\""));
  assert(n8nText.includes("NODE_FUNCTION_ALLOW_BUILTIN = \"fs,path\""));
  assert(n8nText.includes("N8N_PORT = \"5678\""));
  assert(n8nText.includes("N8N_RUNNERS_ENABLED = \"false\""));
  assert(n8nText.includes("sandbox.preflight"));
  assert(n8nText.includes("n8n-nodes-base.executeCommand"));
  assert(n8nText.includes("NODES_EXCLUDE"));
  assert(!/NODES_EXCLUDE\s*=\s*['\"][^'\"]*n8n-nodes-base\.executeCommand/i.test(n8nText));
  assert(runnerText.includes("runner/telegram-local-runner.js"));
  assert(runnerText.includes("--dns-result-order=ipv4first"));
  assertNoSensitive(n8nText + runnerText);
  return "examples";
});

check("local_ps1_ignored", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert(gitignore.includes("scripts/local/*.local.ps1"));
  return "ignored";
});

check("run_sandbox_action_stamp_error_stdout_json_estable", () => {
  const child = spawnSync(process.execPath, [
    "scripts/run-sandbox-action.js",
    "sandbox.draft.stamp",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      FACTURACOM_SANDBOX_LIVE: "1",
    },
  });
  assert.strictEqual(child.status, 0);
  assert.strictEqual(child.stderr.trim(), "");
  const parsed = JSON.parse(child.stdout);
  assert.strictEqual(parsed.action, "sandbox.draft.stamp");
  assert.strictEqual(parsed.status, "ERROR");
  assert(Array.isArray(parsed.errors));
  assert(parsed.errors.includes("DRAFT_NOT_FOUND"));
  assertNoSensitive(parsed);
  return parsed.status;
});

check("n8n_summary_stdout_invalido_diagnostico_claro", () => {
  const source = {
    update_id: 71051,
    max_seen_update_id: 71051,
    chat_id: "CHAT-7-10E",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-7-10E",
    callback_message_id: "88",
    requested_sandbox_action: "sandbox.draft.stamp",
    sandbox_draft_id: "DRAFT-7-10E",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
  };
  const result = executeCode(
    summaryCode,
    {
      stdout: "LOG SUELTO NO JSON C:/Users/Juandi Gamer/Documents/secret.xml",
      stderr: "stack trace with FACTURACOM_API_KEY=TEST_SECRET_VALUE",
      exitCode: 1,
    },
    () => [{ json: source }],
  );
  assert.strictEqual(result.sandbox_action_status, "ERROR");
  assert.strictEqual(result.sandbox_draft_status, "SANDBOX_ERROR");
  assert(result.telegram_message.includes("El Action Layer no devolvio JSON valido"));
  assert(result.telegram_message.includes("stdout del Action Layer"));
  assert.strictEqual(result.sandbox_action_summary.exit_code, 1);
  assert.strictEqual(result.sandbox_action_summary.diagnostics.stdout_present, true);
  assert.strictEqual(result.sandbox_action_summary.diagnostics.stderr_present, true);
  assertNoSensitive(result);
  return "diagnostic";
});

check("help_usuario_lista_comandos_principales_sin_admin", () => {
  const result = executeCode(handleCode, baseInput("/help", "ASSISTANT_OPERATOR", { update_id: 71052 }));
  const text = String(result.telegram_message || "");
  for (const expected of ["/start - Menu principal", "/help - Ayuda", "/factura - Crear borrador CFDI", "/clientes - Ver clientes", "/cliente TEXTO - Buscar cliente", "/nuevocliente - Crear cliente", "/validarcliente CLIENT_ID - Validar cliente", "/pendientes - Ver borradores pendientes", "/cancelar - Cancelar flujo actual"]) {
    assert(text.includes(expected), expected);
  }
  assert(!text.includes("/sandbox_menu"));
  assert(!text.includes("/debug"));
  assert(text.includes("Borrador sujeto a revision humana. No sustituye contador."));
  assertNoSensitive(text);
  return "user_help";
});

check("help_owner_separa_admin_sandbox", () => {
  const result = executeCode(handleCode, baseInput("/help", "OWNER", { update_id: 71053 }));
  const text = String(result.telegram_message || "");
  assert(text.includes("Comandos de usuario:"));
  assert(text.includes("Comandos OWNER/admin:"));
  assert(text.includes("/sandbox_menu - Consola PAC Sandbox local"));
  assert(text.includes("PAC Sandbox es solo para pruebas tecnicas"));
  assertNoSensitive(text);
  return "owner_help";
});

check("workflow_json_valido_y_no_envia_archivos", () => {
  JSON.parse(workflowText);
  assert(!/sendDocument|sendMediaGroup|sendPhoto|<\?xml|%PDF-/i.test(workflowText));
  return `${workflow.nodes.length} nodes`;
});

check("runtime_no_versionado", () => {
  const tracked = require("child_process").execFileSync("git", ["ls-files", "runtime"], { cwd: root, encoding: "utf8" });
  assert.strictEqual(tracked.trim(), "runtime/.gitkeep");
  return "runtime/.gitkeep";
});

(async () => {
  const results = await Promise.all(checks);
  console.log("Local Startup And Stamp Diagnostics Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
})();
