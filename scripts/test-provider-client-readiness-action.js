const assert = require("assert");

const { runSandboxAction, ACTIONS } = require("./lib/sandbox-action-runner");
const { buildProviderClientReadinessSelectSql } = require("./lib/provider-client/provider-client-readiness-action");

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

function readyRows() {
  return {
    client: {
      client_id: "CLI-TEST-READY",
      display_name: "Cliente Test",
      razon_social: "CLIENTE TEST SA DE CV",
      rfc: "ABC010203AB1",
      codigo_postal_fiscal: "77500",
      regimen_fiscal: "601",
      uso_cfdi_default: "G03",
      validated_by_human: true,
      email: "cliente.test@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    provider_client_links: [{
      client_id: "CLI-TEST-READY",
      provider_client_uid: "UID-SECRET-123",
      provider: "factura_com",
      environment: "SANDBOX",
      sync_status: "LINKED",
    }],
  };
}

check("runner_exposes_readiness_action", () => {
  assert(ACTIONS.includes("sandbox.provider.client.readiness"));
  return "registered";
});

check("readiness_action_returns_ok_for_ready_client", async () => {
  const result = await runSandboxAction("sandbox.provider.client.readiness", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLI-TEST-READY",
    clientStore: { loadReadiness: () => readyRows() },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.schema_version, "provider_client_readiness.v1");
  assert.strictEqual(result.output.ready_for_provider_stamp, true);
  assert.strictEqual(result.output.recommended_action, "STAMP_SANDBOX");
  const raw = JSON.stringify(result);
  assert(!raw.includes("ABC010203AB1"));
  assert(!raw.includes("UID-SECRET-123"));
  assert(!raw.includes("cliente.test@example.com"));
  return result.output.recommended_action;
});

check("readiness_sql_is_select_only", () => {
  const sql = buildProviderClientReadinessSelectSql({ clientId: "CLI-TEST-READY" });
  assert(/^\s*WITH\s+/i.test(sql));
  assert(sql.includes("cfdi_clients"));
  assert(sql.includes("provider_client_links"));
  assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER)\b/i.test(sql));
  return "select";
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Readiness Action Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
