// Stage 9F capability benchmark runner and scorer.
//
//   node scripts/benchmarks/stage9f/run.mjs --set dev [--only ID,ID] [--out results/x.json] [--capability nomenclature,...]
//   node scripts/benchmarks/stage9f/run.mjs --set holdout --final     (only from a clean committed tree; see guard below)
//
// Scoring rules are fixed in this file BEFORE any case is run (see manifest.json for the freeze). They are never combined into one
// number: each capability reports its own dimensions with fixed denominators, and "abstained" (the engine says it does not know)
// is never counted as wrong or as correct. Only cases whose evidence is "verified" enter the scored denominators; "inferred" cases
// are run and recorded but reported separately.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { closeEngine, getRdkit, loadEngine, loadModule } from "../../tests/engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const setName = argValue("--set") ?? "dev";
const only = argValue("--only")?.split(",") ?? null;
const capabilities = argValue("--capability")?.split(",") ?? null;
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest.json"), "utf8"));

// ---- contamination guards --------------------------------------------------------------------
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const engineCommit = git("rev-parse", "HEAD");
const dirtySrc = git("status", "--porcelain", "--", "src").length > 0;
if (setName === "holdout") {
  if (!args.includes("--final")) throw new Error("The blind holdout runs only with --final.");
  if (dirtySrc) throw new Error("Refusing to run the holdout with uncommitted changes under src/.");
  const lock = path.join(here, "holdout-lock.json");
  if (fs.existsSync(lock)) throw new Error("The holdout has already been run once (holdout-lock.json). It must not be run again.");
}
for (const group of Object.values(manifest.files)) {
  const full = path.join(here, group.path);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  if (hash !== group.sha256) throw new Error(`Frozen file ${group.path} changed (hash mismatch). Frozen cases must not be edited.`);
}

const { utils } = await loadEngine();
const rd = await getRdkit();
const groupsModule = await loadModule("/src/utils/functionalGroups/index.ts");
const nomen = await loadModule("/src/utils/nomenclature/index.ts");
const stereoModule = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");

// ---- helpers -----------------------------------------------------------------------------------
const verdict = (status, detail = "") => ({ status, detail });
const NA = verdict("n/a");
const withMol = (smiles, fn) => {
  const mol = rd.get_mol(smiles);
  if (!mol) return null;
  try { return fn(mol); } finally { mol.delete(); }
};
const constitution = (smiles) => withMol(smiles, (m) => m.get_smiles(JSON.stringify({ doIsomericSmiles: false, removeHs: true })));
const components = (smiles) => (smiles ?? "").split(".").filter(Boolean);
const mirror = (smiles) => smiles.replace(/@@/g, "\u0001").replace(/@/g, "@@").replace(/\u0001/g, "@");
const isomericCanon = async (smiles) => (await stereoModule.canonicalizeStereoStructure(smiles))?.isomeric ?? smiles;
const hasTetraMark = (smiles) => /@/.test(smiles);
const hasStereoMark = (smiles) => /@|\/|\\/.test(smiles);

function loadCases(capability) {
  const file = manifest.files[capability];
  if (!file) return [];
  const data = JSON.parse(fs.readFileSync(path.join(here, file.path), "utf8"));
  return data.cases.filter((c) => manifest.split[c.id] === setName && (!only || only.includes(c.id)));
}

// ---- nomenclature ------------------------------------------------------------------------------
const STEREO_PREFIX = /\(\s*(?:\d+[a-z]?[rsez]\s*,?\s*)+\)\s*-?|\(\s*[rsez]\s*\)\s*-?|\(\s*(?:rel|rac|\+-|±)[^)]*\)\s*-?/g;
const normName = (name) => String(name ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[\s‐-―]/g, "").replace(/’/g, "'");
const stripStereo = (name) => normName(name).replace(STEREO_PREFIX, "");

