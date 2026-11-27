// Builds ms.json from saved NIST JCAMP snapshots. Rules (PROTOCOL.md "Mass spectrometry"): formula must match between NIST and PubChem;
// base peak = 100% peak; molecular ion scored only when the NIST table shows >=1% at m/z = NIST MW; key fragments = up to four peaks >=20% of base excluding base and M+;
// M+2 ratio recorded for Cl/Br compounds only when the molecular ion is >=5%.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { fileURLToPath } from "node:url";
import { getRdkit, closeEngine } from "../../../tests/engine.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)); const base = path.join(here, ".."); const dir = path.join(base, "snapshots", "nist-ms");
const rd = await getRdkit();
const canon = (s, iso = false) => { const m = rd.get_mol(s); if (!m) return null; try { return m.get_smiles(JSON.stringify({ doIsomericSmiles: iso })); } finally { m.delete(); } };
const excl = new Set(JSON.parse(fs.readFileSync(path.join(here, "stage9f-smiles-exclusion.json"), "utf8")).map((s) => { try { return canon(s); } catch { return null; } }).filter(Boolean));
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const norm = (f) => String(f).replace(/\s+/g, "");
const cases = [], dropped = []; let n = 0;
for (const f of fs.readdirSync(dir).sort()) {
  const full = path.join(dir, f); const rec = JSON.parse(fs.readFileSync(full, "utf8")); const t = rec.jcamp;
  const molform = (t.match(/##MOLFORM=(.*)/) ?? [])[1]; const mw = Number((t.match(/##MW=(\d+)/) ?? [])[1]);
  if (norm(molform) !== norm(rec.pubchem.formula)) { dropped.push([rec.query, `formula mismatch NIST ${molform} vs PubChem ${rec.pubchem.formula}`]); continue; }
  const c0 = canon(rec.pubchem.smiles); if (!c0) { dropped.push([rec.query, "unparseable"]); continue; } if (excl.has(c0)) { dropped.push([rec.query, "in Stage 9F"]); continue; }
  const body = t.slice(t.indexOf("##PEAK TABLE")).split("\n").slice(1).join(" ").split("##END")[0];
  const peaks = [...body.matchAll(/(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g)].map((m) => ({ mz: Number(m[1]), raw: Number(m[2]) }));
  const max = Math.max(...peaks.map((p) => p.raw)); const rel = peaks.map((p) => ({ mz: p.mz, rel: (100 * p.raw) / max }));
  const base_peak = rel.reduce((a, b) => (b.rel > a.rel ? b : a));
  const m = rel.find((p) => p.mz === mw);
  const frags = rel.filter((p) => p.rel >= 20 && p.mz !== base_peak.mz && p.mz !== mw).sort((a, b) => b.rel - a.rel).slice(0, 4).sort((a, b) => a.mz - b.mz);
  const halo = /Cl|Br/.test(molform);
  let m2 = null; if (halo && m && m.rel >= 5) { const p2 = rel.find((p) => p.mz === mw + 2); if (p2) m2 = Math.round((p2.rel / m.rel) * 1000) / 1000; }
  n += 1;
  cases.push({ id: `MS-${String(n).padStart(2, "0")}`, capability: "ms", category: rec.class, title: rec.query, evidence: "reference-database", smiles: rec.pubchem.smiles, formula: rec.pubchem.formula,
    source: { id: rec.nistId, url: rec.jcampUrl.replace("JCAMP=", "ID=").replace("&Index=0&Type=Mass", "&Units=SI&Mask=200#Mass-Spec"), jcampUrl: rec.jcampUrl, snapshot: `snapshots/nist-ms/${f}`, sha256: sha(full), inspected: "NIST WebBook JCAMP-DX EI spectrum fetched and saved; peaks parsed programmatically" },
    expected: { molecular_ion_mz: m && m.rel >= 1 ? mw : null, molecular_ion_rel: m ? Math.round(m.rel * 10) / 10 : 0, base_peak_mz: base_peak.mz, key_fragments: frags.map((p) => ({ mz: p.mz, rel: Math.round(p.rel) })), m_plus_2_ratio: m2 },
    uncertainty: "Single NIST library spectrum (70 eV EI); relative intensities vary between instruments. Pass requires m/z agreement only." });
}
fs.writeFileSync(path.join(base, "cases", "ms.json"), JSON.stringify({ cases }, null, 1));
console.log("ms cases", cases.length, "M+ scored", cases.filter((c) => c.expected.molecular_ion_mz).length, "M+2", cases.filter((c) => c.expected.m_plus_2_ratio).length);
console.log("dropped", JSON.stringify(dropped));
await closeEngine(); process.exit(0);
