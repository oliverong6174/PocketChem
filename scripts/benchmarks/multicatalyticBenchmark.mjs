// Integrated Multi-Catalytic workspace benchmark (Stage 9B-2 / 9B-3, Phase D).
//
// Every scenario runs REAL registry rules through the REAL engine (executeWorkspaceStep via
// runWorkspaceScript). Nothing is mocked and no product is written by hand: the expected
// structures below are what organic chemistry predicts, compared against what PocketChem produced.
//
//   node scripts/benchmarks/multicatalyticBenchmark.mjs [--out <dir>]
//
// Writes multicatalytic-workspace.json (observed results, assessments, timings) next to this file
// under results/, and prints one line per scenario. Exit code is non-zero if any scenario's
// observed result differs from its expectation.
//
// Evidence levels (they are NOT interchangeable; see multicatalytic-validation.md):
//   1 syntactically valid structures      computed: every molecule parses in RDKit
//   2 structurally verified steps         computed: replay of every committed step
//   3 chemically plausible                ASSERTED here, with a textbook basis (not computed)
//   4 selectivity-supported               computed: only a rule's own numeric estimate counts
//   5 condition-compatible                computed: advisory, from declared conditions only
//   6 experimentally established          NEVER established by PocketChem; literature is listed
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outIndex = process.argv.indexOf("--out");
const outDir = outIndex > -1 ? process.argv[outIndex + 1] : path.join(here, "results");

const { utils } = await loadEngine();
const registry = utils.reactionRegistry;
const ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
const cat = await loadModule("/src/utils/reactions/engine/workspaceCatalysis.ts");
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const sequential = await loadModule("/src/utils/reactions/engine/sequentialSynthesis.ts");
const canon = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;

