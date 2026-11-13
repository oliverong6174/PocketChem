/**
 * Inheritance engine (pure; no React): gametes, crosses, Punnett grids, genotype and phenotype distributions, test crosses and the
 * two-locus linkage model. Probabilities are EXACT fractions (never floating point), so 9:3:3:1 is exactly 9/16, 3/16, 3/16, 1/16.
 *
 * Model: each parent makes gametes by segregating the two homologs of every chromosome pair (Mendel's first law); different
 * pairs assort independently (second law). Two loci on one pair are LINKED: the parental combinations of each homolog stay
 * together except for a stated recombination fraction r (0 ≤ r ≤ 0.5) between them. r is an input; this model does not predict
 * recombination from map distance or sequence. Crossing over is assumed to be the only source of recombinants.
 */
import {
  ALLELE_DISPLAY, LAYOUTS, LOCI, alleleText, isY, locusGenotypeLabel, locusPhenotype,
  type Individual, type LayoutId, type PairGenotype,
} from "./chromosome";

// ---- exact fractions -------------------------------------------------------------------------------------------------------
export interface Fr { n: number; d: number }
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const fr = (n: number, d = 1): Fr => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
export const frAdd = (x: Fr, y: Fr): Fr => fr(x.n * y.d + y.n * x.d, x.d * y.d);
export const frMul = (x: Fr, y: Fr): Fr => fr(x.n * y.n, x.d * y.d);
export const frEq = (x: Fr, y: Fr) => x.n * y.d === y.n * x.d;
export const frNum = (x: Fr) => x.n / x.d;
export const frText = (x: Fr) => (x.d === 1 ? String(x.n) : `${x.n}/${x.d}`);
export const FR_ZERO: Fr = fr(0);
export const FR_ONE: Fr = fr(1);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** Recombination fraction as an exact fraction. Accepts 0–0.5 with at most 3 decimals. */
export function parseRecombination(r: unknown): Fr | null {
  if (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > 0.5) return null;
  const k = Math.round(r * 1000);
  if (Math.abs(r * 1000 - k) > 1e-9) return null;
  return fr(k, 1000);
}

// ---- gametes ---------------------------------------------------------------------------------------------------------------

export interface Haplotype {
  /** Alleles in locus order along the chromosome; empty for a Y chromosome. */
  alleles: string[];
  chrom: "autosome" | "X" | "Y";
  p: Fr;
  kind: "single" | "parental" | "recombinant" | "mixed";
}
export interface Gamete {
  /** One haplotype per chromosome pair (the order of the layout). */
  haplotypes: Array<{ alleles: string[]; chrom: "autosome" | "X" | "Y" }>;
  label: string;
  p: Fr;
  /** For a single linked pair: whether the gamete carries the parental or a recombinant chromosome. */
  kind: "single" | "parental" | "recombinant" | "mixed";
}

const hapLabel = (alleles: string[], chrom: string) => (chrom === "Y" ? "Y" : alleles.map(alleleText).join(""));

/** The haplotype classes one chromosome pair can give, with exact probabilities. */
export function pairHaplotypes(pair: PairGenotype, kind: "autosome" | "X", r: Fr): Haplotype[] {
  const half = fr(1, 2);
  const chromOf = (h: { alleles: string[] }): "autosome" | "X" | "Y" => (isY(h) ? "Y" : kind === "X" ? "X" : "autosome");
  const raw: Haplotype[] = [];
  const n = pair.a.alleles.length;
  if (n <= 1) {
    raw.push({ alleles: pair.a.alleles, chrom: chromOf(pair.a), p: half, kind: "single" }, { alleles: pair.b.alleles, chrom: chromOf(pair.b), p: half, kind: "single" });
  } else {
    const par = frMul(half, frAdd(FR_ONE, fr(-r.n, r.d)));
    const rec = frMul(half, r);
    raw.push(
      { alleles: pair.a.alleles, chrom: "autosome", p: par, kind: "parental" },
      { alleles: pair.b.alleles, chrom: "autosome", p: par, kind: "parental" },
      { alleles: [pair.a.alleles[0], pair.b.alleles[1]], chrom: "autosome", p: rec, kind: "recombinant" },
      { alleles: [pair.b.alleles[0], pair.a.alleles[1]], chrom: "autosome", p: rec, kind: "recombinant" },
    );
  }
  const merged: Haplotype[] = [];
  for (const h of raw) {
    if (h.p.n === 0) continue;
    const same = merged.find((m) => m.chrom === h.chrom && m.alleles.join("|") === h.alleles.join("|"));
    if (same) { same.p = frAdd(same.p, h.p); if (same.kind !== h.kind) same.kind = "mixed"; } else merged.push({ ...h, alleles: [...h.alleles] });
  }
  return merged;
}

