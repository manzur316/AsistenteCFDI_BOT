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
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function nodeCode(name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node.parameters.jsCode;
}

function runSummary(stdout, source = {}) {
  const code = nodeCode("Build PAC Sandbox Action Summary");
  const fn = new Function("$json", "$items", "$itemIndex", code);
  return fn({ stdout }, () => [{ json: source }], 0)[0].json;
}

function assertSafe(text) {
  assert(!/Factura.com Sandbox Live no configurado/.test(text), "must not show live config missing message");
  assert(!/Sandbox Operativo Live debe resolver configuracion local/.test(text), "must not blame live config");
  assert(!/UID-REAL-BILBAO-SECRET|PRB150731II8/.test(text), "sensitive identity leaked");
  assert(!/SANDBOXKEYLOCAL123|SANDBOXSECRETLOCAL123|SANDBOXPLUGINLOCAL123/.test(text), "credentials leaked");
  assert(!/[A-Za-z]:[\\/]/.test(text), "absolute path leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|sendDocument|sendMediaGroup/i.test(text), "document content or file send leaked");
}

check("payload_unresolved_message_is_human_and_not_config_missing", () => {
  const result = runSummary(JSON.stringify({
    ok: false,
    status: "NEEDS_CONFIG",
    action: "sandbox.draft.stamp",
    artifacts: [],
    warnings: [],
    errors: ["FACTURACOM_SANDBOX_PAYLOAD_UNRESOLVED"],
    sensitive_findings: [],
    output: {
      error_class: "FACTURACOM_SANDBOX_PAYLOAD_UNRESOLVED",
      draft_id: "DRAFT-PAYLOAD-UNRESOLVED",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_ERROR",
      payment_status: "NO_APLICA",
      total: 1160,
      pac_provider_config: {
        status: "OK",
        mode: "live",
        live_enabled: true,
        credentials_present: true,
        plugin_present: true,
        receiver_uid_present: true,
        serie_present: true,
      },
      provider_client_link_status: "FOUND",
      provider_client_uid_source: "provider_client_links",
      provider_client_link: {
        provider: "factura_com",
        environment: "SANDBOX",
        provider_client_uid_present: true,
        sync_status: "MANUAL_LINKED",
      },
      payload_unresolved_fields_present: true,
      payload_unresolved_fields_count: 1,
      payload_unresolved_fields: [
        "LOCAL_USO_CFDI_NOT_IN_SAT_CATALOG: UsoCFDI invalido: G1. Usa clave SAT completa, por ejemplo G01 si corresponde.",
      ],
      local_config_errors: ["LOCAL_USO_CFDI_NOT_IN_SAT_CATALOG"],
      local_config_warnings: [],
      receptor_compatibility: {
        compatibility_status: "FAIL",
        effective_uso_cfdi: "G1",
        effective_regimen_fiscal_receptor: "601",
        effective_person_type: "PM",
        client_uid_present: true,
      },
    },
  }), {
    chat_id: "123",
    update_id: 71616,
    max_seen_update_id: 71616,
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    sandbox_draft_id: "DRAFT-PAYLOAD-UNRESOLVED",
  });
  assert(/No se pudo timbrar sandbox/.test(result.telegram_message));
  assert(/conexion con Factura.com Sandbox esta configurada/.test(result.telegram_message));
  assert(/cliente esta vinculado/.test(result.telegram_message));
  assert(/payload fiscal todavia tiene campos pendientes o incompatibles/.test(result.telegram_message));
  assert(/UsoCFDI/.test(result.telegram_message));
  assert(/Regimen fiscal receptor/.test(result.telegram_message));
  assert(/FormaPago \/ MetodoPago/.test(result.telegram_message));
  assert(/LugarExpedicion/.test(result.telegram_message));
  assert(/Serie/.test(result.telegram_message));
  assert(/UsoCFDI invalido: G1/.test(result.telegram_message));
  assert(/Borrador sujeto a revision humana/.test(result.telegram_message));
  assertSafe(result.telegram_message);
  return result.sandbox_action_status;
});

console.log("Telegram sandbox payload unresolved message tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
