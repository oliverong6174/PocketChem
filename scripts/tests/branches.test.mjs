// Branch-preservation tests for Multi-Catalytic (sequential) synthesis:
// spectators/coproducts, ranking before pruning, truncation reporting, shared
// racemate slots and selectivity carry-forward. Real engines, nothing mocked.
//
// Labels: [confirmed] textbook-level, [heuristic] PocketChem's rule model,
// [engine] bookkeeping/invariants, [known-gap] expected chemistry not yet modeled.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine } from "./engine.mjs";

let utils;
let rdkit;
let registry;

before(async () => {
  ({ utils } = await loadEngine());
  rdkit = await getRdkit();
  registry = utils.reactionRegistry;
});

after(async () => {
  await closeEngine();
});

function detailed(smiles, ruleIds, branchLimit = 12) {
  return utils.runSequentialSynthesisDetailed(smiles, ruleIds, registry, { branchLimit });
}

/** Order-independent canonical multiset of components. */
function state(smiles) {
  return smiles
    .split(".")
    .map((part) => {
      const mol = rdkit.get_mol(part);
      assert.ok(mol, `RDKit could not parse ${part}`);
      const out = mol.get_smiles();
      mol.delete();
      return out;
    })
    .sort()
    .join(".");
}

describe("spectators and coproducts", () => {
  test("[engine] an unreacting component survives a single-component transformation", async () => {
    // The page starts from one molecule, but the engine API accepts a mixture.
    const { branches } = await detailed("C=CC.CCCCO", ["alkene-hx-addition-hbr"]);
    assert.equal(branches.length, 1);
    assert.equal(state(branches[0].finalSmiles), state("CC(C)Br.CCCCO"));
    assert.deepEqual(branches[0].steps[0].spectators, ["CCCCO"]);
  });

  test("[engine] spectator tracking does not depend on component order", async () => {
    const a = await detailed("C=CC.CCCCO", ["alkene-hx-addition-hbr"]);
    const b = await detailed("CCCCO.C=CC", ["alkene-hx-addition-hbr"]);
    assert.equal(state(a.branches[0].finalSmiles), state(b.branches[0].finalSmiles));
  });

  test("[confirmed] coproducts of ester reduction are both kept in the carried state", async () => {
    const { branches } = await detailed("COC(C)=O", ["ester-lah-reduction"]);
    assert.equal(branches.length, 1);
    assert.equal(state(branches[0].finalSmiles), state("CCO.CO"));
    assert.equal(branches[0].steps[0].productComponents.length, 2);
  });

  test("[engine] a coproduct left unchanged by the next step is carried forward, not discarded", async () => {
    const { branches } = await detailed("COC(C)=O", [
      "ester-lah-reduction",
      "primary-alcohol-mild-oxidation",
    ]);
    assert.ok(branches.length >= 1);
    for (const branch of branches) {
      const second = branch.steps[1];
      assert.equal(second.status, "reaction");
      // Whatever component did not react must still be in the final state.
      assert.ok(second.spectators.length >= 1, "an unreacted ester-reduction coproduct must remain");
      for (const spectator of second.spectators) {
        assert.ok(
          branch.finalSmiles.split(".").map((part) => state(part)).includes(state(spectator)),
          `${spectator} was dropped from ${branch.finalSmiles}`,
        );
      }
    }
  });

  test("[engine] identical components do not create duplicate outcomes (state identity)", async () => {
    const { branches } = await detailed("C=CC.C=CC", ["alkene-hx-addition-hbr"]);
    assert.equal(branches.length, 1);
  });

  test("[known-gap] two equally reactive components should both react under excess reagent", { todo: true }, async () => {
    const { branches } = await detailed("C=CC.C=CCC", ["alkene-hx-addition-hbr"]);
    assert.ok(branches.some((b) => state(b.finalSmiles) === state("CC(C)Br.CCC(C)Br")));
  });
});

