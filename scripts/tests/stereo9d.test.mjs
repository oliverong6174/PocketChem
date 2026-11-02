// Stage 9D Phase B: stereochemical corrections shared by the workspace/planner engine and the
// Reactions-page layer. Expected stereochemistry is stated from mechanism (anti addition to an E alkene
// gives the (R,S)/meso dibromide, etc.), never copied from a PocketChem output. Unspecified
// stereochemistry stays unspecified; an achiral reaction creating one new stereocentre is racemic.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine, loadModule } from "./engine.mjs";

let utils;
let registry;
let engine;
let groups;
let stereo;
let ws;
let rd;
const BS = String.fromCharCode(92);
const Z2 = `C/C=C${BS}C`;

before(async () => {
  ({ utils } = await loadEngine());
  registry = utils.reactionRegistry;
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  groups = await loadModule("/src/utils/functionalGroups/index.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  rd = await getRdkit();
});

after(async () => {
  await closeEngine();
});

const rule = (id) => registry.find((item) => item.id === id);
const base = async (ruleId, smiles) => engine.predictReactionPathwaysFromRules(smiles, [], [rule(ruleId)], { planning: true });
const page = async (ruleId, smiles) => {
  const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles);
  return (await utils.predictReactionPathways(smiles, hierarchy.primaryGroups)).filter((item) => item.ruleId === ruleId);
};
const cip = (smiles) => {
  const mol = rd.get_mol(smiles);
  try {
    return JSON.parse(mol.get_stereo_tags()).CIP_atoms.map((entry) => String(entry[1]).replace(/[()]/g, "")).sort().join("");
  } finally {
    mol.delete();
  }
};
const hasStereo = (smiles) => /@/.test(smiles);
const canon = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;
/** Distinct stereo-descriptor sets over every member of every pathway (mixtures expanded). */
const labels = (pathways) => [...new Set(pathways.flatMap((item) => (item.productMixture?.memberSmiles?.length ? item.productMixture.memberSmiles : [item.productSmiles])).map(cip))].sort();

describe("anti bromination is stereospecific (OpenStax 8.2: bromonium ion, anti addition)", () => {
  test("[engine] E-2-butene gives the meso dibromide (2R,3S), one compound", async () => {
    for (const layer of [base, page]) {
      const out = await layer("alkene-halogenation-bromine", "C/C=C/C");
      assert.deepEqual(labels(out), ["RS"]);
      assert.equal(out.length, 1);
    }
  });
  test("[engine] Z-2-butene gives the racemic (2R,3R)/(2S,3S) dibromide", async () => {
    const out = await base("alkene-halogenation-bromine", Z2);
    assert.deepEqual(labels(out), ["RR", "SS"]);
    assert.equal(out[0].productMixture.kind, "racemic");
    const shown = await page("alkene-halogenation-bromine", Z2);
    assert.equal(shown[0].productMixture.kind, "racemic");
    assert.equal(shown[0].productMixture.memberSmiles.length, 2);
  });
  test("[engine] cyclohexene gives trans-1,2-dibromocyclohexane as a racemate, never the cis compound", async () => {
    for (const layer of [base, page]) {
      const out = await layer("alkene-halogenation-bromine", "C1CCC=CC1");
      assert.deepEqual(labels(out), ["RR", "SS"]);
      assert.equal(out[0].productMixture.kind, "racemic");
    }
  });
  test("[engine] E-2-pentene (unsymmetrical) keeps the same relationship as E-2-butene: (R,S)-type, racemic pair", async () => {
    const out = await base("alkene-halogenation-bromine", "CC/C=C/C");
    assert.deepEqual(labels(out), ["RS"]);
    assert.equal(out[0].productMixture.memberSmiles.length, 2);
  });
  test("[engine] unspecified geometry stays unspecified in both layers (no invented diastereomer)", async () => {
    for (const layer of [base, page]) {
      const out = await layer("alkene-halogenation-bromine", "CC=CC");
      assert.equal(out.length, 1);
      assert.equal(hasStereo(out[0].productSmiles), false);
    }
    const shown = await page("alkene-halogenation-bromine", "CC=CC");
    assert.ok(shown[0].limitations.some((text) => /alkene geometry is not specified/.test(text)));
  });
});

