/**
 * Protein-structure teaching models (pure; no React).
 *
 * SCOPE. Everything here is an idealised, pre-defined structural model used for teaching: ideal helix and strand geometry, the hydrogen-bond
 * patterns they imply, approximate Ramachandran regions, a qualitative interaction demonstration and a few curated substitutions. None of it
 * is a molecular-mechanics calculation, none of it folds a sequence, and no atomic coordinates of a real protein are supplied or implied.
 */
import { AMINO_ACIDS_BY_ONE, chargeAtPh7, type AminoAcid } from "./aminoAcids";
import { fractionProtonated, groupCharge } from "./ionization";

// ---- alpha helix ------------------------------------------------------------------------------------------------------------------
export const HELIX = { phi: -57, psi: -47, residuesPerTurn: 3.6, risePerResidueA: 1.5, pitchA: 5.4, hbondRing: 13, turnAngleDeg: 100 } as const;
export const HELIX_LIMITS = { min: 5, max: 24 } as const;

export interface HBond { /** residue whose backbone C=O accepts (0-based, N→C) */ acceptor: number; /** residue whose backbone N–H donates */ donor: number }

/** Ideal α-helix: the C=O of residue i accepts a hydrogen bond from the N–H of residue i+4. */
export function helixHBonds(n: number): HBond[] {
  const out: HBond[] = [];
  for (let i = 0; i + 4 < n; i += 1) out.push({ acceptor: i, donor: i + 4 });
  return out;
}
/** Residues whose backbone N–H (or C=O) is not satisfied inside the helix (the first four N–H and last four C=O of an isolated helix). */
export function helixFreeGroups(n: number, seq?: string): { freeDonors: number[]; freeAcceptors: number[] } {
  const b = helixHBonds(n);
  const donors = new Set(b.map((x) => x.donor)), acceptors = new Set(b.map((x) => x.acceptor));
  const noNH = (i: number) => seq?.[i] === "P"; // proline has no backbone N–H to donate
  return { freeDonors: Array.from({ length: n }, (_, i) => i).filter((i) => !donors.has(i) && !noNH(i)), freeAcceptors: Array.from({ length: n }, (_, i) => i).filter((i) => !acceptors.has(i)) };
}
/** Hydrogen bonds a sequence can actually make in the ideal helix: a donor that is proline cannot donate. */
export function helixHBondsForSequence(seq: string): { made: HBond[]; lost: HBond[] } {
  const all = helixHBonds(seq.length);
  return { made: all.filter((b) => seq[b.donor] !== "P"), lost: all.filter((b) => seq[b.donor] === "P") };
}
/** Angular position (degrees) of residue i around a helical wheel: 100° per residue (3.6 residues per turn). */
export const wheelAngle = (i: number) => (i * HELIX.turnAngleDeg) % 360;
/** Hydrophobic moment (Eisenberg) of a sequence read as an α-helix, using Kyte–Doolittle values, per residue. */
export function hydrophobicMoment(seq: string): number {
  let x = 0, y = 0;
  [...seq].forEach((r, i) => { const h = AMINO_ACIDS_BY_ONE[r].hydropathy, a = (wheelAngle(i) * Math.PI) / 180; x += h * Math.cos(a); y += h * Math.sin(a); });
  return Math.hypot(x, y) / seq.length;
}

// ---- beta sheet ------------------------------------------------------------------------------------------------------------------
export const STRAND = { phiRange: [-180, -45], psiRange: [90, 180], typical: { parallel: { phi: -119, psi: 113 }, antiparallel: { phi: -139, psi: 135 } }, rise: 3.3 } as const;
export const SHEET_LIMITS = { minLen: 4, maxLen: 10, minStrands: 2, maxStrands: 4 } as const;

