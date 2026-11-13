/**
 * Practice and Challenge questions for the Biochemistry tools. Every answer is computed from the same engines that draw the diagrams
 * (classes, pKa values, charge, structure, kinetics), never typed in separately. Pure functions of the saved inputs.
 */
import type { Question } from "../biology/bioLearning";
import { AMINO_ACIDS_BY_ONE, CLASS_LABEL, chargeAtPh7, type AaClass } from "./aminoAcids";
import { isoelectricPoint, netCharge, peptideNetCharge } from "./ionization";
import { parsePeptide } from "./peptide";
import { analyzeConditions, classifyPhiPsi, RAMA_LABEL, helixHBonds, SCENARIOS, analyzeSubstitution, type InteractionConditions } from "./protein";
import { apparentParameters, direction, inhibitedVelocity, type EnzymeInput, type InhibitionType } from "./enzyme";

const CLASSES: AaClass[] = ["nonpolar-aliphatic", "aromatic", "polar-uncharged", "positive", "negative"];
const SIGN = ["negative", "about zero (neutral)", "positive"];
const signIndex = (q: number) => (q < -0.25 ? 0 : q > 0.25 ? 2 : 1);

/** Each question has a stable id so the quiz keeps its answers while the learner changes the residue. */
export function aminoAcidQuestions(residue: string, other: string, pH: number, sequence: string): Question[] {
  const a = AMINO_ACIDS_BY_ONE[residue], b = AMINO_ACIDS_BY_ONE[other];
  const out: Question[] = [];
  out.push({
    id: `aa-class-${residue}`, prompt: `Which class does ${a.name} belong to?`, options: CLASSES.map((c) => CLASS_LABEL[c]), answer: CLASSES.indexOf(a.cls),
    explanation: `${a.name}: ${a.role}`,
  });
  const q7 = netCharge(a, 7);
  out.push({
    id: `aa-charge7-${residue}`, prompt: `What is the approximate net charge of free ${a.name} at pH 7?`, options: SIGN, answer: signIndex(q7),
    explanation: `At pH 7 the α-carboxyl (pKa ${a.groups.find((g) => g.id === "alpha-carboxyl")!.pKa}) is deprotonated and the α-amino group (pKa ${a.groups.find((g) => g.id === "alpha-amino")!.pKa}) is protonated; net charge ${q7.toFixed(2)} after counting the side chain${a.groups.some((g) => g.id === "side-chain") ? "" : " (it has no ionizable side chain)"}.`,
  });
  if (a.one !== b.one) {
    const options = [a.name, b.name, "They are equally hydrophobic"];
    out.push({
      id: `aa-hydro-${residue}-${other}`, prompt: `Which residue has the more positive Kyte–Doolittle hydropathy (more hydrophobic): ${a.name} or ${b.name}?`, options,
      answer: a.hydropathy === b.hydropathy ? 2 : a.hydropathy > b.hydropathy ? 0 : 1,
      explanation: `${a.name} ${a.hydropathy}, ${b.name} ${b.hydropathy}. A higher index means the side chain prefers a nonpolar environment.`,
    });
  }
  const pI = isoelectricPoint(a.groups);
  const above = pI + 2;
  out.push({
    id: `aa-pi-${residue}`, prompt: `Free ${a.name} has pI ≈ ${pI.toFixed(2)}. What is its net charge at pH ${above.toFixed(1)}?`, options: SIGN, answer: signIndex(netCharge(a, above)),
    explanation: `Above the isoelectric point the molecule has lost more protons than it gained, so it is negative. Calculated net charge ${netCharge(a, above).toFixed(2)}.`,
  });
  const p = parsePeptide(sequence);
  if (p.ok && p.seq.length >= 2) {
    out.push({
      id: `aa-bonds-${p.seq}`, prompt: `How many peptide bonds are in ${p.seq}?`, options: ["1", String(p.seq.length - 1), String(p.seq.length), String(p.seq.length + 1)].filter((v, i, arr) => arr.indexOf(v) === i),
      answer: ["1", String(p.seq.length - 1), String(p.seq.length), String(p.seq.length + 1)].filter((v, i, arr) => arr.indexOf(v) === i).indexOf(String(p.seq.length - 1)),
      explanation: `${p.seq.length} residues are joined by ${p.seq.length - 1} amide (peptide) bonds, each formed by losing one water. The free N-terminus and C-terminus are not bonds.`,
    });
    const q = peptideNetCharge(p.seq, pH);
    out.push({
      id: `aa-peptide-charge-${p.seq}-${pH}`, prompt: `Is ${p.seq} positive, neutral or negative at pH ${pH.toFixed(1)}?`, options: SIGN, answer: signIndex(q),
      explanation: `Counting the N-terminus, C-terminus and ionizable side chains with typical pKa values gives a net charge of ${q.toFixed(2)}.`,
    });
  }
  return out;
}

