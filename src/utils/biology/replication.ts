/**
 * DNA replication at ONE replication fork (pure; no React). A short parental duplex is unwound from one edge by a helicase while
 * the two new strands are made 5′→3′ only, which is why one is continuous (leading) and the other discontinuous (lagging).
 *
 * Conventions: the parental TOP strand is written 5′→3′ from left to right; the BOTTOM strand is its complement, so it reads 3′→5′
 * from left to right. A new strand is antiparallel to its template and can only be extended at its 3′ end. `u` is the distance
 * from the edge where the fork started (u = 0 is the first base pair opened); `p` is the column (left to right).
 *
 * Deliberate simplifications (stated in the tool): one fork rather than the two forks of a bidirectional origin; one leading and
 * one lagging polymerase at one nucleotide per step; Okazaki fragments and RNA primers are a few nucleotides long instead of
 * 100-200 (eukaryotes) or 1000-2000 (bacteria); proofreading, mismatch repair, supercoiling and the replisome's real stoichiometry
 * are not modelled. The two RNA primers at the edges (leading primer, last Okazaki primer) are left in place, because in a real
 * chromosome the neighbouring replication unit or telomere biology deals with them.
 */
import { complementDna, hydrogenBonds } from "./sequence";

export type Organism = "bacteria" | "eukaryote";
export type ForkDirection = "right" | "left";

export interface ReplicationInput {
  /** Parental TOP strand, 5′→3′ left to right (DNA). */
  template: string;
  direction: ForkDirection;
  /** Okazaki fragment length on the lagging template, in nucleotides (including its RNA primer). */
  okazakiLength: number;
  primerLength: number;
  organism: Organism;
}

export const REPLICATION_LIMITS = { minLen: 8, maxLen: 40, minPrimer: 2, maxPrimer: 6, minOkazaki: 5, maxOkazaki: 20 } as const;

