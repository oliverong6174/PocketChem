/**
 * Gene-regulation models (pure; no React): the lac operon, the trp operon with attenuation, and a focused eukaryotic model.
 *
 * Expression is reported as an ORDINAL model rank with a qualitative label, never as a measured rate. Ranks order states
 * ("more than", "less than", "about the same"); the size of a difference is not claimed. Leaky (basal) expression is part of
 * the model: a bound repressor lowers transcription but does not reduce it to exactly zero.
 *
 * Everything shown is derived from the input state: which protein is bound where, which RNA structure forms, which element is
 * cis-acting. Nothing here predicts the behaviour of an arbitrary regulatory sequence; every element's effect is declared.
 */
import { reverseComplementRna } from "./sequence";
import { translateFrom } from "./translate";

export interface Level { rank: number; label: string }

export interface ComponentInfo {
  id: string;
  label: string;
  /** "cis" DNA element, "trans" diffusible factor (protein/RNA/small molecule), or the gene that encodes a trans factor. */
  kind: "cis-acting DNA element" | "trans-acting protein" | "gene encoding a trans-acting protein" | "small molecule" | "RNA structure" | "enzyme/machine";
  role: string;
  state: string;
  /** What a mutation or loss of this component does, and whether it acts in cis or in trans. */
  mutation: string;
}

// =============================================================================================================================
// lac operon
// =============================================================================================================================

export type LacI = "+" | "-" | "s";
export type LacO = "+" | "c";
export type LacP = "+" | "-";
export type LacZ = "+" | "-";
export interface LacCopy { I: LacI; O: LacO; P: LacP; Z: LacZ }
export interface LacInput { lactose: boolean; glucose: boolean; crp: "+" | "-"; copies: LacCopy[]; step: number }
export const LAC_STEPS = 5; // steps 0..4
export const WILD_LAC: LacCopy = { I: "+", O: "+", P: "+", Z: "+" };
export const DEFAULT_LAC_INPUT: LacInput = { lactose: true, glucose: false, crp: "+", copies: [{ ...WILD_LAC }], step: 0 };

export const LAC_LEVELS: Level[] = [
  { rank: 0, label: "None (no promoter function)" },
  { rank: 1, label: "Basal (leaky)" },
  { rank: 2, label: "Low" },
  { rank: 3, label: "High" },
];
const lacLevel = (rank: number): Level => LAC_LEVELS[rank];

export interface LacCopyState {
  copy: LacCopy;
  repressorBound: boolean;
  /** cAMP–CRP bound next to the promoter of this copy (needs the CAP site, assumed intact in every copy). */
  crpBound: boolean;
  rnap: "none" | "blocked" | "weak" | "strong";
  level: Level;
  productive: boolean;
}
export interface LacEval {
  repressor: "none" | "inducible" | "uninducible";
  allolactose: boolean;
  camp: "high" | "low";
  crpActive: boolean;
  copies: LacCopyState[];
  transcription: Level;
  /** β-galactosidase activity: transcription of a copy whose lacZ works. */
  enzyme: Level;
  reasons: string[];
}

export function evaluateLac(input: LacInput): LacEval {
  const repressor: LacEval["repressor"] = input.copies.some((c) => c.I === "s") ? "uninducible" : input.copies.some((c) => c.I === "+") ? "inducible" : "none";
  const allolactose = input.lactose;
  const camp = input.glucose ? "low" : "high";
  const crpActive = !input.glucose && input.crp === "+";
  // an inducible repressor binds unless allolactose is present; the lacIˢ repressor cannot bind allolactose, so it always binds
  const binds = repressor === "uninducible" || (repressor === "inducible" && !allolactose);
  const copies: LacCopyState[] = input.copies.map((copy) => {
    const repressorBound = copy.O === "+" && binds;
    let rank: number;
    if (copy.P === "-") rank = 0; else if (repressorBound) rank = 1; else rank = crpActive ? 3 : 2;
    const rnap: LacCopyState["rnap"] = copy.P === "-" ? "none" : repressorBound ? "blocked" : crpActive ? "strong" : "weak";
    return { copy, repressorBound, crpBound: crpActive, rnap, level: lacLevel(rank), productive: copy.Z === "+" && rank > 0 };
  });
  const tRank = Math.max(...copies.map((c) => c.level.rank));
  const eRank = Math.max(0, ...copies.filter((c) => c.copy.Z === "+").map((c) => c.level.rank));
  const reasons: string[] = [];
  if (repressor === "none") reasons.push("There is no working LacI repressor, so nothing blocks the operator: lactose cannot control expression.");
  else if (repressor === "uninducible") reasons.push("A lacIˢ repressor is present: it cannot bind allolactose, so it stays on the operator whether or not lactose is present, and it acts in trans on every copy of the operon (dominant).");
  else if (allolactose) reasons.push("Lactose is present, so some is converted to allolactose. Allolactose binds the LacI repressor and changes its shape, so it releases the operator (induction).");
  else reasons.push("No lactose, so no allolactose: the LacI repressor stays on the operator and blocks RNA polymerase (negative control).");
  if (input.crp === "-") reasons.push("The cAMP–CRP system is defective, so the promoter can never be fully activated.");
  else if (input.glucose) reasons.push("Glucose is present, so cAMP is low. Without cAMP, CRP does not bind its site, and RNA polymerase binds this weak promoter poorly (catabolite repression, a positive-control signal that is off).");
  else reasons.push("Glucose is absent, so cAMP is high. cAMP–CRP binds its site beside the promoter and helps RNA polymerase bind (positive control).");
  copies.forEach((c, i) => {
    const name = input.copies.length > 1 ? `Copy ${i + 1}: ` : "";
    if (c.copy.P === "-") reasons.push(`${name}the promoter is defective (lacP⁻), so RNA polymerase cannot start here whatever the conditions. This is a cis effect: it silences only the genes on this DNA molecule.`);
    else if (c.copy.O === "c" && binds) reasons.push(`${name}the operator is mutated (lacOᶜ) so the repressor cannot bind it. Repressor is present in the cell, yet this copy is not blocked: the effect is cis, limited to the genes next to the operator.`);
    else if (c.repressorBound) reasons.push(`${name}repressor occupies the operator, so RNA polymerase is mostly blocked. Expression is basal, not zero: the repressor occasionally leaves, so a little transcription leaks through.`);
    else reasons.push(`${name}the operator is free${crpActive ? " and cAMP–CRP helps the polymerase: high transcription." : " but the promoter is weak without cAMP–CRP: low transcription."}`);
  });
  return { repressor, allolactose, camp, crpActive, copies, transcription: lacLevel(tRank), enzyme: input.copies.some((c) => c.Z === "+") ? lacLevel(eRank) : { rank: 0, label: "None (no working lacZ)" }, reasons };
}

