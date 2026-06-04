const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  buildStorageIndex,
  buildStoragePathForAttempt,
  buildStorageSummary,
  buildStoredInvoiceManifest,
  classifyArtifact,
  copySmokeArtifactToStorage,
  identityStatus,
  scanSensitiveFiles,
} = require("./lib/sandbox-storage-engine");
const { storeArtifacts } = require("./store-facturacom-sandbox-artifacts");
const { analyze } = require("./analyze-storage-sandbox");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-storage-engine");

const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value), "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function createSmokeFixture(name = "smoke") {
  const smokeRuntime = path.join(tempRoot, name);
  const files = {
    request: path.join(smokeRuntime, "DRAFT-DEMO-create-cfdi-request.json"),
    response: path.join(smokeRuntime, "DRAFT-DEMO-create-cfdi-response.json"),
    lookup: path.join(smokeRuntime, "DRAFT-DEMO-lookup-response.json"),
    xml: path.join(smokeRuntime, "DRAFT-DEMO-download.xml"),
    pdf: path.join(smokeRuntime, "DRAFT-DEMO-download.pdf"),
    cancel: path.join(smokeRuntime, "DRAFT-DEMO-cancel-response.json"),
  };
  writeJson(files.request, { method: "POST", path: "/v4/cfdi40/create", body: { demo: true } });
  writeJson(files.response, { ok: true, data: { Data: { UID: "CFDI-UID-123" } } });
  writeJson(files.lookup, { ok: true, data: { response: "success" } });
  writeText(files.xml, '<cfdi:Comprobante><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="00000000-0000-4000-8000-000000000555" /></cfdi:Complemento></cfdi:Comprobante>');
  writeText(files.pdf, "%PDF-SANDBOX-DEMO%");
  writeJson(files.cancel, { ok: true, data: { status: "cancelled" } });
  writeJson(path.join(smokeRuntime, "client-uids.local.json"), { "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-DEMO" });

  const manifest = {
    schema_version: "facturacom_sandbox_smoke.v1",
    created_at: "2026-06-04T00:00:00.000Z",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [
      { type: "CFDI_CREATE_REQUEST", draft_id: "DRAFT-DEMO", path: rel(files.request), ok: true },
      { type: "CFDI_CREATE_RESPONSE", draft_id: "DRAFT-DEMO", path: rel(files.response), ok: true },
      { type: "CFDI_LOOKUP_RESPONSE", draft_id: "DRAFT-DEMO", path: rel(files.lookup), ok: true },
      { type: "CFDI_XML", draft_id: "DRAFT-DEMO", path: rel(files.xml), ok: true },
      { type: "CFDI_PDF", draft_id: "DRAFT-DEMO", path: rel(files.pdf), ok: true },
      { type: "CFDI_CANCEL_RESPONSE", draft_id: "DRAFT-DEMO", path: rel(files.cancel), ok: true },
    ],
    attempts: [
      {
        draft_id: "DRAFT-DEMO",
        internal_invoice_id: "INTERNAL-DRAFT-DEMO",
        client_id: "CLIENT-DEMO-PF-GENERIC",
        client_uid: "UID-CLIENT-DEMO",
        status: "CREATE_OK",
        uid: "CFDI-UID-123",
        cfdi_uid: "CFDI-UID-123",
        uuid: null,
        cancel_status: "OK",
        artifacts: Object.values(files).map(rel),
        warnings: [],
      },
      {
        draft_id: "DRAFT-MISSING",
        internal_invoice_id: "INTERNAL-DRAFT-MISSING",
        client_id: "CLIENT-DEMO-PF-GENERIC",
        client_uid: "UID-CLIENT-DEMO",
        status: "CREATE_OK_IDENTITY_MISSING",
        uid: null,
        cfdi_uid: null,
        uuid: null,
        artifacts: [],
        warnings: ["CFDI_UID_MISSING"],
      },
    ],
  };
  const summary = {
    schema_version: "facturacom_sandbox_smoke.v1",
    created_at: "2026-06-04T00:00:00.000Z",
    total_attempts: 2,
    successful: 1,
    errors: 0,
    warnings: [],
  };
  writeJson(path.join(smokeRuntime, "manifest.json"), manifest);
  writeJson(path.join(smokeRuntime, "summary.json"), summary);
  return { smokeRuntime, files, manifest };
}

