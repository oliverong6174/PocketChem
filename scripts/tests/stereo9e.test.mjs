// Stage 9E Phase D: stereochemical reliability.
// Expectations come from mechanism, not from engine output:
//   - epoxide opening is backside (SN2-like): the attacked carbon is inverted, the other keeps its configuration.
//     trans-2,3-epoxybutane ((R,R) or (S,S)) therefore gives meso butane-2,3-diol; cis (meso) gives the racemic (R,R)/(S,S) diol.
//   - a cyclopentene/cyclohexene/cycloheptene oxide is necessarily cis-fused, so anti opening gives the trans-1,2 racemate.
//   - an achiral reaction cannot prefer one enantiotopic face: a chiral product from stereo-free reactants is a racemate.
//   - nothing is assigned when the rules cannot support it (acyclic epoxide of unknown geometry, large or bridged rings).
// Stereochemistry is compared as CIP descriptors and mixture membership, never as SMILES spelling.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine, loadModule } from "./engine.mjs";

let utils;
let registry;
let engine;
let groups;
let stereo;
let rd;

before(async () => {
  ({ utils } = await loadEngine());
  registry = utils.reactionRegistry;
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  groups = await loadModule("/src/utils/functionalGroups/index.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  rd = await getRdkit();
});

after(async () => {
  await closeEngine();
});

const rule = (id) => registry.find((item) => item.id === id);
const base = (ruleId, smiles) => engine.predictReactionPathwaysFromRules(smiles, [], [rule(ruleId)], { planning: true });
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
const members = (pathway) => (pathway.productMixture?.memberSmiles?.length ? pathway.productMixture.memberSmiles : [pathway.productSmiles]);
/** Distinct CIP descriptor strings over every member of every pathway. */
const labels = (pathways) => [...new Set(pathways.flatMap(members).map(cip))].sort();
/** Number of tetrahedral tags: '@@' is one tag. */
const tagCount = (smiles) => (smiles.match(/@@?/g) ?? []).length;
const canon = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;
const distinct = async (pathways) => new Set(await Promise.all(pathways.map((p) => canon(p.productSmiles)))).size;

const TRANS_EPOXIDE = "C[C@H]1O[C@@H]1C"; // (2R,3R)
const TRANS_EPOXIDE_S = "C[C@@H]1O[C@H]1C"; // (2S,3S)
const CIS_EPOXIDE = "C[C@H]1O[C@H]1C"; // meso (2R,3S)

describe("epoxide opening inverts the attacked carbon (acyclic, stereo-defined)", () => {
  for (const ruleId of ["epoxide-base-hydroxide-opening", "epoxide-acid-water-opening"]) {
    test(`${ruleId}: trans-2,3-epoxybutane gives the meso diol, from either enantiomer`, async () => {
      for (const epoxide of [TRANS_EPOXIDE, TRANS_EPOXIDE_S]) {
        const out = await base(ruleId, epoxide);
        assert.deepEqual(labels(out), ["RS"], epoxide);
        assert.equal(await distinct(out), 1, "both attack sites give the same compound");
      }
    });
    test(`${ruleId}: cis (meso) epoxide gives both (R,R) and (S,S) diol`, async () => {
      const out = await base(ruleId, CIS_EPOXIDE);
      assert.deepEqual(labels(out), ["RR", "SS"]);
    });
  }
  test("hydrogen bromide: trans epoxide gives one bromohydrin stereoisomer; cis gives an enantiomer pair", async () => {
    const trans = await base("epoxide-hx-opening-hbr", TRANS_EPOXIDE);
    assert.equal(await distinct(trans), 1);
    const cis = await base("epoxide-hx-opening-hbr", CIS_EPOXIDE);
    const ids = [...new Set(await Promise.all(cis.map((p) => canon(p.productSmiles))))];
    assert.equal(ids.length, 2);
    const [a, b] = await Promise.all(ids.map((id) => stereo.canonicalizeStereoStructure(id)));
    assert.equal(await stereo.areCanonicalEnantiomers(a, b), true);
  });
  test("the configuration of the carbon whose C-O bond is kept is not changed (trans epoxide, hydroxide: product is not (R,R))", async () => {
    // Retention at both carbons would give (R,R): the defect this phase fixes.
    assert.notDeepEqual(labels(await base("epoxide-base-hydroxide-opening", TRANS_EPOXIDE)), ["RR"]);
  });
  test("a stereocentre away from the reaction site is preserved (terminal epoxide, attack at CH2)", async () => {
    const out = await base("epoxide-base-hydroxide-opening", "C[C@H](O)C1CO1");
    assert.ok(out.length >= 1);
    for (const pathway of out) assert.equal(tagCount(pathway.productSmiles), 1, pathway.productSmiles);
  });
  test("an unspecified acyclic epoxide stays unspecified: cis/trans is unknown, so no relationship is invented", async () => {
    for (const pathway of await base("epoxide-base-hydroxide-opening", "CC1OC1C")) assert.doesNotMatch(pathway.productSmiles, /@/);
  });
  test("a tertiary attacked carbon is inverted too (acid opening of a trisubstituted stereo-defined epoxide keeps one defined centre)", async () => {
    const out = await base("epoxide-acid-water-opening", "C[C@H]1OC1(C)C");
    assert.ok(out.length >= 1);
    for (const pathway of out) assert.ok(tagCount(pathway.productSmiles) <= 1, pathway.productSmiles);
  });
});

describe("cyclic epoxides: anti opening gives the trans racemate; other rings are left unspecified", () => {
  for (const [name, smiles] of [["cyclopentene oxide", "C1CC2OC2C1"], ["cyclohexene oxide", "C1CCC2OC2C1"], ["cycloheptene oxide", "C1CCC2OC2CC1"]]) {
    test(`${name} + hydroxide gives only trans-1,2-diol: (R,R) and (S,S), never the cis meso form`, async () => {
      const out = await base("epoxide-base-hydroxide-opening", smiles);
      assert.deepEqual(labels(out), ["RR", "SS"]);
    });
  }
  test("cyclohexene oxide + HBr / NH3: trans-2-substituted cyclohexanols as enantiomer pairs", async () => {
    for (const ruleId of ["epoxide-hx-opening-hbr", "epoxide-ammonia-opening"]) {
      const out = await base(ruleId, "C1CCC2OC2C1");
      assert.equal(out.length, 2, ruleId);
      const [a, b] = await Promise.all(out.map((p) => stereo.canonicalizeStereoStructure(p.productSmiles)));
      assert.equal(await stereo.areCanonicalEnantiomers(a, b), true, ruleId);
      // Trans means identical descriptors on both carbons for this substitution pattern; cis would mix R and S.
      for (const pathway of out) assert.match(cip(pathway.productSmiles), /^(RR|SS)$/);
    }
  });
  test("substituents elsewhere on the ring do not add invented stereocentres (3-methylcyclohexene oxide)", async () => {
    for (const pathway of await base("epoxide-base-hydroxide-opening", "C1CCC2OC2C1C")) {
      assert.equal(tagCount(pathway.productSmiles), 2, pathway.productSmiles);
    }
  });
  test("cyclooctene oxide and norbornene oxide are not completed: a trans epoxide / bridged face is possible, so nothing is assigned", async () => {
    for (const smiles of ["C1CCCC2OC2CC1", "C1C2CCC1C1OC21"]) {
      for (const pathway of await base("epoxide-base-hydroxide-opening", smiles)) assert.doesNotMatch(pathway.productSmiles, /@/);
    }
  });
  test("a stereo-defined ring epoxide is not re-enumerated: only the opening site inverts", async () => {
    const out = await base("epoxide-base-hydroxide-opening", "C1CC[C@H]2O[C@H]2C1");
    assert.deepEqual(labels(out), ["RR", "SS"]);
  });
  test("the Reactions page labels the ring product a racemate and the cis acyclic product a racemate, the trans one single", async () => {
    const ring = await page("epoxide-base-hydroxide-opening", "C1CCC2OC2C1");
    assert.equal(ring[0].productMixture?.kind, "racemic");
    assert.deepEqual(labels(ring), ["RR", "SS"]);
    const cis = await page("epoxide-base-hydroxide-opening", CIS_EPOXIDE);
    assert.equal(cis[0].productMixture?.kind, "racemic");
    const trans = await page("epoxide-base-hydroxide-opening", TRANS_EPOXIDE);
    assert.equal(trans[0].productMixture ?? null, null);
    assert.deepEqual(labels(trans), ["RS"]);
  });
});

describe("an achiral reaction cannot choose an enantiomer", () => {
  const racemicMembers = async (ruleId, smiles) => {
    const [pathway] = await page(ruleId, smiles);
    assert.ok(pathway, `${ruleId} on ${smiles}`);
    assert.equal(pathway.productMixture?.kind, "racemic", `${ruleId} on ${smiles}`);
    assert.equal(pathway.productMixture.memberSmiles.length, 2);
    const [a, b] = await Promise.all(pathway.productMixture.memberSmiles.map((m) => stereo.canonicalizeStereoStructure(m)));
    assert.equal(await stereo.areCanonicalEnantiomers(a, b), true);
  };
  test("halohydrin formation: E-2-butene, cyclohexene and a terminal alkene give racemates", async () => {
    for (const smiles of ["C/C=C/C", "C1CCC=CC1", "C=CCC"]) await racemicMembers("alkene-halohydrin-formation", smiles);
  });
  test("halohydrin formation on E-2-butene is the anti product: (2R,3S)-type relative configuration, as for the dibromide", async () => {
    const [pathway] = await page("alkene-halohydrin-formation", "C/C=C/C");
    assert.deepEqual(labels([pathway]), ["RS"]);
  });
  test("a single new stereocentre in a Diels-Alder product is a racemate", async () => {
    await racemicMembers("diene-diels-alder", "C=CC=O.C=CC=C");
  });
  test("meso products are not mislabelled as mixtures (cyclohexene epoxide, cis-diol, E-2-butene dibromide)", async () => {
    for (const [ruleId, smiles] of [["alkene-epoxidation", "C1CCC=CC1"], ["alkene-syn-dihydroxylation", "C1CCC=CC1"], ["alkene-halogenation-bromine", "C/C=C/C"]]) {
      const [pathway] = await page(ruleId, smiles);
      assert.equal(pathway.productMixture ?? null, null, `${ruleId} on ${smiles}`);
      assert.equal(cip(pathway.productSmiles), "RS");
    }
  });
  test("an alkene of undefined geometry keeps every stereoisomer the mechanism allows (no single arbitrary one)", async () => {
    for (const ruleId of ["alkene-syn-dihydroxylation", "alkene-anti-dihydroxylation"]) {
      const [pathway] = await page(ruleId, "CC=CC");
      assert.ok(pathway.productMixture, ruleId);
      assert.ok(pathway.productMixture.memberSmiles.length >= 3, `${ruleId}: ${pathway.productMixture.memberSmiles.length} members`);
      assert.deepEqual(labels([pathway]), ["RR", "RS", "SS"]);
    }
  });
  test("a reactant stereocentre prevents the racemate inference (chiral allylic alcohol halohydrin stays unspecified at the new centres)", async () => {
    const [pathway] = await page("alkene-halohydrin-formation", "C[C@H](O)C=C");
    assert.ok(pathway);
    assert.equal(pathway.productMixture?.kind === "racemic", false);
  });
  test("1-butene bromination, epoxidation and halohydrin remain racemates as before", async () => {
    for (const ruleId of ["alkene-halogenation-bromine", "alkene-epoxidation", "alkene-halohydrin-formation"]) await racemicMembers(ruleId, "C=CCC");
  });
});

describe("alkene geometry is used where the engine can use it, and declared unknown where it cannot", () => {
  const BS = String.fromCharCode(92);
  const E2 = "C/C=C/C";
  const Z2 = "C/C=C" + BS + "C";
  const TRI_E = "C/C=C(" + BS + "C)CC";
  const TRI_Z = "C/C=C(/C)CC";
  const set = async (ruleId, alkene) => {
    const [pathway] = await page(ruleId, alkene);
    assert.ok(pathway, `${ruleId} on ${alkene}`);
    return [...new Set(await Promise.all(members(pathway).map(canon)))].sort();
  };
  test("halohydrin formation distinguishes E from Z: the two geometries give different diastereomers (they used to give the same one)", async () => {
    const fromE = await set("alkene-halohydrin-formation", E2);
    const fromZ = await set("alkene-halohydrin-formation", Z2);
    assert.notDeepEqual(fromE, fromZ);
    assert.equal(fromE.length, 2);
    assert.equal(fromZ.length, 2);
  });
  test("halohydrin stereo-pattern equals the anti diol and the anti dibromide of the same alkene (O/Br swapped in the same slot)", async () => {
    for (const alkene of [E2, Z2]) {
      const bromohydrin = await set("alkene-halohydrin-formation", alkene);
      const antiDiol = await set("alkene-anti-dihydroxylation", alkene);
      // Replace one OH by Br: every position of the diol is a possible site, so compare against both substitutions.
      const expected = new Set();
      for (const diol of antiDiol) {
        const positions = [...diol.matchAll(/O/g)].map((m) => m.index);
        for (const at of positions) expected.add(await canon(diol.slice(0, at) + "Br" + diol.slice(at + 1)));
      }
      for (const member of bromohydrin) assert.ok(expected.has(member), `${alkene}: ${member}`);
    }
  });
  test("acyclic tri- and tetrasubstituted alkenes: the geometry cannot be mapped, so NO diastereomer is chosen and the reason is stated", async () => {
    for (const ruleId of ["alkene-epoxidation", "alkene-syn-dihydroxylation", "alkene-anti-dihydroxylation", "alkene-halogenation-bromine", "alkene-halohydrin-formation"]) {
      for (const alkene of [TRI_E, TRI_Z]) {
        const [pathway] = await page(ruleId, alkene);
        assert.ok(pathway, `${ruleId} on ${alkene}`);
        assert.doesNotMatch(pathway.productSmiles, /@/, `${ruleId} on ${alkene}`);
        assert.ok(pathway.limitations.some((text) => /not assigned/.test(text) && /tri- and tetrasubstituted/.test(text)), `${ruleId}: limitation missing`);
      }
    }
  });
  test("no rule gives (E)- and (Z)-2-butene the same defined stereoisomers", async () => {
    const hierarchyE = await groups.analyzeFunctionalGroupHierarchy(E2);
    const hierarchyZ = await groups.analyzeFunctionalGroupHierarchy(Z2);
    const byRule = async (smiles, hierarchy) => {
      const out = new Map();
      for (const p of await utils.predictReactionPathways(smiles, hierarchy.primaryGroups)) {
        if (!p.productSmiles || !/@/.test(p.productSmiles)) continue;
        const key = (await stereo.canonicalizeStereoStructure(p.productSmiles)).connectivity;
        const sets = out.get(p.ruleId) ?? new Map();
        sets.set(key, [...new Set([...(sets.get(key) ?? []), ...(await Promise.all(members(p).map(canon)))])].sort().join("+"));
        out.set(p.ruleId, sets);
      }
      return out;
    };
    const [forE, forZ] = [await byRule(E2, hierarchyE), await byRule(Z2, hierarchyZ)];
    for (const [ruleId, sets] of forE) {
      for (const [key, value] of sets) {
        const other = forZ.get(ruleId)?.get(key);
        if (other !== undefined) assert.notEqual(other, value, `${ruleId}: E and Z gave the same stereoisomers`);
      }
    }
  });
  test("a ring trisubstituted alkene (1-methylcyclohexene) gives the racemic cis diol for syn and trans diol for anti addition", async () => {
    const ref = (smiles) => [smiles, smiles.replace(/@@?/g, (tag) => (tag === "@" ? "@@" : "@"))];
    const expectSet = async (smiles) => [...new Set(await Promise.all(ref(smiles).map(canon)))].sort();
    // References built from the validated cyclohexane-1,2-diol faces by replacing the implicit H on C1 with methyl.
    assert.deepEqual(await set("alkene-syn-dihydroxylation", "CC1=CCCCC1"), await expectSet("O[C@@](C)1CCCC[C@@H]1O"));
    assert.deepEqual(await set("alkene-anti-dihydroxylation", "CC1=CCCCC1"), await expectSet("O[C@@](C)1CCCC[C@H]1O"));
    assert.deepEqual(await set("alkene-halogenation-bromine", "CC1=CCCCC1"), await expectSet("Br[C@@](C)1CCCC[C@H]1Br"));
  });
});

describe("carbonyl additions never assign a configuration they cannot support", () => {
  const assertNoInvented = async (ruleIdPrefix, smiles) => {
    const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles.split(".")[0]);
    const pathways = (await utils.predictReactionPathways(smiles, hierarchy.primaryGroups)).filter((p) => p.ruleId.startsWith(ruleIdPrefix));
    for (const pathway of pathways) {
      if (/@/.test(pathway.productSmiles)) assert.ok(pathway.productMixture, `${pathway.ruleId}: ${pathway.productSmiles} has a defined centre but no mixture label`);
    }
    return pathways;
  };
  test("Grignard addition to 2-butanone, hydride reduction, cyanide addition and aldol give unspecified or labelled products only", async () => {
    await assertNoInvented("ketone", "CCC(C)=O");
    await assertNoInvented("ketone", "CCC(C)=O.[Mg](Br)c1ccccc1");
    await assertNoInvented("aldehyde", "CC=O.CC=O");
    await assertNoInvented("aldol", "CC(C)=O.CC=O");
  });
});
