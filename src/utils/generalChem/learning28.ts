/**
 * Stage 28: learning content and saved-result summaries for the Atomic structure, Bonding and geometry and Molecular orbitals
 * laboratories (pure). Explore lessons quote the models' numbers for the learner's current setup; every Practice and Challenge
 * answer is computed by the same models the pages use (the tests compare them with hand-written expectations).
 */
import { formatSig } from "./format";
import { checkQuantumNumbers, nodeCounts, shellCapacity, shellOrbitalCount, subshellCapacity, subshellLabel, subshellOrbitalCount } from "./quantum28";
import {
  HC_EV_NM, angularNodes, describeOrbital, expectationR, hydrogenicEnergyEV, ionisationEnergyEV, radialNodeRadii, seriesLimitNm, transition,
} from "./hydrogenic28";
import { configurationFor, formatConfiguration, elementSymbol } from "./config28";
import { analyzeLewis, getMolecule, hybridization, resonanceHybrid, structureToState } from "./lewis28";
import { bondPolarity, centerDomains, describeGeometry, moleculeGeometry, polarityOf, vseprGeometry } from "./vsepr28";
import { analyzeOccupancy, getDiatomic, groundOccupancy, withOrdering } from "./mo28";
import type { Question, Lesson } from "./chem22Learning";
import type { ToolResults } from "../persistence/generalChemTools";
import {
  ATOMIC_ENGINE_VERSION, BONDING_ENGINE_VERSION, MOLORBITALS_ENGINE_VERSION, lewisStateFor,
  type AtomicInputs, type BondingInputs, type MOInputs,
} from "../persistence/gcTools28";

export type { Lesson, Question };
const g = (v: number, sig = 4) => formatSig(v, sig);
const ionLabel = (Z: number, q: number) => `${elementSymbol(Z)}${q === 0 ? "" : q > 0 ? (q === 1 ? "⁺" : `${"⁰¹²³⁴⁵⁶⁷⁸⁹"[q] ?? q}⁺`) : (q === -1 ? "⁻" : `${"⁰¹²³⁴⁵⁶⁷⁸⁹"[-q] ?? -q}⁻`)}`;

// ---- atomic structure -------------------------------------------------------------------------------------------------------------------------

export const ATOMIC_ASSUMPTIONS = [
  "Orbitals are probability amplitudes, not orbits: the electron is not a particle travelling along a path, and an orbital picture shows where it is likely to be found.",
  "The hydrogenic functions are exact solutions for ONE electron around a point nucleus of charge Z (nonrelativistic, infinite nuclear mass). They are not the orbitals of any atom with more than one electron.",
  "Colours show the sign (phase) of the wavefunction, which has no electric-charge meaning; only |ψ|² is a probability density.",
  "Real orbitals such as p_x and d_xy are combinations of the ±m_l functions: a choice of basis that is convenient for drawing shapes.",
  "Ground-state configurations are curated from the NIST tables (Z = 1–36). The Aufbau order is a model and fails for Cr and Cu; ion configurations come from a removal/filling rule, not data.",
  "Transition energies use E_n = −13.6 Z²/n² eV: no reduced-mass, fine-structure or relativistic corrections, and no use for atoms with several electrons.",
];

export function summarizeAtomic(i: AtomicInputs): ToolResults | null {
  const base = { engineVersion: ATOMIC_ENGINE_VERSION, assumptions: ATOMIC_ASSUMPTIONS.slice(0, 4) };
  if (i.view === "quantum") {
    const c = checkQuantumNumbers(i.q);
    const head = c.ok
      ? [`n = ${i.q.n}, l = ${i.q.l}, m_l = ${i.q.ml}, m_s = ${i.q.ms > 0 ? "+" : "−"}1/2 is an allowed electron state`, `${subshellLabel(i.q.n, i.q.l)}: ${subshellOrbitalCount(i.q.l)} orbitals, ${subshellCapacity(i.q.l)} electrons; shell n = ${i.q.n}: ${shellOrbitalCount(i.q.n)} orbitals, ${shellCapacity(i.q.n)} electrons`]
      : ["These quantum numbers are not allowed", ...c.reasons.slice(0, 3)];
    return { ...base, headline: head, check: c.ok ? shellCapacity(i.q.n) : -1, checkLabel: "electrons in the shell (−1 when not allowed)" };
  }
  if (i.view === "orbital") {
    const o = i.orbital; const d = describeOrbital(o.n, o.l, o.ml, o.basis, o.Z);
    return { ...base, headline: [`${d.label}${d.realName ? ` (${d.realName})` : ""}, Z = ${o.Z}`, `${d.radialNodes} radial and ${d.angularNodes} angular node${d.angularNodes === 1 ? "" : "s"}; ⟨r⟩ = ${g(d.meanRadius)} a₀`], check: d.meanRadius, checkLabel: "mean radius ⟨r⟩ (a₀)" };
  }
  if (i.view === "config") {
    const r = configurationFor(i.config.Z, i.config.charge);
    if (!r.ok) return null;
    return { ...base, headline: [`${ionLabel(i.config.Z, i.config.charge)}: ${formatConfiguration(r.value.occupation, { noble: true, neutral: i.config.charge === 0 })}`, `${r.value.electrons} electrons, ${r.value.unpaired} unpaired${r.value.isException ? "; an exception to the simple Aufbau order" : ""}`], check: r.value.electrons, checkLabel: "electrons" };
  }
  const t = transition(i.spectra.ni, i.spectra.nf, i.spectra.Z);
  if (!t.ok) return null;
  const v = t.value;
  return { ...base, headline: [`n = ${v.ni} → ${v.nf} (${v.kind})`, `Photon ${g(v.photonEV)} eV, λ = ${g(v.wavelengthNm)} nm, f = ${g(v.frequencyHz)} Hz (${v.region})`], check: v.wavelengthNm, checkLabel: "photon wavelength (nm)" };
}

