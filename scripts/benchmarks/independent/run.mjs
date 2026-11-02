// Independent benchmark runner and scorer (Stage 9D, Phase C/D).
//
// Executes every frozen case on the real engine and scores SEPARATE dimensions. There is deliberately no
// single accuracy number: a correct abstention is not a wrong prediction, a timeout is not "no route
// exists", and an unspecified stereocentre is "incomplete", not wrong.
//
//   node scripts/benchmarks/independent/run.mjs [--out results/independent-results.json] [--only ID,ID]
//
// Dimensions (per case, only where the case has an expectation for it):
//   structure       every predicted product parses
//   connectivity    the expected product constitutions are present and no forbidden one is offered
//   regiochemistry  the engine's own "major" matches the expected major (abstains when it ranks nothing)
//   stereochemistry matched products carry the expected CIP / E-Z / racemate status (incomplete if unspecified)
//   classification  engine selectivity class vs expected major/minor role (abstains when unranked)
//   conditions      catalytic vs non-catalytic, from the rule's roles (unassessed when the rule has none)
//   unsupported     abstain vs supported-correct vs wrong for deliberately out-of-scope reactions
//   route           discovery / structural verification / plausibility / timeout, for search cases
//   workspace       multi-step workspace expectations (statuses, intermediates, catalysis)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, getRdkit, loadEngine, loadModule } from "../../tests/engine.mjs";
import { CASES, CORRECTIONS, SOURCES } from "./cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const outFile = argValue("--out") ?? path.join(here, "results", "independent-results.json");
const only = argValue("--only")?.split(",") ?? null;
const screen = JSON.parse(fs.readFileSync(path.join(here, "screen-report.json"), "utf8"));

const { utils } = await loadEngine();
const registry = utils.reactionRegistry;
const rd = await getRdkit();
const ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
const catalysis = await loadModule("/src/utils/reactions/engine/workspaceCatalysis.ts");
const roles = await loadModule("/src/utils/reactions/engine/catalystRoles.ts");
const stereoModule = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const searchRun = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
const groups = await loadModule("/src/utils/functionalGroups/index.ts");

// ---- molecule helpers ------------------------------------------------------------------------
const withMol = (smiles, fn) => {
  const mol = rd.get_mol(smiles);
  if (!mol) return null;
  try {
    return fn(mol);
  } finally {
    mol.delete();
  }
};
const constitution = (smiles) => withMol(smiles, (mol) => mol.get_smiles(JSON.stringify({ doIsomericSmiles: false })));
const hasStereoMark = (smiles) => /@|\/|\\/.test(smiles);
const cipAtoms = (smiles) =>
  withMol(smiles, (mol) => JSON.parse(mol.get_stereo_tags()).CIP_atoms.map((entry) => String(entry[1]).replace(/[()]/g, "")).sort().join(""));
const geometries = (smiles) =>
  withMol(smiles, (mol) => JSON.parse(mol.get_stereo_tags()).CIP_bonds.map((entry) => String(entry[2]).replace(/[()]/g, "")));
const components = (smiles) => smiles.split(".").filter(Boolean);

// ---- scoring primitives ----------------------------------------------------------------------
const verdict = (status, detail = "") => ({ status, detail });
const NA = verdict("n/a");

function engineProducts(outcomes) {
  const out = [];
  for (const outcome of outcomes) {
    const members = outcome.mixture?.memberSmiles?.length ? outcome.mixture.memberSmiles : [outcome.productSmiles];
    for (const member of members) for (const part of components(member)) out.push({ smiles: part, constitution: constitution(part), outcome });
    if (outcome.mixture?.memberSmiles?.length) {
      // components of the representative are enough for constitution; members matter for stereo
    }
  }
  return out;
}

function scoreStructure(outcomes) {
  const parts = outcomes.flatMap((outcome) => components(outcome.productSmiles));
  if (parts.length === 0) return NA;
  const bad = parts.filter((smiles) => !constitution(smiles));
  return bad.length === 0 ? verdict("correct") : verdict("wrong", `unparsable: ${bad.join(", ")}`);
}

