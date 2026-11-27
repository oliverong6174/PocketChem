/**
 * Mitosis and meiosis process engine (pure; no React). Every cell, chromosome and chromatid the diagrams draw comes from here.
 *
 * The chromosomes are the SAME objects as the Genetics tool's (see chromosome.ts): a diploid individual with 1–2 chromosome
 * pairs, one maternal and one paternal homolog each, and 1–2 loci per pair. The model is deliberately small (2n = 2 or 4).
 *
 * Definitions used throughout (and shown to the learner):
 *   chromosome number = number of centromeres in the cell;
 *   chromatids        = number of DNA double helices (a replicated chromosome has two sister chromatids);
 *   DNA content (C)   = chromatids ÷ (haploid chromosome number n), so an unreplicated diploid G1 cell is 2C, a cell after S
 *                       phase is 4C, and a normal gamete is 1C. Chromosome number and DNA content are different things:
 *                       S phase doubles DNA but not chromosome number; anaphase doubles chromosome number but not DNA.
 *
 * Meiosis is a single illustrated event: the crossover, the orientations at metaphase I and II and any nondisjunction are
 * SETTINGS chosen by the learner. One run is not a population: use `meiosisDistribution` (or the Genetics tool) for the expected
 * frequencies, which average over all equally likely settings.
 */
import {
  LAYOUTS, chromatidOf, exchange, isY, type Chromatid, type Individual, type Origin,
} from "./chromosome";
import { FR_ONE, FR_ZERO, fr, frAdd, frMul, type Fr } from "./genetics";

export type Pole = 0 | 1;
export type NdSpec =
  | { kind: "none" }
  | { kind: "I"; pair: number; pole: Pole }
  | { kind: "II"; pair: number; cell: 0 | 1; pole: Pole };

export interface Crossover { between: number; m: 0 | 1; p: 0 | 1 }
export interface MeiosisSettings {
  /** One optional single crossover per chromosome pair (between maternal chromatid m and paternal chromatid p, after locus `between`). */
  crossover: Array<Crossover | null>;
  /** Metaphase I: which homolog (0 = maternal, 1 = paternal) of each pair faces pole 0. */
  orient1: Pole[];
  /** Metaphase II: for each of the two cells and each pair, which sister chromatid (index) goes to pole 0. */
  orient2: [Pole[], Pole[]];
  nd: NdSpec;
}

export const defaultMeiosisSettings = (ind: Individual): MeiosisSettings => {
  const n = ind.pairs.length;
  return { crossover: Array(n).fill(null), orient1: Array(n).fill(0), orient2: [Array(n).fill(0), Array(n).fill(0)], nd: { kind: "none" } };
};

export function validateMeiosisSettings(ind: Individual, raw: unknown): MeiosisSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const n = ind.pairs.length;
  const bit = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
  if (!Array.isArray(r.crossover) || r.crossover.length !== n || !Array.isArray(r.orient1) || r.orient1.length !== n || !r.orient1.every(bit)) return null;
  if (!Array.isArray(r.orient2) || r.orient2.length !== 2) return null;
  const o2 = r.orient2 as unknown[];
  if (!o2.every((x) => Array.isArray(x) && x.length === n && x.every(bit))) return null;
  const crossover: Array<Crossover | null> = [];
  for (let p = 0; p < n; p += 1) {
    const c = r.crossover[p] as Record<string, unknown> | null;
    if (c === null) { crossover.push(null); continue; }
    if (typeof c !== "object" || !bit(c.m) || !bit(c.p) || typeof c.between !== "number" || !Number.isInteger(c.between)) return null;
    if (ind.pairs[p].a.alleles.length < 2 || c.between < 0 || c.between > ind.pairs[p].a.alleles.length - 2) return null;
    crossover.push({ between: c.between, m: c.m, p: c.p });
  }
  const nd = r.nd as Record<string, unknown> | undefined;
  let ndSpec: NdSpec;
  if (!nd || nd.kind === "none") ndSpec = { kind: "none" };
  else if (nd.kind === "I" && bit(nd.pole) && typeof nd.pair === "number" && Number.isInteger(nd.pair) && nd.pair >= 0 && nd.pair < n) ndSpec = { kind: "I", pair: nd.pair, pole: nd.pole };
  else if (nd.kind === "II" && bit(nd.pole) && bit(nd.cell) && typeof nd.pair === "number" && Number.isInteger(nd.pair) && nd.pair >= 0 && nd.pair < n) ndSpec = { kind: "II", pair: nd.pair, cell: nd.cell, pole: nd.pole };
  else return null;
  return { crossover, orient1: [...r.orient1] as Pole[], orient2: [[...(o2[0] as Pole[])], [...(o2[1] as Pole[])]], nd: ndSpec };
}