const SCENARIOS = [
  {
    id: "D1",
    title: "Single material, several distinct transformations",
    starts: ["C#CCCCC"],
    script: [
      { ruleId: "alkyne-mercury-hydration-terminal", reactants: [{ material: 0 }] },
      { ruleId: "ketone-reduction", reactants: [{ attempt: 1, product: 1 }] },
      { ruleId: "alcohol-socl2", reactants: [{ attempt: 2, product: 1 }] },
    ],
    expect: { statuses: ["reaction", "reaction", "reaction"], live: ["CCCCC(C)Cl"], consumedSupplied: [0] },
    plausibility: "Hg²⁺-catalysed Markovnikov hydration of a terminal alkyne gives the methyl ketone; hydride reduction gives the secondary alcohol; SOCl₂/pyridine converts it to the chloride (textbook).",
  },
  {
    id: "D2a",
    title: "Two-material coupling (acid + alcohol)",
    starts: ["CC(=O)O", "CCO"],
    script: [{ ruleId: "fischer-esterification", reactants: [{ material: 1 }, { material: 0 }] }],
    expect: { statuses: ["reaction"], live: ["CCOC(C)=O"], consumedSupplied: [0, 1] },
    plausibility: "Fischer esterification, acid-catalysed equilibrium (textbook).",
  },
  {
    id: "D2b",
    title: "Two-material coupling (Pd-catalysed Suzuki)",
    starts: ["Brc1ccccc1", "OB(O)c1ccccc1"],
    script: [{ ruleId: "suzuki-coupling", reactants: [{ material: 0 }, { material: 1 }] }],
    expect: { statuses: ["reaction"], live: ["c1ccc(-c2ccccc2)cc1"], consumedSupplied: [0, 1] },
    plausibility: "Suzuki–Miyaura coupling of an aryl bromide with an arylboronic acid (textbook).",
  },
  {
    id: "D2c",
    title: "Duplicate material copies: an acetal consumes two ethanol molecules, supplied as two copies",
    starts: ["CC=O", "CCO", "CCO"],
    script: [{ ruleId: "aldehyde-acetal-formation", reactants: [{ material: 0 }, { material: 1 }, { material: 2 }] }],
    expect: { statuses: ["reaction"], live: ["CCOC(C)OCC"], consumedSupplied: [0, 1, 2] },
    plausibility: "Acid-catalysed acetal formation consumes two equivalents of alcohol (textbook); here two separate ethanol molecules are required in the inventory.",
  },
  {
    id: "D3+D4",
    title: "Two transformed branches, convergence, post-convergence modification",
    starts: ["CCCCBr", "CCCCO"],
    script: [
      { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
      { ruleId: "aldehyde-organometallic-addition", reactants: [{ attempt: 2, product: 1 }, { attempt: 1, product: 1 }] },
      { ruleId: "secondary-alcohol-oxidation-pcc", reactants: [{ attempt: 3, product: 1 }] },
    ],
    expect: { statuses: ["reaction", "reaction", "reaction", "reaction"], live: ["CCCCC(=O)CCC"], consumedSupplied: [0, 1], independentBranchesBeforeJoin: true },
    plausibility: "BuBr → BuMgBr (Mg, ether); BuOH → butanal (PCC); Grignard addition gives octan-4-ol; PCC gives octan-4-one (textbook).",
  },
  {
    id: "D3b+D4b",
    title: "Second convergent route: alcohol branch + acid-chloride branch, then reduction",
    starts: ["C=CCCCC", "CCC(=O)O"],
    script: [
      { ruleId: "alkene-acid-hydration", reactants: [{ material: 0 }] },
      { ruleId: "carboxylic-acid-to-acid-chloride", reactants: [{ material: 1 }] },
      { ruleId: "alcohol-acid-chloride-esterification", reactants: [{ attempt: 1, product: 1 }, { attempt: 2, product: 1 }] },
      { ruleId: "ester-lah-reduction", reactants: [{ attempt: 3, product: 1 }] },
    ],
    expect: { statuses: ["reaction", "reaction", "reaction", "reaction"], liveCount: 2, consumedSupplied: [0, 1], independentBranchesBeforeJoin: true },
    plausibility: "Hydration gives hexan-2-ol; SOCl₂ gives propanoyl chloride; acylation gives hexan-2-yl propanoate; LiAlH₄ cleaves the ester to propan-1-ol and hexan-2-ol (textbook).",
  },
  {
    id: "INT-1",
    title: "Integrated: two catalytic branches, Heck join with an explicit outcome choice, then Pd/C hydrogenation",
    starts: ["OC(=O)c1ccc(Br)cc1", "CO", "C#CC(=O)OC"],
    script: [
      { ruleId: "fischer-esterification", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "alkyne-lindlar-reduction-terminal", reactants: [{ material: 2 }] },
      { ruleId: "heck-coupling", reactants: [{ attempt: 1, product: 1 }, { attempt: 2, product: 1 }], outcome: 0 },
      { ruleId: "alkene-hydrogenation", reactants: [{ attempt: 3, product: 1 }] },
    ],
    expect: {
      statuses: ["reaction", "reaction", "reaction", "reaction"],
      live: ["COC(=O)CCc1ccc(C(=O)OC)cc1"],
      consumedSupplied: [0, 1, 2],
      independentBranchesBeforeJoin: true,
      catalyticSteps: 4,
      catalystSystems: 4,
      genericCatalystSteps: [3],
      intermediates: { 1: "COC(=O)c1ccc(Br)cc1", 2: "C=CC(=O)OC", 3: "COC(=O)/C=C/c1ccc(C(=O)OC)cc1" },
      selectionClasses: { 3: "major" },
    },
    plausibility: "Fischer esterification of 4-bromobenzoic acid with methanol (H₂SO₄ cat.); Lindlar partial hydrogenation of methyl propiolate to methyl acrylate; Heck coupling of the aryl bromide with the acrylate gives the (E)-cinnamate (Pd cat.); Pd/C hydrogenation of the conjugated C=C. Provisional: terminal acrylates polymerise readily and propiolate semi-hydrogenation needs careful control, which the model does not assess.",
  },
  {
    id: "INT-2",
    title: "Integrated: Lindlar then stereospecific epoxidation (branch A), Grignard formation (branch B), epoxide opening join, then PCC",
    starts: ["CCC#CCC", "CCCCBr"],
    script: [
      { ruleId: "alkyne-lindlar-reduction-internal", reactants: [{ material: 0 }] },
      { ruleId: "alkene-epoxidation", reactants: [{ attempt: 1, product: 1 }] },
      { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 1 }] },
      { ruleId: "epoxide-grignard-opening", reactants: [{ attempt: 2, product: 1 }, { attempt: 3, product: 1 }], outcome: 0 }, // the two ring carbons of the meso epoxide are equivalent: an explicit choice is required
      { ruleId: "secondary-alcohol-oxidation-pcc", reactants: [{ attempt: 4, product: 1 }] },
    ],
    expect: {
      statuses: ["reaction", "reaction", "reaction", "reaction", "reaction"],
      liveConstitution: ["CCCCC(CC)C(=O)CC"],
      consumedSupplied: [0, 1],
      catalyticSteps: 1,
      catalystSystems: 1,
      // hand-written stereo: (Z)-alkene; cis (meso, (R,S)) epoxide (CIP of the string checked with RDKit)
      intermediates: { 1: "CC/C=C\\CC", 2: "CC[C@H]1O[C@H]1CC", 3: "CCC[CH2][Mg][Br]" },
      intermediateConstitutions: { 4: "CCCCC(CC)C(O)CC", 5: "CCCCC(CC)C(=O)CC" },
    },
    plausibility: "Lindlar semi-hydrogenation gives the (Z)-alkene; peroxyacid epoxidation of a Z alkene gives the cis (meso) epoxide; BuMgBr opens the epoxide by SN2 at a ring carbon; PCC oxidises the secondary alcohol (Corey & Suggs 1975). Provisional as a sequence: the stereochemical outcome of the opening step (relative configuration) is not asserted, and PocketChem does not model it.",
  },
  {
    id: "D5",
    title: "Several distinct catalytic steps (Sonogashira, Lindlar, Pd/C hydrogenation)",
    starts: ["Ic1ccccc1", "C#CCCCC"],
    script: [
      { ruleId: "sonogashira-coupling", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "alkyne-lindlar-reduction-internal", reactants: [{ attempt: 1, product: 1 }] },
      { ruleId: "alkene-hydrogenation", reactants: [{ attempt: 2, product: 1 }] },
    ],
    expect: { statuses: ["reaction", "reaction", "reaction"], live: ["CCCCCCc1ccccc1"], catalyticSteps: 3, catalystSystems: 3, genericCatalystSteps: [1] },
    plausibility: "Pd/Cu Sonogashira coupling; Lindlar semi-hydrogenation to the cis alkene; Pd/C hydrogenation to the alkane (textbook).",
  },
  {
    id: "D6a",
    title: "Competing products with the rule's own numeric estimates (radical bromination)",
    starts: ["CC(C)CC"],
    script: [{ ruleId: "alkane-radical-bromination", reactants: [{ material: 0 }] }],
    expect: { statuses: ["needs-selection"], liveUnchanged: true, outcomeClasses: ["major", "disfavored", "disfavored", "disfavored"] },
    selectAfter: { index: 0, live: ["CCC(C)(C)Br"] },
    plausibility: "Bromination of 2-methylbutane is selective for the tertiary C–H (textbook).",
  },
  {
    id: "D6b",
    title: "Competing products with no ranking (Heck of an alkyl alkene)",
    starts: ["Brc1ccccc1", "C=CCCCC"],
    script: [{ ruleId: "heck-coupling", reactants: [{ material: 0 }, { material: 1 }] }],
    expect: { statuses: ["needs-selection"], liveUnchanged: true, outcomeClasses: ["unranked", "unranked"] },
    plausibility: "No regiochemical preference is modeled for alkyl alkenes (mixtures and double-bond isomerization are common in practice); both attachment sites are offered and neither is called major.",
  },
  {
    id: "D6c",
    title: "Qualitative major/minor from a referenced preference (Heck of methyl acrylate)",
    starts: ["Brc1ccccc1", "C=CC(=O)OC"],
    script: [{ ruleId: "heck-coupling", reactants: [{ material: 0 }, { material: 1 }] }],
    expect: { statuses: ["needs-selection"], liveUnchanged: true, outcomeClasses: ["major", "disfavored"] },
    selectAfter: { index: 0, live: ["COC(=O)/C=C/c1ccccc1"] },
    plausibility: "Methyl (E)-cinnamate is the standard Heck product of an aryl halide with methyl acrylate (Heck, Acc. Chem. Res. 1979, 12, 146); the alpha-aryl acrylate is minor. The ranking is qualitative: no ratio is claimed.",
  },
  {
    id: "D6d",
    title: "Friedel–Crafts ring positions ranked by directing effects",
    starts: ["COc1ccccc1", "CC(=O)Cl"],
    script: [{ ruleId: "aromatic-friedel-crafts-acylation", reactants: [{ material: 0 }, { material: 1 }] }],
    expect: { statuses: ["needs-selection"], liveUnchanged: true, outcomeClasses: ["major", "unranked", "disfavored"] },
    selectAfter: { index: 0, live: ["COc1ccc(C(C)=O)cc1"] },
    plausibility: "Acylation of anisole gives 4-methoxyacetophenone as the main product (textbook); ortho is a minor competing product in practice, which the model shows as competitive, not as a ratio.",
  },
  {
    id: "D6e",
    title: "Pinacol rearrangement: the more stable carbocation decides the leaving hydroxyl",
    starts: ["CCCCCCC(O)CO"],
    script: [{ ruleId: "pinacol-rearrangement", reactants: [{ material: 0 }] }],
    expect: { statuses: ["reaction"], live: ["CCCCCCCC=O"] },
    plausibility: "Terminal 1,2-diols rearrange through the secondary cation with hydride shift to the aldehyde (acid dehydration of 1,2-propanediol gives propanal as an intermediate, PNNL 2009); the hydride-versus-aryl migratory order is not settled in sources and is a documented simplification.",
  },
  {
    id: "D6f",
    title: "Epoxidation keeps the alkene geometry (E gives the trans racemate, Z the cis meso compound)",
    starts: ["c1ccccc1/C=C/c1ccccc1"],
    script: [{ ruleId: "alkene-epoxidation", reactants: [{ material: 0 }] }],
    expect: { statuses: ["reaction"], liveCount: 1 },
    plausibility: "Peroxyacid epoxidation is a concerted syn addition of oxygen: trans-stilbene gives trans-stilbene oxide, (R,R)/(S,S).",
  },
  {
    id: "D7",
    title: "Missing structural partner; nothing substituted downstream",
    starts: ["CCO"],
    script: [
      { ruleId: "fischer-esterification", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ attempt: 1, product: 1 }] },
    ],
    expect: { statuses: ["needs-input", "dependency-failed"], live: ["CCO"] },
    plausibility: "Not a reaction claim: the test is that no molecule is invented or silently reused.",
  },
  {
    id: "D8",
    title: "Failed intermediate transformation; independent branch still runs",
    starts: ["CCCCCC", "CCO"],
    script: [
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
      { ruleId: "ketone-reduction", reactants: [{ attempt: 1, product: 1 }] },
    ],
    expect: { statuses: ["no-reaction", "reaction", "dependency-failed"], live: ["CCCCCC", "CC=O"] },
    plausibility: "Hexane has no alcohol to oxidise (no reaction); ethanol gives acetaldehyde (textbook).",
  },
  {
    id: "D9",
    title: "Molecular identity: stereochemistry, isotope, geometry",
    starts: ["CC[C@H](C)Br", "[13CH3]CO"],
    script: [
      { ruleId: "haloalkane-sn2-hydroxide", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
    ],
    expect: { statuses: ["reaction", "reaction"], live: ["CC[C@@H](C)O", "[13CH3]C=O"] },
    plausibility: "SN2 hydroxide displacement inverts the stereocentre; the 13C label is carried through oxidation (textbook).",
  },
  {
    id: "D10",
    title: "Inventory, retained species and coproducts",
    starts: ["CC(=O)OCC", "CCCCCC"],
    script: [{ ruleId: "ester-lah-reduction", reactants: [{ material: 0 }] }],
    expect: { statuses: ["reaction"], liveCount: 3, coproducts: 1, retained: ["CCCCCC"] },
    plausibility: "LiAlH₄ cleaves ethyl acetate to two molecules of ethanol (textbook); hexane is an untouched spectator.",
  },
];

