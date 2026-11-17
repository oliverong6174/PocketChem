// Stage 23: membrane transport models. Expected values are derived here by hand (classical constants, log10 forms, closed forms)
// and are not produced by calling the module under test.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

const M = await loadModule("/src/utils/biology/membrane23.ts");
after(async () => { await closeEngine(); });

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);
// independent constants and a base-10 form of the Nernst slope: (2.302585 R T / F) per decade, in mV
const R = 8.314462618, F = 96485.33212;
const slope = (tempC) => (1000 * Math.LN10 * R * (tempC + 273.15)) / F;
const E = (z, out, inn, tempC = 37) => (slope(tempC) / z) * Math.log10(out / inn);

describe("temperature and Nernst potentials", () => {
  test("Celsius to kelvin", () => { near(M.toKelvin(0), 273.15, 1e-12); near(M.toKelvin(37), 310.15, 1e-12); near(M.toKelvin(25), 298.15, 1e-12); });
  test("RT/F at 37 C is about 26.7 mV (61.5 mV per decade)", () => { near(M.rtOverFMv(37), 26.7, 0.05); near(slope(37), 61.5, 0.05); });
  test("K+ 4/140 mM at 37 C is near -95 mV", () => { near(M.nernstMv(1, 4, 140, 37), E(1, 4, 140), 1e-9); near(M.nernstMv(1, 4, 140, 37), -95, 0.5); });
  test("Na+ 145/12 mM at 37 C is near +66 mV", () => near(M.nernstMv(1, 145, 12, 37), 66.5, 0.5));
  test("Cl- 110/10 mM: the anion sign (z = -1) reverses the potential, about -64 mV", () => {
    near(M.nernstMv(-1, 110, 10, 37), E(-1, 110, 10), 1e-9);
    near(M.nernstMv(-1, 110, 10, 37), -64, 0.5);
    assert.ok(Math.sign(M.nernstMv(-1, 110, 10, 37)) === -Math.sign(M.nernstMv(1, 110, 10, 37)));
  });
  test("Ca2+ uses half the slope: 1.8 mM out, 100 nM in is about +131 mV", () => { near(M.nernstMv(2, 1.8, 0.0001, 37), (slope(37) / 2) * Math.log10(18000), 1e-9); near(M.nernstMv(2, 1.8, 0.0001, 37), 131, 1); });
  test("zero when concentrations are equal; antisymmetric under swap", () => {
    assert.equal(M.nernstMv(1, 10, 10, 20), 0);
    near(M.nernstMv(1, 30, 5, 37), -M.nernstMv(1, 5, 30, 37), 1e-9);
  });
  test("a tenfold gradient gives 61.5 mV at 37 C and 58.2 mV at 20 C for a monovalent cation", () => { near(M.nernstMv(1, 100, 10, 37), 61.5, 0.05); near(M.nernstMv(1, 100, 10, 20), 58.2, 0.05); });
  test("temperature scales the potential linearly in kelvin", () => near(M.nernstMv(1, 100, 10, 50) / M.nernstMv(1, 100, 10, 0), 323.15 / 273.15, 1e-12));
  test("z = 0 and non-positive concentrations are rejected", () => {
    assert.throws(() => M.nernstMv(0, 1, 1, 37));
    assert.throws(() => M.nernstMv(1, 0, 1, 37));
    assert.throws(() => M.nernstMv(1, 1, -2, 37));
  });
});

describe("ion validation", () => {
  const good = () => JSON.parse(JSON.stringify(M.TYPICAL_IONS));
  test("typical values validate", () => assert.equal(M.validateIonSet(good()).ok, true));
  test("zero, negative, NaN, string, missing and absurd concentrations are rejected", () => {
    for (const bad of [0, -1, NaN, Infinity, "5", null, 1e9]) { const s = good(); s.k.in = bad; assert.equal(M.validateIonSet(s).ok, false, String(bad)); }
    const s = good(); delete s.ca; assert.equal(M.validateIonSet(s).ok, false);
  });
  test("temperature and voltage ranges", () => {
    assert.equal(M.validTemp(-1), false); assert.equal(M.validTemp(51), false); assert.equal(M.validTemp(37), true);
    assert.equal(M.validVm(-201), false); assert.equal(M.validVm(101), false); assert.equal(M.validVm(NaN), false);
  });
});

