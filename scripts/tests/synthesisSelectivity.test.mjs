// Phase 4 / Stage 9B-1: advisory product-selectivity assessment and its use in route ranking.
//
// Nothing here names a molecule in the production code; the molecules below are only inputs.
// The assessment reads what the engine already offers for a step's reactants (how many
// constitutional outcomes, and whether any is ranked) and the rule's own metadata. "Unassessed"
// is unknown, never wrong, and is never counted as a concern.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { fixtureById } from "./fixtures/convergentFixtures.mjs";
import { modules } from "./fixtures/convergentHelpers.mjs";

let registry;
let selectivity;
let book;
let lanes;
let synthesis;
let runModule;

before(async () => {
  ({ registry } = await modules());
  selectivity = await loadModule("/src/utils/reactions/engine/selectivityAssessment.ts");
  book = await loadModule("/src/utils/reactions/engine/routeBook.ts");
  lanes = await loadModule("/src/utils/reactions/engine/searchLanes.ts");
  synthesis = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
  runModule = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
});

after(async () => {
  await closeEngine();
});

const rule = (id) => registry.find((item) => item.id === id);
const stepOf = (ruleId, reactantSmiles, productSmiles, extra = {}) => ({
  id: `${ruleId}-test`,
  stepNumber: 1,
  ruleId,
  reactantSmiles,
  reactantComponents: reactantSmiles.split("."),
  productSmiles,
  productComponents: productSmiles.split("."),
  limitations: [],
  selectivityAssessment: null,
  ...extra,
});

describe("step selectivity classes", () => {
  test("[engine] two constitutional outcomes the engine does not rank are 'unranked', with the count", async () => {
    const diol = "CCCCCCC(O)CO";
    for (const product of ["CCCCCCC(C)=O", "CCCCCCCC=O"]) {
      const finding = await selectivity.assessStepSelectivity(stepOf("pinacol-rearrangement", diol, product), rule("pinacol-rearrangement"));
      assert.equal(finding.class, "unranked");
      assert.equal(finding.alternatives, 2);
    }
  });

  test("[engine] an unranked coupling regioisomer never gets major-product standing", async () => {
    for (const product of ["CC=Cc1ccccc1", "C=C(C)c1ccccc1"]) {
      const finding = await selectivity.assessStepSelectivity(stepOf("heck-coupling", "Brc1ccccc1.C=CC", product), rule("heck-coupling"));
      assert.equal(finding.class, "unranked");
      assert.ok(finding.limitations.some((text) => /does not rank/.test(text)), "the rule's own limitation is carried");
      assert.equal(finding.representative, true);
    }
  });

  test("[engine] a step with one constitutional outcome is 'single-outcome' (nothing to rank), not 'major'", async () => {
    const finding = await selectivity.assessStepSelectivity(stepOf("secondary-alcohol-oxidation-pcc", "CCCCCCC(C)O", "CCCCCCC(C)=O"), rule("secondary-alcohol-oxidation-pcc"));
    assert.equal(finding.class, "single-outcome");
    assert.equal(finding.alternatives, 1);
  });

  test("[engine] a product-specific estimate decides major versus disfavored; competitive is not called major", async () => {
    const withLevel = (level) => stepOf("alkane-bromination", "CCC", "CCCBr", {
      selectivityAssessment: { level, estimatedFraction: 0.1, planningPenalty: 0, label: `${level} product`, basis: "test estimate" },
    });
    assert.equal((await selectivity.assessStepSelectivity(withLevel("trace"), undefined)).class, "disfavored");
    assert.equal((await selectivity.assessStepSelectivity(withLevel("minor"), undefined)).class, "disfavored");
    assert.equal((await selectivity.assessStepSelectivity(withLevel("major"), undefined)).class, "major");
    assert.notEqual((await selectivity.assessStepSelectivity(withLevel("competitive"), undefined)).class, "major");
  });

  test("[engine] a rule missing from the registry, or a product the rule cannot reproduce, is 'unassessed' - not a concern", async () => {
    const missing = await selectivity.assessStepSelectivity(stepOf("no-such-rule", "CCO", "CC=O"), undefined);
    assert.equal(missing.class, "unassessed");
    const wrong = await selectivity.assessStepSelectivity(stepOf("secondary-alcohol-oxidation-pcc", "CCCCCCC(C)O", "CCCCCCCC"), rule("secondary-alcohol-oxidation-pcc"));
    assert.equal(wrong.class, "unassessed");
    const summary = selectivity.selectivityConcerns({ findings: [missing, wrong], counts: { major: 0, "single-outcome": 0, disfavored: 0, unranked: 0, unassessed: 2 } });
    assert.deepEqual(summary, { disfavored: 0, unranked: 0 });
  });

  test("[engine] a representative rule is flagged as such (the stereo-incomplete epoxidation keeps its uncertainty)", async () => {
    const finding = await selectivity.assessStepSelectivity(stepOf("alkene-epoxidation", "C/C=C/C", "C[C@@H]1O[C@@H]1C"), rule("alkene-epoxidation"));
    assert.equal(finding.representative, true);
    assert.equal(rule("alkene-epoxidation").productStatus, "representative");
  });

  test("[engine] a rule's documented limitation travels with the finding (over-reduction caveat stays visible)", async () => {
    const finding = await selectivity.assessStepSelectivity(stepOf("ester-dibal-reduction", "COC(=O)C=C", "C=CC=O"), rule("ester-dibal-reduction"));
    assert.ok(finding.limitations.length > 0);
    assert.notEqual(finding.class, "major", "an unranked-or-single outcome is never labelled as a supported major product");
  });
});