describe("ranking and truncation", () => {
  const RADICAL = ["alkane-radical-bromination"];

  test("[engine] without a limit nothing is excluded and every outcome has a rank basis", async () => {
    const report = await detailed("CC(C)CC", RADICAL, 12);
    assert.equal(report.exclusions.length, 0);
    assert.equal(report.branches.length, 4);
    assert.ok(report.branches.every((b) => b.ranking.basis === "heuristic-selectivity-estimate"));
  });

  test("[heuristic] the branch limit removes the lowest-ranked outcomes, not the latest ones", async () => {
    const limited = await detailed("CC(C)CC", RADICAL, 2);
    assert.equal(limited.branches.length, 2);
    const keptFractions = limited.branches.map((b) => b.ranking.cumulativeFraction);
    const excludedLabels = limited.exclusions.map((e) => e.selectivityLabel).join(" ");
    assert.ok(keptFractions.every((f) => f > 0.05), `kept ${keptFractions}`);
    assert.match(excludedLabels, /Trace/);
    assert.equal(limited.exclusions.length, 2);
    // The best-supported outcome (tertiary bromide) is retained and listed first.
    assert.equal(state(limited.branches[0].finalSmiles), state("CCC(C)(C)Br"));
  });

  test("[engine] truncation is fully accounted for: kept + excluded equals the untruncated count", async () => {
    const full = await detailed("CC(C)CC", RADICAL, 12);
    for (const limit of [1, 2, 3]) {
      const limited = await detailed("CC(C)CC", RADICAL, limit);
      assert.equal(limited.branches.length + limited.exclusions.length, full.branches.length);
      assert.ok(limited.exclusions.every((e) => e.reason === "branch-limit"));
      const keptStates = new Set(limited.branches.map((b) => state(b.finalSmiles)));
      for (const excluded of limited.exclusions) {
        assert.ok(!keptStates.has(state(excluded.finalSmiles)), "excluded outcome also listed as kept");
      }
    }
  });

  test("[engine] kept outcomes are always a ranked prefix (metamorphic: lower limit is a subset)", async () => {
    const wide = (await detailed("CC(C)CC", RADICAL, 3)).branches.map((b) => state(b.finalSmiles));
    const narrow = (await detailed("CC(C)CC", RADICAL, 2)).branches.map((b) => state(b.finalSmiles));
    assert.deepEqual(narrow, wide.slice(0, 2));
  });

  test("[engine] per-step selectivity estimates are carried into the step and multiply along the branch", async () => {
    const { branches } = await detailed("CCC", [...RADICAL, ...RADICAL], 12);
    assert.ok(branches.length > 0);
    for (const branch of branches) {
      const fractions = branch.steps
        .map((step) => step.selectivity?.estimatedFraction)
        .filter((value) => typeof value === "number");
      assert.ok(fractions.length >= 1);
      const product = fractions.reduce((a, b) => a * b, 1);
      assert.ok(Math.abs(branch.ranking.cumulativeFraction - product) < 1e-9);
    }
  });

  test("[engine] outcomes without any estimate keep engine order and are not labeled as ranked", async () => {
    const { branches } = await detailed("C=CC", ["alkene-hx-addition-hbr"]);
    assert.equal(branches[0].ranking.basis, "none");
    assert.equal(branches[0].ranking.cumulativeFraction, null);
  });

  test("[engine] runSequentialSynthesis is the detailed result's branch list", async () => {
    const plain = await utils.runSequentialSynthesis("CC(C)CC", RADICAL, registry, { branchLimit: 2 });
    const full = await detailed("CC(C)CC", RADICAL, 2);
    assert.deepEqual(plain.map((b) => b.finalSmiles), full.branches.map((b) => b.finalSmiles));
  });
});

describe("reaction mixtures", () => {
  test("[engine] members of one racemate share a single branch slot", async () => {
    const report = await detailed("CC(Br)CC", ["haloalkane-sn1-solvolysis-water"], 1);
    assert.equal(report.branches.length, 1);
    assert.equal(report.exclusions.length, 0, "an enantiomer must not be reported as an excluded alternative");
    const step = report.branches[0].steps[0];
    assert.equal(step.mixture.collapsed, true);
    assert.equal(step.mixture.memberSmiles.length, 2);
    assert.match(step.productLabel, /racemic/i, "a single enantiomer must not be presented as the pure product");
  });

  test("[engine] the racemate flag survives later steps instead of becoming a pure compound", async () => {
    const { branches } = await detailed("CC(Br)CC", [
      "haloalkane-sn1-solvolysis-water",
      "alkene-hydrogenation",
    ]);
    assert.equal(branches.length, 1);
    assert.equal(branches[0].representsRacemate, true);
  });
});

describe("Phase 1 distinctions are preserved", () => {
  test("[engine] NO REACTION still carries a mixture state forward unchanged", async () => {
    const { branches } = await detailed("COC(C)=O", ["ester-lah-reduction", "alkene-hydrogenation"]);
    assert.equal(branches.length, 1);
    assert.equal(branches[0].steps[1].status, "no-reaction");
    assert.equal(state(branches[0].finalSmiles), state("CCO.CO"));
  });

  test("[engine] unresolved statuses keep their meaning when spectators exist", async () => {
    const { branches } = await detailed("C=CC.CCCCO", ["not-a-real-rule", "alkene-hx-addition-hbr"]);
    assert.equal(branches[0].steps[0].status, "unknown-rule");
    assert.equal(branches[0].steps[1].status, "reaction");
    assert.equal(branches[0].steps[1].inputUnresolved, true);
    assert.equal(state(branches[0].finalSmiles), state("CC(C)Br.CCCCO"));
  });
});
