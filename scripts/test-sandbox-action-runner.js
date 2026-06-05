const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const {
  ACTIONS,
  ACTION_STATUSES,
  analyzeLatestActionResult,
  listSandboxActions,
  runSandboxAction,
} = require("./lib/sandbox-action-runner");
const { generateReports } = require("./generate-sandbox-monthly-report");
const { createZipArchive } = require("./lib/sandbox-accountant-package");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-action-runner");
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
  };
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value), "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeUnsafeXlsx(targetPath, unsafeText = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime/demo") {
  const sourceDir = path.join(tempRoot, `unsafe-xlsx-src-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  writeText(path.join(sourceDir, "xl", "workbook.xml"), "<workbook><sheets><sheet name=\"DEMO\" sheetId=\"1\"/></sheets></workbook>");
  writeText(path.join(sourceDir, "xl", "worksheets", "sheet1.xml"), `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${unsafeText}</t></is></c></row></sheetData></worksheet>`);
  createZipArchive(sourceDir, targetPath);
  fs.rmSync(sourceDir, { recursive: true, force: true });
}

function writeMinimalStorage(storageRoot) {
  const invoiceDir = path.join(storageRoot, "emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-A", "invoices", "CFDI-ERROR");
  writeJson(path.join(invoiceDir, "manifest.json"), {
    schema_version: "sandbox_storage_invoice.v1",
    generated_at: "2026-06-04T10:01:00.000Z",
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA",
    pac_provider: "factura.com",
    pac_environment: "SANDBOX",
    status: "ERROR",
    identity_status: "MISSING",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-A",
    year: "2026",
    month: "06",
    draft_id: "DRAFT-ERROR",
    invoice_id: "CFDI-ERROR",
    cfdi_uid: null,
    uuid: null,
    serie: null,
    folio: null,
    has_xml: false,
    has_pdf: false,
    artifacts: [],
  });
  writeJson(path.join(storageRoot, "reports", "storage-index.json"), {
    schema_version: "sandbox_storage.v1.index",
    generated_at: "2026-06-04T10:02:00.000Z",
    storage_root: "runtime/test-sandbox-action-runner/storage-sandbox",
    document_count: 1,
    documents: [{
      manifest_path: "emitters/EMITTER-DEMO/2026/06/clients/CLIENT-A/invoices/CFDI-ERROR/manifest.json",
      invoice_id: "CFDI-ERROR",
      draft_id: "DRAFT-ERROR",
      emitter_id: "EMITTER-DEMO",
      client_id: "CLIENT-A",
      year: "2026",
      month: "06",
      status: "ERROR",
      identity_status: "MISSING",
      cfdi_uid: null,
      uuid: null,
      has_xml: false,
      has_pdf: false,
      has_cancel_response: false,
    }],
  });
  writeJson(path.join(storageRoot, "reports", "storage-summary.json"), {
    schema_version: "sandbox_storage.v1.summary",
    total_documents: 1,
  });
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

function assertStableResult(result, expectedAction) {
  assert.strictEqual(result.schema_version, "sandbox_action_result.v1");
  assert.strictEqual(result.action, expectedAction);
  assert(ACTION_STATUSES.includes(result.status), result.status);
  assert.strictEqual(typeof result.started_at, "string");
  assert.strictEqual(typeof result.finished_at, "string");
  assert.strictEqual(typeof result.duration_ms, "number");
  assert(Array.isArray(result.artifacts));
  assert(Array.isArray(result.warnings));
  assert(Array.isArray(result.errors));
  assert(Array.isArray(result.sensitive_findings));
}

cleanTemp();

(async () => {
  await check("lista_acciones_minimas", () => {
    for (const action of [
      "sandbox.preflight",
      "sandbox.smoke.create",
      "sandbox.smoke.download",
      "sandbox.smoke.cancel",
      "sandbox.storage.refresh",
      "sandbox.report.generate",
      "sandbox.package.generate",
      "sandbox.excel.generate",
      "sandbox.checklist.generate",
      "sandbox.full.monthly.package",
    ]) {
      assert(ACTIONS.includes(action), action);
      assert(listSandboxActions().includes(action), action);
    }
    return `${ACTIONS.length} actions`;
  });

  await check("accion_desconocida_falla_limpio", async () => {
    const p = paths("unknown");
    const result = await runSandboxAction("sandbox.nope", { ...p });
    assertStableResult(result, "sandbox.nope");
    assert.strictEqual(result.status, "ERROR");
    assert(result.errors.includes("UNKNOWN_ACTION"));
    assert(fs.existsSync(path.join(p.actionResultsRoot, "latest.json")));
    return result.status;
  });

  await check("preflight_no_imprime_secretos_y_needs_config", async () => {
    const p = paths("preflight");
    const result = await runSandboxAction("sandbox.preflight", {
      ...p,
      env: {
        FACTURACOM_SANDBOX_LIVE: "0",
        FACTURACOM_API_KEY: "SECRET_VALUE_SHOULD_NOT_APPEAR",
        FACTURACOM_SECRET_KEY: "SECRET_VALUE_SHOULD_NOT_APPEAR_TOO",
      },
    });
    assertStableResult(result, "sandbox.preflight");
    assert.strictEqual(result.status, "NEEDS_CONFIG");
    const raw = JSON.stringify(result);
    assert(!raw.includes("SECRET_VALUE_SHOULD_NOT_APPEAR"));
    assert.strictEqual(result.sensitive_findings.length, 0);
    return result.status;
  });

  await check("full_monthly_missing_runtime_needs_runtime", async () => {
    const p = paths("full-missing");
    const result = await runSandboxAction("sandbox.full.monthly.package", { ...p, env: { FACTURACOM_SANDBOX_LIVE: "0" } });
    assertStableResult(result, "sandbox.full.monthly.package");
    assert.strictEqual(result.status, "NEEDS_RUNTIME");
    assert(result.warnings.length > 0 || JSON.stringify(result.output).includes("NEEDS_RUNTIME"));
    return result.status;
  });

  await check("acciones_no_escriben_fuera_runtime", async () => {
    const p = paths("outside");
    await assert.rejects(() => runSandboxAction("sandbox.report.generate", {
      ...p,
      actionResultsRoot: path.join(root, "outside-action-results"),
    }), /fuera de runtime/);
    return "blocked";
  });

  await check("produccion_bloqueada_en_accion_sandbox", async () => {
    const p = paths("production");
    const result = await runSandboxAction("sandbox.preflight", {
      ...p,
      env: {
        FACTURACOM_SANDBOX_LIVE: "1",
        FACTURACOM_BASE_URL: "https://api.factura.com",
      },
    });
    assertStableResult(result, "sandbox.preflight");
    assert.strictEqual(result.status, "ERROR");
    assert(result.errors.includes("PRODUCTION_BLOCKED"));
    assert(!JSON.stringify(result).includes("https://api.factura.com"));
    return "blocked";
  });

  await check("resultado_json_estable_y_latest_analizable", async () => {
    const p = paths("stable");
    const result = await runSandboxAction("sandbox.report.generate", { ...p, env: { FACTURACOM_SANDBOX_LIVE: "0" } });
    assertStableResult(result, "sandbox.report.generate");
    assert.strictEqual(result.status, "NEEDS_RUNTIME");
    const latestPath = path.join(p.actionResultsRoot, "latest.json");
    assert(fs.existsSync(latestPath), "latest.json");
    const parsed = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    assert.strictEqual(parsed.action, "sandbox.report.generate");
    const analysis = analyzeLatestActionResult({ actionResultsRoot: p.actionResultsRoot });
    assert.strictEqual(analysis.exists, true);
    assert.strictEqual(analysis.action, "sandbox.report.generate");
    return analysis.status;
  });

  await check("sensitive_findings_none", async () => {
    const p = paths("sensitive-none");
    const result = await runSandboxAction("sandbox.package.generate", { ...p, env: { FACTURACOM_SANDBOX_LIVE: "0" } });
    assertStableResult(result, "sandbox.package.generate");
    assert.strictEqual(result.sensitive_findings.length, 0);
    return "none";
  });

  await check("report_y_package_no_llaman_pac", async () => {
    const p = paths("no-pac");
    const env = {
      FACTURACOM_SANDBOX_LIVE: "1",
      FACTURACOM_BASE_URL: "https://api.factura.com",
      FACTURACOM_API_KEY: "SECRET_VALUE_SHOULD_NOT_APPEAR",
    };
    const report = await runSandboxAction("sandbox.report.generate", { ...p, env });
    const pack = await runSandboxAction("sandbox.package.generate", { ...p, env });
    assert.strictEqual(report.status, "NEEDS_RUNTIME");
    assert.strictEqual(pack.status, "NEEDS_RUNTIME");
    assert(!JSON.stringify(report).includes("PRODUCTION_BLOCKED"));
    assert(!JSON.stringify(pack).includes("PRODUCTION_BLOCKED"));
    return "no PAC";
  });

  await check("package_safety_error_no_es_needs_runtime", async () => {
    const p = paths("package-safety-error");
    writeMinimalStorage(p.storageRoot);
    const reportResult = generateReports({ storageRoot: p.storageRoot, reportRoot: p.reportRoot, period: "2026-06" });
    assert.strictEqual(reportResult.ok, true);
    makeUnsafeXlsx(path.join(p.packageRoot, "2026-06", "accountant-review-2026-06.xlsx"));
    const result = await runSandboxAction("sandbox.package.generate", { ...p, period: "2026-06", env: { FACTURACOM_SANDBOX_LIVE: "0" } });
    assertStableResult(result, "sandbox.package.generate");
    assert.strictEqual(result.status, "PACKAGE_SAFETY_ERROR");
    assert.strictEqual(result.error_classification, "PACKAGE_SAFETY_ERROR");
    assert.strictEqual(result.needs_runtime, false);
    assert.strictEqual(result.safety_blocked, true);
    assert.notStrictEqual(result.status, "NEEDS_RUNTIME");
    assert(JSON.stringify(result.errors).includes("absolute_path"));
    return result.status;
  });

  await check("full_monthly_package_safety_error_no_es_needs_runtime", async () => {
    const p = paths("full-package-safety-error");
    writeMinimalStorage(p.storageRoot);
    makeUnsafeXlsx(path.join(p.packageRoot, "2026-06", "accountant-review-2026-06.xlsx"));
    const result = await runSandboxAction("sandbox.full.monthly.package", { ...p, period: "2026-06", env: { FACTURACOM_SANDBOX_LIVE: "0" } });
    assertStableResult(result, "sandbox.full.monthly.package");
    assert.strictEqual(result.status, "PACKAGE_SAFETY_ERROR");
    assert.strictEqual(result.error_classification, "PACKAGE_SAFETY_ERROR");
    assert.strictEqual(result.needs_runtime, false);
    assert.strictEqual(result.safety_blocked, true);
    assert.notStrictEqual(result.status, "NEEDS_RUNTIME");
    assert(JSON.stringify(result.errors).includes("absolute_path"));
    return result.status;
  });

  await check("smoke_requiere_live_1", async () => {
    const p = paths("smoke-live-required");
    const result = await runSandboxAction("sandbox.smoke.download", { ...p, env: { FACTURACOM_SANDBOX_LIVE: "0" } });
    assertStableResult(result, "sandbox.smoke.download");
    assert.strictEqual(result.status, "NEEDS_CONFIG");
    return result.status;
  });

  await check("cli_devuelve_json_estable", () => {
    const p = paths("cli");
    const child = spawnSync(process.execPath, ["scripts/run-sandbox-action.js", "sandbox.preflight"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        FACTURACOM_SANDBOX_LIVE: "0",
      },
    });
    assert.strictEqual(child.status, 0, child.stderr || child.stdout);
    const parsed = JSON.parse(child.stdout);
    assertStableResult(parsed, "sandbox.preflight");
    assert.strictEqual(parsed.status, "NEEDS_CONFIG");
    assert(!child.stdout.includes("SECRET_VALUE"));
    assert(p);
    return parsed.status;
  });

  await check("runtime_no_versionado", () => {
    const changed = [
      ...git(["diff", "--name-only"]),
      ...git(["diff", "--cached", "--name-only"]),
    ];
    assert(!changed.some((file) => file.startsWith("runtime/")), changed.join(", "));
    return "runtime ignored";
  });

  console.log("Sandbox Action Runner Tests");
  for (const item of checks) printCheck(item.name, item.pass, item.value);
  const failed = checks.filter((item) => !item.pass);
  console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();