async function runNomenclature(testCase) {
  const hierarchy = await groupsModule.analyzeFunctionalGroupHierarchy(testCase.smiles);
  const identity = await nomen.analyzeNomenclatureAndProperties(testCase.smiles, hierarchy.primaryGroups, hierarchy.mainGroup);
  const n = identity.nomenclature;
  const accepted = [...testCase.accepted_names, testCase.preferred_name].filter(Boolean);
  const shown = n.displayName || n.estimatedName;
  const exact = accepted.map(normName);
  const bare = accepted.map(stripStereo);
  const status = n.namingStatus;
  const classify = (candidate) => {
    if (status === "unsupported") return verdict("abstained", `status unsupported: ${candidate}`);
    if (exact.includes(normName(candidate))) return verdict("correct", candidate);
    return verdict(n.namingConfidence === "High" ? "wrong-confident" : "wrong-flagged", `${candidate} (${n.namingConfidence}) vs ${testCase.preferred_name}`);
  };
  const constitutionOnly = status === "unsupported" ? verdict("abstained")
    : bare.includes(stripStereo(shown)) ? verdict("correct") : verdict("wrong", `${shown}`);
  return {
    engine: { displayName: shown, estimatedName: n.estimatedName, status, confidence: n.namingConfidence },
    dimensions: { name: classify(shown), constitutionName: constitutionOnly, systematicName: classify(n.estimatedName) },
  };
}

// ---- properties --------------------------------------------------------------------------------
async function runProperties(testCase) {
  const hierarchy = await groupsModule.analyzeFunctionalGroupHierarchy(testCase.smiles);
  const p = (await nomen.analyzeNomenclatureAndProperties(testCase.smiles, hierarchy.primaryGroups, hierarchy.mainGroup)).properties;
  const ref = testCase.reference;
  const num = (v) => Number.parseFloat(v);
  const dims = {};
  dims.formula = String(p.molecularFormula).replace(/[+-]\d*$/, "") === String(ref.formula).replace(/[+-]\d*$/, "") ? verdict("correct") : verdict("wrong", `${p.molecularFormula} vs ${ref.formula}`);
  if (ref.molecular_weight != null) dims.molecularWeight = Math.abs(num(p.molecularWeight) - ref.molecular_weight) <= 0.1 ? verdict("correct") : verdict("wrong", `${p.molecularWeight} vs ${ref.molecular_weight}`);
  if (ref.exact_mass != null) dims.exactMass = Math.abs(num(p.exactMass) - ref.exact_mass) <= 0.005 ? verdict("correct") : verdict("wrong", `${p.exactMass} vs ${ref.exact_mass}`);
  if (ref.dbe != null) dims.dbe = p.degreesOfUnsaturation === ref.dbe ? verdict("correct") : verdict("wrong", `${p.degreesOfUnsaturation} vs ${ref.dbe}`);
  if (ref.ring_count != null) dims.ringCount = p.ringCount === ref.ring_count ? verdict("correct") : verdict("wrong", `${p.ringCount} vs ${ref.ring_count}`);
  if (ref.formal_charge != null) dims.formalCharge = p.formalCharge === ref.formal_charge ? verdict("correct") : verdict("wrong", `${p.formalCharge} vs ${ref.formal_charge}`);
  // logP: tendency check only (Crippen vs experiment), tolerance fixed at 1.0 log unit.
  if (testCase.logp_exp?.value != null && p.logP != null) {
    dims.logP = Math.abs(num(p.logP) - testCase.logp_exp.value) <= 1.0 ? verdict("correct", `${p.logP} vs ${testCase.logp_exp.value}`) : verdict("wrong", `${p.logP} vs ${testCase.logp_exp.value}`);
  }
  return { engine: { formula: p.molecularFormula, mw: p.molecularWeight, exactMass: p.exactMass, dbe: p.degreesOfUnsaturation, rings: p.ringCount, charge: p.formalCharge, logP: p.logP }, dimensions: dims };
}

