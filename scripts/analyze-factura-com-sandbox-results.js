const fs = require("fs");
const path = require("path");
const { collectShapeLines } = require("./inspect-facturacom-sandbox-response-shape");
const { safeApiMessagePreview } = require("./lib/factura-com-live-client");

const root = path.resolve(__dirname, "..");
const DEFAULT_RUNTIME_DIR = path.join(root, "runtime", "facturacom-sandbox");
const ALLOWED_DEMO_RFCS = new Set([
  "XAXX010101000",
  "XEXX010101000",
  "AAA010101AAA",
  "BBB010101BBB",
  "XAMA620210DQ5",
]);

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function countAttempts(summary = {}, manifest = {}) {
  const attempts = Array.isArray(manifest.attempts) ? manifest.attempts : [];
  return Number(summary.total_attempts ?? attempts.length ?? 0);
}

function unique(values = []) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function attemptIdentityCompleteness(attempt = {}) {
  const hasUid = Boolean(text(attempt.cfdi_uid));
  const hasUuid = Boolean(text(attempt.uuid));
  if (hasUid && hasUuid) return "complete";
  if (hasUid || hasUuid || attempt.pac_invoice_id || attempt.serie || attempt.folio) return "partial";
  return "missing";
}

function readJsonIfPossible(filePath) {
  try {
    return readJson(filePath);
  } catch (_error) {
    return null;
  }
}

function getNested(object = {}, pathParts = []) {
  let current = object;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return null;
    current = current[part];
  }
  return text(current);
}

function increment(object, key) {
  const safeKey = key || "UNKNOWN";
  object[safeKey] = (object[safeKey] || 0) + 1;
}

function duplicatesByDraft(attempts = [], identityFn = () => null) {
  const byId = new Map();
  for (const attempt of attempts) {
    const identity = text(identityFn(attempt));
    if (!identity) continue;
    if (!byId.has(identity)) byId.set(identity, new Set());
    byId.get(identity).add(text(attempt.draft_id) || "UNKNOWN");
  }
  return Object.fromEntries(Array.from(byId.entries())
    .filter(([, drafts]) => drafts.size > 1)
    .map(([identity, drafts]) => [identity, Array.from(drafts)]));
}

function collectHeaderIdentityCandidatesFromResponse(response = {}) {
  const headers = response.responseHeaders || {};
  const location = text(response.location || headers.location || headers.Location);
  if (!location) return [];
  return [{
    header: "location",
    length: location.length,
    source: "response_header",
    uid_like: /[A-Za-z0-9_-]{8,90}/.test(location),
    uuid_like: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(location),
  }];
}

function responseMessagePreview(response = {}) {
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
    {},
    240,
  );
}

function responseLooksLikeError(response = {}) {
  if (response.ok === false || response.api_ok === false) return true;
  const statusText = String(response.api_status || response.data?.response || response.data?.status || response.data?.estatus || "");
  return /\berror\b/i.test(statusText);
}

function responseLooksLikeSuccess(response = {}) {
  if (response.api_ok === true || response.ok === true) return true;
  const statusText = String(response.api_status || response.data?.response || response.data?.status || response.data?.estatus || "");
  return /\bsuccess\b/i.test(statusText);
}

function attemptLooksLikeApiError(attempt = {}) {
  if (attempt.api_ok === false) return true;
  if (attempt.ok === false) return true;
  if (attempt.api_error && typeof attempt.api_error === "object") return true;
  if (/\b(ERROR|FAILED)\b/i.test(String(attempt.status || ""))) return true;
  const statusText = String(attempt.api_status || attempt.response || attempt.status_text || "");
  return /\berror\b/i.test(statusText);
}

function attemptLooksLikeApiSuccess(attempt = {}) {
  if (attempt.api_ok === true) return true;
  if (attempt.ok === true) return true;
  if (String(attempt.status || "") === "CREATE_OK") return true;
  const statusText = String(attempt.api_status || attempt.response || attempt.status_text || "");
  return /\bsuccess\b/i.test(statusText);
}