describe("ranking uses selectivity without treating unknown as wrong", () => {
  const route = (ruleIds, counts, extra = {}) => ({
    id: ruleIds.join(">"),
    startingSmiles: "A",
    targetSmiles: "B",
    confidence: "verified",
    score: 0,
    steps: ruleIds.map((ruleId, index) => ({ stepNumber: index + 1, ruleId, reactantComponents: [], productComponents: [] })),
    verification: { status: "verified", targetMatch: "exact", unusedStartingMaterials: [], stepDependencies: [], inventory: [] },
    selectivity: { findings: [], counts: { major: 0, "single-outcome": 0, disfavored: 0, unranked: 0, unassessed: 0, ...counts } },
    ...extra,
  });

  test("a documented disfavored step ranks below an equal-length route without one", () => {
    const flagged = book.classifyRoute(route(["a", "b"], { disfavored: 1 }), "linear", 1);
    const clean = book.classifyRoute(route(["c", "d"], { "single-outcome": 2 }), "linear", 2);
    assert.ok(book.compareRanked(clean, flagged) < 0);
  });

  test("a disfavored step outranks length: a longer route without it is preferred", () => {
    const shortFlagged = book.classifyRoute(route(["a", "b"], { disfavored: 1 }), "linear", 1);
    const longClean = book.classifyRoute(route(["a", "b", "c"], { "single-outcome": 3 }), "linear", 2);
    assert.ok(book.compareRanked(longClean, shortFlagged) < 0);
  });

  test("an unranked step does not outrank length (a shorter route is kept first) but loses a tie", () => {
    const shortUnranked = book.classifyRoute(route(["a", "b"], { unranked: 1 }), "linear", 1);
    const longClean = book.classifyRoute(route(["a", "b", "c"], { "single-outcome": 3 }), "linear", 2);
    assert.ok(book.compareRanked(shortUnranked, longClean) < 0);
    const tieClean = book.classifyRoute(route(["x", "y"], { "single-outcome": 2 }), "linear", 3);
    assert.ok(book.compareRanked(tieClean, shortUnranked) < 0);
  });

  test("unassessed steps are neither a concern nor a reason to keep searching", () => {
    const unassessed = book.classifyRoute(route(["a", "b"], { unassessed: 2 }), "linear", 1);
    assert.equal(unassessed.disfavoredSteps, 0);
    assert.equal(unassessed.unrankedSteps, 0);
    assert.equal(book.isImprovable(unassessed), unassessed.compatibility === "plausible");
  });

  test("a disfavored step keeps a route adequate but improvable; an unranked one does not make it improvable", () => {
    const disfavored = book.classifyRoute(route(["a", "b"], { disfavored: 1 }), "linear", 1);
    assert.equal(book.isAdequate(disfavored), true);
    assert.equal(book.isImprovable(disfavored), true);
    const unranked = book.classifyRoute(route(["a", "b"], { unranked: 1 }), "linear", 2);
    assert.equal(book.isAdequate(unranked), true);
    assert.equal(book.isImprovable(unranked), false);
  });

  test("a major-supported or single-outcome route is not improvable on selectivity grounds", () => {
    const entry = book.classifyRoute(route(["a", "b"], { major: 1, "single-outcome": 1 }), "linear", 1);
    assert.equal(book.isImprovable(entry), entry.compatibility === "plausible");
  });

  test("a documented condition conflict is still its own judgement, independent of selectivity", () => {
    const conflict = book.classifyRoute(
      route(["a"], { "single-outcome": 1 }, { compatibility: { warnings: [], unassessedRuleIds: [], worst: "model-constraint" } }),
      "linear",
      1,
    );
    assert.equal(conflict.compatibility, "model-constraint");
    assert.equal(book.isAdequate(conflict), false);
    assert.equal(conflict.unrankedSteps, 0);
  });

  test("a route saved before selectivity existed ranks as before (no concerns)", () => {
    const old = route(["a", "b"], {});
    delete old.selectivity;
    const entry = book.classifyRoute(old, "linear", 1);
    assert.equal(entry.disfavoredSteps, 0);
    assert.equal(entry.unrankedSteps, 0);
  });
});

