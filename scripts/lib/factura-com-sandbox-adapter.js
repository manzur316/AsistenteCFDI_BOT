const {
  PAC_ENVIRONMENTS,
  assertPacAdapter,
} = require("./pac-adapter-contract");
const {
  PROVIDER,
  assertFacturaComSandboxPayload,
  mapCanonicalInvoiceToFacturaComPayload,
  normalizeFacturaComErrorResponse,
  normalizeFacturaComSuccessResponse,
} = require("./factura-com-payload-mapper");

const ADAPTER_NAME = "FacturaComSandboxAdapter";

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function blockIfNotSandbox(environment) {
  if ((environment || PAC_ENVIRONMENTS.SANDBOX) !== PAC_ENVIRONMENTS.SANDBOX) {
    return normalizeFacturaComErrorResponse({
      code: "FACTURA_COM_SANDBOX_ONLY",
      message: "Factura.com adapter mock solo permite SANDBOX.",
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

class FacturaComSandboxAdapter {
  constructor(options = {}) {
    this.adapterName = ADAPTER_NAME;
    this.provider = PROVIDER;
    this.environment = PAC_ENVIRONMENTS.SANDBOX;
    this.supportsProduction = false;
    this.mockOnly = true;
    this.options = { allowMockResponsesOnly: options.allowMockResponsesOnly !== false };
    assertPacAdapter(this);
  }

  getPublicConfig() {
    return {
      adapterName: this.adapterName,
      provider: this.provider,
      environment: this.environment,
      supportsProduction: this.supportsProduction,
      mockOnly: this.mockOnly,
    };
  }

  createSandboxPayload(canonicalPacRequest = {}) {
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
      return mapCanonicalInvoiceToFacturaComPayload(canonicalInvoice, { canonicalPacRequest });
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

  stampSandbox(payloadOrRequest = {}, context = {}) {
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
      code: "ARTIFACT_NOT_CREATED_IN_PHASE_6A5",
      message: "Sandbox mapper mock no crea archivos.",
      data: { invoice_ref: invoiceRef },
    }, { operation: "downloadXml" });
  }

  downloadPdf(invoiceRef = {}) {
    return this.normalizeError({
      code: "ARTIFACT_NOT_CREATED_IN_PHASE_6A5",
      message: "Sandbox mapper mock no crea archivos.",
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
  FacturaComSandboxAdapter,
};
