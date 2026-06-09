const assert = require("assert");
const { sanitizeReport, sanitizeString } = require("./qa/sanitize-report");

assert.strictEqual(sanitizeString("function"), "function");
assert.strictEqual(sanitizeString("from"), "from");
assert.strictEqual(sanitizeString("fallback"), "fallback");
assert.strictEqual(sanitizeString("false"), "false");
assert.strictEqual(sanitizeString("true"), "true");

const text = sanitizeString("Telegram fallback sendMessage");
assert.strictEqual(text, "Telegram fallback sendMessage");
const context = sanitizeString("Restore Telegram Dispatch Fallback Context");
assert.strictEqual(context, "Restore Telegram Dispatch Fallback Context");

const fullReport = sanitizeReport({
  fallbackSendMessage: "fallbackSendMessage",
  dispatchNode: "Telegram fallback sendMessage",
  telegramContext: "Restore Telegram Dispatch Fallback Context",
  telegramEndpoint: "https://api.telegram.org",
  nodeCode: "Buffer.from('seed', 'utf8')",
  functionNode: "function",
  fromNode: "from",
  literalFalse: false,
  literalTrue: true,
  plugin: "plugin real",
});

const serialized = JSON.stringify(fullReport);
assert.strictEqual(serialized.includes("[REDACTED_FACTURACOM_TOKEN]"), false, "should not redact normal words as Factura token");
assert.strictEqual(serialized.includes('"function"'), true, "should not redact literal function token names");
assert.strictEqual(serialized.includes("Telegram fallback sendMessage"), true, "should preserve fallback text");
assert.strictEqual(serialized.includes("Restore Telegram Dispatch Fallback Context"), true, "should preserve fallback context text");
assert.strictEqual(serialized.includes("fallbackSendMessage"), true, "should preserve fallbackSendMessage");
assert.strictEqual(serialized.includes("Buffer.from"), true, "should preserve Buffer.from");
assert.strictEqual(serialized.includes("https://api.telegram.org"), true, "should preserve api.telegram.org URL");
assert.strictEqual(serialized.includes("false"), true, "should preserve false");
assert.strictEqual(serialized.includes("true"), true, "should preserve true");

console.log("QA Sanitize Report Normal Words Tests");
console.log(" - sanitize_string_does_not_redact_function_from_fallback_true_false: PASS");
console.log(" - sanitize_report_preserves_normal_text_and_literals: PASS");
console.log("\nPASS total: 2/2");
