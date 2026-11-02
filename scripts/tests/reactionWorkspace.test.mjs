// Stage 9B-2A: multi-material reaction workspace. Chemistry runs through the real rule
// registry and engine; nothing here fabricates a reaction result.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let ws;
let registry;
let stereo;

before(async () => {
  const engine = await loadEngine();
  registry = engine.utils.reactionRegistry;
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
});

after(async () => {
  await closeEngine();
});

async function create(...inputs) {
  const created = await ws.createWorkspace(inputs);
  assert.ok(created.ok, created.ok ? "" : created.problems.join("; "));
  return created.workspace;
}

const run = (workspace, script, options) => ws.runWorkspaceScript(workspace, script, registry, options);
const live = (workspace) => ws.workspaceInventory(workspace).live;
const liveSmiles = (workspace) => live(workspace).map((lot) => lot.smiles).sort();
const canon = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;
const statuses = (workspace) => workspace.history.map((item) => item.status);

describe("workspace creation and inventory", () => {
  test("each input becomes one lot; the same molecule entered twice is two copies", async () => {
    const workspace = await create("CCO", "CCO", "CC(=O)O");
    assert.equal(live(workspace).length, 3);
    assert.deepEqual(workspace.pool.suppliedCopies, [1, 1, 1]);
    assert.equal(ws.workspaceInventory(workspace).supply.every((item) => item.remaining === 1), true);
  });

  test("an unparsable input is reported and no workspace is created", async () => {
    const created = await ws.createWorkspace(["CCO", "not-a-molecule(("]);
    assert.equal(created.ok, false);
    assert.match(created.problems[0], /could not be parsed/);
  });

  test("a disconnected input stays as separate lots with every component preserved", async () => {
    const workspace = await create("CC(=O)[O-].[Na+]");
    assert.deepEqual(liveSmiles(workspace), ["CC(=O)[O-]", "[Na+]"]);
  });

  test("addMaterial adds a lot and leaves earlier lots and history untouched", async () => {
    const first = await create("CCO");
    const stepped = await run(first, [{ ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] }]);
    const added = await ws.addMaterial(stepped, "CC(=O)O");
    assert.ok(added.ok);
    assert.deepEqual(added.lotIds, ["sm1#1"]);
    assert.equal(added.workspace.history.length, 1);
    assert.deepEqual(liveSmiles(added.workspace), ["CC(=O)O", "CC=O"]);
    // The earlier workspace value is not mutated.
    assert.deepEqual(liveSmiles(stepped), ["CC=O"]);
  });
});

describe("D1: single-material sequential synthesis", () => {
  test("[engine] 1-butene -> 2-butanol -> butanone -> 2-butanol consumes and propagates each intermediate", async () => {
    const start = await create("C=CCC");
    const done = await run(start, [
      { ruleId: "alkene-acid-hydration", reactants: [{ material: 0 }] },
      { ruleId: "secondary-alcohol-oxidation-pcc", reactants: [{ attempt: 1, product: 1 }] },
      { ruleId: "ketone-reduction", reactants: [{ attempt: 2, product: 1 }] },
    ]);
    assert.deepEqual(statuses(done), ["reaction", "reaction", "reaction"]);
    assert.deepEqual(done.history.map((item) => item.outcomes[item.selectedOutcome].productSmiles), ["CCC(C)O", "CCC(C)=O", "CCC(C)O"]);
    assert.deepEqual(done.history.map((item) => item.consumedLotIds), [["sm0#1"], ["s1.1"], ["s2.1"]]);
    assert.deepEqual(liveSmiles(done), ["CCC(C)O"]);
    const inventory = ws.workspaceInventory(done);
    assert.equal(inventory.consumed.length, 3);
    assert.equal(inventory.supply[0].remaining, 0);
  });
});

