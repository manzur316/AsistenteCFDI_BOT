const {
  PAC_ENVIRONMENTS,
  assertPacAdapter,
  normalizeGenericPacError,
} = require("./pac-adapter-contract");

const PROVIDER = "FACTURA_COM";
const ADAPTER_NAME = "FacturaComSandboxAdapter";

const ENV_KEYS = Object.freeze({
  BASE_URL: "FACTURACOM_SANDBOX_BASE_URL",
  API_KEY: "FACTURACOM_SANDBOX_API_KEY",
  SECRET_KEY: "FACTURACOM_SANDBOX_SECRET_KEY",
  LIVE: "FACTURACOM_SANDBOX_LIVE",
});

function cleanString(value) {
  return String(value || "").trim();
}

function cleanBaseUrl(value) {
  return cleanString(value).replace(/\/+$/, "");
}

function isEnabled(value) {
  return cleanString(value) === "1";
}

function redact(value) {
  const text = cleanString(value);
  if (!text) return "";
  if (text.length <= 6) return "[redacted]";
  return `${text.slice(0, 3)}...[redacted]...${text.slice(-3)}`;
}

function sanitizeEntity(entity = {}) {
  return {
    id: entity.id || entity.client_id || entity.emitter_id || null,
    name: entity.name || entity.display_name || entity.razon_social || null,
    rfc: entity.rfc || null,
    regimen_fiscal: entity.regimen_fiscal || null,
    codigo_postal_fiscal: entity.codigo_postal_fiscal || entity.cp || null,
    uso_cfdi: entity.uso_cfdi || entity.uso_cfdi_default || null,
  };
}

function normalizeLineItem(item = {}, index) {
  const concept = item.concept || item;
  const quantity = Number(item.quantity || item.cantidad || 1);
  const unitPrice = Number(item.unit_price || item.precio_unitario || item.subtotal || item.amount || 0);
  const subtotal = Number(item.subtotal || quantity * unitPrice || 0);
  return {
    line_number: index + 1,
    description: concept.concepto_factura || concept.concepto_sugerido || concept.description || item.description || null,
    clave_prod_serv: concept.clave_prod_serv || concept.sat?.product_service_key || null,
    clave_unidad: concept.clave_unidad || concept.sat?.unit_key || null,
    unidad: concept.unidad || concept.sat?.unit || null,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
    iva_amount: Number(item.iva_amount || 0) || 0,
    isr_retention_amount: Number(item.isr_retention_amount || 0) || 0,
    iva_retention_amount: Number(item.iva_retention_amount || 0) || 0,
  };
}

function payloadErrors(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") return ["payload debe ser objeto"];
  if (payload.provider !== PROVIDER) errors.push("provider debe ser FACTURA_COM");
  if (payload.environment !== PAC_ENVIRONMENTS.SANDBOX) errors.push("environment debe ser SANDBOX");
  if (!payload.draft_id) errors.push("draft_id requerido");
  if (!payload.receiver?.rfc) errors.push("receiver.rfc requerido para payload PAC");
  if (!payload.receiver?.regimen_fiscal) errors.push("receiver.regimen_fiscal requerido");
  if (!payload.receiver?.codigo_postal_fiscal) errors.push("receiver.codigo_postal_fiscal requerido");
  if (!Array.isArray(payload.items) || payload.items.length === 0) errors.push("items requeridos");
  for (const [index, item] of (payload.items || []).entries()) {
    if (!item.description) errors.push(`items[${index}].description requerido`);
    if (!item.clave_prod_serv) errors.push(`items[${index}].clave_prod_serv requerido`);
    if (!item.clave_unidad) errors.push(`items[${index}].clave_unidad requerido`);
  }
  if (payload.requires_human_review !== true) errors.push("requires_human_review debe ser true");
  return errors;
}

