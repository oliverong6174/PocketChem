import type { FunctionalGroupPattern } from "../../types";

export const acidDerivativeGroups: FunctionalGroupPattern[] = [
  {
    name: "Peroxyacid",
    priority: 0.9,
    nomenclaturePriority: 0.9,
    confidence: "High",
    suffix: "-peroxoic acid",
    prefix: "peroxy",
    equivalentNames: ["peracid", "peroxycarboxylic acid"],
    smarts: "[CX3](=O)[OX2][OX2H]",
    mcatNote:
      "Peroxyacids contain a carbonyl attached to an O-OH group. They are powerful oxidizing agents commonly used for alkene epoxidation and Baeyer-Villiger oxidation.",
  },
  {
    name: "Carboxylic acid",
    priority: 1,
    nomenclaturePriority: 1,
    confidence: "High",
    suffix: "-oic acid",
    prefix: "carboxy",
    smarts: "[CX3](=O)[OX2H1]",
    mcatNote:
      "Carboxylic acids are acidic because their conjugate base is resonance-stabilized. At physiological pH, they are often negatively charged carboxylates.",
  },
  {
    name: "Acid anhydride",
    priority: 3,
    nomenclaturePriority: 3,
    confidence: "High",
    suffix: "-oic anhydride",
    prefix: "(acyloxy)carbonyl",
    smarts: "[CX3](=[OX1])[OX2][CX3](=[OX1])",
    mcatNote:
      "Anhydrides are reactive carboxylic acid derivatives. They undergo nucleophilic acyl substitution to form acids, esters, or amides.",
  },
  {
    name: "Ester",
    priority: 4,
    nomenclaturePriority: 4,
    confidence: "High",
    suffix: "-oate",
    prefix: "alkoxycarbonyl",
    smarts: "[CX3](=[OX1])[OX2][CX4,c]",
    mcatNote:
      "Esters are carboxylic acid derivatives. They are common in lipids and can undergo hydrolysis.",
  },
  {
    name: "Acyl halide",
    priority: 5,
    nomenclaturePriority: 5,
    confidence: "High",
    suffix: "-oyl halide",
    prefix: "halocarbonyl",
    smarts: "[CX3](=O)[F,Cl,Br,I]",
    mcatNote:
      "Acyl halides are highly reactive carboxylic acid derivatives and readily undergo nucleophilic acyl substitution.",
  },
  {
    name: "Amide",
    priority: 6,
    nomenclaturePriority: 6,
    confidence: "High",
    suffix: "-amide",
    prefix: "carbamoyl",
    smarts: "[CX3](=[OX1])[NX3]",
    mcatNote:
      "Amides are resonance-stabilized and less basic than amines. Peptide bonds in proteins are amide bonds.",
  },
  {
    name: "Primary amide",
    priority: 5.90,
    nomenclaturePriority: 5.90,
    confidence: "High",
    suffix: "-amide",
    prefix: "carbamoyl",
    equivalentNames: ["1° amide"],
    smarts: "[CX3](=[OX1])[NX3H2]",
    mcatNote:
      "Primary amides have a carbonyl attached to NH2. Their nitrogen lone pair is resonance-delocalized into the carbonyl, making them much less basic than amines.",
  },
  {
    name: "Secondary amide",
    priority: 5.91,
    nomenclaturePriority: 5.91,
    confidence: "High",
    suffix: "-amide",
    prefix: "carbamoyl",
    equivalentNames: ["2° amide"],
    smarts: "[CX3](=[OX1])[NX3H1][#6]",
    mcatNote:
      "Secondary amides have a carbonyl attached to NHR. Peptide bonds are usually secondary amides.",
  },
  {
    name: "Tertiary amide",
    priority: 5.92,
    nomenclaturePriority: 5.92,
    confidence: "High",
    suffix: "-amide",
    prefix: "carbamoyl",
    equivalentNames: ["3° amide"],
    smarts: "[CX3](=[OX1])[NX3H0]([#6])[#6]",
    mcatNote:
      "Tertiary amides have a carbonyl attached to NR2. They are resonance-stabilized and cannot donate N-H hydrogen bonds.",
  },
];