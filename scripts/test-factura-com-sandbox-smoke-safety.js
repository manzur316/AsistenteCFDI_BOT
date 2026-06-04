const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const {
  assertFacturaComSandboxEnv,
  buildFacturaComHeaders,
  extractFacturaComApiMessage,
  extractFacturaComApiStatus,
  isFacturaComApiError,
  isFacturaComApiSuccess,
  normalizeFacturaComHttpResponse,
  safeApiMessagePreview,
  sanitizeFacturaComError,
  sanitizeFacturaComResponse,
  sanitizeValue,
} = require("./lib/factura-com-live-client");
const {
  buildSmokeConfig,
  extractCfdiIdentity,
  extractCfdiIdentityFromHeaders,
  extractClientUid,
  extractCfdiUid,
  extractUid,
  extractUuid,
  findClientUidInResponse,
  runSmoke,
} = require("./smoke-factura-com-sandbox");
const { analyze } = require("./analyze-factura-com-sandbox-results");
const { inspectRuntime } = require("./inspect-facturacom-sandbox-response-shape");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-facturacom-sandbox-smoke-safety");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];
const asyncChecks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function checkAsync(name, fn) {
  asyncChecks.push({ name, fn });
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validLiveEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "LOCAL_FAKE_API_KEY_1234567890",
    FACTURACOM_SECRET_KEY: "LOCAL_FAKE_SECRET_KEY_1234567890",
    FACTURACOM_PLUGIN: "LOCAL_FAKE_PLUGIN_1234567890",
    FACTURACOM_SANDBOX_SERIE: "SERIE-DEMO",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "00000",
    FACTURACOM_SANDBOX_CREATE_CLIENTS: "0",
    FACTURACOM_SANDBOX_CANCEL_TEST: "0",
    FACTURACOM_SANDBOX_DOWNLOAD_TEST: "0",
    FACTURACOM_SANDBOX_BATCH_SIZE: "1",
    ...overrides,
  };
}

function runNode(args, env = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
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

function assertNoSecret(value, secret) {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes(secret), `secret leaked: ${secret}`);
}

cleanTemp();