describe("extra search is reserved for documented concerns", () => {
  test("only disfavored rules of the first verified route are avoided; unranked and unassessed are not", () => {
    const finding = (ruleId, cls) => ({ stepNumber: 1, ruleId, class: cls, alternatives: null, representative: false, limitations: [], basis: "" });
    const verified = { status: "verified" };
    const flagged = lanes.rulesWithSelectivityConcerns([
      { verification: { status: "failed" }, selectivity: { findings: [finding("ignored", "unranked")] } },
      { verification: verified, selectivity: { findings: [finding("u", "unranked"), finding("d", "disfavored"), finding("s", "single-outcome"), finding("x", "unassessed")] } },
    ]);
    assert.deepEqual([...flagged].sort(), ["d"]);
    assert.equal(lanes.rulesWithSelectivityConcerns([{ verification: verified }]).size, 0);
    assert.equal(lanes.rulesWithSelectivityConcerns([]).size, 0);
  });
});

describe("scheduler: a lane that only found an unranked route does not cause more lanes to run", () => {
  const fakeRoute = (id, counts) => ({
    id,
    startingSmiles: "A",
    targetSmiles: "B",
    confidence: "verified",
    score: 0,
    steps: [{ stepNumber: 1, ruleId: id, reactantComponents: ["A"], productComponents: ["B"], reactantSmiles: "A", productSmiles: "B" }],
    verification: { status: "verified", targetMatch: "exact", unusedStartingMaterials: [], stepDependencies: [], inventory: [] },
    selectivity: { findings: [], counts: { major: 0, "single-outcome": 0, disfavored: 0, unranked: 0, unassessed: 0, ...counts } },
  });
  const reportingLane = (id, route) => ({
    id, label: id, minUsefulMs: 1, capMs: Number.POSITIVE_INFINITY, reserveMs: 0,
    async run(context) { if (route) context.reportRoute(route); return { routes: [], stoppedBy: "completed" }; },
  });
  let scheduler;
  before(async () => { scheduler = await loadModule("/src/utils/reactions/engine/searchScheduler.ts"); });

  test("unranked: the next lane is skipped as satisfied", async () => {
    const result = await scheduler.runAdaptiveSearch([reportingLane("first", fakeRoute("u", { unranked: 1 })), reportingLane("second", null)], { totalMs: 5000 });
    assert.equal(result.verdict, "routes-found");
    assert.equal(result.lanes.find((lane) => lane.id === "second").status, "skipped-satisfied");
  });

  test("disfavored: the next lane is allowed to run", async () => {
    const result = await scheduler.runAdaptiveSearch([reportingLane("first", fakeRoute("d", { disfavored: 1 })), reportingLane("second", null)], { totalMs: 5000 });
    assert.notEqual(result.lanes.find((lane) => lane.id === "second").status, "skipped-satisfied");
  });
});