// ---- states ----------------------------------------------------------------------------------------------------------------

export interface Chiasma { gap: number; mine: 0 | 1; partner: 0 | 1 }
export interface ChromView {
  /** Unique within the process, e.g. "p0h1" or "p0h1c0" after the centromere splits. */
  id: string;
  pair: number;
  /** 0 = maternal-origin homolog, 1 = paternal-origin. */
  homolog: 0 | 1;
  origin: Origin;
  chromatids: Chromatid[];
  loci: string[];
  condensed: boolean;
  /** Synapsed with its homolog (part of a bivalent). */
  paired: boolean;
  /** Kinetochore microtubules attached. */
  attached: boolean;
  position: "nucleus" | "plate" | "moving" | "pole";
  /** Direction of travel while moving, or the pole it has reached. */
  pole: Pole | null;
  /** While attached to the spindle: the pole each chromatid's kinetochore faces (index = chromatid). */
  facing: Pole[] | null;
  chiasmata: Chiasma[];
}
export interface CellView {
  id: string;
  label: string;
  chromosomes: ChromView[];
  envelope: boolean;
  spindle: boolean;
}
export interface Counts { chromosomes: number; chromatids: number; dnaC: number; sets: string; perPair: number[] }
export interface DivisionStage {
  index: number;
  id: string;
  title: string;
  caption: string;
  /** Dynamic facts for this exact run (what moved where, what the counts are). */
  details: string[];
  cells: CellView[];
  counts: Counts[];
  /** Cells are dividing apart in this stage (drawn separated). */
  cleaved: boolean;
}

const cloneChromatid = (c: Chromatid): Chromatid => ({ alleles: [...c.alleles], origins: [...c.origins] });
const cloneChrom = (c: ChromView): ChromView => ({ ...c, chromatids: c.chromatids.map(cloneChromatid), loci: [...c.loci], chiasmata: c.chiasmata.map((x) => ({ ...x })) });

function baseChromosomes(ind: Individual): ChromView[] {
  const layout = LAYOUTS[ind.layout];
  const out: ChromView[] = [];
  ind.pairs.forEach((pair, p) => {
    ([[pair.a, "maternal"], [pair.b, "paternal"]] as const).forEach(([h, origin], k) => {
      out.push({
        id: `p${p}h${k}`, pair: p, homolog: k as 0 | 1, origin, chromatids: [chromatidOf(h, origin)], loci: [...layout.pairs[p]],
        condensed: false, paired: false, attached: false, position: "nucleus", pole: null, facing: null, chiasmata: [],
      });
    });
  });
  return out;
}