export function atomicLessons(i: AtomicInputs): Lesson[] {
  const out: Lesson[] = [];
  if (i.view === "quantum") {
    const q = i.q; const ok = checkQuantumNumbers(q).ok;
    out.push({ id: "qn-rules", title: "What do the quantum numbers allow?", body: [
      "n = 1, 2, 3, … sets the shell; l runs from 0 to n − 1 and names the subshell (s, p, d, f); m_l runs from −l to +l and labels the orbitals of a subshell; m_s is +1/2 or −1/2.",
      ok ? `For n = ${q.n} there are ${q.n} subshells, ${shellOrbitalCount(q.n)} orbitals and ${shellCapacity(q.n)} electron states (2n²).` : `The values you chose break a rule: ${(checkQuantumNumbers(q) as { reasons: string[] }).reasons.join(" ")}`,
    ] });
    out.push({ id: "qn-pauli", title: "Why can two electrons share one orbital?", body: ["An orbital is a spatial function labelled by (n, l, m_l). The Pauli exclusion principle forbids two electrons from having all four quantum numbers equal, so the two electrons in an orbital must differ in m_s: one +1/2, one −1/2 (paired spins).", "An electron STATE is the orbital together with the spin; an orbital therefore holds at most two states."] });
  } else if (i.view === "orbital") {
    const o = i.orbital; const d = describeOrbital(o.n, o.l, o.ml, o.basis, o.Z); const ang = angularNodes(o.l, o.ml, o.basis);
    out.push({ id: "orb-nodes", title: `Where are the nodes of ${d.label}?`, body: [
      `Radial nodes: n − l − 1 = ${d.radialNodes}${d.nodeRadii.length ? `, at r = ${d.nodeRadii.map((r) => g(r)).join(" and ")} a₀ (for Z = ${o.Z})` : ""}. Angular nodes: ${ang.total}. ${ang.note}`,
      "At a node the wavefunction is zero, so the probability density is zero there. The sign of ψ changes across a node, which is why neighbouring lobes are drawn in two colours: that sign is a mathematical phase, not a charge.",
    ] });
    out.push({ id: "orb-density", title: "Wavefunction, probability density and radial probability", body: [
      "ψ is the amplitude (it can be negative). |ψ|² is the probability per unit volume. The radial probability distribution r²R(r)² is the probability per unit radius, summed over all directions: the factor r² makes it zero at the nucleus even for an s orbital, so the most probable DISTANCE is not where the density is highest.",
      `For ${d.label} the mean radius is ⟨r⟩ = ${g(d.meanRadius)} a₀${o.Z > 1 ? ` (Z = ${o.Z}: the orbital is ${o.Z} times smaller than for hydrogen)` : ""}.`,
    ] });
  } else if (i.view === "config") {
    const r = configurationFor(i.config.Z, i.config.charge);
    if (r.ok) {
      const v = r.value;
      out.push({ id: "cfg-now", title: `Why does ${ionLabel(v.Z, v.charge)} have this configuration?`, body: [
        v.status === "reference-atom" ? `The configuration comes from the NIST ground-state table: ${formatConfiguration(v.occupation, { noble: true, neutral: true })}.` : v.status === "removal-rule" ? "Electrons are removed from the subshell with the highest n first (so 4s before 3d), then from the highest l within it. This is a teaching rule, not data." : "Electrons are added in Aufbau order to the next available subshell. This is a teaching rule, not data.",
        v.isException ? `The simple Aufbau order would give ${formatConfiguration(v.aufbau, { noble: true })}; the observed ground state differs because the 3d and 4s subshells are close in energy and a half-filled or filled 3d subshell is favoured.` : "The Aufbau order gives the same configuration here.",
        v.gasPhaseNote ?? `${v.unpaired} unpaired electron${v.unpaired === 1 ? "" : "s"} by Hund's rule (degenerate orbitals fill singly with parallel spins before pairing).`,
      ] });
    }
    out.push({ id: "cfg-hund", title: "Pauli, Hund and the box diagram", body: ["Each box is one orbital and holds at most two electrons of opposite spin (Pauli). In a subshell of several equal-energy orbitals the electrons occupy different boxes with parallel spins first (Hund's rule); pairing starts only when every box has one electron.", "The diagram shows the lowest-energy arrangement of the configuration; it is a model of the ground state, not a picture of where electrons are."] });
  } else {
    const t = transition(i.spectra.ni, i.spectra.nf, i.spectra.Z);
    if (t.ok) {
      const v = t.value;
      out.push({ id: "sp-photon", title: "From energy levels to the photon", body: [
        `E(n = ${v.ni}) = ${g(v.Ei)} eV and E(n = ${v.nf}) = ${g(v.Ef)} eV, so |ΔE| = ${g(v.photonEV)} eV. The photon has E = hf = hc/λ, so λ = ${g(HC_EV_NM)} eV·nm / ${g(v.photonEV)} eV = ${g(v.wavelengthNm)} nm.`,
        v.kind === "emission" ? "The electron falls to a lower level and a photon is emitted." : "The electron absorbs a photon of exactly this energy to rise to a higher level.",
        `Region: ${v.region}${v.series ? `; this is a line of the ${v.series} series (all lines end on n = ${v.lowerLevel})` : ""}. Visible light is taken as 380–750 nm.`,
      ] });
      out.push({ id: "sp-scale", title: "How does nuclear charge change the spectrum?", body: [`The energies scale as Z²: the same transition in a one-electron ion with Z = ${i.spectra.Z} has ${g(i.spectra.Z * i.spectra.Z)} times the energy of hydrogen's, and the orbital is ${i.spectra.Z} times smaller.`, `Ionisation energy from n = 1 for Z = ${i.spectra.Z}: ${g(ionisationEnergyEV(i.spectra.Z))} eV. Series limit (n → ∞) of the series ending on n = ${v.lowerLevel}: ${g(seriesLimitNm(v.lowerLevel, i.spectra.Z))} nm.`] });
    }
  }
  return out;
}

// ---- atomic questions -------------------------------------------------------------------------------------------------------------------------

const withView = (v: AtomicInputs["view"]) => (c: AtomicInputs): AtomicInputs => ({ ...c, view: v });
const choiceQ = (id: string, title: string, prompt: string, options: string[], answer: () => number, explain: () => string, setup: (c: AtomicInputs) => AtomicInputs): Question<AtomicInputs> => ({ id, title, kind: "choice", prompt, options: () => options, answer, explain, setup });

