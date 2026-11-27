// Builds reactions.json and synthesis.json from caseData.mjs. Verifies each quote against the saved OpenStax module text, copies the cited modules into snapshots/openstax,
// cross-checks named structures against PubChem name resolution, and verifies CIP labels of stereo SMILES. Usage: node buildReactions.mjs <openstax scratch dir>
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { fileURLToPath } from "node:url";
import { getRdkit, closeEngine } from "../../../tests/engine.mjs";
import { reactions, synthesis } from "./caseData.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)); const base = path.join(here, ".."); const scratch = process.argv[2];
const rd = await getRdkit();
const canon = (s, iso = false) => { const m = rd.get_mol(s); if (!m) return null; try { return m.get_smiles(JSON.stringify({ doIsomericSmiles: iso })); } finally { m.delete(); } };
const strip = (s) => s.replace(/<title>[^<]*<\/title>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const osDir = path.join(base, "snapshots", "openstax"); fs.mkdirSync(osDir, { recursive: true });
const coll = fs.readFileSync(path.join(scratch, "collection.xml"), "utf8");
if (!fs.existsSync(path.join(osDir, "collection.xml"))) fs.copyFileSync(path.join(scratch, "collection.xml"), path.join(osDir, "collection.xml"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pubchem = async (name) => { try { const r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/SMILES/JSON`, { signal: AbortSignal.timeout(20000) }); await sleep(250); if (!r.ok) return null; return (await r.json()).PropertyTable.Properties[0].SMILES; } catch { return null; } };
const problems = [];
const cipLabels = (smiles) => { const m = rd.get_mol(smiles); try { return JSON.parse(m.get_stereo_tags()); } finally { m.delete(); } };
const moduleCache = {};
const evidenceFor = (c) => {
  const f = path.join(scratch, c.mod + ".cnxml"); const raw = fs.readFileSync(f, "utf8"); moduleCache[c.mod] ??= strip(raw);
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const found = moduleCache[c.mod].includes(norm(c.quote));
  if (!found) problems.push(`QUOTE NOT FOUND ${c.key} (${c.mod})`);
  const dest = path.join(osDir, c.mod + ".cnxml"); if (!fs.existsSync(dest)) fs.copyFileSync(f, dest);
  const title = (raw.match(/<title>([^<]*)<\/title>/) ?? [])[1];
  return { id: `openstax-organic-chemistry-${c.mod}`, title: `OpenStax Organic Chemistry, module ${c.mod}: ${title}`, publisher: "OpenStax (Rice University), CC BY 4.0", url: `https://github.com/openstax/osbooks-organic-chemistry/blob/main/modules/${c.mod}/index.cnxml`, snapshot: `snapshots/openstax/${c.mod}.cnxml`, sha256: sha(dest), quote: c.quote, quoteFoundInSnapshot: found, inspected: "module CNXML fetched, saved, and the quoted sentence located programmatically in the saved text", kind: "secondary: peer-reviewed open textbook, not primary literature" };
};
const nameChecks = async (c) => {
  const out = [];
  for (const [name, smi] of c.names ?? []) {
    const got = await pubchem(name); if (!got) { out.push({ name, status: "unresolved" }); continue; }
    const a = canon(got), b = canon(smi); const ok = a && b && a === b;
    if (!ok) problems.push(`NAME/SMILES MISMATCH ${c.key}: ${name} PubChem ${got} vs ${smi}`);
    out.push({ name, status: ok ? "match" : "mismatch", pubchem: got });
  }
  return out;
};
const rxCases = []; let n = 0;
for (const c of reactions) {
  n += 1;
  for (const [smi, want] of Object.entries(c.cip ?? {})) {
    const tags = cipLabels(smi); const labels = (tags.CIP_atoms ?? []).map((x) => String(x[1]).replace(/[()]/g, "")).join("");
    if (want === "R" || want === "S") { if (labels !== want) problems.push(`CIP ${c.key} ${smi}: got ${labels} want ${want}`); }
    else { const same = labels.length === 2 && labels[0] === labels[1]; if ((want === "trans") !== same) problems.push(`CIP ${c.key} ${smi}: labels ${labels} but declared ${want}`); }
  }
  const ev = evidenceFor(c);
  rxCases.push({ id: `RX-${String(n).padStart(2, "0")}`, capability: "reactions", category: c.cat, title: c.key, evidence: c.tier === "direct" ? "verified-textbook-direct" : "rule-derived-provisional", sources: [ev], reactants: c.reactants, reagents: c.reagents, reagent_tokens: c.tokens, expected: c.exp, criteria: c.criteria, nameChecks: await nameChecks(c),
    uncertainty: c.tier === "direct" ? "The quoted sentence names the substrate and the product. Textbook statement, not a primary literature report; yields/selectivities are as stated qualitatively." : "The quoted sentence gives a general rule; the substrate and product were chosen by the author (a model) by applying it. Provisional: excluded from reference-validated accuracy." });
}
const syCases = []; n = 0;
for (const c of synthesis) {
  n += 1; const ev = evidenceFor(c);
  syCases.push({ id: `SY-${String(n).padStart(2, "0")}`, capability: "synthesis", category: "multi-step", title: c.title, evidence: c.tier === "direct" ? "verified-textbook-direct" : "rule-derived-provisional", sources: [ev], start: c.start, target: c.target, copies: c.copies, documented_steps: c.documented_steps, n_steps_min: c.n_steps_min, n_steps_max: c.n_steps_max, route_must_avoid: c.avoid, notes: c.note,
    nameChecks: [], uncertainty: c.tier === "direct" ? "Route and step count follow the quoted textbook worked example; textbook, not primary literature." : "Rule application by the author; provisional." });
  for (const s of [c.target, ...c.start.split(".")]) if (!canon(s)) problems.push(`SMILES invalid ${c.key} ${s}`);
}
fs.writeFileSync(path.join(base, "cases", "reactions.json"), JSON.stringify({ cases: rxCases }, null, 1));
fs.writeFileSync(path.join(base, "cases", "synthesis.json"), JSON.stringify({ cases: syCases }, null, 1));
const nc = rxCases.flatMap((c) => c.nameChecks);
console.log("reactions", rxCases.length, "direct", rxCases.filter((c) => c.evidence.startsWith("verified")).length, "synthesis", syCases.length, "direct", syCases.filter((c) => c.evidence.startsWith("verified")).length);
console.log("name checks: match", nc.filter((x) => x.status === "match").length, "unresolved", nc.filter((x) => x.status === "unresolved").length, "mismatch", nc.filter((x) => x.status === "mismatch").length);
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "no problems");
await closeEngine(); process.exit(0);
