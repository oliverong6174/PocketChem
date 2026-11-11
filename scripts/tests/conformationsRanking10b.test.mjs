// Stage 10B: systematic-name subset, name-resolution integration, conformational ranking and comparison validity.
// Chemistry cross-checks are independent of the code under test: cis/trans arrangements are checked against the textbook
// axial/equatorial pattern of each chair, CIP descriptors against RDKit's own labels.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadModule } from "./engine.mjs";

let rd, G, C, T, R, N, I;
before(async () => {
  rd = await getRdkit();
  G = await loadModule("/src/utils/conformations/graph.ts");
  C = await loadModule("/src/utils/conformations/chair.ts");
  T = await loadModule("/src/utils/conformations/torsion.ts");
  R = await loadModule("/src/utils/conformations/ranking.ts");
  N = await loadModule("/src/utils/conformations/systematicName.ts");
  I = await loadModule("/src/utils/moleculeInput.ts");
});
after(async () => { await closeEngine(); });

const graphOf = (smiles) => { const r = G.buildConformationGraph(rd, smiles); assert.ok(r.ok, r.message); return r.graph; };
function chairs(smiles, choices = {}) {
  const graph = graphOf(smiles);
  const ring = C.findChairCandidates(graph).filter((x) => x.eligible)[0].ring;
  const model = C.buildChairModel(rd, graph, ring, choices);
  return { graph, ring, model, analysis: model.status === "ready" ? C.analyzeChairs(model) : null };
}
const axialCount = (side) => side.axialGroups.length;

describe("systematic-name subset", () => {
  const cases = [
    // name, expected axial substituent counts [chair A, chair B]  (textbook patterns)
    ["cis-1,3-dimethylcyclohexane", [0, 2]],
    ["trans-1,3-dimethylcyclohexane", [1, 1]],
    ["cis-1,2-dimethylcyclohexane", [1, 1]],
    ["trans-1,2-dimethylcyclohexane", [0, 2]],
    ["cis-1,4-dimethylcyclohexane", [1, 1]],
    ["trans-1,4-dimethylcyclohexane", [0, 2]],
  ];
  for (const [name, [a, b]] of cases) {
    test(`[cis/trans] ${name} gives the textbook axial pattern in both chairs`, () => {
      const parsed = N.parseSystematicName(name, rd);
      assert.ok(parsed.ok, parsed.reason);
      assert.equal(parsed.stereo, "specified");
      const { analysis } = chairs(parsed.smiles);
      const counts = [axialCount(analysis.A), axialCount(analysis.B)].sort();
      assert.deepEqual(counts, [a, b].sort(), `${name} -> ${parsed.smiles}`);
    });
  }

  test("[unspecified] a name without cis/trans stays unspecified and the chair page must ask (no silent choice)", () => {
    const parsed = N.parseSystematicName("1,3-dimethylcyclohexane", rd);
    assert.ok(parsed.ok);
    assert.equal(parsed.stereo, "unspecified");
    assert.equal(chairs(parsed.smiles).model.status, "needs-choice");
  });

  test("[mono] methyl / tert-butyl / bromo on cyclohexane", () => {
    for (const [name, smiles] of [["tert-butylcyclohexane", "CC(C)(C)C1CCCCC1"], ["bromocyclohexane", "BrC1CCCCC1"]]) {
      const parsed = N.parseSystematicName(name, rd);
      assert.ok(parsed.ok, name);
      const canon = (s) => { const m = rd.get_mol(s); try { return m.get_smiles(); } finally { m.delete(); } };
      assert.equal(canon(parsed.smiles), canon(smiles));
    }
  });

  test("[reject] unsupported names are refused with the subset listed, never guessed", () => {
    for (const bad of ["cis-1,3,5-trimethylcyclohexane", "cis-methylcyclohexane", "1,7-dimethylcyclohexane", "2-methyl-3-pentylcyclohexane", "(1R,2S)-1,2-dimethylcyclohexane", "foo"]) {
      const parsed = N.parseSystematicName(bad, rd);
      assert.equal(parsed.ok, false, bad);
      assert.match(parsed.reason, /./);
    }
  });

  for (const [name, want] of [["(2R,3R)-2,3-dibromobutane", ["RR"]], ["(2S,3S)-2,3-dibromobutane", ["SS"]], ["meso-2,3-dibromobutane", ["RS", "SR"]], ["(2R,3S)-2,3-dibromobutane", ["RS"]]]) {
    test(`[CIP] ${name} is verified against RDKit's CIP labels`, () => {
      const parsed = N.parseSystematicName(name, rd);
      assert.ok(parsed.ok, parsed.reason);
      const mol = rd.get_mol(parsed.smiles);
      try {
        const labels = JSON.parse(mol.get_stereo_tags()).CIP_atoms.map(([, l]) => l.replace(/[()]/g, "")).join("");
        assert.ok(want.includes(labels), `${labels} for ${parsed.smiles}`);
      } finally { mol.delete(); }
    });
  }

  test("[unspecified] 2,3-dibromobutane without descriptors carries no stereo", () => {
    const parsed = N.parseSystematicName("2,3-dibromobutane", rd);
    assert.ok(parsed.ok);
    assert.equal(parsed.stereo, "unspecified");
    assert.equal(parsed.smiles.includes("@"), false);
  });
});