const QN_SETS: Array<{ n: number; l: number; ml: number }> = [{ n: 2, l: 1, ml: -1 }, { n: 3, l: 2, ml: 2 }, { n: 2, l: 2, ml: 0 }, { n: 4, l: 0, ml: 0 }];
const fmtQ = (q: { n: number; l: number; ml: number }) => `n = ${q.n}, l = ${q.l}, m_l = ${q.ml}`;
const cfgText = (Z: number, q = 0) => { const r = configurationFor(Z, q); return r.ok ? formatConfiguration(r.value.occupation, { noble: true, neutral: q === 0 }) : "—"; };
const nmOf = (ni: number, nf: number, Z = 1) => { const t = transition(ni, nf, Z); return t.ok ? t.value.wavelengthNm : NaN; };
const setSpectra = (ni: number, nf: number, Z = 1) => (c: AtomicInputs): AtomicInputs => ({ ...c, view: "spectra", spectra: { Z, ni, nf } });
const setConfig = (Z: number, charge = 0) => (c: AtomicInputs): AtomicInputs => ({ ...c, view: "config", config: { Z, charge, build: null } });
const setOrbital = (n: number, l: number, ml = 0) => (c: AtomicInputs): AtomicInputs => ({ ...c, view: "orbital", orbital: { ...c.orbital, n, l, ml } });

export const ATOMIC_PRACTICE: Question<AtomicInputs>[] = [
  choiceQ("qn-invalid", "Which set is not allowed?", "One of these sets of (n, l, m_l) is not a valid orbital. Which one?", QN_SETS.map(fmtQ),
    () => QN_SETS.findIndex((q) => !checkQuantumNumbers(q).ok),
    () => { const k = QN_SETS.findIndex((q) => !checkQuantumNumbers(q).ok); const c = checkQuantumNumbers(QN_SETS[k]); return `${fmtQ(QN_SETS[k])}: ${c.ok ? "" : c.reasons.join(" ")}`; },
    (c) => ({ ...withView("quantum")(c), q: { ...c.q, ...QN_SETS[2] } })),
  { id: "qn-d", title: "Orbitals in a d subshell", kind: "number", unit: "", relTol: 0, prompt: "How many orbitals are in a d subshell (l = 2)?", setup: (c) => ({ ...withView("quantum")(c), q: { n: 3, l: 2, ml: 0, ms: 1 } }), answer: () => subshellOrbitalCount(2), explain: () => "m_l takes the values −2, −1, 0, +1, +2: 2l + 1 = 5 orbitals." },
  { id: "qn-cap", title: "Electrons in 3d", kind: "number", unit: "", relTol: 0, prompt: "What is the maximum number of electrons in the 3d subshell?", setup: (c) => ({ ...withView("quantum")(c), q: { n: 3, l: 2, ml: 0, ms: 1 } }), answer: () => subshellCapacity(2), explain: () => "Five orbitals × two electrons of opposite spin = 10." },
  { id: "orb-3p-nodes", title: "Radial nodes of 3p", kind: "number", unit: "", relTol: 0, prompt: "How many radial nodes does a 3p orbital have?", setup: setOrbital(3, 1, 0), answer: () => nodeCounts(3, 1).radial, explain: () => `n − l − 1 = 3 − 1 − 1 = 1, at r = ${g(radialNodeRadii(3, 1, 1)[0])} a₀ for hydrogen.` },
  { id: "orb-2s-node", title: "Where is the 2s node?", kind: "number", unit: "a₀", relTol: 0.001, prompt: "At what distance from the nucleus (in bohr radii a₀) is the radial node of the hydrogen 2s orbital?", setup: setOrbital(2, 0, 0), answer: () => radialNodeRadii(2, 0, 1)[0], explain: () => "R₂ₛ ∝ (2 − Zr/a₀): it changes sign at r = 2a₀/Z, that is 2 a₀ for hydrogen." },
  { id: "orb-scale", title: "Nuclear charge and orbital size", kind: "number", unit: "a₀", relTol: 0.001, prompt: "What is the mean radius ⟨r⟩ of the 1s orbital of He⁺ (Z = 2), in a₀?", setup: (c) => ({ ...setOrbital(1, 0, 0)(c), orbital: { ...c.orbital, n: 1, l: 0, ml: 0, Z: 2 } }), answer: () => expectationR(1, 0, 2), explain: () => "⟨r⟩ = (3n² − l(l+1))/(2Z) a₀ = 3/4 a₀ = 0.75 a₀: twice the charge makes the orbital half as large." },
  { id: "cfg-fe-unpaired", title: "Unpaired electrons in iron", kind: "number", unit: "", relTol: 0, prompt: "How many unpaired electrons does a ground-state iron atom (Z = 26) have?", setup: setConfig(26), answer: () => { const r = configurationFor(26); return r.ok ? r.value.unpaired : -1; }, explain: () => `Fe is ${cfgText(26)}: the six 3d electrons fill five boxes, one box holds a pair, so four are unpaired.` },
  choiceQ("cfg-cr", "Chromium's configuration", "Which is the observed ground-state configuration of chromium (Z = 24)?", ["[Ar] 3d⁴ 4s²", "[Ar] 3d⁵ 4s¹", "[Ar] 3d⁶", "[Ar] 4s² 4p⁴"], () => ["[Ar] 3d⁴ 4s²", "[Ar] 3d⁵ 4s¹", "[Ar] 3d⁶", "[Ar] 4s² 4p⁴"].indexOf(cfgText(24)), () => "The simple Aufbau order predicts [Ar] 3d⁴ 4s², but the observed ground state is [Ar] 3d⁵ 4s¹ (six unpaired electrons): an exception.", setConfig(24)),
  { id: "cfg-fe3", title: "3d electrons in Fe³⁺", kind: "number", unit: "", relTol: 0, prompt: "How many 3d electrons does Fe³⁺ have?", setup: setConfig(26, 3), answer: () => { const r = configurationFor(26, 3); return r.ok ? (r.value.occupation.find((o) => o.n === 3 && o.l === 2)?.count ?? 0) : -1; }, explain: () => "The 4s electrons are removed first (two of them), then one 3d electron: [Ar] 3d⁶ 4s² → [Ar] 3d⁵." },
  { id: "sp-hb", title: "Balmer H-β wavelength", kind: "number", unit: "nm", relTol: 0.002, prompt: "What is the wavelength of the photon emitted when hydrogen falls from n = 4 to n = 2?", setup: setSpectra(4, 2), answer: () => nmOf(4, 2), explain: () => `ΔE = 13.606 eV × (1/4 − 1/16) = 2.552 eV, so λ = hc/ΔE = ${g(nmOf(4, 2))} nm (visible, blue-green).` },
  choiceQ("sp-lyman", "Lyman-α region", "Hydrogen falls from n = 2 to n = 1. In which region is the emitted photon?", ["Ultraviolet", "Visible", "Infrared"], () => { const t = transition(2, 1); return t.ok ? ["ultraviolet", "visible", "infrared"].indexOf(t.value.region) : -1; }, () => `λ = ${g(nmOf(2, 1))} nm: ultraviolet (below 380 nm).`, setSpectra(2, 1)),
  { id: "sp-he", title: "A one-electron ion", kind: "number", unit: "nm", relTol: 0.002, prompt: "What wavelength does He⁺ emit for n = 2 → 1?", setup: setSpectra(2, 1, 2), answer: () => nmOf(2, 1, 2), explain: () => `Energies scale as Z², so the wavelength is hydrogen's divided by 4: ${g(nmOf(2, 1))} nm / 4 = ${g(nmOf(2, 1, 2))} nm.` },
  choiceQ("qn-pauli", "Two electrons in one orbital", "Why can two electrons occupy the same orbital?", ["They have opposite spin (m_s = +1/2 and −1/2)", "They have different values of n", "They orbit in opposite directions", "They repel less when close together"], () => 0, () => "Pauli exclusion: no two electrons share all four quantum numbers. In one orbital n, l and m_l are the same, so m_s must differ.", withView("quantum")),
];

