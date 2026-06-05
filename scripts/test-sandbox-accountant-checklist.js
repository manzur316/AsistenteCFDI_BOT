const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  HUMAN_REVIEW_NOTICE,
} = require("./lib/sandbox-accountant-package");
const {
  analyzeChecklist,
  assertChecklistSafe,
  buildAccountantValidationChecklist,
} = require("./lib/sandbox-accountant-checklist");
const { generateReports } = require("./generate-sandbox-monthly-report");
const { generateAccountantPackage } = require("./generate-sandbox-accountant-package");
const { generateAccountantExcel } = require("./generate-sandbox-accountant-excel");
const { generateAccountantChecklist } = require("./generate-sandbox-accountant-checklist");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-accountant-checklist");
const storageRoot = path.join(tempRoot, "storage-sandbox");
const reportRoot = path.join(tempRoot, "reports-sandbox");
const packageRoot = path.join(tempRoot, "accountant-packages-sandbox");
const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value), "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function xml({ serie, folio, subtotal, iva, total, uuid }) {
  return `<cfdi:Comprobante Version="4.0" Serie="${serie}" Folio="${folio}" Fecha="2026-06-04T10:00:00" SubTotal="${subtotal}" Total="${total}">`
    + `<cfdi:Impuestos TotalImpuestosTrasladados="${iva}" />`
    + `<cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}" /></cfdi:Complemento>`
    + "</cfdi:Comprobante>";
}

function invoiceDir(invoiceId, clientId = "CLIENT-A") {
  return path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", clientId, "invoices", invoiceId);
}

function writeInvoice(invoice) {
  const dir = invoiceDir(invoice.invoice_id, invoice.client_id);
  const artifacts = [];
  if (invoice.xml) {
    const xmlPath = path.join(dir, "xml", `${invoice.invoice_id}.xml`);
    writeText(xmlPath, invoice.xml);
    artifacts.push({
      type: "CFDI_XML",
      category: "xml",
      storage_path: relFromStorage(xmlPath),
      invoice_relative_path: `xml/${invoice.invoice_id}.xml`,
      sha256: "a".repeat(64),
      bytes: invoice.xml.length,
      ok: true,
    });
  }
  if (invoice.pdf) {
    const pdfPath = path.join(dir, "pdf", `${invoice.invoice_id}.pdf`);
    writeText(pdfPath, invoice.pdf);
    artifacts.push({
      type: "CFDI_PDF",
      category: "pdf",
      storage_path: relFromStorage(pdfPath),
      invoice_relative_path: `pdf/${invoice.invoice_id}.pdf`,
      sha256: "b".repeat(64),
      bytes: invoice.pdf.length,
      ok: true,
    });
  }
  if (invoice.cancel) {
    const cancelPath = path.join(dir, "cancel", `${invoice.invoice_id}-cancel.json`);
    writeJson(cancelPath, { ok: true, status: "cancelled", reason: "sandbox" });
    artifacts.push({
      type: "CFDI_CANCEL_RESPONSE",
      category: "cancel",
      storage_path: relFromStorage(cancelPath),
      invoice_relative_path: `cancel/${invoice.invoice_id}-cancel.json`,
      sha256: "c".repeat(64),
      bytes: 20,
      ok: true,
    });
  }
  writeJson(path.join(dir, "manifest.json"), {
    schema_version: "sandbox_storage_invoice.v1",
    generated_at: "2026-06-04T10:01:00.000Z",
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA",
    pac_provider: "factura.com",
    pac_environment: "SANDBOX",
    status: invoice.status,
    identity_status: invoice.identity_status,
    emitter_id: "EMITTER-DEMO",
    client_id: invoice.client_id,
    year: "2026",
    month: "06",
    draft_id: invoice.draft_id,
    invoice_id: invoice.invoice_id,
    cfdi_uid: invoice.cfdi_uid,
    uuid: invoice.uuid,
    serie: invoice.serie,
    folio: invoice.folio,
    cancel_status: invoice.cancel ? "OK" : null,
    has_xml: Boolean(invoice.xml),
    has_pdf: Boolean(invoice.pdf),
    has_cancel_response: Boolean(invoice.cancel),
    artifacts,
  });
  return {
    manifest_path: relFromStorage(path.join(dir, "manifest.json")),
    invoice_id: invoice.invoice_id,
    draft_id: invoice.draft_id,
    emitter_id: "EMITTER-DEMO",
    client_id: invoice.client_id,
    year: "2026",
    month: "06",
    status: invoice.status,
    identity_status: invoice.identity_status,
    cfdi_uid: invoice.cfdi_uid,
    uuid: invoice.uuid,
    has_xml: Boolean(invoice.xml),
    has_pdf: Boolean(invoice.pdf),
    has_cancel_response: Boolean(invoice.cancel),
  };
}

