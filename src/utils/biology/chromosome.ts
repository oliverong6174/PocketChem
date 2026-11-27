/**
 * Shared chromosome and allele model (pure; no React) used by the Genetics and the Mitosis/Meiosis tools, so a genotype set on
 * one page is the same object that is segregated on the other.
 *
 *  - A LOCUS is a gene position with a catalogue entry: its alleles, which chromosome kind it sits on, and the stated
 *    genotype → phenotype rule (complete dominance, incomplete dominance, codominance, a multiple-allele series).
 *  - A CHROMOSOME PAIR holds two homologs. Each homolog lists one allele per locus, in the order the loci lie along it.
 *    Homolog `a` is the "maternal" one and `b` the "paternal" one in every drawing (an illustrative convention).
 *  - An INDIVIDUAL is a LAYOUT (which loci lie on which chromosome pair) plus one genotype per pair.
 * Nothing here is a statement about a real organism's genome: the loci are teaching examples.
 */

export type ChromosomeKind = "autosome" | "X";

export type Dominance =
  | { kind: "complete"; dominant: string; recessive: string }
  | { kind: "incomplete"; a: string; b: string; intermediate: string }
  | { kind: "codominant"; a: string; b: string; both: string }
  | { kind: "series" };

export interface LocusDef {
  id: string;
  /** Short title of the gene/trait, e.g. "Seed shape". */
  name: string;
  chromosome: ChromosomeKind;
  /** Allele ids in the order used for canonical genotype labels (dominant first). */
  alleles: string[];
  /** Phenotype name contributed by a homozygote (or hemizygote) of each allele. */
  trait: Record<string, string>;
  dominance: Dominance;
  /** The sentence shown to the learner about how genotype maps to phenotype at this locus. */
  rule: string;
}

/** Display parts of an allele symbol: base letter(s) and an optional superscript (I<sup>A</sup>). */
export const ALLELE_DISPLAY: Record<string, { base: string; sup?: string }> = {
  R: { base: "R" }, r: { base: "r" }, Y: { base: "Y" }, y: { base: "y" },
  CR: { base: "C", sup: "R" }, CW: { base: "C", sup: "W" },
  LM: { base: "L", sup: "M" }, LN: { base: "L", sup: "N" },
  IA: { base: "I", sup: "A" }, IB: { base: "I", sup: "B" }, i: { base: "i" },
  C: { base: "X", sup: "C" }, c: { base: "X", sup: "c" },
  A: { base: "A" }, a: { base: "a" }, B: { base: "B" }, b: { base: "b" },
};
export const alleleText = (id: string): string => { const d = ALLELE_DISPLAY[id]; return d ? `${d.base}${d.sup ?? ""}` : id; };

export const LOCI: Record<string, LocusDef> = {
  R: { id: "R", name: "Seed shape", chromosome: "autosome", alleles: ["R", "r"], trait: { R: "round", r: "wrinkled" }, dominance: { kind: "complete", dominant: "R", recessive: "r" }, rule: "Complete dominance: R is dominant, so RR and Rr seeds are round; only rr seeds are wrinkled." },
  Y: { id: "Y", name: "Seed colour", chromosome: "autosome", alleles: ["Y", "y"], trait: { Y: "yellow", y: "green" }, dominance: { kind: "complete", dominant: "Y", recessive: "y" }, rule: "Complete dominance: Y is dominant, so YY and Yy seeds are yellow; only yy seeds are green." },
  CR: { id: "CR", name: "Snapdragon flower colour", chromosome: "autosome", alleles: ["CR", "CW"], trait: { CR: "red", CW: "white" }, dominance: { kind: "incomplete", a: "CR", b: "CW", intermediate: "pink" }, rule: "Incomplete dominance: neither allele masks the other; the heterozygote CᴿCᵂ is pink, between red CᴿCᴿ and white CᵂCᵂ." },
  LM: { id: "LM", name: "MN blood group", chromosome: "autosome", alleles: ["LM", "LN"], trait: { LM: "M", LN: "N" }, dominance: { kind: "codominant", a: "LM", b: "LN", both: "MN" }, rule: "Codominance: both alleles are expressed in the heterozygote, which has the M and the N antigens (type MN)." },
  ABO: { id: "ABO", name: "ABO blood group", chromosome: "autosome", alleles: ["IA", "IB", "i"], trait: { IA: "A", IB: "B", i: "O" }, dominance: { kind: "series" }, rule: "Multiple alleles: Iᴬ and Iᴮ are codominant with each other and both are dominant to i. Iᴬ_ is type A, Iᴮ_ is type B, IᴬIᴮ is type AB and ii is type O." },
  XC: { id: "XC", name: "Red–green colour vision", chromosome: "X", alleles: ["C", "c"], trait: { C: "normal vision", c: "colour-blind" }, dominance: { kind: "complete", dominant: "C", recessive: "c" }, rule: "X-linked recessive: the locus is on the X chromosome. A female needs XᶜXᶜ to be colour-blind; a male has one X, so a single Xᶜ makes him colour-blind (hemizygous)." },
  A: { id: "A", name: "Gene A", chromosome: "autosome", alleles: ["A", "a"], trait: { A: "A-phenotype", a: "a-phenotype" }, dominance: { kind: "complete", dominant: "A", recessive: "a" }, rule: "Complete dominance: A is dominant to a." },
  B: { id: "B", name: "Gene B", chromosome: "autosome", alleles: ["B", "b"], trait: { B: "B-phenotype", b: "b-phenotype" }, dominance: { kind: "complete", dominant: "B", recessive: "b" }, rule: "Complete dominance: B is dominant to b." },
};