export function validateLacInput(raw: unknown): { ok: true; value: LacInput } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Not an object." };
  const r = raw as Record<string, unknown>;
  if (typeof r.lactose !== "boolean" || typeof r.glucose !== "boolean") return { ok: false, error: "Lactose and glucose must be on or off." };
  if (r.crp !== "+" && r.crp !== "-") return { ok: false, error: "Unknown cAMP–CRP state." };
  if (!Array.isArray(r.copies) || r.copies.length < 1 || r.copies.length > 2) return { ok: false, error: "A cell has one or two copies of the operon." };
  const copies: LacCopy[] = [];
  for (const c of r.copies) {
    const o = c as Record<string, unknown>;
    if (typeof o !== "object" || o === null) return { ok: false, error: "Malformed copy." };
    if (!["+", "-", "s"].includes(o.I as string) || !["+", "c"].includes(o.O as string) || !["+", "-"].includes(o.P as string) || !["+", "-"].includes(o.Z as string)) return { ok: false, error: "Unknown allele." };
    copies.push({ I: o.I as LacI, O: o.O as LacO, P: o.P as LacP, Z: o.Z as LacZ });
  }
  if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 0 || r.step >= LAC_STEPS) return { ok: false, error: "Step out of range." };
  return { ok: true, value: { lactose: r.lactose, glucose: r.glucose, crp: r.crp, copies, step: r.step } };
}

export function lacStepCaption(input: LacInput, step: number): { title: string; text: string } {
  const ev = evaluateLac(input);
  const multi = input.copies.length > 1;
  switch (step) {
    case 0: return { title: "Conditions", text: `Lactose is ${input.lactose ? "present" : "absent"} and glucose is ${input.glucose ? "present" : "absent"}. The cell has ${multi ? "two copies of the operon (the chromosome and an F′ plasmid)" : "one copy of the operon"}: lacI (repressor gene), the CAP site, the promoter, the operator and lacZYA.` };
    case 1: return { title: "Repressor and inducer", text: ev.reasons[0] };
    case 2: return { title: "cAMP–CRP", text: ev.reasons[1] };
    case 3: return { title: "RNA polymerase", text: ev.copies.map((c, i) => `${multi ? `Copy ${i + 1}: ` : ""}${c.rnap === "none" ? "RNA polymerase cannot bind (no promoter function)." : c.rnap === "blocked" ? "RNA polymerase is blocked by the repressor at the operator (a little leaks through)." : c.rnap === "strong" ? "RNA polymerase binds strongly with cAMP–CRP and starts often." : "RNA polymerase binds the weak promoter only occasionally."}`).join(" ") };
    default: return { title: "Transcriptional output", text: `lacZYA transcription: ${ev.transcription.label}. β-galactosidase activity (needs a working lacZ): ${ev.enzyme.label}.` };
  }
}

/** Components that can be selected in the lac diagram, with their live state. */
export function lacComponents(input: LacInput): ComponentInfo[] {
  const ev = evaluateLac(input);
  const bound = ev.copies.some((c) => c.repressorBound);
  return [
    { id: "lacI", label: "lacI gene", kind: "gene encoding a trans-acting protein", role: "Encodes the LacI repressor protein. It is expressed constantly at a low level.", state: input.copies.map((c) => c.I === "+" ? "wild type" : c.I === "-" ? "lacI⁻ (no working repressor)" : "lacIˢ (cannot bind allolactose)").join("; "), mutation: "lacI⁻ makes the operon constitutive (recessive: a working lacI on another DNA molecule restores control in trans). lacIˢ blocks induction and is dominant in trans." },
    { id: "repressor", label: "LacI repressor", kind: "trans-acting protein", role: "Binds the operator and blocks RNA polymerase; allolactose releases it.", state: ev.repressor === "none" ? "absent" : ev.repressor === "uninducible" ? "present, cannot be induced (lacIˢ)" : bound ? "bound to operator" : "released from operator (allolactose bound)", mutation: "It is a diffusible protein, so it acts on every copy of the operon in the cell (trans)." },
    { id: "allolactose", label: "Allolactose (inducer)", kind: "small molecule", role: "Made from lactose; binds the repressor and releases it from the operator.", state: input.lactose ? "present" : "absent", mutation: "Not a mutation target; it carries the lactose signal." },
    { id: "cap", label: "CAP (CRP) site", kind: "cis-acting DNA element", role: "Where cAMP–CRP binds next to the promoter.", state: ev.crpActive ? "cAMP–CRP bound" : "empty", mutation: "A change in this site would act only on the operon it sits beside (cis)." },
    { id: "crp", label: "cAMP–CRP", kind: "trans-acting protein", role: "cAMP signals low glucose. The cAMP–CRP complex helps RNA polymerase bind the lac promoter (positive control).", state: input.crp === "-" ? "defective" : ev.camp === "high" ? "cAMP high, complex formed" : "cAMP low, complex not formed", mutation: "Loss of cAMP or CRP is a trans effect on many operons, not only lac." },
    { id: "promoter", label: "Promoter (lacP)", kind: "cis-acting DNA element", role: "Where RNA polymerase binds. This promoter is weak without cAMP–CRP.", state: input.copies.map((c) => c.P === "+" ? "functional" : "defective").join("; "), mutation: "lacP⁻ stops transcription of the genes on the same DNA only (cis)." },
    { id: "operator", label: "Operator (lacO)", kind: "cis-acting DNA element", role: "The repressor's binding site, beside the promoter.", state: input.copies.map((c, i) => c.O === "c" ? "lacOᶜ (repressor cannot bind)" : ev.copies[i].repressorBound ? "occupied" : "free").join("; "), mutation: "lacOᶜ makes only the adjacent genes constitutive (cis): a wild-type operator on another molecule cannot compensate." },
    { id: "rnap", label: "RNA polymerase", kind: "enzyme/machine", role: "Transcribes lacZYA into one polycistronic mRNA.", state: ev.copies.map((c) => c.rnap).join("; "), mutation: "Not varied in this model." },
    { id: "lacZYA", label: "lacZ, lacY, lacA", kind: "gene encoding a trans-acting protein", role: "β-galactosidase (lacZ), lactose permease (lacY), transacetylase (lacA). One mRNA covers all three.", state: `transcription ${ev.transcription.label}`, mutation: "lacZ⁻ loses enzyme activity but not transcription; a working lacZ on another molecule supplies enzyme in trans." },
  ];
}

