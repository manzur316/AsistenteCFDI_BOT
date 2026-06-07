const fs = require("fs");
const path = require("path");
const { buildSatSourceRegistry } = require("./sat-catalogs/sat-source-registry");
const { loadSatCatalogWorkbook, summarizeCatalogEntries } = require("./sat-catalogs/sat-catalog-loader");
const { validateCfdi40CoreRuleRegistry, getCfdi40CoreRules } = require("./cfdi-rules/cfdi-rule-registry");

const repoRoot = path.resolve(__dirname, "../..");

function rel(filePath) {
  const resolved = path.resolve(filePath);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "[LOCAL_SOURCE_OUTSIDE_REPO]";
  return relative.replace(/\\/g, "/");
}

function gitDiffNameOnly(target) {
  try {
    const { spawnSync } = require("child_process");
    const result = spawnSync("git", ["diff", "--name-only", "--", target], { cwd: repoRoot, encoding: "utf8" });
    if (result.status !== 0) return "UNKNOWN";
    return result.stdout.trim() ? "YES" : "NO";
  } catch (_error) {
    return "UNKNOWN";
  }
}

function runSatCfdiRulesDiagnose(options = {}) {
  const sourceRegistry = buildSatSourceRegistry({ sourceDir: options.sourceDir });
  const catalogLoad = loadSatCatalogWorkbook({ sourceDir: options.sourceDir });
  const ruleRegistry = validateCfdi40CoreRuleRegistry();
  const tenantProfileSql = fs.existsSync(path.join(repoRoot, "sql", "011_tenant_fiscal_profile_rules.sql"));
  return {
    source_registry: {
      ok: sourceRegistry.ok,
      sources: sourceRegistry.sources.map((source) => ({
        source_id: source.source_id,
        source_type: source.source_type,
        source_name: source.source_name,
        source_hash: source.source_hash,
        catalog_version: source.catalog_version,
        status: source.status,
        source_path_scope: source.source_path && source.source_path.includes("/Desktop/") ? "LOCAL_DESKTOP_SOURCE" : rel(source.source_path || ""),
      })),
    },
    catalogs: {
      loaded: catalogLoad.status === "IMPORTED",
      status: catalogLoad.status,
      reader_status: catalogLoad.reader_status,
      workbook_signature: catalogLoad.workbook_signature,
      detected_catalogs: catalogLoad.detected_sheets,
      missing_catalogs: catalogLoad.catalog_validation.missing,
      entries_by_catalog: summarizeCatalogEntries(catalogLoad.entries),
    },
    rule_sets: {
      available: ["CFDI_40_CORE"],
      cfdi40_core_rule_count: getCfdi40CoreRules().length,
      valid: ruleRegistry.ok,
      errors: ruleRegistry.errors,
    },
    default_tenant_profile: {
      tenant_id: "TENANT_PERSONAL_DEFAULT",
      foundation_sql_present: tenantProfileSql,
      status: tenantProfileSql ? "FOUNDATION_READY" : "NEEDS_MIGRATION",
    },
    protected_files: {
      concepts_normalized_touched: gitDiffNameOnly("data/concepts.normalized.json"),
    },
    human_review_required: true,
    disclaimer: "Diagnostico advisory. No sustituye contador, PAC ni SAT.",
  };
}

module.exports = {
  runSatCfdiRulesDiagnose,
};
