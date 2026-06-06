"use strict";

const TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION = "TELEGRAM_PRODUCT_MENU_V1";

const ACTION_CLASSIFICATION = Object.freeze({
  USER_SAFE: "USER_SAFE",
  ADMIN_ONLY: "ADMIN_ONLY",
  SANDBOX_ONLY: "SANDBOX_ONLY",
  FUTURE: "FUTURE",
  DEPRECATED: "DEPRECATED",
});

const ROLES = Object.freeze({
  OWNER: "OWNER",
  ASSISTANT_OPERATOR: "ASSISTANT_OPERATOR",
  ACCOUNTANT_READONLY: "ACCOUNTANT_READONLY",
  ADMIN_FUTURE: "ADMIN_FUTURE",
});

const CALLBACK_NAMESPACES = Object.freeze({
  PRODUCT_NAV: "cfdi_nav:",
  TOKENIZED_ACTION: "cfdi:",
  SANDBOX: "cfdi_sbx:",
});

const CALLBACK_DATA_LIMIT = 64;
const PRODUCT_NAV_CALLBACK_LIMIT = 32;
const SAFE_STATIC_CALLBACK_RE = /^[a-z0-9_:.-]+$/;
const SAFE_TOKEN_CALLBACK_RE = /^cfdi:[A-Za-z0-9_-]{8,48}$/;
const RFC_RE = /\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b/i;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const FORBIDDEN_CALLBACK_TEXT_RE = /(?:\buid\b|_uid\b|\buid_|uuid|rfc|monto|amount|total|secret|password|api[_-]?key|\.env|csd|cert|xml|pdf|zip|xlsx|excel|runtime|[a-z]:[\\/]|[\\/])/i;

function freezeDeep(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const item of Object.values(value)) {
    freezeDeep(item);
  }
  return value;
}

function button(params) {
  return {
    id: params.id,
    text: params.text,
    callback_data: params.callback_data,
    target_action: params.target_action,
    roles: params.roles || [ROLES.OWNER],
    classification: params.classification || ACTION_CLASSIFICATION.USER_SAFE,
    status: params.status || "ACTIVE",
    risk: params.risk || "LOW",
    route: params.route || null,
    notes: params.notes || "",
  };
}

const MAIN_MENU = freezeDeep({
  id: "main",
  title: "Menu CFDI",
  description: "Interfaz diaria de producto para borradores CFDI.",
  buttons: [
    button({
      id: "new_invoice",
      text: "Nueva factura / borrador CFDI",
      callback_data: "cfdi_nav:new",
      target_action: "CREATE_DRAFT",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
      risk: "MEDIUM",
      route: "submenu:invoices",
    }),
    button({
      id: "clients",
      text: "Clientes",
      callback_data: "cfdi_nav:clients",
      target_action: "OPEN_CLIENTS_MENU",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
      risk: "MEDIUM",
      route: "submenu:clients",
    }),
    button({
      id: "drafts",
      text: "Borradores pendientes",
      callback_data: "cfdi_nav:drafts",
      target_action: "LIST_PENDING_DRAFTS",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
      risk: "MEDIUM",
      route: "submenu:invoices",
    }),
    button({
      id: "monthly_report",
      text: "Reporte mensual",
      callback_data: "cfdi_nav:report",
      target_action: "VIEW_MONTHLY_REPORT",
      roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
      risk: "MEDIUM",
      route: "submenu:reports",
    }),
    button({
      id: "accountant_package",
      text: "Paquete para contador",
      callback_data: "cfdi_nav:acctpkg",
      target_action: "VIEW_ACCOUNTANT_PACKAGE_SUMMARY",
      roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
      risk: "HIGH",
      route: "submenu:reports",
    }),
    button({
      id: "system_status",
      text: "Estado del sistema",
      callback_data: "cfdi_nav:status",
      target_action: "VIEW_SYSTEM_STATUS",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      risk: "LOW",
      route: "submenu:system",
    }),
    button({
      id: "help",
      text: "Ayuda",
      callback_data: "cfdi_nav:help",
      target_action: "VIEW_HELP",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      risk: "LOW",
      route: "submenu:system",
    }),
    button({
      id: "admin_sandbox",
      text: "Admin/Sandbox",
      callback_data: "cfdi_nav:admin",
      target_action: "OPEN_ADMIN_SANDBOX_MENU",
      roles: [ROLES.OWNER],
      classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
      status: "HIDDEN_BY_DEFAULT",
      risk: "HIGH",
      route: "submenu:admin_sandbox",
      notes: "Solo visible con includeAdmin o includeSandbox para OWNER.",
    }),
  ],
});