const countsOf = (chroms: ChromView[], nPairs: number, final: boolean, haploid = false): Counts => {
  const chromatids = chroms.reduce((a, c) => a + c.chromatids.length, 0);
  const perPair = Array(nPairs).fill(0) as number[];
  const origins: Array<Set<number>> = Array.from({ length: nPairs }, () => new Set<number>());
  for (const c of chroms) { perPair[c.pair] += 1; origins[c.pair].add(c.homolog); }
  // while chromosomes are still replicated or splitting, count distinct homologs; in a finished cell count chromosomes
  const per = final ? perPair : origins.map((s) => s.size);
  const total = per.reduce((a, b) => a + b, 0);
  const first = (k: number) => per.findIndex((x) => x === k) + 1;
  let sets: string;
  if (haploid) {
    if (per.every((k) => k === 1)) sets = "haploid (n)";
    else if (total === nPairs + 1 && per.some((k) => k === 2)) sets = `n + 1 (extra chromosome of pair ${first(2)})`;
    else if (total === nPairs - 1 && per.some((k) => k === 0)) sets = `n − 1 (no chromosome of pair ${first(0)})`;
    else sets = "abnormal chromosome number";
  } else if (per.every((k) => k === 2)) sets = "diploid (2n)";
  else if (total === 2 * nPairs - 1) sets = `2n − 1 (monosomic for pair ${first(1)})`;
  else if (total === 2 * nPairs + 1) sets = `2n + 1 (trisomic for pair ${first(3)})`;
  else sets = "abnormal chromosome number";
  return { chromosomes: chroms.length, chromatids, dnaC: chromatids / nPairs, sets, perPair };
};

// ---- mitosis ---------------------------------------------------------------------------------------------------------------

export function buildMitosis(ind: Individual): DivisionStage[] {
  if (!LAYOUTS[ind.layout].autosomal) throw new Error("The division tools use autosomal layouts only.");
  const nPairs = ind.pairs.length;
  const base = baseChromosomes(ind);
  const cell = (id: string, label: string, chromosomes: ChromView[], envelope: boolean, spindle: boolean): CellView => ({ id, label, chromosomes, envelope, spindle });
  const replicated = base.map((c) => ({ ...cloneChrom(c), chromatids: [cloneChromatid(c.chromatids[0]), cloneChromatid(c.chromatids[0])] }));
  const make = (f: (c: ChromView) => Partial<ChromView>, from: ChromView[]) => from.map((c) => ({ ...cloneChrom(c), ...f(c) }));
  const stages: Array<Omit<DivisionStage, "index" | "counts" | "details"> & { details?: string[]; final?: boolean }> = [];
  stages.push({ id: "g1", title: "Interphase (G1)", caption: "The cell is diploid. Each chromosome is a single, unreplicated chromatid; chromatin is spread through the nucleus.", cells: [cell("c0", "Cell", base, true, false)], cleaved: false });
  stages.push({ id: "s", title: "Interphase (S phase): DNA replication", caption: "Each chromosome is copied. The DNA content doubles, but the chromosome number does not change: every chromosome now has two identical sister chromatids joined at one centromere.", cells: [cell("c0", "Cell", replicated, true, false)], cleaved: false });
  const pro = make(() => ({ condensed: true }), replicated);
  stages.push({ id: "prophase", title: "Prophase", caption: "Chromosomes condense and become visible. Homologous chromosomes do NOT pair in mitosis. The nuclear envelope is still intact; the spindle begins to form outside it.", cells: [cell("c0", "Cell", pro, true, true)], cleaved: false });
  const prom = make(() => ({ attached: true, position: "moving" as const, facing: [0, 1] as Pole[] }), pro);
  stages.push({ id: "prometaphase", title: "Prometaphase", caption: "The nuclear envelope breaks down. Spindle microtubules attach to a kinetochore on each sister chromatid, and the chromosomes are pulled toward the middle of the cell.", cells: [cell("c0", "Cell", prom, false, true)], cleaved: false });
  const meta = make(() => ({ attached: true, position: "plate" as const, facing: [0, 1] as Pole[] }), pro);
  stages.push({ id: "metaphase", title: "Metaphase", caption: "All chromosomes line up on the metaphase plate with the two sister chromatids of each attached to opposite poles. The cell checks that every chromosome is attached before it continues.", cells: [cell("c0", "Cell", meta, false, true)], cleaved: false });
  const split = (c: ChromView, pole: (k: number) => Pole, position: "moving" | "pole"): ChromView[] => c.chromatids.map((ch, k) => ({ ...cloneChrom(c), id: `${c.id}c${k}`, chromatids: [cloneChromatid(ch)], pole: pole(k), position, attached: true, facing: [pole(k)] }));
  const ana = meta.flatMap((c) => split(c, (k) => k as Pole, "moving"));
  stages.push({ id: "anaphase", title: "Anaphase", caption: "The centromeres split and the sister chromatids separate. Each chromatid is now a chromosome, so the chromosome number in the cell doubles while the amount of DNA stays the same.", cells: [cell("c0", "Cell", ana, false, true)], cleaved: false });
  const d0 = meta.flatMap((c) => split(c, (k) => k as Pole, "pole")).filter((x) => x.pole === 0).map((c) => ({ ...c, attached: false, condensed: false, position: "nucleus" as const, pole: null, facing: null }));
  const d1 = meta.flatMap((c) => split(c, (k) => k as Pole, "pole")).filter((x) => x.pole === 1).map((c) => ({ ...c, attached: false, condensed: false, position: "nucleus" as const, pole: null, facing: null }));
  stages.push({ id: "telophase", title: "Telophase and cytokinesis", caption: "Nuclear envelopes re-form around each set, the chromosomes decondense and the cytoplasm divides. The two daughter cells are diploid and genetically identical to each other and to the parent cell (barring new mutations).", cells: [cell("d0", "Daughter cell 1", d0, true, false), cell("d1", "Daughter cell 2", d1, true, false)], cleaved: true, final: true });
  return stages.map((s, index) => {
    const counts = s.cells.map((c) => countsOf(c.chromosomes, nPairs, !!s.final));
    const c0 = counts[0];
    const details = [
      s.cells.length === 1 ? `Chromosome number ${c0.chromosomes}; ${c0.chromatids} chromatids; DNA content ${c0.dnaC}C.` : `Each daughter cell: chromosome number ${c0.chromosomes}; ${c0.chromatids} chromatids; DNA content ${c0.dnaC}C.`,
    ];
    if (s.final) details.push(`Both daughter cells carry ${s.cells[0].chromosomes.map((c) => c.chromatids[0].alleles.join("")).join(" + ")} — the parent's genotype.`);
    return { index, id: s.id, title: s.title, caption: s.caption, details, cells: s.cells, counts, cleaved: s.cleaved };
  });
}

