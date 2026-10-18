// Phase 4 / Stage 2: species-pool state model. Pure state logic; the engine is
// used only to canonicalize structures and to build real-step fixtures.
// No planner search runs here.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { fixtureById } from "./fixtures/convergentFixtures.mjs";
import { driveFixtureThroughPool, modules, poolSpecies } from "./fixtures/convergentHelpers.mjs";

let pool;
let utils;
let registry;

before(async () => {
  ({ utils, registry } = await modules());
  pool = await loadModule("/src/utils/reactions/engine/speciesPool.ts");
});

after(async () => {
  await closeEngine();
});

const species = (list) => Promise.all(list.map(poolSpecies));

/** Applies a synthetic step (the rule id is only a label for pool logic). */
async function apply(state, consumedLotIds, productSmiles, extra = {}) {
  const products = await Promise.all(
    productSmiles.map(async (smiles, index) => ({
      ...(await poolSpecies(smiles)),
      role: index === 0 ? "primary" : "coproduct",
    })),
  );
  const result = pool.applyStep(state, { ruleId: "synthetic", consumedLotIds, products, ...extra });
  assert.ok(result.ok, result.detail);
  return result.state;
}

describe("pool construction and inventory", () => {
  test("[engine] every supplied copy is its own live lot with a stable id and lineage", async () => {
    const state = pool.createPoolState(await species(["CCO", "CC(C)=O"]), [2, 1]);
    assert.deepEqual(state.lots.map((lot) => lot.id), ["sm0#1", "sm0#2", "sm1#1"]);
    assert.deepEqual(state.lots.map((lot) => lot.lineage), [[0], [0], [1]]);
    assert.ok(state.lots.every((lot) => lot.availability === "live" && lot.role === "supplied"));
    assert.deepEqual(pool.supplyAccounts(state).map((a) => [a.total, a.remaining, a.consumed]), [[2, 2, 0], [1, 1, 0]]);
  });

  test("[engine] nonsense copy counts fall back to one copy", async () => {
    for (const copies of [0, -1, 2.5, Number.NaN, undefined]) {
      const state = pool.createPoolState(await species(["CCO"]), copies);
      assert.equal(state.lots.length, 1);
    }
  });

  test("[engine] consuming a lot spends exactly one copy", async () => {
    let state = pool.createPoolState(await species(["CCO"]), 2);
    state = await apply(state, ["sm0#1"], ["CC=O"]);
    const [account] = pool.supplyAccounts(state);
    assert.deepEqual([account.remaining, account.consumed], [1, 1]);
    assert.equal(pool.lotById(state, "sm0#1").consumedByStep, 1);
    assert.equal(pool.lotById(state, "sm0#2").availability, "live");
  });
});

describe("step application rules", () => {
  test("[engine] a step produces new lots with unioned lineage and deterministic ids", async () => {
    let state = pool.createPoolState(await species(["CC(C)O", "CCC(=O)O"]));
    state = await apply(state, ["sm0#1", "sm1#1"], ["CCC(=O)OC(C)C"], { cost: 3 });
    const product = pool.lotById(state, "s1.1");
    assert.deepEqual(product.lineage, [0, 1]);
    assert.equal(product.provenance.kind, "product");
    assert.deepEqual(product.provenance.consumedLotIds, ["sm0#1", "sm1#1"]);
    assert.equal(state.pathCost, 3);
    assert.deepEqual(state.steps[0].producedLotIds, ["s1.1"]);
  });

  test("[engine] invalid steps are refused and never mutate the state", async () => {
    const start = pool.createPoolState(await species(["CCO"]));
    const product = [await poolSpecies("CC=O")];
    const apply1 = (ids, products = product) =>
      pool.applyStep(start, { ruleId: "x", consumedLotIds: ids, products });
    assert.equal(apply1([]).reason, "no-reactants");
    assert.equal(apply1(["sm0#1"], []).reason, "no-products");
    assert.equal(apply1(["nope"]).reason, "unknown-lot");
    assert.equal(apply1(["sm0#1", "sm0#1"]).reason, "duplicate-lot");
    const used = await apply(start, ["sm0#1"], ["CC=O"]);
    const reuse = pool.applyStep(used, { ruleId: "x", consumedLotIds: ["sm0#1"], products: product });
    assert.equal(reuse.reason, "lot-not-live");
    assert.match(reuse.detail, /already consumed by step 1/);
    assert.equal(start.lots.length, 1);
    assert.equal(start.steps.length, 0);
  });

  test("[engine] spectators are untouched by a step", async () => {
    const start = pool.createPoolState(await species(["CCO", "CCCC", "CC(C)=O"]));
    const before = start.lots.find((lot) => lot.id === "sm1#1");
    const after = await apply(start, ["sm0#1"], ["CC=O"]);
    for (const id of ["sm1#1", "sm2#1"]) {
      assert.deepEqual(pool.lotById(after, id), start.lots.find((lot) => lot.id === id));
    }
    assert.equal(pool.lotById(after, "sm1#1"), before);
  });
});

