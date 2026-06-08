const { FacturaComSandboxClientAdapter } = require("./factura-com-sandbox-client-adapter");
const {
  canonicalClientFromLocalClient,
  normalizeRfc,
  safeProviderClientSummary,
  validateFacturaComClientCreateInput,
} = require("./factura-com-provider-client-mapper");
const {
  DEFAULT_ENVIRONMENT,
  DEFAULT_PROVIDER,
  DEFAULT_TENANT_ID,
  loadProviderClientLink,
  safeLinkOutput,
  saveProviderClientLink,
} = require("./provider-client-link-store");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function normalizeOptions(options = {}) {
  return {
    tenant_id: text(options.tenantId || options.tenant_id) || DEFAULT_TENANT_ID,
    client_id: text(options.clientId || options.client_id),
    provider: text(options.provider) || DEFAULT_PROVIDER,
    environment: text(options.environment) || DEFAULT_ENVIRONMENT,
    provider_client_uid: text(options.providerClientUid || options.provider_client_uid),
    rfc: normalizeRfc(options.rfc),
    create_if_missing: options.createIfMissing === true || options.create_if_missing === true,
  };
}

function normalizeLocalClient(options = {}) {
  const source = options.client && typeof options.client === "object"
    ? options.client
    : {
        client_id: options.clientId || options.client_id,
        rfc: options.rfc,
        razon_social: options.legalName || options.legal_name,
        codigo_postal_fiscal: options.fiscalZip || options.fiscal_zip,
        regimen_fiscal: options.fiscalRegime || options.fiscal_regime,
        uso_cfdi_default: options.cfdiUse || options.cfdi_use,
        email: options.email,
        validated_by_human: options.validatedByHuman === true || options.validated_by_human === true,
        ready_for_provider_sync: options.readyForProviderSync === true || options.ready_for_provider_sync === true,
      };
  return canonicalClientFromLocalClient(source);
}

function safeOutputBase(action, normalized = {}) {
  return {
    action,
    provider: normalized.provider || DEFAULT_PROVIDER,
    environment: normalized.environment || DEFAULT_ENVIRONMENT,
    tenant_id: normalized.tenant_id || DEFAULT_TENANT_ID,
    client_id: normalized.client_id || null,
  };
}

async function runProviderClientLookup(options = {}) {
  const normalized = normalizeOptions(options);
  if (!normalized.client_id && !normalized.rfc && !normalized.provider_client_uid) {
    return {
      status: "NEEDS_SOURCE",
      output: {
        ...safeOutputBase("sandbox.provider.client.lookup", normalized),
        error_class: "CLIENT_LOOKUP_INPUT_REQUIRED",
      },
      warnings: ["Falta client_id, rfc o provider_client_uid para buscar cliente provider."],
      errors: ["CLIENT_LOOKUP_INPUT_REQUIRED"],
    };
  }
  const localLink = normalized.client_id && !normalized.rfc && !normalized.provider_client_uid
    ? await (options.linkStore?.load || loadProviderClientLink)(normalized, options)
    : null;
  if (localLink && localLink.provider_client_uid) {
    return {
      status: "OK",
      output: {
        ...safeOutputBase("sandbox.provider.client.lookup", normalized),
        lookup_status: "LINK_FOUND",
        provider_client_link: safeLinkOutput(localLink),
      },
      warnings: [],
      errors: [],
    };
  }

  const adapter = options.adapter || new FacturaComSandboxClientAdapter({ env: options.env || process.env });
  const lookup = await adapter.lookupClient({
    rfc: normalized.rfc,
    provider_client_uid: normalized.provider_client_uid,
  }, {
    env: options.env || process.env,
    requestFn: options.requestFn,
  });
  return {
    status: lookup.status === "OK" ? "OK" : lookup.status === "AMBIGUOUS" ? "NEEDS_SOURCE" : lookup.status === "NOT_FOUND" ? "NEEDS_SOURCE" : "ERROR",
    output: {
      ...safeOutputBase("sandbox.provider.client.lookup", normalized),
      lookup_status: lookup.status,
      matches_count: lookup.matches_count,
      provider_client_uid_present: lookup.provider_client_uid_present,
      safe_matches: lookup.safe_matches,
      lookup_attempts: lookup.lookup_attempts || [],
    },
    warnings: lookup.status === "AMBIGUOUS" ? ["Provider devolvio multiples clientes; requiere seleccion humana."] : [],
    errors: lookup.status === "ERROR" ? ["PROVIDER_CLIENT_LOOKUP_ERROR"] : [],
  };
}

async function runProviderClientLink(options = {}) {
  const normalized = normalizeOptions(options);
  if (!normalized.client_id || !normalized.provider_client_uid) {
    return {
      status: "NEEDS_SOURCE",
      output: {
        ...safeOutputBase("sandbox.provider.client.link", normalized),
        error_class: "CLIENT_ID_AND_PROVIDER_UID_REQUIRED",
      },
      warnings: ["Falta client_id o provider_client_uid para crear vinculo."],
      errors: ["CLIENT_ID_AND_PROVIDER_UID_REQUIRED"],
    };
  }
  const saved = await (options.linkStore?.save || saveProviderClientLink)({
    ...normalized,
    provider_rfc: normalized.rfc,
    sync_status: "MANUAL_LINKED",
    provider_response_sanitized: {
      source: "manual_link",
      provider_client_uid_present: true,
      provider_rfc_present: Boolean(normalized.rfc),
    },
  }, options);
  return {
    status: "OK",
    output: {
      ...safeOutputBase("sandbox.provider.client.link", normalized),
      link_status: "MANUAL_LINKED",
      provider_client_link: safeLinkOutput({
        ...normalized,
        provider_client_link_id: saved?.provider_client_link_id,
        sync_status: "MANUAL_LINKED",
      }),
    },
    warnings: [],
    errors: [],
  };
}

