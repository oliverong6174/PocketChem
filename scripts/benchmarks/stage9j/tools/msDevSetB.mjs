// Stage 9J mass-spectrometry development set B (compound list fixed before fetching; drops are rule-based only).
//
// Fetches NIST WebBook EI spectra (JCAMP-DX) and PubChem structures for compounds that are NOT in the Stage 9H or Stage 9F mass-spectrum
// cases, builds cases with the same rules Stage 9H used, and records SHA-256 hashes. Authoring time only: the engine reads no network.
// Honest scope: the author is also the evaluator, and Stage 9H's failure classes (alkyl halides, alcohols, ethers, nitriles) guided which
// compound classes were sampled, although none of these particular compounds was seen before. This is a development set, not a blind
// holdout, and is reported as such.
//
// usage: node msDevSet.mjs fetch | build
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(here, "..", "ms-dev-b");
const snapDir = path.join(base, "snapshots");
fs.mkdirSync(snapDir, { recursive: true });
const root = path.resolve(here, "..", "..", "..", "..");

const COMPOUNDS = {
  ketone: ["2-hexanone", "3-hexanone", "4-methyl-2-pentanone", "2-octanone", "acetophenone"],
  ester: ["ethyl butanoate", "propyl acetate", "methyl butanoate", "ethyl hexanoate", "ethyl benzoate"],
  acid: ["pentanoic acid", "octanoic acid"],
  aldehyde: ["hexanal", "pentanal", "benzaldehyde"],
  nitrile: ["pentanenitrile", "octanenitrile"],
  amine: ["butylamine", "dibutylamine", "triethylamine"],
  aromatic: ["propylbenzene", "butylbenzene", "benzyl alcohol", "anisole", "ethylbenzene"],
  alcohol: ["2-butanol", "1-hexanol", "cyclohexanol"],
  "alkyl halide": ["2-chlorobutane", "1-chlorohexane"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 3; i += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "follow" });
      if (r.ok) return { text: await r.text(), url: r.url };
    } catch {
      /* retry */
    }
    await sleep(1200);
  }
  return null;
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const mode = process.argv[2];
if (mode === "fetch") {
  for (const [cls, list] of Object.entries(COMPOUNDS)) {
    for (const name of list) {
      const file = path.join(snapDir, `${slug(name)}.json`);
      if (fs.existsSync(file)) continue;
      const page = await get(`https://webbook.nist.gov/cgi/cbook.cgi?Name=${encodeURIComponent(name)}&Units=SI&cMS=on`);
      await sleep(400);
      const idm = page && (page.url.match(/ID=(C\d+)/) ?? page.text.match(/cbook\.cgi\?ID=(C\d+)/));
      if (!idm) {
        console.log("NO-NIST-ID", name);
        continue;
      }
      const id = idm[1];
      const j = await get(`https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=${id}&Index=0&Type=Mass`);
      await sleep(400);
      if (!j || !j.text.includes("##PEAK TABLE")) {
        console.log("NO-MS", name, id);
        continue;
      }
      const pc = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,SMILES/JSON`);
      await sleep(250);
      if (!pc) {
        console.log("NO-PUBCHEM", name);
        continue;
      }
      const prop = JSON.parse(pc.text).PropertyTable.Properties[0];
      fs.writeFileSync(
        file,
        JSON.stringify({ class: cls, query: name, nistId: id, jcampUrl: `https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=${id}&Index=0&Type=Mass`, fetchedAt: new Date().toISOString(), jcamp: j.text, pubchem: { formula: prop.MolecularFormula, smiles: prop.SMILES ?? prop.ConnectivitySMILES ?? prop.CanonicalSMILES } }),
      );
      console.log("saved", name, id);
    }
  }
} else if (mode === "build") {
  const { getRdkit, closeEngine } = await import(pathToFileURL(path.join(root, "scripts", "tests", "engine.mjs")).href);
  const rd = await getRdkit();
  const canon = (s) => {
    const m = rd.get_mol(s);
    if (!m) return null;
    try {
      return m.get_smiles(JSON.stringify({ doIsomericSmiles: false }));
    } finally {
      m.delete();
    }
  };
  // Exclude every compound already used as a Stage 9H or Stage 9F mass-spectrum case (by constitution).
  const seen = new Set();
  const h9 = JSON.parse(fs.readFileSync(path.join(root, "scripts", "benchmarks", "stage9h", "cases", "ms.json"), "utf8")).cases;
  for (const c of h9) seen.add(canon(c.smiles));
  const f9 = JSON.parse(fs.readFileSync(path.join(root, "scripts", "benchmarks", "stage9h", "tools", "stage9f-smiles-exclusion.json"), "utf8"));
  for (const s of f9) {
    const c = canon(s);
    if (c) seen.add(c);
  }
  // Stage 9J: also exclude every compound already in the Stage 9I development set.
  for (const c of JSON.parse(fs.readFileSync(path.join(root, "scripts", "benchmarks", "stage9i", "ms-dev", "cases.json"), "utf8")).cases) seen.add(canon(c.smiles));
  const norm = (f) => String(f).replace(/\s+/g, "");
  const cases = [];
  const dropped = [];
  for (const file of fs.readdirSync(snapDir).sort()) {
    const full = path.join(snapDir, file);
    const rec = JSON.parse(fs.readFileSync(full, "utf8"));
    const t = rec.jcamp;
    const molform = (t.match(/##MOLFORM=(.*)/) ?? [])[1];
    const mw = Number((t.match(/##MW=(\d+)/) ?? [])[1]);
    if (norm(molform) !== norm(rec.pubchem.formula)) {
      dropped.push([rec.query, "formula mismatch"]);
      continue;
    }
    const c0 = canon(rec.pubchem.smiles);
    if (!c0 || seen.has(c0)) {
      dropped.push([rec.query, c0 ? "already a Stage 9H/9F case" : "unparseable"]);
      continue;
    }
    const body = t.slice(t.indexOf("##PEAK TABLE")).split("\n").slice(1).join(" ").split("##END")[0];
    const peaks = [...body.matchAll(/(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g)].map((m) => ({ mz: Number(m[1]), raw: Number(m[2]) }));
    const max = Math.max(...peaks.map((p) => p.raw));
    const rel = peaks.map((p) => ({ mz: p.mz, rel: (100 * p.raw) / max }));
    const basePeak = rel.reduce((a, b) => (b.rel > a.rel ? b : a));
    const mi = rel.find((p) => p.mz === mw);
    const frags = rel
      .filter((p) => p.rel >= 20 && p.mz !== basePeak.mz && p.mz !== mw)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 4)
      .sort((a, b) => a.mz - b.mz);
    cases.push({
      id: `MB-${String(cases.length + 1).padStart(2, "0")}`,
      category: rec.class,
      title: rec.query,
      smiles: rec.pubchem.smiles,
      formula: rec.pubchem.formula,
      source: { id: rec.nistId, jcampUrl: rec.jcampUrl, snapshot: `snapshots/${file}`, sha256: sha(full) },
      expected: {
        molecular_ion_mz: mi && mi.rel >= 1 ? mw : null,
        molecular_ion_rel: mi ? Math.round(mi.rel * 10) / 10 : 0,
        base_peak_mz: basePeak.mz,
        key_fragments: frags.map((p) => ({ mz: p.mz, rel: Math.round(p.rel) })),
      },
    });
  }
  fs.writeFileSync(path.join(base, "cases.json"), JSON.stringify({ cases }, null, 1));
  const manifest = { builtAt: new Date().toISOString(), hashes: { "cases.json": sha(path.join(base, "cases.json")) } };
  for (const c of cases) manifest.hashes[c.source.snapshot] = c.source.sha256;
  fs.writeFileSync(path.join(base, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log("cases", cases.length, "dropped", JSON.stringify(dropped));
  await closeEngine();
  process.exit(0);
}