describe("name-resolution integration (single resolver)", () => {
  test("[resolver] an explicit SMILES from the subset passes the shared resolver and keeps stereo", async () => {
    const parsed = N.parseSystematicName("trans-1,4-dimethylcyclohexane", rd);
    const resolved = await I.resolveMoleculeInput(`smiles:${parsed.smiles}`, {});
    assert.equal(resolved.kind, "smiles");
    assert.ok(resolved.smiles.includes("@"), resolved.smiles);
  });
  test("[resolver] an ambiguous database name is reported, not resolved", async () => {
    const resolveName = async () => { const e = new Error("ambiguous"); e.name = "MoleculeNameNotFoundError"; throw e; };
    await assert.rejects(I.resolveMoleculeInput("something", { resolveName }), (error) => error.code === "not-found" || error.code === "ambiguous" || error.code === "lookup-failed");
  });
});

describe("chair ranking", () => {
  const rank = (smiles) => {
    const { graph, ring, model, analysis } = chairs(smiles);
    const entry = (flipped, id) => ({ id, kind: "chair", label: flipped ? "Chair B" : "Chair A", molecule: graph.smiles, chair: { ring, flipped, choices: {} } });
    return R.compareEntries([entry(false, "a"), entry(true, "b")], { graph, molecule: graph.smiles, chairFor: () => ({ model, analysis }) });
  };
  test("[rank] methylcyclohexane: equatorial chair first, gap = A-value 1.74 kcal/mol (7.3 kJ/mol)", () => {
    const result = rank("CC1CCCCC1");
    assert.ok(result.ok, result.reason);
    assert.equal(result.ranked.length, 2);
    assert.equal(result.ranked[0].rank, 1);
    assert.equal(result.ranked[1].rank, 2);
    assert.equal(result.ranked[0].relativeKJ, 0);
    assert.ok(Math.abs(result.ranked[1].relativeKJ * R.KCAL_PER_KJ - 1.74) < 0.05);
    assert.match(result.ranked[1].reason, /axial: .*A = 1\.74/);
  });
  test("[rank] the ranking follows the flip: swapping which chair has the axial methyl reverses nothing but the labels", () => {
    const { graph, ring, model, analysis } = chairs("CC1CCCCC1");
    const best = analysis.A.strainKcal < analysis.B.strainKcal ? "Chair A" : "Chair B";
    const result = R.compareEntries(
      ["a", "b"].map((id, i) => ({ id, kind: "chair", label: i ? "Chair B" : "Chair A", molecule: graph.smiles, chair: { ring, flipped: i === 1, choices: {} } })),
      { graph, molecule: graph.smiles, chairFor: () => ({ model, analysis }) },
    );
    assert.equal(result.ranked[0].descriptor, best);
  });
  test("[rank] tert-butyl lower bound is noted; trans-1,4-dimethyl: diequatorial first by ~3.5 kcal/mol", () => {
    const result = rank("C[C@H]1CC[C@H](C)CC1");
    assert.ok(result.ok);
    assert.ok(Math.abs(result.ranked[1].relativeKJ * R.KCAL_PER_KJ - 3.48) < 0.1);
  });
  test("[tie] cis-1,4-dimethyl: both chairs have one axial methyl, so they tie", () => {
    const result = rank("C[C@H]1CC[C@@H](C)CC1");
    assert.ok(result.ok);
    assert.equal(result.ranked[0].rank, 1);
    assert.equal(result.ranked[1].rank, 1);
    assert.ok(result.ranked.every((row) => row.tied));
  });
  test("[abstain] a substituent without an A-value gives no ranking and no invented numbers", () => {
    const odd = rank("C1CCC(CC1)[Si](C)(C)C");
    assert.equal(odd.ok, false);
    assert.match(odd.reason, /A-value/);
  });
  test("[abstain] different up/down arrangements are different stereoisomers and are not ranked together", () => {
    const { graph, ring, model, analysis } = chairs("CC1CCCCC1C", { 0: "up" });
    const e = (id, choices) => ({ id, kind: "chair", label: id, molecule: graph.smiles, chair: { ring, flipped: false, choices } });
    const result = R.compareEntries([e("a", { 1: "up" }), e("b", { 1: "down" })], { graph, molecule: graph.smiles, chairFor: () => ({ model, analysis }) });
    assert.equal(result.ok, false);
    assert.match(result.reason, /different stereoisomers/);
  });
});

