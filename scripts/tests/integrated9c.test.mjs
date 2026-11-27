// Stage 9C: the fully integrated catalytic synthesis on real rules. Provisional chemistry: structure
// replay and the rule model are checked here, not experimental feasibility.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let registry;
let ws;
let cat;
let mc;
let stereo;
let workspace;
let assessed;

const canon = async (s) => (await stereo.canonicalizeStereoStructure(s)).isomeric;

before(async () => {
  const engine = await loadEngine();
  registry = engine.utils.reactionRegistry;
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  cat = await loadModule("/src/utils/reactions/engine/workspaceCatalysis.ts");
  mc = await loadModule("/src/utils/persistence/multicatalyticWorkspace.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  const created = await ws.createWorkspace(["OC(=O)c1ccc(Br)cc1", "CO", "C#CC(=O)OC"]);
  workspace = await ws.runWorkspaceScript(created.workspace, [
    { ruleId: "fischer-esterification", reactants: [{ material: 0 }, { material: 1 }] },
    { ruleId: "alkyne-lindlar-reduction-terminal", reactants: [{ material: 2 }] },
    { ruleId: "heck-coupling", reactants: [{ attempt: 1, product: 1 }, { attempt: 2, product: 1 }] }, // stops for a choice
    { ruleId: "heck-coupling", reactants: [{ attempt: 1, product: 1 }, { attempt: 2, product: 1 }], outcome: 0 },
    { ruleId: "alkene-hydrogenation", reactants: [{ attempt: 4, product: 1 }] },
  ], registry);
  assessed = await ws.assessWorkspace(workspace, registry);
});

after(async () => {
  await closeEngine();
});

describe("integrated synthesis: two catalytic branches, Heck join, Pd/C hydrogenation", () => {
  test("[engine] the join stops for a choice (major and minor offered) before anything is consumed", () => {
    const pending = workspace.history[2];
    assert.equal(pending.status, "needs-selection");
    assert.deepEqual(pending.outcomes.map((item) => item.selectivityFinding.class), ["major", "disfavored"]);
    assert.deepEqual(pending.consumedLotIds, []);
    assert.equal(workspace.history[3].selectedBy, "user");
  });

  test("[engine] every intermediate is the expected structure, with E geometry on the coupled alkene", async () => {
    const product = (committed) => {
      const step = workspace.history.find((item) => item.committedStep === committed);
      return step.outcomes[step.selectedOutcome].productSmiles;
    };
    assert.equal(await canon(product(1)), await canon("COC(=O)c1ccc(Br)cc1"));
    assert.equal(await canon(product(2)), await canon("C=CC(=O)OC"));
    assert.equal(await canon(product(3)), await canon("COC(=O)/C=C/c1ccc(C(=O)OC)cc1"));
    assert.equal(await canon(product(4)), await canon("COC(=O)CCc1ccc(C(=O)OC)cc1"));
  });

  test("[engine] provenance: the final molecule descends from all three starting materials; branches share no ancestor before the join", () => {
    const final = workspace.pool.lots.find((lot) => lot.availability === "live");
    assert.deepEqual(final.lineage, [0, 1, 2]);
    const branchA = workspace.pool.lots.find((lot) => lot.id === "s1.1");
    const branchB = workspace.pool.lots.find((lot) => lot.id === "s2.1");
    assert.deepEqual(branchA.lineage, [0, 1]);
    assert.deepEqual(branchB.lineage, [2]);
    assert.equal(ws.workspaceInventory(workspace).live.length, 1);
    assert.deepEqual(ws.workspaceInventory(workspace).supply.map((item) => item.remaining), [0, 0, 0]);
  });

  test("[engine] structure replay is verified; dependencies show two independent branches then a join", () => {
    assert.equal(assessed.verification.status, "verified", assessed.verification.problems.join(" | "));
    assert.deepEqual(assessed.verification.stepDependencies.map((item) => item.dependsOnSteps), [[], [], [1, 2], [3]]);
  });

  test("[engine] four distinct catalyst systems, with the Heck palladium reported as type-only", () => {
    const result = cat.assessWorkspaceCatalysis(workspace, registry);
    assert.deepEqual(result.catalyticStepNumbers, [1, 2, 3, 4]);
    assert.equal(result.distinctCatalystSystems.length, 4);
    assert.deepEqual(result.genericCatalystStepNumbers, [3]);
    assert.deepEqual(result.claims, { tandem: false, cooperative: false });
    assert.equal(result.boundaries.length, 3, "1>3, 2>3, 3>4");
  });

  test("[engine] condition assessment is conservative: no pair is compatible, no cross-step conflict is reported", () => {
    const result = cat.assessWorkspaceCatalysis(workspace, registry);
    assert.ok(result.combinations.every((pair) => pair.category === "incomplete" || pair.category === "unassessed"));
    assert.ok(result.boundaries.every((boundary) => boundary.asRun === "isolated"));
    assert.equal(assessed.compatibility.warnings.length, 0);
  });

  test("[engine] the whole workspace survives validation as saved data and replays from its action log", async () => {
    const snapshot = JSON.parse(JSON.stringify(workspace));
    assert.ok(mc.validateWorkspaceSnapshot(snapshot));
    const replayed = await ws.replayActions(workspace.actions, registry);
    assert.ok(replayed.ok);
    assert.deepEqual(JSON.parse(JSON.stringify(replayed.workspace)), snapshot);
  });
});