export type LayoutId = "mono" | "di" | "linked" | "incomplete" | "codominant" | "abo" | "xlinked";

export interface LayoutDef {
  id: LayoutId;
  label: string;
  /** Loci on each chromosome pair, in order along the chromosome. */
  pairs: string[][];
  /** True when two loci on one pair are linked (a recombination fraction applies). */
  linked: boolean;
  /** Layouts the meiosis/mitosis tools accept (autosomal only). */
  autosomal: boolean;
}

export const LAYOUTS: Record<LayoutId, LayoutDef> = {
  mono: { id: "mono", label: "One gene (monohybrid)", pairs: [["R"]], linked: false, autosomal: true },
  di: { id: "di", label: "Two genes on different chromosomes (dihybrid)", pairs: [["R"], ["Y"]], linked: false, autosomal: true },
  linked: { id: "linked", label: "Two linked genes on one chromosome", pairs: [["A", "B"]], linked: true, autosomal: true },
  incomplete: { id: "incomplete", label: "Incomplete dominance", pairs: [["CR"]], linked: false, autosomal: true },
  codominant: { id: "codominant", label: "Codominance", pairs: [["LM"]], linked: false, autosomal: true },
  abo: { id: "abo", label: "Multiple alleles (ABO)", pairs: [["ABO"]], linked: false, autosomal: true },
  xlinked: { id: "xlinked", label: "X-linked gene", pairs: [["XC"]], linked: false, autosomal: false },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS) as LayoutId[];
export const MEIOSIS_LAYOUTS: LayoutId[] = ["mono", "di", "linked"];

/** One homolog: one allele per locus. On the X pair of a male the second homolog is the Y: `alleles` is empty. */
export interface Homolog { alleles: string[] }
export interface PairGenotype { a: Homolog; b: Homolog }
export interface Individual { layout: LayoutId; pairs: PairGenotype[] }

export const isY = (h: Homolog) => h.alleles.length === 0;
export const sexOf = (ind: Individual): "female" | "male" | null => (ind.layout !== "xlinked" ? null : isY(ind.pairs[0].b) ? "male" : "female");

export const individual = (layout: LayoutId, ...pairs: Array<[string[], string[]]>): Individual => ({ layout, pairs: pairs.map(([a, b]) => ({ a: { alleles: [...a] }, b: { alleles: [...b] } })) });

/** Strict validation: builds a new object from known fields and rejects anything outside the layout's loci and alleles. */
export function validateIndividual(raw: unknown): { ok: true; value: Individual } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "The genotype must be an object." };
  const r = raw as Record<string, unknown>;
  if (typeof r.layout !== "string" || !(r.layout in LAYOUTS)) return { ok: false, error: "Unknown chromosome layout." };
  const layout = LAYOUTS[r.layout as LayoutId];
  if (!Array.isArray(r.pairs) || r.pairs.length !== layout.pairs.length) return { ok: false, error: "Wrong number of chromosome pairs for this layout." };
  const pairs: PairGenotype[] = [];
  for (let p = 0; p < layout.pairs.length; p += 1) {
    const loci = layout.pairs[p];
    const rp = r.pairs[p] as Record<string, unknown> | null;
    if (typeof rp !== "object" || rp === null) return { ok: false, error: "Malformed chromosome pair." };
    const read = (h: unknown, allowY: boolean): Homolog | null => {
      if (typeof h !== "object" || h === null) return null;
      const al = (h as Record<string, unknown>).alleles;
      if (!Array.isArray(al)) return null;
      if (allowY && al.length === 0) return { alleles: [] };
      if (al.length !== loci.length) return null;
      for (let i = 0; i < loci.length; i += 1) if (typeof al[i] !== "string" || !LOCI[loci[i]].alleles.includes(al[i] as string)) return null;
      return { alleles: al.map(String) };
    };
    const a = read(rp.a, false);
    const b = read(rp.b, layout.id === "xlinked");
    if (!a || !b) return { ok: false, error: `The alleles of pair ${p + 1} do not belong to its genes.` };
    pairs.push({ a, b });
  }
  return { ok: true, value: { layout: layout.id, pairs } };
}

