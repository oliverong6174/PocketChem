import type { FunctionalGroupPattern } from "../../types";

export const unsaturatedHydrocarbons: FunctionalGroupPattern[] = [
  {
    name: "Alkene",
    priority: 24,
    nomenclaturePriority: 18,
    confidence: "High",
    suffix: "-ene",
    prefix: "alkenyl",
    smarts: "C=C",
    mcatNote:
      "Alkenes contain a carbon-carbon double bond. They undergo electrophilic addition reactions and contribute one degree of unsaturation.",
  },
  {
    name: "Diene",
    priority: 24.1,
    nomenclaturePriority: 18.1,
    confidence: "High",
    suffix: "-diene",
    prefix: "dienyl",
    equivalentNames: ["two alkenes"],
    smarts: "C=C-C=C",
    mcatNote:
      "Dienes contain two carbon-carbon double bonds. Conjugated dienes participate in Diels-Alder reactions.",
  },
  {
    name: "Triene",
    priority: 24.2,
    nomenclaturePriority: 18.2,
    confidence: "Medium",
    suffix: "-triene",
    prefix: "trienyl",
    equivalentNames: ["three alkenes"],
    smarts: "C=C-C=C-C=C",
    mcatNote:
      "Trienes contain three carbon-carbon double bonds and often exhibit extended conjugation.",
  },
  {
    name: "Conjugated diene",
    priority: 24.15,
    nomenclaturePriority: 18.15,
    confidence: "High",
    suffix: "-diene",
    prefix: "conjugated dienyl",
    equivalentNames: ["1,3-diene"],
    smarts: "C=CC=C",
    mcatNote:
      "Conjugated dienes have alternating double and single bonds, allowing resonance stabilization and Diels-Alder reactivity.",
  },
  {
    name: "Cumulated diene",
    priority: 24.16,
    nomenclaturePriority: 18.16,
    confidence: "Medium",
    suffix: "-diene",
    prefix: "allenyl",
    equivalentNames: ["allene"],
    smarts: "C=C=C",
    mcatNote:
      "Cumulated dienes contain adjacent double bonds sharing one carbon. The simplest example is allene.",
  },
  {
    name: "Allene",
    priority: 24.17,
    nomenclaturePriority: 18.17,
    confidence: "High",
    suffix: "allene",
    prefix: "allenyl",
    equivalentNames: ["propadiene"],
    smarts: "C=C=C",
    mcatNote:
      "Allenes are cumulated dienes whose central carbon is sp-hybridized. Their terminal π bonds are perpendicular.",
  },
  {
    name: "Enyne",
    priority: 24.3,
    nomenclaturePriority: 18.3,
    confidence: "Medium",
    suffix: "-enyne",
    prefix: "alkenynyl",
    equivalentNames: ["alkene-alkyne"],
    smarts: "C=CC#C",
    mcatNote:
      "Enynes contain both an alkene and an alkyne, creating unique conjugated π systems.",
  },
  {
    name: "Alkyne",
    priority: 25,
    nomenclaturePriority: 19,
    confidence: "High",
    suffix: "-yne",
    prefix: "alkynyl",
    smarts: "C#C",
    mcatNote:
      "Alkynes contain a carbon-carbon triple bond. They contribute two degrees of unsaturation and undergo addition reactions.",
  },
  {
    name: "Terminal alkyne",
    priority: 25.1,
    nomenclaturePriority: 19.1,
    confidence: "High",
    suffix: "-yne",
    prefix: "ethynyl",
    equivalentNames: ["acetylenic hydrogen"],
    smarts: "[CX2]#[CX2H]",
    mcatNote:
      "Terminal alkynes possess an acidic hydrogen (pKa ≈25) and can be deprotonated to form acetylide anions.",
  },
  {
    name: "Internal alkyne",
    priority: 25.2,
    nomenclaturePriority: 19.2,
    confidence: "Medium",
    suffix: "-yne",
    prefix: "alkynyl",
    equivalentNames: ["disubstituted alkyne"],
    smarts: "[#6][CX2]#[CX2][#6]",
    mcatNote:
      "Internal alkynes lack an acidic terminal hydrogen and therefore cannot form acetylide anions directly.",
  },
];