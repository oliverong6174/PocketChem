// Runs the current mass-spectrum engine on the Stage 9I development set and writes a dated result file.
// usage: node run.mjs <label>        (label becomes part of the file name, for example "baseline" or "after-fix")
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..", "..");
const label = process.argv[2] ?? "run";
const { loadEngine, loadModule, closeEngine } = await import(pathToFileURL(path.join(root, "scripts", "tests", "engine.mjs")).href);
const S = await import(pathToFileURL(path.join(root, "scripts", "benchmarks", "stage9h", "scoring.mjs")).href);
const casesFile = process.env.MS_CASES ?? path.join(here, "cases.json");
const cases = JSON.parse(fs.readFileSync(casesFile, "utf8")).cases;

await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const nom = await loadModule("/src/utils/nomenclatureUtils.ts");
const massModule = await loadModule("/src/utils/spectroscopy/massSpec.ts");

const records = [];
for (const c of cases) {
  const hierarchy = await groups.analyzeFunctionalGroupHierarchy(c.smiles);
  const identity = await nom.analyzeNomenclatureAndProperties(c.smiles, hierarchy.primaryGroups, hierarchy.mainGroup);
  const p = identity.properties;
  const exact = Number.parseFloat(p.exactMass ?? "");
  const ms = await massModule.predictMassSpectrum(p.molecularFormula, Number.isFinite(exact) ? exact : null, hierarchy.functionalGroups, c.smiles);
  const peaks = ms.peaks.map((x) => ({ mz: x.mz, relativeIntensity: x.relativeIntensity }));
  const out = { molecularIonMz: ms.molecularIonMz, basePeakMz: ms.basePeakMz, peaks };
  const top = [...peaks].sort((a, b) => b.relativeIntensity - a.relativeIntensity).slice(0, 4).map((x) => `${Math.round(x.mz)}:${Math.round(x.relativeIntensity)}`);
  records.push({
    id: c.id,
    category: c.category,
    title: c.title,
    expectedBasePeak: c.expected.base_peak_mz,
    engineBasePeak: Math.round(ms.basePeakMz),
    basePeakCertainty: ms.basePeakCertainty ?? null,
    candidateBasePeaks: ms.candidateBasePeaks ?? null,
    top,
    dimensions: S.scoreMS(c, out),
  });
}
await closeEngine();

const count = (pick) => records.filter(pick).length;
const withFrag = records.filter((r) => r.dimensions.fragments);
const summary = {
  label,
  cases: records.length,
  molecularIon: `${count((r) => r.dimensions.molecularIon?.status === "correct")}/${count((r) => r.dimensions.molecularIon)}`,
  basePeak: `${count((r) => r.dimensions.basePeak.status === "correct")}/${records.length}`,
  strictFragments: `${withFrag.filter((r) => r.dimensions.fragments.status === "correct").length}/${withFrag.length}`,
  basePeakWhenCommitted: (() => {
    const committed = records.filter((r) => r.basePeakCertainty === null || r.basePeakCertainty === "predicted");
    return `${committed.filter((r) => r.dimensions.basePeak.status === "correct").length}/${committed.length}`;
  })(),
  uncertain: count((r) => r.basePeakCertainty && r.basePeakCertainty !== "predicted"),
  uncertainButCandidateSetHit: count((r) => r.basePeakCertainty && r.basePeakCertainty !== "predicted" && (r.candidateBasePeaks ?? []).some((m) => Math.round(m) === r.expectedBasePeak)),
};
fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results", `${label}.json`), JSON.stringify({ summary, records }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const r of records) console.log(r.id, r.category.padEnd(11), r.title.padEnd(22), "exp", r.expectedBasePeak, "got", r.engineBasePeak, r.dimensions.basePeak.status === "correct" ? "OK " : "-- ", r.basePeakCertainty ?? "", r.top.join(" "));
process.exit(0);
