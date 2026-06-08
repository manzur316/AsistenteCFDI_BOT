const assert = require("assert");

const { buildProviderClientReadiness } = require("./lib/provider-client/provider-client-readiness-contract");

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

check("incomplete_client_fiscal_fields_block_readiness", () => {
  const readiness = buildProviderClientReadiness({
    client: {
      client_id: "CLI-TEST-INCOMPLETE",
      display_name: "Cliente Incompleto",
      razon_social: "",
      rfc: "",
      codigo_postal_fiscal: "",
      regimen_fiscal: "",
      uso_cfdi_default: "",
      validated_by_human: true,
    },
    provider_client_link: {
      provider_client_uid: "UID-INCOMPLETE-123",
      sync_status: "LINKED",
    },
  });
  assert.strictEqual(readiness.ready_for_provider_stamp, false);
  assert(readiness.blockers.includes("CLIENT_FISCAL_DATA_INCOMPLETE"));
  assert.strictEqual(readiness.recommended_action, "COMPLETE_CLIENT_DATA");
  assert(readiness.fiscal_data_missing_fields.includes("rfc"));
  assert(readiness.fiscal_data_missing_fields.includes("codigo_postal_fiscal"));
  assert(readiness.fiscal_data_missing_fields.includes("regimen_fiscal"));
  assert(readiness.fiscal_data_missing_fields.includes("uso_cfdi_default"));
  return readiness.fiscal_data_missing_fields.join("|");
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Readiness Incomplete Fiscal Data Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
