const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  HUMAN_REVIEW_NOTICE,
  assertReportingSafe,
  buildClientReport,
  buildDocumentControlReport,
  buildMonthlyReport,
  buildReportingSummary,
  extractInvoiceAmounts,
  loadStorageIndex,
  loadStoredInvoiceManifest,
} = require("./lib/sandbox-reporting-engine");
const { generateReports } = require("./generate-sandbox-monthly-report");
const { analyze } = require("./analyze-sandbox-reporting");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-reporting-engine");
const storageRoot = path.join(tempRoot, "storage-sandbox");
const reportRoot = path.join(tempRoot, "reports-sandbox");
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

function xml({ serie, folio, subtotal, iva, total, uuid, fecha }) {
  return `<cfdi:Comprobante Version="4.0" Serie="${serie}" Folio="${folio}" Fecha="${fecha}" SubTotal="${subtotal}" Moneda="MXN" Total="${total}">`
    + `<cfdi:Impuestos TotalImpuestosTrasladados="${iva}"><cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="${iva}" /></cfdi:Traslados></cfdi:Impuestos>`
    + `<cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}" FechaTimbrado="${fecha}" /></cfdi:Complemento>`
    + "</cfdi:Comprobante>";
}

function invoiceDir(invoiceId) {
  return path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-A", "invoices", invoiceId);
}

function writeInvoiceManifest(invoiceId, manifest) {
  const dir = invoiceDir(invoiceId);
  writeJson(path.join(dir, "manifest.json"), manifest);
  return path.join(dir, "manifest.json");
}

