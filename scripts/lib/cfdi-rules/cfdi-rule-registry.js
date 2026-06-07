const { CFDI_RULE_SETS, CFDI_RULE_SEVERITIES } = require("./cfdi-rule-enums");
const { assertCfdiRuleRegistry } = require("./cfdi-rule-contract");

const SOURCE_DOCUMENT = "Anexo_20_Guia_de_llenado_CFDI.pdf";

function rule(rule_id, applies_to, condition, expected, severity, human_message, developer_message, pageHint) {
  return {
    rule_id,
    rule_set: CFDI_RULE_SETS.CFDI_40_CORE,
    version: "2026-06-03.foundation",
    source_document: SOURCE_DOCUMENT,
    source_page_hint: pageHint || "Anexo 20 CFDI 4.0, seccion de llenado relacionada.",
    applies_to,
    condition,
    expected,
    severity,
    human_message,
    developer_message,
    provider_independent: true,
  };
}

const CFDI40_CORE_RULES = Object.freeze([
  rule(
    "CFDI40_PAYMENT_PPD_REQUIRES_FORMA99",
    "comprobante",
    "metodo_pago = PPD",
    "forma_pago = 99",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "Si el pago es PPD, la forma de pago debe ser 99 Por definir.",
    "When metodo_pago is PPD, forma_pago must be 99.",
  ),
  rule(
    "CFDI40_PAYMENT_PUE_REQUIRES_ACTUAL_PAYMENT_METHOD",
    "comprobante",
    "metodo_pago = PUE",
    "forma_pago presente y distinta de 99",
    CFDI_RULE_SEVERITIES.WARNING_OR_BLOCKER,
    "Si el pago es PUE, se debe indicar la forma de pago real.",
    "When metodo_pago is PUE, forma_pago must exist and not be 99.",
  ),
  rule(
    "CFDI40_RECEPTOR_USO_CFDI_MATCHES_REGIMEN",
    "receptor",
    "uso_cfdi presente",
    "uso_cfdi permitido para regimen_fiscal_receptor segun c_UsoCFDI",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "El uso CFDI debe ser compatible con el regimen fiscal del receptor.",
    "Validate uso_cfdi against receptor regimen using SAT c_UsoCFDI catalog.",
  ),
  rule(
    "CFDI40_OBJETOIMP_02_REQUIRES_CONCEPT_TAXES",
    "concepto",
    "concepto.objeto_imp = 02",
    "concepto.impuestos requerido",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "Si el concepto es objeto de impuesto, debe incluir desglose de impuestos.",
    "ObjetoImp 02 requires concept tax breakdown.",
  ),
  rule(
    "CFDI40_OBJETOIMP_01_03_NO_CONCEPT_TAX_BREAKDOWN",
    "concepto",
    "objeto_imp in 01,03",
    "sin desglose de impuestos por concepto",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "Si el concepto no es objeto de impuesto, no debe llevar desglose de impuestos.",
    "ObjetoImp 01/03 must not include concept tax breakdown.",
  ),
  rule(
    "CFDI40_CLAVEPRODSERV_MUST_EXIST_OR_EXTREME_FALLBACK",
    "concepto",
    "clave_prod_serv no encontrada",
    "solo 01010101 como fallback extremo con justificacion humana",
    CFDI_RULE_SEVERITIES.WARNING,
    "La clave producto/servicio debe existir en catalogo SAT; 01010101 solo con justificacion humana.",
    "Product/service key must exist. 01010101 is an extreme fallback requiring human justification.",
  ),
  rule(
    "CFDI40_TASAOCUOTA_SIX_DECIMALS",
    "impuestos",
    "tasa_o_cuota presente",
    "formato decimal SAT, seis decimales para tasa fija",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "La tasa o cuota debe usar el formato SAT esperado.",
    "Validate tasa_o_cuota format, fixed rates with six decimals.",
  ),
  rule(
    "CFDI40_NO_NEGATIVE_NUMBERS",
    "totales",
    "importe < 0",
    "importes no negativos",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "Los importes negativos no son validos en el CFDI.",
    "Amounts must not be negative.",
  ),
  rule(
    "CFDI40_ROUND_AT_TOTALS",
    "totales",
    "calculo de impuestos/totales",
    "conservar precision y redondear al final",
    CFDI_RULE_SEVERITIES.WARNING,
    "Los calculos deben conservar precision y redondearse al total final.",
    "Keep precision and round at final totals.",
  ),
  rule(
    "CFDI40_TIPO_COMPROBANTE_P_NO_PAYMENT_FIELDS",
    "comprobante",
    "tipo_comprobante = P",
    "sin forma_pago/metodo_pago y subtotal/total cero",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "Un comprobante de pago no debe llevar forma/metodo de pago y sus totales deben ser cero.",
    "Payment complement comprobante P must not include payment fields and subtotal/total must be zero.",
  ),
  rule(
    "CFDI40_TIPO_COMPROBANTE_T_NO_PAYMENT_FIELDS",
    "comprobante",
    "tipo_comprobante = T",
    "sin forma_pago/metodo_pago y subtotal/total cero",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "Un comprobante de traslado no debe llevar forma/metodo de pago y sus totales deben ser cero.",
    "Transfer comprobante T must not include payment fields and subtotal/total must be zero.",
  ),
  rule(
    "CFDI40_FOREIGN_GENERIC_RECEPTOR_RULE",
    "receptor",
    "receptor_rfc = XEXX010101000",
    "regimen_fiscal_receptor = 616 y uso_cfdi = S01",
    CFDI_RULE_SEVERITIES.BLOCKER,
    "El receptor extranjero generico requiere regimen 616 y uso S01.",
    "Generic foreign RFC XEXX010101000 requires receptor regimen 616 and uso S01.",
  ),
]);

function getCfdi40CoreRules() {
  return [...CFDI40_CORE_RULES];
}

function validateCfdi40CoreRuleRegistry() {
  return assertCfdiRuleRegistry(getCfdi40CoreRules());
}

module.exports = {
  CFDI40_CORE_RULES,
  getCfdi40CoreRules,
  validateCfdi40CoreRuleRegistry,
};