// ---- meiosis core ----------------------------------------------------------------------------------------------------------

export interface MeiosisCore {
  replicated: ChromView[];
  paired: ChromView[];
  crossed: ChromView[];
  /** Chromosomes (each two chromatids) in the two cells after meiosis I. */
  afterI: [ChromView[], ChromView[]];
  /** Four gametes, each a list of single-chromatid chromosomes: [cell0.pole0, cell0.pole1, cell1.pole0, cell1.pole1]. */
  gametes: [ChromView[], ChromView[], ChromView[], ChromView[]];
}

export function meiosisCore(ind: Individual, s: MeiosisSettings): MeiosisCore {
  const base = baseChromosomes(ind);
  const replicated = base.map((c) => ({ ...cloneChrom(c), chromatids: [cloneChromatid(c.chromatids[0]), cloneChromatid(c.chromatids[0])] }));
  const paired = replicated.map((c) => ({ ...cloneChrom(c), condensed: true, paired: true }));
  const crossed = paired.map(cloneChrom);
  ind.pairs.forEach((pair, p) => {
    const co = s.crossover[p];
    if (!co) return;
    const mat = crossed.find((c) => c.pair === p && c.homolog === 0)!;
    const pat = crossed.find((c) => c.pair === p && c.homolog === 1)!;
    if (pair.a.alleles.length < 2 || isY(pair.b)) return;
    const [nm, np] = exchange(mat.chromatids[co.m], pat.chromatids[co.p], co.between);
    mat.chromatids[co.m] = nm;
    pat.chromatids[co.p] = np;
    mat.chiasmata.push({ gap: co.between, mine: co.m, partner: co.p });
    pat.chiasmata.push({ gap: co.between, mine: co.p, partner: co.m });
  });
  // meiosis I: each chromosome goes to a pole
  const afterI: [ChromView[], ChromView[]] = [[], []];
  for (const c of crossed) {
    let pole: Pole = (c.homolog === s.orient1[c.pair] ? 0 : 1) as Pole;
    if (s.nd.kind === "I" && s.nd.pair === c.pair) pole = s.nd.pole;
    afterI[pole].push({ ...cloneChrom(c), paired: false, pole: null, facing: null, position: "nucleus", attached: false });
  }
  // meiosis II: each chromosome's sister chromatids separate
  const gametes: [ChromView[], ChromView[], ChromView[], ChromView[]] = [[], [], [], []];
  ([0, 1] as const).forEach((cell) => {
    for (const c of afterI[cell]) {
      c.chromatids.forEach((ch, k) => {
        let pole: Pole = (k === s.orient2[cell][c.pair] ? 0 : 1) as Pole;
        if (s.nd.kind === "II" && s.nd.cell === cell && s.nd.pair === c.pair) pole = s.nd.pole;
        gametes[cell * 2 + pole].push({ ...cloneChrom(c), id: `${c.id}c${k}`, chromatids: [cloneChromatid(ch)], condensed: false, position: "nucleus", pole: null, facing: null, attached: false, paired: false });
      });
    }
  });
  return { replicated, paired, crossed, afterI, gametes };
}