describe("electrochemical driving force and direction", () => {
  const set = M.TYPICAL_IONS;
  test("at Vm = -70 mV: Na+ and Ca2+ are driven in, K+ out", () => {
    assert.equal(M.ionDriving("na", set.na, -70, 37).direction, "inward");
    assert.equal(M.ionDriving("ca", set.ca, -70, 37).direction, "inward");
    assert.equal(M.ionDriving("k", set.k, -70, 37).direction, "outward");
  });
  test("Cl- at -70 mV (E about -64) is driven out because the inside is more negative than E", () => assert.equal(M.ionDriving("cl", set.cl, -70, 37).direction, "outward"));
  test("Cl- at -50 mV (less negative than E) moves in", () => assert.equal(M.ionDriving("cl", set.cl, -50, 37).direction, "inward"));
  test("K+ driving force is Vm - E = +25 mV and costs +2.4 kJ/mol to move in", () => {
    const d = M.ionDriving("k", set.k, -70, 37);
    near(d.drivingMv, -70 - (-95), 0.5);
    near(d.deltaGInwardKJ, (1 * F * (d.drivingMv / 1000)) / 1000, 1e-9);
    near(d.deltaGInwardKJ, 2.4, 0.1);
  });
  test("chemical and electrical terms add up to Vm - E", () => {
    for (const id of ["na", "k", "cl", "ca"]) { const d = M.ionDriving(id, set[id], -55, 37); near(d.chemicalMv + d.electricalMv, d.drivingMv, 1e-9); }
  });
  test("a concentration gradient alone does not decide the direction: K+ moves in against its concentration gradient if Vm is below E_K", () => {
    const d = M.ionDriving("k", set.k, -120, 37); // far more negative than E_K = -95
    assert.ok(set.k.out < set.k.in); assert.equal(d.direction, "inward");
  });
  test("at Vm = E the ion is at electrochemical equilibrium", () => {
    const e = M.nernstMv(1, 4, 140, 37);
    const d = M.ionDriving("k", set.k, e, 37);
    assert.equal(d.direction, "none"); assert.equal(d.currentSign, 0); near(d.deltaGInwardKJ, 0, 1e-9);
  });
  test("current sign: outward flow of a cation and inward flow of an anion are both outward-positive-current opposites", () => {
    assert.equal(M.ionDriving("k", set.k, -70, 37).currentSign, 1);   // K+ leaves: outward current
    assert.equal(M.ionDriving("na", set.na, -70, 37).currentSign, -1); // Na+ enters: inward current
    assert.equal(M.ionDriving("cl", set.cl, -50, 37).currentSign, 1);  // Cl- enters: outward current
  });
});

