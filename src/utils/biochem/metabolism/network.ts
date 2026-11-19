/**
 * Curated central-carbon-metabolism network (Stage 18): glycolysis, gluconeogenesis, pyruvate oxidation, the citric acid cycle and the
 * respiratory chain share ONE set of metabolites, enzymes and reactions, so every diagram, ledger, explanation and test refers to the same entities.
 *
 * This is STOICHIOMETRY and curated regulation. It is not a kinetic or flux model: nothing here says how fast a step runs in any cell.
 *
 * Bookkeeping convention (stated in the UI): metabolites are written as their fully protonated, neutral acid forms (pyruvic acid, phosphoric acid,
 * ATP and ADP as the neutral acids) with NAD⁺ as a cation and H⁺ explicit. Phosphoryl transfers then need no extra H⁺, atoms and charge balance
 * exactly in every reaction, and the pathway sums reproduce the familiar textbook net equations. At cellular pH most of these molecules are
 * ionized; that changes the proton bookkeeping (not the carbon, phosphate or electron accounting) and is not modelled.
 *
 * Stage 25 extends the SAME network (no second one) with fatty-acid activation, the carnitine shuttle, β-oxidation, fatty-acid synthesis, ketone
 * bodies, transamination, oxidative deamination and the urea cycle. Shared metabolites keep one identity (acetyl-CoA, oxaloacetate, α-ketoglutarate,
 * succinyl-CoA, fumarate, ATP, NADH, FADH₂, free CoA); NADPH/NADP⁺ is a separate pool. For pathways that are not per-glucose, `perGlucose` is the
 * multiplicity per pass of that pathway (per β-oxidation cycle, per urea, per activation) and is documented where it matters.
 */
import { AMINO_ACID_LIST } from "../aminoAcids";

export type CompartmentId = "cytosol" | "matrix" | "ims" | "inner-membrane" | "er-lumen" | "omm" | "blood";
export const COMPARTMENTS: Record<CompartmentId, { label: string; note: string }> = {
  cytosol: { label: "Cytosol", note: "Glycolysis; most of gluconeogenesis." },
  matrix: { label: "Mitochondrial matrix", note: "Pyruvate dehydrogenase complex, citric acid cycle, pyruvate carboxylase, ATP synthase's catalytic head." },
  ims: { label: "Intermembrane space", note: "Receives protons pumped by complexes I, III and IV." },
  "inner-membrane": { label: "Inner mitochondrial membrane", note: "Respiratory complexes, coenzyme Q and ATP synthase." },
  "er-lumen": { label: "Endoplasmic-reticulum lumen", note: "Glucose-6-phosphatase (liver, kidney cortex, intestine) acts on the lumenal side after G6P enters through a transporter." },
  omm: { label: "Outer mitochondrial membrane", note: "Stage 25: long-chain acyl-CoA synthetase and carnitine palmitoyltransferase I (its active site faces the cytosol side)." },
  blood: { label: "Blood (between tissues)", note: "Stage 25: where ketone bodies, fatty acids, glucose and amino acids travel between tissues. Not a cellular compartment." },
};

/** Stage 25: coarse tissue context. The model says where an enzyme activity is notable, not a measured expression profile. */
export type TissueId = "liver" | "extrahepatic";
export const TISSUES: Record<TissueId, { label: string; note: string }> = {
  liver: { label: "Liver (hepatocyte)", note: "Makes ketone bodies and urea and can release glucose; cannot use ketone bodies as fuel because it has little succinyl-CoA:acetoacetate CoA-transferase (SCOT)." },
  extrahepatic: { label: "Selected extrahepatic tissues", note: "Heart, skeletal muscle, kidney and (after adaptation) brain oxidize ketone bodies; heart and muscle also oxidize fatty acids (the brain does not oxidize them appreciably). Red blood cells have no mitochondria and use neither." },
};

export type PathwayId = "glycolysis" | "gluconeogenesis" | "pyruvate-oxidation" | "tca" | "oxphos"
  | "fa-activation" | "carnitine-shuttle" | "beta-oxidation" | "fa-synthesis" | "ketogenesis" | "ketolysis" | "propionate" | "transamination" | "deamination" | "urea-cycle";
export const PATHWAYS: Record<PathwayId, { label: string; compartments: CompartmentId[]; summary: string }> = {
  glycolysis: { label: "Glycolysis", compartments: ["cytosol"], summary: "Glucose (C6) to two pyruvate (C3), with an ATP investment phase and a payoff phase." },
  gluconeogenesis: { label: "Gluconeogenesis", compartments: ["matrix", "inner-membrane", "cytosol", "er-lumen"], summary: "Pyruvate to glucose, sharing the reversible glycolytic steps and bypassing the three irreversible ones." },
  "pyruvate-oxidation": { label: "Pyruvate oxidation", compartments: ["matrix"], summary: "Pyruvate to acetyl-CoA by the pyruvate dehydrogenase complex; links glycolysis to the cycle." },
  tca: { label: "Citric acid cycle", compartments: ["matrix", "inner-membrane"], summary: "Acetyl-CoA is oxidized to two CO₂ while oxaloacetate is regenerated and electron carriers are reduced." },
  oxphos: { label: "Electron transport and oxidative phosphorylation", compartments: ["inner-membrane", "matrix", "ims"], summary: "Reduced carriers donate electrons to O₂; the proton gradient drives ATP synthase." },
  "fa-activation": { label: "Fatty-acid activation", compartments: ["omm", "cytosol", "matrix"], summary: "A fatty acid becomes a fatty acyl-CoA at the cost of ATP → AMP + PPi (two high-energy bonds)." },
  "carnitine-shuttle": { label: "Carnitine shuttle", compartments: ["omm", "inner-membrane", "matrix"], summary: "CPT I, the carnitine–acylcarnitine translocase and CPT II carry long-chain acyl groups into the matrix." },
  "beta-oxidation": { label: "β-Oxidation (one cycle)", compartments: ["matrix"], summary: "Dehydrogenation, hydration, dehydrogenation and thiolysis shorten the acyl-CoA by two carbons and release one acetyl-CoA." },
  "fa-synthesis": { label: "Fatty-acid synthesis (cytosolic)", compartments: ["matrix", "inner-membrane", "cytosol"], summary: "Acetyl-CoA export as citrate, acetyl-CoA carboxylase, then repeated condensation, reduction, dehydration and reduction on fatty-acid synthase." },
  ketogenesis: { label: "Ketogenesis (hepatic mitochondria)", compartments: ["matrix", "blood"], summary: "Acetyl-CoA is converted to acetoacetate and β-hydroxybutyrate, which leave the liver." },
  ketolysis: { label: "Ketolysis (extrahepatic mitochondria)", compartments: ["blood", "matrix"], summary: "Ketone bodies are converted back to acetyl-CoA by SCOT and thiolase for oxidation in the citric acid cycle." },
  propionate: { label: "Propionyl-CoA to succinyl-CoA", compartments: ["matrix"], summary: "Biotin- and B₁₂-dependent route that brings the three-carbon end of odd-chain fatty acids into the citric acid cycle." },
  transamination: { label: "Transamination", compartments: ["cytosol", "matrix"], summary: "Pyridoxal-phosphate-dependent aminotransferases move an α-amino group between an amino acid and an α-keto acid." },
  deamination: { label: "Oxidative deamination and glutamine cycling", compartments: ["matrix", "cytosol"], summary: "Glutamate dehydrogenase releases ammonium from glutamate; glutaminase and glutamine synthetase move amide nitrogen." },
  "urea-cycle": { label: "Urea cycle", compartments: ["matrix", "cytosol", "inner-membrane"], summary: "Ammonium and aspartate nitrogen become urea in five enzyme reactions split between mitochondria and cytosol." },
};

/** Where a structure comes from: `drawn` structures come from the project's RDKit build, `schematic` metabolites have no atom-level drawing here. */
export interface MetaboliteStructure { smiles: string; form: "open-chain" | "neutral-acid" | "zwitterion" }
export interface Metabolite {
  id: string; name: string; abbreviation: string;
  /** Hill formula of the bookkeeping form, null for macromolecular carriers (no atom balance is attempted). */
  formula: string | null; charge: number; carbons: number | null;
  kind: "substrate" | "intermediate" | "product" | "cofactor" | "inorganic" | "carrier";
  compartments: CompartmentId[];
  structure?: MetaboliteStructure;
  note?: string;
  /** Stage 25: for acyl-CoA / ACP derivatives `carbons` counts the acyl group only (the CoA part adds 21 C), as for acetyl-CoA and succinyl-CoA. */
  acylGroup?: boolean;
}

const ALL: CompartmentId[] = ["cytosol", "matrix"];
const met = (id: string, name: string, abbreviation: string, formula: string | null, charge: number, carbons: number | null, kind: Metabolite["kind"], compartments: CompartmentId[], structure?: MetaboliteStructure, note?: string): Metabolite =>
  ({ id, name, abbreviation, formula, charge, carbons, kind, compartments, structure, note });
const oc = (smiles: string): MetaboliteStructure => ({ smiles, form: "open-chain" });
const na = (smiles: string): MetaboliteStructure => ({ smiles, form: "neutral-acid" });

// ---- Stage 25: parametric chain-length families -----------------------------------------------------------------------------------------
// A fatty acid of n carbons, its acyl-CoA and the β-oxidation intermediates all follow one formula pattern (verified for every supported
// n by validateNetwork). The palmitate (n = 16) instance is registered in METABOLITES / REACTIONS; other lengths are generated on demand
// by metaboliteOf() and chainReaction(), so a metabolite or reaction has ONE definition and one identity at every chain length.

/** Even-carbon saturated fatty acids with a full oxidation model, and the odd-carbon lengths allowed for the propionyl-CoA special case. */
export const SUPPORTED_EVEN_CHAINS = [4, 6, 8, 10, 12, 14, 16, 18] as const;
export const SUPPORTED_ODD_CHAINS = [5, 7, 9, 11, 13, 15, 17] as const;
export type ChainKind = "fa" | "acylcoa" | "enoylcoa" | "hydroxyacylcoa" | "ketoacylcoa" | "acylcarnitine" | "cis3enoylcoa" | "acpacyl" | "acpketo" | "acphydroxy" | "acpenoyl";
const CHAIN_ID = /^(fa|acylcoa|enoylcoa|hydroxyacylcoa|ketoacylcoa|acylcarnitine|cis3enoylcoa|acp-acyl|acp-keto|acp-hydroxy|acp-enoyl)-(\d+)$/;
const KIND_OF_PREFIX: Record<string, ChainKind> = { fa: "fa", acylcoa: "acylcoa", enoylcoa: "enoylcoa", hydroxyacylcoa: "hydroxyacylcoa", ketoacylcoa: "ketoacylcoa", acylcarnitine: "acylcarnitine", cis3enoylcoa: "cis3enoylcoa", "acp-acyl": "acpacyl", "acp-keto": "acpketo", "acp-hydroxy": "acphydroxy", "acp-enoyl": "acpenoyl" };
const PREFIX_OF_KIND: Record<ChainKind, string> = { fa: "fa", acylcoa: "acylcoa", enoylcoa: "enoylcoa", hydroxyacylcoa: "hydroxyacylcoa", ketoacylcoa: "ketoacylcoa", acylcarnitine: "acylcarnitine", cis3enoylcoa: "cis3enoylcoa", acpacyl: "acp-acyl", acpketo: "acp-keto", acphydroxy: "acp-hydroxy", acpenoyl: "acp-enoyl" };
/** Stable id of a chain species. Short chains reuse the existing identities: C2 acyl-CoA is acetyl-CoA, C3 is propionyl-CoA, C4 3-ketoacyl-CoA is acetoacetyl-CoA. */
export function chainMetaboliteId(kind: ChainKind, n: number): string {
  if (kind === "acylcoa" && n === 2) return "acetylcoa";
  if (kind === "acylcoa" && n === 3) return "propionylcoa";
  if (kind === "ketoacylcoa" && n === 4) return "acetoacetylcoa";
  return PREFIX_OF_KIND[kind] + "-" + n;
}
const ACYL_NAME: Record<number, string> = { 4: "Butyryl", 6: "Hexanoyl", 8: "Octanoyl", 10: "Decanoyl", 12: "Lauroyl", 14: "Myristoyl", 16: "Palmitoyl", 18: "Stearoyl" };
export const FATTY_ACID_NAME: Record<number, string> = { 4: "Butyrate", 6: "Hexanoate (caproate)", 8: "Octanoate (caprylate)", 10: "Decanoate (caprate)", 12: "Laurate", 14: "Myristate", 16: "Palmitate", 18: "Stearate" };
const acylName = (n: number) => ACYL_NAME[n] ?? "C" + n + " acyl";
const faName = (n: number) => FATTY_ACID_NAME[n] ?? "C" + n + ":0 fatty acid";
export const isChainLength = (n: number) => Number.isInteger(n) && n >= 4 && n <= 18;
/** Hill formula of a family member (acyl-CoA family: CoA-SH + fatty acid − H₂O). */
export function chainFormula(kind: ChainKind, n: number): string {
  switch (kind) {
    case "fa": return "C" + n + "H" + 2 * n + "O2";
    case "acylcoa": return "C" + (21 + n) + "H" + (34 + 2 * n) + "N7O17P3S";
    case "enoylcoa": case "cis3enoylcoa": return "C" + (21 + n) + "H" + (32 + 2 * n) + "N7O17P3S";
    case "hydroxyacylcoa": return "C" + (21 + n) + "H" + (34 + 2 * n) + "N7O18P3S";
    case "ketoacylcoa": return "C" + (21 + n) + "H" + (32 + 2 * n) + "N7O18P3S";
    case "acylcarnitine": return "C" + (7 + n) + "H" + (13 + 2 * n) + "NO4";
    // ACP derivatives: Q is a pseudo-element standing for the whole acyl-carrier-protein part (including its phosphopantetheine sulfur), so that
    // every FAS reaction can be atom-balanced without writing a protein formula. ACP-SH is "QH".
    case "acpacyl": return "C" + n + "H" + (2 * n - 1) + "OQ";
    case "acpketo": return "C" + n + "H" + (2 * n - 3) + "O2Q";
    case "acphydroxy": return "C" + n + "H" + (2 * n - 1) + "O2Q";
    case "acpenoyl": return "C" + n + "H" + (2 * n - 3) + "OQ";
  }
}
export function chainMetabolite(kind: ChainKind, n: number): Metabolite {
  const id = chainMetaboliteId(kind, n);
  const base = { id, charge: 0, carbons: n, kind: "intermediate" as const };
  switch (kind) {
    case "fa": return { ...base, name: faName(n), abbreviation: "C" + n + ":0", formula: chainFormula(kind, n), compartments: ["cytosol", "matrix", "blood"], structure: { smiles: "C".repeat(n - 1) + "C(=O)O", form: "neutral-acid" }, note: "Drawn as the neutral free acid; at cellular pH it is the carboxylate. Saturated, unbranched, no modification." };
    case "acylcoa": return { ...base, name: acylName(n) + "-CoA", abbreviation: "C" + n + "-CoA", formula: chainFormula(kind, n), compartments: ["cytosol", "matrix"], acylGroup: true, note: "Schematic: the acyl group is C" + n + "; coenzyme A is not drawn atom by atom. The carbonyl carbon (C1) is the thioester." };
    case "enoylcoa": return { ...base, name: "trans-Δ2-Enoyl-CoA (C" + n + ")", abbreviation: "Δ2-enoyl-CoA", formula: chainFormula(kind, n), compartments: ["matrix"], acylGroup: true };
    case "cis3enoylcoa": return { ...base, name: "cis-Δ3-Enoyl-CoA (C" + n + ")", abbreviation: "cis-Δ3-enoyl-CoA", formula: chainFormula(kind, n), compartments: ["matrix"], acylGroup: true, note: "An isomer of the trans-Δ2 species; β-oxidation enzymes cannot act on it until enoyl-CoA isomerase moves the double bond." };
    case "hydroxyacylcoa": return { ...base, name: "L-3-Hydroxyacyl-CoA (C" + n + ")", abbreviation: "3-OH-acyl-CoA", formula: chainFormula(kind, n), compartments: ["matrix"], acylGroup: true };
    case "ketoacylcoa": return { ...base, name: "3-Ketoacyl-CoA (C" + n + ")", abbreviation: "3-keto-acyl-CoA", formula: chainFormula(kind, n), compartments: ["matrix"], acylGroup: true };
    case "acylcarnitine": return { ...base, name: acylName(n) + "carnitine", abbreviation: "C" + n + "-carnitine", formula: chainFormula(kind, n), compartments: ["cytosol", "ims", "matrix"], acylGroup: true, note: "Acyl group esterified to the 3-hydroxyl of carnitine; formula is the zwitterion." };
    case "acpacyl": return { ...base, name: n === 2 ? "Acetyl-ACP" : "Acyl-ACP (C" + n + ")", abbreviation: "C" + n + "-ACP", formula: chainFormula(kind, n), compartments: ["cytosol"], note: "Bound to the acyl carrier protein of fatty-acid synthase. Q in the formula stands for the whole carrier-protein part." };
    case "acpketo": return { ...base, name: "3-Ketoacyl-ACP (C" + n + ")", abbreviation: "3-keto-acyl-ACP", formula: chainFormula(kind, n), compartments: ["cytosol"] };
    case "acphydroxy": return { ...base, name: "D-3-Hydroxyacyl-ACP (C" + n + ")", abbreviation: "3-OH-acyl-ACP", formula: chainFormula(kind, n), compartments: ["cytosol"], note: "Fatty-acid synthase makes the D (R) hydroxy isomer, whereas β-oxidation uses the L (S) isomer: one reason synthesis is not oxidation run backward." };
    case "acpenoyl": return { ...base, name: "trans-Δ2-Enoyl-ACP (C" + n + ")", abbreviation: "Δ2-enoyl-ACP", formula: chainFormula(kind, n), compartments: ["cytosol"] };
  }
}
/** Registered metabolite, or a generated chain-family member; undefined for an unknown id. */
export function metaboliteOf(id: string): Metabolite | undefined {
  const known = METABOLITES_BY_ID[id];
  if (known) return known;
  const m = CHAIN_ID.exec(id);
  if (!m) return undefined;
  const n = Number(m[2]);
  return isChainLength(n) ? chainMetabolite(KIND_OF_PREFIX[m[1]], n) : undefined;
}

