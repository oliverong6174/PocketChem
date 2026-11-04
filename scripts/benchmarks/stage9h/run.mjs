// Stage 9H runner. Frozen with the cases (see manifest.json and PROTOCOL.md).
//   node scripts/benchmarks/stage9h/run.mjs --final            run every frozen case ONCE (refuses if results/final-lock.json exists)
//   node scripts/benchmarks/stage9h/run.mjs --smoke            harness shakedown on smoke/*.json (not part of the benchmark; no lock)
//   node scripts/benchmarks/stage9h/run.mjs --verify-only      only check hashes and the engine tree, then exit
// Guards: manifest hashes of cases, snapshots, scoring.mjs and PROTOCOL.md must match; `git rev-parse HEAD:src` must equal the frozen engine tree; src/ must be clean.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { closeEngine, getRdkit, loadEngine, loadModule } from "../../tests/engine.mjs";
import * as S from "./scoring.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const smoke = args.includes("--smoke"), final = args.includes("--final"), verifyOnly = args.includes("--verify-only");
if (!smoke && !final && !verifyOnly) throw new Error("Pass --final (one-shot), --smoke (shakedown) or --verify-only.");
const only = argValue("--only")?.split(",") ?? null;
const capabilities = argValue("--capability")?.split(",") ?? null;
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const sha = (file, textMode = true) => crypto.createHash("sha256").update(textMode ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : fs.readFileSync(file)).digest("hex");

// ---- integrity guards -------------------------------------------------------------------------
const manifest = smoke ? null : JSON.parse(fs.readFileSync(path.join(here, "manifest.json"), "utf8"));
if (!smoke) {
  const lockFile = path.join(here, "results", "final-lock.json");
  if (final && fs.existsSync(lockFile)) throw new Error("The final evaluation has already been run (results/final-lock.json). It must not be run again.");
  const bad = [];
  for (const [rel, h] of Object.entries(manifest.hashes)) { const full = path.join(here, rel); if (!fs.existsSync(full) || sha(full) !== h) bad.push(rel); }
  if (bad.length) throw new Error(`Frozen files changed or missing: ${bad.slice(0, 8).join(", ")}${bad.length > 8 ? ` (+${bad.length - 8})` : ""}`);
  const srcTree = git("rev-parse", "HEAD:src");
  if (srcTree !== manifest.engineSrcTree) throw new Error(`src/ tree ${srcTree} differs from the frozen engine tree ${manifest.engineSrcTree}.`);
  if (git("status", "--porcelain", "--", "src").length > 0) throw new Error("Refusing to run with uncommitted changes under src/.");
  console.log(`integrity ok: ${Object.keys(manifest.hashes).length} frozen files, engine src tree ${srcTree}`);
}
if (verifyOnly) process.exit(0);

// ---- engine -----------------------------------------------------------------------------------
const { utils } = await loadEngine();
const rd = await getRdkit();
const groupsModule = await loadModule("/src/utils/functionalGroups/index.ts");
const nomen = await loadModule("/src/utils/nomenclature/index.ts");
const stereoModule = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const withMol = (smiles, fn) => { const mol = rd.get_mol(smiles); if (!mol) return null; try { return fn(mol); } finally { mol.delete(); } };
const constitution = (smiles) => withMol(smiles, (m) => m.get_smiles(JSON.stringify({ doIsomericSmiles: false, removeHs: true })));
const helpers = {
  constitution,
  isomericCanon: async (smiles) => (await stereoModule.canonicalizeStereoStructure(smiles))?.isomeric ?? smiles,
  mirror: (smiles) => smiles.replace(/@@/g, "\u0001").replace(/@/g, "@@").replace(/\u0001/g, "@"),
  hasStereoMark: (smiles) => /@|\/|\\/.test(smiles),
};
const canonicalOf = (smiles) => withMol(smiles, (m) => m.get_smiles()) ?? smiles;
const identityOf = async (smiles) => { const hierarchy = await groupsModule.analyzeFunctionalGroupHierarchy(smiles); return { hierarchy, identity: await nomen.analyzeNomenclatureAndProperties(smiles, hierarchy.primaryGroups, hierarchy.mainGroup) }; };

