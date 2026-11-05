// Stage 9I: conservative route-quality tier.
//
// Structural replay says a route follows from PocketChem's reaction model. These tests pin the
// separate chemical-quality tier using REAL registry rules and generic structural patterns. No
// molecule-specific exception exists in the implementation; the molecules below are examples of a
// pattern (an activated arene, a beta-keto acid, a beta-halo carbonyl, ...), not special cases.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { modules, runRule } from "./fixtures/convergentHelpers.mjs";

let registry;
let quality;
let compat;
let selectivity;

before(async () => {
  ({ registry } = await modules());
  quality = await loadModule("/src/utils/reactions/engine/routeQuality.ts");
  compat = await loadModule("/src/utils/reactions/engine/compatibility.ts");
  selectivity = await loadModule("/src/utils/reactions/engine/selectivityAssessment.ts");
});

after(async () => {
  await closeEngine();
});

const rule = (id) => {
  const found = registry.find((item) => item.id === id);
  assert.ok(found, `unknown rule ${id}`);
  return found;
};

/** A minimal step as the planner records it; the rule's own title and reagents are used. */
function step(number, ruleId, reactants, products) {
  const r = rule(ruleId);
  return {
    id: `s${number}`,
    stepNumber: number,
    source: "forward",
    ruleId,
    family: r.family,
    reactionType: r.reactionType,
    title: r.title,
    reactantSmiles: reactants.join("."),
    reactantComponents: reactants,
    reactantLabel: "",
    productSmiles: products.join("."),
    productComponents: products,
    productLabel: "",
    reagentLabel: r.reagents,
    reagentNote: r.reagentNote,
    shortExplanation: "",
    selectivity: [],
    limitations: [],
  };
}

const routeOf = (steps, extra = {}) => ({
  id: "t",
  startingSmiles: steps[0].reactantSmiles,
  targetSmiles: steps[steps.length - 1].productSmiles,
  steps,
  confidence: "verified",
  score: 0,
  ...extra,
});

const codes = (q, level) => q.findings.filter((f) => !level || f.level === level).map((f) => f.code);

describe("route-quality tier is separate from structural replay", () => {
  test("[quality] replay status is reported unchanged beside the tier", async () => {
    const route = routeOf([step(1, "aromatic-halogenation-bromination", ["Nc1ccccc1"], ["Nc1ccc(Br)cc1"])], {
      verification: { status: "verified", steps: [], targetMatch: "exact", unusedStartingMaterials: [], coproducts: [], problems: [] },
    });
    const q = await quality.assessRouteQuality(route, registry);
    assert.equal(q.structural, "verified");
    assert.equal(q.tier, "known-concern");
  });

  test("[quality] a failed replay is contradicted, never a success tier", async () => {
    const route = routeOf([step(1, "aldehyde-reduction", ["CC=O"], ["CCO"])], {
      verification: { status: "failed", steps: [], targetMatch: "none", unusedStartingMaterials: [], coproducts: [], problems: ["x"] },
    });
    const q = await quality.assessRouteQuality(route, registry);
    assert.equal(q.tier, "contradicted");
    assert.equal(q.structural, "failed");
  });

  test("[quality] without compatibility or selectivity summaries the best tier is structure-verified, not supported", async () => {
    const route = routeOf([step(1, "aldehyde-reduction", ["CC=O"], ["CCO"])], {
      verification: { status: "verified", steps: [], targetMatch: "exact", unusedStartingMaterials: [], coproducts: [], problems: [] },
    });
    const q = await quality.assessRouteQuality(route, registry);
    assert.equal(q.tier, "structure-verified");
  });

  test("[quality] chemically-supported needs every step assessed and unambiguous (and is rare)", async () => {
    // Terminal-alkyne alkylation declares conditions; assess with the real summaries.
    const steps = [step(1, "terminal-alkyne-alkylation", ["C#C", "CCCBr"], ["C#CCCC"])];
    const route = routeOf(steps, {
      verification: { status: "verified", steps: [], targetMatch: "exact", unusedStartingMaterials: [], coproducts: [], problems: [] },
    });
    route.compatibility = await compat.assessRouteCompatibility(route, registry);
    route.selectivity = await selectivity.assessRouteSelectivity(route, registry);
    const q = await quality.assessRouteQuality(route, registry);
    assert.ok(["chemically-supported", "plausible-incomplete", "known-concern"].includes(q.tier));
    if (q.tier === "chemically-supported") {
      assert.deepEqual(codes(q, "incomplete"), []);
      assert.deepEqual(codes(q, "concern"), []);
    }
  });
});

