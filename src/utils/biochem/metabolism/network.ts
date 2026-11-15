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
 */

export type CompartmentId = "cytosol" | "matrix" | "ims" | "inner-membrane" | "er-lumen";
export const COMPARTMENTS: Record<CompartmentId, { label: string; note: string }> = {
  cytosol: { label: "Cytosol", note: "Glycolysis; most of gluconeogenesis." },
  matrix: { label: "Mitochondrial matrix", note: "Pyruvate dehydrogenase complex, citric acid cycle, pyruvate carboxylase, ATP synthase's catalytic head." },
  ims: { label: "Intermembrane space", note: "Receives protons pumped by complexes I, III and IV." },
  "inner-membrane": { label: "Inner mitochondrial membrane", note: "Respiratory complexes, coenzyme Q and ATP synthase." },
  "er-lumen": { label: "Endoplasmic-reticulum lumen", note: "Glucose-6-phosphatase (liver, kidney cortex, intestine) acts on the lumenal side after G6P enters through a transporter." },
};

export type PathwayId = "glycolysis" | "gluconeogenesis" | "pyruvate-oxidation" | "tca" | "oxphos";
export const PATHWAYS: Record<PathwayId, { label: string; compartments: CompartmentId[]; summary: string }> = {
  glycolysis: { label: "Glycolysis", compartments: ["cytosol"], summary: "Glucose (C6) to two pyruvate (C3), with an ATP investment phase and a payoff phase." },
  gluconeogenesis: { label: "Gluconeogenesis", compartments: ["matrix", "inner-membrane", "cytosol", "er-lumen"], summary: "Pyruvate to glucose, sharing the reversible glycolytic steps and bypassing the three irreversible ones." },
  "pyruvate-oxidation": { label: "Pyruvate oxidation", compartments: ["matrix"], summary: "Pyruvate to acetyl-CoA by the pyruvate dehydrogenase complex; links glycolysis to the cycle." },
  tca: { label: "Citric acid cycle", compartments: ["matrix", "inner-membrane"], summary: "Acetyl-CoA is oxidized to two CO₂ while oxaloacetate is regenerated and electron carriers are reduced." },
  oxphos: { label: "Electron transport and oxidative phosphorylation", compartments: ["inner-membrane", "matrix", "ims"], summary: "Reduced carriers donate electrons to O₂; the proton gradient drives ATP synthase." },
};

/** Where a structure comes from: `drawn` structures come from the project's RDKit build, `schematic` metabolites have no atom-level drawing here. */
export interface MetaboliteStructure { smiles: string; form: "open-chain" | "neutral-acid" }
export interface Metabolite {
  id: string; name: string; abbreviation: string;
  /** Hill formula of the bookkeeping form, null for macromolecular carriers (no atom balance is attempted). */
  formula: string | null; charge: number; carbons: number | null;
  kind: "substrate" | "intermediate" | "product" | "cofactor" | "inorganic" | "carrier";
  compartments: CompartmentId[];
  structure?: MetaboliteStructure;
  note?: string;
}

const ALL: CompartmentId[] = ["cytosol", "matrix"];
const met = (id: string, name: string, abbreviation: string, formula: string | null, charge: number, carbons: number | null, kind: Metabolite["kind"], compartments: CompartmentId[], structure?: MetaboliteStructure, note?: string): Metabolite =>
  ({ id, name, abbreviation, formula, charge, carbons, kind, compartments, structure, note });
