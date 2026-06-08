const {
  INVOICE_STATUSES,
  PAC_ENVIRONMENTS,
  validateCanonicalInvoiceDocument,
  validateCanonicalPacResult,
} = require("./canonical-cfdi-contracts");
const {
  buildSafeReceptorCompatibilityReport,
  explainUsoCfdiCompatibilityFailure,
  validateReceptorForCfdi,
} = require("./cfdi-receptor-compatibility-validator");
const {
  normalizeClaveUnidad,
  normalizeFormaPago,
  normalizeMetodoPago,
  normalizeMoneda,
  normalizeObjetoImp,
  normalizeRegimenFiscal,
  normalizeUsoCfdi,
} = require("./sat-catalogs/sat-field-normalizer");

const PROVIDER = "factura_com";
const SCHEMA_VERSION = "factura_com_sandbox_payload.mock.v1";
const TODO_DOCS_REQUIRED = "TODO_DOCS_REQUIRED";
const OFFICIAL_DOCS_CONFIRMED = "OFFICIAL_DOCS_CONFIRMED";
const OFFICIAL_DOCS_PARTIAL = "OFFICIAL_DOCS_PARTIAL";

class FacturaComPayloadMapperError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "FacturaComPayloadMapperError";
    this.code = details.code || "FACTURA_COM_PAYLOAD_MAPPER_ERROR";
    this.details = details;
  }
}

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function successfulNormalization(result) {
  return result?.ok === true && result.key;
}

function safeSatNormalizationReport(result) {
  if (!result) return null;
  return {
    ok: result.ok === true,
    status: result.status,
    catalog: result.catalog,
    input: result.input,
    key: result.key,
    description: result.description,
    source: result.source,
    warnings: result.warnings || [],
    errors: result.errors || [],
  };
}

function normalizedOrOriginal(result, original) {
  return successfulNormalization(result) ? result.key : text(original);
}

function fail(message, code, details = {}) {
  throw new FacturaComPayloadMapperError(message, { code, ...details });
}

function requireText(value, label) {
  const cleaned = text(value);
  if (!cleaned) fail(`${label} requerido`, "FACTURA_COM_REQUIRED_FIELD", { field: label });
  return cleaned;
}

function assertSandbox(environment) {
  const current = environment || PAC_ENVIRONMENTS.SANDBOX;
  if (current !== PAC_ENVIRONMENTS.SANDBOX) {
    fail("Factura.com mapper mock solo permite SANDBOX", "FACTURA_COM_PRODUCTION_BLOCKED", { environment: current });
  }
  return PAC_ENVIRONMENTS.SANDBOX;
}

function extractCanonicalPacRequest(context = {}) {
  return context.canonicalPacRequest || context.pac_request || null;
}

function extractDraftContext(canonicalInvoice, context = {}) {
  const pacRequest = extractCanonicalPacRequest(context);
  return context.canonicalDraft
    || context.draft
    || canonicalInvoice?.canonical_draft
    || pacRequest?.payload?.canonical_draft
    || null;
}

function extractReceiver(canonicalInvoice, context = {}) {
  const draft = extractDraftContext(canonicalInvoice, context);
  return context.receiver
    || canonicalInvoice?.receiver
    || canonicalInvoice?.canonical_receiver
    || draft?.receiver
    || draft?.client
    || null;
}

function extractLineItems(canonicalInvoice, context = {}) {
  const draft = extractDraftContext(canonicalInvoice, context);
  const candidates = context.line_items || canonicalInvoice?.line_items || draft?.line_items || [];
  return Array.isArray(candidates) ? candidates : [];
}

function extractIdempotencyKey(context = {}) {
  const pacRequest = extractCanonicalPacRequest(context);
  return text(context.idempotency_key || pacRequest?.idempotency_key);
}