const AA_ONE: Record<string, string> = Object.fromEntries(AMINO_ACID_LIST.map((a) => [a.one, "aa-" + a.one]));
/** Stable id of a standard amino acid in the network ("aa-E" = glutamate); the definition comes from the Stage 17 amino-acid table. */
export const aaId = (one: string): string => AA_ONE[one];
const carbonsIn = (formula: string) => Number(/C(\d*)/.exec(formula)?.[1] || 1);
const zw = (smiles: string): MetaboliteStructure => ({ smiles, form: "zwitterion" });

const METABOLITES_25: Metabolite[] = [
  // the 20 standard amino acids, reused from Stage 17 (one definition: formula and SMILES come from the same table)
  ...AMINO_ACID_LIST.map((a) => met("aa-" + a.one, a.name, a.three, a.formula, 0, carbonsIn(a.formula), "intermediate", ["cytosol", "matrix", "blood"], na(a.smiles), a.one === "E" ? "Glutamate is the hub of amino-group collection: most α-amino groups end up on it by transamination." : a.one === "D" ? "Aspartate supplies the second nitrogen of urea and is made from oxaloacetate by transamination." : undefined)),
  met("carnitine", "L-Carnitine", "Carnitine", "C7H15NO3", 0, 7, "carrier", ["cytosol", "ims", "matrix"], zw("C[N+](C)(C)C[C@H](O)CC(=O)[O-]"), "Shown as the zwitterion (R configuration, the natural L-carnitine)."),
  chainMetabolite("fa", 16), chainMetabolite("acylcoa", 16), chainMetabolite("enoylcoa", 16), chainMetabolite("hydroxyacylcoa", 16), chainMetabolite("ketoacylcoa", 16), chainMetabolite("acylcarnitine", 16),
  chainMetabolite("acylcoa", 14), chainMetabolite("enoylcoa", 12),
  chainMetabolite("acpacyl", 2), chainMetabolite("acpacyl", 14), chainMetabolite("acpketo", 16), chainMetabolite("acphydroxy", 16), chainMetabolite("acpenoyl", 16), chainMetabolite("acpacyl", 16),
  met("propionylcoa", "Propionyl-CoA", "Prop-CoA", "C24H40N7O17P3S", 0, 3, "intermediate", ["matrix"], undefined, "Schematic. Product of the last thiolysis of an odd-chain fatty acid; also from isoleucine, valine, methionine and threonine catabolism."),
  met("acetoacetylcoa", "Acetoacetyl-CoA", "AcAc-CoA", "C25H40N7O18P3S", 0, 4, "intermediate", ["matrix"], undefined, "Schematic. The C4 3-ketoacyl-CoA: last β-oxidation intermediate of an even-chain fatty acid and first intermediate of ketogenesis."),
  met("hmgcoa", "3-Hydroxy-3-methylglutaryl-CoA", "HMG-CoA", "C27H44N7O20P3S", 0, 6, "intermediate", ["matrix"], undefined, "Schematic. Mitochondrial HMG-CoA is the ketogenic one; cytosolic HMG-CoA (cholesterol synthesis) is made by a different synthase and is not part of this model."),
  met("acetoacetate", "Acetoacetate", "AcAc", "C4H6O3", 0, 4, "intermediate", ["matrix", "cytosol", "blood"], na("CC(=O)CC(=O)O"), "A ketone body (a β-keto acid); written as the acid, the anion at cellular pH."),
  met("bhb", "D-β-Hydroxybutyrate", "β-HB", "C4H8O3", 0, 4, "intermediate", ["matrix", "cytosol", "blood"], na("C[C@@H](O)CC(=O)O"), "Chemically a hydroxy acid, not a ketone, but called a ketone body; the most abundant one in blood during fasting."),
  met("acetone", "Acetone", "Acetone", "C3H6O", 0, 3, "product", ["matrix", "blood"], na("CC(C)=O"), "Minor, non-enzymatic side product of acetoacetate; exhaled or excreted, not a fuel here."),
  met("malonylcoa", "Malonyl-CoA", "Mal-CoA", "C24H38N7O19P3S", 0, 3, "intermediate", ["cytosol"], undefined, "Schematic. The three-carbon donor of fatty-acid synthesis and the allosteric inhibitor of CPT I."),
  met("mmcoa-s", "(S)-Methylmalonyl-CoA", "(S)-MM-CoA", "C25H40N7O19P3S", 0, 4, "intermediate", ["matrix"], undefined, "Schematic. Made by propionyl-CoA carboxylase (older name: D-methylmalonyl-CoA)."),
  met("mmcoa-r", "(R)-Methylmalonyl-CoA", "(R)-MM-CoA", "C25H40N7O19P3S", 0, 4, "intermediate", ["matrix"], undefined, "Schematic. The substrate of methylmalonyl-CoA mutase (older name: L-methylmalonyl-CoA)."),
  met("cis3enoylcoa-12", "cis-Δ3-Dodecenoyl-CoA", "cis-Δ3-C12-CoA", "C33H56N7O17P3S", 0, 12, "intermediate", ["matrix"], undefined, "Schematic. Appears during oleate oxidation after three cycles."),
  met("acp", "Acyl carrier protein (ACP-SH)", "ACP-SH", "QH", 0, null, "carrier", ["cytosol"], undefined, "Macromolecular carrier with a phosphopantetheine arm. Q stands for the protein part in formulas; this lets fatty-acid synthase reactions balance atom by atom."),
  met("acp-malonyl", "Malonyl-ACP", "Mal-ACP", "C3H3O3Q", 0, 3, "intermediate", ["cytosol"]),
  met("ornithine", "L-Ornithine", "Orn", "C5H12N2O2", 0, 5, "intermediate", ["cytosol", "matrix"], na("N[C@@H](CCCN)C(=O)O"), "Not a protein amino acid; the carrier of the urea cycle, regenerated every turn."),
  met("citrulline", "L-Citrulline", "Cit(rull)", "C6H13N3O3", 0, 6, "intermediate", ["cytosol", "matrix"], na("N[C@@H](CCCNC(N)=O)C(=O)O"), "Ornithine with its δ-amino group carbamoylated."),
  met("argsucc", "Argininosuccinate", "ArgSucc", "C10H18N4O6", 0, 10, "intermediate", ["cytosol"], na("N[C@@H](CCCNC(N)=N[C@@H](CC(=O)O)C(=O)O)C(=O)O"), "Arginine whose terminal nitrogen carries the carbon skeleton of aspartate."),
  met("urea", "Urea", "Urea", "CH4N2O", 0, 1, "product", ["cytosol", "blood"], na("NC(N)=O"), "Carbon from CO₂ (via carbamoyl phosphate); one nitrogen from ammonium and one from aspartate."),
  met("cp", "Carbamoyl phosphate", "CP", "CH4NO5P", 0, 1, "intermediate", ["matrix"], na("NC(=O)OP(=O)(O)O"), "Made from CO₂, ammonium and two ATP by carbamoyl phosphate synthetase I."),
  met("nag", "N-Acetylglutamate", "NAG", "C7H11NO5", 0, 7, "intermediate", ["matrix"], na("CC(=O)N[C@@H](CCC(=O)O)C(=O)O"), "Essential allosteric activator of CPS I; made from acetyl-CoA and glutamate."),
];
export const METABOLITES: Metabolite[] = [
  met("glucose", "Glucose", "Glc", "C6H12O6", 0, 6, "substrate", ["cytosol", "er-lumen"], oc("C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O"), "Drawn as the open-chain aldehyde so the carbon chain is visible; in solution the ring forms predominate."),
  met("g6p", "Glucose 6-phosphate", "G6P", "C6H13O9P", 0, 6, "intermediate", ["cytosol", "er-lumen"], oc("C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)OP(=O)(O)O")),
  met("f6p", "Fructose 6-phosphate", "F6P", "C6H13O9P", 0, 6, "intermediate", ["cytosol"], oc("C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)OP(=O)(O)O")),
  met("f16bp", "Fructose 1,6-bisphosphate", "F1,6BP", "C6H14O12P2", 0, 6, "intermediate", ["cytosol"], oc("C([C@H]([C@H]([C@@H](C(=O)COP(=O)(O)O)O)O)O)OP(=O)(O)O")),
  met("dhap", "Dihydroxyacetone phosphate", "DHAP", "C3H7O6P", 0, 3, "intermediate", ["cytosol"], oc("C(C(=O)COP(=O)(O)O)O")),
  met("g3p", "Glyceraldehyde 3-phosphate", "G3P", "C3H7O6P", 0, 3, "intermediate", ["cytosol"], oc("C([C@H](C=O)O)OP(=O)(O)O")),
  met("bpg13", "1,3-Bisphosphoglycerate", "1,3BPG", "C3H8O10P2", 0, 3, "intermediate", ["cytosol"], oc("C([C@H](C(=O)OP(=O)(O)O)O)OP(=O)(O)O")),
  met("pg3", "3-Phosphoglycerate", "3PG", "C3H7O7P", 0, 3, "intermediate", ["cytosol"], na("C([C@H](C(=O)O)O)OP(=O)(O)O")),
  met("pg2", "2-Phosphoglycerate", "2PG", "C3H7O7P", 0, 3, "intermediate", ["cytosol"], na("C([C@H](C(=O)O)OP(=O)(O)O)O")),
  met("pep", "Phosphoenolpyruvate", "PEP", "C3H5O6P", 0, 3, "intermediate", ["cytosol"], na("C=C(OP(=O)(O)O)C(=O)O")),
  met("pyruvate", "Pyruvate", "Pyr", "C3H4O3", 0, 3, "intermediate", ["cytosol", "matrix"], na("CC(=O)C(=O)O"), "Written as pyruvic acid; it is the anion at cellular pH."),
  met("acetylcoa", "Acetyl-CoA", "AcCoA", "C23H38N7O17P3S", 0, 2, "intermediate", ["matrix", "cytosol"], undefined, "Schematic: the acetyl group (C2) is the part that enters the cycle; coenzyme A is not drawn atom by atom here."),
  met("oaa", "Oxaloacetate", "OAA", "C4H4O5", 0, 4, "intermediate", ["cytosol", "matrix"], na("O=C(O)CC(=O)C(=O)O")),
  met("citrate", "Citrate", "Cit", "C6H8O7", 0, 6, "intermediate", ["matrix", "cytosol"], na("OC(=O)CC(O)(CC(=O)O)C(=O)O")),
  met("isocitrate", "Isocitrate", "Isocit", "C6H8O7", 0, 6, "intermediate", ["matrix"], na("OC(=O)CC(C(=O)O)C(O)C(=O)O"), "Stereochemistry not shown."),
  met("akg", "α-Ketoglutarate", "α-KG", "C5H6O5", 0, 5, "intermediate", ["matrix", "cytosol"], na("O=C(O)CCC(=O)C(=O)O")),
  met("succoa", "Succinyl-CoA", "SucCoA", "C25H40N7O19P3S", 0, 4, "intermediate", ["matrix"], undefined, "Schematic: the succinyl group is C4."),
  met("succinate", "Succinate", "Suc", "C4H6O4", 0, 4, "intermediate", ["matrix"], na("O=C(O)CCC(=O)O")),
  met("fumarate", "Fumarate", "Fum", "C4H4O4", 0, 4, "intermediate", ["matrix", "cytosol"], na("O=C(O)/C=C/C(=O)O")),
  met("malate", "L-Malate", "Mal", "C4H6O5", 0, 4, "intermediate", ["cytosol", "matrix"], na("C([C@@H](C(=O)O)O)C(=O)O")),
  met("co2", "Carbon dioxide", "CO₂", "CO2", 0, 1, "inorganic", ["cytosol", "matrix"], na("O=C=O"), "Carboxylation steps are written with CO₂; textbooks that write bicarbonate show different H₂O/H⁺ counts."),
  met("h2o", "Water", "H₂O", "H2O", 0, 0, "inorganic", [...ALL, "er-lumen", "inner-membrane"], na("O")),
  met("hplus", "Proton (bookkeeping H⁺)", "H⁺", "H", 1, 0, "inorganic", [...ALL, "er-lumen", "inner-membrane"], undefined, "Explicit H⁺ in the bookkeeping convention; not the pumped protons of the respiratory chain."),
  met("pi", "Inorganic phosphate", "Pi", "H3O4P", 0, 0, "inorganic", [...ALL, "er-lumen"], na("OP(=O)(O)O")),
  met("atp", "ATP", "ATP", "C10H16N5O13P3", 0, null, "cofactor", [...ALL, "inner-membrane"]),
  met("adp", "ADP", "ADP", "C10H15N5O10P2", 0, null, "cofactor", [...ALL, "inner-membrane"]),
  met("gtp", "GTP", "GTP", "C10H16N5O14P3", 0, null, "cofactor", ALL, undefined, "GTP and ATP are energetically equivalent for this accounting (nucleoside diphosphate kinase interconverts them)."),
  met("gdp", "GDP", "GDP", "C10H15N5O11P2", 0, null, "cofactor", ALL),
  met("nad", "NAD⁺", "NAD⁺", "C21H28N7O14P2", 1, null, "cofactor", [...ALL, "inner-membrane"]),
  met("nadh", "NADH", "NADH", "C21H29N7O14P2", 0, null, "cofactor", [...ALL, "inner-membrane"]),
  // ---- Stage 25 shared carriers and inorganic species (one definition each; every pathway refers to these)
  met("nadp", "NADP⁺", "NADP⁺", "C21H29N7O17P3", 1, null, "cofactor", ["cytosol", "matrix"], undefined, "NADP⁺/NADPH is a separate pool from NAD⁺/NADH: it supplies reducing power for biosynthesis (fatty-acid synthesis) and is not interchangeable with NADH in this ledger."),
  met("nadph", "NADPH", "NADPH", "C21H30N7O17P3", 0, null, "cofactor", ["cytosol", "matrix"]),
  met("amp", "AMP", "AMP", "C10H14N5O7P", 0, null, "cofactor", ALL),
  met("ppi", "Pyrophosphate", "PPi", "H4O7P2", 0, 0, "inorganic", ALL, undefined, "Written as pyrophosphoric acid. Hydrolysis by inorganic pyrophosphatase (two Pi) makes activation effectively irreversible and is counted as a second high-energy bond."),
  met("nh4", "Ammonium", "NH₄⁺", "H4N", 1, 0, "inorganic", [...ALL, "blood"], undefined, "Free ammonium (NH₃ at higher pH); toxic at high concentration, so it is carried between tissues mainly as glutamine and alanine."),
  met("fad", "FAD", "FAD", "C27H33N9O15P2", 0, null, "cofactor", ["matrix", "inner-membrane"], undefined, "FAD is covalently bound to succinate dehydrogenase (complex II); it is shown as a free carrier only for bookkeeping."),
  met("fadh2", "FADH₂", "FADH₂", "C27H35N9O15P2", 0, null, "cofactor", ["matrix", "inner-membrane"]),
  met("coa", "Coenzyme A", "CoA-SH", "C21H36N7O16P3S", 0, null, "cofactor", ["matrix", "cytosol"]),
  met("o2", "Oxygen", "O₂", "O2", 0, 0, "inorganic", ["matrix", "inner-membrane"], na("O=O")),
  ...METABOLITES_25,
];