check("smoke_sin_live_sale_0_y_no_escribe_runtime", () => {
  const runtimeDir = path.join(tempRoot, "no-live");
  const result = runNode(["scripts/smoke-factura-com-sandbox.js"], {
    FACTURACOM_SANDBOX_LIVE: "0",
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert(result.stdout.includes("SKIPPED: live disabled"), result.stdout);
  assert(!fs.existsSync(runtimeDir), "runtime no-live no debe crearse");
  return "SKIPPED";
});

check("env_sin_api_key_falla_preflight_live", () => {
  assert.throws(() => assertFacturaComSandboxEnv(validLiveEnv({ FACTURACOM_API_KEY: "" })), /FACTURACOM_API_KEY/);
  return "preflight";
});

check("base_url_produccion_bloqueada", () => {
  assert.throws(() => assertFacturaComSandboxEnv(validLiveEnv({ FACTURACOM_BASE_URL: "https://api.factura.com" })), /Produccion|sandbox/);
  return "production blocked";
});

check("base_url_no_sandbox_bloqueada", () => {
  assert.throws(() => assertFacturaComSandboxEnv(validLiveEnv({ FACTURACOM_BASE_URL: "https://example.com/api" })), /sandbox\.factura\.com/);
  assert.throws(() => assertFacturaComSandboxEnv(validLiveEnv({ FACTURACOM_BASE_URL: "https://sandbox.factura.com.evil.test/api" })), /sandbox\.factura\.com/);
  return "non-sandbox blocked";
});

check("headers_se_construyen_y_sanitizan", () => {
  const env = validLiveEnv();
  const headers = buildFacturaComHeaders(env);
  assert.strictEqual(headers["F-Api-Key"], env.FACTURACOM_API_KEY);
  const sanitized = sanitizeValue({ headers }, env);
  assert.strictEqual(sanitized.headers["F-Api-Key"], "[REDACTED]");
  assert.strictEqual(sanitized.headers["F-Secret-Key"], "[REDACTED]");
  assert.strictEqual(sanitized.headers["F-PLUGIN"], "[REDACTED]");
  assertNoSecret(sanitized, env.FACTURACOM_API_KEY);
  assertNoSecret(sanitized, env.FACTURACOM_SECRET_KEY);
  assertNoSecret(sanitized, env.FACTURACOM_PLUGIN);
  return "redacted";
});

check("request_response_error_sanitizados", () => {
  const env = validLiveEnv();
  const response = sanitizeFacturaComResponse({
    headers: { "F-Api-Key": env.FACTURACOM_API_KEY },
    data: { RFC: "AAA010101AAA", message: `bad ${env.FACTURACOM_SECRET_KEY}` },
  }, env);
  const error = sanitizeFacturaComError(new Error(`plugin ${env.FACTURACOM_PLUGIN} rfc AAA010101AAA`), env);
  assertNoSecret(response, env.FACTURACOM_API_KEY);
  assertNoSecret(response, env.FACTURACOM_SECRET_KEY);
  assertNoSecret(error, env.FACTURACOM_PLUGIN);
  assert(JSON.stringify(response).includes("[REDACTED_RFC]"));
  assert(JSON.stringify(error).includes("[REDACTED_RFC]"));
  return "clean";
});

check("normaliza_error_api_facturacom_con_http_200", () => {
  const env = validLiveEnv();
  const response = normalizeFacturaComHttpResponse({
    ok: true,
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    responseHeaders: { "content-type": "application/json" },
    data: {
      response: "error",
      message: `RFC AAA010101AAA invalido ${env.FACTURACOM_SECRET_KEY}`,
    },
    rawText: '{"response":"error"}',
  }, env);
  assert.strictEqual(extractFacturaComApiStatus(response.data), "error");
  assert(extractFacturaComApiMessage(response.data).includes("[REDACTED_RFC]"));
  assert.strictEqual(isFacturaComApiError(response.data), true);
  assert.strictEqual(isFacturaComApiSuccess(response.data), false);
  assert.strictEqual(response.http_ok, true);
  assert.strictEqual(response.api_ok, false);
  assert.strictEqual(response.ok, false);
  assert.strictEqual(response.api_status_unknown, false);
  assert.strictEqual(response.api_message_summary.includes("[REDACTED_RFC]"), true);
  assertNoSecret(response, env.FACTURACOM_SECRET_KEY);
  return "http ok/api error";
});

check("safe_api_message_preview_convierte_html_error_a_texto", () => {
  const env = validLiveEnv();
  const html = `<b>Error</b><br>El campo UsoCFDI es requerido &amp; debe ser valido para RFC AAA010101AAA. F-Api-Key: ${env.FACTURACOM_API_KEY}`;
  const preview = safeApiMessagePreview(html, env);
  assert(preview.includes("Error"), preview);
  assert(preview.includes("El campo UsoCFDI es requerido & debe ser valido"), preview);
  assert(preview.includes("[REDACTED_RFC]"), preview);
  assert(!preview.includes("<b>"), preview);
  assert(!preview.includes(env.FACTURACOM_API_KEY), preview);
  assert(preview.includes("F-Api-Key: [REDACTED]"), preview);
  return preview;
});

check("safe_api_message_preview_redacta_xml_pdf_y_secretos", () => {
  const env = validLiveEnv();
  const xmlPreview = safeApiMessagePreview('<?xml version="1.0"?><cfdi:Comprobante RFC="AAA010101AAA"></cfdi:Comprobante>', env);
  const cfdiPreview = safeApiMessagePreview('<cfdi:Comprobante><tfd:TimbreFiscalDigital UUID="00000000-0000-4000-8000-000000000999" /></cfdi:Comprobante>', env);
  const pdfPreview = safeApiMessagePreview("%PDF-1.7 demo content", env);
  const objectPreview = safeApiMessagePreview({
    message: `<strong>Error</strong> token=${env.FACTURACOM_SECRET_KEY}`,
    nested: ["RFC AAA010101AAA"],
  }, env);
  assert(xmlPreview.startsWith("[REDACTED_XML_TEXT"), xmlPreview);
  assert(cfdiPreview.startsWith("[REDACTED_XML_TEXT"), cfdiPreview);
  assert(pdfPreview.startsWith("[REDACTED_PDF_TEXT"), pdfPreview);
  assert(!objectPreview.includes(env.FACTURACOM_SECRET_KEY), objectPreview);
  assert(objectPreview.includes("[REDACTED_FACTURACOM_SECRET]") || objectPreview.includes("[REDACTED]"), objectPreview);
  assert(objectPreview.includes("[REDACTED_RFC]"), objectPreview);
  assert.strictEqual(safeApiMessagePreview("[REDACTED_XML_TEXT len=114]", env), "[REDACTED_XML_TEXT len=114]");
  return "redacted";
});

check("normaliza_status_error_objeto_y_http_error", () => {
  const env = validLiveEnv();
  const apiError = normalizeFacturaComHttpResponse({
    ok: true,
    status: 200,
    data: {
      status: "error",
      message: { UsoCFDI: ["<b>Campo requerido</b>"] },
    },
  }, env);
  const httpError = normalizeFacturaComHttpResponse({
    ok: false,
    status: 400,
    statusText: "Bad Request",
    data: { message: "bad request" },
  }, env);
  assert.strictEqual(apiError.http_ok, true);
  assert.strictEqual(apiError.api_ok, false);
  assert.strictEqual(apiError.ok, false);
  assert(apiError.api_message_summary.includes("Campo requerido"), apiError.api_message_summary);
  assert.strictEqual(httpError.http_ok, false);
  assert.strictEqual(httpError.api_ok, null);
  assert.strictEqual(httpError.ok, false);
  return "status error/http error";
});

check("normaliza_success_y_estado_api_desconocido", () => {
  const success = normalizeFacturaComHttpResponse({
    ok: true,
    status: 201,
    data: { status: "success", Data: { UID: "CFDI-UID-DEMO" } },
  }, validLiveEnv());
  const unknown = normalizeFacturaComHttpResponse({
    ok: true,
    status: 200,
    data: { Data: { UID: "CFDI-UID-DEMO" } },
  }, validLiveEnv());
  assert.strictEqual(success.http_ok, true);
  assert.strictEqual(success.api_ok, true);
  assert.strictEqual(success.ok, true);
  assert.strictEqual(unknown.http_ok, true);
  assert.strictEqual(unknown.api_ok, null);
  assert.strictEqual(unknown.api_status_unknown, true);
  assert.strictEqual(unknown.ok, true);
  return "success/unknown";
});

check("smoke_no_escribe_fuera_de_runtime", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "smoke-factura-com-sandbox.js"), "utf8");
  assert(source.includes("ensureRuntimeDir"));
  assert(source.includes("isInside"));
  assert(!/writeFileSync\([^)]*data[\\/]/i.test(source));
  assert(!/writeFileSync\([^)]*workflow[\\/]/i.test(source));
  return "runtime guarded";
});

