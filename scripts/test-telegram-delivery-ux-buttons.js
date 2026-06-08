const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const raw = fs.readFileSync(workflowPath, "utf8");
const handleCode = workflow.nodes.find((node) => node.name === "Handle Commands And Scoring")?.parameters?.jsCode || "";
const summaryCode = workflow.nodes.find((node) => node.name === "Build PAC Sandbox Action Summary")?.parameters?.jsCode || "";

function assertContains(value, pattern, label) {
  assert(value.includes(pattern), label || pattern);
}

assertContains(handleCode, "DELIVERY_STATUS", "delivery status token missing");
assertContains(handleCode, "DELIVERY_PREPARE_PROVIDER_EMAIL", "provider prepare token missing");
assertContains(handleCode, "DELIVERY_CONFIRM_PROVIDER_EMAIL", "provider confirm token missing");
assertContains(handleCode, "DELIVERY_PREPARE_TELEGRAM_CHANNEL", "telegram prepare token missing");
assertContains(handleCode, "DELIVERY_CONFIRM_TELEGRAM_CHANNEL", "telegram confirm token missing");
assertContains(handleCode, "DELIVERY_FORCE_PROVIDER_EMAIL", "provider force token missing");
assertContains(handleCode, "DELIVERY_FORCE_TELEGRAM_CHANNEL", "telegram force token missing");
assertContains(handleCode, "Enviar por correo", "provider button missing");
assertContains(handleCode, "Enviar a canal documentos", "telegram channel button missing");
assertContains(handleCode, "Ver estado documental", "document status button missing");
assertContains(handleCode, "sandbox.documents.delivery.prepare", "prepare action missing");
assertContains(handleCode, "sandbox.documents.delivery.send", "send action missing");
assertContains(handleCode, "--send-real --confirmed", "confirmed send flags missing");
assertContains(handleCode, "--force", "force flag missing");
assertContains(summaryCode, "Confirmar envio por correo", "provider confirmation text missing");
assertContains(summaryCode, "Confirmar envio a canal documental", "telegram confirmation text missing");
assertContains(summaryCode, "Esta factura ya fue enviada por este canal", "duplicate UX missing");
assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(raw), "workflow must not send files directly");
assert(!/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction/i.test(raw), "production or credentials leaked");
assert(!/<\?xml|%PDF-/i.test(raw), "document content leaked");

console.log("Telegram Delivery UX Buttons Tests");
console.log(" - visible_buttons_have_destinations: PASS (delivery buttons)");
console.log(" - confirmation_buttons_are_tokenized: PASS (cfdi:<token>)");
console.log(" - workflow_does_not_send_files: PASS (no sendDocument)");
console.log("\nPASS total: 3/3");
