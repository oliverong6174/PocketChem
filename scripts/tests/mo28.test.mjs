// Stage 28: molecular orbital occupancy, bond order and magnetism for curated homonuclear diatomics. Valence-electron counts, bond
// orders and unpaired-electron numbers are written out by hand from the textbook MO diagrams (OpenStax Chemistry 2e 8.4, retrieved
// 2026-11-24 for O₂ BO 2 with two unpaired π* electrons, C₂²⁻ BO 3, orbital orderings; the rest follows from the same filling rules).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let M;
before(async () => { M = await loadModule("/src/utils/generalChem/mo28.ts"); });
after(async () => { await closeEngine(); });
const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const sp = (id) => { const s = M.getDiatomic(id); assert.ok(s, id); return s; };
const ground = (id) => M.analyzeOccupancy(sp(id), M.groundOccupancy(sp(id)));
/** hand table: [valence electrons, bond order, unpaired electrons] */
const HAND = {
  h2: [2, 1, 0], h2p: [1, 0.5, 1], he2: [4, 0, 0], he2p: [3, 0.5, 1], li2: [2, 1, 0], be2: [4, 0, 0], b2: [6, 1, 2], c2: [8, 2, 0], n2: [10, 3, 0], o2: [12, 2, 2], f2: [14, 1, 0], ne2: [16, 0, 0],
  n2p: [9, 2.5, 1], c2m2: [10, 3, 0], o2p: [11, 2.5, 1], o2m: [13, 1.5, 1], o2m2: [14, 1, 0],
};

describe("species and orderings", () => {
  test("[valence electrons] every species has the hand-counted number of valence electrons (ions: atoms − charge)", () => { for (const [id, [n]] of Object.entries(HAND)) assert.equal(sp(id).valenceElectrons, n, id); assert.equal(M.DIATOMICS.length, Object.keys(HAND).length); });
  test("[ordering by atom] H/He 1s only; Li₂–N₂ (and C₂²⁻, N₂⁺) π2p below σ2p; O₂, F₂, Ne₂ (and O₂⁺, O₂⁻, O₂²⁻) σ2p below π2p", () => {
    const labels = (id) => M.levelsOf(sp(id)).map((l) => l.label);
    assert.deepEqual(labels("h2"), ["σ1s", "σ*1s"]);
    for (const id of ["li2", "be2", "b2", "c2", "n2", "n2p", "c2m2"]) assert.deepEqual(labels(id), ["σ2s", "σ*2s", "π2p", "σ2p", "π*2p", "σ*2p"], id);
    for (const id of ["o2", "f2", "ne2", "o2p", "o2m", "o2m2"]) assert.deepEqual(labels(id), ["σ2s", "σ*2s", "σ2p", "π2p", "π*2p", "σ*2p"], id);
  });
  test("[structure] bonding/antibonding alternate with stars on antibonding orbitals; π levels are doubly degenerate; σ levels single", () => {
    for (const s of M.DIATOMICS) for (const lv of M.levelsOf(s)) { assert.equal(lv.kind === "antibonding", lv.label.includes("*"), lv.label); assert.equal(lv.degeneracy, lv.symmetry === "π" ? 2 : 1); }
    assert.equal(M.boxesOf(sp("n2")).length, 8); assert.equal(M.boxesOf(sp("h2")).length, 2);
  });
  test("[ion ordering is flagged as a convention; neutrals are not]", () => { assert.equal(sp("o2").orderingIsConvention, false); assert.equal(sp("o2m").orderingIsConvention, true); assert.match(sp("o2m").orderingBasis, /convention/); assert.equal(sp("n2").kind, "neutral"); assert.equal(sp("n2p").kind, "ion"); });
});