export const METABOLITES_BY_ID: Record<string, Metabolite> = Object.fromEntries(METABOLITES.map((m) => [m.id, m]));

export interface Enzyme { id: string; name: string; short: string; ec?: string; compartment: CompartmentId; note?: string; tissues?: TissueId[] }
const enz = (id: string, name: string, short: string, compartment: CompartmentId, ec?: string, note?: string, tissues?: TissueId[]): Enzyme => ({ id, name, short, ec, compartment, note, tissues });
const ENZYMES_25: Enzyme[] = [
  enz("acs-long", "Long-chain acyl-CoA synthetase (ACSL)", "Acyl-CoA synthetase (long chain)", "omm", "6.2.1.3", "Acts on the cytosolic face of the outer mitochondrial membrane; forms an acyl-AMP intermediate, so ATP → AMP + PPi."),
  enz("acsm", "Medium-chain acyl-CoA synthetase (ACSM)", "Acyl-CoA synthetase (medium chain)", "matrix", "6.2.1.2", "Medium- and short-chain fatty acids can reach the matrix without the carnitine shuttle and are activated there (same ATP → AMP + PPi chemistry)."),
  enz("ppase", "Inorganic pyrophosphatase", "Pyrophosphatase", "cytosol", "3.6.1.1", "Hydrolyzes PPi to two Pi; this second high-energy bond makes activation effectively irreversible."),
  enz("adk", "Adenylate kinase", "Adenylate kinase", "cytosol", "2.7.4.3", "AMP + ATP → 2 ADP: the step that shows why activation costs two ATP equivalents, since ATP → AMP leaves AMP that must be rephosphorylated twice."),
  enz("cpt1", "Carnitine palmitoyltransferase I (CPT I)", "CPT I", "omm", "2.3.1.21", "Rate-limiting entry step for long-chain fatty acids; inhibited by malonyl-CoA. Liver (CPT1A) and muscle (CPT1B) isoforms differ in malonyl-CoA sensitivity."),
  enz("cact", "Carnitine–acylcarnitine translocase (CACT, SLC25A20)", "Translocase", "inner-membrane", undefined, "A transporter, not a catalytic step: exchanges acylcarnitine (in) for free carnitine (out)."),
  enz("cpt2", "Carnitine palmitoyltransferase II (CPT II)", "CPT II", "inner-membrane", "2.3.1.21", "Active site on the matrix face of the inner membrane; regenerates acyl-CoA and free carnitine."),
  enz("acad", "Acyl-CoA dehydrogenase (chain-length-specific isoenzymes)", "Acyl-CoA dehydrogenase", "matrix", "1.3.8.7 / 1.3.8.8 / 1.3.8.9", "Very-long-, medium- and short-chain isoenzymes (VLCAD, MCAD, SCAD) with overlapping chain-length ranges; FAD is bound and re-oxidized through electron-transferring flavoprotein (ETF) and ETF:ubiquinone oxidoreductase."),
  enz("ech", "Enoyl-CoA hydratase (crotonase)", "Enoyl-CoA hydratase", "matrix", "4.2.1.17", "Adds water across the trans-Δ2 double bond to give the L-3-hydroxy isomer."),
  enz("hadh", "L-3-Hydroxyacyl-CoA dehydrogenase", "Hydroxyacyl-CoA dehydrogenase", "matrix", "1.1.1.35", "NAD⁺-dependent; specific for the L-hydroxy isomer."),
  enz("thiolase", "3-Ketoacyl-CoA thiolase", "Thiolase", "matrix", "2.3.1.16", "Cleaves the C2–C3 bond with a second CoA (thiolysis), releasing acetyl-CoA."),
  enz("acat", "Acetyl-CoA acetyltransferase (thiolase II, ACAT1)", "ACAT (thiolase)", "matrix", "2.3.1.9", "Reversible: condenses two acetyl-CoA to acetoacetyl-CoA (ketogenesis) or cleaves it (β-oxidation's last step and ketolysis)."),
  enz("eci", "Enoyl-CoA isomerase", "Enoyl-CoA isomerase", "matrix", "5.3.3.8", "Moves a cis-Δ3 double bond to the trans-Δ2 position so that hydratase can act (needed for oleate)."),
  enz("cit-carrier", "Mitochondrial citrate carrier (transport)", "Citrate carrier", "inner-membrane", undefined, "A transporter: exports citrate (with a proton or malate) so that acetyl-CoA can be rebuilt in the cytosol."),
  enz("acly", "ATP-citrate lyase", "ATP-citrate lyase", "cytosol", "2.3.3.8", "Citrate + CoA + ATP → acetyl-CoA + oxaloacetate + ADP + Pi: the cytosolic source of acetyl-CoA for fatty-acid synthesis."),
  enz("me1", "Malic enzyme (cytosolic, NADP⁺-dependent)", "Malic enzyme", "cytosol", "1.1.1.40", "One NADPH-producing step; the pentose phosphate pathway (not modelled) is the other main source."),
  enz("acc", "Acetyl-CoA carboxylase (ACC)", "Acetyl-CoA carboxylase", "cytosol", "6.4.1.2", "Biotin-dependent; the committed, regulated step of fatty-acid synthesis. Activated by citrate and by insulin-linked dephosphorylation; inhibited by phosphorylation (AMPK, PKA) and by long-chain acyl-CoA."),
  enz("fas", "Fatty-acid synthase (FAS)", "Fatty-acid synthase", "cytosol", "2.3.1.85", "One large multifunctional protein in animals with separate domains for acyl transfer, ketoacyl synthase (KS), ketoacyl reductase (KR), dehydratase (DH), enoyl reductase (ER) and thioesterase (TE)."),
  enz("hmgcs2", "HMG-CoA synthase (mitochondrial, HMGCS2)", "HMG-CoA synthase", "matrix", "2.3.3.10", "Rate-controlling step of ketogenesis; abundant in liver (also in kidney and intestine).", ["liver"]),
  enz("hmgcl", "HMG-CoA lyase", "HMG-CoA lyase", "matrix", "4.1.3.4", "Releases acetoacetate and acetyl-CoA from HMG-CoA.", ["liver"]),
  enz("bdh1", "D-β-Hydroxybutyrate dehydrogenase (BDH1)", "β-Hydroxybutyrate dehydrogenase", "matrix", "1.1.1.30", "Interconverts acetoacetate and β-hydroxybutyrate with NADH/NAD⁺; the direction follows the mitochondrial NADH/NAD⁺ ratio."),
  enz("scot", "Succinyl-CoA:3-oxoacid CoA-transferase (SCOT, OXCT1)", "SCOT (OXCT1)", "matrix", "2.8.3.5", "Transfers CoA from succinyl-CoA to acetoacetate. Hepatocytes have very little of it, so the liver makes ketone bodies but cannot burn them.", ["extrahepatic"]),
  enz("spontaneous", "Spontaneous (non-enzymatic) decarboxylation", "Spontaneous", "matrix", undefined, "β-Keto acids lose CO₂ without an enzyme (slowly); no mammalian enzyme is shown for acetone formation here."),
  enz("mct", "Monocarboxylate transporters (transport)", "MCT carriers", "inner-membrane", undefined, "Teaching shorthand for the mitochondrial and plasma-membrane carriers that move ketone bodies; their kinetics are not modelled."),
  enz("pcc", "Propionyl-CoA carboxylase", "Propionyl-CoA carboxylase", "matrix", "6.4.1.3", "Biotin-dependent; spends one ATP.", undefined),
  enz("mcee", "Methylmalonyl-CoA epimerase", "Methylmalonyl-CoA epimerase", "matrix", "5.1.99.1", "Converts the (S) to the (R) isomer."),
  enz("mut", "Methylmalonyl-CoA mutase", "Methylmalonyl-CoA mutase", "matrix", "5.4.99.2", "Requires adenosylcobalamin (vitamin B₁₂); rearranges the carbon skeleton to succinyl-CoA."),
  enz("alt", "Alanine aminotransferase (ALT)", "ALT", "cytosol", "2.6.1.2", "Pyridoxal-phosphate (vitamin B₆) dependent; reversible. In muscle it collects amino groups as alanine; in liver it returns them to glutamate."),
  enz("ast", "Aspartate aminotransferase (AST)", "AST", "cytosol", "2.6.1.1", "Pyridoxal-phosphate dependent; cytosolic and mitochondrial isoenzymes. Links oxaloacetate/aspartate to α-ketoglutarate/glutamate."),
  enz("gdh", "Glutamate dehydrogenase (GDH)", "Glutamate dehydrogenase", "matrix", "1.4.1.3", "Mitochondrial; accepts NAD⁺ or NADP⁺. Reversible: oxidative deamination releases NH₄⁺, while high ammonium can drive reductive amination."),
  enz("gls", "Glutaminase", "Glutaminase", "matrix", "3.5.1.2", "Hydrolyzes the amide nitrogen of glutamine to NH₄⁺ (kidney, intestine, liver)."),
  enz("gs", "Glutamine synthetase", "Glutamine synthetase", "cytosol", "6.3.1.2", "Binds ammonium into glutamine at the cost of ATP; a main route for non-toxic ammonium transport."),
  enz("cps1", "Carbamoyl phosphate synthetase I (CPS I)", "CPS I", "matrix", "6.3.4.16", "Mitochondrial; needs N-acetylglutamate as an allosteric activator. The committed step of the urea cycle (not the cytosolic CPS II of pyrimidine synthesis).", ["liver"]),
  enz("otc", "Ornithine transcarbamylase (OTC)", "OTC", "matrix", "2.1.3.3", "Transfers the carbamoyl group of carbamoyl phosphate to ornithine.", ["liver"]),
  enz("ass", "Argininosuccinate synthetase", "Argininosuccinate synthetase", "cytosol", "6.3.4.5", "Joins citrulline to aspartate; ATP → AMP + PPi (two high-energy bonds).", ["liver"]),
  enz("asl", "Argininosuccinate lyase", "Argininosuccinate lyase", "cytosol", "4.3.2.1", "Cleaves argininosuccinate into arginine and fumarate.", ["liver"]),
  enz("arg1", "Arginase 1", "Arginase", "cytosol", "3.5.3.1", "Hydrolyzes arginine to urea and ornithine; the urea-releasing step.", ["liver"]),
  enz("ornt1", "Ornithine/citrulline carrier (ORNT1, transport)", "Ornithine carrier", "inner-membrane", undefined, "A transporter: exchanges cytosolic ornithine for matrix citrulline across the inner membrane."),
  enz("nags", "N-Acetylglutamate synthase (NAGS)", "NAGS", "matrix", "2.3.1.1", "Makes the allosteric activator of CPS I from acetyl-CoA and glutamate; arginine stimulates it.", ["liver"]),
  enz("bcat", "Branched-chain aminotransferase (BCAT)", "BCAT", "matrix", "2.6.1.42", "PLP-dependent; transaminates leucine, isoleucine and valine, mainly in extrahepatic tissues (muscle)."),
  enz("tat", "Tyrosine aminotransferase (TAT)", "TAT", "cytosol", "2.6.1.5", "PLP-dependent; liver enzyme that transaminates tyrosine."),
  enz("fum-c", "Fumarase (cytosolic isoform)", "Cytosolic fumarase", "cytosol", "4.2.1.2", "Cytosolic copy of the citric-acid-cycle enzyme; converts urea-cycle fumarate to malate."),
];