// ---- reactions ---------------------------------------------------------------------------------
async function runReaction(testCase) {
  const input = testCase.reactants.join(".");
  const hierarchy = testCase.reactants.length === 1 ? await groupsModule.analyzeFunctionalGroupHierarchy(input) : null;
  const pathways = await utils.predictReactionPathways(input, hierarchy?.primaryGroups ?? []);
  const tokens = (testCase.reagent_tokens ?? []).map((t) => t.toLowerCase());
  const text = (p) => `${p.title} ${p.reagentLabel} ${p.reagentNote}`.toLowerCase();
  const pool = pathways.filter((p) => p.productSmiles && tokens.some((t) => text(p).includes(t)));
  const membersOf = (p) => (p.productMixture?.memberSmiles?.length ? p.productMixture.memberSmiles : [p.productSmiles]).flatMap(components);
  const poolProducts = pool.flatMap((p) => membersOf(p).map((smiles) => ({ smiles, constitution: constitution(smiles), pathway: p })));
  const anyProducts = pathways.filter((p) => p.productSmiles).flatMap((p) => membersOf(p).map((smiles) => constitution(smiles)));
  const exp = testCase.expected;
  const wanted = exp.products.filter((p) => ["sole", "major", "formed"].includes(p.role));
  const dims = {};
  const offered = poolProducts.map((p) => p.constitution);
  // A forbidden entry that carries stereo marks is a wrong STEREOISOMER of an acceptable constitution: it is checked in the stereo block, not by constitution.
  const forbiddenPlain = (exp.forbidden ?? []).filter((s) => !hasStereoMark(s));
  const forbiddenStereo = (exp.forbidden ?? []).filter(hasStereoMark);
  const forbiddenHit = forbiddenPlain.filter((s) => offered.includes(constitution(s)));
  const missing = wanted.filter((p) => !offered.includes(constitution(p.smiles)));
  const claimed = pool.length > 0;

  if (exp.outcome === "unsupported-expected") {
    const produced = wanted.some((p) => offered.includes(constitution(p.smiles)));
    dims.unsupported = !claimed || !produced ? verdict("correct-abstention", claimed ? "reagents claimed but reference product not produced" : "no rule claims these reagents")
      : verdict("supported-correct", `produced by ${pool.map((p) => p.ruleId).join(", ")}`);
  } else {
    if (wanted.length === 0) {
      // negative control: the case expects NO reaction, so the only error is offering a forbidden product
      dims.connectivity = forbiddenHit.length ? verdict("wrong", `offers forbidden ${forbiddenHit.join(", ")}`) : verdict("correct", claimed ? "claimed but no forbidden product offered" : "no rule claims these reagents; nothing forbidden offered");
    } else if (!claimed) {
      const reachable = wanted.every((p) => anyProducts.includes(constitution(p.smiles)));
      dims.connectivity = verdict("abstained", `no rule claims reagents ${tokens.join("/")}${reachable ? "; reference product arises under other rules" : ""}`);
    } else if (forbiddenHit.length) dims.connectivity = verdict("wrong", `offers forbidden ${forbiddenHit.join(", ")}`);
    else if (missing.length) dims.connectivity = verdict("wrong", `missing ${missing.map((p) => p.smiles).join(", ")}; offered ${[...new Set(offered)].join(", ")}`);
    else dims.connectivity = verdict("correct");
  }

  if (claimed && exp.outcome === "determinate") {
    const major = exp.products.filter((p) => p.role === "major").map((p) => constitution(p.smiles));
    const minor = exp.products.filter((p) => p.role === "minor").map((p) => constitution(p.smiles));
    const forb = forbiddenPlain.map(constitution);
    const sole = exp.products.filter((p) => p.role === "sole").map((p) => constitution(p.smiles));
    if (major.length > 0 || (sole.length > 0 && forb.length > 0)) {
      const ranked = pool.filter((p) => p.selectivityAssessment?.level === "major");
      const distinct = new Set(offered);
      let engineMajor = null;
      if (ranked.length) engineMajor = [...new Set(ranked.flatMap((p) => membersOf(p).map(constitution)))];
      else if (distinct.size === 1) engineMajor = [...distinct];
      if (major.length === 0) {
        dims.regiochemistry = forb.some((c) => offered.includes(c)) ? verdict("wrong", "offers the forbidden regioisomer")
          : sole.every((c) => offered.includes(c)) ? verdict("correct") : verdict("wrong", "expected regioisomer missing");
      } else if (!engineMajor) dims.regiochemistry = verdict("abstained", "several outcomes, none ranked major");
      else if (engineMajor.some((c) => major.includes(c)) && !engineMajor.some((c) => minor.includes(c) || forb.includes(c))) dims.regiochemistry = verdict("correct");
      else dims.regiochemistry = verdict("wrong", `engine major ${engineMajor.join(", ")}`);
    }
    if (major.length || minor.length) {
      const parts = [];
      for (const want of exp.products.filter((p) => p.role === "major" || p.role === "minor")) {
        const target = constitution(want.smiles);
        const hit = pool.find((p) => membersOf(p).some((m) => constitution(m) === target));
        if (!hit) continue;
        const level = hit.selectivityAssessment?.level ?? null;
        if (want.role === "major") parts.push(level === "major" ? "correct" : level === "minor" ? "wrong" : "abstained");
        else parts.push(level === "minor" ? "correct" : level === "major" ? "wrong" : "abstained");
      }
      if (parts.length) dims.ranking = parts.includes("wrong") ? verdict("wrong") : parts.every((s) => s === "correct") ? verdict("correct") : verdict("abstained", "outcomes unranked");
    }
  }
  if (claimed && exp.outcome === "ambiguous") {
    const majors = pool.filter((p) => p.selectivityAssessment?.level === "major");
    dims.ambiguity = majors.length === 0 ? verdict("correct", "no single winner declared") : verdict("wrong", "engine declares a major where the source says condition dependent");
  }
  if (claimed && ["specific", "racemic", "relative-only"].includes(exp.stereo)) {
    const results = [];
    for (const want of wanted) {
      const target = constitution(want.smiles);
      const members = poolProducts.filter((p) => p.constitution === target).map((p) => p.smiles);
      if (members.length === 0) continue;
      if (!members.some(hasStereoMark)) { results.push("incomplete"); continue; }
      const got = new Set(await Promise.all(members.map(isomericCanon)));
      const w = await isomericCanon(want.smiles);
      const wm = await isomericCanon(mirror(want.smiles));
      const forbiddenCanon = await Promise.all(forbiddenStereo.filter((x) => constitution(x) === target).map(isomericCanon));
      const hitsForbidden = forbiddenCanon.some((x) => got.has(x));
      // meso: the structure equals its own mirror image, so one canonical form is the whole answer
      if (hitsForbidden) results.push("wrong");
      else if (exp.stereo === "specific") results.push(w === wm ? (got.has(w) ? "correct" : "wrong") : got.has(w) && !got.has(wm) ? "correct" : "wrong");
      else if (exp.stereo === "racemic") results.push(w === wm ? (got.has(w) ? "correct" : "wrong") : got.has(w) && got.has(wm) ? "correct" : "wrong");
      else results.push(got.has(w) || got.has(wm) ? "correct" : "wrong");
    }
    if (results.length) dims.stereochemistry = results.includes("wrong") ? verdict("wrong") : results.includes("incomplete") ? verdict("incomplete", "stereochemistry unspecified") : verdict("correct");
  }
  return {
    engine: { claimingRules: [...new Set(pool.map((p) => p.ruleId))], offered: [...new Set(poolProducts.map((p) => p.smiles))], levels: pool.map((p) => `${p.productSmiles}:${p.selectivityAssessment?.level ?? "none"}`) },
    dimensions: dims,
  };
}