describe("ground-state occupancy", () => {
  test("[bond order, unpaired electrons] equal the hand table for all 17 species", () => {
    for (const [id, [n, bo, up]] of Object.entries(HAND)) { const r = ground(id); assert.equal(r.valid, true); assert.equal(r.placed, n, id); assert.equal(r.complete, true); near(r.bondOrder, bo, 1e-12, `${id} BO`); assert.equal(r.unpaired, up, `${id} unpaired`); assert.equal(r.isGroundState, true, id); assert.deepEqual(r.hundViolations, []); assert.deepEqual(r.aufbauViolations, []); }
  });
  test("[bond order formula] (N_bonding − N_antibonding)/2 from the reported counts", () => { for (const id of Object.keys(HAND)) { const r = ground(id); assert.equal(r.bondOrder, (r.bonding - r.antibonding) / 2, id); assert.equal(r.bonding + r.antibonding, sp(id).valenceElectrons); } });
  test("[magnetism] O₂, B₂, and the radical ions are paramagnetic; N₂, C₂, F₂, H₂, He₂, Ne₂, O₂²⁻ are diamagnetic", () => {
    for (const id of ["o2", "b2", "h2p", "he2p", "n2p", "o2p", "o2m"]) assert.equal(ground(id).magnetism, "paramagnetic", id);
    for (const id of ["n2", "c2", "f2", "h2", "he2", "ne2", "o2m2", "be2", "li2", "c2m2"]) assert.equal(ground(id).magnetism, "diamagnetic", id);
  });
  test("[oxygen] ground state is (σ2s)² (σ*2s)² (σ2p)² (π2p)⁴ (π*2p)²: the two π* electrons sit in different orbitals with parallel spins; spin multiplicity 3; spin-only moment √8 = 2.83 μB", () => {
    const r = ground("o2"); assert.equal(r.configuration, "(σ2s)² (σ*2s)² (σ2p)² (π2p)⁴ (π*2p)²"); assert.equal(r.multiplicity, 3); near(r.spinOnlyMagneticMoment, Math.sqrt(8), 1e-12); assert.equal(r.spinTotal, 1);
    const occ = M.groundOccupancy(sp("o2")); const boxes = M.boxesOf(sp("o2")); const star = boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.id.startsWith("p2p*")).map(({ i }) => occ[i]); assert.deepEqual(star, [1, 1]);
  });
  test("[nitrogen] (σ2s)² (σ*2s)² (π2p)⁴ (σ2p)², bond order 3, no moment", () => { const r = ground("n2"); assert.equal(r.configuration, "(σ2s)² (σ*2s)² (π2p)⁴ (σ2p)²"); assert.equal(r.spinOnlyMagneticMoment, null); assert.equal(r.multiplicity, 1); assert.equal(r.bonding, 8); assert.equal(r.antibonding, 2); });
  test("[N₂ vs O₂] both have 8 bonding electrons; O₂ has two more antibonding electrons (π*), so its bond order is lower (2 vs 3) and it has two unpaired electrons", () => {
    const n = ground("n2"); const o = ground("o2"); assert.equal(n.bonding, 8); assert.equal(o.bonding, 8); assert.equal(n.antibonding, 2); assert.equal(o.antibonding, 4); assert.ok(n.bondOrder > o.bondOrder); assert.equal(n.unpaired, 0); assert.equal(o.unpaired, 2);
  });
  test("[boron and carbon] B₂ has two unpaired π electrons (paramagnetic) and C₂ has none, because π2p lies below σ2p; with the other ordering they swap", () => {
    assert.equal(ground("b2").configuration, "(σ2s)² (σ*2s)² (π2p)²"); assert.equal(ground("b2").unpaired, 2);
    const swapped = (id) => { const s = M.withOrdering(sp(id), "no-mixing"); return M.analyzeOccupancy(s, M.groundOccupancy(s)); };
    assert.equal(swapped("b2").unpaired, 0); assert.equal(swapped("c2").unpaired, 2); near(swapped("b2").bondOrder, 1, 1e-12); near(swapped("c2").bondOrder, 2, 1e-12);
  });
  test("[ions do not depend on the 2p ordering] bond order and unpaired electrons are identical under both orderings for N₂⁺, C₂²⁻, N₂, O₂⁺, O₂⁻, O₂²⁻, O₂, F₂, Ne₂ (B₂ and C₂ are the ones that change)", () => {
    for (const id of ["n2p", "c2m2", "n2", "o2p", "o2m", "o2m2", "o2", "f2", "ne2", "li2", "be2"]) {
      const a = M.withOrdering(sp(id), "sp-mixing"); const b = M.withOrdering(sp(id), "no-mixing"); const A = M.analyzeOccupancy(a, M.groundOccupancy(a)); const B = M.analyzeOccupancy(b, M.groundOccupancy(b));
      assert.equal(A.bondOrder, B.bondOrder, id); assert.equal(A.unpaired, B.unpaired, id);
    }
    for (const id of ["b2", "c2"]) { const a = M.withOrdering(sp(id), "sp-mixing"); const b = M.withOrdering(sp(id), "no-mixing"); assert.notEqual(M.analyzeOccupancy(a, M.groundOccupancy(a)).unpaired, M.analyzeOccupancy(b, M.groundOccupancy(b)).unpaired, id); }
  });
  test("[trends] bond order rises N₂⁺ 2.5 → N₂ 3; falls O₂⁺ 2.5 → O₂ 2 → O₂⁻ 1.5 → O₂²⁻ 1; F₂ 1; Ne₂ and He₂ 0 (no net bonding in this model)", () => {
    const bo = (id) => ground(id).bondOrder; assert.ok(bo("n2") > bo("n2p")); assert.deepEqual(["o2p", "o2", "o2m", "o2m2"].map(bo), [2.5, 2, 1.5, 1]); assert.equal(bo("he2"), 0); assert.equal(bo("ne2"), 0); assert.equal(bo("f2"), 1);
  });
});

