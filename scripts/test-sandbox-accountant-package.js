const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  HUMAN_REVIEW_NOTICE,
  assertAccountantPackageSafe,
  collectStorageArtifacts,
  loadMonthlyReports,
} = require("./lib/sandbox-accountant-package");
const { generateReports } = require("./generate-sandbox-monthly-report");
const { generateAccountantPackage } = require("./generate-sandbox-accountant-package");
const { analyze } = require("./analyze-sandbox-accountant-package");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-accountant-package");
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
    writeJson(cancelPath, { ok: true, status: "cancelled" });
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
      client_id: "CLIENT-A",
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
    storage_root: "runtime/test-sandbox-accountant-package/storage-sandbox",
    document_count: documents.length,
    documents,
  });
  writeJson(path.join(storageRoot, "reports", "storage-summary.json"), {
    schema_version: "sandbox_storage.v1.summary",
    total_documents: documents.length,
  });
  const reportResult = generateReports({ storageRoot, reportRoot, period: "2026-06" });
  assert.strictEqual(reportResult.ok, true);
}

createFixture();

check("load_monthly_reports", () => {
  const reports = loadMonthlyReports(reportRoot, { period: "2026-06" });
  assert.strictEqual(reports.period, "2026-06");
  assert.strictEqual(reports.monthly.total_documents, 3);
  return reports.period;
});

check("collect_storage_artifacts_xml_pdf", () => {
  const reports = loadMonthlyReports(reportRoot, { period: "2026-06" });
  const artifacts = collectStorageArtifacts(storageRoot, reports);
  assert.strictEqual(artifacts.filter((artifact) => artifact.type === "XML").length, 2);
  assert.strictEqual(artifacts.filter((artifact) => artifact.type === "PDF").length, 1);
  assert(artifacts.every((artifact) => !path.isAbsolute(artifact.source_path)));
  return `${artifacts.length} artifacts`;
});

let packageResult;

check("generate_package_folder_y_zip", () => {
  packageResult = generateAccountantPackage({ reportRoot, storageRoot, packageRoot, period: "2026-06" });
  assert.strictEqual(packageResult.ok, true);
  assert(fs.existsSync(path.join(root, packageResult.package_dir)), "package dir");
  assert(fs.existsSync(path.join(root, packageResult.zip_path)), "zip");
  const zipHeader = fs.readFileSync(path.join(root, packageResult.zip_path)).subarray(0, 4).toString("binary");
  assert.strictEqual(zipHeader, "PK\u0003\u0004");
  assert(packageResult.zip_entries > 0);
  return packageResult.zip_path;
});

check("incluye_readme_manifest_reportes", () => {
  const packageDir = path.join(root, packageResult.package_dir);
  for (const file of [
    "README_CONTADOR.txt",
    "manifest.json",
    "monthly-summary.json",
    "monthly-summary.csv",
    "client-summary.json",
    "client-summary.csv",
    "document-control.json",
    "document-control.csv",
    "accountant-review.json",
  ]) {
    assert(fs.existsSync(path.join(packageDir, file)), file);
  }
  const readme = fs.readFileSync(path.join(packageDir, "README_CONTADOR.txt"), "utf8");
  assert(readme.includes(HUMAN_REVIEW_NOTICE));
  return "root files";
});

check("incluye_xml_pdf_y_separa_estatus", () => {
  const packageDir = path.join(root, packageResult.package_dir);
  assert(fs.existsSync(path.join(packageDir, "XML", "CREATED", "CFDI-CREATED", "CFDI-CREATED.xml")));
  assert(fs.existsSync(path.join(packageDir, "XML", "CANCELLED", "CFDI-CANCELLED", "CFDI-CANCELLED.xml")));
  assert(fs.existsSync(path.join(packageDir, "PDF", "CREATED", "CFDI-CREATED", "CFDI-CREATED.pdf")));
  assert(fs.existsSync(path.join(packageDir, "CREATED", "documents.json")));
  assert(fs.existsSync(path.join(packageDir, "CANCELLED", "documents.json")));
  assert(fs.existsSync(path.join(packageDir, "ERROR", "documents.json")));
  return "xml/pdf/status";
});