export const ENZYMES: Enzyme[] = [
  enz("hk", "Hexokinase / glucokinase", "Hexokinase", "cytosol", "2.7.1.1 / 2.7.1.2", "Hexokinase is inhibited by its product G6P; liver glucokinase has a higher Km for glucose and is not product-inhibited by G6P."),
  enz("pgi", "Phosphoglucose isomerase", "PGI", "cytosol", "5.3.1.9"),
  enz("pfk1", "Phosphofructokinase-1", "PFK-1", "cytosol", "2.7.1.11"),
  enz("fbpase1", "Fructose-1,6-bisphosphatase", "FBPase-1", "cytosol", "3.1.3.11"),
  enz("aldolase", "Aldolase", "Aldolase", "cytosol", "4.1.2.13"),
  enz("tpi", "Triose phosphate isomerase", "TPI", "cytosol", "5.3.1.1"),
  enz("gapdh", "Glyceraldehyde-3-phosphate dehydrogenase", "GAPDH", "cytosol", "1.2.1.12"),
  enz("pgk", "Phosphoglycerate kinase", "PGK", "cytosol", "2.7.2.3"),
  enz("pgm", "Phosphoglycerate mutase", "PGM", "cytosol", "5.4.2.11"),
  enz("eno", "Enolase", "Enolase", "cytosol", "4.2.1.11"),
  enz("pk", "Pyruvate kinase", "PK", "cytosol", "2.7.1.40"),
  enz("pc", "Pyruvate carboxylase", "PC", "matrix", "6.4.1.1", "Biotin-dependent; activated allosterically by acetyl-CoA."),
  enz("pepck", "Phosphoenolpyruvate carboxykinase", "PEPCK", "cytosol", "4.1.1.32", "Cytosolic and mitochondrial isoforms exist; the cytosolic route is drawn."),
  enz("g6pase", "Glucose-6-phosphatase", "G6Pase", "er-lumen", "3.1.3.9", "Present mainly in liver, kidney cortex and intestine; muscle lacks it and cannot release free glucose."),
  enz("mdh-m", "Malate dehydrogenase (mitochondrial)", "MDH2", "matrix", "1.1.1.37"),
  enz("mdh-c", "Malate dehydrogenase (cytosolic)", "MDH1", "cytosol", "1.1.1.37"),
  enz("mal-carrier", "Mitochondrial malate carrier (transport)", "Malate carrier", "inner-membrane", undefined, "A transporter, not a catalytic step; shown so the compartment change is explicit."),
  enz("pdh", "Pyruvate dehydrogenase complex", "PDH complex", "matrix", "1.2.4.1 (E1), 2.3.1.12 (E2), 1.8.1.4 (E3)", "Three enzymes (E1, E2, E3) with five coenzymes: TPP, lipoate, CoA, FAD and NAD⁺."),
  enz("cs", "Citrate synthase", "Citrate synthase", "matrix", "2.3.3.1"),
  enz("aco", "Aconitase", "Aconitase", "matrix", "4.2.1.3", "Proceeds through the enzyme-bound intermediate cis-aconitate."),
  enz("idh", "Isocitrate dehydrogenase (NAD⁺-dependent)", "IDH3", "matrix", "1.1.1.41"),
  enz("akgdh", "α-Ketoglutarate dehydrogenase complex", "α-KGDH", "matrix", "1.2.4.2 / 2.3.1.61 / 1.8.1.4", "Mechanistically parallel to the pyruvate dehydrogenase complex."),
  enz("scs", "Succinyl-CoA synthetase", "SCS", "matrix", "6.2.1.4 / 6.2.1.5", "Isoforms make GTP or ATP; the cycle output is counted as one GTP/ATP equivalent."),
  enz("sdh", "Succinate dehydrogenase (complex II)", "SDH", "inner-membrane", "1.3.5.1", "The only cycle enzyme embedded in the inner membrane; it is complex II of the respiratory chain."),
  enz("fum", "Fumarase", "Fumarase", "matrix", "4.2.1.2"),
  enz("cI", "Complex I (NADH:ubiquinone oxidoreductase)", "Complex I", "inner-membrane", "7.1.1.2"),
  enz("cIII", "Complex III (cytochrome bc1)", "Complex III", "inner-membrane", "7.1.1.8"),
  enz("cIV", "Complex IV (cytochrome c oxidase)", "Complex IV", "inner-membrane", "7.1.1.9"),
  enz("atpsyn", "ATP synthase (complex V)", "ATP synthase", "inner-membrane", "7.1.2.2"),
  ...ENZYMES_25,
];
export const ENZYMES_BY_ID: Record<string, Enzyme> = Object.fromEntries(ENZYMES.map((e) => [e.id, e]));

export type Reversibility = "reversible" | "irreversible";
export interface Participant { met: string; n: number }
export interface PathwayRole {
  pathway: PathwayId;
  /** 1-based position in that pathway's teaching order. */
  step: number;
  /** How many times the reaction happens per glucose (glycolysis steps 6-10 happen twice; per-glucose accounting). */
  perGlucose: number;
  /** `reverse` = the pathway runs the reaction from products to substrates. */
  direction: "forward" | "reverse";
}
export interface Reaction {
  id: string; name: string; enzyme: string; compartment: CompartmentId;
  substrates: Participant[]; products: Participant[];
  reversibility: Reversibility;
  roles: PathwayRole[];
  /** What changes in the molecule, and why the step matters. */
  transformation: string; purpose: string;
  /** Substrate-level phosphorylation, regulatory step, etc. */
  tags?: Array<"substrate-level-phosphorylation" | "regulatory" | "bypass" | "transport" | "oxidative-decarboxylation" | "redox" | "isomerization" | "cleavage" | "carbon-fixation">;
  /** Respiratory-chain reactions only: protons translocated across the inner membrane per reaction event. */
  protonsPumped?: number;
  /** Stage 25: movement between compartments, when a participant is the same molecule on both sides (transport steps change location, not atoms). */
  transport?: Array<{ met: string; from: CompartmentId; to: CompartmentId }>;
  /** Stage 25: tissues in which the step is considered active in this model (default: every cell type that has the enzyme). */
  tissues?: TissueId[];
  /** Stage 25: this reaction is an alternative cofactor variant or a side branch of the named reaction (e.g. GDH with NADP⁺, acetone formation); it is excluded from pathway sums so nothing is counted twice. */
  branchOf?: string;
}
const P = (met: string, n = 1): Participant => ({ met, n });
const role = (pathway: PathwayId, step: number, perGlucose: number, direction: "forward" | "reverse" = "forward"): PathwayRole => ({ pathway, step, perGlucose, direction });

