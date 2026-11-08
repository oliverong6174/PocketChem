// Stage 9M: new and materially extended reaction families. Every expectation is checked against the REAL
// rule registry and RDKit through the existing engine; nothing is mocked. Expected products were derived by hand
// from the textbook mechanism (PocketChem's structural model, not experimental claims). Labels:
//   [engine]    reaction output of the registry rule
//   [scope]     a substrate the rule must refuse (the scope is enforced in SMARTS, not just prose)
//   [stereo]    CIP descriptors computed by RDKit from the product, never copied from the SMILES parity
//   [inventory] material accounting through the multi-material workspace
//   [retro]     the retrosynthesis planner proposes the disconnection
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadModule } from "./engine.mjs";
import { canon, canonSet, modules, runRule } from "./fixtures/convergentHelpers.mjs";

let registry;
let rdkit;
let ws;
let retro;

before(async () => {
  ({ registry } = await modules());
  rdkit = await getRdkit();
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  retro = await loadModule("/src/utils/reactions/engine/retroSynthesis.ts");
});

after(async () => {
  await closeEngine();
});

/** Isomeric canonical product sets (each pathway = one sorted set) produced by one rule on drawn reactants. */
async function products(ruleId, reactants) {
  const out = [];
  for (const pathway of await runRule(ruleId, reactants)) {
    out.push((await canonSet(pathway.productSmiles.split("."))).join("."));
  }
  return [...new Set(out)].sort();
}

async function expectProduct(ruleId, reactants, expected) {
  const got = await products(ruleId, reactants);
  const want = (await canonSet(Array.isArray(expected) ? expected : [expected])).join(".");
  assert.ok(got.includes(want), `${ruleId} on ${reactants.join(" + ")}: expected ${want}, got ${got.join(" | ") || "(nothing)"}`);
}

async function expectNothing(ruleId, reactants) {
  assert.deepEqual(await products(ruleId, reactants), [], `${ruleId} must not apply to ${reactants.join(" + ")}`);
}

function cipOf(smiles) {
  const mol = rdkit.get_mol(smiles);
  try {
    const tags = JSON.parse(mol.get_stereo_tags());
    return (tags.CIP_atoms ?? []).map((entry) => String(entry[1]).replace(/[()]/g, "")).filter((d) => d === "R" || d === "S").sort();
  } finally {
    mol.delete();
  }
}

