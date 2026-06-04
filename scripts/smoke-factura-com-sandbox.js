const fs = require("fs");
const path = require("path");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const { mapCanonicalInvoiceToFacturaComPayload } = require("./lib/factura-com-payload-mapper");
const {
  assertFacturaComSandboxEnv,
  facturaComRequest,
  sanitizeFacturaComError,
  sanitizeValue,
} = require("./lib/factura-com-live-client");

const root = path.resolve(__dirname, "..");
const DEFAULT_RUNTIME_DIR = path.join(root, "runtime", "facturacom-sandbox");
const SCHEMA_VERSION = "facturacom_sandbox_smoke.v1";

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function boolEnv(value) {
  return String(value || "") === "1";
}

function safeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
}

function nowIso() {
  return new Date().toISOString();
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function ensureRuntimeDir(runtimeDir) {
  const resolved = path.resolve(runtimeDir || DEFAULT_RUNTIME_DIR);
  const allowedRoot = path.join(root, "runtime");
  if (!isInside(allowedRoot, resolved)) {
    throw new Error(`Runtime fuera de runtime/: ${resolved}`);
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function writeJson(runtimeDir, fileName, value, env = {}) {
  const resolvedRuntime = ensureRuntimeDir(runtimeDir);
  const target = path.join(resolvedRuntime, fileName);
  if (!isInside(resolvedRuntime, target)) {
    throw new Error(`Salida fuera de runtime sandbox: ${fileName}`);
  }
  fs.writeFileSync(target, `${JSON.stringify(sanitizeValue(value, env), null, 2)}\n`, "utf8");
  return target;
}

function writeText(runtimeDir, fileName, value) {
  const resolvedRuntime = ensureRuntimeDir(runtimeDir);
  const target = path.join(resolvedRuntime, fileName);
  if (!isInside(resolvedRuntime, target)) {
    throw new Error(`Salida fuera de runtime sandbox: ${fileName}`);
  }
  fs.writeFileSync(target, String(value || ""), "utf8");
  return target;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function envValue(env = {}, name) {
  return text(env[name]);
}

function getRuntimeDir(env = {}) {
  return path.resolve(env.FACTURACOM_SANDBOX_RUNTIME_PATH || DEFAULT_RUNTIME_DIR);
}

function parseBatchSize(value) {
  const parsed = Number(value || 1);
  return parsed === 5 ? 5 : 1;
}

function buildSmokeConfig(env = {}) {
  const live = env.FACTURACOM_SANDBOX_LIVE === "1";
  const runtimeDir = getRuntimeDir(env);
  const config = {
    live,
    runtimeDir,
    batchSize: parseBatchSize(env.FACTURACOM_SANDBOX_BATCH_SIZE),
    createClients: boolEnv(env.FACTURACOM_SANDBOX_CREATE_CLIENTS),
    cancelTest: boolEnv(env.FACTURACOM_SANDBOX_CANCEL_TEST),
    downloadTest: boolEnv(env.FACTURACOM_SANDBOX_DOWNLOAD_TEST),
    tipoDocumento: "factura",
    usoCfdi: envValue(env, "FACTURACOM_SANDBOX_USO_CFDI"),
    serie: envValue(env, "FACTURACOM_SANDBOX_SERIE"),
    formaPago: envValue(env, "FACTURACOM_SANDBOX_FORMA_PAGO"),
    metodoPago: envValue(env, "FACTURACOM_SANDBOX_METODO_PAGO"),
    moneda: envValue(env, "FACTURACOM_SANDBOX_MONEDA") || "MXN",
    lugarExpedicion: envValue(env, "FACTURACOM_SANDBOX_LUGAR_EXPEDICION"),
    emitterRegimenFiscal: envValue(env, "FACTURACOM_SANDBOX_EMITTER_REGIMEN_FISCAL") || "626",
  };
  if (live) assertFacturaComSandboxEnv(env);
  return config;
}

function loadFixtures() {
  const clients = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-clients.json"), "utf8"));
  const drafts = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-drafts.json"), "utf8"));
  const clientById = new Map(clients.map((client) => [client.client_id, client]));
  return { clients, drafts, clientById };
}

function loadLocalClientUidMap(runtimeDir, env = {}) {
  const uidFile = text(env.FACTURACOM_SANDBOX_CLIENT_UIDS_FILE)
    || path.join(runtimeDir, "client-uids.local.json");
  const fromFile = readJsonIfExists(uidFile);
  let fromEnv = {};
  if (text(env.FACTURACOM_SANDBOX_CLIENT_UIDS_JSON)) {
    fromEnv = JSON.parse(env.FACTURACOM_SANDBOX_CLIENT_UIDS_JSON);
  }
  return { ...fromFile, ...fromEnv };
}

function getClientUid(client = {}, uidMap = {}, env = {}) {
  const byClientId = text(uidMap[client.client_id]);
  if (byClientId) return byClientId;
  const envKey = `FACTURACOM_SANDBOX_CLIENT_UID_${safeId(client.client_id).toUpperCase()}`;
  return text(env[envKey] || env.FACTURACOM_SANDBOX_RECEIVER_UID);
}

function buildCanonicalScenario(fixture, client) {
  const canonicalDraft = buildCanonicalDraftFromBotPreview({ draft: fixture, client });
  const promoted = promoteCanonicalDraftToInvoiceDocument(canonicalDraft, {
    issued_at: "2026-06-04T00:00:00.000Z",
  });
  if (!promoted.ok) {
    return { ok: false, errors: promoted.errors, canonicalDraft };
  }
  const pacRequestResult = buildCanonicalPacRequest(promoted.invoice_document, "stampSandbox");
  if (!pacRequestResult.ok) {
    return { ok: false, errors: pacRequestResult.errors, canonicalDraft, invoice: promoted.invoice_document };
  }
  const canonicalPacRequest = pacRequestResult.pac_request;
  canonicalPacRequest.payload.canonical_draft = canonicalDraft;
  return {
    ok: true,
    canonicalDraft,
    invoice: promoted.invoice_document,
    canonicalPacRequest,
  };
}

function mapScenarioToFacturaCom(scenario, clientUid, config) {
  return mapCanonicalInvoiceToFacturaComPayload(scenario.invoice, {
    canonicalDraft: scenario.canonicalDraft,
    canonicalPacRequest: scenario.canonicalPacRequest,
    factura_com: {
      receptor_uid: clientUid,
      TipoDocumento: config.tipoDocumento,
      Serie: config.serie,
      FormaPago: config.formaPago,
      MetodoPago: config.metodoPago,
      Moneda: config.moneda,
      LugarExpedicion: config.lugarExpedicion,
      EnviarCorreo: false,
    },
    uso_cfdi: config.usoCfdi,
    emitter_regimen_fiscal: config.emitterRegimenFiscal,
  });
}

function buildClientCreateBody(client = {}, config = {}) {
  return {
    rfc: text(client.rfc),
    razons: text(client.legal_name || client.display_name),
    codpos: text(client.fiscal_zip),
    email: "demo.facturacom@example.invalid",
    usocfdi: config.usoCfdi,
    regimen: text(client.tax_regime),
    calle: "DEMO",
    numero_exterior: "0",
    numero_interior: "",
    colonia: "DEMO",
    ciudad: "DEMO",
    delegacion: "DEMO",
    localidad: "",
    estado: "DEMO",
    pais: "MEX",
    numregidtrib: "",
    nombre: "DEMO",
    apellidos: "SANDBOX",
  };
}

function extractUid(response = {}) {
  const data = response.data || response.Data || response;
  return text(data.UID || data.uid || data.Uid || data.cfdi_uid || data.CFDI_UID);
}

function extractUuid(response = {}) {
  const data = response.data || response.Data || response;
  return text(data.UUID || data.uuid || data.Uuid);
}

async function maybeCreateClient({ client, config, env, uidMap, manifest, summary }) {
  const existing = getClientUid(client, uidMap, env);
  if (existing || !config.createClients) return existing;

  const body = buildClientCreateBody(client, config);
  const artifactPrefix = `client-${safeId(client.client_id)}`;
  const requestFile = writeJson(config.runtimeDir, `${artifactPrefix}-create-request.json`, {
    method: "POST",
    path: "/v1/clients/create",
    body,
  }, env);
  const response = await facturaComRequest({ method: "POST", path: "/v1/clients/create", body, env });
  const responseFile = writeJson(config.runtimeDir, `${artifactPrefix}-create-response.json`, response, env);
  manifest.artifacts.push({ type: "CLIENT_CREATE_REQUEST", path: path.relative(root, requestFile).replace(/\\/g, "/") });
  manifest.artifacts.push({ type: "CLIENT_CREATE_RESPONSE", path: path.relative(root, responseFile).replace(/\\/g, "/"), ok: response.ok });
  if (!response.ok) {
    summary.errors += 1;
    summary.warnings.push(`client_create_failed:${client.client_id}`);
    return null;
  }
  const uid = extractUid(response.data);
  if (!uid) {
    summary.needs_local_config += 1;
    summary.warnings.push(`client_create_missing_uid:${client.client_id}`);
    return null;
  }
  uidMap[client.client_id] = uid;
  return uid;
}

async function processDraft({ fixture, client, config, env, uidMap, manifest, summary }) {
  const attempt = {
    draft_id: fixture.draft_id,
    client_id: client?.client_id || fixture.client_id,
    status: "STARTED",
    artifacts: [],
    uid: null,
    uuid: null,
    warnings: [],
  };
  manifest.attempts.push(attempt);
  summary.total_attempts += 1;

  const scenario = buildCanonicalScenario(fixture, client);
  if (!scenario.ok) {
    attempt.status = "CANONICAL_INVALID";
    attempt.warnings.push(...scenario.errors);
    summary.errors += 1;
    return attempt;
  }

  const clientUid = await maybeCreateClient({ client, config, env, uidMap, manifest, summary });
  const payload = mapScenarioToFacturaCom(scenario, clientUid, config);
  if (payload.official_request.unresolved_fields.length > 0) {
    attempt.status = "NEEDS_LOCAL_CONFIG";
    attempt.warnings.push(...payload.official_request.unresolved_fields);
    summary.needs_local_config += 1;
    return attempt;
  }

  const body = payload.official_request.body;
  const requestFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-create-cfdi-request.json`, {
    method: "POST",
    path: "/v4/cfdi40/create",
    body,
  }, env);
  attempt.artifacts.push(path.relative(root, requestFile).replace(/\\/g, "/"));
  manifest.artifacts.push({ type: "CFDI_CREATE_REQUEST", draft_id: fixture.draft_id, path: path.relative(root, requestFile).replace(/\\/g, "/") });

  const createResponse = await facturaComRequest({ method: "POST", path: "/v4/cfdi40/create", body, env });
  const responseFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-create-cfdi-response.json`, createResponse, env);
  attempt.artifacts.push(path.relative(root, responseFile).replace(/\\/g, "/"));
  manifest.artifacts.push({ type: "CFDI_CREATE_RESPONSE", draft_id: fixture.draft_id, path: path.relative(root, responseFile).replace(/\\/g, "/"), ok: createResponse.ok });

  if (!createResponse.ok) {
    attempt.status = "CREATE_ERROR";
    summary.errors += 1;
    return attempt;
  }

  attempt.uid = extractUid(createResponse.data);
  attempt.uuid = extractUuid(createResponse.data);
  if (attempt.uuid) summary.sandbox_uuids.push(attempt.uuid);
  if (!attempt.uid) {
    attempt.status = "CREATE_OK_UID_MISSING";
    summary.warnings.push(`create_ok_uid_missing:${fixture.draft_id}`);
  } else {
    attempt.status = "CREATE_OK";
    summary.successful += 1;
  }

  if (attempt.uid) {
    const lookupResponse = await facturaComRequest({ method: "GET", path: `/v4/cfdi/uid/${encodeURIComponent(attempt.uid)}`, env });
    const lookupFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-lookup-response.json`, lookupResponse, env);
    attempt.artifacts.push(path.relative(root, lookupFile).replace(/\\/g, "/"));
    manifest.artifacts.push({ type: "CFDI_LOOKUP_RESPONSE", draft_id: fixture.draft_id, path: path.relative(root, lookupFile).replace(/\\/g, "/"), ok: lookupResponse.ok });
  }

  if (config.downloadTest && attempt.uid) {
    for (const format of ["xml", "pdf"]) {
      const downloadResponse = await facturaComRequest({ method: "GET", path: `/v4/cfdi40/${encodeURIComponent(attempt.uid)}/${format}`, env });
      const fileName = `${safeId(fixture.draft_id)}-download.${format}`;
      const artifact = writeText(config.runtimeDir, fileName, downloadResponse.rawText || JSON.stringify(downloadResponse.data));
      attempt.artifacts.push(path.relative(root, artifact).replace(/\\/g, "/"));
      manifest.artifacts.push({ type: `CFDI_${format.toUpperCase()}`, draft_id: fixture.draft_id, path: path.relative(root, artifact).replace(/\\/g, "/"), ok: downloadResponse.ok });
      if (format === "xml" && downloadResponse.ok) summary.xml_downloaded += 1;
      if (format === "pdf" && downloadResponse.ok) summary.pdf_downloaded += 1;
    }
  }

  if (config.cancelTest && attempt.uid) {
    const cancelResponse = await facturaComRequest({
      method: "POST",
      path: `/v4/cfdi40/${encodeURIComponent(attempt.uid)}/cancel`,
      body: { motivo: "02" },
      env,
    });
    const cancelFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-cancel-response.json`, cancelResponse, env);
    attempt.artifacts.push(path.relative(root, cancelFile).replace(/\\/g, "/"));
    manifest.artifacts.push({ type: "CFDI_CANCEL_RESPONSE", draft_id: fixture.draft_id, path: path.relative(root, cancelFile).replace(/\\/g, "/"), ok: cancelResponse.ok });
    if (cancelResponse.ok) summary.cancel_ok += 1;
    else summary.cancel_error += 1;
  }

  return attempt;
}

function buildManifest(config) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: nowIso(),
    live: config.live,
    base_url: "https://sandbox.factura.com/api",
    runtime_dir: path.relative(root, config.runtimeDir).replace(/\\/g, "/"),
    batch_size: config.batchSize,
    flags: {
      create_clients: config.createClients,
      download_test: config.downloadTest,
      cancel_test: config.cancelTest,
    },
    production_blocked: true,
    artifacts: [],
    attempts: [],
  };
}

