// Runs the Stage 9I route-quality assessor on the Stage 9J validation set. usage: node run.mjs <label>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..", "..");
const label = process.argv[2] ?? "run";
const { closeEngine, loadModule } = await import(pathToFileURL(path.join(root, "scripts", "tests", "engine.mjs")).href);
const H = await import(pathToFileURL(path.join(root, "scripts", "tests", "fixtures", "convergentHelpers.mjs")).href);
const cases = JSON.parse(fs.readFileSync(path.join(here, "cases.json"), "utf8")).cases;

const { registry } = await H.modules();
const verifyMod = await loadModule("/src/utils/reactions/engine/routeVerification.ts");
const compat = await loadModule("/src/utils/reactions/engine/compatibility.ts");
const selectivity = await loadModule("/src/utils/reactions/engine/selectivityAssessment.ts");
const quality = await loadModule("/src/utils/reactions/engine/routeQuality.ts");
const planner = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
// Harness v2 (Stage 9J): steps are built with the planner's own forwardStepFromPathway so dynamic selectivityAssessment, limitations
// and metadata reach the assessor exactly as in a real search. Harness v1 used a test fixture that dropped them (see ERRATA-9J.md).
const HARNESS = process.env.HARNESS ?? "v2";

function manualStep(n, ruleId, reactants, product) {
  const r = registry.find((x) => x.id === ruleId);
  return {
    id: `s${n}`, stepNumber: n, source: "forward", ruleId, family: r.family, reactionType: r.reactionType, title: r.title,
    reactantSmiles: reactants.join("."), reactantComponents: reactants, reactantLabel: "",
    productSmiles: product, productComponents: product.split("."), productLabel: "",
    reagentLabel: r.reagents, reagentNote: r.reagentNote, shortExplanation: "", selectivity: [], limitations: [],
  };
}

const records = [];
console.log("harness", HARNESS);
for (const c of cases) {
  const rec = { id: c.id, label: c.label, built: "engine", tier: null, codes: [], note: "" };
  try {
    const steps = [];
    let pool = null;
    for (const [i, s] of c.steps.entries()) {
      const reactants = s.reactants;
      const pathway = c.fabricated ? null : await H.pathwayGiving(s.rule, reactants, s.product.split("."));
      if (pathway) {
        const planned = HARNESS === "v2" ? planner.forwardStepFromPathway(pathway) : H.stepFromPathway(pathway);
        steps.push({ ...planned, id: `s${i + 1}`, stepNumber: i + 1, source: "forward" });
      } else {
        if (!c.fabricated) rec.built = "manual (engine did not produce this product)";
        else rec.built = "manual (fabricated)";
        steps.push(manualStep(i + 1, s.rule, reactants, s.product));
      }
      pool = pool ?? reactants;
    }
    // Starting materials: every reactant of step 1 plus extra reactants of later steps that no earlier product supplies.
    const first = c.steps[0].reactants;
    const startingSmiles = first.concat(c.steps.slice(1).flatMap((s) => s.reactants.filter((r) => !c.steps.slice(0, c.steps.indexOf(s)).some((p) => p.product.split(".").includes(r))))).join(".");
    const route = {
      id: c.id, startingSmiles, targetSmiles: c.steps[c.steps.length - 1].product.split(".").sort((a, b) => b.length - a.length)[0], steps, confidence: "verified", score: 0,
    };
    route.verification = await verifyMod.verifyMultistepRoute(route, registry);
    route.compatibility = await compat.assessRouteCompatibility(route, registry);
    route.selectivity = await selectivity.assessRouteSelectivity(route, registry);
    const q = await quality.assessRouteQuality(route, registry);
    rec.structural = route.verification.status;
    rec.problems = (route.verification.problems ?? []).slice(0, 2);
    rec.tier = q.tier;
    rec.codes = q.findings.filter((f) => f.level !== "info").map((f) => `${f.level}:${f.code}`);
  } catch (error) {
    rec.tier = "error";
    rec.note = String(error?.message ?? error).slice(0, 160);
  }
  records.push(rec);
}
await closeEngine();

const flagged = (r) => r.tier === "known-concern" || r.tier === "contradicted";
const of = (l) => records.filter((r) => r.label === l);
const flags = of("flag");
const clears = of("clear");
const ns = of("not-supported");
const summary = {
  label,
  flag: { n: flags.length, detected: flags.filter(flagged).length, missed: flags.filter((r) => !flagged(r)).map((r) => `${r.id}:${r.tier}`) },
  clear: { n: clears.length, falselyFlagged: clears.filter(flagged).map((r) => `${r.id}:${r.tier}[${r.codes.join(",")}]`), notFlagged: clears.filter((r) => !flagged(r)).length },
  notSupported: { n: ns.length, wronglySupported: ns.filter((r) => r.tier === "chemically-supported").map((r) => r.id) },
  errors: records.filter((r) => r.tier === "error").map((r) => `${r.id}:${r.note}`),
  tierCounts: records.reduce((m, r) => ((m[r.tier] = (m[r.tier] ?? 0) + 1), m), {}),
};
fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results", `${label}.json`), JSON.stringify({ summary, records }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const r of records) console.log(r.id, r.label.padEnd(13), String(r.tier).padEnd(20), r.built.slice(0, 8).padEnd(8), (r.structural ?? "").padEnd(8), r.codes.join(" "));
process.exit(0);