function extractFacturaComOptions(sourceInvoice = {}, receiver = {}, context = {}) {
  const provider = context.factura_com || context.facturaCom || {};
  const raw = {
    receptor_uid: text(
      provider.receptor_uid
      || provider.receiver_uid
      || context.factura_com_receiver_uid
      || context.receiver_uid
      || receiver.factura_com_uid
      || receiver.facturacom_uid
      || receiver.uid
      || receiver.UID,
    ),
    tipo_documento: text(provider.TipoDocumento || provider.tipo_documento || context.tipo_documento || sourceInvoice.tipo_documento),
    uso_cfdi: text(provider.UsoCFDI || provider.uso_cfdi || context.uso_cfdi || receiver.cfdi_use || receiver.uso_cfdi),
    serie: text(provider.Serie || provider.serie || context.serie || sourceInvoice.serie),
    forma_pago: text(provider.FormaPago || provider.forma_pago || context.forma_pago || sourceInvoice.forma_pago),
    metodo_pago: text(provider.MetodoPago || provider.metodo_pago || context.metodo_pago || sourceInvoice.metodo_pago),
    moneda: text(provider.Moneda || provider.moneda || context.moneda || sourceInvoice.moneda || sourceInvoice.currency),
    enviar_correo: provider.EnviarCorreo ?? provider.enviar_correo ?? context.enviar_correo,
    lugar_expedicion: text(provider.LugarExpedicion || provider.lugar_expedicion || context.lugar_expedicion),
    comentarios: text(provider.Comentarios || provider.comentarios || context.comentarios),
  };
  const normalization = {
    uso_cfdi: raw.uso_cfdi ? normalizeUsoCfdi(raw.uso_cfdi) : null,
    forma_pago: raw.forma_pago ? normalizeFormaPago(raw.forma_pago) : null,
    metodo_pago: raw.metodo_pago ? normalizeMetodoPago(raw.metodo_pago) : null,
    moneda: raw.moneda ? normalizeMoneda(raw.moneda) : null,
  };
  return {
    ...raw,
    uso_cfdi: normalizedOrOriginal(normalization.uso_cfdi, raw.uso_cfdi),
    forma_pago: normalizedOrOriginal(normalization.forma_pago, raw.forma_pago),
    metodo_pago: normalizedOrOriginal(normalization.metodo_pago, raw.metodo_pago),
    moneda: normalizedOrOriginal(normalization.moneda, raw.moneda),
    sat_field_normalization: normalization,
  };
}

function mapCanonicalReceiverToFacturaComReceiver(receiver = {}) {
  const source = receiver || {};
  const taxRegimeNormalization = normalizeRegimenFiscal(source.tax_regime || source.regimen_fiscal);
  const cfdiUseInput = text(source.cfdi_use || source.uso_cfdi || source.uso_cfdi_default);
  const cfdiUseNormalization = cfdiUseInput ? normalizeUsoCfdi(cfdiUseInput) : null;
  return {
    provider_field_status: TODO_DOCS_REQUIRED,
    rfc: requireText(source.rfc, "receiver.rfc"),
    legal_name: requireText(source.legal_name || source.display_name, "receiver.legal_name"),
    tax_regime: requireText(successfulNormalization(taxRegimeNormalization) ? taxRegimeNormalization.key : (source.tax_regime || source.regimen_fiscal), "receiver.tax_regime"),
    fiscal_zip: requireText(source.fiscal_zip || source.codigo_postal_fiscal || source.cp, "receiver.fiscal_zip"),
    cfdi_use: successfulNormalization(cfdiUseNormalization) ? cfdiUseNormalization.key : cfdiUseInput,
    person_type: text(source.person_type || source.tipo_persona),
    validated_by_human: source.validated_by_human === true,
    validation_warnings: [
      ...(Array.isArray(source.validation_warnings) ? clone(source.validation_warnings) : []),
      ...(taxRegimeNormalization?.warnings || []),
      ...(cfdiUseNormalization?.warnings || []),
    ],
    sat_field_normalization: {
      tax_regime: safeSatNormalizationReport(taxRegimeNormalization),
      cfdi_use: safeSatNormalizationReport(cfdiUseNormalization),
    },
  };
}

function facturaComTaxCode(taxType) {
  const normalized = text(taxType)?.toUpperCase();
  if (normalized === "IVA") return "002";
  if (normalized === "IEPS") return "003";
  if (normalized === "ISR") return "001";
  return normalized;
}

function buildOfficialTaxEntry(tax = {}, concept = {}) {
  return {
    provider_field_status: OFFICIAL_DOCS_CONFIRMED,
    Base: number(tax.base ?? concept.subtotal, 0),
    Impuesto: facturaComTaxCode(tax.type || tax.impuesto),
    TipoFactor: text(tax.tipo_factor || tax.factor || (tax.rate !== undefined && tax.rate !== null ? "Tasa" : null)),
    TasaOCuota: tax.rate === undefined || tax.rate === null ? null : number(tax.rate, 0),
    Importe: number(tax.amount ?? tax.importe, 0),
  };
}

