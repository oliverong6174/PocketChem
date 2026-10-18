// Phase 4 / Stage 2: reactant-role index. The index is a pre-filter, so the
// property that matters is RECALL: any rule application the real engine finds
// must also be proposed by the index. Precision (proposals the engine then
// declines) is measured and reported but only loosely bounded.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { FIXTURES } from "./fixtures/convergentFixtures.mjs";
import { canon, modules, poolSpecies, structuralSlots } from "./fixtures/convergentHelpers.mjs";

let ReactantRoleIndex;
let buildRuleRoleProfile;
let registry;
let engine;
let utils;
let index;

before(async () => {
  ({ registry, engine, utils } = await modules());
  ({ ReactantRoleIndex, buildRuleRoleProfile } = await loadModule("/src/utils/reactions/engine/reactantRoleIndex.ts"));
  index = new ReactantRoleIndex(registry);
});

after(async () => {
  await closeEngine();
});

const lotOf = async (smiles, id = smiles, equivalenceKey) => {
  const info = await poolSpecies(smiles);
  return { id, smiles: info.smiles, canonical: info.canonical, ...(equivalenceKey ? { equivalenceKey } : {}) };
};
const lotsOf = (list) => Promise.all(list.map((smiles) => lotOf(smiles)));
const idsOf = (assignments) => assignments.map((a) => `${a.ruleId}:${a.lotIds.join("+")}`).sort();

describe("rule role profiles", () => {
  const profile = (id) => index.profileOf(id);

  test("[engine] arity counts the primary reactant plus every additional reactant", () => {
    assert.equal(profile("fischer-esterification").arity, 2);
    assert.equal(profile("alcohol-williamson-ether").arity, 2);
    assert.equal(profile("aldehyde-reduction").arity, 1);
    assert.equal(profile("fischer-esterification").slots[0].supplyMode, "primary");
  });

  test("[engine] rules that need a drawn partner cannot run on a single lot", () => {
    assert.equal(profile("fischer-esterification").singleLotCapable, false);
    assert.equal(profile("aldehyde-organometallic-addition").singleLotCapable, false);
  });

  test("[engine] reagents the rule supplies itself do not make a rule multi-lot", () => {
    // Cyanide is an "auto" preset: a condition, never a lot the route has to provide.
    const cyanide = profile("haloalkane-sn2-cyanide");
    assert.equal(cyanide.singleLotCapable, true);
    assert.equal(cyanide.slots[1].supplyMode, "auto");
  });

  test("[engine] equivalents belong to a slot, they do not add lots", () => {
    const acetal = profile("aldehyde-acetal-formation");
    assert.equal(acetal.arity, 2);
    assert.ok(acetal.slots[1].equivalents >= 1);
  });

  test("[engine] profiles agree with the user-structure partners the fixtures rely on", () => {
    for (const fixture of FIXTURES) {
      for (const spec of fixture.steps) {
        const rule = registry.find((item) => item.id === spec.ruleId);
        const built = buildRuleRoleProfile(rule);
        const structural = built.slots.filter((slot) => slot.supplyMode === "user-structure" || slot.supplyMode === "primary");
        assert.equal(structural.length, spec.reactants.length, spec.ruleId);
        assert.equal(structuralSlots(rule).length + 1, spec.reactants.length, spec.ruleId);
      }
    }
  });
});

describe("fixture steps are proposed by the index", () => {
  const multi = FIXTURES.flatMap((fixture) =>
    fixture.steps.filter((spec) => spec.reactants.length > 1).map((spec) => ({ fixture, spec })),
  );

  for (const { fixture, spec } of multi) {
    test(`[engine] ${fixture.id}: ${spec.ruleId} is proposed for exactly its reactants, in any input order`, async () => {
      const lots = await Promise.all(spec.reactants.map((smiles, i) => lotOf(smiles, `lot${i}`)));
      for (const ordered of [lots, [...lots].reverse()]) {
        const found = await index.candidateAssignments(ordered);
        const hit = found.find((a) => a.ruleId === spec.ruleId);
        assert.ok(hit, `${spec.ruleId} not proposed`);
        assert.deepEqual([...hit.lotIds].sort(), lots.map((lot) => lot.id).sort());
      }
    });

    test(`[engine] ${fixture.id}: ${spec.ruleId} is still proposed when unrelated spectators are present`, async () => {
      const lots = await Promise.all(spec.reactants.map((smiles, i) => lotOf(smiles, `lot${i}`)));
      const spectators = await Promise.all(["CCCC", "c1ccccc1", "CC(C)(C)C", "O"].map((smiles, i) => lotOf(smiles, `spec${i}`)));
      const alone = idsOf(await index.candidateAssignments(lots));
      const crowded = idsOf(await index.candidateAssignments([...spectators, ...lots]));
      for (const entry of alone) assert.ok(crowded.includes(entry), `${entry} lost among spectators`);
    });
  }

  test("[engine] a coupling rule is not proposed when one partner is missing", async () => {
    const found = await index.candidateAssignments(await lotsOf(["CC(C)O"]));
    assert.equal(found.length, 0);
    const onlyOne = await index.candidateAssignments(await lotsOf(["CC(C)O", "CCCC"]));
    assert.ok(!onlyOne.some((a) => a.ruleId === "fischer-esterification"));
  });

  test("[engine] maxArity 1 proposes no multi-lot rule", async () => {
    const found = await index.candidateAssignments(await lotsOf(["CC(C)O", "CCC(=O)O"]), { maxArity: 1 });
    assert.deepEqual(found, []);
  });
});