check("manifest_no_suma_cancelados_como_activos", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, packageResult.package_dir, "manifest.json"), "utf8"));
  assert.strictEqual(manifest.totals.active_total, 1160);
  assert.strictEqual(manifest.totals.cancelled_total, 580);
  assert.notStrictEqual(manifest.totals.active_total, 1740);
  assert(manifest.alerts.includes("CANCELLED_NOT_INCLUDED_IN_ACTIVE_INCOME"));
  return `active=${manifest.totals.active_total} cancelled=${manifest.totals.cancelled_total}`;
});

check("analyzer_package", () => {
  const result = analyze(path.join(root, packageResult.package_dir));
  assert.strictEqual(result.period, "2026-06");
  assert.strictEqual(result.zip_exists, true);
  assert(result.total_files >= 14);
  assert.strictEqual(result.xml_included, 2);
  assert.strictEqual(result.pdf_included, 1);
  assert(result.csv_included >= 3);
  assert(result.json_included >= 7);
  assert.strictEqual(result.created, 1);
  assert.strictEqual(result.cancelled, 1);
  assert.strictEqual(result.error, 1);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return `${result.total_files} files`;
});

check("rutas_relativas_y_sin_absolutos", () => {
  const manifestText = fs.readFileSync(path.join(root, packageResult.package_dir, "manifest.json"), "utf8");
  assert(!/[A-Za-z]:[\\/]/.test(manifestText));
  assert(!/\\\\/.test(manifestText));
  assert(manifestText.includes("XML/CREATED/CFDI-CREATED/CFDI-CREATED.xml"));
  return "relative";
});

check("no_incluye_env_csd_secretos", () => {
  const safety = assertAccountantPackageSafe(path.join(root, packageResult.package_dir));
  assert.strictEqual(safety.sensitive_findings.length, 0);
  const allText = fs.readdirSync(path.join(root, packageResult.package_dir))
    .filter((file) => /\.(json|csv|txt)$/i.test(file))
    .map((file) => fs.readFileSync(path.join(root, packageResult.package_dir, file), "utf8"))
    .join("\n");
  assert(!allText.includes("FACTURACOM_API_KEY"));
  assert(!allText.includes("F-Secret-Key"));
  assert(!allText.includes(".env"));
  assert(!allText.includes(".cer"));
  assert(!allText.includes(".key"));
  return "clean";
});

check("safety_detecta_env_y_csd", () => {
  const unsafe = path.join(tempRoot, "unsafe-package");
  fs.mkdirSync(unsafe, { recursive: true });
  writeText(path.join(unsafe, "README_CONTADOR.txt"), HUMAN_REVIEW_NOTICE);
  writeText(path.join(unsafe, ".env"), "PLACEHOLDER=REEMPLAZAR_LOCALMENTE");
  writeText(path.join(unsafe, "demo.cer"), "CERT");
  assert.throws(() => assertAccountantPackageSafe(unsafe), /env_file|csd_or_key_file/);
  return "detected";
});

check("no_escribe_fuera_runtime", () => {
  assert.throws(() => generateAccountantPackage({
    reportRoot,
    storageRoot,
    packageRoot: path.join(root, "accountant-packages-outside"),
    period: "2026-06",
  }), /fuera de runtime/);
  return "blocked";
});

check("missing_runtime_skip_controlado", () => {
  const result = generateAccountantPackage({
    reportRoot: path.join(tempRoot, "missing-reports"),
    storageRoot,
    packageRoot,
    period: "2026-06",
  });
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.reason, "REPORTS_SANDBOX_MISSING");
  return result.reason;
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

console.log("Sandbox Accountant Package Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}
