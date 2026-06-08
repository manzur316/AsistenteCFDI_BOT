const assert = require("assert");

const {
  FacturaComSandboxClientAdapter,
  normalizeProviderClientLookup,
} = require("./lib/factura-com-sandbox-client-adapter");

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

check("lookup_by_rfc_uses_sandbox_clients_endpoint", async () => {
  const calls = [];
  const adapter = new FacturaComSandboxClientAdapter({
    requestFn: async (request) => {
      calls.push(request);
      assert.strictEqual(request.method, "GET");
      assert(request.path.startsWith("/v1/clients?rfc=ABC010203AB1"));
      return {
        ok: true,
        status: 200,
        contentType: "application/json",
        data: { response: "success", Data: [{ UID: "CLIENTUID-SANDBOX-123", RFC: "ABC010203AB1", RazonSocial: "REAL BILBAO SA DE CV" }] },
      };
    },
  });
  const result = await adapter.getClientByRfc("abc010203ab1");
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.provider_client_uid, "CLIENTUID-SANDBOX-123");
  assert.strictEqual(result.safe_matches[0].provider_client_uid_present, true);
  assert(!JSON.stringify(result.safe_matches).includes("CLIENTUID-SANDBOX-123"));
  return calls[0].path;
});

check("adapter_supports_create_client_endpoint", async () => {
  const adapter = new FacturaComSandboxClientAdapter({
    requestFn: async (request) => {
      assert.strictEqual(request.method, "POST");
      assert.strictEqual(request.path, "/v1/clients/create");
      assert.strictEqual(request.body.rfc, "ABC010203AB1");
      return {
        ok: true,
        status: 200,
        contentType: "application/json",
        data: { response: "success", Data: { UID: "CLIENTUID-CREATED-123", RFC: "ABC010203AB1" } },
      };
    },
  });
  const result = await adapter.createClient({
    local_client_id: "CLIENT-1",
    legal_name: "REAL BILBAO SA DE CV",
    tax_id: "ABC010203AB1",
    fiscal_zip: "77500",
    fiscal_regime: "601",
    cfdi_use: "G03",
    sat_validated: true,
  });
  assert.strictEqual(result.status, "CREATED");
  assert.strictEqual(result.provider_client_uid, "CLIENTUID-CREATED-123");
  return result.status;
});

check("normalizer_detects_ambiguous_matches", () => {
  const result = normalizeProviderClientLookup({
    ok: true,
    status: 200,
    data: { Data: [{ UID: "UID-1", RFC: "ABC010203AB1" }, { UID: "UID-2", RFC: "ABC010203AB1" }] },
  }, { rfc: "ABC010203AB1" });
  assert.strictEqual(result.status, "AMBIGUOUS");
  assert.strictEqual(result.matches_count, 2);
  return result.status;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com Sandbox Client Adapter Contract Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
