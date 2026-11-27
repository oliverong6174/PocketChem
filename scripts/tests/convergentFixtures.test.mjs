// Phase 4 / Stage 0: convergent-synthesis fixtures are checked against the
// EXISTING reaction registry before any planner work relies on them.
// No planner search runs here. Labels: [engine] registry/bookkeeping fact,
// [heuristic] PocketChem's rule model, [confirmed] textbook-level.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine } from "./engine.mjs";
import { FIXTURES } from "./fixtures/convergentFixtures.mjs";
import { canon, canonSet, modules, pathwayGiving, runRule, structuralSlots } from "./fixtures/convergentHelpers.mjs";

let registry;

before(async () => {
  ({ registry } = await modules());
});

after(async () => {
  await closeEngine();
});

/** Replays the fixture's material bookkeeping: multiset of canonical species. */
async function simulate(fixture, copies = fixture.copies) {
  const shelf = new Map();
  const add = (key, n = 1) => shelf.set(key, (shelf.get(key) ?? 0) + n);
  for (let i = 0; i < fixture.supplied.length; i += 1) add(await canon(fixture.supplied[i]), copies[i] ?? 1);
  for (const spec of fixture.steps) {
    for (const reactant of spec.reactants) {
      const key = await canon(reactant);
      if (!(shelf.get(key) > 0)) return { ok: false, failedAt: spec.ruleId, reactant, shelf };
      add(key, -1);
    }
    for (const product of spec.product) add(await canon(product));
  }
  return { ok: true, shelf };
}

for (const fixture of FIXTURES) {
  describe(`fixture: ${fixture.id}`, () => {
    for (const [index, spec] of fixture.steps.entries()) {
      test(`[engine] step ${index + 1} (${spec.ruleId}) gives the recorded product`, async () => {
        const rule = registry.find((item) => item.id === spec.ruleId);
        assert.ok(rule, `rule ${spec.ruleId} is not in the registry`);
        const pathway = await pathwayGiving(spec.ruleId, spec.reactants, spec.product);
        assert.ok(pathway, `${spec.ruleId} did not produce ${spec.product} from ${spec.reactants}`);
        assert.notEqual(pathway.productStatus, "concept-only");
      });

      test(`[engine] step ${index + 1} lists structural reactants only (no reagents or catalysts)`, () => {
        const rule = registry.find((item) => item.id === spec.ruleId);
        // One substrate plus exactly the rule's user-structure partners; "auto"
        // presets (cyanide, iodide, ...) are conditions, never route materials.
        assert.equal(spec.reactants.length, 1 + structuralSlots(rule).length, spec.ruleId);
      });

      if (spec.reactants.length > 1) {
        test(`[engine] step ${index + 1} does not depend on the order of its reactants`, async () => {
          const forward = await runRule(spec.ruleId, spec.reactants);
          const reversed = await runRule(spec.ruleId, [...spec.reactants].reverse());
          const key = async (list) =>
            JSON.stringify((await Promise.all(list.map((p) => canonSet(p.productSmiles.split("."))))).map(String).sort());
          assert.equal(await key(forward), await key(reversed));
        });

        test(`[engine] step ${index + 1} needs every structural partner (nothing is invented)`, async () => {
          const alone = await runRule(spec.ruleId, [spec.reactants[0]]);
          const expected = await canonSet(spec.product);
          for (const pathway of alone) {
            assert.notDeepEqual(await canonSet(pathway.productSmiles.split(".")), expected);
          }
        });
      }
    }

    test("[engine] every reactant is a supplied copy or an earlier product, and none is over-used", async () => {
      const result = await simulate(fixture);
      assert.ok(result.ok, `${result.failedAt} cannot find "${result.reactant}"`);
    });

    test("[engine] the target is present once the last step is done", async () => {
      const result = await simulate(fixture);
      assert.ok((result.shelf.get(await canon(fixture.target)) ?? 0) >= 1);
    });

    test("[engine] chemical limitations are recorded", () => {
      assert.ok(fixture.limits.length > 0);
    });
  });
}

describe("fixture-specific chemistry", () => {
  test("[engine] the Grignard fixture needs two copies of ethanol: one copy cannot supply both branches", async () => {
    const fixture = FIXTURES.find((item) => item.id === "grignard-2-butanol-from-ethanol");
    assert.equal((await simulate(fixture, [2])).ok, true);
    const single = await simulate(fixture, [1]);
    assert.equal(single.ok, false);
  });

  test("[engine] the Fischer fixture is genuinely convergent: neither half can be built from the other", async () => {
    const fixture = FIXTURES.find((item) => item.id === "fischer-isopropyl-propanoate");
    // Dropping either supplied material breaks the simulation.
    for (const dropped of [0, 1]) {
      const copies = fixture.copies.map((n, i) => (i === dropped ? 0 : n));
      assert.equal((await simulate(fixture, copies)).ok, false);
    }
  });

  test("[engine] ester reduction yields both alcohols; one equals the 2-propanol of the other fixture", async () => {
    const fixture = FIXTURES.find((item) => item.id === "ester-reduction-coproduct");
    const pathway = await pathwayGiving("ester-lah-reduction", fixture.steps[0].reactants, fixture.steps[0].product);
    assert.deepEqual(await canonSet(pathway.productSmiles.split(".")), await canonSet(["CC(C)O", "CCCO"]));
  });

  test("[confirmed] syn-dihydroxylation of (E)-2-butene is reported as a racemic pair", async () => {
    const pathway = await pathwayGiving("alkene-syn-dihydroxylation", ["C/C=C/C"], ["C[C@@H](O)[C@@H](C)O"]);
    assert.equal(pathway.productMixture?.kind, "racemic");
  });

  test("[known-gap] Grignard addition to acetaldehyde is not reported as a racemic mixture", async () => {
    // Documents the engine's current behaviour; if this starts passing as a
    // mixture the fixture limitation text should be updated, not the rule.
    const pathway = await pathwayGiving("aldehyde-organometallic-addition", ["CC=O", "CC[Mg]Br"], ["CCC(C)O"]);
    assert.equal(pathway.productMixture ?? null, null);
  });

  test("[engine] Grignard formation output is the same species as the hand-written CC[Mg]Br", async () => {
    const pathway = await pathwayGiving("haloalkane-grignard-formation-bromide", ["CCBr"], ["CC[Mg]Br"]);
    assert.ok(pathway);
    assert.equal(await canon("C[CH2][Mg][Br]"), await canon("CC[Mg]Br"));
  });
});