export interface SheetBond { strandA: number; resA: number; strandB: number; resB: number; /** which backbone group of residue A donates */ aRole: "donor" | "acceptor" }
export interface SheetModel { kind: "parallel" | "antiparallel"; strandLength: number; strands: number; /** direction of each strand, +1 = left to right (N→C) */ directions: number[]; bonds: SheetBond[]; }

/**
 * Idealised pleated sheet. Every strand is drawn left to right in sheet-position order; `directions` records whether its N→C runs the same way
 * (+1) or the opposite way (−1). Position p of a strand is residue p when +1 and residue L−1−p when −1.
 *  - Antiparallel: residue pairs directly opposite each other are linked by two hydrogen bonds (N–H···O=C each way) and the pairs alternate
 *    with non-bonded pairs.
 *  - Parallel: a residue is linked to two DIFFERENT residues of the neighbouring strand (N–H of one position to the C=O of the opposite
 *    position, and its C=O to the N–H two positions further along), so bonds are not between opposite pairs.
 * Residue numbers are those of each strand's own N→C numbering.
 */
export function buildSheet(kind: "parallel" | "antiparallel", strandLength: number, strands: number): SheetModel {
  const directions = Array.from({ length: strands }, (_, s) => (kind === "parallel" || s % 2 === 0 ? 1 : -1));
  const resAt = (s: number, p: number) => (directions[s] === 1 ? p : strandLength - 1 - p);
  const bonds: SheetBond[] = [];
  for (let s = 0; s + 1 < strands; s += 1) {
    for (let p = 0; p < strandLength; p += 1) {
      if (p % 2 !== 0) continue;
      if (kind === "antiparallel") {
        bonds.push({ strandA: s, resA: resAt(s, p), strandB: s + 1, resB: resAt(s + 1, p), aRole: "donor" });
        bonds.push({ strandA: s, resA: resAt(s, p), strandB: s + 1, resB: resAt(s + 1, p), aRole: "acceptor" });
      } else {
        bonds.push({ strandA: s, resA: resAt(s, p), strandB: s + 1, resB: resAt(s + 1, p), aRole: "donor" });
        if (p + 2 < strandLength) bonds.push({ strandA: s, resA: resAt(s, p), strandB: s + 1, resB: resAt(s + 1, p + 2), aRole: "acceptor" });
      }
    }
  }
  return { kind, strandLength, strands, directions, bonds };
}
/** For each residue of strand `s` that makes bonds to strand s+1: the set of partner residues. */
export function sheetPartners(m: SheetModel, s: number): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const b of m.bonds) if (b.strandA === s) out.set(b.resA, (out.get(b.resA) ?? new Set()).add(b.resB));
  return out;
}

// ---- turns -----------------------------------------------------------------------------------------------------------------------
export const BETA_TURNS = [
  { id: "I", label: "Type I β-turn", i1: { phi: -60, psi: -30 }, i2: { phi: -90, psi: 0 }, note: "The most common turn. The C=O of residue i accepts a hydrogen bond from the N–H of residue i+3 (a ten-membered ring)." },
  { id: "II", label: "Type II β-turn", i1: { phi: -60, psi: 120 }, i2: { phi: 80, psi: 0 }, note: "Residue i+2 has a positive φ, which is easy only for glycine (and sometimes asparagine), so Gly is common at i+2." },
] as const;
export const turnHBond = (i: number): HBond => ({ acceptor: i, donor: i + 3 });