function scoreConnectivity(expect, outcomes, stepStatus) {
  if (expect.outcome === "no-reaction") {
    const offered = engineProducts(outcomes).map((p) => p.constitution);
    const forbiddenHit = (expect.forbidden ?? []).map(constitution).some((c) => offered.includes(c));
    if (stepStatus === "no-reaction" && !forbiddenHit) return verdict("correct", "engine predicts no reaction");
    if (forbiddenHit) return verdict("wrong", "engine offers the forbidden product");
    return verdict(stepStatus === "needs-input" || stepStatus === "unsupported" ? "abstained" : "wrong", `status ${stepStatus}`);
  }
  const wanted = (expect.products ?? []).filter((p) => ["sole", "major", "formed"].includes(p.role));
  if (wanted.length === 0) return NA;
  const offered = engineProducts(outcomes).map((p) => p.constitution);
  if (outcomes.length === 0) {
    return verdict(stepStatus === "needs-input" || stepStatus === "unsupported" || stepStatus === "no-reaction" ? "abstained" : "wrong", `status ${stepStatus}`);
  }
  const missing = wanted.filter((p) => !offered.includes(constitution(p.smiles)));
  const forbiddenHit = (expect.forbidden ?? []).filter((smiles) => offered.includes(constitution(smiles)));
  if (forbiddenHit.length > 0) return verdict("wrong", `offers forbidden ${forbiddenHit.join(", ")}`);
  if (missing.length > 0) return verdict("wrong", `missing ${missing.map((p) => p.smiles).join(", ")}; offered ${[...new Set(offered)].join(", ")}`);
  return verdict("correct");
}

function majorsOf(outcomes) {
  const majors = outcomes.filter((outcome) => outcome.selectivityFinding.class === "major");
  if (majors.length > 0) return { kind: "ranked", constitutions: [...new Set(majors.flatMap((o) => components(o.productSmiles).map(constitution)))] };
  const distinct = [...new Set(outcomes.map((o) => constitution(o.productComponents?.join(".") ?? o.productSmiles)))];
  if (outcomes.length > 0 && distinct.length === 1) return { kind: "sole", constitutions: [...new Set(outcomes.flatMap((o) => components(o.productSmiles).map(constitution)))] };
  return { kind: "unranked", constitutions: [] };
}

function scoreRegiochemistry(expect, outcomes) {
  const expectedMajor = (expect.products ?? []).filter((p) => p.role === "major").map((p) => constitution(p.smiles));
  const forbidden = (expect.forbidden ?? []).map(constitution);
  const sole = (expect.products ?? []).filter((p) => p.role === "sole").map((p) => constitution(p.smiles));
  if (expectedMajor.length === 0 && !(forbidden.length > 0 && sole.length > 0)) return NA;
  if (outcomes.length === 0) return verdict("abstained", "no products offered");
  const engine = majorsOf(outcomes);
  const offered = engineProducts(outcomes).map((p) => p.constitution);
  if (expectedMajor.length === 0) {
    // sole expected product plus forbidden regioisomers
    if (forbidden.some((c) => offered.includes(c))) return verdict("wrong", "offers the forbidden regioisomer");
    return sole.every((c) => offered.includes(c)) ? verdict("correct") : verdict("wrong", "expected regioisomer missing");
  }
  if (engine.kind === "unranked") return verdict("abstained", "engine offers several outcomes and ranks none as major");
  // Only products the case lists can make this wrong; an unlisted coproduct is ignored.
  const expectedMinor = (expect.products ?? []).filter((p) => p.role === "minor").map((p) => constitution(p.smiles));
  const hitsMajor = engine.constitutions.some((c) => expectedMajor.includes(c));
  const hitsWrong = engine.constitutions.some((c) => expectedMinor.includes(c) || forbidden.includes(c));
  if (hitsMajor && !hitsWrong) return verdict("correct", engine.kind === "sole" ? "only outcome" : "engine-ranked major");
  return verdict("wrong", `engine major ${engine.constitutions.join(", ")}`);
}

