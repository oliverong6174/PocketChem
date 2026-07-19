import type { FunctionalGroupPattern } from "../types";

export const chargedGroups: FunctionalGroupPattern[] = [
  // =========================
  // OXYGEN IONS
  // =========================

  {
    name: "Hydronium",
    category: "ion",
    priority: 0.05,
    nomenclaturePriority: 0.05,
    confidence: "High",
    suffix: "N/A",
    prefix: "hydronium",
    smarts: "[OH3+]",
    displaySmarts: "[OH3+]",
    mcatNote:
      "Hydronium is the protonated form of water and the primary acidic species in aqueous solution.",
  },
  {
    name: "Oxonium ion",
    category: "ion",
    priority: 0.1,
    nomenclaturePriority: 0.1,
    confidence: "High",
    suffix: "N/A",
    prefix: "oxonium",
    smarts: "[O+]",
    displaySmarts: "[O+]",
    mcatNote:
      "Oxonium ions contain positively charged oxygen. They are strongly acidic because deprotonation gives a neutral oxygen species.",
  },
  {
    name: "Hydroxide",
    category: "ion",
    priority: 0.15,
    nomenclaturePriority: 0.15,
    confidence: "High",
    suffix: "hydroxide",
    prefix: "hydroxy",
    smarts: "[OH-]",
    displaySmarts: "[OH-]",
    mcatNote:
      "Hydroxide is a strong base commonly encountered in elimination, substitution, and acid-base reactions.",
  },
  {
    name: "Alkoxide",
    category: "ion",
    priority: 0.2,
    nomenclaturePriority: 0.2,
    confidence: "High",
    suffix: "alkoxide",
    prefix: "alkoxy",
    smarts: "[O-][CX4]",
    displaySmarts: "[O-]",
    mcatNote:
      "Alkoxides contain negatively charged oxygen. They are strong bases and strong nucleophiles.",
  },
  {
    name: "Phenoxide",
    category: "ion",
    priority: 0.21,
    nomenclaturePriority: 0.21,
    confidence: "High",
    suffix: "phenoxide",
    prefix: "phenoxy",
    smarts: "[O-]c1ccccc1",
    displaySmarts: "[O-]",
    mcatNote:
      "Phenoxide ions are resonance-stabilized conjugate bases of phenols.",
  },
  {
    name: "Carboxylate",
    category: "functionalGroup",
    priority: 0.3,
    nomenclaturePriority: 0.3,
    confidence: "High",
    suffix: "carboxylate",
    prefix: "carboxylato",
    smarts: "[CX3](=[OX1])[O-]",
    displaySmarts: "[CX3](=[OX1])[O-]",
    mcatNote:
      "Carboxylates are resonance-stabilized conjugate bases of carboxylic acids.",
    
  },

  // =========================
  // NITROGEN IONS
  // =========================

  {
    name: "Ammonium ion",
    category: "ion",
    priority: 0.4,
    nomenclaturePriority: 0.4,
    confidence: "High",
    suffix: "N/A",
    prefix: "ammonium",
    smarts: "[N+;H1,H2,H3,H4]",
    displaySmarts: "[N+]",
    mcatNote:
      "Ammonium ions are protonated amines. They can donate H+ to reform a neutral amine.",
  },
  {
    name: "Primary ammonium",
    category: "ion",
    priority: 0.41,
    nomenclaturePriority: 0.41,
    confidence: "High",
    suffix: "N/A",
    prefix: "ammonium",
    smarts: "[NH3+][CX4]",
    displaySmarts: "[N+]",
    mcatNote:
      "Primary ammonium ions are protonated primary amines.",
  },
  {
    name: "Secondary ammonium",
    category: "ion",
    priority: 0.42,
    nomenclaturePriority: 0.42,
    confidence: "High",
    suffix: "N/A",
    prefix: "ammonium",
    smarts: "[NH2+]([CX4])[CX4]",
    displaySmarts: "[N+]",
    mcatNote:
      "Secondary ammonium ions are protonated secondary amines.",
  },
  {
    name: "Tertiary ammonium",
    category: "ion",
    priority: 0.43,
    nomenclaturePriority: 0.43,
    confidence: "High",
    suffix: "N/A",
    prefix: "ammonium",
    smarts: "[NH+]([CX4])([CX4])[CX4]",
    displaySmarts: "[N+]",
    mcatNote:
      "Tertiary ammonium ions are protonated tertiary amines.",
  },
  {
    name: "Quaternary ammonium",
    category: "ion",
    priority: 0.44,
    nomenclaturePriority: 0.44,
    confidence: "High",
    suffix: "N/A",
    prefix: "quaternary ammonium",
    smarts: "[N+]([CX4])([CX4])([CX4])[CX4]",
    displaySmarts: "[N+]",
    mcatNote:
      "Quaternary ammonium ions possess four carbon substituents and a permanent positive charge.",
  },
  {
    name: "Amide anion",
    category: "ion",
    priority: 0.45,
    nomenclaturePriority: 0.45,
    confidence: "High",
    suffix: "amide anion",
    prefix: "amido",
    smarts: "[#7-]",
    displaySmarts: "[N-]",
    mcatNote:
      "Amide anions are extremely strong bases and strong nucleophiles.",
  },
  {
    name: "Deprotonated carboxamide",
    category: "ion",
    priority: 0.46,
    nomenclaturePriority: 0.46,
    confidence: "High",
    suffix: "amide anion",
    prefix: "amido",
    smarts: "[#6](=[#8])-[#7-]",
    displaySmarts: "[#6](=[#8])-[#7-]",
    mcatNote:
      "Negative charge adjacent to a carbonyl is resonance stabilized.",
  },

  // =========================
  // SULFUR IONS
  // =========================

  {
    name: "Thiolate",
    category: "functionalGroup",
    priority: 0.5,
    nomenclaturePriority: 0.5,
    confidence: "High",
    suffix: "thiolate",
    prefix: "thiolato",
    smarts: "[S-]",
    displaySmarts: "[S-]",
    mcatNote:
      "Thiolates are powerful nucleophiles and conjugate bases of thiols.",
  },
  {
    name: "Sulfonium ion",
    category: "ion",
    priority: 0.51,
    nomenclaturePriority: 0.51,
    confidence: "High",
    suffix: "sulfonium",
    prefix: "sulfonio",
    smarts: "[S+]",
    displaySmarts: "[S+]",
    mcatNote:
      "Sulfonium ions are positively charged sulfur compounds.",
  },

  // =========================
  // CARBON IONS
  // =========================

  {
    name: "Acetylide anion",
    category: "ion",
    priority: 0.55,
    nomenclaturePriority: 0.55,
    confidence: "High",
    suffix: "acetylide",
    prefix: "acetylido",
    smarts: "[C-]#[C]",
    displaySmarts: "[C-]#[C]",
    mcatNote:
      "Acetylide anions are excellent carbon nucleophiles used to form C-C bonds.",
  },
  {
    name: "Methyl carbanion",
    category: "ion",
    priority: 0.57,
    nomenclaturePriority: 0.57,
    confidence: "High",
    suffix: "carbanion",
    prefix: "carbanion",
    smarts: "[CH2-]",
    displaySmarts: "[CH2-]",
    mcatNote:
      "The simplest carbanion. Extremely basic and nucleophilic.",
  },
  {
    name: "Benzylic carbanion",
    category: "ion",
    priority: 0.58,
    nomenclaturePriority: 0.58,
    confidence: "High",
    suffix: "carbanion",
    prefix: "benzyl",
    smarts: "c[CH-]",
    displaySmarts: "[CH-]",
    mcatNote:
      "Benzylic carbanions are resonance stabilized by the aromatic ring.",
  },
  {
    name: "Allylic carbanion",
    category: "ion",
    priority: 0.59,
    nomenclaturePriority: 0.59,
    confidence: "High",
    suffix: "carbanion",
    prefix: "allyl",
    smarts: "C=C[CH-]",
    displaySmarts: "[CH-]",
    mcatNote:
      "Allylic carbanions are resonance stabilized across the alkene.",
  },
  {
    name: "Carbanion",
    category: "ion",
    priority: 0.6,
    nomenclaturePriority: 0.6,
    confidence: "Medium",
    suffix: "carbanion",
    prefix: "carbanion",
    smarts: "[C-]",
    displaySmarts: "[C-]",
    mcatNote:
      "Carbanions are generally strong bases and nucleophiles unless resonance stabilized.",
  },

  // ==========================
  // CATION
  // ==========================

  {
    name: "Carbocation",
    category: "ion",
    priority: 0.64,
    nomenclaturePriority: 0.64,
    confidence: "High",
    suffix: "carbocation",
    prefix: "carbocation",
    smarts: "[#6+]",
    displaySmarts: "[#6+]",
    mcatNote:
      "Carbocations are electron-deficient carbon centers stabilized by resonance, hyperconjugation, and alkyl substitution.",
  },

  // =========================
  // PHOSPHORUS
  // =========================

  {
    name: "Phosphonium ion",
    category: "ion",
    priority: 0.65,
    nomenclaturePriority: 0.65,
    confidence: "High",
    suffix: "phosphonium",
    prefix: "phosphonio",
    smarts: "[P+]",
    displaySmarts: "[P+]",
    mcatNote:
      "Phosphonium ions are important intermediates in Wittig reactions.",
  },

  // =========================
  // SIMPLE ANIONS
  // =========================

  {
    name: "Fluoride",
    category: "ion",
    priority: 0.7,
    nomenclaturePriority: 0.7,
    confidence: "High",
    suffix: "fluoride",
    prefix: "fluoro",
    smarts: "[F-]",
    displaySmarts: "[F-]",
    mcatNote:
      "Fluoride is a small, strongly basic halide ion.",
  },
  {
    name: "Chloride",
    category: "ion",
    priority: 0.71,
    nomenclaturePriority: 0.71,
    confidence: "High",
    suffix: "chloride",
    prefix: "chloro",
    smarts: "[Cl-]",
    displaySmarts: "[Cl-]",
    mcatNote:
      "Chloride is a common leaving group and nucleophile.",
  },
  {
    name: "Bromide",
    category: "ion",
    priority: 0.72,
    nomenclaturePriority: 0.72,
    confidence: "High",
    suffix: "bromide",
    prefix: "bromo",
    smarts: "[Br-]",
    displaySmarts: "[Br-]",
    mcatNote:
      "Bromide is an excellent leaving group and nucleophile.",
  },
  {
    name: "Iodide",
    category: "ion",
    priority: 0.73,
    nomenclaturePriority: 0.73,
    confidence: "High",
    suffix: "iodide",
    prefix: "iodo",
    smarts: "[I-]",
    displaySmarts: "[I-]",
    mcatNote:
      "Iodide is the best common halide leaving group.",
  },

  // =========================
  // OTHER COMMON IONS
  // =========================

  {
    name: "Cyanide",
    category: "ion",
    priority: 0.8,
    nomenclaturePriority: 0.8,
    confidence: "High",
    suffix: "cyanide",
    prefix: "cyano",
    smarts: "[C-]#N",
    displaySmarts: "[C-]#N",
    mcatNote:
      "Cyanide is a strong nucleophile commonly used in SN2 reactions.",
  },
  {
    name: "Azide anion",
    category: "ion",
    priority: 0.81,
    nomenclaturePriority: 0.81,
    confidence: "High",
    suffix: "azide",
    prefix: "azido",
    smarts: "[N-]=[N+]=N",
    displaySmarts: "[N-]=[N+]=N",
    mcatNote:
      "Azide is a resonance-stabilized nucleophile commonly used in synthesis.",
  },
      {
    name: "Acylammonium ion",
    priority: 5.8,
    nomenclaturePriority: 5.8,
    confidence: "Medium",
    suffix: "Rare",
    prefix: "acylammonio",
    smarts: "[CX3](=[OX1])[NX4+]",
    displaySmarts: "[CX3](=[OX1])[NX4+]",
    mcatNote:
      "Acylammonium ions are positively charged amide derivatives formed as reactive intermediates in acyl transfer chemistry.",
    category: "ion",
    },
];