export const DEFAULT_REPLICATION_INPUT: ReplicationInput = {
  template: "ATGCGTACCGGATTCAGCTAGCATCGGATACC",
  direction: "right",
  okazakiLength: 8,
  primerLength: 3,
  organism: "bacteria",
};

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function validateReplicationInput(raw: unknown): Validation<ReplicationInput> {
  const errors: string[] = [];
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const L = REPLICATION_LIMITS;
  const template = typeof r.template === "string" ? r.template : "";
  if (!/^[ACGT]+$/.test(template)) errors.push("The template strand must contain only A, C, G and T.");
  else if (template.length < L.minLen || template.length > L.maxLen) errors.push(`The template must be ${L.minLen}–${L.maxLen} bases (found ${template.length}).`);
  if (r.direction !== "right" && r.direction !== "left") errors.push("The fork direction must be right or left.");
  if (r.organism !== "bacteria" && r.organism !== "eukaryote") errors.push("The organism must be bacteria or eukaryote.");
  const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
  if (!int(r.primerLength) || r.primerLength < L.minPrimer || r.primerLength > L.maxPrimer) errors.push(`The RNA primer length must be a whole number from ${L.minPrimer} to ${L.maxPrimer}.`);
  if (!int(r.okazakiLength) || r.okazakiLength < L.minOkazaki || r.okazakiLength > L.maxOkazaki) errors.push(`The Okazaki fragment length must be a whole number from ${L.minOkazaki} to ${L.maxOkazaki}.`);
  else if (int(r.primerLength) && r.okazakiLength < r.primerLength + 2) errors.push("An Okazaki fragment must be at least 2 nucleotides longer than its RNA primer.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { template, direction: r.direction as ForkDirection, okazakiLength: r.okazakiLength as number, primerLength: r.primerLength as number, organism: r.organism as Organism } };
}

export interface EnzymeNames { helicase: string; primase: string; leadingPol: string; laggingPol: string; clamp: string; ssb: string; topo: string; primerRemoval: string; gapFiller: string; ligase: string }
export const ENZYMES: Record<Organism, EnzymeNames> = {
  bacteria: { helicase: "DnaB helicase", primase: "DnaG primase", leadingPol: "DNA polymerase III", laggingPol: "DNA polymerase III", clamp: "β sliding clamp", ssb: "SSB", topo: "DNA gyrase (topoisomerase II)", primerRemoval: "DNA polymerase I (5′→3′ exonuclease)", gapFiller: "DNA polymerase I", ligase: "DNA ligase" },
  eukaryote: { helicase: "CMG helicase (MCM2–7)", primase: "Pol α–primase", leadingPol: "DNA polymerase ε", laggingPol: "DNA polymerase δ", clamp: "PCNA clamp", ssb: "RPA", topo: "topoisomerase", primerRemoval: "RNase H2 / FEN1", gapFiller: "DNA polymerase δ", ligase: "DNA ligase I" },
};

/** What occupies a position of a new strand. */
export type Cell = 0 | 1 | 2; // none | RNA primer | DNA

export type ActionKind = "unwind" | "leadPrimer" | "leadExtend" | "lagPrimer" | "lagExtend" | "removePrimer" | "fillGap" | "ligate";
export interface Action { kind: ActionKind; strand: "leading" | "lagging" | "parental"; /** Distance from the fork's starting edge. */ u: number; text: string }

export interface Fragment { index: number; /** u range a..b (a ≤ b); the primer sits at the b end (the fragment's 5′ end). */ a: number; b: number; primed: boolean; /** Next u to fill (counting down); a − 1 when finished. */ next: number; done: boolean }
export interface Junction { index: number; stage: "waiting" | "removed" | "filled" | "sealed"; fillNext: number }

export interface Snapshot {
  step: number;
  /** Base pairs opened (u < unwound). */
  unwound: number;
  lead: Cell[];
  lag: Cell[];
  fragments: Fragment[];
  junctions: Junction[];
  actions: Action[];
  caption: string;
}

export interface ReplicationModel {
  input: ReplicationInput;
  length: number;
  top: string;
  bottom: string;
  /** Which parental strand the leading daughter is built on. */
  leadingTemplate: "top" | "bottom";
  laggingTemplate: "top" | "bottom";
  fragments: Array<{ index: number; a: number; b: number }>;
  steps: Snapshot[];
  /** Final daughter strands, 5′→3′ written, and the column order they occupy. */
  finalLeading: string;
  finalLagging: string;
}

export const toColumn = (u: number, length: number, direction: ForkDirection) => (direction === "right" ? u : length - 1 - u);

/** Fork roles from first principles: the polymerase reads the template 3′→5′, so a daughter extended toward the fork is continuous. */
export function forkRoles(direction: ForkDirection) {
  const leadingTemplate: "top" | "bottom" = direction === "right" ? "bottom" : "top";
  const laggingTemplate: "top" | "bottom" = leadingTemplate === "top" ? "bottom" : "top";
  const reading = (t: "top" | "bottom") => (t === "top" ? "5′→3′" : "3′→5′");
  return {
    leadingTemplate,
    laggingTemplate,
    why: `The fork moves ${direction}. The ${leadingTemplate} parental strand runs ${reading(leadingTemplate)} left to right, so a polymerase following the fork ${direction} reads it 3′→5′ and builds the new strand 5′→3′ continuously. The ${laggingTemplate} strand runs the other way, so its new strand can only be built away from the fork, in pieces.`,
  };
}

/** Where along the columns a daughter strand has its 5′ end: a new strand is antiparallel to its template. */
export const daughterFivePrimeSide = (template: "top" | "bottom"): "left" | "right" => (template === "top" ? "right" : "left");

export function buildReplication(input: ReplicationInput): ReplicationModel {
  const N = input.template.length;
  const P = input.primerLength;
  const L = input.okazakiLength;
  const top = input.template;
  const bottom = complementDna(top);
  const { leadingTemplate, laggingTemplate } = forkRoles(input.direction);
  const col = (u: number) => toColumn(u, N, input.direction);
  const enz = ENZYMES[input.organism];

  const K = Math.max(1, Math.floor(N / L));
  const frags: Fragment[] = [];
  for (let k = 0; k < K; k += 1) {
    const a = k * L;
    const b = k === K - 1 ? N - 1 : (k + 1) * L - 1;
    frags.push({ index: k, a, b, primed: false, next: b - P, done: false });
  }
  const junctions: Junction[] = [];
  for (let j = 0; j < K - 1; j += 1) junctions.push({ index: j, stage: "waiting", fillNext: frags[j].b });

  let unwound = 0;
  const lead: Cell[] = new Array(N).fill(0);
  const lag: Cell[] = new Array(N).fill(0);
  let leadPrimed = false;
  let leadEnd = 0;
  let repair = 0; // junction currently handled by the single repair team
  const steps: Snapshot[] = [];
  const clone = (): Pick<Snapshot, "lead" | "lag" | "fragments" | "junctions"> => ({
    lead: [...lead], lag: [...lag], fragments: frags.map((f) => ({ ...f })), junctions: junctions.map((j) => ({ ...j })),
  });
  const base = (strand: "leading" | "lagging", u: number) => {
    // new strand base at column p is the complement of its template's base there
    const tmpl = strand === "leading" ? leadingTemplate : laggingTemplate;
    const tb = (tmpl === "top" ? top : bottom)[col(u)];
    return complementDna(tb);
  };
  steps.push({ step: 0, unwound: 0, ...clone(), actions: [], caption: `The parental duplex is intact. The ${enz.helicase} will open it from the ${input.direction === "right" ? "left" : "right"} edge and move ${input.direction}.` });

  for (let guard = 0; guard < 2000; guard += 1) {
    const prevF = unwound;
    const prevDone = frags.map((f) => f.done);
    const prevPrimed = frags.map((f) => f.primed);
    const actions: Action[] = [];

    // 1. helicase
    if (unwound < N) {
      const u = unwound;
      const tb = top[col(u)];
      unwound += 1;
      actions.push({ kind: "unwind", strand: "parental", u, text: `${enz.helicase} opens base pair ${u + 1} (${tb}–${complementDna(tb)}, ${hydrogenBonds(tb)} hydrogen bonds); ${enz.topo} relieves the supercoiling ahead of the fork` });
    }
    // 2. leading strand
    if (!leadPrimed && prevF >= P) {
      leadPrimed = true;
      for (let u = 0; u < P; u += 1) lead[u] = 1;
      leadEnd = P;
      actions.push({ kind: "leadPrimer", strand: "leading", u: 0, text: `${enz.primase} makes one RNA primer (${P} nt, 5′→3′) on the leading template` });
    } else if (leadPrimed && leadEnd < prevF) {
      const u = leadEnd;
      lead[u] = 2;
      leadEnd += 1;
      actions.push({ kind: "leadExtend", strand: "leading", u, text: `${enz.leadingPol} extends the leading strand continuously toward the fork: adds ${base("leading", u)} opposite ${complementDna(base("leading", u))} (3′ end)` });
    }
    // 3a. lagging polymerase extends the lowest primed, unfinished fragment
    const active = frags.find((f, i) => prevPrimed[i] && !f.done);
    if (active) {
      const u = active.next;
      lag[u] = 2;
      active.next -= 1;
      if (active.next < active.a) active.done = true;
      actions.push({ kind: "lagExtend", strand: "lagging", u, text: `${enz.laggingPol} extends Okazaki fragment ${active.index + 1} away from the fork: adds ${base("lagging", u)} at its 3′ end${active.done ? " (fragment complete)" : ""}` });
    }
    // 3b. primase primes the next fragment once all its template is single-stranded
    const toPrime = frags.find((f, i) => !prevPrimed[i] && prevF >= f.b + 1);
    if (toPrime) {
      toPrime.primed = true;
      for (let u = toPrime.b - P + 1; u <= toPrime.b; u += 1) lag[u] = 1;
      actions.push({ kind: "lagPrimer", strand: "lagging", u: toPrime.b, text: `${enz.primase} lays an RNA primer for Okazaki fragment ${toPrime.index + 1} at the 5′ end of its future site (${P} nt)` });
    }
    // 4. repair team: remove primer, fill the gap, seal the nick (one junction at a time)
    if (repair < junctions.length) {
      const j = junctions[repair];
      if (j.stage === "waiting" && prevDone[repair] && prevDone[repair + 1]) {
        for (let u = frags[repair].b - P + 1; u <= frags[repair].b; u += 1) lag[u] = 0;
        j.stage = "removed";
        actions.push({ kind: "removePrimer", strand: "lagging", u: frags[repair].b, text: `${enz.primerRemoval} removes the RNA primer of fragment ${repair + 1}, leaving a gap` });
      } else if (j.stage === "removed") {
        const u = j.fillNext;
        lag[u] = 2;
        j.fillNext -= 1;
        if (j.fillNext < frags[repair].b - P + 1) j.stage = "filled";
        actions.push({ kind: "fillGap", strand: "lagging", u, text: `${enz.gapFiller} fills the gap with DNA by extending fragment ${repair + 2}'s 3′ end` });
      } else if (j.stage === "filled") {
        j.stage = "sealed";
        actions.push({ kind: "ligate", strand: "lagging", u: frags[repair].b - P, text: `${enz.ligase} seals the nick between fragments ${repair + 1} and ${repair + 2} (joins 3′-OH to 5′ phosphate, using ${input.organism === "bacteria" ? "NAD⁺" : "ATP"})` });
        repair += 1;
      }
    }
    if (!actions.length) break;
    const caption = actions.map((a) => a.text).join(". ") + ".";
    steps.push({ step: steps.length, unwound, ...clone(), actions, caption });
  }

  const readFive3 = (strand: "leading" | "lagging") => {
    // columns left→right; a strand whose 5′ end is on the right is written right→left
    const tmpl = strand === "leading" ? leadingTemplate : laggingTemplate;
    const colsBase: string[] = new Array(N);
    for (let u = 0; u < N; u += 1) colsBase[col(u)] = base(strand, u);
    const ltr = colsBase.join("");
    return daughterFivePrimeSide(tmpl) === "left" ? ltr : [...ltr].reverse().join("");
  };
  return {
    input, length: N, top, bottom, leadingTemplate, laggingTemplate,
    fragments: frags.map(({ index, a, b }) => ({ index, a, b })),
    steps,
    finalLeading: readFive3("leading"),
    finalLagging: readFive3("lagging"),
  };
}

export function snapshotAt(model: ReplicationModel, step: number): Snapshot {
  return model.steps[Math.max(0, Math.min(model.steps.length - 1, Math.round(step)))];
}

/** A short plain-language state description used by quizzes and the status line. */
export function describeState(model: ReplicationModel, s: Snapshot): string {
  if (s.step === 0) return "Nothing is unwound yet.";
  const done = s.fragments.filter((f) => f.done).length;
  const sealed = s.junctions.filter((j) => j.stage === "sealed").length;
  return `${s.unwound} of ${model.length} base pairs open; leading strand ${s.lead.filter((c) => c).length} nt; ${done} of ${s.fragments.length} Okazaki fragments complete; ${sealed} of ${s.junctions.length} junctions sealed.`;
}

/** RNA primers still present in a snapshot: the leading primer (once laid) plus every Okazaki primer that has not been removed. */
export function primerCount(snap: Snapshot, primerLength: number): number {
  const lead = snap.lead.some((c) => c === 1) ? 1 : 0;
  const lag = snap.fragments.filter((f) => f.primed && snap.lag.slice(f.b - primerLength + 1, f.b + 1).every((c) => c === 1)).length;
  return lead + lag;
}
