// Phase 4 / Stage 6: reliability matrix for the synthesis planner.
//
// Each layer isolates one failure mechanism, so a regression points at the layer that broke:
//   L1  the reaction engine produces the expected product for a supported transformation
//   L2  the retrosynthesis planner PROPOSES the inverse disconnection under the same
//       candidate caps the interactive planner uses (the starvation bug lived here)
//   L3  the complete route is found within a defined budget and passes forward replay
// plus metamorphic checks (budget monotonicity, order invariance, determinism) and
// negative cases. Expected products were checked by hand; they are PocketChem's model of
// the reaction, not experimental claims.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { modules } from "./fixtures/convergentHelpers.mjs";

let registry;
let engine;
let retro;
let synthesis;
let stereo;
let ui;

before(async () => {
  ({ registry } = await modules());
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  retro = await loadModule("/src/utils/reactions/engine/retroSynthesis.ts");
  synthesis = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  ui = await loadModule("/src/utils/reactions/engine/searchOptionsFromUi.ts");
});

after(async () => {
  await closeEngine();
});

const canon = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;
const canonSet = async (smilesList) => (await Promise.all(smilesList.map(canon))).sort().join(".");

// ---- L1: supported transformations (one per reaction class that the failing case needed
// or that the sweep touched). `reactants` are what the user would draw.
const L1 = [
  ["O-methylation of a phenol", "Cc1ccc(O)cc1.CBr", "phenol-williamson-ether", "COc1ccc(C)cc1"],
  ["benzylic bromination", "COc1ccc(C)cc1", "benzylic-bromination", "COc1ccc(CBr)cc1"],
  ["acetylide alkylation (acetylene itself)", "C#C.COc1ccc(CBr)cc1", "terminal-alkyne-alkylation", "C#CCc1ccc(OC)cc1"],
  ["partial alkyne hydrogenation", "COc1ccc(CC#C)cc1", "alkyne-lindlar-reduction-terminal", "C=CCc1ccc(OC)cc1"],
  ["alcohol oxidation", "CCO", "primary-alcohol-mild-oxidation", "CC=O"],
  ["ketone reduction", "CC(C)=O", "ketone-reduction", "CC(C)O"],
  ["Grignard addition", "CC=O.CC[Mg]Br", "aldehyde-organometallic-addition", "CCC(C)O"],
  ["alkene hydration", "C=CC", "alkene-acid-hydration", "CC(C)O"],
  ["aldehyde oxidation", "CCC=O", "aldehyde-oxidation", "CCC(=O)O"],
  ["Fischer esterification", "CC(=O)O.CCO", "fischer-esterification", "CCOC(C)=O"],
  ["alcohol Williamson ether", "CCO.CBr", "alcohol-williamson-ether", "CCOC"],
  ["SN2 substitution", "CCCBr", "haloalkane-sn2-hydroxide", "CCCO"],
  ["E2 elimination (Hofmann)", "CCC(C)Br", "haloalkane-e2-hofmann", "C=CCC"],
];
// Negative: the rule must NOT fire.
const L1_NEGATIVE = [
  ["tertiary halide does not O-alkylate a phenol", "Oc1ccccc1.CC(C)(C)Br", "phenol-williamson-ether"],
  ["an internal alkyne is not a terminal-alkyne reduction substrate", "CC#CC", "alkyne-lindlar-reduction-terminal"],
  ["benzene has no benzylic position", "c1ccccc1", "benzylic-bromination"],
  ["an ether is not a phenol", "CCOCC", "phenol-williamson-ether"],
];

