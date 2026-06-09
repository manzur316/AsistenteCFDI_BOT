const assert = require("assert");
const childProcess = require("child_process");
const path = require("path");
const { parseArgs } = require("./qa/satbot-e2e-harness");

const cliPath = path.join(__dirname, "qa", "satbot-e2e-harness.js");
const help = childProcess.execFileSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
assert(help.includes("inspect-execution"));
assert(help.includes("callback-token"));
assert(help.includes("delivery-prepare"));
assert(help.includes("N8N_API_KEY"));

const args = parseArgs(["--scenario", "inspect-execution", "--execution-id", "2351", "--safe"]);
assert.strictEqual(args.scenario, "inspect-execution");
assert.strictEqual(args.executionId, "2351");
assert.strictEqual(args.safe, true);
assert.strictEqual(args.noRealSend, true);
assert.strictEqual(args.noProduction, true);

console.log("QA CLI Contract Tests");
console.log(" - help_lists_required_scenarios: PASS");
console.log(" - parse_args_keeps_safe_defaults: PASS");
console.log("\nPASS total: 2/2");
