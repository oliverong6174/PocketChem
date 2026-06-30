import type { FunctionalGroupPattern } from "../types";

export const sulfurPhosphorusGroups: FunctionalGroupPattern[] = [
  {
    name: "Sulfonic acid",
    priority: 2,
    nomenclaturePriority: 2,
    confidence: "High",
    suffix: "-sulfonic acid",
    prefix: "sulfo",
    smarts: "S(=O)(=O)[OX2H]",
    mcatNote:
      "Sulfonic acids are very strong organic acids because the conjugate base is highly resonance-stabilized over multiple oxygens.",
  },
  {
    name: "Thiol",
    priority: 11,
    nomenclaturePriority: 11,
    confidence: "High",
    suffix: "-thiol",
    prefix: "sulfanyl",
    smarts: "[#6][SX2H]",
    mcatNote:
      "Thiols contain an -SH group. They are sulfur analogs of alcohols and can form disulfide bonds, especially in cysteine residues.",
  },
  {
    name: "Phosphine",
    priority: 16,
    nomenclaturePriority: 13.5,
    confidence: "Medium",
    suffix: "-phosphane",
    prefix: "phosphanyl",
    smarts: "[PX3]",
    mcatNote:
      "Phosphines contain trivalent phosphorus. They are more common in organophosphorus chemistry than in basic MCAT organic chemistry.",
  },
  {
    name: "Thioether",
    priority: 20,
    nomenclaturePriority: 16,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "alkylthio",
    smarts: "[#6][SX2][#6]",
    mcatNote:
      "Thioethers, also called sulfides, contain sulfur between two carbon groups. Methionine contains a thioether.",
  },
  {
    name: "Sulfoxide",
    priority: 21,
    nomenclaturePriority: 16.5,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "sulfinyl",
    smarts: "[#6][SX3](=O)[#6]",
    mcatNote:
      "Sulfoxides contain sulfur bonded to oxygen and two carbon groups. The S=O bond is polar.",
  },
  {
    name: "Sulfone",
    priority: 22,
    nomenclaturePriority: 16.6,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "sulfonyl",
    smarts: "[#6][SX4](=O)(=O)[#6]",
    mcatNote:
      "Sulfones contain sulfur double-bonded to two oxygens and bonded to two carbon groups. They are highly polar sulfur-containing groups.",
  },
  {
    name: "Phosphate",
    priority: 33,
    nomenclaturePriority: 24,
    confidence: "Medium",
    suffix: "phosphate",
    prefix: "phospho",
    smarts: "P(=O)(O)O",
    mcatNote:
      "Phosphates are highly charged and important in ATP, DNA/RNA, signaling, and metabolic activation steps.",
  },
];