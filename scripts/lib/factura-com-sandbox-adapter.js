const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  PAC_ENVIRONMENTS,
  assertPacAdapter,
} = require("./pac-adapter-contract");
const {
  assertFacturaComSandboxEnv,
  facturaComRequest,
  normalizeFacturaComHttpResponse,
  safeApiMessagePreview,
  sanitizeFacturaComError,
  sanitizeValue,
} = require("./factura-com-live-client");
const {
  PROVIDER,
  assertFacturaComSandboxPayload,
  mapCanonicalInvoiceToFacturaComPayload,
  normalizeFacturaComErrorResponse,
  normalizeFacturaComSuccessResponse,
} = require("./factura-com-payload-mapper");

const ADAPTER_NAME = "FacturaComSandboxAdapter";
const SANDBOX_MODES = Object.freeze({
  MOCK: "mock",
  LIVE: "live",
});
const LIVE_CREATE_PATH = "/v4/cfdi40/create";
const DOWNLOAD_PATHS = Object.freeze({
  XML: (ref) => `/v4/cfdi40/${encodeURIComponent(ref)}/xml`,
  PDF: (ref) => `/v4/cfdi40/${encodeURIComponent(ref)}/pdf`,
});
const ARTIFACT_STATUSES = Object.freeze({
  NOT_REQUESTED: "NOT_REQUESTED",
  DOWNLOAD_READY: "DOWNLOAD_READY",
  DOWNLOADED: "DOWNLOADED",
  PARTIAL_DOWNLOAD: "PARTIAL_DOWNLOAD",
  DOWNLOAD_ERROR: "DOWNLOAD_ERROR",
  NEEDS_CONFIG: "NEEDS_CONFIG",
  NEEDS_RUNTIME: "NEEDS_RUNTIME",
});
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const RFC_PATTERN = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function envFrom(context = {}, fallback = {}) {
  return context.env || fallback.env || fallback || {};
}

function modeFrom(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === SANDBOX_MODES.LIVE ? SANDBOX_MODES.LIVE : SANDBOX_MODES.MOCK;
}

function sandboxMode(options = {}, context = {}) {
  return modeFrom(
    context.mode
    || context.sandboxMode
    || context.FACTURACOM_SANDBOX_MODE
    || context.env?.FACTURACOM_SANDBOX_MODE
    || options.mode
    || options.sandboxMode
    || options.env?.FACTURACOM_SANDBOX_MODE,
  );
}

function blockIfNotSandbox(environment) {
  if ((environment || PAC_ENVIRONMENTS.SANDBOX) !== PAC_ENVIRONMENTS.SANDBOX) {
    return normalizeFacturaComErrorResponse({
      code: "FACTURA_COM_SANDBOX_ONLY",
      message: "Factura.com Sandbox adapter solo permite SANDBOX.",
      status: "BLOCKED",
    });
  }
  return null;
}

function defaultStampResponse(canonicalPacRequest = {}) {
  const sourceInvoice = canonicalPacRequest?.payload?.canonical_invoice_document || {};
  return {
    operation: "stampSandbox",
    status: "SANDBOX_STAMPED",
    pac_invoice_id: `FACTURA-COM-MOCK-${text(sourceInvoice.internal_invoice_id) || "INVOICE"}`,
    uuid: "00000000-0000-4000-8000-000000000999",
    serie: "SANDBOX",
    folio: text(sourceInvoice.internal_invoice_id) || "MOCK",
    xml_provider_available: false,
    pdf_provider_available: false,
    xml_downloaded: false,
    pdf_downloaded: false,
    artifact_status: ARTIFACT_STATUSES.NOT_REQUESTED,
    xml_available: false,
    pdf_available: false,
  };
}