export interface LacMutation { id: string; label: string; set: Partial<LacCopy> }
export const LAC_MUTATIONS: LacMutation[] = [
  { id: "wt", label: "Wild type", set: { ...WILD_LAC } },
  { id: "I-", label: "lacI⁻ (no repressor)", set: { I: "-" } },
  { id: "Is", label: "lacIˢ (uninducible repressor)", set: { I: "s" } },
  { id: "Oc", label: "lacOᶜ (operator cannot bind repressor)", set: { O: "c" } },
  { id: "P-", label: "lacP⁻ (defective promoter)", set: { P: "-" } },
  { id: "Z-", label: "lacZ⁻ (no β-galactosidase)", set: { Z: "-" } },
];

/**
 * Cis or trans? A mutation is tested by placing it on one DNA molecule of a two-copy cell and watching the expression of a lacZ⁺
 * reporter on each molecule, under conditions where the mutation shows its effect. The verdict is derived from `evaluateLac`.
 */
export function lacCisTrans(kind: "I-" | "Is" | "Oc" | "P-"): { verdict: "cis" | "trans"; conditions: { lactose: boolean; glucose: boolean }; evidence: string[] } {
  const conditions = kind === "Is" || kind === "P-" ? { lactose: true, glucose: false } : { lactose: false, glucose: false };
  const mut: Partial<LacCopy> = kind === "I-" ? { I: "-" } : kind === "Is" ? { I: "s" } : kind === "Oc" ? { O: "c" } : { P: "-" };
  const base = { ...conditions, crp: "+" as const, step: 4 };
  const rank = (copies: LacCopy[], idx: number) => evaluateLac({ ...base, copies }).copies[idx].level.rank;
  // test A: the mutation and a lacZ⁺ reporter on the same molecule; the other molecule is wild type but lacZ⁻
  const haploidMutant = rank([{ ...WILD_LAC, ...mut }], 0);
  const withHelper = rank([{ ...WILD_LAC, ...mut }, { ...WILD_LAC, Z: "-" }], 0);
  // test B: the reporter on a wild-type molecule, the mutation on the other (lacZ⁻) molecule
  const haploidWild = rank([{ ...WILD_LAC }], 0);
  const wildWithMutant = rank([{ ...WILD_LAC }, { ...WILD_LAC, ...mut, Z: "-" }], 0);
  const trans = withHelper !== haploidMutant || wildWithMutant !== haploidWild;
  return {
    verdict: trans ? "trans" : "cis", conditions,
    evidence: [
      `Mutation with its reporter alone: ${LAC_LEVELS[haploidMutant].label}. Same molecule with a wild-type helper molecule present: ${LAC_LEVELS[withHelper].label}.`,
      `Wild-type reporter alone: ${LAC_LEVELS[haploidWild].label}. Beside a molecule carrying the mutation: ${LAC_LEVELS[wildWithMutant].label}.`,
    ],
  };
}

// =============================================================================================================================
// trp operon: repression and attenuation
// =============================================================================================================================

export type TrpLevel = "low" | "moderate" | "high";
export interface TrpInput {
  trp: TrpLevel;
  /** trpR repressor gene: "+" works, "-" is lost. */
  repressor: "+" | "-";
  /** Operator: "+" binds the trp repressor, "-" does not. */
  operator: "+" | "-";
  /** Leader AUG: "-" means no leader peptide is translated. */
  leaderStart: "+" | "-";
  /** The two Trp codons of the leader: "-" means they are replaced by non-Trp codons. */
  trpCodons: "+" | "-";
  /** The terminator (region 4): "-" means it is deleted. */
  attenuator: "+" | "-";
  step: number;
}
export const TRP_STEPS = 6; // steps 0..5
export const DEFAULT_TRP_INPUT: TrpInput = { trp: "high", repressor: "+", operator: "+", leaderStart: "+", trpCodons: "+", attenuator: "+", step: 0 };

/**
 * A SCHEMATIC trp leader, built so that the base pairing of the four regions can be checked rather than asserted. It is not the
 * nucleotide sequence of the E. coli trp leader (which is longer and whose regions overlap differently). What is faithful: the
 * leader peptide MKAIFVLKGWWRTS has two adjacent Trp codons, region 1 contains them, the stop codon lies just before region 2,
 * regions 1:2, 2:3 and 3:4 can pair, and region 4 is followed by a run of U (the intrinsic terminator).
 */
const UTR = "GAAUC"; // 5′ leader before AUG
const CODING = "AUGAAAGCAAUUUUCGUACUGAAAGGU" + "UGGUGGCGCACU" + "UCCUGA"; // M K A I F V L K G | W W R T | S stop
const R1 = "UGGUGGCGCACU";
const SP1 = "AA";
const R2 = "AGUGCG";
const SP2 = "GAU";
const R3 = "CGCACUCCUGGA";
const R4 = "UCCAGG" + "UUUUUUUU";
export const TRP_LEADER = UTR + CODING + SP1 + R2 + SP2 + R3 + R4;
export interface Region { id: 1 | 2 | 3 | 4; start: number; end: number; seq: string }
export const TRP_REGIONS: Region[] = (() => {
  const s1 = UTR.length + 27; // R1 begins at the first Trp codon (codon index 9)
  const s2 = s1 + R1.length + 6 + SP1.length;
  const s3 = s2 + R2.length + SP2.length;
  const s4 = s3 + R3.length;
  return [
    { id: 1, start: s1, end: s1 + R1.length, seq: R1 },
    { id: 2, start: s2, end: s2 + R2.length, seq: R2 },
    { id: 3, start: s3, end: s3 + R3.length, seq: R3 },
    { id: 4, start: s4, end: s4 + R4.length, seq: R4 },
  ];
})();
export const TRP_START = UTR.length; // index of the leader AUG
export const TRP_CODON_INDEX = { firstTrp: 9, stop: 14 } as const;
export const TRP_LEADER_PEPTIDE = (() => { const t = translateFrom(TRP_LEADER, TRP_START); return t.protein; })();