// ---- ranking -----------------------------------------------------------------------------------
async function runRanking(testCase) {
  const analysis = await loadModule("/src/utils/ranking/comparisonAnalysis.ts");
  const display = await loadModule("/src/utils/ranking/rankingDisplay.ts");
  const molecules = [];
  for (let i = 0; i < testCase.smiles.length; i += 1) {
    const hierarchy = await groupsModule.analyzeFunctionalGroupHierarchy(testCase.smiles[i]);
    molecules.push({ id: i, profile: await analysis.analyzeComparisonMolecule(testCase.smiles[i], hierarchy) });
  }
  const { rankById } = display.deriveRanking(molecules, testCase.mode_id);
  const expectedGroup = new Map();
  testCase.expected_order.forEach((group, gi) => group.forEach((s) => expectedGroup.set(constitutionIso(s), gi)));
  let pairs = 0, right = 0, wrong = 0, abstained = 0;
  for (let a = 0; a < testCase.smiles.length; a += 1) {
    for (let b = a + 1; b < testCase.smiles.length; b += 1) {
      const ga = expectedGroup.get(constitutionIso(testCase.smiles[a])), gb = expectedGroup.get(constitutionIso(testCase.smiles[b]));
      if (ga === undefined || gb === undefined) continue;
      pairs += 1;
      const ra = rankById.get(a), rb = rankById.get(b);
      if (ra === undefined || rb === undefined) { abstained += 1; continue; }
      const expectedSign = Math.sign(ga - gb), gotSign = Math.sign(ra - rb);
      if (expectedSign === gotSign) right += 1; else wrong += 1;
    }
  }
  const status = pairs === 0 ? "n/a" : wrong === 0 && abstained === 0 ? "correct" : wrong === 0 ? "abstained" : "wrong";
  return {
    engine: { ranks: testCase.smiles.map((s, i) => `${s}=${rankById.get(i) ?? "unranked"}`), headlines: molecules.map((m) => m.profile.metrics[testCase.mode_id].headline) },
    dimensions: { order: verdict(status, `${right}/${pairs} pairs right, ${wrong} wrong, ${abstained} unranked`), pairs: verdict("count", JSON.stringify({ pairs, right, wrong, abstained })) },
  };
}
function constitutionIso(smiles) { return withMol(smiles, (m) => m.get_smiles()) ?? smiles; }