/** A short label for a gamete or daughter cell: one entry per chromosome pair, e.g. "R Y", "AB", "R+r Y" (disomic), "– Y" (none). */
export function gameteLabel(chroms: ChromView[], nPairs: number): string {
  const parts: string[] = [];
  for (let p = 0; p < nPairs; p += 1) {
    const here = chroms.filter((c) => c.pair === p).sort((a, b) => a.homolog - b.homolog || a.id.localeCompare(b.id));
    parts.push(here.length ? here.map((c) => c.chromatids[0].alleles.join("")).join("+") : "–");
  }
  return parts.join(" ");
}

// ---- meiosis stages --------------------------------------------------------------------------------------------------------

const POLE_NAME = (p: Pole) => (p === 0 ? "upper pole" : "lower pole");
const pairName = (ind: Individual, p: number) => `pair ${p + 1} (${LAYOUTS[ind.layout].pairs[p].map((l) => l).join(", ")})`;

export function buildMeiosis(ind: Individual, s: MeiosisSettings): DivisionStage[] {
  if (!LAYOUTS[ind.layout].autosomal) throw new Error("The division tools use autosomal layouts only.");
  const n = ind.pairs.length;
  const core = meiosisCore(ind, s);
  const base = baseChromosomes(ind);
  const cell = (id: string, label: string, chromosomes: ChromView[], envelope: boolean, spindle: boolean): CellView => ({ id, label, chromosomes, envelope, spindle });
  const mk = (list: ChromView[], f: (c: ChromView) => Partial<ChromView>) => list.map((c) => ({ ...cloneChrom(c), ...f(c) }));
  type Raw = Omit<DivisionStage, "index" | "counts"> & { final?: boolean };
  const HAPLOID_FROM = ["telophase1", "prophase2", "metaphase2", "anaphase2", "telophase2"];
  const raw: Raw[] = [];
  const nd = s.nd;
  const co = s.crossover;
  raw.push({ id: "g1", title: "Interphase (G1)", caption: "A diploid germ cell. Each chromosome is one chromatid; there is a maternal and a paternal homolog of every chromosome pair.", details: [], cells: [cell("c0", "Germ cell", base, true, false)], cleaved: false });
  raw.push({ id: "s", title: "Interphase (S phase)", caption: "DNA replication happens once, before meiosis begins. Each chromosome now has two sister chromatids. Meiosis has two divisions but only this one round of replication.", details: [], cells: [cell("c0", "Germ cell", core.replicated, true, false)], cleaved: false });
  raw.push({ id: "prophase1", title: "Prophase I: homologs pair", caption: "Chromosomes condense and each homolog pairs with its partner (synapsis), forming a bivalent of four chromatids. This pairing does not happen in mitosis.", details: [], cells: [cell("c0", "Germ cell", core.paired, true, true)], cleaved: false });
  const crossTexts = co.map((c, p) => (c ? `${pairName(ind, p)}: maternal chromatid ${c.m + 1} and paternal chromatid ${c.p + 1} exchange the segment beyond the ${ind.pairs[p].a.alleles[c.between]} gene` : null)).filter((x): x is string => x !== null);
  raw.push({
    id: "crossing", title: "Prophase I: crossing over",
    caption: crossTexts.length ? "Non-sister chromatids of a pair exchange segments at a chiasma. The chromatids that result carry new combinations of alleles (recombinant chromatids) and are partly maternal, partly paternal." : "In this illustrated meiosis no crossover is chosen. (In real cells every bivalent normally has at least one chiasma; with it, alleles of linked genes can be recombined.)",
    details: crossTexts, cells: [cell("c0", "Germ cell", core.crossed, true, true)], cleaved: false,
  });
  const meta1 = core.crossed.map((c) => { const pole = (c.homolog === s.orient1[c.pair] ? 0 : 1) as Pole; return { ...cloneChrom(c), attached: true, position: "plate" as const, pole, facing: [pole, pole] as Pole[] }; });
  raw.push({ id: "metaphase1", title: "Metaphase I", caption: "Bivalents line up at the metaphase plate. Each homolog attaches to one pole only (its sister chromatids stay together). Which homolog faces which pole is random for each pair, independently of the other pairs: independent assortment.", details: s.orient1.map((o, p) => `${pairName(ind, p)}: ${o === 0 ? "maternal" : "paternal"} homolog faces the upper pole, ${o === 0 ? "paternal" : "maternal"} the lower pole.`), cells: [cell("c0", "Germ cell", meta1, false, true)], cleaved: false });
  const ana1 = core.crossed.map((c) => {
    let pole: Pole = (c.homolog === s.orient1[c.pair] ? 0 : 1) as Pole;
    if (nd.kind === "I" && nd.pair === c.pair) pole = nd.pole;
    return { ...cloneChrom(c), paired: false, attached: true, position: "moving" as const, pole, facing: [pole, pole] as Pole[] };
  });
  raw.push({
    id: "anaphase1", title: "Anaphase I: homologs separate",
    caption: nd.kind === "I" ? `NONDISJUNCTION IN MEIOSIS I: the two homologs of ${pairName(ind, nd.pair)} fail to separate and both move to the ${POLE_NAME(nd.pole)}. Sister chromatids are still joined.` : "The HOMOLOGS separate and move to opposite poles. The centromeres do not split, so each chromosome still has two sister chromatids. This is the step that halves the chromosome number.",
    details: nd.kind === "I" ? [`${pairName(ind, nd.pair)}: both homologs go to the ${POLE_NAME(nd.pole)}; the other pole receives none.`] : [],
    cells: [cell("c0", "Germ cell", ana1, false, true)], cleaved: false,
  });
  const telo1 = [cell("a", "Cell A", core.afterI[0], true, false), cell("b", "Cell B", core.afterI[1], true, false)];
  raw.push({ id: "telophase1", title: "Telophase I and cytokinesis", caption: "Two cells form. Each has one homolog of each pair (n chromosomes), but every chromosome still has two chromatids, so DNA content is 2C. There is no new DNA replication before meiosis II.", details: [], cells: telo1, cleaved: true });
  const pro2 = [cell("a", "Cell A", mk(core.afterI[0], () => ({ condensed: true })), false, true), cell("b", "Cell B", mk(core.afterI[1], () => ({ condensed: true })), false, true)];
  raw.push({ id: "prophase2", title: "Prophase II", caption: "Chromosomes re-condense in both cells and spindles form again. No DNA is replicated.", details: [], cells: pro2, cleaved: false });
  const meta2 = [cell("a", "Cell A", mk(core.afterI[0], (c) => ({ attached: true, position: "plate", facing: c.chromatids.map((_, k) => (k === s.orient2[0][c.pair] ? 0 : 1) as Pole) })), false, true), cell("b", "Cell B", mk(core.afterI[1], (c) => ({ attached: true, position: "plate", facing: c.chromatids.map((_, k) => (k === s.orient2[1][c.pair] ? 0 : 1) as Pole) })), false, true)];
  raw.push({ id: "metaphase2", title: "Metaphase II", caption: "In each cell the chromosomes line up with their sister chromatids attached to opposite poles. After crossing over the two sisters are no longer identical, so which sister goes to which pole matters.", details: ([0, 1] as const).flatMap((cl) => s.orient2[cl].map((o, p) => `Cell ${cl === 0 ? "A" : "B"}, ${pairName(ind, p)}: sister chromatid ${o + 1} goes to the upper pole.`)), cells: meta2, cleaved: false });
  const ana2cells = ([0, 1] as const).map((cl) => {
    const chroms = core.afterI[cl].flatMap((c) => c.chromatids.map((ch, k) => {
      let pole: Pole = (k === s.orient2[cl][c.pair] ? 0 : 1) as Pole;
      if (nd.kind === "II" && nd.cell === cl && nd.pair === c.pair) pole = nd.pole;
      return { ...cloneChrom(c), id: `${c.id}c${k}`, chromatids: [cloneChromatid(ch)], attached: true, position: "moving" as const, pole, facing: [pole] as Pole[] };
    }));
    return cell(cl === 0 ? "a" : "b", cl === 0 ? "Cell A" : "Cell B", chroms, false, true);
  });
  raw.push({
    id: "anaphase2", title: "Anaphase II: sister chromatids separate",
    caption: nd.kind === "II" ? `NONDISJUNCTION IN MEIOSIS II: in Cell ${nd.cell === 0 ? "A" : "B"} the sister chromatids of ${pairName(ind, nd.pair)} fail to go to opposite poles; both move to the ${POLE_NAME(nd.pole)}. The other cell divides normally.` : "The centromeres split and the SISTER CHROMATIDS separate, as in mitosis. Each chromatid is now a chromosome, so each cell briefly has twice as many chromosomes as it had after meiosis I.",
    details: nd.kind === "II" ? [`Cell ${nd.cell === 0 ? "A" : "B"}, ${pairName(ind, nd.pair)}: both sister chromatids go to the ${POLE_NAME(nd.pole)}.`] : [],
    cells: ana2cells, cleaved: false,
  });
  const gs = core.gametes;
  raw.push({
    id: "telophase2", title: "Telophase II and cytokinesis: four cells",
    caption: nd.kind === "none" ? "Four haploid cells result, each with one chromatid-chromosome of every pair (1C DNA). They are not identical to each other or to the germ cell: independent assortment and crossing over have shuffled the alleles." : "Four cells result, but the nondisjunction means some do not have exactly one chromosome of the affected pair.",
    details: [], cells: gs.map((g, i) => cell(`g${i}`, `Gamete ${i + 1}`, g, true, false)), cleaved: true, final: true,
  });
  return raw.map((r, index) => {
    const counts = r.cells.map((c) => countsOf(c.chromosomes, n, !!r.final, HAPLOID_FROM.includes(r.id)));
    const details = [...r.details];
    if (r.cells.length === 1) details.push(`Chromosome number ${counts[0].chromosomes}; ${counts[0].chromatids} chromatids; DNA content ${counts[0].dnaC}C.`);
    else details.push(`Chromosomes per cell: ${counts.map((c) => c.chromosomes).join(", ")}; chromatids: ${counts.map((c) => c.chromatids).join(", ")}; DNA: ${counts.map((c) => `${c.dnaC}C`).join(", ")}.`);
    if (r.final) r.cells.forEach((c, i) => details.push(`${c.label}: ${gameteLabel(c.chromosomes, n)} — ${counts[i].sets}.`));
    return { index, id: r.id, title: r.title, caption: r.caption, details, cells: r.cells, counts, cleaved: r.cleaved };
  });
}