/** Length of the longest run of Watson–Crick pairs that regions a and b (each read 5′→3′) can form antiparallel. */
export function stemLength(a: string, b: string): number {
  const rc = reverseComplementRna(b);
  let best = 0;
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < rc.length; j += 1) {
    let k = 0;
    while (i + k < a.length && j + k < rc.length && a[i + k] === rc[j + k]) k += 1;
    if (k > best) best = k;
  }
  return best;
}
export const MIN_STEM = 5;
/** Which of the four regions can pair with which, from the sequence. */
export function possiblePairings(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 4; i += 1) for (let j = i + 1; j < 4; j += 1) if (stemLength(TRP_REGIONS[i].seq, TRP_REGIONS[j].seq) >= MIN_STEM) out.push(`${i + 1}:${j + 1}`);
  return out;
}

/** Regions a ribosome with the given codon in its A site covers (window: 6 nt behind to 12 nt ahead of the codon; at least half a region). */
export function ribosomeCovers(codonIndex: number): number[] {
  const a = TRP_START + 3 * codonIndex;
  const lo = a - 6, hi = a + 3 + 12;
  return TRP_REGIONS.filter((r) => (Math.min(hi, r.end) - Math.max(lo, r.start)) >= (r.end - r.start) / 2).map((r) => r.id);
}

/**
 * Folds the leader in the order the regions are made: when region j is transcribed it pairs with the nearest earlier region i
 * that can pair with it and that is free and not covered by the ribosome. `present` lists the regions that exist.
 */
export function foldLeader(covered: number[], present: number[] = [1, 2, 3, 4]): string[] {
  const pairs: string[] = [];
  const taken = new Set<number>();
  const can = new Set(possiblePairings());
  for (const j of present) {
    if (covered.includes(j)) continue;
    for (let i = j - 1; i >= 1; i -= 1) {
      if (!present.includes(i) || covered.includes(i) || taken.has(i) || taken.has(j)) continue;
      if (can.has(`${i}:${j}`)) { pairs.push(`${i}:${j}`); taken.add(i); taken.add(j); break; }
    }
  }
  return pairs;
}

export type TrpScenario = "no-ribosome" | "stalls" | "passes" | "mixed";
export interface TrpEval {
  operator: "bound" | "partly bound" | "free";
  /** Initiation: 0 blocked, 1 reduced, 2 open. */
  initiation: number;
  scenario: TrpScenario;
  /** Hairpins formed for each scenario that applies (two for "mixed"). */
  structures: Array<{ scenario: "no-ribosome" | "stalls" | "passes"; covered: number[]; pairs: string[]; terminates: boolean }>;
  /** Read-through: 0 terminated, 1 partial, 2 read through. */
  readthrough: number;
  level: Level;
  reasons: string[];
}
const TRP_LEVELS: Level[] = [
  { rank: 0, label: "Very low" }, { rank: 1, label: "Low" }, { rank: 2, label: "Intermediate" }, { rank: 3, label: "Moderately high" }, { rank: 4, label: "High" },
];

export function evaluateTrp(input: TrpInput): TrpEval {
  const operator: TrpEval["operator"] = input.repressor === "-" || input.operator === "-" ? "free" : input.trp === "high" ? "bound" : input.trp === "moderate" ? "partly bound" : "free";
  const initiation = operator === "bound" ? 0 : operator === "partly bound" ? 1 : 2;
  const present = input.attenuator === "-" ? [1, 2, 3] : [1, 2, 3, 4];
  const translating = input.leaderStart === "+";
  const stallsPossible = translating && input.trpCodons === "+";
  let scenario: TrpScenario;
  if (!translating) scenario = "no-ribosome";
  else if (!stallsPossible) scenario = "passes";
  else scenario = input.trp === "low" ? "stalls" : input.trp === "high" ? "passes" : "mixed";
  const mk = (sc: "no-ribosome" | "stalls" | "passes") => {
    const covered = sc === "no-ribosome" ? [] : sc === "stalls" ? ribosomeCovers(TRP_CODON_INDEX.firstTrp) : ribosomeCovers(TRP_CODON_INDEX.stop);
    const pairs = foldLeader(covered, present);
    return { scenario: sc, covered, pairs, terminates: pairs.includes("3:4") };
  };
  const structures = scenario === "mixed" ? [mk("stalls"), mk("passes")] : [mk(scenario)];
  const terminating = structures.filter((s) => s.terminates).length;
  const readthrough = terminating === structures.length ? 0 : terminating === 0 ? 2 : 1;
  const rank = initiation + readthrough;
  const level = TRP_LEVELS[rank];
  const reasons: string[] = [];
  if (input.repressor === "-") reasons.push("There is no working trp repressor, so the operator is never occupied (repression is lost, but attenuation still acts).");
  else if (input.operator === "-") reasons.push("The operator cannot bind the repressor (a cis effect), so repression is lost for this operon.");
  else if (input.trp === "high") reasons.push("Tryptophan is plentiful. It acts as a corepressor: it binds the inactive trp repressor and turns it into the active form, which binds the operator and blocks most initiation. Some initiation still leaks through.");
  else if (input.trp === "moderate") reasons.push("Tryptophan is at an intermediate level, so only part of the repressor is activated and the operator is only sometimes occupied.");
  else reasons.push("Tryptophan is scarce, so the repressor stays inactive (no corepressor), the operator is free and RNA polymerase initiates.");
  if (input.attenuator === "-") reasons.push("Region 4 is deleted, so the 3:4 terminator hairpin cannot form: transcription reads through whatever the ribosome does. Attenuation is lost.");
  else if (scenario === "no-ribosome") reasons.push("No leader peptide is made (the leader start codon is lost), so no ribosome covers the leader. Regions 1:2 pair, then 3 pairs with 4: the terminator forms and most transcripts stop.");
  else if (scenario === "passes" && !stallsPossible) reasons.push("The leader's two Trp codons are replaced, so the ribosome never has to wait for tryptophan. It follows the polymerase, covers region 2, and the 3:4 terminator forms whatever the tryptophan level.");
  else if (scenario === "passes") reasons.push("Tryptophan is plentiful, so charged tRNATrp is available and the ribosome translates the two Trp codons without pausing. At the stop codon it covers region 2, so 2:3 cannot form; region 3 pairs with 4 and the terminator stops transcription (attenuation).");
  else if (scenario === "stalls") reasons.push("Tryptophan is scarce, so charged tRNATrp is scarce and the ribosome stalls at the two Trp codons in region 1. Region 2 is free and pairs with region 3 (the antiterminator), so region 3 cannot pair with 4: no terminator, and transcription continues into the structural genes.");
  else reasons.push("Tryptophan is intermediate: some ribosomes stall at the Trp codons (antiterminator, read-through) and some do not (terminator). Part of the transcripts continue.");
  reasons.push("Repression and attenuation are separate controls: repression decides whether transcription starts; attenuation decides whether a started transcript is finished. Attenuation depends on translation of the leader, not on any protein binding DNA.");
  return { operator, initiation, scenario, structures, readthrough, level, reasons };
}