const REACTIONS_18: Reaction[] = [
  // ---- glycolysis (cytosol)
  { id: "HK", name: "Hexokinase / glucokinase", enzyme: "hk", compartment: "cytosol", substrates: [P("glucose"), P("atp")], products: [P("g6p"), P("adp")], reversibility: "irreversible", roles: [role("glycolysis", 1, 1)], tags: ["regulatory"],
    transformation: "A phosphoryl group moves from ATP to the C6 hydroxyl of glucose.", purpose: "Traps glucose in the cell as a charged phosphate ester and commits it to metabolism (investment phase, −1 ATP)." },
  { id: "PGI", name: "Phosphoglucose isomerase", enzyme: "pgi", compartment: "cytosol", substrates: [P("g6p")], products: [P("f6p")], reversibility: "reversible", roles: [role("glycolysis", 2, 1), role("gluconeogenesis", 13, 1, "reverse")], tags: ["isomerization"],
    transformation: "The aldose (glucose 6-phosphate) becomes the ketose (fructose 6-phosphate): the carbonyl moves from C1 to C2.", purpose: "Sets up a C1 hydroxyl that can accept a second phosphate and a C2 ketone that allows aldolase cleavage into two C3 units." },
  { id: "PFK1", name: "Phosphofructokinase-1", enzyme: "pfk1", compartment: "cytosol", substrates: [P("f6p"), P("atp")], products: [P("f16bp"), P("adp")], reversibility: "irreversible", roles: [role("glycolysis", 3, 1)], tags: ["regulatory"],
    transformation: "A second phosphoryl group moves from ATP to C1 of fructose 6-phosphate.", purpose: "The main committed, regulated step of glycolysis (investment phase, −1 ATP); integrates ATP, AMP and fructose 2,6-bisphosphate signals." },
  { id: "ALDO", name: "Aldolase", enzyme: "aldolase", compartment: "cytosol", substrates: [P("f16bp")], products: [P("dhap"), P("g3p")], reversibility: "reversible", roles: [role("glycolysis", 4, 1), role("gluconeogenesis", 11, 1, "reverse")], tags: ["cleavage"],
    transformation: "The C3–C4 bond is cleaved: one C6 bisphosphate becomes two C3 phosphates (DHAP and glyceraldehyde 3-phosphate).", purpose: "Splits the sugar so that all later steps work on C3 units." },
  { id: "TPI", name: "Triose phosphate isomerase", enzyme: "tpi", compartment: "cytosol", substrates: [P("dhap")], products: [P("g3p")], reversibility: "reversible", roles: [role("glycolysis", 5, 1), role("gluconeogenesis", 10, 1, "reverse")], tags: ["isomerization"],
    transformation: "The ketose DHAP is converted to the aldose glyceraldehyde 3-phosphate.", purpose: "Lets the second triose enter the payoff phase: one glucose yields two glyceraldehyde 3-phosphate molecules." },
  { id: "GAPDH", name: "Glyceraldehyde-3-phosphate dehydrogenase", enzyme: "gapdh", compartment: "cytosol", substrates: [P("g3p"), P("pi"), P("nad")], products: [P("bpg13"), P("nadh"), P("hplus")], reversibility: "reversible", roles: [role("glycolysis", 6, 2), role("gluconeogenesis", 9, 2, "reverse")], tags: ["redox"],
    transformation: "The aldehyde is oxidized to an acyl phosphate (a high-energy mixed anhydride); NAD⁺ is reduced to NADH and inorganic phosphate is incorporated.", purpose: "Captures the oxidation energy in 1,3-bisphosphoglycerate and in NADH, with no ATP spent (payoff phase)." },
  { id: "PGK", name: "Phosphoglycerate kinase", enzyme: "pgk", compartment: "cytosol", substrates: [P("bpg13"), P("adp")], products: [P("pg3"), P("atp")], reversibility: "reversible", roles: [role("glycolysis", 7, 2), role("gluconeogenesis", 8, 2, "reverse")], tags: ["substrate-level-phosphorylation"],
    transformation: "The acyl phosphate of 1,3-bisphosphoglycerate transfers its phosphoryl group to ADP.", purpose: "First substrate-level phosphorylation: it repays the ATP invested (+1 ATP per triose, +2 per glucose)." },
  { id: "PGM", name: "Phosphoglycerate mutase", enzyme: "pgm", compartment: "cytosol", substrates: [P("pg3")], products: [P("pg2")], reversibility: "reversible", roles: [role("glycolysis", 8, 2), role("gluconeogenesis", 7, 2, "reverse")], tags: ["isomerization"],
    transformation: "The phosphate moves from C3 to C2.", purpose: "Positions the phosphate so that dehydration can create a high-energy enol phosphate." },
  { id: "ENO", name: "Enolase", enzyme: "eno", compartment: "cytosol", substrates: [P("pg2")], products: [P("pep"), P("h2o")], reversibility: "reversible", roles: [role("glycolysis", 9, 2), role("gluconeogenesis", 6, 2, "reverse")],
    transformation: "Dehydration of 2-phosphoglycerate creates the enol phosphate phosphoenolpyruvate.", purpose: "Converts a low-energy phosphate ester into a very high phosphoryl-transfer-potential compound." },
  { id: "PK", name: "Pyruvate kinase", enzyme: "pk", compartment: "cytosol", substrates: [P("pep"), P("adp")], products: [P("pyruvate"), P("atp")], reversibility: "irreversible", roles: [role("glycolysis", 10, 2)], tags: ["regulatory", "substrate-level-phosphorylation"],
    transformation: "The phosphoryl group of PEP moves to ADP; the enol of pyruvate tautomerizes to the keto form.", purpose: "Second substrate-level phosphorylation (+1 ATP per triose, +2 per glucose); a regulated, effectively irreversible step." },
  // ---- gluconeogenic bypasses and shuttle
  { id: "PC", name: "Pyruvate carboxylase", enzyme: "pc", compartment: "matrix", substrates: [P("pyruvate"), P("co2"), P("h2o"), P("atp")], products: [P("oaa"), P("adp"), P("pi")], reversibility: "irreversible", roles: [role("gluconeogenesis", 1, 2)], tags: ["bypass", "regulatory", "carbon-fixation"],
    transformation: "Biotin-dependent carboxylation adds one carbon (as CO₂) to the C3 pyruvate, giving the C4 oxaloacetate.", purpose: "First bypass of pyruvate kinase; costs one ATP and is activated by acetyl-CoA." },
  { id: "MAL-T", name: "Malate export (matrix → cytosol)", enzyme: "mal-carrier", compartment: "inner-membrane", substrates: [P("malate")], products: [P("malate")], reversibility: "reversible", roles: [role("gluconeogenesis", 3, 2)], tags: ["transport"],
    transformation: "No bond changes: malate crosses the inner mitochondrial membrane.", purpose: "Oxaloacetate cannot cross the membrane directly, so malate carries both carbon and reducing equivalents to the cytosol." },
  { id: "MDH-C", name: "Malate dehydrogenase (cytosolic)", enzyme: "mdh-c", compartment: "cytosol", substrates: [P("malate"), P("nad")], products: [P("oaa"), P("nadh"), P("hplus")], reversibility: "reversible", roles: [role("gluconeogenesis", 4, 2), role("fa-synthesis", 3, 1, "reverse")], tags: ["redox"],
    transformation: "Malate is oxidized back to oxaloacetate in the cytosol.", purpose: "Regenerates cytosolic oxaloacetate and the cytosolic NADH that the glyceraldehyde-3-phosphate dehydrogenase reaction needs in reverse." },
  { id: "PEPCK", name: "Phosphoenolpyruvate carboxykinase", enzyme: "pepck", compartment: "cytosol", substrates: [P("oaa"), P("gtp")], products: [P("pep"), P("gdp"), P("co2")], reversibility: "irreversible", roles: [role("gluconeogenesis", 5, 2)], tags: ["bypass"],
    transformation: "Oxaloacetate is decarboxylated and phosphorylated by GTP, giving PEP and CO₂.", purpose: "Second half of the pyruvate kinase bypass; the CO₂ added by pyruvate carboxylase leaves here (costs one GTP)." },
  { id: "FBP1", name: "Fructose-1,6-bisphosphatase", enzyme: "fbpase1", compartment: "cytosol", substrates: [P("f16bp"), P("h2o")], products: [P("f6p"), P("pi")], reversibility: "irreversible", roles: [role("gluconeogenesis", 12, 1)], tags: ["bypass", "regulatory"],
    transformation: "Hydrolysis removes the C1 phosphate as Pi.", purpose: "Bypasses PFK-1; it releases the phosphate as Pi (no ATP is made), so reversing PFK-1 chemistry is not 'running the kinase backward'." },
  { id: "G6PASE", name: "Glucose-6-phosphatase", enzyme: "g6pase", compartment: "er-lumen", substrates: [P("g6p"), P("h2o")], products: [P("glucose"), P("pi")], reversibility: "irreversible", roles: [role("gluconeogenesis", 14, 1)], tags: ["bypass"],
    transformation: "Hydrolysis removes the C6 phosphate as Pi.", purpose: "Bypasses hexokinase and releases free glucose; it works on the lumenal side of the endoplasmic reticulum after G6P is transported in." },
  // ---- pyruvate oxidation
  { id: "PDH", name: "Pyruvate dehydrogenase complex", enzyme: "pdh", compartment: "matrix", substrates: [P("pyruvate"), P("coa"), P("nad")], products: [P("acetylcoa"), P("co2"), P("nadh"), P("hplus")], reversibility: "irreversible", roles: [role("pyruvate-oxidation", 1, 2)], tags: ["oxidative-decarboxylation", "regulatory"],
    transformation: "Pyruvate (C3) loses its carboxyl as CO₂; the remaining acetyl group (C2) is oxidized and transferred to CoA while NAD⁺ is reduced.", purpose: "Links glycolysis to the cycle. Irreversible in animals: acetyl-CoA cannot be turned back into pyruvate, so fatty acids cannot become glucose." },
  // ---- citric acid cycle (matrix)
  { id: "CS", name: "Citrate synthase", enzyme: "cs", compartment: "matrix", substrates: [P("acetylcoa"), P("oaa"), P("h2o")], products: [P("citrate"), P("coa")], reversibility: "irreversible", roles: [role("tca", 1, 2)], tags: ["regulatory"],
    transformation: "The acetyl group (C2) condenses with oxaloacetate (C4) to give citrate (C6); the thioester is hydrolyzed, releasing CoA.", purpose: "Brings two new carbons into the cycle; the thioester hydrolysis makes the step strongly favorable." },
  { id: "ACO", name: "Aconitase", enzyme: "aco", compartment: "matrix", substrates: [P("citrate")], products: [P("isocitrate")], reversibility: "reversible", roles: [role("tca", 2, 2)], tags: ["isomerization"],
    transformation: "Dehydration to cis-aconitate and rehydration moves the hydroxyl from the tertiary to a secondary carbon.", purpose: "Turns the tertiary alcohol of citrate into a secondary alcohol that can be oxidized." },
  { id: "IDH", name: "Isocitrate dehydrogenase", enzyme: "idh", compartment: "matrix", substrates: [P("isocitrate"), P("nad")], products: [P("akg"), P("co2"), P("nadh"), P("hplus")], reversibility: "irreversible", roles: [role("tca", 3, 2)], tags: ["oxidative-decarboxylation", "regulatory"],
    transformation: "The hydroxyl is oxidized to a ketone and a carboxyl leaves as CO₂ (C6 → C5).", purpose: "First CO₂ and first NADH of the cycle; a major regulated step." },
  { id: "AKGDH", name: "α-Ketoglutarate dehydrogenase complex", enzyme: "akgdh", compartment: "matrix", substrates: [P("akg"), P("coa"), P("nad")], products: [P("succoa"), P("co2"), P("nadh"), P("hplus")], reversibility: "irreversible", roles: [role("tca", 4, 2)], tags: ["oxidative-decarboxylation", "regulatory"],
    transformation: "Oxidative decarboxylation (C5 → C4) with CoA attachment, in the same way as pyruvate dehydrogenase.", purpose: "Second CO₂ and second NADH of the cycle; the carbons lost in these two steps are not the carbons of the acetyl group that entered in the same turn." },
  { id: "SCS", name: "Succinyl-CoA synthetase", enzyme: "scs", compartment: "matrix", substrates: [P("succoa"), P("gdp"), P("pi")], products: [P("succinate"), P("coa"), P("gtp")], reversibility: "reversible", roles: [role("tca", 5, 2)], tags: ["substrate-level-phosphorylation"],
    transformation: "The high-energy thioester drives phosphorylation of GDP (or ADP) through an enzyme-bound phosphohistidine.", purpose: "The cycle's only substrate-level phosphorylation: one GTP/ATP equivalent per turn." },
  { id: "SDH", name: "Succinate dehydrogenase (complex II)", enzyme: "sdh", compartment: "inner-membrane", substrates: [P("succinate"), P("fad")], products: [P("fumarate"), P("fadh2")], reversibility: "reversible", roles: [role("tca", 6, 2)], tags: ["redox"],
    transformation: "Succinate is oxidized to fumarate (a trans C=C bond forms); the electrons reduce bound FAD to FADH₂ and pass to coenzyme Q.", purpose: "The cycle's FADH₂ source and complex II of the respiratory chain: the one point where cycle and chain are the same protein." },
  { id: "FUM", name: "Fumarase", enzyme: "fum", compartment: "matrix", substrates: [P("fumarate"), P("h2o")], products: [P("malate")], reversibility: "reversible", roles: [role("tca", 7, 2)],
    transformation: "Water adds across the C=C bond of fumarate, giving L-malate.", purpose: "Prepares a secondary alcohol that can be oxidized to regenerate oxaloacetate." },
  { id: "MDH-M", name: "Malate dehydrogenase (mitochondrial)", enzyme: "mdh-m", compartment: "matrix", substrates: [P("malate"), P("nad")], products: [P("oaa"), P("nadh"), P("hplus")], reversibility: "reversible", roles: [role("tca", 8, 2), role("gluconeogenesis", 2, 2, "reverse")], tags: ["redox"],
    transformation: "L-malate is oxidized to oxaloacetate; NAD⁺ is reduced.", purpose: "Cycle direction: regenerates oxaloacetate so the cycle can accept another acetyl group (third NADH of the turn; thermodynamically uphill, pulled forward by citrate synthase). Gluconeogenesis runs it in reverse, reducing oxaloacetate to malate so it can leave the matrix." },
  // ---- respiratory chain, as overall (net) reactions; the complex-by-complex chain is in etc.ts
  { id: "ETC-NADH", name: "NADH oxidation by O₂ (complexes I, III, IV)", enzyme: "cI", compartment: "inner-membrane", substrates: [P("nadh"), P("hplus"), P("o2", 0.5)], products: [P("nad"), P("h2o")], reversibility: "irreversible", roles: [role("oxphos", 1, 10)], protonsPumped: 10,
    transformation: "Two electrons pass from NADH through complex I, coenzyme Q, complex III, cytochrome c and complex IV to ½ O₂, forming water.", purpose: "Releases the free energy that pumps about 10 H⁺ across the inner membrane per electron pair (a teaching approximation)." },
  { id: "ETC-FADH2", name: "FADH₂ / succinate oxidation by O₂ (complexes II, III, IV)", enzyme: "sdh", compartment: "inner-membrane", substrates: [P("fadh2"), P("o2", 0.5)], products: [P("fad"), P("h2o")], reversibility: "irreversible", roles: [role("oxphos", 2, 2)], protonsPumped: 6,
    transformation: "Two electrons enter at complex II (not complex I) and pass through coenzyme Q, complex III, cytochrome c and complex IV to ½ O₂.", purpose: "Complex II pumps no protons, so only about 6 H⁺ are translocated per electron pair." },
  { id: "ATPSYN", name: "ATP synthase", enzyme: "atpsyn", compartment: "inner-membrane", substrates: [P("adp"), P("pi")], products: [P("atp"), P("h2o")], reversibility: "reversible", roles: [role("oxphos", 3, 1)],
    transformation: "Proton flow back through the F₀ rotor turns the central stalk, and the F₁ head joins ADP and Pi.", purpose: "Uses the proton-motive force to make ATP. The ATP count per electron pair depends on how many protons are needed per ATP (about 4 including phosphate transport, an approximation)." },
];

// ---- Stage 25: chain-dependent reactions (activation, carnitine shuttle, β-oxidation, fatty-acid synthase rounds) ---------------------------------

export type ChainBase = "ACS" | "CPT1" | "CACT" | "CPT2" | "ACAD" | "ECH" | "HADH" | "THIOL";
export const CHAIN_BASES: ChainBase[] = ["ACS", "CPT1", "CACT", "CPT2", "ACAD", "ECH", "HADH", "THIOL"];
export type FasBase = "KS" | "KR" | "DH" | "ER" | "TE";
export const FAS_BASES: FasBase[] = ["KS", "KR", "DH", "ER", "TE"];
/** Carnitine-shuttle requirement by chain length (curated, approximate): short and medium chains reach the matrix without it. */
export const carnitineRequirement = (n: number): "no" | "partly" | "yes" => (n <= 10 ? "no" : n <= 12 ? "partly" : "yes");
const cm = chainMetaboliteId;

function buildChainReaction(base: ChainBase, n: number): Reaction {
  const id = base + ":" + n;
  const c = "C" + n;
  switch (base) {
    case "ACS": {
      const medium = n <= 10;
      return { id, name: (medium ? "Medium-chain" : "Long-chain") + " acyl-CoA synthetase (" + c + ")", enzyme: medium ? "acsm" : "acs-long", compartment: medium ? "matrix" : "omm",
        substrates: [P(cm("fa", n)), P("atp"), P("coa")], products: [P(cm("acylcoa", n)), P("amp"), P("ppi")], reversibility: "reversible", roles: [role("fa-activation", 1, 1)],
        transformation: "The fatty acid's carboxylate attacks ATP (giving an acyl-AMP and PPi); CoA-SH then displaces AMP to form the thioester. Net: ATP → AMP + PPi.",
        purpose: "Makes the fatty acid a CoA thioester that the oxidation enzymes recognize. ATP is split to AMP + PPi, so this step uses two high-energy bonds once PPi is hydrolyzed (see the next steps)." };
    }
    case "CPT1": return { id, name: "Carnitine palmitoyltransferase I (" + c + ")", enzyme: "cpt1", compartment: "omm", substrates: [P(cm("acylcoa", n)), P("carnitine")], products: [P(cm("acylcarnitine", n)), P("coa")], reversibility: "reversible", roles: [role("carnitine-shuttle", 1, 1)], tags: ["regulatory"],
      transformation: "The acyl group moves from CoA to the 3-hydroxyl of carnitine (an acyl exchange, not a new bond-energy investment).", purpose: "Lets a long-chain acyl group cross the intermembrane space. Malonyl-CoA inhibits this step, which is how fatty-acid synthesis switches off oxidation." };
    case "CACT": return { id, name: "Carnitine–acylcarnitine translocase (" + c + ")", enzyme: "cact", compartment: "inner-membrane", substrates: [P(cm("acylcarnitine", n)), P("carnitine")], products: [P("carnitine"), P(cm("acylcarnitine", n))], reversibility: "reversible", roles: [role("carnitine-shuttle", 2, 1)], tags: ["transport"],
      transport: [{ met: cm("acylcarnitine", n), from: "ims", to: "matrix" }, { met: "carnitine", from: "matrix", to: "ims" }],
      transformation: "No bonds change: acylcarnitine enters the matrix in exchange for one free carnitine leaving.", purpose: "Because it is an antiport, the matrix carnitine pool is replenished by CPT II's product and the exchange runs only while acylcarnitine is supplied." };
    case "CPT2": return { id, name: "Carnitine palmitoyltransferase II (" + c + ")", enzyme: "cpt2", compartment: "matrix", substrates: [P(cm("acylcarnitine", n)), P("coa")], products: [P(cm("acylcoa", n)), P("carnitine")], reversibility: "reversible", roles: [role("carnitine-shuttle", 3, 1)],
      transformation: "The acyl group moves from carnitine back to a mitochondrial CoA.", purpose: "Regenerates the acyl-CoA inside the matrix, the substrate of β-oxidation, and frees carnitine for the translocase." };
    case "ACAD": return { id, name: "Acyl-CoA dehydrogenase (" + c + ")", enzyme: "acad", compartment: "matrix", substrates: [P(cm("acylcoa", n)), P("fad")], products: [P(cm("enoylcoa", n)), P("fadh2")], reversibility: "reversible", roles: [role("beta-oxidation", 1, 1)], tags: ["redox"],
      transformation: "A trans C=C double bond forms between C2 and C3 (α and β carbons); FAD is reduced to FADH₂.", purpose: "First oxidation of the cycle. Its FADH₂ is re-oxidized through ETF and coenzyme Q, so in the ATP convention it counts like complex II's FADH₂ (about 1.5 ATP)." };
    case "ECH": return { id, name: "Enoyl-CoA hydratase (" + c + ")", enzyme: "ech", compartment: "matrix", substrates: [P(cm("enoylcoa", n)), P("h2o")], products: [P(cm("hydroxyacylcoa", n))], reversibility: "reversible", roles: [role("beta-oxidation", 2, 1)],
      transformation: "Water adds across the C2=C3 double bond: OH on C3 (β carbon), H on C2.", purpose: "Creates the secondary alcohol that the next dehydrogenase oxidizes." };
    case "HADH": return { id, name: "3-Hydroxyacyl-CoA dehydrogenase (" + c + ")", enzyme: "hadh", compartment: "matrix", substrates: [P(cm("hydroxyacylcoa", n)), P("nad")], products: [P(cm("ketoacylcoa", n)), P("nadh"), P("hplus")], reversibility: "reversible", roles: [role("beta-oxidation", 3, 1)], tags: ["redox"],
      transformation: "The C3 hydroxyl is oxidized to a ketone; NAD⁺ is reduced to NADH.", purpose: "Second oxidation of the cycle (about 2.5 ATP per NADH in the convention) and creates the β-keto group that thiolysis attacks." };
    case "THIOL": return { id, name: "3-Ketoacyl-CoA thiolase (" + c + ")", enzyme: "thiolase", compartment: "matrix", substrates: [P(cm("ketoacylcoa", n)), P("coa")], products: [P(cm("acylcoa", n - 2)), P("acetylcoa")], reversibility: "irreversible", roles: [role("beta-oxidation", 4, 1)], tags: ["regulatory"],
      transformation: "A second CoA-SH attacks the C3 ketone and the C2–C3 bond breaks: acetyl-CoA (C1–C2) leaves and an acyl-CoA two carbons shorter remains.", purpose: "Releases one acetyl-CoA and regenerates a shorter acyl-CoA that re-enters the cycle; the cycle is pulled forward by this step and by acetyl-CoA removal." };
  }
}
/** The reaction object for a chain length, and the direction it runs. The last cycle (C4) uses ACAT, the same chemistry as ketogenesis' first step. */
export function chainReaction(base: ChainBase, n: number): { reaction: Reaction; direction: "forward" | "reverse" } {
  if (base === "THIOL" && n === 4) return { reaction: REACTIONS_BY_ID.ACAT, direction: "reverse" };
  return { reaction: REACTIONS_BY_ID[base + ":" + n] ?? buildChainReaction(base, n), direction: "forward" };
}

