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

function writeJsonIfChanged(runtimeDir, fileName, value, env = {}) {
  return writeJson(runtimeDir, fileName, value, env);
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

function persistLocalClientUidMap(runtimeDir, uidMap = {}, env = {}) {
  return writeJsonIfChanged(runtimeDir, "client-uids.local.json", uidMap, env);
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

function normalizeComparable(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function objectValue(object = {}, names = []) {
  for (const name of names) {
    if (object[name] !== undefined && object[name] !== null && String(object[name]).trim() !== "") return object[name];
  }
  return null;
}

function candidateUidFromObject(object = {}) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return null;
  return text(object.UID || object.uid || object.Uid || object.cfdi_uid || object.CFDI_UID);
}

function isClientLikeObject(object = {}) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return false;
  return Boolean(objectValue(object, [
    "RFC",
    "rfc",
    "Rfc",
    "razons",
    "RazonSocial",
    "RazonSocialReceptor",
    "razon_social",
    "legal_name",
    "client_id",
    "Cliente",
    "cliente",
  ]));
}

function collectUidCandidates(response = {}) {
  const candidates = [];
  const seenObjects = new Set();

  function visit(value, pathParts = [], depth = 0) {
    if (value === null || value === undefined || depth > 12) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...pathParts, String(index)], depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    const uid = candidateUidFromObject(value);
    if (uid) {
      const pathLabel = pathParts.join(".");
      candidates.push({
        uid,
        object: value,
        path: pathLabel,
        direct: pathParts.length === 0,
        depth,
        clientLike: isClientLikeObject(value),
      });
    }

    for (const [key, child] of Object.entries(value)) {
      visit(child, [...pathParts, key], depth + 1);
    }
  }

  visit(response);
  return candidates;
}

function pickBestUidCandidate(candidates = []) {
  if (candidates.length === 0) return null;
  const scored = candidates
    .map((candidate, index) => ({
      ...candidate,
      index,
      score: (candidate.direct ? 100 : 0)
        + (candidate.clientLike ? 50 : 0)
        + (candidate.path === "Data" || candidate.path === "data" || candidate.path === "response" ? 20 : 0)
        - candidate.depth,
    }))
    .sort((a, b) => b.score - a.score || a.depth - b.depth || a.index - b.index);
  const best = scored[0];
  const tied = scored.filter((candidate) => candidate.score === best.score && candidate.uid !== best.uid);
  if (tied.length > 0 && !best.direct && !best.clientLike) return null;
  return best.uid;
}

function extractUid(response = {}) {
  return pickBestUidCandidate(collectUidCandidates(response));
}

function clientMatchScore(candidate = {}, expectedClient = {}) {
  const object = candidate.object || {};
  let score = candidate.clientLike ? 5 : 0;

  const expectedRfc = normalizeComparable(expectedClient.rfc);
  const candidateRfc = normalizeComparable(objectValue(object, ["RFC", "rfc", "Rfc"]));
  if (expectedRfc && candidateRfc && expectedRfc === candidateRfc) score += 100;

  const expectedClientId = normalizeComparable(expectedClient.client_id || expectedClient.id);
  const candidateClientId = normalizeComparable(objectValue(object, ["client_id", "id", "ID", "ClientId", "clientId"]));
  if (expectedClientId && candidateClientId && expectedClientId === candidateClientId) score += 80;

  const expectedName = normalizeComparable(expectedClient.legal_name || expectedClient.display_name || expectedClient.name);
  const candidateName = normalizeComparable(objectValue(object, [
    "razons",
    "RazonSocial",
    "RazonSocialReceptor",
    "razon_social",
    "legal_name",
    "name",
    "nombre",
  ]));
  if (expectedName && candidateName && expectedName === candidateName) score += 60;
  if (expectedName && candidateName && (expectedName.includes(candidateName) || candidateName.includes(expectedName))) score += 25;

  return score;
}