export function validateTrpInput(raw: unknown): { ok: true; value: TrpInput } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Not an object." };
  const r = raw as Record<string, unknown>;
  const pm = (v: unknown): v is "+" | "-" => v === "+" || v === "-";
  if (r.trp !== "low" && r.trp !== "moderate" && r.trp !== "high") return { ok: false, error: "Unknown tryptophan level." };
  if (![r.repressor, r.operator, r.leaderStart, r.trpCodons, r.attenuator].every(pm)) return { ok: false, error: "Unknown allele." };
  if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 0 || r.step >= TRP_STEPS) return { ok: false, error: "Step out of range." };
  return { ok: true, value: { trp: r.trp, repressor: r.repressor as "+" | "-", operator: r.operator as "+" | "-", leaderStart: r.leaderStart as "+" | "-", trpCodons: r.trpCodons as "+" | "-", attenuator: r.attenuator as "+" | "-", step: r.step } };
}

export interface TrpStepState {
  title: string;
  text: string;
  /** Leader nucleotides transcribed so far (0 = polymerase at the promoter). */
  rnapPos: number;
  rnapBlocked: boolean;
  ribosome: { codon: number | null; mode: "absent" | "translating" | "stalled" | "stopping" };
  hairpins: string[];
  /** Which scenario's structures are drawn (for "mixed" the second one is shown as a ghost). */
  drawn: TrpEval["structures"][number] | null;
  outcome: "pending" | "terminated" | "readthrough" | "mixed";
}

export function trpStep(input: TrpInput, step: number): TrpStepState {
  const ev = evaluateTrp(input);
  const first = ev.structures[0];
  const r = TRP_REGIONS;
  const base = { rnapBlocked: false, drawn: null as TrpStepState["drawn"], outcome: "pending" as TrpStepState["outcome"], hairpins: [] as string[] };
  const translating = ev.scenario !== "no-ribosome";
  const outcome: TrpStepState["outcome"] = ev.readthrough === 2 ? "readthrough" : ev.readthrough === 0 ? "terminated" : "mixed";
  const stalled = ev.scenario === "stalls" || ev.scenario === "mixed";
  switch (step) {
    case 0: return { ...base, title: "Operon at rest", text: ev.reasons[0], rnapPos: 0, ribosome: { codon: null, mode: "absent" } };
    case 1: return { ...base, title: "Initiation (repression)", text: ev.initiation === 0 ? "The active repressor holds the operator, so RNA polymerase is mostly blocked from starting. The rare transcripts that do start (leaks) still face attenuation in the next steps." : ev.initiation === 1 ? "The operator is only partly occupied, so initiation is reduced, not abolished." : "The operator is free: RNA polymerase binds the promoter and starts the leader transcript.", rnapPos: 0, rnapBlocked: ev.initiation === 0, ribosome: { codon: null, mode: "absent" }, drawn: null, outcome: "pending", hairpins: [] };
    case 2: return { ...base, title: "Leader made; ribosome joins", text: translating ? "Bacteria have no nucleus, so a ribosome can bind the leader's AUG as soon as it emerges and translate it while it is still being made (transcription–translation coupling). The polymerase pauses just after region 2." : "No ribosome binds the leader because its start codon is lost. Regions 1 and 2 pair as soon as region 2 is made; this pause hairpin holds the polymerase briefly.", rnapPos: r[1].end, ribosome: translating ? { codon: 0, mode: "translating" } : { codon: null, mode: "absent" }, hairpins: translating ? [] : ["1:2"] };
    case 3: return { ...base, title: "The ribosome reaches the Trp codons", text: ev.scenario === "stalls" ? "Charged tRNATrp is scarce, so the ribosome stalls on the two Trp codons, covering region 1." : ev.scenario === "mixed" ? "With intermediate tryptophan some ribosomes stall on the Trp codons and some read through; both fates are drawn." : ev.scenario === "passes" ? "The ribosome translates the Trp codons without delay and continues to the stop codon, which lies just before region 2." : "There is no ribosome to stall or to continue.", rnapPos: r[1].end, ribosome: ev.scenario === "no-ribosome" ? { codon: null, mode: "absent" } : stalled ? { codon: TRP_CODON_INDEX.firstTrp, mode: "stalled" } : { codon: TRP_CODON_INDEX.stop, mode: "stopping" }, hairpins: translating ? [] : ["1:2"] };
    case 4: return { ...base, title: "Regions 3 and 4 are made", text: `The polymerase resumes and regions 3 and 4 emerge. Pairs formed: ${first.pairs.length ? first.pairs.join(", ") : "none"}${ev.scenario === "mixed" ? ` (stalled ribosome) or ${ev.structures[1].pairs.join(", ") || "none"} (ribosome passed)` : ""}. ${first.terminates || ev.readthrough === 1 ? "The 3:4 hairpin followed by a run of U is an intrinsic terminator." : "No 3:4 terminator forms."}`, rnapPos: r[3].end + (input.attenuator === "+" ? 0 : -(R4.length)), ribosome: ev.scenario === "no-ribosome" ? { codon: null, mode: "absent" } : stalled ? { codon: TRP_CODON_INDEX.firstTrp, mode: "stalled" } : { codon: TRP_CODON_INDEX.stop, mode: "stopping" }, hairpins: first.pairs, drawn: first };
    default: return { ...base, title: "Outcome", text: outcome === "terminated" ? "The terminator forms: RNA polymerase stops and releases a short leader RNA. The structural genes (trpE–A) are not transcribed from this event." : outcome === "readthrough" ? "No terminator forms: RNA polymerase reads through into trpE–A and the tryptophan-synthesis enzymes are made." : "A mixture: part of the transcripts terminate and part read through.", rnapPos: outcome === "terminated" ? r[3].end : r[3].end + 6, ribosome: ev.scenario === "no-ribosome" ? { codon: null, mode: "absent" } : stalled ? { codon: TRP_CODON_INDEX.firstTrp, mode: "stalled" } : { codon: TRP_CODON_INDEX.stop, mode: "stopping" }, hairpins: first.pairs, drawn: first, outcome };
  }
}

