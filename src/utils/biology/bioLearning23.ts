/**
 * Stage 23: Practice questions and Challenge predictions for the three Cellular Biology and Physiology tools.
 * Every question is built from the same state and the same engine calls that draw the diagram, so the answer, the
 * explanation and what is shown cannot disagree. Challenges commit to a prediction first; `next` is the state applied afterwards.
 */
import type { Question } from "./bioLearning";
import {
  FLUIDITY_LABELS, IONS, PASSIVE_SOLUTES, TRANSPORTERS, evaluateIons, evaluateOsmosis, evaluatePassive, evaluateSglt, fluidity, nernstMv, pumpMaxStep, pumpState, NAK_STEPS,
  ghkVoltageMv,
} from "./membrane23";
import { SYSTEMS, evaluateSignaling, type Status } from "./signaling23";
import {
  AP_PHASE_INFO, SYNAPSE_EXAMPLES, analyzeHh, evaluateSummation, membraneTauMs, passiveVoltageMv, postsynapticResponse, regenerativeSites, restingPotential, simulateHh, steadyDeltaMv, synapseState,
} from "./neuron23";
import type { MembraneInputs, NeuronInputs, SignalingInputs } from "../persistence/biologyTools23";

export interface Challenge<S> { id: string; label: string; question: Question; next: S }