describe("role assignment semantics", () => {
  test("[engine] one lot cannot fill two roles", async () => {
    // Cannizzaro needs a second aldehyde; a single benzaldehyde lot is not enough.
    const one = await index.candidateAssignments([await lotOf("O=Cc1ccccc1", "a")]);
    assert.ok(!one.some((a) => a.ruleId === "aldehyde-cannizzaro"));
    const two = await index.candidateAssignments([await lotOf("O=Cc1ccccc1", "a"), await lotOf("O=Cc1ccccc1", "b")]);
    assert.ok(two.some((a) => a.ruleId === "aldehyde-cannizzaro"));
  });

  test("[engine] interchangeable copies are not enumerated repeatedly", async () => {
    const lots = [
      await lotOf("CCO", "sm0#1"),
      await lotOf("CCO", "sm0#2"),
      await lotOf("CCBr", "sm1#1"),
    ];
    const found = (await index.candidateAssignments(lots)).filter((a) => a.ruleId === "alcohol-williamson-ether");
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].lotIds, ["sm0#1", "sm1#1"]);

    // Different equivalence keys (for example a racemic copy vs a pure one) ARE both offered.
    const distinct = [
      await lotOf("CCO", "sm0#1", "pure"),
      await lotOf("CCO", "sm0#2", "racemic"),
      await lotOf("CCBr", "sm1#1"),
    ];
    const both = (await index.candidateAssignments(distinct)).filter((a) => a.ruleId === "alcohol-williamson-ether");
    assert.equal(both.length, 2);
  });

  test("[engine] assignment does not depend on the order lots are listed", async () => {
    const lots = await lotsOf(["CC(C)O", "CCC(=O)O", "CC=O", "CC[Mg]Br", "CCBr", "CCCC"]);
    const forward = idsOf(await index.candidateAssignments(lots));
    const reversed = idsOf(await index.candidateAssignments([...lots].reverse()));
    assert.deepEqual(forward, reversed);
    assert.ok(forward.some((entry) => entry.startsWith("aldehyde-organometallic-addition:")));
    assert.ok(forward.some((entry) => entry.startsWith("fischer-esterification:")));
  });

  test("[engine] reagents are never required as lots: a lone bromide still offers the cyanide substitution", async () => {
    const rules = await index.singleLotRules(await lotOf("CCBr"));
    assert.ok(rules.some((rule) => rule.id === "haloalkane-sn2-cyanide"));
    assert.ok(rules.every((rule) => index.profileOf(rule.id).singleLotCapable));
  });

  test("[engine] ruleSubset and reactantInput feed the engine the right pieces", async () => {
    const lots = await lotsOf(["CC(C)O", "CCC(=O)O", "CCCC"]);
    const found = await index.candidateAssignments(lots);
    const subset = ReactantRoleIndex.ruleSubset(found);
    assert.ok(subset.length > 0 && subset.length < index.multiLotProfiles.length);
    const fischer = found.find((a) => a.ruleId === "fischer-esterification");
    const input = ReactantRoleIndex.reactantInput(fischer, lots);
    const pathways = await engine.predictReactionPathwaysFromRules(input, [], subset, { planning: true });
    const products = pathways.filter((p) => p.ruleId === "fischer-esterification").map((p) => p.productSmiles);
    assert.deepEqual(products.map((p) => p), ["CCC(=O)OC(C)C"]);
  });

  test("[engine] results are cached: asking again evaluates nothing new", async () => {
    const fresh = new ReactantRoleIndex(registry);
    const lots = await lotsOf(["CC(C)O", "CCC(=O)O"]);
    await fresh.candidateAssignments(lots);
    const first = fresh.getStats();
    await fresh.candidateAssignments(lots);
    const second = fresh.getStats();
    assert.equal(second.fitEvaluations, first.fitEvaluations);
    assert.ok(second.fitCacheHits > first.fitCacheHits);
    assert.equal(second.speciesAnalyzed, first.speciesAnalyzed);
  });
});

