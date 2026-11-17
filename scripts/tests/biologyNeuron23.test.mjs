// Stage 23: neuronal electrophysiology. Expected values come from closed forms, independent numerical integration written in this
// file, textbook Hodgkin–Huxley rate functions re-typed here, and physical bounds (E_Na, E_K), not from the module's own outputs.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

const N = await loadModule("/src/utils/biology/neuron23.ts");
const M = await loadModule("/src/utils/biology/membrane23.ts");
after(async () => { await closeEngine(); });

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);
const R = 8.314462618, F = 96485.33212;
const rtf = (T) => (1000 * R * (T + 273.15)) / F;

describe("anatomy", () => {
  test("every named structure is present with a function; the axon note rejects ion travel along the axon", () => {
    const ids = N.NEURON_PARTS.map((p) => p.id);
    for (const need of ["dendrites", "soma", "hillock", "axon", "myelin", "node", "terminal", "cleft", "postsynaptic"]) assert.ok(ids.includes(need), need);
    assert.equal(new Set(ids).size, ids.length);
    assert.match(N.NEURON_PARTS.find((p) => p.id === "axon").note, /do not travel along the axon/);
    assert.match(N.NEURON_PARTS.find((p) => p.id === "hillock").role, /voltage-gated Na⁺ channels/);
    assert.match(N.NEURON_PARTS.find((p) => p.id === "dendrites").role, /graded/);
    assert.match(N.NEURON_PARTS.find((p) => p.id === "terminal").note, /voltage-gated/);
  });
  test("input, initiation, propagation and output are distinguished", () => {
    const proc = Object.fromEntries(N.NEURON_PARTS.map((p) => [p.id, p.process]));
    assert.equal(proc.dendrites, "Input"); assert.equal(proc.hillock, "Initiation"); assert.equal(proc.axon, "Propagation"); assert.equal(proc.terminal, "Output");
  });
});

describe("resting potential", () => {
  const typ = () => JSON.parse(JSON.stringify(M.DEFAULT_ION_EXPLORER));
  test("GHK numerator and denominator, and the voltage, match the hand calculation", () => {
    const r = N.restingPotential(typ());
    near(r.ghkTop, 4 + 0.04 * 145 + 0.45 * 10, 1e-12); near(r.ghkBottom, 140 + 0.04 * 12 + 0.45 * 110, 1e-12);
    near(r.vmMv, rtf(37) * Math.log(14.3 / 189.98), 1e-9); near(r.vmMv, -69.1, 0.2);
  });
  test("the resting potential is not simply E_K: it lies above E_K by an amount that grows with P_Na", () => {
    const base = N.restingPotential(typ());
    near(base.nernst.find((n) => n.ion === "k").eMv, -95, 0.5);
    assert.ok(base.gapFromEkMv > 20);
    const lowNa = typ(); lowNa.perms.na = 0.001; lowNa.perms.cl = 0.001;
    assert.ok(N.restingPotential(lowNa).gapFromEkMv < 1);
    const hiNa = typ(); hiNa.perms.na = 0.2;
    assert.ok(N.restingPotential(hiNa).vmMv > base.vmMv);
  });
  test("changing intracellular K+ or extracellular K+ moves the voltage in the expected direction", () => {
    const a = typ(); a.ions.k.out = 10;
    assert.ok(N.restingPotential(a).vmMv > N.restingPotential(typ()).vmMv);
    const b = typ(); b.ions.k.in = 100;
    assert.ok(N.restingPotential(b).vmMv > N.restingPotential(typ()).vmMv);
  });
  test("the note and assumptions state the limits", () => {
    assert.match(N.RESTING_NOTE, /not simply E_K/); assert.ok(N.GHK_ASSUMPTIONS.some((s) => /Constant electric field/.test(s)));
    assert.ok(N.GHK_ASSUMPTIONS.some((s) => /pump/.test(s)));
  });
});

