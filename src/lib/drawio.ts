import { inflateRawSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

/**
 * K-01: turns a Draw.io site plan (.drawio) into one clean SVG per garage level.
 *
 * Conventions of the drawing (layer names are matched case-insensitively):
 * - Layer "Layout": walls are lines; a dashed line separates two levels drawn on the same page;
 *   a text box in each part names the level (e.g. "UG -1"); hatched boxes are keep-clear areas;
 *   arrow shapes mark the driveway. Other boxes (e.g. utility rooms) are left out.
 * - Layer "Säulen" (or "Pillars"): pillars.
 * - Layer "Parkplätze" (or "Spots"): one box per spot, its label is the plan number.
 * All other layers (e.g. the wallbox installation) and everything outside the walls (legend)
 * are ignored. Each spot becomes a <rect id="plan number">, which the map colours and links.
 */
export class DrawioError extends Error {}

export interface PlanLevel {
  name: string;
  svg: string;
  spots: string[];
}

const MAX_BYTES = 2 * 1024 * 1024;
/** Drawing units → SVG units, so that stroke widths of the map styles fit the spot size. */
const SCALE = 0.5;
const MARGIN = 200;
const PADDING = 30;
const PLAN_NUMBER = /^[A-Za-z0-9_-]{1,20}$/;
const LAYER = { layout: /^layout$/i, pillars: /^(säulen|saeulen|pillars)$/i, spots: /^(parkplätze|parkplaetze|stellplätze|stellplaetze|spots)$/i };

interface Box { x: number; y: number; w: number; h: number }
interface Cell {
  parent: string;
  value: string;
  style: Map<string, string>;
  vertex: boolean;
  edge: boolean;
  box: Box | null;
  points: [number, number][];
}
type Xml = Record<string, unknown>;

const list = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Draw.io labels are HTML snippets; only their text is used. */
function labelText(raw: unknown): string {
  return decodeEntities(decodeEntities(String(raw ?? "")).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseStyle(raw: unknown): Map<string, string> {
  const style = new Map<string, string>();
  for (const part of String(raw ?? "").split(";")) {
    if (!part) continue;
    const i = part.indexOf("=");
    if (i < 0) style.set(part, "");
    else style.set(part.slice(0, i), part.slice(i + 1));
  }
  return style;
}

function readCell(cell: Xml, wrapper?: Xml): { id: string; cell: Cell } {
  const geo = cell.mxGeometry as Xml | undefined;
  const points: [number, number][] = [];
  let box: Box | null = null;
  if (geo) {
    const pts = list(geo.mxPoint as Xml | Xml[]);
    const at = (role: string) => pts.find((p) => p.as === role);
    const waypoints = list((geo.Array as Xml | undefined)?.mxPoint as Xml | Xml[]);
    for (const p of [at("sourcePoint"), ...waypoints, at("targetPoint")]) if (p) points.push([num(p.x), num(p.y)]);
    box = { x: num(geo.x), y: num(geo.y), w: num(geo.width), h: num(geo.height) };
  }
  return {
    id: String(wrapper?.id ?? cell.id ?? ""),
    cell: {
      parent: String(cell.parent ?? ""),
      value: labelText(wrapper?.label ?? cell.value),
      style: parseStyle(cell.style),
      vertex: cell.vertex === "1",
      edge: cell.edge === "1",
      box,
      points,
    },
  };
}

function parsePages(input: string): Xml[] {
  if (Buffer.byteLength(input) > MAX_BYTES) throw new DrawioError("tooLarge");
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) throw new DrawioError("doctype");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    processEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
  });
  const parse = (xml: string): Xml => {
    try {
      return parser.parse(xml) as Xml;
    } catch {
      throw new DrawioError("invalid");
    }
  };
  const doc = parse(input);
  const diagrams = list((doc.mxfile as Xml | undefined)?.diagram as Xml | string | (Xml | string)[]);
  if (!doc.mxfile && doc.mxGraphModel) return [doc.mxGraphModel as Xml];
  const pages: Xml[] = [];
  for (const d of diagrams) {
    if (typeof d === "object" && d.mxGraphModel) {
      pages.push(d.mxGraphModel as Xml);
      continue;
    }
    // Compressed page: base64 → raw deflate → URL-encoded XML
    const text = typeof d === "string" ? d : String(d["#text"] ?? "");
    try {
      const xml = decodeURIComponent(inflateRawSync(Buffer.from(text.trim(), "base64")).toString("utf8"));
      const model = parse(xml).mxGraphModel as Xml | undefined;
      if (model) pages.push(model);
    } catch (e) {
      if (e instanceof DrawioError) throw e;
      throw new DrawioError("invalid");
    }
  }
  if (!pages.length) throw new DrawioError("invalid");
  return pages;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const center = (b: Box): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];

