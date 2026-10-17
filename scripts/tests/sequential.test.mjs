// Regression tests for Multi-Catalytic (sequential) synthesis outcome
// classification. These run the REAL engines (reaction registry, RDKit, rule
// matcher) under Node; nothing is mocked.
//
// Expectation labels used below:
//   [confirmed]  textbook outcome that does not depend on PocketChem heuristics
//   [heuristic]  documents what PocketChem's rule model currently predicts
//   [engine]     asserts engine bookkeeping (status classification, state flow)
//   [known-gap]  textbook outcome the engine does NOT yet reproduce; registered
//                as a `todo` so it is visible but does not fail the suite
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine, loadModule } from "./engine.mjs";

let utils;
let stereo;
let engine;
let rdkit;
let registry;
let byId;

before(async () => {
  ({ utils, stereo } = await loadEngine());
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  rdkit = await getRdkit();
  registry = utils.reactionRegistry;
  byId = new Map(registry.map((rule) => [rule.id, rule]));
});

after(async () => {
  await closeEngine();
});

// ---- helpers ---------------------------------------------------------------

function run(smiles, ruleIds, rules = registry, options = { branchLimit: 12 }) {
  return utils.runSequentialSynthesis(smiles, ruleIds, rules, options);
}

/** Canonical isomeric SMILES via RDKit, component-order independent. */
function canon(smiles) {
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

/** Constitution only (stereo stripped) for connectivity-level comparisons. */
async function flat(smiles) {
  const parts = await Promise.all(
    smiles.split(".").map(async (part) => {
      const structure = await stereo.canonicalizeStereoStructure(part);
      assert.ok(structure, `could not canonicalize ${part}`);
      return structure.connectivity;
    }),
  );
  return parts.sort().join(".");
}

function statuses(branch) {
  return branch.steps.map((step) => step.status);
}

function only(branches) {
  assert.equal(branches.length, 1, `expected exactly one branch, got ${branches.length}`);
  return branches[0];
}

function variant(ruleId, overrides, newId) {
  const base = byId.get(ruleId);
  assert.ok(base, `registry rule ${ruleId} is missing`);
  return { ...base, ...overrides, id: newId };
}

// ---- 1. valid single-step reactions ---------------------------------------

describe("valid single-step reactions", () => {
  const cases = [
    // [label, tag, substrate, rule, expected product]
    ["catalytic hydrogenation of propene", "confirmed", "CC=C", "alkene-hydrogenation", "CCC"],
    ["HBr addition follows Markovnikov (propene)", "confirmed", "CC=C", "alkene-hx-addition-hbr", "CC(C)Br"],
    ["HBr addition to 2-methylpropene gives the tertiary bromide", "confirmed", "CC(C)=C", "alkene-hx-addition-hbr", "CC(C)(C)Br"],
    ["HBr/peroxide addition is anti-Markovnikov", "confirmed", "CC=C", "alkene-hbr-peroxide", "CCCBr"],
    ["reductive ozonolysis of 2-butene gives two acetaldehyde", "confirmed", "CC=CC", "alkene-ozonolysis-reductive", "CC=O.CC=O"],
    ["Lindlar reduction of 2-butyne is syn (Z-alkene)", "confirmed", "CC#CC", "alkyne-lindlar-reduction-internal", "C/C=C\\C"],
    ["dissolving-metal reduction of 2-butyne is anti (E-alkene)", "confirmed", "CC#CC", "alkyne-dissolving-metal-reduction-internal", "C/C=C/C"],
  ];

  for (const [label, tag, substrate, ruleId, expected] of cases) {
    test(`[${tag}] ${label}`, async () => {
      const branch = only(await run(substrate, [ruleId]));
      assert.deepEqual(statuses(branch), ["reaction"]);
      assert.equal(canon(branch.finalSmiles), canon(expected));
      assert.deepEqual(branch.steps[0].issues, []);
      assert.equal(branch.steps[0].inputUnresolved, false);
    });
  }
});

// ---- 2. nonreactive substrates ---------------------------------------------

describe("nonreactive substrates are a chemical NO REACTION", () => {
  test("[confirmed] ethanol has no C=C to hydrogenate", async () => {
    const branch = only(await run("CCO", ["alkene-hydrogenation"]));
    assert.deepEqual(statuses(branch), ["no-reaction"]);
    assert.equal(branch.finalSmiles, "CCO");
    assert.equal(branch.steps[0].productSmiles, "CCO");
    assert.ok(branch.steps[0].noReaction, "NO REACTION must carry its explanation");
    assert.deepEqual(branch.steps[0].issues, []);
  });

  test("[confirmed] propane does not add HBr", async () => {
    const branch = only(await run("CCC", ["alkene-hx-addition-hbr"]));
    assert.deepEqual(statuses(branch), ["no-reaction"]);
    assert.equal(branch.finalSmiles, "CCC");
  });
});

// ---- 3. missing additional reactants ---------------------------------------

describe("missing additional structural reactants", () => {
  test("[engine] substrate fits but ROH partner is missing -> needs-input, nothing invented", async () => {
    const rule = byId.get("alkene-haloether-formation");
    assert.ok(
      rule.additionalReactants.some((r) => (r.supplyMode ?? "user-structure") === "user-structure"),
      "precondition: this rule requires a user-drawn partner",
    );
    const branch = only(await run("CC=C", ["alkene-haloether-formation"]));
    assert.deepEqual(statuses(branch), ["needs-input"]);
    assert.equal(branch.finalSmiles, "CC=C", "no structure may be invented or consumed");
    assert.match(branch.steps[0].productLabel, /ADDITIONAL REACTANT REQUIRED/);
  });

  test("[engine] substrate does NOT fit the rule -> NO REACTION, not needs-input", async () => {
    // Previously reported NEEDS INPUT before structural applicability was known.
    const branch = only(await run("CC", ["alkene-haloether-formation"]));
    assert.deepEqual(statuses(branch), ["no-reaction"]);
    assert.equal(branch.finalSmiles, "CC");
  });

  test("[engine] needs-input is distinct from unsupported", async () => {
    const needs = only(await run("CC=C", ["alkene-haloether-formation"]));
    const unsupported = only(await run("CC=C", ["alkene-addition-polymerization"]));
    assert.notEqual(needs.steps[0].status, unsupported.steps[0].status);
  });
});

// ---- 4. unsupported (concept-only / matched-but-not-computable) -------------

describe("unsupported outcomes", () => {
  test("[engine] concept-only rule -> unsupported, molecule carried forward", async () => {
    const branch = only(await run("CC=C", ["alkene-addition-polymerization"]));
    assert.deepEqual(statuses(branch), ["unsupported"]);
    assert.equal(branch.finalSmiles, "CC=C");
  });

  test("[engine] rule matches but generator yields no product -> unsupported, NOT no-reaction", async () => {
    // Trigger matches alkenes; the transform can never fire. Pre-fix this was
    // silently reported as NO REACTION.
    const rule = variant(
      "alkene-hydrogenation",
      { transform: { type: "reactionSmarts", smarts: "[N:1]>>[N:1]" } },
      "synthetic-matched-no-product",
    );
    const branch = only(await run("CC=C", [rule.id], [...registry, rule]));
    assert.deepEqual(statuses(branch), ["unsupported"]);
    assert.equal(branch.finalSmiles, "CC=C");
  });
});

// ---- 5. unknown rule ids ----------------------------------------------------

describe("unknown reaction ids", () => {
  test("[engine] an unknown id keeps its slot, is explained, and later steps still run", async () => {
    const branch = only(
      await run("CC=C", ["alkene-hydrogenation", "does-not-exist", "alkene-hx-addition-hbr"]),
    );
    assert.deepEqual(statuses(branch), ["reaction", "unknown-rule", "no-reaction"]);
    assert.equal(branch.steps.length, 3, "the unknown id must not disappear");
    assert.equal(branch.steps[1].ruleId, "does-not-exist");
    assert.match(branch.steps[1].explanation, /does-not-exist/);
    assert.equal(branch.steps[1].productSmiles, "CCC");
    assert.equal(branch.steps[2].inputUnresolved, true);
    assert.equal(branch.finalSmiles, "CCC");
  });

  test("[engine] unknown id at the start leaves the starting molecule intact", async () => {
    const branch = only(await run("CC=C", ["does-not-exist", "alkene-hydrogenation"]));
    assert.deepEqual(statuses(branch), ["unknown-rule", "reaction"]);
    assert.equal(canon(branch.finalSmiles), canon("CCC"));
  });
});

// ---- 6. execution errors ------------------------------------------------------

describe("engine failures are never reported as chemical nonreactivity", () => {
  // Factories: rules are built inside each test, after the registry has loaded.
  const faults = [
    [
      "uncompilable reaction SMARTS",
      () => variant("alkene-hydrogenation", { transform: { type: "reactionSmarts", smarts: "[C:1]>>>>(((" } }, "synthetic-bad-smarts"),
    ],
    [
      "uncompilable trigger SMARTS",
      () =>
        variant(
          "alkene-hydrogenation",
          { trigger: { ...byId.get("alkene-hydrogenation").trigger, includeSmarts: ["[C"] } },
          "synthetic-bad-trigger",
        ),
    ],
    [
      "custom handler that throws",
      () => variant("alkene-hydrogenation", { transform: { type: "customHandler", handler: "doesNotExist" } }, "synthetic-bad-handler"),
    ],
  ];

  for (const [label, makeRule] of faults) {
    test(`[engine] ${label} -> execution-error with diagnostics`, async () => {
      const rule = makeRule();
      const branch = only(await run("CC=C", [rule.id], [...registry, rule]));
      assert.deepEqual(statuses(branch), ["execution-error"]);
      assert.notEqual(branch.steps[0].status, "no-reaction");
      assert.ok(branch.steps[0].issues.length > 0, "the failure reason must be surfaced");
      assert.equal(branch.finalSmiles, "CC=C", "molecule is carried forward unchanged");
      assert.equal(branch.steps[0].noReaction, null);
    });
  }

  test("[engine] an unparsable starting structure is an error, not NO REACTION", async () => {
    const branch = only(await run("not-a-smiles", ["alkene-hydrogenation"]));
    assert.deepEqual(statuses(branch), ["execution-error"]);
  });

  test("[engine] an errored step does not block later steps, which are marked unresolved", async () => {
    const bad = variant(
      "alkene-hydrogenation",
      { transform: { type: "reactionSmarts", smarts: "[C:1]>>>>(((" } },
      "synthetic-bad-smarts-2",
    );
    const branch = only(await run("CC=C", [bad.id, "alkene-hx-addition-hbr"], [...registry, bad]));
    assert.deepEqual(statuses(branch), ["execution-error", "reaction"]);
    assert.equal(branch.steps[1].inputUnresolved, true);
    assert.equal(canon(branch.finalSmiles), canon("CC(C)Br"));
  });

  test("[engine] the failure sink does not alter results of working rules", async () => {
    for (const [substrate, ruleId] of [
      ["CC=C", "alkene-hydrogenation"],
      ["CC=C", "alkene-hx-addition-hbr"],
      ["CC#CC", "alkyne-lindlar-reduction-internal"],
      ["CCO", "alkene-hydrogenation"],
    ]) {
      const rule = byId.get(ruleId);
      const plain = await engine.predictReactionPathwaysFromRules(substrate, [], [rule]);
      const issues = [];
      const withSink = await engine.predictReactionPathwaysFromRules(substrate, [], [rule], { issues });
      assert.deepEqual(
        withSink.map((p) => [p.ruleId, p.productSmiles]),
        plain.map((p) => [p.ruleId, p.productSmiles]),
        `${ruleId} on ${substrate}`,
      );
      assert.deepEqual(issues, [], `${ruleId} on ${substrate} must not report spurious issues`);
    }
  });
});

// ---- 7. sequential behaviour -----------------------------------------------

describe("sequential reagent application", () => {
  test("[engine] NO REACTION preserves the molecule and the next step runs on it", async () => {
    const branch = only(await run("CC=C", ["alcohol-dehydration-alkene", "alkene-hx-addition-hbr"]));
    assert.deepEqual(statuses(branch), ["no-reaction", "reaction"]);
    assert.equal(branch.steps[0].productSmiles, "CC=C");
    assert.equal(branch.steps[1].reactantSmiles, "CC=C");
    assert.equal(canon(branch.finalSmiles), canon("CC(C)Br"));
    // A chemical NO REACTION is a conclusion, so it does not taint later steps.
    assert.equal(branch.steps[1].inputUnresolved, false);
  });

  test("[confirmed] two reactions in sequence: 2-butyne -> Lindlar -> HBr gives 2-bromobutane", async () => {
    const branch = only(await run("CC#CC", ["alkyne-lindlar-reduction-internal", "alkene-hx-addition-hbr"]));
    assert.deepEqual(statuses(branch), ["reaction", "reaction"]);
    assert.equal(await flat(branch.finalSmiles), await flat("CCC(C)Br"));
  });

  test("[metamorphic] reagent order is meaningful", async () => {
    const hbrFirst = only(await run("CC=C", ["alkene-hx-addition-hbr", "alkene-hydrogenation"]));
    const h2First = only(await run("CC=C", ["alkene-hydrogenation", "alkene-hx-addition-hbr"]));
    assert.equal(canon(hbrFirst.finalSmiles), canon("CC(C)Br"));
    assert.equal(canon(h2First.finalSmiles), canon("CCC"));
    assert.notEqual(canon(hbrFirst.finalSmiles), canon(h2First.finalSmiles));
  });

  test("[metamorphic] inserting a verified NO-REACTION condition leaves the outcome unchanged", async () => {
    // alcohol-dehydration-alkene needs an alcohol; none of these substrates has one.
    const inert = "alcohol-dehydration-alkene";
    const matrix = [
      ["CC=C", ["alkene-hx-addition-hbr"]],
      ["CC=C", ["alkene-hydrogenation"]],
      ["CC#CC", ["alkyne-lindlar-reduction-internal"]],
      ["CC#CC", ["alkyne-lindlar-reduction-internal", "alkene-hx-addition-hbr"]],
    ];
    for (const [substrate, ids] of matrix) {
      const base = await run(substrate, ids);
      for (let position = 0; position <= ids.length; position += 1) {
        const withInert = [...ids.slice(0, position), inert, ...ids.slice(position)];
        const out = await run(substrate, withInert);
        const insertedStep = out.map((b) => b.steps[position]);
        assert.ok(insertedStep.every((s) => s.status === "no-reaction"), `${inert} must be NO REACTION at ${position}`);
        assert.deepEqual(
          out.map((b) => canon(b.finalSmiles)).sort(),
          base.map((b) => canon(b.finalSmiles)).sort(),
          `${substrate} ${ids.join(">")} with ${inert} at ${position}`,
        );
      }
    }
  });
});

// ---- 8. stereochemistry and multi-product behaviour ---------------------------

describe("stereochemical and multi-product behaviour", () => {
  test("[confirmed] syn-dihydroxylation of (E)-2-butene gives the racemic (R,R)/(S,S) diol pair", async () => {
    // One racemic mixture is ONE outcome that keeps both enantiomers visible.
    const out = await run("C/C=C/C", ["alkene-syn-dihydroxylation"]);
    assert.equal(out.length, 1, "the racemic pair shares a single outcome");
    const mixture = out[0].steps[0].mixture;
    assert.equal(mixture.kind, "racemic");
    assert.equal(mixture.collapsed, true);
    assert.equal(mixture.memberSmiles.length, 2, "both enantiomers stay listed");
    assert.equal(out[0].representsRacemate, true);
    const structures = await Promise.all(mixture.memberSmiles.map((smiles) => stereo.canonicalizeStereoStructure(smiles)));
    assert.ok(structures.every(Boolean));
    assert.equal(await stereo.areCanonicalEnantiomers(structures[0], structures[1]), true);
    const expected = await flat("CC(O)C(C)O");
    for (const smiles of mixture.memberSmiles) assert.equal(await flat(smiles), expected);
  });

  test("[engine] chirality survives into the next step (no stereo-loss in propagation)", async () => {
    const out = await run("C/C=C/C", ["alkene-syn-dihydroxylation", "alkene-hydrogenation"]);
    assert.equal(out.length, 1, "racemic pair stays one outcome across the step");
    assert.ok(out.every((b) => statuses(b).join() === "reaction,no-reaction"));
    assert.ok(out.every((b) => /@/.test(b.finalSmiles)), "stereocentres must be kept across a NO REACTION step");
  });

  test("[confirmed] Lindlar and dissolving-metal reductions give opposite alkene geometries", async () => {
    const z = only(await run("CC#CC", ["alkyne-lindlar-reduction-internal"]));
    const e = only(await run("CC#CC", ["alkyne-dissolving-metal-reduction-internal"]));
    assert.notEqual(canon(z.finalSmiles), canon(e.finalSmiles));
    assert.equal(await flat(z.finalSmiles), await flat(e.finalSmiles));
  });

  test("[confirmed] reductive ozonolysis keeps both carbonyl products in the carried-forward state", async () => {
    const branch = only(await run("CC=CC", ["alkene-ozonolysis-reductive"]));
    assert.equal(branch.finalSmiles.split(".").length, 2);
  });

  // Known gaps in the existing chemistry model (outside Phase 1 scope). They are
  // registered as TODO so they are tracked without failing the suite.
  test("[known-gap] syn-dihydroxylation of (Z)-2-butene should give only meso-2,3-butanediol", { todo: true }, async () => {
    const out = await run("C/C=C\\C", ["alkene-syn-dihydroxylation"]);
    assert.equal(out.length, 1, `got ${out.map((b) => b.finalSmiles).join(" | ")}`);
    assert.equal(canon(out[0].finalSmiles), canon("C[C@H](O)[C@@H](C)O"));
  });

  test("[known-gap] epoxidation of (Z)-2-butene should retain cis stereochemistry (meso epoxide)", { todo: true }, async () => {
    const branch = only(await run("C/C=C\\C", ["alkene-epoxidation"]));
    assert.match(branch.finalSmiles, /@/);
  });

  test("[known-gap] anti-Br2 addition to (Z)-2-butene should give a specific racemic pair", { todo: true }, async () => {
    const branch = only(await run("C/C=C\\C", ["alkene-halogenation-bromine"]));
    assert.match(branch.finalSmiles, /@/);
  });
});

// ---- 9. registry integrity --------------------------------------------------

describe("registry integrity (a broken rule must not masquerade as nonreactivity)", () => {
  test("rule ids are unique", () => {
    const seen = new Set();
    const duplicates = [];
    for (const rule of registry) {
      if (seen.has(rule.id)) duplicates.push(rule.id);
      seen.add(rule.id);
    }
    assert.deepEqual(duplicates, []);
  });

  test("every reaction SMARTS and trigger SMARTS compiles in RDKit", () => {
    const failures = [];
    for (const rule of registry) {
      if (rule.transform.type === "reactionSmarts") {
        let rxn = null;
        try {
          rxn = rdkit.get_rxn(rule.transform.smarts);
        } catch {
          rxn = null;
        }
        if (!rxn) failures.push(`${rule.id}: reaction SMARTS`);
        rxn?.delete?.();
      }
      for (const smarts of [...(rule.trigger.includeSmarts ?? []), ...(rule.trigger.excludeSmarts ?? [])]) {
        let query = null;
        try {
          query = rdkit.get_qmol(smarts);
        } catch {
          query = null;
        }
        if (!query) failures.push(`${rule.id}: trigger ${smarts}`);
        query?.delete?.();
      }
    }
    assert.deepEqual(failures, []);
  });
});

// ---- 10. registry-wide sweep ---------------------------------------------------

describe("registry-wide sweep", () => {
  test("[engine] no shipped rule produces an engine failure on common substrates", async () => {
    const substrates = ["CC=C", "CCO", "CC#CC", "CC(=O)C", "c1ccccc1", "CCBr", "CC(=O)O", "C/C=C/C"];
    const problems = [];
    for (const substrate of substrates) {
      for (const rule of registry) {
        const branches = await run(substrate, [rule.id]);
        for (const branch of branches) {
          const step = branch.steps[0];
          if (step.status === "execution-error") problems.push(`${substrate} | ${rule.id}: ${step.issues.join("; ")}`);
          if (step.status === "reaction" && !step.productSmiles) problems.push(`${substrate} | ${rule.id}: empty product`);
          if (step.status === "no-reaction" && step.productSmiles !== substrate) problems.push(`${substrate} | ${rule.id}: NO REACTION changed the molecule`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });
});