export interface Challenge { question: Question; /** value revealed on the diagram after the learner answers */ reveal: { pH?: number } }
/** Predict how raising or lowering the pH changes the net charge of an amino acid; the pH is applied after the answer. */
export function aminoAcidChallenges(residue: string): Challenge[] {
  const a = AMINO_ACIDS_BY_ONE[residue];
  const pI = isoelectricPoint(a.groups);
  const opts = ["More positive", "More negative", "No significant change"];
  const mk = (from: number, to: number): Challenge => {
    const d = netCharge(a, to) - netCharge(a, from);
    return {
      question: {
        id: `aac-${residue}-${from}-${to}`, prompt: `Free ${a.name} is at pH ${from.toFixed(1)}. Predict the change in net charge when the pH is moved to ${to.toFixed(1)}.`, options: opts, answer: d > 0.15 ? 0 : d < -0.15 ? 1 : 2,
        explanation: `Net charge goes from ${netCharge(a, from).toFixed(2)} to ${netCharge(a, to).toFixed(2)}. Raising the pH removes protons (more negative); lowering it adds protons (more positive).`,
      },
      reveal: { pH: to },
    };
  };
  const lo = Math.max(0, Math.round((pI - 3) * 10) / 10), hi = Math.min(14, Math.round((pI + 3) * 10) / 10);
  return [mk(lo, hi), mk(hi, lo), mk(Math.round(pI * 10) / 10, Math.min(14, Math.round((pI + 1.5) * 10) / 10)), mk(7, 7.2)];
}

// ---- protein structure ----------------------------------------------------------------------------------------------------------

export function proteinQuestions(i: { helixLength: number; phi: number; psi: number; ramaResidue: "general" | "G" | "P"; conditions: InteractionConditions; scenario: string; mutant: string }): Question[] {
  const out: Question[] = [];
  const n = i.helixLength;
  out.push({
    id: `pr-helix-${n}`, prompt: `An ideal α-helix of ${n} residues has how many backbone C=O···H–N hydrogen bonds (each from residue i to i+4)?`,
    options: [String(n - 4), String(n - 3), String(n - 2), String(n)], answer: 0,
    explanation: `Each carbonyl hydrogen-bonds to the N–H four residues later, so the last four C=O or first four N–H groups have no partner: ${helixHBonds(n).length} bonds (n − 4).`,
  });
  const c = classifyPhiPsi(i.phi, i.psi, i.ramaResidue);
  const labels = ["Right-handed α-helix region", "β-strand region", "Sterically disallowed (outside the common regions)", "Left-handed helix region"];
  const key = (x: ReturnType<typeof classifyPhiPsi>) => (x === "alpha-helix" ? 0 : x === "beta-strand" || x === "polyproline-II" ? 1 : x === "left-handed-helix" ? 3 : x === "disallowed" ? 2 : 1);
  out.push({
    id: `pr-rama-${i.phi}-${i.psi}-${i.ramaResidue}`, prompt: `Where does φ = ${i.phi}°, ψ = ${i.psi}° fall on the Ramachandran plot${i.ramaResidue === "general" ? "" : ` for ${i.ramaResidue === "G" ? "glycine" : "proline"}`}?`, options: labels, answer: key(c),
    explanation: `Classified as “${RAMA_LABEL[c]}” by the model's broad regions. Real residues also depend on their neighbors.`,
  });
  const o = analyzeConditions(i.conditions);
  const options = ["native-like", "partly unfolded", "denatured"];
  out.push({
    id: `pr-cond-${i.conditions.pH}-${i.conditions.thermal}-${i.conditions.reducingAgent}-${i.conditions.denaturant}`, prompt: "Under the conditions set above, which description fits the folded state of this model protein?", options, answer: options.indexOf(o.overall),
    explanation: `${o.statuses.filter((s) => s.state !== "intact").map((s) => `${s.label} is ${s.state}`).join("; ") || "No stabilizing interaction is lost"}.`,
  });
  const s = analyzeSubstitution(i.scenario, i.mutant);
  if (s && !s.same) {
    out.push({
      id: `pr-mut-${i.scenario}-${i.mutant}`, prompt: `In “${s.scenario.title}”, ${s.original.name} is replaced by ${s.mutant.name}. How many of the compared side-chain properties differ?`,
      options: Array.from({ length: s.diffs.length + 1 }, (_, n) => String(n)), answer: s.diffs.filter((d) => d.changed).length,
      explanation: s.diffs.map((d) => `${d.property}: ${d.from} → ${d.to}${d.changed ? "" : " (unchanged)"}`).join("; "),
    });
  }
  return out;
}

export function proteinChallenges(): Question[] {
  return SCENARIOS.map((sc) => {
    const s = analyzeSubstitution(sc.id, sc.suggested)!;
    const options = ["Likely supported as disruptive", "Likely tolerated / conservative", "The model cannot decide"];
    const disruptive = s.supported.length > 0 && s.diffs.some((d) => d.changed);
    return {
      id: `prc-${sc.id}`, prompt: `Predict: replacing ${s.original.name} with ${s.mutant.name} in “${sc.title}”. What does the bounded model support?`, options,
      answer: s.same ? 1 : disruptive ? 0 : 2,
      explanation: `Supported by the model: ${s.supported.join(" ") || "nothing specific"} Uncertain: ${s.uncertain.join(" ") || "nothing flagged"} This is qualitative, not a stability prediction.`,
    };
  });
}

