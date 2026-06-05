const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  ACTION_AUDIT_SCHEMA_VERSION,
  buildAuditRecord,
  runSandboxAction,
} = require("./lib/sandbox-action-runner");
const { analyzeAudit } = require("./analyze-sandbox-action-audit");
const { parseArgs } = require("./run-sandbox-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-action-audit-history");
const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

async function check(name, fn) {
  try {
    const value = await fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function paths(name) {
  const base = path.join(tempRoot, name);
  return {
    smokeRuntime: path.join(base, "facturacom-sandbox"),
    storageRoot: path.join(base, "storage-sandbox"),
    reportRoot: path.join(base, "reports-sandbox"),
    packageRoot: path.join(base, "accountant-packages-sandbox"),
    actionResultsRoot: path.join(base, "action-results-sandbox"),
    auditRoot: path.join(base, "sandbox-action-audit"),
  };
}

function auditPath(p) {
  return path.join(p.auditRoot, "actions.jsonl");
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertSafeAuditText(value) {
  const text = JSON.stringify(value);
  assert(!/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(text), "telegram token");
  assert(!/FACTURACOM_|F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(text), "PAC secret");
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production URL");
  assert(!/\.env\b/i.test(text), ".env");
  assert(!/\.(?:cer|key|pfx|p12|pem)\b|PRIVATE KEY/i.test(text), "CSD/key");
  assert(!/<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i.test(text), "XML");
  assert(!/%PDF-/i.test(text), "PDF");
  assert(!/\.(?:xml|pdf|zip|xlsx)\b/i.test(text), "artifact file extension");
  assert(!/runtime[\\/][A-Za-z0-9_.\\/-]+/i.test(text), "runtime path");
  assert(!/[A-Za-z]:[\\/]/.test(text), "absolute path");
  assert(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(text), "UUID");
  assert(!/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/i.test(text), "RFC");
}

cleanTemp();

(async () => {
  await check("build_audit_record_minimo", () => {
    const record = buildAuditRecord({
      action: "sandbox.report.generate",
      status: "OK",
      ok: true,
      finished_at: "2026-06-05T06:00:00.000Z",
      duration_ms: 12,
      artifacts: [{ key: "hidden", path: "runtime/demo/file.xml" }],
      warnings: ["warn"],
      errors: [],
      sensitive_findings: [],
    }, {
      source_kind: "CALLBACK_QUERY",
      chat_id_redacted: "redacted:5:abcdef12",
      user_id_redacted: "redacted:6:12345678",
      callback_data: "cfdi_sbx:report",
      workflow_version: "CFDI_SANDBOX_ACTION_ROUTER_V1",
    });
    assert.strictEqual(record.schema_version, ACTION_AUDIT_SCHEMA_VERSION);
    assert.strictEqual(record.source_kind, "CALLBACK_QUERY");
    assert.strictEqual(record.action, "sandbox.report.generate");
    assert.strictEqual(record.artifacts_count, 1);
    assert.strictEqual(record.warnings_count, 1);
    assert(!("artifacts" in record));
    assert(!("output" in record));
    assertSafeAuditText(record);
    return record.schema_version;
  });

  await check("run_action_crea_audit_jsonl", async () => {
    const p = paths("run-action");
    const result = await runSandboxAction("sandbox.preflight", {
      ...p,
      env: { FACTURACOM_SANDBOX_LIVE: "0" },
      auditContext: {
        source_kind: "CALLBACK_QUERY",
        chat_id_redacted: "redacted:5:1234abcd",
        user_id_redacted: "redacted:6:5678abcd",
        callback_data: "cfdi_sbx:preflight",
        command_token: "",
        workflow_version: "CFDI_SANDBOX_ACTION_ROUTER_V1",
      },
    });
    assert.strictEqual(result.status, "NEEDS_CONFIG");
    assert(result.audit_path.endsWith("actions.jsonl"));
    const records = readJsonl(auditPath(p));
    assert.strictEqual(records.length, 1);
    const record = records[0];
    assert.strictEqual(record.source_kind, "CALLBACK_QUERY");
    assert.strictEqual(record.callback_data, "cfdi_sbx:preflight");
    assert.strictEqual(record.workflow_version, "CFDI_SANDBOX_ACTION_ROUTER_V1");
    assert.strictEqual(record.action, "sandbox.preflight");
    assert.strictEqual(record.status, "NEEDS_CONFIG");
    assert.strictEqual(record.ok, false);
    assert.strictEqual(record.artifacts_count, 0);
    assert.strictEqual(record.sensitive_findings_count, 0);
    assert(!("result_path" in record));
    assert(!("latest_path" in record));
    assertSafeAuditText(record);
    return result.audit_path;
  });

  await check("audit_append_por_cada_ejecucion", async () => {
    const p = paths("append");
    await runSandboxAction("sandbox.preflight", { ...p, env: { FACTURACOM_SANDBOX_LIVE: "0" }, auditContext: { source_kind: "MESSAGE", command_token: "/sandbox_preflight" } });
    await runSandboxAction("sandbox.report.generate", { ...p, env: { FACTURACOM_SANDBOX_LIVE: "0" }, auditContext: { source_kind: "CALLBACK_QUERY", callback_data: "cfdi_sbx:report" } });
    const records = readJsonl(auditPath(p));
    assert.strictEqual(records.length, 2);
    assert.deepStrictEqual(records.map((record) => record.action), ["sandbox.preflight", "sandbox.report.generate"]);
    for (const record of records) assertSafeAuditText(record);
    return `${records.length} records`;
  });

  await check("analyzer_valida_audit", async () => {
    const p = paths("analyzer");
    await runSandboxAction("sandbox.preflight", { ...p, env: { FACTURACOM_SANDBOX_LIVE: "0" }, auditContext: { source_kind: "MESSAGE", command_token: "/sandbox_preflight" } });
    const analysis = analyzeAudit(auditPath(p));
    assert.strictEqual(analysis.ok, true);
    assert.strictEqual(analysis.total_records, 1);
    assert.strictEqual(analysis.by_action["sandbox.preflight"], 1);
    assert.strictEqual(analysis.by_status.NEEDS_CONFIG, 1);
    return "ok";
  });

  await check("analyzer_detecta_payload_inseguro", () => {
    const p = paths("unsafe");
    fs.mkdirSync(p.auditRoot, { recursive: true });
    fs.writeFileSync(auditPath(p), `${JSON.stringify({
      schema_version: ACTION_AUDIT_SCHEMA_VERSION,
      timestamp: "2026-06-05T06:00:00.000Z",
      source_kind: "CALLBACK_QUERY",
      action: "sandbox.full.monthly.package",
      status: "OK",
      ok: true,
      duration_ms: 1,
      artifacts_count: 1,
      warnings_count: 0,
      errors_count: 0,
      sensitive_findings_count: 0,
      bad_path: "runtime/accountant-packages-sandbox/2026-06/accountant-package-2026-06.zip",
    })}\n`, "utf8");
    const analysis = analyzeAudit(auditPath(p));
    assert.strictEqual(analysis.ok, false);
    assert(analysis.errors.some((error) => error.includes("runtime_path") || error.includes("artifact_file_reference")));
    return analysis.errors.length;
  });

  await check("cli_parse_audit_args", () => {
    const parsed = parseArgs([
      "sandbox.full.monthly.package",
      "--audit-source-kind", "CALLBACK_QUERY",
      "--audit-chat-redacted", "redacted:5:1234abcd",
      "--audit-user-redacted", "redacted:6:5678abcd",
      "--audit-callback-data", "cfdi_sbx:full",
      "--audit-workflow-version", "CFDI_SANDBOX_ACTION_ROUTER_V1",
    ]);
    assert.strictEqual(parsed.action, "sandbox.full.monthly.package");
    assert.strictEqual(parsed.auditContext.source_kind, "CALLBACK_QUERY");
    assert.strictEqual(parsed.auditContext.callback_data, "cfdi_sbx:full");
    assert.strictEqual(parsed.auditContext.workflow_version, "CFDI_SANDBOX_ACTION_ROUTER_V1");
    return parsed.action;
  });

  console.log("Sandbox Action Audit History Tests");
  for (const item of checks) printCheck(item.name, item.pass, item.value);
  const failed = checks.filter((item) => !item.pass);
  console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();