describe("recall against the real engine", () => {
  // Reacting partners from the fixtures plus a few unrelated molecules, so the
  // sweep includes both reacting and non-reacting pairs. The default keeps the
  // suite fast; PC_FULL_RECALL=1 also adds every product and target (~300 pairs,
  // over a minute); the default is ~45 pairs.
  const full = Boolean(process.env.PC_FULL_RECALL);
  const universe = async () => {
    const set = new Set(["CCCC", "O=Cc1ccccc1"]);
    for (const fixture of FIXTURES) {
      if (full) [...fixture.supplied, fixture.target].forEach((s) => set.add(s));
      for (const spec of fixture.steps) {
        if (spec.reactants.length > 1 || full) spec.reactants.forEach((s) => set.add(s));
        if (full) spec.product.forEach((s) => set.add(s));
      }
    }
    const byCanonical = new Map();
    for (const smiles of set) byCanonical.set(await canon(smiles), smiles);
    return Promise.all([...byCanonical.values()].map((smiles, i) => lotOf(smiles, `u${i}`)));
  };

  test("[engine] every multi-structure application the engine finds for a pair is proposed (100% recall)", async () => {
    const lots = await universe();
    const multiRules = index.multiLotProfiles.map((profile) => profile.rule);
    let pairs = 0;
    let engineHits = 0;
    let proposed = 0;
    let proposedRules = 0;
    const missed = [];

    for (let i = 0; i < lots.length; i += 1) {
      for (let j = i + 1; j < lots.length; j += 1) {
        pairs += 1;
        const pair = [lots[i], lots[j]];
        const assignments = await index.candidateAssignments(pair);
        const singles = new Set([
          ...(await index.singleLotRules(pair[0])).map((rule) => rule.id),
          ...(await index.singleLotRules(pair[1])).map((rule) => rule.id),
        ]);
        proposed += assignments.length;
        proposedRules += new Set(assignments.map((a) => a.ruleId)).size;

        const pathways = await engine.predictReactionPathwaysFromRules(pair.map((l) => l.smiles).join("."), [], multiRules, {
          planning: true,
        });
        for (const pathway of pathways) {
          if (!pathway.productSmiles) continue;
          const profile = index.profileOf(pathway.ruleId);
          const components = await Promise.all(pathway.reactantComponents.map(canon));
          const wantedPair = pair.map((l) => l.canonical);
          const usesBoth = wantedPair.every((c) => components.includes(c)) && components.length >= 2;
          engineHits += 1;
          if (usesBoth && !profile.singleLotCapable) {
            const ok = assignments.some(
              (a) =>
                a.ruleId === pathway.ruleId &&
                [...a.lotIds].sort().join() === pair.map((l) => l.id).sort().join(),
            );
            if (!ok) missed.push(`${pathway.ruleId} ${pair.map((l) => l.smiles)}`);
          } else if (!singles.has(pathway.ruleId) && !assignments.some((a) => a.ruleId === pathway.ruleId)) {
            missed.push(`${pathway.ruleId} (single) ${pair.map((l) => l.smiles)}`);
          }
        }
      }
    }
    console.log(
      `    recall sweep: ${pairs} pairs, ${engineHits} engine pathways, ${proposed} proposals ` +
        `(${(proposedRules / pairs).toFixed(2)} rules per pair of ${multiRules.length} multi-lot rules)`,
    );
    assert.deepEqual(missed, []);
    assert.ok(engineHits > 0, "the sweep must exercise real engine applications");
    // The filter must actually filter: far fewer rules proposed per pair than exist.
    assert.ok(proposedRules / pairs < multiRules.length / 4, "the index barely narrows the rule set");
  });

  test("[engine] every single-structure application the engine finds is proposed (100% recall)", async () => {
    const lots = (await universe()).slice(0, full ? 12 : 5);
    const missed = [];
    for (const lot of lots) {
      const proposed = new Set((await index.singleLotRules(lot)).map((rule) => rule.id));
      const pathways = await engine.predictReactionPathwaysFromRules(lot.smiles, [], registry, { planning: true });
      for (const pathway of pathways) {
        if (pathway.productSmiles && !proposed.has(pathway.ruleId)) missed.push(`${pathway.ruleId} ${lot.smiles}`);
      }
    }
    assert.deepEqual(missed, []);
  });
});