describe("L1: the reaction engine executes supported transformations", () => {
  for (const [name, reactants, ruleId, product] of L1) {
    test(`[engine] ${name} (${ruleId})`, async () => {
      const pathways = await engine.predictReactionPathwaysFromRules(reactants, [], registry, { planning: true });
      const hit = pathways.filter((item) => item.ruleId === ruleId);
      assert.ok(hit.length > 0, `${ruleId} did not apply to ${reactants}`);
      const products = await Promise.all(hit.map((item) => canonSet(item.productSmiles.split("."))));
      assert.ok(products.includes(await canon(product)), `${product} not among ${products.join(" | ")}`);
    });
  }
  for (const [name, reactants, ruleId] of L1_NEGATIVE) {
    test(`[engine] ${name}`, async () => {
      const pathways = await engine.predictReactionPathwaysFromRules(reactants, [], registry, { planning: true });
      assert.equal(pathways.filter((item) => item.ruleId === ruleId).length, 0);
    });
  }

  test("[engine] repeated and re-ordered calls give identical pathways (caches never change results)", async () => {
    const summarize = async (input) =>
      (await engine.predictReactionPathwaysFromRules(input, [], registry, { planning: true }))
        .map((item) => `${item.ruleId}>${item.productSmiles}`)
        .sort()
        .join("\n");
    const first = await summarize("Cc1ccc(O)cc1.CBr");
    assert.equal(await summarize("Cc1ccc(O)cc1.CBr"), first);
    assert.equal(await summarize("CBr.Cc1ccc(O)cc1"), first);
    await summarize("Cc1ccc(O)cc1"); // warms the per-structure cache with a different partner set
    assert.equal(await summarize("Cc1ccc(O)cc1.CBr"), first);
  });
});

// ---- L2: the retro planner proposes the inverse disconnection under planner caps.
// Planner settings: Normal wide pass maxResults 36 / transforms 32, quick lane 12 / 28.
const L2 = [
  ["Lindlar disconnection of a terminal alkene", "COc1ccc(CC=C)cc1", ["C#CCc1ccc(OC)cc1"]],
  ["acetylene mono-alkylation (terminal alkyne product)", "C#CCc1ccc(OC)cc1", ["C#C", "COc1ccc(CBr)cc1"]],
  ["benzylic bromide from the methylarene", "COc1ccc(CBr)cc1", ["COc1ccc(C)cc1"]],
  ["phenol O-methylation", "COc1ccc(C)cc1", ["Cc1ccc(O)cc1", "CBr"]],
  ["ketone reduction", "CC(C)O", ["CC(C)=O"]],
];
const plannerRetro = (target, extra = {}) =>
  retro.predictRetrosynthesisPathwaysFromRules(target, registry, {
    planning: true,
    maxResults: 36,
    maxTransformsExecuted: 28,
    ...extra,
  });
const precursorSets = async (pathways) => {
  const sets = [];
  for (const pathway of pathways) {
    sets.push(await canonSet(pathway.precursorComponents));
    for (const alt of pathway.alternativeRoutes ?? []) void alt; // same precursor set by construction
  }
  return sets;
};

describe("L2: retrosynthesis proposes the disconnection under planner candidate caps", () => {
  for (const [name, target, precursors] of L2) {
    test(`[engine] ${name}`, async () => {
      const sets = await precursorSets(await plannerRetro(target));
      assert.ok(
        sets.includes(await canonSet(precursors)),
        `${precursors.join(" + ")} missing for ${target}; got ${sets.slice(0, 6).join(" | ")}`,
      );
    });
  }

  test("[engine] budget monotonicity: raising the caps never loses a disconnection (by rule)", async () => {
    // Several unrelated targets, so this guards the mechanism and not one molecule.
    for (const target of ["COc1ccc(CC=C)cc1", "CCC(=O)OC(C)C", "CCCOC1CCCCC1"]) {
      // Rules that reach the same precursor set are merged into one pathway (the others
      // become "alternativeRoutes"), so a rule is covered if it is the primary OR an alternative.
      const ruleSet = async (extra) =>
        new Set(
          (await plannerRetro(target, extra)).flatMap((item) => [
            item.ruleId,
            ...item.alternativeRoutes.map((alt) => alt.ruleId),
          ]),
        );
      const small = await ruleSet({ maxResults: 12, maxTransformsExecuted: 12 });
      const medium = await ruleSet({ maxResults: 36, maxTransformsExecuted: 28 });
      const unbounded = await ruleSet({ maxResults: 200, maxTransformsExecuted: undefined });
      for (const id of small) assert.ok(medium.has(id), `${target}: ${id} lost going 12 -> 28 transforms`);
      for (const id of medium) assert.ok(unbounded.has(id), `${target}: ${id} lost going 28 -> unbounded`);
      if (target === "COc1ccc(CC=C)cc1") assert.ok(unbounded.has("alkyne-lindlar-reduction-terminal"));
    }
  });

  test("[engine] a rule's many variants cannot starve other rules of the result budget", async () => {
    // Specific rules emit many variants (halide choices, ring positions); a small budget must
    // still be spread across DIFFERENT rules, not filled by one rule's variants.
    const pathways = await plannerRetro("COc1ccc(CC=C)cc1", { maxResults: 12, maxTransformsExecuted: undefined });
    const rules = new Set(
      pathways.flatMap((item) => [item.ruleId, ...item.alternativeRoutes.map((alt) => alt.ruleId)]),
    );
    assert.ok(rules.size >= 8, `only ${rules.size} distinct rules in a 12-result planning budget`);
  });
});