function defaultCancelResponse(invoiceRef = {}) {
  return {
    operation: "cancelInvoice",
    status: "SANDBOX_CANCELLED",
    pac_invoice_id: text(invoiceRef.pac_invoice_id || invoiceRef.id),
    uuid: text(invoiceRef.uuid),
    xml_provider_available: false,
    pdf_provider_available: false,
    xml_downloaded: false,
    pdf_downloaded: false,
    artifact_status: ARTIFACT_STATUSES.NOT_REQUESTED,
    xml_available: false,
    pdf_available: false,
  };
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRelative(filePath) {
  const resolved = path.resolve(filePath);
  if (isInside(repoRoot, resolved)) return path.relative(repoRoot, resolved).replace(/\\/g, "/");
  return "[BLOCKED_PATH]";
}

function assertRuntimeStorageDir(storageDir) {
  const raw = text(storageDir);
  if (!raw) return null;
  const resolved = path.resolve(raw);
  if (!isInside(runtimeRoot, resolved)) {
    throw new Error("storageDir debe estar dentro de runtime/.");
  }
  return resolved;
}

function artifactHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function artifactBufferFromResponse(rawResponse = {}, kind = "XML") {
  const direct = rawResponse.rawBuffer || rawResponse.bodyBuffer || rawResponse.buffer;
  if (Buffer.isBuffer(direct)) return direct;
  const data = rawResponse.data;
  if (Buffer.isBuffer(data)) return data;
  if (typeof rawResponse.base64 === "string") return Buffer.from(rawResponse.base64, "base64");
  if (data && typeof data === "object" && typeof data.base64 === "string") return Buffer.from(data.base64, "base64");
  if (typeof data === "string" && (kind === "XML" || data.startsWith("%PDF"))) return Buffer.from(data, kind === "PDF" ? "binary" : "utf8");
  if (typeof rawResponse.rawText === "string") return Buffer.from(rawResponse.rawText, kind === "PDF" ? "binary" : "utf8");
  return null;
}

function invoiceRefValue(invoiceRef = {}) {
  const candidates = [
    invoiceRef.cfdi_uid,
    invoiceRef.uid,
    invoiceRef.pac_invoice_id,
    invoiceRef.invoice_id,
    invoiceRef.id,
    invoiceRef.uuid,
    invoiceRef.cfdi_uuid,
    invoiceRef.internal_invoice_id,
  ];
  for (const candidate of candidates) {
    const value = text(candidate);
    if (value) return value;
  }
  if (invoiceRef.manifest && typeof invoiceRef.manifest === "object") return invoiceRefValue(invoiceRef.manifest);
  if (invoiceRef.pac_result && typeof invoiceRef.pac_result === "object") return invoiceRefValue(invoiceRef.pac_result);
  return null;
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function isRfc(value) {
  return RFC_PATTERN.test(String(value || "").trim().toUpperCase());
}

function collectFields(value, keys = [], path = "$", depth = 0, output = []) {
  if (!value || depth > 10) return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFields(item, keys, `${path}[${index}]`, depth + 1, output));
    return output;
  }
  if (typeof value !== "object") return output;
  const wanted = new Set(keys.map((key) => String(key).toLowerCase()));
  for (const [key, child] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (wanted.has(String(key).toLowerCase())) {
      output.push({
        key,
        path: nextPath,
        value: child,
        depth,
        cfdiLike: /cfdi|factura|comprobante|respuestaapi|timbre/i.test(nextPath),
        clientLike: /client|cliente|receptor/i.test(nextPath),
      });
    }
    collectFields(child, keys, nextPath, depth + 1, output);
  }
  return output;
}