function buildOfficialTaxes(concept = {}) {
  const taxes = Array.isArray(concept.taxes) ? concept.taxes : [];
  const traslados = taxes
    .filter((tax) => text(tax.direction || tax.tipo)?.toUpperCase() === "TRANSFERRED")
    .map((tax) => buildOfficialTaxEntry(tax, concept));
  const retenidos = taxes
    .filter((tax) => text(tax.direction || tax.tipo)?.toUpperCase() === "RETAINED")
    .map((tax) => buildOfficialTaxEntry(tax, concept));

  return {
    provider_field_status: OFFICIAL_DOCS_CONFIRMED,
    Traslados: traslados,
    Retenidos: retenidos,
    Locales: [],
  };
}

function mapCanonicalTaxesToFacturaComTaxes(taxes = {}) {
  const source = taxes || {};
  return {
    provider_field_status: TODO_DOCS_REQUIRED,
    iva_transferred: number(source.iva_transferred ?? source.iva_amount ?? source.iva_trasladado, 0),
    iva_retained: number(source.iva_retained ?? source.iva_retention_amount ?? source.iva_retenido, 0),
    isr_retained: number(source.isr_retained ?? source.isr_retention_amount ?? source.isr_retenido, 0),
    ieps: number(source.ieps, 0),
    total_taxes_transferred: number(source.total_taxes_transferred, number(source.iva_transferred ?? source.iva_amount, 0) + number(source.ieps, 0)),
    total_taxes_retained: number(source.total_taxes_retained, number(source.iva_retained ?? source.iva_retention_amount, 0) + number(source.isr_retained ?? source.isr_retention_amount, 0)),
    warnings: Array.isArray(source.warnings) ? clone(source.warnings) : [],
  };
}

function mapLineTaxes(lineItem = {}) {
  const taxes = Array.isArray(lineItem.taxes) ? lineItem.taxes : [];
  return taxes.map((tax) => ({
    provider_field_status: TODO_DOCS_REQUIRED,
    type: requireText(tax.type || tax.impuesto, "line_item.tax.type"),
    direction: requireText(tax.direction || tax.tipo, "line_item.tax.direction"),
    amount: number(tax.amount ?? tax.importe, 0),
    rate: tax.rate === undefined ? null : number(tax.rate, 0),
  }));
}

function mapCanonicalLineItemToFacturaComConcept(lineItem = {}) {
  const source = lineItem || {};
  const unitNormalization = normalizeClaveUnidad(source.unit_key || source.clave_unidad || source.unit_name || source.unidad, {
    context: source.activity_scope?.operation_type || source.operation_type || source.item_type,
  });
  const taxObjectNormalization = normalizeObjetoImp(source.tax_object || source.objeto_imp || "02");
  const concept = {
    provider_field_status: TODO_DOCS_REQUIRED,
    line_id: requireText(source.line_id, "line_item.line_id"),
    description: requireText(source.description, "line_item.description"),
    clave_prod_serv: requireText(source.product_service_key || source.clave_prod_serv, "line_item.product_service_key"),
    clave_unidad: requireText(successfulNormalization(unitNormalization) ? unitNormalization.key : (source.unit_key || source.clave_unidad), "line_item.unit_key"),
    unidad: text(source.unit_name || source.unidad),
    quantity: number(source.quantity, 1),
    unit_price: number(source.unit_price, 0),
    subtotal: number(source.subtotal, 0),
    tax_object: requireText(successfulNormalization(taxObjectNormalization) ? taxObjectNormalization.key : (source.tax_object || source.objeto_imp), "line_item.tax_object"),
    taxes: mapLineTaxes(source),
    concept_id: text(source.concept_id || source.id),
    requires_human_review: true,
    sat_field_normalization: {
      clave_unidad: safeSatNormalizationReport(unitNormalization),
      objeto_imp: safeSatNormalizationReport(taxObjectNormalization),
    },
  };
  concept.official_fields = {
    provider_field_status: OFFICIAL_DOCS_CONFIRMED,
    ClaveProdServ: concept.clave_prod_serv,
    Cantidad: concept.quantity,
    ClaveUnidad: concept.clave_unidad,
    Unidad: concept.unidad,
    ValorUnitario: concept.unit_price,
    Descripcion: concept.description,
    Importe: concept.subtotal,
    ObjetoImp: concept.tax_object,
    Impuestos: buildOfficialTaxes(concept),
  };
  return concept;
}