export function trpComponents(input: TrpInput): ComponentInfo[] {
  const ev = evaluateTrp(input);
  return [
    { id: "trpR", label: "trpR gene / repressor", kind: "gene encoding a trans-acting protein", role: "The trp repressor is inactive alone; tryptophan (corepressor) activates it.", state: input.repressor === "-" ? "lost" : ev.operator === "bound" ? "active (tryptophan bound), on the operator" : ev.operator === "partly bound" ? "partly active" : "inactive (no tryptophan)", mutation: "Loss of the repressor removes repression everywhere it acts (trans); attenuation remains." },
    { id: "trp", label: "Tryptophan", kind: "small molecule", role: "Corepressor for the repressor and, as charged tRNATrp, the signal read by the ribosome in attenuation.", state: input.trp, mutation: "Not a mutation target." },
    { id: "operator", label: "Operator", kind: "cis-acting DNA element", role: "Binding site for the active repressor.", state: input.operator === "-" ? "mutated (no binding)" : ev.operator === "free" ? "free" : ev.operator, mutation: "An operator mutation acts only on the genes beside it (cis)." },
    { id: "promoter", label: "Promoter", kind: "cis-acting DNA element", role: "RNA polymerase binds here.", state: "functional", mutation: "Not varied in this model." },
    { id: "leader", label: "Leader peptide gene (trpL)", kind: "cis-acting DNA element", role: `Encodes the ${TRP_LEADER_PEPTIDE.length}-residue leader peptide ${TRP_LEADER_PEPTIDE} with two adjacent Trp codons. Its translation is what measures tryptophan supply.`, state: input.leaderStart === "-" ? "start codon lost" : input.trpCodons === "-" ? "Trp codons replaced" : "intact", mutation: "Mutations in the leader act in cis and change attenuation but not repression." },
    { id: "attenuator", label: "Attenuator (region 4 terminator)", kind: "cis-acting DNA element", role: "Region 4 and the following U run make the intrinsic terminator when it pairs with region 3.", state: input.attenuator === "-" ? "deleted" : ev.structures.some((s) => s.terminates) ? "forms a terminator (some or all)" : "not formed", mutation: "Deleting it removes attenuation (cis)." },
    { id: "ribosome", label: "Ribosome", kind: "enzyme/machine", role: "Translates the leader while the polymerase is still transcribing; its position decides which hairpin forms.", state: ev.scenario === "no-ribosome" ? "absent" : ev.scenario, mutation: "Not varied." },
  ];
}

// =============================================================================================================================
// eukaryotic regulation
// =============================================================================================================================

export interface EukInput {
  enhancer: "present" | "mutated" | "absent";
  enhancerOrientation: "forward" | "reverse";
  /** Distance of the enhancer from the promoter. */
  enhancerDistance: "near" | "far";
  silencer: "present" | "absent";
  promoter: "intact" | "TATA-mutated";
  /** Activator transcription factor present in this cell type (trans). */
  activator: boolean;
  repressor: boolean;
  mediator: boolean;
  /** Histone acetylation at the gene. */
  acetylation: boolean;
  /** DNA methylation of the promoter CpG island. */
  methylation: boolean;
  step: number;
}
export const EUK_STEPS = 5; // 0..4
export const DEFAULT_EUK_INPUT: EukInput = { enhancer: "present", enhancerOrientation: "forward", enhancerDistance: "near", silencer: "absent", promoter: "intact", activator: true, repressor: false, mediator: true, acetylation: true, methylation: false, step: 0 };

export interface EukEval {
  chromatin: "open" | "closed" | "conflicting";
  activatorBound: boolean | "uncertain";
  repressorBound: boolean | "uncertain";
  mediatorBridge: boolean | "uncertain";
  /** Pol II / general transcription factors recruited to the promoter. */
  polII: "strong" | "basal" | "no" | "uncertain";
  /** null when the model cannot say. */
  level: (Level & { uncertain?: false }) | { rank: null; label: string; uncertain: true };
  reasons: string[];
}
export const EUK_LEVELS: Level[] = [{ rank: 0, label: "Silent / repressed" }, { rank: 1, label: "Basal" }, { rank: 2, label: "High (activated)" }];

export function evaluateEuk(input: EukInput): EukEval {
  const reasons: string[] = [];
  const chromatin: EukEval["chromatin"] = input.acetylation && !input.methylation ? "open" : input.acetylation && input.methylation ? "conflicting" : "closed";
  if (chromatin === "open") reasons.push("Histones are acetylated and the promoter is unmethylated: chromatin is open, so transcription factors and Pol II can reach the DNA.");
  else if (chromatin === "closed") reasons.push(input.methylation ? "The promoter is methylated and histones are not acetylated: methylated CpG islands recruit proteins that deacetylate histones, packing the DNA into compact chromatin that factors cannot reach." : "Histones are not acetylated, so nucleosomes stay tightly packed and the DNA is not accessible to transcription factors (in this model; pioneer factors that open chromatin are not included).");
  else reasons.push("Histone acetylation (usually activating) and promoter DNA methylation (usually repressive) are both present. Their combination does not give a reliable prediction: it depends on the gene, the cell type and which comes first, so the outcome here is uncertain.");
  const reach = chromatin === "open" ? true : chromatin === "closed" ? false : "uncertain";
  const siteOk = input.enhancer === "present";
  const activatorBound: EukEval["activatorBound"] = !input.activator || !siteOk ? false : reach;
  if (!input.activator) reasons.push("The activator transcription factor is not made in this cell (a trans-acting change): nothing binds the enhancer, even though the enhancer DNA is intact.");
  else if (input.enhancer === "mutated") reasons.push("The enhancer's binding sites are mutated (a cis-acting change): the activator, although present, cannot bind this copy of the gene.");
  else if (input.enhancer === "absent") reasons.push("There is no enhancer on this gene, so there is nothing for the activator to bind.");
  else reasons.push(`The enhancer works in either orientation${input.enhancerDistance === "far" ? " and from a distance, because the DNA can loop, though far enhancers are weaker and can be blocked by insulators (not modelled)" : ""}, so its orientation (${input.enhancerOrientation}) and distance (${input.enhancerDistance}) do not change the result here.`);
  const repressorBound: EukEval["repressorBound"] = !input.repressor || input.silencer !== "present" ? false : reach;
  if (input.silencer === "present") reasons.push(input.repressor ? "A repressor factor is present and the silencer is intact: it binds and recruits co-repressors (such as histone deacetylases) that reduce transcription." : "A silencer is present but the repressor factor is absent in this cell, so the silencer is unoccupied and has no effect.");
  const bridge: EukEval["mediatorBridge"] = activatorBound === false ? false : !input.mediator ? false : activatorBound;
  if (activatorBound !== false) reasons.push(input.mediator ? "Mediator can bridge the enhancer-bound activator to the promoter-bound general transcription factors and Pol II (the DNA loops)." : "Mediator is not available, so the activator cannot be linked to the core machinery: no activation.");
  const tata = input.promoter === "intact";
  if (!tata) reasons.push("The TATA box is mutated, so TFIID cannot recognise it. In this model the promoter depends on its TATA box, so assembly is poor; real promoters without a TATA box can use other core elements, so this is model-specific.");
  let level: EukEval["level"];
  let polII: EukEval["polII"];
  if (chromatin === "closed") { level = EUK_LEVELS[0]; polII = "no"; }
  else if (chromatin === "conflicting") { level = { rank: null, label: "Uncertain (conflicting chromatin marks)", uncertain: true }; polII = "uncertain"; }
  else if (!tata) { level = EUK_LEVELS[0]; polII = "no"; }
  else {
    const up = bridge === true; const down = repressorBound === true;
    if (up && down) { level = { rank: null, label: "Uncertain (activator and repressor compete)", uncertain: true }; polII = "uncertain"; reasons.push("An activator and a repressor are both bound. Which wins depends on their relative strength, the distance of each site and other cofactors: this model does not decide."); }
    else if (up) { level = EUK_LEVELS[2]; polII = "strong"; }
    else if (down) { level = EUK_LEVELS[0]; polII = "no"; }
    else { level = EUK_LEVELS[1]; polII = "basal"; }
  }
  return { chromatin, activatorBound, repressorBound, mediatorBridge: bridge, polII, level, reasons };
}