async function runProviderClientSync(options = {}) {
  const normalized = normalizeOptions(options);
  const canonical = normalizeLocalClient(options);
  const validation = validateFacturaComClientCreateInput(canonical, options);
  if (!validation.ok) {
    return {
      status: "NEEDS_SOURCE",
      output: {
        ...safeOutputBase("sandbox.provider.client.sync", normalized),
        sync_status: validation.status,
        validation_errors: validation.errors,
        safe_client: validation.safe_client,
      },
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }

  const adapter = options.adapter || new FacturaComSandboxClientAdapter({ env: options.env || process.env });
  const lookup = await adapter.getClientByRfc(canonical.tax_id, {
    env: options.env || process.env,
    requestFn: options.requestFn,
  });

  if (lookup.status === "AMBIGUOUS") {
    return {
      status: "NEEDS_SOURCE",
      output: {
        ...safeOutputBase("sandbox.provider.client.sync", { ...normalized, client_id: canonical.local_client_id }),
        sync_status: "AMBIGUOUS",
        matches_count: lookup.matches_count,
        safe_matches: lookup.safe_matches,
      },
      warnings: ["Provider devolvio multiples clientes para el RFC; requiere seleccion humana."],
      errors: ["PROVIDER_CLIENT_MATCH_AMBIGUOUS"],
    };
  }

  let finalLookup = lookup;
  let syncStatus = "LINKED";
  if (lookup.status === "NOT_FOUND") {
    if (!normalized.create_if_missing) {
      return {
        status: "NEEDS_SOURCE",
        output: {
          ...safeOutputBase("sandbox.provider.client.sync", { ...normalized, client_id: canonical.local_client_id }),
          sync_status: "NOT_FOUND",
          create_if_missing: false,
          safe_client: safeProviderClientSummary({ rfc: canonical.tax_id, legal_name: canonical.legal_name }),
        },
        warnings: ["Cliente no encontrado en Factura.com Sandbox. Ejecuta sync con create_if_missing tras revision humana."],
        errors: ["PROVIDER_CLIENT_NOT_FOUND"],
      };
    }
    finalLookup = await adapter.createClient(canonical, {
      env: options.env || process.env,
      requestFn: options.requestFn,
    });
    syncStatus = "CREATED";
  }

  if (!finalLookup.provider_client_uid) {
    return {
      status: "ERROR",
      output: {
        ...safeOutputBase("sandbox.provider.client.sync", { ...normalized, client_id: canonical.local_client_id }),
        sync_status: finalLookup.status,
        provider_client_uid_present: false,
      },
      warnings: [],
      errors: ["PROVIDER_CLIENT_UID_MISSING"],
    };
  }

  const saved = await (options.linkStore?.save || saveProviderClientLink)({
    tenant_id: normalized.tenant_id,
    client_id: canonical.local_client_id,
    provider: normalized.provider,
    environment: normalized.environment,
    provider_client_uid: finalLookup.provider_client_uid,
    provider_rfc: canonical.tax_id,
    provider_legal_name: canonical.legal_name,
    sync_status: syncStatus,
    provider_response_sanitized: {
      lookup_status: finalLookup.status,
      matches_count: finalLookup.matches_count,
      provider_client_uid_present: true,
      provider_email_present: Boolean(canonical.email),
      provider_email_sync_status: canonical.email ? "SYNCED" : "NOT_PROVIDED",
      safe_matches: finalLookup.safe_matches || [],
    },
  }, options);

  return {
    status: "OK",
    output: {
      ...safeOutputBase("sandbox.provider.client.sync", { ...normalized, client_id: canonical.local_client_id }),
      sync_status: syncStatus,
      provider_email_sync_status: canonical.email ? "SYNCED" : "NOT_PROVIDED",
      client_email_present: Boolean(canonical.email),
      provider_client_link: safeLinkOutput({
        tenant_id: normalized.tenant_id,
        client_id: canonical.local_client_id,
        provider: normalized.provider,
        environment: normalized.environment,
        provider_client_uid: finalLookup.provider_client_uid,
        provider_rfc: canonical.tax_id,
        sync_status: syncStatus,
        provider_client_link_id: saved?.provider_client_link_id,
      }),
    },
    warnings: [],
    errors: [],
  };
}

async function runProviderClientDiagnose(options = {}) {
  const normalized = normalizeOptions(options);
  const link = normalized.client_id
    ? await (options.linkStore?.load || loadProviderClientLink)(normalized, options)
    : null;
  return {
    status: link && link.provider_client_uid ? "OK" : "NEEDS_SOURCE",
    output: {
      ...safeOutputBase("sandbox.provider.client.diagnose", normalized),
      provider_client_link_found: Boolean(link && link.provider_client_uid),
      provider_client_link: link ? safeLinkOutput(link) : null,
      next_action: link && link.provider_client_uid
        ? "Listo para sandbox.draft.stamp con provider_client_links."
        : "Ejecuta sandbox.provider.client.sync o sandbox.provider.client.link antes de timbrar sandbox live.",
    },
    warnings: link && link.provider_client_uid ? [] : ["Falta provider_client_link para el cliente local."],
    errors: [],
  };
}

module.exports = {
  runProviderClientDiagnose,
  runProviderClientLink,
  runProviderClientLookup,
  runProviderClientSync,
};
