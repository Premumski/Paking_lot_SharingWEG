import fs from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DrawioError, drawioToLevels, looksLikeDrawio } from "@/lib/drawio";
import { areaIds, looksLikePlanNumber, sanitizeSvg } from "@/lib/svg";

const cell = (id: string, parent: string, value: string, style: string, geo: string) =>
  `<mxCell id="${id}" parent="${parent}" value="${value}" style="${style}" ${style.startsWith("endArrow") ? 'edge="1"' : 'vertex="1"'}>${geo}</mxCell>`;
const box = (x: number, y: number, w = 240, h = 100) => `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`;
const line = (x1: number, y1: number, x2: number, y2: number) =>
  `<mxGeometry relative="1" as="geometry"><mxPoint x="${x1}" y="${y1}" as="sourcePoint"/><mxPoint x="${x2}" y="${y2}" as="targetPoint"/></mxGeometry>`;

const MODEL =
  `<mxGraphModel><root><mxCell id="0"/>` +
  `<mxCell id="lay" parent="0" value="Layout"/><mxCell id="spots" parent="0" value="Parkplätze"/><mxCell id="col" parent="0" value="Säulen"/><mxCell id="el" parent="0" value="Elektroinfrastruktur"/>` +
  cell("w1", "lay", "", "endArrow=none;strokeWidth=20;", line(0, 0, 600, 0)) +
  cell("w2", "lay", "", "endArrow=none;strokeWidth=20;", line(0, 1000, 600, 1000)) +
  cell("sep", "lay", "", "endArrow=none;dashed=1;", line(-500, 500, 900, 500)) +
  cell("t1", "lay", "&lt;b&gt;UG -1&lt;/b&gt;", "text;html=1;", box(-400, 100)) +
  cell("t2", "lay", "&lt;font style=&quot;font-size: 120px;&quot;&gt;UG -2&lt;/font&gt;", "text;html=1;", box(-400, 600)) +
  cell("room", "lay", "Verteiler &amp;amp; Technik", "rounded=0;fillColor=none;strokeWidth=20;", box(300, 600, 100, 200)) +
  cell("a", "spots", "&lt;font&gt;A1&lt;/font&gt;", "rounded=1;", box(20, 20)) +
  cell("b", "spots", "A2", "rounded=1;", box(20, 130)) +
  cell("c", "spots", "B1", "rounded=1;", box(20, 620)) +
  cell("legend", "spots", "xxx", "rounded=1;", box(-900, 20)) +
  `<UserObject label="" tags="Säule" id="p1"><mxCell parent="col" style="rounded=1;" vertex="1">${box(100, 120, 50, 20)}</mxCell></UserObject>` +
  cell("wb", "el", "Wallbox", "shape=image;", box(50, 50, 90, 90)) +
  `</root></mxGraphModel>`;
const FILE = `<mxfile host="test"><diagram name="Seite-1" id="d">${MODEL}</diagram></mxfile>`;

describe("Draw.io plan converter (K-01)", () => {
  it("splits the drawing into levels and keeps only layout, pillars and spots", () => {
    const levels = drawioToLevels(FILE);
    expect(levels.map((l) => [l.name, l.spots])).toEqual([["UG -1", ["A1", "A2"]], ["UG -2", ["B1"]]]);
    const [upper, lower] = levels;
    expect(upper.svg).toContain('<rect x="30" y="30" width="120" height="50" id="A1"');
    expect(upper.svg).not.toMatch(/Wallbox|xxx|B1/);
    expect(lower.svg).toContain('id="B1"');
    expect(lower.svg).not.toContain("Verteiler");
  });
  it("produces SVG that passes the sanitizer unchanged in its spot areas", () => {
    for (const level of drawioToLevels(FILE)) {
      const clean = sanitizeSvg(level.svg);
      expect(clean.ids).toEqual(level.spots);
      expect(areaIds(clean.svg)).toEqual(level.spots);
      expect(clean.svg).toContain('pointer-events="none"');
    }
  });
  it("reads compressed pages", () => {
    const packed = deflateRawSync(Buffer.from(encodeURIComponent(MODEL))).toString("base64");
    const levels = drawioToLevels(`<mxfile><diagram name="p">${packed}</diagram></mxfile>`);
    expect(levels.map((l) => l.name)).toEqual(["UG -1", "UG -2"]);
  });
  it("rejects files without spots, duplicates and entity tricks", () => {
    expect(() => drawioToLevels(`<mxfile><diagram><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>`)).toThrow(DrawioError);
    expect(() => drawioToLevels(FILE.replace('value="A2"', 'value="A1"'))).toThrow("duplicateSpot");
    expect(() => drawioToLevels(`<!DOCTYPE x [<!ENTITY a "b">]>${FILE}`)).toThrow("doctype");
    expect(() => drawioToLevels("<svg/>")).toThrow(DrawioError);
    expect(looksLikeDrawio(FILE)).toBe(true);
    expect(looksLikeDrawio(`<svg xmlns="http://www.w3.org/2000/svg"/>`)).toBe(false);
  });
});

describe("Garage plans in docs/plans", () => {
  const source = path.join(process.cwd(), "Lageplan.drawio");
  it.runIf(fs.existsSync(source))("are up to date with Lageplan.drawio (npm run plan:build)", () => {
    const levels = drawioToLevels(fs.readFileSync(source, "utf8"));
    expect(levels.map((l) => [l.name, l.spots.length, l.spots[0], l.spots[l.spots.length - 1]])).toEqual([
      ["UG -1", 24, "501", "524"],
      ["UG -2", 40, "525", "564"],
    ]);
    for (const [level, file] of [[levels[0], "ug-1.svg"], [levels[1], "ug-2.svg"]] as const) {
      expect(fs.readFileSync(path.join(process.cwd(), "docs", "plans", file), "utf8")).toBe(level.svg);
      expect(sanitizeSvg(level.svg).ids.filter(looksLikePlanNumber)).toEqual(level.spots);
    }
  });
});
