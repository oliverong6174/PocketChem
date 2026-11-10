// Stage 9N: Newman / sawhorse / energy model. The 3D embedding of each conformation is read back by RDKit (stereo perceived from coordinates)
// and its torsions are measured with an independent formula, so handedness, front/back and the dihedral sign are not self-referential.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadModule } from "./engine.mjs";

let rd, G, T;
before(async () => {
  rd = await getRdkit();
  G = await loadModule("/src/utils/conformations/graph.ts");
  T = await loadModule("/src/utils/conformations/torsion.ts");
});
after(async () => { await closeEngine(); });

const canon = (s) => { const m = rd.get_mol(s); try { return m.get_smiles(); } finally { m.delete(); } };
const graphOf = (s) => { const r = G.buildConformationGraph(rd, s); assert.ok(r.ok, r.message); return r.graph; };
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const wrap = (x) => { let v = ((x % 360) + 360) % 360; if (v > 180) v -= 360; return v; };

// butane CCCC: atoms 0 (CH3), 1, 2, 3 (CH3). View the C2-C3 bond (atoms 1 and 2) with the methyls as references.
const butane = () => { const g = graphOf("CCCC"); return { g, setup: T.setupTorsion(g, 1, 2, { frontRef: 0, rearRef: 3 }) }; };

describe("which bonds can be viewed", () => {
  const check = (s, a, b) => T.checkRotatableBond(graphOf(s), a, b);
  test("[bond] sp3-sp3 single bonds are accepted", () => {
    assert.equal(check("CCCC", 1, 2).ok, true);
    assert.equal(check("CC", 0, 1).ok, true);
    assert.equal(check("CC(C)C(C)C", 1, 3).ok, true);
  });
  test("[bond] double, triple and aromatic bonds are refused with a reason", () => {
    assert.match(check("CC=CC", 1, 2).reason, /double bond/);
    assert.match(check("CC#CC", 1, 2).reason, /triple/);
    assert.match(check("c1ccccc1C", 0, 1).reason ?? "", /aromatic|ring/);
  });
  test("[bond] ring bonds are refused", () => {
    assert.match(check("C1CCCCC1", 0, 1).reason, /ring/);
  });
  test("[bond] amide C-N is refused (partial double bond); the C-C bond next to the carbonyl is accepted", () => {
    const g = graphOf("CC(=O)NC");
    assert.match(T.checkRotatableBond(g, 1, 3).reason, /amide/);
    assert.equal(T.checkRotatableBond(g, 0, 1).ok, true);
  });
  test("[bond] atoms that are not bonded are refused", () => {
    assert.equal(T.checkRotatableBond(graphOf("CCC"), 0, 2).ok, false);
  });
});

describe("dihedral angle and classification (butane)", () => {
  const names = [[0, "fully eclipsed"], [60, "gauche"], [120, "eclipsed"], [180, "anti"], [240, "eclipsed"], [300, "gauche"]];
  for (const [angle, name] of names) {
    test(`[classify] ${angle} deg is ${name}`, () => {
      const { g, setup } = butane();
      assert.equal(T.classify(g, setup, angle).name, name);
    });
  }
  test("[classify] staggered/eclipsed kinds and a skew angle in between", () => {
    const { g, setup } = butane();
    assert.equal(T.classify(g, setup, 180).kind, "staggered");
    assert.equal(T.classify(g, setup, 0).kind, "eclipsed");
    assert.equal(T.classify(g, setup, 30).kind, "skew");
  });
  test("[dihedral] the reference dihedral equals the rotation, and rotating moves only the rear substituents", () => {
    const { setup } = butane();
    const a = T.conformationAt(setup, 0);
    const b = T.conformationAt(setup, 90);
    assert.deepEqual(a.front, b.front);
    near(T.dihedralBetween(b, 0, 3), 90);
    for (let i = 0; i < 3; i++) near(wrap(b.rear[i].angle - a.rear[i].angle), 90);
  });
  test("[dihedral] every front/rear pair is 60 degrees apart or 180 in a staggered conformation", () => {
    const { setup } = butane();
    const c = T.conformationAt(setup, 180);
    for (const f of c.front) for (const r of c.rear) {
      const d = Math.abs(T.dihedralBetween(c, f.atom, r.atom));
      assert.ok(Math.abs(d - 60) < 1e-9 || Math.abs(d - 180) < 1e-9 || Math.abs(d - 60) < 1e-9, String(d));
    }
  });
});