function scoreStereo(expect, outcomes) {
  const checks = (expect.products ?? []).filter((p) => p.cip || p.geometry || p.stereoSpecified || p.mixture);
  if (checks.length === 0) return NA;
  const results = [];
  for (const wanted of checks) {
    const target = constitution(wanted.smiles);
    const matched = outcomes.filter((o) => components(o.productSmiles).some((part) => constitution(part) === target));
    if (matched.length === 0) {
      results.push(verdict("n/a", "constitution not produced"));
      continue;
    }
    const outcome = matched[0];
    const members = (outcome.mixture?.memberSmiles?.length ? outcome.mixture.memberSmiles : [outcome.productSmiles]).flatMap(components).filter((part) => constitution(part) === target);
    const marked = members.some(hasStereoMark);
    if (!marked) {
      results.push(verdict("incomplete", "stereochemistry unspecified in the product"));
      continue;
    }
    if (wanted.geometry) {
      const got = members.flatMap(geometries);
      results.push(got.length > 0 && got.every((g) => g === wanted.geometry) ? verdict("correct") : verdict("wrong", `geometry ${got.join(",")}`));
      continue;
    }
    if (wanted.cip) {
      const got = [...new Set(members.map(cipAtoms))].sort();
      const want = [...new Set(wanted.cip.map((entry) => entry.split("").sort().join("")))].sort();
      const isRacemic = outcome.mixture?.kind === "racemic" || got.length > 1;
      // A racemate lists both enantiomers (RR and SS); a meso/single compound lists one set.
      const gotLabels = new Set(members.map((member) => withMol(member, (mol) => JSON.parse(mol.get_stereo_tags()).CIP_atoms.map((e) => String(e[1]).replace(/[()]/g, "")).join(""))));
      const wantLabels = new Set(wanted.cip.map((entry) => entry.split("").join("")));
      const sameSets = gotLabels.size === wantLabels.size && [...wantLabels].every((label) => gotLabels.has(label) || gotLabels.has(label.split("").reverse().join("")));
      let ok = sameSets;
      if (ok && wanted.mixture === "racemic") ok = isRacemic;
      results.push(ok ? verdict("correct") : verdict("wrong", `CIP ${[...gotLabels].join("/")} vs expected ${[...wantLabels].join("/")}`));
      void got;
      void want;
      continue;
    }
    results.push(verdict("not-scored", "relative configuration cannot be checked from labels (stereo is specified)"));
  }
  const scored = results.filter((r) => !["n/a", "not-scored"].includes(r.status));
  if (scored.length === 0) return results[0] ?? NA;
  if (scored.some((r) => r.status === "wrong")) return scored.find((r) => r.status === "wrong");
  if (scored.some((r) => r.status === "incomplete")) return scored.find((r) => r.status === "incomplete");
  return verdict("correct");
}

function scoreClassification(expect, outcomes) {
  const rolePairs = (expect.products ?? []).filter((p) => p.role === "major" || p.role === "minor");
  if (rolePairs.length === 0) return NA;
  const results = [];
  for (const wanted of rolePairs) {
    const target = constitution(wanted.smiles);
    const outcome = outcomes.find((o) => components(o.productSmiles).some((part) => constitution(part) === target));
    if (!outcome) {
      results.push(verdict("n/a", "not offered"));
      continue;
    }
    const cls = outcome.selectivityFinding.class;
    if (wanted.role === "major") results.push(cls === "major" ? verdict("correct") : cls === "disfavored" ? verdict("wrong", "engine calls the expected major disfavored") : verdict("abstained", cls));
    else results.push(cls === "disfavored" ? verdict("correct") : cls === "major" ? verdict("wrong", "engine calls the expected minor major") : verdict("abstained", cls));
  }
  const scored = results.filter((r) => r.status !== "n/a");
  if (scored.length === 0) return verdict("n/a", "expected products not offered");
  if (scored.some((r) => r.status === "wrong")) return scored.find((r) => r.status === "wrong");
  if (scored.every((r) => r.status === "correct")) return verdict("correct");
  return verdict("abstained", scored.map((r) => r.detail).join(", "));
}