function buildOfficialFacturaComRequest(sourceInvoice = {}, receiver = {}, concepts = [], context = {}) {
  const options = extractFacturaComOptions(sourceInvoice, receiver, context);
  const emitterRegimenNormalization = text(context.emitter_regimen_fiscal || sourceInvoice.emitter_regimen_fiscal)
    ? normalizeRegimenFiscal(context.emitter_regimen_fiscal || sourceInvoice.emitter_regimen_fiscal)
    : null;
  const body = {
    Receptor: {
      provider_field_status: options.receptor_uid ? OFFICIAL_DOCS_CONFIRMED : TODO_DOCS_REQUIRED,
      UID: options.receptor_uid,
      RegimenFiscalR: receiver.tax_regime,
    },
    TipoDocumento: options.tipo_documento,
    RegimenFiscal: normalizedOrOriginal(emitterRegimenNormalization, context.emitter_regimen_fiscal || sourceInvoice.emitter_regimen_fiscal),
    Conceptos: concepts.map((concept) => concept.official_fields),
    UsoCFDI: options.uso_cfdi,
    Serie: options.serie,
    FormaPago: options.forma_pago,
    MetodoPago: options.metodo_pago,
    Moneda: options.moneda,
    EnviarCorreo: options.enviar_correo === undefined ? null : options.enviar_correo,
    LugarExpedicion: options.lugar_expedicion,
    Comentarios: options.comentarios,
  };
  const receptorCompatibility = validateReceptorForCfdi({
    rfc: receiver.rfc,
    regimenFiscalReceptor: receiver.tax_regime,
    usoCfdi: options.uso_cfdi,
    clientUid: options.receptor_uid,
  });
  const localConfigErrors = receptorCompatibility.errors || [];
  const localConfigWarnings = receptorCompatibility.warnings || [];
  const normalizationReports = {
    receiver_tax_regime: receiver.sat_field_normalization?.tax_regime || null,
    receiver_cfdi_use: receiver.sat_field_normalization?.cfdi_use || null,
    options_uso_cfdi: safeSatNormalizationReport(options.sat_field_normalization?.uso_cfdi),
    forma_pago: safeSatNormalizationReport(options.sat_field_normalization?.forma_pago),
    metodo_pago: safeSatNormalizationReport(options.sat_field_normalization?.metodo_pago),
    moneda: safeSatNormalizationReport(options.sat_field_normalization?.moneda),
    emitter_regimen_fiscal: safeSatNormalizationReport(emitterRegimenNormalization),
  };
  const normalizationWarnings = Object.values(normalizationReports)
    .filter((item) => item?.ok && item.status === "NORMALIZED")
    .flatMap((item) => item.warnings || ["SAT_DESCRIPTION_NORMALIZED_TO_KEY"]);
  const normalizationErrors = Object.entries(normalizationReports)
    .filter(([, item]) => item && item.ok !== true)
    .map(([field, item]) => `SAT_FIELD_${field}_UNRESOLVED:${item.status}`);

  return {
    provider_field_status: OFFICIAL_DOCS_PARTIAL,
    docs_reference: "data/sandbox/facturacom-official-contract.notes.json",
    endpoint: {
      provider_field_status: OFFICIAL_DOCS_CONFIRMED,
      method: "POST",
      path: "/v4/cfdi40/create",
      environment: PAC_ENVIRONMENTS.SANDBOX,
    },
    body,
    unresolved_fields: [
      !options.receptor_uid && "Receptor.UID requiere cliente creado en Factura.com sandbox",
      !options.tipo_documento && "TipoDocumento debe definirse desde politica de emision antes de live smoke",
      !options.uso_cfdi && "UsoCFDI debe validarse contra receptor y catalogo SAT antes de live smoke",
      !options.serie && "Serie requiere id dado de alta en panel Factura.com sandbox",
      !options.forma_pago && "FormaPago debe capturarse o configurarse antes de live smoke",
      !options.metodo_pago && "MetodoPago debe capturarse o configurarse antes de live smoke",
      !options.moneda && "Moneda debe capturarse o configurarse antes de live smoke",
      !options.lugar_expedicion && "LugarExpedicion debe capturarse o confirmarse antes de live smoke",
      ...normalizationErrors,
      ...localConfigErrors.map((code) => `${code}: ${explainUsoCfdiCompatibilityFailure({
        rfc: receiver.rfc,
        regimenFiscalReceptor: receiver.tax_regime,
        usoCfdi: options.uso_cfdi,
        clientUid: options.receptor_uid,
      })}`),
    ].filter(Boolean),
    local_config_errors: localConfigErrors,
    local_config_warnings: Array.from(new Set([...localConfigWarnings, ...normalizationWarnings])),
    receptor_compatibility: buildSafeReceptorCompatibilityReport(receptorCompatibility),
    sat_field_normalization_report: normalizationReports,
  };
}