describe("D2: two-material coupling", () => {
  test("[engine] Fischer esterification consumes both supplied materials", async () => {
    const start = await create("CC(=O)O", "CCO");
    const done = await run(start, [{ ruleId: "fischer-esterification", reactants: [{ material: 1 }, { material: 0 }] }]);
    assert.deepEqual(statuses(done), ["reaction"]);
    assert.deepEqual(done.history[0].consumedLotIds.sort(), ["sm0#1", "sm1#1"]);
    assert.deepEqual(liveSmiles(done), ["CCOC(C)=O"]);
    assert.deepEqual(ws.workspaceInventory(done).supply.map((item) => item.remaining), [0, 0]);
  });

  test("[engine] a second molecule that is not selected is retained untouched", async () => {
    const start = await create("CC(=O)O", "CCO", "CCCCCC");
    const done = await run(start, [{ ruleId: "fischer-esterification", reactants: [{ material: 1 }, { material: 0 }] }]);
    assert.deepEqual(liveSmiles(done), ["CCCCCC", "CCOC(C)=O"]);
    assert.deepEqual(done.history[0].retainedLotIds, ["sm2#1"]);
  });
});

describe("D3 + D4: two transformed branches, convergence, post-convergence modification", () => {
  test("[engine] BuBr -> BuMgBr and BuOH -> butanal join to octan-4-ol, which is then oxidised", async () => {
    const start = await create("CCCCBr", "CCCCO");
    const done = await run(start, [
      { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
      { ruleId: "aldehyde-organometallic-addition", reactants: [{ attempt: 2, product: 1 }, { attempt: 1, product: 1 }] },
      { ruleId: "secondary-alcohol-oxidation-pcc", reactants: [{ attempt: 3, product: 1 }] },
    ]);
    assert.deepEqual(statuses(done), ["reaction", "reaction", "reaction", "reaction"]);
    assert.deepEqual(liveSmiles(done), ["CCCCC(=O)CCC"]);

    const joined = done.history[2];
    assert.deepEqual(joined.consumedLotIds.sort(), ["s1.1", "s2.1"]);
    // Provenance: the octan-4-ol lot descends from both supplied materials; the two branches
    // share no ancestor before the join.
    const nonanol = done.pool.lots.find((lot) => lot.id === "s3.1");
    assert.deepEqual(nonanol.lineage, [0, 1]);
    assert.deepEqual(done.pool.lots.find((lot) => lot.id === "s1.1").lineage, [0]);
    assert.deepEqual(done.pool.lots.find((lot) => lot.id === "s2.1").lineage, [1]);

    const assessed = await ws.assessWorkspace(done, registry);
    assert.equal(assessed.verification.status, "verified", assessed.verification.problems.join(" | "));
    assert.deepEqual(assessed.verification.stepDependencies.map((item) => item.dependsOnSteps), [[], [], [1, 2], [3]]);
    assert.equal(assessed.verification.targetLineage.longestLinearSequence, 3);
  });
});

describe("D5: several catalytic transformations", () => {
  test("[engine] Sonogashira, Lindlar and Pd/C hydrogenation run as separate sequential steps", async () => {
    const start = await create("Ic1ccccc1", "C#CCCCC");
    const done = await run(start, [
      { ruleId: "sonogashira-coupling", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "alkyne-lindlar-reduction-internal", reactants: [{ attempt: 1, product: 1 }] },
      { ruleId: "alkene-hydrogenation", reactants: [{ attempt: 2, product: 1 }] },
    ]);
    assert.deepEqual(statuses(done), ["reaction", "reaction", "reaction"]);
    assert.deepEqual(done.history.map((item) => item.ruleId), ["sonogashira-coupling", "alkyne-lindlar-reduction-internal", "alkene-hydrogenation"]);
    assert.deepEqual(liveSmiles(done), ["CCCCCCc1ccccc1"]);
    const lindlar = done.history[1].outcomes[0].productSmiles;
    assert.match(lindlar, /\/C=C\\/, "Lindlar gives the Z alkene (cis geometry is kept)");
  });
});

describe("D6: competing products and explicit selection", () => {
  test("[engine] radical bromination stops for a choice and consumes nothing until one is made", async () => {
    const start = await create("CC(C)CC");
    const pending = await run(start, [{ ruleId: "alkane-radical-bromination", reactants: [{ material: 0 }] }]);
    assert.deepEqual(statuses(pending), ["needs-selection"]);
    assert.deepEqual(liveSmiles(pending), ["CC(C)CC"]);
    const attempt = pending.history[0];
    assert.equal(attempt.outcomes.length, 4);
    // Only the rule's own numeric estimates produce major / disfavored labels.
    const classes = attempt.outcomes.map((item) => item.selectivityFinding.class);
    assert.equal(classes.filter((item) => item === "major").length, 1);
    assert.ok(classes.every((item) => item === "major" || item === "disfavored"));
    assert.match(attempt.explanation, /selectivity estimate/);

    const chosen = await run(pending, [{ ruleId: "alkane-radical-bromination", reactants: [{ material: 0 }], outcome: 1 }]);
    const reaction = chosen.history[1];
    assert.equal(reaction.status, "reaction");
    assert.equal(reaction.selectedBy, "user");
    assert.equal(reaction.outcomes[reaction.selectedOutcome].selectivityFinding.class, "disfavored");
    assert.deepEqual(liveSmiles(chosen), [reaction.outcomes[1].productSmiles]);
  });

  test("[engine] unranked regioisomers are never called major and need an explicit choice", async () => {
    const start = await create("Brc1ccccc1", "C=CC(=O)OC");
    const pending = await run(start, [{ ruleId: "heck-coupling", reactants: [{ material: 0 }, { material: 1 }] }]);
    assert.deepEqual(statuses(pending), ["needs-selection"]);
    const classes = pending.history[0].outcomes.map((item) => item.selectivityFinding.class);
    assert.deepEqual(classes, ["unranked", "unranked"]);
    assert.match(pending.history[0].explanation, /does not rank them/);
    assert.equal(live(pending).length, 2, "nothing is consumed while the outcome is ambiguous");

    const chosen = await run(pending, [{ ruleId: "heck-coupling", reactants: [{ material: 0 }, { material: 1 }], outcome: 0 }]);
    assert.equal(chosen.history[1].status, "reaction");
    assert.equal(chosen.history[1].outcomes[chosen.history[1].selectedOutcome].selectivityFinding.class, "unranked");
    assert.equal(live(chosen).length, 1);
  });

  test("an out-of-range outcome is rejected without consuming anything", async () => {
    const start = await create("CC(C)CC");
    const result = await run(start, [{ ruleId: "alkane-radical-bromination", reactants: [{ material: 0 }], outcome: 9 }]);
    assert.deepEqual(statuses(result), ["invalid-selection"]);
    assert.deepEqual(liveSmiles(result), ["CC(C)CC"]);
  });

  test("a single offered outcome is committed as the only option, not as a ranked winner", async () => {
    const start = await create("CCO");
    const done = await run(start, [{ ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] }]);
    assert.equal(done.history[0].selectedBy, "only-option");
    assert.equal(done.history[0].outcomes[0].selectivityFinding.class, "single-outcome");
  });

  test("outcomes are bounded by maxOutcomes and the omission is reported", async () => {
    const start = await create("CC(C)CC");
    const result = await run(start, [{ ruleId: "alkane-radical-bromination", reactants: [{ material: 0 }] }], { maxOutcomes: 2 });
    assert.equal(result.history[0].outcomes.length, 2);
    assert.equal(result.history[0].omittedOutcomes, 2);
    assert.equal(result.history[0].status, "needs-selection");
  });
});

