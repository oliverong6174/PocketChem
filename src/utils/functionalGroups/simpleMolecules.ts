  import type { FunctionalGroupResult } from "./types";

  export function detectSimpleMolecule(smiles: string): FunctionalGroupResult[] | null {
    const normalized = smiles.trim();


    //Add ammonium, peroxide, ions, atoms with no carbon
    const simpleMolecules: Record<string, FunctionalGroupResult[]> = {
      O: [
        {
    name: "Water",
    priority: 999,
    nomenclaturePriority: 999,
    confidence: "High",
    suffix: "",
    prefix: "",
    count: 1,
    mcatNote: "Water is not usually treated as an organic functional group.",
    matches: [],
  }
    ],

      "O=C=O": [
        {
          name: "Carbon dioxide",
          priority: 999,
          nomenclaturePriority: 999,
          confidence: "High",
          suffix: "",
          prefix: "",
          count: 1,
          mcatNote: "Carbon dioxide is inorganic and does not contain an organic functional group.",
          matches: [],
        },
      ],

      N: [
        {
          name: "Ammonia",
          priority: 999,
          nomenclaturePriority: 999,
          confidence: "High",
          suffix: "",
          prefix: "",
          count: 1,
          mcatNote: "Ammonia is inorganic and is not usually classified as an organic amine.",
          matches: [],
        },
      ],

      C: [
        {
          name: "Methane / Alkane",
          priority: 100,
          nomenclaturePriority: 100,
          confidence: "High",
          suffix: "ane",
          prefix: "alkyl",
          count: 1,
          mcatNote: "Simple alkane; mostly nonpolar and relatively unreactive.",
          matches: [],
        },
      ],
    };

    return simpleMolecules[normalized] ?? null;
  }