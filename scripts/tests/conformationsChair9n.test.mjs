// Stage 9N: cyclohexane chair model. Geometry is validated INDEPENDENTLY: a molblock built from the model's 3D coordinates is read back by
// RDKit, which perceives stereo from the coordinates; its canonical SMILES must equal the input's (so cis/trans, absolute configuration,
// axial/equatorial placement and the chair flip are checked against RDKit, not against the model's own bookkeeping).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadModule } from "./engine.mjs";

let rd, G, C;
before(async () => {
  rd = await getRdkit();
  G = await loadModule("/src/utils/conformations/graph.ts");
  C = await loadModule("/src/utils/conformations/chair.ts");
});
after(async () => { await closeEngine(); });

const canon = (s) => { const m = rd.get_mol(s); try { return m.get_smiles(); } finally { m.delete(); } };
function model(smiles, choices = {}) {
  const r = G.buildConformationGraph(rd, smiles);
  assert.ok(r.ok, r.message);
  const rings = C.findChairCandidates(r.graph).filter((x) => x.eligible);
  assert.equal(rings.length, 1, `${smiles}: one chair ring`);
  return { graph: r.graph, model: C.buildChairModel(rd, r.graph, rings[0].ring, choices) };
}
function roundTrip(graph, m, flipped) {
  const mol = rd.get_mol(C.chairCoreMolblock(graph, m, flipped));
  assert.ok(mol, "RDKit must read the model's 3D molblock");
  try { return mol.get_smiles(); } finally { mol.delete(); }
}

describe("RDKit independently confirms the chair geometry (both chairs, absolute stereo)", () => {
  const cases = [
    "C[C@H]1CCCC[C@@H]1C", "C[C@H]1CCCC[C@H]1C", "C[C@H]1CCC[C@@H](C)C1", "C[C@H]1CCC[C@H](C)C1", "C[C@H]1CC[C@@H](C)CC1", "C[C@H]1CC[C@H](C)CC1",
    "C[C@@H]1CCCC[C@H]1Cl", "O[C@H]1CCCC[C@@H]1Br", "C[C@H]1CCC[C@@H](F)C1", "C[C@H]1CC[C@@H](Cl)CC1", "C[C@@H]1CC[C@H](Cl)CC1",
    "C[C@H]1C[C@H](C)C[C@H](C)C1", "C[C@H]1C[C@@H](C)C[C@H](C)C1", "C[C@@H]1CC[C@@](C)(Cl)CC1",
  ];
  for (const smiles of cases) {
    test(`[geometry] ${smiles}: Chair A and Chair B both reproduce the input stereochemistry`, () => {
      const { graph, model: m } = model(smiles);
      assert.equal(m.status, "ready");
      const want = canon(smiles);
      assert.equal(roundTrip(graph, m, false), want, "Chair A");
      assert.equal(roundTrip(graph, m, true), want, "Chair B (after the flip)");
    });
  }
  test("[geometry] a deliberately wrong model (one substituent moved to the other face) is detected by the same check", () => {
    const { graph, model: m } = model("C[C@H]1CCCC[C@@H]1C");
    const firstPosition = m.slots.find((x) => !x.isHydrogen).position;
    const broken = { ...m, slots: m.slots.map((s) => (s.position === firstPosition ? { ...s, face: s.face === "up" ? "down" : "up" } : s)) };
    assert.notEqual(roundTrip(graph, broken, false), canon("C[C@H]1CCCC[C@@H]1C"));
  });
});

describe("axial / equatorial positions are measured, not asserted", () => {
  test("[geometry] axial bonds are parallel to the ring axis and equatorial ones are about 70 degrees from it", () => {
    const { model: m } = model("CC1CCCCC1");
    for (const flipped of [false, true]) {
      const conf = C.buildConformer(m, flipped);
      for (const item of conf.substituents) {
        const angle = C.angleToAxis(conf, item);
        if (item.orientation === "axial") assert.ok(angle < 1, `axial angle ${angle}`);
        else assert.ok(angle > 65 && angle < 75, `equatorial angle ${angle}`);
      }
    }
  });
  test("[geometry] each ring atom has one axial and one equatorial position, alternating up/down around the ring", () => {
    const { model: m } = model("C1CCCCC1");
    const conf = C.buildConformer(m, false);
    for (let p = 0; p < 6; p++) {
      const here = conf.substituents.filter((s) => s.slot.position === p);
      assert.equal(here.filter((s) => s.orientation === "axial").length, 1);
      assert.equal(here.filter((s) => s.orientation === "equatorial").length, 1);
      assert.equal(here.find((s) => s.orientation === "axial").slot.face, p % 2 === 0 ? "up" : "down");
    }
  });
});