/** Builds a question whose correct option sits at a position that varies with `rot` (deterministic). */
function mc(id: string, prompt: string, correct: string, wrong: string[], explanation: string, rot = 0): Question {
  const uniq = [correct, ...wrong.filter((w, i) => w !== correct && wrong.indexOf(w) === i)];
  const n = uniq.length;
  const r = ((rot % n) + n) % n;
  const options = uniq.map((_, k) => uniq[(k + n - r) % n]);
  return { id, prompt, options, answer: options.indexOf(correct), explanation };
}
const pick = <T,>(items: Array<T | null>, idx: number): T | null => { const ok = items.filter((x): x is T => x !== null); return ok.length ? ok[idx % ok.length] : null; };
const mV = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)} mV`;
const DIRS = ["Into the cell", "Out of the cell", "No net movement"];
const dirText = (d: "inward" | "outward" | "none") => (d === "inward" ? DIRS[0] : d === "outward" ? DIRS[1] : DIRS[2]);

// ================================================================ membranes ================================================================

export function membraneQuestions(i: MembraneInputs): Question[] {
  const qs: Question[] = [];
  switch (i.section) {
    case "bilayer": {
      const f = fluidity(i.bilayer);
      qs.push(mc("bl-head", "Which part of a phospholipid faces the water on either side of the membrane?", "The polar (hydrophilic) head group", ["The fatty-acid tails", "The cholesterol ring", "The integral protein"], "Heads are polar and interact with water; the hydrophobic tails face each other inside the bilayer.", 0));
      qs.push(mc("bl-integral", "Which membrane protein has hydrophobic regions embedded in the lipid core?", "An integral protein", ["A peripheral protein", "A glycolipid head group", "Cholesterol's hydroxyl group"], "Integral proteins span or are embedded in the bilayer; peripheral proteins sit on the surface.", 1));
      qs.push(mc("bl-fluid", "For the lipids, temperature and cholesterol shown, which fluidity class does the model give?", f.label, FLUIDITY_LABELS.filter((l) => l !== f.label).slice(0, 3), f.reasons.join(" "), f.level));
      qs.push(mc("bl-chol", "What does cholesterol do to membrane fluidity?", "It moderates it: it restrains tail motion when warm and hinders tight packing when cold", ["It always makes the membrane more fluid", "It always makes the membrane more rigid", "It has no effect on fluidity"], "Cholesterol is a fluidity buffer; the effect depends on temperature and composition.", 2));
      break;
    }
    case "passive": {
      const r = evaluatePassive(i.passive), def = PASSIVE_SOLUTES[i.passive.solute];
      qs.push(mc("pa-dir", `With the conditions shown, which way does ${def.label} move by ${r.charged ? "passing through an open channel" : i.passive.mechanism === "carrier" ? "facilitated diffusion" : "passive transport"}?`, dirText(r.direction), DIRS.filter((d) => d !== dirText(r.direction)), r.explanation.slice(1).join(" "), 0));
      qs.push(mc("pa-atp", "Does facilitated diffusion through a channel or carrier use ATP?", "No: it is passive and moves a solute only down its driving force", ["Yes: carriers always hydrolyse ATP", "Yes, but only channels", "Only when the solute is charged"], "Facilitated diffusion helps a solute cross but supplies no energy; ATP-driven transport is active.", 1));
      qs.push(mc("pa-perm", "If the permeability to a neutral solute doubles with the same concentrations, what happens to the net flux?", "It doubles in the same direction", ["It stays the same", "It reverses direction", "It is halved"], "J = P (Cout − Cin): permeability and concentration difference are separate factors.", 2));
      break;
    }
    case "ions": {
      const e = evaluateIons(i.ions), sel = e.ions.find((x) => x.ion === i.ions.selected)!, sym = IONS[sel.ion].symbol;
      const rounded = Math.round(sel.eMv);
      const wrong = [-rounded, rounded + 25, Math.round(sel.eMv * (sel.z === 1 ? 2 : sel.z === 2 ? 2 : -1))].filter((v, k, a) => v !== rounded && a.indexOf(v) === k);
      let pad = 40; while (wrong.length < 3) { if (rounded + pad !== rounded && !wrong.includes(rounded + pad)) wrong.push(rounded + pad); pad += 17; }
      qs.push(mc("io-e", `What is the equilibrium (Nernst) potential for ${sym} with the concentrations and temperature shown (nearest mV)?`, mV(rounded), wrong.slice(0, 3).map(mV), `E = (RT/zF) ln([out]/[in]) with z = ${sel.z > 0 ? "+" : "−"}${Math.abs(sel.z)}: ${sel.eMv.toFixed(1)} mV.`, Math.abs(rounded)));
      qs.push(mc("io-dir", `At the membrane voltage shown (${e.vmMv.toFixed(0)} mV), which way would ${sym} move through an open channel?`, dirText(sel.direction), DIRS.filter((d) => d !== dirText(sel.direction)), `Vm − E = ${sel.drivingMv.toFixed(1)} mV, so Δμ(in) = zF(Vm − E) = ${sel.deltaGInwardKJ.toFixed(2)} kJ/mol.`, 1));
      qs.push(mc("io-vm", "Is an ion's Nernst potential the same as the actual membrane potential?", "Only if that ion is the only one the membrane is permeable to", ["Yes, always", "No, never", "Only for Na⁺"], "The membrane voltage is a permeability-weighted balance of all permeant ions (GHK).", 2));
      break;
    }
    case "active": {
      qs.push(mc("ac-atp", "Which of these transports directly hydrolyses ATP?", "The Na⁺/K⁺-ATPase", ["SGLT1 (Na⁺–glucose symport)", "A GLUT glucose carrier", "A K⁺ leak channel"], TRANSPORTERS.filter((t) => t.usesATPDirectly).map((t) => `${t.name}: ${t.driver}.`).join(" ") + " Secondary active transporters use the Na⁺ gradient that the pump maintains.", 0));
      qs.push(mc("ac-stoich", "How many Na⁺ and K⁺ does the Na⁺/K⁺-ATPase move per ATP?", "3 Na⁺ out and 2 K⁺ in", ["2 Na⁺ out and 3 K⁺ in", "1 Na⁺ out and 1 K⁺ in", "3 Na⁺ in and 2 K⁺ out"], "Three positive charges leave and two enter, so the pump is electrogenic.", 1));
      if (i.active.transporter === "nak") {
        const max = pumpMaxStep(i.active.pumpPerturbation);
        if (i.active.pumpStep < max) {
          const nxt = pumpState(i.active.pumpStep + 1, i.active.pumpPerturbation);
          const others = [3, 5, 6, 7].map((s) => pumpState(s % NAK_STEPS, "none").title).filter((t) => t !== nxt.title).slice(0, 3);
          qs.push(mc("ac-next", `The pump is at “${pumpState(i.active.pumpStep, i.active.pumpPerturbation).title}”. What happens next?`, nxt.title, others, nxt.text, 2));
        }
      } else {
        const r = evaluateSglt(i.active.sglt);
        qs.push(mc("ac-sglt", "Does the Na⁺–glucose cotransporter hydrolyse ATP itself?", "No: it uses the Na⁺ electrochemical gradient, which the Na⁺/K⁺-ATPase maintains", ["Yes, one ATP per glucose", "Yes, two ATP per cycle", "It uses no energy source at all"], `ΔG per cycle for 2 Na⁺ + 1 glucose entering is ${r.deltaGCycleKJ.toFixed(1)} kJ/mol with these values.`, 3));
      }
      break;
    }
    case "osmosis": {
      const r = evaluateOsmosis(i.osmosis);
      const tonOpts = ["hypertonic", "hypotonic", "isotonic"];
      qs.push(mc("os-ton", "Is the extracellular solution hypertonic, hypotonic or isotonic for this cell?", r.tonicity, tonOpts.filter((t) => t !== r.tonicity), `Only effectively impermeant solutes count: outside ${r.outImpermeantOsm.toFixed(0)} mOsm/L, inside ${r.inImpermeantOsm.toFixed(0)} mOsm/L.`, 0));
      qs.push(mc("os-water", "Which way does water move initially?", r.initialWater === "out of the cell" ? "Out of the cell" : r.initialWater === "into the cell" ? "Into the cell" : "No net movement", DIRS.filter((d) => d !== (r.initialWater === "out of the cell" ? "Out of the cell" : r.initialWater === "into the cell" ? "Into the cell" : "No net movement")), "Water moves toward the side with the higher effective (impermeant) solute concentration.", 1));
      qs.push(mc("os-differ", "A solution can be iso-osmotic with a cell yet hypotonic to it. Which solute makes that possible?", "A freely permeant solute such as urea", ["An impermeant solute such as sucrose", "Water itself", "None: osmolarity and tonicity are the same thing"], "Permeant solutes add to osmolarity but cannot hold water, so they do not add to tonicity.", 2));
      break;
    }
  }
  return qs;
}

export function membraneChallenge(i: MembraneInputs, idx: number): Challenge<MembraneInputs> | null {
  const set = (patch: Partial<MembraneInputs>): MembraneInputs => ({ ...i, ...patch });
  const items: Array<Challenge<MembraneInputs> | null> = [];
  switch (i.section) {
    case "bilayer": {
      const cur = fluidity(i.bilayer);
      const warmer = i.bilayer.temperature === "cool" ? "moderate" : "warm";
      if (i.bilayer.temperature !== "warm") { const nx = { ...i.bilayer, temperature: warmer as "moderate" | "warm" }; const f = fluidity(nx); items.push({ id: "bl-warm", label: `Raise the temperature to ${warmer}`, question: mc("bl-warm", `Predict: raising the temperature to “${warmer}” will make the schematic fluidity…`, f.level > cur.level ? "increase" : f.level < cur.level ? "decrease" : "stay the same", ["increase", "decrease", "stay the same"], f.reasons.join(" "), 0), next: set({ bilayer: { ...nx, selected: null } }) }); }
      if (i.bilayer.lipids !== "unsaturated") { const nx = { ...i.bilayer, lipids: "unsaturated" as const }; const f = fluidity(nx); items.push({ id: "bl-unsat", label: "Switch to unsaturated lipids", question: mc("bl-unsat", "Predict: switching to unsaturated (kinked) tails will make the schematic fluidity…", f.level > cur.level ? "increase" : f.level < cur.level ? "decrease" : "stay the same", ["increase", "decrease", "stay the same"], f.reasons.join(" "), 1), next: set({ bilayer: { ...nx, selected: null } }) }); }
      if (!i.bilayer.cholesterol) { const nx = { ...i.bilayer, cholesterol: true }; const f = fluidity(nx); const ans = f.level > cur.level ? "increase" : f.level < cur.level ? "decrease" : "stay the same"; items.push({ id: "bl-chol", label: "Add cholesterol", question: mc("bl-chol", `Predict: adding cholesterol to this ${i.bilayer.lipids}, ${i.bilayer.temperature} membrane will make the schematic fluidity…`, ans, ["increase", "decrease", "stay the same"], f.reasons.join(" "), 2), next: set({ bilayer: { ...nx, selected: null } }) }); }
      break;
    }
    case "passive": {
      const p = i.passive, r = evaluatePassive(p), def = PASSIVE_SOLUTES[p.solute];
      if (p.cOut !== p.cIn) { const nx = { ...p, cOut: p.cIn, cIn: p.cOut }; const rn = evaluatePassive(nx); items.push({ id: "pa-swap", label: "Swap the inside and outside concentrations", question: mc("pa-swap", `Predict: after swapping the inside and outside concentrations of ${def.label}, the net movement is…`, dirText(rn.direction), DIRS.filter((d) => d !== dirText(rn.direction)), rn.explanation.slice(1).join(" "), 0), next: set({ passive: nx }) }); }
      if (!r.charged && p.mechanism !== "carrier") { const nx = { ...p, permeability: Math.min(10, p.permeability * 2) }; const rn = evaluatePassive(nx); const ratio = (rn.fluxIn ?? 0) / (r.fluxIn || 1); items.push({ id: "pa-perm", label: "Double the permeability", question: mc("pa-perm", "Predict: doubling the permeability (same concentrations) will make the net flux…", ratio > 1.99 && ratio < 2.01 ? "double" : "change by another factor", ["double", "stay the same", "reverse direction", "change by another factor"].filter((x) => x !== "change by another factor" || ratio < 1.99 || ratio > 2.01), "Flux = P × ΔC, so doubling P doubles the flux when ΔC is unchanged.", 1), next: set({ passive: nx }) }); }
      if (!r.charged && p.mechanism === "carrier") { const nx = { ...p, cOut: Math.min(2000, p.cOut * 10) }; const rn = evaluatePassive(nx); const ratio = (rn.fluxIn ?? 0) / (r.fluxIn || 1); items.push({ id: "pa-sat", label: "Raise the outside concentration tenfold", question: mc("pa-sat", "Predict: raising the outside concentration of glucose tenfold, the net flux through the carrier will…", ratio < 9.5 ? "increase by less than tenfold (saturation)" : "increase about tenfold", ["increase about tenfold", "increase by less than tenfold (saturation)", "stay the same"], "A carrier has a limited number of sites, so flux saturates at high concentration. Simple diffusion would stay proportional.", 2), next: set({ passive: nx }) }); }
      if (r.charged && r.ion) { const e = r.ion.eMv; if (e >= -200 && e <= 100) { const nx = { ...p, vmMv: Number(e.toFixed(1)) }; const rn = evaluatePassive(nx); items.push({ id: "pa-eq", label: "Set Vm to the equilibrium potential", question: mc("pa-eq", `Predict: with Vm set to E(${def.label}) = ${e.toFixed(1)} mV, the net movement through the open channel is…`, dirText(rn.direction), DIRS.filter((d) => d !== dirText(rn.direction)), "At Vm = E the chemical and electrical terms cancel: Δμ = 0 (individual ions still cross both ways).", 1), next: set({ passive: nx }) }); }
        const nx2 = { ...p, cOut: p.cIn }; const rn2 = evaluatePassive(nx2); items.push({ id: "pa-equal", label: "Make the concentrations equal", question: mc("pa-equal", `Predict: with equal concentrations on both sides and Vm = ${p.vmMv} mV, ${def.label} moves…`, dirText(rn2.direction), DIRS.filter((d) => d !== dirText(rn2.direction)), "With no concentration difference only the electrical term remains: cations move toward negative Vm values, anions away.", 2), next: set({ passive: nx2 }) }); }
      if (!r.charged) { const nx = { ...p, cOut: p.cIn }; items.push({ id: "pa-eqn", label: "Make the concentrations equal", question: mc("pa-eqn", `Predict: with equal concentrations of ${def.label} on both sides, the net flux is…`, "zero (dynamic equilibrium)", ["in the direction of the higher permeability", "still inward"], "Net flux is proportional to the concentration difference; molecules still cross in both directions at equal rates.", 0), next: set({ passive: nx }) }); }
      break;
    }
    case "ions": {
      const sel = i.ions.selected, g = i.ions.ions[sel], e0 = nernstMv(IONS[sel].z, g.out, g.in, i.ions.tempC);
      const nx1 = structuredClone(i.ions); nx1.ions[sel].out = Math.min(2000, g.out * 2.5);
      const e1 = nernstMv(IONS[sel].z, nx1.ions[sel].out, nx1.ions[sel].in, nx1.tempC);
      items.push({ id: "io-out", label: `Raise extracellular ${IONS[sel].symbol} 2.5-fold`, question: mc("io-out", `Predict: raising extracellular ${IONS[sel].symbol} 2.5-fold will make its equilibrium potential…`, e1 > e0 ? "more positive" : "more negative", ["more positive", "more negative", "unchanged"], `E ∝ (1/z) ln([out]/[in]); for z = ${IONS[sel].z > 0 ? "+" : "−"}${Math.abs(IONS[sel].z)} a larger [out] moves E ${e1 > e0 ? "up" : "down"}.`, 0), next: set({ ions: nx1 }) });
      if (i.ions.tempC > 22) { const nx = { ...i.ions, tempC: 20 }; const e2 = nernstMv(IONS[sel].z, g.out, g.in, 20); items.push({ id: "io-temp", label: "Cool to 20 °C", question: mc("io-temp", `Predict: cooling from ${i.ions.tempC} °C to 20 °C will make the size (magnitude) of E(${IONS[sel].symbol})…`, Math.abs(e2) < Math.abs(e0) ? "smaller" : "larger", ["smaller", "larger", "unchanged"], "E is proportional to the absolute temperature T.", 1), next: set({ ions: nx }) }); }
      if (i.ions.vmSource === "ghk") { const nx = { ...i.ions, perms: { ...i.ions.perms, na: Math.min(1000, i.ions.perms.na * 5) } }; const v0 = ghkVoltageMv(i.ions.ions, i.ions.perms, i.ions.tempC), v1 = ghkVoltageMv(nx.ions, nx.perms, nx.tempC); items.push({ id: "io-pna", label: "Raise P(Na⁺) five-fold", question: mc("io-pna", "Predict: raising the relative Na⁺ permeability five-fold will make the GHK membrane voltage…", v1 > v0 ? "more positive (depolarized)" : "more negative", ["more positive (depolarized)", "more negative", "unchanged"], "A more Na⁺-permeable membrane is pulled toward E(Na⁺), which is positive.", 2), next: set({ ions: nx }) }); }
      break;
    }
    case "active": {
      if (i.active.transporter === "nak" && i.active.pumpStep < pumpMaxStep(i.active.pumpPerturbation)) {
        const cur = pumpState(i.active.pumpStep, i.active.pumpPerturbation), nxt = pumpState(i.active.pumpStep + 1, i.active.pumpPerturbation);
        const others = [0, 2, 4, 6].map((s) => pumpState(s, "none").title).filter((t) => t !== nxt.title && t !== cur.title).slice(0, 3);
        items.push({ id: "ac-next", label: "Advance one step", question: mc("ac-next", `Predict: after “${cur.title}”, the pump…`, nxt.title, others, nxt.text, i.active.pumpStep), next: set({ active: { ...i.active, pumpStep: i.active.pumpStep + 1 } }) });
      }
      if (i.active.transporter === "nak" && i.active.pumpPerturbation === "none") items.push({ id: "ac-ouabain", label: "Bind ouabain and run to the end", question: mc("ac-ouabain", "Predict: with ouabain bound, how many K⁺ will the pump bring into the cell?", "0: the cycle stops after Na⁺ release", ["2, as usual", "1", "2, but no ATP is used"], "Ouabain locks the phosphorylated E2~P state from outside, blocking K⁺ binding and dephosphorylation.", 1), next: set({ active: { ...i.active, pumpPerturbation: "ouabain", pumpStep: 4 } }) });
      if (i.active.transporter === "sglt") { const r0 = evaluateSglt(i.active.sglt); const nx = { ...i.active.sglt, naIn: Math.min(2000, i.active.sglt.naIn * 4) }; const r1 = evaluateSglt(nx); items.push({ id: "ac-na", label: "Quadruple intracellular Na⁺ (as if the pump were inhibited)", question: mc("ac-na", "Predict: if intracellular Na⁺ rises four-fold, the largest glucose accumulation SGLT1 could support…", r1.maxAccumulationRatio < r0.maxAccumulationRatio ? "falls" : "rises", ["falls", "rises", "is unchanged"], "The Na⁺ gradient is the energy source; shrinking it lowers the thermodynamic limit, which is how inhibiting the pump indirectly affects the cotransporter.", 2), next: set({ active: { ...i.active, sglt: nx } }) }); }
      break;
    }
    case "osmosis": {
      const o = i.osmosis;
      for (const [nc, text] of [[75, "Lower extracellular NaCl to 75 mM"], [300, "Raise extracellular NaCl to 300 mM"]] as Array<[number, string]>) {
        if (o.naCl === nc) continue;
        const nx = { ...o, naCl: nc }; const r = evaluateOsmosis(nx);
        items.push({ id: `os-nacl-${nc}`, label: text, question: mc(`os-nacl-${nc}`, `Predict: with extracellular NaCl at ${nc} mM (impermeant, 2 particles per formula unit), water initially moves…`, r.initialWater === "out of the cell" ? "Out of the cell" : r.initialWater === "into the cell" ? "Into the cell" : "No net movement", DIRS.filter((d) => d !== (r.initialWater === "out of the cell" ? "Out of the cell" : r.initialWater === "into the cell" ? "Into the cell" : "No net movement")), `Effective osmolarity outside ${r.outImpermeantOsm.toFixed(0)} versus inside ${r.inImpermeantOsm.toFixed(0)} mOsm/L: ${r.tonicity}.`, nc === 75 ? 0 : 1), next: set({ osmosis: nx }) });
      }
      if (o.urea < 100) { const nx = { ...o, urea: 200 }; const r0 = evaluateOsmosis(o), r = evaluateOsmosis(nx); items.push({ id: "os-urea", label: "Add 200 mM urea outside", question: mc("os-urea", "Predict: adding 200 mM of a freely permeant solute (urea) outside will change the tonicity…", r.tonicity === r0.tonicity ? "not at all: urea raises osmolarity but not tonicity" : "to a different class", ["not at all: urea raises osmolarity but not tonicity", "to a different class"], "A permeant solute equilibrates across the membrane, so it cannot hold water on one side.", 2), next: set({ osmosis: nx }) }); }
      break;
    }
  }
  return pick(items, idx);
}

// ================================================================ signaling ================================================================

const STATUS_TEXT: Record<Status, string> = { active: "Active", inactive: "Inactive", blocked: "Blocked (cannot act)", attenuated: "Attenuated by feedback", persisting: "Persisting after the ligand is removed" };
interface SigProbe { perts: string[]; probe: string; phase?: "acute" | "prolonged" | "removed"; ligand?: boolean; coLigand?: boolean }
const PROBES: Record<string, SigProbe[]> = {
  gs: [{ perts: ["ac-inhib"], probe: "camp" }, { perts: ["gp-noexchange"], probe: "ac" }, { perts: ["pde-inhib"], probe: "camp", phase: "removed" }, { perts: ["pka-inhib"], probe: "tgt" }, { perts: ["grk-block"], probe: "gp", phase: "prolonged" }, { perts: ["gp-gtpase"], probe: "camp", ligand: false }],
  gi: [{ perts: ["gp-noexchange"], probe: "ac", coLigand: true }, { perts: ["ac-inhib"], probe: "camp", coLigand: true }, { perts: ["pde-inhib"], probe: "camp", coLigand: true, phase: "removed" }, { perts: ["rec-nobind"], probe: "gp" }],
  gq: [{ perts: ["ip3r-block"], probe: "pkc" }, { perts: ["plc-inhib"], probe: "dag" }, { perts: ["pkc-inhib"], probe: "caResp" }, { perts: ["pump-block"], probe: "ca", phase: "removed" }, { perts: ["gp-noexchange"], probe: "plc" }],
  rtk: [{ perts: ["egfr-tki"], probe: "erk" }, { perts: ["mek-inhib"], probe: "raf" }, { perts: ["ras-g12v"], probe: "erk", ligand: false }, { perts: ["ras-g12v", "egfr-tki"], probe: "erk" }, { perts: ["dusp-block"], probe: "erk", phase: "removed" }, { perts: ["fb-block"], probe: "erk", phase: "prolonged" }],
  lgic: [{ perts: ["rec-nobind"], probe: "resp" }, { perts: ["pore-block"], probe: "rec" }, { perts: ["ache-block"], probe: "resp", phase: "removed" }],
  nuclear: [{ perts: ["dna-block"], probe: "tx" }, { perts: ["nuc-block"], probe: "nuc" }, { perts: ["clear-block"], probe: "tx", phase: "removed" }],
};

export function signalingQuestions(i: SignalingInputs): Question[] {
  const sys = SYSTEMS[i.sig.system];
  const ev = evaluateSignaling(i.sig);
  const qs: Question[] = [];
  qs.push(mc("sg-class", "Which receptor class has an ion pore as part of the receptor itself?", "A ligand-gated ion channel", ["A G-protein-coupled receptor", "A receptor tyrosine kinase", "An intracellular steroid receptor"], "Ligand-gated channels open directly on binding; GPCRs act through G proteins, RTKs through tyrosine phosphorylation and intracellular receptors through gene transcription.", 0));
  if (i.sig.system === "gs" || i.sig.system === "gi" || i.sig.system === "gq") {
    qs.push(mc("sg-ip3", "Which G-protein branch produces IP₃ and DAG?", "Gq, through phospholipase C-β", ["Gs, through adenylyl cyclase", "Gi, through adenylyl cyclase", "All three equally"], "Gq activates PLC-β, which cleaves PIP₂ into IP₃ and DAG. Gs stimulates and Gi inhibits adenylyl cyclase.", 1));
    qs.push(mc("sg-gi", "What does an activated Gi-coupled receptor do to cAMP production?", "Gαi·GTP inhibits adenylyl cyclase, lowering cAMP production", ["It raises cAMP like Gs", "It activates phospholipase C", "It has no effect on adenylyl cyclase"], "Not every GPCR raises cAMP: Gi opposes Gs at adenylyl cyclase.", 2));
    qs.push(mc("sg-exch", "What does an active GPCR do to its G protein?", "Promotes release of GDP so GTP can bind", ["Hydrolyses its GTP", "Phosphorylates it on tyrosine", "Removes βγ permanently"], "The active receptor is a guanine-nucleotide exchange factor; the α subunit's own GTPase later ends the signal.", 3));
  }
  if (i.sig.system === "rtk") {
    qs.push(mc("sg-sos", "Which protein recruited by Grb2 activates Ras?", "SOS, a Ras guanine-nucleotide exchange factor", ["Raf", "MEK", "A phosphatase"], "SOS promotes GDP release from Ras so GTP can bind; Raf acts after Ras·GTP.", 1));
    qs.push(mc("sg-sh2", "What does Grb2's SH2 domain bind?", "A phosphorylated tyrosine on the receptor", ["GTP", "cAMP", "DNA"], "Autophosphorylated tyrosines are docking sites for SH2 domains.", 2));
  }
  const pde = evaluateSignaling({ ...i.sig, system: "gs", ligand: true, coLigand: false, perturbations: ["pde-inhib"], phase: "removed", step: 0 });
  if (i.sig.system === "gs" || i.sig.system === "gi") qs.push(mc("sg-pde", "A phosphodiesterase inhibitor is present and the ligand is removed. What happens to cAMP?", STATUS_TEXT[pde.current.camp], ["Inactive", "Active (still being made by adenylyl cyclase)", "Blocked (cannot act)"].filter((t) => t !== STATUS_TEXT[pde.current.camp]), "PDE normally destroys cAMP; without it cAMP made earlier persists (no new cAMP is made because the receptor and G protein switch off).", 0));
  const keyOn = sys.nodes.filter((n) => n.kind !== "terminator" && n.step === i.sig.step && i.sig.step > 0)[0];
  const nxt = sys.nodes.find((n) => n.kind !== "terminator" && n.step === i.sig.step + 1);
  if (keyOn && nxt) {
    const others = sys.nodes.filter((n) => n.kind !== "terminator" && n.id !== nxt.id && n.id !== keyOn.id).map((n) => n.label).slice(0, 3);
    qs.push(mc("sg-next", `In this pathway, what does “${keyOn.label}” lead to next?`, nxt.label, others, nxt.mechanism, 2));
  }
  void ev;
  return qs;
}

export function signalingChallenge(i: SignalingInputs, idx: number): Challenge<SignalingInputs> | null {
  const sys = SYSTEMS[i.sig.system];
  const probes = (PROBES[i.sig.system] ?? []).filter((p) => p.perts.every((id) => sys.perturbations.some((x) => x.id === id)));
  if (!probes.length) return null;
  const p = probes[idx % probes.length];
  const sig = { ...i.sig, perturbations: p.perts, phase: p.phase ?? "acute" as const, ligand: p.ligand ?? true, coLigand: p.coLigand ?? false, step: sys.steps };
  const ev = evaluateSignaling(sig);
  const node = sys.nodes.find((n) => n.id === p.probe)!;
  const correct = STATUS_TEXT[ev.current[p.probe]];
  const phaseSet: Record<string, Status[]> = { acute: ["active", "inactive", "blocked"], prolonged: ["active", "attenuated", "inactive"], removed: ["inactive", "persisting", "active"] };
  const opts = phaseSet[sig.phase].map((s) => STATUS_TEXT[s]);
  const wrong = opts.filter((o) => o !== correct); if (!opts.includes(correct)) wrong.pop();
  const labels = p.perts.map((id) => sys.perturbations.find((x) => x.id === id)!.label).join(" + ");
  const phaseText = sig.phase === "acute" ? "while the ligand is present" : sig.phase === "prolonged" ? "during prolonged ligand exposure" : "after the ligand is removed";
  const ligandText = sig.ligand ? "" : " (no ligand)";
  const effect = (ev.current[p.probe] === "blocked" ? `${node.label} itself is the blocked step.` : "") + ` ${labels}.`;
  return {
    id: `sg-${idx}`, label: labels,
    question: mc(`sg-ch-${p.perts.join("-")}-${p.probe}-${sig.phase}`, `Predict: with “${labels}”${ligandText}, what is the state of “${node.label}” ${phaseText}?`, correct, wrong, `${effect} The state follows from the mechanism graph: ${node.mechanism}`.trim(), idx),
    next: { ...i, sig, selected: null },
  };
}

// ================================================================ neuron ================================================================

export function neuronQuestions(i: NeuronInputs): Question[] {
  const qs: Question[] = [];
  switch (i.section) {
    case "anatomy":
      qs.push(mc("nu-init", "Where does an action potential usually start?", "At the axon hillock / initial segment, where voltage-gated Na⁺ channels are dense", ["At the dendrite tips", "At the synaptic cleft", "In the myelin sheath"], "Summed input is integrated at the soma and the initial segment; threshold there triggers the spike.", 0));
      qs.push(mc("nu-ions", "Does a Na⁺ ion that enters at the axon hillock travel down the axon with the action potential?", "No: the wave of depolarization moves; ions cross the membrane locally", ["Yes, at the speed of the spike", "Yes, but only in myelinated axons", "Only K⁺ ions move"], "The action potential is a propagating change in membrane voltage, regenerated patch by patch.", 1));
      qs.push(mc("nu-dend", "Dendritic synaptic potentials are…", "graded and decay as they spread, not all-or-none", ["all-or-none action potentials", "always inhibitory", "generated only at nodes of Ranvier"], "Graded potentials sum at the soma and initial segment; only threshold there triggers an all-or-none spike.", 2));
      break;
    case "resting": {
      const r = restingPotential(i.resting);
      const closest = [...r.nernst].sort((a, b) => Math.abs(a.eMv - r.vmMv) - Math.abs(b.eMv - r.vmMv))[0];
      qs.push(mc("nu-rest", "With the permeabilities shown, whose equilibrium potential is closest to the resting potential?", closest.symbol, r.nernst.map((n) => n.symbol).filter((s) => s !== closest.symbol), `GHK gives ${r.vmMv.toFixed(1)} mV; the most permeant ion pulls the voltage toward its own Nernst potential.`, 0));
      qs.push(mc("nu-rest-ek", "Is the resting potential exactly the K⁺ equilibrium potential?", "No: small Na⁺ and Cl⁻ permeabilities shift it away from E_K", ["Yes, in every neuron", "No: Na⁺ pumping alone sets it", "Yes, because K⁺ is the only ion present"], `Here it is ${r.gapFromEkMv.toFixed(1)} mV above E_K.`, 1));
      break;
    }
    case "passive": {
      const tau = membraneTauMs(i.passive.rMohm, i.passive.cPf), dv = steadyDeltaMv(i.passive.iPa, i.passive.rMohm);
      const f = (x: number) => `${Number(x.toPrecision(3))} ms`;
      qs.push(mc("nu-tau", `For R = ${i.passive.rMohm} MΩ and C = ${i.passive.cPf} pF, what is the time constant?`, f(tau), [f(i.passive.rMohm / i.passive.cPf), f(tau * 10), f(tau / 10)].filter((x) => x !== f(tau)), "τ = R C (MΩ × pF = µs).", 0));
      qs.push(mc("nu-dv", `The pulse is ${i.passive.iPa} pA. What steady change in voltage would a long pulse produce?`, `${Number(dv.toPrecision(3))} mV`, [`${Number((dv * 2).toPrecision(3))} mV`, `${Number((-dv).toPrecision(3))} mV`, `${Number((dv / 2).toPrecision(3))} mV`].filter((x) => x !== `${Number(dv.toPrecision(3))} mV`), "ΔV = I R (the capacitor stops charging when its current is zero).", 1));
      const v1 = passiveVoltageMv({ ...i.passive, pulseMs: i.passive.tMaxMs }, i.passive.tStartMs + tau) - i.passive.vRestMv;
      qs.push(mc("nu-63", "After one time constant of a current step, the voltage has covered about what fraction of its final change?", "63 %", ["37 %", "50 %", "100 %"], `1 − e⁻¹ = 0.632 (here ${v1.toFixed(2)} of ${dv.toFixed(2)} mV).`, 2));
      break;
    }
    case "ap": {
      qs.push(mc("nu-repol", "Which channels carry the current that repolarizes the membrane during the falling phase?", "Delayed-rectifier K⁺ channels opening while Na⁺ channels inactivate", ["Na⁺ channels opening more widely", "Ca²⁺ channels closing", "Cl⁻ channels opening"], `${AP_PHASE_INFO.repol.text}`, 0));
      qs.push(mc("nu-abs", "What is the absolute refractory period?", "A time when no stimulus can evoke another spike, because Na⁺ channels are inactivated", ["A time when a stronger stimulus can evoke a spike", "The time to reach threshold", "The duration of the stimulus"], "In the relative refractory period a stronger stimulus can work; in the absolute one none can.", 1));
      qs.push(mc("nu-ahp", "Why does the voltage dip below rest after the spike?", "K⁺ conductance is still elevated, pulling the voltage toward E_K", ["Na⁺ channels reopen", "The pump stops", "Cl⁻ rushes in"], AP_PHASE_INFO.ahp.text, 2));
      const a = analyzeHh(simulateHh(i.hh));
      qs.push(mc("nu-spikes", "How many action potentials does the stimulus shown produce in this model?", `${a.spikes}`, ["0", "1", "2", "3"].filter((x) => x !== `${a.spikes}`).slice(0, 3), "Counted from the integrated Hodgkin–Huxley trace (upward crossings of 0 mV).", 3));
      break;
    }
    case "propagation":
      qs.push(mc("nu-salt", "In saltatory conduction, where is the action potential regenerated?", "At the nodes of Ranvier", ["Along the whole internode", "Only at the axon terminal", "In the myelin"], "Na⁺ channels are clustered at nodes; internodes conduct passively.", 0));
      qs.push(mc("nu-sites", `For the same length, how many regenerative sites does the ${i.prop.myelinated ? "myelinated" : "unmyelinated"} axon in this schematic need?`, `${regenerativeSites(i.prop.myelinated)}`, [`${regenerativeSites(!i.prop.myelinated)}`, "1", "100"], "Count of sites that regenerate the spike in the schematic (not a velocity).", 1));
      break;
    case "synapse": {
      const ex = SYNAPSE_EXAMPLES.find((e) => e.id === i.synapse.example)!, r = postsynapticResponse(i.synapse);
      qs.push(mc("nu-fusion", "What triggers synaptic vesicle fusion at a chemical synapse?", "Ca²⁺ entry through presynaptic voltage-gated Ca²⁺ channels", ["Neurotransmitter binding to the postsynaptic receptor", "Na⁺ entry through ligand-gated channels", "Diffusion of the transmitter across the cleft"], "The action potential opens voltage-gated Ca²⁺ channels; Ca²⁺ binds synaptotagmin and SNARE proteins fuse the vesicle.", 0));
      qs.push(mc("nu-pol", `At the settings shown, is the postsynaptic response to ${ex.neurotransmitter} at ${ex.receptor} depolarizing or hyperpolarizing?`, r.polarity === "depolarizing" ? "Depolarizing" : r.polarity === "hyperpolarizing" ? "Hyperpolarizing" : "No net change", ["Depolarizing", "Hyperpolarizing", "No net change"].filter((x) => x !== (r.polarity === "depolarizing" ? "Depolarizing" : r.polarity === "hyperpolarizing" ? "Hyperpolarizing" : "No net change")), r.explanation, 1));
      qs.push(mc("nu-ctx", "Is acetylcholine always excitatory?", "No: it depends on the receptor (excitatory at nicotinic, inhibitory at cardiac M₂)", ["Yes, always", "No, it is always inhibitory", "Only in the brain"], "A neurotransmitter's effect depends on the receptor and cell context.", 2));
      break;
    }
    case "summation": {
      const r = evaluateSummation(i.summation);
      qs.push(mc("nu-sum", "With the inputs shown, does the summed potential reach the assumed threshold?", r.reachesThreshold ? "Yes" : "No", ["Yes", "No"].filter((x) => x !== (r.reachesThreshold ? "Yes" : "No")), r.statement, 0));
      qs.push(mc("nu-temp", "Temporal summation is largest when successive potentials arrive…", "within a time shorter than the membrane time constant", ["much later than the time constant", "only when inhibitory", "at exactly the same synapse only"], `Here τ = ${r.tauMs.toPrecision(3)} ms: the earlier potential has not yet decayed when the next arrives.`, 1));
      break;
    }
  }
  return qs;
}

const bool = (x: boolean, a: string, b: string) => (x ? a : b);

export function neuronChallenge(i: NeuronInputs, idx: number): Challenge<NeuronInputs> | null {
  const set = (patch: Partial<NeuronInputs>): NeuronInputs => ({ ...i, ...patch });
  const items: Array<Challenge<NeuronInputs> | null> = [];
  const sameSum = (p: NeuronInputs["passive"]) => ({ ...i.summation, rMohm: p.rMohm, cPf: p.cPf, vRestMv: p.vRestMv });
  switch (i.section) {
    case "resting": {
      const r0 = restingPotential(i.resting);
      const nx = structuredClone(i.resting); nx.perms.na = Math.min(1000, nx.perms.na * 5);
      items.push({ id: "re-pna", label: "Raise P(Na⁺) five-fold", question: mc("re-pna", "Predict: raising the relative Na⁺ permeability five-fold will make the resting potential…", bool(restingPotential(nx).vmMv > r0.vmMv, "more positive", "more negative"), ["more positive", "more negative", "unchanged"], "A more Na⁺-permeable membrane is pulled toward E(Na⁺).", 0), next: set({ resting: nx }) });
      const ny = structuredClone(i.resting); ny.ions.k.out = Math.min(2000, ny.ions.k.out * 2.5);
      items.push({ id: "re-ko", label: "Raise extracellular K⁺ 2.5-fold", question: mc("re-ko", "Predict: raising extracellular K⁺ 2.5-fold will make the resting potential…", bool(restingPotential(ny).vmMv > r0.vmMv, "more positive (depolarized)", "more negative"), ["more positive (depolarized)", "more negative", "unchanged"], "A smaller K⁺ gradient raises E_K, and a K⁺-dominated membrane follows it.", 1), next: set({ resting: ny }) });
      break;
    }
    case "passive": {
      const p = i.passive;
      const c2 = { ...p, cPf: Math.min(500, p.cPf * 2) };
      items.push({ id: "pm-c", label: "Double the capacitance", question: mc("pm-c", "Predict: doubling C (R and I unchanged) will make the final steady voltage change…", "stay the same (only the speed changes)", ["double", "halve", "stay the same (only the speed changes)"], `ΔV = I R does not depend on C; τ = R C ${c2.cPf === p.cPf ? "" : "doubles"}.`, 0), next: set({ passive: c2, summation: sameSum(c2) }) });
      const r2 = { ...p, rMohm: Math.min(1000, p.rMohm * 2) };
      items.push({ id: "pm-r", label: "Double the resistance", question: mc("pm-r", "Predict: doubling R (C and I unchanged) will make the steady voltage change and the time constant…", "both double", ["both double", "only the steady change doubles", "only the time constant doubles", "neither changes"], "ΔV = I R and τ = R C both scale with R.", 1), next: set({ passive: r2, summation: sameSum(r2) }) });
      const n = { ...p, iPa: -p.iPa }; if (p.iPa !== 0) items.push({ id: "pm-i", label: "Reverse the current", question: mc("pm-i", "Predict: reversing the sign of the injected current will…", "hyperpolarize the membrane by the same amount", ["depolarize it more", "hyperpolarize it by the same amount", "make no difference"].filter((x) => x !== "depolarize it more" || p.iPa < 0).slice(0, 3), "The passive response is linear: ΔV = I R flips sign with I.", 2), next: set({ passive: n }) });
      break;
    }
    case "ap": {
      const h = i.hh;
      const run = (x: NeuronInputs["hh"]) => analyzeHh(simulateHh(x));
      const sub = { ...h, amp: 4, amp2: 0, blockNa: false, blockK: false };
      items.push({ id: "ap-sub", label: "Weaker stimulus (4 µA/cm²)", question: mc("ap-sub", "Predict: a 4 µA/cm² pulse of the same duration will produce how many spikes?", `${run(sub).spikes}`, ["0", "1", "2"].filter((x) => x !== `${run(sub).spikes}`), "Below threshold the depolarization decays: not enough Na⁺ current is recruited for it to regenerate.", 0), next: set({ hh: sub, hhTimeMs: 0 }) });
      const abs = { ...h, amp: 20, amp2: 20, delayMs: 2, durationMs: Math.max(h.durationMs, 30), blockNa: false, blockK: false };
      items.push({ id: "ap-abs", label: "Second pulse 2 ms after the first", question: mc("ap-abs", "Predict: a second, equally strong pulse starting 2 ms after the first will produce, in total…", `${run(abs).spikes} spike${run(abs).spikes === 1 ? "" : "s"}`, ["1 spike", "2 spikes", "3 spikes"].filter((x) => x !== `${run(abs).spikes} spike${run(abs).spikes === 1 ? "" : "s"}`), "Within the absolute refractory period Na⁺ channels are inactivated and no stimulus can evoke a second spike.", 1), next: set({ hh: abs, hhTimeMs: 0 }) });
      const rel = { ...abs, delayMs: 15 };
      items.push({ id: "ap-rec", label: "Second pulse 15 ms after the first", question: mc("ap-rec", "Predict: the same second pulse starting 15 ms after the first will produce, in total…", `${run(rel).spikes} spike${run(rel).spikes === 1 ? "" : "s"}`, ["1 spike", "2 spikes", "3 spikes"].filter((x) => x !== `${run(rel).spikes} spike${run(rel).spikes === 1 ? "" : "s"}`), "By 15 ms Na⁺ channels have largely recovered from inactivation and K⁺ conductance has fallen.", 2), next: set({ hh: rel, hhTimeMs: 0 }) });
      const ttx = { ...h, amp: 20, amp2: 0, blockNa: true, blockK: false };
      items.push({ id: "ap-ttx", label: "Block Na⁺ channels (TTX-like)", question: mc("ap-ttx", "Predict: with voltage-gated Na⁺ channels blocked, the 20 µA/cm² pulse will produce…", `${run(ttx).spikes === 0 ? "no spike" : "a spike"}`, ["a spike", "no spike"].filter((x) => x !== (run(ttx).spikes === 0 ? "no spike" : "a spike")), "Without the regenerative Na⁺ current only the passive depolarization remains.", 3), next: set({ hh: ttx, hhTimeMs: 0 }) });
      const tea = { ...h, amp: 20, amp2: 0, blockNa: false, blockK: true, durationMs: Math.max(h.durationMs, 30) };
      const tr = simulateHh(tea); const late = tr.v[Math.round((tea.startMs + 10) / 0.05)];
      items.push({ id: "ap-tea", label: "Block delayed-rectifier K⁺ channels (TEA-like)", question: mc("ap-tea", "Predict: with delayed-rectifier K⁺ channels blocked, ten milliseconds after the stimulus the membrane will be…", bool(late > -30, "still depolarized", "back near rest"), ["still depolarized", "back near rest", "hyperpolarized below rest"], "Without K⁺ current, repolarization relies on Na⁺ inactivation and the leak, which in this model leaves a depolarized plateau.", 0), next: set({ hh: tea, hhTimeMs: 0 }) });
      break;
    }
    case "propagation": {
      const nx = { myelinated: !i.prop.myelinated, step: 0 };
      const more = regenerativeSites(nx.myelinated) > regenerativeSites(i.prop.myelinated);
      items.push({ id: "pr-sw", label: `Switch to ${nx.myelinated ? "a myelinated" : "an unmyelinated"} axon`, question: mc("pr-sw", `Predict: switching to ${nx.myelinated ? "a myelinated" : "an unmyelinated"} axon of the same length means the spike must be regenerated at…`, bool(more, "more sites", "fewer sites"), ["more sites", "fewer sites", "the same number of sites"], "Myelinated axons regenerate the spike only at nodes; unmyelinated axons regenerate it along the whole membrane.", 0), next: set({ prop: nx }) });
      break;
    }
    case "synapse": {
      const s = i.synapse;
      const gaba = { ...s, example: "gaba-a" as const, clInMm: 30, step: Math.max(s.step, 7) };
      items.push({ id: "sy-cl", label: "GABA with high intracellular Cl⁻ (30 mM)", question: mc("sy-cl", "Predict: at a GABA_A receptor when intracellular Cl⁻ is 30 mM (E_Cl ≈ −35 mV) and Vm = −60 mV, opening the channel will…", postsynapticResponse(gaba).polarity === "depolarizing" ? "depolarize the cell" : "hyperpolarize the cell", ["depolarize the cell", "hyperpolarize the cell", "have no effect"], postsynapticResponse(gaba).explanation, 0), next: set({ synapse: gaba }) });
      const m2 = { ...s, example: "ach-m2" as const, step: Math.max(s.step, 7), perturbation: "none" as const };
      items.push({ id: "sy-m2", label: "Acetylcholine at a muscarinic M₂ receptor", question: mc("sy-m2", "Predict: acetylcholine acting at cardiac M₂ receptors (Gi → GIRK) will…", postsynapticResponse(m2).effect === "inhibitory" ? "hyperpolarize the cell (inhibitory)" : "depolarize the cell (excitatory)", ["depolarize the cell (excitatory)", "hyperpolarize the cell (inhibitory)"], postsynapticResponse(m2).explanation, 1), next: set({ synapse: m2 }) });
      const cav = { ...s, perturbation: "block-cav" as const, step: 7 };
      items.push({ id: "sy-cav", label: "Block presynaptic Ca²⁺ channels", question: mc("sy-cav", "Predict: with presynaptic voltage-gated Ca²⁺ channels blocked, at the receptor-activation stage…", bool(synapseState(cav).receptorActive, "the receptor is activated", "no transmitter has been released and the receptor is not activated"), ["the receptor is activated", "no transmitter has been released and the receptor is not activated"], synapseState(cav).caption, 2), next: set({ synapse: cav }) });
      break;
    }
    case "summation": {
      const sm = i.summation;
      const far = { ...sm, events: sm.events.map((e, k) => ({ ...e, tMs: Math.min(100, e.tMs + k * 40) })) };
      const p0 = evaluateSummation(sm).peakMv, p1 = evaluateSummation(far).peakMv;
      if (sm.events.length > 1) items.push({ id: "su-far", label: "Spread the inputs 40 ms apart", question: mc("su-far", "Predict: spreading the inputs further apart (about 40 ms) will make the peak summed voltage…", bool(p1 < p0 - 0.01, "lower", bool(p1 > p0 + 0.01, "higher", "the same")), ["higher", "lower", "the same"], "Each potential decays with the membrane time constant before the next arrives.", 0), next: set({ summation: far }) });
      const inh = { ...sm, events: sm.events.map((e, k) => (k === 0 ? { ...e, ampMv: -Math.abs(e.ampMv) } : e)) };
      if (sm.events.length > 1) items.push({ id: "su-inh", label: "Make the first input inhibitory", question: mc("su-inh", "Predict: making the first input inhibitory will make the peak summed voltage…", bool(evaluateSummation(inh).peakMv < p0 - 0.01, "lower", "higher or the same"), ["lower", "higher or the same"], "Excitatory and inhibitory potentials add algebraically in this linear model.", 1), next: set({ summation: inh }) });
      break;
    }
    case "anatomy": break;
  }
  return pick(items, idx);
}