/** Phenotype name of a diploid (or hemizygous) genotype at one locus; `alleles` has one or two entries. */
export function locusPhenotype(locusId: string, alleles: string[]): string {
  const L = LOCI[locusId];
  const [x, y] = alleles;
  const d = L.dominance;
  if (alleles.length === 1) return L.trait[x]; // hemizygous (male X-linked): the one allele is expressed
  if (x === y) return L.trait[x];
  if (d.kind === "complete") return L.trait[d.dominant];
  if (d.kind === "incomplete") return d.intermediate;
  if (d.kind === "codominant") return d.both;
  // ABO series
  const s = new Set(alleles);
  if (s.has("IA") && s.has("IB")) return "AB";
  if (s.has("IA")) return "A";
  if (s.has("IB")) return "B";
  return "O";
}

/** Canonical genotype label of one locus: alleles ordered as in the catalogue. */
export function locusGenotypeLabel(locusId: string, alleles: string[]): string {
  const L = LOCI[locusId];
  return [...alleles].sort((p, q) => L.alleles.indexOf(p) - L.alleles.indexOf(q)).map(alleleText).join("");
}

export const describeIndividual = (ind: Individual): string => {
  const L = LAYOUTS[ind.layout];
  return ind.pairs.map((p, i) => {
    const loci = L.pairs[i];
    if (L.id === "xlinked") return isY(p.b) ? `${alleleText(p.a.alleles[0])}Y` : `${alleleText(p.a.alleles[0])}${alleleText(p.b.alleles[0])}`;
    if (loci.length === 1) return locusGenotypeLabel(loci[0], [p.a.alleles[0], p.b.alleles[0]]);
    return `${p.a.alleles.map(alleleText).join("")}/${p.b.alleles.map(alleleText).join("")}`;
  }).join(" ");
};

// ---- chromatids and crossing over (shared by Genetics and Meiosis) ------------------------------------------------------------

export type Origin = "maternal" | "paternal";
/** One DNA double helix of a chromosome: its alleles and the homolog each stretch came from (so a recombinant is two-coloured). */
export interface Chromatid { alleles: string[]; origins: Origin[] }

export const chromatidOf = (h: Homolog, origin: Origin): Chromatid => ({ alleles: [...h.alleles], origins: h.alleles.map(() => origin) });

/**
 * Reciprocal exchange between two NON-SISTER chromatids after locus `between` (0 = between the first and second locus).
 * Returns the two new chromatids; the inputs are not changed.
 */
export function exchange(x: Chromatid, y: Chromatid, between: number): [Chromatid, Chromatid] {
  const cut = between + 1;
  return [
    { alleles: [...x.alleles.slice(0, cut), ...y.alleles.slice(cut)], origins: [...x.origins.slice(0, cut), ...y.origins.slice(cut)] },
    { alleles: [...y.alleles.slice(0, cut), ...x.alleles.slice(cut)], origins: [...y.origins.slice(0, cut), ...x.origins.slice(cut)] },
  ];
}

/**
 * The four chromatids of one chromosome pair after DNA replication (maternal ×2, paternal ×2), optionally after one crossover
 * between maternal chromatid `m` and paternal chromatid `p` (each 0 or 1) after locus `between`.
 */
export function tetrad(pair: PairGenotype, crossover: { between: number; m: 0 | 1; p: 0 | 1 } | null): Chromatid[] {
  const mat = [chromatidOf(pair.a, "maternal"), chromatidOf(pair.a, "maternal")];
  const pat = [chromatidOf(pair.b, "paternal"), chromatidOf(pair.b, "paternal")];
  if (crossover && pair.a.alleles.length >= 2 && !isY(pair.b)) {
    const [nm, np] = exchange(mat[crossover.m], pat[crossover.p], crossover.between);
    mat[crossover.m] = nm;
    pat[crossover.p] = np;
  }
  return [mat[0], mat[1], pat[0], pat[1]];
}