function scoreConditions(expect, ruleIds) {
  const want = expect.conditions?.catalysis;
  if (!want) return NA;
  const rule = registry.find((r) => r.id === ruleIds[0]);
  if (!rule) return NA;
  const identity = roles.describeRuleRoles(rule).catalystIdentity;
  if (identity === "unknown") return verdict("unassessed", "no curated roles for this rule");
  const got = identity === "none" ? "none" : "catalytic";
  return got === want ? verdict("correct", `${got} (${identity})`) : verdict("wrong", `engine says ${got}`);
}

// ---- case runners ----------------------------------------------------------------------------
async function runStep(testCase) {
  const created = await ws.createWorkspace(testCase.reactants);
  if (!created.ok) return { error: created.problems.join("; ") };
  const ruleIds = [].concat(testCase.rule);
  const lotIds = created.workspace.pool.lots.map((lot) => lot.id);
  const outcomes = [];
  const statuses = [];
  for (const ruleId of ruleIds) {
    const result = await ws.executeWorkspaceStep(created.workspace, { ruleId, lotIds }, registry);
    statuses.push(result.step.status);
    outcomes.push(...result.step.outcomes);
  }
  const status = statuses.includes("reaction") || statuses.includes("needs-selection") ? "offered" : statuses[0];
  return { outcomes, status, statuses, ruleIds };
}

async function runUnsupported(testCase) {
  const pattern = new RegExp(testCase.reagentPattern, "i");
  const claimingRules = registry.filter((rule) => pattern.test(`${rule.title} ${rule.reagents} ${rule.reagentNote}`)).map((rule) => rule.id);
  const input = testCase.reactants.join(".");
  const hierarchy = testCase.reactants.length === 1 ? await groups.analyzeFunctionalGroupHierarchy(input) : null;
  const pathways = await utils.predictReactionPathways(input, hierarchy?.primaryGroups ?? []);
  const wanted = testCase.expect.products.map((p) => constitution(p.smiles));
  const producing = pathways.filter((pathway) => pathway.productSmiles && components(pathway.productSmiles).some((part) => wanted.includes(constitution(part))));
  return { claimingRules, producing: producing.map((p) => p.ruleId), producedPathways: producing };
}

async function runRoute(testCase) {
  const controller = new searchRun.SearchRunController({ rules: registry, totalMs: 15000 });
  const started = performance.now();
  await controller.start({ startingSmiles: testCase.start, targetSmiles: testCase.target, copies: 1 });
  const state = controller.getState();
  return { state, ms: Math.round(performance.now() - started) };
}

async function runWorkspace(testCase) {
  const created = await ws.createWorkspace(testCase.starts);
  const workspace = await ws.runWorkspaceScript(created.workspace, testCase.script, registry);
  const assessed = await ws.assessWorkspace(workspace, registry);
  return { workspace, assessed, catalysis: catalysis.assessWorkspaceCatalysis(workspace, registry) };
}