describe("D7 + D8: missing partners and failed intermediates", () => {
  test("[engine] a missing structural partner is needs-input and nothing is substituted", async () => {
    const start = await create("CCO");
    const done = await run(start, [
      { ruleId: "fischer-esterification", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ attempt: 1, product: 1 }] },
    ]);
    assert.deepEqual(statuses(done), ["needs-input", "dependency-failed"]);
    assert.ok(done.history[0].missingPartners.length > 0);
    assert.match(done.history[1].explanation, /did not produce a product/);
    assert.deepEqual(liveSmiles(done), ["CCO"], "the starting molecule is untouched and was not reused for the dependent step");
    assert.equal(done.records.length, 0);
    assert.equal(await ws.assessWorkspace(done, registry), null);
  });

  test("[engine] a rule that gives no reaction consumes nothing; dependents do not run", async () => {
    const start = await create("CCCCCC");
    const done = await run(start, [
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] },
      { ruleId: "ketone-reduction", reactants: [{ attempt: 1, product: 1 }] },
    ]);
    assert.deepEqual(statuses(done), ["no-reaction", "dependency-failed"]);
    assert.deepEqual(liveSmiles(done), ["CCCCCC"]);
  });

  test("[engine] an independent branch still runs when an unrelated branch fails", async () => {
    const start = await create("CCCCCC", "CCO");
    const done = await run(start, [
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
      { ruleId: "ketone-reduction", reactants: [{ attempt: 1, product: 1 }] },
    ]);
    assert.deepEqual(statuses(done), ["no-reaction", "reaction", "dependency-failed"]);
    assert.deepEqual(liveSmiles(done), ["CC=O", "CCCCCC"]);
  });

  test("a consumed lot cannot be used a second time", async () => {
    const start = await create("CCO");
    const done = await run(start, [
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] },
    ]);
    assert.deepEqual(statuses(done), ["reaction", "invalid-selection"]);
    assert.match(done.history[1].explanation, /already consumed by step 1/);
  });

  test("an unknown rule and a concept-only rule change nothing", async () => {
    const start = await create("CCO");
    const unknown = await ws.executeWorkspaceStep(start, { ruleId: "no-such-rule", lotIds: ["sm0#1"] }, registry);
    assert.equal(unknown.step.status, "unknown-rule");
    assert.deepEqual(liveSmiles(unknown.workspace), ["CCO"]);
    const conceptual = registry.find((rule) => rule.transform.type === "conceptOnly");
    if (conceptual) {
      const result = await ws.executeWorkspaceStep(start, { ruleId: conceptual.id, lotIds: ["sm0#1"] }, registry);
      assert.equal(result.step.status, "unsupported");
      assert.deepEqual(liveSmiles(result.workspace), ["CCO"]);
    }
  });

  test("duplicate, extra and nonexistent selections are rejected", async () => {
    const start = await create("CCO", "CCO");
    const rule = "primary-alcohol-mild-oxidation";
    const dup = await ws.executeWorkspaceStep(start, { ruleId: rule, lotIds: ["sm0#1", "sm0#1"] }, registry);
    assert.equal(dup.step.status, "invalid-selection");
    const extra = await ws.executeWorkspaceStep(start, { ruleId: rule, lotIds: ["sm0#1", "sm1#1"] }, registry);
    assert.equal(extra.step.status, "invalid-selection");
    const none = await ws.executeWorkspaceStep(start, { ruleId: rule, lotIds: ["sm9#1"] }, registry);
    assert.equal(none.step.status, "invalid-selection");
    const empty = await ws.executeWorkspaceStep(start, { ruleId: rule, lotIds: [] }, registry);
    assert.equal(empty.step.status, "invalid-selection");
  });

  test("[engine] a selected molecule the rule does not use is rejected, not silently dropped", async () => {
    const start = await create("CC(=O)O", "CCO", "CC=O");
    // Fischer uses an acid and an alcohol; selecting the aldehyde as the partner does not give an ester.
    const result = await ws.executeWorkspaceStep(start, { ruleId: "fischer-esterification", lotIds: ["sm1#1", "sm2#1"] }, registry);
    assert.notEqual(result.step.status, "reaction");
    assert.equal(live(result.workspace).length, 3);
  });
});