function findClientUidInResponse(response = {}, expectedClient = {}) {
  const candidates = collectUidCandidates(response);
  if (candidates.length === 0) return { uid: null, reason: "uid_not_found" };

  const expectedRfc = normalizeComparable(expectedClient.rfc);
  const withScores = candidates
    .map((candidate, index) => ({
      ...candidate,
      index,
      score: clientMatchScore(candidate, expectedClient),
      candidateRfc: normalizeComparable(objectValue(candidate.object, ["RFC", "rfc", "Rfc"])),
    }))
    .filter((candidate) => candidate.score > 0 || candidates.length === 1);

  if (withScores.length === 0) return { uid: null, reason: "uid_not_found" };

  withScores.sort((a, b) => b.score - a.score || a.depth - b.depth || a.index - b.index);
  const best = withScores[0];
  const sameRfc = expectedRfc
    ? withScores.filter((candidate) => candidate.candidateRfc && candidate.candidateRfc === expectedRfc)
    : [];
  const uniqueSameRfcUids = Array.from(new Set(sameRfc.map((candidate) => candidate.uid)));
  if (sameRfc.length > 1 && uniqueSameRfcUids.length > 1) {
    const bestRfcScore = sameRfc[0]?.score || 0;
    const tiedBestRfc = sameRfc.filter((candidate) => candidate.score === bestRfcScore);
    if (tiedBestRfc.length > 1) return { uid: null, reason: "ambiguous_client_uid" };
  }

  const tiedBest = withScores.filter((candidate) => candidate.score === best.score && candidate.uid !== best.uid);
  if (tiedBest.length > 0 && best.score < 160) return { uid: null, reason: "ambiguous_client_uid" };
  return { uid: best.uid, reason: "found" };
}

function extractUuid(response = {}) {
  const data = response.data || response.Data || response;
  return text(data.UUID || data.uuid || data.Uuid);
}

async function lookupClientUidAfterCreate({ client, config, env, requestFn, manifest, summary }) {
  const rfc = text(client?.rfc);
  if (!rfc) return { uid: null, reason: "client_rfc_missing" };

  const lookupPaths = [
    `/v1/clients/${encodeURIComponent(rfc)}`,
    `/v1/clients?rfc=${encodeURIComponent(rfc)}`,
  ];

  let lastReason = "uid_not_found";
  for (const lookupPath of lookupPaths) {
    const artifactPrefix = `client-${safeId(client.client_id)}-lookup-${safeId(lookupPath)}`;
    const requestFile = writeJson(config.runtimeDir, `${artifactPrefix}-request.json`, {
      method: "GET",
      path: lookupPath,
    }, env);
    const response = await requestFn({ method: "GET", path: lookupPath, env });
    const responseFile = writeJson(config.runtimeDir, `${artifactPrefix}-response.json`, response, env);
    manifest.artifacts.push({ type: "CLIENT_LOOKUP_REQUEST", client_id: client.client_id, path: path.relative(root, requestFile).replace(/\\/g, "/") });
    manifest.artifacts.push({ type: "CLIENT_LOOKUP_RESPONSE", client_id: client.client_id, path: path.relative(root, responseFile).replace(/\\/g, "/"), ok: response.ok });

    if (!response.ok) {
      summary.warnings.push(`client_lookup_failed:${client.client_id}:${lookupPath}`);
      continue;
    }
    const lookup = findClientUidInResponse(response, client);
    if (lookup.uid) return lookup;
    lastReason = lookup.reason;
    if (lookup.reason === "ambiguous_client_uid") break;
  }
  return { uid: null, reason: lastReason };
}

async function maybeCreateClient({ client, config, env, uidMap, manifest, summary, requestFn = facturaComRequest }) {
  const existing = getClientUid(client, uidMap, env);
  if (existing) return { uid: existing, reason: "existing" };
  if (!config.createClients) return { uid: null, reason: "not_configured" };

  const body = buildClientCreateBody(client, config);
  const artifactPrefix = `client-${safeId(client.client_id)}`;
  const requestFile = writeJson(config.runtimeDir, `${artifactPrefix}-create-request.json`, {
    method: "POST",
    path: "/v1/clients/create",
    body,
  }, env);
  const response = await requestFn({ method: "POST", path: "/v1/clients/create", body, env });
  const responseFile = writeJson(config.runtimeDir, `${artifactPrefix}-create-response.json`, response, env);
  manifest.artifacts.push({ type: "CLIENT_CREATE_REQUEST", path: path.relative(root, requestFile).replace(/\\/g, "/") });
  manifest.artifacts.push({ type: "CLIENT_CREATE_RESPONSE", path: path.relative(root, responseFile).replace(/\\/g, "/"), ok: response.ok });
  if (!response.ok) {
    summary.errors += 1;
    summary.warnings.push(`client_create_failed:${client.client_id}`);
    return { uid: null, reason: "client_create_failed" };
  }

  summary.clients_created += 1;
  let found = findClientUidInResponse(response, client);
  if (!found.uid) {
    summary.warnings.push(`client_create_uid_lookup_needed:${client.client_id}:${found.reason}`);
    found = await lookupClientUidAfterCreate({ client, config, env, requestFn, manifest, summary });
  }

  if (!found.uid) {
    if (found.reason === "ambiguous_client_uid") {
      summary.ambiguous_clients += 1;
      summary.warnings.push(`ambiguous_client_uid:${client.client_id}`);
    } else {
      summary.client_uid_missing += 1;
      summary.warnings.push(`client_uid_missing:${client.client_id}`);
    }
    return found;
  }

  uidMap[client.client_id] = found.uid;
  persistLocalClientUidMap(config.runtimeDir, uidMap, env);
  summary.client_uids_found += 1;
  return found;
}

