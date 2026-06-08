const {
  facturaComRequest,
  normalizeFacturaComHttpResponse,
  sanitizeValue,
} = require("./factura-com-live-client");
const {
  mapCanonicalProviderClientToFacturaComPayload,
  normalizeRfc,
  redactRfc,
  redactUid,
  safeProviderClientSummary,
} = require("./factura-com-provider-client-mapper");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function encode(value) {
  return encodeURIComponent(String(value ?? ""));
}

function normalizeResponse(response = {}, env = {}) {
  if (response && Object.prototype.hasOwnProperty.call(response, "http_ok")) return response;
  return normalizeFacturaComHttpResponse(response, env);
}

function nestedCandidates(data) {
  const out = [];
  function visit(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object") return;
    if (extractProviderClientUid(value) || extractProviderClientRfc(value) || extractProviderClientName(value)) {
      out.push(value);
    }
    for (const key of ["Data", "data", "clientes", "Clientes", "clients", "Clients", "results", "Result"]) {
      if (value[key] !== undefined) visit(value[key]);
    }
  }
  visit(data);
  return out;
}

function extractProviderClientUid(item = {}) {
  return text(item.UID || item.uid || item.Uid || item.IdCliente || item.id_cliente || item.client_uid || item.provider_client_uid || item.id);
}

function extractProviderClientRfc(item = {}) {
  return normalizeRfc(item.RFC || item.rfc || item.tax_id);
}

function extractProviderClientName(item = {}) {
  return text(item.RazonSocial || item.razon_social || item.razons || item.legal_name || item.nombre || item.name);
}

function normalizeProviderClientMatch(item = {}) {
  const uid = extractProviderClientUid(item);
  const rfc = extractProviderClientRfc(item);
  return {
    provider_client_uid: uid,
    provider_rfc: rfc,
    provider_legal_name: extractProviderClientName(item),
    safe: safeProviderClientSummary({
      provider_client_uid: uid,
      rfc,
      legal_name: extractProviderClientName(item),
    }),
  };
}

function normalizeProviderClientLookup(response = {}, query = {}, env = {}) {
  const normalized = normalizeResponse(response, env);
  const matches = nestedCandidates(normalized.data)
    .map(normalizeProviderClientMatch)
    .filter((match) => match.provider_client_uid || match.provider_rfc || match.provider_legal_name);
  const requestedRfc = normalizeRfc(query.rfc);
  const rfcMatches = requestedRfc
    ? matches.filter((match) => !match.provider_rfc || match.provider_rfc === requestedRfc)
    : matches;
  const finalMatches = rfcMatches.length ? rfcMatches : matches;
  const status = !normalized.ok
    ? "ERROR"
    : finalMatches.length === 0
      ? "NOT_FOUND"
      : finalMatches.length === 1
        ? "OK"
        : "AMBIGUOUS";
  return {
    ok: status === "OK",
    status,
    provider: "factura_com",
    environment: "SANDBOX",
    matches_count: finalMatches.length,
    provider_client_uid: finalMatches.length === 1 ? finalMatches[0].provider_client_uid : null,
    provider_client_uid_present: Boolean(finalMatches.length === 1 && finalMatches[0].provider_client_uid),
    safe_matches: finalMatches.map((match) => match.safe),
    raw_provider_response_sanitized: sanitizeValue(normalized, env),
    api_message_summary: normalized.api_message_summary || null,
  };
}

class FacturaComSandboxClientAdapter {
  constructor(options = {}) {
    this.env = options.env || {};
    this.requestFn = options.requestFn || null;
  }

  async request(method, requestPath, body, context = {}) {
    const env = { ...this.env, ...(context.env || {}) };
    const requestFn = context.requestFn || this.requestFn;
    if (typeof requestFn === "function") {
      return normalizeResponse(await requestFn({ method, path: requestPath, body, env }), env);
    }
    return facturaComRequest({ method, path: requestPath, body, env });
  }

  lookupPaths(query = {}) {
    const rfc = normalizeRfc(query.rfc);
    const legalName = text(query.legal_name || query.razon_social);
    const uid = text(query.provider_client_uid || query.uid);
    if (uid) return [`/v1/clients/${encode(uid)}`];
    if (rfc) {
      return [
        `/v1/clients?rfc=${encode(rfc)}`,
        `/v1/clients/rfc/${encode(rfc)}`,
        `/v1/clients/${encode(rfc)}`,
      ];
    }
    if (legalName) return [`/v1/clients?razon_social=${encode(legalName)}`];
    return ["/v1/clients"];
  }

  async lookupClient(query = {}, context = {}) {
    const env = { ...this.env, ...(context.env || {}) };
    const paths = this.lookupPaths(query);
    const attempts = [];
    for (const requestPath of paths) {
      const response = await this.request("GET", requestPath, undefined, context);
      const normalized = normalizeProviderClientLookup(response, query, env);
      attempts.push({ path: requestPath, status: normalized.status, matches_count: normalized.matches_count });
      if (normalized.status === "OK" || normalized.status === "AMBIGUOUS") {
        return { ...normalized, lookup_attempts: attempts };
      }
    }
    const last = attempts[attempts.length - 1] || null;
    return {
      ok: false,
      status: "NOT_FOUND",
      provider: "factura_com",
      environment: "SANDBOX",
      matches_count: 0,
      provider_client_uid: null,
      provider_client_uid_present: false,
      safe_matches: [],
      lookup_attempts: attempts,
      raw_provider_response_sanitized: last ? { last_attempt: last } : {},
    };
  }

  async getClientByRfc(rfc, context = {}) {
    return this.lookupClient({ rfc }, context);
  }

  async getClientByUid(uid, context = {}) {
    return this.lookupClient({ provider_client_uid: uid }, context);
  }

  async createClient(canonicalClient, context = {}) {
    const env = { ...this.env, ...(context.env || {}) };
    const payload = mapCanonicalProviderClientToFacturaComPayload(canonicalClient, context);
    const response = await this.request("POST", "/v1/clients/create", payload, context);
    const normalized = normalizeProviderClientLookup(response, { rfc: payload.rfc }, env);
    return {
      ...normalized,
      status: normalized.ok ? "CREATED" : normalized.status,
      payload_sanitized: sanitizeValue(payload, env),
    };
  }

  async updateClient(providerClientUid, canonicalClient, context = {}) {
    const env = { ...this.env, ...(context.env || {}) };
    const uid = text(providerClientUid);
    const payload = mapCanonicalProviderClientToFacturaComPayload(canonicalClient, context);
    const response = await this.request("POST", `/v1/clients/${encode(uid)}/update`, payload, context);
    const normalized = normalizeProviderClientLookup(response, { provider_client_uid: uid }, env);
    return {
      ...normalized,
      status: normalized.ok ? "UPDATED" : normalized.status,
      provider_client_uid: normalized.provider_client_uid || uid,
      provider_client_uid_present: Boolean(normalized.provider_client_uid || uid),
      payload_sanitized: sanitizeValue(payload, env),
      safe_link: {
        provider_client_uid_redacted: redactUid(uid),
        rfc_redacted: redactRfc(payload.rfc),
      },
    };
  }
}

module.exports = {
  FacturaComSandboxClientAdapter,
  extractProviderClientRfc,
  extractProviderClientUid,
  normalizeProviderClientLookup,
};
