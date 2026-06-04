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
  const headerIdentityCandidates = [];
  const forbiddenClientUidCandidatesDetected = [];
  for (const artifact of manifest.artifacts || []) {
    if (!artifact || !artifact.path) continue;
    const abs = path.resolve(root, artifact.path);
    if (!isInside(runtimeDir, abs)) continue;
    if (artifact.type === "CFDI_CREATE_REQUEST") {
      const requestJson = readJsonIfPossible(abs);
      const receptorUid = getNested(requestJson, ["body", "Receptor", "UID"]);
      if (receptorUid) createRequestReceptorUidsByDraft[artifact.draft_id || "UNKNOWN"] = receptorUid;
    }
    if (artifact.type === "CFDI_CREATE_RESPONSE" || artifact.type === "CFDI_LOOKUP_RESPONSE") {
      const responseJson = readJsonIfPossible(abs);
      if (responseJson) {
        const shapeLines = collectShapeLines(responseJson).slice(0, 120);
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
  const apiErrorMessagesDetected = unique([
    ...(Array.isArray(summary.api_error_messages_detected) ? summary.api_error_messages_detected : []),
    ...attempts.map((attempt) => attempt.api_message_summary || attempt.api_error?.api_message_summary),
  ].map((value) => safeApiMessagePreview(value)).filter(Boolean));
  const createApiErrorMessagePreviews = unique(createApiErrors
    .map((attempt) => attempt.api_message_summary || attempt.api_error?.api_message_summary)
    .map((value) => safeApiMessagePreview(value))
    .filter(Boolean));
  const apiStatusUnknownAttempts = attempts.filter((attempt) => attempt.api_status_unknown === true);
  const businessSuccessfulAttempts = attempts.filter((attempt) => attempt.status === "CREATE_OK");
  const identityMissingAfterApiSuccessAttempts = attempts.filter((attempt) => attempt.status === "CREATE_OK_IDENTITY_MISSING");
  for (const attempt of attempts) {
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
    header_identity_candidates: headerIdentityCandidates,
    forbidden_client_uid_candidates_detected: forbiddenClientUidCandidatesDetected,
    cfdi_identity_source: cfdiIdentitySource,
    identity_ambiguous: Number(summary.identity_ambiguous || attempts.filter((attempt) => attempt.identity_ambiguous).length),
    api_errors: Number(summary.api_errors ?? createApiErrors.length),
    http_errors: Number(summary.http_errors ?? createHttpErrors.length),
    api_status_unknown: Number(summary.api_status_unknown ?? apiStatusUnknownAttempts.length),
    create_api_errors: Number(summary.create_api_errors ?? createApiErrors.length),
    create_http_errors: Number(summary.create_http_errors ?? createHttpErrors.length),
    api_error_messages_detected: apiErrorMessagesDetected,
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
  console.log(`Header identity candidates: ${result.header_identity_candidates.length}`);
  console.log(`Forbidden client UID candidates: ${result.forbidden_client_uid_candidates_detected.length}`);
  console.log(`CFDI identity source: ${JSON.stringify(result.cfdi_identity_source)}`);
  console.log(`Identity ambiguous: ${result.identity_ambiguous}`);
  console.log(`API errors: ${result.api_errors}`);
  console.log(`HTTP errors: ${result.http_errors}`);
  console.log(`API status unknown: ${result.api_status_unknown}`);
  console.log(`Create API errors: ${result.create_api_errors}`);
  console.log(`Create HTTP errors: ${result.create_http_errors}`);
  console.log(`API error messages detectados: ${result.api_error_messages_detected.join(" | ") || "none"}`);
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
