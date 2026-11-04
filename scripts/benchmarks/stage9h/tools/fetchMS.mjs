// Fetches NIST WebBook EI mass spectra (JCAMP-DX) for the names below and a PubChem structure for each. Authoring-time only.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "snapshots", "nist-ms"); fs.mkdirSync(outDir, { recursive: true });
const names = JSON.parse(fs.readFileSync(path.join(here, "msCompounds.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000), redirect: "follow" }); if (r.ok) return { text: await r.text(), url: r.url }; } catch {} await sleep(1500); } return null; };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const [cls, list] of Object.entries(names)) for (const name of list) {
  const file = path.join(outDir, slug(name) + ".json"); if (fs.existsSync(file)) continue;
  const page = await get(`https://webbook.nist.gov/cgi/cbook.cgi?Name=${encodeURIComponent(name)}&Units=SI&cMS=on`); await sleep(400);
  const idm = page && (page.url.match(/ID=(C\d+)/) ?? page.text.match(/cbook\.cgi\?ID=(C\d+)/));
  if (!idm) { console.log("NO-NIST-ID", name); continue; }
  const id = idm[1];
  const j = await get(`https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=${id}&Index=0&Type=Mass`); await sleep(400);
  if (!j || !j.text.includes("##PEAK TABLE")) { console.log("NO-MS", name, id); continue; }
  const pc = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,SMILES/JSON`); await sleep(250);
  if (!pc) { console.log("NO-PUBCHEM", name); continue; }
  const prop = JSON.parse(pc.text).PropertyTable.Properties[0];
  fs.writeFileSync(file, JSON.stringify({ class: cls, query: name, nistId: id, jcampUrl: `https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=${id}&Index=0&Type=Mass`, fetchedAt: new Date().toISOString(), jcamp: j.text, pubchem: { cid: prop.CID, formula: prop.MolecularFormula, smiles: prop.SMILES } }, null, 1)); console.log("ok", name, id);
}