// ---- synthesis ---------------------------------------------------------------------------------
async function runSynthesis(testCase) {
  const searchRun = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
  const controller = new searchRun.SearchRunController({ rules: utils.reactionRegistry, totalMs: 15000 });
  const started = performance.now();
  await controller.start({ startingSmiles: testCase.start, targetSmiles: testCase.target, copies: 1 });
  const state = controller.getState();
  const best = state.ranked[0]?.route ?? null;
  const dims = {};
  const outcomeKind = state.outcome?.kind ?? "none";
  dims.routeDiscovery = best ? verdict("found") : verdict(["no-route-within-budget", "stalled"].includes(outcomeKind) ? "timeout" : "not-found-within-bounds", outcomeKind);
  if (best) {
    dims.routeVerification = verdict(best.verification?.status === "verified" ? "verified" : best.verification?.status ?? "unverified");
    const n = best.steps.length;
    dims.routeLength = n >= testCase.n_steps_min && n <= testCase.n_steps_max ? verdict("within-range", `${n} steps`) : n < testCase.n_steps_min ? verdict("shorter", `${n} steps`) : verdict("longer", `${n} steps`);
    const avoid = new Set((testCase.route_must_avoid ?? []).map(constitution));
    const seen = best.steps.map((s) => constitution(s.productSmiles ?? "")).filter(Boolean);
    dims.avoidance = seen.some((c) => avoid.has(c)) ? verdict("wrong", "route passes through a forbidden intermediate") : verdict("correct");
  }
  return { engine: { outcome: outcomeKind, rules: best ? best.steps.map((s) => s.ruleId) : [], ms: Math.round(performance.now() - started) }, dimensions: dims };
}

