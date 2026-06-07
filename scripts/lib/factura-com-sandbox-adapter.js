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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    xml_available: false,
    pdf_available: false,
  };
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
    }, { operation: "stampSandbox", status: "NEEDS_CONFIG" });
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
      xml_available: false,
      pdf_available: false,
    }, { operation: "stampSandbox" });
  }

  downloadXml(invoiceRef = {}) {
    return this.normalizeError({
      code: "ARTIFACT_DOWNLOAD_DEFERRED_TO_PHASE_7_16",
      message: "La descarga XML sandbox queda diferida a la fase 7.16.",
      data: { invoice_ref: invoiceRef },
    }, { operation: "downloadXml" });
  }

  downloadPdf(invoiceRef = {}) {
    return this.normalizeError({
      code: "ARTIFACT_DOWNLOAD_DEFERRED_TO_PHASE_7_16",
      message: "La descarga PDF sandbox queda diferida a la fase 7.16.",
      data: { invoice_ref: invoiceRef },
    }, { operation: "downloadPdf" });
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
  PROVIDER,
  SANDBOX_MODES,
  extractLiveIdentity,
  FacturaComSandboxAdapter,
};
