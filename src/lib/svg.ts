import { XMLParser } from "fast-xml-parser";

/**
 * K-01 / A-03: the uploaded garage plan (e.g. Draw.io SVG export) is rendered inline, so it is
 * rebuilt from an allow-list of elements and attributes. Scripts, event handlers, links, images,
 * foreignObject (Draw.io HTML labels) and external references are removed.
 */
const ELEMENTS = new Set([
  "svg", "g", "rect", "path", "polygon", "polyline", "circle", "ellipse", "line", "text", "tspan",
  "title", "desc", "defs", "lineargradient", "radialgradient", "stop", "clippath", "switch",
]);
const DROP_WITH_CHILDREN = new Set(["script", "foreignobject", "style", "image", "use", "a", "iframe", "object", "embed", "animate", "set", "animatetransform", "animatemotion", "metadata"]);
const ATTRIBUTES = new Set([
  "id", "data-cell-id", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "d",
  "points", "transform", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
  "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "opacity", "font-family",
  "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "alignment-baseline", "viewbox",
  "preserveaspectratio", "xmlns", "version", "style", "clip-path", "offset", "stop-color", "stop-opacity",
  "gradientunits", "gradienttransform", "visibility", "display", "dx", "dy", "letter-spacing",
  "text-decoration", "vector-effect", "shape-rendering", "pointer-events",
]);
const CASE: Record<string, string> = {
  viewbox: "viewBox", preserveaspectratio: "preserveAspectRatio", gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform", lineargradient: "linearGradient", radialgradient: "radialGradient", clippath: "clipPath",
};
const MAX_BYTES = 2 * 1024 * 1024;

function safeValue(name: string, value: string): string | null {
  const v = value.trim();
  if (/javascript:|data:|expression\s*\(|@import|<|behavior\s*:/i.test(v)) return null;
  if (/url\s*\(/i.test(v)) {
    // Only local references such as url(#gradient) are allowed.
    const all = v.match(/url\s*\(([^)]*)\)/gi) ?? [];
    if (!all.every((u) => /^url\s*\(\s*['"]?#[\w.-]+['"]?\s*\)$/i.test(u))) return null;
  }
  if (name === "style" && v.length > 2000) return null;
  return v;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type XmlNode = Record<string, unknown> & { ":@"?: Record<string, string> };

export interface SanitizedSvg {
  svg: string;
  ids: string[];
}

export class SvgError extends Error {}

export function sanitizeSvg(input: string): SanitizedSvg {
  if (Buffer.byteLength(input) > MAX_BYTES) throw new SvgError("tooLarge");
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) throw new SvgError("doctype");
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    processEntities: false,
    htmlEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
  });
  let tree: XmlNode[];
  try {
    tree = parser.parse(input) as XmlNode[];
  } catch {
    throw new SvgError("invalid");
  }
  const ids: string[] = [];

  const render = (nodes: XmlNode[]): string => {
    let out = "";
    for (const node of nodes) {
      if ("#text" in node) {
        out += esc(String(node["#text"]).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
        continue;
      }
      const tag = Object.keys(node).find((k) => k !== ":@");
      if (!tag) continue;
      const lower = tag.toLowerCase().replace(/^svg:/, "");
      const children = (node[tag] as XmlNode[]) ?? [];
      if (DROP_WITH_CHILDREN.has(lower)) continue;
      if (!ELEMENTS.has(lower)) {
        out += render(children); // unknown wrapper: keep allowed content only
        continue;
      }
      const attrs = node[":@"] ?? {};
      let attrText = "";
      for (const [rawName, rawValue] of Object.entries(attrs)) {
        const name = rawName.toLowerCase();
        if (!ATTRIBUTES.has(name) || name.startsWith("on")) continue;
        const value = safeValue(name, String(rawValue));
        if (value === null) continue;
        if (name === "xmlns" && value !== "http://www.w3.org/2000/svg") continue;
        if ((name === "id" || name === "data-cell-id") && value) ids.push(value);
        attrText += ` ${CASE[name] ?? name}="${esc(value)}"`;
      }
      if (lower === "svg" && !/ viewBox=/.test(attrText)) {
        const w = parseFloat(String(attrs.width ?? ""));
        const h = parseFloat(String(attrs.height ?? ""));
        if (w > 0 && h > 0) attrText += ` viewBox="0 0 ${w} ${h}"`;
      }
      const el = CASE[lower] ?? lower;
      out += `<${el}${attrText}>${render(children)}</${el}>`;
    }
    return out;
  };

  const svg = render(tree).trim();
  if (!svg.startsWith("<svg")) throw new SvgError("noSvgRoot");
  return { svg, ids: Array.from(new Set(ids)) };
}

/** IDs (and Draw.io cell ids) of an already sanitized plan, without parsing it again. */
export function areaIds(sanitizedSvg: string): string[] {
  const ids = new Set<string>();
  for (const m of sanitizedSvg.matchAll(/ (?:id|data-cell-id)="([^"]+)"/g)) {
    ids.add(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  }
  return Array.from(ids);
}

/** IDs that look like plan numbers (filters Draw.io's generated cell ids for the A-03 report). */
export function looksLikePlanNumber(id: string): boolean {
  return /^[A-Za-z]{0,4}[-_ ]?\d{1,4}[A-Za-z]?$/.test(id);
}

export function planReport(svgIds: string[], planNumbers: string[]) {
  const idSet = new Set(svgIds);
  const numSet = new Set(planNumbers);
  return {
    spotsWithoutArea: planNumbers.filter((n) => !idSet.has(n)),
    areasWithoutSpot: svgIds.filter((id) => looksLikePlanNumber(id) && !numSet.has(id)),
  };
}
