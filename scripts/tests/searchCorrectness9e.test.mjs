// Stage 9E Phase B: search false negatives.
// Root causes covered here:
//   1. The "connectivity" identity key dropped isotope labels, so an isotopologue was treated as the same
//      compound with unspecified stereochemistry and the planner bridged to it.
//   2. The branch-limit sample broke cost ties alphabetically by rule id, so a pathway landing exactly on the
//      target (primary-alcohol-mild-oxidation) could be discarded before it met the goal.
//   3. The linear lane ended when every first-pass candidate failed replay.
// Expected structures are written from chemistry, not copied from engine output.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let registry;
let stereo;
let run;
let ms;

before(async () => {
  ({ utils: { reactionRegistry: registry } } = await loadEngine());
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  run = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
  ms = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
});

after(async () => {
  await closeEngine();
});

const BS = String.fromCharCode(92);
const key = (smiles) => stereo.canonicalizeStereoStructure(smiles);
const search = async (start, target, totalMs = 15000) => {
  const controller = new run.SearchRunController({ rules: registry, totalMs });
  await controller.start({ startingSmiles: start, targetSmiles: target, copies: 1 });
  return controller.getState();
};

describe("structure identity keeps isotopes, charges and components while ignoring only stereochemistry", () => {
  test("isotopologues have different connectivity keys and never compare as 'connectivity-only'", async () => {
    const a = await key("[13CH3]CO");
    const b = await key("C[13CH2]O");
    const plain = await key("CCO");
    assert.notEqual(a.connectivity, b.connectivity);
    assert.notEqual(a.connectivity, plain.connectivity);
    assert.equal(stereo.compareStereoStructureKeys(a, b), "different");
    assert.equal(stereo.compareStereoStructureKeys(a, plain), "different");
    assert.match(a.connectivity, /13/);
  });
  test("stereoisomers still share one connectivity key and keep their documented comparison", async () => {
    const e = await key("C/C=C/C");
    const z = await key(`C/C=C${BS}C`);
    const none = await key("CC=CC");
    assert.equal(e.connectivity, z.connectivity);
    assert.equal(e.connectivity, none.connectivity);
    assert.equal(stereo.compareStereoStructureKeys(e, z), "stereo-conflict");
    assert.equal(stereo.compareStereoStructureKeys(e, none), "connectivity-only");
    const r = await key("C[C@H](O)CC");
    const s = await key("C[C@@H](O)CC");
    assert.equal(r.connectivity, s.connectivity);
    assert.equal(stereo.compareStereoStructureKeys(r, s), "stereo-conflict");
  });
  test("a labelled stereoisomer keeps its label in the stereo-free key", async () => {
    const labelled = await key("[13CH3][C@H](O)CC");
    const labelledOther = await key("[13CH3][C@@H](O)CC");
    const unlabelled = await key("C[C@H](O)CC");
    assert.match(labelled.connectivity, /13/);
    assert.doesNotMatch(labelled.connectivity, /@/);
    assert.equal(labelled.connectivity, labelledOther.connectivity);
    assert.notEqual(labelled.connectivity, unlabelled.connectivity);
    assert.equal(stereo.compareStereoStructureKeys(labelled, labelledOther), "stereo-conflict");
  });
  test("charges and disconnected components survive the stereo-free key", async () => {
    const quat = await key("C[N+](C)(C)C");
    assert.match(quat.connectivity, /\+/);
    const salt = await key("[Na+].[Cl-]");
    assert.equal(salt.connectivity.split(".").length, 2);
    const acetate = await key("CC(=O)[O-]");
    assert.match(acetate.connectivity, /-/);
    const chiralSalt = await key("C[C@H](N)C(=O)[O-].[Na+]");
    assert.equal(chiralSalt.connectivity.split(".").length, 2);
    assert.doesNotMatch(chiralSalt.connectivity, /@/);
  });
  test("equivalent spellings of one structure agree", async () => {
    assert.deepEqual(await key("[13CH3]CO"), await key("OC[13CH3]"));
    assert.deepEqual(await key("C[C@H](O)CC"), await key("O[C@@H](C)CC"));
  });
});

