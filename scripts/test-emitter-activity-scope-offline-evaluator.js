const { execFileSync } = require("child_process");
const path = require("path");
const { loadEmitterActivityScope } = require("./lib/emitter-activity-scope-loader");
const {
  POLICY,
  containsDigitalBlockedSignal,
  evaluateEmitterActivityScope,
} = require("./lib/emitter-activity-scope-evaluator");

const root = path.resolve(__dirname, "..");

const CASES = [
  ...[
    "venta de router",
    "venta de switch",
    "venta de access point",
    "venta de computadora",
    "venta de memoria RAM",
    "reparacion de computadora",
    "mantenimiento de barrera vehicular",
    "instalacion de control de acceso",
    "instalacion de camara CCTV",
    "configuracion de DVR",
    "diagnostico de sistema CCTV",
    "cambio de fuente de poder de camara",
    "venta de cable de red",
    "venta de conector para red",
    "reparacion de equipo electronico",
  ].map((input_text) => ({ input_text, expected_policy: POLICY.ALLOW, group: "permitidos" })),
  ...[
    "servicio tecnico",
    "revision de sistema",
    "mantenimiento general",
    "trabajo en caseta",
    "instalacion de equipo",
    "configuracion de sistema",
  ].map((input_text) => ({ input_text, expected_policy: POLICY.ASK, group: "aclaracion" })),
  ...[
    "desarrollo de app movil",
    "pagina web",
    "automatizacion n8n",
    "servicio de IA",
    "marketing digital",
    "diseno grafico",
    "edicion de video",
    "plomeria",
    "pintura",
    "albanileria",
    "comida",
    "consultoria fiscal",
    "renta de equipo",
  ].map((input_text) => ({ input_text, expected_policy: POLICY.BLOCK, group: "bloqueo" })),
  { input_text: "venta de camara CCTV", expected_policy: POLICY.ALLOW, group: "contaminacion", required_guard: "CAMERA_NOT_DVR_GUARD_APPLIED", forbidden_activation: "DVR_NVR" },
  { input_text: "venta de DVR", expected_policy: POLICY.ALLOW, group: "contaminacion", required_guard: "DVR_NOT_CAMERA_GUARD_APPLIED", forbidden_activation: "CAMERA" },
  { input_text: "venta de NVR", expected_policy: POLICY.ALLOW, group: "contaminacion", required_guard: "DVR_NOT_CAMERA_GUARD_APPLIED", forbidden_activation: "CAMERA" },
  { input_text: "fuente de poder para camara", expected_policy: POLICY.ASK, group: "contaminacion", required_guard: "POWER_SOURCE_NOT_DVR_OR_DISK_GUARD_APPLIED", forbidden_activation: "DISK_DVR" },
  { input_text: "disco duro para DVR", expected_policy: POLICY.ASK, group: "contaminacion", required_guard: "DVR_NOT_CAMERA_GUARD_APPLIED", forbidden_activation: "CAMERA" },
  { input_text: "sistema CCTV completo", expected_policy: POLICY.ALLOW, group: "contaminacion", required_guard: "SYSTEM_CCTV_BROAD_ALLOWED", forbidden_activation: "EQUIPMENT_CONTRADICTION" },
];

const PROTECTED_PATHS = [
  "data/concepts.normalized.json",
  "data/base_cfdi_resico_n8n_emberhub_2026.xlsx",
  "workflow/cfdi_manual_test.n8n.json",
  "workflow/cfdi_telegram_postgres_polling.n8n.json",
  "workflow/cfdi_telegram_local_ingest.n8n.json",
];

function gitDiffNameOnly(repoPath) {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", repoPath], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const scope = loadEmitterActivityScope();
const checks = [];
const results = CASES.map((testCase) => ({
  input_text: testCase.input_text,
  expected_policy: testCase.expected_policy,
  group: testCase.group,
  required_guard: testCase.required_guard || null,
  forbidden_activation: testCase.forbidden_activation || null,
  ...evaluateEmitterActivityScope(testCase.input_text, scope),
}));

console.log("Offline emitter_activity_scope evaluator");
console.log(`Total casos: ${results.length}`);
for (const result of results) {
  console.log(JSON.stringify(result, null, 2));
  const policyPass = result.offline_policy_result === result.expected_policy;
  const blockNotAllowed = result.group !== "bloqueo" || result.offline_policy_result !== POLICY.ALLOW;
  const genericNotAllowed = result.group !== "aclaracion" || result.offline_policy_result !== POLICY.ALLOW;
  const requiredGuardPass = !result.required_guard || result.semantic_contamination_flags.includes(result.required_guard);
  const noContaminationPass = !result.semantic_contamination_flags.some((flag) => flag.startsWith("CONTAMINATION_"));
  const softwareNotAllowed = !containsDigitalBlockedSignal(result.input_text) || result.offline_policy_result !== POLICY.ALLOW;

  checks.push({ name: `policy:${result.input_text}`, pass: policyPass, value: `${result.offline_policy_result} expected ${result.expected_policy}` });
  checks.push({ name: `blocked_not_allowed:${result.input_text}`, pass: blockNotAllowed, value: result.group });
  checks.push({ name: `generic_not_allowed:${result.input_text}`, pass: genericNotAllowed, value: result.group });
  checks.push({ name: `semantic_guard:${result.input_text}`, pass: requiredGuardPass, value: result.required_guard || "not-required" });
  checks.push({ name: `no_semantic_contamination:${result.input_text}`, pass: noContaminationPass, value: result.forbidden_activation || "none" });
  checks.push({ name: `software_web_ia_n8n_not_allowed:${result.input_text}`, pass: softwareNotAllowed, value: result.group });
}

for (const repoPath of PROTECTED_PATHS) {
  checks.push({
    name: `protected_path_not_modified:${repoPath}`,
    pass: gitDiffNameOnly(repoPath) === "",
    value: repoPath,
  });
}

const passed = checks.filter((check) => check.pass).length;
console.log("");
console.log("Validaciones");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
