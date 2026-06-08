const assert = require("assert");

const { mapCanonicalProviderClientToFacturaComPayload } = require("./lib/factura-com-provider-client-mapper");
const { runProviderClientSync } = require("./lib/provider-client-sync-action");

const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

check("facturacom_client_payload_includes_only_primary_email", async () => {
  const payload = mapCanonicalProviderClientToFacturaComPayload({
    local_client_id: "CLIENT-EMAIL",
    tax_id: "ABC010203AB1",
    legal_name: "CLIENTE DEMO",
    fiscal_zip: "77500",
    fiscal_regime: "601",
    cfdi_use: "G03",
    email: "cliente@example.com",
  });
  assert.strictEqual(payload.email, "cliente@example.com");
  assert(!/email2|email3|billing_email/i.test(JSON.stringify(payload)));
  return payload.email;
});

check("provider_client_sync_reports_email_sync_status", async () => {
  const savedLinks = [];
  const result = await runProviderClientSync({
    client: {
      client_id: "CLIENT-EMAIL",
      rfc: "ABC010203AB1",
      razon_social: "CLIENTE DEMO",
      codigo_postal_fiscal: "77500",
      regimen_fiscal: "601",
      uso_cfdi_default: "G03",
      email: "cliente@example.com",
      validated_by_human: true,
    },
    createIfMissing: true,
    adapter: {
      getClientByRfc: async () => ({ status: "NOT_FOUND", ok: false, matches_count: 0 }),
      createClient: async () => ({
        status: "CREATED",
        ok: true,
        provider_client_uid: "PROVIDERUID716",
        matches_count: 1,
        safe_matches: [],
      }),
    },
    linkStore: {
      save: async (link) => {
        savedLinks.push(link);
        return { provider_client_link_id: "LINK-1" };
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.provider_email_sync_status, "SYNCED");
  assert.strictEqual(result.output.client_email_present, true);
  assert.strictEqual(savedLinks[0].provider_response_sanitized.provider_email_present, true);
  assert(!JSON.stringify(result).includes("cliente@example.com"), "email completo filtrado en output");
  return result.output.provider_email_sync_status;
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Sync Email Mapper Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
