import fs from "node:fs";
import path from "node:path";
import type { Locale } from "./config";

type Messages = Record<string, unknown>;
const cache = new Map<Locale, Messages>();

/** L-02: all texts live in messages/<locale>/<namespace>.json */
export function loadMessages(locale: Locale): Messages {
  const cached = cache.get(locale);
  if (cached && process.env.NODE_ENV === "production") return cached;
  const dir = path.join(process.cwd(), "messages", locale);
  const result: Messages = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    result[file.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  cache.set(locale, result);
  return result;
}