function createFixture() {
  cleanTemp();

  const createdDir = invoiceDir("CFDI-CREATED");
  const createdXml = path.join(createdDir, "xml", "created.xml");
  const createdPdf = path.join(createdDir, "pdf", "created.pdf");
  writeText(createdXml, xml({
    serie: "A",
    folio: "1",
    subtotal: "1000.00",
    iva: "160.00",
    total: "1160.00",
    uuid: "11111111-1111-4111-8111-111111111111",
    fecha: "2026-06-04T10:00:00",
  }));
  writeText(createdPdf, "%PDF-SANDBOX-FIXTURE%");
  const createdManifestPath = writeInvoiceManifest("CFDI-CREATED", {
    schema_version: "sandbox_storage_invoice.v1",
    generated_at: "2026-06-04T10:01:00.000Z",
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA",
    pac_provider: "factura.com",
    pac_environment: "SANDBOX",
    status: "CREATED",
    identity_status: "COMPLETE",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-A",
    year: "2026",
    month: "06",
    draft_id: "DRAFT-CREATED",
    invoice_id: "CFDI-CREATED",
    cfdi_uid: "CFDI-CREATED",
    uuid: "11111111-1111-4111-8111-111111111111",
    serie: "A",
    folio: "1",
    has_xml: true,
    has_pdf: true,
    has_cancel_response: false,
    artifacts: [
      { type: "CFDI_XML", category: "xml", storage_path: relFromStorage(createdXml), invoice_relative_path: "xml/created.xml", sha256: "a".repeat(64), bytes: 200, ok: true },
      { type: "CFDI_PDF", category: "pdf", storage_path: relFromStorage(createdPdf), invoice_relative_path: "pdf/created.pdf", sha256: "b".repeat(64), bytes: 20, ok: true },
    ],
  });

  const cancelledDir = invoiceDir("CFDI-CANCELLED");
  const cancelledXml = path.join(cancelledDir, "xml", "cancelled.xml");
  writeText(cancelledXml, xml({
    serie: "A",
    folio: "2",
    subtotal: "500.00",
    iva: "80.00",
    total: "580.00",
    uuid: "22222222-2222-4222-8222-222222222222",
    fecha: "2026-06-05T10:00:00",
  }));
  const cancelledManifestPath = writeInvoiceManifest("CFDI-CANCELLED", {
    schema_version: "sandbox_storage_invoice.v1",
    generated_at: "2026-06-05T10:01:00.000Z",
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA",
    pac_provider: "factura.com",
    pac_environment: "SANDBOX",
    status: "CANCELLED",
    identity_status: "COMPLETE",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-A",
    year: "2026",
    month: "06",
    draft_id: "DRAFT-CANCELLED",
    invoice_id: "CFDI-CANCELLED",
    cfdi_uid: "CFDI-CANCELLED",
    uuid: "22222222-2222-4222-8222-222222222222",
    serie: "A",
    folio: "2",
    cancel_status: "OK",
    has_xml: true,
    has_pdf: false,
    has_cancel_response: true,
    artifacts: [
      { type: "CFDI_XML", category: "xml", storage_path: relFromStorage(cancelledXml), invoice_relative_path: "xml/cancelled.xml", sha256: "c".repeat(64), bytes: 200, ok: true },
      { type: "CFDI_CANCEL_RESPONSE", category: "cancel", storage_path: "emitters/EMITTER-DEMO/2026/06/clients/CLIENT-A/invoices/CFDI-CANCELLED/cancel/cancel.json", invoice_relative_path: "cancel/cancel.json", sha256: "d".repeat(64), bytes: 20, ok: true },
    ],
  });
  writeJson(path.join(cancelledDir, "cancel", "cancel.json"), { ok: true, status: "cancelled" });

  const errorManifestPath = writeInvoiceManifest("CFDI-ERROR", {
    schema_version: "sandbox_storage_invoice.v1",
    generated_at: "2026-06-06T10:01:00.000Z",
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA",
    pac_provider: "factura.com",
    pac_environment: "SANDBOX",
    status: "ERROR",
    identity_status: "MISSING",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-A",
    year: "2026",
    month: "06",
    draft_id: "DRAFT-ERROR",
    invoice_id: "CFDI-ERROR",
    cfdi_uid: null,
    uuid: null,
    has_xml: false,
    has_pdf: false,
    has_cancel_response: false,
    artifacts: [],
  });

  const documents = [
    {
      manifest_path: relFromStorage(createdManifestPath),
      invoice_id: "CFDI-CREATED",
      draft_id: "DRAFT-CREATED",
      emitter_id: "EMITTER-DEMO",
      client_id: "CLIENT-A",
      year: "2026",
      month: "06",
      status: "CREATED",
      identity_status: "COMPLETE",
      cfdi_uid: "CFDI-CREATED",
      uuid: "11111111-1111-4111-8111-111111111111",
      has_xml: true,
      has_pdf: true,
    },
    {
      manifest_path: relFromStorage(cancelledManifestPath),
      invoice_id: "CFDI-CANCELLED",
      draft_id: "DRAFT-CANCELLED",
      emitter_id: "EMITTER-DEMO",
      client_id: "CLIENT-A",
      year: "2026",
      month: "06",
      status: "CANCELLED",
      identity_status: "COMPLETE",
      cfdi_uid: "CFDI-CANCELLED",
      uuid: "22222222-2222-4222-8222-222222222222",
      has_xml: true,
      has_pdf: false,
    },
    {
      manifest_path: relFromStorage(errorManifestPath),
      invoice_id: "CFDI-ERROR",
      draft_id: "DRAFT-ERROR",
      emitter_id: "EMITTER-DEMO",
      client_id: "CLIENT-A",
      year: "2026",
      month: "06",
      status: "ERROR",
      identity_status: "MISSING",
      cfdi_uid: null,
      uuid: null,
      has_xml: false,
      has_pdf: false,
    },
  ];
  writeJson(path.join(storageRoot, "reports", "storage-index.json"), {
    schema_version: "sandbox_storage.v1.index",
    generated_at: "2026-06-06T10:02:00.000Z",
    storage_root: "runtime/test-sandbox-reporting-engine/storage-sandbox",
    document_count: documents.length,
    documents,
  });
  writeJson(path.join(storageRoot, "reports", "storage-summary.json"), {
    schema_version: "sandbox_storage.v1.summary",
    total_documents: documents.length,
  });
}

createFixture();

check("load_storage_index", () => {
  const index = loadStorageIndex(storageRoot);
  assert.strictEqual(index.document_count, 3);
  return `${index.document_count} docs`;
});

