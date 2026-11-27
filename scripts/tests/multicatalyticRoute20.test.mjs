// Stage 20: Multi-Catalytic route overviews for BOTH operating modes, derived from real engine runs (no fabricated results).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let ws, registry, route, seq, utils;
before(async () => {
  const engine = await loadEngine();
  registry = engine.utils.reactionRegistry;
  utils = engine.utils;
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  route = await loadModule("/src/utils/reactions/engine/workspaceRoute.ts");
  seq = await loadModule("/src/utils/reactions/engine/sequenceOverview.ts");
});
after(async () => { await closeEngine(); });

const create = async (...inputs) => { const c = await ws.createWorkspace(inputs); assert.ok(c.ok, c.ok ? "" : c.problems.join("; ")); return c.workspace; };
const run = (w, script) => ws.runWorkspaceScript(w, script, registry);
const CONVERGENT = [
  { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 0 }] },
  { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
  { ruleId: "aldehyde-organometallic-addition", reactants: [{ attempt: 2, product: 1 }, { attempt: 1, product: 1 }] },
  { ruleId: "secondary-alcohol-oxidation-pcc", reactants: [{ attempt: 3, product: 1 }] },
];

describe("workspace mode: objective and route overview", () => {
  test("an empty workspace reports nothing invented", async () => {
    const w = await create("CCO");
    const o = route.buildWorkspaceOverview(w);
    assert.equal(o.status, "no-steps");
    assert.equal(o.supplied.length, 1); assert.equal(o.steps.length, 0); assert.equal(o.branches.length, 0);
    assert.deepEqual(o.endProducts, []); assert.deepEqual(o.unused, o.supplied);
    assert.equal(o.attempts, 0);
  });
  test("a linear one-step route", async () => {
    const w = await run(await create("CCO"), [{ ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] }]);
    const o = route.buildWorkspaceOverview(w);
    assert.equal(o.status, "in-progress");
    assert.equal(o.steps.length, 1); assert.equal(o.branches.length, 1);
    assert.equal(o.steps[0].join, false);
    assert.deepEqual(o.endProducts.map((id) => o.lots[id].smiles), ["CC=O"]);
    assert.equal(o.lots[o.steps[0].inputs[0]].smiles, "CCO");
    assert.equal(o.branches[0].join, false);
  });
  test("two transformed branches that have not met stay two branches; the join merges them into one and is reported as a join", async () => {
    const start = await create("CCCCBr", "CCCCO");
    const apart = route.buildWorkspaceOverview(await run(start, CONVERGENT.slice(0, 2)));
    assert.equal(apart.branches.length, 2, "two independent branches before the join");
    assert.ok(apart.steps.every((s) => !s.join));
    const done = await run(start, CONVERGENT);
    const o = route.buildWorkspaceOverview(done);
    assert.equal(o.steps.length, 4);
    assert.equal(o.branches.length, 1, "after the join the lineage is one connected branch");
    assert.equal(o.branches[0].join, true);
    assert.deepEqual(o.steps.map((s) => s.join), [false, false, true, false], "only the aldehyde + organometallic addition joins branches");
    assert.equal(o.steps[2].inputs.length, 2);
    assert.deepEqual(o.endProducts.map((id) => o.lots[id].smiles), ["CCCCC(=O)CCC"]);
    assert.deepEqual(o.unused, []);
    assert.equal(o.reagents.length, 4);
  });
  test("the route's step connectivity equals the engine's own history (no step invented or dropped)", async () => {
    const done = await run(await create("CCCCBr", "CCCCO"), CONVERGENT);
    const o = route.buildWorkspaceOverview(done);
    for (const h of done.history) {
      const r = o.steps.find((s) => s.step === h.committedStep);
      assert.ok(r, `step ${h.committedStep}`);
      assert.deepEqual([...r.inputs].sort(), [...h.consumedLotIds].sort());
      assert.deepEqual([...r.products, ...r.coproducts].sort(), [...h.producedLotIds].sort());
    }
  });
  test("a coproduct is reported as a coproduct, not as the main product", async () => {
    const w = await run(await create("COC(C)=O"), [{ ruleId: "ester-lah-reduction", reactants: [{ material: 0 }] }]);
    const o = route.buildWorkspaceOverview(w);
    assert.equal(o.steps[0].products.length, 1);
    assert.equal(o.steps[0].coproducts.length, 1);
    assert.equal(o.liveCoproducts.length, 1);
    assert.equal(o.endProducts.length, 1);
    assert.notEqual(o.steps[0].products[0], o.steps[0].coproducts[0]);
  });
  test("unused starting material and an attempt that gave no product are reported separately", async () => {
    const start = await create("CCO", "CC=C");
    const result = await ws.executeWorkspaceStep(start, { ruleId: "alkene-hydrogenation", lotIds: ["sm0#1"] }, registry);
    const afterBad = result.workspace ?? start;
    const o1 = route.buildWorkspaceOverview(afterBad);
    assert.equal(o1.steps.length, 0, "a failed attempt commits no step");
    assert.ok(o1.unresolved.length >= 1, JSON.stringify(Object.keys(result)));
    const good = await run(start, [{ ruleId: "alkene-hydrogenation", reactants: [{ material: 1 }] }]);
    const o2 = route.buildWorkspaceOverview(good);
    assert.equal(o2.unused.length, 1);
    assert.equal(o2.lots[o2.unused[0]].smiles, "CCO");
  });
});