describe("partner equivalents are supplied copies, never invented", () => {
  test("[engine] an acetal needs two copies of the alcohol", async () => {
    const one = await run(await create("CC=O", "CCO"), [{ ruleId: "aldehyde-acetal-formation", reactants: [{ material: 0 }, { material: 1 }] }]);
    assert.deepEqual(statuses(one), ["needs-input"]);
    assert.match(one.history[0].explanation, /needs 3 structural reactants/);

    const two = await run(await create("CC=O", "CCO", "CCO"), [
      { ruleId: "aldehyde-acetal-formation", reactants: [{ material: 0 }, { material: 1 }, { material: 2 }] },
    ]);
    assert.deepEqual(statuses(two), ["reaction"]);
    assert.deepEqual(liveSmiles(two), ["CCOC(C)OCC"]);
    assert.equal((await ws.assessWorkspace(two, registry)).verification.status, "verified");
  });

  test("[engine] candidateLotSelections offers structural fits only, including copies", async () => {
    const start = await create("CC=O", "CCO", "CCO", "CCCCCC");
    const acetal = registry.find((rule) => rule.id === "aldehyde-acetal-formation");
    const selections = await ws.candidateLotSelections(start, acetal);
    assert.ok(selections.length >= 1);
    for (const selection of selections) {
      assert.equal(selection.length, 3);
      assert.equal(selection[0], "sm0#1");
      assert.ok(!selection.includes("sm3#1"));
    }
    const fischer = registry.find((rule) => rule.id === "fischer-esterification");
    assert.deepEqual(await ws.candidateLotSelections(start, fischer), [], "no carboxylic acid is present");
    const oxidation = registry.find((rule) => rule.id === "primary-alcohol-mild-oxidation");
    const singles = (await ws.candidateLotSelections(start, oxidation)).flat().sort();
    assert.deepEqual(singles, ["sm1#1", "sm2#1"]);
  });
});

