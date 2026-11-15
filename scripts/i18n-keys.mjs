// Lists translation keys used in the source and checks them against messages/<locale>/*.json (L-02).
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f)) files.push(p);
  }
})(path.join(root, "src"));

const used = new Map(); // ns -> Set(keys)
const dynamic = [];
const add = (ns, key) => {
  if (!used.has(ns)) used.set(ns, new Set());
  used.get(ns).add(key);
};
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const vars = new Map();
  for (const m of src.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\("(\w+)"\)/g)) vars.set(m[1], m[2]);
  for (const m of src.matchAll(/const (\w+) = translatorFor\([^,]+, "(\w+)"\)/g)) vars.set(m[1], m[2]);
  for (const [v, ns] of vars) {
    const re = new RegExp(`(?<![\\w.])${v}\\(\\s*(["'\`])([^"'\`]+)\\1`, "g");
    for (const m of src.matchAll(re)) {
      if (m[2].includes("${")) dynamic.push(`${path.relative(root, file)}: ${ns}.${m[2]}`);
      else add(ns, m[2]);
    }
  }
  // errors / messages keys from action results
  for (const m of src.matchAll(/new AppError\(\s*"([^"]+)"/g)) add("errors", m[1]);
  if (!file.includes("/lib/domain/")) for (const m of src.matchAll(/error: "([^"]+)"/g)) add("errors", m[1]);
  for (const m of src.matchAll(/message: "([^"]+)"/g)) add("messages", m[1]);
  // notify(..., "type", ...) and tr("...") in notification extras
  for (const m of src.matchAll(/notify(?:Admins)?\([^,]+?,\s*"(\w+)"/g)) { add("notifications", `${m[1]}.subject`); add("notifications", `${m[1]}.body`); }
  for (const m of src.matchAll(/notifyAdmins\(\s*"(\w+)"/g)) { add("notifications", `${m[1]}.subject`); add("notifications", `${m[1]}.body`); }
  for (const m of src.matchAll(/\b(?:tr|t)\("(\w+)"(?=[,)])/g)) if (/notif|service|payments\/service|booking\/service/.test(file)) add("notifications", m[1]);
  for (const m of src.matchAll(/alertAdmins\(\s*"(\w+)"/g)) { add("notifications", `admin.${m[1]}.subject`); add("notifications", `admin.${m[1]}.body`); }
}

function get(obj, key) {
  return key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}
const check = process.argv.includes("--check");
let missing = 0;
for (const locale of ["de", "en"]) {
  const dir = path.join(root, "messages", locale);
  const msgs = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) msgs[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const [ns, keys] of used) {
    for (const k of keys) {
      if (get(msgs[ns], k) === undefined) {
        missing++;
        if (check) console.log(`missing ${locale}: ${ns}.${k}`);
      }
    }
  }
}
if (!check) {
  for (const [ns, keys] of [...used].sort()) console.log(`${ns}: ${[...keys].sort().join(", ")}`);
  console.log("\nDYNAMIC:\n" + dynamic.join("\n"));
} else {
  console.log(missing ? `${missing} missing` : "all keys present");
  process.exit(missing ? 1 : 0);
}