describe("generic chemistry checks with real rules", () => {
  test("[quality] halogenation of a free arylamine or phenol that leaves an open ortho/para site is a concern", async () => {
    for (const [reactant, product] of [
      ["Nc1ccccc1", "Nc1ccc(Br)cc1"],
      ["Oc1ccccc1", "Oc1ccc(Br)cc1"],
      ["CNc1ccccc1", "CNc1ccc(Br)cc1"],
    ]) {
      const q = await quality.assessRouteQuality(routeOf([step(1, "aromatic-halogenation-bromination", [reactant], [product])]), registry);
      assert.ok(codes(q, "concern").includes("eas-overhalogenation"), `${reactant}`);
      assert.equal(q.tier, "known-concern");
    }
  });

  test("[quality] protected (acylated/sulfonylated) nitrogen and ethers are not flagged as over-halogenation", async () => {
    for (const [reactant, product] of [
      ["CC(=O)Nc1ccccc1", "CC(=O)Nc1ccc(Br)cc1"],
      ["COc1ccccc1", "COc1ccc(Br)cc1"],
      ["Cc1ccccc1", "Cc1ccc(Br)cc1"],
    ]) {
      const q = await quality.assessRouteQuality(routeOf([step(1, "aromatic-halogenation-bromination", [reactant], [product])]), registry);
      assert.ok(!codes(q).includes("eas-overhalogenation"), `${reactant}`);
    }
  });

  test("[quality] a fully substituted activated ring has no open site, so no over-halogenation concern", async () => {
    const q = await quality.assessRouteQuality(
      routeOf([step(1, "aromatic-halogenation-bromination", ["Nc1c(Br)cc(Br)cc1Br"], ["Nc1c(Br)cc(Br)cc1Br"])]),
      registry,
    );
    // Reactant has the activator, but the (hypothetical) product has no free ortho/para H.
    assert.ok(!codes(q).includes("eas-overhalogenation"));
  });

  test("[quality] direct nitration of a free arylamine is a concern; the acetanilide is not", async () => {
    const free = await quality.assessRouteQuality(routeOf([step(1, "aromatic-nitration", ["Nc1ccccc1"], ["Nc1ccc([N+](=O)[O-])cc1"])]), registry);
    assert.ok(codes(free, "concern").includes("eas-nitration-free-arylamine"));
    const acyl = await quality.assessRouteQuality(routeOf([step(1, "aromatic-nitration", ["CC(=O)Nc1ccccc1"], ["CC(=O)Nc1ccc([N+](=O)[O-])cc1"])]), registry);
    assert.ok(!codes(acyl).includes("eas-nitration-free-arylamine"));
  });

  test("[quality] Friedel-Crafts alkylation always carries the polyalkylation/rearrangement concern", async () => {
    const q = await quality.assessRouteQuality(routeOf([step(1, "aromatic-friedel-crafts-alkylation", ["c1ccccc1", "CCBr"], ["CCc1ccccc1"])]), registry);
    assert.ok(codes(q, "concern").includes("eas-friedel-crafts-alkylation"));
  });

  test("[quality] a beta-keto acid used as an isolated intermediate is a concern unless the next step decarboxylates it", async () => {
    const hydrolysis = step(1, "ester-acid-hydrolysis", ["CC(=O)CC(=O)OCC"], ["CC(=O)CC(=O)O", "CCO"]);
    const consumer = step(2, "carboxylic-acid-curtius-rearrangement", ["CC(=O)CC(=O)O"], ["CC(=O)CN"]);
    const flagged = await quality.assessRouteQuality(routeOf([hydrolysis, consumer]), registry);
    assert.ok(codes(flagged, "concern").includes("unstable-beta-keto-acid"));

    const decarboxylating = step(2, "beta-keto-acid-decarboxylation", ["CC(=O)CC(=O)O"], ["CC(C)=O"]);
    const fine = await quality.assessRouteQuality(routeOf([hydrolysis, decarboxylating]), registry);
    assert.ok(!codes(fine).includes("unstable-beta-keto-acid"));
  });

  test("[quality] base-mediated alkylation with a beta-halo carbonyl electrophile is a concern; a plain halide is not", async () => {
    const bad = await quality.assessRouteQuality(
      routeOf([step(1, "enolate-alkylation", ["O=C1CCCCC1", "CC(=O)CCBr"], ["CC(=O)CCC1CCCCC1=O"])]),
      registry,
    );
    assert.ok(codes(bad, "concern").includes("base-beta-halo-carbonyl"));
    const plain = await quality.assessRouteQuality(
      routeOf([step(1, "enolate-alkylation", ["O=C1CCCCC1", "CCCCBr"], ["CCCCC1CCCCC1=O"])]),
      registry,
    );
    assert.ok(!codes(plain).some((code) => code.startsWith("base-")));
  });
});