async function processDraft({ fixture, client, config, env, uidMap, manifest, summary, requestFn = facturaComRequest }) {
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

  const clientUidResult = await maybeCreateClient({ client, config, env, uidMap, manifest, summary, requestFn });
  if (config.createClients && !clientUidResult.uid) {
    attempt.status = clientUidResult.reason === "ambiguous_client_uid" ? "CLIENT_UID_AMBIGUOUS" : "CLIENT_UID_MISSING";
    attempt.warnings.push(clientUidResult.reason);
    return attempt;
  }
  const clientUid = clientUidResult.uid;
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

  const createResponse = await requestFn({ method: "POST", path: "/v4/cfdi40/create", body, env });
  const responseFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-create-cfdi-response.json`, createResponse, env);
  attempt.artifacts.push(path.relative(root, responseFile).replace(/\\/g, "/"));
  manifest.artifacts.push({ type: "CFDI_CREATE_RESPONSE", draft_id: fixture.draft_id, path: path.relative(root, responseFile).replace(/\\/g, "/"), ok: createResponse.ok });

  if (!createResponse.ok) {
    attempt.status = "CREATE_ERROR";
    summary.errors += 1;
    return attempt;
  }

  attempt.uid = extractUid(createResponse);
  attempt.uuid = extractUuid(createResponse);
  if (attempt.uuid) summary.sandbox_uuids.push(attempt.uuid);
  if (!attempt.uid) {
    attempt.status = "CREATE_OK_UID_MISSING";
    summary.warnings.push(`create_ok_uid_missing:${fixture.draft_id}`);
  } else {
    attempt.status = "CREATE_OK";
    summary.successful += 1;
  }

  if (attempt.uid) {
    const lookupResponse = await requestFn({ method: "GET", path: `/v4/cfdi/uid/${encodeURIComponent(attempt.uid)}`, env });
    const lookupFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-lookup-response.json`, lookupResponse, env);
    attempt.artifacts.push(path.relative(root, lookupFile).replace(/\\/g, "/"));
    manifest.artifacts.push({ type: "CFDI_LOOKUP_RESPONSE", draft_id: fixture.draft_id, path: path.relative(root, lookupFile).replace(/\\/g, "/"), ok: lookupResponse.ok });
  }

  if (config.downloadTest && attempt.uid) {
    for (const format of ["xml", "pdf"]) {
      const downloadResponse = await requestFn({ method: "GET", path: `/v4/cfdi40/${encodeURIComponent(attempt.uid)}/${format}`, env });
      const fileName = `${safeId(fixture.draft_id)}-download.${format}`;
      const artifact = writeText(config.runtimeDir, fileName, downloadResponse.rawText || JSON.stringify(downloadResponse.data));
      attempt.artifacts.push(path.relative(root, artifact).replace(/\\/g, "/"));
      manifest.artifacts.push({ type: `CFDI_${format.toUpperCase()}`, draft_id: fixture.draft_id, path: path.relative(root, artifact).replace(/\\/g, "/"), ok: downloadResponse.ok });
      if (format === "xml" && downloadResponse.ok) summary.xml_downloaded += 1;
      if (format === "pdf" && downloadResponse.ok) summary.pdf_downloaded += 1;
    }
  }

  if (config.cancelTest && attempt.uid) {
    const cancelResponse = await requestFn({
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
    clients_created: 0,
    client_uids_found: 0,
    client_uid_missing: 0,
    ambiguous_clients: 0,
    sandbox_uuids: [],
    warnings: [],
    live: config.live,
    production_blocked: true,
  };
}

async function runSmoke(env = process.env, options = {}) {
  const config = buildSmokeConfig(env);
  if (!config.live) {
    console.log("SKIPPED: live disabled");
    return { skipped: true, ok: true };
  }
  const requestFn = options.requestFn || facturaComRequest;

  const runtimeDir = ensureRuntimeDir(config.runtimeDir);
  const manifest = buildManifest({ ...config, runtimeDir });
  const summary = buildSummary(config);

  try {
    const { drafts, clientById } = loadFixtures();
    const uidMap = loadLocalClientUidMap(runtimeDir, env);
    const batch = drafts.slice(0, config.batchSize);
    for (const fixture of batch) {
      const client = clientById.get(fixture.client_ref || fixture.client_id);
      await processDraft({ fixture, client, config: { ...config, runtimeDir }, env, uidMap, manifest, summary, requestFn });
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
  extractUid,
  findClientUidInResponse,
  runSmoke,
};