export const ATOMIC_CHALLENGE: Question<AtomicInputs>[] = [
  { id: "ch-3s-nodes", title: "Predict: radial nodes of 3s", kind: "number", unit: "", relTol: 0, prompt: "Without opening the orbital view: how many radial nodes does a 3s orbital have?", setup: setOrbital(3, 0, 0), answer: () => nodeCounts(3, 0).radial, explain: () => `n − l − 1 = 2, at r = ${radialNodeRadii(3, 0, 1).map((r) => g(r)).join(" and ")} a₀.` },
  choiceQ("ch-d-angular", "Predict: angular nodes of a d orbital", "How many angular nodes does a real d orbital (such as d_xy) have?", ["0", "1", "2", "3"], () => angularNodes(2, -2, "real").total, () => "A real orbital has l angular nodes: two nodal surfaces for d (planes for d_xy, d_xz, d_yz and d_x²−y²; two cones for d_z²).", setOrbital(3, 2, -2)),
  choiceQ("ch-cu", "Predict: copper", "Aufbau would give copper [Ar] 3d⁹ 4s². What is observed?", ["[Ar] 3d⁹ 4s²", "[Ar] 3d¹⁰ 4s¹", "[Ar] 3d¹⁰ 4s²", "[Ar] 3d⁸ 4s² 4p¹"], () => ["[Ar] 3d⁹ 4s²", "[Ar] 3d¹⁰ 4s¹", "[Ar] 3d¹⁰ 4s²", "[Ar] 3d⁸ 4s² 4p¹"].indexOf(cfgText(29)), () => "The filled 3d subshell is favoured: observed [Ar] 3d¹⁰ 4s¹ (NIST), one unpaired electron.", setConfig(29)),
  choiceQ("ch-cu2", "Predict: copper(II)", "Which configuration does Cu²⁺ have by the removal rule?", ["[Ar] 3d⁹", "[Ar] 3d⁸ 4s¹", "[Ar] 3d¹⁰ 4s⁻¹", "[Ar] 3d⁷ 4s²"], () => ["[Ar] 3d⁹", "[Ar] 3d⁸ 4s¹", "[Ar] 3d¹⁰ 4s⁻¹", "[Ar] 3d⁷ 4s²"].indexOf(cfgText(29, 2)), () => "Remove the 4s electron first and then one 3d electron: [Ar] 3d¹⁰ 4s¹ → [Ar] 3d⁹ (one unpaired electron).", setConfig(29, 2)),
  choiceQ("ch-balmer-edge", "Predict: a Balmer line", "Hydrogen falls from n = 5 to n = 2. Where does the photon lie?", ["Ultraviolet", "Visible", "Infrared"], () => { const t = transition(5, 2); return t.ok ? ["ultraviolet", "visible", "infrared"].indexOf(t.value.region) : -1; }, () => `λ = ${g(nmOf(5, 2))} nm: visible (violet).`, setSpectra(5, 2)),
  choiceQ("ch-bigger-gap", "Predict: which photon has more energy?", "Which transition emits the shorter wavelength, n = 3 → 2 or n = 4 → 2?", ["n = 3 → 2", "n = 4 → 2"], () => (nmOf(3, 2) < nmOf(4, 2) ? 0 : 1), () => `n = 4 → 2 has the larger energy gap (${g(hydrogenicEnergyEV(2) - hydrogenicEnergyEV(4))} eV below the n = 2 level versus ${g(hydrogenicEnergyEV(2) - hydrogenicEnergyEV(3))}), so a shorter wavelength: ${g(nmOf(4, 2))} nm versus ${g(nmOf(3, 2))} nm.`, setSpectra(4, 2)),
];

// ---- bonding and geometry -----------------------------------------------------------------------------------------------------------------

export const BONDING_ASSUMPTIONS = [
  "A Lewis structure is a bookkeeping device. A molecule does not have one unique Lewis structure, and resonance contributors are not real species that interconvert: the real electron distribution is delocalised.",
  "Formal charge is FC = V − N − B/2. It is a convention that helps compare structures, not the actual charge on an atom.",
  "Only the molecules and ions listed are supported. Nothing is inferred from an arbitrary formula and no reaction products are predicted.",
  "VSEPR geometries are IDEAL: lone pairs and unlike substituents change real bond angles, which this model does not calculate. Lone pairs are electron domains but not atoms.",
  "Bond dipoles here are schematic vectors of length |ΔEN|; the result says whether they cancel, not the size of a measured dipole moment. Lone-pair contributions are ignored.",
  "Hybridisation is a model for describing bonding, not an observable. For five or six domains 'sp³d' and 'sp³d²' are bookkeeping labels; d-orbital hybridisation is not presented as the physical explanation.",
];