// ---- Ramachandran ----------------------------------------------------------------------------------------------------------------
export type RamaClass = "alpha-helix" | "polyproline-II" | "beta-strand" | "bridge" | "left-handed-helix" | "disallowed";
export const RAMA_LABEL: Record<RamaClass, string> = {
  "alpha-helix": "Right-handed α-helix region", "polyproline-II": "Polyproline II region", "beta-strand": "β-strand region", bridge: "Bridge region (allowed, less common)",
  "left-handed-helix": "Left-handed helix region (rare; mostly Gly and Asn)", disallowed: "Sterically disfavoured (approximate)",
};
const inBox = (phi: number, psi: number, p0: number, p1: number, s0: number, s1: number) => phi >= p0 && phi <= p1 && psi >= s0 && psi <= s1;
/** Approximate regions for a non-Gly, non-Pro residue. The boxes are teaching approximations of the favoured regions, not contour data. */
function generalClass(phi: number, psi: number): RamaClass {
  if (inBox(phi, psi, -90, -60, 120, 180)) return "polyproline-II";
  if (inBox(phi, psi, -180, -45, 90, 180)) return "beta-strand";
  if (inBox(phi, psi, -160, -45, -80, -5)) return "alpha-helix";
  if (inBox(phi, psi, -110, -50, -5, 90)) return "bridge";
  if (inBox(phi, psi, 40, 80, 10, 80)) return "left-handed-helix";
  return "disallowed";
}
export function classifyPhiPsi(phi: number, psi: number, residue: "general" | "G" | "P" = "general"): RamaClass {
  const wrap = (a: number) => (a > 180 ? a - 360 : a < -180 ? a + 360 : a);
  phi = wrap(phi); psi = wrap(psi);
  if (residue === "P") return phi >= -80 && phi <= -50 ? generalClass(phi, psi) : "disallowed";
  const c = generalClass(phi, psi);
  if (residue === "G" && c === "disallowed") {
    const m = generalClass(-phi, -psi); // glycine can also adopt the mirror-image conformations
    return m === "disallowed" ? "disallowed" : m;
  }
  return c;
}
export const isAllowed = (c: RamaClass) => c !== "disallowed";

// ---- interaction demonstration ---------------------------------------------------------------------------------------------------
export type Thermal = "low" | "moderate" | "high";
export interface InteractionConditions { pH: number; thermal: Thermal; reducingAgent: boolean; denaturant: boolean }
export const DEFAULT_CONDITIONS: InteractionConditions = { pH: 7, thermal: "low", reducingAgent: false, denaturant: false };
export type IState = "intact" | "weakened" | "disrupted";
export interface InteractionStatus { id: string; label: string; state: IState; why: string }
export interface DemoOutcome { statuses: InteractionStatus[]; overall: "native-like" | "partly unfolded" | "denatured"; solvent: "buried" | "partly exposed" | "exposed"; notes: string[] }

/** The three salt-bridge pairs of the demonstration domain, with the free-amino-acid pKa of each partner (approximate). */
export const SALT_BRIDGES = [
  { id: "K-D", label: "Lys⁺ ··· Asp⁻", base: { one: "K", pKa: 10.53 }, acid: { one: "D", pKa: 3.65 } },
  { id: "R-E", label: "Arg⁺ ··· Glu⁻", base: { one: "R", pKa: 12.48 }, acid: { one: "E", pKa: 4.25 } },
  { id: "H-D", label: "His⁺ ··· Asp⁻", base: { one: "H", pKa: 6.0 }, acid: { one: "D", pKa: 3.65 } },
] as const;
/** Probability that both partners carry their charge at this pH (both groups titrate independently in this model). */
export const saltBridgeFraction = (s: (typeof SALT_BRIDGES)[number], pH: number) => fractionProtonated(s.base.pKa, pH) * (1 - fractionProtonated(s.acid.pKa, pH));

/**
 * Qualitative response of the demonstration domain. These are DEMONSTRATION RULES, not measured transitions: real proteins unfold at very
 * different temperatures and pH values, and can refold, aggregate or stay partly folded. "Thermal energy" is a three-level qualitative control
 * on purpose; no melting temperature is implied.
 */
