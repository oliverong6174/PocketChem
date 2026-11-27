// Phase 4 / Stage 7: advisory chemical-compatibility layer.
//
// What is tested: the evaluator turns DECLARED rule conditions plus the groups that survive a
// step unreacted into warnings; unannotated rules are "unassessed", never "compatible"; and
// the planner prefers a route without a model-constraint when it can find one. Warnings are
// advisory and never change structural verification.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { modules } from "./fixtures/convergentHelpers.mjs";

let registry;
let compat;
let synthesis;
let ui;

before(async () => {
  ({ registry } = await modules());
  compat = await loadModule("/src/utils/reactions/engine/compatibility.ts");
  synthesis = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
  ui = await loadModule("/src/utils/reactions/engine/searchOptionsFromUi.ts");
});

after(async () => {
  await closeEngine();
});

const rule = (id) => {
  const found = registry.find((item) => item.id === id);
  assert.ok(found, `unknown rule ${id}`);
  return found;
};
const check = (id, reactants, products) => compat.assessStepCompatibility(rule(id), reactants, products);
const groups = (warnings) => warnings.map((item) => `${item.group}:${item.severity}`).sort();

describe("declared conditions are machine-readable metadata", () => {
  test("[engine] annotated rules carry structured conditions, not keywords from the reagent text", () => {
    const annotated = registry.filter((item) => item.conditions);
    assert.ok(annotated.length >= 30);
    const allowed = new Set(["base", "acid", "organometallic", "radical", "oxidant", "hydride", "anhydrous", "reactionCentre"]);
    for (const item of annotated) {
      for (const key of Object.keys(item.conditions)) assert.ok(allowed.has(key), `${item.id}: unknown condition ${key}`);
    }
    assert.deepEqual(rule("terminal-alkyne-alkylation").conditions.base, "strong");
    assert.equal(rule("aldehyde-organometallic-addition").conditions.organometallic, true);
    assert.equal(rule("benzylic-bromination").conditions.radical, true);
  });

  test("[engine] a rule without conditions is unassessed (null), not compatible", async () => {
    assert.equal(rule("aromatic-nitration").conditions, undefined);
    assert.equal(await check("aromatic-nitration", ["Oc1ccccc1"], ["Oc1ccc([N+](=O)[O-])cc1"]), null);
  });
});

describe("strong bases and acidic hydrogens", () => {
  test("[engine] acetylide alkylation next to a free phenol is a model constraint", async () => {
    const found = await check("terminal-alkyne-alkylation", ["C#C", "Oc1ccc(CBr)cc1"], ["C#CCc1ccc(O)cc1"]);
    assert.deepEqual(groups(found), ["phenol:model-constraint"]);
    assert.equal(found[0].kind, "acid-base-quench");
  });

  test("[engine] the same step with a protected phenol (aryl ether) is not flagged", async () => {
    const found = await check("terminal-alkyne-alkylation", ["C#C", "COc1ccc(CBr)cc1"], ["C#CCc1ccc(OC)cc1"]);
    assert.deepEqual(found, []);
  });

  test("[engine] the terminal alkyne being alkylated is the reaction centre, not a spectator", async () => {
    // Mono-alkylation of acetylene gives a new terminal alkyne; a before/after count alone
    // would report it as unreacted.
    const found = await check("terminal-alkyne-alkylation", ["C#C", "CCBr"], ["C#CCC"]);
    assert.deepEqual(found, []);
  });

  test("[engine] a carboxylic acid is a model constraint, an alcohol only a plausible warning, with a strong base", async () => {
    const acid = await check("terminal-alkyne-alkylation", ["C#C", "OC(=O)CCBr"], ["C#CCCC(=O)O"]);
    assert.deepEqual(groups(acid), ["carboxylic-acid:model-constraint"]);
    const alcohol = await check("terminal-alkyne-alkylation", ["C#C", "OCCBr"], ["C#CCCO"]);
    assert.deepEqual(groups(alcohol), ["alcohol:plausible"]);
  });

  test("[engine] mild base: Williamson O-methylation of a phenol is clean; a carboxylic acid spectator is only plausible", async () => {
    assert.deepEqual(await check("phenol-williamson-ether", ["Cc1ccc(O)cc1", "CBr"], ["COc1ccc(C)cc1"]), []);
    const found = await check("phenol-williamson-ether", ["OC(=O)Cc1ccc(O)cc1", "CBr"], ["COc1ccc(CC(=O)O)cc1"]);
    assert.deepEqual(groups(found), ["carboxylic-acid:plausible"]);
  });
});