check("analyzer_detecta_secretos_simulados", () => {
  const runtimeDir = path.join(tempRoot, "secret-runtime");
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    artifacts: [{ path: path.relative(root, path.join(runtimeDir, "bad.json")).replace(/\\/g, "/") }],
    attempts: [],
  });
  writeJson(path.join(runtimeDir, "summary.json"), { total_attempts: 0, warnings: [] });
  fs.writeFileSync(path.join(runtimeDir, "bad.json"), '{"F-Api-Key":"REALSECRET1234567890"}', "utf8");
  const result = runNode(["scripts/analyze-factura-com-sandbox-results.js", runtimeDir]);
  assert.notStrictEqual(result.status, 0, "analyzer debe fallar con secreto");
  assert(result.stdout.includes("Sensitive findings") || result.stderr.includes("ERROR"));
  return "detected";
});

check("analyzer_acepta_manifest_limpio", () => {
  const runtimeDir = path.join(tempRoot, "clean-runtime");
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [],
    attempts: [],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 0,
    successful: 0,
    errors: 0,
    needs_local_config: 0,
    xml_downloaded: 0,
    pdf_downloaded: 0,
    cancel_ok: 0,
    cancel_error: 0,
    sandbox_uuids: [],
    warnings: [],
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.sensitive_findings.length, 0);
  const cli = runNode(["scripts/analyze-factura-com-sandbox-results.js", runtimeDir]);
  assert.strictEqual(cli.status, 0, cli.stderr);
  return "clean";
});

check("analyzer_reporta_uid_map_y_contadores_cliente", () => {
  const runtimeDir = path.join(tempRoot, "uid-map-runtime");
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [],
    attempts: [],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 1,
    successful: 1,
    errors: 0,
    clients_created: 1,
    client_uids_found: 1,
    client_uid_missing: 0,
    ambiguous_clients: 0,
    sandbox_uuids: [],
    warnings: [],
  });
  writeJson(path.join(runtimeDir, "client-uids.local.json"), {
    "CLIENT-DEMO-PF-GENERIC": "UID-DEMO-CLIENT",
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.clients_created, 1);
  assert.strictEqual(result.client_uids_found, 1);
  assert.strictEqual(result.client_uid_missing, 0);
  assert.strictEqual(result.ambiguous_clients, 0);
  assert.strictEqual(result.client_uid_map_exists, true);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return "uid map";
});

check("analyzer_reporta_identidad_cfdi", () => {
  const runtimeDir = path.join(tempRoot, "identity-runtime");
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [],
    attempts: [{
      draft_id: "DRAFT-DEMO",
      status: "CREATE_OK",
      uid: "CFDI-UID-ANALYZER",
      cfdi_uid: "CFDI-UID-ANALYZER",
      uuid: "00000000-0000-4000-8000-000000000222",
      pac_invoice_id: "PAC-INVOICE-ANALYZER",
      identity_completeness: "complete",
    }],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 1,
    successful: 1,
    errors: 0,
    cfdi_uids_found: 1,
    uuids_found: 1,
    pac_invoice_ids_found: 1,
    identities_complete: 1,
    identities_partial: 0,
    identity_missing: 0,
    xml_uuid_found: 0,
    lookup_identity_found: 1,
    cfdi_uids: ["CFDI-UID-ANALYZER"],
    pac_invoice_ids: ["PAC-INVOICE-ANALYZER"],
    sandbox_uuids: ["00000000-0000-4000-8000-000000000222"],
    warnings: [],
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.cfdi_uids_found, 1);
  assert.strictEqual(result.uuids_found, 1);
  assert.strictEqual(result.pac_invoice_ids_found, 1);
  assert.strictEqual(result.identities_complete, 1);
  assert.strictEqual(result.identity_missing, 0);
  assert.strictEqual(result.lookup_identity_found, 1);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return "identity summary";
});

check("analyzer_reporta_identity_missing_sin_secretos", () => {
  const runtimeDir = path.join(tempRoot, "identity-missing-runtime");
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [],
    attempts: [{ draft_id: "DRAFT-DEMO", status: "CREATE_OK_UID_MISSING", identity_completeness: "missing" }],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 1,
    successful: 0,
    errors: 0,
    cfdi_uids_found: 0,
    uuids_found: 0,
    identities_complete: 0,
    identities_partial: 0,
    identity_missing: 1,
    warnings: ["create_ok_uid_missing:DRAFT-DEMO"],
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.identity_missing, 1);
  assert.strictEqual(result.cfdi_uids_found, 0);
  assert.strictEqual(result.uuids_found, 0);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return "missing";
});

