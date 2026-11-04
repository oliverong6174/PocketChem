import fs from "node:fs"; import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = path.join(here, "..", "snapshots", "pubchem-ranking"); fs.mkdirSync(outDir, { recursive: true });
const sets = JSON.parse(fs.readFileSync(path.join(here, "rankingSets.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (r.status === 404) return null; if (r.ok) return await r.text(); } catch {} await sleep(1500); } return null; };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const heading = { boilingPoint: "Boiling+Point", acidity: "Dissociation+Constants", basicity: "Dissociation+Constants", lipophilicity: "LogP" };
const names = new Map(); for (const [mode, ss] of Object.entries(sets)) for (const s of ss) for (const n of s) { const k = slug(n); if (!names.has(k)) names.set(k, { name: n, headings: new Set() }); names.get(k).headings.add(heading[mode]); }
for (const [k, { name, headings }] of names) {
  const file = path.join(outDir, k + ".json"); if (fs.existsSync(file)) continue;
  const p = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/IUPACName,MolecularFormula,SMILES,InChIKey/JSON`); await sleep(250);
  if (!p) { console.log("MISS", name); continue; }
  const prop = JSON.parse(p).PropertyTable.Properties[0]; const views = {};
  for (const h of headings) { const v = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${prop.CID}/JSON?heading=${h}`); await sleep(250); views[h] = v ? JSON.parse(v) : null; }
  fs.writeFileSync(file, JSON.stringify({ query: name, fetchedAt: new Date().toISOString(), url: `https://pubchem.ncbi.nlm.nih.gov/compound/${prop.CID}`, property: prop, views }, null, 1)); console.log("ok", name);
}