const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

async function observe(scenario) {
  const created = await ws.createWorkspace(scenario.starts);
  if (!created.ok) throw new Error(`${scenario.id}: ${created.problems.join("; ")}`);
  const started = performance.now();
  let workspace = await ws.runWorkspaceScript(created.workspace, scenario.script, registry);
  let afterSelection = null;
  if (scenario.selectAfter) {
    const last = scenario.script[scenario.script.length - 1];
    const lotIds = workspace.history[workspace.history.length - 1].requestedLotIds;
    afterSelection = (await ws.executeWorkspaceStep(workspace, { ruleId: last.ruleId, lotIds, outcome: scenario.selectAfter.index }, registry)).workspace;
  }
  const elapsedMs = performance.now() - started;
  const finalWorkspace = afterSelection ?? workspace;
  const live = finalWorkspace.pool.lots.filter((lot) => lot.availability === "live");
  const assessment = await ws.assessWorkspace(finalWorkspace, registry);
  const catalysis = cat.assessWorkspaceCatalysis(finalWorkspace, registry);
  const lotSyntax = [];
  for (const lot of finalWorkspace.pool.lots) lotSyntax.push(Boolean(await stereo.canonicalizeStereoStructure(lot.smiles)));
  return { workspace, finalWorkspace, live, assessment, catalysis, elapsedMs, lotSyntax };
}

