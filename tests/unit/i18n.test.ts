import { describe, expect, it } from "vitest";
import { loadMessages } from "@/i18n/messages";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("translations (L-01, L-02)", () => {
  it("German and English have the same keys", () => {
    const de = flatten(loadMessages("de")).sort();
    const en = flatten(loadMessages("en")).sort();
    expect(en.filter((k) => !de.includes(k))).toEqual([]);
    expect(de.filter((k) => !en.includes(k))).toEqual([]);
  });
});