// ---- main loop -------------------------------------------------------------------------------
const records = [];
let peakRss = 0;
for (const testCase of CASES) {
  if (only && !only.includes(testCase.id)) continue;
  const started = performance.now();
  const record = {
    id: testCase.id, category: testCase.category, kind: testCase.kind, title: testCase.title,
    provenance: testCase.provenance.level,
    overlapsFixtures: Boolean(screen.overlapping[testCase.id]),
    knownGap: testCase.knownGap ?? null,
    dimensions: {},
    engine: null,
  };
  try {
    if (testCase.kind === "step") {
      const run = await runStep(testCase);
      if (run.error) {
        record.dimensions.structure = verdict("wrong", run.error);
      } else {
        record.engine = {
          status: run.status,
          rules: run.ruleIds,
          outcomes: run.outcomes.map((o) => ({ product: o.productSmiles, class: o.selectivityFinding.class, level: o.selectivity?.level ?? null, mixture: o.mixture?.kind ?? null })),
        };
        record.dimensions.structure = scoreStructure(run.outcomes);
        record.dimensions.connectivity = scoreConnectivity(testCase.expect, run.outcomes, run.statuses[0]);
        if (testCase.expect.outcome === "ambiguous") {
          const majors = run.outcomes.filter((o) => o.selectivityFinding.class === "major");
          record.dimensions.ambiguity = majors.length === 0 ? verdict("correct", "no single winner declared") : verdict("wrong", "engine declares a major where the literature says it is condition-dependent");
        } else {
          record.dimensions.regiochemistry = scoreRegiochemistry(testCase.expect, run.outcomes);
          record.dimensions.classification = scoreClassification(testCase.expect, run.outcomes);
        }
        record.dimensions.stereochemistry = scoreStereo(testCase.expect, run.outcomes);
        record.dimensions.conditions = scoreConditions(testCase.expect, run.ruleIds);
      }
    } else if (testCase.kind === "unsupported") {
      const run = await runUnsupported(testCase);
      const claimed = run.claimingRules.length > 0;
      const produced = run.producing.length > 0;
      let status;
      if (!claimed && !produced) status = verdict("correct-abstention", "no rule claims this reagent system and nothing produces the reference product");
      else if (produced) status = verdict("supported-correct", `produced by ${run.producing.join(", ")}`);
      else status = verdict("wrong", `rules ${run.claimingRules.join(", ")} claim the reagents but do not give the reference product`);
      const stereoWanted = testCase.expect.products.some((p) => p.stereoSpecified);
      if (produced && stereoWanted) {
        const target = testCase.expect.products.find((p) => p.stereoSpecified || p.cip);
        const wantedConstitution = constitution(target.smiles);
        const members = run.producedPathways.flatMap((p) => (p.productMixture?.memberSmiles?.length ? p.productMixture.memberSmiles : [p.productSmiles]).flatMap(components)).filter((part) => constitution(part) === wantedConstitution);
        const tetrahedral = members.filter((part) => /@/.test(part));
        if (tetrahedral.length === 0) record.dimensions.stereochemistry = verdict("incomplete", "no new tetrahedral stereochemistry specified");
        else if (target.cip) {
          const got = new Set(tetrahedral.map(cipAtoms));
          record.dimensions.stereochemistry = got.size === 1 && got.has(target.cip[0]) ? verdict("correct") : verdict("wrong", `CIP ${[...got].join("/")} vs expected ${target.cip.join("/")}`);
        } else record.dimensions.stereochemistry = verdict("not-scored", "stereo specified; configuration not asserted by the reference");
      }
      record.dimensions.unsupported = status;
      record.engine = { claimingRules: run.claimingRules, producingRules: run.producing };
    } else if (testCase.kind === "route") {
      const run = await runRoute(testCase);
      const best = run.state.ranked[0]?.route ?? null;
      const outcomeKind = run.state.outcome?.kind ?? "none";
      const ruleSequence = best ? best.steps.map((s) => s.ruleId) : [];
      const exp = testCase.expect;
      let discovery;
      if (best) discovery = verdict("found");
      else if (outcomeKind === "no-route-within-budget" || outcomeKind === "stalled") discovery = verdict("timeout", outcomeKind);
      else discovery = verdict("not-found-within-bounds", outcomeKind);
      record.dimensions.routeDiscovery = discovery;
      record.dimensions.routeVerification = best ? verdict(best.verification?.status === "verified" ? "verified" : best.verification?.status ?? "unverified") : NA;
      let plausibility = NA;
      if (best) {
        const outside = ruleSequence.filter((id) => !exp.allowedRules.includes(id));
        const forbidden = ruleSequence.filter((id) => (exp.forbiddenRules ?? []).includes(id));
        let order = true;
        if (exp.orderedBefore) order = ruleSequence.indexOf(exp.orderedBefore[0]) !== -1 && ruleSequence.indexOf(exp.orderedBefore[0]) < ruleSequence.indexOf(exp.orderedBefore[1]);
        plausibility = outside.length === 0 && forbidden.length === 0 && order
          ? verdict("plausible", ruleSequence.join(" > "))
          : verdict("implausible", `${outside.length ? "unexpected rules " + outside.join(",") : ""}${forbidden.length ? " forbidden " + forbidden.join(",") : ""}${order ? "" : " wrong step order"}`.trim());
      }
      record.dimensions.routePlausibility = plausibility;
      record.engine = { outcome: outcomeKind, ruleSequence, routes: run.state.ranked.length, ms: run.ms };
    } else if (testCase.kind === "workspace") {
      const run = await runWorkspace(testCase);
      const exp = testCase.expect;
      const statuses = run.workspace.history.map((s) => s.status);
      const live = run.workspace.pool.lots.filter((l) => l.availability === "live").map((l) => constitutionIso(l.smiles));
      const wantLive = exp.live.map(constitutionIso);
      const checks = [];
      checks.push(["statuses", JSON.stringify(statuses) === JSON.stringify(exp.statuses)]);
      checks.push(["final inventory", live.length === wantLive.length && wantLive.every((s) => live.includes(s))]);
      for (const [step, smiles] of Object.entries(exp.intermediates ?? {})) {
        const entry = run.workspace.history.find((h) => h.committedStep === Number(step));
        const got = entry ? constitutionIso(entry.outcomes[entry.selectedOutcome].productSmiles) : null;
        checks.push([`intermediate ${step}`, got === constitutionIso(smiles)]);
      }
      checks.push(["catalytic steps", JSON.stringify(run.catalysis.catalyticStepNumbers) === JSON.stringify(exp.catalyticSteps)]);
      if (exp.noCatalystSteps) checks.push(["non-catalytic steps declare no catalyst", exp.noCatalystSteps.every((n) => run.catalysis.steps.find((s) => s.stepNumber === n)?.catalysts.length === 0)]);
      const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
      record.dimensions.workspace = failed.length === 0 ? verdict("correct") : verdict("wrong", failed.join(", "));
      record.dimensions.routeVerification = run.assessed ? verdict(run.assessed.verification.status) : NA;
      record.engine = { statuses, final: live };
    }
  } catch (error) {
    record.dimensions.error = verdict("harness-error", error instanceof Error ? error.message : String(error));
  }
  record.ms = Math.round(performance.now() - started);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  records.push(record);
  const flat = Object.entries(record.dimensions).filter(([, v]) => v.status !== "n/a").map(([k, v]) => `${k}:${v.status}`).join(" ");
  console.log(`${record.id.padEnd(6)} ${record.provenance.padEnd(18)} ${String(record.ms).padStart(6)} ms  ${flat}`);
}