describe("ordered-sequence mode: overview of engine branches", () => {
  const sequence = (smiles, ids, limit = 12) => utils.runSequentialSynthesisDetailed(smiles, ids, registry, { branchLimit: limit });
  test("no run gives an empty overview", () => {
    const o = seq.buildSequenceOverview("C=CC", []);
    assert.equal(o.status, "no-run"); assert.deepEqual(o.branches, []); assert.equal(o.distinctEndStates, 0);
  });
  test("a one-condition run keeps the engine's branches, in the engine's order, with identities intact", async () => {
    const { branches } = await sequence("C=CC", ["alkene-hx-addition-hbr"]);
    assert.ok(branches.length >= 1);
    const o = seq.buildSequenceOverview("C=CC", branches);
    assert.equal(o.branches.length, branches.length);
    assert.deepEqual(o.branches.map((b) => b.finalSmiles), branches.map((b) => b.finalSmiles));
    assert.deepEqual(o.branches.map((b) => b.id), branches.map((b) => b.id));
    assert.equal(o.status, branches.length === 1 ? "single-outcome" : "alternatives");
    assert.equal(o.conditions.length, 1);
    assert.equal(o.distinctEndStates, new Set(branches.map((b) => b.finalSmiles)).size);
  });
  test("a two-condition run lists every step per branch and marks the unresolved one", async () => {
    const { branches } = await sequence("C=CC", ["alkene-hydrogenation", "alkene-hx-addition-hbr"]);
    const o = seq.buildSequenceOverview("C=CC", branches);
    assert.equal(o.conditions.length, 2);
    const b = o.branches[0];
    assert.equal(b.steps.length, 2);
    assert.equal(b.steps[0].status, "reaction");
    assert.notEqual(b.steps[1].status, "reaction", "HBr addition to propane has no alkene to react with");
    assert.equal(b.firstUnresolved, 2);
    assert.equal(b.allReacted, false);
    assert.equal(o.withUnresolved, 1);
    assert.equal(b.reactionSteps, 1);
  });
  test("a fully reacting sequence is reported as fully reacted", async () => {
    const { branches } = await sequence("CCO", ["primary-alcohol-mild-oxidation"]);
    const o = seq.buildSequenceOverview("CCO", branches);
    assert.equal(o.fullyReacted, o.branches.length);
    assert.ok(o.branches.every((b) => b.allReacted && b.firstUnresolved === null));
  });
  test("the engine's ranking basis is passed through, not replaced", async () => {
    const { branches } = await sequence("C=CC", ["alkene-hx-addition-hbr"]);
    const o = seq.buildSequenceOverview("C=CC", branches);
    for (let i = 0; i < branches.length; i += 1) assert.equal(o.branches[i].rankingBasis, branches[i].ranking.basis);
  });
});
