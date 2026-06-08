const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-download-pdf-visual-required");
const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function reset() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function draft() {
  return {
    draft_id: "DRAFT-PDF-VISUAL-REQUIRED",
    client_id: "CLI-REAL-BILBAO",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    current_client: { client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao" },
    sandbox_pac_summary: { cfdi_uid: "CFDIUID716", uuid: "00000000-0000-4000-8000-000000000716" },
  };
}

check("download_artifacts_does_not_copy_invalid_pdf_or_create_human_pdf_path", async () => {
  reset();
  const rawPdfPath = path.join(tempRoot, "adapter", "pdf", "cfdi.pdf");
  fs.mkdirSync(path.dirname(rawPdfPath), { recursive: true });
  fs.writeFileSync(rawPdfPath, "%PDF-1.4\n%%EOF");
  const result = await runSandboxDraftDownloadArtifacts({
    draft: draft(),
    storageRoot: tempRoot,
    adapter: {
      downloadXml: async () => ({
        ok: true,
        xml_downloaded: true,
        xml_content_valid: true,
        xml_storage_path: path.relative(root, path.join(tempRoot, "adapter", "xml", "cfdi.xml")).replace(/\\/g, "/"),
        xml_validation_status: "VALID",
        content_validation: { status: "VALID", ok: true },
      }),
      downloadPdf: async () => ({
        ok: false,
        status: "PAC_SANDBOX_ERROR",
        pdf_downloaded: true,
        pdf_content_valid: false,
        pdf_storage_path: path.relative(root, rawPdfPath).replace(/\\/g, "/"),
        pdf_validation_status: "PDF_VISUAL_CONTENT_MISSING",
        raw: { validation: { status: "PDF_VISUAL_CONTENT_MISSING", pdf_visual_content_present: false } },
        normalized_errors: [{ code: "FACTURACOM_SANDBOX_PDF_CONTENT_INVALID" }],
        normalized_warnings: [],
      }),
    },
  });
  assert.strictEqual(result.status, "PARTIAL_DOWNLOAD");
  assert.strictEqual(result.output.pdf_downloaded, false);
  assert.strictEqual(result.output.pdf_content_valid, false);
  assert.strictEqual(result.output.human_pdf_path, null);
  assert.strictEqual(result.output.sandbox_pac_summary.human_pdf_path, null);
  return result.output.pdf_validation_status;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Download PDF Visual Valid Required Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