async function evaluate(scenario, seen) {
  const { workspace, finalWorkspace, live, assessment, catalysis } = seen;
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok, detail });
  const e = scenario.expect;
  add("step statuses", JSON.stringify(workspace.history.map((s) => s.status)) === JSON.stringify(e.statuses), workspace.history.map((s) => s.status).join(","));
  if (e.live) {
    const want = await Promise.all(e.live.map(canon));
    add("final inventory", sameSet(live.map((l) => l.canonical), want), live.map((l) => l.smiles).join(" + "));
  }
  if (e.liveConstitution) {
    const conn = async (s) => (await stereo.canonicalizeStereoStructure(s)).connectivity;
    const want = await Promise.all(e.liveConstitution.map(conn));
    const got = await Promise.all(live.map((l) => conn(l.smiles)));
    add("final inventory (constitution)", sameSet(got, want), got.join(" + "));
  }
  if (e.intermediateConstitutions) {
    for (const [stepNumber, smiles] of Object.entries(e.intermediateConstitutions)) {
      const step = finalWorkspace.history.find((item) => item.committedStep === Number(stepNumber));
      const got = step ? step.outcomes[step.selectedOutcome].productSmiles : null;
      const conn = async (s) => (await stereo.canonicalizeStereoStructure(s)).connectivity;
      add(`constitution of step ${stepNumber}`, got !== null && (await conn(got)) === (await conn(smiles)), String(got));
    }
  }
  if (e.liveCount !== undefined) add("inventory size", live.length === e.liveCount, String(live.length));
  if (e.consumedSupplied) {
    const consumed = finalWorkspace.pool.lots.filter((l) => l.provenance.kind === "supplied" && l.availability === "consumed").map((l) => l.provenance.startIndex);
    add("supplied materials consumed", sameSet(consumed, e.consumedSupplied), consumed.join(","));
  }
  if (e.liveUnchanged) add("nothing consumed while a choice is pending", workspace.pool.lots.every((l) => l.availability === "live"));
  if (e.outcomeClasses) add("outcome selectivity classes", JSON.stringify(workspace.history[0].outcomes.map((o) => o.selectivityFinding.class)) === JSON.stringify(e.outcomeClasses), workspace.history[0].outcomes.map((o) => o.selectivityFinding.class).join(","));
  if (scenario.selectAfter) {
    const want = await Promise.all(scenario.selectAfter.live.map(canon));
    add("explicit selection commits the chosen outcome", sameSet(live.map((l) => l.canonical), want), live.map((l) => l.smiles).join(" + "));
  }
  if (e.coproducts !== undefined) add("coproduct lots", finalWorkspace.pool.lots.filter((l) => l.role === "coproduct").length === e.coproducts);
  if (e.retained) add("retained spectator", sameSet(e.retained.map((s) => s), finalWorkspace.pool.lots.filter((l) => l.availability === "live" && l.provenance.kind === "supplied").map((l) => l.smiles)));
  if (e.independentBranchesBeforeJoin && assessment) {
    const deps = assessment.verification.stepDependencies.map((d) => d.dependsOnSteps);
    add("two independent branches before the join", deps[0].length === 0 && deps[1].length === 0 && deps[2].length === 2, JSON.stringify(deps));
  }
  if (e.catalyticSteps !== undefined) add("catalytic steps", catalysis.catalyticStepNumbers.length === e.catalyticSteps);
  if (e.catalystSystems !== undefined) add("distinct catalyst systems", catalysis.distinctCatalystSystems.length === e.catalystSystems, catalysis.distinctCatalystSystems.join("; "));
  if (e.genericCatalystSteps) add("generic (type-only) catalyst steps", JSON.stringify(catalysis.genericCatalystStepNumbers) === JSON.stringify(e.genericCatalystSteps));
  if (e.intermediates) {
    for (const [stepNumber, smiles] of Object.entries(e.intermediates)) {
      const step = finalWorkspace.history.find((item) => item.committedStep === Number(stepNumber));
      const got = step ? step.outcomes[step.selectedOutcome].productSmiles : null;
      add(`intermediate of step ${stepNumber}`, got !== null && (await canon(got)) === (await canon(smiles)), String(got));
    }
  }
  if (e.selectionClasses) {
    for (const [stepNumber, wantClass] of Object.entries(e.selectionClasses)) {
      const step = finalWorkspace.history.find((item) => item.committedStep === Number(stepNumber));
      const got = step ? step.outcomes[step.selectedOutcome].selectivityFinding.class : null;
      add(`selectivity class of the chosen outcome in step ${stepNumber}`, got === wantClass, String(got));
      add(`step ${stepNumber} was chosen explicitly by the user`, step?.selectedBy === "user");
    }
  }
  if (assessment) add("structure replay", assessment.verification.status !== "failed", assessment.verification.status);
  return checks;
}

