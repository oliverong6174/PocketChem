import type { FunctionalGroupPattern } from "../types";

export const chargedGroups: FunctionalGroupPattern[] = [
  {
    name: "Oxonium ion",
    priority: 0.1,
    nomenclaturePriority: 0.1,
    confidence: "High",
    suffix: "N/A",
    prefix: "oxonium",
    smarts: "[O+]",
    mcatNote:
      "Oxonium ions contain positively charged oxygen. They are strongly acidic because deprotonation gives a neutral oxygen species.",
  },
  {
    name: "Ammonium ion",
    priority: 0.2,
    nomenclaturePriority: 0.2,
    confidence: "High",
    suffix: "N/A",
    prefix: "ammonium",
    smarts: "[N+;H1,H2,H3,H4]",
    mcatNote:
      "Ammonium ions are protonated amines. They can donate H+ to reform a neutral amine.",
  },
  {
    name: "Carboxylate",
    priority: 0.3,
    nomenclaturePriority: 0.3,
    confidence: "High",
    suffix: "carboxylate",
    prefix: "carboxylato",
    smarts: "[CX3](=[OX1])[O-]",
    mcatNote:
      "Carboxylates are resonance-stabilized conjugate bases of carboxylic acids. They are weaker bases than alkoxides.",
  },
  {
    name: "Alkoxide",
    priority: 0.4,
    nomenclaturePriority: 0.4,
    confidence: "High",
    suffix: "alkoxide",
    prefix: "alkoxy",
    smarts: "[O-][CX4]",
    mcatNote:
      "Alkoxides contain negatively charged oxygen. They are strong bases and strong nucleophiles.",
  },
  {
    name: "Amide anion",
    priority: 0.45,
    nomenclaturePriority: 0.45,
    confidence: "High",
    suffix: "amide anion",
    prefix: "amido",
    smarts: "[#7-]",
    mcatNote:
      "Amide anions contain negatively charged nitrogen. They are very strong bases and strong nucleophiles because protonation gives an amine.",
  },
  {
    name: "Deprotonated carboxamide",
    priority: 0.46,
    nomenclaturePriority: 0.46,
    confidence: "High",
    suffix: "amide anion",
    prefix: "amido",
    smarts: "[#6](=[#8])-[#7-]",
    mcatNote:
      "A deprotonated carboxamide has negative charge on nitrogen next to a carbonyl. Resonance with the carbonyl stabilizes the anion, making it less basic than a simple amide anion.",
  },
  {
    name: "Thiolate",
    priority: 0.5,
    nomenclaturePriority: 0.5,
    confidence: "High",
    suffix: "thiolate",
    prefix: "thiolato",
    smarts: "[S-]",
    mcatNote:
      "Thiolates contain negatively charged sulfur. They are strong nucleophiles and are less basic than alkoxides.",
  },
  {
    name: "Acetylide anion",
    priority: 0.55,
    nomenclaturePriority: 0.55,
    confidence: "High",
    suffix: "acetylide",
    prefix: "acetylido",
    smarts: "[C-]#[C]",
    mcatNote:
      "Acetylide anions are negatively charged carbons attached to a carbon-carbon triple bond. They are strong bases and strong nucleophiles, commonly used to form new C-C bonds.",
  },
  {
    name: "Methyl carbanion",
    priority: 0.57,
    nomenclaturePriority: 0.57,
    confidence: "High",
    suffix: "carbanion",
    prefix: "carbanion",
    smarts: "[CH2-]",
    mcatNote:
      "A CH2− carbanion is a negatively charged carbon with a lone pair. It is usually a very strong base and strong nucleophile unless stabilized by resonance or nearby electron-withdrawing groups.",
  },
  {
    name: "Carbanion",
    priority: 0.6,
    nomenclaturePriority: 0.6,
    confidence: "Medium",
    suffix: "carbanion",
    prefix: "carbanion",
    smarts: "[C-]",
    mcatNote:
      "Carbanions are usually very strong bases and nucleophiles unless stabilized by resonance or electron-withdrawing groups.",
  },
];