function createFixture() {
  cleanTemp();
  const documents = [
    writeInvoice({
      invoice_id: "CFDI-CREATED",
      draft_id: "DRAFT-CREATED",
      client_id: "CLIENT-A",
      status: "CREATED",
      identity_status: "COMPLETE",
      cfdi_uid: "CFDI-CREATED",
      uuid: "11111111-1111-4111-8111-111111111111",
      serie: "A",
      folio: "1",
      xml: xml({
        serie: "A",
        folio: "1",
        subtotal: "1000.00",
        iva: "160.00",
        total: "1160.00",
        uuid: "11111111-1111-4111-8111-111111111111",
      }),
      pdf: "%PDF-SANDBOX-FIXTURE%",
    }),
    writeInvoice({
      invoice_id: "CFDI-CANCELLED",
      draft_id: "DRAFT-CANCELLED",
      client_id: "CLIENT-A",
      status: "CANCELLED",
      identity_status: "COMPLETE",
      cfdi_uid: "CFDI-CANCELLED",
      uuid: "22222222-2222-4222-8222-222222222222",
      serie: "A",
      folio: "2",
      xml: xml({
        serie: "A",
        folio: "2",
        subtotal: "500.00",
        iva: "80.00",
        total: "580.00",
        uuid: "22222222-2222-4222-8222-222222222222",
      }),
      cancel: true,
    }),
    writeInvoice({
      invoice_id: "CFDI-ERROR",
      draft_id: "DRAFT-ERROR",
      client_id: "CLIENT-B",
      status: "ERROR",
      identity_status: "MISSING",
      cfdi_uid: null,
      uuid: null,
      serie: null,
      folio: null,
    }),
  ];
  writeJson(path.join(storageRoot, "reports", "storage-index.json"), {
    schema_version: "sandbox_storage.v1.index",
    generated_at: "2026-06-04T10:02:00.000Z",
    storage_root: "runtime/test-sandbox-accountant-checklist/storage-sandbox",
    document_count: documents.length,
    documents,
  });
  writeJson(path.join(storageRoot, "reports", "storage-summary.json"), {
    schema_version: "sandbox_storage.v1.summary",
    total_documents: documents.length,
  });
  const reportResult = generateReports({ storageRoot, reportRoot, period: "2026-06" });
  assert.strictEqual(reportResult.ok, true);
  const packageResult = generateAccountantPackage({ reportRoot, storageRoot, packageRoot, period: "2026-06" });
  assert.strictEqual(packageResult.ok, true);
  const excelResult = generateAccountantExcel({ packageRoot, period: "2026-06" });
  assert.strictEqual(excelResult.ok, true);
}

function packageDir() {
  return path.join(packageRoot, "2026-06", "package");
}

function zipPath() {
  return path.join(packageRoot, "2026-06", "accountant-package-2026-06.zip");
}

function zipText() {
  return fs.readFileSync(zipPath()).toString("latin1");
}

createFixture();

let checklistResult;
let checklist;
let analysis;

check("genera_md_json_csv", () => {
  checklistResult = generateAccountantChecklist({ packageRoot, period: "2026-06" });
  assert.strictEqual(checklistResult.ok, true);
  for (const file of ["VALIDATION_CHECKLIST.md", "validation-checklist.json", "validation-checklist.csv"]) {
    assert(fs.existsSync(path.join(packageDir(), file)), file);
  }
  checklist = JSON.parse(fs.readFileSync(path.join(packageDir(), "validation-checklist.json"), "utf8"));
  assert(checklist.items.length >= 35);
  return `${checklist.items.length} checks`;
});

check("incluye_advertencia_humana", () => {
  const md = fs.readFileSync(path.join(packageDir(), "VALIDATION_CHECKLIST.md"), "utf8");
  assert(md.includes(HUMAN_REVIEW_NOTICE));
  assert(checklist.human_review_warning === HUMAN_REVIEW_NOTICE);
  return "warning";
});