cleanTemp();

check("path_se_genera_bajo_runtime_storage_sandbox", () => {
  const storageRoot = path.join(tempRoot, "storage-sandbox");
  const pathInfo = buildStoragePathForAttempt({
    draft_id: "DRAFT-DEMO",
    uid: "CFDI-UID-123",
    cfdi_uid: "CFDI-UID-123",
    client_id: "CLIENT-DEMO-PF-GENERIC",
  }, {
    storageRoot,
    createdAt: "2026-06-04T00:00:00.000Z",
  });
  assert(pathInfo.invoiceDir.startsWith(storageRoot));
  assert(pathInfo.invoiceDir.includes(path.join("2026", "06")));
  assert(pathInfo.invoiceDir.includes("CFDI-UID-123"));
  return path.relative(root, pathInfo.invoiceDir).replace(/\\/g, "/");
});

check("no_permite_storage_fuera_runtime", () => {
  assert.throws(() => buildStoragePathForAttempt({ draft_id: "DRAFT" }, {
    storageRoot: path.join(root, "outside-storage"),
  }), /fuera de/);
  return "blocked";
});

check("classify_artifact", () => {
  assert.strictEqual(classifyArtifact({ type: "CFDI_CREATE_REQUEST" }).category, "request");
  assert.strictEqual(classifyArtifact({ type: "CFDI_CREATE_RESPONSE" }).category, "response");
  assert.strictEqual(classifyArtifact({ type: "CFDI_XML" }).category, "xml");
  assert.strictEqual(classifyArtifact({ type: "CFDI_PDF" }).category, "pdf");
  assert.strictEqual(classifyArtifact({ type: "CFDI_CANCEL_RESPONSE" }).category, "cancel");
  return "request/response/xml/pdf/cancel";
});

check("copy_genera_checksum_y_rechaza_fuera_smoke_runtime", () => {
  const { smokeRuntime, manifest } = createSmokeFixture("copy-smoke");
  const storageRoot = path.join(tempRoot, "copy-storage");
  const pathInfo = buildStoragePathForAttempt(manifest.attempts[0], {
    storageRoot,
    createdAt: manifest.created_at,
    clientId: manifest.attempts[0].client_id,
  });
  fs.mkdirSync(pathInfo.invoiceDir, { recursive: true });
  const record = copySmokeArtifactToStorage(manifest.artifacts[0], {
    root,
    smokeRuntime,
    storageRoot,
    invoiceDir: pathInfo.invoiceDir,
  });
  assert.strictEqual(record.category, "request");
  assert.match(record.sha256, /^[a-f0-9]{64}$/);
  assert(record.storage_path.includes("request/"));
  assert.throws(() => copySmokeArtifactToStorage({ type: "CFDI_CREATE_REQUEST", path: "README.md" }, {
    root,
    smokeRuntime,
    storageRoot,
    invoiceDir: pathInfo.invoiceDir,
  }), /fuera de/);
  return record.sha256.slice(0, 8);
});

check("manifest_soporta_uuid_null_y_uid_parcial", () => {
  const manifest = buildStoredInvoiceManifest({
    draft_id: "DRAFT-DEMO",
    client_id: "CLIENT-DEMO-PF-GENERIC",
    status: "CREATE_OK",
    uid: "CFDI-UID-123",
    cfdi_uid: "CFDI-UID-123",
    uuid: null,
  }, [], {
    storageRoot: path.join(tempRoot, "manifest-storage"),
    createdAt: "2026-06-04T00:00:00.000Z",
  });
  assert.strictEqual(manifest.uuid, null);
  assert.strictEqual(manifest.identity_status, "PARTIAL_PROVIDER_UID");
  assert.strictEqual(manifest.status, "CREATED");
  assert.strictEqual(identityStatus({ cfdi_uid: null, uuid: null }), "MISSING");
  return manifest.identity_status;
});