function constitutionIso(smiles) {
  return withMol(smiles, (mol) => mol.get_smiles());
}

// ---- aggregation ------------------------------------------------------------------------------
const DIMENSIONS = ["structure", "connectivity", "regiochemistry", "stereochemistry", "classification", "conditions", "ambiguity", "unsupported", "routeDiscovery", "routeVerification", "routePlausibility", "workspace"];
function tally(subset) {
  const table = {};
  for (const dimension of DIMENSIONS) {
    const counts = {};
    for (const record of subset) {
      const verdictOf = record.dimensions[dimension];
      if (!verdictOf || verdictOf.status === "n/a") continue;
      counts[verdictOf.status] = (counts[verdictOf.status] ?? 0) + 1;
    }
    if (Object.keys(counts).length > 0) table[dimension] = counts;
  }
  return table;
}
const validated = records.filter((r) => r.provenance !== "provisional" && !r.overlapsFixtures);
const provisional = records.filter((r) => r.provenance === "provisional");
const overlapping = records.filter((r) => r.overlapsFixtures);
const summary = {
  generatedBy: "scripts/benchmarks/independent/run.mjs",
  cases: records.length,
  counts: { validatedHeldOut: validated.length, provisional: provisional.length, overlappingFixtures: overlapping.length },
  referenceValidated: tally(validated),
  provisionalOnly: tally(provisional),
  overlappingOnly: tally(overlapping),
  allCases: tally(records),
  byCategory: Object.fromEntries([...new Set(records.map((r) => r.category))].map((category) => [category, tally(validated.filter((r) => r.category === category))])),
  runtime: { totalMs: records.reduce((sum, r) => sum + r.ms, 0), slowestMs: Math.max(...records.map((r) => r.ms)), peakRssMB: Math.round(peakRss / 1048576) },
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ summary, records, sources: SOURCES, corrections: CORRECTIONS }, null, 2));
console.log(`\nwrote ${path.relative(process.cwd(), outFile)}\n${JSON.stringify(summary.referenceValidated, null, 1)}`);
await closeEngine();
process.exit(0);
