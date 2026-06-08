const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-download-no-client-storage");
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

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function draft() {
  return {
    draft_id: "DRAFT-NO-CLIENT-STORAGE-716",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-NO-STORAGE",
    total: 1160,
    current_client: { client_id: "CLIENT-NO-STORAGE", display_name: "Cliente Demo" },
    sandbox_pac_summary: {
      cfdi_uid: "CFDIUIDNOSTORAGE716",
      uuid: "00000000-0000-4000-8000-000000000716",
      pac_invoice_id: "CFDIUIDNOSTORAGE716",
    },
  };
}

function env() {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
  };
}

async function requestFn(request) {
  if (request.path.endsWith("/xml")) {
    return { ok: true, status: 200, statusText: "OK", contentType: "application/xml", rawText: "CFDI XML", data: "CFDI XML" };
  }
  return { ok: true, status: 200, statusText: "OK", contentType: "application/pdf", rawBuffer: Buffer.from("CFDI PDF", "utf8") };
}

check("invalid_download_does_not_write_client_invoice_storage", async () => {
  cleanTemp();
  const result = await runSandboxDraftDownloadArtifacts({
    draft: draft(),
    env: env(),
    storageRoot: tempRoot,
    now: new Date("2026-06-08T12:00:00.000Z"),
    adapterContext: { requestFn },
  });
  assert.strictEqual(result.status, "ERROR");
  assert.strictEqual(result.output.artifact_status, "DOWNLOAD_ERROR");
  assert.strictEqual(result.output.storage_updated, false);
  assert.strictEqual(result.output.client_storage_manifest_path, null);
  assert.strictEqual(result.output.xml_downloaded, false);
  assert.strictEqual(result.output.pdf_downloaded, false);
  assert.strictEqual(result.output.xml_content_valid, false);
  assert.strictEqual(result.output.pdf_content_valid, false);
  assert(result.errors.includes("FACTURACOM_SANDBOX_XML_CONTENT_INVALID"));
  assert(result.errors.includes("FACTURACOM_SANDBOX_PDF_CONTENT_INVALID"));
  const clientStorage = path.join(tempRoot, "emitters");
  assert(!fs.existsSync(clientStorage), "client storage tree should not exist for invalid artifacts");
  const xmlFiles = fs.existsSync(tempRoot)
    ? fs.readdirSync(tempRoot, { recursive: true }).filter((item) => String(item).endsWith("cfdi.xml"))
    : [];
  const pdfFiles = fs.existsSync(tempRoot)
    ? fs.readdirSync(tempRoot, { recursive: true }).filter((item) => String(item).endsWith("cfdi.pdf"))
    : [];
  assert.strictEqual(xmlFiles.length, 0, "invalid XML artifact file was written");
  assert.strictEqual(pdfFiles.length, 0, "invalid PDF artifact file was written");
  return result.output.artifact_status;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Download No Client Storage For Invalid Content Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
