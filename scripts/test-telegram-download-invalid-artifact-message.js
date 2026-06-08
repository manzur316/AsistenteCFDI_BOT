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
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function runSummary(stdout, source = {}) {
  const code = workflowNode("Build PAC Sandbox Action Summary").parameters.jsCode;
  const fn = new Function("$json", "$items", "$itemIndex", code);
  const items = () => [{ json: source }];
  return fn({ stdout }, items, 0)[0].json;
}

function countMatches(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

check("invalid_artifact_content_has_human_download_message", () => {
  const result = runSummary(JSON.stringify({
    ok: false,
    status: "ERROR",
    action: "sandbox.draft.download-artifacts",
    artifacts: [],
    warnings: [],
    errors: [
      "FACTURACOM_SANDBOX_XML_CONTENT_INVALID",
      "FACTURACOM_SANDBOX_PDF_CONTENT_INVALID",
    ],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-20260608-716",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      provider: "Factura.com Sandbox",
      artifact_status: "DOWNLOAD_ERROR",
      xml_downloaded: false,
      pdf_downloaded: false,
      xml_content_valid: false,
      pdf_content_valid: false,
      xml_validation_status: "INVALID_PLACEHOLDER",
      pdf_validation_status: "INVALID_PLACEHOLDER",
      storage_updated: false,
      uuid: "00000000-0000-4000-8000-000000000716",
      cfdi_uid: "CFDIUID716",
    },
  }), {
    chat_id: "123",
    update_id: 7160801,
    max_seen_update_id: 7160801,
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    sandbox_draft_id: "DRAFT-20260608-716",
    sandbox_draft_context: {
      draft_id: "DRAFT-20260608-716",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
    },
  });
  const text = result.telegram_message;
  assert(/Descarga sandbox no valida/.test(text), "invalid heading missing");
  assert(/Factura\.com Sandbox respondio/i.test(text), "provider response explanation missing");
  assert(/no parece ser un XML\/PDF CFDI valido/i.test(text), "invalid content explanation missing");
  assert(/XML valido: no/.test(text), "xml valid no missing");
  assert(/PDF valido: no/.test(text), "pdf valid no missing");
  assert(/Storage local: no actualizado/.test(text), "storage not updated missing");
  assert(/No se enviaron documentos/.test(text), "no documents sent warning missing");
  assert(!/Descarga sandbox OK|Descarga sandbox completada/.test(text), "invalid content must not look successful");
  assert(!/Warnings: none|Sensitive findings: 0/.test(text), "empty diagnostics leaked");
  assert(!/FACTURACOM_SANDBOX_XML_CONTENT_INVALID|FACTURACOM_SANDBOX_PDF_CONTENT_INVALID/.test(text), "raw internal errors leaked");
  assert.strictEqual(countMatches(text, /No se enviaron documentos|No se envian documentos por Telegram/g), 1, "document warning duplicated");
  assert.strictEqual(countMatches(text, /Borrador sujeto a revision humana\. No sustituye contador\./g), 1, "human warning duplicated");
  assert(!/[A-Za-z]:[\\/]/.test(text), "absolute path leaked");
  assert(!/00000000-0000-4000-8000-000000000716|CFDIUID716/i.test(text), "UUID/UID leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|\.xml|\.pdf|\.zip|\.xlsx|\.csv|\.json/i.test(text), "document content/reference leaked");
  assert(!/[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/i.test(text), "RFC leaked");
  return result.sandbox_action_status;
});

Promise.all(checks).then((results) => {
  console.log("Telegram Download Invalid Artifact Message Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