function buildFasReaction(base: FasBase, m: number): Reaction {
  const id = base + ":" + m;
  const common = { compartment: "cytosol" as const, enzyme: "fas" };
  switch (base) {
    case "KS": return { id, ...common, name: "Ketoacyl synthase: condensation (→ C" + m + ")", substrates: [P(chainMetaboliteId("acpacyl", m - 2)), P("acp-malonyl")], products: [P(chainMetaboliteId("acpketo", m)), P("co2"), P("acp")], reversibility: "irreversible", roles: [role("fa-synthesis", 8, 1)],
      transformation: "The enzyme-bound acyl group attacks malonyl-ACP; the malonyl carboxyl is lost as CO₂ and a 3-ketoacyl-ACP two carbons longer forms.", purpose: "Chain extension. The CO₂ released is the carbon that acetyl-CoA carboxylase added, so the decarboxylation (not ATP) drives the condensation." };
    case "KR": return { id, ...common, name: "Ketoacyl reductase (C" + m + ")", substrates: [P(chainMetaboliteId("acpketo", m)), P("nadph"), P("hplus")], products: [P(chainMetaboliteId("acphydroxy", m)), P("nadp")], reversibility: "reversible", roles: [role("fa-synthesis", 9, 1)], tags: ["redox"],
      transformation: "The C3 ketone is reduced to a D-hydroxyl; NADPH is oxidized to NADP⁺.", purpose: "First reduction of the round; uses NADPH, not NADH." };
    case "DH": return { id, ...common, name: "Dehydratase (C" + m + ")", substrates: [P(chainMetaboliteId("acphydroxy", m))], products: [P(chainMetaboliteId("acpenoyl", m)), P("h2o")], reversibility: "reversible", roles: [role("fa-synthesis", 10, 1)],
      transformation: "Water is removed from C2 and C3, forming a trans-Δ2 double bond.", purpose: "Sets up the second reduction." };
    case "ER": return { id, ...common, name: "Enoyl reductase (C" + m + ")", substrates: [P(chainMetaboliteId("acpenoyl", m)), P("nadph"), P("hplus")], products: [P(chainMetaboliteId("acpacyl", m)), P("nadp")], reversibility: "reversible", roles: [role("fa-synthesis", 11, 1)], tags: ["redox"],
      transformation: "The C2=C3 double bond is reduced to a single bond; NADPH is oxidized to NADP⁺.", purpose: "Second reduction of the round: the saturated acyl-ACP is two carbons longer and ready for the next condensation." };
    case "TE": return { id, ...common, name: "Thioesterase: release (C" + m + ")", substrates: [P(chainMetaboliteId("acpacyl", m)), P("h2o")], products: [P(chainMetaboliteId("fa", m)), P("acp")], reversibility: "irreversible", roles: [role("fa-synthesis", 12, 1)],
      transformation: "Hydrolysis of the thioester releases the free fatty acid and frees ACP.", purpose: "In animals the usual product is palmitate (C16): the length is set by the thioesterase domain, not by running out of malonyl-CoA." };
  }
}
export function fasReaction(base: FasBase, m: number): Reaction { return REACTIONS_BY_ID[base + ":" + m] ?? buildFasReaction(base, m); }

/** Registered amino-acid ids used by the curated reactions. */
const GLU = "aa-E", GLN = "aa-Q", ASP = "aa-D", ALA = "aa-A", ARG = "aa-R";

