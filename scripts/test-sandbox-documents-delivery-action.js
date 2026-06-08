const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  runSandboxDocumentDeliveryDiagnose,
  runSandboxDocumentDeliverySend,
} = require("./lib/sandbox-document-delivery-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-documents-delivery-action");
const checks = [];
let fixtureCounter = 0;

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

if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

const VALID_XML = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>";
const VALID_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);
const BLANK_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 1 >>\nstream\n \nendstream\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);

function writeFiles({ blankPdf = false } = {}) {
  fixtureCounter += 1;
  const dir = path.join(tempRoot, `case-${fixtureCounter}`, "exports");
  fs.mkdirSync(dir, { recursive: true });
  const xml = path.join(dir, "Real-Bilbao_2026-06-08_F-24_SANDBOX.xml");
  const pdf = path.join(dir, "Real-Bilbao_2026-06-08_F-24_SANDBOX.pdf");
  fs.writeFileSync(xml, VALID_XML);
  fs.writeFileSync(pdf, blankPdf ? BLANK_PDF : VALID_PDF);
  return {
    xml: path.relative(root, xml).replace(/\\/g, "/"),
    pdf: path.relative(root, pdf).replace(/\\/g, "/"),
  };
}

function draft({ files = writeFiles(), email = null } = {}) {
  return {
    draft_id: "DRAFT-DOC-DELIVERY-716",
    client_id: "CLI-REAL-BILBAO",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    total: 1160,
    current_client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      email,
      email_confirmed: Boolean(email),
    },
    sandbox_pac_summary: {
      artifact_status: "DOWNLOADED",
      human_xml_path: files.xml,
      human_pdf_path: files.pdf,
      cfdi_uid: "CFDIUID716",
      uuid: "00000000-0000-4000-8000-000000000716",
    },
  };
}

check("diagnose_reports_valid_documents_and_telegram_config", () => {
  const result = runSandboxDocumentDeliveryDiagnose({
    draft: draft(),
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
      TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.documents_valid, true);
  assert.strictEqual(result.output.pdf_visual_content_present, true);
  assert.strictEqual(result.output.telegram_delivery_ready, true);
  const raw = JSON.stringify(result);
  assert(!/TEST_TOKEN_NOT_REAL|123456789|00000000-0000-4000-8000-000000000716/.test(raw), "sensitive value leaked");
  return result.output.channel;
});

check("send_dry_run_blocks_blank_pdf", async () => {
  const result = await runSandboxDocumentDeliverySend({
    draft: draft({ files: writeFiles({ blankPdf: true }) }),
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    dryRun: true,
  });
  assert.strictEqual(result.status, "BLOCKED_INVALID_DOCUMENTS");
  assert.strictEqual(result.output.pdf_content_valid, false);
  assert.strictEqual(result.output.pdf_validation_status, "PDF_VISUAL_CONTENT_MISSING");
  return result.status;
});

check("send_dry_run_uses_human_files_without_sending", async () => {
  const result = await runSandboxDocumentDeliverySend({
    draft: draft(),
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    dryRun: true,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
      TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.delivery.status, "DRY_RUN");
  assert.strictEqual(result.output.delivery.files_valid, true);
  assert(result.output.delivery.files.some((item) => item.path.endsWith("Real-Bilbao_2026-06-08_F-24_SANDBOX.pdf")));
  return result.output.delivery.status;
});

check("diagnose_hydrates_files_from_latest_download_manifest", () => {
  const files = writeFiles();
  const draftId = "DRAFT-MANIFEST-HYDRATE-716";
  const manifestDir = path.join(tempRoot, "draft-stamps", draftId, "2026-06-08T15-00-00-000Z");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, "sandbox-download-manifest.json"), JSON.stringify({
    draft_id: draftId,
    human_xml_path: files.xml,
    human_pdf_path: files.pdf,
  }, null, 2));
  const result = runSandboxDocumentDeliveryDiagnose({
    draft: {
      draft_id: draftId,
      client_id: "CLI-REAL-BILBAO",
      current_client: {
        client_id: "CLI-REAL-BILBAO",
        email: "cliente.real@example.com",
        email_confirmed: true,
        provider_email_sync_status: "SYNCED",
      },
      sandbox_pac_summary: {},
    },
    storageRoot: tempRoot,
    channel: "PROVIDER_EMAIL",
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.documents_valid, true);
  assert.strictEqual(result.output.pdf_content_valid, true);
  return result.status;
});

check("diagnose_merges_db_xml_with_manifest_pdf_when_db_pdf_missing", () => {
  const files = writeFiles();
  const draftId = "DRAFT-MANIFEST-MERGE-716";
  const manifestDir = path.join(tempRoot, "draft-stamps", draftId, "2026-06-08T15-10-00-000Z");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, "sandbox-download-manifest.json"), JSON.stringify({
    draft_id: draftId,
    human_xml_path: files.xml,
    human_pdf_path: files.pdf,
  }, null, 2));
  const result = runSandboxDocumentDeliveryDiagnose({
    draft: {
      draft_id: draftId,
      client_id: "CLI-REAL-BILBAO",
      current_client: {
        client_id: "CLI-REAL-BILBAO",
        email: "cliente.real@example.com",
        email_confirmed: true,
        provider_email_sync_status: "SYNCED",
      },
      sandbox_pac_summary: { human_xml_path: files.xml, human_pdf_path: "" },
    },
    storageRoot: tempRoot,
    channel: "PROVIDER_EMAIL",
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.xml_content_valid, true);
  assert.strictEqual(result.output.pdf_content_valid, true);
  return result.status;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Documents Delivery Action Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
