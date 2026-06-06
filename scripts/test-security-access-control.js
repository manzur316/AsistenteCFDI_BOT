const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  ACTIONS,
  ROLES,
  buildSecurityEvent,
  canPerformAction,
  isSensitiveAction,
  normalizeRole,
  sanitizeSensitivePayload,
  validateAuthorizedUser,
} = require("./lib/security-access-control");

const root = path.resolve(__dirname, "..");
const sqlPath = path.join(root, "sql", "005_security_access_control.sql");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function user(role, overrides = {}) {
  return {
    user_id: `USER-${role}`,
    telegram_chat_id: "chat-demo",
    telegram_user_id: "telegram-user-demo",
    display_name: "Usuario Demo",
    role,
    enabled: true,
    ...overrides,
  };
}

check("sql_schema_exists_without_real_users", () => {
  const sql = fs.readFileSync(sqlPath, "utf8");
  assert(sql.includes("CREATE TABLE IF NOT EXISTS cfdi_authorized_users"));
  assert(sql.includes("CREATE TABLE IF NOT EXISTS cfdi_security_events"));
  assert(sql.includes("CREATE TABLE IF NOT EXISTS cfdi_sensitive_action_log"));
  assert(!/\bINSERT\s+INTO\s+cfdi_authorized_users\b/i.test(sql));
  return "schema only";
});

check("normalize_role", () => {
  assert.strictEqual(normalizeRole("owner"), ROLES.OWNER);
  assert.strictEqual(normalizeRole(" ACCOUNTANT_READONLY "), ROLES.ACCOUNTANT_READONLY);
  assert.strictEqual(normalizeRole("root"), null);
  return "roles";
});

check("usuario_inexistente_no_autorizado", () => {
  const validation = validateAuthorizedUser(null);
  const decision = canPerformAction(null, ACTIONS.CONFIRM_DRAFT);
  assert.strictEqual(validation.ok, false);
  assert.strictEqual(decision.allowed, false);
  assert.strictEqual(decision.reason, "usuario_requerido");
  return decision.reason;
});

check("usuario_disabled_no_autorizado", () => {
  const disabled = user(ROLES.OWNER, { enabled: false });
  const validation = validateAuthorizedUser(disabled);
  const decision = canPerformAction(disabled, ACTIONS.CONFIRM_DRAFT);
  assert.strictEqual(validation.ok, false);
  assert.strictEqual(decision.allowed, false);
  assert(decision.reason.includes("usuario deshabilitado"));
  return "disabled";
});

check("owner_puede_acciones_sensibles_excepto_produccion", () => {
  const owner = user(ROLES.OWNER);
  for (const action of [
    ACTIONS.CONFIRM_DRAFT,
    ACTIONS.APPROVE_DRAFT,
    ACTIONS.STAMP_SANDBOX,
    ACTIONS.CANCEL_INVOICE,
    ACTIONS.DOWNLOAD_XML,
    ACTIONS.VIEW_BANK_STATEMENTS,
    ACTIONS.CONFIGURE_PAC,
  ]) {
    assert.strictEqual(canPerformAction(owner, action).allowed, true, action);
  }
  assert.strictEqual(canPerformAction(owner, ACTIONS.STAMP_PRODUCTION).allowed, false);
  return "owner";
});

check("accountant_readonly_no_puede_timbrar_cancelar_configurar_pac", () => {
  const accountant = user(ROLES.ACCOUNTANT_READONLY);
  assert.strictEqual(canPerformAction(accountant, ACTIONS.VIEW_REPORTS).allowed, true);
  assert.strictEqual(canPerformAction(accountant, ACTIONS.EXPORT_ACCOUNTANT_PACKAGE).allowed, false);
  assert.strictEqual(canPerformAction(accountant, ACTIONS.STAMP_SANDBOX).allowed, false);
  assert.strictEqual(canPerformAction(accountant, ACTIONS.CANCEL_INVOICE).allowed, false);
  assert.strictEqual(canPerformAction(accountant, ACTIONS.CONFIGURE_PAC).allowed, false);
  return "readonly";
});