const REACTIONS_25: Reaction[] = [
  // ---- fatty-acid activation (palmitate instance; other lengths from chainReaction)
  ...(["ACS"] as ChainBase[]).map((b) => buildChainReaction(b, 16)),
  { id: "PPASE", name: "Inorganic pyrophosphatase", enzyme: "ppase", compartment: "cytosol", substrates: [P("ppi"), P("h2o")], products: [P("pi", 2)], reversibility: "irreversible", roles: [role("fa-activation", 2, 1), role("urea-cycle", 5, 1)],
    transformation: "PPi is hydrolyzed to two Pi.", purpose: "Removes PPi, which pulls any ATP → AMP + PPi reaction forward; this is the second high-energy bond spent in fatty-acid activation and in argininosuccinate synthesis." },
  { id: "ADK", name: "Adenylate kinase", enzyme: "adk", compartment: "cytosol", substrates: [P("amp"), P("atp")], products: [P("adp", 2)], reversibility: "reversible", roles: [role("fa-activation", 3, 1)],
    transformation: "AMP accepts a phosphoryl group from ATP, giving two ADP.", purpose: "Accounting step: AMP cannot be rephosphorylated by ATP synthase directly, so recovering it costs a second ATP. Together with PPi hydrolysis this shows why ATP → AMP is two ATP equivalents." },
  // ---- carnitine shuttle, β-oxidation (palmitate instances)
  ...(["CPT1", "CACT", "CPT2", "ACAD", "ECH", "HADH", "THIOL"] as ChainBase[]).map((b) => buildChainReaction(b, 16)),
  { id: "ECI:12", name: "Enoyl-CoA isomerase (cis-Δ3 → trans-Δ2, C12)", enzyme: "eci", compartment: "matrix", substrates: [P("cis3enoylcoa-12")], products: [P("enoylcoa-12")], reversibility: "reversible", roles: [role("beta-oxidation", 5, 1)], branchOf: "ACAD:16",
    transformation: "The double bond moves from cis-C3=C4 to trans-C2=C3.", purpose: "Oleate's cis-Δ9 bond arrives at C3 after three cycles. The isomerase supplies the trans-Δ2 species directly, so the acyl-CoA dehydrogenase step (and its FADH₂) is skipped once." },
  // ---- thiolase (reversible) shared by β-oxidation's last cycle, ketogenesis and ketolysis
  { id: "ACAT", name: "Acetyl-CoA acetyltransferase (thiolase)", enzyme: "acat", compartment: "matrix", substrates: [P("acetylcoa", 2)], products: [P("acetoacetylcoa"), P("coa")], reversibility: "reversible", roles: [role("ketogenesis", 1, 1), role("ketolysis", 4, 1, "reverse")],
    transformation: "Forward: two acetyl-CoA condense (Claisen condensation) to acetoacetyl-CoA, releasing one CoA. Reverse: thiolysis of acetoacetyl-CoA by CoA gives two acetyl-CoA.", purpose: "Ketogenesis' first step runs it forward; ketolysis and the last β-oxidation cycle run it in reverse. It is the same chemical reaction, so it is defined once." },
  // ---- ketogenesis and ketolysis
  { id: "HMGCS2", name: "HMG-CoA synthase (mitochondrial)", enzyme: "hmgcs2", compartment: "matrix", substrates: [P("acetylcoa"), P("acetoacetylcoa"), P("h2o")], products: [P("hmgcoa"), P("coa")], reversibility: "irreversible", roles: [role("ketogenesis", 2, 1)], tags: ["regulatory"], tissues: ["liver"],
    transformation: "A third acetyl group condenses onto the ketone of acetoacetyl-CoA and the thioester of the acetyl donor is hydrolyzed.", purpose: "The controlled step of ketogenesis. It needs free CoA and mitochondrial acetyl-CoA; the model does not say how much flux follows." },
  { id: "HMGCL", name: "HMG-CoA lyase", enzyme: "hmgcl", compartment: "matrix", substrates: [P("hmgcoa")], products: [P("acetoacetate"), P("acetylcoa")], reversibility: "irreversible", roles: [role("ketogenesis", 3, 1)], tissues: ["liver"],
    transformation: "HMG-CoA is cleaved to acetoacetate (C4) and acetyl-CoA (C2).", purpose: "Releases the first ketone body. Net of steps 1 to 3: 2 acetyl-CoA + H₂O → acetoacetate + 2 CoA." },
  { id: "BDH1", name: "β-Hydroxybutyrate dehydrogenase", enzyme: "bdh1", compartment: "matrix", substrates: [P("acetoacetate"), P("nadh"), P("hplus")], products: [P("bhb"), P("nad")], reversibility: "reversible", roles: [role("ketogenesis", 4, 1), role("ketolysis", 2, 1, "reverse")], tags: ["redox"],
    transformation: "Forward: the ketone of acetoacetate is reduced to a hydroxyl by NADH. Reverse: β-hydroxybutyrate is oxidized to acetoacetate and NAD⁺ is reduced.", purpose: "Where the mitochondrial NADH/NAD⁺ ratio is high (hepatic fatty-acid oxidation) β-hydroxybutyrate is favoured; peripheral tissues run it in reverse and regain the NADH." },
  { id: "KB-EXPORT", name: "Ketone-body export (hepatocyte → blood)", enzyme: "mct", compartment: "blood", substrates: [P("acetoacetate"), P("bhb")], products: [P("acetoacetate"), P("bhb")], reversibility: "irreversible", roles: [role("ketogenesis", 5, 1)], tags: ["transport"], tissues: ["liver"],
    transport: [{ met: "acetoacetate", from: "matrix", to: "blood" }, { met: "bhb", from: "matrix", to: "blood" }],
    transformation: "No bonds change: ketone bodies leave the hepatocyte through carriers (water-soluble, so they travel free in blood, unlike fatty acids).", purpose: "Moves the fuel to other tissues. This is a location change only; its rate is not modelled." },
  { id: "ACETONE", name: "Acetoacetate decarboxylation to acetone", enzyme: "spontaneous", compartment: "matrix", substrates: [P("acetoacetate")], products: [P("acetone"), P("co2")], reversibility: "irreversible", roles: [role("ketogenesis", 6, 1)], branchOf: "BDH1",
    transformation: "A β-keto acid loses CO₂ spontaneously, leaving acetone.", purpose: "A minor side route: acetone is volatile and is largely exhaled or excreted, not oxidized as a fuel." },
  { id: "KB-IMPORT", name: "Ketone-body uptake (blood → extrahepatic mitochondria)", enzyme: "mct", compartment: "matrix", substrates: [P("acetoacetate"), P("bhb")], products: [P("acetoacetate"), P("bhb")], reversibility: "irreversible", roles: [role("ketolysis", 1, 1)], tags: ["transport"], tissues: ["extrahepatic"],
    transport: [{ met: "acetoacetate", from: "blood", to: "matrix" }, { met: "bhb", from: "blood", to: "matrix" }],
    transformation: "No bonds change: ketone bodies cross the plasma membrane and the mitochondrial membranes.", purpose: "Brings the fuel to heart, muscle, kidney and (after adaptation) brain." },
  { id: "SCOT", name: "Succinyl-CoA:acetoacetate CoA-transferase (SCOT)", enzyme: "scot", compartment: "matrix", substrates: [P("acetoacetate"), P("succoa")], products: [P("acetoacetylcoa"), P("succinate")], reversibility: "reversible", roles: [role("ketolysis", 3, 1)], tissues: ["extrahepatic"],
    transformation: "CoA is transferred from succinyl-CoA to acetoacetate, giving acetoacetyl-CoA and succinate.", purpose: "Activates the ketone body without ATP. It bypasses succinyl-CoA synthetase, so the cycle's one GTP/ATP for that turn is forgone. Absent from hepatocytes, which is why liver does not use ketone bodies." },
  // ---- propionyl-CoA to succinyl-CoA (odd-chain fatty acids)
  { id: "PCC", name: "Propionyl-CoA carboxylase", enzyme: "pcc", compartment: "matrix", substrates: [P("propionylcoa"), P("co2"), P("atp"), P("h2o")], products: [P("mmcoa-s"), P("adp"), P("pi")], reversibility: "irreversible", roles: [role("propionate", 1, 1)], tags: ["carbon-fixation"],
    transformation: "Biotin-dependent carboxylation of the α carbon adds one carbon (as CO₂), giving (S)-methylmalonyl-CoA.", purpose: "Spends one ATP. Needs biotin." },
  { id: "MCEE", name: "Methylmalonyl-CoA epimerase", enzyme: "mcee", compartment: "matrix", substrates: [P("mmcoa-s")], products: [P("mmcoa-r")], reversibility: "reversible", roles: [role("propionate", 2, 1)], tags: ["isomerization"],
    transformation: "The configuration at the methyl-bearing carbon is inverted (S → R).", purpose: "Gives the isomer that the mutase can use." },
  { id: "MUT", name: "Methylmalonyl-CoA mutase", enzyme: "mut", compartment: "matrix", substrates: [P("mmcoa-r")], products: [P("succoa")], reversibility: "irreversible", roles: [role("propionate", 3, 1)], tags: ["isomerization"],
    transformation: "A radical rearrangement moves the thioester carbonyl group, converting the branched methylmalonyl skeleton to the linear succinyl skeleton.", purpose: "Needs adenosylcobalamin (vitamin B₁₂). The succinyl-CoA product is an intermediate of the citric acid cycle (an anaplerotic entry)." },
  // ---- cytosolic acetyl-CoA supply and fatty-acid synthesis (palmitate instances; other lengths from fasReaction)
  { id: "CIT-EXP", name: "Citrate export (matrix → cytosol)", enzyme: "cit-carrier", compartment: "inner-membrane", substrates: [P("citrate")], products: [P("citrate")], reversibility: "reversible", roles: [role("fa-synthesis", 1, 1)], tags: ["transport"],
    transport: [{ met: "citrate", from: "matrix", to: "cytosol" }],
    transformation: "No bonds change: citrate crosses the inner membrane.", purpose: "Acetyl-CoA cannot cross the membrane, so mitochondrial acetyl-CoA is exported as citrate when the cycle is saturated." },
  { id: "ACLY", name: "ATP-citrate lyase", enzyme: "acly", compartment: "cytosol", substrates: [P("citrate"), P("atp"), P("coa")], products: [P("acetylcoa"), P("oaa"), P("adp"), P("pi")], reversibility: "irreversible", roles: [role("fa-synthesis", 2, 1)],
    transformation: "Citrate is cleaved to cytosolic acetyl-CoA and oxaloacetate; ATP is hydrolyzed to ADP + Pi to drive it.", purpose: "Spends one ATP per acetyl-CoA delivered to the cytosol (an assumption in the palmitate ledger: it applies only when acetyl-CoA comes from mitochondria)." },
  { id: "ME1", name: "Malic enzyme (NADP⁺-dependent)", enzyme: "me1", compartment: "cytosol", substrates: [P("malate"), P("nadp")], products: [P("pyruvate"), P("co2"), P("nadph"), P("hplus")], reversibility: "reversible", roles: [role("fa-synthesis", 4, 1)], tags: ["oxidative-decarboxylation", "redox"],
    transformation: "Malate is oxidatively decarboxylated to pyruvate; NADP⁺ is reduced to NADPH.", purpose: "Recycles the oxaloacetate released by ATP-citrate lyase (via malate) and makes cytosolic NADPH. It is one of two main NADPH sources; the other, the pentose phosphate pathway, is not modelled." },
  { id: "ACC", name: "Acetyl-CoA carboxylase", enzyme: "acc", compartment: "cytosol", substrates: [P("acetylcoa"), P("co2"), P("atp"), P("h2o")], products: [P("malonylcoa"), P("adp"), P("pi")], reversibility: "irreversible", roles: [role("fa-synthesis", 5, 1)], tags: ["regulatory", "carbon-fixation"],
    transformation: "Biotin-dependent carboxylation of the acetyl methyl carbon (as CO₂, bicarbonate in textbooks) gives malonyl-CoA.", purpose: "The committed step of fatty-acid synthesis; spends one ATP per malonyl-CoA. Its product, malonyl-CoA, also inhibits CPT I." },
  { id: "MAT-AC", name: "Acetyl transfer to ACP (loading)", enzyme: "fas", compartment: "cytosol", substrates: [P("acetylcoa"), P("acp")], products: [P("acp-acyl-2"), P("coa")], reversibility: "reversible", roles: [role("fa-synthesis", 6, 1)],
    transformation: "The acetyl group moves from CoA to the acyl carrier protein (and then to the ketoacyl synthase).", purpose: "Primes fatty-acid synthase with the two carbons that become C15–C16 of palmitate (the methyl end)." },
  { id: "MAT-MAL", name: "Malonyl transfer to ACP (loading)", enzyme: "fas", compartment: "cytosol", substrates: [P("malonylcoa"), P("acp")], products: [P("acp-malonyl"), P("coa")], reversibility: "reversible", roles: [role("fa-synthesis", 7, 1)],
    transformation: "The malonyl group moves from CoA to ACP.", purpose: "Delivers one three-carbon extender per round; the CoA released is recycled." },
  ...(["KS", "KR", "DH", "ER", "TE"] as FasBase[]).map((b) => buildFasReaction(b, 16)),
  // ---- amino-acid nitrogen: transamination, oxidative deamination, glutamine
  { id: "ALT", name: "Alanine aminotransferase (ALT)", enzyme: "alt", compartment: "cytosol", substrates: [P(ALA), P("akg")], products: [P("pyruvate"), P(GLU)], reversibility: "reversible", roles: [role("transamination", 1, 1)],
    transformation: "The α-amino group of alanine moves to α-ketoglutarate (through pyridoxamine phosphate), giving pyruvate and glutamate. No ammonium is released.", purpose: "Collects amino groups on glutamate. Pyruvate then enters carbohydrate metabolism, linking amino-acid and glucose metabolism (glucose–alanine cycle)." },
  { id: "AST", name: "Aspartate aminotransferase (AST)", enzyme: "ast", compartment: "cytosol", substrates: [P(ASP), P("akg")], products: [P("oaa"), P(GLU)], reversibility: "reversible", roles: [role("transamination", 2, 1)],
    transformation: "The α-amino group of aspartate moves to α-ketoglutarate, giving oxaloacetate and glutamate (or the reverse).", purpose: "Links the citric acid cycle and the urea cycle: in the reverse direction it makes aspartate, which supplies the second nitrogen of urea." },
  { id: "GDH", name: "Glutamate dehydrogenase (NAD⁺)", enzyme: "gdh", compartment: "matrix", substrates: [P(GLU), P("nad"), P("h2o")], products: [P("akg"), P("nh4"), P("nadh")], reversibility: "reversible", roles: [role("deamination", 1, 1)], tags: ["redox"],
    transformation: "The α-carbon of glutamate is oxidized and the amino group is released as NH₄⁺ (an imine intermediate is hydrolyzed); NAD⁺ is reduced to NADH.", purpose: "Oxidative deamination: the only common step that frees ammonium from the glutamate pool. Chosen direction here: deamination (toward α-ketoglutarate and NH₄⁺) with NAD⁺; the same enzyme can run in reverse when ammonium is high." },
  { id: "GDH-NADP", name: "Glutamate dehydrogenase (NADP⁺ variant)", enzyme: "gdh", compartment: "matrix", substrates: [P(GLU), P("nadp"), P("h2o")], products: [P("akg"), P("nh4"), P("nadph")], reversibility: "reversible", roles: [role("deamination", 4, 1)], branchOf: "GDH", tags: ["redox"],
    transformation: "Same chemistry with NADP⁺ as oxidant.", purpose: "Mammalian GDH accepts either coenzyme; reductive amination (the reverse) typically uses NADPH. Counted once with GDH, never in addition to it." },
  { id: "GLS", name: "Glutaminase", enzyme: "gls", compartment: "matrix", substrates: [P(GLN), P("h2o"), P("hplus")], products: [P(GLU), P("nh4")], reversibility: "irreversible", roles: [role("deamination", 2, 1)],
    transformation: "Hydrolysis of the side-chain amide releases NH₄⁺ and glutamate.", purpose: "Releases amide nitrogen carried as glutamine (kidney, intestine, liver)." },
  { id: "GS", name: "Glutamine synthetase", enzyme: "gs", compartment: "cytosol", substrates: [P(GLU), P("nh4"), P("atp")], products: [P(GLN), P("adp"), P("pi"), P("hplus")], reversibility: "irreversible", roles: [role("deamination", 3, 1)],
    transformation: "Glutamate's side-chain carboxyl is phosphorylated and displaced by NH₄⁺, forming the amide.", purpose: "Traps ammonium as non-toxic glutamine for transport; spends one ATP." },
  // ---- urea cycle (core steps 1 to 8; the connection to aspartate is step 9)
  { id: "CPS1", name: "Carbamoyl phosphate synthetase I", enzyme: "cps1", compartment: "matrix", substrates: [P("co2"), P("nh4"), P("atp", 2), P("h2o")], products: [P("cp"), P("adp", 2), P("pi"), P("hplus")], reversibility: "irreversible", roles: [role("urea-cycle", 1, 1)], tags: ["regulatory", "carbon-fixation"], tissues: ["liver"],
    transformation: "Bicarbonate (CO₂) is phosphorylated by one ATP, then ammonium attacks to give carbamate, which a second ATP phosphorylates to carbamoyl phosphate.", purpose: "Commits ammonium and CO₂ to urea. Two ATP are converted to two ADP here. Requires N-acetylglutamate as an allosteric activator." },
  { id: "OTC", name: "Ornithine transcarbamylase", enzyme: "otc", compartment: "matrix", substrates: [P("cp"), P("ornithine")], products: [P("citrulline"), P("pi")], reversibility: "irreversible", roles: [role("urea-cycle", 2, 1)], tissues: ["liver"],
    transformation: "The carbamoyl group of carbamoyl phosphate is transferred to the δ-amino group of ornithine; phosphate is released.", purpose: "Forms citrulline inside the matrix; the energy comes from carbamoyl phosphate's phosphoanhydride bond." },
  { id: "CIT-EXPORT", name: "Citrulline export (matrix → cytosol)", enzyme: "ornt1", compartment: "inner-membrane", substrates: [P("citrulline")], products: [P("citrulline")], reversibility: "reversible", roles: [role("urea-cycle", 3, 1)], tags: ["transport"], tissues: ["liver"],
    transport: [{ met: "citrulline", from: "matrix", to: "cytosol" }],
    transformation: "No bonds change: citrulline leaves the matrix (in exchange for incoming ornithine).", purpose: "Moves the cycle from the mitochondria to the cytosol." },
  { id: "ASS", name: "Argininosuccinate synthetase", enzyme: "ass", compartment: "cytosol", substrates: [P("citrulline"), P(ASP), P("atp")], products: [P("argsucc"), P("amp"), P("ppi")], reversibility: "reversible", roles: [role("urea-cycle", 4, 1)], tissues: ["liver"],
    transformation: "The ureido oxygen of citrulline is activated as a citrullyl-AMP and displaced by the amino group of aspartate: aspartate's nitrogen becomes the second urea nitrogen.", purpose: "ATP → AMP + PPi: one ATP molecule but two high-energy bonds (with PPi hydrolysis)." },
  { id: "ASL", name: "Argininosuccinate lyase", enzyme: "asl", compartment: "cytosol", substrates: [P("argsucc")], products: [P(ARG), P("fumarate")], reversibility: "reversible", roles: [role("urea-cycle", 6, 1)], tissues: ["liver"],
    transformation: "Elimination splits argininosuccinate into arginine and fumarate; aspartate's carbon skeleton leaves as fumarate and its nitrogen stays on arginine.", purpose: "Fumarate is a citric-acid-cycle intermediate: the urea cycle is linked to the cycle here." },
  { id: "ARG1", name: "Arginase", enzyme: "arg1", compartment: "cytosol", substrates: [P(ARG), P("h2o")], products: [P("ornithine"), P("urea")], reversibility: "irreversible", roles: [role("urea-cycle", 7, 1)], tissues: ["liver"],
    transformation: "Hydrolysis of the guanidino group releases urea and regenerates ornithine.", purpose: "Releases urea (both nitrogens) and the carrier ornithine." },
  { id: "ORN-IMPORT", name: "Ornithine import (cytosol → matrix)", enzyme: "ornt1", compartment: "inner-membrane", substrates: [P("ornithine")], products: [P("ornithine")], reversibility: "reversible", roles: [role("urea-cycle", 8, 1)], tags: ["transport"], tissues: ["liver"],
    transport: [{ met: "ornithine", from: "cytosol", to: "matrix" }],
    transformation: "No bonds change: ornithine returns to the matrix to accept another carbamoyl group.", purpose: "Completes the cycle: ornithine is regenerated, not consumed." },
  { id: "FUM-C", name: "Fumarase (cytosolic): fumarate → malate", enzyme: "fum-c", compartment: "cytosol", substrates: [P("fumarate"), P("h2o")], products: [P("malate")], reversibility: "reversible", roles: [role("urea-cycle", 9, 1)], branchOf: "ASL",
    transformation: "Water adds across fumarate's double bond, giving L-malate.", purpose: "First step of the aspartate–argininosuccinate connection: malate → oxaloacetate (MDH, 1 NADH) → aspartate (AST). Not part of the urea cycle proper." },
  { id: "NAGS", name: "N-Acetylglutamate synthase", enzyme: "nags", compartment: "matrix", substrates: [P("acetylcoa"), P(GLU)], products: [P("nag"), P("coa")], reversibility: "irreversible", roles: [role("urea-cycle", 10, 1)], tags: ["regulatory"], branchOf: "CPS1", tissues: ["liver"],
    transformation: "The acetyl group of acetyl-CoA is transferred to the α-amino group of glutamate.", purpose: "Makes N-acetylglutamate, the essential activator of CPS I; arginine stimulates NAGS, linking amino-acid supply to urea synthesis." },
];

export const REACTIONS: Reaction[] = [...REACTIONS_18, ...REACTIONS_25];
export const REACTIONS_BY_ID: Record<string, Reaction> = Object.fromEntries(REACTIONS.map((r) => [r.id, r]));

/** The pathway as an ordered list of reactions (with the roles that apply to it). */
export function pathwayReactions(pathway: PathwayId): Array<{ reaction: Reaction; role: PathwayRole }> {
  return REACTIONS.flatMap((reaction) => reaction.roles.filter((r) => r.pathway === pathway).map((r) => ({ reaction, role: r }))).sort((a, b) => a.role.step - b.role.step);
}
export const GLYCOLYSIS = pathwayReactions("glycolysis");
export const GLUCONEOGENESIS = pathwayReactions("gluconeogenesis");
export const TCA = pathwayReactions("tca");

// ---- regulation (curated, qualitative) ---------------------------------------------------------------------------------------------