check("create_api_error_se_guarda_como_error_con_identidad_missing", () => {
  const manifest = buildStoredInvoiceManifest({
    draft_id: "DRAFT-API-ERROR",
    internal_invoice_id: "INTERNAL-DRAFT-API-ERROR",
    client_id: "CLIENT-DEMO-PF-GENERIC",
    status: "CREATE_API_ERROR",
    http_ok: true,
    api_ok: false,
    api_status: "error",
    api_message_summary: "UsoCFDI invalido para receptor demo",
    api_error: {
      http_ok: true,
      api_ok: false,
      api_status: "error",
      api_message_summary: "UsoCFDI invalido para receptor demo",
    },
  }, [], {
    storageRoot: path.join(tempRoot, "api-error-storage"),
    createdAt: "2026-06-04T00:00:00.000Z",
  });
  assert.strictEqual(manifest.status, "ERROR");
  assert.strictEqual(manifest.identity_status, "MISSING");
  assert.strictEqual(manifest.source_attempt_status, "CREATE_API_ERROR");
  assert.strictEqual(manifest.http_ok, true);
  assert.strictEqual(manifest.api_ok, false);
  assert.strictEqual(manifest.api_status, "error");
  assert.strictEqual(manifest.api_error.api_status, "error");
  assert.strictEqual(identityStatus({ status: "CREATE_API_ERROR", internal_invoice_id: "INTERNAL" }), "MISSING");
  return "error/missing";
});

check("store_cli_genera_manifest_index_summary_y_copia_artifacts", () => {
  const { smokeRuntime } = createSmokeFixture("store-smoke");
  const storageRoot = path.join(tempRoot, "storage-sandbox");
  const result = storeArtifacts({ smokeRuntime, storageRoot });
  assert.strictEqual(result.stored_documents, 2);
  const invoiceDir = path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-DEMO-PF-GENERIC", "invoices", "CFDI-UID-123");
  assert(fs.existsSync(path.join(invoiceDir, "manifest.json")), "invoice manifest");
  assert(fs.existsSync(path.join(invoiceDir, "canonical-summary.json")), "canonical summary");
  assert(fs.existsSync(path.join(invoiceDir, "request", "DRAFT-DEMO-create-cfdi-request.json")), "request copied");
  assert(fs.existsSync(path.join(invoiceDir, "response", "DRAFT-DEMO-create-cfdi-response.json")), "response copied");
  assert(fs.existsSync(path.join(invoiceDir, "xml", "DRAFT-DEMO-download.xml")), "xml copied");
  assert(fs.existsSync(path.join(invoiceDir, "pdf", "DRAFT-DEMO-download.pdf")), "pdf copied");
  assert(fs.existsSync(path.join(invoiceDir, "cancel", "DRAFT-DEMO-cancel-response.json")), "cancel copied");
  assert(fs.existsSync(path.join(storageRoot, "reports", "storage-index.json")), "index");
  assert(fs.existsSync(path.join(storageRoot, "reports", "storage-summary.json")), "summary");
  const invoiceManifest = JSON.parse(fs.readFileSync(path.join(invoiceDir, "manifest.json"), "utf8"));
  assert.strictEqual(invoiceManifest.status, "CANCELLED");
  assert.strictEqual(invoiceManifest.identity_status, "PARTIAL_PROVIDER_UID");
  assert.strictEqual(invoiceManifest.has_xml, true);
  assert.strictEqual(invoiceManifest.has_pdf, true);
  assert(invoiceManifest.artifacts.every((artifact) => !path.isAbsolute(artifact.storage_path)));
  return result.reports.summary;
});

check("build_index_summary_y_analyze", () => {
  const storageRoot = path.join(tempRoot, "storage-sandbox");
  const index = buildStorageIndex(storageRoot);
  const summary = buildStorageSummary(index);
  const analysis = analyze(storageRoot);
  assert.strictEqual(index.document_count, 2);
  assert.strictEqual(summary.total_documents, 2);
  assert.strictEqual(summary.cancelled, 1);
  assert.strictEqual(summary.error, 1);
  assert.strictEqual(summary.identity_partial, 1);
  assert.strictEqual(summary.identity_missing, 1);
  assert.strictEqual(summary.identity_internal, 1);
  assert.strictEqual(summary.with_xml, 1);
  assert.strictEqual(summary.with_pdf, 1);
  assert.strictEqual(analysis.total_documents, 2);
  assert.strictEqual(analysis.identity_internal, 1);
  assert.strictEqual(analysis.created, 0);
  assert.strictEqual(analysis.error, 1);
  assert.strictEqual(analysis.sensitive_findings.length, 0);
  return `${summary.total_documents} docs`;
});