export function summarizeBonding(i: BondingInputs): ToolResults | null {
  const m = getMolecule(i.molecule);
  if (!m) return null;
  const base = { engineVersion: BONDING_ENGINE_VERSION, assumptions: BONDING_ASSUMPTIONS.slice(0, 4) };
  if (i.view === "lewis") {
    const r = analyzeLewis(m, { bondOrders: i.lewis.bondOrders, lonePairs: i.lewis.lonePairs });
    if (!r.valid) return null;
    return { ...base, headline: [`${m.name} (${m.formula}): ${r.totalValence} valence electrons, ${r.counted} placed${r.conserved ? "" : ` (${r.difference > 0 ? "+" : ""}${r.difference})`}`, `Formal charges: ${r.atoms.map((a) => `${a.el}${a.formalCharge > 0 ? "+" : ""}${a.formalCharge}`).join(", ")}; sum ${r.formalChargeSum}`], check: r.totalValence, checkLabel: "valence electrons" };
  }
  if (i.view === "geometry") {
    const d = i.vsepr.source === "molecule" ? centerDomains(m, 0) : { X: i.vsepr.X, E: i.vsepr.E };
    if (!d) return { ...base, headline: [`${m.name}: no single central atom, so no single VSEPR shape`], check: 0, checkLabel: "electron domains" };
    const geo = vseprGeometry(d.X, d.E);
    if (!geo.ok) return { ...base, headline: [`${d.X} bonded atoms, ${d.E} lone pairs: ${geo.error}`], check: d.X + d.E, checkLabel: "electron domains" };
    return { ...base, headline: [`${d.X + d.E} domains: ${geo.value.entry.domainGeometry} electron geometry`, `Molecular geometry: ${geo.value.entry.molecularGeometry}; ideal angles ${geo.value.entry.idealAngles.map((a) => `${g(a, 4)}°`).join(", ")}`], check: d.X + d.E, checkLabel: "electron domains" };
  }
  if (i.view === "polarity") {
    const p = polarityOf(m, 0); const bp = bondPolarity(i.polarity.a, i.polarity.b);
    if (!p) return { ...base, headline: [`${m.name}: schematic polarity is available for single-centre molecules only`, bp ? `${i.polarity.a}–${i.polarity.b}: ΔEN = ${g(bp.delta, 3)} (${bp.cls})` : "—"], check: bp ? bp.delta : 0, checkLabel: "ΔEN of the chosen bond" };
    return { ...base, headline: [`${m.formula}: ${p.classification} (${p.cancels ? "bond dipoles cancel" : "bond dipoles do not cancel"})`, `Schematic resultant ${g(p.netMagnitude, 3)} (ΔEN units)`], check: p.netMagnitude, checkLabel: "schematic net bond-dipole (ΔEN units)" };
  }
  const hyb = hybridization(m, structureToState(m.structures[0])).filter((h) => h.hybrid);
  return { ...base, headline: [`${m.formula}: ${hyb.map((h) => `${h.el}${h.index + 1} ${h.hybrid}`).join(", ") || "no hybridised atom"}`, `σ bonds ${m.bonds.length}; π bonds ${m.structures[0].bondOrders.reduce((a, b) => a + b - 1, 0)}`], check: m.bonds.length, checkLabel: "σ bonds" };
}

export function bondingLessons(i: BondingInputs): Lesson[] {
  const m = getMolecule(i.molecule);
  if (!m) return [];
  const out: Lesson[] = [];
  if (i.view === "lewis") {
    const r = analyzeLewis(m, { bondOrders: i.lewis.bondOrders, lonePairs: i.lewis.lonePairs });
    out.push({ id: "lw-count", title: "Count the electrons first", body: [`${m.atoms.map((a, k) => `${a}${k < 0 ? "" : ""}`).filter((x, k, arr) => arr.indexOf(x) === k).join(", ")}: add the valence electrons of every atom and subtract the ionic charge (add for a negative ion). ${m.formula} has ${r.valid ? r.totalValence : "—"} electrons to place: each bond holds 2, each lone pair 2.`, "A correct structure uses exactly that many electrons. The tool reports any difference rather than hiding it."] });
    const h = resonanceHybrid(m);
    if (h) out.push({ id: "lw-reson", title: "Why resonance?", body: [`${h.contributors.length} equivalent Lewis structures can be drawn for ${m.formula}. Averaging the bond orders over them gives ${h.averageBondOrders.map((b) => g(b, 3)).join(", ")} for the bonds, which is what the equal measured bond lengths suggest.`, "The contributors are not separate molecules and the molecule does not flip between them; it is one structure with delocalised electrons that no single Lewis diagram can show."] });
    if (m.structures.length > 1 && !h) out.push({ id: "lw-compare", title: "Comparing valid structures", body: ["Several valid Lewis structures can exist for one species. Formal charges, the octet rule and experimental bond lengths are used to compare them; none of these is decisive on its own.", m.caution ?? ""] .filter(Boolean) });
    if (m.caution && !h && m.structures.length === 1) out.push({ id: "lw-caution", title: "A limit of the Lewis picture", body: [m.caution] });
  } else if (i.view === "geometry") {
    const d = i.vsepr.source === "molecule" ? centerDomains(m, 0) : { X: i.vsepr.X, E: i.vsepr.E };
    const geo = d ? vseprGeometry(d.X, d.E) : null;
    if (geo && geo.ok) out.push({ id: "vs-shape", title: "From electron domains to shape", body: [describeGeometry(geo.value), "Count regions of electron density, not bonds: a double or triple bond counts as ONE region. The domain geometry uses every region; the molecular geometry names only the atoms."] });
    if (m.textbookAngle && i.vsepr.source === "molecule") out.push({ id: "vs-angle", title: "Ideal versus real angle", body: [`The measured ${m.textbookAngle.atoms} angle quoted in textbooks is about ${m.textbookAngle.deg}°, compared with the ideal values above. Lone pairs take more room than bonding pairs and squeeze the bonded atoms together; VSEPR does not give the number.`] });
  } else if (i.view === "polarity") {
    const p = polarityOf(m, 0);
    if (p) out.push({ id: "pl-cancel", title: "Polar bonds, polar molecule?", body: [p.reason, p.limitation] });
    out.push({ id: "pl-scale", title: "Qualitative, not a dipole moment", body: ["ΔEN labels a bond (below 0.4 nonpolar covalent, 0.4–1.7 polar covalent, above 1.7 very polar), a common convention. A measured molecular dipole moment (in debye) needs the real charge distribution, which this schematic model does not provide."] });
  } else {
    const rows = hybridization(m, structureToState(m.structures[0])).filter((h) => h.hybrid);
    out.push({ id: "hy-rule", title: "Regions of electron density decide the hybrid", body: ["Two regions: sp (180°). Three: sp² (120°). Four: sp³ (109.5°). A lone pair counts as a region. Each double bond adds one π bond made from an unhybridised p orbital; a triple bond adds two.", ...rows.slice(0, 3).map((h) => `${h.el}${h.index + 1}: ${h.hybrid}, ${h.sigma} σ and ${h.pi} π bond${h.pi === 1 ? "" : "s"}. ${h.note}`)] });
    out.push({ id: "hy-limits", title: "What hybridisation does not say", body: ["Hybrid orbitals are a convenient way to describe a localised bonding picture. They are not directly observable, and a molecular wavefunction has no unique decomposition into hybrids. Molecular orbital theory describes delocalised bonding and magnetism that hybridisation cannot."] });
  }
  return out;
}

