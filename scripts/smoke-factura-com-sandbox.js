const fs = require("fs");
const path = require("path");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const { mapCanonicalInvoiceToFacturaComPayload } = require("./lib/factura-com-payload-mapper");
const {
  buildSafeReceptorCompatibilityReport,
  normalizeRfc,
  validateReceptorForCfdi,
  validateRfcShape,
} = require("./lib/cfdi-receptor-compatibility-validator");
const {
  applySandboxFiscalProfilesToClients,
  loadSandboxFiscalProfiles,
} = require("./lib/sandbox-fiscal-profile-loader");
const { runFacturaComAuthPreflight } = require("./preflight-facturacom-auth");
const {
  assertFacturaComSandboxEnv,
  facturaComRequest,
  normalizeFacturaComHttpResponse,
  safeApiMessagePreview,
  sanitizeFacturaComError,
  sanitizeValue,
} = require("./lib/factura-com-live-client");

const root = path.resolve(__dirname, "..");
const DEFAULT_RUNTIME_DIR = path.join(root, "runtime", "facturacom-sandbox");
const SCHEMA_VERSION = "facturacom_sandbox_smoke.v1";
const OFFICIAL_POST_CREATE_SEARCH_DOCUMENTED = false;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const RFC_PATTERN = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;

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
    fiscalProfileId: envValue(env, "FACTURACOM_SANDBOX_FISCAL_PROFILE_ID"),
    skipAuthPreflight: boolEnv(env.FACTURACOM_SKIP_AUTH_PREFLIGHT),
    postCreateSearchDocumented: false,
  };
  if (live) assertFacturaComSandboxEnv(env);
  return config;
}

function loadFixtures(options = {}) {
  const clients = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-clients.json"), "utf8"));
  const drafts = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-drafts.json"), "utf8"));
  const profiles = loadSandboxFiscalProfiles();
  const hydrated = applySandboxFiscalProfilesToClients(clients, { loadedProfiles: profiles });
  const clientById = new Map(hydrated.clients.map((client) => [client.client_id, client]));
  const activeProfileId = text(options.activeFiscalProfileId || profiles.default_smoke_profile_id);
  const sortedDrafts = activeProfileId
    ? [
      ...drafts.filter((draft) => draft.receiver_fiscal_profile_id === activeProfileId),
      ...drafts.filter((draft) => draft.receiver_fiscal_profile_id !== activeProfileId),
    ]
    : drafts;
  return {
    clients: hydrated.clients,
    drafts: sortedDrafts,
    clientById,
    fiscalProfiles: profiles,
    activeFiscalProfileId: activeProfileId,
  };
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

function configForClient(config = {}, client = {}) {
  return {
    ...config,
    usoCfdi: text(client.cfdi_use || client.uso_cfdi) || config.usoCfdi,
    activeFiscalProfileId: text(client.fiscal_profile_id) || config.activeFiscalProfileId || config.fiscalProfileId || null,
  };
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
  const draftId = scenario.canonicalDraft?.draft_id || scenario.invoice?.draft_id || "DRAFT-UNKNOWN";
  const internalInvoiceId = `INTERNAL-${safeId(draftId)}`;
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
      Comentarios: `SANDBOX_DEMO ${draftId} ${internalInvoiceId}`,
    },
    uso_cfdi: config.usoCfdi,
    emitter_regimen_fiscal: config.emitterRegimenFiscal,
  });
}

function buildClientCreateBody(client = {}, config = {}) {
  const normalizedRfc = normalizeRfc(client.rfc);
  return {
    rfc: normalizedRfc,
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

function collectObjects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (!Array.isArray(value)) output.push(value);
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, output);
    return output;
  }
  for (const item of Object.values(value)) collectObjects(item, output);
  return output;
}

function firstObjectValueDeep(value, names = []) {
  for (const object of collectObjects(value)) {
    const found = objectValue(object, names);
    if (found !== null && found !== undefined && String(found).trim() !== "") return found;
  }
  return null;
}

function usableRfcForValidation(value) {
  const candidate = text(value);
  if (!candidate) return null;
  if (/\[REDACTED_RFC\]/i.test(candidate)) return null;
  return candidate;
}

function extractClientResponseFacts(response = {}, expectedClient = {}) {
  const responseData = response.data || response.body || response;
  const uidLookup = findClientUidInResponse(response, expectedClient);
  const rfcValue = usableRfcForValidation(firstObjectValueDeep(responseData, ["RFC", "rfc", "Rfc"]));
  const rfcValidation = validateRfcShape(rfcValue || expectedClient.rfc);
  return {
    uid: uidLookup.uid || null,
    uid_present: Boolean(uidLookup.uid),
    uid_reason: uidLookup.reason || null,
    regimen_id: text(firstObjectValueDeep(responseData, ["RegimenId", "regimenId", "regimen_id", "regimen", "RegimenFiscal", "RegimenFiscalR"])),
    uso_cfdi: text(firstObjectValueDeep(responseData, ["UsoCFDI", "usocfdi", "uso_cfdi", "UsoCfdi"])),
    rfc_shape: rfcValidation.rfc_shape,
    normalized_rfc_shape: rfcValidation.normalized_rfc_shape,
    normalized_rfc_length: rfcValidation.normalized_rfc_length,
    rfc_has_hidden_characters: rfcValidation.has_hidden_characters,
  };
}

function buildLocalInvalidRfcResult(client = {}) {
  const validation = validateRfcShape(client.rfc);
  return {
    uid: null,
    reason: "LOCAL_INVALID_RFC_SHAPE",
    local_status: "LOCAL_INVALID_RFC_SHAPE",
    local_config_errors: validation.errors,
    local_config_warnings: validation.warnings,
    client_rfc_validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
      rfc_shape: validation.rfc_shape,
      normalized_rfc_shape: validation.normalized_rfc_shape,
      normalized_rfc_length: validation.normalized_rfc_length,
      rfc_has_hidden_characters: validation.has_hidden_characters,
    },
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

function isCfdiLikeObject(object = {}, pathLabel = "") {
  if (!object || typeof object !== "object" || Array.isArray(object)) return false;
  const pathText = normalizeComparable(pathLabel).replace(/\./g, " ");
  const cfdiPath = /\b(CFDI|CFDI40|COMPROBANTE|TIMBRE|FACTURA|INVOICE|RESPUESTAAPI|UUID)\b/.test(pathText);
  if (cfdiPath) return true;
  return Boolean(objectValue(object, [
    "UUID",
    "uuid",
    "Uuid",
    "FolioFiscal",
    "folio_fiscal",
    "TimbreFiscalDigital",
    "Comprobante",
    "Conceptos",
    "Emisor",
    "Receptor",
    "Total",
    "Subtotal",
  ]));
}

function collectFieldCandidates(response = {}, wantedKeys = []) {
  const wanted = new Set(wantedKeys.map((key) => String(key).toLowerCase()));
  const candidates = [];
  const seenObjects = new Set();

  function visit(value, pathParts = [], depth = 0) {
    if (value === null || value === undefined || depth > 14) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...pathParts, String(index)], depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    for (const [key, child] of Object.entries(value)) {
      const pathLabel = [...pathParts, key].join(".");
      if (wanted.has(String(key).toLowerCase())) {
        const cleaned = text(child);
        if (cleaned) {
          candidates.push({
            value: cleaned,
            key,
            object: value,
            path: pathLabel,
            depth,
            clientLike: isClientLikeObject(value),
            cfdiLike: isCfdiLikeObject(value, pathLabel),
          });
        }
      }
      visit(child, [...pathParts, key], depth + 1);
    }
  }

  visit(response);
  return candidates;
}