describe("GHK voltage", () => {
  const set = M.TYPICAL_IONS;
  test("resting neuron permeabilities 1 : 0.04 : 0.45 give about -69 mV", () => {
    const top = 1 * 4 + 0.04 * 145 + 0.45 * 10, bottom = 1 * 140 + 0.04 * 12 + 0.45 * 110;
    near(M.ghkVoltageMv(set, M.RESTING_PERMEABILITIES, 37), slope(37) * Math.log10(top / bottom), 1e-9);
    near(M.ghkVoltageMv(set, M.RESTING_PERMEABILITIES, 37), -69.1, 0.2);
  });
  test("only one permeant ion: the voltage equals that ion's Nernst potential", () => {
    near(M.ghkVoltageMv(set, { k: 1, na: 0, cl: 0 }, 37), E(1, 4, 140), 1e-9);
    near(M.ghkVoltageMv(set, { k: 0, na: 1, cl: 0 }, 37), E(1, 145, 12), 1e-9);
    near(M.ghkVoltageMv(set, { k: 0, na: 0, cl: 1 }, 37), E(-1, 110, 10), 1e-9);
  });
  test("it is not the plain average of the Nernst potentials", () => {
    const avg = (E(1, 4, 140) + E(1, 145, 12) + E(-1, 110, 10)) / 3;
    assert.ok(Math.abs(M.ghkVoltageMv(set, M.RESTING_PERMEABILITIES, 37) - avg) > 20);
  });
  test("it lies between the lowest and highest Nernst potentials and increases with P_Na", () => {
    const lo = E(1, 4, 140), hi = E(1, 145, 12);
    let prev = -Infinity;
    for (const pna of [0.01, 0.05, 0.2, 1, 5]) { const v = M.ghkVoltageMv(set, { k: 1, na: pna, cl: 0.45 }, 37); assert.ok(v > lo && v < hi); assert.ok(v > prev); prev = v; }
  });
  test("raising extracellular K+ depolarizes a K+-dominated membrane", () => {
    const hiK = JSON.parse(JSON.stringify(set)); hiK.k.out = 20;
    assert.ok(M.ghkVoltageMv(hiK, M.RESTING_PERMEABILITIES, 37) > M.ghkVoltageMv(set, M.RESTING_PERMEABILITIES, 37));
  });
  test("relative permeabilities are validated and cannot be all zero", () => {
    assert.equal(M.validatePermeabilities({ k: 0, na: 0, cl: 0 }).ok, false);
    assert.equal(M.validatePermeabilities({ k: -1, na: 1, cl: 1 }).ok, false);
    assert.equal(M.validatePermeabilities({ k: 1, na: "x", cl: 1 }).ok, false);
    assert.equal(M.validatePermeabilities({ k: 1, na: 0.04, cl: 0.45 }).ok, true);
    assert.throws(() => M.ghkVoltageMv(set, { k: 0, na: 0, cl: 0 }, 37));
  });
  test("explorer: GHK source follows permeabilities, manual source follows the typed voltage", () => {
    const a = M.evaluateIons({ ...M.DEFAULT_ION_EXPLORER, vmSource: "manual", vmManualMv: -40 });
    assert.equal(a.vmMv, -40);
    const b = M.evaluateIons(M.DEFAULT_ION_EXPLORER);
    near(b.vmMv, -69.1, 0.2);
    assert.equal(b.ions.length, 4);
  });
  test("explorer validation rejects unknown ions and sources", () => {
    const ok = JSON.parse(JSON.stringify(M.DEFAULT_ION_EXPLORER));
    assert.equal(M.validateIonExplorer(ok).ok, true);
    assert.equal(M.validateIonExplorer({ ...ok, selected: "mg" }).ok, false);
    assert.equal(M.validateIonExplorer({ ...ok, vmSource: "auto" }).ok, false);
    assert.equal(M.validateIonExplorer({ ...ok, tempC: 80 }).ok, false);
  });
});