describe("D9: molecular identity fidelity", () => {
  test("[engine] SN2 inversion keeps a specified stereocentre", async () => {
    const start = await create("CC[C@H](C)Br");
    const done = await run(start, [{ ruleId: "haloalkane-sn2-hydroxide", reactants: [{ material: 0 }] }]);
    assert.equal(done.history[0].status, "reaction");
    const product = live(done)[0];
    assert.equal(product.hasSpecifiedStereo, true);
    assert.equal(product.canonical, await canon("CC[C@@H](C)O"), "single inversion of (S)-2-bromobutane");
  });

  test("[engine] an isotope label is carried to the product", async () => {
    const done = await run(await create("[13CH3]CO"), [{ ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] }]);
    assert.equal(live(done)[0].canonical, await canon("[13CH3]C=O"));
  });

  test("[engine] an ion pair's components are separate lots; unselected ions stay on the shelf", async () => {
    const done = await run(await create("CC(=O)[O-].[Na+]", "CCO"), [
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 2 }] },
    ]);
    assert.deepEqual(liveSmiles(done), ["CC(=O)[O-]", "CC=O", "[Na+]"]);
  });

  test("a stereoisomer and its enantiomer are distinct lots", async () => {
    const workspace = await create("C[C@H](O)CC", "C[C@@H](O)CC");
    const [first, second] = live(workspace);
    assert.notEqual(first.canonical, second.canonical);
    assert.equal(first.connectivity, second.connectivity);
  });
});

describe("D10: inventory, coproducts and provenance", () => {
  test("[engine] ester reduction gives a primary product and a coproduct lot, both on the shelf", async () => {
    const done = await run(await create("CC(=O)OCC"), [{ ruleId: "ester-lah-reduction", reactants: [{ material: 0 }] }]);
    assert.deepEqual(done.history[0].producedLotIds, ["s1.1", "s1.2"]);
    const lots = done.pool.lots.filter((lot) => lot.provenance.kind === "product");
    assert.deepEqual(lots.map((lot) => lot.role), ["primary", "coproduct"]);
    assert.equal(live(done).length, 2);
    const assessed = await ws.assessWorkspace(done, registry);
    assert.equal(assessed.verification.status, "verified");
    assert.equal(assessed.verification.coproducts.length, 1);
  });

  test("[engine] copies are a count, so using one of two copies leaves the other available", async () => {
    const start = await create("CCO", "CCO");
    const done = await run(start, [{ ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] }]);
    assert.deepEqual(liveSmiles(done), ["CC=O", "CCO"]);
    assert.equal(ws.workspaceInventory(done).supply[1].remaining, 1);
  });

  test("failed attempts are recorded in history but never in the replayed route", async () => {
    const start = await create("CCCCCC", "CCO");
    const done = await run(start, [
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
    ]);
    assert.equal(done.history.length, 2);
    assert.equal(done.records.length, 1);
    const assessed = await ws.assessWorkspace(done, registry);
    assert.equal(assessed.route.steps.length, 1);
    assert.equal(assessed.verification.status, "verified");
    assert.deepEqual(assessed.verification.unusedStartingMaterials, ["CCCCCC"]);
  });
});

