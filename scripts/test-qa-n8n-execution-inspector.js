const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { analyzeExecution } = require("./qa/qa-assertions");

const fixturePath = path.join(__dirname, "fixtures", "n8n-execution-post-action-dispatch-missing-chat.sanitized.json");
const broken = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const brokenAnalysis = analyzeExecution(broken);
assert.strictEqual(brokenAnalysis.pass, false);
assert(brokenAnalysis.failures.some((item) => item.includes("chat_id missing")), "missing chat failure not detected");
assert(brokenAnalysis.failures.some((item) => item.includes("should_send_telegram=false")), "should_send false failure not detected");
assert(brokenAnalysis.failures.some((item) => item.includes("did not reach Telegram dispatch")), "dispatch route failure not detected");

const passing = JSON.parse(JSON.stringify(broken));
passing.data.resultData.runData["Build Telegram Dispatch Plan"][0].data.main[0][0].json = {
  chat_id: "6573879494",
  source_kind: "CALLBACK_QUERY",
  callback_query_id: "qa-callback-pass",
  callback_message_id: "1219",
  telegram_message: "Confirmar envio por correo.",
  should_send_telegram: true,
  telegram_dispatch_payload_built: true,
  telegram_bot_token_present: true
};
passing.data.resultData.runData["Telegram editMessageText"] = [{ data: { main: [[{ json: { ok: true } }]] } }];
const passAnalysis = analyzeExecution(passing);
assert.strictEqual(passAnalysis.pass, true);
assert.deepStrictEqual(passAnalysis.dispatch_nodes_executed, ["Telegram editMessageText"]);

console.log("QA n8n Execution Inspector Tests");
console.log(" - detects_missing_chat_2351_shape: PASS");
console.log(" - accepts_edit_dispatch_execution: PASS");
console.log("\nPASS total: 2/2");