describe("passive RC membrane", () => {
  const base = N.DEFAULT_PASSIVE_MEMBRANE; // 100 MΩ, 100 pF, +100 pA from 5 ms for 40 ms, rest -65
  test("time constant tau = R C = 10 ms and steady change I R = 10 mV", () => {
    near(N.membraneTauMs(100, 100), 10, 1e-12); near(N.steadyDeltaMv(100, 100), 10, 1e-12);
    near(N.membraneTauMs(250, 40), 10, 1e-12); // 250 MΩ x 40 pF
    near(N.membraneTauMs(50, 300), 15, 1e-12);
  });
  test("charging: after one tau the voltage is 63.2 percent of the way, after five tau 99.3 percent", () => {
    near(N.passiveVoltageMv(base, 5), -65, 1e-12);
    near(N.passiveVoltageMv(base, 15), -65 + 10 * (1 - Math.exp(-1)), 1e-9); near(N.passiveVoltageMv(base, 15), -58.679, 1e-3);
    near(N.passiveVoltageMv(base, 25), -65 + 10 * (1 - Math.exp(-2)), 1e-9);
    near(N.stepFraction(1), 0.6321, 1e-4); near(N.stepFraction(5), 0.9933, 1e-4);
  });
  test("relaxation after the pulse: V − Vrest decays with the same tau", () => {
    const end = 45, vEnd = -65 + 10 * (1 - Math.exp(-4));
    near(N.passiveVoltageMv(base, end), vEnd, 1e-9);
    near(N.passiveVoltageMv(base, end + 10), -65 + (vEnd + 65) * Math.exp(-1), 1e-9);
    assert.ok(N.passiveVoltageMv(base, 200) - -65 < 1e-3);
  });
  test("continuous at the pulse edges", () => {
    near(N.passiveVoltageMv(base, 5 - 1e-9), N.passiveVoltageMv(base, 5 + 1e-9), 1e-6);
    near(N.passiveVoltageMv(base, 45 - 1e-9), N.passiveVoltageMv(base, 45 + 1e-9), 1e-6);
  });
  test("agrees with an independent numerical integration of C dV/dt = I − (V − Vrest)/R", () => {
    for (const p of [base, { ...base, rMohm: 300, cPf: 50, iPa: -80 }, { ...base, cPf: 300, pulseMs: 10 }]) {
      const tau = (p.rMohm * p.cPf) / 1000; const dt = tau / 4000;
      let v = p.vRestMv, t = 0, worst = 0;
      const rhs = (vv, tt) => ((tt >= p.tStartMs && tt < p.tStartMs + p.pulseMs ? p.iPa : 0) - (1000 * (vv - p.vRestMv)) / p.rMohm) / p.cPf;
      while (t < p.tMaxMs) {
        const k1 = rhs(v, t), k2 = rhs(v + (dt / 2) * k1, t + dt / 2), k3 = rhs(v + (dt / 2) * k2, t + dt / 2), k4 = rhs(v + dt * k3, t + dt);
        v += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4); t += dt;
        worst = Math.max(worst, Math.abs(v - N.passiveVoltageMv(p, t)));
      }
      assert.ok(worst < 0.05, `max deviation ${worst}`);
    }
  });
  test("changing R, C and I: steady value scales with I and R, speed with R C", () => {
    const a = N.passiveVoltageMv({ ...base, rMohm: 200, tMaxMs: 500, pulseMs: 200 }, 5 + 150) + 65; // ≈ I R = 20 mV
    near(a, 20 * (1 - Math.exp(-7.5)), 1e-9); // 150 ms = 7.5 tau at R = 200 MΩ (tau = 20 ms)
    const slow = { ...base, cPf: 200 }; // tau 20 ms
    assert.ok(N.passiveVoltageMv(slow, 15) < N.passiveVoltageMv(base, 15));
    near(N.passiveVoltageMv(slow, 5 + 20) + 65, 10 * (1 - Math.exp(-1)), 1e-9);
    const neg = { ...base, iPa: -100 }; near(N.passiveVoltageMv(neg, 15) + 65, -6.321, 1e-3);
    near(N.passiveVoltageMv({ ...base, iPa: 0 }, 20), -65, 1e-12);
  });
  test("trace shape and validation", () => {
    const tr = N.passiveTrace(base, 120); assert.equal(tr.length, 121); near(tr[0].t, 0, 1e-12); near(tr[120].t, base.tMaxMs, 1e-9);
    assert.equal(N.validatePassiveMembrane(base).ok, true);
    for (const bad of [{ rMohm: 0 }, { cPf: 9 }, { iPa: 400 }, { pulseMs: 0 }, { vRestMv: -20 }, { tMaxMs: 1 }, { rMohm: "100" }, { tStartMs: NaN }]) assert.equal(N.validatePassiveMembrane({ ...base, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("Hodgkin–Huxley action potential", () => {
  // textbook rate functions, typed independently
  const an = (v) => 0.01 * (v + 55) / (1 - Math.exp(-(v + 55) / 10)), bn = (v) => 0.125 * Math.exp(-(v + 65) / 80);
  const am = (v) => 0.1 * (v + 40) / (1 - Math.exp(-(v + 40) / 10)), bm = (v) => 4 * Math.exp(-(v + 65) / 18);
  const ah = (v) => 0.07 * Math.exp(-(v + 65) / 20), bh = (v) => 1 / (1 + Math.exp(-(v + 35) / 10));
  const base = N.DEFAULT_HH;
  const tr = N.simulateHh(base), an1 = N.analyzeHh(tr);
  const idx = (ms) => Math.round(ms / 0.05);

  test("rate functions and resting gate values agree with the textbook (m0 0.053, h0 0.596, n0 0.318)", () => {
    for (const v of [-80, -65, -50, 0, 30]) { near(N.alphaN(v), an(v), 1e-12); near(N.betaM(v), bm(v), 1e-12); near(N.alphaH(v), ah(v), 1e-12); near(N.betaH(v), bh(v), 1e-12); near(N.alphaM(v), am(v), 1e-12); near(N.betaN(v), bn(v), 1e-12); }
    near(N.steadyGate(an(-65), bn(-65)), 0.3177, 5e-4); near(N.steadyGate(am(-65), bm(-65)), 0.0529, 5e-4); near(N.steadyGate(ah(-65), bh(-65)), 0.5961, 5e-4);
    assert.ok(Number.isFinite(N.alphaN(-55)) && Number.isFinite(N.alphaM(-40)), "removable singularities handled");
    near(N.alphaN(-55 + 1e-9), 0.1, 1e-6); near(N.alphaM(-40 + 1e-9), 1, 1e-6);
  });
  test("with no stimulus the membrane stays at rest (-65 mV) and the gates stay at their steady values", () => {
    const rest = N.simulateHh({ ...base, amp: 0 });
    for (const v of rest.v) near(v, -65, 0.1);
    near(rest.m.at(-1), 0.0529, 2e-3); near(rest.h.at(-1), 0.5961, 3e-3); near(rest.n.at(-1), 0.3177, 3e-3);
    assert.equal(N.analyzeHh(rest).spikes, 0);
  });
  test("a threshold stimulus produces one all-or-none spike bounded by E_Na and E_K", () => {
    assert.equal(an1.spikes, 1);
    assert.ok(an1.peakMv > 30 && an1.peakMv < 45, `peak ${an1.peakMv}`);
    assert.ok(an1.peakMv < N.HH.eNa, "never reaches E_Na");
    assert.ok(an1.minAfterMv < -65 && an1.minAfterMv > N.HH.eK, `after-hyperpolarization ${an1.minAfterMv} lies between rest and E_K`);
    near(tr.v.at(-1), -65, 0.5);
  });
  test("subthreshold stimuli do not fire; suprathreshold amplitudes give nearly the same spike (all-or-none)", () => {
    assert.equal(N.analyzeHh(N.simulateHh({ ...base, amp: 5 })).spikes, 0);
    const peaks = [8, 10, 20, 40].map((amp) => N.analyzeHh(N.simulateHh({ ...base, amp })).peakMv);
    assert.ok(Math.max(...peaks) - Math.min(...peaks) < 5, JSON.stringify(peaks));
    for (const p of peaks) assert.ok(p > 30);
  });
  test("threshold amplitude for a 1 ms pulse is a few µA/cm² and the stimulus just above it fires, just below it does not", () => {
    const thr = N.thresholdAmplitude(base);
    assert.ok(thr > 5 && thr < 9, `threshold ${thr}`);
    assert.equal(N.analyzeHh(N.simulateHh({ ...base, amp: thr + 0.3 })).spikes, 1);
    assert.equal(N.analyzeHh(N.simulateHh({ ...base, amp: thr - 0.3 })).spikes, 0);
  });
  test("phases occur in the physiological order", () => {
    const seq = an1.transitions.map((x) => x.phase);
    assert.deepEqual(seq, ["depol", "rising", "repol", "ahp", "recovery", "rest"]);
    assert.ok(an1.transitions.every((x, i, a) => i === 0 || x.index > a[i - 1].index));
    assert.equal(an1.phases[0], "rest"); assert.equal(an1.phases.at(-1), "rest");
    assert.ok(an1.thresholdMv > -60 && an1.thresholdMv < -45, `threshold voltage ${an1.thresholdMv}`);
  });
  test("channel states along the trace: Na+ activates first, inactivates, K+ activates later, K+ outlasts Na+", () => {
    const peakG = (a) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
    assert.ok(peakG(tr.gNa) < peakG(tr.gK), "gNa peaks before gK");
    const rest = N.channelState(tr.m[0], tr.h[0], tr.n[0]);
    assert.equal(rest.naActivation, "closed"); assert.equal(rest.naInactivation, "available"); assert.equal(rest.kGate, "closed");
    const i = idx(an1.peakMs); const pk = N.channelState(tr.m[i], tr.h[i], tr.n[i]);
    assert.ok(tr.m[i] > 0.8 && tr.h[i] < tr.h[0]);
    const iDown = idx(an1.peakMs + 1.5); // repolarization
    assert.ok(tr.h[iDown] < 0.2 && tr.n[iDown] > tr.n[0] + 0.3);
    assert.equal(N.channelState(tr.m[iDown], tr.h[iDown], tr.n[iDown]).naInactivation, "inactivated");
    const iAhp = idx(8); // afterhyperpolarization: K+ still elevated, h still low
    assert.ok(tr.n[iAhp] > tr.n[0] + 0.15 && tr.h[iAhp] < tr.h[0] && tr.v[iAhp] < -70);
    assert.ok(pk.pNa > 0.05);
  });
  test("gates stay in [0,1]; conductances and currents are consistent with Ohm's law", () => {
    for (let k = 0; k < tr.t.length; k += 1) {
      for (const g of [tr.m[k], tr.h[k], tr.n[k]]) assert.ok(g >= 0 && g <= 1);
      near(tr.iNa[k], tr.gNa[k] * (tr.v[k] - 50), 1e-9); near(tr.iK[k], tr.gK[k] * (tr.v[k] + 77), 1e-9); near(tr.iL[k], 0.3 * (tr.v[k] + 54.387), 1e-9);
    }
  });
  test("numerical stability: halving the time step changes the peak and the after-hyperpolarization by under 0.5 mV; runs are deterministic", () => {
    const fine = N.analyzeHh(N.simulateHh(base, 0.005, 10)), coarse = N.analyzeHh(N.simulateHh(base, 0.02, 2));
    near(fine.peakMv, an1.peakMv, 0.5); near(coarse.peakMv, an1.peakMv, 0.5); near(fine.minAfterMv, an1.minAfterMv, 0.5);
    assert.deepEqual(N.simulateHh(base).v, N.simulateHh(base).v);
    assert.throws(() => N.simulateHh(base, 0)); assert.throws(() => N.simulateHh(base, 0.5));
  });
  test("blocking Na+ channels abolishes the spike; blocking K+ prolongs depolarization (as in the classical experiments)", () => {
    assert.equal(N.analyzeHh(N.simulateHh({ ...base, amp: 100, blockNa: true })).spikes, 0);
    const k = N.simulateHh({ ...base, blockK: true, durationMs: 40 });
    assert.equal(N.analyzeHh(k).spikes, 1);
    assert.ok(k.v[idx(base.startMs + 10)] > -10 && k.v.at(-1) > -10, "still depolarized (plateau) 10 ms and 38 ms after the stimulus with K+ channels blocked");
    assert.ok(tr.v[idx(base.startMs + 10)] < -60, "normally repolarized by then");
  });
  test("refractory behaviour: absolute then relative, then recovery", () => {
    const first = 20;
    const scan = N.refractoryScan(base, first, [1, 2, 3, 5, 6, 8, 10, 15, 20]);
    const thr = N.thresholdAmplitude(base);
    const get = (d) => scan.find((p) => p.delayMs === d).minAmp;
    for (const d of [1, 2, 3]) assert.equal(get(d), null, `no second spike at ${d} ms even with 400 µA/cm²`);
    assert.ok(get(5) > 5 * thr, "relative refractory: a much stronger stimulus is needed");
    assert.ok(get(10) > thr && get(10) < get(5));
    assert.ok(get(20) < 2 * thr, "recovered");
    const vals = scan.filter((p) => p.minAmp !== null).map((p) => p.minAmp);
    for (let i = 1; i < vals.length; i += 1) assert.ok(vals[i] <= vals[i - 1] + 0.5, "requirement falls monotonically with delay");
    assert.match(N.REFRACTORY_NOTE, /Absolute refractory period/); assert.match(N.REFRACTORY_NOTE, /Relative refractory period/);
  });
  test("a second suprathreshold pulse after recovery fires a second, similar spike", () => {
    const two = N.analyzeHh(N.simulateHh({ ...base, amp2: 20, delayMs: 15, durationMs: 40 }));
    assert.equal(two.spikes, 2);
    const same = N.analyzeHh(N.simulateHh({ ...base, amp2: 20, delayMs: 2, durationMs: 40 }));
    assert.equal(same.spikes, 1, "a second pulse 2 ms after the first falls in the absolute refractory period");
  });
  test("validation and documented limits", () => {
    assert.equal(N.validateHh(base).ok, true);
    for (const bad of [{ amp: -1 }, { amp: 500 }, { durMs: 0 }, { startMs: 25 }, { durationMs: 5 }, { blockNa: "yes" }, { amp2: 10, delayMs: 29, durationMs: 30 }, { amp: NaN }]) assert.equal(N.validateHh({ ...base, ...bad }).ok, false, JSON.stringify(bad));
    assert.ok(N.HH_LIMITS.some((l) => /squid giant axon at 6\.3/.test(l))); assert.ok(N.HH_LIMITS.some((l) => /not predictions/.test(l)));
  });
});

describe("propagation and myelination (schematic)", () => {
  test("the same length needs fewer regenerative sites when myelinated", () => {
    const un = N.regenerativeSites(false), my = N.regenerativeSites(true);
    assert.equal(un, 13); assert.equal(my, 5); assert.ok(my < un);
    assert.ok(N.buildAxon(true).filter((u) => u.kind === "node").length === 3);
    assert.ok(N.buildAxon(true).filter((u) => u.kind === "internode").every((u) => !u.regenerative));
    assert.ok(N.buildAxon(false).every((u) => u.regenerative));
    assert.ok(N.buildAxon(true).some((u) => u.kind === "initial") && N.buildAxon(true).some((u) => u.kind === "terminal"));
  });
  test("one site fires at a time; the spike moves in one direction", () => {
    for (const my of [false, true]) for (let s = 0; s <= N.propagationMaxStep(my); s += 1) {
      const st = N.propagationState(my, s);
      assert.equal(st.units.filter((u) => u.state === "firing").length, 1);
      const a = st.activeIndex;
      for (const u of st.units.slice(0, a)) assert.ok(u.state === "refractory" || u.state === "resting");
      const ahead = st.units.slice(a + 1).filter((u) => u.state !== "resting");
      assert.ok(ahead.length <= 2 && ahead.every((u) => u.state === "passive-current" || u.state === "depolarizing"));
    }
  });
  test("saltatory conduction: passive current in the internode, the next node depolarizing", () => {
    const st = N.propagationState(true, 1);
    assert.equal(st.units[st.activeIndex].kind, "node"); assert.equal(st.units[st.activeIndex + 1].state, "passive-current");
    assert.equal(st.units[st.activeIndex + 1].kind, "internode"); assert.equal(st.units[st.activeIndex + 2].state, "depolarizing");
    assert.match(st.caption, /passively/);
  });
  test("continuous conduction: the next segment is depolarizing by local current", () => {
    const st = N.propagationState(false, 3);
    assert.equal(st.units[st.activeIndex + 1].state, "depolarizing");
    assert.ok(st.units.slice(0, st.activeIndex).some((u) => u.state === "refractory"));
  });
  test("the explanation and limits make no velocity or failure claims", () => {
    assert.match(N.MYELIN_EXPLANATION, /resistance/); assert.match(N.MYELIN_EXPLANATION, /capacitance/); assert.match(N.MYELIN_EXPLANATION, /saltatory/);
    assert.ok(N.PROPAGATION_LIMITS.some((l) => /no conduction velocity/.test(l))); assert.ok(N.PROPAGATION_LIMITS.some((l) => /conduction failure/.test(l)));
    assert.ok(!/\d+\s*m\/s/.test(N.MYELIN_EXPLANATION + JSON.stringify(N.PROPAGATION_LIMITS)));
    assert.throws(() => N.propagationState(true, 5)); assert.throws(() => N.propagationState(false, -1));
  });
});

describe("chemical synapse", () => {
  const ex = (id) => N.SYNAPSE_EXAMPLES.find((e) => e.id === id);
  const st = (over) => N.synapseState({ ...N.DEFAULT_SYNAPSE, ...over });
  test("stages run in the physiological order with nine stages", () => {
    const s = N.synapseStages(ex("glu-ampa")); assert.equal(s.length, 9);
    const titles = s.map((x) => x.title.toLowerCase());
    const order = ["resting", "action potential arrives", "voltage-gated ca", "ca²⁺ enters", "vesicle fusion", "released", "diffusion", "receptor channel opens", "cleared"];
    order.forEach((frag, i) => assert.ok(titles[i].includes(frag), `${i}: ${titles[i]}`));
  });
  test("normal sequence: Ca2+ channels open before Ca2+ enters before fusion before release before receptor activation before clearance", () => {
    const flags = (i) => st({ step: i });
    assert.ok(!flags(1).cavOpen && flags(2).cavOpen); assert.ok(!flags(2).calciumInflux && flags(3).calciumInflux);
    assert.ok(!flags(3).vesiclesFused && flags(4).vesiclesFused); assert.ok(!flags(4).transmitterInCleft && flags(5).transmitterInCleft);
    assert.ok(!flags(6).receptorActive && flags(7).receptorActive); assert.ok(flags(8).cleared && !flags(8).transmitterInCleft && !flags(8).receptorActive);
  });
  test("blocking the presynaptic Ca2+ channel stops everything downstream; blocking the receptor leaves release intact", () => {
    const a = st({ step: 7, perturbation: "block-cav" });
    assert.ok(a.apArrived && !a.cavOpen && !a.calciumInflux && !a.vesiclesFused && !a.transmitterInCleft && !a.receptorActive);
    const b = st({ step: 7, perturbation: "block-receptor" });
    assert.ok(b.transmitterInCleft && !b.receptorActive);
    const c = st({ step: 8, perturbation: "block-clearance" });
    assert.ok(c.transmitterInCleft && c.receptorActive && !c.cleared);
  });
  test("vesicle fusion is triggered by Ca2+ (the stage says so) via a voltage-gated, not ligand-gated, presynaptic channel", () => {
    const s = N.synapseStages(ex("glu-ampa"));
    assert.match(s[2].text, /gated by voltage, not by the neurotransmitter/); assert.match(s[4].text, /Ca²⁺ binds a sensor/);
  });
  test("reversal potentials by hand: AMPA/nicotinic about −0.5 mV, GABA_A = E_Cl, M2/GIRK = E_K", () => {
    near(N.reversalMv("glu-ampa", 8), rtf(37) * Math.log(149 / 152), 1e-9); near(N.reversalMv("glu-ampa", 8), -0.53, 0.01);
    near(N.reversalMv("ach-nicotinic", 8), N.reversalMv("glu-ampa", 8), 1e-12);
    near(N.reversalMv("gaba-a", 8), -rtf(37) * Math.log(110 / 8), 1e-9); near(N.reversalMv("gaba-a", 8), -70.0, 0.1);
    near(N.reversalMv("gaba-a", 30), -34.7, 0.1);
    near(N.reversalMv("ach-m2", 8), rtf(37) * Math.log(4 / 140), 1e-9); near(N.reversalMv("ach-m2", 8), -95, 0.5);
  });
  test("glutamate/AMPA depolarizes and is excitatory; GABA_A at normal Cl- hyperpolarizes and is inhibitory", () => {
    const g = N.postsynapticResponse({ ...N.DEFAULT_SYNAPSE, example: "glu-ampa" });
    assert.equal(g.polarity, "depolarizing"); assert.equal(g.effect, "excitatory");
    const a = N.postsynapticResponse({ ...N.DEFAULT_SYNAPSE, example: "gaba-a" });
    assert.equal(a.polarity, "hyperpolarizing"); assert.equal(a.effect, "inhibitory");
  });
  test("the same transmitter has opposite effects at different receptors (acetylcholine), and GABA's effect depends on intracellular Cl-", () => {
    const n = N.postsynapticResponse({ ...N.DEFAULT_SYNAPSE, example: "ach-nicotinic" }), m = N.postsynapticResponse({ ...N.DEFAULT_SYNAPSE, example: "ach-m2" });
    assert.equal(n.effect, "excitatory"); assert.equal(m.effect, "inhibitory"); assert.equal(m.polarity, "hyperpolarizing");
    assert.equal(ex("ach-nicotinic").neurotransmitter, ex("ach-m2").neurotransmitter);
    assert.equal(ex("ach-m2").kind, "metabotropic"); assert.equal(ex("ach-nicotinic").kind, "ionotropic");
    const immature = N.postsynapticResponse({ ...N.DEFAULT_SYNAPSE, example: "gaba-a", clInMm: 30 });
    assert.equal(immature.polarity, "depolarizing"); assert.equal(immature.effect, "excitatory");
    const shunting = N.postsynapticResponse({ ...N.DEFAULT_SYNAPSE, example: "gaba-a", clInMm: 8, vmPostMv: -75 });
    assert.equal(shunting.polarity, "depolarizing"); assert.equal(shunting.effect, "inhibitory", "depolarizing but below threshold: still inhibitory");
    assert.match(N.SYNAPSE_CONTEXT_NOTE, /no fixed effect/);
  });
  test("polarity follows Vm: at the reversal potential there is no net change", () => {
    const e = N.reversalMv("gaba-a", 8);
    assert.equal(N.postsynapticResponse({ ...N.DEFAULT_SYNAPSE, example: "gaba-a", vmPostMv: e }).polarity, "no net change");
  });
  test("validation", () => {
    assert.equal(N.validateSynapse(N.DEFAULT_SYNAPSE).ok, true);
    for (const bad of [{ example: "dopa" }, { step: 9 }, { step: -1 }, { perturbation: "x" }, { vmPostMv: 0 }, { clInMm: 1 }, { thresholdMv: -20 }]) assert.equal(N.validateSynapse({ ...N.DEFAULT_SYNAPSE, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("synaptic summation", () => {
  const base = N.DEFAULT_SUMMATION;
  const single = { ...base, events: [{ tMs: 5, ampMv: 5 }] };
  test("a unit PSP peaks at 1 at the analytic peak time, and its decay follows the slower time constant", () => {
    const tm = 10, ts = 2;
    const tPeak = (tm * ts * Math.log(tm / ts)) / (tm - ts);
    near(N.pspShape(tPeak, tm, ts), 1, 1e-12); assert.equal(N.pspShape(0, tm, ts), 0); assert.equal(N.pspShape(-3, tm, ts), 0);
    assert.ok(N.pspShape(tPeak - 0.3, tm, ts) < 1 && N.pspShape(tPeak + 0.3, tm, ts) < 1);
    near(N.pspShape(60, tm, ts) / N.pspShape(50, tm, ts), Math.exp(-1), 1e-3);
    near(N.pspShape(2 * 9, 9, 9), 2 / Math.E, 1e-12); // alpha function t e^{-t/τ}/(τ e^{-1}) at t = 2τ
    assert.ok(Number.isFinite(N.pspShape(5, 5, 5)));
  });
  test("a single 5 mV PSP peaks 5 mV above rest", () => {
    const r = N.evaluateSummation(single, 1200); near(r.peakMv, -60, 0.02); assert.equal(r.reachesThreshold, false);
  });
  test("superposition: the summed potential equals the sum of the individual deflections", () => {
    const two = { ...base, events: [{ tMs: 5, ampMv: 5 }, { tMs: 9, ampMv: 3 }] };
    for (const t of [6, 8, 12, 20, 40]) near(N.summationVoltage(two, t) + 65, (N.summationVoltage({ ...base, events: [two.events[0]] }, t) + 65) + (N.summationVoltage({ ...base, events: [two.events[1]] }, t) + 65), 1e-12);
  });
  test("temporal summation: two EPSPs close in time reach a higher peak than the same two widely separated", () => {
    const close = N.evaluateSummation({ ...base, events: [{ tMs: 5, ampMv: 5 }, { tMs: 8, ampMv: 5 }] }, 800).peakMv;
    const far = N.evaluateSummation({ ...base, events: [{ tMs: 5, ampMv: 5 }, { tMs: 85, ampMv: 5 }], tMaxMs: 120 }, 2400).peakMv;
    assert.ok(close > far + 3, `${close} vs ${far}`); near(far, -60, 0.05);
    assert.ok(close < -65 + 10, "never more than the arithmetic sum");
  });
  test("a slower membrane (larger tau) sums temporally spaced inputs more", () => {
    const ev = [{ tMs: 5, ampMv: 5 }, { tMs: 20, ampMv: 5 }];
    const fast = N.evaluateSummation({ ...base, events: ev, cPf: 50 }, 800).peakMv, slow = N.evaluateSummation({ ...base, events: ev, cPf: 300 }, 800).peakMv;
    assert.ok(slow > fast);
  });
  test("spatial summation of simultaneous inputs adds amplitudes; an inhibitory input cancels an excitatory one", () => {
    const sim = N.evaluateSummation({ ...base, events: [{ tMs: 5, ampMv: 4 }, { tMs: 5, ampMv: 4 }, { tMs: 5, ampMv: 4 }] }, 1200);
    near(sim.peakMv, -65 + 12, 0.03);
    const cancel = N.summationVoltage({ ...base, events: [{ tMs: 5, ampMv: 5 }, { tMs: 5, ampMv: -5 }] }, 8);
    near(cancel, -65, 1e-12);
  });
  test("reaching threshold is reported as a threshold crossing in the linear model, not as an action potential", () => {
    const r = N.evaluateSummation({ ...base, events: [{ tMs: 5, ampMv: 6 }, { tMs: 5, ampMv: 6 }] }, 600);
    assert.equal(r.reachesThreshold, true);
    assert.match(r.statement, /does not include|depends on the cell's voltage-gated Na⁺ channels/);
    assert.ok(!/fires an action potential/i.test(r.statement));
    assert.ok(N.SUMMATION_ASSUMPTIONS.some((s) => /does not by itself produce an action potential/.test(s)));
  });
  test("tau comes from the passive membrane settings", () => near(N.evaluateSummation(base).tauMs, N.membraneTauMs(100, 100), 1e-12));
  test("validation", () => {
    assert.equal(N.validateSummation(base).ok, true);
    for (const bad of [{ events: [] }, { events: Array(5).fill({ tMs: 1, ampMv: 1 }) }, { events: [{ tMs: -1, ampMv: 1 }] }, { events: [{ tMs: 1, ampMv: 0 }] }, { events: [{ tMs: 1, ampMv: 50 }] }, { thresholdMv: -70 }, { rMohm: 5 }, { tMaxMs: 5 }, { events: "x" }]) assert.equal(N.validateSummation({ ...base, ...bad }).ok, false, JSON.stringify(bad));
  });
});