function mapCanonicalInvoiceToFacturaComPayload(canonicalInvoice, context = {}) {
  const sourceInvoice = clone(canonicalInvoice);
  const environment = assertSandbox(context.environment || sourceInvoice?.pac_environment);
  const validation = validateCanonicalInvoiceDocument(sourceInvoice || {}, { productionAuthorized: false });
  if (!validation.ok) {
    fail("CanonicalInvoiceDocument invalido para Factura.com mapper", "FACTURA_COM_CANONICAL_INVOICE_INVALID", {
      errors: validation.errors,
    });
  }

  const receiver = mapCanonicalReceiverToFacturaComReceiver(extractReceiver(sourceInvoice, context));
  const lineItems = extractLineItems(sourceInvoice, context);
  if (lineItems.length === 0) {
    fail("line_items requeridos para payload Factura.com", "FACTURA_COM_LINE_ITEMS_REQUIRED");
  }

  const concepts = lineItems.map(mapCanonicalLineItemToFacturaComConcept);
  const taxes = mapCanonicalTaxesToFacturaComTaxes(sourceInvoice.taxes || context.canonicalDraft?.totals?.taxes || {});
  const idempotencyKey = extractIdempotencyKey(context);

  return {
    schema_version: SCHEMA_VERSION,
    provider: PROVIDER,
    environment,
    provider_field_status: TODO_DOCS_REQUIRED,
    cfdi_version: "4.0",
    idempotency_key: idempotencyKey,
    source_invoice_id: requireText(sourceInvoice.internal_invoice_id, "canonical_invoice.internal_invoice_id"),
    internal_invoice_id: sourceInvoice.internal_invoice_id,
    draft_id: sourceInvoice.draft_id,
    receiver,
    concepts,
    official_request: buildOfficialFacturaComRequest(sourceInvoice, receiver, concepts, context),
    taxes,
    totals: {
      subtotal: number(sourceInvoice.subtotal, 0),
      total: number(sourceInvoice.total, 0),
    },
    metadata: {
      source: "AsistenteCFDI_BOT",
      mapper: "factura-com-payload-mapper.mock.v1",
      canonical_status: sourceInvoice.status,
      payment_status: sourceInvoice.payment_status,
      review_status: sourceInvoice.review_status,
      pac_provider: sourceInvoice.pac_provider || null,
      docs_required: true,
    },
    requires_human_review: true,
  };
}

function assertFacturaComSandboxPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, provider: PROVIDER, environment: PAC_ENVIRONMENTS.SANDBOX, errors: ["payload debe ser objeto"] };
  }
  if (payload.provider !== PROVIDER) errors.push("provider debe ser factura_com");
  if (payload.environment !== PAC_ENVIRONMENTS.SANDBOX) errors.push("environment debe ser SANDBOX");
  if (payload.schema_version !== SCHEMA_VERSION) errors.push("schema_version inesperado");
  if (!payload.provider_field_status) errors.push("provider_field_status requerido");
  if (!payload.internal_invoice_id) errors.push("internal_invoice_id requerido");
  if (!payload.receiver?.rfc) errors.push("receiver.rfc requerido");
  if (!payload.receiver?.tax_regime) errors.push("receiver.tax_regime requerido");
  if (!payload.receiver?.fiscal_zip) errors.push("receiver.fiscal_zip requerido");
  if (!Array.isArray(payload.concepts) || payload.concepts.length === 0) errors.push("concepts requeridos");
  for (const [index, concept] of (payload.concepts || []).entries()) {
    if (!concept.description) errors.push(`concepts[${index}].description requerido`);
    if (!concept.clave_prod_serv) errors.push(`concepts[${index}].clave_prod_serv requerido`);
    if (!concept.clave_unidad) errors.push(`concepts[${index}].clave_unidad requerido`);
    if (!concept.tax_object) errors.push(`concepts[${index}].tax_object requerido`);
    if (concept.requires_human_review !== true) errors.push(`concepts[${index}].requires_human_review debe ser true`);
    if (concept.official_fields?.ClaveProdServ !== concept.clave_prod_serv) errors.push(`concepts[${index}].official_fields.ClaveProdServ inconsistente`);
    if (concept.official_fields?.ClaveUnidad !== concept.clave_unidad) errors.push(`concepts[${index}].official_fields.ClaveUnidad inconsistente`);
  }
  if (!payload.official_request?.body?.Conceptos?.length) errors.push("official_request.body.Conceptos requerido");
  if (payload.requires_human_review !== true) errors.push("requires_human_review debe ser true");
  return {
    ok: errors.length === 0,
    provider: PROVIDER,
    environment: PAC_ENVIRONMENTS.SANDBOX,
    errors,
  };
}