describe("torsion ranking", () => {
  const entries = (graph, front, rear, rotations) => rotations.map((rotation, i) => ({ id: `t${i}`, kind: "torsion", label: `r${rotation}`, molecule: graph.smiles, torsion: { front, rear, frontRef: null, rearRef: null, rotation } }));
  test("[butane] central bond: anti < gauche < eclipsed < fully eclipsed with textbook energies 0 / 3.8 / 16 / 19", () => {
    const graph = graphOf("CCCC");
    const setupFor = T.setupTorsion(graph, 1, 2);
    const conformers = R.torsionConformers(graph, setupFor);
    assert.equal(conformers.quantified, true);
    const byName = Object.fromEntries(conformers.conformers.map((c) => [c.name, c.relativeKJ]));
    assert.ok(Math.abs(byName.anti) < 0.01);
    assert.ok(Math.abs(byName.gauche - 3.8) < 0.1);
    assert.ok(Math.abs(byName.eclipsed - 16) < 0.2);
    assert.ok(Math.abs(byName["fully eclipsed"] - 19) < 0.2);
    const order = conformers.conformers.map((c) => c.name);
    assert.equal(order[0], "anti");
    assert.equal(order.at(-1), "fully eclipsed");
  });
  test("[compare] entries sort by model energy and ties share a rank (the two gauche conformers)", () => {
    const graph = graphOf("CCCC");
    const result = R.compareEntries(entries(graph, 1, 2, [0, 60, 180, 300]), { graph, molecule: graph.smiles, chairFor: () => null });
    assert.ok(result.ok, result.reason);
    assert.deepEqual(result.ranked.map((r) => r.descriptor.split(" · ")[1]), ["anti", "gauche", "gauche", "fully eclipsed"]);
    assert.deepEqual(result.ranked.map((r) => r.rank), [1, 2, 2, 4]);
    assert.equal(result.ranked[1].tied, true);
    assert.match(result.ranked[1].reason, /gauche CH₃\/CH₃/);
  });
  test("[view] the same conformation seen from the other end ranks identically (Newman/sawhorse share this assessment)", () => {
    const graph = graphOf("CCCC");
    const forward = T.setupTorsion(graph, 1, 2);
    const backward = T.reverseView(graph, forward);
    for (const rotation of [0, 60, 120, 180]) {
      const a = T.strainEnergyKJ(graph, forward, rotation);
      const b = T.strainEnergyKJ(graph, backward, rotation);
      assert.ok(Math.abs(a - b) < 1e-9, `rotation ${rotation}`);
    }
    // the sawhorse is derived from the Newman diagram, so the dihedral readout cannot differ
    const newman = T.newmanDiagram(graph, forward, 60);
    const sawhorse = T.newmanToSawhorse(newman);
    const back = T.sawhorseToNewman(sawhorse);
    assert.deepEqual(back.rear.map((x) => Math.round(x.angle)), newman.rear.map((x) => Math.round(x.angle)));
  });
  test("[unsupported] a bond carrying other groups is ranked by class only, with no energies", () => {
    const graph = graphOf("BrCCBr");
    const conformers = R.torsionConformers(graph, T.setupTorsion(graph, 1, 2));
    assert.equal(conformers.quantified, false);
    assert.ok(conformers.conformers.every((c) => c.relativeKJ === null));
    assert.equal(conformers.conformers[0].kind, "staggered");
    const result = R.compareEntries(entries(graph, 1, 2, [0, 60, 180]), { graph, molecule: graph.smiles, chairFor: () => null });
    assert.ok(result.ok);
    assert.equal(result.quantified, false);
    assert.ok(result.ranked.every((r) => r.relativeKJ === null));
    assert.equal(result.ranked[0].rank, 1);
    assert.equal(result.ranked.at(-1).descriptor.includes("eclipsed"), true);
  });
  test("[invalid] different molecules, different bonds, mixed kinds and single entries abstain with a reason", () => {
    const graph = graphOf("CCCC");
    const ctx = { graph, molecule: graph.smiles, chairFor: () => null };
    const a = entries(graph, 1, 2, [0, 180]);
    assert.equal(R.compareEntries(a.slice(0, 1), ctx).ok, false);
    assert.match(R.compareEntries([a[0], { ...a[1], molecule: "CCCCC" }], ctx).reason, /different molecules/);
    assert.match(R.compareEntries([a[0], { ...a[1], torsion: { ...a[1].torsion, front: 0, rear: 1 } }], ctx).reason, /different bonds/);
    assert.match(R.compareEntries([a[0], { id: "c", kind: "chair", label: "Chair A", molecule: graph.smiles, chair: { ring: [0, 1, 2, 3, 4, 5], flipped: false, choices: {} } }], ctx).reason, /different motions/);
  });
});

