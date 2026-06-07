const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxAction } = require("./lib/sandbox-action-runner");
const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-draft-download-artifacts");
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

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function env() {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
  };
}

function stampedDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-DOWNLOAD-716",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-DEMO",
    total: 1160,
    current_client: {
      client_id: "CLIENT-DEMO",
      display_name: "Cliente Demo",
      validated_by_human: true,
    },
    sandbox_pac_summary: {
      provider: "Factura.com Sandbox",
      cfdi_uid: "CFDIUID716",
      uuid: "00000000-0000-4000-8000-000000000716",
      pac_invoice_id: "CFDIUID716",
      artifact_status: "DOWNLOAD_READY",
      xml_provider_available: true,
      pdf_provider_available: true,
    },
    ...overrides,
  };
}

function fakeRequestFn({ partial = false } = {}) {
  return async (request) => {
    if (request.path.endsWith("/xml")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "application/xml",
        rawText: "<?xml version=\"1.0\"?><cfdi:Comprobante Total=\"1160\"/>",
        data: "<?xml version=\"1.0\"?><cfdi:Comprobante Total=\"1160\"/>",
      };
    }
    if (partial && request.path.endsWith("/pdf")) {
      return { ok: false, status: 500, statusText: "PDF error", contentType: "application/json", data: { response: "error" } };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "application/pdf",
      rawBuffer: Buffer.from("%PDF-1.4 sandbox", "utf8"),
    };
  };
}

function assertNoSensitiveTelegramLikeText(value) {
  const raw = JSON.stringify(value);
  assert(!/SANDBOXKEYLOCAL123|SANDBOXSECRETLOCAL123|SANDBOXPLUGINLOCAL123/i.test(raw), "credential leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF/i.test(raw), "document content leaked");
}

check("download_action_downloads_xml_pdf_and_preserves_statuses", async () => {
  cleanTemp();
  const result = await runSandboxDraftDownloadArtifacts({
    draft: stampedDraft(),
    env: env(),
    storageRoot: tempRoot,
    adapterContext: { requestFn: fakeRequestFn() },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assert.strictEqual(result.output.draft_status, "APROBADO");
  assert.strictEqual(result.output.payment_status, "PENDIENTE");
  assert.strictEqual(result.output.xml_downloaded, true);
  assert.strictEqual(result.output.pdf_downloaded, true);
  assert.strictEqual(result.output.artifact_status, "DOWNLOADED");
  assert(fs.existsSync(path.join(root, result.output.xml_storage_path)));
  assert(fs.existsSync(path.join(root, result.output.pdf_storage_path)));
  assert(fs.existsSync(path.join(root, result.output.manifest_path)));
  assertNoSensitiveTelegramLikeText(result);
  return result.output.artifact_status;
});

check("download_action_partial_download_is_stable", async () => {
  cleanTemp();
  const result = await runSandboxDraftDownloadArtifacts({
    draft: stampedDraft({ draft_id: "DRAFT-DOWNLOAD-PARTIAL-716" }),
    env: env(),
    storageRoot: tempRoot,
    adapterContext: { requestFn: fakeRequestFn({ partial: true }) },
  });
  assert.strictEqual(result.status, "PARTIAL_DOWNLOAD");
  assert.strictEqual(result.output.xml_downloaded, true);
  assert.strictEqual(result.output.pdf_downloaded, false);
  assert.strictEqual(result.output.artifact_status, "PARTIAL_DOWNLOAD");
  return result.status;
});

check("download_action_requires_sandbox_timbrado", async () => {
  const result = await runSandboxDraftDownloadArtifacts({
    draft: stampedDraft({ invoice_status: "APROBADO", sandbox_pac_summary: { cfdi_uid: "CFDIUID716" } }),
    env: env(),
    storageRoot: tempRoot,
  });
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  assert.strictEqual(result.errors[0], "DRAFT_NOT_SANDBOX_STAMPED");
  return result.errors[0];
});

check("download_action_requires_identity", async () => {
  const result = await runSandboxDraftDownloadArtifacts({
    draft: stampedDraft({ sandbox_pac_summary: {} }),
    env: env(),
    storageRoot: tempRoot,
  });
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  assert.strictEqual(result.errors[0], "SANDBOX_PAC_IDENTITY_MISSING");
  return result.errors[0];
});

check("action_runner_allowlists_download_artifacts", async () => {
  cleanTemp();
  const result = await runSandboxAction("sandbox.draft.download-artifacts", {
    draft: stampedDraft({ draft_id: "DRAFT-RUNNER-DOWNLOAD-716" }),
    env: env(),
    storageRoot: tempRoot,
    actionResultsRoot: path.join(root, "runtime", "test-sandbox-draft-download-results"),
    actionAuditRoot: path.join(root, "runtime", "test-sandbox-draft-download-audit"),
    adapterContext: { requestFn: fakeRequestFn() },
  });
  assert.strictEqual(result.action, "sandbox.draft.download-artifacts");
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.ok, true);
  assertNoSensitiveTelegramLikeText(result);
  return result.action;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Draft Download Artifacts Action Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