// ---- population-level expectation from the same segregation rules ---------------------------------------------------------

/**
 * The gamete frequencies obtained by averaging `meiosisCore` over every equally likely setting. For two linked loci with
 * recombination fraction r, a bivalent has a crossover between them with probability 2r (so that half of its four chromatids,
 * i.e. a fraction r of the gametes, are recombinant); the pair of chromatids involved is equally likely to be any of the four
 * (m, p) combinations. Returns label → probability. Normal meiosis only (no nondisjunction).
 */
export function meiosisDistribution(ind: Individual, r: Fr): Map<string, Fr> {
  const n = ind.pairs.length;
  const perPair: Array<Array<{ co: Crossover | null; w: Fr }>> = ind.pairs.map((pair) => {
    if (pair.a.alleles.length < 2) return [{ co: null, w: FR_ONE }];
    const pc = frMul(fr(2), r);
    const out: Array<{ co: Crossover | null; w: Fr }> = [];
    const none = frAdd(FR_ONE, fr(-pc.n, pc.d));
    if (none.n > 0) out.push({ co: null, w: none });
    if (pc.n > 0) for (const m of [0, 1] as const) for (const p of [0, 1] as const) out.push({ co: { between: 0, m, p }, w: frMul(pc, fr(1, 4)) });
    return out;
  });
  const dist = new Map<string, Fr>();
  const rec = (p: number, co: Array<Crossover | null>, w: Fr) => {
    if (p === n) {
      const total = 1 << (n + 2 * n); // orient1 bits (n) + orient2 bits (2n)
      for (let mask = 0; mask < total; mask += 1) {
        const bits = (i: number) => ((mask >> i) & 1) as Pole;
        const s: MeiosisSettings = { crossover: co, orient1: Array.from({ length: n }, (_, i) => bits(i)), orient2: [Array.from({ length: n }, (_, i) => bits(n + i)), Array.from({ length: n }, (_, i) => bits(2 * n + i))], nd: { kind: "none" } };
        const core = meiosisCore(ind, s);
        for (const g of core.gametes) {
          const label = gameteLabel(g, n);
          dist.set(label, frAdd(dist.get(label) ?? FR_ZERO, frMul(w, fr(1, 4 * total))));
        }
      }
      return;
    }
    for (const opt of perPair[p]) rec(p + 1, [...co, opt.co], frMul(w, opt.w));
  };
  rec(0, [], FR_ONE);
  return dist;
}