describe("coproducts keep availability and provenance", () => {
  test("[engine] both products of an ester reduction stay live, with roles and lineage", async () => {
    let state = pool.createPoolState(await species(["CCC(=O)OC(C)C"]));
    state = await apply(state, ["sm0#1"], ["CCCO", "CC(C)O"]);
    const [primary, coproduct] = [pool.lotById(state, "s1.1"), pool.lotById(state, "s1.2")];
    assert.deepEqual([primary.role, coproduct.role], ["primary", "coproduct"]);
    assert.deepEqual([primary.availability, coproduct.availability], ["live", "live"]);
    assert.deepEqual(coproduct.lineage, [0]);
    assert.equal(coproduct.provenance.ruleId, "synthetic");
  });

  test("[engine] a coproduct is not discarded for being small: methanol is a live lot and can be consumed", async () => {
    let state = pool.createPoolState(await species(["CC(=O)OC"]));
    state = await apply(state, ["sm0#1"], ["CCO", "CO"]);
    const methanol = state.lots.find((lot) => lot.canonical === "CO");
    assert.equal(methanol.availability, "live");
    const next = await apply(state, [methanol.id], ["C=O"]);
    assert.equal(pool.lotById(next, methanol.id).availability, "consumed");
  });

  test("[engine] budgets shelve by the caller's score, never by molecular size", async () => {
    let state = pool.createPoolState(await species(["CC(=O)OC", "CCCC(=O)OC(C)CC"]));
    state = await apply(state, ["sm0#1"], ["CCO", "CO"]);
    state = await apply(state, ["sm1#1"], ["CCCCO", "CCC(C)O"]);
    const live = () => pool.liveLots(state).filter((lot) => lot.role === "coproduct");
    assert.equal(live().length, 2);

    // Keep the SMALL coproduct (methanol) and shelve the larger one.
    const kept = pool.enforceBudget(state, { maxLiveCoproducts: 1 }, (lot) => (lot.canonical === "CO" ? 10 : 0));
    assert.deepEqual(kept.shelvedLotIds, ["s2.2"]);
    // Keep the LARGE one instead: size plays no role.
    const flipped = pool.enforceBudget(state, { maxLiveCoproducts: 1 }, (lot) => (lot.canonical === "CO" ? 0 : 10));
    assert.deepEqual(flipped.shelvedLotIds, ["s1.2"]);
  });

  test("[engine] a shelved lot stays present, stays in the key, and cannot be consumed", async () => {
    let state = pool.createPoolState(await species(["CC(=O)OC"]));
    state = await apply(state, ["sm0#1"], ["CCO", "CO"]);
    const { state: shelved, shelvedLotIds } = pool.enforceBudget(state, { maxLiveCoproducts: 0 });
    assert.deepEqual(shelvedLotIds, ["s1.2"]);
    assert.equal(pool.presentLots(shelved).length, 2);
    assert.notEqual(pool.stateKey(shelved), pool.stateKey(state), "shelving changes what is possible");
    const refused = pool.applyStep(shelved, {
      ruleId: "x",
      consumedLotIds: ["s1.2"],
      products: [await poolSpecies("C=O")],
    });
    assert.equal(refused.reason, "lot-not-live");
  });

  test("[engine] supplied lots are never shelved, so inventory cannot change silently", async () => {
    const state = pool.createPoolState(await species(["CCO", "CCCC"]));
    const result = pool.enforceBudget(state, { maxLiveLots: 0, maxLiveCoproducts: 0 });
    assert.deepEqual(result.shelvedLotIds, []);
    assert.equal(pool.liveLots(result.state).length, 2);
  });

  test("[engine] without a budget nothing is shelved", async () => {
    let state = pool.createPoolState(await species(["CC(=O)OC"]));
    state = await apply(state, ["sm0#1"], ["CCO", "CO"]);
    assert.deepEqual(pool.enforceBudget(state, {}).shelvedLotIds, []);
  });
});