function buildSummary(config) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: nowIso(),
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
    live: config.live,
    production_blocked: true,
  };
}

async function runSmoke(env = process.env) {
  const config = buildSmokeConfig(env);
  if (!config.live) {
    console.log("SKIPPED: live disabled");
    return { skipped: true, ok: true };
  }

  const runtimeDir = ensureRuntimeDir(config.runtimeDir);
  const manifest = buildManifest({ ...config, runtimeDir });
  const summary = buildSummary(config);

  try {
    const { drafts, clientById } = loadFixtures();
    const uidMap = loadLocalClientUidMap(runtimeDir, env);
    const batch = drafts.slice(0, config.batchSize);
    for (const fixture of batch) {
      const client = clientById.get(fixture.client_ref || fixture.client_id);
      await processDraft({ fixture, client, config: { ...config, runtimeDir }, env, uidMap, manifest, summary });
    }
  } catch (error) {
    summary.errors += 1;
    summary.warnings.push("controlled_error");
    manifest.controlled_error = sanitizeFacturaComError(error, env);
  }

  writeJson(runtimeDir, "manifest.json", manifest, env);
  writeJson(runtimeDir, "summary.json", summary, env);
  console.log(`Factura.com sandbox smoke manifest: ${path.join(runtimeDir, "manifest.json")}`);
  console.log(`Factura.com sandbox smoke summary: ${path.join(runtimeDir, "summary.json")}`);
  console.log(`SUMMARY: attempts=${summary.total_attempts} successful=${summary.successful} errors=${summary.errors} needs_local_config=${summary.needs_local_config}`);
  return { ok: summary.errors === 0, manifest, summary };
}

if (require.main === module) {
  runSmoke(process.env).catch((error) => {
    console.error("FACTURACOM_SANDBOX_SMOKE_ERROR", JSON.stringify(sanitizeFacturaComError(error, process.env), null, 2));
    process.exit(1);
  });
}

module.exports = {
  buildSmokeConfig,
  runSmoke,
};