function pickIdentityField(response, keys, validate = text) {
  const candidates = collectFields(response, keys)
    .map((candidate, index) => {
      const value = validate(candidate.value);
      if (!value) return null;
      const key = String(candidate.key || "").toLowerCase();
      const pathText = String(candidate.path || "").toLowerCase();
      const score = (candidate.cfdiLike ? 90 : 0)
        + (pathText.includes("data") || pathText.includes("response") ? 20 : 0)
        + (key.includes("cfdi") ? 60 : 0)
        + (key === "uuid" || key === "uid" || key === "id" ? 15 : 0)
        - (candidate.clientLike ? 120 : 0)
        - candidate.depth;
      return { ...candidate, value, score, index };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.depth - b.depth || a.index - b.index);
  return candidates[0]?.value || null;
}

function extractStatus(response = {}) {
  return pickIdentityField(response, ["status", "Status", "estado", "Estado"], (value) => text(value));
}

function extractUuid(response = {}) {
  return pickIdentityField(response, ["UUID", "uuid", "Uuid", "FolioFiscal", "folio_fiscal"], (value) => {
    const cleaned = text(value);
    return cleaned && isUuid(cleaned) ? cleaned : null;
  });
}

function extractCfdiUid(response = {}) {
  return pickIdentityField(response, ["UID", "uid", "Uid", "cfdi_uid", "CFDI_UID"], (value) => {
    const cleaned = text(value);
    if (!cleaned || isUuid(cleaned) || isRfc(cleaned)) return null;
    return cleaned;
  });
}

function extractPacInvoiceId(response = {}) {
  return pickIdentityField(response, ["pac_invoice_id", "invoice_id", "factura_id", "id", "Id", "ID"], (value) => {
    const cleaned = text(value);
    if (!cleaned || isUuid(cleaned) || isRfc(cleaned)) return null;
    return cleaned;
  });
}

function extractSerie(response = {}) {
  return pickIdentityField(response, ["Serie", "serie"], (value) => text(value));
}

function extractFolio(response = {}) {
  return pickIdentityField(response, ["Folio", "folio"], (value) => {
    const cleaned = text(value);
    if (!cleaned || isUuid(cleaned) || isRfc(cleaned)) return null;
    return cleaned;
  });
}

function extractLiveIdentity(response = {}) {
  return {
    cfdi_uid: extractCfdiUid(response),
    uuid: extractUuid(response),
    pac_invoice_id: extractPacInvoiceId(response),
    serie: extractSerie(response),
    folio: extractFolio(response),
    status: extractStatus(response),
  };
}

function liveContextFromEnv(context = {}, env = {}) {
  const provider = context.factura_com || context.facturaCom || {};
  return {
    ...context,
    factura_com: {
      ...provider,
      receptor_uid: text(provider.receptor_uid || provider.receiver_uid || context.receiver_uid || env.FACTURACOM_SANDBOX_RECEIVER_UID),
      TipoDocumento: text(provider.TipoDocumento || provider.tipo_documento || context.tipo_documento || env.FACTURACOM_SANDBOX_TIPO_DOCUMENTO || "factura"),
      Serie: text(provider.Serie || provider.serie || context.serie || env.FACTURACOM_SANDBOX_SERIE),
      FormaPago: text(provider.FormaPago || provider.forma_pago || context.forma_pago || env.FACTURACOM_SANDBOX_FORMA_PAGO),
      MetodoPago: text(provider.MetodoPago || provider.metodo_pago || context.metodo_pago || env.FACTURACOM_SANDBOX_METODO_PAGO),
      Moneda: text(provider.Moneda || provider.moneda || context.moneda || env.FACTURACOM_SANDBOX_MONEDA || "MXN"),
      LugarExpedicion: text(provider.LugarExpedicion || provider.lugar_expedicion || context.lugar_expedicion || env.FACTURACOM_SANDBOX_LUGAR_EXPEDICION),
      UsoCFDI: text(provider.UsoCFDI || provider.uso_cfdi || context.uso_cfdi || env.FACTURACOM_SANDBOX_USO_CFDI),
      EnviarCorreo: provider.EnviarCorreo ?? provider.enviar_correo ?? context.enviar_correo ?? false,
      Comentarios: text(provider.Comentarios || provider.comentarios || context.comentarios || "AsistenteCFDI_BOT sandbox live"),
    },
    emitter_regimen_fiscal: text(context.emitter_regimen_fiscal || env.FACTURACOM_SANDBOX_EMITTER_REGIMEN || "626"),
  };
}

class FacturaComSandboxAdapter {
  constructor(options = {}) {
    this.adapterName = ADAPTER_NAME;
    this.provider = PROVIDER;
    this.environment = PAC_ENVIRONMENTS.SANDBOX;
    this.supportsProduction = false;
    this.options = {
      ...options,
      allowMockResponsesOnly: options.allowMockResponsesOnly !== false,
      mode: modeFrom(options.mode || options.sandboxMode || options.env?.FACTURACOM_SANDBOX_MODE),
      env: options.env || {},
    };
    this.mockOnly = this.options.mode !== SANDBOX_MODES.LIVE;
    assertPacAdapter(this);
  }

  getPublicConfig() {
    return {
      adapterName: this.adapterName,
      provider: this.provider,
      environment: this.environment,
      supportsProduction: this.supportsProduction,
      mockOnly: this.mockOnly,
      mode: this.options.mode,
    };
  }

  createSandboxPayload(canonicalPacRequest = {}, context = {}) {
    const blocked = blockIfNotSandbox(canonicalPacRequest.environment);
    if (blocked) return blocked;
    const canonicalInvoice = canonicalPacRequest?.payload?.canonical_invoice_document;
    if (!canonicalInvoice) {
      return this.normalizeError({
        code: "CANONICAL_INVOICE_REQUIRED",
        message: "CanonicalPacRequest requiere payload.canonical_invoice_document.",
      }, { operation: canonicalPacRequest.operation || "stampSandbox" });
    }
    try {
      const env = envFrom(context, this.options);
      const mappedContext = sandboxMode(this.options, context) === SANDBOX_MODES.LIVE
        ? liveContextFromEnv({ ...context, canonicalPacRequest, canonicalDraft: canonicalPacRequest?.payload?.canonical_draft }, env)
        : { ...context, canonicalPacRequest, canonicalDraft: canonicalPacRequest?.payload?.canonical_draft };
      return mapCanonicalInvoiceToFacturaComPayload(canonicalInvoice, mappedContext);
    } catch (error) {
      return this.normalizeError(error, { operation: canonicalPacRequest.operation || "stampSandbox" });
    }
  }

  validateSandboxPayload(payload) {
    return assertFacturaComSandboxPayload(payload);
  }

  mockStampSandbox(canonicalPacRequest = {}, mockResponse = null) {
    const blocked = blockIfNotSandbox(canonicalPacRequest.environment);
    if (blocked) return blocked;
    const payload = this.createSandboxPayload(canonicalPacRequest);
    if (payload?.ok === false && Array.isArray(payload.normalized_errors)) return payload;
    const validation = this.validateSandboxPayload(payload);
    if (!validation.ok) {
      return this.normalizeError({
        code: "FACTURA_COM_MOCK_PAYLOAD_INVALID",
        message: validation.errors.join("; "),
        data: { validation_errors: validation.errors },
      }, { operation: "stampSandbox" });
    }
    return normalizeFacturaComSuccessResponse(mockResponse || defaultStampResponse(canonicalPacRequest), {
      operation: "stampSandbox",
    });
  }

  mockCancelSandbox(invoiceRef = {}, mockResponse = null) {
    const blocked = blockIfNotSandbox(invoiceRef.environment);
    if (blocked) return blocked;
    if (!invoiceRef.uuid && !invoiceRef.pac_invoice_id && !invoiceRef.id) {
      return this.normalizeError({
        code: "INVOICE_REF_REQUIRED",
        message: "cancelInvoice requiere uuid o pac_invoice_id.",
      }, { operation: "cancelInvoice" });
    }
    return normalizeFacturaComSuccessResponse(mockResponse || defaultCancelResponse(invoiceRef), {
      operation: "cancelInvoice",
      status: "SANDBOX_CANCELLED",
    });
  }

  cancelInvoice(invoiceRef = {}, context = {}) {
    return this.mockCancelSandbox(invoiceRef, context.mockResponse);
  }

  createDraftPayload(draftOrRequest = {}, context = {}) {
    if (draftOrRequest?.payload?.canonical_invoice_document) return this.createSandboxPayload(draftOrRequest);
    if (context.canonicalPacRequest) return this.createSandboxPayload(context.canonicalPacRequest);
    return this.normalizeError({
      code: "CANONICAL_PAC_REQUEST_REQUIRED",
      message: "createDraftPayload mock requiere CanonicalPacRequest.",
    }, { operation: "stampSandbox" });
  }

  validatePayload(payload) {
    return this.validateSandboxPayload(payload);
  }

  normalizeConfigError(error, context = {}) {
    const env = envFrom(context, this.options);
    const safeError = sanitizeFacturaComError(error, env);
    return normalizeFacturaComErrorResponse({
      code: "FACTURACOM_SANDBOX_CONFIG_MISSING",
      message: safeApiMessagePreview(safeError.message || error?.message || "Configuracion sandbox Factura.com incompleta.", env),
      status: "NEEDS_CONFIG",
      data: safeError,
    }, { operation: context.operation || "stampSandbox", status: "NEEDS_CONFIG" });
  }

  async liveStampSandbox(canonicalPacRequest = {}, context = {}) {
    const blocked = blockIfNotSandbox(canonicalPacRequest.environment);
    if (blocked) return blocked;

    const env = envFrom(context, this.options);
    try {
      assertFacturaComSandboxEnv(env);
    } catch (error) {
      return this.normalizeConfigError(error, { env });
    }

    const payload = this.createSandboxPayload(canonicalPacRequest, { ...context, env, mode: SANDBOX_MODES.LIVE });
    if (payload?.ok === false && Array.isArray(payload.normalized_errors)) return payload;
    const validation = this.validateSandboxPayload(payload);
    if (!validation.ok) {
      return this.normalizeError({
        code: "FACTURA_COM_LIVE_PAYLOAD_INVALID",
        message: validation.errors.join("; "),
        data: { validation_errors: validation.errors },
      }, { operation: "stampSandbox" });
    }

    const unresolved = payload.official_request?.unresolved_fields || [];
    if (unresolved.length) {
      return normalizeFacturaComErrorResponse({
        code: "FACTURACOM_SANDBOX_LOCAL_CONFIG_MISSING",
        message: "Falta configuracion local para timbrado sandbox Factura.com.",
        status: "NEEDS_CONFIG",
        data: { unresolved_fields: unresolved, local_config_errors: payload.official_request?.local_config_errors || [] },
      }, { operation: "stampSandbox", status: "NEEDS_CONFIG" });
    }

    const requestFn = context.requestFn || this.options.requestFn || facturaComRequest;
    try {
      const rawResponse = await requestFn({
        method: "POST",
        path: LIVE_CREATE_PATH,
        body: payload.official_request.body,
        env,
      });
      const response = normalizeFacturaComHttpResponse(rawResponse, env);
      const identity = {
        ...extractLiveIdentity(response.data || response),
        ...Object.fromEntries(Object.entries(extractLiveIdentity(response)).filter(([, value]) => value)),
      };
      const hasIdentity = Boolean(identity.cfdi_uid || identity.uuid || identity.pac_invoice_id);
      if (response.ok !== true || response.api_ok === false) {
        return normalizeFacturaComErrorResponse({
          code: "FACTURACOM_SANDBOX_API_ERROR",
          message: response.api_message_summary || response.statusText || "Factura.com sandbox no acepto el CFDI.",
          status: "PAC_SANDBOX_ERROR",
          data: sanitizeValue(response, env),
        }, { operation: "stampSandbox", status: "PAC_SANDBOX_ERROR" });
      }
      return {
        ok: true,
        provider: PROVIDER,
        environment: PAC_ENVIRONMENTS.SANDBOX,
        operation: "stampSandbox",
        status: "SANDBOX_STAMPED",
        mode: SANDBOX_MODES.LIVE,
        live_mode: true,
        pac_invoice_id: text(identity.pac_invoice_id || identity.cfdi_uid),
        cfdi_uid: text(identity.cfdi_uid),
        uuid: text(identity.uuid),
        serie: text(identity.serie),
        folio: text(identity.folio),
        provider_status: text(identity.status || response.api_status || response.status),
        xml_provider_available: hasIdentity,
        pdf_provider_available: hasIdentity,
        xml_downloaded: false,
        pdf_downloaded: false,
        artifact_status: hasIdentity ? ARTIFACT_STATUSES.DOWNLOAD_READY : ARTIFACT_STATUSES.NOT_REQUESTED,
        xml_available: hasIdentity,
        pdf_available: hasIdentity,
        raw: sanitizeValue(response, env),
        request: sanitizeValue({ method: "POST", path: LIVE_CREATE_PATH, body: payload.official_request.body }, env),
        normalized_errors: [],
        normalized_warnings: hasIdentity ? [] : ["FACTURACOM_SANDBOX_IDENTITY_NOT_FOUND"],
        requires_human_review: true,
      };
    } catch (error) {
      return normalizeFacturaComErrorResponse({
        code: "FACTURACOM_SANDBOX_REQUEST_FAILED",
        message: safeApiMessagePreview(error?.message || "Error al llamar Factura.com sandbox.", env),
        status: "PAC_SANDBOX_ERROR",
        data: sanitizeFacturaComError(error, env),
      }, { operation: "stampSandbox", status: "PAC_SANDBOX_ERROR" });
    }
  }

  stampSandbox(payloadOrRequest = {}, context = {}) {
    if (context.requireLiveSandbox === true && sandboxMode(this.options, context) !== SANDBOX_MODES.LIVE) {
      return normalizeFacturaComErrorResponse({
        code: "FACTURACOM_SANDBOX_LIVE_OPERATIONAL_MODE_REQUIRED",
        message: "Sandbox Operativo Live requiere FACTURACOM_SANDBOX_MODE=live.",
        status: "NEEDS_CONFIG",
      }, { operation: "stampSandbox", status: "NEEDS_CONFIG" });
    }
    if (payloadOrRequest?.payload?.canonical_invoice_document && sandboxMode(this.options, context) === SANDBOX_MODES.LIVE) {
      return this.liveStampSandbox(payloadOrRequest, context);
    }
    if (payloadOrRequest?.payload?.canonical_invoice_document) {
      return this.mockStampSandbox(payloadOrRequest, context.mockResponse);
    }
    const validation = this.validateSandboxPayload(payloadOrRequest);
    if (!validation.ok) {
      return this.normalizeError({
        code: "FACTURA_COM_MOCK_PAYLOAD_INVALID",
        message: validation.errors.join("; "),
      }, { operation: "stampSandbox" });
    }
    return normalizeFacturaComSuccessResponse(context.mockResponse || {
      operation: "stampSandbox",
      status: "SANDBOX_STAMPED",
      pac_invoice_id: `FACTURA-COM-MOCK-${text(payloadOrRequest.internal_invoice_id) || "INVOICE"}`,
      uuid: "00000000-0000-4000-8000-000000000998",
      xml_provider_available: false,
      pdf_provider_available: false,
      xml_downloaded: false,
      pdf_downloaded: false,
      artifact_status: ARTIFACT_STATUSES.NOT_REQUESTED,
      xml_available: false,
      pdf_available: false,
    }, { operation: "stampSandbox" });
  }

  async downloadArtifact(kind = "XML", invoiceRef = {}, context = {}) {
    const artifactType = kind === "PDF" ? "PDF" : "XML";
    const operation = artifactType === "PDF" ? "downloadPdf" : "downloadXml";
    const field = artifactType.toLowerCase();
    const blocked = blockIfNotSandbox(invoiceRef.environment || context.environment || PAC_ENVIRONMENTS.SANDBOX);
    if (blocked) return blocked;

    if (sandboxMode(this.options, context) !== SANDBOX_MODES.LIVE) {
      return normalizeFacturaComErrorResponse({
        code: `FACTURACOM_SANDBOX_${artifactType}_LIVE_MODE_REQUIRED`,
        message: "La descarga XML/PDF sandbox requiere FACTURACOM_SANDBOX_MODE=live.",
        status: "NEEDS_CONFIG",
      }, { operation, status: "NEEDS_CONFIG" });
    }

    const env = envFrom(context, this.options);
    try {
      assertFacturaComSandboxEnv(env);
    } catch (error) {
      return this.normalizeConfigError(error, { env, operation });
    }

    const ref = invoiceRefValue(invoiceRef);
    if (!ref) {
      return normalizeFacturaComErrorResponse({
        code: `FACTURACOM_SANDBOX_${artifactType}_IDENTITY_REQUIRED`,
        message: "Se requiere cfdi_uid, pac_invoice_id o uuid para descargar artefactos sandbox.",
        status: "NEEDS_RUNTIME",
      }, { operation, status: "NEEDS_RUNTIME" });
    }

    let storageDir = null;
    try {
      storageDir = assertRuntimeStorageDir(context.storageDir || context[`${field}StorageDir`]);
    } catch (error) {
      return normalizeFacturaComErrorResponse({
        code: `FACTURACOM_SANDBOX_${artifactType}_STORAGE_INVALID`,
        message: safeApiMessagePreview(error.message, env),
        status: "NEEDS_RUNTIME",
      }, { operation, status: "NEEDS_RUNTIME" });
    }

    const requestFn = context.requestFn || this.options.requestFn || facturaComRequest;
    const requestPath = DOWNLOAD_PATHS[artifactType](ref);
    try {
      const rawResponse = await requestFn({
        method: "GET",
        path: requestPath,
        env,
      });
      const response = normalizeFacturaComHttpResponse(rawResponse, env);
      if (response.ok !== true || response.api_ok === false) {
        return normalizeFacturaComErrorResponse({
          code: `FACTURACOM_SANDBOX_${artifactType}_DOWNLOAD_FAILED`,
          message: response.api_message_summary || response.statusText || `No se pudo descargar ${artifactType} sandbox.`,
          status: "PAC_SANDBOX_ERROR",
          data: sanitizeValue({
            status: response.status,
            statusText: response.statusText,
            contentType: response.contentType,
            request_path: requestPath,
          }, env),
        }, { operation, status: "PAC_SANDBOX_ERROR" });
      }

      const buffer = artifactBufferFromResponse(rawResponse, artifactType);
      if (!buffer || buffer.length === 0) {
        return normalizeFacturaComErrorResponse({
          code: `FACTURACOM_SANDBOX_${artifactType}_EMPTY_RESPONSE`,
          message: `Factura.com Sandbox no devolvio contenido ${artifactType} descargable.`,
          status: "PAC_SANDBOX_ERROR",
        }, { operation, status: "PAC_SANDBOX_ERROR" });
      }

      let artifactPath = null;
      let manifestPath = null;
      const fileName = artifactType === "PDF" ? "cfdi.pdf" : "cfdi.xml";
      const checksum = artifactHash(buffer);
      if (storageDir) {
        fs.mkdirSync(storageDir, { recursive: true });
        artifactPath = path.join(storageDir, fileName);
        fs.writeFileSync(artifactPath, buffer);
        manifestPath = path.join(storageDir, "manifest.json");
        writeJson(manifestPath, {
          schema_version: "facturacom_sandbox_artifact_download.v1",
          generated_at: new Date().toISOString(),
          provider: PROVIDER,
          environment: PAC_ENVIRONMENTS.SANDBOX,
          operation,
          artifact_type: artifactType,
          artifact_status: ARTIFACT_STATUSES.DOWNLOADED,
          [`${field}_provider_available`]: true,
          [`${field}_downloaded`]: true,
          [`${field}_storage_path`]: safeRelative(artifactPath),
          [`${field}_sha256`]: checksum,
          [`${field}_size_bytes`]: buffer.length,
          requires_human_review: true,
        });
      }

      return {
        ok: true,
        provider: PROVIDER,
        environment: PAC_ENVIRONMENTS.SANDBOX,
        operation,
        artifact_type: artifactType,
        artifact_status: ARTIFACT_STATUSES.DOWNLOADED,
        [`${field}_provider_available`]: true,
        [`${field}_downloaded`]: true,
        [`${field}_size_bytes`]: buffer.length,
        [`${field}_sha256`]: checksum,
        [`${field}_storage_path`]: artifactPath ? safeRelative(artifactPath) : null,
        [`${field}_manifest_path`]: manifestPath ? safeRelative(manifestPath) : null,
        normalized_errors: [],
        normalized_warnings: [],
        requires_human_review: true,
      };
    } catch (error) {
      return normalizeFacturaComErrorResponse({
        code: `FACTURACOM_SANDBOX_${artifactType}_DOWNLOAD_FAILED`,
        message: safeApiMessagePreview(error?.message || `Error al descargar ${artifactType} sandbox.`, env),
        status: "PAC_SANDBOX_ERROR",
        data: sanitizeFacturaComError(error, env),
      }, { operation, status: "PAC_SANDBOX_ERROR" });
    }
  }

  downloadXml(invoiceRef = {}, context = {}) {
    return this.downloadArtifact("XML", invoiceRef, context);
  }

  downloadPdf(invoiceRef = {}, context = {}) {
    return this.downloadArtifact("PDF", invoiceRef, context);
  }

  getStatus(invoiceRef = {}) {
    return {
      ok: true,
      provider: PROVIDER,
      environment: PAC_ENVIRONMENTS.SANDBOX,
      operation: "getStatus",
      status: text(invoiceRef.status) || "SANDBOX_MOCK_STATUS",
      pac_invoice_id: text(invoiceRef.pac_invoice_id || invoiceRef.id),
      uuid: text(invoiceRef.uuid),
      normalized_errors: [],
      normalized_warnings: [],
      requires_human_review: true,
    };
  }

  normalizeError(error, context = {}) {
    return normalizeFacturaComErrorResponse(error, {
      operation: context.operation || error?.operation || "stampSandbox",
      status: context.status || error?.status,
    });
  }
}

module.exports = {
  ADAPTER_NAME,
  ARTIFACT_STATUSES,
  PROVIDER,
  SANDBOX_MODES,
  extractLiveIdentity,
  FacturaComSandboxAdapter,
};