class FacturaComSandboxAdapter {
  constructor(options = {}) {
    this.adapterName = ADAPTER_NAME;
    this.provider = PROVIDER;
    this.environment = PAC_ENVIRONMENTS.SANDBOX;
    this.supportsProduction = false;
    this.env = options.env || (typeof process !== "undefined" ? process.env : {});
    this.baseUrl = cleanBaseUrl(this.env[ENV_KEYS.BASE_URL]);
    this.apiKey = cleanString(this.env[ENV_KEYS.API_KEY]);
    this.secretKey = cleanString(this.env[ENV_KEYS.SECRET_KEY]);
    this.liveEnabled = isEnabled(this.env[ENV_KEYS.LIVE]);
    this.httpClient = options.httpClient || null;
    this.timeoutMs = Number(options.timeoutMs || this.env.FACTURACOM_SANDBOX_TIMEOUT_MS || 30000);
    assertPacAdapter(this);
  }

  getPublicConfig() {
    return {
      adapterName: this.adapterName,
      provider: this.provider,
      environment: this.environment,
      baseUrl: this.baseUrl,
      apiKey: redact(this.apiKey),
      secretKey: redact(this.secretKey),
      liveEnabled: this.liveEnabled,
      supportsProduction: this.supportsProduction,
    };
  }

  createDraftPayload(draft = {}, context = {}) {
    const receiver = sanitizeEntity(draft.client || context.receiver || context.client || {});
    const emitter = sanitizeEntity(context.emitter || {});
    const sourceItems = Array.isArray(draft.line_items) && draft.line_items.length
      ? draft.line_items
      : [{ concept: draft.concept || {}, subtotal: draft.subtotal || draft.amount || 0, iva_amount: draft.iva_amount || 0 }];
    const items = sourceItems.map(normalizeLineItem);
    const subtotal = Number(draft.subtotal || items.reduce((sum, item) => sum + item.subtotal, 0) || 0);
    const ivaAmount = Number(draft.iva_amount || items.reduce((sum, item) => sum + item.iva_amount, 0) || 0);
    const isrRetentionAmount = Number(draft.isr_retention_amount || 0);
    const ivaRetentionAmount = Number(draft.iva_retention_amount || 0);
    const total = Number(draft.total || (subtotal + ivaAmount - isrRetentionAmount - ivaRetentionAmount));

    return {
      schema_version: "factura_com_sandbox_payload.v1",
      provider: PROVIDER,
      environment: PAC_ENVIRONMENTS.SANDBOX,
      cfdi_version: "4.0",
      draft_id: draft.draft_id || null,
      internal_invoice_id: draft.internal_invoice_id || null,
      emitter,
      receiver,
      items,
      totals: {
        subtotal,
        iva_amount: ivaAmount,
        isr_retention_amount: isrRetentionAmount,
        iva_retention_amount: ivaRetentionAmount,
        total,
      },
      metadata: {
        source: "AsistenteCFDI_BOT",
        pac_adapter: ADAPTER_NAME,
        original_message_id: draft.message_id || draft.source_message_id || null,
        original_update_id: draft.update_id || null,
      },
      requires_human_review: true,
    };
  }

  validatePayload(payload) {
    const errors = payloadErrors(payload);
    return {
      ok: errors.length === 0,
      provider: PROVIDER,
      environment: PAC_ENVIRONMENTS.SANDBOX,
      errors,
    };
  }

  async stampSandbox(payload, context = {}) {
    const validation = this.validatePayload(payload, context);
    if (!validation.ok) return validation;
    const raw = await this.requestSandbox("/cfdi40/stamp", {
      method: "POST",
      body: payload,
    });
    return this.normalizeInvoiceResponse(raw, "SANDBOX_STAMPED");
  }

  async downloadXml(invoiceRef, context = {}) {
    const raw = await this.requestSandbox(`/cfdi40/${encodeURIComponent(invoiceRef?.id || invoiceRef?.uuid || "")}/xml`, {
      method: "GET",
      context,
    });
    return {
      ok: true,
      provider: PROVIDER,
      environment: PAC_ENVIRONMENTS.SANDBOX,
      content_type: "application/xml",
      content: raw?.content || raw?.xml || raw,
      invoice_ref: invoiceRef,
    };
  }