const SUBMENUS = freezeDeep({
  invoices: {
    id: "invoices",
    title: "Facturas",
    buttons: [
      button({
        id: "invoice_new",
        text: "Nueva factura",
        callback_data: "cfdi_nav:new",
        target_action: "CREATE_DRAFT",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "invoice_drafts",
        text: "Borradores pendientes",
        callback_data: "cfdi_nav:drafts",
        target_action: "LIST_PENDING_DRAFTS",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "invoice_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  clients: {
    id: "clients",
    title: "Clientes",
    buttons: [
      button({
        id: "client_find",
        text: "Buscar cliente",
        callback_data: "cfdi_nav:client_find",
        target_action: "FIND_CLIENT",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "client_new",
        text: "Nuevo cliente",
        callback_data: "cfdi_nav:client_new",
        target_action: "CREATE_CLIENT",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "HIGH",
      }),
      button({
        id: "client_ledger",
        text: "Facturas del cliente",
        callback_data: "cfdi_nav:client_ledger",
        target_action: "VIEW_CLIENT_INVOICE_LEDGER",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "client_billing_summary",
        text: "Resumen cobranza",
        callback_data: "cfdi_nav:billing",
        target_action: "VIEW_CLIENT_BILLING_SUMMARY",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "client_billing_aging",
        text: "Resumen vencidos",
        callback_data: "cfdi_nav:aging",
        target_action: "VIEW_CLIENT_BILLING_AGING",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "client_payment_pending",
        text: "Pendientes de pago",
        callback_data: "cfdi_nav:pay_pending",
        target_action: "VIEW_CLIENT_PAYMENT_PENDING",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "client_payment_paid",
        text: "Pagadas",
        callback_data: "cfdi_nav:pay_paid",
        target_action: "VIEW_CLIENT_PAYMENT_PAID",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "client_payment_cancelled",
        text: "Canceladas",
        callback_data: "cfdi_nav:pay_cancel",
        target_action: "VIEW_CLIENT_PAYMENT_CANCELLED",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "client_validate",
        text: "Validar cliente",
        callback_data: "cfdi_nav:client_validate",
        target_action: "VALIDATE_CLIENT",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.ADMIN_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "clients_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  reports: {
    id: "reports",
    title: "Reportes",
    buttons: [
      button({
        id: "report_month",
        text: "Reporte mensual",
        callback_data: "cfdi_nav:report",
        target_action: "VIEW_MONTHLY_REPORT",
        roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
        risk: "MEDIUM",
      }),
      button({
        id: "report_accountant_package",
        text: "Paquete para contador",
        callback_data: "cfdi_nav:acctpkg",
        target_action: "VIEW_ACCOUNTANT_PACKAGE_SUMMARY",
        roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
        risk: "HIGH",
      }),
      button({
        id: "reports_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  system: {
    id: "system",
    title: "Sistema",
    buttons: [
      button({
        id: "system_status",
        text: "Estado del sistema",
        callback_data: "cfdi_nav:status",
        target_action: "VIEW_SYSTEM_STATUS",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
      button({
        id: "system_help",
        text: "Ayuda",
        callback_data: "cfdi_nav:help",
        target_action: "VIEW_HELP",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
      button({
        id: "system_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  admin_sandbox: {
    id: "admin_sandbox",
    title: "Admin/Sandbox",
    buttons: [
      button({
      id: "sandbox_menu",
        text: "PAC Sandbox",
        callback_data: "cfdi_nav:pac_sbx",
        target_action: "OPEN_PAC_SANDBOX_CONSOLE",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "pac_sandbox_menu",
        text: "Proveedor Factura.com Sandbox",
        callback_data: "cfdi_sbx:menu",
        target_action: "OPEN_PAC_SANDBOX_CONSOLE",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_preflight",
        text: "Preflight proveedor",
        callback_data: "cfdi_sbx:preflight",
        target_action: "RUN_SANDBOX_PREFLIGHT",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_approved_drafts",
        text: "Borradores aprobados para timbrar",
        callback_data: "cfdi_nav:sbx_drafts",
        target_action: "LIST_APPROVED_DRAFTS_FOR_SANDBOX_STAMP",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_smoke_create",
        text: "Smoke: timbrar fixture sandbox",
        callback_data: "cfdi_sbx:smoke_create",
        target_action: "RUN_SANDBOX_SMOKE_CREATE",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_smoke_download",
        text: "Smoke: timbrar + XML/PDF",
        callback_data: "cfdi_sbx:smoke_download",
        target_action: "RUN_SANDBOX_SMOKE_DOWNLOAD",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_smoke_cancel",
        text: "Smoke: timbrar + cancelar",
        callback_data: "cfdi_sbx:smoke_cancel",
        target_action: "RUN_SANDBOX_SMOKE_CANCEL",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_latest",
        text: "Ultimo resultado tecnico",
        callback_data: "cfdi_sbx:latest",
        target_action: "RUN_SANDBOX_LATEST_RESULT",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "MEDIUM",
      }),
      button({
        id: "sandbox_audit",
        text: "Audit sandbox",
        callback_data: "cfdi_sbx:audit",
        target_action: "RUN_SANDBOX_AUDIT_SUMMARY",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "MEDIUM",
      }),
      button({
        id: "sandbox_full",
        text: "Full monthly package sandbox",
        callback_data: "cfdi_sbx:full",
        target_action: "RUN_SANDBOX_FULL_PACKAGE",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "admin_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER],
      }),
    ],
  },
});

const LEGACY_COMMANDS = freezeDeep([
  { command: "/factura", target_action: "CREATE_DRAFT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/clientes", target_action: "LIST_CLIENTS", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/cliente TEXTO", target_action: "FIND_CLIENT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/nuevocliente", target_action: "CREATE_CLIENT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/editarcliente", target_action: "EDIT_CLIENT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/validarcliente", target_action: "VALIDATE_CLIENT", classification: ACTION_CLASSIFICATION.ADMIN_ONLY },
  { command: "/sandbox_menu", target_action: "OPEN_SANDBOX_MENU", classification: ACTION_CLASSIFICATION.SANDBOX_ONLY },
  { command: "/sandbox_*", target_action: "RUN_SANDBOX_ACTION", classification: ACTION_CLASSIFICATION.SANDBOX_ONLY },
]);

function normalizeRole(role) {
  const value = String(role || "").trim().toUpperCase();
  return Object.values(ROLES).includes(value) ? value : ROLES.ASSISTANT_OPERATOR;
}

function roleCanSee(buttonDefinition, role, options = {}) {
  const normalizedRole = normalizeRole(role);
  const includeFuture = options.includeFuture === true;
  const includeAdmin = options.includeAdmin === true || options.includeSandbox === true;
  const classification = buttonDefinition.classification;

  if (!buttonDefinition.roles.includes(normalizedRole)) return false;
  if (classification === ACTION_CLASSIFICATION.FUTURE) return includeFuture;
  if (classification === ACTION_CLASSIFICATION.ADMIN_ONLY && normalizedRole !== ROLES.OWNER) return false;
  if (classification === ACTION_CLASSIFICATION.SANDBOX_ONLY) {
    return normalizedRole === ROLES.OWNER && includeAdmin;
  }
  return true;
}

function toTelegramButton(buttonDefinition) {
  return {
    text: buttonDefinition.text,
    callback_data: buttonDefinition.callback_data,
  };
}

function buildMenuResponse(menuDefinition, role, options = {}) {
  const visibleButtons = menuDefinition.buttons.filter((item) => roleCanSee(item, role, options));
  const inlineKeyboard = visibleButtons.map((item) => [toTelegramButton(item)]);
  return {
    schema_version: TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
    menu_id: menuDefinition.id,
    title: menuDefinition.title,
    role: normalizeRole(role),
    buttons: visibleButtons.map((item) => ({ ...item })),
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  };
}

function getTelegramProductMenu(role = ROLES.ASSISTANT_OPERATOR, options = {}) {
  return buildMenuResponse(MAIN_MENU, role, options);
}

function getTelegramSubmenu(menuId, role = ROLES.ASSISTANT_OPERATOR, options = {}) {
  const key = String(menuId || "").trim();
  const menuDefinition = SUBMENUS[key];
  if (!menuDefinition) {
    return {
      schema_version: TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
      menu_id: null,
      role: normalizeRole(role),
      buttons: [],
      reply_markup: { inline_keyboard: [] },
      error: "submenu_desconocido",
    };
  }
  return buildMenuResponse(menuDefinition, role, options);
}

function hasSensitiveCallbackContent(callbackData, { allowSandboxArtifacts = false } = {}) {
  const value = String(callbackData || "");
  if (RFC_RE.test(value) || UUID_RE.test(value)) return true;
  if (allowSandboxArtifacts && value.startsWith(CALLBACK_NAMESPACES.SANDBOX)) {
    return /(?:\buid\b|_uid\b|\buid_|uuid|rfc|monto|amount|total|secret|password|api[_-]?key|\.env|csd|cert|runtime|[a-z]:[\\/]|[\\/])/i.test(value);
  }
  return FORBIDDEN_CALLBACK_TEXT_RE.test(value);
}

function validateTelegramCallbackData(callbackData) {
  const value = String(callbackData || "").trim();
  const errors = [];
  if (!value) errors.push("callback_data_required");
  if (value.length > CALLBACK_DATA_LIMIT) errors.push("callback_data_too_long");

  if (value.startsWith(CALLBACK_NAMESPACES.PRODUCT_NAV)) {
    if (value.length > PRODUCT_NAV_CALLBACK_LIMIT) errors.push("cfdi_nav_too_long");
    if (!SAFE_STATIC_CALLBACK_RE.test(value)) errors.push("cfdi_nav_invalid_chars");
    if (hasSensitiveCallbackContent(value)) errors.push("cfdi_nav_sensitive_content");
  } else if (value.startsWith(CALLBACK_NAMESPACES.SANDBOX)) {
    if (value.length > PRODUCT_NAV_CALLBACK_LIMIT) errors.push("cfdi_sbx_too_long");
    if (!SAFE_STATIC_CALLBACK_RE.test(value)) errors.push("cfdi_sbx_invalid_chars");
    if (hasSensitiveCallbackContent(value, { allowSandboxArtifacts: true })) errors.push("cfdi_sbx_sensitive_content");
  } else if (value.startsWith(CALLBACK_NAMESPACES.TOKENIZED_ACTION)) {
    if (!SAFE_TOKEN_CALLBACK_RE.test(value)) errors.push("cfdi_token_invalid_format");
  } else {
    errors.push("callback_namespace_unknown");
  }

  return {
    ok: errors.length === 0,
    callback_data: value,
    errors,
  };
}

function allButtons() {
  return [
    ...MAIN_MENU.buttons,
    ...Object.values(SUBMENUS).flatMap((submenu) => submenu.buttons),
  ];
}

function classifyTelegramMenuAction(callbackData) {
  const value = String(callbackData || "").trim();
  const validation = validateTelegramCallbackData(value);
  if (!validation.ok) {
    return {
      callback_data: value,
      classification: null,
      target_action: null,
      valid: false,
      errors: validation.errors,
    };
  }

  if (value.startsWith(CALLBACK_NAMESPACES.TOKENIZED_ACTION)) {
    return {
      callback_data: value,
      classification: ACTION_CLASSIFICATION.USER_SAFE,
      target_action: "TOKENIZED_CONTEXT_ACTION",
      valid: true,
      tokenized: true,
      errors: [],
    };
  }

  const match = allButtons().find((item) => item.callback_data === value);
  if (!match) {
    return {
      callback_data: value,
      classification: value.startsWith(CALLBACK_NAMESPACES.SANDBOX)
        ? ACTION_CLASSIFICATION.SANDBOX_ONLY
        : ACTION_CLASSIFICATION.USER_SAFE,
      target_action: "UNKNOWN_ALLOWLIST_REQUIRED",
      valid: true,
      errors: [],
    };
  }

  return {
    callback_data: value,
    classification: match.classification,
    target_action: match.target_action,
    roles: [...match.roles],
    valid: true,
    errors: [],
  };
}

module.exports = {
  ACTION_CLASSIFICATION,
  CALLBACK_DATA_LIMIT,
  CALLBACK_NAMESPACES,
  LEGACY_COMMANDS,
  MAIN_MENU,
  PRODUCT_NAV_CALLBACK_LIMIT,
  ROLES,
  SUBMENUS,
  TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
  classifyTelegramMenuAction,
  getTelegramProductMenu,
  getTelegramSubmenu,
  validateTelegramCallbackData,
};