/** All gamete classes of an individual: the product of its pairs' haplotype classes (independent assortment). */
export function gametesOf(ind: Individual, r: Fr): Gamete[] {
  const layout = LAYOUTS[ind.layout];
  let acc: Gamete[] = [{ haplotypes: [], label: "", p: FR_ONE, kind: "single" }];
  ind.pairs.forEach((pair, i) => {
    const hs = pairHaplotypes(pair, LOCI[layout.pairs[i][0]].chromosome, r);
    const next: Gamete[] = [];
    for (const g of acc) for (const h of hs) {
      next.push({
        haplotypes: [...g.haplotypes, { alleles: h.alleles, chrom: h.chrom }],
        label: g.label ? `${g.label} ${hapLabel(h.alleles, h.chrom)}` : hapLabel(h.alleles, h.chrom),
        p: frMul(g.p, h.p),
        kind: layout.pairs.length === 1 ? h.kind : "mixed",
      });
    }
    acc = next;
  });
  return mergeGametes(acc);
}
function mergeGametes(gs: Gamete[]): Gamete[] {
  const out: Gamete[] = [];
  for (const g of gs) {
    const same = out.find((m) => m.label === g.label);
    if (same) { same.p = frAdd(same.p, g.p); if (same.kind !== g.kind) same.kind = "mixed"; } else out.push({ ...g });
  }
  return out;
}

// ---- crosses ---------------------------------------------------------------------------------------------------------------

export interface Offspring {
  genotype: string;
  phenotype: string;
  sex: "female" | "male" | null;
  p: Fr;
  /** Alleles per locus, one or two entries each (one for the X of a male). */
  loci: Record<string, string[]>;
}
export interface PunnettCell { g1: Gamete; g2: Gamete; offspring: Offspring }
export interface Tally { label: string; p: Fr }
export interface CrossResult {
  layout: LayoutId;
  gametes1: Gamete[];
  gametes2: Gamete[];
  grid: PunnettCell[][];
  genotypes: Tally[];
  phenotypes: Tally[];
  /** Integer ratio strings, e.g. "9:3:3:1". */
  genotypicRatio: string;
  phenotypicRatio: string;
}

function offspringOf(layoutId: LayoutId, g1: Gamete, g2: Gamete): Offspring {
  const layout = LAYOUTS[layoutId];
  const loci: Record<string, string[]> = {};
  let sex: "female" | "male" | null = null;
  layout.pairs.forEach((locusIds, i) => {
    const h1 = g1.haplotypes[i], h2 = g2.haplotypes[i];
    if (h1.chrom === "Y" || h2.chrom === "Y") sex = "male"; else if (h1.chrom === "X" && h2.chrom === "X") sex = "female";
    locusIds.forEach((id, k) => {
      const al = [h1.alleles[k], h2.alleles[k]].filter((x): x is string => typeof x === "string");
      loci[id] = al;
    });
  });
  const genotype = layout.pairs.map((locusIds) => {
    if (layoutId === "xlinked") { const al = loci[locusIds[0]]; return sex === "male" ? `${alleleText(al[0])}Y` : locusGenotypeLabel(locusIds[0], al); }
    return locusIds.map((id) => locusGenotypeLabel(id, loci[id])).join(layout.linked ? " " : "");
  }).join(" ");
  const phen = layout.pairs.flat().map((id) => locusPhenotype(id, loci[id])).join(", ");
  return { genotype, phenotype: sex ? `${sex}, ${phen}` : phen, sex, p: FR_ONE, loci };
}