const bset = (id: string, view: BondingInputs["view"] = "lewis") => (c: BondingInputs): BondingInputs => ({ ...c, view, molecule: id, lewis: lewisStateFor(id), vsepr: { ...c.vsepr, source: "molecule" } });
const bnum = (id: string, title: string, prompt: string, answer: () => number, explain: () => string, setup: (c: BondingInputs) => BondingInputs, unit = "", relTol = 0): Question<BondingInputs> => ({ id, title, kind: "number", unit, relTol, prompt, answer, explain, setup });
const bchoice = (id: string, title: string, prompt: string, options: string[], answer: () => number, explain: () => string, setup: (c: BondingInputs) => BondingInputs): Question<BondingInputs> => ({ id, title, kind: "choice", prompt, options: () => options, answer, explain, setup });
const shapeOf = (id: string) => { const m = getMolecule(id); const geo = m ? moleculeGeometry(m, 0) : null; return geo && geo.ok ? geo.value.entry : null; };
const SHAPES = ["linear", "bent", "trigonal planar", "trigonal pyramidal", "tetrahedral", "seesaw", "T-shaped", "square planar", "square pyramidal", "octahedral"];
const shapeChoice = (id: string, title: string, mol: string, view: BondingInputs["view"] = "geometry"): Question<BondingInputs> => {
  const m = getMolecule(mol)!;
  const opts = SHAPES.slice().sort();
  return bchoice(id, title, `Predict the molecular geometry of ${m.formula} (${m.name}). Count its electron domains first.`, opts, () => opts.indexOf(shapeOf(mol)?.molecularGeometry ?? ""), () => { const e = shapeOf(mol); const d = centerDomains(m, 0); return e && d ? `${d.X} bonded atom${d.X === 1 ? "" : "s"} and ${d.E} lone pair${d.E === 1 ? "" : "s"} give ${e.domains} domains (${e.domainGeometry}); molecular geometry: ${e.molecularGeometry}.` : "—"; }, bset(mol, view));
};
const polarChoice = (id: string, title: string, mol: string): Question<BondingInputs> => {
  const m = getMolecule(mol)!;
  return bchoice(id, title, `Is ${m.formula} (${m.name}) polar or nonpolar in the schematic bond-dipole model?`, ["Polar", "Nonpolar"], () => (polarityOf(m, 0)?.classification === "polar molecule" ? 0 : 1), () => polarityOf(m, 0)?.reason ?? "—", bset(mol, "polarity"));
};

export const BONDING_PRACTICE: Question<BondingInputs>[] = [
  bnum("pr-val-no3", "Valence electrons in nitrate", "How many valence electrons must be placed in the Lewis structure of the nitrate ion, NO₃⁻?", () => { const r = analyzeLewis(getMolecule("no3")!, structureToState(getMolecule("no3")!.structures[0])); return r.totalValence; }, () => "N 5 + 3 × O 6 = 23, plus 1 for the negative charge = 24 electrons.", bset("no3")),
  bnum("pr-fc-nh4", "Formal charge of N in NH₄⁺", "What is the formal charge of nitrogen in the ammonium ion?", () => analyzeLewis(getMolecule("nh4")!, structureToState(getMolecule("nh4")!.structures[0])).atoms[0].formalCharge, () => "FC = 5 − 0 − 8/2 = +1: nitrogen has four bonds and no lone pair.", bset("nh4")),
  bnum("pr-fc-o3", "Formal charge of the central oxygen in ozone", "In the structure O=O–O⁻ the central oxygen has one double bond, one single bond and one lone pair. What is its formal charge?", () => analyzeLewis(getMolecule("o3")!, structureToState(getMolecule("o3")!.structures[0])).atoms[0].formalCharge, () => "FC = 6 − 2 − 6/2 = +1. The left oxygen is 0 and the right oxygen is −1.", bset("o3")),
  bchoice("pr-reson", "Which has resonance?", "Which species has equivalent resonance structures?", ["H₂O", "NO₃⁻", "CH₄", "NH₃"], () => ["h2o", "no3", "ch4", "nh3"].findIndex((id) => resonanceHybrid(getMolecule(id)!) !== null), () => "NO₃⁻ has three equivalent contributors (the double bond can be drawn to any of the three oxygens); the other three have a single Lewis structure.", bset("no3")),
  bnum("pr-bo-no3", "Average N–O bond order", "What is the average N–O bond order in nitrate, from the resonance contributors?", () => resonanceHybrid(getMolecule("no3")!)!.averageBondOrders[0], () => "(2 + 1 + 1)/3 = 4/3 ≈ 1.33 for each of the three bonds.", bset("no3"), "", 0.002),
  shapeChoice("pr-nh3", "Shape of ammonia", "nh3"),
  shapeChoice("pr-sf4", "Shape of SF₄", "sf4"),
  bchoice("pr-domain-nh3", "Electron-domain geometry of NH₃", "What is the ELECTRON-DOMAIN geometry around the nitrogen atom in NH₃?", ["trigonal planar", "tetrahedral", "trigonal pyramidal", "linear"], () => ["trigonal planar", "tetrahedral", "trigonal pyramidal", "linear"].indexOf(shapeOf("nh3")?.domainGeometry ?? ""), () => "Four electron domains (three bonding pairs and one lone pair) arrange tetrahedrally. 'Trigonal pyramidal' is the shape of the ATOMS.", bset("nh3", "geometry")),
  polarChoice("pr-co2", "Is CO₂ polar?", "co2"),
  bnum("pr-sigma-c2h4", "σ bonds in ethene", "How many σ bonds are in a molecule of ethene, C₂H₄?", () => getMolecule("c2h4")!.bonds.length, () => "One C–C σ bond plus four C–H σ bonds = 5. The C=C double bond also has one π bond (6 bonds, 5 σ + 1 π).", bset("c2h4", "hybrid")),
  bchoice("pr-hyb-nh3", "Hybridisation of N in NH₃", "What hybridisation does the model assign to nitrogen in NH₃?", ["sp", "sp²", "sp³", "sp³d"], () => ["sp", "sp²", "sp³", "sp³d"].indexOf(hybridization(getMolecule("nh3")!, structureToState(getMolecule("nh3")!.structures[0]))[0].hybrid ?? ""), () => "Three bonding domains plus one lone pair = four regions: sp³.", bset("nh3", "hybrid")),
];