const report = [];
let failures = 0;
for (const scenario of SCENARIOS) {
  const seen = await observe(scenario);
  const checks = await evaluate(scenario, seen);
  const failed = checks.filter((c) => !c.ok);
  failures += failed.length;
  const { assessment, catalysis, finalWorkspace } = seen;
  const classes = assessment ? assessment.selectivity.counts : null;
  const levels = {
    "1-syntactically-valid": seen.lotSyntax.every(Boolean),
    "2-structure-replay": assessment ? assessment.verification.status : "no committed step",
    "3-chemically-plausible": { established: "asserted (not computed)", basis: scenario.plausibility },
    "4-selectivity-supported": classes ? { counts: classes, supportedSteps: classes.major, note: "Only a rule's own estimate (numeric, or a referenced qualitative preference) counts; single-outcome means unranked, not major." } : null,
    "5-condition-compatible": assessment ? {
      declaredConditionWarnings: assessment.compatibility.warnings.length,
      unassessedRules: assessment.compatibility.unassessedRuleIds,
      oneRoutePairs: catalysis.combinations.map((c) => ({ steps: c.stepNumbers, category: c.category })),
      note: "Steps are isolated and sequential; no one-pot or cooperative claim.",
    } : null,
    "6-experimentally-established": "not established by PocketChem",
  };
  report.push({
    id: scenario.id,
    title: scenario.title,
    starts: scenario.starts,
    steps: finalWorkspace.history.map((s) => ({
      attempt: s.attempt, rule: s.ruleId, status: s.status, consumed: s.consumedLotIds, produced: s.producedLotIds,
      product: s.selectedOutcome !== null ? s.outcomes[s.selectedOutcome].productSmiles : null,
      outcomes: s.outcomes.length, selectivityClass: s.selectedOutcome !== null ? s.outcomes[s.selectedOutcome].selectivityFinding.class : s.outcomes.map((o) => o.selectivityFinding.class),
      catalystIdentity: s.roles?.catalystIdentity ?? null,
    })),
    finalInventory: seen.live.map((l) => ({ id: l.id, smiles: l.smiles, role: l.role, lineage: l.lineage })),
    levels,
    checks,
    elapsedMs: Math.round(seen.elapsedMs),
  });
  console.log(`${failed.length === 0 ? "PASS" : "FAIL"}  ${scenario.id.padEnd(8)} ${scenario.title}  (${Math.round(seen.elapsedMs)} ms)${failed.length ? "  <- " + failed.map((c) => `${c.name}: ${c.detail}`).join(" | ") : ""}`);
}

