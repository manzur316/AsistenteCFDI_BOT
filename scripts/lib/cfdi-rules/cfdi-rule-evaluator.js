const { CFDI_RULE_RESULT_TYPES, CFDI_RULE_SEVERITIES } = require("./cfdi-rule-enums");
const { createRuleResult } = require("./cfdi-rule-result");

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function field(invoice, ...paths) {
  for (const path of paths) {
    const value = String(path).split(".").reduce((current, key) => current?.[key], invoice);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function lineItems(invoice) {
  return asArray(invoice?.line_items || invoice?.conceptos || invoice?.concepts);
}

function taxes(line) {
  return asArray(line?.taxes || line?.impuestos);
}

function severityToType(severity) {
  if (severity === CFDI_RULE_SEVERITIES.BLOCKER) return CFDI_RULE_RESULT_TYPES.BLOCKER;
  if (severity === CFDI_RULE_SEVERITIES.SUGGESTION) return CFDI_RULE_RESULT_TYPES.SUGGESTION;
  return CFDI_RULE_RESULT_TYPES.WARNING;
}

function fail(rule, details = {}, overrideType = null) {
  return createRuleResult(rule, overrideType || severityToType(rule.severity), rule.human_message, details);
}

function pass(rule) {
  return createRuleResult(rule, CFDI_RULE_RESULT_TYPES.PASS, "PASS", {});
}

const FALLBACK_USO_REGIMEN = Object.freeze({
  G01: ["601", "603", "612", "626"],
  G03: ["601", "603", "605", "606", "612", "626"],
  P01: ["601", "603", "612", "626"],
  S01: ["616"],
});

function usoAllowedForRegimen(uso, regimen, catalogIndex = {}) {
  if (!uso || !regimen) return true;
  const entry = catalogIndex.uso_cfdi_by_key?.[uso] || catalogIndex.c_UsoCFDI?.[uso];
  const attrs = entry?.attributes || entry || {};
  const raw = attrs.regimenes || attrs.RegimenFiscalReceptor || attrs["Regimen Fiscal Receptor"] || attrs.regimen_fiscal_receptor;
  if (raw) return String(raw).includes(String(regimen));
  if (FALLBACK_USO_REGIMEN[uso]) return FALLBACK_USO_REGIMEN[uso].includes(String(regimen));
  return true;
}

function keyExists(catalogIndex, catalogName, key) {
  if (!key) return false;
  const byName = catalogIndex[catalogName] || {};
  if (byName[key]) return true;
  const aliases = {
    c_ClaveProdServ: "clave_prod_serv_by_key",
    c_ClaveUnidad: "clave_unidad_by_key",
    c_TasaOCuota: "tasa_o_cuota_by_key",
  };
  return Boolean(catalogIndex[aliases[catalogName]]?.[key]);
}

function evaluateSingleRule(rule, invoice = {}, context = {}) {
  const metodoPago = text(field(invoice, "metodo_pago", "metodoPago", "payment.method"));
  const formaPago = text(field(invoice, "forma_pago", "formaPago", "payment.form"));
  const tipoComprobante = text(field(invoice, "tipo_comprobante", "tipoDeComprobante", "type"));
  const subtotal = number(field(invoice, "subtotal", "totals.subtotal"));
  const total = number(field(invoice, "total", "totals.total"));
  const receptorRfc = text(field(invoice, "receptor.rfc", "receiver.rfc", "receptor_rfc"));
  const regimenReceptor = text(field(invoice, "receptor.regimen_fiscal", "receiver.tax_regime", "regimen_fiscal_receptor"));
  const usoCfdi = text(field(invoice, "receptor.uso_cfdi", "receiver.uso_cfdi", "uso_cfdi"));
  const catalogIndex = context.catalogIndex || {};

  switch (rule.rule_id) {
    case "CFDI40_PAYMENT_PPD_REQUIRES_FORMA99":
      return metodoPago === "PPD" && formaPago !== "99" ? fail(rule, { metodo_pago: metodoPago, forma_pago: formaPago }) : pass(rule);
    case "CFDI40_PAYMENT_PUE_REQUIRES_ACTUAL_PAYMENT_METHOD":
      return metodoPago === "PUE" && (!formaPago || formaPago === "99")
        ? fail(rule, { metodo_pago: metodoPago, forma_pago: formaPago }, CFDI_RULE_RESULT_TYPES.WARNING)
        : pass(rule);
    case "CFDI40_RECEPTOR_USO_CFDI_MATCHES_REGIMEN":
      return usoCfdi && regimenReceptor && !usoAllowedForRegimen(usoCfdi, regimenReceptor, catalogIndex)
        ? fail(rule, { uso_cfdi: usoCfdi, regimen_fiscal_receptor: regimenReceptor })
        : pass(rule);
    case "CFDI40_OBJETOIMP_02_REQUIRES_CONCEPT_TAXES": {
      const offenders = lineItems(invoice).filter((line) => text(line.tax_object || line.objeto_imp) === "02" && taxes(line).length === 0);
      return offenders.length ? fail(rule, { line_count: offenders.length }) : pass(rule);
    }
    case "CFDI40_OBJETOIMP_01_03_NO_CONCEPT_TAX_BREAKDOWN": {
      const offenders = lineItems(invoice).filter((line) => ["01", "03"].includes(text(line.tax_object || line.objeto_imp)) && taxes(line).length > 0);
      return offenders.length ? fail(rule, { line_count: offenders.length }) : pass(rule);
    }
    case "CFDI40_CLAVEPRODSERV_MUST_EXIST_OR_EXTREME_FALLBACK": {
      const offenders = lineItems(invoice).filter((line) => {
        const key = text(line.product_service_key || line.clave_prod_serv);
        if (!key) return true;
        if (key === "01010101") return !line.human_justification;
        return Object.keys(catalogIndex).length > 0 && !keyExists(catalogIndex, "c_ClaveProdServ", key);
      });
      return offenders.length ? fail(rule, { line_count: offenders.length }, CFDI_RULE_RESULT_TYPES.WARNING) : pass(rule);
    }
    case "CFDI40_TASAOCUOTA_SIX_DECIMALS": {
      const rates = lineItems(invoice).flatMap((line) => taxes(line).map((tax) => text(tax.rate ?? tax.tasa_o_cuota ?? tax.tasaOCuota)).filter(Boolean));
      const bad = rates.filter((rate) => !/^\d+\.\d{6}$/.test(rate) && !/^[01](?:\.0+)?$/.test(rate));
      return bad.length ? fail(rule, { bad_rates: bad }) : pass(rule);
    }
    case "CFDI40_NO_NEGATIVE_NUMBERS": {
      const values = [
        subtotal,
        total,
        ...lineItems(invoice).flatMap((line) => [number(line.quantity), number(line.unit_price), number(line.subtotal)]),
      ].filter((value) => value !== null);
      return values.some((value) => value < 0) ? fail(rule, {}) : pass(rule);
    }
    case "CFDI40_ROUND_AT_TOTALS":
      return pass(rule);
    case "CFDI40_TIPO_COMPROBANTE_P_NO_PAYMENT_FIELDS":
      return tipoComprobante === "P" && (formaPago || metodoPago || subtotal !== 0 || total !== 0)
        ? fail(rule, { tipo_comprobante: tipoComprobante, forma_pago: formaPago, metodo_pago: metodoPago, subtotal, total })
        : pass(rule);
    case "CFDI40_TIPO_COMPROBANTE_T_NO_PAYMENT_FIELDS":
      return tipoComprobante === "T" && (formaPago || metodoPago || subtotal !== 0 || total !== 0)
        ? fail(rule, { tipo_comprobante: tipoComprobante, forma_pago: formaPago, metodo_pago: metodoPago, subtotal, total })
        : pass(rule);
    case "CFDI40_FOREIGN_GENERIC_RECEPTOR_RULE":
      return receptorRfc === "XEXX010101000" && (regimenReceptor !== "616" || usoCfdi !== "S01")
        ? fail(rule, { receptor_rfc: receptorRfc, regimen_fiscal_receptor: regimenReceptor, uso_cfdi: usoCfdi })
        : pass(rule);
    default:
      return createRuleResult(rule, CFDI_RULE_RESULT_TYPES.WARNING, "Regla sin evaluador implementado.", {});
  }
}

module.exports = {
  evaluateSingleRule,
  field,
  keyExists,
  usoAllowedForRegimen,
};