describe("student occupancy", () => {
  const O2 = () => sp("o2");
  const set = (s, entries) => { const o = new Array(M.boxesOf(s).length).fill(0); for (const [id, c] of Object.entries(entries)) { const i = M.boxesOf(s).findIndex((b) => b.id === id); assert.ok(i >= 0, id); o[i] = c; } return o; };
  test("[invalid codes and length] values outside 0..3, wrong length are errors, not coerced", () => {
    assert.equal(M.analyzeOccupancy(O2(), [4, 0, 0, 0, 0, 0, 0, 0, 0, 0]).valid, false); assert.equal(M.analyzeOccupancy(O2(), [0, 0]).valid, false); assert.equal(M.analyzeOccupancy(O2(), M.groundOccupancy(O2()).map((c, i) => (i === 0 ? 1.5 : c))).valid, false);
    assert.equal(M.analyzeOccupancy(O2(), [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0]).valid, false);
  });
  test("[count] too few or too many electrons gives complete = false with placed and expected", () => {
    const few = M.analyzeOccupancy(O2(), set(O2(), { s2s: 3 })); assert.equal(few.placed, 2); assert.equal(few.expected, 12); assert.equal(few.complete, false);
    const many = M.analyzeOccupancy(O2(), M.groundOccupancy(O2()).map((c) => (c === 0 ? 3 : c))); assert.ok(many.placed > 12); assert.equal(many.complete, false);
  });
  test("[Hund's rule] pairing in one π* orbital while the other is empty, or opposite spins in separate π* orbitals, is reported; the ground state is not", () => {
    const paired = set(O2(), { s2s: 3, "s2s*": 3, s2p: 3, "p2p#1": 3, "p2p#2": 3, "p2p*#1": 3 }); const rp = M.analyzeOccupancy(O2(), paired); assert.equal(rp.placed, 12); assert.equal(rp.hundViolations.length, 1); assert.match(rp.hundViolations[0], /π\*2p/); assert.equal(rp.isGroundState, false); assert.equal(rp.unpaired, 0); assert.equal(rp.magnetism, "diamagnetic");
    const anti = set(O2(), { s2s: 3, "s2s*": 3, s2p: 3, "p2p#1": 3, "p2p#2": 3, "p2p*#1": 1, "p2p*#2": 2 }); const ra = M.analyzeOccupancy(O2(), anti); assert.equal(ra.hundViolations.length, 1); assert.match(ra.hundViolations[0], /opposite spins/); assert.equal(ra.unpaired, 2); assert.equal(ra.spinTotal, 0); assert.equal(ra.spinOnlyMagneticMoment, null);
    assert.deepEqual(ground("o2").hundViolations, []);
  });
  test("[Aufbau] an electron in σ*2p while π*2p is not full is an excited configuration, flagged; a promoted electron does not count as the ground state", () => {
    const exc = set(O2(), { s2s: 3, "s2s*": 3, s2p: 3, "p2p#1": 3, "p2p#2": 3, "p2p*#1": 1, "s2p*": 1 }); const r = M.analyzeOccupancy(O2(), exc); assert.equal(r.placed, 12); assert.ok(r.aufbauViolations.length >= 1); assert.equal(r.isGroundState, false); assert.match(r.aufbauViolations[0], /σ\*2p/);
  });
  test("[equivalent ground states] swapping the two degenerate π* orbitals or flipping every spin still counts as the ground state", () => {
    const flip = set(O2(), { s2s: 3, "s2s*": 3, s2p: 3, "p2p#1": 3, "p2p#2": 3, "p2p*#1": 2, "p2p*#2": 2 }); assert.equal(M.analyzeOccupancy(O2(), flip).isGroundState, true);
    const swap = set(O2(), { s2s: 3, "s2s*": 3, s2p: 3, "p2p#1": 3, "p2p#2": 3, "p2p*#1": 1, "p2p*#2": 1 }); assert.equal(M.analyzeOccupancy(O2(), swap).isGroundState, true);
  });
  test("[Pauli] a box cannot take a second electron of the same spin or a third electron; add/cycle/remove respect this", () => {
    let o = [0, 0]; assert.deepEqual(M.addElectron(o, 0, "up"), [1, 0]); assert.equal(M.addElectron([1, 0], 0, "up"), null); assert.deepEqual(M.addElectron([1, 0], 0, "down"), [3, 0]); assert.equal(M.addElectron([3, 0], 0, "up"), null); assert.equal(M.addElectron([3, 0], 0, "down"), null); assert.equal(M.addElectron(o, 5, "up"), null); assert.equal(M.addElectron(o, -1, "up"), null);
    assert.deepEqual(M.cycleBox([0], 0), [1]); assert.deepEqual(M.cycleBox([1], 0), [2]); assert.deepEqual(M.cycleBox([2], 0), [3]); assert.deepEqual(M.cycleBox([3], 0), [0]); assert.equal(M.cycleBox([0], 3), null);
    assert.deepEqual(M.removeElectron([3], 0), [2]); assert.deepEqual(M.removeElectron([1], 0), [0]); assert.equal(M.removeElectron([0], 0), null);
  });
  test("[per-level counts] bonding and antibonding electron counts follow the occupancy, not the species", () => {
    const o = set(O2(), { s2s: 3, "s2s*": 3 }); const r = M.analyzeOccupancy(O2(), o); assert.equal(r.bonding, 2); assert.equal(r.antibonding, 2); assert.equal(r.bondOrder, 0); assert.equal(r.perLevel.find((l) => l.label === "σ*2s").electrons, 2);
    assert.equal(M.analyzeOccupancy(sp("h2"), [3, 0]).bondOrder, 1); assert.equal(M.analyzeOccupancy(sp("h2"), [0, 3]).bondOrder, -1);
  });
});

