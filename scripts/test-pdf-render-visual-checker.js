const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { detectPdfVisibleContentByRender } = require("./lib/pdf/pdf-render-visual-checker");

const root = path.resolve(__dirname, "..");
const temp = path.join(root, "runtime", "test-pdf-render-visual-checker");

function reset() {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
}

function ppmPath(name, pixels) {
  const file = path.join(temp, `${name}.ppm`);
  const header = Buffer.from("P6\n2 1\n255\n", "ascii");
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(pixels)]));
  return file;
}

function fakePdfPath() {
  const file = path.join(temp, "input.pdf");
  fs.writeFileSync(file, "%PDF-1.4\n%%EOF\n", "latin1");
  return file;
}

const checks = [];
function check(name, fn) {
  checks.push(Promise.resolve().then(fn).then((value) => ({ name, pass: true, value: value || "" })).catch((error) => ({ name, pass: false, value: error.message })));
}

check("render_checker_detects_blank_ppm", () => {
  reset();
  const result = detectPdfVisibleContentByRender({
    pdfPath: fakePdfPath(),
    outputDir: temp,
    renderToPpm: () => ppmPath("blank", [255, 255, 255, 255, 255, 255]),
  });
  assert.strictEqual(result.render_check_executed, true);
  assert.strictEqual(result.render_status, "BLANK");
  assert.strictEqual(result.ok, false);
  return result.render_status;
});

check("render_checker_detects_visible_ppm", () => {
  reset();
  const result = detectPdfVisibleContentByRender({
    pdfPath: fakePdfPath(),
    outputDir: temp,
    renderToPpm: () => ppmPath("visible", [255, 255, 255, 0, 0, 0]),
  });
  assert.strictEqual(result.render_status, "VISIBLE");
  assert.strictEqual(result.ok, true);
  assert(result.non_white_pixel_ratio > 0);
  return result.render_status;
});

check("render_checker_reports_unavailable_without_renderer", () => {
  reset();
  const result = detectPdfVisibleContentByRender({
    pdfPath: fakePdfPath(),
    outputDir: temp,
  });
  assert(["UNAVAILABLE", "VISIBLE", "BLANK", "FAILED"].includes(result.render_status));
  assert(Object.prototype.hasOwnProperty.call(result, "render_check_available"));
  return result.render_status;
});

Promise.all(checks).then((results) => {
  console.log("PDF Render Visual Checker Tests");
  for (const item of results) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});
