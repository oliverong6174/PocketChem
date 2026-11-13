/**
 * Approximate protonation of amino acids and peptides by pH (pure; no React).
 *
 * Model: each ionisable group titrates independently by the Henderson–Hasselbalch relation, fraction protonated = 1 / (1 + 10^(pH − pKa)).
 * An acid group (COOH, SH, phenol OH) is 0 when protonated and −1 when deprotonated; a base group (NH3+, imidazolium, guanidinium) is +1 when
 * protonated and 0 when deprotonated. The pKa values are those of the FREE amino acid in water; inside a folded protein, in a peptide or near
 * other charges they shift, sometimes by several units. This is an approximate acid–base model, not a measurement of any protein's protonation.
 */
import { AMINO_ACIDS_BY_ONE, type AminoAcid, type IonizableGroup } from "./aminoAcids";

export const fractionProtonated = (pKa: number, pH: number): number => 1 / (1 + 10 ** (pH - pKa));
export const groupCharge = (g: Pick<IonizableGroup, "pKa" | "type">, pH: number): number => {
  const fp = fractionProtonated(g.pKa, pH);
  return g.type === "base" ? fp : -(1 - fp);
};

export interface GroupState { group: IonizableGroup; protonated: number; charge: number; state: "protonated" | "deprotonated"; mixed: boolean }

export function groupStates(groups: IonizableGroup[], pH: number): GroupState[] {
  return groups.map((group) => {
    const protonated = fractionProtonated(group.pKa, pH);
    return { group, protonated, charge: groupCharge(group, pH), state: protonated >= 0.5 ? "protonated" : "deprotonated", mixed: Math.abs(pH - group.pKa) < 1 };
  });
}
export const netChargeOf = (groups: IonizableGroup[], pH: number): number => groups.reduce((s, g) => s + groupCharge(g, pH), 0);
export const netCharge = (a: AminoAcid, pH: number): number => netChargeOf(a.groups, pH);

/** Textbook isoelectric point: the mean of the two pKa values that bracket the neutral species. */
export function isoelectricPoint(groups: IonizableGroup[]): number {
  const sorted = [...groups].sort((x, y) => x.pKa - y.pKa);
  // charge of the fully protonated form = number of base groups; neutral is reached after that many acid-type/deprotonation steps
  const positives = groups.filter((g) => g.type === "base").length;
  // walking up in pH, the species with net charge 0 lies between the `positives`-th and the (`positives`+1)-th deprotonation
  const lo = sorted[positives - 1], hi = sorted[positives];
  return (lo.pKa + hi.pKa) / 2;
}

/** Charge of the dominant protonation state (each group assigned by pKa ≷ pH) and its common name for an amino acid. */
export function dominantForm(a: AminoAcid, pH: number): { charge: number; name: string; note: string } {
  const st = groupStates(a.groups, pH);
  const charge = st.reduce((s, x) => s + Math.round(x.state === "protonated" ? (x.group.type === "base" ? 1 : 0) : (x.group.type === "base" ? 0 : -1)), 0);
  const mixed = st.filter((x) => x.mixed).map((x) => x.group.label);
  const carboxylOff = st.find((x) => x.group.id === "alpha-carboxyl")!.state === "deprotonated";
  const aminoOn = st.find((x) => x.group.id === "alpha-amino")!.state === "protonated";
  const name = carboxylOff && aminoOn ? (charge === 0 ? "zwitterion" : `zwitterion with a ${charge > 0 ? "positively" : "negatively"} charged side chain`)
    : !carboxylOff && aminoOn ? "cation (carboxyl protonated)" : carboxylOff && !aminoOn ? "anion (amino group deprotonated)" : "neutral, un-ionised form (not significant in water)";
  return { charge, name: `${name}, net ${charge > 0 ? "+" : ""}${charge}`, note: mixed.length ? `Within 1 pH unit of a pKa (${mixed.join(", ")}): a mixture of two forms, not one pure species.` : "Each group is more than one pH unit from its pKa, so one form dominates." };
}

/** Net-charge points for a titration-style curve. */
export function chargeCurve(groups: IonizableGroup[], from = 0, to = 14, step = 0.1): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let pH = from; pH <= to + 1e-9; pH += step) out.push({ x: Number(pH.toFixed(3)), y: netChargeOf(groups, pH) });
  return out;
}

// ---- peptides ---------------------------------------------------------------------------------------------------------------------

/** Typical pKa values in peptides (approximate; used only for the educational charge estimate). */
export const PEPTIDE_PKA = { nTerminus: 8.0, cTerminus: 3.1, D: 3.9, E: 4.3, H: 6.0, C: 8.3, Y: 10.1, K: 10.5, R: 12.5 } as const;

export function peptideGroups(seq: string): IonizableGroup[] {
  const groups: IonizableGroup[] = [
    { id: "alpha-amino", label: "N-terminal amino", pKa: PEPTIDE_PKA.nTerminus, type: "base" },
    { id: "alpha-carboxyl", label: "C-terminal carboxyl", pKa: PEPTIDE_PKA.cTerminus, type: "acid" },
  ];
  [...seq].forEach((r, i) => {
    const a = AMINO_ACIDS_BY_ONE[r];
    const side = a?.groups.find((g) => g.id === "side-chain");
    if (side) groups.push({ id: "side-chain", label: `${a.three}${i + 1} ${side.label}`, pKa: PEPTIDE_PKA[r as "D" | "E" | "H" | "C" | "Y" | "K" | "R"], type: side.type, kind: side.kind });
  });
  return groups;
}
export const peptideNetCharge = (seq: string, pH: number): number => netChargeOf(peptideGroups(seq), pH);
export const peptideIsoelectricPoint = (seq: string): number => {
  // numerical root of the charge curve (peptides can have several groups of one kind, so the two-pKa rule does not apply)
  let lo = 0, hi = 14;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (peptideNetCharge(seq, mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
};