check("assistant_operator_no_puede_ver_bancos_ni_configurar_pac", () => {
  const operator = user(ROLES.ASSISTANT_OPERATOR);
  assert.strictEqual(canPerformAction(operator, ACTIONS.CREATE_DRAFT).allowed, true);
  assert.strictEqual(canPerformAction(operator, ACTIONS.CONFIRM_DRAFT).allowed, true);
  assert.strictEqual(canPerformAction(operator, ACTIONS.VIEW_BANK_STATEMENTS).allowed, false);
  assert.strictEqual(canPerformAction(operator, ACTIONS.CONFIGURE_PAC).allowed, false);
  assert.strictEqual(canPerformAction(operator, ACTIONS.STAMP_SANDBOX).allowed, false);
  return "operator";
});

check("callback_action_sensible_requiere_user", () => {
  assert.strictEqual(isSensitiveAction(ACTIONS.CONFIRM_DRAFT), true);
  const decision = canPerformAction(null, ACTIONS.CONFIRM_DRAFT);
  assert.strictEqual(decision.allowed, false);
  assert.strictEqual(decision.reason, "usuario_requerido");
  return "user required";
});

check("sanitize_sensitive_payload_remueve_secretos", () => {
  const payload = {
    api_key: "real-api-key",
    secret: "real-secret",
    rfc: "AAA010101AAA",
    bank_account: "1234567890",
    xml: "<cfdi/>",
    pdf: "PDFDATA",
    token: "telegram-token",
    nested: {
      secret_key: "secret-key",
      safe: "ok",
    },
    list: [{ access_token: "abc", value: 1 }],
  };
  const clean = sanitizeSensitivePayload(payload);
  assert.strictEqual(clean.api_key, undefined);
  assert.strictEqual(clean.secret, undefined);
  assert.strictEqual(clean.rfc, undefined);
  assert.strictEqual(clean.bank_account, undefined);
  assert.strictEqual(clean.xml, undefined);
  assert.strictEqual(clean.pdf, undefined);
  assert.strictEqual(clean.token, undefined);
  assert.strictEqual(clean.nested.secret_key, undefined);
  assert.strictEqual(clean.nested.safe, "ok");
  assert.deepStrictEqual(clean.list[0], { value: 1 });
  return "sanitized";
});

check("security_event_no_contiene_secretos", () => {
  const event = buildSecurityEvent({
    event_id: "SEC-DEMO",
    event_type: "ACCESS_DENIED",
    telegram_chat_id: "chat-demo",
    telegram_user_id: "telegram-user-demo",
    user_id: "USER-DEMO",
    action: ACTIONS.CONFIGURE_PAC,
    allowed: false,
    reason: "rol_sin_permiso",
    metadata: {
      api_key: "real-api-key",
      rfc: "AAA010101AAA",
      client_name: "Cliente Demo",
      safe: "visible",
    },
  });
  const serialized = JSON.stringify(event);
  assert(!serialized.includes("real-api-key"));
  assert(!serialized.includes("AAA010101AAA"));
  assert(serialized.includes("Cliente Demo"));
  assert.strictEqual(event.metadata.safe, "visible");
  return event.event_id;
});

check("accion_desconocida_falla_cerrada", () => {
  const decision = canPerformAction(user(ROLES.OWNER), "DELETE_EVERYTHING");
  assert.strictEqual(decision.allowed, false);
  assert.strictEqual(decision.reason, "accion_desconocida");
  return "fail closed";
});

check("stamp_production_siempre_bloqueado_por_ahora", () => {
  for (const role of Object.values(ROLES)) {
    const decision = canPerformAction(user(role), ACTIONS.STAMP_PRODUCTION);
    assert.strictEqual(decision.allowed, false, role);
    assert.strictEqual(decision.reason, "produccion_bloqueada_por_ahora");
  }
  return "production blocked";
});

check("acciones_sensibles_clasificadas", () => {
  for (const action of [
    ACTIONS.CONFIRM_DRAFT,
    ACTIONS.APPROVE_DRAFT,
    ACTIONS.STAMP_SANDBOX,
    ACTIONS.STAMP_PRODUCTION,
    ACTIONS.CANCEL_INVOICE,
    ACTIONS.DOWNLOAD_XML,
    ACTIONS.DOWNLOAD_PDF,
    ACTIONS.VIEW_BANK_STATEMENTS,
    ACTIONS.CONFIGURE_PAC,
  ]) {
    assert.strictEqual(isSensitiveAction(action), true, action);
  }
  assert.strictEqual(isSensitiveAction(ACTIONS.CREATE_DRAFT), false);
  return "sensitive map";
});

console.log("Security Access Control Tests");
for (const item of checks) {
  printCheck(item.name, item.pass, item.value);
}

const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}