describe("Simmons-Smith and dihalocyclopropanation keep the alkene's cis/trans relationship", () => {
  test("[engine] Z-2-butene gives cis-1,2-dimethylcyclopropane (meso); E gives the trans racemate", async () => {
    for (const layer of [base, page]) {
      assert.deepEqual(labels(await layer("alkene-simmons-smith", Z2)), ["RS"]);
      const trans = await layer("alkene-simmons-smith", "C/C=C/C");
      assert.deepEqual(labels(trans), ["RR", "SS"]);
      assert.equal(trans[0].productMixture.kind, "racemic");
    }
  });
  test("[engine] cyclohexene gives cis-fused norcarane only", async () => {
    for (const layer of [base, page]) {
      const out = await layer("alkene-simmons-smith", "C1CCC=CC1");
      assert.equal(out.length, 1);
      assert.deepEqual(labels(out), ["RS"]);
    }
  });
  test("[engine] dichloro- and dibromocyclopropanation follow the same rule", async () => {
    for (const id of ["alkene-dichlorocyclopropanation", "alkene-dibromocyclopropanation"]) {
      const z = await base(id, Z2);
      const e = await base(id, "C/C=C/C");
      assert.equal(z.length, 1, `${id}: Z gives one (meso) compound`);
      assert.equal(z[0].productMixture, null);
      assert.equal(e[0].productMixture.kind, "racemic", `${id}: E gives a racemate`);
      assert.notEqual(await canon(z[0].productSmiles), await canon(e[0].productSmiles));
    }
  });
  test("[engine] unspecified geometry and terminal alkenes stay unspecified", async () => {
    for (const smiles of ["CC=CC", "C=CCC"]) {
      const out = await base("alkene-simmons-smith", smiles);
      assert.equal(out.length, 1);
      assert.equal(hasStereo(out[0].productSmiles), false);
    }
  });
});

describe("ring alkene dihydroxylation: only the relationship the mechanism allows", () => {
  test("[engine] syn (OsO4) gives the cis diol alone; anti (epoxide opening) gives trans as a racemate alone", async () => {
    for (const layer of [base, page]) {
      const cis = await layer("alkene-syn-dihydroxylation", "C1CCC=CC1");
      assert.equal(cis.length, 1);
      assert.deepEqual(labels(cis), ["RS"]);
      assert.equal(cis[0].productMixture, null);
      const trans = await layer("alkene-anti-dihydroxylation", "C1CCC=CC1");
      assert.deepEqual(labels(trans), ["RR", "SS"]);
      assert.equal(trans[0].productMixture.kind, "racemic");
    }
  });
  test("[engine] cyclopentene behaves the same (5-membered ring)", async () => {
    assert.deepEqual(labels(await base("alkene-syn-dihydroxylation", "C1CC=CC1")), ["RS"]);
    assert.deepEqual(labels(await base("alkene-anti-dihydroxylation", "C1CC=CC1")), ["RR", "SS"]);
  });
  test("[engine] acyclic E/Z behavior is unchanged", async () => {
    assert.deepEqual(labels(await base("alkene-syn-dihydroxylation", Z2)), ["RS"]);
    assert.deepEqual(labels(await base("alkene-syn-dihydroxylation", "C/C=C/C")), ["RR", "SS"]);
    assert.deepEqual(labels(await base("alkene-anti-dihydroxylation", "C/C=C/C")), ["RS"]);
    assert.deepEqual(labels(await base("alkene-anti-dihydroxylation", Z2)), ["RR", "SS"]);
  });
});