// ---- capability adapters (call the engine, return raw output + scored dimensions) ------------------
async function runNomenclature(c) {
  const { identity } = await identityOf(c.smiles); const n = identity.nomenclature;
  const out = { displayName: n.displayName || n.estimatedName, estimatedName: n.estimatedName, status: n.namingStatus, confidence: n.namingConfidence };
  return { engine: out, dimensions: S.scoreNomenclature(c, out) };
}
async function runProperties(c) {
  const { identity } = await identityOf(c.smiles); const p = identity.properties;
  const out = { formula: p.molecularFormula, mw: p.molecularWeight, exactMass: p.exactMass, charge: p.formalCharge, logP: p.logP };
  return { engine: out, dimensions: S.scoreProperties(c, out) };
}
async function runRanking(c) {
  const analysis = await loadModule("/src/utils/ranking/comparisonAnalysis.ts"), display = await loadModule("/src/utils/ranking/rankingDisplay.ts");
  const molecules = [];
  for (let i = 0; i < c.smiles.length; i += 1) { const hierarchy = await groupsModule.analyzeFunctionalGroupHierarchy(c.smiles[i]); molecules.push({ id: i, profile: await analysis.analyzeComparisonMolecule(c.smiles[i], hierarchy) }); }
  const { rankById } = display.deriveRanking(molecules, c.mode_id);
  const out = { ranks: c.smiles.map((_, i) => rankById.get(i)), headlines: molecules.map((m) => m.profile.metrics[c.mode_id].headline) };
  return { engine: out, dimensions: S.scoreRanking(c, out, canonicalOf) };
}
async function runMS(c) {
  const massModule = await loadModule("/src/utils/spectroscopy/massSpec.ts");
  const { hierarchy, identity } = await identityOf(c.smiles); const p = identity.properties; const exact = Number.parseFloat(p.exactMass ?? "");
  const ms = await massModule.predictMassSpectrum(p.molecularFormula, Number.isFinite(exact) ? exact : null, hierarchy.functionalGroups, c.smiles);
  const out = { molecularIonMz: ms.molecularIonMz, basePeakMz: ms.basePeakMz, peaks: ms.peaks.map((x) => ({ mz: x.mz, relativeIntensity: x.relativeIntensity })) };
  return { engine: out, dimensions: S.scoreMS(c, out) };
}
async function runIR(c) {
  const irModule = await loadModule("/src/utils/spectroscopy/irRules.ts"); const hierarchy = await groupsModule.analyzeFunctionalGroupHierarchy(c.smiles);
  const peaks = await irModule.predictRuleBasedIR(hierarchy.functionalGroups, c.smiles);
  const centerOf = (p) => (typeof p.center === "number" ? p.center : (() => { const m = String(p.range).match(/(\d+)\D+(\d+)/); return m ? (Number(m[1]) + Number(m[2])) / 2 : null; })());
  const out = { peaks: peaks.map((p) => ({ center: centerOf(p), kind: p.kind ?? "diagnostic" })) };
  return { engine: out, dimensions: S.scoreIR(c, out) };
}
// Reactions: same two-pass listing as Stage 9F harness v2, with the reagent-molecule table fixed here before the run.
const REAGENT_MOLECULES = [
  [/NaOMe|methoxide/i, "[O-]C"], [/NaOEt|ethoxide/i, "CC[O-]"], [/EtMgBr/i, "CC[Mg]Br"], [/MeMgBr|CH3MgBr/i, "C[Mg]Br"],
  [/NaN3/i, "[N-]=[N+]=[N-]"], [/MeOH(?!.*NaOMe)/i, "CO"], [/CH3Cl/i, "CCl"], [/NaOH|KOH|HO-/i, "[OH-]"],
  [/Ph3P=CH2/i, "C=P(c1ccccc1)(c1ccccc1)c1ccccc1"], [/KNH2|NaNH2/i, "[NH2-]"], [/CH3C≡C-/i, "CC#[C-]"],
];
const SUB = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "⁺": "+", "⁻": "-" };
const normText = (s) => String(s).replace(/[₀-₉⁺⁻]/g, (ch) => SUB[ch]).toLowerCase().replace(/[^a-z0-9+]/g, "");
const brief = (p) => ({ ruleId: p.ruleId, title: p.title, reagentLabel: p.reagentLabel, productSmiles: p.productSmiles, members: p.productMixture?.memberSmiles ?? null, level: p.selectivityAssessment?.level ?? null });
async function runReaction(c) {
  const input = c.reactants.join(".");
  const hierarchy = c.reactants.length === 1 ? await groupsModule.analyzeFunctionalGroupHierarchy(input) : null;
  let pathways = await utils.predictReactionPathways(input, hierarchy?.primaryGroups ?? []);
  const tokens = (c.reagent_tokens ?? []).map(normText).filter(Boolean);
  const text = (p) => normText(`${p.title} ${p.reagentLabel} ${p.reagentNote}`);
  // A pathway whose label needs an extra condition the case does not list (peroxide, light, NBS, a carbene source...) does not claim the case.
  const QUALIFIERS = ["roor", "peroxide", "h2o2", "hv", "nbs", "chbr3", "chcl3", "ch2i2", "aibn", "uv"];
  const caseText = normText(c.reagents);
  const poolOf = (list) => list.filter((p) => p.productSmiles && tokens.some((t) => text(p).includes(t)) && !QUALIFIERS.some((q) => text(p).includes(q) && !caseText.includes(q)));
  let pool = poolOf(pathways), supplied = null;
  const wantedC = c.expected.products.filter((p) => ["sole", "major", "formed"].includes(p.role)).map((p) => constitution(p.smiles));
  const poolHasWanted = () => pool.some((p) => (p.productMixture?.memberSmiles?.length ? p.productMixture.memberSmiles : [p.productSmiles]).flatMap((s) => s.split(".")).some((m) => wantedC.includes(constitution(m))));
  if (pool.length === 0 || (wantedC.length > 0 && !poolHasWanted())) {
    const substrateOnly = pool;
    const extra = REAGENT_MOLECULES.filter(([re]) => re.test(c.reagents)).map(([, smi]) => smi).filter((smi) => !c.reactants.some((r) => canonicalOf(r) === canonicalOf(smi)));
    if (extra.length) {
      supplied = extra;
      const withMolecules = await utils.predictReactionPathways([input, ...extra].join("."), []);
      const supplyPool = poolOf(withMolecules);
      if (supplyPool.length > 0 || substrateOnly.length === 0) { pathways = withMolecules; pool = supplyPool; }
    }
  }
  const out = { pathways, pool };
  const dims = await S.scoreReaction(c, out, helpers);
  return { engine: { suppliedReagentMolecules: supplied, claimingRules: [...new Set(pool.map((p) => p.ruleId))], pool: pool.map(brief), allPathways: pathways.map(brief) }, dimensions: dims };
}
async function runSynthesis(c) {
  const searchRun = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
  const controller = new searchRun.SearchRunController({ rules: utils.reactionRegistry });
  const started = performance.now();
  await controller.start({ startingSmiles: c.start, targetSmiles: c.target, copies: c.copies });
  const state = controller.getState(); const ms = Math.round(performance.now() - started);
  const best = state.ranked[0]?.route ?? null;
  const out = { outcomeKind: state.outcome?.kind ?? "none", best: best ? { steps: best.steps.map((s) => ({ ruleId: s.ruleId, productSmiles: s.productSmiles, reagents: s.reagentLabel ?? null })), verificationStatus: best.verification?.status ?? null } : null, ms, routesRanked: state.ranked.length, errorDetail: state.errorDetail ?? null, outcomeDetail: state.outcome ?? null };
  return { engine: out, dimensions: S.scoreSynthesis(c, out, constitution) };
}
const RUNNERS = { nomenclature: runNomenclature, properties: runProperties, ranking: runRanking, ms: runMS, ir: runIR, reactions: runReaction, synthesis: runSynthesis };
const WATCHDOG_MS = { synthesis: 120000 };

