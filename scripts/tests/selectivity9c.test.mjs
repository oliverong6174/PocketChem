// Stage 9C: product selectivity and stereochemistry corrections (Heck, Friedel-Crafts, pinacol,
// epoxidation). All results come from the real registry through the workspace executor. The
// chemistry expectations are textbook/literature statements; every case that is not a
// reference-checked statement is labelled provisional in its title.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine, loadModule } from "./engine.mjs";

let registry;
let ws;
let stereo;
let rd;
const BS = String.fromCharCode(92); // a backslash, so Z-alkene SMILES do not depend on shell/JS escaping

before(async () => {
  const engine = await loadEngine();
  registry = engine.utils.reactionRegistry;
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  rd = await getRdkit();
});

after(async () => {
  await closeEngine();
});

async function outcomes(ruleId, starts) {
  const created = await ws.createWorkspace(starts);
  const lotIds = starts.map((_, index) => `sm${index}#1`);
  const result = await ws.executeWorkspaceStep(created.workspace, { ruleId, lotIds }, registry);
  return result.step;
}

const canon = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;
const cipLabels = (smiles) => {
  const mol = rd.get_mol(smiles);
  try {
    return JSON.parse(mol.get_stereo_tags()).CIP_atoms.map((entry) => String(entry[1]).replace(/[()]/g, "")).sort().join("");
  } finally {
    mol.delete();
  }
};
const classOf = (step, productSmiles) => step.outcomes.find((item) => item.productSmiles === productSmiles)?.selectivityFinding.class;

describe("Heck coupling: E geometry and qualitative regiochemistry (Beletskaya & Cheprakov, Chem. Rev. 2000, 100, 3009)", () => {
  test("[engine] aryl bromide + methyl acrylate: (E)-methyl cinnamate is major, the alpha-aryl acrylate is minor", async () => {
    const step = await outcomes("heck-coupling", ["Brc1ccccc1", "C=CC(=O)OC"]);
    assert.equal(step.status, "needs-selection");
    assert.equal(step.outcomes.length, 2);
    const linear = step.outcomes[0];
    assert.equal(linear.productSmiles, await canon(`COC(=O)/C=C/c1ccccc1`));
    assert.equal(linear.selectivity.level, "major");
    assert.equal(linear.selectivityFinding.class, "major");
    assert.equal(linear.selectivity.estimatedFraction, null, "a qualitative preference carries no invented fraction");
    assert.match(linear.selectivity.basis, /Chem\. Rev\. 2000/);
    const branched = step.outcomes[1];
    assert.equal(branched.productSmiles, "C=C(C(=O)OC)c1ccccc1");
    assert.equal(branched.selectivityFinding.class, "disfavored");
    assert.match(linear.selectivity.basis, /not a measured ratio/);
  });

  test("[engine] styrene gives (E)-stilbene as the major product", async () => {
    const step = await outcomes("heck-coupling", ["Brc1ccccc1", "C=Cc1ccccc1"]);
    assert.equal(step.outcomes[0].selectivityFinding.class, "major");
    const stilbene = step.outcomes[0].productSmiles;
    assert.equal(stilbene, await canon("c1ccccc1/C=C/c1ccccc1"), "E geometry is kept in the product");
  });

  test("[engine] alkyl and electron-rich alkenes stay unranked: no preference is claimed without a source", async () => {
    for (const alkene of ["C=CCCCC", "C=COCC"]) {
      const step = await outcomes("heck-coupling", ["Brc1ccccc1", alkene]);
      assert.equal(step.status, "needs-selection", alkene);
      assert.ok(step.outcomes.every((item) => item.selectivityFinding.class === "unranked"), alkene);
    }
  });

  test("[engine] alkenes the templates do not cover keep the plain behavior (every site, no geometry invented)", async () => {
    const step = await outcomes("heck-coupling", ["Brc1ccccc1", "CC(C)=C"]);
    assert.ok(step.outcomes.length >= 1);
    assert.ok(step.outcomes.every((item) => item.selectivityFinding.class !== "major"));
  });

  test("the rule documents what it does not model", () => {
    const rule = registry.find((item) => item.id === "heck-coupling");
    assert.ok(rule.limitations.some((text) => /Ligand, base, Pd source/.test(text)));
    assert.ok(rule.productPreferences.every((item) => item.references.length > 0 && item.level !== undefined));
  });
});