/** Integer ratio of a list of probabilities ("9:3:3:1"), in the order given. */
export function ratioText(ps: Fr[]): string {
  if (!ps.length) return "";
  const L = ps.reduce((a, p) => lcm(a, p.d), 1);
  const counts = ps.map((p) => (p.n * L) / p.d);
  const g = counts.reduce((a, c) => gcd(a, c), 0) || 1;
  return counts.map((c) => c / g).join(":");
}

const genotypeOrder = (label: string) => label;

export function cross(p1: Individual, p2: Individual, r: Fr = fr(1, 2)): CrossResult {
  if (p1.layout !== p2.layout) throw new Error("Both parents must use the same chromosome layout.");
  const g1 = gametesOf(p1, r), g2 = gametesOf(p2, r);
  const grid: PunnettCell[][] = [];
  const geno = new Map<string, Fr>(), phen = new Map<string, Fr>();
  const valid = (a: Gamete, b: Gamete) => (p1.layout !== "xlinked" ? true : a.haplotypes[0].chrom === "X" || b.haplotypes[0].chrom === "X"); // never Y × Y
  for (const a of g1) {
    const row: PunnettCell[] = [];
    for (const b of g2) {
      const o = offspringOf(p1.layout, a, b);
      o.p = frMul(a.p, b.p);
      row.push({ g1: a, g2: b, offspring: o });
      if (valid(a, b)) {
        geno.set(o.genotype, frAdd(geno.get(o.genotype) ?? FR_ZERO, o.p));
        phen.set(o.phenotype, frAdd(phen.get(o.phenotype) ?? FR_ZERO, o.p));
      }
    }
    grid.push(row);
  }
  // XY × XY is impossible; normalise if an invalid combination was excluded (it only happens for two males)
  const total = [...geno.values()].reduce(frAdd, FR_ZERO);
  const norm = (m: Map<string, Fr>): Tally[] => [...m.entries()].map(([label, p]) => ({ label, p: frMul(p, fr(total.d, total.n)) }));
  const genotypes = norm(geno).sort((x, y) => genotypeOrder(x.label).localeCompare(genotypeOrder(y.label)));
  const phenotypes = norm(phen).sort((x, y) => frNum(y.p) - frNum(x.p) || x.label.localeCompare(y.label));
  return { layout: p1.layout, gametes1: g1, gametes2: g2, grid, genotypes, phenotypes, genotypicRatio: ratioText(genotypes.map((t) => t.p)), phenotypicRatio: ratioText(phenotypes.map((t) => t.p)) };
}

// ---- test cross ------------------------------------------------------------------------------------------------------------

/** The tester for an autosomal individual: homozygous recessive at every locus (the last allele of each catalogue entry, or "i"). */
export function testerFor(ind: Individual): Individual {
  const layout = LAYOUTS[ind.layout];
  return {
    layout: ind.layout,
    pairs: layout.pairs.map((loci) => {
      const rec = loci.map((id) => { const L = LOCI[id]; return L.dominance.kind === "complete" ? L.dominance.recessive : L.alleles[L.alleles.length - 1]; });
      return { a: { alleles: [...rec] }, b: { alleles: [...rec] } };
    }),
  };
}

/** Phenotype of an individual (all loci), the dominant-phenotype test that decides whether a test cross is informative. */
export function phenotypeOf(ind: Individual): string {
  const layout = LAYOUTS[ind.layout];
  return layout.pairs.flatMap((loci, i) => loci.map((id, k) => locusPhenotype(id, isY(ind.pairs[i].b) ? [ind.pairs[i].a.alleles[k]] : [ind.pairs[i].a.alleles[k], ind.pairs[i].b.alleles[k]]))).join(", ");
}