describe("passive transport", () => {
  const base = M.DEFAULT_PASSIVE;
  test("simple diffusion: J = P (Cout - Cin) = 0.01 x (8 - 2) = 0.06 inward", () => {
    const r = M.evaluatePassive(base);
    near(r.fluxIn, 0.06, 1e-12); assert.equal(r.direction, "inward"); assert.equal(r.requiresATP, false); assert.equal(r.charged, false);
  });
  test("direction reverses with the gradient and vanishes at equilibrium", () => {
    assert.equal(M.evaluatePassive({ ...base, cOut: 1, cIn: 9 }).direction, "outward");
    assert.ok(M.evaluatePassive({ ...base, cOut: 1, cIn: 9 }).fluxIn < 0);
    const eq = M.evaluatePassive({ ...base, cOut: 5, cIn: 5 });
    assert.equal(eq.direction, "none"); assert.equal(eq.equilibrium, true); assert.equal(eq.fluxIn, 0);
  });
  test("permeability and concentration difference are independent factors", () => {
    const a = M.evaluatePassive({ ...base, permeability: 0.01 }), b = M.evaluatePassive({ ...base, permeability: 0.02 });
    near(b.fluxIn / a.fluxIn, 2, 1e-12);
    assert.equal(a.concentrationDifference, b.concentrationDifference);
    const c = M.evaluatePassive({ ...base, cOut: 18, cIn: 12 }); // same difference 6, different absolute levels
    near(c.fluxIn, a.fluxIn, 1e-12);
  });
  test("a permeable but equal-concentration solute still has zero net flux, a gradient with tiny permeability has tiny flux", () => {
    assert.equal(M.evaluatePassive({ ...base, permeability: 10, cOut: 3, cIn: 3 }).fluxIn, 0);
    assert.ok(M.evaluatePassive({ ...base, permeability: 1e-9 }).fluxIn < 1e-7);
  });
  test("carrier: one-way terms, net flux, and saturation", () => {
    const c = { ...base, solute: "glucose", mechanism: "carrier", jmax: 2e-4, km: 5, cOut: 5, cIn: 1e-6 };
    const r = M.evaluatePassive(c);
    near(r.carrierTerms.out, 2e-4 * 5 / (5 + 5), 1e-15); near(r.fluxIn, 1e-4, 1e-9);
    const hi = M.evaluatePassive({ ...c, cOut: 1000 }), hi2 = M.evaluatePassive({ ...c, cOut: 2000 });
    assert.ok(hi2.fluxIn / hi.fluxIn < 1.01, "saturates near Jmax");
    assert.ok(hi2.fluxIn < 2e-4);
    const lo = M.evaluatePassive({ ...c, cOut: 0.01 }), lo2 = M.evaluatePassive({ ...c, cOut: 0.02 });
    near(lo2.fluxIn / lo.fluxIn, 2, 0.02); // linear at low concentration
  });
  test("carrier equal concentrations give zero net flux; no passive mechanism ever moves a neutral solute uphill", () => {
    assert.equal(M.evaluatePassive({ ...base, solute: "glucose", mechanism: "carrier", cOut: 4, cIn: 4 }).fluxIn, 0);
    for (const [mech, sol] of [["simple", "o2"], ["channel", "glycerol"], ["carrier", "glucose"]]) {
      for (const [o, i] of [[1, 9], [9, 1], [20, 21], [2000, 1e-6]]) {
        const r = M.evaluatePassive({ ...base, solute: sol, mechanism: mech, cOut: o, cIn: i });
        assert.equal(Math.sign(r.fluxIn), Math.sign(o - i), `${mech} ${o}/${i}`);
      }
    }
  });
  test("ions: direction follows the electrochemical balance, not the concentration difference", () => {
    // K+ 4 out / 140 in at -120 mV is below E_K (-95): K+ moves IN although its concentration is lower outside
    const k = M.evaluatePassive({ ...base, solute: "k", mechanism: "channel", cOut: 4, cIn: 140, vmMv: -120 });
    assert.equal(k.direction, "inward"); assert.ok(k.concentrationDifference < 0); assert.equal(k.fluxIn, null); assert.equal(k.charged, true);
    const k2 = M.evaluatePassive({ ...base, solute: "k", mechanism: "channel", cOut: 4, cIn: 140, vmMv: -70 });
    assert.equal(k2.direction, "outward");
  });
  test("no net movement for an ion at its equilibrium potential despite a large concentration difference", () => {
    const e = E(1, 145, 12);
    const r = M.evaluatePassive({ ...base, solute: "na", mechanism: "channel", cOut: 145, cIn: 12, vmMv: e });
    assert.equal(r.direction, "none"); assert.equal(r.equilibrium, true);
  });
  test("valence sign: with equal concentrations, a cation and an anion are driven in opposite directions by the same Vm", () => {
    const na = M.evaluatePassive({ ...base, solute: "na", mechanism: "channel", cOut: 10, cIn: 10, vmMv: -60 });
    const cl = M.evaluatePassive({ ...base, solute: "cl", mechanism: "channel", cOut: 10, cIn: 10, vmMv: -60 });
    assert.equal(na.direction, "inward"); assert.equal(cl.direction, "outward");
  });
  test("unsupported mechanism/solute pairs and invalid values are rejected", () => {
    assert.equal(M.validatePassive({ ...base, solute: "glucose", mechanism: "simple" }).ok, false);
    assert.equal(M.validatePassive({ ...base, solute: "o2", mechanism: "channel" }).ok, false);
    assert.equal(M.validatePassive({ ...base, solute: "na", mechanism: "carrier" }).ok, false);
    assert.equal(M.validatePassive({ ...base, solute: "water" }).ok, false);
    for (const bad of [{ cOut: 0 }, { cIn: -1 }, { cOut: NaN }, { permeability: 0 }, { permeability: 50 }, { tempC: 99 }, { vmMv: 300 }, { jmax: 0 }, { km: -2 }]) assert.equal(M.validatePassive({ ...base, ...bad }).ok, false, JSON.stringify(bad));
    assert.equal(M.validatePassive(base).ok, true);
  });
});