describe("atom sourcing", () => {
  test("[quality] a documented reagent that supplies an element is not unsourced (HBr -> bromoalkane)", async () => {
    const q = await quality.assessRouteQuality(routeOf([step(1, "alkene-hx-addition-hbr", ["CC=CCC"], ["CCCC(C)Br"])]), registry);
    assert.ok(!codes(q).includes("unsourced-atoms"));
  });

  test("[quality] an element with no source in reactants or reagent text is a contradiction", async () => {
    // Aldehyde reduction (NaBH4/LiAlH4) cannot introduce bromine.
    const q = await quality.assessRouteQuality(routeOf([step(1, "aldehyde-reduction", ["CC=O"], ["CC(Br)O"])]), registry);
    assert.ok(codes(q, "contradiction").includes("unsourced-atoms"));
    assert.equal(q.tier, "contradicted");
  });

  test("[quality] carbon appearing from nowhere is a contradiction unless the reagent text names a carbon reagent", async () => {
    const orphan = await quality.assessRouteQuality(routeOf([step(1, "aldehyde-reduction", ["CC=O"], ["CCCCO"])]), registry);
    assert.ok(codes(orphan, "contradiction").includes("unsourced-atoms"));
  });

  test("[quality] Wittig: ylide carbon comes from the alkyl-halide partner; Ph3P is a documented, untracked reagent", async () => {
    const pathways = await runRule("aldehyde-wittig", ["CC=O", "CCCBr"]);
    assert.ok(pathways.length > 0);
    const route = routeOf([step(1, "aldehyde-wittig", ["CC=O", "CCCBr"], ["CC=CCC"])]);
    const q = await quality.assessRouteQuality(route, registry);
    assert.ok(!codes(q).includes("unsourced-atoms"), "propyl carbons are traceable to the halide partner");
    const info = q.findings.find((f) => f.code === "documented-reagents");
    assert.ok(info && /Ph/.test(info.message) && /P/.test(info.message), "phosphorus reagent is listed as documented, not tracked");
    // Without the alkyl-halide partner the extra carbons have no source.
    const orphan = await quality.assessRouteQuality(routeOf([step(1, "aldehyde-wittig", ["CC=O"], ["CC=CCC"])]), registry);
    assert.ok(codes(orphan, "contradiction").includes("unsourced-atoms"));
  });
});