// ---- overhead: workspace executor vs the existing ordered-sequence executor (same chemistry) ----
const REPEATS = 7;
const chain = { start: "C=CCC", rules: ["alkene-acid-hydration", "secondary-alcohol-oxidation-pcc", "ketone-reduction"] };
async function timeSequential() {
  const t = performance.now();
  await sequential.runSequentialSynthesisDetailed(chain.start, chain.rules, registry, { branchLimit: 6 });
  return performance.now() - t;
}
async function timeWorkspace() {
  const created = await ws.createWorkspace([chain.start]);
  const t = performance.now();
  await ws.runWorkspaceScript(created.workspace, chain.rules.map((ruleId, i) => ({ ruleId, reactants: i === 0 ? [{ material: 0 }] : [{ attempt: i, product: 1 }] })), registry);
  return performance.now() - t;
}
await timeSequential(); await timeWorkspace(); // warm caches for both
const seq = []; const wsr = [];
for (let i = 0; i < REPEATS; i += 1) { seq.push(await timeSequential()); wsr.push(await timeWorkspace()); }
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const performanceReport = {
  chain: `${chain.start} → ${chain.rules.join(" → ")}`,
  repeats: REPEATS,
  sequentialMedianMs: Math.round(median(seq)),
  workspaceMedianMs: Math.round(median(wsr)),
  note: "Same rules, same molecule. The workspace additionally records every alternative outcome, canonicalises every lot and assesses selectivity per step; its verification replay is timed separately below.",
};
const created = await ws.createWorkspace([chain.start]);
const done = await ws.runWorkspaceScript(created.workspace, chain.rules.map((ruleId, i) => ({ ruleId, reactants: i === 0 ? [{ material: 0 }] : [{ attempt: i, product: 1 }] })), registry);
const t0 = performance.now();
await ws.assessWorkspace(done, registry);
performanceReport.assessmentMs = Math.round(performance.now() - t0);
console.log(`\noverhead (median of ${REPEATS}): sequential ${performanceReport.sequentialMedianMs} ms, workspace ${performanceReport.workspaceMedianMs} ms, replay+assessment ${performanceReport.assessmentMs} ms`);

fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, "multicatalytic-workspace.json");
fs.writeFileSync(file, JSON.stringify({ generatedBy: "scripts/benchmarks/multicatalyticBenchmark.mjs", scenarios: report, performance: performanceReport }, null, 2));
console.log(`\n${report.length - report.filter((r) => r.checks.some((c) => !c.ok)).length}/${report.length} scenarios matched expectations; results: ${path.relative(process.cwd(), file)}`);
await closeEngine();
process.exit(failures === 0 ? 0 : 1);