  async downloadPdf(invoiceRef, context = {}) {
    const raw = await this.requestSandbox(`/cfdi40/${encodeURIComponent(invoiceRef?.id || invoiceRef?.uuid || "")}/pdf`, {
      method: "GET",
      context,
    });
    return {
      ok: true,
      provider: PROVIDER,
      environment: PAC_ENVIRONMENTS.SANDBOX,
      content_type: "application/pdf",
      content: raw?.content || raw?.pdf || raw,
      invoice_ref: invoiceRef,
    };
  }

  async getStatus(invoiceRef, context = {}) {
    const raw = await this.requestSandbox(`/cfdi40/${encodeURIComponent(invoiceRef?.id || invoiceRef?.uuid || "")}/status`, {
      method: "GET",
      context,
    });
    return {
      ok: true,
      provider: PROVIDER,
      environment: PAC_ENVIRONMENTS.SANDBOX,
      status: raw?.status || raw?.estado || "UNKNOWN",
      invoice_ref: invoiceRef,
      raw,
    };
  }

  normalizeError(error) {
    return normalizeGenericPacError(error, {
      provider: PROVIDER,
      environment: PAC_ENVIRONMENTS.SANDBOX,
      code: "FACTURA_COM_SANDBOX_ERROR",
      message: "Error normalizado de Factura.com sandbox.",
    });
  }

  normalizeInvoiceResponse(raw, status) {
    const id = raw?.id || raw?.invoice_id || raw?.uid || raw?.uuid || null;
    const uuid = raw?.uuid || raw?.folio_fiscal || null;
    return {
      ok: true,
      provider: PROVIDER,
      environment: PAC_ENVIRONMENTS.SANDBOX,
      status,
      invoice_ref: {
        provider: PROVIDER,
        environment: PAC_ENVIRONMENTS.SANDBOX,
        id,
        uuid,
      },
      raw,
    };
  }

  requireSandboxConfig() {
    const missing = [];
    if (!this.baseUrl) missing.push(ENV_KEYS.BASE_URL);
    if (!this.apiKey) missing.push(ENV_KEYS.API_KEY);
    if (!this.secretKey) missing.push(ENV_KEYS.SECRET_KEY);
    if (missing.length) {
      const error = new Error(`Faltan variables de entorno sandbox: ${missing.join(", ")}`);
      error.code = "FACTURA_COM_SANDBOX_CONFIG_MISSING";
      error.missing = missing;
      throw error;
    }
  }

  async requestSandbox(endpoint, options = {}) {
    this.requireSandboxConfig();
    const injectedHttpClient = typeof this.httpClient === "function";
    if (!injectedHttpClient && !this.liveEnabled) {
      const error = new Error("FACTURACOM_SANDBOX_LIVE debe ser 1 para llamadas reales sandbox.");
      error.code = "FACTURA_COM_SANDBOX_LIVE_DISABLED";
      throw error;
    }
    const url = `${this.baseUrl}${endpoint}`;
    const request = {
      method: options.method || "GET",
      url,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
        "X-Secret-Key": this.secretKey,
      },
      body: options.body || null,
      timeoutMs: this.timeoutMs,
      context: options.context || {},
    };
    try {
      const response = injectedHttpClient
        ? await this.httpClient(request)
        : await this.fetchHttpClient(request);
      return response?.data !== undefined ? response.data : response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async fetchHttpClient(request) {
    if (typeof fetch !== "function") {
      const error = new Error("fetch no esta disponible; inyecta httpClient o usa Node con fetch.");
      error.code = "FETCH_NOT_AVAILABLE";
      throw error;
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), request.timeoutMs) : null;
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller?.signal,
      });
      const text = await response.text();
      let data = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_error) {
        data = text;
      }
      if (!response.ok) {
        const error = new Error(`Factura.com sandbox HTTP ${response.status}`);
        error.response = { status: response.status, statusText: response.statusText, data };
        throw error;
      }
      return { data };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

module.exports = {
  ADAPTER_NAME,
  ENV_KEYS,
  PROVIDER,
  FacturaComSandboxAdapter,
};