check("analyzer_reporta_create_api_error_sin_contar_identity_missing", () => {
  const runtimeDir = path.join(tempRoot, "api-error-runtime");
  const responsePath = path.join(runtimeDir, "DRAFT-API-ERROR-create-cfdi-response.json");
  const htmlMessage = "<b>Error</b><br>El campo UsoCFDI es requerido para RFC AAA010101AAA";
  writeJson(responsePath, {
    ok: false,
    http_ok: true,
    api_ok: false,
    status: 200,
    api_status: "error",
    api_message_summary: safeApiMessagePreview(htmlMessage),
    api_error_fields: {
      response: "error",
      message: safeApiMessagePreview(htmlMessage),
    },
    data: {
      response: "error",
      message: htmlMessage,
    },
  });
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [{
      type: "CFDI_CREATE_RESPONSE",
      draft_id: "DRAFT-API-ERROR",
      path: path.relative(root, responsePath).replace(/\\/g, "/"),
      ok: false,
    }],
    attempts: [{
      draft_id: "DRAFT-API-ERROR",
      status: "CREATE_API_ERROR",
      http_ok: true,
      api_ok: false,
      api_status: "error",
      api_message_summary: htmlMessage,
      api_error: {
        http_ok: true,
        api_ok: false,
        api_status: "error",
        api_message_summary: htmlMessage,
      },
    }],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 1,
    successful: 0,
    errors: 1,
    api_errors: 1,
    http_errors: 0,
    create_api_errors: 1,
    create_http_errors: 0,
    api_error_messages_detected: [htmlMessage],
    business_successful: 0,
    identity_missing_after_api_success: 0,
    warnings: [],
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.api_errors, 1);
  assert.strictEqual(result.create_api_errors, 1);
  assert.strictEqual(result.http_errors, 0);
  assert.strictEqual(result.identity_missing_after_api_success, 0);
  assert.strictEqual(result.api_error_messages_detected.length, 1);
  assert(result.api_error_messages_detected[0].includes("El campo UsoCFDI es requerido"), result.api_error_messages_detected[0]);
  assert(result.api_error_messages_detected[0].includes("[REDACTED_RFC]"), result.api_error_messages_detected[0]);
  assert.strictEqual(result.create_api_error_message_previews.length, 1);
  const cli = runNode(["scripts/analyze-factura-com-sandbox-results.js", runtimeDir]);
  assert.strictEqual(cli.status, 0, cli.stderr);
  assert(cli.stdout.includes("API error message previews:"), cli.stdout);
  assert(cli.stdout.includes("Create API error message previews:"), cli.stdout);
  assert(!cli.stdout.includes("AAA010101AAA"), cli.stdout);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return "api error";
});

check("analyzer_detecta_client_uid_como_cfdi_uid", () => {
  const runtimeDir = path.join(tempRoot, "client-uid-collision-runtime");
  const requestPath = path.join(runtimeDir, "DRAFT-DEMO-create-cfdi-request.json");
  writeJson(requestPath, {
    body: {
      Receptor: { UID: "UID-CLIENT-COLLISION", RFC: "XAXX010101000" },
    },
  });
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [{
      type: "CFDI_CREATE_REQUEST",
      draft_id: "DRAFT-DEMO",
      path: path.relative(root, requestPath).replace(/\\/g, "/"),
    }],
    attempts: [{
      draft_id: "DRAFT-DEMO",
      status: "CREATE_OK",
      client_uid: "UID-CLIENT-COLLISION",
      cfdi_uid: "UID-CLIENT-COLLISION",
    }],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 1,
    successful: 1,
    warnings: [],
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.possible_client_uid_used_as_cfdi_uid.length, 1);
  assert(result.sensitive_findings.some((finding) => finding.includes("possible_client_uid_used_as_cfdi_uid")));
  return "detected";
});

check("inspector_no_imprime_valores_completos_y_marca_forbidden", () => {
  const runtimeDir = path.join(tempRoot, "inspect-runtime");
  const responsePath = path.join(runtimeDir, "DRAFT-SHAPE-create-cfdi-response.json");
  writeJson(responsePath, {
    ok: true,
    status: 200,
    data: {
      response: "error",
      message: "<b>Validacion fallida</b><br>Campo requerido para CFDI-UID-SHAPE-SECRET",
      api_message_summary: "<p>Resumen seguro</p>",
      request: {
        headers: {
          "F-Api-Key": "SHOULD-NOT-PRINT-REQUEST-HEADER",
        },
        body: {
          Receptor: { UID: "UID-CLIENT-SHAPE-SECRET", RFC: "XAXX010101000" },
        },
      },
      Data: { UID: "CFDI-UID-SHAPE-SECRET" },
    },
  });
  writeJson(path.join(runtimeDir, "manifest.json"), {
    artifacts: [{
      type: "CFDI_CREATE_RESPONSE",
      draft_id: "DRAFT-SHAPE",
      path: path.relative(root, responsePath).replace(/\\/g, "/"),
    }],
    attempts: [],
  });
  const output = inspectRuntime(runtimeDir);
  assert(output.includes("FORBIDDEN_CLIENT_UID_SOURCE"), output);
  assert(output.includes("uid-like"), output);
  assert(output.includes('preview="error"'), output);
  assert(output.includes("Validacion fallida"), output);
  assert(output.includes("Campo requerido"), output);
  assert(!output.includes("UID-CLIENT-SHAPE-SECRET"), "no debe imprimir client UID completo");
  assert(!output.includes("CFDI-UID-SHAPE-SECRET"), "no debe imprimir cfdi UID completo");
  assert(!output.includes("SHOULD-NOT-PRINT-REQUEST-HEADER"), "no debe imprimir headers de request");
  return "shape safe";
});

