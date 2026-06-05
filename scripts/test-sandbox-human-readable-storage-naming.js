const assert = require("assert");
const {
  ALLOWED_EXTENSIONS,
  makeHumanReadableCfdiFileName,
  makeSafeClientSlug,
  sanitizeStorageRelativePath,
  validateHumanReadableCfdiFileName,
} = require("./lib/sandbox-human-readable-storage-naming");

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  const suffix = item.value ? ` (${item.value})` : "";
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${suffix}`);
}

check("allowed_extensions_are_limited", () => {
  assert.deepStrictEqual(ALLOWED_EXTENSIONS, ["xml", "pdf", "json", "csv", "md"]);
  return ALLOWED_EXTENSIONS.join(",");
});

check("client_slug_removes_rfc_and_legal_noise", () => {
  const slug = makeSafeClientSlug("Privada Rivera SA de CV XAXX010101000");
  assert(slug.startsWith("CLIENT-PRIVADA-RIVERA"));
  assert(!slug.includes("XAXX010101000"));
  assert(!slug.includes("CV"));
  return slug;
});

check("human_file_name_is_readable_and_safe", () => {
  const fileName = makeHumanReadableCfdiFileName({
    date: "2026-06-05T12:00:00.000Z",
    client_name: "Privada Rivera",
    draft_id: "DRAFT-000123",
    status: "SANDBOX_TIMBRADO",
    extension: "xml",
  });
  assert.strictEqual(fileName, "2026-06-05_CLIENT-PRIVADA-RIVERA_DRAFT-000123_SANDBOX_TIMBRADO.xml");
  assert.strictEqual(validateHumanReadableCfdiFileName(fileName).ok, true);
  return fileName;
});

check("uuid_and_uid_do_not_enter_file_name", () => {
  const fileName = makeHumanReadableCfdiFileName({
    date: "2026-06-05",
    client_name: "Cliente Demo",
    invoice_id: "CFDI-UID-123",
    status: "SANDBOX_TIMBRADO",
    extension: "pdf",
  });
  assert(!fileName.includes("CFDI-UID-123"));
  assert(fileName.includes("DRAFT-UNKNOWN"));
  assert.strictEqual(validateHumanReadableCfdiFileName(fileName).ok, true);
  assert(validateHumanReadableCfdiFileName("2026-06-05_CLIENT-X_CFDI-UID-123_SANDBOX_TIMBRADO.pdf").errors.includes("uid_forbidden"));
  assert(validateHumanReadableCfdiFileName("2026-06-05_CLIENT-X_00000000-0000-4000-8000-000000000555_SANDBOX_TIMBRADO.pdf").errors.includes("uuid_forbidden"));
  return fileName;
});

check("path_and_secret_values_are_blocked", () => {
  const badPath = validateHumanReadableCfdiFileName("C:/runtime/storage/file.xml");
  const badSecret = validateHumanReadableCfdiFileName("2026-06-05_CLIENT-X_SECRETKEY123456_SANDBOX_TIMBRADO.xml");
  assert(badPath.errors.includes("path_separator_or_drive_forbidden"));
  assert(badSecret.errors.includes("secret_forbidden"));
  assert.throws(() => sanitizeStorageRelativePath("C:/Users/demo/runtime/file.xml"), /Ruta absoluta/);
  assert.throws(() => sanitizeStorageRelativePath("../runtime/file.xml"), /Path traversal/);
  return "blocked";
});

check("relative_paths_are_sanitized", () => {
  const safe = sanitizeStorageRelativePath("emitters\\EMITTER DEMO\\2026\\06\\clients\\CLIENT DEMO\\invoices\\DRAFT-1\\xml\\file.xml");
  assert(!safe.includes("\\"));
  assert(!safe.includes(" "));
  assert(safe.endsWith("xml/file.xml"));
  return safe;
});

check("unsafe_extensions_are_rejected", () => {
  for (const ext of ["zip", "xlsx", "cer", "key"]) {
    assert.throws(() => makeHumanReadableCfdiFileName({
      date: "2026-06-05",
      client_name: "Cliente Demo",
      draft_id: "DRAFT-1",
      status: "SANDBOX_TIMBRADO",
      extension: ext,
    }), /Extension no permitida/);
  }
  return "zip/xlsx/cer/key";
});

console.log("Sandbox Human-readable Storage Naming Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}