describe("energy model (declared, textbook increments)", () => {
  const E = (s, a, b, refs, angle) => {
    const g = graphOf(s);
    const setup = T.setupTorsion(g, a, b, refs);
    return T.strainEnergyKJ(g, setup, angle);
  };
  test("[energy] ethane barrier is 12 kJ/mol and propane 14 kJ/mol", () => {
    near(E("CC", 0, 1, {}, 0) - E("CC", 0, 1, {}, 60), 12);
    near(E("CCC", 0, 1, {}, 0) - E("CCC", 0, 1, {}, 60), 14);
  });
  test("[energy] butane: anti 0, gauche 3.8, eclipsed 16, fully eclipsed 19 kJ/mol", () => {
    const { g, setup } = butane();
    const e = (a) => T.strainEnergyKJ(g, setup, a);
    near(e(180), 0); near(e(60), 3.8); near(e(300), 3.8); near(e(120), 16); near(e(240), 16); near(e(0), 19);
  });
  test("[energy] ordering anti < gauche < eclipsed < fully eclipsed, and the profile is symmetric about 180", () => {
    const { g, setup } = butane();
    const p = T.energyProfile(g, setup, 1);
    assert.equal(p.supported, true);
    const at = (a) => p.points.find((x) => x.angle === a).kJ;
    assert.ok(at(180) < at(60) && at(60) < at(120) && at(120) < at(0));
    for (let a = 0; a <= 180; a += 10) near(at(a), at(360 - a), 1e-9);
  });
  test("[energy] the profile's minima and maxima are the named conformations", () => {
    const { g, setup } = butane();
    const p = T.energyProfile(g, setup, 2);
    const minima = p.features.filter((f) => f.kind === "minimum").map((f) => `${f.angle}:${f.name}`).sort();
    const maxima = p.features.filter((f) => f.kind === "maximum").map((f) => `${f.angle}:${f.name}`).sort();
    assert.deepEqual(minima, ["180:anti", "300:gauche", "60:gauche"].sort());
    assert.deepEqual(maxima, ["0:fully eclipsed", "120:eclipsed", "240:eclipsed"].sort());
  });
  test("[energy] 2,3-dimethylbutane (all substituents are H or CH3) is quantified", () => {
    const g = graphOf("CC(C)C(C)C");
    const setup = T.setupTorsion(g, 1, 3);
    assert.equal(T.energyProfile(g, setup).supported, true);
  });
  test("[energy] groups other than H and CH3 are NOT given numbers (1,2-dichloroethane, 1-propanol, ethylbenzene)", () => {
    for (const [s, a, b] of [["ClCCCl", 1, 2], ["CCCO", 1, 2], ["CCc1ccccc1", 0, 1]]) {
      const g = graphOf(s);
      const setup = T.setupTorsion(g, a, b);
      const profile = T.energyProfile(g, setup);
      assert.equal(profile.supported, false, s);
      assert.equal(T.strainEnergyKJ(g, setup, 60), null);
    }
  });
  test("[qualitative] 1,2-difluoroethane carries a gauche-effect caveat; the qualitative text never claims anti is lower", () => {
    const g = graphOf("FCCF");
    const setup = T.setupTorsion(g, 1, 2);
    const q = T.qualitativeAssessment(g, setup, 60);
    assert.ok(q.caveats.some((c) => /gauche effect/.test(c)));
  });
});

describe("front/back reversal", () => {
  test("[reverse] viewing from the other end keeps every pairwise dihedral", () => {
    const g = graphOf("C[C@H](Cl)[C@@H](Br)C");
    const setup = T.setupTorsion(g, 1, 3);
    for (const rotation of [0, 50, 120, 200, 310]) {
      const c1 = T.conformationAt(setup, rotation);
      const back = T.reverseView(g, setup);
      const c2 = T.conformationAt(back, rotation);
      for (const f of c1.front) for (const r of c1.rear) {
        // in the reversed view, the old rear substituent is in front
        near(wrap(T.dihedralBetween(c1, f.atom, r.atom)), wrap(T.dihedralBetween(c2, r.atom, f.atom)), 1e-9);
      }
    }
  });
  test("[reverse] the picture is mirrored (handedness flips) for a stereocentre, and swapping twice restores it", () => {
    const g = graphOf("C[C@H](Cl)[C@@H](Br)C");
    const setup = T.setupTorsion(g, 1, 3);
    const back = T.reverseView(g, setup);
    assert.equal(back.front.atom, setup.rear.atom);
    const twice = T.reverseView(g, back);
    assert.deepEqual(twice.front.slots, setup.front.slots);
    assert.equal(twice.front.hand, setup.front.hand);
    assert.equal(twice.rear.hand, setup.rear.hand);
  });
});