function levelsOfPage(model: Xml): PlanLevel[] {
  const root = (model.root ?? {}) as Xml;
  const cells = new Map<string, Cell>();
  for (const c of list(root.mxCell as Xml | Xml[])) {
    const { id, cell } = readCell(c);
    cells.set(id, cell);
  }
  for (const tag of ["object", "UserObject"]) {
    for (const w of list(root[tag] as Xml | Xml[])) {
      for (const c of list(w.mxCell as Xml | Xml[])) {
        const { id, cell } = readCell(c, w);
        cells.set(id, cell);
      }
    }
  }
  const layerOf = (pattern: RegExp) => {
    const ids = new Set([...cells].filter(([, c]) => c.parent === "0" && pattern.test(c.value)).map(([id]) => id));
    return [...cells.values()].filter((c) => ids.has(c.parent));
  };
  const layout = layerOf(LAYER.layout);
  const spotCells = layerOf(LAYER.spots).filter((c) => c.vertex && c.box && PLAN_NUMBER.test(c.value));
  if (!spotCells.length) return [];

  const lines = layout.filter((c) => c.edge && c.points.length >= 2);
  const walls = lines.filter((c) => c.style.get("dashed") !== "1");
  const separators = lines.filter((c) => c.style.get("dashed") === "1").map((c) => (c.points[0][1] + c.points[c.points.length - 1][1]) / 2).sort((a, b) => a - b);
  const boxes = layout.filter((c) => c.vertex && c.box);
  const isText = (c: Cell) => c.style.has("text");
  const isArrow = (c: Cell) => /arrow/i.test(c.style.get("shape") ?? "");
  const isHatched = (c: Cell) => /hatch/i.test(c.style.get("fillStyle") ?? "");

  const bands = separators.length ? [-Infinity, ...separators, Infinity] : [-Infinity, Infinity];
  const levels: PlanLevel[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const inBand = (y: number) => y > bands[i] && y <= bands[i + 1];
    const levelWalls = walls.filter((c) => inBand((c.points[0][1] + c.points[c.points.length - 1][1]) / 2));
    const levelSpots = spotCells.filter((c) => inBand(center(c.box!)[1]));
    // Everything belonging to the level lies inside (or close to) its walls; the legend does not.
    const anchor = (levelWalls.length ? levelWalls.flatMap((c) => c.points) : levelSpots.flatMap((c) => [[c.box!.x, c.box!.y], [c.box!.x + c.box!.w, c.box!.y + c.box!.h]])) as [number, number][];
    if (!anchor.length) continue;
    const ax0 = Math.min(...anchor.map((p) => p[0])) - MARGIN;
    const ax1 = Math.max(...anchor.map((p) => p[0])) + MARGIN;
    const inside = (c: Cell) => {
      const [cx, cy] = center(c.box!);
      return inBand(cy) && cx >= ax0 && cx <= ax1;
    };
    const spots = levelSpots.filter(inside);
    if (!spots.length) continue;
    const title = boxes.find((c) => isText(c) && c.value && inBand(center(c.box!)[1]));
    const name = title?.value ?? (bands.length > 2 ? `Ebene ${i + 1}` : "Tiefgarage");
    const deco = boxes.filter((c) => !isText(c) && inside(c));
    const arrows = deco.filter(isArrow);
    const hatched = deco.filter((c) => !isArrow(c) && isHatched(c));
    const pillars = layerOf(LAYER.pillars).filter((c) => c.vertex && c.box && inside(c));

    // Bounding box of everything that is drawn
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of levelWalls) for (const [x, y] of c.points) { xs.push(x - 10, x + 10); ys.push(y - 10, y + 10); }
    for (const c of [...spots, ...arrows, ...hatched, ...pillars]) { xs.push(c.box!.x, c.box!.x + c.box!.w); ys.push(c.box!.y, c.box!.y + c.box!.h); }
    const minX = Math.min(...xs) - PADDING;
    const minY = Math.min(...ys) - PADDING;
    const r = (v: number) => String(Math.round(v * 100) / 100);
    const X = (x: number) => r((x - minX) * SCALE);
    const Y = (y: number) => r((y - minY) * SCALE);
    const L = (v: number) => r(v * SCALE);
    const width = r((Math.max(...xs) + PADDING - minX) * SCALE);
    const height = r((Math.max(...ys) + PADDING - minY) * SCALE);
    const rect = (b: Box, attrs: string) => `<rect x="${X(b.x)}" y="${Y(b.y)}" width="${L(b.w)}" height="${L(b.h)}" ${attrs}/>`;

    const out: string[] = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`);
    out.push(`<title>${esc(name)}</title>`);
    out.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc"/>`);
    for (const c of hatched) {
      const b = c.box!;
      out.push(rect(b, `rx="6" fill="#e2e8f0"`));
      let d = "";
      for (let t = -b.h + 20; t < b.w; t += 40) {
        const u1 = Math.max(t, 0);
        const u2 = Math.min(t + b.h, b.w);
        if (u2 > u1) d += `M${X(b.x + u1)} ${Y(b.y + b.h - (u1 - t))}L${X(b.x + u2)} ${Y(b.y + b.h - (u2 - t))}`;
      }
      out.push(`<path d="${d}" stroke="#94a3b8" stroke-width="2" fill="none"/>`);
    }
    for (const c of arrows) {
      const b = c.box!;
      const dx = Math.min(num(c.style.get("dx")) || b.w * 0.3, b.w);
      const notch = Math.min(num(c.style.get("notch")), b.w - dx);
      const local: [number, number][] = [[0, 0], [b.w - dx, 0], [b.w, b.h / 2], [b.w - dx, b.h], [0, b.h], [notch, b.h / 2]];
      const [cx, cy] = center(b);
      const rotation = num(c.style.get("rotation"));
      out.push(`<polygon points="${local.map(([x, y]) => `${X(b.x + x)},${Y(b.y + y)}`).join(" ")}"${rotation ? ` transform="rotate(${r(rotation)} ${X(cx)} ${Y(cy)})"` : ""} fill="#cbd5e1" pointer-events="none"/>`);
    }
    out.push(`<path d="${levelWalls.map((c) => c.points.map(([x, y], k) => `${k ? "L" : "M"}${X(x)} ${Y(y)}`).join("")).join("")}" stroke="#334155" stroke-width="${L(20)}" stroke-linecap="square" stroke-linejoin="round" fill="none"/>`);
    const sorted = [...spots].sort((a, b) => a.value.localeCompare(b.value, "en", { numeric: true }));
    for (const c of sorted) out.push(rect(c.box!, `id="${esc(c.value)}" rx="6" fill="#ffffff" stroke="#475569" stroke-width="2"`));
    for (const c of pillars) out.push(rect(c.box!, `rx="${L(Math.min(c.box!.w, c.box!.h) / 2)}" fill="#64748b" pointer-events="none"`));
    for (const c of sorted) {
      const [cx, cy] = center(c.box!);
      out.push(`<text x="${X(cx)}" y="${Y(cy)}" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="bold" fill="#0f172a" pointer-events="none">${esc(c.value)}</text>`);
    }
    out.push("</svg>");
    levels.push({ name, svg: out.join("\n") + "\n", spots: sorted.map((c) => c.value) });
  }
  return levels;
}

/** Converts a .drawio file into one SVG plan per level, in drawing order (top to bottom). */
export function drawioToLevels(input: string): PlanLevel[] {
  const levels = parsePages(input).flatMap(levelsOfPage);
  if (!levels.length) throw new DrawioError("noSpots");
  const names = new Set<string>();
  const numbers = new Set<string>();
  for (const level of levels) {
    if (names.has(level.name)) throw new DrawioError("duplicateLevel");
    names.add(level.name);
    for (const n of level.spots) {
      if (numbers.has(n)) throw new DrawioError("duplicateSpot");
      numbers.add(n);
    }
  }
  return levels;
}

export function looksLikeDrawio(input: string): boolean {
  return /<mxfile[\s>]|<mxGraphModel[\s>]/.test(input.slice(0, 2000));
}