export const BONDING_CHALLENGE: Question<BondingInputs>[] = [
  shapeChoice("ch-xef4", "Predict the shape of XeF₄", "xef4"),
  shapeChoice("ch-clf3", "Predict the shape of ClF₃", "clf3"),
  shapeChoice("ch-brf5", "Predict the shape of BrF₅", "brf5"),
  polarChoice("ch-sf4", "Predict: is SF₄ polar?", "sf4"),
  polarChoice("ch-xef4p", "Predict: is XeF₄ polar?", "xef4"),
  polarChoice("ch-chcl3", "Predict: is CHCl₃ polar?", "chcl3"),
  bchoice("ch-so4", "Predict: sulfate formal charge", "In the sulfate structure with four S–O single bonds, what is the formal charge on sulfur?", ["−2", "0", "+2", "+6"], () => ["−2", "0", "+2", "+6"].indexOf(`${analyzeLewis(getMolecule("so4")!, structureToState(getMolecule("so4")!.structures[0])).atoms[0].formalCharge > 0 ? "+" : ""}${analyzeLewis(getMolecule("so4")!, structureToState(getMolecule("so4")!.structures[0])).atoms[0].formalCharge}`), () => "FC = 6 − 0 − 8/2 = +2. Drawing two S=O double bonds lowers it to 0 at the cost of 12 electrons around S; both are only formalisms.", bset("so4")),
];

// ---- molecular orbitals ----------------------------------------------------------------------------------------------------------------------

export const MO_ASSUMPTIONS = [
  "This is the textbook valence molecular-orbital picture of homonuclear diatomics. It is not the output of a quantum-chemistry calculation: heights in the diagram show ORDER only, not energies.",
  "The 2p ordering differs: for Li₂ to N₂ the π2p orbitals lie below σ2p (s–p mixing), for O₂, F₂ and Ne₂ σ2p lies below π2p. For ions the parent atoms' ordering is used as a convention.",
  "Bond order = (bonding electrons − antibonding electrons)/2. It is a simple count, not a bond energy or a prediction of stability.",
  "Paramagnetism is read from unpaired electrons (spin only). It ignores orbital angular momentum and other forms of magnetism.",
  "The overlap pictures use an explicit approximation: two hydrogen 1s functions at a fixed distance for the σ pair, schematic lobes for p-orbital combinations. Colours show the sign of the wavefunction, not charge.",
];

export function summarizeMO(i: MOInputs): ToolResults | null {
  const sp = getDiatomic(i.species);
  if (!sp) return null;
  const base = { engineVersion: MOLORBITALS_ENGINE_VERSION, assumptions: MO_ASSUMPTIONS.slice(0, 4) };
  const r = analyzeOccupancy(sp, i.occ);
  if (!r.valid) return null;
  if (i.view === "overlap") return { ...base, headline: [`${i.overlap.combo === "bonding" ? "In-phase" : "Out-of-phase"} combination of two 1s orbitals at R = ${g(i.overlap.R, 3)} a₀`, `${sp.formula} occupancy: ${r.configuration}`], check: i.overlap.R, checkLabel: "internuclear distance R (a₀)" };
  return { ...base, headline: [`${sp.formula}: ${r.configuration}${r.complete ? "" : ` (${r.placed} of ${r.expected} electrons placed)`}`, `Bond order ${g(r.bondOrder, 3)}; ${r.unpaired} unpaired electron${r.unpaired === 1 ? "" : "s"}: ${r.magnetism}`], check: r.bondOrder, checkLabel: "bond order" };
}

export function moLessons(i: MOInputs): Lesson[] {
  const sp = getDiatomic(i.species);
  if (!sp) return [];
  const r = analyzeOccupancy(sp, i.occ);
  const out: Lesson[] = [];
  if (i.view === "diagram") {
    out.push({ id: "mo-bo", title: `How does the occupancy give ${sp.formula}'s bond order?`, body: [`Bonding electrons ${r.bonding}, antibonding ${r.antibonding}: bond order = (${r.bonding} − ${r.antibonding})/2 = ${g(r.bondOrder, 3)}.`, "Antibonding electrons cancel the bonding of an equal number of bonding electrons. A bond order of zero means no net bonding in this model; it does not by itself prove that the species cannot exist."] });
    out.push({ id: "mo-mag", title: "Why is the magnetism what it is?", body: [r.unpaired > 0 ? `${r.unpaired} unpaired electron${r.unpaired === 1 ? "" : "s"} (spin multiplicity ${r.multiplicity}): the species is paramagnetic and is drawn into a magnetic field.` : "Every electron is paired, so the species is diamagnetic (weakly repelled by a field).", "Lewis structures put electrons in pairs, so a single Lewis structure cannot show that O₂ has two unpaired electrons. In MO theory the last two electrons sit in the two degenerate π* orbitals with parallel spins (Hund's rule)."] });
    const swap = (sp.id === "b2" || sp.id === "c2") ? analyzeOccupancy(withOrdering(sp, "no-mixing"), groundOccupancy(withOrdering(sp, "no-mixing"))) : null;
    if (swap) out.push({ id: "mo-order", title: `Why the 2p ordering matters for ${sp.formula}`, body: [`With π2p below σ2p, ${sp.formula} has ${analyzeOccupancy(sp, groundOccupancy(sp)).unpaired} unpaired electrons; with σ2p below π2p it would have ${swap.unpaired}. Observations of ${sp.id === "b2" ? "B₂ paramagnetism" : "C₂"} are what support the mixing picture for the lighter atoms.`] });
  } else {
    out.push({ id: "mo-phase", title: "In phase and out of phase", body: ["Adding two atomic orbitals in phase gives a bonding orbital with amplitude of one sign between the nuclei, so density builds up there. Subtracting them gives an antibonding orbital with a nodal plane midway between the nuclei.", "The colours show the SIGN of the wavefunction, which is a mathematical phase and not an electric charge. Only the square of the amplitude has a probability meaning."] });
  }
  return out;
}

const setMO = (id: string) => (c: MOInputs): MOInputs => { const sp = getDiatomic(id)!; return { ...c, view: "diagram", species: id, occ: groundOccupancy(sp).map(() => 0) }; };
const mnum = (id: string, title: string, prompt: string, species: string, answer: () => number, explain: () => string, relTol = 0): Question<MOInputs> => ({ id, title, kind: "number", unit: "", relTol, prompt, answer, explain, setup: setMO(species) });
const mchoice = (id: string, title: string, prompt: string, species: string, options: string[], answer: () => number, explain: () => string): Question<MOInputs> => ({ id, title, kind: "choice", prompt, options: () => options, answer, explain, setup: setMO(species) });
const gr = (id: string) => { const sp = getDiatomic(id)!; return analyzeOccupancy(sp, groundOccupancy(sp)); };