// ---- main -------------------------------------------------------------------------------------
const caseDir = smoke ? path.join(here, "smoke") : path.join(here, "cases");
const outDir = path.join(here, smoke ? "smoke-results" : "results"); fs.mkdirSync(outDir, { recursive: true });
const stamp = Date.now(); const rawLog = path.join(outDir, `${smoke ? "smoke" : "final"}-raw-${stamp}.jsonl`);
const engineCommit = git("rev-parse", "HEAD");
const records = []; let peakRss = 0;
const origWarn = console.warn; const origErr = console.error;
for (const capability of Object.keys(RUNNERS)) {
  if (capabilities && !capabilities.includes(capability)) continue;
  const file = path.join(caseDir, `${capability}.json`); if (!fs.existsSync(file)) continue;
  for (const testCase of JSON.parse(fs.readFileSync(file, "utf8")).cases) {
    if (only && !only.includes(testCase.id)) continue;
    const started = performance.now();
    const record = { id: testCase.id, capability, category: testCase.category, evidence: testCase.evidence, dimensions: {}, engine: null, status: "ran" };
    try {
      const limit = WATCHDOG_MS[capability] ?? 60000; let timer;
      const run = await Promise.race([RUNNERS[capability](testCase), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`watchdog: no result after ${limit} ms`)), limit); })]);
      clearTimeout(timer);
      record.engine = run.engine; record.dimensions = run.dimensions;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record.status = msg.startsWith("watchdog") ? "timed-out" : "harness-or-engine-error";
      record.dimensions = { error: S.verdict(msg.startsWith("watchdog") ? "timed-out" : "engine-error", msg) };
    }
    record.ms = Math.round(performance.now() - started); peakRss = Math.max(peakRss, process.memoryUsage().rss);
    records.push(record); fs.appendFileSync(rawLog, JSON.stringify(record) + "\n");
    console.log(`${record.id.padEnd(7)} ${String(record.ms).padStart(6)} ms ${Object.entries(record.dimensions).filter(([, v]) => !["n/a", "count"].includes(v.status)).map(([k, v]) => `${k}:${v.status}`).join(" ")}`);
  }
}
void origWarn; void origErr;
const summary = S.summarize(records);
const out = { meta: { mode: smoke ? "smoke" : "final", engineCommit, engineSrcTree: git("rev-parse", "HEAD:src"), runAt: new Date().toISOString(), node: process.version, peakRssMB: Math.round(peakRss / 1048576), cases: records.length, manifestSha256: smoke ? null : sha(path.join(here, "manifest.json"), false) }, summary, records };
const outFile = path.join(outDir, `${smoke ? "smoke" : "final"}-${stamp}.json`);
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
if (final) fs.writeFileSync(path.join(here, "results", "final-lock.json"), JSON.stringify({ engineCommit, engineSrcTree: out.meta.engineSrcTree, runAt: out.meta.runAt, results: path.relative(here, outFile), raw: path.relative(here, rawLog) }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log(`peak RSS ${out.meta.peakRssMB} MB; wrote ${path.relative(root, outFile)}`);
await closeEngine();
process.exit(0);