function messageLooksLikeClientAlreadyExists(message) {
  const normalized = String(message || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (/\b(no existe|cuenta no existe|no existe la cuenta|not exist|does not exist|account does not exist)\b/.test(normalized)) {
    return false;
  }
  return /\b(cliente ya existe|rfc ya registrad[oa]|ya se encuentra registrad[oa]|ya esta registrad[oa]|duplicate client|client already exists|already exists)\b/.test(normalized);
}

function messageLooksLikeClientValidation(message) {
  return /\b(validaci[oó]n|validacion|invalid[oa]|requerid[oa]|obligatori[oa]|campo|formato|c[oó]digo postal|regimen|rfc)\b/i.test(String(message || ""));
}

function messageLooksLikeEmitterCsdRfcMismatch(message) {
  const normalized = String(message || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /rfc del csd|csd del emisor|no corresponde al rfc que viene como emisor/.test(normalized);
}

function findSensitiveText(filePath, content) {
  const findings = [];
  const patterns = [
    { name: "api_key_like", pattern: /(?:FACTURACOM_API_KEY|F-Api-Key|api[_-]?key)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{12,}/i },
    { name: "secret_key_like", pattern: /(?:FACTURACOM_SECRET_KEY|F-Secret-Key|secret[_-]?key)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{12,}/i },
    { name: "plugin_like", pattern: /(?:FACTURACOM_PLUGIN|F-PLUGIN)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{12,}/i },
    { name: "production_url", pattern: /https:\/\/api\.factura\.com/i },
    { name: "production_enabled_true", pattern: /"production(?:_enabled)?"\s*:\s*true/i },
  ];
  for (const { name, pattern } of patterns) {
    if (pattern.test(content)) findings.push(`${rel(filePath)}:${name}`);
  }

  const rfcs = content.match(/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi) || [];
  for (const rfc of rfcs) {
    if (!ALLOWED_DEMO_RFCS.has(rfc.toUpperCase())) findings.push(`${rel(filePath)}:rfc_not_allowed:${rfc}`);
  }
  return findings;
}

function scanRuntime(runtimeDir) {
  const resolved = path.resolve(runtimeDir || DEFAULT_RUNTIME_DIR);
  const allowedRoot = path.join(root, "runtime");
  if (!isInside(allowedRoot, resolved)) {
    throw new Error(`runtime fuera de runtime/: ${resolved}`);
  }
  const files = listFiles(resolved);
  const findings = [];
  for (const file of files) {
    if (!isInside(resolved, file)) findings.push(`${rel(file)}:outside_runtime_dir`);
    let content = "";
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (_error) {
      content = "";
    }
    findings.push(...findSensitiveText(file, content));
  }
  return { files, findings };
}

function analyze(runtimeArg = process.argv[2]) {
  const runtimeDir = path.resolve(runtimeArg || DEFAULT_RUNTIME_DIR);
  const manifestPath = path.join(runtimeDir, "manifest.json");
  const summaryPath = path.join(runtimeDir, "summary.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`No existe manifest: ${manifestPath}`);
  if (!fs.existsSync(summaryPath)) throw new Error(`No existe summary: ${summaryPath}`);

  const manifest = readJson(manifestPath);
  const summary = readJson(summaryPath);
  const scan = scanRuntime(runtimeDir);
  const clientUidMapPath = path.join(runtimeDir, "client-uids.local.json");
  const attempts = Array.isArray(manifest.attempts) ? manifest.attempts : [];
  const uidMap = fs.existsSync(clientUidMapPath) ? readJsonIfPossible(clientUidMapPath) || {} : {};
  const clientUids = unique([
    ...attempts.map((attempt) => attempt.client_uid),
    ...Object.values(uidMap),
  ]);
  const attemptCfdiUids = unique(attempts.map((attempt) => attempt.cfdi_uid));
  const attemptUuids = unique(attempts.map((attempt) => attempt.uuid));
  const attemptPacInvoiceIds = unique(attempts.map((attempt) => attempt.pac_invoice_id));
  const attemptXmlUuids = unique(attempts.map((attempt) => attempt.xml_uuid));
  const attemptCompleteness = attempts.map(attemptIdentityCompleteness);
  const artifactPaths = (manifest.artifacts || []).map((artifact) => text(artifact.path)).filter(Boolean);
  const outsideArtifacts = artifactPaths.filter((artifactPath) => {
    const abs = path.resolve(root, artifactPath);
    return !isInside(runtimeDir, abs);
  });
  const createRequestReceptorUidsByDraft = {};
  const createResponseShapesDetected = [];
  const clientCreateResponseShapesDetected = [];
  const clientLookupResponseShapesDetected = [];
  const apiSuccessArtifactMessages = [];
  const apiErrorArtifactMessages = [];
  const clientCreateSuccessArtifactMessages = [];
  const clientCreateErrorArtifactMessages = [];
  const clientLookupSuccessArtifactMessages = [];
  const clientLookupErrorArtifactMessages = [];
  const authPreflightResponseShape = [];
  const localCfdiRuleResponseShape = [];
  let authPreflightArtifactOk = null;
  let authPreflightArtifactMessage = null;
  let authPreflightArtifactStatus = null;
  const receptorCompatibilityRecords = [];
  const cfdiCreateRequestDrafts = new Set();
  const guardedCfdiRequestDrafts = new Set();
  let clientCreateArtifactErrors = 0;
  let clientLookupArtifactErrors = 0;
  const headerIdentityCandidates = [];
  const forbiddenClientUidCandidatesDetected = [];
  for (const artifact of manifest.artifacts || []) {
    if (!artifact || !artifact.path) continue;
    const abs = path.resolve(root, artifact.path);
    if (!isInside(runtimeDir, abs)) continue;
    if (artifact.type === "CFDI_CREATE_REQUEST") {
      const requestJson = readJsonIfPossible(abs);
      const draftId = artifact.draft_id || "UNKNOWN";
      cfdiCreateRequestDrafts.add(draftId);
      const receptorUid = getNested(requestJson, ["body", "Receptor", "UID"]);
      if (receptorUid) createRequestReceptorUidsByDraft[draftId] = receptorUid;
      if (requestJson?.receptor_compatibility) {
        receptorCompatibilityRecords.push(requestJson.receptor_compatibility);
        guardedCfdiRequestDrafts.add(draftId);
      }
    }
    if (artifact.type === "CFDI_CREATE_RESPONSE" || artifact.type === "CFDI_LOOKUP_RESPONSE") {
      const responseJson = readJsonIfPossible(abs);
      if (responseJson) {
        const shapeLines = collectShapeLines(responseJson).slice(0, 120);
        const message = responseMessagePreview(responseJson);
        if (message) {
          if (responseLooksLikeError(responseJson) || artifact.ok === false) {
            apiErrorArtifactMessages.push(message);
          } else if (responseLooksLikeSuccess(responseJson) || artifact.ok === true) {
            apiSuccessArtifactMessages.push(message);
          }
        }
        if (artifact.type === "CFDI_CREATE_RESPONSE") {
          createResponseShapesDetected.push({
            draft_id: artifact.draft_id || null,
            path_count: shapeLines.length,
            paths: shapeLines,
          });
        }
        headerIdentityCandidates.push(...collectHeaderIdentityCandidatesFromResponse(responseJson).map((candidate) => ({
          ...candidate,
          draft_id: artifact.draft_id || null,
          artifact_type: artifact.type,
        })));
        for (const line of shapeLines) {
          if (line.includes("FORBIDDEN_CLIENT_UID_SOURCE")) {
            forbiddenClientUidCandidatesDetected.push({
              draft_id: artifact.draft_id || null,
              artifact_type: artifact.type,
              path: line.replace(/: .*/, ""),
            });
          }
        }
      }
    }
    if (artifact.type === "CLIENT_CREATE_RESPONSE" || artifact.type === "CLIENT_LOOKUP_RESPONSE") {
      const responseJson = readJsonIfPossible(abs);
      if (responseJson) {
        const shapeLines = collectShapeLines(responseJson).slice(0, 120);
        const message = responseMessagePreview(responseJson);
        const shapeRecord = {
          client_id: artifact.client_id || null,
          path_count: shapeLines.length,
          paths: shapeLines,
        };
        if (artifact.type === "CLIENT_CREATE_RESPONSE") {
          clientCreateResponseShapesDetected.push(shapeRecord);
          if (message) {
            if (responseLooksLikeError(responseJson) || artifact.ok === false) clientCreateErrorArtifactMessages.push(message);
            else if (responseLooksLikeSuccess(responseJson) || artifact.ok === true) clientCreateSuccessArtifactMessages.push(message);
          }
          if (responseLooksLikeError(responseJson)) clientCreateArtifactErrors += 1;
        } else {
          clientLookupResponseShapesDetected.push(shapeRecord);
          if (message) {
            if (responseLooksLikeError(responseJson) || artifact.ok === false) clientLookupErrorArtifactMessages.push(message);
            else if (responseLooksLikeSuccess(responseJson) || artifact.ok === true) clientLookupSuccessArtifactMessages.push(message);
          }
          if (responseLooksLikeError(responseJson)) clientLookupArtifactErrors += 1;
        }
      }
    }
    if (artifact.type === "PREFLIGHT_AUTH_RESPONSE") {
      const responseJson = readJsonIfPossible(abs);
      if (responseJson) {
        const shapeLines = collectShapeLines(responseJson).slice(0, 120);
        authPreflightResponseShape.push({
          path_count: shapeLines.length,
          paths: shapeLines,
        });
        authPreflightArtifactOk = artifact.ok === true || responseJson.auth_ok === true;
        authPreflightArtifactStatus = text(artifact.auth_status || responseJson.auth_status || responseJson.response?.auth_status);
        authPreflightArtifactMessage = responseMessagePreview(responseJson.response || responseJson);
      }
    }
    if (artifact.type === "CFDI_LOCAL_RULE_ERROR") {
      const responseJson = readJsonIfPossible(abs);
      if (responseJson) {
        const shapeLines = collectShapeLines(responseJson).slice(0, 120);
        localCfdiRuleResponseShape.push({
          draft_id: artifact.draft_id || null,
          path_count: shapeLines.length,
          paths: shapeLines,
        });
        if (responseJson.receptor_compatibility) receptorCompatibilityRecords.push(responseJson.receptor_compatibility);
      }
    }
  }
  const possibleClientUidUsedAsCfdiUid = attempts
    .filter((attempt) => {
      const cfdiUid = text(attempt.cfdi_uid);
      if (!cfdiUid) return false;
      return cfdiUid === text(attempt.client_uid)
        || clientUids.includes(cfdiUid)
        || createRequestReceptorUidsByDraft[attempt.draft_id || "UNKNOWN"] === cfdiUid;
    })
    .map((attempt) => ({
      draft_id: attempt.draft_id || null,
      cfdi_uid: attempt.cfdi_uid || null,
      client_uid: attempt.client_uid || null,
      create_request_receptor_uid: createRequestReceptorUidsByDraft[attempt.draft_id || "UNKNOWN"] || null,
    }));
  const duplicateInvoiceIds = duplicatesByDraft(attempts, (attempt) => (
    attempt.cfdi_uid || attempt.uuid || attempt.pac_invoice_id || attempt.internal_invoice_id
  ));
  const documentsByDraftId = {};
  const documentsByInvoiceId = {};
  const cfdiIdentitySource = {};
  const createApiErrors = attempts.filter((attempt) => attempt.status === "CREATE_API_ERROR");
  const createHttpErrors = attempts.filter((attempt) => attempt.status === "CREATE_HTTP_ERROR");
  const summaryApiErrorsCount = Number(summary.api_errors || 0) + Number(summary.create_api_errors || 0);
  const summaryBusinessSuccessCount = Number(summary.business_successful || summary.successful || 0);
  const summaryApiErrorMessages = Array.isArray(summary.api_error_messages_detected)
    ? summary.api_error_messages_detected
    : [];
  const summaryApiMessagesAreSuccess = summaryApiErrorsCount === 0 && summaryBusinessSuccessCount > 0;
  const apiErrorMessagesDetected = unique([
    ...(summaryApiMessagesAreSuccess ? [] : summaryApiErrorMessages),
    ...apiErrorArtifactMessages,
    ...attempts
      .filter(attemptLooksLikeApiError)
      .map((attempt) => attempt.api_message_summary || attempt.api_error?.api_message_summary),
  ].map((value) => safeApiMessagePreview(value)).filter(Boolean));
  const apiSuccessMessagesDetected = unique([
    ...(Array.isArray(summary.api_success_messages_detected) ? summary.api_success_messages_detected : []),
    ...(summaryApiMessagesAreSuccess ? summaryApiErrorMessages : []),
    ...apiSuccessArtifactMessages,
    ...attempts
      .filter((attempt) => attemptLooksLikeApiSuccess(attempt) && !attemptLooksLikeApiError(attempt))
      .map((attempt) => attempt.api_message_summary || attempt.api_success_message || attempt.message),
  ].map((value) => safeApiMessagePreview(value)).filter(Boolean));
  const createApiErrorMessagePreviews = unique(createApiErrors
    .map((attempt) => attempt.api_message_summary || attempt.api_error?.api_message_summary)
    .map((value) => safeApiMessagePreview(value))
    .filter(Boolean));
  const emitterCsdRfcMismatchDetected = Number(summary.emitter_csd_rfc_mismatch_detected || 0)
    + attempts.filter((attempt) => attempt.emitter_csd_rfc_mismatch_detected === true
      || attempt.api_error?.emitter_csd_rfc_mismatch_detected === true
      || attempt.api_error_classification === "EMITTER_CSD_RFC_MISMATCH").length
    + createApiErrorMessagePreviews.filter(messageLooksLikeEmitterCsdRfcMismatch).length;
  const pacError303Detected = Number(summary.pac_error_303_detected || 0)
    + createApiErrorMessagePreviews.filter(messageLooksLikeEmitterCsdRfcMismatch).length;
  const apiStatusUnknownAttempts = attempts.filter((attempt) => attempt.api_status_unknown === true);
  const businessSuccessfulAttempts = attempts.filter((attempt) => attempt.status === "CREATE_OK");
  const identityMissingAfterApiSuccessAttempts = attempts.filter((attempt) => attempt.status === "CREATE_OK_IDENTITY_MISSING");
  const clientCreateErrorsCount = Number(summary.client_create_errors ?? clientCreateArtifactErrors);
  const clientLookupErrorsCount = Number(summary.client_lookup_errors ?? clientLookupArtifactErrors);
  const clientCreateErrorMessages = unique([
    ...(clientCreateErrorsCount > 0 && Array.isArray(summary.client_create_error_messages) ? summary.client_create_error_messages : []),
    ...clientCreateErrorArtifactMessages,
    ...attempts
      .filter((attempt) => attempt.client_create_status === "CLIENT_CREATE_API_ERROR" || attempt.client_create_status === "CLIENT_CREATE_HTTP_ERROR" || attempt.client_create_error)
      .map((attempt) => attempt.client_create_error?.message || attempt.client_create_error?.api_error?.api_message_summary),
  ].map((value) => safeApiMessagePreview(value)).filter(Boolean));
  const clientCreateSuccessMessages = unique([
    ...(Array.isArray(summary.client_create_success_messages) ? summary.client_create_success_messages : []),
    ...clientCreateSuccessArtifactMessages,
  ].map((value) => safeApiMessagePreview(value)).filter(Boolean));
  const clientLookupErrorMessages = unique([
    ...(clientLookupErrorsCount > 0 && Array.isArray(summary.client_lookup_error_messages) ? summary.client_lookup_error_messages : []),
    ...clientLookupErrorArtifactMessages,
  ].map((value) => safeApiMessagePreview(value)).filter(Boolean));
  const clientLookupSuccessMessages = unique([
    ...(Array.isArray(summary.client_lookup_success_messages) ? summary.client_lookup_success_messages : []),
    ...clientLookupSuccessArtifactMessages,
  ].map((value) => safeApiMessagePreview(value)).filter(Boolean));
  const clientAlreadyExistsDetected = Number(summary.client_already_exists_detected || 0)
    + clientCreateErrorMessages.filter(messageLooksLikeClientAlreadyExists).length
    + clientLookupErrorMessages.filter(messageLooksLikeClientAlreadyExists).length;
  const clientValidationSummaryCount = (clientCreateErrorsCount > 0 || clientLookupErrorsCount > 0)
    ? Number(summary.client_validation_error_detected || 0)
    : 0;
  const clientValidationErrorDetected = clientValidationSummaryCount
    + (clientCreateErrorsCount > 0 ? clientCreateErrorMessages.filter(messageLooksLikeClientValidation).length : 0)
    + (clientLookupErrorsCount > 0 ? clientLookupErrorMessages.filter(messageLooksLikeClientValidation).length : 0);
  const providerAuthStatus = text(summary.provider_auth_status) || authPreflightArtifactStatus;
  const providerAuthMessage = safeApiMessagePreview(summary.provider_auth_message || authPreflightArtifactMessage);
  const authPreflightOk = typeof summary.auth_preflight_ok === "boolean"
    ? summary.auth_preflight_ok
    : authPreflightArtifactOk;
  for (const attempt of attempts) {
    if (attempt.receptor_compatibility) {
      receptorCompatibilityRecords.push(attempt.receptor_compatibility);
      if (attempt.draft_id) guardedCfdiRequestDrafts.add(attempt.draft_id);
    }
    increment(documentsByDraftId, attempt.draft_id);
    increment(documentsByInvoiceId, attempt.cfdi_uid || attempt.uuid || attempt.pac_invoice_id || attempt.internal_invoice_id);
    increment(cfdiIdentitySource, attempt.cfdi_identity_source || (attempt.identity_ambiguous ? "ambiguous" : "missing"));
    if (Array.isArray(attempt.header_identity_candidates)) {
      headerIdentityCandidates.push(...attempt.header_identity_candidates.map((candidate) => ({
        ...candidate,
        draft_id: attempt.draft_id || null,
      })));
    }
  }

  const errors = [...scan.findings];
  if (outsideArtifacts.length > 0) errors.push(`artifacts_outside_runtime:${outsideArtifacts.join(",")}`);
  const receptorGuardNotEvaluatedBug = Array.from(cfdiCreateRequestDrafts)
    .filter((draftId) => !guardedCfdiRequestDrafts.has(draftId))
    .map((draftId) => ({
      draft_id: draftId,
      code: "RECEPTOR_GUARD_NOT_EVALUATED_BUG",
    }));
  if (receptorGuardNotEvaluatedBug.length > 0) {
    errors.push(`RECEPTOR_GUARD_NOT_EVALUATED_BUG:${receptorGuardNotEvaluatedBug.map((item) => item.draft_id).join(",")}`);
  }
  const normalizedRfcLengths = unique([
    ...(summary.normalized_rfc_lengths || []),
    ...receptorCompatibilityRecords.map((item) => item.normalized_rfc_length ? String(item.normalized_rfc_length) : null),
  ]);
  const clientCfdiReceptorMismatches = receptorCompatibilityRecords
    .flatMap((item) => Array.isArray(item.client_cfdi_receptor_mismatch) ? item.client_cfdi_receptor_mismatch : [])
    .filter(Boolean);

  const result = {
    runtime_dir: rel(runtimeDir),
    total_attempts: countAttempts(summary, manifest),
    successful: Number(summary.successful || 0),
    errors: Number(summary.errors || 0),
    needs_local_config: Number(summary.needs_local_config || 0),
    xml_downloaded: Number(summary.xml_downloaded || 0),
    pdf_downloaded: Number(summary.pdf_downloaded || 0),
    cancel_ok: Number(summary.cancel_ok || 0),
    cancel_error: Number(summary.cancel_error || 0),
    clients_created: Number(summary.clients_created || 0),
    client_uids_found: Number(summary.client_uids_found || 0),
    client_uid_missing: Number(summary.client_uid_missing || 0),
    ambiguous_clients: Number(summary.ambiguous_clients || 0),
    client_uids: clientUids,
    client_uid_map_exists: fs.existsSync(clientUidMapPath),
    cfdi_uids_found: Number(summary.cfdi_uids_found ?? attemptCfdiUids.length),
    uuids_found: Number(summary.uuids_found ?? attemptUuids.length),
    pac_invoice_ids_found: Number(summary.pac_invoice_ids_found ?? attemptPacInvoiceIds.length),
    identities_complete: Number(summary.identities_complete ?? attemptCompleteness.filter((value) => value === "complete").length),
    identities_partial: Number(summary.identities_partial ?? attemptCompleteness.filter((value) => value === "partial").length),
    identity_missing: Number(summary.identity_missing ?? attemptCompleteness.filter((value) => value === "missing").length),
    xml_uuid_found: Number(summary.xml_uuid_found ?? attemptXmlUuids.length),
    lookup_identity_found: Number(summary.lookup_identity_found || 0),
    cfdi_uids: Array.isArray(summary.cfdi_uids) && summary.cfdi_uids.length ? summary.cfdi_uids : attemptCfdiUids,
    pac_invoice_ids: Array.isArray(summary.pac_invoice_ids) && summary.pac_invoice_ids.length ? summary.pac_invoice_ids : attemptPacInvoiceIds,
    sandbox_uuids: Array.isArray(summary.sandbox_uuids) && summary.sandbox_uuids.length ? summary.sandbox_uuids : attemptUuids,
    xml_uuids: attemptXmlUuids,
    create_response_shapes_detected: createResponseShapesDetected,
    client_create_response_shapes_detected: clientCreateResponseShapesDetected,
    client_lookup_response_shapes_detected: clientLookupResponseShapesDetected,
    header_identity_candidates: headerIdentityCandidates,
    forbidden_client_uid_candidates_detected: forbiddenClientUidCandidatesDetected,
    cfdi_identity_source: cfdiIdentitySource,
    identity_ambiguous: Number(summary.identity_ambiguous || attempts.filter((attempt) => attempt.identity_ambiguous).length),
    api_errors: Number(summary.api_errors ?? createApiErrors.length),
    http_errors: Number(summary.http_errors ?? createHttpErrors.length),
    api_status_unknown: Number(summary.api_status_unknown ?? apiStatusUnknownAttempts.length),
    create_api_errors: Number(summary.create_api_errors ?? createApiErrors.length),
    create_http_errors: Number(summary.create_http_errors ?? createHttpErrors.length),
    provider_auth_errors: Number(summary.provider_auth_errors || attempts.filter((attempt) => attempt.status === "PROVIDER_AUTH_FAILED").length),
    provider_auth_status: providerAuthStatus,
    provider_auth_message: providerAuthMessage,
    auth_preflight_response_shape: authPreflightResponseShape,
    auth_preflight_ok: authPreflightOk,
    active_sandbox_emitter_profile_id: text(summary.active_sandbox_emitter_profile_id || manifest.active_sandbox_emitter_profile_id),
    effective_emitter_regimen: text(summary.effective_emitter_regimen || manifest.effective_emitter_regimen),
    effective_lugar_expedicion: text(summary.effective_lugar_expedicion || manifest.effective_lugar_expedicion),
    emitter_rfc_shape: text(summary.emitter_rfc_shape || manifest.emitter_rfc_shape),
    emitter_profile_status: text(summary.emitter_profile_status || manifest.emitter_profile_status),
    sandbox_emitter_profile_errors: Number(summary.sandbox_emitter_profile_errors || attempts.filter((attempt) => attempt.status === "LOCAL_INVALID_SANDBOX_EMITTER_PROFILE").length),
    emitter_csd_rfc_mismatch_detected: emitterCsdRfcMismatchDetected,
    pac_error_303_detected: pacError303Detected,
    api_error_classifications_detected: unique([
      ...(Array.isArray(summary.api_error_classifications_detected) ? summary.api_error_classifications_detected : []),
      ...attempts.map((attempt) => attempt.api_error_classification || attempt.api_error?.classification),
      ...(emitterCsdRfcMismatchDetected > 0 ? ["EMITTER_CSD_RFC_MISMATCH"] : []),
    ]),
    active_sandbox_fiscal_profile_id: text(summary.active_sandbox_fiscal_profile_id || manifest.active_sandbox_fiscal_profile_id),
    sandbox_fiscal_profile_errors: Number(summary.sandbox_fiscal_profile_errors || attempts.filter((attempt) => attempt.status === "LOCAL_INVALID_SANDBOX_FISCAL_PROFILE").length),
    receptor_compatibility_errors: Number(summary.receptor_compatibility_errors || attempts.filter((attempt) => attempt.status === "CFDI_LOCAL_RULE_ERROR").length),
    local_cfdi_rule_errors: Number(summary.local_cfdi_rule_errors || attempts.filter((attempt) => attempt.status === "CFDI_LOCAL_RULE_ERROR").length),
    invalid_rfc_shape_detected: Number(summary.invalid_rfc_shape_detected || receptorCompatibilityRecords.filter((item) => (item.errors || []).includes("LOCAL_INVALID_RFC_SHAPE")).length),
    uso_cfdi_regimen_persona_mismatch: Number(summary.uso_cfdi_regimen_persona_mismatch || receptorCompatibilityRecords.filter((item) => (item.errors || []).includes("LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH")).length),
    effective_uso_cfdi: unique([...(summary.effective_uso_cfdi_values || []), ...receptorCompatibilityRecords.map((item) => item.effective_uso_cfdi)])[0] || null,
    effective_regimen_fiscal_receptor: unique([...(summary.effective_regimen_fiscal_receptor_values || []), ...receptorCompatibilityRecords.map((item) => item.effective_regimen_fiscal_receptor)])[0] || null,
    effective_person_type: unique([...(summary.effective_person_type_values || []), ...receptorCompatibilityRecords.map((item) => item.effective_person_type)])[0] || null,
    rfc_shape: unique([...(summary.rfc_shape_values || []), ...receptorCompatibilityRecords.map((item) => item.rfc_shape)])[0] || null,
    normalized_rfc_length: normalizedRfcLengths[0] || null,
    rfc_has_hidden_characters: Number(summary.rfc_hidden_characters_detected || 0) > 0
      || receptorCompatibilityRecords.some((item) => item.rfc_has_hidden_characters === true),
    client_cfdi_receptor_mismatch: Number(summary.client_cfdi_receptor_mismatch || 0) + clientCfdiReceptorMismatches.length,
    client_cfdi_receptor_mismatch_details: clientCfdiReceptorMismatches,
    receptor_guard_not_evaluated_bug: receptorGuardNotEvaluatedBug,
    receptor_compatibility_status: unique(receptorCompatibilityRecords.map((item) => item.compatibility_status))[0] || null,
    local_cfdi_rule_response_shape: localCfdiRuleResponseShape,
    client_create_errors: clientCreateErrorsCount,
    client_lookup_errors: clientLookupErrorsCount,
    client_create_error_messages: clientCreateErrorMessages,
    client_lookup_error_messages: clientLookupErrorMessages,
    client_create_success_messages: clientCreateSuccessMessages,
    client_lookup_success_messages: clientLookupSuccessMessages,
    client_already_exists_detected: clientAlreadyExistsDetected,
    client_validation_error_detected: clientValidationErrorDetected,
    api_error_messages_detected: apiErrorMessagesDetected,
    api_success_messages_detected: apiSuccessMessagesDetected,
    create_api_error_message_previews: createApiErrorMessagePreviews,
    business_successful: Number(summary.business_successful ?? businessSuccessfulAttempts.length),
    identity_missing_after_api_success: Number(summary.identity_missing_after_api_success ?? identityMissingAfterApiSuccessAttempts.length),
    possible_client_uid_used_as_cfdi_uid: possibleClientUidUsedAsCfdiUid,
    duplicate_invoice_ids: duplicateInvoiceIds,
    documents_by_draft_id: documentsByDraftId,
    documents_by_invoice_id: documentsByInvoiceId,
    warnings: Array.isArray(summary.warnings) ? summary.warnings : [],
    artifact_files: scan.files.map(rel),
    sensitive_findings: [
      ...errors,
      ...possibleClientUidUsedAsCfdiUid.map((item) => `possible_client_uid_used_as_cfdi_uid:${item.draft_id}`),
    ],
  };
  return result;
}

function printResult(result) {
  console.log("Factura.com sandbox smoke analysis");
  console.log(`Runtime: ${result.runtime_dir}`);
  console.log(`Total intentos: ${result.total_attempts}`);
  console.log(`Exitosos: ${result.successful}`);
  console.log(`Errores: ${result.errors}`);
  console.log(`Needs local config: ${result.needs_local_config}`);
  console.log(`XML descargados: ${result.xml_downloaded}`);
  console.log(`PDF descargados: ${result.pdf_downloaded}`);
  console.log(`Cancelaciones OK: ${result.cancel_ok}`);
  console.log(`Cancelaciones error: ${result.cancel_error}`);
  console.log(`Clientes creados: ${result.clients_created}`);
  console.log(`UIDs cliente encontrados: ${result.client_uids_found}`);
  console.log(`UIDs cliente faltantes: ${result.client_uid_missing}`);
  console.log(`Clientes ambiguos: ${result.ambiguous_clients}`);
  console.log(`client-uids.local.json existe: ${result.client_uid_map_exists ? "si" : "no"}`);
  console.log(`Client UIDs: ${result.client_uids.join(", ") || "none"}`);
  console.log(`CFDI UIDs encontrados: ${result.cfdi_uids_found}`);
  console.log(`UUIDs encontrados: ${result.uuids_found}`);
  console.log(`PAC invoice IDs encontrados: ${result.pac_invoice_ids_found}`);
  console.log(`Identidades completas: ${result.identities_complete}`);
  console.log(`Identidades parciales: ${result.identities_partial}`);
  console.log(`Identidades faltantes: ${result.identity_missing}`);
  console.log(`XML UUID encontrados: ${result.xml_uuid_found}`);
  console.log(`Lookup identity encontrados: ${result.lookup_identity_found}`);
  console.log(`Create response shapes detectados: ${result.create_response_shapes_detected.length}`);
  console.log(`Auth preflight response shapes detectados: ${result.auth_preflight_response_shape.length}`);
  console.log(`Client create response shapes detectados: ${result.client_create_response_shapes_detected.length}`);
  console.log(`Client lookup response shapes detectados: ${result.client_lookup_response_shapes_detected.length}`);
  console.log(`Header identity candidates: ${result.header_identity_candidates.length}`);
  console.log(`Forbidden client UID candidates: ${result.forbidden_client_uid_candidates_detected.length}`);
  console.log(`CFDI identity source: ${JSON.stringify(result.cfdi_identity_source)}`);
  console.log(`Identity ambiguous: ${result.identity_ambiguous}`);
  console.log(`API errors: ${result.api_errors}`);
  console.log(`HTTP errors: ${result.http_errors}`);
  console.log(`API status unknown: ${result.api_status_unknown}`);
  console.log(`Create API errors: ${result.create_api_errors}`);
  console.log(`Create HTTP errors: ${result.create_http_errors}`);
  console.log(`Provider auth errors: ${result.provider_auth_errors}`);
  console.log(`Provider auth status: ${result.provider_auth_status || "none"}`);
  console.log(`Provider auth message: ${result.provider_auth_message || "none"}`);
  console.log(`Auth preflight OK: ${result.auth_preflight_ok === true ? "true" : (result.auth_preflight_ok === false ? "false" : "unknown")}`);
  if (result.provider_auth_errors > 0) {
    console.log("Provider auth diagnosis: No es error de cliente ni CFDI; es autenticacion/ambiente/cuenta proveedor.");
  }
  console.log(`Active sandbox emitter profile: ${result.active_sandbox_emitter_profile_id || "none"}`);
  console.log(`Effective emitter RegimenFiscal: ${result.effective_emitter_regimen || "none"}`);
  console.log(`Effective LugarExpedicion: ${result.effective_lugar_expedicion || "none"}`);
  console.log(`Emitter RFC shape: ${result.emitter_rfc_shape || "none"}`);
  console.log(`Emitter profile status: ${result.emitter_profile_status || "none"}`);
  console.log(`Sandbox emitter profile errors: ${result.sandbox_emitter_profile_errors}`);
  console.log(`Emitter CSD/RFC mismatch detected: ${result.emitter_csd_rfc_mismatch_detected}`);
  console.log(`PAC error 303 detected: ${result.pac_error_303_detected}`);
  console.log(`API error classifications: ${result.api_error_classifications_detected.join(", ") || "none"}`);
  if (result.emitter_csd_rfc_mismatch_detected > 0 || result.pac_error_303_detected > 0) {
    console.log("Emitter diagnosis: Verifica que el CSD cargado, empresa Factura.com, RFC emisor y serie pertenezcan al mismo emisor sandbox.");
  }
  console.log(`Active sandbox fiscal profile: ${result.active_sandbox_fiscal_profile_id || "none"}`);
  console.log(`Sandbox fiscal profile errors: ${result.sandbox_fiscal_profile_errors}`);
  console.log(`Effective UsoCFDI: ${result.effective_uso_cfdi || "none"}`);
  console.log(`Effective RegimenFiscalR: ${result.effective_regimen_fiscal_receptor || "none"}`);
  console.log(`Effective person type: ${result.effective_person_type || "none"}`);
  console.log(`RFC shape: ${result.rfc_shape || "none"}`);
  console.log(`Normalized RFC length: ${result.normalized_rfc_length || "none"}`);
  console.log(`RFC hidden characters: ${result.rfc_has_hidden_characters ? "true" : "false"}`);
  console.log(`Receptor compatibility status: ${result.receptor_compatibility_status || "none"}`);
  console.log(`Client/CFDI receptor mismatch: ${result.client_cfdi_receptor_mismatch || 0}`);
  console.log(`Receptor guard not evaluated bug: ${result.receptor_guard_not_evaluated_bug.length ? JSON.stringify(result.receptor_guard_not_evaluated_bug) : "none"}`);
  console.log(`Local CFDI rule errors: ${result.local_cfdi_rule_errors}`);
  console.log(`Receptor compatibility errors: ${result.receptor_compatibility_errors}`);
  console.log(`Invalid RFC shape detected: ${result.invalid_rfc_shape_detected}`);
  console.log(`UsoCFDI compatibility status: ${result.uso_cfdi_regimen_persona_mismatch > 0 ? "mismatch" : "ok_or_not_evaluated"}`);
  console.log(`Client create errors: ${result.client_create_errors}`);
  console.log(`Client lookup errors: ${result.client_lookup_errors}`);
  console.log(`Client create error messages: ${result.client_create_error_messages.join(" | ") || "none"}`);
  console.log(`Client lookup error messages: ${result.client_lookup_error_messages.join(" | ") || "none"}`);
  console.log(`Client create success messages: ${result.client_create_success_messages.join(" | ") || "none"}`);
  console.log(`Client lookup success messages: ${result.client_lookup_success_messages.join(" | ") || "none"}`);
  console.log(`Client already exists detectado: ${result.client_already_exists_detected}`);
  console.log(`Client validation error detectado: ${result.client_validation_error_detected}`);
  console.log(`API error messages detectados: ${result.api_error_messages_detected.join(" | ") || "none"}`);
  console.log(`API success messages detectados: ${result.api_success_messages_detected.join(" | ") || "none"}`);
  console.log(`API error message previews: ${result.api_error_messages_detected.join(" | ") || "none"}`);
  console.log(`Create API error message previews: ${result.create_api_error_message_previews.join(" | ") || "none"}`);
  console.log(`Business successful: ${result.business_successful}`);
  console.log(`Identity missing after API success: ${result.identity_missing_after_api_success}`);
  console.log(`CFDI UIDs: ${result.cfdi_uids.join(", ") || "none"}`);
  console.log(`PAC invoice IDs: ${result.pac_invoice_ids.join(", ") || "none"}`);
  console.log(`UUIDs demo/sandbox: ${result.sandbox_uuids.join(", ") || "none"}`);
  console.log(`Posible client UID usado como CFDI UID: ${result.possible_client_uid_used_as_cfdi_uid.length ? JSON.stringify(result.possible_client_uid_used_as_cfdi_uid) : "none"}`);
  console.log(`Duplicate invoice ids: ${JSON.stringify(result.duplicate_invoice_ids)}`);
  console.log(`Documents by draft_id: ${JSON.stringify(result.documents_by_draft_id)}`);
  console.log(`Documents by invoice_id: ${JSON.stringify(result.documents_by_invoice_id)}`);
  console.log(`Warnings: ${result.warnings.join(" | ") || "none"}`);
  console.log(`Artifacts revisados: ${result.artifact_files.length}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = analyze(process.argv[2]);
    printResult(result);
    if (result.sensitive_findings.length > 0) process.exit(1);
  } catch (error) {
    console.error(`FACTURACOM_SANDBOX_ANALYSIS_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  analyze,
};