export type SignalId = "atp" | "amp" | "f26bp" | "g6p" | "acetylcoa" | "nadh" | "adp";
export type SignalLevel = "low" | "normal" | "high";
export const SIGNALS: Record<SignalId, string> = { atp: "ATP", amp: "AMP", f26bp: "Fructose 2,6-bisphosphate", g6p: "Glucose 6-phosphate", acetylcoa: "Acetyl-CoA", nadh: "NADH / NAD⁺ (reduced)", adp: "ADP" };
export type RegKind = "allosteric" | "product-feedback" | "covalent-indirect" | "transcriptional-indirect";
export interface RegulatoryEffect {
  id: string; signal: SignalId; enzyme: string;
  /** +1: a higher level of the signal tends to raise the step's net activity; −1: lower it. */
  sign: 1 | -1;
  kind: RegKind;
  note: string;
}
export const REGULATION: RegulatoryEffect[] = [
  { id: "atp-pfk1", signal: "atp", enzyme: "pfk1", sign: -1, kind: "allosteric", note: "ATP is a substrate and also binds a separate regulatory site that lowers PFK-1's affinity for fructose 6-phosphate." },
  { id: "amp-pfk1", signal: "amp", enzyme: "pfk1", sign: 1, kind: "allosteric", note: "AMP (a signal of low energy charge) binds PFK-1 and relieves the ATP inhibition." },
  { id: "f26bp-pfk1", signal: "f26bp", enzyme: "pfk1", sign: 1, kind: "allosteric", note: "Fructose 2,6-bisphosphate is a potent allosteric activator that raises PFK-1's affinity for fructose 6-phosphate and relieves ATP inhibition." },
  { id: "g6p-hk", signal: "g6p", enzyme: "hk", sign: -1, kind: "product-feedback", note: "Hexokinase is inhibited by its product, glucose 6-phosphate (not liver glucokinase)." },
  { id: "atp-pk", signal: "atp", enzyme: "pk", sign: -1, kind: "allosteric", note: "ATP is an allosteric inhibitor of pyruvate kinase." },
  { id: "f26bp-fbp1", signal: "f26bp", enzyme: "fbpase1", sign: -1, kind: "allosteric", note: "Fructose 2,6-bisphosphate inhibits FBPase-1, reciprocally to its activation of PFK-1." },
  { id: "amp-fbp1", signal: "amp", enzyme: "fbpase1", sign: -1, kind: "allosteric", note: "AMP inhibits FBPase-1, reciprocally to its activation of PFK-1." },
  { id: "acoa-pc", signal: "acetylcoa", enzyme: "pc", sign: 1, kind: "allosteric", note: "Acetyl-CoA (abundant when fatty acids are being oxidized) is an allosteric activator of pyruvate carboxylase." },
  { id: "acoa-pdh", signal: "acetylcoa", enzyme: "pdh", sign: -1, kind: "covalent-indirect", note: "Acetyl-CoA and NADH activate pyruvate dehydrogenase kinase, which phosphorylates and inactivates the complex (indirect, covalent modification)." },
  { id: "nadh-pdh", signal: "nadh", enzyme: "pdh", sign: -1, kind: "covalent-indirect", note: "High NADH/NAD⁺ activates pyruvate dehydrogenase kinase and also inhibits the complex directly (product inhibition)." },
  { id: "adp-pdh", signal: "adp", enzyme: "pdh", sign: 1, kind: "covalent-indirect", note: "ADP inhibits pyruvate dehydrogenase kinase, so the complex stays active when energy is needed (indirect)." },
  { id: "adp-idh", signal: "adp", enzyme: "idh", sign: 1, kind: "allosteric", note: "ADP is an allosteric activator of NAD⁺-dependent isocitrate dehydrogenase." },
  { id: "atp-idh", signal: "atp", enzyme: "idh", sign: -1, kind: "allosteric", note: "ATP inhibits NAD⁺-dependent isocitrate dehydrogenase." },
  { id: "nadh-idh", signal: "nadh", enzyme: "idh", sign: -1, kind: "allosteric", note: "NADH inhibits isocitrate dehydrogenase." },
  { id: "nadh-akgdh", signal: "nadh", enzyme: "akgdh", sign: -1, kind: "product-feedback", note: "NADH (and succinyl-CoA) inhibit the α-ketoglutarate dehydrogenase complex by product inhibition." },
  { id: "nadh-cs", signal: "nadh", enzyme: "cs", sign: -1, kind: "allosteric", note: "NADH is reported to inhibit citrate synthase; how much this matters in vivo is less certain than the dehydrogenase controls." },
];

/** Qualitative-state vocabulary, defined once and shown wherever a label is used. */
export const TENDENCY_DEFINITIONS = {
  higher: "Higher: every curated signal that applies pushes this enzyme toward more net activity than in the all-normal reference state.",
  lower: "Lower: every curated signal that applies pushes this enzyme toward less net activity than in the all-normal reference state.",
  reference: "Reference: no signal departs from normal, or opposing signals cancel exactly in sign.",
  uncertain: "Uncertain: curated signals point in opposite directions; the outcome depends on concentrations and affinities that this teaching model does not have.",
} as const;
export type Tendency = keyof typeof TENDENCY_DEFINITIONS;

// ---- validation --------------------------------------------------------------------------------------------------------------------

const ELEMENT = /([A-Z][a-z]?)(\d*)/g;
export function parseFormula(formula: string): Record<string, number> | null {
  if (!/^([A-Z][a-z]?\d*)+$/.test(formula)) return null;
  const out: Record<string, number> = {};
  for (const m of formula.matchAll(ELEMENT)) out[m[1]] = (out[m[1]] ?? 0) + (m[2] === "" ? 1 : Number(m[2]));
  return out;
}

export interface Balance { atoms: Record<string, number>; charge: number }
/** Net atoms and charge (products − substrates); every entry zero means the reaction balances. Null if a participant has no formula. */
export function reactionBalance(r: Reaction): Balance | null {
  const atoms: Record<string, number> = {};
  let charge = 0;
  for (const [side, sign] of [[r.substrates, -1], [r.products, 1]] as const) {
    for (const p of side) {
      const m = metaboliteOf(p.met);
      if (!m || !m.formula) return null;
      const f = parseFormula(m.formula);
      if (!f) return null;
      for (const [el, n] of Object.entries(f)) atoms[el] = (atoms[el] ?? 0) + sign * n * p.n;
      charge += sign * m.charge * p.n;
    }
  }
  for (const el of Object.keys(atoms)) { atoms[el] = Math.round(atoms[el] * 1e6) / 1e6; if (atoms[el] === 0) delete atoms[el]; }
  return { atoms, charge };
}

/** Structural validation of the curated network: identities, references, stoichiometry, compartments, roles and balance. Returns every problem. */
export function validateNetwork(): string[] {
  const errors: string[] = [];
  const dup = (ids: string[], what: string) => { const seen = new Set<string>(); for (const id of ids) { if (seen.has(id)) errors.push(`Duplicate ${what} id: ${id}`); seen.add(id); } };
  dup(METABOLITES.map((m) => m.id), "metabolite"); dup(ENZYMES.map((e) => e.id), "enzyme"); dup(REACTIONS.map((r) => r.id), "reaction");
  for (const m of METABOLITES) {
    if (m.formula !== null && !parseFormula(m.formula)) errors.push(`Metabolite ${m.id}: malformed formula ${m.formula}`);
    if (m.carbons !== null && (!Number.isInteger(m.carbons) || m.carbons < 0)) errors.push(`Metabolite ${m.id}: bad carbon count`);
    if (m.formula !== null && m.carbons !== null && !["acetylcoa", "succoa"].includes(m.id) && !m.acylGroup && !/N7O[0-9]+P3S$/.test(m.formula) && (parseFormula(m.formula)?.C ?? 0) !== m.carbons) errors.push(`Metabolite ${m.id}: carbon count differs from formula`);
    if (!m.compartments.length) errors.push(`Metabolite ${m.id}: no compartment`);
    for (const c of m.compartments) if (!(c in COMPARTMENTS)) errors.push(`Metabolite ${m.id}: unknown compartment ${c}`);
  }
  for (const e of ENZYMES) if (!(e.compartment in COMPARTMENTS)) errors.push(`Enzyme ${e.id}: unknown compartment`);
  for (const r of REACTIONS) {
    if (!ENZYMES_BY_ID[r.enzyme]) errors.push(`Reaction ${r.id}: unknown enzyme ${r.enzyme}`);
    if (!(r.compartment in COMPARTMENTS)) errors.push(`Reaction ${r.id}: unknown compartment ${r.compartment}`);
    if (!r.substrates.length || !r.products.length) errors.push(`Reaction ${r.id}: missing substrates or products`);
    for (const p of [...r.substrates, ...r.products]) {
      const m = metaboliteOf(p.met);
      if (!m) { errors.push(`Reaction ${r.id}: unknown metabolite ${p.met}`); continue; }
      if (!(p.n > 0) || !Number.isFinite(p.n) || (p.n * 2) % 1 !== 0) errors.push(`Reaction ${r.id}: bad coefficient ${p.n} for ${p.met}`);
      if (!r.transport && r.compartment !== "inner-membrane" && r.compartment !== "omm" && !m.compartments.includes(r.compartment)) errors.push(`Reaction ${r.id}: ${p.met} is not available in ${r.compartment}`);
    }
    for (const t of r.transport ?? []) {
      const m = metaboliteOf(t.met);
      if (!m) { errors.push(`Reaction ${r.id}: transport of unknown metabolite ${t.met}`); continue; }
      for (const side of [t.from, t.to]) if (!(side in COMPARTMENTS) || !m.compartments.includes(side)) errors.push(`Reaction ${r.id}: ${t.met} is not available in ${side}`);
      if (t.from === t.to) errors.push(`Reaction ${r.id}: transport does not change compartment`);
    }
    if (!r.roles.length) errors.push(`Reaction ${r.id}: belongs to no pathway`);
    for (const role of r.roles) {
      if (!(role.pathway in PATHWAYS)) errors.push(`Reaction ${r.id}: unknown pathway ${role.pathway}`);
      if (!Number.isInteger(role.step) || role.step < 1 || !(role.perGlucose > 0)) errors.push(`Reaction ${r.id}: bad pathway role`);
    }
    const isTransport = r.tags?.includes("transport");
    const bal = reactionBalance(r);
    if (bal && !isTransport && (Object.keys(bal.atoms).length || bal.charge !== 0)) errors.push(`Reaction ${r.id}: does not balance (${JSON.stringify(bal)})`);
  }
  for (const p of Object.keys(PATHWAYS) as PathwayId[]) {
    const steps = pathwayReactions(p).map((x) => x.role.step);
    if (new Set(steps).size !== steps.length) errors.push(`Pathway ${p}: repeated step numbers`);
    if (steps.some((s, i) => s !== i + 1)) errors.push(`Pathway ${p}: step numbers are not 1..n`);
  }
  for (const g of REGULATION) {
    if (!(g.signal in SIGNALS)) errors.push(`Regulation ${g.id}: unknown signal`);
    if (!ENZYMES_BY_ID[g.enzyme]) errors.push(`Regulation ${g.id}: unknown enzyme`);
  }
  dup(REGULATION.map((g) => g.id), "regulation");
  errors.push(...validateChainFamilies());
  return errors;
}

/** Every supported chain length: each generated reaction must reference real species, stay within its declared compartments and balance for atoms, charge and the ACP pseudo-element. */
export function validateChainFamilies(): string[] {
  const errors: string[] = [];
  const check = (r: Reaction, label: string) => {
    for (const p of [...r.substrates, ...r.products]) if (!metaboliteOf(p.met)) errors.push(`${label}: unknown metabolite ${p.met}`);
    if (!(r.compartment in COMPARTMENTS)) errors.push(`${label}: unknown compartment`);
    for (const t of r.transport ?? []) { const m = metaboliteOf(t.met); if (!m || !m.compartments.includes(t.from) || !m.compartments.includes(t.to)) errors.push(`${label}: transport of ${t.met} between unavailable compartments`); }
    const bal = reactionBalance(r);
    if (!bal) errors.push(`${label}: cannot be balanced (missing formula)`);
    else if (!r.tags?.includes("transport") && (Object.keys(bal.atoms).length || bal.charge !== 0)) errors.push(`${label}: does not balance (${JSON.stringify(bal)})`);
  };
  for (const n of [...SUPPORTED_EVEN_CHAINS, ...SUPPORTED_ODD_CHAINS]) {
    for (const b of CHAIN_BASES) { const { reaction } = chainReaction(b, n); check(reaction, reaction.id); }
    const f = chainMetabolite("fa", n);
    if ((parseFormula(f.formula!)?.C ?? 0) !== n) errors.push(`fatty acid C${n}: carbon count`);
  }
  for (let m = 4; m <= 18; m += 2) for (const b of FAS_BASES) check(fasReaction(b, m), b + ":" + m);
  return errors;
}

/** The five mechanistic stages of the pyruvate dehydrogenase complex (E1 with TPP, E2 with lipoamide, E3 with FAD and NAD⁺). */
export const PDH_MECHANISM: Array<{ title: string; enzyme: string; text: string; carbons: number; released?: string }> = [
  { title: "Pyruvate and CoA available", enzyme: "PDH complex", text: "Pyruvate (C3) has entered the matrix on the mitochondrial pyruvate carrier. The complex carries five coenzymes: thiamine pyrophosphate (TPP), lipoamide, CoA, FAD and NAD⁺.", carbons: 3 },
  { title: "1. Decarboxylation (E1, TPP)", enzyme: "E1 (pyruvate dehydrogenase)", text: "Pyruvate adds to TPP and loses its carboxyl as CO₂, leaving a hydroxyethyl-TPP (C2).", carbons: 2, released: "CO₂" },
  { title: "2. Oxidation and transfer (E1)", enzyme: "E1", text: "The hydroxyethyl group is oxidized to an acetyl group as it is transferred to the oxidized lipoamide arm of E2; lipoamide is reduced.", carbons: 2 },
  { title: "3. Acetyl transfer to CoA (E2)", enzyme: "E2 (dihydrolipoyl transacetylase)", text: "The acetyl group is transferred from lipoamide to coenzyme A, forming acetyl-CoA, which leaves the complex.", carbons: 2 },
  { title: "4. Re-oxidation of lipoamide (E3, FAD)", enzyme: "E3 (dihydrolipoyl dehydrogenase)", text: "Reduced lipoamide gives its electrons to E3's bound FAD, giving FADH₂ and regenerating oxidized lipoamide.", carbons: 2 },
  { title: "5. NAD⁺ reduced (E3)", enzyme: "E3", text: "FADH₂ passes its electrons to NAD⁺, giving NADH and regenerating FAD. Net: pyruvate + CoA + NAD⁺ → acetyl-CoA + CO₂ + NADH + H⁺.", carbons: 2 },
];