export function validateEukInput(raw: unknown): { ok: true; value: EukInput } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Not an object." };
  const r = raw as Record<string, unknown>;
  const oneOf = (v: unknown, xs: string[]) => typeof v === "string" && xs.includes(v);
  if (!oneOf(r.enhancer, ["present", "mutated", "absent"]) || !oneOf(r.enhancerOrientation, ["forward", "reverse"]) || !oneOf(r.enhancerDistance, ["near", "far"]) || !oneOf(r.silencer, ["present", "absent"]) || !oneOf(r.promoter, ["intact", "TATA-mutated"])) return { ok: false, error: "Unknown element state." };
  if (![r.activator, r.repressor, r.mediator, r.acetylation, r.methylation].every((v) => typeof v === "boolean")) return { ok: false, error: "Factors and marks must be on or off." };
  if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 0 || r.step >= EUK_STEPS) return { ok: false, error: "Step out of range." };
  return { ok: true, value: { enhancer: r.enhancer as EukInput["enhancer"], enhancerOrientation: r.enhancerOrientation as EukInput["enhancerOrientation"], enhancerDistance: r.enhancerDistance as EukInput["enhancerDistance"], silencer: r.silencer as EukInput["silencer"], promoter: r.promoter as EukInput["promoter"], activator: r.activator as boolean, repressor: r.repressor as boolean, mediator: r.mediator as boolean, acetylation: r.acetylation as boolean, methylation: r.methylation as boolean, step: r.step } };
}

export function eukStepCaption(input: EukInput, step: number): { title: string; text: string } {
  const ev = evaluateEuk(input);
  switch (step) {
    case 0: return { title: "Chromatin state", text: ev.reasons[0] };
    case 1: return { title: "Transcription factors bind", text: `Activator at the enhancer: ${ev.activatorBound === "uncertain" ? "uncertain" : ev.activatorBound ? "bound" : "not bound"}. Repressor at the silencer: ${ev.repressorBound === "uncertain" ? "uncertain" : ev.repressorBound ? "bound" : input.silencer === "present" ? "not bound" : "no silencer"}. ${ev.reasons.filter((_, i) => i >= 1).slice(0, 2).join(" ")}` };
    case 2: return { title: "Mediator and coactivators", text: ev.mediatorBridge === true ? "Mediator links the enhancer-bound activator to the promoter; the DNA loops. Coactivators (histone acetyltransferases) can further acetylate nearby histones." : ev.mediatorBridge === "uncertain" ? "Whether the activator can be bridged to the promoter is uncertain here." : "No bridge forms: either no activator is bound or Mediator is unavailable." };
    case 3: return { title: "Pol II recruitment", text: ev.polII === "strong" ? "General transcription factors assemble on the promoter and RNA polymerase II is recruited efficiently." : ev.polII === "basal" ? "General transcription factors and Pol II assemble at the promoter at a basal level, without activation." : ev.polII === "uncertain" ? "The model cannot say whether Pol II is recruited under these conflicting signals." : "Pol II is not recruited." };
    default: return { title: "Outcome", text: `Predicted transcription: ${ev.level.label}. This is a qualitative, context-dependent prediction for this declared set of elements only.` };
  }
}

export function eukComponents(input: EukInput): ComponentInfo[] {
  const ev = evaluateEuk(input);
  const b = (v: boolean | "uncertain") => (v === "uncertain" ? "uncertain" : v ? "bound" : "not bound");
  return [
    { id: "enhancer", label: "Enhancer", kind: "cis-acting DNA element", role: "A DNA element with activator binding sites; works in either orientation and at a distance.", state: input.enhancer === "present" ? `present (${input.enhancerOrientation}, ${input.enhancerDistance})` : input.enhancer, mutation: "A change in its sites affects only the gene it controls on that chromosome (cis)." },
    { id: "silencer", label: "Silencer", kind: "cis-acting DNA element", role: "A DNA element with repressor binding sites.", state: input.silencer, mutation: "Cis-acting." },
    { id: "promoter", label: "Core promoter (TATA)", kind: "cis-acting DNA element", role: "Where TFIID and the general transcription factors assemble Pol II.", state: input.promoter, mutation: "A promoter change acts in cis." },
    { id: "activator", label: "Activator (transcription factor)", kind: "trans-acting protein", role: "Binds the enhancer and recruits coactivators and Mediator.", state: input.activator ? b(ev.activatorBound) : "not made in this cell", mutation: "Loss affects every gene that depends on it (trans)." },
    { id: "repressor", label: "Repressor (transcription factor)", kind: "trans-acting protein", role: "Binds the silencer and recruits corepressors.", state: input.repressor ? b(ev.repressorBound) : "not made in this cell", mutation: "Trans-acting." },
    { id: "mediator", label: "Mediator", kind: "trans-acting protein", role: "A large complex that bridges activators and the general transcription factors/Pol II.", state: input.mediator ? b(ev.mediatorBridge) : "unavailable", mutation: "Trans-acting." },
    { id: "polII", label: "RNA polymerase II", kind: "enzyme/machine", role: "Transcribes the gene once recruited to an accessible promoter.", state: ev.polII, mutation: "Not varied." },
    { id: "histones", label: "Histone acetylation", kind: "enzyme/machine", role: "Acetyl groups on histone tails loosen nucleosomes (written by HATs, removed by HDACs).", state: input.acetylation ? "acetylated" : "not acetylated", mutation: "An epigenetic mark: reversible, and not a change to the DNA sequence." },
    { id: "methyl", label: "Promoter DNA methylation", kind: "enzyme/machine", role: "Methylated CpG islands at promoters are usually associated with silencing, but the effect is context dependent.", state: input.methylation ? "methylated" : "unmethylated", mutation: "An epigenetic mark: it does not change the DNA sequence." },
  ];
}