// ---------------------------------------------------------------------------------------------
describe("registry: Stage 9M rules are well-formed and reachable", () => {
  const ids = [
    "wacker-tsuji-oxidation",
    "ring-closing-metathesis-5",
    "ring-closing-metathesis-6",
    "ring-closing-metathesis-7",
    "ring-closing-metathesis-8",
    "mitsunobu-secondary-inversion",
    "mitsunobu-primary",
    "benzilic-acid-rearrangement",
    "benzilic-acid-ring-contraction",
    "pinacol-coupling",
    "ketonic-decarboxylation",
    "dieckmann-condensation-5",
    "dieckmann-condensation-6",
    "dieckmann-condensation-7",
    "acetoacetic-ester-alkylation",
    "malonic-ester-alkylation",
    "beta-keto-ester-hydrolysis-decarboxylation",
    "malonic-ester-hydrolysis-decarboxylation",
  ];
  for (const id of ids) {
    test(`[engine] ${id} is registered, executable and states its limits`, () => {
      const rule = registry.find((item) => item.id === id);
      assert.ok(rule, `${id} missing`);
      assert.equal(rule.transform.type, "reactionSmarts", "must be an executable rule, not concept-only");
      assert.ok((rule.limitations ?? []).length > 0, "limitations must be documented");
      assert.ok(rule.conditions, "conditions must be declared (assessed), not unknown");
    });
  }
  test("[engine] structural partners are user-supplied, never invented", () => {
    for (const id of ["mitsunobu-secondary-inversion", "mitsunobu-primary", "pinacol-coupling", "ketonic-decarboxylation", "acetoacetic-ester-alkylation", "malonic-ester-alkylation"]) {
      const rule = registry.find((item) => item.id === id);
      for (const partner of rule.additionalReactants) assert.equal(partner.supplyMode, "user-structure", `${id}: ${partner.label}`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("Wacker–Tsuji oxidation", () => {
  test("[engine] 1-heptene gives 2-heptanone", () => expectProduct("wacker-tsuji-oxidation", ["C=CCCCCC"], "CCCCCC(C)=O"));
  test("[engine] styrene gives acetophenone (second, structurally different substrate)", () =>
    expectProduct("wacker-tsuji-oxidation", ["C=Cc1ccccc1"], "CC(=O)c1ccccc1"));
  test("[engine] only the terminal alkene reacts when an internal one is also present", () =>
    expectProduct("wacker-tsuji-oxidation", ["C=CCCC=CC"], "CC(=O)CCC=CC"));
  test("[engine] a stereocentre elsewhere is carried through unchanged", async () => {
    const got = await products("wacker-tsuji-oxidation", ["C=CC[C@H](C)O"]);
    assert.deepEqual(got, [await canon("CC(=O)C[C@H](C)O")]);
  });
  test("[scope] internal, cyclic, conjugated and heteroatom-substituted alkenes are refused", async () => {
    for (const smiles of ["CC=CC", "C1=CCCCC1", "C=CC(=O)OC", "C=CC=C", "C=COC", "CCC=C(C)C"]) {
      await expectNothing("wacker-tsuji-oxidation", [smiles]);
    }
  });
  test("[engine] it does not manufacture the anti-Markovnikov aldehyde", async () => {
    const got = await products("wacker-tsuji-oxidation", ["C=CCCCCC"]);
    assert.equal(got.length, 1);
    assert.ok(!got.includes(await canon("CCCCCCC=O")));
  });
});

// ---------------------------------------------------------------------------------------------
describe("ring-closing metathesis", () => {
  const cases = [
    ["ring-closing-metathesis-5", "C=CCCCC=C", "C1=CCCC1", "cyclopentene from 1,6-heptadiene"],
    ["ring-closing-metathesis-6", "C=CCCCCC=C", "C1=CCCCC1", "cyclohexene from 1,7-octadiene"],
    ["ring-closing-metathesis-7", "C=CCCCCCC=C", "C1=CCCCCC1", "cycloheptene from 1,8-nonadiene"],
    ["ring-closing-metathesis-8", "C=CCCCCCCC=C", "C1=CCCCCCC1", "cis-cyclooctene skeleton from 1,9-decadiene"],
    ["ring-closing-metathesis-6", "C=CCOCCC=C", "C1=CCOCC1", "3,6-dihydro-2H-pyran (heteroatom in the tether)"],
    ["ring-closing-metathesis-5", "C=CCN(C(=O)OC(C)(C)C)CC=C", "CC(C)(C)OC(=O)N1CC=CC1", "N-Boc-3-pyrroline"],
    ["ring-closing-metathesis-5", "C=Cc1ccccc1CC=C", "C1=Cc2ccccc2C1", "indene (aryl-fused ring)"],
  ];
  for (const [ruleId, diene, ring, label] of cases) {
    test(`[engine] ${label}`, () => expectProduct(ruleId, [diene], ring));
  }
  test("[scope] the ring-size rule only fires for its own tether length", async () => {
    await expectNothing("ring-closing-metathesis-6", ["C=CCCCC=C"]); // 1,6-heptadiene closes to a 5-ring
    await expectNothing("ring-closing-metathesis-5", ["C=CCCCCC=C"]);
    await expectNothing("ring-closing-metathesis-5", ["C=CCCC=C"]); // would be a cyclobutene
  });
  test("[scope] internal alkenes and conjugated dienes are refused", async () => {
    for (const rule of ["ring-closing-metathesis-5", "ring-closing-metathesis-6"]) {
      await expectNothing(rule, ["CC=CCCCC=CC"]);
      await expectNothing(rule, ["C=CC=CCC=C"]);
    }
  });
  test("[stereo] a tether stereocentre survives and the metathesis creates no stereo label of its own", async () => {
    const got = await products("ring-closing-metathesis-6", ["C=CC[C@H](O)CCC=C"]);
    assert.deepEqual(got, [await canon("O[C@H]1CC=CCC1")]);
    assert.deepEqual(cipOf("O[C@H]1CC=CCC1").length, 1);
  });
  test("[stereo] a diene whose tether stereocentre becomes symmetric loses the label (4-methylcyclopentene)", async () => {
    assert.deepEqual(await products("ring-closing-metathesis-5", ["C=CC[C@H](C)CC=C"]), [await canon("CC1CC=CC1")]);
  });
  test("[alternatives] a triene keeps its third alkene and each ring size is its own rule", async () => {
    const triene = "C=CCCC(CC=C)CCC=C";
    await expectProduct("ring-closing-metathesis-6", [triene], "C=CCCC1CC=CCC1");
    await expectProduct("ring-closing-metathesis-7", [triene], "C=CCC1CCC=CCC1");
  });

});

// ---------------------------------------------------------------------------------------------
describe("Mitsunobu substitution", () => {
  test("[stereo] a secondary alcohol is inverted: (R)-butan-2-ol + AcOH gives the (S)-acetate", async () => {
    const alcohol = "C[C@@H](O)CC";
    assert.deepEqual(cipOf(alcohol), ["R"]);
    const got = await products("mitsunobu-secondary-inversion", [alcohol, "CC(=O)O"]);
    assert.equal(got.length, 1);
    assert.deepEqual(cipOf(got[0]), ["S"]);
    assert.equal(got[0], await canon("CC[C@H](C)OC(C)=O"));
  });
  test("[stereo] the enantiomer inverts the other way, and Fischer esterification retains (contrast)", async () => {
    const alcohol = "C[C@H](O)CC";
    assert.deepEqual(cipOf(alcohol), ["S"]);
    const got = await products("mitsunobu-secondary-inversion", [alcohol, "OC(=O)c1ccccc1"]);
    assert.deepEqual(cipOf(got[0]), ["R"]);
    const retained = await products("fischer-esterification", [alcohol, "OC(=O)c1ccccc1"]);
    assert.deepEqual(cipOf(retained[0]), ["S"]);
  });
  test("[stereo] a ring carbinol is inverted too (cis/trans-relevant substrate)", async () => {
    const got = await products("mitsunobu-secondary-inversion", ["O[C@H]1CC=CCC1", "CC(=O)O"]);
    assert.deepEqual(got, [await canon("CC(=O)O[C@@H]1CC=CCC1")]);
  });
  test("[engine] phenol and imide pronucleophiles give the aryl ether and N-alkyl imide, also with inversion", async () => {
    const alcohol = "C[C@H](O)CC";
    await expectProduct("mitsunobu-secondary-inversion", [alcohol, "Oc1ccc(cc1)[N+](=O)[O-]"], "CC[C@@H](C)Oc1ccc([N+](=O)[O-])cc1");
    await expectProduct("mitsunobu-secondary-inversion", [alcohol, "O=C1NC(=O)c2ccccc12"], "CC[C@@H](C)N1C(=O)c2ccccc2C1=O");
  });
  test("[engine] a primary alcohol is substituted without any stereo claim", async () => {
    await expectProduct("mitsunobu-primary", ["CCCO", "CC(=O)O"], "CCCOC(C)=O");
    await expectProduct("mitsunobu-primary", ["OCc1ccccc1", "Oc1ccccc1"], "c1ccc(COc2ccccc2)cc1");
  });
  test("[engine] an achiral secondary alcohol still reacts (no stereo is invented)", () =>
    expectProduct("mitsunobu-secondary-inversion", ["CC(C)O", "CC(=O)O"], "CC(C)OC(C)=O"));
  test("[scope] tertiary alcohols, non-acidic nucleophiles and a missing partner give nothing", async () => {
    await expectNothing("mitsunobu-secondary-inversion", ["CC(C)(C)O", "CC(=O)O"]);
    await expectNothing("mitsunobu-secondary-inversion", ["C[C@H](O)CC", "CCO"]);
    await expectNothing("mitsunobu-primary", ["CC(C)O", "CC(=O)O"]);
    await expectNothing("mitsunobu-secondary-inversion", ["C[C@H](O)CC"]);
  });
  test("[inventory] the alcohol and the pronucleophile are consumed; no reagent or by-product lots appear", async () => {
    const created = await ws.createWorkspace(["C[C@@H](O)CC", "CC(=O)O"]);
    assert.ok(created.ok);
    const done = await ws.runWorkspaceScript(created.workspace, [{ ruleId: "mitsunobu-secondary-inversion", reactants: [{ material: 0 }, { material: 1 }] }], registry);
    assert.equal(done.history[0].status, "reaction");
    assert.equal(done.history[0].consumedLotIds.length, 2);
    const live = ws.workspaceInventory(done).live;
    assert.equal(live.length, 1);
    assert.equal(await canon(live[0].smiles), await canon("CC[C@H](C)OC(C)=O"));
  });
});

// ---------------------------------------------------------------------------------------------
describe("benzilic acid rearrangement", () => {
  test("[engine] benzil gives benzilic acid", () =>
    expectProduct("benzilic-acid-rearrangement", ["O=C(c1ccccc1)C(=O)c1ccccc1"], "OC(=O)C(O)(c1ccccc1)c1ccccc1"));
  test("[engine] pivalil (2,2,5,5-tetramethylhexane-3,4-dione) gives the tertiary alpha-hydroxy acid", () =>
    expectProduct("benzilic-acid-rearrangement", ["CC(C)(C)C(=O)C(=O)C(C)(C)C"], "CC(C)(C)C(O)(C(=O)O)C(C)(C)C"));
  test("[engine] an unsymmetrical diaryl diketone gives the unsymmetrical product with no stereo label", async () => {
    const got = await products("benzilic-acid-rearrangement", ["O=C(c1ccc(C)cc1)C(=O)c1ccccc1"]);
    assert.deepEqual(got, [await canon("Cc1ccc(C(O)(C(=O)O)c2ccccc2)cc1")]);
    assert.deepEqual(cipOf(got[0]), [], "no enantiomer may be asserted");
  });
  test("[engine] 9,10-phenanthrenequinone ring-contracts to 9-hydroxyfluorene-9-carboxylic acid", () =>
    expectProduct("benzilic-acid-rearrangement", ["O=C1C(=O)c2ccccc2-c2ccccc12"], "OC(=O)C1(O)c2ccccc2-c2ccccc12"));
  test("[engine] cyclohexane-1,2-dione and cycloheptane-1,2-dione ring-contract by one carbon", async () => {
    await expectProduct("benzilic-acid-ring-contraction", ["O=C1CCCCC1=O"], "OC(=O)C1(O)CCCC1");
    await expectProduct("benzilic-acid-ring-contraction", ["O=C1CCCCCC1=O"], "OC(=O)C1(O)CCCCC1");
  });
  test("[scope] enolizable acyclic diketones, 1,3-diketones and 1,2-diketones in 5-rings are refused", async () => {
    await expectNothing("benzilic-acid-rearrangement", ["CC(=O)C(C)=O"]);
    await expectNothing("benzilic-acid-rearrangement", ["CC(=O)CC(C)=O"]);
    await expectNothing("benzilic-acid-ring-contraction", ["O=C1CCCC1=O"]);
    await expectNothing("benzilic-acid-ring-contraction", ["CC(=O)C(C)=O"]);
  });
  test("[engine] atom accounting: product = diketone + H2O (the hydroxide contribution is the only added atoms)", async () => {
    const formula = (smiles) => {
      const mol = rdkit.get_mol(smiles);
      try { return JSON.parse(mol.get_descriptors()).exactmw; } finally { mol.delete(); }
    };
    const delta = formula("OC(=O)C(O)(c1ccccc1)c1ccccc1") - formula("O=C(c1ccccc1)C(=O)c1ccccc1");
    assert.ok(Math.abs(delta - 18.0106) < 0.01, `mass change ${delta}`);
  });
});

// ---------------------------------------------------------------------------------------------
describe("pinacol coupling", () => {
  test("[engine] acetone coupled with itself gives pinacol", () =>
    expectProduct("pinacol-coupling", ["CC(C)=O", "CC(C)=O"], "CC(C)(O)C(C)(C)O"));
  test("[engine] benzaldehyde coupled with itself gives hydrobenzoin (stereo not assigned)", async () => {
    const got = await products("pinacol-coupling", ["O=Cc1ccccc1", "O=Cc1ccccc1"]);
    assert.deepEqual(got, [await canon("OC(c1ccccc1)C(O)c1ccccc1")]);
    assert.deepEqual(cipOf(got[0]), [], "dl/meso must not be silently chosen");
  });
  test("[engine] two different carbonyls give the crossed diol only", async () => {
    assert.deepEqual(await products("pinacol-coupling", ["CC(=O)c1ccccc1", "O=CC"]), [await canon("CC(O)C(C)(O)c1ccccc1")]);
  });
  test("[scope] enones, esters, acids and a single carbonyl give nothing", async () => {
    await expectNothing("pinacol-coupling", ["CC(=O)C=C", "CC(C)=O"]);
    await expectNothing("pinacol-coupling", ["CC(=O)OC", "CC(C)=O"]);
    await expectNothing("pinacol-coupling", ["CC(=O)O", "CC(C)=O"]);
    await expectNothing("pinacol-coupling", ["CC(C)=O"]);
  });
  test("[inventory] homocoupling consumes two copies of the ketone, one product remains", async () => {
    const one = await ws.createWorkspace(["CC(C)=O"]);
    const failed = await ws.runWorkspaceScript(one.workspace, [{ ruleId: "pinacol-coupling", reactants: [{ material: 0 }] }], registry);
    assert.notEqual(failed.history[0].status, "reaction", "one molecule must not couple with itself");
    assert.equal(ws.workspaceInventory(failed).live.length, 1);
    const two = await ws.createWorkspace(["CC(C)=O", "CC(C)=O"]);
    const live0 = ws.workspaceInventory(two.workspace).live;
    const done = await ws.runWorkspaceScript(two.workspace, [{ ruleId: "pinacol-coupling", reactants: live0.map((lot) => lot.id) }], registry);
    assert.equal(done.history[0].status, "reaction");
    const live = ws.workspaceInventory(done).live;
    assert.equal(live.length, 1);
    assert.equal(await canon(live[0].smiles), await canon("CC(C)(O)C(C)(C)O"));
  });
});

// ---------------------------------------------------------------------------------------------
describe("ketonic decarboxylation", () => {
  test("[engine] two acetic acids give acetone", () => expectProduct("ketonic-decarboxylation", ["CC(=O)O", "CC(=O)O"], "CC(C)=O"));
  test("[engine] two propanoic acids give pentan-3-one", () => expectProduct("ketonic-decarboxylation", ["CCC(=O)O", "CCC(=O)O"], "CCC(=O)CC"));
  test("[alternatives] two different acids give the crossed ketone (both role assignments; one constitution here)", async () => {
    assert.deepEqual(await products("ketonic-decarboxylation", ["CC(=O)O", "CCC(=O)O"]), [await canon("CCC(C)=O")].sort());
  });
  test("[engine] an aryl acid with acetic acid gives acetophenone", () =>
    expectProduct("ketonic-decarboxylation", ["OC(=O)c1ccccc1", "CC(=O)O"], "CC(=O)c1ccccc1"));
  test("[scope] a single acid, an ester or an acid chloride give nothing", async () => {
    await expectNothing("ketonic-decarboxylation", ["CC(=O)O"]);
    await expectNothing("ketonic-decarboxylation", ["CC(=O)OC", "CC(=O)O"]);
    await expectNothing("ketonic-decarboxylation", ["CC(=O)Cl", "CC(=O)O"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("Dieckmann condensation", () => {
  test("[engine] diethyl adipate gives ethyl 2-oxocyclopentanecarboxylate", () =>
    expectProduct("dieckmann-condensation-5", ["CCOC(=O)CCCCC(=O)OCC"], "CCOC(=O)C1CCCC1=O"));
  test("[engine] diethyl pimelate gives the six-membered ring (second substrate and ring size)", () =>
    expectProduct("dieckmann-condensation-6", ["CCOC(=O)CCCCCC(=O)OCC"], "CCOC(=O)C1CCCCC1=O"));
  test("[engine] dimethyl suberate gives the seven-membered ring", () =>
    expectProduct("dieckmann-condensation-7", ["COC(=O)CCCCCCC(=O)OC"], "COC(=O)C1CCCCCC1=O"));
  test("[alternatives] an unsymmetrical 3-methyladipate closes in both directions, unranked", async () => {
    const got = await products("dieckmann-condensation-5", ["CCOC(=O)CCC(C)CC(=O)OCC"]);
    assert.deepEqual(got, (await Promise.all(["CCOC(=O)C1CC(C)CC1=O", "CCOC(=O)C1C(=O)CCC1C"].map(canon))).sort());
  });
  test("[scope] a wrong tether length, a malonate and a mono-ester give nothing", async () => {
    await expectNothing("dieckmann-condensation-6", ["CCOC(=O)CCCCC(=O)OCC"]);
    await expectNothing("dieckmann-condensation-5", ["CCOC(=O)CCCCCC(=O)OCC"]);
    await expectNothing("dieckmann-condensation-5", ["CCOC(=O)CCC"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("acetoacetic ester and malonic ester syntheses (now executable)", () => {
  test("[engine] ethyl acetoacetate + ethyl bromide alkylates at the active carbon", () =>
    expectProduct("acetoacetic-ester-alkylation", ["CC(=O)CC(=O)OCC", "CCBr"], "CCOC(=O)C(CC)C(C)=O"));
  test("[engine] a cyclic beta-keto ester + benzyl bromide gives the quaternary alpha-benzyl product", () =>
    expectProduct("acetoacetic-ester-alkylation", ["CCOC(=O)C1CCCC1=O", "BrCc1ccccc1"], "CCOC(=O)C1(Cc2ccccc2)CCCC1=O"));
  test("[engine] diethyl malonate + allyl bromide", () =>
    expectProduct("malonic-ester-alkylation", ["CCOC(=O)CC(=O)OCC", "C=CCBr"], "C=CCC(C(=O)OCC)C(=O)OCC"));
  test("[engine] hydrolysis/decarboxylation gives the ketone and the carboxylic acid respectively", async () => {
    await expectProduct("beta-keto-ester-hydrolysis-decarboxylation", ["CCOC(=O)C1(Cc2ccccc2)CCCC1=O"], "O=C1CCCC1Cc1ccccc1");
    await expectProduct("beta-keto-ester-hydrolysis-decarboxylation", ["CCOC(=O)C(CC)C(C)=O"], "CCCC(C)=O");
    await expectProduct("malonic-ester-hydrolysis-decarboxylation", ["CCOC(=O)C(CC=C)C(=O)OCC"], "C=CCCC(=O)O");
  });
  test("[scope] secondary halides, the wrong active-methylene class and plain esters give nothing", async () => {
    await expectNothing("acetoacetic-ester-alkylation", ["CC(=O)CC(=O)OCC", "CC(C)Br"]);
    await expectNothing("acetoacetic-ester-alkylation", ["CCOC(=O)CC(=O)OCC", "CCBr"]);
    await expectNothing("malonic-ester-alkylation", ["CC(=O)CC(=O)OCC", "CCBr"]);
    await expectNothing("beta-keto-ester-hydrolysis-decarboxylation", ["CCOC(=O)CC(=O)OCC"]);
    await expectNothing("acetoacetic-ester-alkylation", ["CC(=O)CC(=O)OCC"]);
  });
  test("[scope] the old concept-only entry is untouched and still produces no structure", async () => {
    assert.equal(registry.find((item) => item.id === "malonic-acetoacetic-synthesis").transform.type, "conceptOnly");
  });
});

// ---------------------------------------------------------------------------------------------
describe("retrosynthesis proposes the disconnections", () => {
  const proposals = async (target, ruleId) => {
    const pathways = await retro.predictRetrosynthesisPathwaysFromRules(target, registry, { planning: true, maxResults: 36, maxTransformsExecuted: 28 });
    const out = [];
    for (const pathway of pathways) {
      for (const route of [pathway, ...(pathway.alternativeRoutes ?? [])]) {
        if ((route.ruleId ?? pathway.ruleId) === ruleId) out.push(pathway.precursorComponents);
      }
    }
    return out;
  };
  // exact: the precursor set must equal the expected one. replay-only: the leaving alkoxide of an ester
  // condensation is not recoverable from the product, so the precursor is accepted when the forward rule
  // turns it back into the target (never when it merely looks plausible).
  const cases = [
    ["cyclohexene from 1,7-octadiene (RCM)", "C1=CCCCC1", "ring-closing-metathesis-6", ["C=CCCCCC=C"], true],
    ["2-heptanone from 1-heptene (Wacker-Tsuji)", "CCCCCC(C)=O", "wacker-tsuji-oxidation", ["C=CCCCCC"], true],
    ["inverted ester from the alcohol and the acid (Mitsunobu)", "CC[C@H](C)OC(C)=O", "mitsunobu-secondary-inversion", ["CC(=O)O", "C[C@@H](O)CC"], true],
    ["benzilic acid from benzil", "OC(=O)C(O)(c1ccccc1)c1ccccc1", "benzilic-acid-rearrangement", ["O=C(c1ccccc1)C(=O)c1ccccc1"], true],
    ["pinacol from two acetones", "CC(C)(O)C(C)(C)O", "pinacol-coupling", ["CC(C)=O", "CC(C)=O"], true],
    ["ethyl 2-oxocyclopentanecarboxylate from an adipate diester (Dieckmann)", "CCOC(=O)C1CCCC1=O", "dieckmann-condensation-5", null, false],
    ["2-benzylcyclopentanone from a beta-keto ester (acetoacetic decarboxylation)", "O=C1CCCC1Cc1ccccc1", "beta-keto-ester-hydrolysis-decarboxylation", null, false],
  ];
  for (const [label, target, ruleId, precursors, exact] of cases) {
    test(`[retro] ${label}`, async () => {
      const found = await proposals(target, ruleId);
      assert.ok(found.length > 0, `${ruleId} not proposed for ${target}`);
      const targetKey = await canon(target);
      let replayed = false;
      for (const precursorSet of found) {
        const forward = await products(ruleId, precursorSet);
        if (forward.some((set) => set.split(".").includes(targetKey))) replayed = true;
      }
      assert.ok(replayed, `no ${ruleId} precursor replays forward to ${target}`);
      if (exact) {
        const want = (await canonSet(precursors)).join(".");
        const got = await Promise.all(found.map(async (set) => (await canonSet(set)).join(".")));
        assert.ok(got.includes(want), `expected ${want}, got ${got.join(" | ")}`);
      }
    });
  }
});