export function analyzeConditions(c: InteractionConditions): DemoOutcome {
  const st: InteractionStatus[] = [];
  const bridges = SALT_BRIDGES.map((s) => ({ s, f: saltBridgeFraction(s, c.pH) }));
  const bridgeState = (f: number): IState => (f >= 0.5 ? "intact" : f >= 0.1 ? "weakened" : "disrupted");
  const bs = bridges.map((b) => bridgeState(b.f));
  const nDis = bs.filter((x) => x === "disrupted").length;
  const salt: IState = nDis >= 2 ? "disrupted" : nDis === 1 || bs.includes("weakened") ? "weakened" : "intact";
  st.push({ id: "salt", label: "Ionic interactions and salt bridges", state: salt, why: `Charged pairs: ${bridges.map((b, i) => `${b.s.label} ${bs[i]}`).join("; ")}. A salt bridge needs both partners charged, which depends on pH relative to each pKa.` });
  const reduced = c.reducingAgent;
  st.push({ id: "disulfide", label: "Disulfide bond (covalent)", state: reduced ? "disrupted" : "intact", why: reduced ? "A reducing agent (such as DTT or β-mercaptoethanol) reduces the S–S bond to two thiols." : "Covalent S–S bonds are not broken by heat, pH within the normal range or urea alone; they need a reducing agent." });
  const extremePh = c.pH < 3 || c.pH > 11;
  const hb: IState = c.thermal === "high" || (c.denaturant && c.thermal !== "low") ? "disrupted" : c.thermal === "moderate" || c.denaturant || extremePh ? "weakened" : "intact";
  st.push({ id: "hbond", label: "Hydrogen bonds", state: hb, why: `${c.thermal === "low" ? "Low thermal energy leaves hydrogen bonds in place" : c.thermal === "moderate" ? "More thermal motion weakens hydrogen bonds" : "High thermal energy breaks many hydrogen bonds"}${c.denaturant ? "; urea or detergent competes for the donors and acceptors" : ""}${extremePh ? "; extreme pH changes the charge of polar groups" : ""}.` });
  const hydroDisrupt = c.denaturant && c.thermal === "high", hydroWeak = c.denaturant || c.thermal === "high";
  const hy: IState = hydroDisrupt ? "disrupted" : hydroWeak ? "weakened" : "intact";
  st.push({ id: "hydrophobic", label: "Hydrophobic interactions (core)", state: hy, why: c.denaturant ? "Detergents and urea make the surrounding solvent a better home for nonpolar groups, so the hydrophobic driving force for burial is reduced." : c.thermal === "high" ? "The core loosens when thermal motion is high; the hydrophobic effect itself depends on temperature in a protein-specific way." : "Nonpolar side chains (Leu, Ile, Val, Phe) stay packed away from water." });
  const vdw: IState = hy === "disrupted" ? "disrupted" : hy === "weakened" || c.thermal === "high" ? "weakened" : "intact";
  st.push({ id: "vdw", label: "Van der Waals contacts", state: vdw, why: "These weak contacts depend on close packing; when the core loosens or thermal motion is high they are lost together." });
  const dis = st.filter((x) => x.id !== "disulfide" && x.state === "disrupted").length;
  const weak = st.filter((x) => x.id !== "disulfide" && x.state === "weakened").length;
  const overall = dis >= 2 ? "denatured" : dis === 1 || weak >= 2 ? "partly unfolded" : "native-like";
  const notes = ["These rules are a qualitative demonstration for one made-up domain. Whether and where a real protein unfolds depends on the protein and the conditions, and a denatured protein may refold, aggregate, or stay partly structured."];
  if (overall === "denatured" && st.find((x) => x.id === "disulfide")!.state === "intact") notes.push("The intact disulfide bond still ties parts of the chain together even though the noncovalent interactions are lost.");
  return { statuses: st, overall, solvent: hy === "intact" ? "buried" : hy === "weakened" ? "partly exposed" : "exposed", notes };
}