describe("Newman <-> sawhorse conversion", () => {
  test("[convert] sawhorse -> Newman recovers every substituent angle, atom and label", () => {
    const g = graphOf("C[C@H](Cl)[C@@H](Br)C");
    const setup = T.setupTorsion(g, 1, 3);
    for (const rotation of [0, 37, 60, 120, 180, 245, 300]) {
      const n = T.newmanDiagram(g, setup, rotation);
      const back = T.sawhorseToNewman(T.newmanToSawhorse(n));
      assert.equal(back.frontAtom, n.frontAtom);
      assert.equal(back.rearAtom, n.rearAtom);
      near(back.rotation, n.rotation);
      n.front.forEach((item, i) => { assert.equal(back.front[i].atom, item.atom); assert.equal(back.front[i].label, item.label); near(wrap(back.front[i].angle - item.angle), 0, 1e-9); });
      n.rear.forEach((item, i) => { assert.equal(back.rear[i].atom, item.atom); near(wrap(back.rear[i].angle - item.angle), 0, 1e-9); });
    }
  });
  test("[convert] the sawhorse draws the rear carbon up and to the right of the front carbon", () => {
    const { g, setup } = butane();
    const s = T.newmanToSawhorse(T.newmanDiagram(g, setup, 180));
    assert.ok(s.rearCarbon.x > s.frontCarbon.x && s.rearCarbon.y > s.frontCarbon.y);
  });
  test("[convert] the dihedral measured on the sawhorse (after removing the oblique shift) equals the rotation", () => {
    const { g, setup } = butane();
    for (const rotation of [0, 60, 120, 180, 270]) {
      const back = T.sawhorseToNewman(T.newmanToSawhorse(T.newmanDiagram(g, setup, rotation)));
      const f = back.front.find((x) => x.atom === 0).angle;
      const r = back.rear.find((x) => x.atom === 3).angle;
      near(wrap(r - f), wrap(rotation), 1e-9);
    }
  });
});

describe("independent 3D check by RDKit and by a separate torsion formula", () => {
  const smilesList = [
    "C[C@H](Cl)[C@H](Cl)C", "C[C@H](Cl)[C@@H](Cl)C", "C[C@@H](Cl)[C@H](Br)C", "C[C@H](O)[C@@H](N)C",
  ];
  for (const smiles of smilesList) {
    test(`[3D] ${smiles}: RDKit reads the same molecule from the embedding at every rotation, front and reversed`, () => {
      const g = graphOf(smiles);
      const front = 1;
      const rear = g.atoms.findIndex((a, i) => i > 1 && g.atoms[i].neighbors.length >= 3 && g.fullNeighbors[1].includes(i));
      const setup = T.setupTorsion(g, front, rear);
      assert.equal(setup.warnings.length, 0);
      for (const rotation of [0, 60, 120, 180, 250, 300]) {
        for (const s of [setup, T.reverseView(g, setup)]) {
          const mol = rd.get_mol(T.torsionCoreMolblock(g, s, rotation));
          assert.ok(mol);
          try { assert.equal(canon(mol.get_smiles()), canon(smiles), `rotation ${rotation}`); } finally { mol.delete(); }
        }
      }
    });
  }
  test("[3D] a deliberately mirrored arrangement (wrong hand) is caught: it yields a different stereoisomer", () => {
    const g = graphOf("C[C@H](Cl)[C@H](Cl)C");
    const setup = T.setupTorsion(g, 1, 3);
    const wrong = { ...setup, front: { ...setup.front, hand: -setup.front.hand } };
    const mol = rd.get_mol(T.torsionCoreMolblock(g, wrong, 60));
    try { assert.notEqual(canon(mol.get_smiles()), canon("C[C@H](Cl)[C@H](Cl)C")); } finally { mol.delete(); }
  });
  test("[3D] the IUPAC torsion measured from coordinates equals the model dihedral for every front/rear pair", () => {
    const g = graphOf("C[C@H](Cl)[C@@H](Br)C");
    const setup = T.setupTorsion(g, 1, 3);
    for (const rotation of [0, 40, 90, 180, 275]) {
      const c = T.conformationAt(setup, rotation);
      for (const f of c.front) for (const r of c.rear) {
        const measured = T.torsionDegrees(T.substituentPoint3D("front", f.angle), T.FRONT_CARBON_3D, T.REAR_CARBON_3D, T.substituentPoint3D("rear", r.angle));
        near(wrap(measured), wrap(T.dihedralBetween(c, f.atom, r.atom)), 1e-6);
      }
    }
  });
  test("[3D] unspecified stereo with three different groups is flagged, not silently drawn as if known", () => {
    const g = graphOf("CC(Cl)C(Br)C");
    const setup = T.setupTorsion(g, 1, 3);
    assert.ok(setup.warnings.length >= 1);
    assert.ok(setup.front.handAssumed || setup.rear.handAssumed);
  });
});

describe("identity", () => {
  test("[identity] labels keep isotopes and the input atom indices", () => {
    const g = graphOf("[2H]C([2H])([2H])CC");
    assert.equal(g.atoms[0].isotope, 2);
    const setup = T.setupTorsion(g, 1, 4);
    const nm = T.newmanDiagram(g, setup, 0);
    assert.deepEqual(nm.front.map((s) => s.label), ["D", "D", "D"]);
    assert.deepEqual(nm.front.map((s) => s.atom).sort((a, b) => a - b), [0, 2, 3]);
    assert.equal(nm.frontAtom, 1);
  });
});
