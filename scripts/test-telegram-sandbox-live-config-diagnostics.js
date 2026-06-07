const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function nodeCode(name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node.parameters.jsCode;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function assertSafe(text) {
  assert(!/APIKEY_PRIVATE|SECRET_PRIVATE|PLUGIN_PRIVATE|CLIENTUID_PRIVATE/i.test(text), "secret leaked");
  assert(!/[A-Za-z]:[\\/]/.test(text), "absolute path leaked");
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production url leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|sendDocument|sendMediaGroup/i.test(text), "document leaked");
}

check("telegram_stamp_needs_config_shows_safe_field_diagnostics", () => {
  const code = nodeCode("Build PAC Sandbox Action Summary");
  const stdout = JSON.stringify({
    ok: false,
    status: "NEEDS_CONFIG",
    action: "sandbox.draft.stamp",
    artifacts: [],
    warnings: [],
    errors: ["FACTURACOM_SANDBOX_API_KEY_REQUIRED", "FACTURACOM_SANDBOX_RECEIVER_UID_REQUIRED"],
    sensitive_findings: [],
    output: {
      error_class: "DRAFT_VALIDATION_ERROR",
      draft_id: "DRAFT-LIVE-DIAG-716B",
      client_display_name: "Cliente Demo",
      invoice_status: "APROBADO",
      payment_status: "NO_APLICA",
      validation_error_codes: ["FACTURACOM_SANDBOX_API_KEY_REQUIRED", "FACTURACOM_SANDBOX_RECEIVER_UID_REQUIRED"],
      pac_provider_config: {
        provider: "factura_com",
        environment: "SANDBOX",
        mode: "live",
        live_enabled: true,
        base_url_ok: true,
        credentials_present: false,
        plugin_present: true,
        receiver_uid_present: false,
        serie_present: true,
        config_source: "mixed",
        status: "NEEDS_CONFIG",
        missing: ["FACTURACOM_SANDBOX_API_KEY_REQUIRED", "FACTURACOM_SANDBOX_RECEIVER_UID_REQUIRED"],
        production_blocked: true,
        safe_diagnostics: {
          values: {
            "Modo live": "si",
            "Live habilitado": "si",
            "URL sandbox": "si",
            "API key": "faltante",
            "Secret key": "presente",
            "Plugin": "presente",
            "Receiver UID": "faltante",
            "Serie": "presente",
          },
        },
      },
    },
  });
  const result = executeCode(code, { stdout }, () => [{ json: { chat_id: "CHAT-DIAG", update_id: 716501, workflowVersion: "CFDI_LOCAL_INGEST_V1" } }]);
  const text = result.telegram_message;
  assert(text.includes("Factura.com Sandbox Live no configurado"));
  assert(text.includes("Configuracion detectada:"));
  assert(text.includes("- Modo live: si"));
  assert(text.includes("- API key: faltante"));
  assert(text.includes("- Secret key: presente"));
  assert(text.includes("- Receiver UID: faltante"));
  assert(text.includes("Fuente config: mixed"));
  assert(text.includes("Detalle tecnico seguro: FACTURACOM_SANDBOX_API_KEY_REQUIRED | FACTURACOM_SANDBOX_RECEIVER_UID_REQUIRED"));
  assert(!text.includes("FACTURACOM_SANDBOX_MODE=live"), "old generic assignment should not be shown");
  assertSafe(text);
  return "diagnostic";
});

check("workflow_does_not_embed_pac_credentials", () => {
  const raw = fs.readFileSync(workflowPath, "utf8");
  assert(!/FACTURACOM_API_KEY\\s*=|FACTURACOM_SECRET_KEY\\s*=|FACTURACOM_PLUGIN\\s*=|FACTURACOM_SANDBOX_RECEIVER_UID\\s*=/.test(raw), "workflow contains PAC credential assignment");
  assert(!/APIKEY_PRIVATE|SECRET_PRIVATE|PLUGIN_PRIVATE|CLIENTUID_PRIVATE/.test(raw), "workflow contains test secret");
  return "safe";
});

console.log("Telegram Sandbox Live Config Diagnostics Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