function collectStrings(response = {}) {
  const strings = [];
  const seenObjects = new Set();

  function visit(value, pathParts = [], depth = 0) {
    if (value === null || value === undefined || depth > 14) return;
    if (typeof value === "string") {
      const cleaned = text(value);
      if (cleaned) strings.push({ value: cleaned, path: pathParts.join("."), depth });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...pathParts, String(index)], depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    for (const [key, child] of Object.entries(value)) visit(child, [...pathParts, key], depth + 1);
  }

  visit(response);
  return strings;
}

function validUuid(value) {
  const cleaned = text(value);
  if (!cleaned || RFC_PATTERN.test(cleaned)) return null;
  const match = cleaned.match(UUID_PATTERN);
  return match ? match[0] : null;
}

function extractUuidFromXmlText(value) {
  const cleaned = text(value);
  if (!cleaned || !/[<][^>]+[>]/.test(cleaned)) return null;
  const preferred = cleaned.match(/TimbreFiscalDigital\b[^>]*\bUUID=["']([^"']+)["']/i);
  const fallback = cleaned.match(/\bUUID=["']([^"']+)["']/i);
  return validUuid(preferred?.[1] || fallback?.[1]);
}

function pickBestFieldCandidate(candidates = [], scoreFn = () => 0, validateFn = text) {
  const scored = candidates
    .map((candidate, index) => {
      const value = validateFn(candidate.value);
      if (!value) return null;
      return {
        ...candidate,
        value,
        index,
        score: scoreFn(candidate) - candidate.depth,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.depth - b.depth || a.index - b.index);
  return scored[0]?.value || null;
}

function parseJsonText(value) {
  const cleaned = text(value);
  if (!cleaned || !/^[\[{]/.test(cleaned)) return null;
  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    return null;
  }
}

function cfdiResponseRoots(response = {}) {
  const roots = [];
  for (const key of ["data", "Data", "response", "respuestaapi"]) {
    if (response?.[key] !== undefined && response?.[key] !== null) {
      roots.push({ label: key, value: response[key] });
    }
  }
  const rawJson = parseJsonText(response?.rawText);
  if (rawJson) roots.push({ label: "rawText", value: rawJson });
  return roots;
}

function collectCfdiResponseFieldCandidates(response = {}, wantedKeys = []) {
  return cfdiResponseRoots(response).flatMap((rootItem) => collectFieldCandidates(rootItem.value, wantedKeys)
    .map((candidate) => ({
      ...candidate,
      path: candidate.path ? `${rootItem.label}.${candidate.path}` : rootItem.label,
      depth: candidate.depth + 1,
    })));
}

function isForbiddenCfdiUidCandidate(candidate = {}) {
  const pathText = String(candidate.path || "").toLowerCase();
  if (candidate.clientLike) return true;
  if (/(^|\.)(request|headers|payload|canonical|client|cliente|receiver)(\.|$)/i.test(candidate.path || "")) return true;
  if (/(^|\.)(receptor|receiver)\.(uid|uid_receptor)$/i.test(candidate.path || "")) return true;
  if (pathText.includes("request.body.receptor.uid")) return true;
  return false;
}

function collectCfdiIdentityFieldCandidates(response = {}, wantedKeys = []) {
  return collectCfdiResponseFieldCandidates(response, wantedKeys)
    .filter((candidate) => !isForbiddenCfdiUidCandidate(candidate));
}

function extractCfdiUid(response = {}) {
  const candidates = collectCfdiIdentityFieldCandidates(response, ["UID", "uid", "Uid", "cfdi_uid", "CFDI_UID"]);
  return pickBestFieldCandidate(candidates, (candidate) => {
    const key = String(candidate.key).toLowerCase();
    const pathText = String(candidate.path || "").toLowerCase();
    return (key.includes("cfdi") ? 140 : 60)
      + (candidate.cfdiLike ? 80 : 0)
      + (pathText.includes("cfdi") || pathText.includes("factura") || pathText.includes("respuestaapi") ? 50 : 0)
      + (pathText.includes("data") || pathText.includes("response") ? 10 : 0)
      - (candidate.clientLike ? 120 : 0);
  }, (value) => {
    const cleaned = text(value);
    if (!cleaned || RFC_PATTERN.test(cleaned)) return null;
    return cleaned;
  });
}

function clientMatchScore(candidate = {}, expectedClient = {}) {
  const object = candidate.object || {};
  let score = candidate.clientLike ? 5 : 0;

  const expectedRfc = normalizeComparable(normalizeRfc(expectedClient.rfc));
  const candidateRfc = normalizeComparable(normalizeRfc(objectValue(object, ["RFC", "rfc", "Rfc"])));
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

  const expectedRfc = normalizeComparable(normalizeRfc(expectedClient.rfc));
  const withScores = candidates
    .map((candidate, index) => ({
      ...candidate,
      index,
      score: clientMatchScore(candidate, expectedClient),
      candidateRfc: normalizeComparable(normalizeRfc(objectValue(candidate.object, ["RFC", "rfc", "Rfc"]))),
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

function extractClientUid(response = {}, expectedClient = {}) {
  return findClientUidInResponse(response, expectedClient).uid;
}

function extractUuid(response = {}) {
  const candidates = collectFieldCandidates(response, [
    "UUID",
    "uuid",
    "Uuid",
    "FolioFiscal",
    "folio_fiscal",
  ]);
  const fromFields = pickBestFieldCandidate(candidates, (candidate) => {
    const key = String(candidate.key).toLowerCase();
    const pathText = String(candidate.path || "").toLowerCase();
    return (key === "uuid" || key === "foliofiscal" || key === "folio_fiscal" ? 120 : 60)
      + (candidate.cfdiLike ? 80 : 0)
      + (pathText.includes("timbrefiscaldigital") ? 80 : 0)
      + (pathText.includes("comprobante") || pathText.includes("respuestaapi") ? 40 : 0)
      - (candidate.clientLike ? 120 : 0);
  }, validUuid);
  if (fromFields) return fromFields;

  for (const item of collectStrings(response)) {
    const fromXml = extractUuidFromXmlText(item.value);
    if (fromXml) return fromXml;
  }
  return null;
}

function extractUuidFromCfdiResponse(response = {}) {
  const candidates = collectCfdiIdentityFieldCandidates(response, [
    "UUID",
    "uuid",
    "Uuid",
    "FolioFiscal",
    "folio_fiscal",
  ]);
  const fromFields = pickBestFieldCandidate(candidates, (candidate) => {
    const key = String(candidate.key).toLowerCase();
    const pathText = String(candidate.path || "").toLowerCase();
    return (key === "uuid" || key === "foliofiscal" || key === "folio_fiscal" ? 120 : 60)
      + (candidate.cfdiLike ? 80 : 0)
      + (pathText.includes("timbrefiscaldigital") ? 80 : 0)
      + (pathText.includes("comprobante") || pathText.includes("respuestaapi") ? 40 : 0)
      - (candidate.clientLike ? 120 : 0);
  }, validUuid);
  if (fromFields) return fromFields;

  for (const rootItem of cfdiResponseRoots(response)) {
    for (const item of collectStrings(rootItem.value)) {
      const fromXml = extractUuidFromXmlText(item.value);
      if (fromXml) return fromXml;
    }
  }
  return null;
}

function extractSerie(response = {}) {
  return pickBestFieldCandidate(collectCfdiIdentityFieldCandidates(response, ["Serie", "serie"]), (candidate) => {
    const pathText = String(candidate.path || "").toLowerCase();
    return 80 + (candidate.cfdiLike ? 50 : 0) + (pathText.includes("comprobante") ? 30 : 0) - (candidate.clientLike ? 80 : 0);
  }, (value) => text(value));
}

function extractFolio(response = {}) {
  return pickBestFieldCandidate(collectCfdiIdentityFieldCandidates(response, ["Folio", "folio"]), (candidate) => {
    const pathText = String(candidate.path || "").toLowerCase();
    return 80 + (candidate.cfdiLike ? 50 : 0) + (pathText.includes("comprobante") ? 30 : 0) - (candidate.clientLike ? 80 : 0);
  }, (value) => {
    const cleaned = text(value);
    if (!cleaned || validUuid(cleaned) || RFC_PATTERN.test(cleaned)) return null;
    return cleaned;
  });
}

function extractPacInvoiceId(response = {}) {
  return pickBestFieldCandidate(collectCfdiIdentityFieldCandidates(response, [
    "id",
    "ID",
    "Id",
    "invoice_id",
    "InvoiceId",
    "invoiceId",
    "factura_id",
    "FacturaId",
    "cfdi_id",
    "CFDI_ID",
  ]), (candidate) => {
    const key = String(candidate.key).toLowerCase();
    const pathText = String(candidate.path || "").toLowerCase();
    return (key.includes("invoice") || key.includes("factura") || key.includes("cfdi") ? 120 : 40)
      + (candidate.cfdiLike ? 70 : 0)
      + (pathText.includes("cfdi") || pathText.includes("factura") ? 40 : 0)
      - (candidate.clientLike ? 120 : 0);
  }, (value) => {
    const cleaned = text(value);
    if (!cleaned || RFC_PATTERN.test(cleaned)) return null;
    return cleaned;
  });
}

function extractStatus(response = {}) {
  return pickBestFieldCandidate(collectCfdiIdentityFieldCandidates(response, [
    "status",
    "Status",
    "estado",
    "Estado",
    "response",
    "Response",
    "estatus",
    "Estatus",
  ]), (candidate) => 60 + (candidate.cfdiLike ? 30 : 0), (value) => text(value));
}

function extractCfdiIdentity(response = {}) {
  return extractCfdiIdentityFromCreateResponse(response);
}

function extractCfdiIdentityFromCreateResponse(response = {}) {
  return {
    cfdi_uid: extractCfdiUid(response),
    uuid: extractUuidFromCfdiResponse(response),
    pac_invoice_id: extractPacInvoiceId(response),
    serie: extractSerie(response),
    folio: extractFolio(response),
    status: extractStatus(response),
  };
}

function extractCfdiIdentityFromLookupResponse(response = {}) {
  return extractCfdiIdentityFromCreateResponse(response);
}

function uidLikeFromLocation(location) {
  const cleaned = text(location);
  if (!cleaned || validUuid(cleaned)) return null;
  const pathText = cleaned.split("?")[0];
  const ignored = new Set(["api", "v1", "v3", "v4", "cfdi", "cfdi40", "uid", "uuid", "create", "xml", "pdf", "cancel"]);
  const segments = pathText.split(/[\/#]/).map(text).filter(Boolean).reverse();
  for (const segment of segments) {
    if (ignored.has(segment.toLowerCase())) continue;
    if (/^[A-Za-z0-9_-]{8,90}$/.test(segment) && !RFC_PATTERN.test(segment)) return segment;
  }
  return null;
}

function extractCfdiIdentityFromHeaders(response = {}) {
  const headers = response.responseHeaders || {};
  const location = text(response.location || headers.location || headers.Location);
  const uuid = validUuid(location);
  const cfdiUid = uidLikeFromLocation(location);
  return {
    cfdi_uid: cfdiUid,
    uuid,
    pac_invoice_id: null,
    serie: null,
    folio: null,
    status: null,
    header_identity_candidates: location ? [{
      header: "location",
      kind: uuid ? "uuid" : (cfdiUid ? "uid-like" : "unknown"),
      length: location.length,
      source: "response_header",
    }] : [],
  };
}

function extractCfdiIdentityFromXmlText(xml) {
  return {
    cfdi_uid: null,
    uuid: extractUuidFromXmlText(xml),
    pac_invoice_id: null,
    serie: null,
    folio: null,
    status: null,
  };
}

function mergeIdentityParts(...parts) {
  return parts.reduce((merged, part) => ({
    cfdi_uid: merged.cfdi_uid || part?.cfdi_uid || null,
    uuid: merged.uuid || part?.uuid || null,
    pac_invoice_id: merged.pac_invoice_id || part?.pac_invoice_id || null,
    serie: merged.serie || part?.serie || null,
    folio: merged.folio || part?.folio || null,
    status: merged.status || part?.status || null,
    header_identity_candidates: [
      ...(merged.header_identity_candidates || []),
      ...(part?.header_identity_candidates || []),
    ],
  }), {});
}

function hasClearInvoiceIdentity(identity = {}) {
  return Boolean(identity.cfdi_uid || identity.uuid || identity.pac_invoice_id);
}

function mergeAttemptIdentity(attempt, identity = {}, source = "unknown") {
  if (!identity || typeof identity !== "object") return false;
  const before = JSON.stringify({
    cfdi_uid: attempt.cfdi_uid,
    uuid: attempt.uuid,
    pac_invoice_id: attempt.pac_invoice_id,
    serie: attempt.serie,
    folio: attempt.folio,
  });

  if (!attempt.cfdi_uid && identity.cfdi_uid) {
    if (attempt.client_uid && identity.cfdi_uid === attempt.client_uid) {
      attempt.warnings = Array.isArray(attempt.warnings) ? attempt.warnings : [];
      attempt.warnings.push(`possible_client_uid_used_as_cfdi_uid:${source}`);
    } else {
      attempt.cfdi_uid = identity.cfdi_uid;
      if (!attempt.uid) attempt.uid = identity.cfdi_uid;
    }
  }
  if (!attempt.uuid && identity.uuid) attempt.uuid = identity.uuid;
  if (!attempt.pac_invoice_id && identity.pac_invoice_id) attempt.pac_invoice_id = identity.pac_invoice_id;
  if (!attempt.serie && identity.serie) attempt.serie = identity.serie;
  if (!attempt.folio && identity.folio) attempt.folio = identity.folio;
  if (identity.status) attempt.identity_status = identity.status;
  if (Array.isArray(identity.header_identity_candidates) && identity.header_identity_candidates.length > 0) {
    attempt.header_identity_candidates = [
      ...(attempt.header_identity_candidates || []),
      ...identity.header_identity_candidates,
    ];
  }

  const after = JSON.stringify({
    cfdi_uid: attempt.cfdi_uid,
    uuid: attempt.uuid,
    pac_invoice_id: attempt.pac_invoice_id,
    serie: attempt.serie,
    folio: attempt.folio,
  });
  const changed = before !== after;
  if (changed) {
    attempt.identity_sources = Array.from(new Set([...(attempt.identity_sources || []), source]));
    attempt.cfdi_identity_source = attempt.cfdi_identity_source || source;
  }
  attempt.identity = {
    cfdi_uid: attempt.cfdi_uid || null,
    uuid: attempt.uuid || null,
    pac_invoice_id: attempt.pac_invoice_id || null,
    serie: attempt.serie || null,
    folio: attempt.folio || null,
    status: attempt.identity_status || null,
    sources: attempt.identity_sources || [],
  };
  return changed;
}

function identityCompleteness(attempt = {}) {
  const hasUid = Boolean(attempt.cfdi_uid);
  const hasUuid = Boolean(attempt.uuid);
  if (hasUid && hasUuid) return "complete";
  if (hasUid || hasUuid || attempt.pac_invoice_id || attempt.serie || attempt.folio) return "partial";
  return "missing";
}

function addUnique(list, value) {
  const cleaned = text(value);
  if (cleaned && !list.includes(cleaned)) list.push(cleaned);
}

function finalizeAttemptIdentity(attempt, summary) {
  if (!attempt.identity_attempted || attempt.identity_finalized) return;
  mergeAttemptIdentity(attempt, {}, "finalize");
  const completeness = identityCompleteness(attempt);
  attempt.identity_completeness = completeness;
  if (attempt.cfdi_uid) {
    summary.cfdi_uids_found += 1;
    addUnique(summary.cfdi_uids, attempt.cfdi_uid);
  }
  if (attempt.uuid) {
    summary.uuids_found += 1;
    addUnique(summary.sandbox_uuids, attempt.uuid);
  }
  if (attempt.pac_invoice_id) {
    summary.pac_invoice_ids_found += 1;
    addUnique(summary.pac_invoice_ids, attempt.pac_invoice_id);
  }
  if (Array.isArray(attempt.header_identity_candidates) && attempt.header_identity_candidates.length > 0) {
    summary.header_identity_candidates += attempt.header_identity_candidates.length;
  }
  if (attempt.identity_ambiguous) summary.identity_ambiguous += 1;
  if (completeness === "complete") summary.identities_complete += 1;
  else if (completeness === "partial") summary.identities_partial += 1;
  else summary.identity_missing += 1;
  if (attempt.cfdi_uid && attempt.client_uid && attempt.cfdi_uid === attempt.client_uid) {
    summary.possible_client_uid_used_as_cfdi_uid += 1;
    attempt.warnings = Array.isArray(attempt.warnings) ? attempt.warnings : [];
    attempt.warnings.push("possible_client_uid_used_as_cfdi_uid");
  }
  attempt.identity_finalized = true;
}

async function lookupClientUidAfterCreate({ client, config, env, requestFn, manifest, summary }) {
  const rfc = normalizeRfc(client?.rfc);
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
    const rawResponse = await requestFn({ method: "GET", path: lookupPath, env });
    const response = normalizeFacturaComHttpResponse(rawResponse, env);
    const responseFile = writeJson(config.runtimeDir, `${artifactPrefix}-response.json`, response, env);
    manifest.artifacts.push({ type: "CLIENT_LOOKUP_REQUEST", client_id: client.client_id, path: path.relative(root, requestFile).replace(/\\/g, "/") });
    manifest.artifacts.push({ type: "CLIENT_LOOKUP_RESPONSE", client_id: client.client_id, path: path.relative(root, responseFile).replace(/\\/g, "/"), ok: response.ok });

    if (!response.ok) {
      const failure = recordClientLookupFailure(summary, response, env);
      summary.warnings.push(`client_lookup_failed:${client.client_id}:${lookupPath}`);
      summary.warnings.push(`client_lookup_error:${client.client_id}:${failure.status}`);
      continue;
    }
    const lookup = findClientUidInResponse(rawResponse, client);
    if (lookup.uid) return lookup;
    lastReason = lookup.reason;
    if (lookup.reason === "ambiguous_client_uid") break;
  }
  return { uid: null, reason: lastReason };
}

async function maybeCreateClient({ client, config, env, uidMap, manifest, summary, requestFn = facturaComRequest }) {
  const clientRfcValidation = validateRfcShape(client?.rfc);
  const existing = getClientUid(client, uidMap, env);
  if (existing) return { uid: existing, reason: "existing", client_rfc_validation: buildLocalInvalidRfcResult(client).client_rfc_validation };
  if (!clientRfcValidation.ok) {
    summary.invalid_rfc_shape_detected += 1;
    summary.warnings.push(`client_rfc_invalid_shape:${client?.client_id || "UNKNOWN"}`);
    return buildLocalInvalidRfcResult(client);
  }
  if (clientRfcValidation.warnings.length > 0) {
    summary.warnings.push(`client_rfc_normalized:${client?.client_id || "UNKNOWN"}`);
  }
  if (!config.createClients) {
    return {
      uid: null,
      reason: "not_configured",
      client_rfc_validation: buildLocalInvalidRfcResult(client).client_rfc_validation,
    };
  }

  const body = buildClientCreateBody(client, config);
  const artifactPrefix = `client-${safeId(client.client_id)}`;
  const requestFile = writeJson(config.runtimeDir, `${artifactPrefix}-create-request.json`, {
    method: "POST",
    path: "/v1/clients/create",
    body,
  }, env);
  const rawCreateResponse = await requestFn({ method: "POST", path: "/v1/clients/create", body, env });
  const response = normalizeFacturaComHttpResponse(rawCreateResponse, env);
  const responseFile = writeJson(config.runtimeDir, `${artifactPrefix}-create-response.json`, response, env);
  manifest.artifacts.push({ type: "CLIENT_CREATE_REQUEST", path: path.relative(root, requestFile).replace(/\\/g, "/") });
  manifest.artifacts.push({ type: "CLIENT_CREATE_RESPONSE", path: path.relative(root, responseFile).replace(/\\/g, "/"), ok: response.ok });
  const clientResponseFacts = extractClientResponseFacts(rawCreateResponse, client);
  if (!response.ok) {
    const failure = recordClientCreateFailure(summary, response, env);
    summary.warnings.push(`client_create_failed:${client.client_id}:${failure.status}`);
    const foundAfterFailure = await lookupClientUidAfterCreate({ client, config, env, requestFn, manifest, summary });
    if (foundAfterFailure.uid) {
      uidMap[client.client_id] = foundAfterFailure.uid;
      writeJsonIfChanged(config.runtimeDir, "client-uids.local.json", uidMap, env);
      summary.client_uids_found += 1;
      summary.warnings.push(`client_create_failed_but_lookup_found_uid:${client.client_id}`);
      return {
        ...foundAfterFailure,
        reason: "found_after_client_create_error",
        client_create_status: failure.status,
        client_create_error: failure,
        client_rfc_validation: buildLocalInvalidRfcResult(client).client_rfc_validation,
        client_response_facts: clientResponseFacts,
      };
    }
    if (foundAfterFailure.reason === "ambiguous_client_uid") {
      summary.ambiguous_clients += 1;
      summary.warnings.push(`ambiguous_client_uid_after_create_error:${client.client_id}`);
    } else {
      summary.client_uid_missing += 1;
      summary.warnings.push(`client_uid_missing_after_create_error:${client.client_id}`);
    }
    summary.errors += 1;
    return {
      uid: null,
      reason: "client_create_failed",
      lookup_reason: foundAfterFailure.reason,
      client_create_status: failure.status,
      client_create_error: failure,
      client_rfc_validation: buildLocalInvalidRfcResult(client).client_rfc_validation,
      client_response_facts: clientResponseFacts,
    };
  }

  summary.clients_created += 1;
  let found = findClientUidInResponse(rawCreateResponse, client);
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
  return {
    ...found,
    client_rfc_validation: buildLocalInvalidRfcResult(client).client_rfc_validation,
    client_response_facts: {
      ...clientResponseFacts,
      uid: found.uid || clientResponseFacts.uid || null,
      uid_present: Boolean(found.uid || clientResponseFacts.uid),
    },
  };
}

function normalizePostCreateSearchMatches(searchResult = {}) {
  if (Array.isArray(searchResult)) return searchResult;
  if (Array.isArray(searchResult.matches)) return searchResult.matches;
  if (Array.isArray(searchResult.data)) return searchResult.data;
  if (Array.isArray(searchResult.Data)) return searchResult.Data;
  if (Array.isArray(searchResult.response)) return searchResult.response;
  return [];
}

async function maybeRunPostCreateSearch({ attempt, body, createResponse, config, postCreateSearchFn, postCreateSearchDocumented }) {
  const documented = Boolean(postCreateSearchDocumented || config.postCreateSearchDocumented || OFFICIAL_POST_CREATE_SEARCH_DOCUMENTED);
  if (!documented || typeof postCreateSearchFn !== "function") {
    attempt.post_create_search_status = "NOT_DOCUMENTED";
    return { ok: false, reason: "not_documented" };
  }
  const searchResult = await postCreateSearchFn({
    attempt,
    body,
    createResponse,
    criteria: {
      serie: body?.Serie || null,
      receptor_uid: body?.Receptor?.UID || null,
      total: body?.Conceptos ? null : null,
      comentarios: body?.Comentarios || null,
      internal_invoice_id: attempt.internal_invoice_id || null,
      draft_id: attempt.draft_id || null,
    },
  });
  const matches = normalizePostCreateSearchMatches(searchResult);
  attempt.post_create_search_status = matches.length === 1 ? "ONE_MATCH" : (matches.length > 1 ? "AMBIGUOUS" : "NO_MATCH");
  if (matches.length === 0) return { ok: false, reason: "no_match" };
  if (matches.length > 1) {
    attempt.status = "CFDI_IDENTITY_AMBIGUOUS";
    attempt.identity_ambiguous = true;
    attempt.warnings.push("CFDI_IDENTITY_AMBIGUOUS");
    return { ok: false, reason: "ambiguous" };
  }
  const identity = extractCfdiIdentityFromLookupResponse({ data: matches[0] });
  if (!hasClearInvoiceIdentity(identity)) return { ok: false, reason: "match_without_identity" };
  return { ok: true, identity };
}

function createApiErrorSummary(response = {}) {
  return {
    http_ok: response.http_ok === true,
    api_ok: response.api_ok === undefined ? null : response.api_ok,
    api_status: response.api_status || null,
    api_status_unknown: response.api_status_unknown === true,
    api_message_summary: response.api_message_summary || null,
    api_error_fields: response.api_error_fields || {},
    status: response.status ?? null,
    statusText: response.statusText ?? null,
    contentType: response.contentType || "",
    responseHeaders: response.responseHeaders || {},
  };
}

function pushUnique(list = [], value) {
  const cleaned = text(value);
  if (cleaned && !list.includes(cleaned)) list.push(cleaned);
}

function clientErrorMessage(response = {}, env = {}) {
  return safeApiMessagePreview(
    response.api_message_summary
      || response.api_error_fields?.message
      || response.api_error_fields?.mensaje
      || response.api_error_fields?.error
      || response.data?.message
      || response.data?.mensaje
      || response.data?.error
      || response.data?.errors
      || response.rawText
      || response.statusText,
    env,
    240,
  );
}

function isClientAlreadyExistsMessage(message) {
  const normalized = normalizeComparable(message);
  if (/\b(NO EXISTE|CUENTA NO EXISTE|NO EXISTE LA CUENTA|NOT EXIST|DOES NOT EXIST|ACCOUNT DOES NOT EXIST)\b/.test(normalized)) {
    return false;
  }
  return /\b(CLIENTE YA EXISTE|RFC YA REGISTRAD[OA]|YA SE ENCUENTRA REGISTRAD[OA]|YA ESTA REGISTRAD[OA]|DUPLICATE CLIENT|CLIENT ALREADY EXISTS|ALREADY EXISTS)\b/.test(normalized);
}

function isClientValidationErrorMessage(message) {
  const normalized = normalizeComparable(message);
  return /\b(VALIDACI[OÓ]N|VALIDACION|INVALID[OA]|REQUERID[OA]|OBLIGATORI[OA]|CAMPO|FORMATO|CODIGO POSTAL|REGIMEN|RFC)\b/.test(normalized);
}

function recordClientCreateFailure(summary, response = {}, env = {}) {
  const status = response.http_ok === true ? "CLIENT_CREATE_API_ERROR" : "CLIENT_CREATE_HTTP_ERROR";
  const message = clientErrorMessage(response, env);
  summary.client_create_errors += 1;
  if (status === "CLIENT_CREATE_HTTP_ERROR") summary.http_errors += 1;
  else summary.api_errors += 1;
  pushUnique(summary.client_create_error_messages, message);
  if (isClientAlreadyExistsMessage(message)) summary.client_already_exists_detected += 1;
  if (isClientValidationErrorMessage(message)) summary.client_validation_error_detected += 1;
  return {
    status,
    message,
    api_error: createApiErrorSummary(response),
    already_exists: isClientAlreadyExistsMessage(message),
    validation_error: isClientValidationErrorMessage(message),
  };
}

function recordClientLookupFailure(summary, response = {}, env = {}) {
  const message = clientErrorMessage(response, env);
  summary.client_lookup_errors += 1;
  pushUnique(summary.client_lookup_error_messages, message);
  return {
    status: response.http_ok === true ? "CLIENT_LOOKUP_API_ERROR" : "CLIENT_LOOKUP_HTTP_ERROR",
    message,
    api_error: createApiErrorSummary(response),
  };
}

function applyProviderAuthFailure(attempt, summary, authPreflightResult = {}) {
  const status = authPreflightResult.status || "AUTH_UNKNOWN_API_ERROR";
  const message = authPreflightResult.message || null;
  attempt.status = "PROVIDER_AUTH_FAILED";
  attempt.provider_auth_status = status;
  attempt.provider_auth_message = message;
  attempt.auth_preflight_ok = false;
  attempt.warnings.push(`provider_auth_failed:${status}`);
  summary.errors += 1;
  summary.provider_auth_errors += 1;
  summary.provider_auth_status = status;
  summary.provider_auth_message = message;
  summary.auth_preflight_ok = false;
  summary.warnings.push(`provider_auth_failed:${status}`);
}

function applyInvalidSandboxFiscalProfile({ attempt, summary, manifest, config, env, fixture, client }) {
  const validation = client?.fiscal_profile_validation || {
    ok: false,
    errors: ["SANDBOX_PROFILE_VALIDATION_MISSING"],
    profile_id: client?.fiscal_profile_id || null,
  };
  attempt.local_config_errors = validation.errors || ["LOCAL_INVALID_SANDBOX_FISCAL_PROFILE"];
  attempt.local_config_warnings = validation.warnings || [];
  const invalidRfcProfile = attempt.local_config_errors.some((code) => /RFC.*(INVALID|REDACTED)|LOCAL_INVALID_RFC_SHAPE/.test(code));
  attempt.status = invalidRfcProfile ? "LOCAL_INVALID_RFC_SHAPE" : "LOCAL_INVALID_SANDBOX_FISCAL_PROFILE";
  attempt.sandbox_fiscal_profile = {
    profile_id: validation.profile_id || client?.fiscal_profile_id || null,
    client_id: client?.client_id || null,
    ok: validation.ok === true,
    errors: attempt.local_config_errors,
    warnings: attempt.local_config_warnings,
    rfc_shape: validation.rfc_shape || null,
    normalized_rfc_length: validation.normalized_rfc_length || 0,
    effective_uso_cfdi: validation.effective_uso_cfdi || null,
    effective_regimen_fiscal_receptor: validation.effective_regimen_fiscal_receptor || null,
    effective_person_type: validation.effective_person_type || null,
  };
  attempt.warnings.push(...attempt.local_config_errors, ...attempt.local_config_warnings);
  summary.errors += 1;
  summary.needs_local_config += 1;
  summary.sandbox_fiscal_profile_errors += 1;
  if (invalidRfcProfile) summary.invalid_rfc_shape_detected += 1;
  summary.warnings.push(`sandbox_fiscal_profile_invalid:${attempt.sandbox_fiscal_profile.profile_id || "UNKNOWN"}`);
  const diagnosticFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-local-invalid-sandbox-fiscal-profile.json`, {
    draft_id: fixture.draft_id,
    status: attempt.status,
    sandbox_fiscal_profile: attempt.sandbox_fiscal_profile,
    client_create_blocked: true,
    pac_call_blocked: true,
  }, env);
  attempt.artifacts.push(path.relative(root, diagnosticFile).replace(/\\/g, "/"));
  manifest.artifacts.push({
    type: "LOCAL_INVALID_SANDBOX_FISCAL_PROFILE",
    draft_id: fixture.draft_id,
    path: path.relative(root, diagnosticFile).replace(/\\/g, "/"),
    ok: false,
  });
}

function updateLocalRuleSummary(summary, receptorCompatibility = {}, errors = []) {
  summary.local_cfdi_rule_errors += 1;
  summary.receptor_compatibility_errors += 1;
  if (errors.includes("LOCAL_INVALID_RFC_SHAPE")) summary.invalid_rfc_shape_detected += 1;
  if (errors.includes("LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH")) {
    summary.uso_cfdi_regimen_persona_mismatch += 1;
  }
  if (errors.includes("CLIENT_CFDI_RECEPTOR_MISMATCH")) {
    summary.client_cfdi_receptor_mismatch += 1;
  }
  recordReceptorCompatibilitySummary(summary, receptorCompatibility);
}

function recordReceptorCompatibilitySummary(summary, receptorCompatibility = {}) {
  if (receptorCompatibility.effective_uso_cfdi) pushUnique(summary.effective_uso_cfdi_values, receptorCompatibility.effective_uso_cfdi);
  if (receptorCompatibility.effective_regimen_fiscal_receptor) {
    pushUnique(summary.effective_regimen_fiscal_receptor_values, receptorCompatibility.effective_regimen_fiscal_receptor);
  }
  if (receptorCompatibility.effective_person_type) pushUnique(summary.effective_person_type_values, receptorCompatibility.effective_person_type);
  if (receptorCompatibility.rfc_shape) pushUnique(summary.rfc_shape_values, receptorCompatibility.rfc_shape);
  if (receptorCompatibility.normalized_rfc_length) pushUnique(summary.normalized_rfc_lengths, String(receptorCompatibility.normalized_rfc_length));
  if (receptorCompatibility.rfc_has_hidden_characters === true) summary.rfc_hidden_characters_detected += 1;
}

function buildClientCfdiReceptorMismatches(body = {}, clientFacts = null, receptorCompatibility = {}) {
  if (!clientFacts || typeof clientFacts !== "object") return [];
  const mismatches = [];
  const bodyRegimen = text(body?.Receptor?.RegimenFiscalR);
  const bodyUso = text(body?.UsoCFDI);
  const bodyUid = text(body?.Receptor?.UID);
  if (clientFacts.regimen_id && bodyRegimen && clientFacts.regimen_id !== bodyRegimen) {
    mismatches.push({ field: "RegimenFiscalR", client_value: clientFacts.regimen_id, cfdi_value: bodyRegimen, affects_cfdi40161: true });
  }
  if (clientFacts.uso_cfdi && bodyUso && clientFacts.uso_cfdi !== bodyUso) {
    mismatches.push({ field: "UsoCFDI", client_value: clientFacts.uso_cfdi, cfdi_value: bodyUso, affects_cfdi40161: true });
  }
  if (clientFacts.uid && bodyUid && clientFacts.uid !== bodyUid) {
    mismatches.push({ field: "Receptor.UID", client_value_present: true, cfdi_value_present: true, affects_cfdi40161: false });
  }
  if (clientFacts.rfc_shape && receptorCompatibility.rfc_shape && clientFacts.rfc_shape !== receptorCompatibility.rfc_shape) {
    mismatches.push({
      field: "RFC_SHAPE",
      client_value: clientFacts.rfc_shape,
      cfdi_value: receptorCompatibility.rfc_shape,
      affects_cfdi40161: true,
    });
  }
  return mismatches;
}

function validateFinalCfdiReceptorPayload({ body = {}, client = {}, clientUidResult = {} } = {}) {
  const rawValidation = validateReceptorForCfdi({
    rfc: client?.rfc,
    regimenFiscalReceptor: body?.Receptor?.RegimenFiscalR,
    usoCfdi: body?.UsoCFDI,
    clientUid: body?.Receptor?.UID,
  });
  const receptorCompatibility = buildSafeReceptorCompatibilityReport(rawValidation);
  receptorCompatibility.source = "final_cfdi_create_body";
  if (client?.fiscal_profile_validation?.rfc_has_hidden_characters === true) {
    receptorCompatibility.rfc_has_hidden_characters = true;
  }
  const clientFacts = clientUidResult.client_response_facts || null;
  const mismatches = buildClientCfdiReceptorMismatches(body, clientFacts, receptorCompatibility);
  receptorCompatibility.client_response_facts = clientFacts ? {
    uid_present: clientFacts.uid_present === true,
    regimen_id: clientFacts.regimen_id || null,
    uso_cfdi: clientFacts.uso_cfdi || null,
    rfc_shape: clientFacts.rfc_shape || null,
    normalized_rfc_length: Number(clientFacts.normalized_rfc_length || 0),
    rfc_has_hidden_characters: clientFacts.rfc_has_hidden_characters === true,
  } : null;
  receptorCompatibility.client_cfdi_receptor_mismatch = mismatches;
  const errors = [...receptorCompatibility.errors];
  if (mismatches.some((item) => item.affects_cfdi40161)) errors.push("CLIENT_CFDI_RECEPTOR_MISMATCH");
  receptorCompatibility.errors = Array.from(new Set(errors));
  receptorCompatibility.ok = receptorCompatibility.errors.length === 0;
  receptorCompatibility.compatibility_status = receptorCompatibility.ok ? "PASS" : "FAIL";
  return receptorCompatibility;
}

function applyLocalCfdiRuleError({ attempt, summary, manifest, config, env, fixture, payload }) {
  const officialRequest = payload.official_request || {};
  const errors = Array.isArray(officialRequest.local_config_errors) ? officialRequest.local_config_errors : [];
  const warnings = Array.isArray(officialRequest.local_config_warnings) ? officialRequest.local_config_warnings : [];
  const receptorCompatibility = officialRequest.receptor_compatibility || {};
  attempt.status = "CFDI_LOCAL_RULE_ERROR";
  attempt.local_config_errors = errors;
  attempt.local_config_warnings = warnings;
  attempt.receptor_compatibility = receptorCompatibility;
  attempt.warnings.push(...errors, ...warnings);
  updateLocalRuleSummary(summary, receptorCompatibility, errors);
  summary.errors += 1;
  summary.needs_local_config += 1;
  const diagnosticFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-local-cfdi-rule-error.json`, {
    draft_id: fixture.draft_id,
    status: attempt.status,
    local_config_errors: errors,
    local_config_warnings: warnings,
    receptor_compatibility: receptorCompatibility,
    pac_call_blocked: true,
  }, env);
  attempt.artifacts.push(path.relative(root, diagnosticFile).replace(/\\/g, "/"));
  manifest.artifacts.push({
    type: "CFDI_LOCAL_RULE_ERROR",
    draft_id: fixture.draft_id,
    path: path.relative(root, diagnosticFile).replace(/\\/g, "/"),
    ok: false,
  });
}

async function processDraft({
  fixture,
  client,
  config,
  env,
  uidMap,
  manifest,
  summary,
  requestFn = facturaComRequest,
  postCreateSearchFn = null,
  postCreateSearchDocumented = false,
  authPreflightResult = null,
}) {
  const attempt = {
    draft_id: fixture.draft_id,
    internal_invoice_id: `INTERNAL-${safeId(fixture.draft_id)}`,
    client_id: client?.client_id || fixture.client_id,
    client_uid: null,
    status: "STARTED",
    artifacts: [],
    uid: null,
    cfdi_uid: null,
    uuid: null,
    pac_invoice_id: null,
    serie: null,
    folio: null,
    lookup_status: null,
    cancel_status: null,
    cancel_response_identity: null,
    xml_uuid: null,
    identity: null,
    identity_completeness: null,
    identity_sources: [],
    identity_attempted: false,
    cfdi_identity_source: null,
    header_identity_candidates: [],
    post_create_search_status: null,
    identity_ambiguous: false,
    warnings: [],
  };
  manifest.attempts.push(attempt);
  summary.total_attempts += 1;
  const draftConfig = configForClient(config, client);

  if (client?.fiscal_profile_id && client?.fiscal_profile_validation?.ok !== true) {
    applyInvalidSandboxFiscalProfile({ attempt, summary, manifest, config: draftConfig, env, fixture, client });
    return attempt;
  }

  const scenario = buildCanonicalScenario(fixture, client);
  if (!scenario.ok) {
    attempt.status = "CANONICAL_INVALID";
    attempt.warnings.push(...scenario.errors);
    summary.errors += 1;
    return attempt;
  }

  if (authPreflightResult && authPreflightResult.ok === false) {
    applyProviderAuthFailure(attempt, summary, authPreflightResult);
    return attempt;
  }

  const clientUidResult = await maybeCreateClient({ client, config: draftConfig, env, uidMap, manifest, summary, requestFn });
  attempt.client_rfc_validation = clientUidResult.client_rfc_validation || null;
  attempt.client_response_facts = clientUidResult.client_response_facts || null;
  if (clientUidResult.local_status === "LOCAL_INVALID_RFC_SHAPE") {
    attempt.status = "LOCAL_INVALID_RFC_SHAPE";
    attempt.local_config_errors = clientUidResult.local_config_errors || ["LOCAL_INVALID_RFC_SHAPE"];
    attempt.local_config_warnings = clientUidResult.local_config_warnings || [];
    attempt.warnings.push(...attempt.local_config_errors, ...attempt.local_config_warnings);
    summary.errors += 1;
    summary.needs_local_config += 1;
    const diagnosticFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-local-invalid-rfc-shape.json`, {
      draft_id: fixture.draft_id,
      status: attempt.status,
      local_config_errors: attempt.local_config_errors,
      local_config_warnings: attempt.local_config_warnings,
      client_rfc_validation: attempt.client_rfc_validation,
      client_create_blocked: true,
      pac_call_blocked: true,
    }, env);
    attempt.artifacts.push(path.relative(root, diagnosticFile).replace(/\\/g, "/"));
    manifest.artifacts.push({
      type: "LOCAL_INVALID_RFC_SHAPE",
      draft_id: fixture.draft_id,
      path: path.relative(root, diagnosticFile).replace(/\\/g, "/"),
      ok: false,
    });
    return attempt;
  }
  if (config.createClients && !clientUidResult.uid) {
    attempt.status = clientUidResult.reason === "ambiguous_client_uid" || clientUidResult.lookup_reason === "ambiguous_client_uid"
      ? "CLIENT_UID_AMBIGUOUS"
      : (clientUidResult.client_create_status ? "CLIENT_CREATE_FAILED" : "CLIENT_UID_MISSING");
    attempt.client_create_status = clientUidResult.client_create_status || null;
    attempt.client_create_error = clientUidResult.client_create_error || null;
    attempt.client_lookup_reason = clientUidResult.lookup_reason || clientUidResult.reason || null;
    attempt.warnings.push(clientUidResult.reason);
    if (clientUidResult.client_create_status) attempt.warnings.push(clientUidResult.client_create_status);
    return attempt;
  }
  const clientUid = clientUidResult.uid;
  attempt.client_uid = clientUid || null;
  const payload = mapScenarioToFacturaCom(scenario, clientUid, draftConfig);
  if (payload.official_request.local_config_errors?.length > 0) {
    applyLocalCfdiRuleError({ attempt, summary, manifest, config: draftConfig, env, fixture, payload });
    return attempt;
  }
  if (payload.official_request.unresolved_fields.length > 0) {
    attempt.status = "NEEDS_LOCAL_CONFIG";
    attempt.warnings.push(...payload.official_request.unresolved_fields);
    summary.needs_local_config += 1;
    return attempt;
  }

  const body = payload.official_request.body;
  const finalReceptorCompatibility = validateFinalCfdiReceptorPayload({ body, client, clientUidResult });
  payload.official_request.receptor_compatibility = finalReceptorCompatibility;
  payload.official_request.local_config_errors = Array.from(new Set([
    ...(payload.official_request.local_config_errors || []),
    ...finalReceptorCompatibility.errors,
  ]));
  payload.official_request.local_config_warnings = Array.from(new Set([
    ...(payload.official_request.local_config_warnings || []),
    ...finalReceptorCompatibility.warnings,
  ]));
  attempt.receptor_compatibility = finalReceptorCompatibility;
  if (finalReceptorCompatibility.errors.length > 0) {
    applyLocalCfdiRuleError({ attempt, summary, manifest, config: draftConfig, env, fixture, payload });
    return attempt;
  }
  recordReceptorCompatibilitySummary(summary, finalReceptorCompatibility);
  const requestFile = writeJson(draftConfig.runtimeDir, `${safeId(fixture.draft_id)}-create-cfdi-request.json`, {
    method: "POST",
    path: "/v4/cfdi40/create",
    body,
    receptor_compatibility: finalReceptorCompatibility,
  }, env);
  attempt.artifacts.push(path.relative(root, requestFile).replace(/\\/g, "/"));
  manifest.artifacts.push({ type: "CFDI_CREATE_REQUEST", draft_id: fixture.draft_id, path: path.relative(root, requestFile).replace(/\\/g, "/") });

  const createResponse = normalizeFacturaComHttpResponse(
    await requestFn({ method: "POST", path: "/v4/cfdi40/create", body, env }),
    env,
  );
  const responseFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-create-cfdi-response.json`, createResponse, env);
  attempt.artifacts.push(path.relative(root, responseFile).replace(/\\/g, "/"));
  manifest.artifacts.push({ type: "CFDI_CREATE_RESPONSE", draft_id: fixture.draft_id, path: path.relative(root, responseFile).replace(/\\/g, "/"), ok: createResponse.ok });

  attempt.http_ok = createResponse.http_ok === true;
  attempt.api_ok = createResponse.api_ok === undefined ? null : createResponse.api_ok;
  attempt.api_status = createResponse.api_status || null;
  attempt.api_status_unknown = createResponse.api_status_unknown === true;
  attempt.api_message_summary = createResponse.api_message_summary || null;
  if (attempt.api_status_unknown) summary.api_status_unknown += 1;

  if (createResponse.ok === false) {
    attempt.status = createResponse.http_ok === true ? "CREATE_API_ERROR" : "CREATE_HTTP_ERROR";
    attempt.api_error = createApiErrorSummary(createResponse);
    if (attempt.status === "CREATE_API_ERROR") {
      summary.api_errors += 1;
      summary.create_api_errors += 1;
    } else {
      summary.http_errors += 1;
      summary.create_http_errors += 1;
    }
    if (attempt.api_message_summary) summary.api_error_messages_detected.push(attempt.api_message_summary);
    summary.errors += 1;
    return attempt;
  }

  attempt.identity_attempted = true;
  const createIdentity = extractCfdiIdentityFromCreateResponse(createResponse);
  mergeAttemptIdentity(attempt, createIdentity, "create_response");
  const headerIdentity = extractCfdiIdentityFromHeaders(createResponse);
  mergeAttemptIdentity(attempt, headerIdentity, "response_header");
  let hasClearIdentity = hasClearInvoiceIdentity(attempt);
  if (!hasClearIdentity) {
    const search = await maybeRunPostCreateSearch({
      attempt,
      body,
      createResponse,
      config,
      postCreateSearchFn,
      postCreateSearchDocumented,
    });
    if (search.ok) {
      mergeAttemptIdentity(attempt, search.identity, "post_create_search");
      hasClearIdentity = hasClearInvoiceIdentity(attempt);
    }
  }
  if (!hasClearIdentity) {
    if (!attempt.identity_ambiguous) attempt.status = "CREATE_OK_IDENTITY_MISSING";
    attempt.warnings.push("CFDI_UID_MISSING");
    summary.warnings.push(`cfdi_uid_missing:${fixture.draft_id}`);
    summary.identity_missing_after_api_success += 1;
    finalizeAttemptIdentity(attempt, summary);
    return attempt;
  } else {
    attempt.status = "CREATE_OK";
    summary.successful += 1;
    summary.business_successful += 1;
  }

  if (attempt.cfdi_uid) {
    const lookupResponse = await requestFn({ method: "GET", path: `/v4/cfdi/uid/${encodeURIComponent(attempt.cfdi_uid)}`, env });
    const lookupFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-lookup-response.json`, lookupResponse, env);
    attempt.artifacts.push(path.relative(root, lookupFile).replace(/\\/g, "/"));
    manifest.artifacts.push({ type: "CFDI_LOOKUP_RESPONSE", draft_id: fixture.draft_id, path: path.relative(root, lookupFile).replace(/\\/g, "/"), ok: lookupResponse.ok });
    attempt.lookup_status = lookupResponse.ok ? "OK" : "ERROR";
    if (lookupResponse.ok) {
      const lookupIdentity = extractCfdiIdentityFromLookupResponse(lookupResponse);
      if (mergeAttemptIdentity(attempt, lookupIdentity, "lookup_response")) summary.lookup_identity_found += 1;
    }
  }

  const cfdiReference = attempt.cfdi_uid || attempt.uuid;
  if (config.downloadTest && cfdiReference) {
    for (const format of ["xml", "pdf"]) {
      const downloadResponse = await requestFn({ method: "GET", path: `/v4/cfdi40/${encodeURIComponent(cfdiReference)}/${format}`, env });
      const fileName = `${safeId(fixture.draft_id)}-download.${format}`;
      const artifact = writeText(config.runtimeDir, fileName, downloadResponse.rawText || JSON.stringify(downloadResponse.data));
      attempt.artifacts.push(path.relative(root, artifact).replace(/\\/g, "/"));
      manifest.artifacts.push({ type: `CFDI_${format.toUpperCase()}`, draft_id: fixture.draft_id, path: path.relative(root, artifact).replace(/\\/g, "/"), ok: downloadResponse.ok });
      if (format === "xml" && downloadResponse.ok) {
        summary.xml_downloaded += 1;
        const xmlIdentity = extractCfdiIdentityFromXmlText(downloadResponse.rawText || JSON.stringify(downloadResponse.data));
        const xmlUuid = xmlIdentity.uuid;
        if (xmlUuid) {
          attempt.xml_uuid = xmlUuid;
          if (!attempt.uuid) mergeAttemptIdentity(attempt, xmlIdentity, "xml");
          summary.xml_uuid_found += 1;
        }
      }
      if (format === "pdf" && downloadResponse.ok) summary.pdf_downloaded += 1;
    }
  }

  if (config.cancelTest && cfdiReference) {
    const cancelResponse = await requestFn({
      method: "POST",
      path: `/v4/cfdi40/${encodeURIComponent(cfdiReference)}/cancel`,
      body: { motivo: "02" },
      env,
    });
    const cancelFile = writeJson(config.runtimeDir, `${safeId(fixture.draft_id)}-cancel-response.json`, cancelResponse, env);
    attempt.artifacts.push(path.relative(root, cancelFile).replace(/\\/g, "/"));
    manifest.artifacts.push({ type: "CFDI_CANCEL_RESPONSE", draft_id: fixture.draft_id, path: path.relative(root, cancelFile).replace(/\\/g, "/"), ok: cancelResponse.ok });
    attempt.cancel_status = cancelResponse.ok ? "OK" : "ERROR";
    attempt.cancel_response_identity = extractCfdiIdentityFromLookupResponse(cancelResponse);
    mergeAttemptIdentity(attempt, attempt.cancel_response_identity, "cancel");
    if (cancelResponse.ok) summary.cancel_ok += 1;
    else summary.cancel_error += 1;
  }

  finalizeAttemptIdentity(attempt, summary);
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
      skip_auth_preflight: config.skipAuthPreflight,
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
    cfdi_uids_found: 0,
    uuids_found: 0,
    pac_invoice_ids_found: 0,
    identities_complete: 0,
    identities_partial: 0,
    identity_missing: 0,
    possible_client_uid_used_as_cfdi_uid: 0,
    header_identity_candidates: 0,
    identity_ambiguous: 0,
    xml_uuid_found: 0,
    lookup_identity_found: 0,
    api_errors: 0,
    http_errors: 0,
    api_status_unknown: 0,
    create_api_errors: 0,
    create_http_errors: 0,
    provider_auth_errors: 0,
    provider_auth_status: null,
    provider_auth_message: null,
    auth_preflight_ok: null,
    active_sandbox_fiscal_profile_id: config.fiscalProfileId || null,
    sandbox_fiscal_profile_errors: 0,
    receptor_compatibility_errors: 0,
    local_cfdi_rule_errors: 0,
    invalid_rfc_shape_detected: 0,
    uso_cfdi_regimen_persona_mismatch: 0,
    effective_uso_cfdi_values: [],
    effective_regimen_fiscal_receptor_values: [],
    effective_person_type_values: [],
    rfc_shape_values: [],
    normalized_rfc_lengths: [],
    rfc_hidden_characters_detected: 0,
    client_cfdi_receptor_mismatch: 0,
    client_create_errors: 0,
    client_lookup_errors: 0,
    client_create_error_messages: [],
    client_lookup_error_messages: [],
    client_already_exists_detected: 0,
    client_validation_error_detected: 0,
    api_error_messages_detected: [],
    business_successful: 0,
    identity_missing_after_api_success: 0,
    cfdi_uids: [],
    pac_invoice_ids: [],
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
  const postCreateSearchFn = options.postCreateSearchFn || null;
  const postCreateSearchDocumented = Boolean(options.postCreateSearchDocumented);

  const runtimeDir = ensureRuntimeDir(config.runtimeDir);
  const manifest = buildManifest({ ...config, runtimeDir });
  const summary = buildSummary(config);
  let authPreflightResult = null;

  try {
    if (config.skipAuthPreflight) {
      summary.auth_preflight_ok = null;
      summary.provider_auth_status = "AUTH_PREFLIGHT_SKIPPED";
    } else {
      authPreflightResult = await runFacturaComAuthPreflight(env, { requestFn });
      summary.auth_preflight_ok = authPreflightResult.ok === true;
      summary.provider_auth_status = authPreflightResult.status || null;
      summary.provider_auth_message = authPreflightResult.message || null;
      if (authPreflightResult.artifact_path) {
        manifest.artifacts.push({
          type: "PREFLIGHT_AUTH_RESPONSE",
          path: path.relative(root, authPreflightResult.artifact_path).replace(/\\/g, "/"),
          ok: authPreflightResult.ok === true,
          auth_status: authPreflightResult.status || null,
        });
      }
    }
    const { drafts, clientById, activeFiscalProfileId } = loadFixtures({ activeFiscalProfileId: config.fiscalProfileId });
    summary.active_sandbox_fiscal_profile_id = activeFiscalProfileId || null;
    manifest.active_sandbox_fiscal_profile_id = activeFiscalProfileId || null;
    const uidMap = loadLocalClientUidMap(runtimeDir, env);
    const batch = drafts.slice(0, config.batchSize);
    for (const fixture of batch) {
      const client = clientById.get(fixture.client_ref || fixture.client_id);
      await processDraft({
        fixture,
        client,
        config: { ...config, runtimeDir },
        env,
        uidMap,
        manifest,
        summary,
        requestFn,
        postCreateSearchFn,
        postCreateSearchDocumented,
        authPreflightResult,
      });
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
  extractCfdiIdentity,
  extractCfdiIdentityFromCreateResponse,
  extractCfdiIdentityFromHeaders,
  extractCfdiIdentityFromLookupResponse,
  extractCfdiIdentityFromXmlText,
  extractClientUid,
  extractCfdiUid,
  extractFolio,
  extractSerie,
  extractUid,
  extractUuid,
  findClientUidInResponse,
  runSmoke,
};
