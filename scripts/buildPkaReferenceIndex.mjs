// Builds the optional experimental-pKa reference index from the IUPAC Digitized pKa Dataset.
//
//   node scripts/buildPkaReferenceIndex.mjs [--csv path/to/iupac_high-confidence_v2_4.csv] [--out public/data/pka-reference.index.json]
//
// Without --csv the CSV is downloaded from https://github.com/IUPAC/Dissociation-Constants (Zenodo record 22878440)
// into node_modules/.cache/pka-raw/ (never into the source tree).
//
// LICENSE: the dataset is CC BY-NC 4.0, "Reproduced by permission of the International Union of Pure and Applied
// Chemistry". The generated index is a derivative: it is git-ignored and must not be redistributed commercially.
// Delete public/data/pka-reference.index.json before any commercial build; the application then simply shows no
// experimental values.
//
// Identity: every structure is canonicalised with the project's local RDKit (same canonical SMILES the application
// computes), so lookups are by chemical structure, never by name. Output is deterministic (sorted keys and records).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadEngine, loadModule, closeEngine, getRdkit } from "./tests/engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const outFile = path.resolve(root, arg("--out", "public/data/pka-reference.index.json"));
const cacheDir = path.join(root, "node_modules", ".cache", "pka-raw");
let csvPath = arg("--csv", null);
const CSV_URL = "https://raw.githubusercontent.com/IUPAC/Dissociation-Constants/main/iupac_high-confidence_v2_4.csv";

if (!csvPath) {
  csvPath = path.join(cacheDir, "iupac_high-confidence_v2_4.csv");
  if (!fs.existsSync(csvPath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${CSV_URL}`);
    fs.writeFileSync(csvPath, Buffer.from(await response.arrayBuffer()));
  }
}
const raw = fs.readFileSync(csvPath);
const sha256 = crypto.createHash("sha256").update(raw).digest("hex");

function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

await loadEngine();
const { pkaKeys } = await loadModule("/src/utils/pkaReference.ts");
const rdkit = await getRdkit();

const [header, ...rows] = parseCsv(raw.toString("utf8"));
const col = Object.fromEntries(header.map((name, i) => [name, i]));
const TYPE = /^pK(a|aH|b)(\d+)$/;
const stats = { rows: rows.length, kept: 0, badStructure: 0, generic: 0, nonNumeric: 0, otherType: 0, otherTypes: {} };
const entries = new Map();

for (const r of rows) {
  const type = r[col.pka_type];
  const m = TYPE.exec(type);
  if (!m) { stats.otherType++; stats.otherTypes[type] = (stats.otherTypes[type] ?? 0) + 1; continue; }
  const value = Number(r[col.pka_value]);
  if (!r[col.pka_value] || !Number.isFinite(value)) { stats.nonNumeric++; continue; }
  const keys = pkaKeys(rdkit, r[col.SMILES]);
  if (!keys) { stats.badStructure++; continue; }
  if (keys.generic) { stats.generic++; continue; }
  const t = r[col.T] !== "" && Number.isFinite(Number(r[col.T])) ? Number(r[col.T]) : null;
  const conditions = [r[col.cosolvent], r[col.pressure]].filter(Boolean).join("; ");
  const code = m[1] === "a" ? "a" : m[1] === "aH" ? "h" : "b";
  const entry = entries.get(keys.iso) ?? { s: keys.iso === keys.flat ? 0 : 1, r: [] };
  entry.r.push([`${code}${m[2]}`, value, t, r[col.assessment], r[col.ref], conditions]);
  entries.set(keys.iso, entry);
  stats.kept++;
}

const sortRecords = (a, b) => a[0].localeCompare(b[0]) || (a[2] ?? 1e9) - (b[2] ?? 1e9) || a[1] - b[1] || a[4].localeCompare(b[4]);
const e = {};
for (const key of [...entries.keys()].sort()) { const entry = entries.get(key); entry.r.sort(sortRecords); e[key] = entry; }

const index = {
  v: 1,
  source: {
    name: "IUPAC Digitized pKa Dataset",
    version: "v2.4a",
    license: "CC BY-NC 4.0 (non-commercial)",
    url: "https://doi.org/10.5281/zenodo.7236452",
    doi: "10.1039/D6RA02418A",
    attribution: "Reproduced by permission of the International Union of Pure and Applied Chemistry. Zheng, Lafontant-Joseph (2026), IUPAC Digitized pKa Dataset v2.4a.",
    csvSha256: sha256,
  },
  e,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(index));
await closeEngine();
console.log(JSON.stringify({ ...stats, molecules: entries.size, outFile: path.relative(root, outFile), bytes: fs.statSync(outFile).size, sha256 }, null, 1));