// ---- L3: complete routes within the interactive Deep budget, replayed forward.
const STARTING = "Cc1ccc(O)cc1.CBr.C#C";
const TARGET = "COc1ccc(CC=C)cc1";
const EXPECTED_RULES = [
  "alkyne-lindlar-reduction-terminal",
  "benzylic-bromination",
  "phenol-williamson-ether",
  "terminal-alkyne-alkylation",
];

describe("L3: estragole from p-cresol + bromomethane + acetylene (Deep search budget)", () => {
  const search = async (starting, signal) => {
    const options = ui.buildSynthesisSearchOptions("deep", 45000, { convergent: false, bidirectional: false, copies: 1 }, { signal });
    return synthesis.findMultistepSynthesisRoutesFromRules(starting, TARGET, registry, options);
  };
  let first;
  let reversed;

  before(async () => {
    // A 45 s abort is the page's hard deadline; the route must arrive well before it.
    const a = new AbortController();
    const timer = setTimeout(() => a.abort(), 45000);
    const started = Date.now();
    first = { routes: await search(STARTING, a.signal), ms: Date.now() - started, aborted: a.signal.aborted };
    clearTimeout(timer);
    const b = new AbortController();
    const timerB = setTimeout(() => b.abort(), 45000);
    reversed = { routes: await search("C#C.CBr.Cc1ccc(O)cc1", b.signal), aborted: b.signal.aborted };
    clearTimeout(timerB);
  });

  test("[engine] a verified route is found before the 45 s deadline, using all three materials", () => {
    assert.equal(first.aborted, false, "search hit the hard deadline");
    assert.ok(first.routes.length >= 1);
    const route = first.routes[0];
    assert.equal(route.verification.status, "verified");
    assert.deepEqual(route.steps.map((step) => step.ruleId).sort(), EXPECTED_RULES);
    assert.deepEqual(route.verification.unusedStartingMaterials, []);
    assert.equal(route.steps[route.steps.length - 1].productSmiles, TARGET);
  });

  test("[engine] the starting-material order does not change the rules used", () => {
    assert.equal(reversed.aborted, false);
    assert.ok(reversed.routes.length >= 1);
    assert.deepEqual(reversed.routes[0].steps.map((step) => step.ruleId).sort(), EXPECTED_RULES);
  });

  test("[engine] every returned route replayed forward without failure", () => {
    for (const route of [...first.routes, ...reversed.routes]) assert.notEqual(route.verification.status, "failed");
  });
});

describe("negative: no route within budget is reported as such, never as a failure", () => {
  test("[engine] without the acetylene the target cannot be built; the search ends empty at its budget", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 6000);
    const routes = await synthesis.findMultistepSynthesisRoutesFromRules("Cc1ccc(O)cc1.CBr", TARGET, registry, {
      searchEffort: "normal",
      preferFirstVerifiedRoute: true,
      maxSteps: 4,
      signal: controller.signal,
    });
    assert.deepEqual(routes, []);
  });
});