describe("Friedel-Crafts: ring positions ranked by directing effects, qualitatively", () => {
  test("[engine] toluene + 2-chloropropane: para favored, ortho competitive, meta disfavored", async () => {
    const step = await outcomes("aromatic-friedel-crafts-alkylation", ["Cc1ccccc1", "CC(C)Cl"]);
    assert.equal(classOf(step, "Cc1ccc(C(C)C)cc1"), "major");
    assert.equal(classOf(step, "Cc1ccccc1C(C)C"), "unranked", "competitive is not a ranking in favour of either");
    assert.equal(classOf(step, "Cc1cccc(C(C)C)c1"), "disfavored");
    const para = step.outcomes.find((item) => item.productSmiles === "Cc1ccc(C(C)C)cc1");
    assert.match(para.selectivity.basis, /ortho\/para ratio.*not modeled/);
    assert.equal(para.selectivity.estimatedFraction, null);
  });

  test("[engine] anisole acylation: 4-methoxyacetophenone is the favored product", async () => {
    const step = await outcomes("aromatic-friedel-crafts-acylation", ["COc1ccccc1", "CC(=O)Cl"]);
    assert.equal(classOf(step, "COc1ccc(C(C)=O)cc1"), "major");
    assert.equal(classOf(step, "COc1cccc(C(C)=O)c1"), "disfavored");
  });

  test("[engine] chlorobenzene (an o/p-directing deactivator) acylates para", async () => {
    const step = await outcomes("aromatic-friedel-crafts-acylation", ["Clc1ccccc1", "CC(=O)Cl"]);
    assert.equal(classOf(step, "CC(=O)c1ccc(Cl)cc1"), "major");
  });

  test("[engine] benzene has one product, so nothing is ranked and it is a single outcome", async () => {
    const step = await outcomes("aromatic-friedel-crafts-alkylation", ["c1ccccc1", "CCCl"]);
    assert.equal(step.status, "reaction");
    assert.equal(step.outcomes[0].selectivityFinding.class, "single-outcome");
  });

  test("[engine] naphthalene is outside the simple benzene model: left unranked, not guessed", async () => {
    const step = await outcomes("aromatic-friedel-crafts-acylation", ["c1ccc2ccccc2c1", "CC(=O)Cl"]);
    assert.equal(step.status, "needs-selection");
    assert.ok(step.outcomes.every((item) => item.selectivity === null));
  });
});

describe("pinacol rearrangement: the more stable carbocation forms first, then H > aryl > alkyl migrate", () => {
  const cases = [
    ["propane-1,2-diol gives propanal (secondary cation, hydride shift)", "CC(O)CO", "CCC=O"],
    ["octane-1,2-diol gives octanal", "CCCCCCC(O)CO", "CCCCCCCC=O"],
    ["2-methylpropane-1,2-diol gives isobutyraldehyde (tertiary cation)", "CC(C)(O)CO", "CC(C)C=O"],
    ["1-phenylethane-1,2-diol gives phenylacetaldehyde (benzylic cation)", "OCC(O)c1ccccc1", "O=CCc1ccccc1"],
    ["pinacol gives pinacolone (methyl shift)", "CC(C)(O)C(C)(C)O", "CC(=O)C(C)(C)C"],
    ["3-methylbutane-2,3-diol gives 3-methylbutan-2-one (tertiary cation, hydride shift)", "CC(O)C(C)(C)O", "CC(=O)C(C)C"],
    ["cyclopentane-1,2-diol gives cyclopentanone (hydride shift, ring kept)", "OC1CCCC1O", "O=C1CCCC1"],
  ];
  for (const [title, diol, expected] of cases) {
    test(`[engine] ${title}`, async () => {
      const step = await outcomes("pinacol-rearrangement", [diol]);
      assert.equal(step.status, "reaction", `${diol}: ${step.explanation}`);
      assert.equal(step.outcomes.length, 1, "one cation-stability winner leaves a single outcome");
      assert.equal(step.outcomes[0].productSmiles, await canon(expected));
    });
  }

  test("[engine] the previously unranked aldehyde-or-ketone choice for a terminal 1,2-diol is gone", async () => {
    const step = await outcomes("pinacol-rearrangement", ["CCCCCCC(O)CO"]);
    assert.deepEqual(step.outcomes.map((item) => item.productSmiles), ["CCCCCCCC=O"], "2-octanone is no longer offered");
  });

  test("[engine] a symmetric diol is unaffected (both orientations are the same product)", async () => {
    const step = await outcomes("pinacol-rearrangement", ["CC(O)C(C)O"]);
    assert.deepEqual(step.outcomes.map((item) => item.productSmiles), ["CCC(C)=O"]);
  });
});

