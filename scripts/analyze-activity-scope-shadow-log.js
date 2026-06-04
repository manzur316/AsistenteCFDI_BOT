const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const DEFAULT_LOG_PATH = path.join(root, "runtime", "activity-scope-shadow.jsonl");
const CRITICAL_DIVERGENCES = new Set([
  "CURRENT_SCORING_SEMANTIC_CONTAMINATION",
  "CURRENT_SCORING_BLOCKS_VALID_SCOPE",
  "CURRENT_SCORING_ALLOWS_OUT_OF_SCOPE",
  "CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE",
]);

function countBy(records, selector) {
  return records.reduce((acc, record) => {
    const key = selector(record) || "(missing)";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function increment(acc, key) {
  if (!key) return;
  acc[key] = (acc[key] || 0) + 1;
}

function normalizeMatch(match) {
  if (!match) return null;
  if (typeof match === "string") return match;
  if (typeof match === "object") return match.id || match.term || match.name || JSON.stringify(match);
  return String(match);
}

function topValues(records, fieldName) {
  const counts = {};
  for (const record of records) {
    const values = Array.isArray(record[fieldName]) ? record[fieldName] : [];
    for (const value of values) increment(counts, normalizeMatch(value));
  }
  return counts;
}

function extractInputLabel(record) {
  const direct = record.input_text || record.message_original || record.text || record.current_text || record.message;
  if (direct) return String(direct);

  const reasons = Array.isArray(record.reasons) ? record.reasons : [];
  const inputReason = reasons.find((reason) => typeof reason === "string" && reason.startsWith("input:"));
  if (inputReason) return inputReason.slice("input:".length);

  return "";
}

function formatCounts(title, counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const lines = [title];
  if (entries.length === 0) {
    lines.push(" - none: 0");
    return lines;
  }
  for (const [key, count] of entries) lines.push(` - ${key}: ${count}`);
  return lines;
}

function parseJsonl(logPath) {
  if (!fs.existsSync(logPath)) {
    return {
      records: [],
      errors: [`Archivo no existe: ${logPath}`],
    };
  }

  const text = fs.readFileSync(logPath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const records = [];
  const errors = [];

  lines.forEach((line, index) => {
    try {
      records.push({ ...JSON.parse(line), __line: index + 1 });
    } catch (error) {
      errors.push(`Linea ${index + 1}: JSON invalido (${error.message})`);
    }
  });

  return { records, errors };
}

function validateRecords(records) {
  const errors = [];
  for (const record of records) {
    const line = record.__line || "?";
    if (record.non_productive !== true) errors.push(`Linea ${line}: non_productive debe ser true`);
    if (!record.divergence_type) errors.push(`Linea ${line}: falta divergence_type`);
    if (!record.current_action) errors.push(`Linea ${line}: falta current_action`);
    if (!record.activity_scope_result) errors.push(`Linea ${line}: falta activity_scope_result`);
  }

  const unlistedCritical = records.filter((record) => {
    return CRITICAL_DIVERGENCES.has(record.divergence_type) && !extractInputLabel(record);
  });
  for (const record of unlistedCritical) {
    errors.push(`Linea ${record.__line || "?"}: divergencia critica sin texto identificable`);
  }

  return errors;
}

function analyze(logPath = DEFAULT_LOG_PATH) {
  const resolvedPath = path.resolve(logPath);
  const parsed = parseJsonl(resolvedPath);
  const errors = [...parsed.errors, ...validateRecords(parsed.records)];

  const records = parsed.records;
  const divergenceCases = records.filter((record) => record.divergence_type && record.divergence_type !== "NONE");
  const blockedCases = records.filter((record) => record.activity_scope_result === "BLOCK_OR_ACTIVITY_REVIEW");
  const clarificationCases = records.filter((record) => record.activity_scope_result === "ASK_CLARIFICATION");
  const criticalCases = divergenceCases.filter((record) => CRITICAL_DIVERGENCES.has(record.divergence_type));

  return {
    ok: errors.length === 0,
    logPath: resolvedPath,
    total: records.length,
    errors,
    counts: {
      divergence_type: countBy(records, (record) => record.divergence_type),
      current_action: countBy(records, (record) => record.current_action),
      activity_scope_result: countBy(records, (record) => record.activity_scope_result),
      semantic_flags: topValues(records, "semantic_flags"),
      blocked_scope_matches: topValues(records, "blocked_scope_matches"),
    },
    cases: {
      divergences: divergenceCases,
      critical_divergences: criticalCases,
      block_or_activity_review: blockedCases,
      ask_clarification: clarificationCases,
    },
  };
}

function formatCase(record) {
  const input = extractInputLabel(record) || "(sin texto)";
  const concept = record.current_concept_id ? ` concept=${record.current_concept_id}` : "";
  return ` - line ${record.__line || "?"}: ${record.divergence_type || record.activity_scope_result} | ${record.current_action || "N/A"}${concept} | ${input}`;
}

function renderAnalysis(analysis) {
  const lines = [
    "Activity scope shadow log analyzer",
    `Log: ${analysis.logPath}`,
    `Total registros: ${analysis.total}`,
    "",
    ...formatCounts("Conteo por divergence_type", analysis.counts.divergence_type),
    "",
    ...formatCounts("Conteo por current_action", analysis.counts.current_action),
    "",
    ...formatCounts("Conteo por activity_scope_result", analysis.counts.activity_scope_result),
    "",
    "Casos con divergence_type distinto de NONE",
  ];

  if (analysis.cases.divergences.length === 0) {
    lines.push(" - none");
  } else {
    for (const record of analysis.cases.divergences) lines.push(formatCase(record));
  }

  lines.push("", "Casos BLOCK_OR_ACTIVITY_REVIEW");
  if (analysis.cases.block_or_activity_review.length === 0) {
    lines.push(" - none");
  } else {
    for (const record of analysis.cases.block_or_activity_review) lines.push(formatCase(record));
  }

  lines.push("", "Casos ASK_CLARIFICATION");
  if (analysis.cases.ask_clarification.length === 0) {
    lines.push(" - none");
  } else {
    for (const record of analysis.cases.ask_clarification) lines.push(formatCase(record));
  }

  lines.push("", ...formatCounts("Top semantic_flags", analysis.counts.semantic_flags));
  lines.push("", ...formatCounts("Top blocked_scope_matches", analysis.counts.blocked_scope_matches));

  if (analysis.cases.critical_divergences.length > 0) {
    lines.push("", "Divergencias criticas listadas");
    for (const record of analysis.cases.critical_divergences) lines.push(formatCase(record));
  }

  if (analysis.errors.length > 0) {
    lines.push("", "Errores");
    for (const error of analysis.errors) lines.push(` - ${error}`);
  }

  lines.push("", `Resultado: ${analysis.ok ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

function main() {
  const logPath = process.argv[2] || DEFAULT_LOG_PATH;
  const analysis = analyze(logPath);
  console.log(renderAnalysis(analysis));
  if (!analysis.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  CRITICAL_DIVERGENCES,
  DEFAULT_LOG_PATH,
  analyze,
  extractInputLabel,
  renderAnalysis,
};