describe("active transport: Na+/K+-ATPase", () => {
  const c = M.NAK_CYCLE;
  test("stoichiometry constants: 3 Na+ out, 2 K+ in, 1 ATP", () => {
    assert.deepEqual({ ...M.NAK_STOICHIOMETRY }, { naOut: 3, kIn: 2, atpPerCycle: 1 });
    assert.equal(c.length, 8);
    const last = c[c.length - 1];
    assert.equal(last.naMovedOut, 3); assert.equal(last.kMovedIn, 2); assert.equal(last.atpHydrolyzed, 1); assert.equal(last.netChargeOut, 1);
  });
  test("the cycle is ordered correctly", () => {
    const first = (pred) => c.findIndex(pred);
    const naBind = first((s) => s.naBound === 3), phos = first((s) => s.phosphorylated), naOut = first((s) => s.naMovedOut === 3);
    const kBind = first((s) => s.kBound === 2), dephos = first((s) => s.piReleased === 1), kIn = first((s) => s.kMovedIn === 2);
    assert.ok(naBind < phos && phos < naOut && naOut < kBind && kBind < dephos && dephos < kIn);
    assert.equal(c[naOut].conformation, "E2~P"); assert.equal(c[naOut].facing, "extracellular");
    assert.equal(c[naBind].conformation, "E1"); assert.equal(c[naBind].facing, "cytosol");
    assert.equal(c[phos].facing, "occluded");
    assert.equal(c[dephos].phosphorylated, false);
    assert.equal(c[kBind].conformation, "E2~P"); // K+ binds the phosphorylated E2 form
  });
  test("one ATP is hydrolysed once per cycle and never twice", () => { for (const s of c) assert.ok(s.atpHydrolyzed <= 1); assert.equal(c.filter((s) => s.atpHydrolyzed === 1).length, 6); });
  test("ions are never counted as moved before they are released, and bound ions never exceed the stoichiometry", () => {
    for (const s of c) { assert.ok(s.naBound <= 3 && s.kBound <= 2); if (s.naMovedOut === 3) assert.equal(s.naBound, 0); if (s.kMovedIn === 2) assert.equal(s.kBound, 0); }
    assert.equal(c[0].netChargeOut, 0);
  });
  test("perturbations stop the cycle at the right place", () => {
    assert.equal(M.pumpMaxStep("none"), 7);
    assert.equal(M.pumpMaxStep("no-atp"), 1);
    assert.equal(M.pumpMaxStep("ouabain"), 4);
    assert.equal(M.pumpState(7, "none").kMovedIn, 2);
    assert.equal(M.pumpState(7, "ouabain").kMovedIn, 0);
    assert.equal(M.pumpState(7, "no-atp").atpHydrolyzed, 0);
    assert.equal(M.pumpState(7, "ouabain").phosphorylated, true);
    assert.throws(() => M.pumpState(8, "none")); assert.throws(() => M.pumpState(-1, "none")); assert.throws(() => M.pumpState(1.5, "none"));
  });
  test("the electrogenic note separates the pump's direct charge movement from the larger membrane potential", () => assert.match(M.PUMP_ELECTROGENIC_NOTE, /net of one positive charge out/) && assert.match(M.PUMP_ELECTROGENIC_NOTE, /small/));
});

