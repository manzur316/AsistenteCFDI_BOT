const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { detectPdfVisibleContentByRender } = require("./lib/pdf/pdf-render-visual-checker");

const root = path.resolve(__dirname, "..");
const temp = path.join(root, "runtime", "test-pdf-render-check-visible");
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
const pdf = path.join(temp, "input.pdf");
const ppm = path.join(temp, "visible.ppm");
fs.writeFileSync(pdf, "%PDF-1.4\n%%EOF\n", "latin1");
fs.writeFileSync(ppm, Buffer.concat([Buffer.from("P6\n1 1\n255\n", "ascii"), Buffer.from([0, 0, 0])]));
const result = detectPdfVisibleContentByRender({ pdfPath: pdf, outputDir: temp, renderToPpm: () => ppm });
assert.strictEqual(result.render_status, "VISIBLE");
assert.strictEqual(result.ok, true);
console.log("PDF Render Visible Page Detected Test");
console.log(" - visible_page_detected: PASS (VALID)");
console.log("\nPASS total: 1/1");
