/**
 * Which concrete structure an under-specified name loads first. These are deliberate, reviewable choices (the form most
 * commonly meant in organic chemistry and biochemistry), never database order and never a claim that the molecule exists
 * only in that form. A name that states its own form, series or stereochemistry is not listed here, so it is untouched.
 * Names with no defensible single reading (vitamin B3, arabinose, ...) are left to the chooser.
 */

export type SugarPreference = { anomer: "alpha" | "beta"; ring: "pyranose" | "furanose" };

/** Keyed by sugar stem ("gluc" for glucose). Aqueous major anomer, except ribose: the furanose of RNA and nucleotides. */
export const SUGAR_PREFERENCES: Record<string, SugarPreference> = {
  gluc: { anomer: "beta", ring: "pyranose" },
  galact: { anomer: "beta", ring: "pyranose" },
  mann: { anomer: "alpha", ring: "pyranose" },
  fruct: { anomer: "beta", ring: "pyranose" },
  xyl: { anomer: "beta", ring: "pyranose" },
  rib: { anomer: "beta", ring: "furanose" },
};

/** `load` and `others` are database names. `unspecified` also keeps the name's own record as a choice. */
export type NamedPreference = { load: string; others: string[]; unspecified?: string };

const CHIRAL_AMINO_ACIDS = [
  "alanine", "valine", "leucine", "proline", "phenylalanine", "tyrosine", "tryptophan", "serine", "cysteine",
  "methionine", "asparagine", "glutamine", "aspartic acid", "glutamic acid", "lysine", "arginine", "histidine",
];

const maltose: NamedPreference = { load: "beta-maltose", others: ["alpha-maltose"] };
const lactose: NamedPreference = { load: "beta-lactose", others: ["alpha-lactose"] };
const thiamine: NamedPreference = { load: "thiamine(1+)", others: ["thiamine(1+) chloride"] };
const cobalamin: NamedPreference = { load: "cyanocobalamin", others: [] };

/** Keyed by the normalised query. */
export const NAMED_PREFERENCES: Record<string, NamedPreference> = {
  // The proteinogenic enantiomer.
  ...Object.fromEntries(CHIRAL_AMINO_ACIDS.map((name) => [name, { load: `L-${name}`, others: [`D-${name}`], unspecified: name }])),
  maltose, "d-maltose": maltose,
  lactose, "d-lactose": lactose,
  "lactic acid": { load: "(S)-lactic acid", others: ["(R)-lactic acid"], unspecified: "2-hydroxypropanoic acid" },
  retinol: { load: "all-trans-retinol", others: [], unspecified: "retinol" },
  "vitamin c": { load: "L-ascorbic acid", others: ["L-ascorbate"] },
  "vitamin b1": thiamine, thiamine,
  "vitamin b12": cobalamin, "vitamin b-12": cobalamin,
  // "Vitamin D" in the database points at a hydroxylated metabolite; the vitamin itself is D3 (or D2).
  "vitamin d": { load: "cholecalciferol", others: ["ergocalciferol"] },
  niacin: { load: "nicotinic acid", others: ["nicotinamide"] },
  amp: { load: "adenosine 5'-monophosphate", others: ["adenosine 5'-monophosphate(2-)"] },
  gmp: { load: "guanosine 5'-monophosphate", others: ["guanosine 5'-monophosphate(2-)"] },
  malate: { load: "malate(2-)", others: ["(S)-malic acid", "malic acid"] },
};
