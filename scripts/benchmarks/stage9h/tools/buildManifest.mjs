// Computes manifest.json: SHA-256 of every frozen file, case counts, denominators, engine tree. Run immediately before the freeze commit.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
import { getRdkit, closeEngine } from "../../../tests/engine.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)); const base = path.join(here, ".."); const root = path.resolve(base, "..", "..", "..");
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n")).digest("hex");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const frozenRoots = ["cases", "snapshots", "tools", "smoke", "selftest"]; const frozenFiles = ["scoring.mjs", "run.mjs", "PROTOCOL.md"];
const hashes = {};
for (const r of frozenRoots) for (const f of walk(path.join(base, r))) hashes[path.relative(base, f).replace(/\\/g, "/")] = sha(f);
for (const f of frozenFiles) hashes[f] = sha(path.join(base, f));
const sorted = Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
const load = (n) => JSON.parse(fs.readFileSync(path.join(base, "cases", `${n}.json`), "utf8")).cases;
const SCORED = new Set(["reference-database", "reference-secondary", "verified-textbook-direct"]);
const counts = {}, denominators = {};
for (const cap of ["nomenclature", "properties", "ranking", "ms", "ir", "reactions", "synthesis"]) {
  const cases = load(cap); const scored = cases.filter((c) => SCORED.has(c.evidence)), prov = cases.filter((c) => !SCORED.has(c.evidence));
  counts[cap] = { total: cases.length, scored: scored.length, provisional: prov.length };
  const d = {};
  if (cap === "nomenclature") { d.name = d.constitutionName = d.systematicName = scored.length; d.stereoSpecifiedSubset = scored.filter((c) => c.stereo_specified).length; }
  if (cap === "properties") { d.formula = d.molecularWeight = d.exactMass = d.formalCharge = scored.length; d.logP = scored.filter((c) => c.logp_exp).length; }
  if (cap === "ranking") { d.order = scored.length; d.byMode = scored.reduce((a, c) => (a[c.mode_id] = (a[c.mode_id] || 0) + 1, a), {}); d.pairsTotal = scored.reduce((a, c) => a + (c.smiles.length * (c.smiles.length - 1)) / 2, 0); }
  if (cap === "ms") { d.molecularIon = scored.filter((c) => c.expected.molecular_ion_mz != null).length; d.basePeak = scored.length; d.fragments = scored.filter((c) => c.expected.key_fragments?.length).length; d.isotopeM2 = scored.filter((c) => c.expected.m_plus_2_ratio != null).length; }
  if (cap === "ir") { d.irPresent = scored.filter((c) => c.ir.present.length).length; d.irAbsent = scored.filter((c) => c.ir.absent.length).length; d.presentBandsListed = scored.reduce((a, c) => a + c.ir.present.length, 0); d.absentBandsListed = scored.reduce((a, c) => a + c.ir.absent.length, 0); }
  if (cap === "reactions") { for (const k of ["connectivity", "regiochemistry", "ranking", "ambiguity", "stereochemistry"]) d[k] = scored.filter((c) => c.criteria.includes(k)).length; d.negativeControls = scored.filter((c) => c.expected.products.length === 0).length; }
  if (cap === "synthesis") { d.routeDiscovery = scored.length; }
  denominators[cap] = d;
}
// smoke molecules must not occur in a frozen case
const rd = await getRdkit(); const canon = (s) => { const m = rd.get_mol(s); if (!m) return null; try { return m.get_smiles(JSON.stringify({ doIsomericSmiles: false })); } finally { m.delete(); } };
const caseSmiles = new Set(); for (const cap of ["nomenclature", "properties", "ranking", "ms", "ir"]) for (const c of load(cap)) for (const s of c.smiles.flat?.() ?? [c.smiles]) caseSmiles.add(canon(s));
const smokeOverlap = [];
for (const f of fs.readdirSync(path.join(base, "smoke"))) for (const c of JSON.parse(fs.readFileSync(path.join(base, "smoke", f), "utf8")).cases) for (const s of [].concat(c.smiles ?? c.reactants ?? c.start?.split(".") ?? [])) if (caseSmiles.has(canon(s))) smokeOverlap.push(`${c.id}:${s}`);
const manifest = { stage: "9H", frozenAt: new Date().toISOString(), engineCommit: git("rev-parse", "HEAD"), engineSrcTree: git("rev-parse", "HEAD:src"), engineHeadSubject: git("log", "-1", "--format=%s"), counts, denominators, smokeOverlapWithFrozenCases: smokeOverlap, scoredEvidenceTiers: [...SCORED], hashes: sorted };
fs.writeFileSync(path.join(base, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ engineCommit: manifest.engineCommit, engineSrcTree: manifest.engineSrcTree, files: Object.keys(sorted).length, counts, denominators, smokeOverlap }, null, 1));
await closeEngine(); process.exit(0);
