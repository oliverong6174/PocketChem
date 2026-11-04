// Fetches NIST WebBook gas-phase IR spectra (JCAMP-DX, Index=0) and a PubChem structure. Authoring-time only.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "snapshots", "nist-ir"); fs.mkdirSync(outDir, { recursive: true });
const names = JSON.parse(fs.readFileSync(path.join(here, "irCompounds.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000), redirect: "follow" }); if (r.ok) return { text: await r.text(), url: r.url }; } catch {} await sleep(1500); } return null; };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const name of names) {
  const file = path.join(outDir, slug(name) + ".json"); if (fs.existsSync(file)) continue;
  const page = await get(`https://webbook.nist.gov/cgi/cbook.cgi?Name=${encodeURIComponent(name)}&Units=SI&cIR=on`); await sleep(400);
  const idm = page && (page.url.match(/ID=(C\d+)/) ?? page.text.match(/cbook\.cgi\?ID=(C\d+)/));
  if (!idm) { console.log("NO-NIST-ID", name); continue; }
  const id = idm[1];
  const j = await get(`https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=${id}&Index=0&Type=IR`); await sleep(400);
  if (!j || !j.text.includes("##XYDATA") || !/STATE=gas/i.test(j.text)) { console.log("NO-GAS-IR", name, id); continue; }
  const pc = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,SMILES,InChIKey/JSON`); await sleep(250);
  if (!pc) { console.log("NO-PUBCHEM", name); continue; }
  const prop = JSON.parse(pc.text).PropertyTable.Properties[0];
  fs.writeFileSync(file, JSON.stringify({ query: name, nistId: id, jcampUrl: `https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=${id}&Index=0&Type=IR`, fetchedAt: new Date().toISOString(), jcamp: j.text, pubchem: { cid: prop.CID, formula: prop.MolecularFormula, smiles: prop.SMILES } }, null, 1)); console.log("ok", name, id);
}