check("extrae_subtotal_iva_total_desde_xml", () => {
  const manifest = loadStoredInvoiceManifest(path.join(invoiceDir("CFDI-CREATED"), "manifest.json"));
  Object.defineProperty(manifest, "_storageRootAbs", { value: storageRoot, enumerable: false });
  Object.defineProperty(manifest, "_manifestPathAbs", { value: path.join(invoiceDir("CFDI-CREATED"), "manifest.json"), enumerable: false });
  const amounts = extractInvoiceAmounts(manifest);
  assert.strictEqual(amounts.amount_status, "EXTRACTED");
  assert.strictEqual(amounts.subtotal, 1000);
  assert.strictEqual(amounts.iva_trasladado, 160);
  assert.strictEqual(amounts.total, 1160);
  return `${amounts.subtotal}/${amounts.iva_trasladado}/${amounts.total}`;
});

check("amount_status_unknown_si_no_hay_monto", () => {
  const manifest = loadStoredInvoiceManifest(path.join(invoiceDir("CFDI-ERROR"), "manifest.json"));
  Object.defineProperty(manifest, "_storageRootAbs", { value: storageRoot, enumerable: false });
  Object.defineProperty(manifest, "_manifestPathAbs", { value: path.join(invoiceDir("CFDI-ERROR"), "manifest.json"), enumerable: false });
  const amounts = extractInvoiceAmounts(manifest);
  assert.strictEqual(amounts.amount_status, "UNKNOWN");
  assert.strictEqual(amounts.total, null);
  return "UNKNOWN";
});

check("monthly_report_separa_status_y_no_suma_cancelados", () => {
  const index = loadStorageIndex(storageRoot);
  const report = buildMonthlyReport(index, { period: "2026-06", storageRoot });
  assert.strictEqual(report.total_documents, 3);
  assert.strictEqual(report.status_counts.CREATED, 1);
  assert.strictEqual(report.status_counts.CANCELLED, 1);
  assert.strictEqual(report.status_counts.ERROR, 1);
  assert.strictEqual(report.xml_pdf.with_xml, 2);
  assert.strictEqual(report.xml_pdf.with_pdf, 1);
  assert.strictEqual(report.identity_counts.COMPLETE, 2);
  assert.strictEqual(report.identity_counts.MISSING, 1);
  assert.strictEqual(report.fiscal_totals.total, 1160);
  assert.strictEqual(report.fiscal_totals.cancelled_total, 580);
  assert.notStrictEqual(report.fiscal_totals.total, 1740);
  assert(report.fiscal_totals.note.includes("Cancelados no se suman"));
  assertReportingSafe(report);
  return `active=${report.fiscal_totals.total} cancelled=${report.fiscal_totals.cancelled_total}`;
});

check("client_report_genera_resumen_por_cliente", () => {
  const index = loadStorageIndex(storageRoot);
  const report = buildClientReport(index, { period: "2026-06", storageRoot });
  assert.strictEqual(report.total_clients, 1);
  assert.strictEqual(report.clients[0].client_id, "CLIENT-A");
  assert.strictEqual(report.clients[0].active_totals.total, 1160);
  assert.strictEqual(report.clients[0].cancelled_totals.total, 580);
  assertReportingSafe(report);
  return report.clients[0].client_id;
});

check("document_control_reporta_faltantes_y_cancelados", () => {
  const index = loadStorageIndex(storageRoot);
  const report = buildDocumentControlReport(index, { period: "2026-06", storageRoot });
  assert.strictEqual(report.documents_without_xml.length, 1);
  assert.strictEqual(report.documents_without_pdf.length, 2);
  assert.strictEqual(report.documents_without_uuid.length, 1);
  assert.strictEqual(report.cancelled_documents.length, 1);
  assert.strictEqual(report.identity_missing_documents.length, 1);
  assert.strictEqual(report.sensitive_findings.length, 0);
  assertReportingSafe(report);
  return "control ok";
});