check("detecta_xml_pdf_uuid_identity_y_amount_unknown", () => {
  const byId = Object.fromEntries(checklist.items.map((item) => [item.id, item]));
  assert.strictEqual(byId.docs_without_xml.status, "WARNING");
  assert.strictEqual(byId.docs_without_pdf.status, "WARNING");
  assert.strictEqual(byId.docs_without_uuid.status, "WARNING");
  assert.strictEqual(byId.docs_identity_missing.status, "WARNING");
  assert.strictEqual(byId.amount_unknown_documents.status, "WARNING");
  return "warnings";
});

check("cancelados_no_suman_como_activos", () => {
  const monthly = JSON.parse(fs.readFileSync(path.join(packageDir(), "monthly-summary.json"), "utf8"));
  assert.strictEqual(monthly.fiscal_totals.total, 1160);
  assert.strictEqual(monthly.fiscal_totals.cancelled_total, 580);
  assert.notStrictEqual(monthly.fiscal_totals.total, 1740);
  const item = checklist.items.find((entry) => entry.id === "amount_cancelled_separate");
  assert(item.notes.includes("No se suman"));
  return `active=${monthly.fiscal_totals.total} cancelled=${monthly.fiscal_totals.cancelled_total}`;
});

check("analyzer_counts", () => {
  analysis = analyzeChecklist({ packageDir: packageDir() });
  assert.strictEqual(analysis.exists, true);
  assert(analysis.total_checks >= 35);
  assert(analysis.warning > 0);
  assert(analysis.pending_review > 0);
  assert.strictEqual(analysis.fail, 0);
  assert.strictEqual(analysis.sensitive_findings.length, 0);
  assert.strictEqual(analysis.ready_for_human_review, true);
  return `PASS=${analysis.pass} WARN=${analysis.warning} PENDING=${analysis.pending_review}`;
});

check("no_secretos_env_csd_datos_reales", () => {
  assertChecklistSafe(checklist);
  const combined = ["VALIDATION_CHECKLIST.md", "validation-checklist.json", "validation-checklist.csv"]
    .map((file) => fs.readFileSync(path.join(packageDir(), file), "utf8"))
    .join("\n");
  assert(!/FACTURACOM_API_KEY|FACTURACOM_SECRET_KEY|F-Api-Key|F-Secret-Key/i.test(combined));
  assert(!/\.env(?:\.|$)/i.test(combined));
  assert(!/\.(cer|key|pfx|p12)\b/i.test(combined));
  assert(!/[A-Z]{3,4}\d{6}[A-Z0-9]{3}/i.test(combined), "RFC-like real data");
  return "clean";
});

check("no_escribe_fuera_runtime", () => {
  assert.throws(() => generateAccountantChecklist({ packageDir: path.join(root, "outside-package") }), /fuera de runtime/);
  return "blocked";
});

check("package_incluye_checklist_cuando_existe", () => {
  const regenerated = generateAccountantPackage({ reportRoot, storageRoot, packageRoot, period: "2026-06" });
  assert.strictEqual(regenerated.ok, true);
  assert.strictEqual(regenerated.validation_checklist.included, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir(), "manifest.json"), "utf8"));
  assert.strictEqual(manifest.validation_checklist.included, true);
  assert(fs.existsSync(path.join(packageDir(), "VALIDATION_CHECKLIST.md")));
  assert(fs.existsSync(path.join(packageDir(), "validation-checklist.json")));
  assert(fs.existsSync(path.join(packageDir(), "validation-checklist.csv")));
  return "included";
});

check("zip_incluye_checklist_cuando_existe", () => {
  const text = zipText();
  assert(text.includes("VALIDATION_CHECKLIST.md"));
  assert(text.includes("validation-checklist.json"));
  assert(text.includes("validation-checklist.csv"));
  return "zip entries";
});

check("workflows_catalogo_y_fuentes_no_modificados", () => {
  const changed = [
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--cached", "--name-only"]),
  ];
  const forbidden = changed.filter((file) => (
    file.startsWith("workflow/")
    || file === "data/concepts.normalized.json"
    || file === "data/base_cfdi_resico_n8n_emberhub_2026.xlsx"
    || /CATALOGOS SAT BD ORIGINAL/i.test(file)
  ));
  assert.strictEqual(forbidden.length, 0, forbidden.join(", "));
  return "protected clean";
});

console.log("Sandbox Accountant Checklist Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}