describe("verification is a replay, not a rubber stamp", () => {
  test("[engine] pointing a step at the wrong lot fails the replay", async () => {
    const start = await create("CCCCBr", "CCCCO");
    const done = await run(start, [
      { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
    ]);
    const tampered = { ...done, records: done.records.map((record, index) => (index === 1 ? { ...record, reactantLotIds: ["s1.1"] } : record)) };
    const assessed = await ws.assessWorkspace(tampered, registry);
    assert.equal(assessed.verification.status, "failed");
  });

  test("[engine] structure verification is separate from compatibility and selectivity", async () => {
    const done = await run(await create("Ic1ccccc1", "C#CCCCC"), [
      { ruleId: "sonogashira-coupling", reactants: [{ material: 0 }, { material: 1 }] },
    ]);
    const assessed = await ws.assessWorkspace(done, registry);
    assert.equal(assessed.verification.status, "verified");
    // The rule declares no conditions: unassessed, which is not the same as compatible.
    assert.deepEqual(assessed.compatibility.unassessedRuleIds, ["sonogashira-coupling"]);
    assert.equal(done.history[0].compatibility, null);
    assert.equal(assessed.selectivity.counts["single-outcome"], 1);
  });
});

describe("workspace values are immutable", () => {
  test("executing a step returns a new workspace and leaves the input unchanged", async () => {
    const start = await create("CCO");
    const before = JSON.stringify(start);
    await ws.executeWorkspaceStep(start, { ruleId: "primary-alcohol-mild-oxidation", lotIds: ["sm0#1"] }, registry);
    assert.equal(JSON.stringify(start), before);
  });
});

describe("action log and replay", () => {
  test("[engine] replaying the action log rebuilds an identical workspace, failures included", async () => {
    const start = await create("CCCCBr", "CCCCO", "CC(C)CC");
    let current = start;
    current = (await ws.executeWorkspaceStep(current, { ruleId: "haloalkane-grignard-formation-bromide", lotIds: ["sm0#1"] }, registry)).workspace;
    current = (await ws.executeWorkspaceStep(current, { ruleId: "primary-alcohol-mild-oxidation", lotIds: ["sm1#1"] }, registry)).workspace;
    current = (await ws.executeWorkspaceStep(current, { ruleId: "alkane-radical-bromination", lotIds: ["sm2#1"] }, registry)).workspace; // needs-selection
    current = (await ws.executeWorkspaceStep(current, { ruleId: "aldehyde-organometallic-addition", lotIds: ["s2.1", "s1.1"] }, registry)).workspace;
    const added = await ws.addMaterial(current, "CC(=O)O");
    assert.ok(added.ok);
    current = (await ws.executeWorkspaceStep(added.workspace, { ruleId: "fischer-esterification", lotIds: [added.lotIds[0]] }, registry)).workspace; // needs-input

    assert.equal(current.actions.length, 9, "3 materials + 1 added material + 5 step requests (failed and pending ones included)");
    const replayed = await ws.replayActions(current.actions, registry);
    assert.ok(replayed.ok);
    assert.deepEqual(JSON.parse(JSON.stringify(replayed.workspace)), JSON.parse(JSON.stringify(current)));
    assert.deepEqual(statuses(replayed.workspace), ["reaction", "reaction", "needs-selection", "reaction", "needs-input"]);
  });

  test("a script-only dependency failure is not an action, so replay does not invent a request", async () => {
    const done = await run(await create("CCO"), [
      { ruleId: "fischer-esterification", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ attempt: 1, product: 1 }] },
    ]);
    assert.deepEqual(statuses(done), ["needs-input", "dependency-failed"]);
    assert.equal(done.actions.filter((action) => action.kind === "step").length, 1);
  });

  test("replay refuses an action log that does not start with a material", async () => {
    const result = await ws.replayActions([{ kind: "step", request: { ruleId: "x", lotIds: [] } }], registry);
    assert.equal(result.ok, false);
  });
});