export const MO_PRACTICE: Question<MOInputs>[] = [
  mnum("pr-bo-o2", "Bond order of O₂", "Fill the diagram for O₂ (12 valence electrons). What is its bond order?", "o2", () => gr("o2").bondOrder, () => "8 bonding and 4 antibonding electrons: (8 − 4)/2 = 2."),
  mnum("pr-up-o2", "Unpaired electrons in O₂", "How many unpaired electrons does O₂ have in the ground state?", "o2", () => gr("o2").unpaired, () => "The last two electrons occupy the two degenerate π*2p orbitals one each with parallel spins (Hund's rule): 2 unpaired."),
  mnum("pr-bo-n2p", "Bond order of N₂⁺", "What is the bond order of N₂⁺ (9 valence electrons)?", "n2p", () => gr("n2p").bondOrder, () => "Removing a bonding σ2p electron from N₂ leaves 7 bonding and 2 antibonding electrons: (7 − 2)/2 = 2.5.", 0.001),
  mchoice("pr-mag-b2", "Magnetism of B₂", "Is B₂ paramagnetic or diamagnetic in the textbook diagram?", "b2", ["Paramagnetic", "Diamagnetic"], () => (gr("b2").magnetism === "paramagnetic" ? 0 : 1), () => "π2p lies below σ2p, so the last two electrons go one each into the two degenerate π2p orbitals: two unpaired electrons."),
  mnum("pr-anti-o2", "Antibonding electrons in O₂", "How many electrons occupy antibonding orbitals in O₂?", "o2", () => gr("o2").antibonding, () => "σ*2s holds 2 and π*2p holds 2: 4 antibonding electrons."),
  mchoice("pr-n2-o2", "Compare N₂ and O₂", "Which has the higher bond order in this model?", "n2", ["N₂", "O₂", "They are equal"], () => (gr("n2").bondOrder > gr("o2").bondOrder ? 0 : gr("n2").bondOrder < gr("o2").bondOrder ? 1 : 2), () => `N₂ has bond order ${g(gr("n2").bondOrder, 3)} and O₂ ${g(gr("o2").bondOrder, 3)}: O₂'s two extra electrons go into antibonding π* orbitals.`),
  mchoice("pr-lewis-o2", "Lewis versus MO for O₂", "Why can a simple Lewis structure not capture O₂'s magnetic behaviour?", "o2", ["It pairs every electron, but O₂ has two unpaired electrons in degenerate π* orbitals", "O₂ has an odd number of electrons", "O₂ has a bond order of 3", "Lewis structures cannot show double bonds"], () => 0, () => "The O=O Lewis structure with two lone pairs on each atom has all electrons paired and predicts diamagnetism. The MO diagram places two electrons singly in the π*2p pair, which explains paramagnetism."),
  mnum("pr-pi-star", "Electrons in π*2p of O₂", "How many electrons are in the π*2p orbitals of O₂?", "o2", () => gr("o2").perLevel.find((l) => l.label === "π*2p")?.electrons ?? 0, () => "O₂ has 12 valence electrons; 10 fill σ2s, σ*2s, σ2p and π2p, leaving 2 for π*2p."),
  mnum("pr-bo-f2", "Bond order of F₂", "What is the bond order of F₂?", "f2", () => gr("f2").bondOrder, () => "14 valence electrons: 8 bonding and 6 antibonding: (8 − 6)/2 = 1."),
];

export const MO_CHALLENGE: Question<MOInputs>[] = [
  mchoice("ch-o2m", "Predict: adding an electron to O₂", "O₂⁻ has one more electron than O₂. Compared with O₂, its bond order is…", "o2m", ["higher", "lower", "the same"], () => (gr("o2m").bondOrder > gr("o2").bondOrder ? 0 : gr("o2m").bondOrder < gr("o2").bondOrder ? 1 : 2), () => `The extra electron goes into an antibonding π* orbital: bond order ${g(gr("o2m").bondOrder, 3)} versus ${g(gr("o2").bondOrder, 3)}.`),
  mchoice("ch-o2p", "Predict: removing an electron from O₂", "Removing an electron from O₂ gives O₂⁺. Its bond order is…", "o2p", ["higher than O₂", "lower than O₂", "the same as O₂"], () => (gr("o2p").bondOrder > gr("o2").bondOrder ? 0 : gr("o2p").bondOrder < gr("o2").bondOrder ? 1 : 2), () => `The electron removed is antibonding (π*), so the bond order rises from ${g(gr("o2").bondOrder, 3)} to ${g(gr("o2p").bondOrder, 3)}.`),
  mchoice("ch-c2", "Predict: C₂ magnetism", "With π2p below σ2p, is C₂ paramagnetic or diamagnetic?", "c2", ["Paramagnetic", "Diamagnetic"], () => (gr("c2").magnetism === "paramagnetic" ? 0 : 1), () => "Eight valence electrons fill σ2s, σ*2s and the two π2p orbitals completely: all paired, bond order 2, diamagnetic."),
  mnum("ch-he2p", "Predict: the bond order of He₂⁺", "What is the bond order of He₂⁺ (three valence electrons)?", "he2p", () => gr("he2p").bondOrder, () => "σ1s² σ*1s¹: (2 − 1)/2 = 0.5, with one unpaired electron.", 0.001),
  mchoice("ch-ne2", "Predict: Ne₂", "What does the model give for Ne₂?", "ne2", ["Bond order 0: no net bonding", "Bond order 1", "Bond order 2", "Bond order 3"], () => 0, () => "All bonding and antibonding orbitals are full: 8 and 8 electrons, bond order 0. In this simple model the molecule does not form (the real species is only a weakly bound van der Waals dimer)."),
  mchoice("ch-c22m", "Predict: the C₂²⁻ ion", "C₂²⁻ has two more electrons than C₂. Its bond order is…", "c2m2", ["1", "2", "3", "4"], () => ["1", "2", "3", "4"].indexOf(String(gr("c2m2").bondOrder)), () => "The extra electrons fill σ2p (bonding): 8 bonding and 2 antibonding electrons, bond order 3."),
];

