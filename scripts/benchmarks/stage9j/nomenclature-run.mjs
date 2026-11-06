// Stage 9J: runs the CURRENT engine on the exposed Stage 9H nomenclature cases and scores with (a) the frozen 9H scorer, unchanged and
// (b) the stereo-sensitive synonym equivalence. Writes only under stage9j/results. Development diagnostic, not a blind result.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const label = process.argv[2] ?? "current";
const { loadEngine, loadModule, closeEngine } = await import(pathToFileURL(path.join(root, "scripts", "tests", "engine.mjs")).href);
const S = await import(pathToFileURL(path.join(root, "scripts", "benchmarks", "stage9h", "scoring.mjs")).href);
const { namesEquivalent } = await import(pathToFileURL(path.join(here, "nameEquivalence.mjs")).href);
const cases = JSON.parse(fs.readFileSync(path.join(root, "scripts", "benchmarks", "stage9h", "cases", "nomenclature.json"), "utf8")).cases;

await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const nom = await loadModule("/src/utils/nomenclatureUtils.ts");
const rows = [];
for (const c of cases) {
  const h = await groups.analyzeFunctionalGroupHierarchy(c.smiles);
  const n = (await nom.analyzeNomenclatureAndProperties(c.smiles, h.primaryGroups, h.mainGroup)).nomenclature;
  const shown = n.displayName || n.estimatedName;
  const out = { displayName: shown, estimatedName: n.estimatedName, status: n.namingStatus, confidence: n.namingConfidence };
  const rule9h = S.scoreNomenclature(c, out).name.status;
  const refs = [...c.accepted_names, c.preferred_name].filter(Boolean);
  const trailing = String(shown).match(/^(.*\S)\s+\(([A-Za-z][A-Za-z ]{3,})\)$/);
  const systematic = trailing ? trailing[1] : shown;
  const strict = n.namingStatus === "unsupported" ? "abstained" : refs.some((r) => namesEquivalent(systematic, r)) ? "correct" : n.namingConfidence === "High" ? "wrong-confident" : "wrong-flagged";
  rows.push({ id: c.id, reference: c.preferred_name, shown, status: n.namingStatus, confidence: n.namingConfidence, rule9h, strict });
}
await closeEngine();
const tally = (k) => rows.reduce((a, r) => ({ ...a, [r[k]]: (a[r[k]] ?? 0) + 1 }), {});
const summary = { label, cases: rows.length, frozen9HRule: tally("rule9h"), strictStereoAware: tally("strict") };
fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results", `nomenclature-${label}.json`), JSON.stringify({ note: "Exposed Stage 9H cases; development diagnostic only.", summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const r of rows.filter((x) => x.strict !== "correct")) console.log(r.id, r.strict, "|", r.reference, "|", r.shown, `(${r.status}/${r.confidence})`);
process.exit(0);
