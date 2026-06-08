const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "scripts/lib/provider-client/provider-client-readiness-contract.js",
  "scripts/lib/provider-client/provider-client-readiness-action.js",
  "scripts/lib/sandbox-draft-stamp-action.js",
  "scripts/lib/sandbox-action-runner.js",
  "scripts/run-sandbox-action.js",
];

const forbidden = [
  "CLI-REAL-BILBAO",
  "REAL BILBAO",
  "FACTURACOM_SANDBOX_RECEIVER_UID_REAL_BILBAO",
  "FACTURACOM_SANDBOX_RECEIVER_UID_CLIENTE",
];

const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

check("readiness_code_has_no_hardcoded_client_or_per_client_uid_env", () => {
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const needle of forbidden) {
      if (text.includes(needle)) findings.push(`${file}:${needle}`);
    }
  }
  assert.deepStrictEqual(findings, []);
  return "none";
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Readiness No Hardcoded Client Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