describe("state identity", () => {
  test("[engine] independent branches in either order give one state (order independence)", async () => {
    const start = pool.createPoolState(await species(["CCC=O", "CC(C)=O"]));
    const acidFirst = await apply(await apply(start, ["sm0#1"], ["CCC(=O)O"]), ["sm1#1"], ["CC(C)O"]);
    const alcoholFirst = await apply(await apply(start, ["sm1#1"], ["CC(C)O"]), ["sm0#1"], ["CCC(=O)O"]);
    assert.equal(pool.stateKey(acidFirst), pool.stateKey(alcoholFirst));
    assert.equal(pool.stateKey(acidFirst, "history"), pool.stateKey(alcoholFirst, "history"));
    // The bookkeeping differs even though the states are equivalent: that is the point of the key.
    assert.notDeepEqual(acidFirst.steps.map((s) => s.consumedLotIds), alcoholFirst.steps.map((s) => s.consumedLotIds));

    const joined = [acidFirst, alcoholFirst];
    const keys = [];
    for (const state of joined) {
      const acid = state.lots.find((lot) => lot.canonical === "CCC(=O)O");
      const alcohol = state.lots.find((lot) => lot.canonical === "CC(C)O");
      keys.push(pool.stateKey(await apply(state, [alcohol.id, acid.id], ["CCC(=O)OC(C)C"])));
    }
    assert.equal(keys[0], keys[1]);
  });

  test("[engine] the order of the supplied materials does not change the key", async () => {
    const a = pool.createPoolState(await species(["CCC=O", "CC(C)=O"]));
    const b = pool.createPoolState(await species(["CC(C)=O", "CCC=O"]));
    assert.equal(pool.stateKey(a), pool.stateKey(b));
  });

  test("[engine] using a different equivalent copy gives the same state", async () => {
    const start = pool.createPoolState(await species(["CCO"]), 2);
    const first = await apply(start, ["sm0#1"], ["CC=O"]);
    const second = await apply(start, ["sm0#2"], ["CC=O"]);
    assert.equal(pool.stateKey(first), pool.stateKey(second));
  });

  test("[engine] remaining inventory distinguishes states with the same product", async () => {
    // One copy used vs two copies used, both leaving an acetaldehyde: not equivalent.
    const start = pool.createPoolState(await species(["CCO"]), 2);
    const one = await apply(start, ["sm0#1"], ["CC=O"]);
    const both = await apply(await apply(start, ["sm0#1"], ["CC=O"]), ["sm0#2"], ["CC=O"]);
    assert.notEqual(pool.stateKey(one), pool.stateKey(both));
    const reduced = pool.createPoolState(await species(["CCO"]), 1);
    assert.notEqual(pool.stateKey(await apply(reduced, ["sm0#1"], ["CC=O"])), pool.stateKey(one));
  });

  test("[engine] an untouched spectator distinguishes otherwise equal states", async () => {
    const withSpectator = pool.createPoolState(await species(["CCO", "CCCC"]));
    const without = pool.createPoolState(await species(["CCO"]));
    assert.notEqual(pool.stateKey(withSpectator), pool.stateKey(without));
  });

  test("[engine] a mixture member and a pure compound of the same structure are different states", async () => {
    const start = pool.createPoolState(await species(["C/C=C/C"]));
    const racemic = await apply(start, ["sm0#1"], ["C[C@@H](O)[C@@H](C)O"], {
      stepMixture: { kind: "racemic", memberSmiles: ["C[C@H](O)[C@H](C)O", "C[C@@H](O)[C@@H](C)O"] },
    });
    const pure = await apply(start, ["sm0#1"], ["C[C@@H](O)[C@@H](C)O"]);
    assert.notEqual(pool.stateKey(racemic), pool.stateKey(pure));
    assert.equal(pool.lotById(racemic, "s1.1").stereoMixture, "racemic");
    assert.equal(pool.lotById(pure, "s1.1").stereoMixture, null);
  });

  test("[engine] mixtures with different known members are different states", async () => {
    const start = pool.createPoolState(await species(["C/C=C/C"]));
    const make = (members) =>
      apply(start, ["sm0#1"], ["C[C@@H](O)[C@@H](C)O"], { stepMixture: { kind: "racemic", memberSmiles: members } });
    const a = await make(["C[C@H](O)[C@H](C)O", "C[C@@H](O)[C@@H](C)O"]);
    const b = await make(["C[C@@H](O)[C@@H](C)O"]);
    assert.notEqual(pool.stateKey(a), pool.stateKey(b));
  });

  test("[engine] equal futures with different material histories merge by default and separate in history mode", async () => {
    // X: 2-propanol made from acetone, plus the supplied 2-propanol.
    const x = await apply(pool.createPoolState(await species(["CC(C)=O", "CC(C)O"])), ["sm0#1"], ["CC(C)O"]);
    // Z: two supplied 2-propanols.
    const z = pool.createPoolState(await species(["CC(C)O", "CC(C)O"]));
    assert.equal(pool.stateKey(x), pool.stateKey(z));
    assert.notEqual(pool.stateKey(x, "history"), pool.stateKey(z, "history"));
  });

  test("[engine] consumed lots do not appear in the key", async () => {
    const start = pool.createPoolState(await species(["CCO"]));
    const done = await apply(start, ["sm0#1"], ["CC=O"]);
    assert.equal(pool.stateKey(done), (await pool.stateKey(pool.createPoolState(await species(["CC=O"])))));
  });
});