describe("selectivity classification of unranked outcomes", () => {
  async function selectivityQuality(steps) {
    const route = routeOf(steps);
    route.compatibility = await compat.assessRouteCompatibility(route, registry);
    route.selectivity = await selectivity.assessRouteSelectivity(route, registry);
    return quality.assessRouteQuality(route, registry);
  }

  test("[quality] HBr addition to an equally substituted internal alkene is a regioisomer-mixture concern", async () => {
    const q = await selectivityQuality([step(1, "alkene-hx-addition-hbr", ["CC=CCC"], ["CCCC(C)Br"])]);
    assert.ok(codes(q, "concern").includes("selectivity-no-markovnikov-preference"), JSON.stringify(q.findings.map((f) => f.code)));
    assert.equal(q.tier, "known-concern");
  });

  test("[quality] electrophilic substitution of toluene with unranked o/p outcomes is a regioisomer concern", async () => {
    const q = await selectivityQuality([step(1, "aromatic-halogenation-bromination", ["Cc1ccccc1"], ["Cc1ccc(Br)cc1"])]);
    assert.ok(codes(q, "concern").includes("selectivity-regioisomers"), JSON.stringify(q.findings.map((f) => f.code)));
  });

  test("[quality] radical halogenation of an alkane with several equivalent-class C-H sites is a mixture concern", async () => {
    const q = await selectivityQuality([step(1, "alkane-radical-bromination", ["CCCCC"], ["CCCC(C)Br"])]);
    assert.ok(codes(q, "concern").includes("selectivity-radical-mixture"), JSON.stringify(q.findings.map((f) => f.code)));
  });

  test("[quality] unranked outcomes with no documented reason stay 'incomplete', not a known concern", async () => {
    const q = await selectivityQuality([step(1, "aldehyde-reduction", ["CC=O"], ["CCO"])]);
    assert.ok(!codes(q, "concern").some((code) => code.startsWith("selectivity-")));
  });
});

describe("quality labels", () => {
  test("[quality] every tier has a distinct human label and none reads as an unqualified success", () => {
    const tiers = ["structure-verified", "chemically-supported", "plausible-incomplete", "known-concern", "contradicted"];
    const labels = tiers.map((tier) => quality.routeQualityLabel(tier));
    assert.equal(new Set(labels).size, tiers.length);
    for (const label of labels) assert.ok(!/^(success|synthesis (found|successful))/i.test(label));
  });
});

describe("saved results", () => {
  test("[quality] a saved route without a quality field still restores, and a malformed quality field is rejected", async () => {
    const persistence = await loadModule("/src/utils/persistence/synthesisWorkspace.ts");
    assert.equal(persistence.SYNTHESIS_ENGINE_VERSION, 2, "old saved results must be flagged as an earlier engine version");
    const base = () => ({
      inputKey: "k",
      startingSmiles: "CC=O",
      targetSmiles: "CCO",
      copies: 1,
      startingNames: ["a"],
      targetName: "b",
      routes: [routeOf([step(1, "aldehyde-reduction", ["CC=O"], ["CCO"])])],
      outcomeMessage: "m",
      interruptedNote: null,
      elapsedMs: 5,
    });
    const legacy = persistence.validateSynthesisResults(base());
    assert.ok(legacy, "a route saved before Stage 9I restores");
    assert.equal(legacy.routes[0].quality, undefined, "legacy routes are not given a retroactive tier");

    const withQuality = base();
    withQuality.routes[0].quality = { assessmentVersion: 1, structural: "verified", tier: "known-concern", findings: [{ stepNumber: 1, code: "c", level: "concern", message: "m" }] };
    assert.equal(persistence.validateSynthesisResults(withQuality)?.routes[0].quality.tier, "known-concern");

    const broken = base();
    broken.routes[0].quality = { tier: "known-concern", findings: "nope" };
    assert.equal(persistence.validateSynthesisResults(broken), null);
  });
});
