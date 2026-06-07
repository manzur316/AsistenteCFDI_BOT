const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function workflowNode(name) {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  return workflow.nodes.find((node) => node.name === name);
}

function runSummary(stdout, source = {}) {
  const code = workflowNode("Build PAC Sandbox Action Summary").parameters.jsCode;
  const fn = new Function("$json", "$items", "$itemIndex", code);
  const items = () => [{ json: source }];
  return fn({ stdout }, items, 0)[0].json;
}

function actionStdout(output = {}) {
  return JSON.stringify({
    ok: true,
    status: "OK",
    action: "sandbox.draft.download-artifacts",
    duration_ms: 120,
    artifacts: [
      { key: "output.xml_storage_path", path: "runtime/storage-sandbox/draft-stamps/DRAFT/downloads/xml/cfdi.xml" },
      { key: "output.pdf_storage_path", path: "runtime/storage-sandbox/draft-stamps/DRAFT/downloads/pdf/cfdi.pdf" },
    ],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-20260607-716",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      provider: "Factura.com Sandbox",
      xml_downloaded: true,
      pdf_downloaded: true,
      storage_updated: true,
      xml_storage_path: "runtime/storage-sandbox/draft-stamps/DRAFT/downloads/xml/cfdi.xml",
      pdf_storage_path: "runtime/storage-sandbox/draft-stamps/DRAFT/downloads/pdf/cfdi.pdf",
      xml_sha256: "a".repeat(64),
      pdf_sha256: "b".repeat(64),
      uuid: "00000000-0000-4000-8000-000000000716",
      cfdi_uid: "CFDIUID716",
      sandbox_pac_summary: {
        uuid: "00000000-0000-4000-8000-000000000716",
        cfdi_uid: "CFDIUID716",
        xml_downloaded: true,
        pdf_downloaded: true,
      },
      ...output,
    },
  });
}

function assertSafeTelegramText(text) {
  assert(/Descarga sandbox completada/.test(text), "download heading missing");
  assert(/XML descargado: si/.test(text), "xml downloaded label missing");
  assert(/PDF descargado: si/.test(text), "pdf downloaded label missing");
  assert(/Storage local: actualizado/.test(text), "storage label missing");
  assert(/No se envian documentos por Telegram/.test(text), "no documents warning missing");
  assert(!/[A-Za-z]:[\\/]/.test(text), "absolute path leaked");
  assert(!/00000000-0000-4000-8000-000000000716|CFDIUID716/i.test(text), "UUID/UID leaked");
  assert(!/runtime\\/i.test(text), "runtime path leaked");
  assert(!/<\\?xml|<cfdi:Comprobante|%PDF|sendDocument|sendMediaGroup/i.test(text), "document content or file send leaked");
  assert(!/XAXX010101000|[A-Z&Ñ]{3,4}\\d{6}[A-Z0-9]{3}/i.test(text), "RFC leaked");
}

check("download_summary_is_safe_and_human_readable", () => {
  const result = runSummary(actionStdout(), {
    chat_id: "123",
    update_id: 71601,
    max_seen_update_id: 71601,
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    sandbox_draft_id: "DRAFT-20260607-716",
    sandbox_draft_context: {
      draft_id: "DRAFT-20260607-716",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
    },
  });
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
  assert.strictEqual(result.sandbox_action_status, "OK");
  assert.strictEqual(result.sandbox_draft_status, "SANDBOX_TIMBRADO");
  assertSafeTelegramText(result.telegram_message);
  assert(!/payment_status\\s*=/.test(result.persistence_sql), "download action must not update payment_status");
  assert(/sandbox_pac_summary/.test(result.persistence_sql), "sandbox_pac_summary should be persisted");
  return "safe";
});

check("stamp_summary_says_pending_download_not_downloaded", () => {
  const result = runSummary(JSON.stringify({
    ok: true,
    status: "OK",
    action: "sandbox.draft.stamp",
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-STAMP-716",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      pac_result: {
        live_mode: true,
        uuid_present: true,
        cfdi_uid_present: true,
        xml_provider_available: true,
        pdf_provider_available: true,
        xml_downloaded: false,
        pdf_downloaded: false,
      },
    },
  }), {
    chat_id: "123",
    update_id: 71602,
    max_seen_update_id: 71602,
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    sandbox_draft_id: "DRAFT-STAMP-716",
  });
  assert(/XML disponible: pendiente de descarga/.test(result.telegram_message));
  assert(/PDF disponible: pendiente de descarga/.test(result.telegram_message));
  assert(!/XML descargado: si/.test(result.telegram_message));
  assert(!/[A-Za-z]:[\\/]/.test(result.telegram_message), "absolute path leaked");
  assert(!/00000000-0000-4000-8000-000000000716|CFDIUID716/i.test(result.telegram_message), "UUID/UID leaked");
  assert(!/runtime\\/i.test(result.telegram_message), "runtime path leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|sendDocument|sendMediaGroup/i.test(result.telegram_message), "document content or file send leaked");
  return "pending";
});

Promise.all(checks).then((results) => {
  console.log("Telegram Sandbox Download Summary Security Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