describe("organometallic reagents and protic or electrophilic groups", () => {
  test("[engine] Grignard formation from a bromo-alcohol: the alcohol quenches the reagent (model constraint)", async () => {
    const found = await check("haloalkane-grignard-formation-bromide", ["OCCCBr"], ["OCCC[Mg]Br"]);
    assert.deepEqual(groups(found), ["alcohol:model-constraint"]);
  });

  test("[engine] Grignard addition to an aldehyde carrying a phenol: phenol quench is flagged", async () => {
    const found = await check("aldehyde-organometallic-addition", ["O=Cc1ccc(O)cc1", "C[Mg]Br"], ["CC(O)c1ccc(O)cc1"]);
    assert.ok(groups(found).includes("phenol:model-constraint"));
  });

  test("[engine] organolithium addition: a spectator ketone is a competing electrophile", async () => {
    const found = await check("aldehyde-organometallic-addition", ["O=CCCC(C)=O", "[Li][CH2]C"], ["CCC(O)CCC(C)=O"]);
    assert.ok(groups(found).includes("ketone:plausible"));
    assert.equal(found.find((item) => item.group === "ketone").kind, "competing-electrophile");
  });

  test("[engine] a simple Grignard addition is not flagged (the aldehyde is consumed)", async () => {
    assert.deepEqual(await check("aldehyde-organometallic-addition", ["CC=O", "CC[Mg]Br"], ["CCC(C)O"]), []);
  });

  test("[engine] hydride reduction: a spectator alcohol is a plausible warning only", async () => {
    const found = await check("ester-lah-reduction", ["CC(=O)OCC(O)CO"], ["OCC(O)CO.CCO"]);
    assert.ok(found.every((item) => item.severity === "plausible"));
  });
});

describe("benzylic versus aromatic halogenation and other competing reactivity", () => {
  test("[engine] benzylic bromination of an alkoxy-arene is not flagged", async () => {
    assert.deepEqual(await check("benzylic-bromination", ["COc1ccc(C)cc1"], ["COc1ccc(CBr)cc1"]), []);
  });

  test("[engine] benzylic bromination with a free phenol warns of competing ring bromination", async () => {
    const found = await check("benzylic-bromination", ["Cc1ccc(O)cc1"], ["Oc1ccc(CBr)cc1"]);
    assert.deepEqual(groups(found), ["phenol:plausible"]);
    assert.equal(found[0].kind, "competing-reactivity");
  });

  test("[engine] radical halogenation with a spectator alkene warns of halogen addition", async () => {
    const found = await check("benzylic-bromination", ["C=CCc1ccc(C)cc1"], ["C=CCc1ccc(CBr)cc1"]);
    assert.ok(groups(found).includes("alkene:plausible"));
  });

  test("[engine] a strong oxidant with a spectator alkene is flagged; consuming the alcohol is not", async () => {
    const flagged = await check("primary-alcohol-strong-oxidation", ["C=CCCO"], ["C=CCC(=O)O"]);
    assert.ok(groups(flagged).includes("alkene:plausible"));
    assert.ok(!groups(flagged).includes("alcohol:plausible"));
  });
});

describe("route-level assessment and ranking", () => {
  const step = (ruleId, reactantComponents, productComponents, stepNumber) => ({
    ruleId, reactantComponents, productComponents, stepNumber,
  });

  test("[engine] a route summary lists warnings by step and the unassessed rules separately", async () => {
    const route = {
      steps: [
        step("benzylic-bromination", ["Cc1ccc(O)cc1"], ["Oc1ccc(CBr)cc1"], 1),
        step("aromatic-nitration", ["Oc1ccccc1"], ["Oc1ccc([N+](=O)[O-])cc1"], 2),
      ],
    };
    const summary = await compat.assessRouteCompatibility(route, registry);
    assert.equal(summary.worst, "plausible");
    assert.equal(summary.warnings[0].stepNumber, 1);
    assert.deepEqual(summary.unassessedRuleIds, ["aromatic-nitration"]);
  });

  test("[engine] route length prices findings, so a clean route can beat a slightly shorter flagged one", () => {
    const flagged = [{ compatibility: [{ severity: "model-constraint" }] }, {}, {}];
    const clean = [{}, {}, {}, {}];
    assert.equal(compat.compatibilityAdjustedLength(flagged), 3.8);
    assert.equal(compat.compatibilityAdjustedLength(clean), 4);
    assert.ok(compat.compatibilityPenalty([{ severity: "model-constraint" }]) < 100, "advisory cost stays below a full step");
  });
});

describe("planner preference (Deep budget)", () => {
  test("[engine] p-cresol + CH3Br + acetylene -> estragole is ordered so no step has a model constraint", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const options = ui.buildSynthesisSearchOptions("deep", 45000, { convergent: false, bidirectional: false, copies: 1 }, { signal: controller.signal });
    const started = Date.now();
    const routes = await synthesis.findMultistepSynthesisRoutesFromRules(
      "Cc1ccc(O)cc1.CBr.C#C", "COc1ccc(CC=C)cc1", registry, options,
    );
    clearTimeout(timer);
    assert.equal(controller.signal.aborted, false, `hit the deadline after ${Date.now() - started} ms`);
    assert.ok(routes.length >= 1);
    const route = routes[0];
    assert.equal(route.verification.status, "verified");
    assert.ok(route.compatibility, "route carries a compatibility summary");
    assert.notEqual(route.compatibility.worst, "model-constraint", JSON.stringify(route.compatibility.warnings));
    // The O-methylation comes before the acetylide alkylation, so no free OH reaches the base.
    const rules = route.steps.map((item) => item.ruleId);
    const methylation = rules.findIndex((id) => id === "phenol-williamson-ether" || id === "alcohol-williamson-ether");
    assert.ok(methylation >= 0 && methylation < rules.indexOf("terminal-alkyne-alkylation"), rules.join(" > "));
  });
});
