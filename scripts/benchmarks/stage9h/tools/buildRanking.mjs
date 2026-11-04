// Builds ranking.json from saved snapshots using the inclusion rules in PROTOCOL.md section "Ranking".
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { getRdkit, closeEngine } from "../../../tests/engine.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(here, ".."); const snap = path.join(base, "snapshots");
const rd = await getRdkit();
const canon = (s) => { const m = rd.get_mol(s); if (!m) return null; try { return m.get_smiles(); } finally { m.delete(); } };
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sets = JSON.parse(fs.readFileSync(path.join(here, "rankingSets.json"), "utf8"));
const prior = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "stage9f", "cases", "ranking.json"), "utf8")).cases.map((c) => c.smiles.map(canon).sort().join("|"));
const priorSet = new Set(prior);
const strings = (o) => { const out = []; const w = (x) => { if (x && typeof x === "object") { if (typeof x.String === "string") out.push(x.String); Object.values(x).forEach(w); } }; w(o); return out; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const extract = {
  boilingPoint: (strs) => strs.filter((s) => !/mm\s*hg|torr|kpa/i.test(s) || /\b760\b/.test(s)).map((s) => { const m = s.match(/(?<![\d.])(-?\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(?:°|deg(?:rees)?\.?)?\s*([CF])\b/); if (!m) return null; let v = m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]); return m[3] === "F" ? (v - 32) * 5 / 9 : v; }).filter((v) => v !== null),
  acidity: (strs) => strs.filter((s) => !/pkb/i.test(s)).map((s) => { const m = s.match(/pKa\d?\s*[=:]?\s*(-?\d+(?:\.\d+)?)/i); return m ? Number(m[1]) : null; }).filter((v) => v !== null),
  lipophilicity: (strs) => strs.filter((s) => !/est/i.test(s)).map((s) => { const m = s.match(/log\s*K?ow\s*=\s*(-?\d+(?:\.\d+)?)/i) ?? s.match(/^\s*(-?\d+(?:\.\d+)?)\s*$/); return m ? Number(m[1]) : null; }).filter((v) => v !== null),
};
extract.basicity = extract.acidity;
const rule = { boilingPoint: { spread: 3, gap: 8, desc: "normal boiling point (C)", dir: "high" }, acidity: { spread: 0.3, gap: 0.5, desc: "aqueous pKa (lower = stronger acid)", dir: "low" }, basicity: { spread: 0.3, gap: 0.8, desc: "pKa of the conjugate acid (higher = stronger base)", dir: "high" }, lipophilicity: { spread: 0.5, gap: 0.7, desc: "experimental log Kow", dir: "high" } };
const heading = { boilingPoint: "Boiling+Point", acidity: "Dissociation+Constants", basicity: "Dissociation+Constants", lipophilicity: "LogP" };
const cases = [], rejected = []; let n = 0;
for (const [mode, list] of Object.entries(sets)) for (const names of list) {
  const r = rule[mode]; const mols = [];
  let reason = null;
  for (const name of names) {
    const f = path.join(snap, "pubchem-ranking", slug(name) + ".json");
    if (!fs.existsSync(f)) { reason = `no record for ${name}`; break; }
    const rec = JSON.parse(fs.readFileSync(f, "utf8")); const vals = extract[mode](strings(rec.views[heading[mode]]));
    if (!vals.length) { reason = `no usable value for ${name}`; break; }
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread > r.spread) { reason = `${name}: sources disagree by ${spread.toFixed(2)}`; break; }
    mols.push({ name, smiles: rec.property.SMILES, value: Math.round(median(vals) * 100) / 100, nValues: vals.length, file: f, url: rec.url });
  }
  if (!reason) { const s = [...mols].sort((a, b) => (r.dir === "high" ? b.value - a.value : a.value - b.value)); for (let i = 1; i < s.length; i++) if (Math.abs(s[i].value - s[i - 1].value) < r.gap) { reason = `gap ${s[i - 1].name}/${s[i].name} < ${r.gap}`; break; } }
  if (!reason && priorSet.has(mols.map((m) => canon(m.smiles)).sort().join("|"))) reason = "identical molecule set in Stage 9F";
  if (reason) { rejected.push([mode, names.join(", "), reason]); continue; }
  n += 1; const s = [...mols].sort((a, b) => (r.dir === "high" ? b.value - a.value : a.value - b.value));
  cases.push({ id: `RK-${String(n).padStart(2, "0")}`, capability: "ranking", mode_id: mode, category: mode, title: names.join(" / "), evidence: "reference-database", smiles: mols.map((m) => m.smiles), expected_order: s.map((m) => [m.smiles]), values: Object.fromEntries(mols.map((m) => [m.smiles, m.value])), basis: `${r.desc}: ${s.map((m) => `${m.name} ${m.value}`).join(", ")}`, sources: mols.map((m) => ({ name: m.name, url: m.url, snapshot: path.relative(base, m.file).replace(/\\/g, "/"), sha256: sha(m.file), nValues: m.nValues })), uncertainty: `PubChem compiles experimental values from several handbooks; the value used is the median of ${mols.map((m) => m.nValues).join("/")} listed values; adjacent members differ by at least ${r.gap}.` });
}
// Hammett sigma (Wikipedia, citing Hammett 1937)
const hw = path.join(snap, "wikipedia", "Hammett_equation.wikitext");
fs.mkdirSync(path.dirname(hw), { recursive: true });
if (!fs.existsSync(hw)) fs.writeFileSync(hw, await (await fetch("https://en.wikipedia.org/w/index.php?title=Hammett_equation&action=raw")).text());
const wt = fs.readFileSync(hw, "utf8");
const sigma = (label) => { const m = wt.match(new RegExp(`\\|\\s*${label}\\s*\\|\\|\\s*(\\S+)`, "i")); if (!m) throw new Error("sigma " + label); return Number(m[1].replace(/&minus;|−/g, "-").replace(/^\+/, "")); };
const sub = { Dimethylamino: "CN(C)c1ccccc1", Amino: "Nc1ccccc1", Hydroxy: "Oc1ccccc1", Methoxy: "COc1ccccc1", Ethoxy: "CCOc1ccccc1", Methyl: "Cc1ccccc1", Fluoro: "Fc1ccccc1", Iodo: "Ic1ccccc1", Ethoxycarbonyl: "CCOC(=O)c1ccccc1", Trifluoromethyl: "FC(F)(F)c1ccccc1", Cyano: "N#Cc1ccccc1", Nitro: "O=[N+]([O-])c1ccccc1" };
const H = [["ewgStrength", ["Nitro", "Cyano", "Trifluoromethyl", "Ethoxycarbonyl"]], ["ewgStrength", ["Ethoxycarbonyl", "Iodo", "Fluoro", "Nitro"]], ["ewgStrength", ["Cyano", "Trifluoromethyl", "Iodo", "Fluoro"]], ["edgStrength", ["Dimethylamino", "Amino", "Methoxy", "Methyl"]], ["edgStrength", ["Amino", "Hydroxy", "Ethoxy", "Methyl"]], ["edgStrength", ["Hydroxy", "Methoxy", "Methyl", "Fluoro"]]];
for (const [mode, labels] of H) {
  const mols = labels.map((l) => ({ l, smiles: sub[l], v: sigma(l) })); const s = [...mols].sort((a, b) => (mode === "ewgStrength" ? b.v - a.v : a.v - b.v));
  let bad = false; for (let i = 1; i < s.length; i++) if (Math.abs(s[i].v - s[i - 1].v) < 0.05) bad = true;
  if (bad || priorSet.has(mols.map((m) => canon(m.smiles)).sort().join("|"))) { rejected.push([mode, labels.join(", "), "gap<0.05 or prior set"]); continue; }
  n += 1;
  cases.push({ id: `RK-${String(n).padStart(2, "0")}`, capability: "ranking", mode_id: mode, category: mode, title: `Hammett sigma-para: ${labels.join(" / ")}`, evidence: "reference-secondary", smiles: mols.map((m) => m.smiles), expected_order: s.map((m) => [m.smiles]), values: Object.fromEntries(mols.map((m) => [m.smiles, m.v])), basis: `sigma_para (Hammett 1937 values as tabulated on Wikipedia 'Hammett equation'): ${s.map((m) => `${m.l} ${m.v}`).join(", ")}`, sources: [{ name: "Wikipedia Hammett equation (raw wikitext)", url: "https://en.wikipedia.org/wiki/Hammett_equation", snapshot: "snapshots/wikipedia/Hammett_equation.wikitext", sha256: sha(hw), nValues: 1 }], uncertainty: "Original 1937 constants; modern compilations (Hansch 1991) differ numerically but the order of members used here is unchanged where gaps are at least 0.05. Secondary source." });
}
fs.writeFileSync(path.join(base, "cases", "ranking.json"), JSON.stringify({ cases }, null, 1));
console.log("ranking cases", cases.length, JSON.stringify(cases.reduce((a, c) => (a[c.mode_id] = (a[c.mode_id] || 0) + 1, a), {})));
for (const r of rejected) console.log("REJECT", r.join(" | "));
await closeEngine(); process.exit(0);
