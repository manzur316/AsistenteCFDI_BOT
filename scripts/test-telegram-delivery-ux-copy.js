const assert = require("assert");

const {
  baseSource,
  prepareStdout,
  runSummary,
} = require("./lib/test-telegram-delivery-workflow-harness");

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
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

check("telegram_channel_confirmation_copy_is_not_contradictory", () => {
  const result = runSummary(prepareStdout("TELEGRAM_DOCUMENT_CHANNEL"), baseSource());
  const text = String(result.telegram_message || "");
  assert(/Confirmar envio a canal documental/.test(text));
  assert(/Los documentos XML\/PDF se enviaran al canal documental configurado/.test(text));
  assert(/No se adjuntaran documentos al chat operativo/.test(text));
  assert(!/No se adjuntan documentos por Telegram/.test(text), "contradictory Telegram copy leaked");
  assert(!/Warnings: none|Sensitive findings: 0/.test(text), "technical empty noise leaked");
  return "telegram";
});

check("provider_email_confirmation_copy_mentions_provider_email_path", () => {
  const result = runSummary(prepareStdout("PROVIDER_EMAIL"), baseSource());
  const text = String(result.telegram_message || "");
  assert(/Confirmar envio por correo/.test(text));
  assert(/Factura\.com Sandbox enviara XML\/PDF al correo confirmado del cliente/.test(text));
  assert(/No se adjuntaran documentos al chat operativo/.test(text));
  assert(!/No se adjuntan documentos por Telegram/.test(text), "generic no-docs Telegram copy leaked");
  return "provider";
});

console.log("Telegram Delivery UX Copy Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
