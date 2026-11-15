/**
 * Builds the SVG plans of all garage levels from the Draw.io site plan (K-01). Usage:
 *   npm run plan:build                      # Lageplan.drawio → docs/plans/<level>.svg
 *   npx tsx scripts/drawio-plan.ts <file.drawio> <output directory>
 * Lageplan.drawio is kept out of the repository (.gitignore); the generated plans are committed.
 * The drawing conventions are described in src/lib/drawio.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { drawioToLevels } from "../src/lib/drawio";

const planFileName = (levelName: string) =>
  `${levelName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan"}.svg`;

const [input = "Lageplan.drawio", outDir = path.join("docs", "plans")] = process.argv.slice(2);
const levels = drawioToLevels(fs.readFileSync(input, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
for (const level of levels) {
  const file = path.join(outDir, planFileName(level.name));
  fs.writeFileSync(file, level.svg);
  console.log(`${level.name}: ${level.spots.length} spots (${level.spots[0]}–${level.spots[level.spots.length - 1]}) → ${file}`);
}