function normalizeFacturaComSuccessResponse(response = {}, context = {}) {
  const environment = assertSandbox(context.environment || response.environment);
  const operation = text(context.operation || response.operation || "stampSandbox");
  const status = text(context.status || response.status)
    || (operation === "cancelInvoice" ? INVOICE_STATUSES.SANDBOX_CANCELLED : INVOICE_STATUSES.SANDBOX_STAMPED);
  const result = {
    ok: true,
    provider: PROVIDER,
    environment,
    operation,
    status,
    pac_invoice_id: text(response.pac_invoice_id || response.invoice_id || response.id),
    uuid: text(response.uuid || response.folio_fiscal),
    serie: text(response.serie),
    folio: text(response.folio),
    xml_available: response.xml_available === true,
    pdf_available: response.pdf_available === true,
    normalized_errors: [],
    normalized_warnings: Array.isArray(response.warnings) ? clone(response.warnings) : [],
    raw: clone(response),
    requires_human_review: true,
  };
  const validation = validateCanonicalPacResult(result);
  if (!validation.ok) {
    fail("CanonicalPacResult success invalido", "FACTURA_COM_SUCCESS_NORMALIZATION_INVALID", {
      errors: validation.errors,
    });
  }
  return result;
}

function normalizeFacturaComErrorResponse(error = {}, context = {}) {
  const source = error instanceof Error ? error : error || {};
  const response = source.response || {};
  const data = response.data || source.data || source.raw || {};
  const operation = text(context.operation || source.operation || data.operation || "stampSandbox");
  const status = text(context.status || source.status || data.status)
    || (operation === "cancelInvoice" ? INVOICE_STATUSES.CANCEL_FAILED : "PAC_ERROR");
  const code = text(source.code || data.code || response.statusText) || "FACTURA_COM_SANDBOX_MOCK_ERROR";
  const message = text(source.message || data.message || data.error) || "Error mock normalizado de Factura.com sandbox.";
  const result = {
    ok: false,
    provider: PROVIDER,
    environment: PAC_ENVIRONMENTS.SANDBOX,
    operation,
    status,
    pac_invoice_id: text(data.pac_invoice_id || data.invoice_id || source.pac_invoice_id),
    uuid: text(data.uuid || source.uuid),
    serie: text(data.serie || source.serie),
    folio: text(data.folio || source.folio),
    xml_available: false,
    pdf_available: false,
    normalized_errors: [{ code, message, field: text(data.field || source.field), retryable: source.retryable === true }],
    normalized_warnings: Array.isArray(data.warnings) ? clone(data.warnings) : [],
    raw: clone(data || source),
    requires_human_review: true,
  };
  const validation = validateCanonicalPacResult(result);
  if (!validation.ok) {
    fail("CanonicalPacResult error invalido", "FACTURA_COM_ERROR_NORMALIZATION_INVALID", {
      errors: validation.errors,
    });
  }
  return result;
}

module.exports = {
  PROVIDER,
  SCHEMA_VERSION,
  OFFICIAL_DOCS_CONFIRMED,
  OFFICIAL_DOCS_PARTIAL,
  TODO_DOCS_REQUIRED,
  FacturaComPayloadMapperError,
  assertFacturaComSandboxPayload,
  mapCanonicalInvoiceToFacturaComPayload,
  mapCanonicalLineItemToFacturaComConcept,
  mapCanonicalReceiverToFacturaComReceiver,
  mapCanonicalTaxesToFacturaComTaxes,
  normalizeFacturaComErrorResponse,
  normalizeFacturaComSuccessResponse,
};
