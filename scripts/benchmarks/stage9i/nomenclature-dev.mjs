// Stage 9I development comparison for nomenclature.
//
// The Stage 9H cases are an EXPOSED diagnostic set (the blind run is done and recorded). This script re-runs the current engine on them
// to show which demonstrated defects were fixed. It is development validation, not a blind-generalisation result, and it never edits or
// re-scores the frozen 9H files.
//
// Two scorings are reported side by side so nothing is quietly improved:
//   "9H rule"        the frozen Stage 9H scorer, imported unchanged.
//   "errata-aware"   the same accepted names, plus documented equivalences (see EQUIVALENCES and ERRATA-9I.md). It is never applied to
//                    the original 9H numbers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const h9 = path.join(root, "scripts", "benchmarks", "stage9h");
const { loadEngine, loadModule, closeEngine } = await import(pathToFileURL(path.join(root, "scripts", "tests", "engine.mjs")).href);
const S = await import(pathToFileURL(path.join(h9, "scoring.mjs")).href);

const cases = JSON.parse(fs.readFileSync(path.join(h9, "cases", "nomenclature.json"), "utf8")).cases;
const original = new Map(
  fs
    .readFileSync(path.join(h9, "results", fs.readdirSync(path.join(h9, "results")).find((f) => f.startsWith("final-raw-"))), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((r) => r.capability === "nomenclature")
    .map((r) => [r.id, r]),
);

// Documented equivalences (valid alternative systematic spellings, not "close enough" matches).
const EQUIVALENCES = [
  [/[()]/g, ""], // parentheses around compound substituent names (IUPAC 2013 P-16.5 vs PubChem style)
  [/methanoyl/g, "formyl"], [/methanoate/g, "formate"], [/methanoic/g, "formic"], // applied BEFORE the ethan- rules: "methanoate" contains "ethanoate"
  [/ethanoyl/g, "acetyl"], [/ethanoate/g, "acetate"], [/ethanoic/g, "acetic"], // P-65.1.1.1 retained vs systematic
  [/(cyclo[a-z]+-\d+-en)-1-(one|ol|amine)/g, "$1$2"], // ring locant 1 may be omitted (1979 usage); 2013 cites it
  [/(cyclo[a-z]+)-1-ene\b/g, "$1ene"], // cyclohex-1-ene = cyclohexene
  [/(cis|trans)-?/g, ""], // cis/trans repeats the CIP descriptors for a ring
  [/(\d+[a-z]?[rsez],?)+|[rsez]-/g, ""], // CIP descriptor with or without locant: (R)- = (2R)-
  [/^-+/, ""], [/--+/g, "-"],
];
const norm = (s) => EQUIVALENCES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), S.normName(s));
const equivalent = (candidate, c) => [...c.accepted_names, c.preferred_name].filter(Boolean).some((ref) => norm(ref) === norm(candidate));

await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const nom = await loadModule("/src/utils/nomenclatureUtils.ts");

const rows = [];
for (const c of cases) {
  const h = await groups.analyzeFunctionalGroupHierarchy(c.smiles);
  const n = (await nom.analyzeNomenclatureAndProperties(c.smiles, h.primaryGroups, h.mainGroup)).nomenclature;
  const out = { displayName: n.displayName || n.estimatedName, estimatedName: n.estimatedName, status: n.namingStatus, confidence: n.namingConfidence };
  const strict = S.scoreNomenclature(c, out).name.status;
  const shown = out.displayName;
  const parts = [shown, ...String(shown).split(/[()]/).filter(Boolean)];
  const aware = out.status === "unsupported" ? "abstained" : parts.some((p) => equivalent(p, c)) ? "correct" : out.confidence === "High" ? "wrong-confident" : "wrong-flagged";
  rows.push({ id: c.id, smiles: c.smiles, reference: c.preferred_name, original: original.get(c.id)?.dimensions?.name?.status, now: strict, nowAware: aware, shown, status: out.status, confidence: out.confidence });
}
await closeEngine();

const tally = (key) => rows.reduce((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] ?? 0) + 1 }), {});
const summary = { cases: rows.length, original9H: tally("original"), current9HRule: tally("now"), currentErrataAware: tally("nowAware") };
fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results", "nomenclature-dev.json"), JSON.stringify({ note: "Development comparison on the exposed Stage 9H nomenclature cases; not a blind result.", summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const r of rows.filter((x) => x.now !== "correct")) console.log(`${r.id} 9H:${r.original} now:${r.now} aware:${r.nowAware} | ${r.reference} | ${r.shown} (${r.status}/${r.confidence})`);
process.exit(0);
