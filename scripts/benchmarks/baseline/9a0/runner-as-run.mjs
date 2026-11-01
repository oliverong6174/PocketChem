// Stage 9A-0: Multi-Catalytic synthesis audit runner.
//
// Reusable and read-only: it loads the REAL reaction registry and the REAL search controller used by
// the Synthesis page through the same Node harness as the tests, and changes no production code.
// Ground truth below is written from chemistry (named reactions / textbook transformations), never
// from PocketChem output. For every case it records
//   (a) a per-step RULE COVERAGE probe: given the expected reactants of a step, does the registry
//       produce the expected product at all (this separates missing rules from search failures);
//   (b) a bounded PLANNER run from the starting materials to the target;
//   (c) atom/element accounting and verification data for the routes returned.
//
// Usage: node scripts/benchmarks/multicatalyticAudit.mjs [--only C1,C4] [--budget-ms 25000] [--no-search]
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const only = flag("--only", "") ? flag("--only", "").split(",") : null;
const budgetMs = Number(flag("--budget-ms", "25000"));
const skipSearch = args.includes("--no-search");
const MIN_FREE_MB = Number(flag("--min-free-mb", "700"));

// ---- ground truth ------------------------------------------------------------------------------
// tier R1: key literature point confirmed by an online check during this audit (see `refs`);
// tier R2: canonical textbook transformation, cited from standard sources but not re-fetched here;
// tier P: provisional - excluded from accuracy scoring.
const CASES = [
  {
    id: "C1", level: 1, title: "Propene -> 2-propanol -> acetone", tier: "R2",
    starts: ["C=CC"], target: "CC(C)=O",
    steps: [
      { reactants: ["C=CC"], product: "CC(C)O", catalyst: "H3O+ (H2SO4/H2O), Bronsted acid, catalytic", reagents: "water", role: "acid-catalysed Markovnikov hydration" },
      { reactants: ["CC(C)O"], product: "CC(C)=O", catalyst: "none (PCC is a stoichiometric oxidant)", reagents: "PCC", role: "oxidation" },
    ],
    refs: "Clayden, Organic Chemistry (alkene hydration; alcohol oxidation); Carey & Sundberg Part B.",
  },
  {
    id: "C2", level: 1, title: "Benzene + chloroethane -> ethylbenzene -> (1-bromoethyl)benzene", tier: "R2",
    starts: ["c1ccccc1", "CCCl"], target: "CC(Br)c1ccccc1",
    steps: [
      { reactants: ["c1ccccc1", "CCCl"], product: "CCc1ccccc1", catalyst: "AlCl3 (Lewis acid)", reagents: "chloroethane", role: "Friedel-Crafts alkylation" },
      { reactants: ["CCc1ccccc1"], product: "CC(Br)c1ccccc1", catalyst: "radical initiator (hv / AIBN)", reagents: "NBS", role: "benzylic (Wohl-Ziegler) bromination" },
    ],
    refs: "Friedel-Crafts alkylation (March, Advanced Organic Chemistry); Wohl-Ziegler bromination (Djerassi, Chem. Rev. 1948, 43, 271).",
  },
  {
    id: "C3", level: 2, title: "2-Butanol -> 2-butene -> butane", tier: "R2",
    starts: ["CC(O)CC"], target: "CCCC",
    steps: [
      { reactants: ["CC(O)CC"], product: "CC=CC", catalyst: "H2SO4 (acid, catalytic)", reagents: "heat", role: "acid-catalysed dehydration (Zaitsev, E major)" },
      { reactants: ["CC=CC"], product: "CCCC", catalyst: "Pd/C (heterogeneous)", reagents: "H2", role: "catalytic hydrogenation" },
    ],
    refs: "Clayden (E1 dehydration; catalytic hydrogenation).",
  },
  {
    id: "C4", level: 2, title: "Bromobenzene + phenylboronic acid -> biphenyl -> 4-acetylbiphenyl", tier: "R1",
    starts: ["Brc1ccccc1", "OB(O)c1ccccc1", "CC(=O)Cl"], target: "CC(=O)c1ccc(-c2ccccc2)cc1",
    steps: [
      { reactants: ["Brc1ccccc1", "OB(O)c1ccccc1"], product: "c1ccc(-c2ccccc2)cc1", catalyst: "Pd(0) / ligand, base", reagents: "base", role: "Suzuki-Miyaura cross-coupling" },
      { reactants: ["c1ccc(-c2ccccc2)cc1", "CC(=O)Cl"], product: "CC(=O)c1ccc(-c2ccccc2)cc1", catalyst: "AlCl3 (Lewis acid, >= 1 equiv in acylation)", reagents: "acetyl chloride", role: "Friedel-Crafts acylation (para)" },
    ],
    refs: "Miyaura & Suzuki, Chem. Rev. 1995, 95, 2457. Biphenyl acylation gives the para mono-acetyl product with near-equimolar reagents (1984 Alexandria Univ. kinetics study, found by online check).",
  },
  {
    id: "C5", level: 2, title: "Iodobenzene + phenylacetylene -> diphenylacetylene -> (Z)-stilbene", tier: "R1",
    starts: ["Ic1ccccc1", "C#Cc1ccccc1"], target: "c1ccccc1/C=C\\c1ccccc1",
    steps: [
      { reactants: ["Ic1ccccc1", "C#Cc1ccccc1"], product: "c1ccc(C#Cc2ccccc2)cc1", catalyst: "Pd(0) + CuI (cooperative co-catalysts), amine base", reagents: "base", role: "Sonogashira coupling" },
      { reactants: ["c1ccc(C#Cc2ccccc2)cc1"], product: "c1ccccc1/C=C\\c1ccccc1", catalyst: "Lindlar Pd/CaCO3/Pb, quinoline", reagents: "H2", role: "syn-hydrogenation to the Z alkene" },
    ],
    refs: "Sonogashira, Tohda & Hagihara, Tetrahedron Lett. 1975, 16, 4467. Lindlar, Helv. Chim. Acta 1952, 35, 446; catalyst prep Org. Synth. 1966, 46, 89 (confirmed online; alkynes give cis alkenes).",
  },
  {
    id: "C6", level: 3, title: "Benzene + propanoyl chloride -> propiophenone -> propylbenzene -> (1-bromopropyl)benzene -> (E)-1-phenylpropene", tier: "R2",
    starts: ["c1ccccc1", "CCC(=O)Cl"], target: "C/C=C/c1ccccc1",
    steps: [
      { reactants: ["c1ccccc1", "CCC(=O)Cl"], product: "CCC(=O)c1ccccc1", catalyst: "AlCl3 (stoichiometric in practice)", reagents: "propanoyl chloride", role: "Friedel-Crafts acylation" },
      { reactants: ["CCC(=O)c1ccccc1"], product: "CCCc1ccccc1", catalyst: "none (Zn(Hg) is a stoichiometric reductant)", reagents: "Zn(Hg), HCl", role: "Clemmensen reduction (aryl ketone -> CH2)" },
      { reactants: ["CCCc1ccccc1"], product: "CCC(Br)c1ccccc1", catalyst: "radical initiator", reagents: "NBS", role: "benzylic bromination" },
      { reactants: ["CCC(Br)c1ccccc1"], product: "C/C=C/c1ccccc1", catalyst: "none (t-BuOK is a stoichiometric base)", reagents: "t-BuOK", role: "E2 elimination to the conjugated alkene" },
    ],
    refs: "Friedel-Crafts acylation / Clemmensen to avoid alkyl rearrangement: Clayden, March; Clemmensen, Ber. 1913, 46, 1837.",
  },
  {
    id: "C7", level: 3, title: "Iodobenzene + methyl acrylate -> methyl cinnamate -> methyl 3-phenylpropanoate -> 3-phenylpropan-1-ol -> 3-phenylpropanal", tier: "R1",
    starts: ["Ic1ccccc1", "C=CC(=O)OC"], target: "O=CCCc1ccccc1",
    steps: [
      { reactants: ["Ic1ccccc1", "C=CC(=O)OC"], product: "COC(=O)/C=C/c1ccccc1", catalyst: "Pd(OAc)2 (+ ligand), base", reagents: "Et3N or NaOAc", role: "Mizoroki-Heck coupling (E)" },
      { reactants: ["COC(=O)/C=C/c1ccccc1"], product: "COC(=O)CCc1ccccc1", catalyst: "Pd/C", reagents: "H2", role: "chemoselective C=C hydrogenation (ester untouched)" },
      { reactants: ["COC(=O)CCc1ccccc1"], product: "OCCCc1ccccc1", catalyst: "none (LiAlH4 stoichiometric)", reagents: "LiAlH4, then H3O+", role: "ester reduction" },
      { reactants: ["OCCCc1ccccc1"], product: "O=CCCc1ccccc1", catalyst: "none (PCC / DMP / Swern)", reagents: "PCC", role: "primary alcohol -> aldehyde" },
    ],
    refs: "Heck, J. Org. Chem. 1972, 37, 2320; iodobenzene + methyl acrylate -> methyl cinnamate (patent examples, 99%, found by online check).",
  },
  {
    id: "C8", level: 3, title: "2-Butyne -> (E)-2-butene -> trans-2,3-epoxybutane -> (+/-)-butane-2,3-diol (stereochemical)", tier: "R2",
    starts: ["CC#CC"], target: "CC(O)C(C)O", stereo: "racemic-not-meso",
    steps: [
      { reactants: ["CC#CC"], product: "C/C=C/C", catalyst: "none (Na / NH3(l), dissolving metal)", reagents: "Na, NH3(l)", role: "anti-reduction to the E alkene" },
      { reactants: ["C/C=C/C"], product: "C[C@H]1O[C@@H]1C", catalyst: "none (mCPBA)", reagents: "mCPBA", role: "stereospecific syn epoxidation (trans epoxide)" },
      { reactants: ["C[C@H]1O[C@@H]1C"], product: "CC(O)C(C)O", catalyst: "H3O+ (acid, catalytic)", reagents: "water", role: "anti ring opening -> racemic (R,R)/(S,S) diol (not meso)" },
    ],
    refs: "Clayden (epoxide opening is anti; trans epoxide -> chiral diol, cis epoxide -> meso).",
  },
  {
    id: "C9", level: 4, title: "Isopropanol + bromobenzene: acetone + phenylmagnesium bromide -> 2-phenylpropan-2-ol", tier: "R2",
    starts: ["CC(C)O", "Brc1ccccc1"], target: "CC(C)(O)c1ccccc1",
    steps: [
      { reactants: ["CC(C)O"], product: "CC(C)=O", catalyst: "none (PCC)", reagents: "PCC", role: "branch A: oxidation" },
      { reactants: ["Brc1ccccc1"], product: "Br[Mg]c1ccccc1", catalyst: "none (Mg metal, anhydrous ether/THF)", reagents: "Mg", role: "branch B: Grignard formation" },
      { reactants: ["CC(C)=O", "Br[Mg]c1ccccc1"], product: "CC(C)(O)c1ccccc1", catalyst: "none", reagents: "then H3O+", role: "convergent carbonyl addition" },
    ],
    refs: "Grignard addition to ketones (Clayden; March). Anhydrous conditions required for the organometallic.",
  },
  {
    id: "C10", level: 4, title: "Acetone + propanal -> isopropanol + propanoic acid -> isopropyl propanoate (positive control)", tier: "R2",
    starts: ["CC(C)=O", "CCC=O"], target: "CCC(=O)OC(C)C",
    steps: [
      { reactants: ["CC(C)=O"], product: "CC(C)O", catalyst: "none (NaBH4)", reagents: "NaBH4", role: "branch A: ketone reduction" },
      { reactants: ["CCC=O"], product: "CCC(=O)O", catalyst: "none (Jones / KMnO4 / Ag2O)", reagents: "Jones reagent", role: "branch B: aldehyde oxidation" },
      { reactants: ["CC(C)O", "CCC(=O)O"], product: "CCC(=O)OC(C)C", catalyst: "H2SO4 (acid, catalytic)", reagents: "heat", role: "Fischer esterification (convergent)" },
    ],
    refs: "Fischer & Speier, Ber. 1895, 28, 3252.",
  },
  {
    id: "C11", level: 5, title: "1-Octene -> 2-octanone (Wacker-Tsuji, Pd/Cu cooperative catalysis)", tier: "R1",
    starts: ["C=CCCCCCC"], target: "CC(=O)CCCCCC",
    steps: [
      { reactants: ["C=CCCCCCC"], product: "CC(=O)CCCCCC", catalyst: "PdCl2 (substrate oxidation) + CuCl/CuCl2 (reoxidant) + O2, cooperative redox cycle", reagents: "O2, DMF/H2O", role: "Wacker-Tsuji oxidation to the methyl ketone" },
    ],
    refs: "Tsuji, Nagashima & Nemoto, Org. Synth. 1989, 62, 9 (1-decene -> 2-decanone; citation found online, procedure page not fetched).",
  },
  {
    id: "C12", level: 5, title: "Diethyl diallylmalonate -> diethyl cyclopent-3-ene-1,1-dicarboxylate (Grubbs RCM; outside coverage)", tier: "R1",
    starts: ["C=CCC(CC=C)(C(=O)OCC)C(=O)OCC"], target: "CCOC(=O)C1(C(=O)OCC)CC=CC1", expectUnsupported: true,
    steps: [
      { reactants: ["C=CCC(CC=C)(C(=O)OCC)C(=O)OCC"], product: "CCOC(=O)C1(C(=O)OCC)CC=CC1", catalyst: "Ru alkylidene (Grubbs), loses ethylene", reagents: "CH2Cl2, rt", role: "ring-closing metathesis" },
    ],
    refs: "RCM of diethyl diallylmalonate: TCI practical example (98%, found by online check).",
  },
];