// =============================================================================================================================
// uniform view used by Challenge and persistence
// =============================================================================================================================

export type RegSystem = "lac" | "trp" | "euk";
export interface RegChange<I> { id: string; label: string; next: I }

/** Ordinal comparison of two states: "increases", "decreases", "same", or "uncertain" when either state is undecided. */
export function compareRanks(before: number | null, after: number | null): "increases" | "decreases" | "same" | "uncertain" {
  if (before === null || after === null) return "uncertain";
  return after > before ? "increases" : after < before ? "decreases" : "same";
}
export const lacRank = (i: LacInput) => evaluateLac(i).transcription.rank;
export const trpRank = (i: TrpInput) => evaluateTrp(i).level.rank;
export const eukRank = (i: EukInput): number | null => evaluateEuk(i).level.rank;

export function lacChanges(i: LacInput): Array<RegChange<LacInput>> {
  const out: Array<RegChange<LacInput>> = [];
  out.push({ id: "lactose", label: i.lactose ? "Remove lactose" : "Add lactose", next: { ...i, lactose: !i.lactose } });
  out.push({ id: "glucose", label: i.glucose ? "Remove glucose" : "Add glucose", next: { ...i, glucose: !i.glucose } });
  if (i.copies[0].I !== "-") out.push({ id: "I-", label: "Delete the repressor gene (lacI⁻) on the chromosome", next: { ...i, copies: [{ ...i.copies[0], I: "-" }, ...i.copies.slice(1)] } });
  if (i.copies[0].O === "+") out.push({ id: "Oc", label: "Mutate the operator (lacOᶜ) on the chromosome", next: { ...i, copies: [{ ...i.copies[0], O: "c" }, ...i.copies.slice(1)] } });
  if (i.copies[0].P === "+") out.push({ id: "P-", label: "Disable the promoter (lacP⁻) on the chromosome", next: { ...i, copies: [{ ...i.copies[0], P: "-" }, ...i.copies.slice(1)] } });
  if (i.copies[0].I === "+") out.push({ id: "Is", label: "Make the repressor uninducible (lacIˢ)", next: { ...i, copies: [{ ...i.copies[0], I: "s" }, ...i.copies.slice(1)] } });
  if (i.crp === "+") out.push({ id: "crp-", label: "Break the cAMP–CRP system (cya⁻/crp⁻)", next: { ...i, crp: "-" } });
  if (i.copies.length === 1) out.push({ id: "F+", label: "Add a wild-type F′ plasmid copy of the operon", next: { ...i, copies: [i.copies[0], { ...WILD_LAC }] } });
  return out.map((c) => ({ ...c, next: { ...c.next, step: 4 } }));
}
export function trpChanges(i: TrpInput): Array<RegChange<TrpInput>> {
  const out: Array<RegChange<TrpInput>> = [];
  if (i.trp !== "low") out.push({ id: "trp-low", label: "Starve the cell of tryptophan", next: { ...i, trp: "low" } });
  if (i.trp !== "high") out.push({ id: "trp-high", label: "Give the cell plenty of tryptophan", next: { ...i, trp: "high" } });
  if (i.repressor === "+") out.push({ id: "trpR-", label: "Delete the repressor gene (trpR⁻)", next: { ...i, repressor: "-" } });
  if (i.operator === "+") out.push({ id: "trpO-", label: "Mutate the operator so the repressor cannot bind", next: { ...i, operator: "-" } });
  if (i.attenuator === "+") out.push({ id: "att-", label: "Delete the attenuator (region 4)", next: { ...i, attenuator: "-" } });
  if (i.leaderStart === "+") out.push({ id: "start-", label: "Remove the leader's start codon", next: { ...i, leaderStart: "-" } });
  if (i.trpCodons === "+") out.push({ id: "codons-", label: "Replace the leader's two Trp codons with non-Trp codons", next: { ...i, trpCodons: "-" } });
  return out.map((c) => ({ ...c, next: { ...c.next, step: 5 } }));
}
export function eukChanges(i: EukInput): Array<RegChange<EukInput>> {
  const out: Array<RegChange<EukInput>> = [];
  out.push({ id: "ac", label: i.acetylation ? "Remove histone acetylation" : "Add histone acetylation", next: { ...i, acetylation: !i.acetylation } });
  out.push({ id: "me", label: i.methylation ? "Remove promoter DNA methylation" : "Methylate the promoter", next: { ...i, methylation: !i.methylation } });
  out.push({ id: "act", label: i.activator ? "Lose the activator factor (trans)" : "Express the activator factor", next: { ...i, activator: !i.activator } });
  out.push({ id: "enh", label: i.enhancer === "present" ? "Mutate the enhancer's binding sites (cis)" : "Restore the enhancer", next: { ...i, enhancer: i.enhancer === "present" ? "mutated" : "present" } });
  out.push({ id: "orient", label: "Flip the enhancer's orientation", next: { ...i, enhancerOrientation: i.enhancerOrientation === "forward" ? "reverse" : "forward" } });
  out.push({ id: "silencer", label: i.silencer === "present" ? "Remove the silencer" : "Add a silencer", next: { ...i, silencer: i.silencer === "present" ? "absent" : "present" } });
  out.push({ id: "rep", label: i.repressor ? "Lose the repressor factor" : "Express the repressor factor", next: { ...i, repressor: !i.repressor } });
  out.push({ id: "med", label: i.mediator ? "Remove Mediator" : "Restore Mediator", next: { ...i, mediator: !i.mediator } });
  out.push({ id: "tata", label: i.promoter === "intact" ? "Mutate the TATA box" : "Repair the TATA box", next: { ...i, promoter: i.promoter === "intact" ? "TATA-mutated" : "intact" } });
  return out.map((c) => ({ ...c, next: { ...c.next, step: 4 } }));
}