// ---- spectroscopy ------------------------------------------------------------------------------
async function runSpectroscopy(testCase) {
  const spec = await loadModule("/src/utils/spectroscopy/index.ts");
  const nmrModule = await loadModule("/src/utils/spectroscopy/nmrPrediction.ts");
  const irModule = await loadModule("/src/utils/spectroscopy/irRules.ts");
  const massModule = await loadModule("/src/utils/spectroscopy/massSpec.ts");
  void spec;
  const hierarchy = await groupsModule.analyzeFunctionalGroupHierarchy(testCase.smiles);
  const identity = (await nomen.analyzeNomenclatureAndProperties(testCase.smiles, hierarchy.primaryGroups, hierarchy.mainGroup)).properties;
  const dims = {};
  const engine = {};
  if (testCase.ir) {
    const peaks = await irModule.predictRuleBasedIR(hierarchy.functionalGroups, testCase.smiles);
    const centerOf = (p) => (typeof p.center === "number" ? p.center : (() => { const m = String(p.range).match(/(\d+)\D+(\d+)/); return m ? (Number(m[1]) + Number(m[2])) / 2 : null; })());
    const centers = peaks.map(centerOf).filter((c) => c !== null);
    engine.irCenters = centers.map(Math.round);
    const TOL = 20;
    const missing = (testCase.ir.present ?? []).filter((b) => !centers.some((c) => c >= b.range_cm1[0] - TOL && c <= b.range_cm1[1] + TOL));
    dims.irPresent = (testCase.ir.present ?? []).length === 0 ? NA : missing.length === 0 ? verdict("correct") : verdict("wrong", `missing ${missing.map((b) => b.label).join("; ")}`);
    const claimedAbsent = (testCase.ir.absent ?? []).filter((b) => peaks.some((p) => ["diagnostic", "supporting"].includes(p.kind ?? "diagnostic") && centerOf(p) !== null && centerOf(p) >= b.range_cm1[0] && centerOf(p) <= b.range_cm1[1]));
    dims.irAbsent = (testCase.ir.absent ?? []).length === 0 ? NA : claimedAbsent.length === 0 ? verdict("correct") : verdict("wrong", `claims ${claimedAbsent.map((b) => b.label).join("; ")}`);
  }
  if (testCase.nmr) {
    const nmr = await nmrModule.predictStructureNMR(testCase.smiles);
    const h = nmr.protonNMR, c = nmr.carbonNMR;
    engine.hSignals = h.length; engine.cSignals = c.length;
    if (testCase.nmr.h_environments != null) dims.hCount = h.length === testCase.nmr.h_environments ? verdict("correct") : verdict("wrong", `${h.length} vs ${testCase.nmr.h_environments}`);
    if (testCase.nmr.c_environments != null) dims.cCount = c.length === testCase.nmr.c_environments ? verdict("correct") : verdict("wrong", `${c.length} vs ${testCase.nmr.c_environments}`);
    const covered = (signals, ranges, tol) => ranges.filter((r) => !signals.some((s) => typeof s.shiftCenter === "number" && s.shiftCenter >= r.range_ppm[0] - tol && s.shiftCenter <= r.range_ppm[1] + tol));
    if (testCase.nmr.h_signals?.length) { const miss = covered(h, testCase.nmr.h_signals, 0.3); dims.hShifts = miss.length === 0 ? verdict("correct") : verdict("wrong", `no signal in ${miss.map((m) => m.range_ppm.join("-")).join(", ")}`); }
    if (testCase.nmr.c_signals?.length) { const miss = covered(c, testCase.nmr.c_signals, 5); dims.cShifts = miss.length === 0 ? verdict("correct") : verdict("wrong", `no signal in ${miss.map((m) => m.range_ppm.join("-")).join(", ")}`); }
  }
  if (testCase.ms) {
    const exact = Number.parseFloat(identity.exactMass ?? "");
    const ms = await massModule.predictMassSpectrum(identity.molecularFormula, Number.isFinite(exact) ? exact : null, hierarchy.functionalGroups, testCase.smiles);
    engine.ms = { molecularIon: ms.molecularIonMz, basePeak: ms.basePeakMz };
    if (testCase.ms.molecular_ion_mz != null) dims.molecularIon = Math.round(ms.molecularIonMz) === testCase.ms.molecular_ion_mz ? verdict("correct") : verdict("wrong", `${ms.molecularIonMz} vs ${testCase.ms.molecular_ion_mz}`);
    if (testCase.ms.base_peak_mz != null) dims.basePeak = Math.round(ms.basePeakMz ?? -1) === testCase.ms.base_peak_mz ? verdict("correct") : verdict("wrong", `${ms.basePeakMz} vs ${testCase.ms.base_peak_mz}`);
    if (testCase.ms.key_fragments?.length) {
      const miss = testCase.ms.key_fragments.filter((f) => !ms.peaks.some((p) => Math.abs(p.mz - f.mz) <= 0.5));
      dims.fragments = miss.length === 0 ? verdict("correct") : verdict("wrong", `missing m/z ${miss.map((f) => f.mz).join(", ")} (${testCase.ms.key_fragments.length - miss.length}/${testCase.ms.key_fragments.length} present)`);
      engine.ms.fragmentRecall = `${testCase.ms.key_fragments.length - miss.length}/${testCase.ms.key_fragments.length}`;
    }
    if (testCase.ms.m_plus_2_ratio != null) {
      const mi = ms.peaks.find((p) => Math.abs(p.mz - ms.molecularIonMz) < 0.5), m2 = ms.peaks.find((p) => Math.abs(p.mz - (ms.molecularIonMz + 2)) < 0.5);
      const got = mi && m2 && mi.relativeIntensity > 0 ? m2.relativeIntensity / mi.relativeIntensity : null;
      dims.isotopeM2 = got === null ? verdict("wrong", "no M+2 peak") : Math.abs(got - testCase.ms.m_plus_2_ratio) <= 0.2 * testCase.ms.m_plus_2_ratio + 0.02 ? verdict("correct", `${got.toFixed(2)}`) : verdict("wrong", `${got.toFixed(2)} vs ${testCase.ms.m_plus_2_ratio}`);
    }
  }
  return { engine, dimensions: dims };
}