describe("active transport: SGLT1 secondary active symport", () => {
  const T = 310.15;
  test("energy of two Na+ and one glucose moving in is hand-derived", () => {
    const i = M.DEFAULT_SGLT; // Nao 145, Nai 12, glucose equal, Vm -60
    const rt = (R * T) / 1000;
    const hand = 2 * (rt * Math.log(12 / 145) + (F * -0.06) / 1000);
    const r = M.evaluateSglt(i);
    near(r.deltaGCycleKJ, hand, 1e-9); near(r.deltaGCycleKJ, -24.4, 0.1);
    assert.equal(r.glucoseDirection, "inward"); assert.equal(r.usesATPDirectly, false);
  });
  test("accumulation limit equals (Na out/Na in)^2 exp(-2FVm/RT) and balances the free energy", () => {
    const i = M.DEFAULT_SGLT;
    const limit = (145 / 12) ** 2 * Math.exp((2 * 0.06 * F) / (R * T));
    const r = M.evaluateSglt(i);
    near(r.maxAccumulationRatio / limit, 1, 1e-9);
    const eq = M.evaluateSglt({ ...i, gluOut: 1, gluIn: r.maxAccumulationRatio });
    near(eq.deltaGCycleKJ, 0, 1e-6); assert.equal(eq.glucoseDirection, "none");
  });
  test("a smaller sodium gradient (higher internal Na+) lowers the limit; reverse transport is possible above it", () => {
    const a = M.evaluateSglt(M.DEFAULT_SGLT), b = M.evaluateSglt({ ...M.DEFAULT_SGLT, naIn: 60 });
    assert.ok(b.maxAccumulationRatio < a.maxAccumulationRatio / 10);
    assert.equal(M.evaluateSglt({ ...M.DEFAULT_SGLT, naIn: 145, vmMv: 0, gluOut: 1, gluIn: 50 }).glucoseDirection, "outward");
  });
  test("glucose moves in against its own gradient only because of the sodium term", () => {
    const r = M.evaluateSglt({ ...M.DEFAULT_SGLT, gluOut: 1, gluIn: 50 });
    assert.ok(r.glucoseTermKJ > 0 && r.naTermKJ < 0 && r.glucoseDirection === "inward");
  });
  test("secondary active transporters are not listed as hydrolysing ATP; the primary pumps are", () => {
    for (const t of M.TRANSPORTERS) assert.equal(t.usesATPDirectly, t.category === "Primary active", t.name);
    assert.ok(M.TRANSPORTERS.some((t) => t.category === "Secondary active (antiport)") && M.TRANSPORTERS.some((t) => t.category === "Secondary active (symport)"));
    assert.match(M.SGLT_STEPS[2].text, /No ATP is hydrolysed/);
  });
  test("validation", () => {
    assert.equal(M.validateSglt(M.DEFAULT_SGLT).ok, true);
    assert.equal(M.validateSglt({ ...M.DEFAULT_SGLT, naIn: 0 }).ok, false);
    assert.equal(M.validateSglt({ ...M.DEFAULT_SGLT, vmMv: -999 }).ok, false);
  });
});