describe("mixture propagation", () => {
  const lot = (stereoMixture) => ({ stereoMixture });
  const withStereo = { hasSpecifiedStereo: true };

  test("[engine] pure parents give a pure product", () => {
    assert.deepEqual(pool.inheritedMixture([lot(null), lot(null)], withStereo, null), { kind: null, members: null });
  });

  test("[engine] a racemic parent makes a stereoisomeric (not enantiopure) product", () => {
    assert.equal(pool.inheritedMixture([lot("racemic"), lot(null)], withStereo, null).kind, "stereoisomeric");
    assert.equal(pool.inheritedMixture([lot("diastereomeric")], withStereo, null).kind, "diastereomeric");
  });

  test("[engine] two mixture parents can only be called stereoisomeric", () => {
    assert.equal(pool.inheritedMixture([lot("racemic"), lot("racemic")], withStereo, null).kind, "stereoisomeric");
  });

  test("[engine] the mixture a rule reports for its own products wins", () => {
    const stepMixture = { kind: "racemic", memberSmiles: ["a", "b"] };
    assert.deepEqual(pool.inheritedMixture([lot(null)], withStereo, stepMixture), { kind: "racemic", members: ["a", "b"] });
  });

  test("[engine] a product that loses all specified stereo is no longer a mixture", () => {
    assert.deepEqual(pool.inheritedMixture([lot("racemic")], { hasSpecifiedStereo: false }, null), { kind: null, members: null });
  });
});

describe("ancestry and verifier agreement", () => {
  test("[engine] lotAncestry follows consumption back to supplied lots", async () => {
    const run = await driveFixtureThroughPool(fixtureById("fischer-isopropyl-propanoate"), pool);
    assert.equal(run.failed, null);
    assert.deepEqual(pool.lotAncestry(run.state, "s3.1"), { stepNumbers: [1, 2, 3], suppliedLotIds: ["sm0#1", "sm1#1"] });
    assert.deepEqual(pool.lotAncestry(run.state, "s1.1"), { stepNumbers: [1], suppliedLotIds: ["sm1#1"] });
  });

  for (const id of [
    "fischer-isopropyl-propanoate",
    "williamson-cyclohexyl-propyl-ether",
    "grignard-2-butanol-from-ethanol",
    "ester-reduction-coproduct",
    "racemic-diol-coupling",
  ]) {
    test(`[engine] ${id}: lot ids from the pool are accepted by the route verifier and agree with its bookkeeping`, async () => {
      const fixture = fixtureById(id);
      const run = await driveFixtureThroughPool(fixture, pool);
      assert.equal(run.failed, null, JSON.stringify(run.failed));

      const route = {
        id,
        startingSmiles: fixture.supplied.join("."),
        targetSmiles: fixture.target,
        steps: run.steps,
        confidence: "verified",
        score: 0,
      };
      const verified = await utils.verifyMultistepRoute(route, registry, { startingMaterialCopies: fixture.copies });
      assert.notEqual(verified.status, "failed", verified.problems.join(" | "));

      // Same inventory accounting.
      assert.deepEqual(
        verified.inventory.map((entry) => entry.consumed),
        pool.supplyAccounts(run.state).map((account) => account.consumed),
      );
      // Same species left on the shelf, with the same ids and lineage.
      const fromPool = pool.presentLots(run.state).map((lot) => [lot.id, lot.canonical, lot.lineage]).sort();
      const fromVerifier = verified.leftovers.map((lot) => lot.lotId).sort();
      assert.deepEqual(fromPool.map((entry) => entry[0]).sort(), fromVerifier);
      for (const leftover of verified.leftovers) {
        assert.deepEqual(leftover.lineage, pool.lotById(run.state, leftover.lotId).lineage, leftover.lotId);
        assert.equal(leftover.fromMixture, pool.lotById(run.state, leftover.lotId).stereoMixture !== null, leftover.lotId);
      }
    });
  }

  test("[engine] the pool refuses the single-copy Grignard route at the step the verifier rejects", async () => {
    const fixture = fixtureById("grignard-2-butanol-from-ethanol");
    const run = await driveFixtureThroughPool(fixture, pool, [1]);
    assert.equal(run.failed.ruleId, "alcohol-hbr-substitution-primary");
  });
});