describe("equivalent spellings of the same molecule", () => {
  const bestRules = async (start, target) => {
    const controller = new runModule.SearchRunController({ rules: registry, totalMs: 20000 });
    await controller.start({ startingSmiles: start, targetSmiles: target, copies: 1 });
    const best = controller.getState().ranked[0];
    return best ? best.route.steps.map((step) => step.ruleId).join(">") : null;
  };

  test("[engine] start and target spelled differently give the same selected route", async () => {
    const results = new Set();
    for (const start of ["C=CCCCCCC", "CCCCCCC=C"]) {
      for (const target of ["CCCCCCC(C)=O", "CC(=O)CCCCCC"]) results.add(await bestRules(start, target));
    }
    assert.deepEqual([...results], ["alkene-acid-hydration>secondary-alcohol-oxidation-pcc"]);
  });
});

describe("end to end (bounded)", () => {
  test("[engine] a known correct two-step route stays accepted, with no selectivity concern", async () => {
    const controller = new runModule.SearchRunController({ rules: registry, totalMs: 15000 });
    await controller.start({ startingSmiles: "C=CCC", targetSmiles: "CCC(C)=O", copies: 1 });
    const best = controller.getState().ranked[0];
    assert.ok(best, "a route is found");
    assert.equal(best.tier, 0);
    assert.equal(best.route.verification.status, "verified");
    assert.equal(best.disfavoredSteps, 0);
    assert.equal(best.unrankedSteps, 0);
    assert.equal(best.route.selectivity.findings.length, best.route.steps.length);
  });

  test("[engine] a convergent route with both branches transformed gets a finding for every step and no spurious concern", async () => {
    const fixture = fixtureById("fischer-isopropyl-propanoate");
    const { routes } = await synthesis.findConvergentSynthesisRoutes(fixture.supplied.join("."), fixture.target, registry, {
      convergentSearch: { maxStateExpansions: 40, maxReactionExecutions: 300, maxDepth: 4, maxWallMs: 60000 },
    });
    assert.ok(routes.length >= 1);
    const route = routes[0];
    assert.equal(route.verification.status, "verified");
    assert.equal(route.selectivity.findings.length, route.steps.length);
    assert.equal(route.selectivity.counts.disfavored, 0);
    assert.equal(route.selectivity.counts.unranked, 0);
    assert.ok(route.steps.some((step) => step.reactantComponents.length >= 2), "the route joins two branches");
  });
});

describe("a route with an unranked step is ranked, not re-searched", () => {
  test("[engine] 1-octene -> 2-octanone: the selected route is hydration + oxidation, with no unranked step", async () => {
    const controller = new runModule.SearchRunController({ rules: registry, totalMs: 25000 });
    await controller.start({ startingSmiles: "C=CCCCCCC", targetSmiles: "CC(=O)CCCCCC", copies: 1 });
    const ranked = controller.getState().ranked;
    const ids = ranked.map((entry) => entry.route.steps.map((step) => step.ruleId).join(">"));
    assert.equal(ids[0], "alkene-acid-hydration>secondary-alcohol-oxidation-pcc", JSON.stringify(ids));
    assert.equal(ranked[0].unrankedSteps, 0);
    // Any other route that was found must not outrank it on the documented criteria.
    for (const entry of ranked.slice(1)) assert.ok(book.compareRanked(ranked[0], entry) < 0);
  });
});

