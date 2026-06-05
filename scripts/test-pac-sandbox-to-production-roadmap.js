const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docPath = path.join(root, "docs", "PAC_SANDBOX_TO_PRODUCTION_ROADMAP.md");
const readmePath = path.join(root, "README.md");
const roadmapPath = path.join(root, "docs", "ROADMAP_PAC_STORAGE_REPORTING.md");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

const checks = [];
const docExists = fs.existsSync(docPath);
const docText = docExists ? fs.readFileSync(docPath, "utf8") : "";
const readmeText = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8") : "";
const roadmapText = fs.existsSync(roadmapPath) ? fs.readFileSync(roadmapPath, "utf8") : "";

checks.push({
  name: "roadmap_document_exists",
  pass: docExists,
  value: "docs/PAC_SANDBOX_TO_PRODUCTION_ROADMAP.md",
});

checks.push({
  name: "defines_factura_com_production_vs_sandbox",
  pass: includesAll(docText, [
    "`Factura.com`: proveedor PAC productivo futuro",
    "`Factura.com Sandbox`: ambiente de prueba del proveedor",
    "`FacturaComSandboxAdapter`: primer adapter sandbox",
    "`FacturaComProductionAdapter`: adapter productivo futuro",
  ]),
  value: "Factura.com / Sandbox",
});

checks.push({
  name: "defines_sandbox_vs_productive_stamping",
  pass: includesAll(docText, [
    "`timbrado sandbox`: CFDI de prueba contra Factura.com Sandbox",
    "`timbrado productivo`: CFDI fiscal real contra Factura.com produccion",
  ]),
  value: "timbrado sandbox/productivo",
});

checks.push({
  name: "includes_phases_75_to_81",
  pass: includesAll(docText, [
    "Fase 7.5 - Telegram PAC Sandbox Stamping Console",
    "Fase 7.6 - Approved Draft To PAC Sandbox",
    "Fase 7.7 - Sandbox CFDI Lifecycle And Cancellation",
    "Fase 7.8 - Human-Readable CFDI Storage Naming",
    "Fase 7.9 - Invoice Status And Payment Status Model",
    "Fase 7.10 - Sandbox End-To-End Signoff",
    "Fase 8.0 - Production Readiness Gate",
    "Fase 8.1+ - Factura.com Production Adapter",
  ]),
  value: "7.5..8.1",
});

checks.push({
  name: "requires_double_confirmation_for_cancellation",
  pass: docText.includes("doble confirmacion para cancelar")
    && docText.includes("Toda cancelacion debe tener doble confirmacion"),
  value: "doble confirmacion",
});

checks.push({
  name: "requires_invoice_history_timeline",
  pass: docText.includes("Toda factura debe tener historial/timeline")
    && docText.includes("registrar evento/timeline"),
  value: "historial/timeline",
});

checks.push({
  name: "separates_invoice_status_and_payment_status",
  pass: includesAll(docText, [
    "`invoice_status`",
    "`payment_status`",
    "`SANDBOX_TIMBRADO`",
    "`PRODUCCION_TIMBRADO` futuro",
    "`PENDIENTE`",
    "`PAGADO`",
    "Timbrado y pago no deben colapsarse en un mismo campo",
  ]),
  value: "invoice/payment",
});

checks.push({
  name: "forbids_pac_credentials_in_workflows",
  pass: includesAll(docText, [
    "n8n no debe contener `F-Api-Key`, `F-Secret-Key`, `F-PLUGIN`, CSD, `.env`",
    "Workflows no contienen credenciales PAC",
  ]),
  value: "no credentials",
});

checks.push({
  name: "forbids_direct_n8n_factura_calls",
  pass: docText.includes("n8n no debe llamar directo a Factura.com")
    && docText.includes("n8n no llama directo a Factura.com"),
  value: "n8n orchestrator",
});

checks.push({
  name: "requires_sandbox_production_separation",
  pass: includesAll(docText, [
    "Sandbox y production deben tener estados",
    "storage, reportes y carpetas",
    "runtime/storage-sandbox/",
    "Sandbox y production tienen storage/reporting separados",
  ]),
  value: "separate environments",
});

checks.push({
  name: "defines_human_readable_storage_by_client_period_status",
  pass: includesAll(docText, [
    "Human-Readable CFDI Storage Naming",
    "cliente, periodo y estado",
    "runtime/storage-sandbox/emitters/<emitter_id>/<yyyy>/<mm>/clients/<client_id>/invoices/<invoice_id>/",
    "indices por cliente/periodo/estado",
  ]),
  value: "storage naming",
});

checks.push({
  name: "keeps_real_production_blocked_until_gate",
  pass: includesAll(docText, [
    "Produccion real no se abre sin fase gate explicita",
    "No debe timbrar produccion todavia",
    "Produccion real queda bloqueada hasta que este gate quede aprobado",
  ]),
  value: "production blocked",
});

checks.push({
  name: "readme_links_roadmap",
  pass: readmeText.includes("docs/PAC_SANDBOX_TO_PRODUCTION_ROADMAP.md"),
  value: "README.md",
});

checks.push({
  name: "master_roadmap_links_roadmap",
  pass: roadmapText.includes("PAC Sandbox To Production Roadmap")
    && roadmapText.includes("docs/PAC_SANDBOX_TO_PRODUCTION_ROADMAP.md"),
  value: "ROADMAP_PAC_STORAGE_REPORTING.md",
});

let passCount = 0;
for (const check of checks) {
  if (check.pass) passCount += 1;
  printCheck(check.name, check.pass, check.value);
}

console.log(`PASS total: ${passCount}/${checks.length}`);
if (passCount !== checks.length) {
  process.exit(1);
}
