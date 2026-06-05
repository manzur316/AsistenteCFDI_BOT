const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  reportSensitiveFindings,
  reviewSandboxLifecycleStorage,
} = require("./review-sandbox-lifecycle-storage");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-lifecycle-storage-review");
const storageRoot = path.join(tempRoot, "storage-sandbox");
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  const suffix = item.value ? ` (${item.value})` : "";
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${suffix}`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function relFromStorage(filePath) {
  return path.relative(storageRoot, filePath).replace(/\\/g, "/");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function createInvoiceFixture({
  invoiceDir,
  draftId,
  internalInvoiceId,
  status,
  hasCancel,
}) {
  const xmlContent = '<cfdi:Comprobante><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="00000000-0000-4000-8000-000000000555" /></cfdi:Complemento></cfdi:Comprobante>';
  const pdfContent = "%PDF-SANDBOX-DEMO%";
  const cancelContent = JSON.stringify({ ok: true, status: "cancelled", note: "sandbox" });
  const xmlPath = path.join(invoiceDir, "xml", `${draftId}-sandbox.xml`);
  const pdfPath = path.join(invoiceDir, "pdf", `${draftId}-sandbox.pdf`);
  const cancelPath = path.join(invoiceDir, "cancel", `${draftId}-cancel.json`);
  writeText(xmlPath, xmlContent);
  writeText(pdfPath, pdfContent);
  if (hasCancel) writeText(cancelPath, cancelContent);

  const artifacts = [
    {
      type: "CFDI_XML",
      category: "xml",
      storage_path: relFromStorage(xmlPath),
      invoice_relative_path: `xml/${path.basename(xmlPath)}`,
      sha256: sha256Text(xmlContent),
      bytes: Buffer.byteLength(xmlContent),
      ok: true,
    },
    {
      type: "CFDI_PDF",
      category: "pdf",
      storage_path: relFromStorage(pdfPath),
      invoice_relative_path: `pdf/${path.basename(pdfPath)}`,
      sha256: sha256Text(pdfContent),
      bytes: Buffer.byteLength(pdfContent),
      ok: true,
    },
  ];
  if (hasCancel) {
    artifacts.push({
      type: "CFDI_CANCEL_RESPONSE",
      category: "cancel",
      storage_path: relFromStorage(cancelPath),
      invoice_relative_path: `cancel/${path.basename(cancelPath)}`,
      sha256: sha256Text(cancelContent),
      bytes: Buffer.byteLength(cancelContent),
      ok: true,
    });
  }

  writeJson(path.join(invoiceDir, "manifest.json"), {
    schema_version: "sandbox_storage_invoice.v1",
    generated_at: "2026-06-05T12:00:00.000Z",
    pac_provider: "factura.com",
    pac_environment: "SANDBOX",
    status,
    identity_status: "COMPLETE",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-PRIVADA-RIVERA",
    year: "2026",
    month: "06",
    draft_id: draftId,
    invoice_id: internalInvoiceId,
    storage_invoice_id: internalInvoiceId,
    internal_invoice_id: internalInvoiceId,
    cfdi_uid: "CFDI-UID-SENSITIVE-DEMO",
    uuid: "00000000-0000-4000-8000-000000000555",
    pac_invoice_id: "PAC-UID-SENSITIVE-DEMO",
    has_xml: true,
    has_pdf: true,
    has_cancel_response: hasCancel,
    artifacts,
  });
  writeJson(path.join(invoiceDir, "canonical-summary.json"), {
    draft_id: draftId,
    status,
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA",
  });
  writeJson(path.join(invoiceDir, "status-history.json"), [
    { timestamp: "2026-06-05T12:00:00.000Z", status: "SANDBOX_TIMBRADO" },
    ...(hasCancel ? [{ timestamp: "2026-06-05T12:30:00.000Z", status: "SANDBOX_CANCELADO" }] : []),
  ]);
  writeJson(path.join(invoiceDir, "checksums.json"), Object.fromEntries(artifacts.map((artifact) => [artifact.invoice_relative_path, artifact.sha256])));
}

function createFixture() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  const createdDir = path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-PRIVADA-RIVERA", "invoices", "DRAFT-000123");
  const cancelledDir = path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-PRIVADA-RIVERA", "invoices", "DRAFT-000124");
  createInvoiceFixture({
    invoiceDir: createdDir,
    draftId: "DRAFT-000123",
    internalInvoiceId: "INV-000123",
    status: "CREATED",
    hasCancel: false,
  });
  createInvoiceFixture({
    invoiceDir: cancelledDir,
    draftId: "DRAFT-000124",
    internalInvoiceId: "INV-000124",
    status: "CANCELLED",
    hasCancel: true,
  });
  writeJson(path.join(storageRoot, "draft-stamps", "DRAFT-000125", "sandbox-stamp-manifest.json"), {
    draft_id: "DRAFT-000125",
    status: "SANDBOX_TIMBRADO",
  });
  writeJson(path.join(storageRoot, "draft-cancellations", "DRAFT-000125", "sandbox-cancel-response.json"), {
    draft_id: "DRAFT-000125",
    status: "SANDBOX_CANCELADO",
  });
}

createFixture();
let result = null;

check("review_generates_safe_reports", () => {
  result = reviewSandboxLifecycleStorage({ storageRoot });
  assert.strictEqual(result.ok, true, result.errors.join(", "));
  assert(fs.existsSync(path.join(storageRoot, "reports", "lifecycle-storage-review.json")));
  assert(fs.existsSync(path.join(storageRoot, "reports", "lifecycle-storage-review.md")));
  return `${result.total_documents} docs`;
});

check("indexes_by_lifecycle_status_period_client", () => {
  assert.strictEqual(result.indexes.by_status.SANDBOX_TIMBRADO, 1);
  assert.strictEqual(result.indexes.by_status.SANDBOX_CANCELADO, 1);
  assert.strictEqual(result.indexes.by_period["2026-06"], 2);
  assert.strictEqual(result.indexes.by_client["CLIENT-PRIVADA-RIVERA"], 2);
  assert.strictEqual(result.indexes.by_draft_id["DRAFT-000123"], 1);
  return JSON.stringify(result.indexes.by_status);
});

check("cancel_does_not_delete_original_artifacts", () => {
  const cancelled = result.documents.find((document) => document.status === "SANDBOX_CANCELADO");
  assert(cancelled);
  assert.strictEqual(cancelled.has_xml, true);
  assert.strictEqual(cancelled.has_pdf, true);
  assert.strictEqual(cancelled.has_cancel_response, true);
  assert.strictEqual(cancelled.warnings.length, 0);
  assert(fs.existsSync(path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-PRIVADA-RIVERA", "invoices", "DRAFT-000124", "xml", "DRAFT-000124-sandbox.xml")));
  assert(fs.existsSync(path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-PRIVADA-RIVERA", "invoices", "DRAFT-000124", "pdf", "DRAFT-000124-sandbox.pdf")));
  return "xml/pdf preserved";
});

check("checksums_are_indexed_without_contents", () => {
  const records = result.documents.flatMap((document) => document.checksum_records);
  assert(records.length >= 5);
  assert(records.every((record) => /^[a-f0-9]{64}$/.test(record.sha256)));
  const reportJson = fs.readFileSync(path.join(storageRoot, "reports", "lifecycle-storage-review.json"), "utf8");
  assert(!reportJson.includes("<cfdi:Comprobante"));
  assert(!reportJson.includes("%PDF"));
  return `${records.length} checksums`;
});

check("human_readable_names_do_not_expose_rfc_uuid_or_uid", () => {
  const names = result.documents.flatMap((document) => Object.values(document.human_readable_names));
  assert(names.length >= 3);
  for (const name of names) {
    assert(!/XAXX010101000|00000000-0000-4000-8000-000000000555|CFDI-UID|PAC-UID|CLIENT-UID/i.test(name));
    assert(!/[\\/]/.test(name));
  }
  return names[0];
});

check("generated_reports_have_no_sensitive_values", () => {
  const reportJson = fs.readFileSync(path.join(storageRoot, "reports", "lifecycle-storage-review.json"), "utf8");
  const reportMd = fs.readFileSync(path.join(storageRoot, "reports", "lifecycle-storage-review.md"), "utf8");
  const findings = [
    ...reportSensitiveFindings(reportJson),
    ...reportSensitiveFindings(reportMd),
  ];
  assert.strictEqual(findings.length, 0, findings.join(", "));
  assert(!reportJson.includes("CFDI-UID-SENSITIVE-DEMO"));
  assert(!reportJson.includes("PAC-UID-SENSITIVE-DEMO"));
  assert(!reportJson.includes("00000000-0000-4000-8000-000000000555"));
  assert(!/[A-Za-z]:[\\/]/.test(reportJson));
  return "clean";
});

check("legacy_action_layer_artifacts_are_counted", () => {
  assert.strictEqual(result.legacy_action_layer.draft_stamp_manifests, 1);
  assert.strictEqual(result.legacy_action_layer.draft_cancel_responses, 1);
  return JSON.stringify(result.legacy_action_layer);
});

check("runtime_test_fixture_is_not_versioned", () => {
  const runtimeStatus = git(["status", "--short", "--", "runtime"]);
  assert.strictEqual(runtimeStatus.length, 0, runtimeStatus.join(", "));
  return "runtime ignored";
});

check("protected_catalog_and_workflows_not_modified", () => {
  const changed = [
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--cached", "--name-only"]),
  ];
  assert(!changed.includes("data/concepts.normalized.json"));
  assert(!changed.some((file) => file.startsWith("workflow/")));
  return "protected clean";
});

console.log("Sandbox Lifecycle Storage Review Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}
