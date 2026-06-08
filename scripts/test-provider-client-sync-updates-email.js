const assert = require("assert");

const { mapCanonicalProviderClientToFacturaComPayload } = require("./lib/factura-com-provider-client-mapper");
const { runSandboxAction } = require("./lib/sandbox-action-runner");

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

function client() {
  return {
    client_id: "CLI-REAL-BILBAO",
    razon_social: "REAL BILBAO SA DE CV",
    rfc: "ABC010203AB1",
    codigo_postal_fiscal: "77500",
    regimen_fiscal: "603",
    uso_cfdi_default: "G03",
    validated_by_human: true,
    email: "cliente.real@example.com",
    email_confirmed: true,
  };
}

check("provider_client_mapper_sends_single_primary_email_only", () => {
  const payload = mapCanonicalProviderClientToFacturaComPayload({
    ...client(),
    email2: "secondary@example.com",
    email3: "third@example.com",
  });
  assert.strictEqual(payload.email, "cliente.real@example.com");
  assert(!Object.prototype.hasOwnProperty.call(payload, "email2"));
  assert(!Object.prototype.hasOwnProperty.call(payload, "email3"));
  return payload.email;
});

check("provider_client_sync_updates_local_email_sync_status_when_requested", async () => {
  const updates = [];
  const providerUpdates = [];
  const result = await runSandboxAction("sandbox.provider.client.sync", {
    writeResult: false,
    writeAudit: false,
    client: client(),
    updateProvider: true,
    adapter: {
      getClientByRfc: async () => ({
        status: "OK",
        provider_client_uid: "PROVIDER-UID-SYNC",
        provider_client_uid_present: true,
        matches_count: 1,
        safe_matches: [],
      }),
      updateClient: async (providerClientUid, canonicalClient) => {
        providerUpdates.push({ providerClientUid, canonicalClient });
        return {
          status: "UPDATED",
          provider_client_uid: providerClientUid,
          provider_client_uid_present: true,
          matches_count: 1,
          safe_matches: [],
        };
      },
    },
    linkStore: { save: async () => ({ provider_client_link_id: "PCL-SYNC" }) },
    clientStore: {
      updateEmailSyncStatus: (clientId, status, summary) => {
        updates.push({ clientId, status, summary });
        return { client_id: clientId, provider_email_sync_status: status };
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.sync_status, "UPDATED");
  assert.strictEqual(result.output.provider_email_sync_status, "SYNCED");
  assert.strictEqual(providerUpdates.length, 1);
  assert.strictEqual(providerUpdates[0].providerClientUid, "PROVIDER-UID-SYNC");
  assert.strictEqual(providerUpdates[0].canonicalClient.email, "cliente.real@example.com");
  assert(!Object.prototype.hasOwnProperty.call(providerUpdates[0].canonicalClient, "email2"));
  assert(!Object.prototype.hasOwnProperty.call(providerUpdates[0].canonicalClient, "email3"));
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].clientId, "CLI-REAL-BILBAO");
  assert.strictEqual(updates[0].status, "SYNCED");
  assert.strictEqual(updates[0].summary.provider_email_present, true);
  assert(!JSON.stringify(result).includes("cliente.real@example.com"));
  return result.output.client_email_sync_local_update_status;
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Sync Updates Email Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