const RUNNERS = { nomenclature: runNomenclature, properties: runProperties, reactions: runReaction, ranking: runRanking, synthesis: runSynthesis, spectroscopy: runSpectroscopy };

// ---- main --------------------------------------------------------------------------------------
const records = [];
let peakRss = 0;
for (const capability of Object.keys(RUNNERS)) {
  if (capabilities && !capabilities.includes(capability)) continue;
  for (const testCase of loadCases(capability)) {
    const started = performance.now();
    const record = { id: testCase.id, capability, category: testCase.category, evidence: testCase.evidence, dimensions: {}, engine: null };
    try {
      const run = await RUNNERS[capability](testCase);
      record.engine = run.engine;
      record.dimensions = run.dimensions;
    } catch (error) {
      record.dimensions = { error: verdict("harness-error", error instanceof Error ? error.message : String(error)) };
    }
    record.ms = Math.round(performance.now() - started);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    records.push(record);
    console.log(`${record.id.padEnd(7)} ${String(record.ms).padStart(6)} ms ${Object.entries(record.dimensions).filter(([, v]) => v.status !== "n/a").map(([k, v]) => `${k}:${v.status}`).join(" ")}`);
  }
}

const summary = {};
for (const record of records) {
  const bucket = (summary[record.capability] ??= {});
  const scored = record.evidence === "verified" ? "verified" : "inferred";
  for (const [dim, v] of Object.entries(record.dimensions)) {
    if (v.status === "n/a" || v.status === "count") continue;
    const key = `${dim} [${scored}]`;
    bucket[key] ??= {};
    bucket[key][v.status] = (bucket[key][v.status] ?? 0) + 1;
  }
}
const out = {
  meta: { set: setName, engineCommit, dirtySrc, runAt: new Date().toISOString(), node: process.version, peakRssMB: Math.round(peakRss / 1048576), cases: records.length, manifestHash: crypto.createHash("sha256").update(fs.readFileSync(path.join(here, "manifest.json"))).digest("hex") },
  summary,
  records,
};
const outFile = argValue("--out") ?? path.join(here, "results", `${setName}-${Date.now()}.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
if (setName === "holdout") fs.writeFileSync(path.join(here, "holdout-lock.json"), JSON.stringify({ engineCommit, runAt: out.meta.runAt, results: path.relative(here, outFile) }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log(`peak RSS ${out.meta.peakRssMB} MB; wrote ${path.relative(root, outFile)}`);
await closeEngine();
process.exit(0);
