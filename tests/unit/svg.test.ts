import { describe, expect, it } from "vitest";
import { areaIds, planReport, sanitizeSvg } from "@/lib/svg";

describe("SVG sanitizer (K-01, A-03)", () => {
  it("keeps shapes and ids, removes scripts and handlers", () => {
    const { svg, ids } = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><script>alert(1)</script>` +
        `<rect id="P01" x="0" y="0" width="10" height="10" onclick="alert(1)" fill="url(http://evil)"/>` +
        `<g data-cell-id="P02"><path d="M0 0L1 1" style="fill:red"/></g>` +
        `<switch><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject><text>P01</text></switch>` +
        `<a href="javascript:alert(1)"><text>bad</text></a></svg>`,
    );
    expect(svg).not.toMatch(/script|onclick|evil|foreignObject|javascript|<a/i);
    expect(svg).toContain('id="P01"');
    expect(svg).toContain('data-cell-id="P02"');
    expect(svg).toContain('viewBox="0 0 100 50"');
    expect(svg).toContain("<text>P01</text>");
    expect(ids).toEqual(["P01", "P02"]);
    expect(areaIds(svg)).toEqual(["P01", "P02"]);
  });
  it("rejects DOCTYPE / entity tricks", () => {
    expect(() => sanitizeSvg(`<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>`)).toThrow();
  });
  it("reports mismatches between plan and spots", () => {
    expect(planReport(["P01", "P02", "abc-XYZ_12-3", "P11"], ["P01", "P03"])).toEqual({
      spotsWithoutArea: ["P03"],
      areasWithoutSpot: ["P02", "P11"],
    });
  });
});