check("analyzer_reporta_shapes_headers_y_forbidden_sources", () => {
  const runtimeDir = path.join(tempRoot, "shape-analyzer-runtime");
  const responsePath = path.join(runtimeDir, "DRAFT-SHAPE-create-cfdi-response.json");
  writeJson(responsePath, {
    ok: true,
    status: 201,
    responseHeaders: {
      location: "https://sandbox.factura.com/api/v4/cfdi/uid/CFDI-UID-HEADER-SHAPE",
      "content-type": "application/json",
    },
    data: {
      request: {
        body: {
          Receptor: { UID: "UID-CLIENT-SHAPE", RFC: "XAXX010101000" },
        },
      },
    },
  });
  writeJson(path.join(runtimeDir, "manifest.json"), {
    artifacts: [{
      type: "CFDI_CREATE_RESPONSE",
      draft_id: "DRAFT-SHAPE",
      path: path.relative(root, responsePath).replace(/\\/g, "/"),
    }],
    attempts: [],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 0,
    successful: 0,
    warnings: [],
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.create_response_shapes_detected.length, 1);
  assert.strictEqual(result.header_identity_candidates.length, 1);
  assert.strictEqual(result.forbidden_client_uid_candidates_detected.length, 1);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return "shape analysis";
});

check("download_y_cancel_apagados_por_default", () => {
  const config = buildSmokeConfig({ FACTURACOM_SANDBOX_LIVE: "0" });
  assert.strictEqual(config.downloadTest, false);
  assert.strictEqual(config.cancelTest, false);
  assert.strictEqual(config.createClients, false);
  assert.strictEqual(config.batchSize, 1);
  return "defaults off";
});

check("batch_size_solo_1_o_5", () => {
  assert.strictEqual(buildSmokeConfig({ FACTURACOM_SANDBOX_LIVE: "0", FACTURACOM_SANDBOX_BATCH_SIZE: "5" }).batchSize, 5);
  assert.strictEqual(buildSmokeConfig({ FACTURACOM_SANDBOX_LIVE: "0", FACTURACOM_SANDBOX_BATCH_SIZE: "999" }).batchSize, 1);
  return "1|5";
});

check("extract_uid_soporta_formas_facturacom", () => {
  const cases = [
    [{ UID: "UID-ROOT" }, "UID-ROOT"],
    [{ uid: "UID-LOWER" }, "UID-LOWER"],
    [{ Uid: "UID-MIXED" }, "UID-MIXED"],
    [{ data: { UID: "UID-DATA" } }, "UID-DATA"],
    [{ Data: { UID: "UID-DATA-UPPER" } }, "UID-DATA-UPPER"],
    [{ data: { uid: "UID-DATA-LOWER" } }, "UID-DATA-LOWER"],
    [{ Data: { uid: "UID-DATA-UPPER-LOWER" } }, "UID-DATA-UPPER-LOWER"],
    [{ data: { Data: { UID: "UID-NESTED-DATA" } } }, "UID-NESTED-DATA"],
    [{ data: { data: { UID: "UID-NESTED-LOWER" } } }, "UID-NESTED-LOWER"],
    [{ data: { data: [{ UID: "UID-ARRAY", rfc: "XAXX010101000" }] } }, "UID-ARRAY"],
    [{ data: { response: { UID: "UID-RESPONSE" } } }, "UID-RESPONSE"],
    [{ response: { UID: "UID-ROOT-RESPONSE" } }, "UID-ROOT-RESPONSE"],
    [{ ok: true, data: { data: [{ nested: { UID: "UID-DEEP" } }] } }, "UID-DEEP"],
  ];
  for (const [shape, expected] of cases) {
    assert.strictEqual(extractUid(shape), expected, JSON.stringify(shape));
  }
  return `${cases.length} shapes`;
});

check("extract_cfdi_uid_soporta_formas_facturacom", () => {
  assert.strictEqual(extractCfdiUid({ data: { UID: "CFDI-UID-DATA" } }), "CFDI-UID-DATA");
  assert.strictEqual(extractCfdiUid({ Data: { UID: "CFDI-UID-DATA-UPPER" } }), "CFDI-UID-DATA-UPPER");
  assert.strictEqual(extractCfdiUid({ data: { cfdi_uid: "CFDI-UID-LOWER" } }), "CFDI-UID-LOWER");
  assert.strictEqual(extractCfdiUid({
    data: {
      cliente: { UID: "CLIENT-UID", rfc: "XAXX010101000" },
      cfdi: { UID: "CFDI-UID-PREFERRED", UUID: "00000000-0000-4000-8000-000000000111" },
    },
  }), "CFDI-UID-PREFERRED");
  return "cfdi uid";
});

check("extract_cfdi_uid_ignora_receptor_uid_y_request", () => {
  assert.strictEqual(extractCfdiUid({
    data: {
      request: {
        body: {
          Receptor: { UID: "UID-CLIENT-REQUEST", RFC: "XAXX010101000" },
        },
      },
    },
  }), null);
  assert.strictEqual(extractCfdiUid({
    data: {
      Receptor: { UID: "UID-CLIENT-RECEPTOR", RFC: "XAXX010101000" },
    },
  }), null);
  return "ignored receptor";
});

check("extract_client_uid_detecta_receptor_uid", () => {
  const client = { client_id: "CLIENT-DEMO-PF-GENERIC", rfc: "XAXX010101000" };
  assert.strictEqual(extractClientUid({
    body: {
      Receptor: { UID: "UID-CLIENT-RECEPTOR", RFC: "XAXX010101000" },
    },
  }, client), "UID-CLIENT-RECEPTOR");
  return "client uid";
});

check("extract_uuid_soporta_json_xml_y_no_rfc", () => {
  const uuidRoot = "00000000-0000-4000-8000-000000000101";
  const uuidData = "00000000-0000-4000-8000-000000000102";
  const uuidFolio = "00000000-0000-4000-8000-000000000103";
  const uuidTimbre = "00000000-0000-4000-8000-000000000104";
  const uuidXml = "00000000-0000-4000-8000-000000000105";
  assert.strictEqual(extractUuid({ UUID: uuidRoot }), uuidRoot);
  assert.strictEqual(extractUuid({ data: { UUID: uuidData } }), uuidData);
  assert.strictEqual(extractUuid({ data: { folio_fiscal: uuidFolio } }), uuidFolio);
  assert.strictEqual(extractUuid({ TimbreFiscalDigital: { UUID: uuidTimbre } }), uuidTimbre);
  assert.strictEqual(extractUuid(`<cfdi:Comprobante><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuidXml}" /></cfdi:Complemento></cfdi:Comprobante>`), uuidXml);
  assert.strictEqual(extractUuid({ UUID: "XAXX010101000" }), null);
  assert.strictEqual(extractUuid({ data: { message: "XAXX010101000" } }), null);
  return "uuid safe";
});

check("extract_cfdi_identity_normaliza_campos", () => {
  const uuid = "00000000-0000-4000-8000-000000000106";
  const identity = extractCfdiIdentity({
    data: {
      cfdi_uid: "CFDI-UID-IDENTITY",
      uuid,
      Serie: "A",
      Folio: "123",
      factura_id: "PAC-INVOICE-123",
      status: "active",
    },
  });
  assert.strictEqual(identity.cfdi_uid, "CFDI-UID-IDENTITY");
  assert.strictEqual(identity.uuid, uuid);
  assert.strictEqual(identity.serie, "A");
  assert.strictEqual(identity.folio, "123");
  assert.strictEqual(identity.pac_invoice_id, "PAC-INVOICE-123");
  assert.strictEqual(identity.status, "active");
  return "identity";
});

check("response_header_location_uid_like_es_candidate", () => {
  const identity = extractCfdiIdentityFromHeaders({
    responseHeaders: {
      location: "https://sandbox.factura.com/api/v4/cfdi/uid/CFDI-UID-HEADER-123",
    },
  });
  assert.strictEqual(identity.cfdi_uid, "CFDI-UID-HEADER-123");
  assert.strictEqual(identity.header_identity_candidates[0].kind, "uid-like");
  return "location";
});

check("find_client_uid_elige_por_rfc_client_id_y_nombre", () => {
  const expectedClient = {
    client_id: "CLIENT-DEMO-PF-GENERIC",
    rfc: "XAXX010101000",
    legal_name: "PERSONA FISICA GENERICA DEMO",
  };
  const response = {
    data: [
      { UID: "UID-OTHER", rfc: "AAA010101AAA", client_id: "OTHER" },
      { UID: "UID-EXPECTED", rfc: "XAXX010101000", client_id: "CLIENT-DEMO-PF-GENERIC", razons: "PERSONA FISICA GENERICA DEMO" },
    ],
  };
  assert.deepStrictEqual(findClientUidInResponse(response, expectedClient), { uid: "UID-EXPECTED", reason: "found" });
  return "found";
});

check("find_client_uid_detecta_rfc_ambiguo", () => {
  const expectedClient = {
    client_id: "CLIENT-DEMO-PF-GENERIC",
    rfc: "XAXX010101000",
    legal_name: "PERSONA FISICA GENERICA DEMO",
  };
  const response = {
    data: [
      { UID: "UID-A", rfc: "XAXX010101000" },
      { UID: "UID-B", rfc: "XAXX010101000" },
    ],
  };
  assert.deepStrictEqual(findClientUidInResponse(response, expectedClient), { uid: null, reason: "ambiguous_client_uid" });
  return "ambiguous";
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

check("live_no_se_ejecuta_en_tests", () => {
  assert.notStrictEqual(process.env.FACTURACOM_SANDBOX_LIVE, "1");
  return "no live";
});

checkAsync("create_ok_sin_uid_hace_lookup_y_continua_cfdi", async () => {
  const runtimeDir = path.join(tempRoot, "fallback-runtime");
  const calls = [];
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CREATE_CLIENTS: "1",
  });
  const requestFn = async ({ method, path: requestPath }) => {
    calls.push({ method, path: requestPath });
    if (method === "POST" && requestPath === "/v1/clients/create") {
      return { ok: true, status: 200, data: { message: "cliente creado sin uid" } };
    }
    if (method === "GET" && requestPath === "/v1/clients/XAXX010101000") {
      return {
        ok: true,
        status: 200,
        data: {
          data: [{
            UID: "UID-CLIENT-LOOKUP",
            rfc: "XAXX010101000",
            client_id: "CLIENT-DEMO-PF-GENERIC",
            razons: "PERSONA FISICA GENERICA DEMO",
          }],
        },
      };
    }
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { Data: { UID: "UID-CFDI-001", UUID: "00000000-0000-4000-8000-000000000777" } } };
    }
    if (method === "GET" && requestPath === "/v4/cfdi/uid/UID-CFDI-001") {
      return { ok: true, status: 200, data: { Data: { UID: "UID-CFDI-001" } } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  assert.strictEqual(result.summary.successful, 1);
  assert.strictEqual(result.summary.cfdi_uids_found, 1);
  assert.strictEqual(result.summary.uuids_found, 1);
  assert.strictEqual(result.summary.identities_complete, 1);
  assert(calls.some((call) => call.method === "POST" && call.path === "/v1/clients/create"), "debe crear cliente");
  assert(calls.some((call) => call.method === "GET" && call.path === "/v1/clients/XAXX010101000"), "debe hacer lookup por RFC");
  assert(calls.some((call) => call.method === "POST" && call.path === "/v4/cfdi40/create"), "debe continuar CFDI tras UID");
  const uidMapPath = path.join(runtimeDir, "client-uids.local.json");
  assert(fs.existsSync(uidMapPath), "debe persistir client-uids.local.json en runtime");
  const uidMap = JSON.parse(fs.readFileSync(uidMapPath, "utf8"));
  assert.strictEqual(uidMap["CLIENT-DEMO-PF-GENERIC"], "UID-CLIENT-LOOKUP");
  const gitChanged = git(["status", "--short", "runtime/client-uids.local.json"]);
  assert.strictEqual(gitChanged.length, 0, "client-uids.local.json raiz no debe versionarse");
  return "lookup ok";
});

checkAsync("create_api_error_http_200_no_hace_lookup_ni_identity_missing", async () => {
  const runtimeDir = path.join(tempRoot, "create-api-error-runtime");
  const calls = [];
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
    FACTURACOM_SANDBOX_DOWNLOAD_TEST: "1",
    FACTURACOM_SANDBOX_CANCEL_TEST: "1",
  });
  const requestFn = async ({ method, path: requestPath }) => {
    calls.push({ method, path: requestPath });
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "application/json",
        data: {
          response: "error",
          message: "UsoCFDI no permitido para el receptor demo",
        },
      };
    }
    throw new Error(`no debe continuar despues de API error: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(result.summary.successful, 0);
  assert.strictEqual(result.summary.errors, 1);
  assert.strictEqual(result.summary.api_errors, 1);
  assert.strictEqual(result.summary.create_api_errors, 1);
  assert.strictEqual(result.summary.identity_missing_after_api_success, 0);
  assert.strictEqual(attempt.status, "CREATE_API_ERROR");
  assert.strictEqual(attempt.http_ok, true);
  assert.strictEqual(attempt.api_ok, false);
  assert.strictEqual(attempt.api_error.api_status, "error");
  assert.strictEqual(calls.length, 1);
  assert(!calls.some((call) => call.method === "GET"), "no debe hacer lookup/download");
  const responseArtifact = result.manifest.artifacts.find((artifact) => artifact.type === "CFDI_CREATE_RESPONSE");
  assert.strictEqual(responseArtifact.ok, false);
  return "api error cutoff";
});

checkAsync("identity_se_completa_desde_lookup_si_create_no_trae_uuid", async () => {
  const runtimeDir = path.join(tempRoot, "lookup-identity-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { Data: { UID: "CFDI-UID-LOOKUP", Serie: "A", Folio: "100" } } };
    }
    if (method === "GET" && requestPath === "/v4/cfdi/uid/CFDI-UID-LOOKUP") {
      return {
        ok: true,
        status: 200,
        data: {
          respuestaapi: {
            UUID: "00000000-0000-4000-8000-000000000333",
            factura_id: "PAC-INVOICE-LOOKUP",
            status: "active",
          },
        },
      };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(attempt.uid, "CFDI-UID-LOOKUP");
  assert.strictEqual(attempt.uuid, "00000000-0000-4000-8000-000000000333");
  assert.strictEqual(attempt.pac_invoice_id, "PAC-INVOICE-LOOKUP");
  assert.strictEqual(attempt.identity_completeness, "complete");
  assert.strictEqual(result.summary.lookup_identity_found, 1);
  assert.strictEqual(result.summary.identities_complete, 1);
  return "lookup identity";
});

checkAsync("identity_se_completa_desde_xml_si_lookup_no_trae_uuid", async () => {
  const runtimeDir = path.join(tempRoot, "xml-identity-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_DOWNLOAD_TEST: "1",
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const xmlUuid = "00000000-0000-4000-8000-000000000444";
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { Data: { UID: "CFDI-UID-XML" } } };
    }
    if (method === "GET" && requestPath === "/v4/cfdi/uid/CFDI-UID-XML") {
      return { ok: true, status: 200, data: { response: "success" } };
    }
    if (method === "GET" && requestPath === "/v4/cfdi40/CFDI-UID-XML/xml") {
      return {
        ok: true,
        status: 200,
        rawText: `<cfdi:Comprobante><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${xmlUuid}" /></cfdi:Complemento></cfdi:Comprobante>`,
        data: null,
      };
    }
    if (method === "GET" && requestPath === "/v4/cfdi40/CFDI-UID-XML/pdf") {
      return { ok: true, status: 200, rawText: "%PDF-DEMO%", data: "%PDF-DEMO%" };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(attempt.uid, "CFDI-UID-XML");
  assert.strictEqual(attempt.uuid, xmlUuid);
  assert.strictEqual(attempt.xml_uuid, xmlUuid);
  assert.strictEqual(attempt.identity_completeness, "complete");
  assert.strictEqual(result.summary.xml_uuid_found, 1);
  assert.strictEqual(result.summary.uuids_found, 1);
  return "xml identity";
});