// ---- curated examples and structural-disruption scenarios --------------------------------------------------------------------------
export interface ProteinExample { id: string; name: string; subunits: Array<{ name: string; residues: number; sequence?: string }>; secondary: string; tertiary: string; quaternary: string; disulfides: Array<{ a: string; b: string; pa: number; pb: number }>; scope: string }
const INSULIN_A = "GIVEQCCTSICSLYQLENYCN", INSULIN_B = "FVNQHLCGSHLVEALYLVCGERGFFYTPKT";
export const PROTEIN_EXAMPLES: ProteinExample[] = [
  { id: "insulin", name: "Human insulin", subunits: [{ name: "A chain", residues: 21, sequence: INSULIN_A }, { name: "B chain", residues: 30, sequence: INSULIN_B }],
    secondary: "Two short α-helical segments in the A chain and one α-helical segment in the central part of the B chain, in a compact fold.", tertiary: "A and B chains pack into a small compact monomer held together by three disulfide bonds.", quaternary: "The active hormone is a monomer; it is stored as zinc-containing hexamers.",
    disulfides: [{ a: "A", b: "A", pa: 6, pb: 11 }, { a: "A", b: "B", pa: 7, pb: 7 }, { a: "A", b: "B", pa: 20, pb: 19 }], scope: "Real sequences; the fold is described, not drawn from coordinates." },
  { id: "myoglobin", name: "Sperm-whale myoglobin", subunits: [{ name: "polypeptide", residues: 153 }], secondary: "Eight α-helices (labelled A–H) joined by short loops; very little β-structure.", tertiary: "A single compact globular chain; the helices surround one heme group in a hydrophobic pocket.", quaternary: "A monomer (one subunit, one heme).", disulfides: [], scope: "Described from the literature; the sequence is not reproduced here." },
  { id: "hemoglobin", name: "Human hemoglobin A", subunits: [{ name: "α", residues: 141 }, { name: "α", residues: 141 }, { name: "β", residues: 146 }, { name: "β", residues: 146 }], secondary: "Each subunit is mostly α-helical and has the globin fold of myoglobin.", tertiary: "Each subunit folds around its own heme.", quaternary: "A tetramer of two α and two β subunits (α₂β₂) that changes arrangement when oxygen binds.", disulfides: [], scope: "Described from the literature; the sequences are not reproduced here." },
  { id: "gfp", name: "Green fluorescent protein", subunits: [{ name: "polypeptide", residues: 238 }], secondary: "Eleven β-strands forming a barrel, with a short α-helix running through its centre.", tertiary: "A β-barrel (“β-can”) whose central helix carries the chromophore.", quaternary: "A monomer.", disulfides: [], scope: "Described from the literature; the sequence is not reproduced here." },
];

export type ScenarioContext = "surface-charge" | "helix-backbone" | "disulfide" | "core-hydrophobic" | "salt-bridge";
export interface Scenario { id: string; title: string; protein: string; position: number; original: string; suggested: string; context: ScenarioContext; helixLength?: number; partner?: string; background: string }
export const SCENARIOS: Scenario[] = [
  { id: "hbs", title: "Sickle-cell hemoglobin: β-globin residue 6", protein: "Human hemoglobin β chain", position: 6, original: "E", suggested: "V", context: "surface-charge", background: "Position 6 of the β chain (counting from the first residue after the initiator Met) is glutamate in normal hemoglobin A and valine in hemoglobin S. The residue lies at the surface of the subunit." },
  { id: "pro-helix", title: "Proline inside an α-helix (model helix)", protein: "Model 15-residue α-helix", position: 8, original: "A", suggested: "P", context: "helix-backbone", helixLength: 15, background: "A 15-residue ideal α-helix. Proline has no backbone N–H, so it cannot donate the i+4 hydrogen bond that the helix needs, and its ring fixes φ near −63°." },
  { id: "insulin-a7", title: "Insulin A chain Cys7", protein: "Human insulin", position: 7, original: "C", suggested: "S", context: "disulfide", partner: "B7", background: "A7 of the A chain forms an interchain disulfide bond with B7 of the B chain." },
  { id: "core-leu", title: "Buried leucine in a model domain", protein: "Model domain (interaction demonstration)", position: 12, original: "L", suggested: "D", context: "core-hydrophobic", background: "Leu12 packs among other nonpolar side chains in the hydrophobic core of the demonstration domain." },
  { id: "salt-lys", title: "Lysine in a salt bridge (model domain)", protein: "Model domain (interaction demonstration)", position: 20, original: "K", suggested: "E", context: "salt-bridge", partner: "D", background: "Lys20 forms a salt bridge with Asp45 in the demonstration domain." },
];
export interface Substitution { scenario: Scenario; original: AminoAcid; mutant: AminoAcid; same: boolean; diffs: Array<{ property: string; from: string; to: string; changed: boolean }>; supported: string[]; uncertain: string[]; helix?: { lost: HBond[]; madeBefore: number; madeAfter: number } }