describe("the Reactions page shows enantiomeric mixtures honestly", () => {
  test("[engine] a terminal alkene epoxide is a racemate with both enantiomers, not one arbitrary enantiomer", async () => {
    for (const [id, smiles] of [["alkene-epoxidation", "C=CCC"], ["alkene-halogenation-bromine", "C=CCC"]]) {
      const out = await page(id, smiles);
      assert.equal(out.length, 1, id);
      const mixture = out[0].productMixture;
      assert.equal(mixture.kind, "racemic", `${id}: the product of an achiral reaction at a prochiral face is racemic`);
      assert.equal(mixture.memberSmiles.length, 2);
      assert.deepEqual(mixture.memberSmiles.map(cip).sort(), ["R", "S"]);
    }
  });
  test("[engine] unspecified acyclic alkenes are not given an arbitrary diastereomer by the page layer", async () => {
    for (const id of ["alkene-epoxidation", "alkene-halogenation-bromine"]) {
      const out = await page(id, "CC=CC");
      assert.equal(hasStereo(out[0].productSmiles), false, id);
    }
  });
  test("[engine] defined-geometry results agree between the two layers", async () => {
    for (const id of ["alkene-epoxidation", "alkene-halogenation-bromine", "alkene-simmons-smith", "alkene-syn-dihydroxylation", "alkene-anti-dihydroxylation"]) {
      for (const smiles of ["C/C=C/C", Z2, "C1CCC=CC1"]) {
        const fromBase = await base(id, smiles);
        const fromPage = await page(id, smiles);
        const members = new Set(await Promise.all(fromBase.flatMap((item) => item.productMixture?.memberSmiles ?? [item.productSmiles]).map(canon)));
        assert.ok(members.has(await canon(fromPage[0].productSmiles)), `${id} ${smiles}: the page representative is a member of the engine's result`);
      }
    }
  });
});

describe("corrections preserve identity and material accounting", () => {
  test("[engine] isotopes and charges survive the stereospecific templates", async () => {
    const labelled = await base("alkene-halogenation-bromine", `[13CH3]/C=C/C`);
    assert.match(labelled[0].productSmiles, /13/);
    const charged = await base("alkene-epoxidation", "C[N+](C)(C)C/C=C/C");
    assert.match(charged[0].productSmiles, /\[N\+\]/);
    assert.equal(charged[0].productMixture.kind, "racemic", "the trans epoxide is still the racemate");
  });
  test("[engine] connectivity equals the plain constitutional product (stereo is added, nothing else changes)", async () => {
    for (const [id, smiles, plain] of [
      ["alkene-epoxidation", "C/C=C/C", "CC1OC1C"],
      ["alkene-halogenation-bromine", Z2, "CC(Br)C(C)Br"],
      ["alkene-simmons-smith", "C/C=C/C", "CC1CC1C"],
    ]) {
      const out = await base(id, smiles);
      const connectivity = (await stereo.canonicalizeStereoStructure(out[0].productSmiles)).connectivity;
      assert.equal(connectivity, (await stereo.canonicalizeStereoStructure(plain)).connectivity, id);
    }
  });
  test("[engine] in the workspace a racemate is one lot that consumed exactly one alkene, and replay verifies", async () => {
    const created = await ws.createWorkspace(["C/C=C/C"]);
    const done = await ws.runWorkspaceScript(created.workspace, [{ ruleId: "alkene-halogenation-bromine", reactants: [{ material: 0 }] }], registry);
    assert.equal(done.history[0].status, "reaction");
    assert.equal(done.pool.lots.filter((lot) => lot.availability === "live").length, 1);
    assert.equal(done.pool.lots.find((lot) => lot.id === "sm0#1").availability, "consumed");
    const assessed = await ws.assessWorkspace(done, registry);
    assert.notEqual(assessed.verification.status, "failed", assessed.verification.problems.join(" | "));
    const zWorkspace = await ws.runWorkspaceScript((await ws.createWorkspace([Z2])).workspace, [{ ruleId: "alkene-halogenation-bromine", reactants: [{ material: 0 }] }], registry);
    assert.equal(zWorkspace.history[0].outcomes[0].mixture.kind, "racemic");
    assert.equal(zWorkspace.history[0].outcomes[0].mixture.collapsed, true);
  });
});