checkAsync("comentarios_incluye_draft_id_internal_invoice_id", async () => {
  const runtimeDir = path.join(tempRoot, "comments-runtime");
  let createBody = null;
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath, body }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      createBody = body;
      return { ok: true, status: 200, data: { Data: { UID: "CFDI-UID-COMMENTS" } } };
    }
    if (method === "GET" && requestPath === "/v4/cfdi/uid/CFDI-UID-COMMENTS") {
      return { ok: true, status: 200, data: { Data: { UID: "CFDI-UID-COMMENTS" } } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };

  await runSmoke(env, { requestFn });
  assert(createBody.Comentarios.includes("SANDBOX_DEMO"), createBody.Comentarios);
  assert(createBody.Comentarios.includes("DRAFT-DEMO-CCTV-SERVICE"), createBody.Comentarios);
  assert(createBody.Comentarios.includes("INTERNAL-DRAFT-DEMO-CCTV-SERVICE"), createBody.Comentarios);
  return "comentarios";
});

checkAsync("fallback_search_no_se_ejecuta_si_no_esta_documentado", async () => {
  const runtimeDir = path.join(tempRoot, "search-not-documented-runtime");
  let searchCalls = 0;
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { response: "success" } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };
  const postCreateSearchFn = async () => {
    searchCalls += 1;
    return { matches: [{ UID: "CFDI-UID-SHOULD-NOT-RUN" }] };
  };

  const result = await runSmoke(env, { requestFn, postCreateSearchFn });
  assert.strictEqual(searchCalls, 0);
  assert.strictEqual(result.summary.successful, 0);
  assert.strictEqual(result.manifest.attempts[0].post_create_search_status, "NOT_DOCUMENTED");
  return "not documented";
});

