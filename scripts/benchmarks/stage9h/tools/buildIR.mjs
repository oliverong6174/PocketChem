// Builds ir.json from saved NIST gas-phase IR (JCAMP) snapshots. Rules in PROTOCOL.md "Infrared".
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { fileURLToPath } from "node:url";
import { getRdkit, closeEngine } from "../../../tests/engine.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)); const base = path.join(here, ".."); const dir = path.join(base, "snapshots", "nist-ir");
const rd = await getRdkit();
const canon = (s) => { const m = rd.get_mol(s); if (!m) return null; try { return m.get_smiles(JSON.stringify({ doIsomericSmiles: false })); } finally { m.delete(); } };
const excl = new Set(JSON.parse(fs.readFileSync(path.join(here, "stage9f-smiles-exclusion.json"), "utf8")).map((s) => { try { return canon(s); } catch { return null; } }).filter(Boolean));
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const tableFile = path.join(base, "snapshots", "wikipedia", "Infrared_spectroscopy_correlation_table.wikitext");
// band definitions: label, table range (cm-1, from the saved Wikipedia correlation table), measured window used to check the reference spectrum, SMARTS of groups that give rise to it
const BANDS = [
  { label: "alcohol/phenol O-H (low concentration)", range: [3610, 3670], window: [3550, 3720], smarts: ["[OX2H][#6;!$(C=O)]"], blockers: ["[OX2H]"] },
  { label: "carboxylic acid O-H (low concentration)", range: [3500, 3560], window: [3450, 3600], smarts: ["[CX3](=O)[OX2H]"], blockers: ["[OX2H]"] },
  { label: "primary amine N-H", range: [3400, 3500], window: [3380, 3520], smarts: ["[NX3H2;!$(NC=O)][#6]"], blockers: ["[NX3;H1,H2]", "[OX2H]"] },
  { label: "carbonyl C=O", range: [1685, 1750], window: [1650, 1800], smarts: ["[CX3]=[OX1]"], blockers: ["[CX3]=[OX1]"] },
  { label: "nitrile C#N", range: [2230, 2250], window: [2200, 2280], smarts: ["[CX2]#[NX1]"], blockers: ["[CX2]#[NX1]", "[CX2]#[CX2]"] },
  { label: "nitro N-O (asym/sym)", range: [1520, 1540], window: [1480, 1580], smarts: ["[N+](=O)[O-]"], blockers: ["[N+](=O)[O-]"] },
  { label: "terminal alkyne C-H", range: [3290, 3310], window: [3250, 3340], smarts: ["[CX2H]#[CX2]"], blockers: ["[CX2H]#[CX2]", "[NX3;H1,H2]"] },
  { label: "alkene C=C", range: [1645, 1645], window: [1620, 1680], smarts: ["[CX3;!$(C=O);!a]=[CX3;!$(C=O);!a]"], blockers: ["[CX3]=[CX3]", "a", "[NX3;H2]", "[CX3]=[OX1]"] },
];
const parse = (t) => {
  const g = (k) => Number((t.match(new RegExp(`##${k}=(\\S+)`)) ?? [])[1]);
  const fx = g("FIRSTX"), dx = g("DELTAX"), yf = g("YFACTOR"); const body = t.slice(t.indexOf("##XYDATA")).split("\n").slice(1);
  const pts = []; for (const line of body) { if (line.startsWith("##")) break; const nums = line.trim().split(/\s+/).map(Number); if (nums.length < 2 || nums.some(Number.isNaN)) continue; const x0 = nums[0]; nums.slice(1).forEach((y, i) => pts.push({ x: x0 + i * dx, y: y * yf })); }
  return pts;
};
const has = (mol, smarts) => { const q = rd.get_qmol(smarts); try { return JSON.parse(mol.get_substruct_match(q)).atoms?.length > 0; } catch { return false; } finally { q.delete(); } };
const cases = [], dropped = []; let n = 0;
for (const f of fs.readdirSync(dir).sort()) {
  const full = path.join(dir, f); const rec = JSON.parse(fs.readFileSync(full, "utf8")); const t = rec.jcamp;
  const molform = ((t.match(/##MOLFORM=(.*)/) ?? [])[1] ?? "").replace(/\s+/g, "");
  if (molform !== rec.pubchem.formula) { dropped.push([rec.query, `formula mismatch ${molform}/${rec.pubchem.formula}`]); continue; }
  const c0 = canon(rec.pubchem.smiles); if (!c0 || excl.has(c0)) { dropped.push([rec.query, "in Stage 9F or unparseable"]); continue; }
  const pts = parse(t).filter((p) => p.x >= 650); const gmax = Math.max(...pts.map((p) => p.y));
  const ratio = (w) => Math.max(...pts.filter((p) => p.x >= w[0] && p.x <= w[1]).map((p) => p.y)) / gmax;
  const mol = rd.get_mol(rec.pubchem.smiles); const present = [], absent = [], excluded = [];
  try {
    for (const b of BANDS) {
      const r = Math.round(ratio(b.window) * 1000) / 1000; const groupHere = b.smarts.some((s) => has(mol, s));
      if (groupHere) { if (r >= 0.12) present.push({ label: b.label, range_cm1: b.range, measured_ratio: r }); else excluded.push({ label: b.label, why: `group present but reference ratio ${r} < 0.12` }); }
      else { const blocked = b.blockers.some((s) => has(mol, s)); if (!blocked) { if (r <= 0.03) absent.push({ label: b.label, range_cm1: b.range, measured_ratio: r }); else excluded.push({ label: b.label, why: `group absent but reference ratio ${r} > 0.03` }); } }
    }
  } finally { mol.delete(); }
  if (!present.length && !absent.length) { dropped.push([rec.query, "no determinable band"]); continue; }
  n += 1;
  cases.push({ id: `IR-${String(n).padStart(2, "0")}`, capability: "ir", category: "infrared", title: rec.query, evidence: "reference-database", smiles: rec.pubchem.smiles, source: { id: rec.nistId, url: `https://webbook.nist.gov/cgi/cbook.cgi?ID=${rec.nistId}&Units=SI&Type=IR-SPEC&Index=0#IR-SPEC`, jcampUrl: rec.jcampUrl, snapshot: `snapshots/nist-ir/${f}`, sha256: sha(full), bandTable: "snapshots/wikipedia/Infrared_spectroscopy_correlation_table.wikitext", bandTableSha256: sha(tableFile), inspected: "NIST gas-phase JCAMP spectrum fetched and saved; absorbance maxima in each window computed programmatically" }, ir: { present, absent, excluded }, uncertainty: "Gas-phase NIST spectrum; band windows are from a secondary correlation table. Present = functional group present by SMARTS and window maximum >= 12% of the spectrum maximum; absent = group and obvious overlapping groups absent and window maximum <= 3%." });
}
fs.writeFileSync(path.join(base, "cases", "ir.json"), JSON.stringify({ cases }, null, 1));
console.log("ir cases", cases.length, "present bands", cases.reduce((a, c) => a + c.ir.present.length, 0), "absent bands", cases.reduce((a, c) => a + c.ir.absent.length, 0), "excluded", cases.reduce((a, c) => a + c.ir.excluded.length, 0));
console.log("dropped", JSON.stringify(dropped));
await closeEngine(); process.exit(0);