describe("saved comparison entries", () => {
  let W;
  before(async () => { W = await loadModule("/src/utils/persistence/conformationsWorkspace.ts"); });
  const base = () => ({
    source: { kind: "smiles", text: "CC1CCCCC1" }, mode: "chair",
    chair: { ring: [1, 2, 3, 4, 5, 6], flipped: false, choices: {} },
    torsion: { front: null, rear: null, frontRef: null, rearRef: null, rotation: 0 },
  });
  test("[persist] old saves without a comparison load as empty", () => {
    assert.deepEqual(W.validateConformationsInputs(base()).comparison, []);
  });
  test("[persist] chair (with face choices) and torsion entries round-trip exactly", () => {
    const comparison = [
      { id: "c1", kind: "chair", label: "Chair A", molecule: "CC1CCCCC1", chair: { ring: [1, 2, 3, 4, 5, 6], flipped: false, choices: { "0": "up", "7": "down" } } },
      { id: "c2", kind: "torsion", label: "anti", molecule: "CCCC", torsion: { front: 1, rear: 2, frontRef: 0, rearRef: 3, rotation: 180 } },
    ];
    const value = { ...base(), comparison };
    assert.deepEqual(W.validateConformationsInputs(JSON.parse(JSON.stringify(value))), value);
  });
  test("[persist] malformed entries are rejected, not coerced", () => {
    const bad = [
      [{ id: "x", kind: "chair", label: "l", molecule: "C", chair: { ring: [1, 2], flipped: false, choices: {} } }],
      [{ id: "x", kind: "chair", label: "l", molecule: "C", chair: { ring: [1, 2, 3, 4, 5, 6], flipped: false, choices: { a: "up" } } }],
      [{ id: "x", kind: "torsion", label: "l", molecule: "C", torsion: { front: 1, rear: 2, frontRef: null, rearRef: null, rotation: 1e6 } }],
      [{ id: "x", kind: "boat", label: "l", molecule: "C" }],
      "nope",
    ];
    for (const comparison of bad) assert.equal(W.validateConformationsInputs({ ...base(), comparison }), null);
  });
});