// ---- nondisjunction explanation ---------------------------------------------------------------------------------------------

export interface GameteComplement { label: string; perPair: number[]; sets: string; contents: string[] }

/** What each of the four gametes contains, from the segregation that actually happened. */
export function gameteComplements(ind: Individual, s: MeiosisSettings): GameteComplement[] {
  const n = ind.pairs.length;
  const core = meiosisCore(ind, s);
  return core.gametes.map((g) => {
    const c = countsOf(g, n, true, true);
    const contents = g.map((x) => `pair ${x.pair + 1}: ${x.origin} chromatid (${x.chromatids[0].alleles.join("")})`);
    return { label: gameteLabel(g, n), perPair: c.perPair, sets: c.sets, contents };
  });
}

/** What a gamete with a given number of chromosomes of the affected pair means after fertilisation by a normal gamete. */
export function fertilisationOutcome(copiesOfPair: number): string {
  if (copiesOfPair === 2) return "Fertilised by a normal gamete: three copies of this chromosome in the zygote (trisomy, 2n + 1).";
  if (copiesOfPair === 0) return "Fertilised by a normal gamete: one copy of this chromosome in the zygote (monosomy, 2n − 1).";
  return "Fertilised by a normal gamete: a normal diploid zygote for this chromosome.";
}

/** Whether a disomic gamete holds both homologs (a meiosis I error) or two copies of one homolog (a meiosis II error). */
export function disomyType(g: ChromView[], pair: number): "both homologs" | "sister copies" | null {
  const here = g.filter((c) => c.pair === pair);
  if (here.length !== 2) return null;
  return here[0].homolog !== here[1].homolog ? "both homologs" : "sister copies";
}