const oc = (smiles: string): MetaboliteStructure => ({ smiles, form: "open-chain" });
const na = (smiles: string): MetaboliteStructure => ({ smiles, form: "neutral-acid" });

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
  met("acetylcoa", "Acetyl-CoA", "AcCoA", "C23H38N7O17P3S", 0, 2, "intermediate", ["matrix"], undefined, "Schematic: the acetyl group (C2) is the part that enters the cycle; coenzyme A is not drawn atom by atom here."),
  met("oaa", "Oxaloacetate", "OAA", "C4H4O5", 0, 4, "intermediate", ["cytosol", "matrix"], na("O=C(O)CC(=O)C(=O)O")),
  met("citrate", "Citrate", "Cit", "C6H8O7", 0, 6, "intermediate", ["matrix"], na("OC(=O)CC(O)(CC(=O)O)C(=O)O")),
  met("isocitrate", "Isocitrate", "Isocit", "C6H8O7", 0, 6, "intermediate", ["matrix"], na("OC(=O)CC(C(=O)O)C(O)C(=O)O"), "Stereochemistry not shown."),
  met("akg", "α-Ketoglutarate", "α-KG", "C5H6O5", 0, 5, "intermediate", ["matrix"], na("O=C(O)CCC(=O)C(=O)O")),
  met("succoa", "Succinyl-CoA", "SucCoA", "C25H40N7O19P3S", 0, 4, "intermediate", ["matrix"], undefined, "Schematic: the succinyl group is C4."),
  met("succinate", "Succinate", "Suc", "C4H6O4", 0, 4, "intermediate", ["matrix"], na("O=C(O)CCC(=O)O")),
  met("fumarate", "Fumarate", "Fum", "C4H4O4", 0, 4, "intermediate", ["matrix"], na("O=C(O)/C=C/C(=O)O")),
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
  met("fad", "FAD", "FAD", "C27H33N9O15P2", 0, null, "cofactor", ["matrix", "inner-membrane"], undefined, "FAD is covalently bound to succinate dehydrogenase (complex II); it is shown as a free carrier only for bookkeeping."),
  met("fadh2", "FADH₂", "FADH₂", "C27H35N9O15P2", 0, null, "cofactor", ["matrix", "inner-membrane"]),
  met("coa", "Coenzyme A", "CoA-SH", "C21H36N7O16P3S", 0, null, "cofactor", ["matrix"]),
  met("o2", "Oxygen", "O₂", "O2", 0, 0, "inorganic", ["matrix", "inner-membrane"], na("O=O")),
];

export const METABOLITES_BY_ID: Record<string, Metabolite> = Object.fromEntries(METABOLITES.map((m) => [m.id, m]));

export interface Enzyme { id: string; name: string; short: string; ec?: string; compartment: CompartmentId; note?: string }
const enz = (id: string, name: string, short: string, compartment: CompartmentId, ec?: string, note?: string): Enzyme => ({ id, name, short, ec, compartment, note });
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
}
const P = (met: string, n = 1): Participant => ({ met, n });
const role = (pathway: PathwayId, step: number, perGlucose: number, direction: "forward" | "reverse" = "forward"): PathwayRole => ({ pathway, step, perGlucose, direction });

export const REACTIONS: Reaction[] = [
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
  { id: "MDH-C", name: "Malate dehydrogenase (cytosolic)", enzyme: "mdh-c", compartment: "cytosol", substrates: [P("malate"), P("nad")], products: [P("oaa"), P("nadh"), P("hplus")], reversibility: "reversible", roles: [role("gluconeogenesis", 4, 2)], tags: ["redox"],
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
      const m = METABOLITES_BY_ID[p.met];
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
    if (m.formula !== null && m.carbons !== null && !["acetylcoa", "succoa"].includes(m.id) && (parseFormula(m.formula)?.C ?? 0) !== m.carbons) errors.push(`Metabolite ${m.id}: carbon count differs from formula`);
    if (!m.compartments.length) errors.push(`Metabolite ${m.id}: no compartment`);
    for (const c of m.compartments) if (!(c in COMPARTMENTS)) errors.push(`Metabolite ${m.id}: unknown compartment ${c}`);
  }
  for (const e of ENZYMES) if (!(e.compartment in COMPARTMENTS)) errors.push(`Enzyme ${e.id}: unknown compartment`);
  for (const r of REACTIONS) {
    if (!ENZYMES_BY_ID[r.enzyme]) errors.push(`Reaction ${r.id}: unknown enzyme ${r.enzyme}`);
    if (!(r.compartment in COMPARTMENTS)) errors.push(`Reaction ${r.id}: unknown compartment ${r.compartment}`);
    if (!r.substrates.length || !r.products.length) errors.push(`Reaction ${r.id}: missing substrates or products`);
    for (const p of [...r.substrates, ...r.products]) {
      const m = METABOLITES_BY_ID[p.met];
      if (!m) { errors.push(`Reaction ${r.id}: unknown metabolite ${p.met}`); continue; }
      if (!(p.n > 0) || !Number.isFinite(p.n) || (p.n * 2) % 1 !== 0) errors.push(`Reaction ${r.id}: bad coefficient ${p.n} for ${p.met}`);
      if (r.compartment !== "inner-membrane" && !m.compartments.includes(r.compartment)) errors.push(`Reaction ${r.id}: ${p.met} is not available in ${r.compartment}`);
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
  return errors;
}