describe("osmosis and tonicity", () => {
  const base = M.DEFAULT_OSMOSIS; // inside 300 mOsm impermeant; outside 150 mM NaCl = 300 mOsm
  test("NaCl counts two particles: 150 mM is isotonic and iso-osmotic with 300 mOsm inside", () => {
    const r = M.evaluateOsmosis(base);
    assert.equal(r.outImpermeantOsm, 300); assert.equal(r.tonicity, "isotonic"); assert.equal(r.osmolarity, "iso-osmotic");
    assert.equal(r.initialWater, "no net movement"); assert.equal(r.relativeVolume, 1);
  });
  test("hypotonic: water enters; the cell initially swells; ideal volume ratio is 300/150", () => {
    const r = M.evaluateOsmosis({ ...base, naCl: 75 });
    assert.equal(r.tonicity, "hypotonic"); assert.equal(r.initialWater, "into the cell"); assert.equal(r.cellInitially, "swells"); assert.equal(r.osmolarity, "hypoosmotic");
    assert.equal(r.relativeVolume, 2);
  });
  test("hypertonic: water leaves; the cell shrinks; ideal volume ratio is 300/600", () => {
    const r = M.evaluateOsmosis({ ...base, naCl: 300 });
    assert.equal(r.tonicity, "hypertonic"); assert.equal(r.initialWater, "out of the cell"); assert.equal(r.cellInitially, "shrinks"); assert.equal(r.relativeVolume, 0.5);
  });
  test("sucrose is impermeant: 300 mM sucrose is isotonic, 600 mM hypertonic", () => {
    assert.equal(M.evaluateOsmosis({ ...base, naCl: 0, sucrose: 300 }).tonicity, "isotonic");
    assert.equal(M.evaluateOsmosis({ ...base, naCl: 0, sucrose: 600 }).tonicity, "hypertonic");
  });
  test("osmolarity differs from tonicity: 300 mM urea outside is iso-osmotic but hypotonic, and the model gives no volume", () => {
    const r = M.evaluateOsmosis({ ...base, naCl: 0, urea: 300 });
    assert.equal(r.osmolarity, "iso-osmotic"); assert.equal(r.tonicity, "hypotonic"); assert.equal(r.disagree, true);
    assert.equal(r.initialWater, "into the cell"); assert.equal(r.relativeVolume, null); assert.match(r.volumeNote, /no effectively impermeant solute/);
  });
  test("adding permeant urea to an isotonic solution makes it hyperosmotic but still isotonic", () => {
    const r = M.evaluateOsmosis({ ...base, urea: 200 });
    assert.equal(r.osmolarity, "hyperosmotic"); assert.equal(r.tonicity, "isotonic"); assert.equal(r.disagree, true); assert.equal(r.initialWater, "no net movement");
    assert.equal(r.relativeVolume, 1); // an equilibrated permeant solute does not change the ideal volume
  });
  test("agreeing classifications do not claim disagreement", () => assert.equal(M.evaluateOsmosis({ ...base, naCl: 75 }).disagree, false));
  test("outside the supported range no volume is given (no unlimited swelling or rupture predicted)", () => {
    const r = M.evaluateOsmosis({ ...base, naCl: 10 }); // ideal ratio 15
    assert.equal(r.tonicity, "hypotonic"); assert.equal(r.relativeVolume, null); assert.match(r.volumeNote, /not supported/);
    assert.equal(M.evaluateOsmosis({ ...base, naCl: 600 }).relativeVolume, null); // ratio 0.25
  });
  test("the water direction depends only on the impermeant solute balance", () => {
    for (const urea of [0, 100, 500]) assert.equal(M.evaluateOsmosis({ ...base, naCl: 100, urea }).initialWater, "into the cell");
  });
  test("validation", () => {
    assert.equal(M.validateOsmosis(base).ok, true);
    for (const bad of [{ inImpermeant: 0 }, { naCl: -1 }, { sucrose: 5000 }, { urea: NaN }, { inUrea: "3" }]) assert.equal(M.validateOsmosis({ ...base, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("bilayer", () => {
  test("every named component is present with a function and unique ids", () => {
    const ids = M.BILAYER_COMPONENTS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const need of ["head", "tail", "integral", "peripheral", "cholesterol", "channel", "carrier", "pump"]) assert.ok(ids.includes(need), need);
    for (const c of M.BILAYER_COMPONENTS) assert.ok(c.role.length > 40);
    assert.match(M.BILAYER_COMPONENTS.find((c) => c.id === "head").role, /polar/);
    assert.match(M.BILAYER_COMPONENTS.find((c) => c.id === "tail").role, /hydrophobic/);
  });
  test("fluidity rises with unsaturation and temperature (no cholesterol) and is only ordinal", () => {
    const L = ["saturated", "mixed", "unsaturated"], T = ["cool", "moderate", "warm"];
    for (const t of T) { let prev = -1; for (const l of L) { const v = M.fluidity({ lipids: l, temperature: t, cholesterol: false }).level; assert.ok(v > prev); prev = v; } }
    for (const l of L) { let prev = -1; for (const t of T) { const v = M.fluidity({ lipids: l, temperature: t, cholesterol: false }).level; assert.ok(v > prev); prev = v; } }
    assert.equal(M.fluidity({ lipids: "saturated", temperature: "cool", cholesterol: false }).level, 0);
    assert.equal(M.fluidity({ lipids: "unsaturated", temperature: "warm", cholesterol: false }).level, 4);
  });
  test("cholesterol moderates the extremes only", () => {
    assert.equal(M.fluidity({ lipids: "saturated", temperature: "cool", cholesterol: true }).level, 1);
    assert.equal(M.fluidity({ lipids: "unsaturated", temperature: "warm", cholesterol: true }).level, 3);
    assert.equal(M.fluidity({ lipids: "mixed", temperature: "moderate", cholesterol: true }).level, 2);
    assert.match(M.FLUIDITY_CAVEAT, /not a measurement/);
  });
  test("validation", () => {
    assert.equal(M.validateBilayer(M.DEFAULT_BILAYER).ok, true);
    assert.equal(M.validateBilayer({ ...M.DEFAULT_BILAYER, lipids: "waxy" }).ok, false);
    assert.equal(M.validateBilayer({ ...M.DEFAULT_BILAYER, selected: "ribosome" }).ok, false);
    assert.equal(M.validateBilayer({ ...M.DEFAULT_BILAYER, cholesterol: "yes" }).ok, false);
    assert.equal(M.validateBilayer({ ...M.DEFAULT_BILAYER, selected: "pump" }).ok, true);
  });
  test("permeability classes: ions are least permeable through the lipid, nonpolar gases most", () => {
    const order = ["very low", "low", "moderate", "high"];
    const byId = Object.fromEntries(M.PERMEABILITY_CLASSES.map((c) => [c.id, order.indexOf(c.bilayer)]));
    assert.ok(byId.nonpolar > byId["polar-small"] && byId["polar-small"] > byId["polar-large"] && byId["polar-large"] > byId.ions);
  });
});