describe("LCAO illustration of σ1s and σ*1s", () => {
  const S = (R) => Math.exp(-R) * (1 + R + (R * R) / 3);
  test("[overlap integral] S(0) = 1, S(1.4) = 0.7529 (H₂ equilibrium, exponent 1), S decreases monotonically to 0", () => {
    near(M.overlapS(0), 1, 1e-12); near(M.overlapS(1.4), 0.7529, 2e-4); near(M.overlapS(1.4), S(1.4), 1e-14); let prev = 1; for (let R = 0.2; R <= 8; R += 0.2) { const s = M.overlapS(R); assert.ok(s < prev); prev = s; } near(M.overlapS(10), 0.00200, 1e-4); assert.ok(M.overlapS(15) < 1e-3);
  });
  test("[normalisation] ∫ψ² dV = 1 for both combinations at R = 0.8, 1.4, 3 (own cylindrical quadrature)", () => {
    for (const R of [0.8, 1.4, 3]) for (const sign of [1, -1]) {
      const nr = 600; const nz = 1200; const rmax = 12; const zmax = 14; let sum = 0;
      for (let i = 0; i < nr; i++) { const rho = ((i + 0.5) * rmax) / nr; for (let j = 0; j < nz; j++) { const z = -zmax + ((j + 0.5) * 2 * zmax) / nz; const a = M.lcaoAmplitude(sign, R, rho, z); sum += a * a * 2 * Math.PI * rho; } }
      near(sum * (rmax / nr) * ((2 * zmax) / nz), 1, 3e-3, `R=${R} sign=${sign}`);
    }
  });
  test("[nodal plane] the out-of-phase combination is zero on the plane midway between the nuclei; the in-phase one is not; ψ+ is even and ψ− odd in z", () => {
    for (const R of [0.8, 1.4, 3]) { for (const x of [0, 0.7, 2]) { near(M.lcaoAmplitude(-1, R, x, 0), 0, 1e-14); assert.ok(M.lcaoAmplitude(1, R, x, 0) > 0); } for (const [x, z] of [[0.3, 0.9], [1.1, 2.2]]) { near(M.lcaoAmplitude(1, R, x, z), M.lcaoAmplitude(1, R, x, -z), 1e-14); near(M.lcaoAmplitude(-1, R, x, z), -M.lcaoAmplitude(-1, R, x, -z), 1e-14); } }
  });
  test("[density between the nuclei] bonding combination has more density at the midpoint than the sum of two separate atomic densities; antibonding has none", () => {
    const R = 1.4; const mid = M.lcaoAmplitude(1, R, 0, 0) ** 2; const atomic = 2 * (Math.exp(-R / 2) / Math.sqrt(Math.PI)) ** 2 / 2; assert.ok(mid > atomic); assert.equal(M.lcaoAmplitude(-1, R, 0, 0) ** 2 < 1e-28, true);
  });
  test("[grid] sign map matches the amplitude: bonding is non-negative everywhere, antibonding changes sign across z = 0", () => {
    const g = M.lcaoGrid(1, 1.4); assert.ok(g.amplitude.every((v) => v >= 0)); const a = M.lcaoGrid(-1, 1.4); assert.ok(a.amplitude.some((v) => v > 0) && a.amplitude.some((v) => v < 0)); assert.equal(g.amplitude.length, g.N * g.N);
  });
});
