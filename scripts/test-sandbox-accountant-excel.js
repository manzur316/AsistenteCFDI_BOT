const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  HUMAN_REVIEW_NOTICE,
  createZipArchive,
} = require("./lib/sandbox-accountant-package");
const {
  REQUIRED_SHEETS,
  analyzeAccountantExcel,
  generateAccountantExcel,
  listZipEntries,
} = require("./lib/sandbox-accountant-excel");
const { generateReports } = require("./generate-sandbox-monthly-report");
const { generateAccountantPackage } = require("./generate-sandbox-accountant-package");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-accountant-excel");
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

function makeUnsafeXlsx(targetPath, unsafeText = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime/demo") {
  const sourceDir = path.join(tempRoot, `unsafe-xlsx-src-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  writeText(path.join(sourceDir, "xl", "workbook.xml"), "<workbook><sheets><sheet name=\"DEMO\" sheetId=\"1\"/></sheets></workbook>");
  writeText(path.join(sourceDir, "xl", "worksheets", "sheet1.xml"), `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${unsafeText}</t></is></c></row></sheetData></worksheet>`);
  createZipArchive(sourceDir, targetPath);
  fs.rmSync(sourceDir, { recursive: true, force: true });
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
      draft_id: "+DRAFT-DANGER",
      client_id: "=CLIENT-DANGER",
      status: "CREATED",
      identity_status: "COMPLETE",
      cfdi_uid: "@UID-DANGER",
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
      invoice_id: "-CFDI-CANCELLED",
      draft_id: "DRAFT-CANCELLED",
      client_id: "=CLIENT-DANGER",
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
      client_id: "CLIENT-ERROR",
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
    storage_root: "runtime/test-sandbox-accountant-excel/storage-sandbox",
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
}

createFixture();

let excelResult;
let analysis;
let combinedText;

check("genera_xlsx_ooxml_local", () => {
  excelResult = generateAccountantExcel({ packageRoot, period: "2026-06" });
  assert.strictEqual(excelResult.ok, true);
  assert.strictEqual(excelResult.format, "XLSX_OOXML_NODE_PURE");
  const excelPath = path.join(root, excelResult.excel_path);
  assert(fs.existsSync(excelPath), excelResult.excel_path);
  const header = fs.readFileSync(excelPath).subarray(0, 4).toString("binary");
  assert.strictEqual(header, "PK\u0003\u0004");
  return excelResult.excel_path;
});

check("analyzer_detecta_hojas_requeridas", () => {
  analysis = analyzeAccountantExcel({ packageRoot, period: "2026-06" });
  assert.strictEqual(analysis.exists, true);
  assert.strictEqual(analysis.required_sheets_present, true);
  for (const sheet of REQUIRED_SHEETS) assert(analysis.sheets.includes(sheet), sheet);
  assert.strictEqual(analysis.runtime_path_ok, true);
  return analysis.sheets.join(", ");
});

check("incluye_leyenda_revision_humana", () => {
  const entries = listZipEntries(path.join(root, excelResult.excel_path));
  combinedText = entries.map((entry) => entry.data.toString("utf8")).join("\n");
  assert(combinedText.includes(HUMAN_REVIEW_NOTICE));
  return "leyenda";
});

check("cancelados_no_suman_ingreso_activo", () => {
  const monthly = JSON.parse(fs.readFileSync(path.join(packageRoot, "2026-06", "package", "monthly-summary.json"), "utf8"));
  assert.strictEqual(monthly.fiscal_totals.total, 1160);
  assert.strictEqual(monthly.fiscal_totals.cancelled_total, 580);
  assert.notStrictEqual(monthly.fiscal_totals.total, 1740);
  assert(combinedText.includes("Cancelados no se suman como ingresos vigentes."));
  return `active=${monthly.fiscal_totals.total} cancelled=${monthly.fiscal_totals.cancelled_total}`;
});

check("no_incluye_xml_pdf_completos", () => {
  assert(!/<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i.test(combinedText));
  assert(!/%PDF/i.test(combinedText));
  return "sin contenido XML/PDF";
});

check("no_incluye_credenciales_env_csd", () => {
  assert(!/FACTURACOM_API_KEY|FACTURACOM_SECRET_KEY|F-Api-Key|F-Secret-Key/i.test(combinedText));
  assert(!/\.env(?:\.|$)/i.test(combinedText));
  assert(!/\.(cer|key|pfx|p12)\b/i.test(combinedText));
  return "clean";
});

check("excel_no_contiene_rutas_absolutas", () => {
  const repoRootText = root.replace(/\\/g, "/");
  assert(!/C:[\\/]/i.test(combinedText));
  assert(!combinedText.includes(repoRootText));
  assert.strictEqual(analysis.absolute_path_findings.length, 0, analysis.absolute_path_findings.join(", "));
  return "relative only";
});

check("escapa_formula_injection", () => {
  assert.strictEqual(analysis.formula_injection_findings.length, 0, analysis.formula_injection_findings.join(", "));
  assert(!/<t>[=+\-@]/.test(combinedText));
  assert(combinedText.includes("&apos;=CLIENT-DANGER"));
  assert(combinedText.includes("&apos;+DRAFT-DANGER"));
  assert(combinedText.includes("&apos;@UID-DANGER"));
  assert(combinedText.includes("&apos;-CFDI-CANCELLED"));
  return "escaped";
});

check("reporta_unknown_cuando_faltan_montos", () => {
  assert(combinedText.includes("UNKNOWN"));
  assert(analysis.row_counts.CONTROL >= 6);
  return "UNKNOWN";
});

check("sensitive_findings_none", () => {
  assert.strictEqual(analysis.sensitive_findings.length, 0, analysis.sensitive_findings.join(", "));
  return "none";
});

check("analyzer_reporta_absolute_path_con_entry_y_celda", () => {
  const unsafePath = path.join(tempRoot, "unsafe-excel", "accountant-review-2026-06.xlsx");
  makeUnsafeXlsx(unsafePath);
  const result = analyzeAccountantExcel({ excelPath: unsafePath });
  assert(result.absolute_path_findings.some((finding) => (
    finding.includes("accountant-review-2026-06.xlsx:xl/worksheets/sheet1.xml")
    && finding.includes("DEMO!A1")
    && finding.endsWith(":absolute_path")
  )), result.absolute_path_findings.join(", "));
  assert.strictEqual(result.ok, false);
  return result.absolute_path_findings[0];
});

check("no_escribe_fuera_runtime", () => {
  assert.throws(() => generateAccountantExcel({
    packageRoot,
    period: "2026-06",
    targetPath: path.join(root, "accountant-review-outside.xlsx"),
  }), /fuera de runtime/);
  return "blocked";
});

check("missing_runtime_skip_controlado", () => {
  const result = generateAccountantExcel({
    packageRoot: path.join(tempRoot, "missing-accountant-package"),
    period: "2026-06",
  });
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.reason, "ACCOUNTANT_PACKAGE_ROOT_MISSING");
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

console.log("Sandbox Accountant Excel Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}