/** A test cross: the individual × a homozygous-recessive tester. The offspring phenotypes mirror the individual's gametes. */
export function testCross(ind: Individual, r: Fr = fr(1, 2)): CrossResult { return cross(ind, testerFor(ind), r); }

/**
 * Given the offspring of a test cross of an individual with a dominant phenotype at a complete-dominance locus, what can be
 * concluded? Returns the phenotypic outcome expected for each candidate genotype (homozygous and heterozygous).
 */
export function testCrossInterpretation(locusId: string): { homozygous: CrossResult; heterozygous: CrossResult } | null {
  const L = LOCI[locusId];
  if (locusId !== "R" || L.dominance.kind !== "complete") return null;
  const dom = L.dominance.dominant, rec = L.dominance.recessive;
  const mk = (a: string, b: string): Individual => ({ layout: "mono", pairs: [{ a: { alleles: [a] }, b: { alleles: [b] } }] });
  return { homozygous: testCross(mk(dom, dom)), heterozygous: testCross(mk(dom, rec)) };
}

// ---- linkage ---------------------------------------------------------------------------------------------------------------

export interface LinkageAnalysis {
  phase: "coupling" | "repulsion" | "undefined";
  parental: Gamete[];
  recombinant: Gamete[];
  /** Total recombinant gamete frequency (equals r when both loci are heterozygous). */
  recombinantFrequency: Fr;
  explanation: string;
}

/** Phase of a doubly heterozygous linked pair, and the parental/recombinant gamete classes for the given r. */
export function analyzeLinkage(ind: Individual, r: Fr): LinkageAnalysis | null {
  if (!LAYOUTS[ind.layout].linked) return null;
  const pair = ind.pairs[0];
  const het = pair.a.alleles[0] !== pair.b.alleles[0] && pair.a.alleles[1] !== pair.b.alleles[1];
  const gs = gametesOf(ind, r);
  const parental = gs.filter((g) => g.kind === "parental");
  const recombinant = gs.filter((g) => g.kind === "recombinant");
  const recombinantFrequency = recombinant.reduce((a, g) => frAdd(a, g.p), FR_ZERO);
  let phase: LinkageAnalysis["phase"] = "undefined";
  if (het) {
    const domFirst = pair.a.alleles[0] === LOCI[LAYOUTS.linked.pairs[0][0]].alleles[0];
    const domSecond = pair.a.alleles[1] === LOCI[LAYOUTS.linked.pairs[0][1]].alleles[0];
    phase = domFirst === domSecond ? "coupling" : "repulsion";
  }
  const hapText = `${pair.a.alleles.map(alleleText).join("")}/${pair.b.alleles.map(alleleText).join("")}`;
  const explanation = phase === "undefined"
    ? "Linkage only changes the gametes when the parent is heterozygous at both genes; here at least one gene is homozygous, so crossing over cannot produce a new allele combination."
    : `${hapText} is in ${phase} phase: ${phase === "coupling" ? "the two dominant alleles are on the same homolog" : "each homolog carries one dominant and one recessive allele"}. Parental gametes keep the homolog's combination; recombinant gametes carry a new combination made by crossing over. With r = ${frText(r)}, recombinants total ${frText(recombinantFrequency)}.`;
  return { phase, parental, recombinant, recombinantFrequency, explanation };
}

/** Estimate r from test-cross offspring counts (recombinant offspring / all offspring). */
export function estimateRecombination(counts: { parental: number; recombinant: number }): number | null {
  const t = counts.parental + counts.recombinant;
  return t > 0 ? counts.recombinant / t : null;
}

// ---- convenience -----------------------------------------------------------------------------------------------------------

export const gameteSetText = (gs: Gamete[]) => gs.map((g) => `${g.label} (${frText(g.p)})`).join(", ");
export { ALLELE_DISPLAY };
