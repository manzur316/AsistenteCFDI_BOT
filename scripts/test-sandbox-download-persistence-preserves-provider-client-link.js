const assert = require("assert");

const { buildPersistedSummary } = require("./lib/sandbox-draft-stamp-persistence");

const summary = buildPersistedSummary({
  invoiceStatus: "SANDBOX_TIMBRADO",
  paymentStatus: "PENDIENTE",
  artifactStatus: "DOWNLOADED",
  pacResult: {
    ok: true,
    status: "DOWNLOADED",
    operation: "downloadSandboxArtifacts",
  },
  sandboxPacSummary: {
    artifact_status: "DOWNLOADED",
    provider_client_uid_source: "provider_client_links",
    provider_client_uid: "UID-PROVIDER-CLIENT-720",
    provider_client_link_status: "FOUND",
    legacy_receiver_uid_used: false,
  },
  providerClientLink: {
    source: "provider_client_links",
    provider_client_uid: "UID-PROVIDER-CLIENT-720",
    provider_client_link_status: "FOUND",
    legacy_receiver_uid_used: false,
  },
});

assert.strictEqual(summary.artifact_status, "DOWNLOADED");
assert.strictEqual(summary.provider_client_uid_source, "provider_client_links");
assert.strictEqual(summary.provider_client_uid, "UID-PROVIDER-CLIENT-720");
assert.strictEqual(summary.provider_client_link_status, "FOUND");
assert.strictEqual(summary.legacy_receiver_uid_used, false);
assert.notStrictEqual(summary.provider_client_uid_source, "missing");
assert.notStrictEqual(summary.provider_client_link_status, "MISSING");

console.log("Sandbox Download Persistence Preserves Provider Client Link Tests");
console.log(" - preserves_provider_client_link_after_download: PASS (FOUND)");
console.log("\nPASS total: 1/1");