const NOT_PREDICTED = "Whether this changes the folded structure, stability, activity or disease risk of the real protein is not predicted by this tool.";
const ph74Charge = (a: AminoAcid) => a.groups.reduce((s, g) => s + groupCharge(g, 7.4), 0) - groupCharge(a.groups.find((g) => g.id === "alpha-amino")!, 7.4) - groupCharge(a.groups.find((g) => g.id === "alpha-carboxyl")!, 7.4);
/** Side-chain charge at pH 7.4 using the free-amino-acid pKa (approximate). */
export const sideChainCharge = (a: AminoAcid) => Number(ph74Charge(a).toFixed(2));

export function analyzeSubstitution(scenarioId: string, newResidue: string, position?: number): Substitution | null {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  const mutant = AMINO_ACIDS_BY_ONE[newResidue];
  if (!scenario || !mutant) return null;
  const original = AMINO_ACIDS_BY_ONE[scenario.original];
  const same = original.one === mutant.one;
  const fmt = (a: AminoAcid) => `${a.name} (${a.three})`;
  const diffs = [
    { property: "Residue", from: fmt(original), to: fmt(mutant) },
    { property: "Class", from: original.cls, to: mutant.cls },
    { property: "Side-chain charge at pH 7.4 (approx.)", from: String(sideChainCharge(original)), to: String(sideChainCharge(mutant)) },
    { property: "Hydropathy (Kyte–Doolittle)", from: String(original.hydropathy), to: String(mutant.hydropathy) },
    { property: "Residue volume (Å³)", from: String(original.volume), to: String(mutant.volume) },
  ].map((d) => ({ ...d, changed: d.from !== d.to }));
  const supported: string[] = [], uncertain: string[] = [NOT_PREDICTED];
  const dq = sideChainCharge(mutant) - sideChainCharge(original);
  const dv = mutant.volume - original.volume;
  let helix: Substitution["helix"];
  if (same) supported.push("The residue is unchanged, so no structural consequence follows from this model.");
  else switch (scenario.context) {
    case "surface-charge":
      if (dq !== 0) supported.push(`The side-chain charge changes by ${dq > 0 ? "+" : ""}${dq.toFixed(1)} at pH 7.4, so any ionic or solvation interactions of the original residue are lost or changed.`);
      if (mutant.hydropathy > original.hydropathy + 2) supported.push(`A polar or charged surface residue is replaced by a more hydrophobic one (hydropathy ${original.hydropathy} → ${mutant.hydropathy}), exposing a nonpolar side chain to solvent.`);
      if (original.one === "E" && mutant.one === "V") uncertain.push("In real hemoglobin S the exposed valine is known to promote aggregation of deoxygenated molecules; that downstream effect is documented experimentally and is not predicted by this tool.");
      else uncertain.push("A surface change can alter binding, solubility or aggregation; the size and direction of such effects are not predicted here.");
      break;
    case "helix-backbone": {
      const len = scenario.helixLength ?? 15, pos = (position ?? scenario.position) - 1;
      const wild = "A".repeat(len);
      const seq = wild.slice(0, pos) + mutant.one + wild.slice(pos + 1);
      const before = helixHBondsForSequence(wild), after = helixHBondsForSequence(seq);
      helix = { lost: after.lost, madeBefore: before.made.length, madeAfter: after.made.length };
      if (mutant.one === "P") supported.push(`Proline has no backbone N–H, so the i→i+4 hydrogen bond to its C=O partner (residue ${pos + 1 - 4 >= 1 ? pos + 1 - 4 : "—"} → ${pos + 1}) cannot form: the helix loses ${after.lost.length} hydrogen bond${after.lost.length === 1 ? "" : "s"} (${before.made.length} → ${after.made.length}), and the ring restricts φ to about −63°.`);
      else if (mutant.one === "G") supported.push("Glycine has no side chain and the widest allowed φ/ψ range, so the backbone becomes more flexible at this position; all backbone hydrogen bonds remain possible.");
      else supported.push("Every non-proline residue still has a backbone N–H, so all the helix's backbone hydrogen bonds remain possible in this idealised model.");
      uncertain.push("Helix propensity of the new side chain (which residues stabilise or destabilise helices) is not calculated here.");
      break;
    }
    case "disulfide":
      if (mutant.one !== "C") supported.push(`${mutant.name} has no thiol group, so the ${scenario.protein.includes("insulin") ? `A${scenario.position}–${scenario.partner}` : "S–S"} disulfide bond to ${scenario.partner} cannot form; one of insulin's three disulfides is missing.`);
      uncertain.push("Loss of a disulfide usually reduces stability, but how much, and whether the chains still fold and bind the receptor, is not predicted here.");
      break;
    case "core-hydrophobic":
      if (mutant.hydropathy < original.hydropathy - 3) supported.push(`A hydrophobic core residue is replaced by a much more polar one (hydropathy ${original.hydropathy} → ${mutant.hydropathy}), losing hydrophobic contacts.`);
      if (sideChainCharge(mutant) !== 0) supported.push(`A charged side chain (${sideChainCharge(mutant)} at pH 7.4) would be buried in the nonpolar core without water or a counter-ion.`);
      if (Math.abs(dv) >= 20) supported.push(`The side-chain volume changes by ${dv > 0 ? "+" : ""}${dv.toFixed(1)} Å³ (${dv > 0 ? "possible steric clash" : "possible cavity"}).`);
      uncertain.push("Whether the core rearranges, tolerates the change or unfolds depends on the local environment and cannot be predicted by this tool.");
      break;
    case "salt-bridge": {
      const partner = AMINO_ACIDS_BY_ONE[scenario.partner ?? "D"];
      const q0 = sideChainCharge(original), q1 = sideChainCharge(mutant), qp = sideChainCharge(partner);
      if (q1 === 0) supported.push("The charge is lost, so the salt bridge to its partner cannot form (a neutral side chain may still hydrogen-bond).");
      else if (Math.sign(q1) === Math.sign(qp)) supported.push(`The new side chain has the same sign of charge as its partner ${partner.three} (${q1} and ${qp}), so the interaction becomes repulsive instead of attractive.`);
      else if (Math.sign(q0) !== Math.sign(q1)) supported.push("The charge sign changes while the opposite charge of the partner is kept, so an ionic interaction is still possible with the changed geometry.");
      uncertain.push("The strength of a salt bridge depends on distance, burial and the surrounding dielectric; the energetic effect is not calculated.");
      break;
    }
  }
  return { scenario, original, mutant, same, diffs, supported, uncertain, helix };
}

/** Residue-level properties used by questions: side-chain charge category at pH 7 for a one-letter code. */
export const charge7 = (one: string) => chargeAtPh7(AMINO_ACIDS_BY_ONE[one]);
