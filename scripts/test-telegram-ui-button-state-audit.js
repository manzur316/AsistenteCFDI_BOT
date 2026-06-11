const assert = require("assert");

const { runAudit } = require("./qa/telegram-ui-button-state-audit");

const results = runAudit();

console.log("Telegram UI Button State Audit Test");
for (const item of results) {
  const suffix = item.value ? ` (${item.value})` : "";
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${suffix}`);
}

const failed = results.filter((item) => !item.pass);
console.log(`Resumen: ${results.length - failed.length}/${results.length} PASS`);

assert.strictEqual(failed.length, 0, failed.map((item) => `${item.name}: ${item.value}`).join("\n"));