checkAsync("fallback_search_un_match_asigna_cfdi_uid", async () => {
  const runtimeDir = path.join(tempRoot, "search-one-match-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { response: "success" } };
    }
    if (method === "GET" && requestPath === "/v4/cfdi/uid/CFDI-UID-SEARCH-ONE") {
      return { ok: true, status: 200, data: { Data: { UID: "CFDI-UID-SEARCH-ONE" } } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };
  const postCreateSearchFn = async () => ({ matches: [{ UID: "CFDI-UID-SEARCH-ONE" }] });

  const result = await runSmoke(env, { requestFn, postCreateSearchFn, postCreateSearchDocumented: true });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(result.summary.successful, 1);
  assert.strictEqual(attempt.cfdi_uid, "CFDI-UID-SEARCH-ONE");
  assert.strictEqual(attempt.cfdi_identity_source, "post_create_search");
  assert.strictEqual(attempt.post_create_search_status, "ONE_MATCH");
  return "one match";
});

checkAsync("fallback_search_multiple_matches_marca_ambiguous", async () => {
  const runtimeDir = path.join(tempRoot, "search-ambiguous-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { response: "success" } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };
  const postCreateSearchFn = async () => ({ matches: [{ UID: "CFDI-UID-A" }, { UID: "CFDI-UID-B" }] });

  const result = await runSmoke(env, { requestFn, postCreateSearchFn, postCreateSearchDocumented: true });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(result.summary.successful, 0);
  assert.strictEqual(result.summary.identity_ambiguous, 1);
  assert.strictEqual(attempt.status, "CFDI_IDENTITY_AMBIGUOUS");
  assert.strictEqual(attempt.post_create_search_status, "AMBIGUOUS");
  return "ambiguous";
});

checkAsync("create_identity_desde_response_header_cuenta_success", async () => {
  const runtimeDir = path.join(tempRoot, "header-identity-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return {
        ok: true,
        status: 201,
        responseHeaders: { location: "https://sandbox.factura.com/api/v4/cfdi/uid/CFDI-UID-HEADER-SUCCESS" },
        data: { response: "success" },
      };
    }
    if (method === "GET" && requestPath === "/v4/cfdi/uid/CFDI-UID-HEADER-SUCCESS") {
      return { ok: true, status: 200, data: { Data: { UID: "CFDI-UID-HEADER-SUCCESS" } } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(result.summary.successful, 1);
  assert.strictEqual(attempt.cfdi_uid, "CFDI-UID-HEADER-SUCCESS");
  assert.strictEqual(attempt.cfdi_identity_source, "response_header");
  assert.strictEqual(result.summary.header_identity_candidates, 1);
  return "header success";
});

checkAsync("create_ok_solo_receptor_uid_no_cuenta_como_cfdi_identity", async () => {
  const runtimeDir = path.join(tempRoot, "create-ok-receptor-only-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return {
        ok: true,
        status: 200,
        data: {
          request: {
            body: {
              Receptor: { UID: "UID-CLIENT-LOCAL", RFC: "XAXX010101000" },
            },
          },
        },
      };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(result.summary.successful, 0);
  assert.strictEqual(result.summary.identity_missing, 1);
  assert.strictEqual(attempt.status, "CREATE_OK_IDENTITY_MISSING");
  assert.strictEqual(attempt.cfdi_uid, null);
  assert.strictEqual(attempt.client_uid, "UID-CLIENT-LOCAL");
  assert(attempt.warnings.includes("CFDI_UID_MISSING"));
  return "identity missing";
});

checkAsync("cfdi_uid_igual_client_uid_se_rechaza", async () => {
  const runtimeDir = path.join(tempRoot, "cfdi-equals-client-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { Data: { UID: "UID-CLIENT-LOCAL" } } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(result.summary.successful, 0);
  assert.strictEqual(result.summary.identity_missing, 1);
  assert.strictEqual(attempt.cfdi_uid, null);
  assert(attempt.warnings.some((warning) => warning.includes("possible_client_uid_used_as_cfdi_uid")));
  return "rejected";
});

checkAsync("uid_missing_no_intenta_cfdi", async () => {
  const runtimeDir = path.join(tempRoot, "missing-uid-runtime");
  const calls = [];
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CREATE_CLIENTS: "1",
  });
  const requestFn = async ({ method, path: requestPath }) => {
    calls.push({ method, path: requestPath });
    if (method === "POST" && requestPath === "/v1/clients/create") {
      return { ok: true, status: 200, data: { message: "created_without_uid" } };
    }
    if (method === "GET" && requestPath.startsWith("/v1/clients")) {
      return { ok: true, status: 200, data: { data: [] } };
    }
    throw new Error(`CFDI no debe ejecutarse: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  assert.strictEqual(result.summary.successful, 0);
  assert.strictEqual(result.summary.client_uid_missing, 1);
  assert.strictEqual(result.manifest.attempts[0].status, "CLIENT_UID_MISSING");
  assert(!calls.some((call) => call.path === "/v4/cfdi40/create"), "no debe intentar CFDI sin UID");
  assert(!fs.existsSync(path.join(runtimeDir, "client-uids.local.json")), "no debe persistir UID faltante");
  return "blocked before cfdi";
});

(async () => {
  for (const item of asyncChecks) {
    try {
      const value = await item.fn();
      checks.push({ name: item.name, pass: true, value: value === undefined ? "" : String(value) });
    } catch (error) {
      checks.push({ name: item.name, pass: false, value: error.message });
    }
  }

  console.log("Factura.com Sandbox Smoke Safety Tests");
  for (const item of checks) printCheck(item.name, item.pass, item.value);
  const failed = checks.filter((item) => !item.pass);
  console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();