describe("a supported one-step transformation is found as one step, whatever the rule id sorts like", () => {
  // [start, target, expected rule]. Rule ids deliberately span the alphabet; several sort after ten other
  // rules that share the default planning cost, which is what used to cut them from the branch sample.
  const cases = [
    ["CCO", "CC=O", "primary-alcohol-mild-oxidation"],
    ["CCCCO", "CCCC=O", "primary-alcohol-mild-oxidation"],
    ["OCc1ccccc1", "O=Cc1ccccc1", "benzylic-allylic-alcohol-oxidation"],
    ["CCBr", "CCO", "haloalkane-sn2-hydroxide"],
    ["CC(O)C", "CC(C)=O", "secondary-alcohol-oxidation-pcc"],
    ["CCO", "CC(=O)O", "primary-alcohol-strong-oxidation"],
  ];
  for (const [start, target, ruleId] of cases) {
    test(`${start} -> ${target} uses ${ruleId} and nothing else`, async () => {
      const state = await search(start, target);
      const best = state.ranked[0];
      assert.ok(best, state.outcome?.message);
      assert.deepEqual(best.route.steps.map((step) => step.ruleId), [ruleId]);
      assert.notEqual(best.route.verification?.status, "failed");
    });
  }
  test("equivalent spellings of the same transformation give the same route", async () => {
    const ids = [];
    for (const [start, target] of [["CCO", "CC=O"], ["OCC", "C(C)=O"], ["C(O)C", "O=CC"]]) {
      ids.push((await search(start, target)).ranked[0]?.route.steps.map((step) => step.ruleId).join(">"));
    }
    assert.deepEqual(ids, Array(3).fill("primary-alcohol-mild-oxidation"));
  });
  test("[13CH3]CO -> [13CH3]C=O is found, verified, and keeps the label on the same carbon", async () => {
    const state = await search("[13CH3]CO", "[13CH3]C=O");
    const best = state.ranked[0];
    assert.ok(best, state.outcome?.message);
    assert.deepEqual(best.route.steps.map((step) => step.ruleId), ["primary-alcohol-mild-oxidation"]);
    assert.equal(best.route.steps[0].productSmiles, "[13CH3]C=O");
    assert.equal(best.route.verification?.status, "verified");
  });
  test("a label on the other carbon is a different compound: [13CH3]CO cannot be converted to C[13CH]=O by relabelling", async () => {
    const state = await search("[13CH3]CO", "C[13CH]=O", 8000);
    for (const entry of state.ranked) {
      assert.notEqual(entry.route.verification?.status, "failed");
      assert.equal(entry.route.steps.at(-1).productSmiles.includes("[13CH3]"), false, "the label cannot migrate to the carbonyl carbon by a one-step oxidation");
    }
  });
  test("stereochemistry survives: (S)-butan-2-ol -> butanone is still found as one step", async () => {
    const state = await search("C[C@@H](O)CC", "CCC(C)=O");
    assert.deepEqual(state.ranked[0]?.route.steps.map((step) => step.ruleId), ["secondary-alcohol-oxidation-pcc"]);
  });
  test("multi-component starting inventories still search (acid + alcohol -> ester)", async () => {
    const state = await search("CC(=O)O.CCO", "CC(=O)OCC");
    assert.deepEqual(state.ranked[0]?.route.steps.map((step) => step.ruleId), ["fischer-esterification"]);
  });
});

describe("the linear lane resumes once when every first-pass candidate fails replay", () => {
  const fakeRoute = (id) => ({ id, startingSmiles: "A", targetSmiles: "B", steps: [{ ruleId: id }], confidence: "verified", score: 1 });
  const verdicts = { bad: "failed", good: "verified" };
  const makeHooks = (script) => {
    const calls = [];
    return {
      calls,
      hooks: {
        plan: async (_s, _t, _r, options) => {
          calls.push({ preferFirst: options.preferFirstVerifiedRoute, maxRoutes: options.maxRoutes });
          return script[calls.length - 1] ?? [];
        },
        verify: async (route) => ({ status: verdicts[route.id] ?? "failed", problems: [] }),
      },
    };
  };
  // compatibility / selectivity assessment runs on the real registry with an empty step list; fakes carry no real steps.
  const run1 = (script, options = {}) => {
    const { calls, hooks } = makeHooks(script);
    return ms.searchLinearSynthesisRoutes("CCO", "CC=O", [], { preferFirstVerifiedRoute: true, maxRoutes: 1, ...options }, undefined, undefined, hooks).then((routes) => ({ routes, calls }));
  };

  test("all candidates failed: one widened exhaustive pass is run and its new verified route is kept", async () => {
    const { routes, calls } = await run1([[fakeRoute("bad")], [fakeRoute("bad"), fakeRoute("good")]]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].preferFirst, true);
    assert.equal(calls[1].preferFirst, false);
    assert.ok(calls[1].maxRoutes > calls[0].maxRoutes && calls[1].maxRoutes <= 10);
    assert.deepEqual(routes.map((r) => [r.id, r.verification.status]), [["bad", "failed"], ["good", "verified"]]);
  });
  test("a route that already passed makes the second pass unnecessary", async () => {
    const { routes, calls } = await run1([[fakeRoute("good")]]);
    assert.equal(calls.length, 1);
    assert.deepEqual(routes.map((r) => r.id), ["good"]);
  });
  test("a failed route is not replayed twice", async () => {
    let verified = 0;
    const hooks = {
      plan: async (_s, _t, _r, options) => (options.preferFirstVerifiedRoute ? [fakeRoute("bad")] : [fakeRoute("bad")]),
      verify: async () => {
        verified += 1;
        return { status: "failed", problems: [] };
      },
    };
    const routes = await ms.searchLinearSynthesisRoutes("CCO", "CC=O", [], { preferFirstVerifiedRoute: true, maxRoutes: 1 }, undefined, undefined, hooks);
    assert.equal(verified, 1);
    assert.equal(routes.length, 1);
  });
  test("a cancelled search does not start the second pass", async () => {
    const controller = new AbortController();
    const calls = [];
    const hooks = {
      plan: async (_s, _t, _r, options) => {
        calls.push(options.preferFirstVerifiedRoute);
        return [fakeRoute("bad")];
      },
      verify: async () => {
        controller.abort();
        return { status: "failed", problems: [] };
      },
    };
    await ms.searchLinearSynthesisRoutes("CCO", "CC=O", [], { preferFirstVerifiedRoute: true, signal: controller.signal }, undefined, undefined, hooks);
    assert.equal(calls.length, 1);
  });
  test("no first-pass candidates at all does not trigger a widened pass", async () => {
    const { routes, calls } = await run1([[]]);
    assert.equal(calls.length, 1);
    assert.deepEqual(routes, []);
  });
});