check("storage_no_sobrescribe_colision_y_genera_sufijo", () => {
  const smokeRuntime = path.join(tempRoot, "collision-smoke");
  const storageRoot = path.join(tempRoot, "collision-storage");
  const responseA = path.join(smokeRuntime, "DRAFT-A-create-cfdi-response.json");
  const responseB = path.join(smokeRuntime, "DRAFT-B-create-cfdi-response.json");
  writeJson(responseA, { ok: true, data: { Data: { UID: "CFDI-UID-COLLISION" } } });
  writeJson(responseB, { ok: true, data: { Data: { UID: "CFDI-UID-COLLISION" } } });
  writeJson(path.join(smokeRuntime, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    created_at: "2026-06-04T00:00:00.000Z",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [
      { type: "CFDI_CREATE_RESPONSE", draft_id: "DRAFT-A", path: rel(responseA), ok: true },
      { type: "CFDI_CREATE_RESPONSE", draft_id: "DRAFT-B", path: rel(responseB), ok: true },
    ],
    attempts: [
      {
        draft_id: "DRAFT-A",
        internal_invoice_id: "INTERNAL-DRAFT-A",
        client_id: "CLIENT-DEMO-PF-GENERIC",
        client_uid: "UID-CLIENT-A",
        status: "CREATE_OK",
        cfdi_uid: "CFDI-UID-COLLISION",
        uuid: null,
      },
      {
        draft_id: "DRAFT-B",
        internal_invoice_id: "INTERNAL-DRAFT-B",
        client_id: "CLIENT-DEMO-PF-GENERIC",
        client_uid: "UID-CLIENT-B",
        status: "CREATE_OK",
        cfdi_uid: "CFDI-UID-COLLISION",
        uuid: null,
      },
    ],
  });
  writeJson(path.join(smokeRuntime, "summary.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    created_at: "2026-06-04T00:00:00.000Z",
    total_attempts: 2,
    successful: 2,
    warnings: [],
  });
  const result = storeArtifacts({ smokeRuntime, storageRoot });
  assert.strictEqual(result.stored_documents, 2);
  assert(fs.existsSync(path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-DEMO-PF-GENERIC", "invoices", "CFDI-UID-COLLISION", "manifest.json")));
  assert(fs.existsSync(path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-DEMO-PF-GENERIC", "invoices", "CFDI-UID-COLLISION__DRAFT-B", "manifest.json")));
  const analysis = analyze(storageRoot);
  assert.strictEqual(analysis.identity_collisions, 1);
  assert.deepStrictEqual(analysis.duplicate_invoice_ids, { "CFDI-UID-COLLISION": 2 });
  assert.strictEqual(analysis.documents_by_draft_id["DRAFT-A"], 1);
  assert.strictEqual(analysis.documents_by_draft_id["DRAFT-B"], 1);
  return "collision suffixed";
});

check("secretos_y_produccion_detectados", () => {
  const badRuntime = path.join(tempRoot, "bad-smoke");
  writeJson(path.join(badRuntime, "manifest.json"), {
    attempts: [{ draft_id: "DRAFT", status: "CREATE_OK", cfdi_uid: "UID" }],
    base_url: "https://api.factura.com",
  });
  writeJson(path.join(badRuntime, "summary.json"), { successful: 1 });
  assert(scanSensitiveFiles(badRuntime).some((finding) => finding.includes("production_url")));
  assert.throws(() => storeArtifacts({ smokeRuntime: badRuntime, storageRoot: path.join(tempRoot, "bad-storage") }), /Sensitive findings/);
  return "detected";
});

check("no_contiene_api_key_secret_plugin_en_storage", () => {
  const storageRoot = path.join(tempRoot, "storage-sandbox");
  const findings = scanSensitiveFiles(storageRoot);
  assert.strictEqual(findings.length, 0, findings.join(", "));
  const files = fs.readdirSync(path.join(storageRoot, "reports"));
  assert(files.includes("storage-index.json"));
  assert(files.includes("storage-summary.json"));
  return "clean";
});

check("workflows_y_catalogo_no_modificados", () => {
  const changed = [
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--cached", "--name-only"]),
  ];
  const forbidden = changed.filter((file) => file.startsWith("workflow/") || file === "data/concepts.normalized.json");
  assert.strictEqual(forbidden.length, 0, forbidden.join(", "));
  return "protected clean";
});

console.log("Sandbox Storage Engine Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}
