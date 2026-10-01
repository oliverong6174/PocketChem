import type {
  ComparisonCategory,
  ComparisonMetric,
  ComparisonModeDefinition,
  ComparisonModeId,
} from "./comparisonTypes";

export const COMPARISON_CATEGORIES: ComparisonCategory[] = [
  "Electronic effects",
  "Stability",
  "Acid/base & mechanisms",
  "Diels–Alder & aromatic",
  "¹H NMR",
  "¹³C NMR",
  "IR",
  "Mass spectrometry",
  "Physical properties",
  "Structure & stereochemistry",
];

export const COMPARISON_MODES: ComparisonModeDefinition[] = [
  { id: "ewgStrength", label: "EWG strength", shortLabel: "EWG", category: "Electronic effects", description: "Compares the strongest detected electron-withdrawing substituent effect.", direction: "desc" },
  { id: "edgStrength", label: "EDG strength", shortLabel: "EDG", category: "Electronic effects", description: "Compares the strongest detected electron-donating substituent effect.", direction: "desc" },
  { id: "inductiveWithdrawal", label: "Inductive withdrawal", shortLabel: "−I strength", category: "Electronic effects", description: "Compares electron withdrawal through sigma bonds.", direction: "desc" },
  { id: "resonanceDonation", label: "Resonance donation", shortLabel: "+R donation", category: "Electronic effects", description: "Compares lone-pair or pi donation into a conjugated system.", direction: "desc" },
  { id: "resonanceWithdrawal", label: "Resonance withdrawal", shortLabel: "−R withdrawal", category: "Electronic effects", description: "Compares pi-accepting substituents that withdraw by resonance.", direction: "desc" },

  { id: "anionStability", label: "Carbanion stability", shortLabel: "Carbanion", category: "Stability", description: "Ranks the most stabilized carbon-anion site detected in each molecule.", direction: "desc" },
  { id: "cationStability", label: "Carbocation stability", shortLabel: "Carbocation", category: "Stability", description: "Ranks the most stabilized carbon-cation site detected in each molecule.", direction: "desc" },
  { id: "radicalStability", label: "Radical stability", shortLabel: "Radical", category: "Stability", description: "Ranks the most stabilized carbon-radical site detected in each molecule.", direction: "desc" },
  { id: "alkeneStability", label: "Alkene stability", shortLabel: "Alkene", category: "Stability", description: "Compares substitution and conjugation of the most stabilized C=C bond.", direction: "desc" },
  { id: "conjugateBaseStability", label: "Conjugate-base stability", shortLabel: "Conjugate base", category: "Stability", description: "Uses the strongest acidic site as a proxy for stability of the conjugate base.", direction: "desc", tieTolerance: 0.15 },
  { id: "resonanceStabilization", label: "Resonance stabilization", shortLabel: "Resonance", category: "Stability", description: "Compares the amount of structural delocalization available from aromatic and conjugated motifs.", direction: "desc" },
  { id: "aromaticStabilization", label: "Aromatic stabilization", shortLabel: "Aromaticity", category: "Stability", description: "Compares the extent of aromatic bonding detected in the graph.", direction: "desc" },
  { id: "conjugation", label: "Degree of conjugation", shortLabel: "Conjugation", category: "Stability", description: "Compares aromatic and alternating pi-bond connectivity.", direction: "desc" },

  { id: "acidity", label: "Acidity", shortLabel: "Acidity", category: "Acid/base & mechanisms", description: "Lower estimated pKa ranks as stronger acidity.", direction: "desc", tieTolerance: 0.15 },
  { id: "basicity", label: "Basicity", shortLabel: "Basicity", category: "Acid/base & mechanisms", description: "Higher estimated conjugate-acid pKa ranks as stronger basicity.", direction: "desc", tieTolerance: 0.15 },
  { id: "nucleophilicity", label: "Nucleophilicity", shortLabel: "Nu strength", category: "Acid/base & mechanisms", description: "Compares intrinsic nucleophilic-site tendency from charge, atom identity, resonance and steric accessibility.", direction: "desc", assumption: "Qualitative comparison; solvent can reverse some nucleophilicity trends." },
  { id: "sn1Reactivity", label: "SN1 reactivity", shortLabel: "SN1", category: "Acid/base & mechanisms", description: "Compares ionization tendency from leaving-group ability and carbocation stabilization at the leaving-group carbon.", direction: "desc", assumption: "Assumes otherwise comparable polar protic conditions." },
  { id: "sn2Reactivity", label: "SN2 reactivity", shortLabel: "SN2", category: "Acid/base & mechanisms", description: "Compares leaving-group ability and backside-access steric hindrance.", direction: "desc", assumption: "Assumes the same nucleophile and polar aprotic conditions." },
  { id: "e1Reactivity", label: "E1 reactivity", shortLabel: "E1", category: "Acid/base & mechanisms", description: "Compares ionization plus beta-hydrogen availability for unimolecular elimination.", direction: "desc", assumption: "Assumes comparable solvent and temperature." },
  { id: "e2Reactivity", label: "E2 reactivity", shortLabel: "E2", category: "Acid/base & mechanisms", description: "Compares leaving-group ability, substitution and beta-hydrogen availability.", direction: "desc", assumption: "Does not infer anti-periplanar 3D geometry; assumes a comparable strong base." },
  { id: "leavingGroupAbility", label: "Leaving-group ability", shortLabel: "Leaving group", category: "Acid/base & mechanisms", description: "Compares the best conventional leaving group detected in each molecule.", direction: "desc" },
  { id: "electrophilicity", label: "Electrophilicity", shortLabel: "Electrophile", category: "Acid/base & mechanisms", description: "Compares the strongest detected electron-poor reaction center.", direction: "desc" },
  { id: "carbonylReactivity", label: "Carbonyl reactivity", shortLabel: "Carbonyl", category: "Acid/base & mechanisms", description: "Compares qualitative carbonyl electrophilicity/acyl-substitution reactivity.", direction: "desc" },

  { id: "dielsAlderDiene", label: "Diels–Alder diene reactivity", shortLabel: "DA diene", category: "Diels–Alder & aromatic", description: "Ranks conjugated dienes; electron donation increases the diene score.", direction: "desc" },
  { id: "dielsAlderDienophile", label: "Diels–Alder dienophile reactivity", shortLabel: "DA dienophile", category: "Diels–Alder & aromatic", description: "Ranks alkenes/alkynes; electron-withdrawing activation increases the dienophile score.", direction: "desc" },
  { id: "easReactivity", label: "EAS ring reactivity", shortLabel: "EAS", category: "Diels–Alder & aromatic", description: "Compares qualitative aromatic activation/deactivation toward electrophilic aromatic substitution.", direction: "desc" },
  { id: "easDirecting", label: "EAS directing influence", shortLabel: "Director", category: "Diels–Alder & aromatic", description: "Compares the strongest detected ortho/para or meta-directing influence.", direction: "desc" },
  { id: "snarReactivity", label: "SNAr reactivity", shortLabel: "SNAr", category: "Diels–Alder & aromatic", description: "Compares aryl leaving groups activated by electron-withdrawing substituents.", direction: "desc" },

  { id: "protonSignalCount", label: "Distinct ¹H NMR signals", shortLabel: "¹H signals", category: "¹H NMR", description: "Compares the predicted number of distinct proton environments.", direction: "desc" },
  { id: "mostDownfieldProton", label: "Most downfield ¹H signal", shortLabel: "Downfield ¹H", category: "¹H NMR", description: "Ranks the largest predicted proton chemical shift.", direction: "desc" },
  { id: "mostUpfieldProton", label: "Most upfield ¹H signal", shortLabel: "Upfield ¹H", category: "¹H NMR", description: "Ranks the smallest predicted proton chemical shift first.", direction: "asc" },
  { id: "splittingComplexity", label: "¹H splitting complexity", shortLabel: "Splitting", category: "¹H NMR", description: "Compares the most complex predicted multiplicity in each spectrum.", direction: "desc" },

  { id: "carbonSignalCount", label: "Distinct ¹³C NMR signals", shortLabel: "¹³C signals", category: "¹³C NMR", description: "Compares the predicted number of distinct carbon environments.", direction: "desc" },
  { id: "mostDownfieldCarbon", label: "Most downfield ¹³C signal", shortLabel: "Downfield ¹³C", category: "¹³C NMR", description: "Ranks the largest predicted carbon chemical shift.", direction: "desc" },
  { id: "mostUpfieldCarbon", label: "Most upfield ¹³C signal", shortLabel: "Upfield ¹³C", category: "¹³C NMR", description: "Ranks the smallest predicted carbon chemical shift first.", direction: "asc" },

  { id: "highestIrBand", label: "Highest-frequency IR band", shortLabel: "High IR", category: "IR", description: "Compares the highest predicted diagnostic/supporting wavenumber.", direction: "desc" },
  { id: "lowestIrBand", label: "Lowest-frequency major IR band", shortLabel: "Low IR", category: "IR", description: "Compares the lowest predicted non-fingerprint major band.", direction: "asc" },
  { id: "strongestIrBand", label: "Strongest diagnostic IR absorption", shortLabel: "Strong IR", category: "IR", description: "Compares qualitative predicted IR intensity, then band position.", direction: "desc" },

  { id: "molecularIonMz", label: "Molecular-ion m/z", shortLabel: "M⁺•", category: "Mass spectrometry", description: "Compares predicted molecular-ion mass-to-charge ratio.", direction: "desc" },
  { id: "basePeakMz", label: "Predicted base-peak m/z", shortLabel: "Base peak", category: "Mass spectrometry", description: "Compares the m/z of the most intense predicted EI peak.", direction: "desc" },
  { id: "massFragments", label: "Common diagnostic fragments", shortLabel: "Fragments", category: "Mass spectrometry", description: "Side-by-side view of the most intense predicted EI fragment/diagnostic peaks.", direction: "none" },
  { id: "isotopeProminence", label: "Isotope-pattern prominence", shortLabel: "Isotopes", category: "Mass spectrometry", description: "Compares the strongest predicted M+n isotope peak relative to M.", direction: "desc" },

  { id: "boilingPoint", label: "Boiling-point tendency", shortLabel: "Boiling point", category: "Physical properties", description: "Compares the existing PocketChem intermolecular-force/size boiling-point score.", direction: "desc" },
  { id: "meltingPoint", label: "Melting-point tendency", shortLabel: "Melting point", category: "Physical properties", description: "Qualitative crystal-packing proxy using rigidity, polarity, symmetry-like features and hydrogen bonding.", direction: "desc", assumption: "Melting point is especially packing-sensitive; this is a qualitative tendency, not a temperature prediction." },
  { id: "solubility", label: "Water solubility", shortLabel: "Solubility", category: "Physical properties", description: "Compares the existing PocketChem water-solubility tendency score.", direction: "desc" },
  { id: "polarity", label: "Polarity", shortLabel: "Polarity", category: "Physical properties", description: "Compares a descriptor-based polarity tendency from TPSA, charge and lipophilicity.", direction: "desc" },
  { id: "lipophilicity", label: "Lipophilicity", shortLabel: "Lipophilicity", category: "Physical properties", description: "Compares RDKit logP when available.", direction: "desc" },
  { id: "hydrogenBonding", label: "Hydrogen-bonding ability", shortLabel: "H bonding", category: "Physical properties", description: "Compares hydrogen-bond donors and acceptors.", direction: "desc" },
  { id: "dipoleTendency", label: "Dipole tendency", shortLabel: "Dipole", category: "Physical properties", description: "Qualitative molecular dipole tendency from polar functionality and charge separation proxies.", direction: "desc" },
  { id: "dispersionTendency", label: "Dispersion-force tendency", shortLabel: "Dispersion", category: "Physical properties", description: "Compares molecular size and polarizability proxies.", direction: "desc" },

  { id: "cipPriority", label: "CIP substituent priority", shortLabel: "CIP", category: "Structure & stereochemistry", description: "Ranks substituents by the existing recursive CIP comparison engine.", direction: "desc" },
  { id: "stericBulk", label: "Steric bulk", shortLabel: "Sterics", category: "Structure & stereochemistry", description: "Compares size, branching and ring congestion proxies.", direction: "desc" },
  { id: "conformationalStability", label: "Conformational rigidity", shortLabel: "Rigidity", category: "Structure & stereochemistry", description: "Compares rigidity using rings, pi bonds and rotatable-bond count.", direction: "desc" },
];

const MODE_MAP = new Map(COMPARISON_MODES.map((mode) => [mode.id, mode]));

export function getComparisonMode(id: ComparisonModeId): ComparisonModeDefinition {
  return MODE_MAP.get(id) ?? COMPARISON_MODES[0];
}

function compareVectors(a: number[] | undefined, b: number[] | undefined) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (av !== bv) return bv - av;
  }
  return 0;
}

export function rankComparisonEntries<T extends { metric: ComparisonMetric }>(
  rows: T[],
  mode: ComparisonModeDefinition,
): T[] {
  if (mode.direction === "none") return [...rows];

  return [...rows].sort((a, b) => {
    const vectorOrder = compareVectors(a.metric.sortVector, b.metric.sortVector);
    if (vectorOrder !== 0) return vectorOrder;

    if (a.metric.score === null && b.metric.score === null) return 0;
    if (a.metric.score === null) return 1;
    if (b.metric.score === null) return -1;

    return mode.direction === "asc"
      ? a.metric.score - b.metric.score
      : b.metric.score - a.metric.score;
  });
}
