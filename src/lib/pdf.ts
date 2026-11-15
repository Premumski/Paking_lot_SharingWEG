import PDFDocument from "pdfkit";
import { parseMarkdown } from "./markdown";

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/** Renders the minimal Markdown subset to a PDF (V-02). Standard fonts cover German umlauts and €. */
export async function markdownToPdf(markdown: string, meta: { title: string; footer: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: meta.title, Creator: "Stellplatz-Sharing" } });
  const done = collect(doc);
  for (const b of parseMarkdown(markdown)) {
    const size = b.type === "h1" ? 18 : b.type === "h2" ? 14 : b.type === "h3" ? 12 : 10.5;
    const heading = b.type.startsWith("h");
    doc.moveDown(heading ? 0.8 : 0.35);
    const prefix = b.type === "li" ? "•  " : "";
    b.inline.forEach((seg, i) => {
      doc
        .font(heading || seg.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .text((i === 0 ? prefix : "") + seg.text, { continued: i < b.inline.length - 1, indent: b.type === "li" ? 10 : 0 });
    });
  }
  doc.moveDown(2).font("Helvetica").fontSize(8).fillColor("#666").text(meta.footer);
  doc.end();
  return done;
}

export interface StatementRow {
  date: string;
  spot: string;
  period: string;
  amount: string;
  fee: string;
  payout: string;
  status: string;
}

/** Z-10: annual statement for owners. */
export async function statementPdf(params: {
  title: string;
  subtitle: string;
  headers: StatementRow;
  rows: StatementRow[];
  totals: string;
  footer: string;
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40 });
  const done = collect(doc);
  doc.font("Helvetica-Bold").fontSize(16).text(params.title);
  doc.font("Helvetica").fontSize(10).text(params.subtitle).moveDown();
  const cols: (keyof StatementRow)[] = ["date", "spot", "period", "amount", "fee", "payout", "status"];
  const widths = [70, 60, 250, 70, 60, 70, 120];
  const row = (r: StatementRow, bold = false) => {
    const y = doc.y;
    let x = doc.page.margins.left;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    cols.forEach((c, i) => {
      doc.text(r[c], x, y, { width: widths[i] - 6 });
      x += widths[i];
    });
    doc.moveDown(0.6);
    doc.x = doc.page.margins.left;
  };
  row(params.headers, true);
  for (const r of params.rows) {
    if (doc.y > doc.page.height - 80) doc.addPage();
    row(r);
  }
  doc.moveDown().font("Helvetica-Bold").fontSize(10).text(params.totals);
  doc.moveDown(2).font("Helvetica").fontSize(8).fillColor("#666").text(params.footer);
  doc.end();
  return done;
}
