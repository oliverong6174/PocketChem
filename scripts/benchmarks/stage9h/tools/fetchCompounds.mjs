// Fetches PubChem PUG REST records (properties + experimental LogP) for compounds.json and stores raw snapshots. Network required; run once at authoring time.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = path.join(here, "..", "snapshots", "pubchem"); fs.mkdirSync(outDir, { recursive: true });
const list = JSON.parse(fs.readFileSync(path.join(here, "compounds.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (r.status === 404) return null; if (r.ok) return await r.text(); } catch {} await sleep(1500); } return null; };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const [group, names] of Object.entries(list)) for (const name of names) {
  const file = path.join(outDir, slug(name) + ".json"); if (fs.existsSync(file)) continue;
  const p = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/IUPACName,MolecularFormula,MolecularWeight,ExactMass,Charge,SMILES,InChIKey/JSON`);
  await sleep(250);
  if (!p) { console.log("MISS", name); continue; }
  const prop = JSON.parse(p).PropertyTable.Properties[0];
  const lp = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${prop.CID}/JSON?heading=LogP`); await sleep(250);
  const rec = { group, query: name, fetchedAt: new Date().toISOString(), url: `https://pubchem.ncbi.nlm.nih.gov/compound/${prop.CID}`, property: prop, logpView: lp ? JSON.parse(lp) : null };
  fs.writeFileSync(file, JSON.stringify(rec, null, 1)); console.log("ok", name, prop.CID);
}
