const fs = require("fs");
const path = require("path");

const { validateSandboxPdfArtifact, validateSandboxXmlArtifact } = require("../sandbox-artifact-content-validator");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || "";
}

function xmlAttr(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(source || "").match(new RegExp(`\\b${escaped}=["']([^"']*)["']`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tagContent(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<[^>]*${tagName}\\b([^>]*)`, "i"));
  return match ? match[1] : "";
}

function allTagContents(xml, tagName) {
  const out = [];
  const regex = new RegExp(`<[^>]*${tagName}\\b([^>]*)`, "ig");
  let match = regex.exec(String(xml || ""));
  while (match) {
    out.push(match[1]);
    match = regex.exec(String(xml || ""));
  }
  return out;
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, (char) => {
      const basic = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return /[^\x20-\x7E]/.test(basic) ? "?" : basic;
    });
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : text(value);
}

function extractCfdiSummary(xmlBuffer) {
  const xml = Buffer.isBuffer(xmlBuffer) ? xmlBuffer.toString("utf8") : String(xmlBuffer || "");
  const comprobante = tagContent(xml, "Comprobante");
  const emisor = tagContent(xml, "Emisor");
  const receptor = tagContent(xml, "Receptor");
  const timbre = tagContent(xml, "TimbreFiscalDigital");
  const conceptos = allTagContents(xml, "Concepto").slice(0, 12).map((attrs) => ({
    descripcion: xmlAttr(attrs, "Descripcion"),
    cantidad: xmlAttr(attrs, "Cantidad"),
    claveUnidad: xmlAttr(attrs, "ClaveUnidad"),
    claveProdServ: xmlAttr(attrs, "ClaveProdServ"),
    valorUnitario: xmlAttr(attrs, "ValorUnitario"),
    importe: xmlAttr(attrs, "Importe"),
  }));
  return {
    emisorNombre: xmlAttr(emisor, "Nombre"),
    emisorRfc: xmlAttr(emisor, "Rfc"),
    receptorNombre: xmlAttr(receptor, "Nombre"),
    receptorRfc: xmlAttr(receptor, "Rfc"),
    serie: xmlAttr(comprobante, "Serie"),
    folio: xmlAttr(comprobante, "Folio"),
    uuid: xmlAttr(timbre, "UUID"),
    fecha: xmlAttr(comprobante, "Fecha"),
    fechaTimbrado: xmlAttr(timbre, "FechaTimbrado"),
    subtotal: xmlAttr(comprobante, "SubTotal"),
    total: xmlAttr(comprobante, "Total"),
    metodoPago: xmlAttr(comprobante, "MetodoPago"),
    formaPago: xmlAttr(comprobante, "FormaPago"),
    usoCfdi: xmlAttr(receptor, "UsoCFDI"),
    lugarExpedicion: xmlAttr(comprobante, "LugarExpedicion"),
    conceptos,
  };
}

function wrapLine(value, max = 86) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function buildLines(summary) {
  const lines = [
    "REPRESENTACION VISUAL LOCAL - FACTURA.COM SANDBOX",
    "CFDI de prueba. No es produccion fiscal real.",
    "",
    `Emisor: ${summary.emisorNombre || "N/D"}  RFC: ${summary.emisorRfc || "N/D"}`,
    `Receptor: ${summary.receptorNombre || "N/D"}  RFC: ${summary.receptorRfc || "N/D"}`,
    `Serie/Folio: ${[summary.serie, summary.folio].filter(Boolean).join("-") || "N/D"}`,
    `UUID: ${summary.uuid || "N/D"}`,
    `Fecha: ${summary.fecha || "N/D"}  Timbrado: ${summary.fechaTimbrado || "N/D"}`,
    `Metodo pago: ${summary.metodoPago || "N/D"}  Forma pago: ${summary.formaPago || "N/D"}  Uso CFDI: ${summary.usoCfdi || "N/D"}`,
    `Lugar expedicion: ${summary.lugarExpedicion || "N/D"}`,
    "",
    "Conceptos:",
  ];
  for (const concept of summary.conceptos) {
    for (const line of wrapLine(`${concept.cantidad || "1"} ${concept.claveUnidad || ""} ${concept.claveProdServ || ""} ${concept.descripcion || "Concepto"}  VU ${money(concept.valorUnitario)}  Importe ${money(concept.importe)}`, 92)) {
      lines.push(`- ${line}`);
    }
  }
  lines.push("");
  lines.push(`Subtotal: ${money(summary.subtotal)}`);
  lines.push("IVA: revisar en XML CFDI validado");
  lines.push(`Total: ${money(summary.total)}`);
  lines.push("");
  lines.push("PDF generado por SATBOT desde XML validado porque el PDF del proveedor sandbox no renderizo contenido visible.");
  lines.push("Borrador sujeto a revision humana. No sustituye contador.");
  return lines;
}

function buildPdfBuffer(lines) {
  const contentLines = ["BT", "/F1 10 Tf", "50 790 Td"];
  let first = true;
  for (const line of lines.slice(0, 60)) {
    if (!first) contentLines.push("0 -14 Td");
    first = false;
    contentLines.push(`(${escapePdfText(line)}) Tj`);
  }
  contentLines.push("ET");
  const stream = `${contentLines.join("\n")}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function renderLocalCfdiPdfFromXml(options = {}) {
  const xmlBuffer = Buffer.isBuffer(options.xmlBuffer)
    ? options.xmlBuffer
    : fs.readFileSync(options.xmlPath);
  const xmlValidation = validateSandboxXmlArtifact(xmlBuffer, { expectedIdentity: options.expectedIdentity });
  if (xmlValidation.ok !== true) {
    return {
      ok: false,
      status: "XML_INVALID_FOR_LOCAL_PDF_RENDER",
      errors: ["XML_INVALID_FOR_LOCAL_PDF_RENDER"],
      xml_validation: xmlValidation,
    };
  }
  const summary = extractCfdiSummary(xmlBuffer);
  const pdfBuffer = buildPdfBuffer(buildLines(summary));
  const validation = validateSandboxPdfArtifact(pdfBuffer, { pdfMinBytes: options.pdfMinBytes || 1024 });
  let outputPath = null;
  if (options.outputPath) {
    outputPath = path.resolve(options.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pdfBuffer);
  }
  return {
    ok: validation.ok === true,
    status: validation.ok === true ? "OK" : "LOCAL_PDF_RENDER_INVALID",
    pdf_source: "LOCAL_RENDERED_FROM_XML",
    output_path: outputPath,
    pdf_buffer: pdfBuffer,
    pdf_size_bytes: pdfBuffer.length,
    pdf_validation: validation,
    summary: {
      serie: summary.serie || null,
      folio: summary.folio || null,
      uuid_present: Boolean(summary.uuid),
      conceptos_count: summary.conceptos.length,
    },
    warnings: [],
    errors: validation.ok === true ? [] : ["LOCAL_PDF_RENDER_INVALID"],
  };
}

module.exports = {
  buildPdfBuffer,
  extractCfdiSummary,
  renderLocalCfdiPdfFromXml,
};
