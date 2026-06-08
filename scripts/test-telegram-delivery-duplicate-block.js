const assert = require("assert");
const fs = require("fs");

const workflowText = fs.readFileSync("workflow/cfdi_telegram_local_ingest.n8n.json", "utf8");

assert(workflowText.includes("BLOCKED_DUPLICATE"));
assert(workflowText.includes("Esta factura ya fue enviada por este canal"));
assert(workflowText.includes("Reenviar de todos modos"));
assert(workflowText.includes("DELIVERY_FORCE_PROVIDER_EMAIL"));
assert(workflowText.includes("DELIVERY_FORCE_TELEGRAM_CHANNEL"));
assert(workflowText.includes("--force"));
assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(workflowText));
assert(!/token Telegram|TELEGRAM_BOT_TOKEN.*callback_data/i.test(workflowText));

console.log("Telegram Delivery Duplicate Block Tests");
console.log(" - duplicate_shows_safe_resend_prompt: PASS (BLOCKED_DUPLICATE)");
console.log("\nPASS total: 1/1");