check("reporting_summary_con_warning_obligatorio", () => {
  const index = loadStorageIndex(storageRoot);
  const monthly = buildMonthlyReport(index, { period: "2026-06", storageRoot });
  const client = buildClientReport(index, { period: "2026-06", storageRoot });
  const control = buildDocumentControlReport(index, { period: "2026-06", storageRoot });
  const summary = buildReportingSummary({ monthly, client, control });
  assert(summary.warnings.includes(HUMAN_REVIEW_NOTICE));
  assertReportingSafe(summary);
  return "warning";
});

check("generate_reports_escribe_json_csv_y_accountant_review", () => {
  const result = generateReports({ storageRoot, reportRoot, period: "2026-06" });
  assert.strictEqual(result.ok, true);
  for (const file of Object.values(result.files)) {
    assert(fs.existsSync(path.join(root, file)), file);
  }
  const monthly = JSON.parse(fs.readFileSync(path.join(root, result.files.monthly_json), "utf8"));
  const monthlyCsv = fs.readFileSync(path.join(root, result.files.monthly_csv), "utf8");
  const clientCsv = fs.readFileSync(path.join(root, result.files.client_csv), "utf8");
  const controlCsv = fs.readFileSync(path.join(root, result.files.control_csv), "utf8");
  const accountant = fs.readFileSync(path.join(root, result.files.accountant_review_json), "utf8");
  assert.strictEqual(monthly.fiscal_totals.total, 1160);
  assert(monthlyCsv.includes("cancelled_total"));
  assert(clientCsv.includes("CLIENT-A"));
  assert(controlCsv.includes("WITHOUT_PDF"));
  assert(accountant.includes(HUMAN_REVIEW_NOTICE));
  assert(!accountant.includes("<cfdi:Comprobante"));
  assert(!accountant.includes("%PDF"));
  return result.output_dir;
});

check("analyzer_imprime_datos_clave", () => {
  const result = analyze(path.join(reportRoot, "2026", "06"));
  assert.strictEqual(result.period, "2026-06");
  assert.strictEqual(result.total_documents, 3);
  assert.strictEqual(result.created, 1);
  assert.strictEqual(result.cancelled, 1);
  assert.strictEqual(result.with_xml, 2);
  assert.strictEqual(result.with_pdf, 1);
  assert.strictEqual(result.identity_missing, 1);
  assert.strictEqual(result.total, 1160);
  assert.strictEqual(result.cancelled_total, 580);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return `${result.period}/${result.total}`;
});

check("rutas_relativas_sin_absolutos", () => {
  const monthly = JSON.parse(fs.readFileSync(path.join(reportRoot, "2026", "06", "monthly-summary.json"), "utf8"));
  for (const doc of monthly.documents) {
    assert(!path.isAbsolute(doc.manifest_path), doc.manifest_path);
    for (const xmlPath of doc.xml_paths || []) assert(!path.isAbsolute(xmlPath), xmlPath);
    for (const pdfPath of doc.pdf_paths || []) assert(!path.isAbsolute(pdfPath), pdfPath);
  }
  return "relative";
});

check("reportes_no_contienen_secretos_ni_xml_pdf_completos", () => {
  const reportDir = path.join(reportRoot, "2026", "06");
  const combined = fs.readdirSync(reportDir)
    .map((file) => fs.readFileSync(path.join(reportDir, file), "utf8"))
    .join("\n");
  assert(!combined.includes("FACTURACOM_API_KEY"));
  assert(!combined.includes("F-Secret-Key"));
  assert(!combined.includes("<cfdi:Comprobante"));
  assert(!combined.includes("%PDF"));
  assert(combined.includes(HUMAN_REVIEW_NOTICE));
  return "clean";
});

check("no_escribe_fuera_de_runtime", () => {
  assert.throws(() => generateReports({
    storageRoot,
    reportRoot: path.join(root, "reports-outside-runtime"),
    period: "2026-06",
  }), /fuera de runtime/);
  return "blocked";
});

check("missing_storage_no_falla_como_bug", () => {
  const missingRoot = path.join(tempRoot, "missing-storage");
  const result = generateReports({ storageRoot: missingRoot, reportRoot, period: "2026-06" });
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.reason, "STORAGE_SANDBOX_MISSING");
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

console.log("Sandbox Reporting Engine Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}
