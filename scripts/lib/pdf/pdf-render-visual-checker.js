const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "../../..");
const runtimeRoot = path.join(repoRoot, "runtime");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeId(value, fallback = "pdf-render") {
  return String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || fallback;
}

function defaultOutputDir() {
  return path.join(runtimeRoot, "pdf-render-diagnostics", "scratch");
}

function ensureRuntimeDir(outputDir) {
  const resolved = path.resolve(outputDir || defaultOutputDir());
  if (!isInside(runtimeRoot, resolved)) throw new Error("pdf render outputDir fuera de runtime/.");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function commandAvailable(command, timeoutMs = 1500) {
  const result = spawnSync(command, ["-h"], { encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  return !result.error || result.error.code !== "ENOENT";
}

function parsePpm(buffer) {
  const raw = Buffer.isBuffer(buffer) ? buffer : fs.readFileSync(buffer);
  let offset = 0;
  function readToken() {
    while (offset < raw.length) {
      const byte = raw[offset];
      if (byte === 0x23) {
        while (offset < raw.length && raw[offset] !== 0x0a) offset += 1;
      } else if (/\s/.test(String.fromCharCode(byte))) {
        offset += 1;
      } else {
        break;
      }
    }
    const start = offset;
    while (offset < raw.length && !/\s/.test(String.fromCharCode(raw[offset]))) offset += 1;
    return raw.toString("ascii", start, offset);
  }
  const magic = readToken();
  const width = Number(readToken());
  const height = Number(readToken());
  const maxValue = Number(readToken());
  while (offset < raw.length && /\s/.test(String.fromCharCode(raw[offset]))) offset += 1;
  if (magic !== "P6" || !Number.isFinite(width) || !Number.isFinite(height) || maxValue <= 0) {
    throw new Error("PPM_UNSUPPORTED");
  }
  const data = raw.subarray(offset);
  const pixelCount = width * height;
  let nonWhite = 0;
  for (let index = 0; index + 2 < data.length && index / 3 < pixelCount; index += 3) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    if (r < 248 || g < 248 || b < 248) nonWhite += 1;
  }
  return {
    width,
    height,
    pixel_count: pixelCount,
    non_white_pixel_count: nonWhite,
    non_white_pixel_ratio: pixelCount ? nonWhite / pixelCount : 0,
    white_pixel_ratio: pixelCount ? (pixelCount - nonWhite) / pixelCount : 1,
  };
}

function renderWithPdftoppm(pdfPath, outputDir, timeoutMs) {
  const prefix = path.join(outputDir, `page-${Date.now()}`);
  const result = spawnSync("pdftoppm", [
    "-f", "1",
    "-l", "1",
    "-r", "72",
    "-singlefile",
    pdfPath,
    prefix,
  ], { encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `pdftoppm exited ${result.status}`).trim());
  }
  const ppmPath = `${prefix}.ppm`;
  if (!fs.existsSync(ppmPath)) throw new Error("PDF_RENDER_OUTPUT_MISSING");
  return ppmPath;
}

function detectPdfVisibleContentByRender(options = {}) {
  const outputDir = ensureRuntimeDir(options.outputDir);
  const timeoutMs = Number(options.timeoutMs || 10000);
  const threshold = Number(options.nonWhiteRatioMin || process.env.PDF_RENDER_NON_WHITE_RATIO_MIN || 0.001);
  const warnings = [];
  const errors = [];
  let pdfPath = text(options.pdfPath);
  let tempPdfPath = null;
  try {
    if (!pdfPath && options.pdfBuffer) {
      tempPdfPath = path.join(outputDir, `input-${safeId(options.id || Date.now())}.pdf`);
      fs.writeFileSync(tempPdfPath, Buffer.from(options.pdfBuffer));
      pdfPath = tempPdfPath;
    }
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return {
        ok: false,
        render_check_executed: false,
        render_check_available: false,
        render_status: "FAILED",
        page_count_checked: 0,
        non_white_pixel_ratio: null,
        non_white_pixel_count: null,
        white_pixel_ratio: null,
        rendered_png_path: null,
        rendered_image_path: null,
        errors: ["PDF_RENDER_INPUT_MISSING"],
        warnings,
      };
    }

    let renderedPath = null;
    if (typeof options.renderToPpm === "function") {
      renderedPath = options.renderToPpm({ pdfPath, outputDir, timeoutMs });
    } else if (commandAvailable("pdftoppm", Math.min(timeoutMs, 1500))) {
      renderedPath = renderWithPdftoppm(pdfPath, outputDir, timeoutMs);
    } else {
      return {
        ok: false,
        render_check_executed: false,
        render_check_available: false,
        render_status: "UNAVAILABLE",
        page_count_checked: 0,
        non_white_pixel_ratio: null,
        non_white_pixel_count: null,
        white_pixel_ratio: null,
        rendered_png_path: null,
        rendered_image_path: null,
        errors: [],
        warnings: ["PDF_RENDER_CHECK_UNAVAILABLE"],
      };
    }

    const pixels = parsePpm(renderedPath);
    const visible = pixels.non_white_pixel_ratio > threshold;
    return {
      ok: visible,
      render_check_executed: true,
      render_check_available: true,
      render_status: visible ? "VISIBLE" : "BLANK",
      page_count_checked: 1,
      non_white_pixel_ratio: pixels.non_white_pixel_ratio,
      non_white_pixel_count: pixels.non_white_pixel_count,
      white_pixel_ratio: pixels.white_pixel_ratio,
      rendered_png_path: renderedPath,
      rendered_image_path: renderedPath,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      render_check_executed: true,
      render_check_available: true,
      render_status: "FAILED",
      page_count_checked: 0,
      non_white_pixel_ratio: null,
      non_white_pixel_count: null,
      white_pixel_ratio: null,
      rendered_png_path: null,
      rendered_image_path: null,
      errors: ["PDF_RENDER_FAILED"],
      warnings: [String(error.message || error).slice(0, 160)],
    };
  } finally {
    if (tempPdfPath && options.debug !== true) {
      try { fs.unlinkSync(tempPdfPath); } catch (_error) {}
    }
  }
}

module.exports = {
  detectPdfVisibleContentByRender,
  parsePpm,
};
