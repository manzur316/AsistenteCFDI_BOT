const {
  INVOICE_STATUSES,
  REVIEW_STATUSES,
  validateCanonicalDraft,
} = require("./canonical-cfdi-contracts");
const { normalizeClientFiscalFields } = require("./clients/client-fiscal-field-normalizer");
const {
  normalizeClaveUnidad,
  normalizeObjetoImp,
} = require("./sat-catalogs/sat-field-normalizer");

function nowIso() {
  return new Date().toISOString();
}

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function compactWarnings(items) {
  return Array.from(new Set(asArray(items).map(text).filter(Boolean)));
}

function normalizeBlocker(blocker) {
  if (!blocker) return null;
  if (typeof blocker === "string") return { type: blocker };
  if (typeof blocker === "object") return blocker;
  return { type: String(blocker) };
}

function conceptField(concept, names) {
  for (const name of names) {
    const value = name.split(".").reduce((current, key) => current?.[key], concept);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function buildCanonicalReceiverFromClient(client = {}) {
  const warnings = [];
  const normalized = normalizeClientFiscalFields(client);
  const normalizedClient = normalized.normalized_client || client;
  const receiver = {
    client_id: text(normalizedClient.client_id || normalizedClient.id),
    display_name: text(normalizedClient.display_name || normalizedClient.name || normalizedClient.razon_social),
    rfc: text(normalizedClient.rfc),
    legal_name: text(normalizedClient.legal_name || normalizedClient.razon_social || normalizedClient.name),
    tax_regime: text(normalizedClient.tax_regime || normalizedClient.regimen_fiscal),
    cfdi_use: text(normalizedClient.cfdi_use || normalizedClient.uso_cfdi || normalizedClient.usoCFDI || normalizedClient.uso_cfdi_default),
    uso_cfdi: text(normalizedClient.uso_cfdi || normalizedClient.cfdi_use || normalizedClient.usoCFDI || normalizedClient.uso_cfdi_default),
    fiscal_zip: text(normalizedClient.fiscal_zip || normalizedClient.codigo_postal_fiscal || normalizedClient.cp),
    person_type: text(normalizedClient.person_type || normalizedClient.tipo_persona),
    fiscal_profile_id: text(normalizedClient.fiscal_profile_id),
    fiscal_profile_source: text(normalizedClient.fiscal_profile_source),
    fiscal_profile_validation: normalizedClient.fiscal_profile_validation || null,
    validated_by_human: normalizedClient.validated_by_human === true,
    validation_warnings: compactWarnings([...(normalizedClient.validation_warnings || []), ...(normalized.warnings || [])]),
    fiscal_normalization_report: normalized.normalization_report,
    future_case: normalizedClient.future_case === true,
  };

  if (!normalized.ok) warnings.push(...normalized.blockers.map((blocker) => `client_fiscal_normalization_${blocker}`));
  if (!receiver.validated_by_human) warnings.push("cliente_no_validado_por_humano");
  if (!receiver.rfc) warnings.push("rfc_faltante");
  if (!receiver.tax_regime) warnings.push("regimen_fiscal_faltante");
  if (!receiver.fiscal_zip) warnings.push("codigo_postal_fiscal_faltante");
  if (receiver.future_case) warnings.push("future_case_no_listo_para_pac");
  receiver.validation_warnings = compactWarnings([...receiver.validation_warnings, ...warnings]);
  return receiver;
}

function buildCanonicalTaxBreakdown(calcOrTaxSummary = {}) {
  const calc = calcOrTaxSummary || {};
  const ivaTransferred = number(calc.iva_transferred ?? calc.iva_amount ?? calc.iva_trasladado, 0);
  const ivaRetained = number(calc.iva_retained ?? calc.iva_retention_amount ?? calc.iva_retenido, 0);
  const isrRetained = number(calc.isr_retained ?? calc.isr_retention_amount ?? calc.isr_retenido, 0);
  const ieps = number(calc.ieps, 0);
  return {
    iva_transferred: ivaTransferred,
    iva_retained: ivaRetained,
    isr_retained: isrRetained,
    ieps,
    total_taxes_transferred: number(calc.total_taxes_transferred, ivaTransferred + ieps),
    total_taxes_retained: number(calc.total_taxes_retained, ivaRetained + isrRetained),
    warnings: compactWarnings(calc.warnings || calc.tax_warnings || []),
  };
}

function taxArrayFromBreakdown(breakdown) {
  const taxes = [];
  if (number(breakdown.iva_transferred) > 0) {
    taxes.push({ type: "IVA", direction: "TRANSFERRED", amount: number(breakdown.iva_transferred), rate: 0.16 });
  }
  if (number(breakdown.iva_retained) > 0) {
    taxes.push({ type: "IVA", direction: "RETAINED", amount: number(breakdown.iva_retained) });
  }
  if (number(breakdown.isr_retained) > 0) {
    taxes.push({ type: "ISR", direction: "RETAINED", amount: number(breakdown.isr_retained) });
  }
  if (number(breakdown.ieps) > 0) {
    taxes.push({ type: "IEPS", direction: "TRANSFERRED", amount: number(breakdown.ieps) });
  }
  return taxes;
}

function buildCanonicalLineItemFromConcept(concept = {}, amountContext = {}) {
  const actualConcept = concept.concept || concept;
  const lineNumber = number(amountContext.line_number ?? concept.line_number, 1);
  const quantity = number(amountContext.quantity ?? concept.quantity, 1) || 1;
  const subtotal = number(
    amountContext.subtotal ?? concept.subtotal ?? amountContext.amount ?? concept.amount,
    number(amountContext.unit_price ?? concept.unit_price ?? concept.precio_unitario, 0) * quantity,
  );
  const unitPrice = number(amountContext.unit_price ?? concept.unit_price ?? concept.precio_unitario, quantity ? subtotal / quantity : subtotal);
  const breakdown = buildCanonicalTaxBreakdown({
    iva_amount: amountContext.iva_amount ?? concept.iva_amount,
    iva_retention_amount: amountContext.iva_retention_amount ?? concept.iva_retention_amount,
    isr_retention_amount: amountContext.isr_retention_amount ?? concept.isr_retention_amount,
    ieps: amountContext.ieps ?? concept.ieps,
    warnings: amountContext.tax_warnings ?? concept.tax_warnings,
  });

  const rawUnitKey = text(conceptField(actualConcept, ["clave_unidad", "sat.unit_key", "unit_key"]));
  const rawUnitName = text(conceptField(actualConcept, ["unidad", "sat.unit", "unit_name"]));
  const unitNormalization = normalizeClaveUnidad(rawUnitKey || rawUnitName, {
    context: concept.tipo || concept.item_type || concept.operacion || concept.operation_type,
  });
  const rawTaxObject = text(conceptField(actualConcept, ["objeto_imp", "tax_object"])) || "02";
  const taxObjectNormalization = normalizeObjetoImp(rawTaxObject);
  const normalizedWarnings = [];
  if (unitNormalization.ok && unitNormalization.status === "NORMALIZED") normalizedWarnings.push("clave_unidad_normalizada_a_clave_sat");
  if (taxObjectNormalization.ok && taxObjectNormalization.status === "NORMALIZED") normalizedWarnings.push("objeto_imp_normalizado_a_clave_sat");

  return {
    line_id: text(amountContext.line_id || concept.line_id) || `LINE-${String(lineNumber).padStart(3, "0")}`,
    description: text(conceptField(actualConcept, [
      "concepto_factura",
      "concepto_sugerido",
      "invoice_concept",
      "concepto_factura_recomendado",
      "description",
    ])),
    quantity,
    unit_key: unitNormalization.ok ? unitNormalization.key : rawUnitKey,
    unit_name: rawUnitName || unitNormalization.description,
    product_service_key: text(conceptField(actualConcept, ["clave_prod_serv", "sat.product_service_key", "product_service_key"])),
    unit_price: unitPrice,
    subtotal,
    tax_object: taxObjectNormalization.ok ? taxObjectNormalization.key : rawTaxObject,
    taxes: Array.isArray(concept.taxes) ? concept.taxes : taxArrayFromBreakdown(breakdown),
    activity_scope: amountContext.activity_scope || concept.activity_scope || {
      family: concept.familia || concept.family || concept.subfamily || null,
      operation_type: concept.operacion || concept.operation_type || concept.item_type || null,
    },
    source_confidence: number(amountContext.source_confidence ?? concept.source_confidence ?? concept.confidence, 0),
    requires_human_review: true,
    concept_id: text(actualConcept.id || concept.concept_id),
    warnings: compactWarnings([...(amountContext.warnings || []), ...(concept.warnings || []), ...normalizedWarnings]),
  };
}

function extractSource(input = {}) {
  return input.preview_draft || input.draft || input.bot_preview || input;
}

function lineItemsFromSource(source) {
  const sourceLines = Array.isArray(source.line_items) ? source.line_items : [];
  if (sourceLines.length > 0) {
    return sourceLines.map((line, index) => buildCanonicalLineItemFromConcept(line.concept || line, {
      ...line,
      line_number: line.line_number || index + 1,
    }));
  }
  if (source.concept && (source.amount !== undefined || source.subtotal !== undefined || source.total !== undefined || source.calc)) {
    return [buildCanonicalLineItemFromConcept(source.concept, {
      amount: source.subtotal ?? source.amount,
      subtotal: source.subtotal ?? source.amount,
      iva_amount: source.iva_amount ?? source.calc?.iva_amount,
      iva_retention_amount: source.iva_retention_amount ?? source.calc?.iva_retention_amount,
      isr_retention_amount: source.isr_retention_amount ?? source.calc?.isr_retention_amount,
      source_confidence: source.decision_confidence ?? source.confidence,
      line_number: 1,
    })];
  }
  return [];
}

function totalsFromSource(source, lineItems) {
  const taxBreakdown = buildCanonicalTaxBreakdown(source.taxes || source.tax_summary || source.calc || source);
  const subtotal = number(
    source.subtotal,
    lineItems.reduce((sum, line) => sum + number(line.subtotal), 0),
  );
  const total = number(
    source.total,
    subtotal + number(taxBreakdown.total_taxes_transferred) - number(taxBreakdown.total_taxes_retained),
  );
  return {
    subtotal,
    taxes: taxBreakdown,
    total,
  };
}

function buildCanonicalDraftFromBotPreview(input = {}) {
  const source = extractSource(input);
  const createdAt = text(source.created_at || input.created_at) || nowIso();
  const updatedAt = text(source.updated_at || input.updated_at) || createdAt;
  const receiver = buildCanonicalReceiverFromClient(source.client || source.client_snapshot || input.client || {});
  const blockers = asArray(source.blockers).map(normalizeBlocker).filter(Boolean);
  const lineItems = lineItemsFromSource(source);
  const fiscalWarnings = compactWarnings([
    ...(source.fiscal_warnings || []),
    ...(source.tax_summary?.warnings || []),
    ...receiver.validation_warnings,
  ]);

  if (lineItems.length === 0) blockers.push({ type: "line_items_faltantes" });
  for (const [index, line] of lineItems.entries()) {
    if (!line.description) blockers.push({ type: "line_description_faltante", line_number: index + 1 });
    if (!line.product_service_key) blockers.push({ type: "clave_prod_serv_faltante", line_number: index + 1 });
    if (!line.unit_key) blockers.push({ type: "clave_unidad_faltante", line_number: index + 1 });
  }
  if (!receiver.validated_by_human) blockers.push({ type: "cliente_no_validado" });
  if (!receiver.rfc) blockers.push({ type: "rfc_faltante" });
  if (!receiver.tax_regime) blockers.push({ type: "regimen_fiscal_faltante" });
  if (!receiver.fiscal_zip) blockers.push({ type: "codigo_postal_fiscal_faltante" });

  const confirmedPresent = typeof source.confirmed_by_human === "boolean" || typeof input.confirmed_by_human === "boolean";
  const confirmedExplicit = source.confirmed_by_human === true || input.confirmed_by_human === true;
  if (!confirmedPresent) {
    blockers.push({ type: "confirmed_by_human_no_explicito" });
    fiscalWarnings.push("confirmed_by_human_no_explicito");
  }
  const reviewStatus = blockers.length > 0
    ? REVIEW_STATUSES.NEEDS_REVIEW
    : confirmedExplicit
      ? REVIEW_STATUSES.APPROVED_BY_HUMAN
      : REVIEW_STATUSES.NEEDS_REVIEW;

  const canonicalDraft = {
    draft_id: text(source.draft_id || input.draft_id),
    emitter_id: text(source.emitter_id || input.emitter_id),
    client_id: receiver.client_id,
    source_channel: text(source.source_channel || input.source_channel || "TELEGRAM"),
    source_message_id: text(source.source_message_id || source.message_id || source.update_id || input.source_message_id || input.message_id),
    original_text: text(source.original_text || source.message_original || input.original_text || input.text),
    status: INVOICE_STATUSES.DRAFT,
    review_status: reviewStatus,
    confirmed_by_human: confirmedExplicit,
    requires_human_review: true,
    created_at: createdAt,
    updated_at: updatedAt,
    fiscal_warnings: fiscalWarnings,
    blockers,
    line_items: lineItems,
    totals: totalsFromSource(source, lineItems),
    receiver,
    metadata: {
      source: "AsistenteCFDI_BOT",
      builder: "canonical-draft-builder.v1",
      ready_to_copy: source.ready_to_copy === true,
      action: source.action || source.accion_n8n || null,
    },
  };

  canonicalDraft.contract_validation = validateCanonicalDraft(canonicalDraft);
  canonicalDraft.ready_for_pac = assertCanonicalDraftReadyForPac(canonicalDraft).ok;
  return canonicalDraft;
}

function assertCanonicalDraftReadyForPac(canonicalDraft) {
  const validation = validateCanonicalDraft(canonicalDraft);
  const errors = [...validation.errors];
  const blockers = asArray(canonicalDraft?.blockers);
  if (canonicalDraft?.confirmed_by_human !== true) errors.push("confirmed_by_human requerido para PAC");
  if (canonicalDraft?.requires_human_review !== true) errors.push("requires_human_review debe ser true");
  if (blockers.length > 0) errors.push("draft_con_blockers_no_listo_para_pac");
  if (canonicalDraft?.receiver?.validated_by_human !== true) errors.push("cliente_validado_por_humano_requerido");
  if (canonicalDraft?.review_status !== REVIEW_STATUSES.APPROVED_BY_HUMAN) errors.push("review_status debe ser APPROVED_BY_HUMAN");
  return {
    ok: errors.length === 0,
    errors,
    warnings: validation.warnings,
    contract_validation: validation,
  };
}

module.exports = {
  buildCanonicalDraftFromBotPreview,
  buildCanonicalLineItemFromConcept,
  buildCanonicalReceiverFromClient,
  buildCanonicalTaxBreakdown,
  assertCanonicalDraftReadyForPac,
};