// ---- enzymes -------------------------------------------------------------------------------------------------------------------

const DIRECTIONS = ["Increases", "Decreases", "Stays the same"];
const dirIndex = (d: ReturnType<typeof direction>) => (d === "increases" ? 0 : d === "decreases" ? 1 : 2);

export function enzymeQuestions(k: EnzymeInput): Question[] {
  const app = apparentParameters(k.vmax, k.km, k.inhibition);
  const t = k.inhibition.type;
  const out: Question[] = [
    {
      id: `en-half-${k.vmax}-${k.km}`, prompt: `With Vmax = ${k.vmax} and Km = ${k.km}, what is the velocity (no inhibitor) when [S] = Km?`, options: [`${k.vmax / 4}`, `${k.vmax / 2}`, `${k.vmax}`, `${k.vmax * 0.9}`], answer: 1,
      explanation: "v = Vmax·[S]/(Km + [S]); at [S] = Km this is Vmax/2. That is the definition of Km as the substrate concentration giving half-maximal velocity.",
    },
  ];
  if (t !== "none") {
    out.push({
      id: `en-vmax-${t}`, prompt: `Compared with no inhibitor, what happens to the apparent Vmax with this ${t} inhibitor?`, options: DIRECTIONS, answer: dirIndex(direction(app.vmaxApp, k.vmax)),
      explanation: t === "competitive" ? "A competitive inhibitor can be outcompeted by a high [S], so Vmax is unchanged." : "The inhibitor binds the enzyme–substrate complex, effectively removing active enzyme that substrate cannot rescue, so apparent Vmax falls.",
    });
    out.push({
      id: `en-km-${t}`, prompt: `Compared with no inhibitor, what happens to the apparent Km with this ${t} inhibitor?`, options: DIRECTIONS, answer: dirIndex(direction(app.kmApp, k.km)),
      explanation: "Apparent Km = α·Km/α′ with α = 1 + [I]/Ki and α′ = 1 + [I]/Ki′. " + (t === "competitive" ? "Only α grows, so Km rises." : t === "uncompetitive" ? "Only α′ grows, so Km falls." : t === "noncompetitive" ? "α = α′, so Km is unchanged." : "The direction depends on whether Ki is smaller or larger than Ki′."),
    });
  }
  const v = inhibitedVelocity(k.vmax, k.km, k.substrate, k.inhibition);
  out.push({
    id: `en-sat-${k.substrate}-${k.km}`, prompt: `At [S] = ${k.substrate} (Km = ${k.km}), is the enzyme closer to half-saturated or saturated?`, options: ["Below half-saturation (v < Vmax,app/2)", "Near half-saturation", "Above half-saturation, approaching Vmax"],
    answer: (() => { const f = v / app.vmaxApp; return f < 0.4 ? 0 : f <= 0.6 ? 1 : 2; })(),
    explanation: `v / Vmax,app = ${(v / app.vmaxApp).toFixed(2)}. The curve is hyperbolic: it rises steeply for [S] ≪ Km and flattens for [S] ≫ Km.`,
  });
  return out;
}

export interface EnzymeChallenge { question: Question; apply: Partial<{ type: InhibitionType }> }
export function enzymeChallenges(): EnzymeChallenge[] {
  const base: EnzymeInput = { vmax: 100, km: 2, substrate: 2, enzymeTotal: 0, inhibition: { type: "none", conc: 0, ki: 2, kiPrime: 2 } };
  return (["competitive", "uncompetitive", "noncompetitive"] as InhibitionType[]).flatMap((t) => {
    const inh = { ...base.inhibition, type: t, conc: 4 };
    const app = apparentParameters(base.vmax, base.km, inh);
    return [
      { question: { id: `enc-vmax-${t}`, prompt: `A ${t} inhibitor is added at [I] = 4 (Ki = 2). Predict the apparent Vmax.`, options: DIRECTIONS, answer: dirIndex(direction(app.vmaxApp, base.vmax)), explanation: `Apparent Vmax = ${app.vmaxApp.toFixed(1)} (from ${base.vmax}); apparent Km = ${app.kmApp.toFixed(2)} (from ${base.km}).` }, apply: { type: t } },
      { question: { id: `enc-km-${t}`, prompt: `Same ${t} inhibitor: predict the apparent Km.`, options: DIRECTIONS, answer: dirIndex(direction(app.kmApp, base.km)), explanation: `Apparent Km = ${app.kmApp.toFixed(2)} (from ${base.km}); apparent Vmax = ${app.vmaxApp.toFixed(1)}.` }, apply: { type: t } },
    ];
  });
}

export { chargeAtPh7 };