describe("candidate comparison with real rule metadata (no search)", () => {
  let compat;
  let stereo;
  before(async () => {
    compat = await loadModule("/src/utils/reactions/engine/compatibility.ts");
    stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  });

  const buildRoute = (id, chain) => {
    const steps = chain.slice(1).map(([ruleId, product], index) => {
      const reactant = chain[index][1];
      return stepOf(ruleId, reactant, product, { stepNumber: index + 1, reactantComponents: [reactant], productComponents: [product] });
    });
    return {
      id, startingSmiles: chain[0][1], targetSmiles: chain[chain.length - 1][1], steps, confidence: "verified", score: 0,
      verification: { status: "verified", targetMatch: "exact", unusedStartingMaterials: [], stepDependencies: [], inventory: [] },
    };
  };
  const withAdvisories = async (route) => {
    route.compatibility = await compat.assessRouteCompatibility(route, registry);
    route.selectivity = await selectivity.assessRouteSelectivity(route, registry);
    return route;
  };

  test("[engine] the route whose steps are not ranked-ambiguous ranks first, whichever was discovered first", async () => {
    const hydration = await withAdvisories(buildRoute("h", [["start", "C=CCCCCCC"], ["alkene-acid-hydration", "CCCCCCC(C)O"], ["secondary-alcohol-oxidation-pcc", "CCCCCCC(C)=O"]]));
    const pinacol = await withAdvisories(buildRoute("p", [["start", "C=CCCCCCC"], ["alkene-anti-dihydroxylation", "CCCCCCC(O)CO"], ["pinacol-rearrangement", "CCCCCCC(C)=O"]]));

    // Evidence actually present in the metadata: the pinacol step offers two unranked outcomes.
    const pinacolStep = pinacol.selectivity.findings[1];
    assert.equal(pinacolStep.class, "unranked");
    assert.equal(pinacolStep.alternatives, 2);
    assert.equal(hydration.selectivity.counts.unranked, 0);
    assert.equal(hydration.selectivity.counts.disfavored, 0);

    // Same structural standing and length; the difference is only the unranked step.
    const h = book.classifyRoute(hydration, "linear", 1);
    const p = book.classifyRoute(pinacol, "linear", 2);
    assert.equal(h.tier, p.tier);
    assert.equal(h.adjustedLength, p.adjustedLength);
    assert.equal(h.unrankedSteps, 0);
    assert.equal(p.unrankedSteps, 1);

    for (const order of [[hydration, pinacol], [pinacol, hydration]]) {
      const routeBook = new book.RouteBook();
      order.forEach((route, index) => routeBook.offer(route, `lane-${index}`));
      assert.deepEqual(routeBook.entries().map((entry) => entry.route.id), ["h", "p"], "ranking does not depend on discovery order");
    }
  });

  test("[engine] the conclusion rests on 'unranked' only: it is not evidence that the pinacol product is minor", async () => {
    const pinacol = await withAdvisories(buildRoute("p", [["start", "C=CCCCCCC"], ["alkene-anti-dihydroxylation", "CCCCCCC(O)CO"], ["pinacol-rearrangement", "CCCCCCC(C)=O"]]));
    assert.equal(pinacol.selectivity.counts.disfavored, 0);
    assert.ok(pinacol.selectivity.findings.every((finding) => finding.class !== "major"));
  });

  test("[engine] canonical forms: equivalent spellings agree; distinct stereoisomers, charges and isotopes stay distinct", async () => {
    const iso = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;
    assert.equal(await iso("C=CCCCCCC"), await iso("CCCCCCC=C"));
    assert.equal(await iso("CCCCCCC(C)=O"), await iso("CC(=O)CCCCCC"));
    assert.notEqual(await iso("C/C=C/C"), await iso("C/C=C\C"), "E and Z differ");
    assert.notEqual(await iso("C[C@H](O)CC"), await iso("C[C@@H](O)CC"), "R and S differ");
    assert.equal(await iso("C[C@H](O)CC"), await iso("O[C@@H](C)CC"), "the same enantiomer written two ways agrees");
    assert.match(await iso("C/C=C/C"), /\//);
    assert.match(await iso("C[C@H](O)CC"), /@/);
    assert.match(await iso("[13CH3]CO"), /13/);
    assert.notEqual(await iso("[13CH3]CO"), await iso("CCO"));
    assert.match(await iso("C[N+](C)(C)C"), /\+/);
    assert.match(await iso("CC(=O)[O-]"), /-/);
    const salt = await iso("[Na+].[Cl-]");
    assert.equal(salt.split(".").length, 2, "disconnected components are kept");
  });

  test("[engine] searches rooted at canonical forms keep stereochemistry and isotopes in the route", async () => {
    const run = async (start, target) => {
      const controller = new runModule.SearchRunController({ rules: registry, totalMs: 15000 });
      await controller.start({ startingSmiles: start, targetSmiles: target, copies: 1 });
      return controller.getState().ranked[0]?.route;
    };
    const chiral = await run("C[C@@H](O)CC", "CC(Br)CC");
    assert.ok(chiral, "chiral alcohol -> bromide found");
    assert.match(chiral.steps[0].reactantSmiles, /@/, "tetrahedral stereo of the start survives");
    const labelled = await run("[13CH3]CO", "[13CH3]CBr");
    assert.ok(labelled, "isotopically labelled alcohol -> bromide found");
    assert.match(labelled.steps[labelled.steps.length - 1].productSmiles, /13/, "isotope survives");
    const alkene = await run("C/C=C/C", "CC(O)CC");
    assert.ok(alkene, "E-alkene hydration found");
    assert.match(alkene.steps[0].reactantSmiles, /\//, "E geometry of the start survives");
  });
});