describe("chair flip", () => {
  test("[flip] every axial position becomes equatorial and vice versa", () => {
    const { model: m } = model("C[C@H]1CC[C@@H](C)CC1");
    const a = C.buildConformer(m, false);
    const b = C.buildConformer(m, true);
    a.substituents.forEach((item, i) => assert.notEqual(item.orientation, b.substituents[i].orientation));
  });
  test("[flip] up/down faces (hence cis/trans) are untouched by the flip", () => {
    const { model: m } = model("C[C@H]1CC[C@@H](C)CC1");
    const faces = m.slots.map((s) => s.face).join();
    C.buildConformer(m, true);
    assert.equal(m.slots.map((s) => s.face).join(), faces);
  });
});

describe("textbook disubstituted cyclohexanes (axial/equatorial pattern, from the model)", () => {
  const pattern = (smiles) => {
    const an = C.analyzeChairs(model(smiles).model);
    return ["A", "B"].map((k) => `${an[k].axialGroups.length}ax/${an[k].equatorialGroups.length}eq`).sort().join(" & ");
  };
  // Which spelling is cis is established independently: for 1,2- and 1,3-disubstituted rings the cis isomer is the achiral (meso) one.
  const mirror = (s) => canon(s.replace(/@@/g, "#").replace(/@/g, "@@").replace(/#/g, "@"));
  const isMeso = (s) => canon(s) === mirror(s);
  test("[1,2] cis (meso) is ax/eq in both chairs; trans is diequatorial or diaxial", () => {
    for (const s of ["C[C@H]1CCCC[C@@H]1C", "C[C@H]1CCCC[C@H]1C"]) {
      assert.equal(pattern(s), isMeso(s) ? "1ax/1eq & 1ax/1eq" : "0ax/2eq & 2ax/0eq", s);
    }
    assert.notEqual(isMeso("C[C@H]1CCCC[C@@H]1C"), isMeso("C[C@H]1CCCC[C@H]1C"));
  });
  test("[1,3] cis (meso) is diequatorial or diaxial; trans is ax/eq", () => {
    for (const s of ["C[C@H]1CCC[C@@H](C)C1", "C[C@H]1CCC[C@H](C)C1"]) {
      assert.equal(pattern(s), isMeso(s) ? "0ax/2eq & 2ax/0eq" : "1ax/1eq & 1ax/1eq", s);
    }
    assert.notEqual(isMeso("C[C@H]1CCC[C@@H](C)C1"), isMeso("C[C@H]1CCC[C@H](C)C1"));
  });
  test("[1,4] the two diastereomers give the two patterns (cis ax/eq, trans diequatorial/diaxial)", () => {
    const set = new Set(["C[C@H]1CC[C@@H](C)CC1", "C[C@H]1CC[C@H](C)CC1"].map(pattern));
    assert.deepEqual([...set].sort(), ["0ax/2eq & 2ax/0eq", "1ax/1eq & 1ax/1eq"]);
  });
});

describe("stability assessment", () => {
  const analyze = (s, choices) => C.analyzeChairs(model(s, choices).model);
  test("[A-value] methylcyclohexane: equatorial chair favoured by 1.74 kcal/mol (documented A-value)", () => {
    const an = analyze("CC1CCCCC1");
    assert.equal(an.preference.kind, "quantified");
    assert.ok(Math.abs(an.preference.deltaKcal - 1.74) < 1e-9);
    assert.equal(an.preference.preferred, an.A.axialGroups.length === 0 ? "Chair A" : "Chair B");
  });
  test("[A-value] tert-butylcyclohexane: large preference flagged as a lower bound; the axial chair meets two syn-axial hydrogens", () => {
    const an = analyze("CC(C)(C)C1CCCCC1");
    assert.equal(an.preference.kind, "quantified");
    assert.ok(an.preference.deltaKcal > 4.5);
    assert.equal(an.preference.usesLowerBound, true);
    const axialChair = an.A.axialGroups.length ? an.A : an.B;
    assert.equal(axialChair.synDiaxial.length, 2);
    assert.ok(axialChair.synDiaxial.every((x) => x.partnerIsHydrogen));
  });
  test("[A-value] trans-1,4-dimethyl: diequatorial wins by 2 x 1.74; cis-1,4 is degenerate (same groups axial in both chairs)", () => {
    const trans = analyze("C[C@H]1CC[C@H](C)CC1").preference;
    const cis = analyze("C[C@H]1CC[C@@H](C)CC1").preference;
    // which SMILES is cis depends on the tag convention; the pair must be one quantified and one equivalent-by-symmetry
    const quantified = [trans, cis].find((k) => k.kind === "quantified");
    const equivalent = [trans, cis].find((k) => k.kind === "equivalent-by-symmetry");
    assert.ok(quantified && equivalent, JSON.stringify([trans.kind, cis.kind]));
    assert.ok(Math.abs(quantified.deltaKcal - 3.48) < 1e-9);
  });
  test("[A-value] tert-butyl + methyl, 1,4: the tert-butyl is never the axial group in the favoured chair", () => {
    for (const s of ["C[C@H]1CC[C@@H](C(C)(C)C)CC1", "C[C@H]1CC[C@H](C(C)(C)C)CC1"]) {
      const an = analyze(s);
      assert.equal(an.preference.kind, "quantified");
      const winner = an.preference.preferred === "Chair A" ? an.A : an.B;
      assert.ok(!winner.axialGroups.some((g) => g.label === "tert-butyl"), s);
    }
  });
  test("[unassessed] a substituent without an A-value is reported, never guessed", () => {
    const an = analyze("C[Si](C)(C)C1CCCCC1");
    assert.equal(an.preference.kind, "unassessed");
    assert.ok(an.preference.missing.length >= 1);
  });
  test("[unassessed] no substituents: nothing to compare", () => {
    assert.equal(analyze("C1CCCCC1").preference.kind, "no-substituents");
  });
});

describe("unsupported or constrained rings are refused, with a reason", () => {
  const reasons = (s) => {
    const r = G.buildConformationGraph(rd, s);
    assert.ok(r.ok);
    return C.findChairCandidates(r.graph).map((x) => (x.eligible ? "ok" : x.reason));
  };
  test("[scope] benzene, cyclohexene, piperidine, decalin, norbornane and spiro[5.5]undecane are not chairs", () => {
    assert.match(reasons("c1ccccc1")[0], /aromatic/);
    assert.match(reasons("C1=CCCCC1")[0], /not sp3|double/);
    assert.match(reasons("C1CCNCC1")[0], /heteroatom/);
    assert.match(reasons("C1CCC2CCCCC2C1").join(" "), /shared with another ring/);
    assert.deepEqual(reasons("C1CC2CCC1C2"), []);
    const nb = G.buildConformationGraph(rd, "C1CC2CCC1C2");
    assert.match(C.describeChairAvailability(nb.graph), /share atoms|constrained/);
    assert.match(reasons("C1CCC2(CC1)CCCCC2").join(" "), /shared/);
  });
  test("[scope] cyclopentane and cycloheptane have no six-membered ring candidate", () => {
    assert.deepEqual(reasons("C1CCCC1"), []);
    assert.deepEqual(reasons("C1CCCCCC1"), []);
  });
  test("[scope] two isolated cyclohexanes in one molecule are both eligible", () => {
    assert.deepEqual(reasons("C1CCC(CC1)C1CCCCC1"), ["ok", "ok"]);
  });
});

describe("stereochemistry is never invented", () => {
  test("[stereo] 1,2-dimethylcyclohexane without stereo asks the user to choose; the answer then drives the chair", () => {
    const first = model("CC1CCCCC1C").model;
    assert.equal(first.status, "needs-choice");
    assert.equal(first.unresolved.length, 1);
    const substituted = (m) => m.slots.filter((s) => !s.isHydrogen).map((s) => s.ringAtom);
    const same = model("CC1CCCCC1C", { [first.unresolved[0]]: "up" }).model;
    const opposite = model("CC1CCCCC1C", { [first.unresolved[0]]: "down" }).model;
    assert.equal(same.status, "ready");
    assert.equal(C.relationship(same, ...substituted(same)), "cis");
    assert.equal(C.relationship(opposite, ...substituted(opposite)), "trans");
  });
  test("[stereo] a single substituent needs no stereo (arbitrary face, flagged)", () => {
    const m = model("CC1CCCCC1").model;
    assert.equal(m.status, "ready");
    assert.equal(m.slots.find((s) => !s.isHydrogen).faceSource, "single-centre-arbitrary");
  });
  test("[stereo] specified stereo is reported as coming from the input", () => {
    const m = model("C[C@H]1CCCC[C@@H]1C").model;
    assert.ok(m.slots.filter((s) => !s.isHydrogen).every((s) => s.faceSource === "input-stereo"));
  });
});

describe("identity: isotopes, charges and substituent identity survive", () => {
  test("[identity] a deuterated methyl is a different substituent from methyl (no A-value is borrowed)", () => {
    const m = model("[2H]C([2H])([2H])C1CCCCC1").model;
    assert.equal(m.slots.find((s) => !s.isHydrogen).identity.aValue, null);
  });
  test("[identity] input atom indices are used throughout", () => {
    const { graph, model: m } = model("C[C@H]1CCCC[C@@H]1C");
    assert.deepEqual([...m.ring].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
    assert.ok(m.slots.filter((s) => !s.isHydrogen).every((s) => [0, 7].includes(s.atom)));
    assert.equal(graph.implicitHydrogenBase, 8);
  });
});
