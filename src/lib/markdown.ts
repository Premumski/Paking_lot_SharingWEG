/**
 * Minimal, safe Markdown subset for admin-maintained texts (contract, imprint, privacy):
 * #, ##, ### headings, paragraphs, "- " lists and **bold**. No HTML is ever interpreted.
 */
export type Inline = { text: string; bold: boolean };
export type Block = { type: "h1" | "h2" | "h3" | "p" | "li"; inline: Inline[] };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) out.push({ text: p.slice(2, -2), bold: true });
    else out.push({ text: p, bold: false });
  }
  return out;
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", inline: parseInline(para.join(" ")) });
    para = [];
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: (`h${h[1].length}` as Block["type"]), inline: parseInline(h[2]) });
    } else if (/^\s*[-*]\s+/.test(line)) {
      flush();
      blocks.push({ type: "li", inline: parseInline(line.replace(/^\s*[-*]\s+/, "")) });
    } else if (line.trim() === "") {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** Replaces {{placeholder}} with values; unknown placeholders stay visible. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

export const CONTRACT_PLACEHOLDERS = [
  "owner_name",
  "owner_apartment",
  "tenant_name",
  "tenant_apartment",
  "spot_number",
  "spot_label",
  "start",
  "end",
  "price",
  "visitor_name",
  "license_plate",
  "booking_id",
  "date",
] as const;