describe("epoxidation is stereospecific in the alkene geometry (syn addition of oxygen)", () => {
  test("[engine] Z-2-butene gives meso (cis) 2,3-dimethyloxirane, one compound", async () => {
    const step = await outcomes("alkene-epoxidation", [`C/C=C${BS}C`]);
    assert.equal(step.status, "reaction");
    assert.equal(step.outcomes.length, 1);
    const product = step.outcomes[0];
    assert.equal(cipLabels(product.productSmiles), "RS", "meso (2R,3S)");
    assert.equal(product.mixture, null);
  });

  test("[engine] E-2-butene gives the trans epoxide as a racemate: (2R,3R) and (2S,3S)", async () => {
    const step = await outcomes("alkene-epoxidation", ["C/C=C/C"]);
    const product = step.outcomes[0];
    assert.equal(product.mixture.kind, "racemic");
    assert.equal(product.mixture.collapsed, true);
    const members = product.mixture.memberSmiles.map(cipLabels).sort();
    assert.deepEqual(members, ["RR", "SS"]);
    assert.equal(cipLabels(product.productSmiles).length, 2);
    assert.notEqual(cipLabels(product.productSmiles), "RS");
  });

  test("[engine] E and Z give different diastereomers (the earlier behavior gave the same product for both)", async () => {
    const e = (await outcomes("alkene-epoxidation", ["C/C=C/C"])).outcomes[0];
    const z = (await outcomes("alkene-epoxidation", [`C/C=C${BS}C`])).outcomes[0];
    assert.notEqual(await canon(e.productSmiles), await canon(z.productSmiles));
  });

  test("[engine] trans-stilbene gives trans-stilbene oxide, (R,R)/(S,S) (reference configuration)", async () => {
    const step = await outcomes("alkene-epoxidation", ["c1ccccc1/C=C/c1ccccc1"]);
    assert.deepEqual(step.outcomes[0].mixture.memberSmiles.map(cipLabels).sort(), ["RR", "SS"]);
  });

  test("[engine] cis-stilbene gives meso cis-stilbene oxide, (R,S)", async () => {
    const step = await outcomes("alkene-epoxidation", [`c1ccccc1/C=C${BS}c1ccccc1`]);
    assert.equal(cipLabels(step.outcomes[0].productSmiles), "RS");
  });

  test("[engine] E and Z with different substituents keep the cis/trans relationship (2-pentene)", async () => {
    const trans = (await outcomes("alkene-epoxidation", ["CC/C=C/C"])).outcomes[0];
    const cis = (await outcomes("alkene-epoxidation", [`CC/C=C${BS}C`])).outcomes[0];
    assert.deepEqual(trans.mixture.memberSmiles.map(cipLabels).sort(), ["RR", "SS"]);
    assert.deepEqual(cis.mixture.memberSmiles.map(cipLabels).sort(), ["RS", "RS"], "both enantiomers of the cis epoxide are (R,S)/(S,R)");
  });

  test("[engine] a ring alkene gives the cis-fused epoxide (cyclohexene oxide is meso)", async () => {
    const step = await outcomes("alkene-epoxidation", ["C1CCC=CC1"]);
    assert.equal(step.outcomes.length, 1);
    assert.equal(cipLabels(step.outcomes[0].productSmiles), "RS");
  });

  test("[engine] with no defined geometry nothing is invented: the epoxide is constitution only", async () => {
    for (const [alkene, expected] of [["CC=CC", "CC1OC1C"], ["C=CCC", "CCC1CO1"]]) {
      const step = await outcomes("alkene-epoxidation", [alkene]);
      assert.equal(step.outcomes[0].productSmiles, expected);
      assert.equal(step.outcomes[0].mixture, null);
    }
  });

  test("[engine] a second alkene in the molecule is still offered, not swallowed by the geometry template", async () => {
    const step = await outcomes("alkene-epoxidation", [`C/C=C${BS}CC=C`]);
    const smiles = step.outcomes.map((item) => item.productSmiles);
    assert.ok(smiles.length >= 1);
    assert.ok(smiles.some((item) => /C=C/.test(item)), "the epoxide that leaves the other C=C intact is among the outcomes");
  });

  test("[engine] the stereo-defined epoxide replays through the workspace verifier", async () => {
    const created = await ws.createWorkspace(["c1ccccc1/C=C/c1ccccc1"]);
    const done = await ws.runWorkspaceScript(created.workspace, [{ ruleId: "alkene-epoxidation", reactants: [{ material: 0 }] }], registry);
    const assessed = await ws.assessWorkspace(done, registry);
    assert.notEqual(assessed.verification.status, "failed", assessed.verification.problems.join(" | "));
  });
});