// ---- helpers -----------------------------------------------------------------------------------
await loadEngine();
const reactionUtils = await loadModule("/src/utils/reactionUtils.ts");
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const runModule = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
const sequential = await loadModule("/src/utils/reactions/engine/sequentialSynthesis.ts");
const { getRDKit } = await loadModule("/src/utils/rdkit.ts");
const rdkit = await getRDKit();
const registry = reactionUtils.reactionRegistry;

const canon = async (smiles) => {
  try {
    const c = await stereo.canonicalizeStereoStructure(smiles);
    return c ? { iso: c.isomeric, flat: c.connectivity } : null;
  } catch {
    return null;
  }
};
// Element counts read straight from SMILES (heavy atoms only; implicit hydrogens are not counted).
const formula = (smiles) => {
  const counts = {};
  const add = (symbol) => {
    const element = symbol.length === 1 && symbol === symbol.toLowerCase() ? symbol.toUpperCase() : symbol;
    counts[element] = (counts[element] ?? 0) + 1;
  };
  const token = /\[(?:\d+)?([A-Z][a-z]?|[bcnops])[^\]]*\]|Cl|Br|[BCNOPSFI]|[bcnops]/g;
  for (const match of smiles.matchAll(token)) add(match[1] ?? match[0]);
  return counts;
};
const isMeso = async (smiles) => {
  const c = await canon(smiles);
  if (!c) return null;
  const mirrored = c.iso.replace(/@@/g, "#").replace(/@/g, "@@").replace(/#/g, "@");
  const m = await canon(mirrored);
  return m ? m.iso === c.iso : null;
};
const sameLevel = async (a, b) => {
  const [ca, cb] = [await canon(a), await canon(b)];
  if (!ca || !cb) return "none";
  if (ca.iso === cb.iso) return "exact";
  if (ca.flat === cb.flat) return "connectivity";
  return "none";
};
const freeMb = () => Math.round(os.freemem() / 1048576);

// ---- (a) rule coverage probe ---------------------------------------------------------------------
async function probeStep(step) {
  const input = step.reactants.join(".");
  let hierarchy = null;
  if (step.reactants.length === 1) {
    try { hierarchy = await groups.analyzeFunctionalGroupHierarchy(step.reactants[0]); } catch { hierarchy = null; }
  }
  let pathways = [];
  let error = null;
  try {
    pathways = await reactionUtils.predictReactionPathways(input, hierarchy?.primaryGroups ?? []);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  let best = "none";
  const producing = [];
  const rank = { none: 0, connectivity: 1, exact: 2 };
  for (const p of pathways) {
    if (!p.productSmiles) continue;
    const candidates = [p.productSmiles, ...(p.productMixture?.memberSmiles ?? []), ...(p.productComponents ?? [])];
    let level = "none";
    for (const cand of candidates) {
      const l = await sameLevel(cand, step.product);
      if (rank[l] > rank[level]) level = l;
      // a product written as dot-separated co-products: check each component
      for (const part of String(cand).split(".")) {
        const lp = await sameLevel(part, step.product);
        if (rank[lp] > rank[level]) level = lp;
      }
    }
    if (level !== "none") producing.push({ ruleId: p.ruleId, reagents: p.reagentLabel, level, status: p.productStatus });
    if (rank[level] > rank[best]) best = level;
  }
  const needsInput = pathways.filter((p) => (p.missingReactants ?? []).length > 0).map((p) => p.ruleId);
  return { input, pathwayCount: pathways.length, producedExpected: best, producing, needsInputRules: needsInput.slice(0, 6), error };
}

// ---- (b) planner run -----------------------------------------------------------------------------
async function runPlanner(testCase) {
  const controller = new runModule.SearchRunController({ rules: registry, totalMs: budgetMs });
  const started = Date.now();
  await controller.start({ startingSmiles: testCase.starts.join("."), targetSmiles: testCase.target, copies: 1 });
  const state = controller.getState();
  const elapsedMs = Date.now() - started;
  const routes = [];
  for (const route of state.routes.slice(0, 3)) {
    const steps = [];
    for (const step of route.steps) {
      const before = formula(step.reactantSmiles);
      const after = formula(step.productSmiles);
      const introduced = Object.keys(after).filter((el) => !(el in before));
      const metals = Object.keys(after).filter((el) => ["Pd", "Pt", "Cu", "Zn", "Fe", "Al", "Hg", "Sn", "Ni", "Mg", "Li", "Na", "K"].includes(el));
      steps.push({
        n: step.stepNumber,
        ruleId: step.ruleId,
        reagents: step.reagentLabel,
        reactants: step.reactantComponents,
        product: step.productSmiles,
        introducedElements: introduced,
        metalsInProduct: metals,
        compatibility: (step.compatibility ?? []).map((w) => `${w.severity}:${w.kind}:${w.group}`),
      });
    }
    const last = route.steps[route.steps.length - 1];
    routes.push({
      id: route.id,
      stepCount: route.steps.length,
      verification: route.verification?.status ?? null,
      targetMatch: route.verification?.targetMatch ?? null,
      finalVsTarget: await sameLevel(last.productSmiles, testCase.target),
      finalProduct: last.productSmiles,
      unusedStartingMaterials: route.verification?.unusedStartingMaterials ?? [],
      coproducts: route.verification?.coproducts ?? [],
      problems: route.verification?.problems ?? [],
      compatibilityWorst: route.compatibility?.worst ?? null,
      steps,
    });
  }
  return {
    outcome: state.outcome?.kind ?? null,
    outcomeMessage: state.outcome?.message ?? null,
    elapsedMs,
    firstRouteAfterMs: state.firstRouteAfterMs,
    routeCount: state.routes.length,
    routes,
  };
}

// ---- (c) the Multi-Catalytic page path: a fixed rule sequence on ONE molecule -------------------------
async function runSequencePage(testCase, probes) {
  // Use, for each step, the first rule that the coverage probe showed producing the expected product.
  const ids = probes.map((p) => p.producing[0]?.ruleId ?? null);
  if (ids.some((id) => !id)) return { attempted: false, reason: "a step has no producing rule in the registry" };
  if (testCase.starts.length !== 1) {
    // The page accepts one starting molecule; partners cannot be supplied.
    const report = await sequential.runSequentialSynthesisDetailed(testCase.starts[0], ids, registry, { branchLimit: 6 });
    return { attempted: true, onlyFirstStartingMaterial: true, statuses: report.branches.map((b) => b.steps.map((s) => s.status)) };
  }
  const report = await sequential.runSequentialSynthesisDetailed(testCase.starts[0], ids, registry, { branchLimit: 6 });
  const reached = [];
  for (const branch of report.branches) reached.push(await sameLevel(branch.finalSmiles, testCase.target));
  return { attempted: true, ruleIds: ids, statuses: report.branches.map((b) => b.steps.map((s) => s.status)), finalVsTarget: reached };
}

// ---- main ----------------------------------------------------------------------------------------
const results = [];
for (const testCase of CASES) {
  if (only && !only.includes(testCase.id)) continue;
  const record = { id: testCase.id, level: testCase.level, title: testCase.title, tier: testCase.tier, steps: testCase.steps.length, catalystRoles: testCase.steps.map((s) => s.catalyst) };
  console.log(`\n=== ${testCase.id} (L${testCase.level}, ${testCase.tier}) ${testCase.title}`);
  record.coverage = [];
  for (const step of testCase.steps) {
    const probe = await probeStep(step);
    record.coverage.push({ role: step.role, expected: step.product, ...probe });
    console.log(`  probe: ${step.role}: expected product ${probe.producedExpected}${probe.producing.length ? ` via ${probe.producing.map((p) => p.ruleId).join(", ")}` : ""}${probe.error ? ` ERROR ${probe.error}` : ""}`);
  }
  if (testCase.stereo === "racemic-not-meso") {
    const finalProducers = record.coverage.at(-1).producing;
    record.stereoNote = `final diol meso? expected=false; target SMILES given as connectivity only`;
    void finalProducers;
  }
  try {
    record.sequencePage = await runSequencePage(testCase, record.coverage);
  } catch (e) {
    record.sequencePage = { attempted: true, error: e instanceof Error ? e.message : String(e) };
  }
  console.log(`  multi-catalytic page: ${JSON.stringify(record.sequencePage)}`);

  if (!skipSearch) {
    if (freeMb() < MIN_FREE_MB) {
      record.planner = { skipped: `free memory ${freeMb()} MB below ${MIN_FREE_MB} MB` };
      console.log(`  planner: SKIPPED (${record.planner.skipped})`);
    } else {
      try {
        record.planner = await runPlanner(testCase);
        if (testCase.stereo === "racemic-not-meso" && record.planner.routes[0]) {
          record.planner.finalIsMeso = await isMeso(record.planner.routes[0].finalProduct);
        }
        console.log(`  planner: ${record.planner.outcome} in ${record.planner.elapsedMs} ms, ${record.planner.routeCount} route(s); best ${record.planner.routes[0] ? `${record.planner.routes[0].stepCount} steps, final ${record.planner.routes[0].finalVsTarget}` : "none"}`);
      } catch (e) {
        record.planner = { error: e instanceof Error ? e.message : String(e) };
        console.log(`  planner: ERROR ${record.planner.error}`);
      }
    }
  }
  results.push(record);
}

const outDir = path.join(here, "results");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "multicatalytic-audit.json"), JSON.stringify({ budgetMs, generatedAt: new Date().toISOString(), cases: CASES.map(({ id, level, title, tier, starts, target, steps, refs }) => ({ id, level, title, tier, starts, target, steps, refs })), results }, null, 2));
console.log(`\nWrote ${path.join(outDir, "multicatalytic-audit.json")}`);
await closeEngine();
process.exit(0);
