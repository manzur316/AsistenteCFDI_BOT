const assert = require("assert");
const fs = require("fs");

const workflow = JSON.parse(fs.readFileSync("workflow/cfdi_telegram_local_ingest.n8n.json", "utf8"));
const summaryCode = workflow.nodes.find((node) => node.name === "Build PAC Sandbox Action Summary")?.parameters?.jsCode || "";

assert(summaryCode.includes("Estado documental"));
assert(summaryCode.includes("Correo proveedor:"));
assert(summaryCode.includes("Canal documental:"));
assert(summaryCode.includes("Ultimo envio correo"));
assert(summaryCode.includes("Ultimo envio canal"));
assert(summaryCode.includes("XML: "));
assert(summaryCode.includes("PDF: "));
assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(summaryCode));
assert(!/<\\?xml|%PDF-/i.test(summaryCode));

console.log("Document Delivery Status Summary Tests");
console.log(" - status_summary_contains_delivery_channels: PASS (Estado documental)");
console.log("\nPASS total: 1/1");
