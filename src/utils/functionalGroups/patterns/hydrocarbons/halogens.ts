import type { FunctionalGroupPattern } from "../../types";

export const halogenGroups: FunctionalGroupPattern[] = [
  {
    name: "Halogen",
    priority: 27,
    nomenclaturePriority: 21,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "fluoro, chloro, bromo, iodo",
    smarts: "[F,Cl,Br,I]",
    mcatNote:
      "Halogens are electronegative substituents. In organic molecules they are named as fluoro, chloro, bromo, or iodo substituents.",
  },
  {
    name: "Haloalkane",
    priority: 27.1,
    nomenclaturePriority: 21.1,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "halo",
    equivalentNames: ["alkyl halide"],
    smarts: "[CX4][F,Cl,Br,I]",
    mcatNote:
      "Haloalkanes contain a halogen attached to an sp3 carbon. They readily undergo SN1, SN2, E1, and E2 reactions.",
  },
  {
    name: "Allylic halide",
    priority: 27.2,
    nomenclaturePriority: 21.2,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "allylic halo",
    equivalentNames: ["allyl halide"],
    smarts: "C=C[CX4][F,Cl,Br,I]",
    mcatNote:
      "Allylic halides have a halogen adjacent to an alkene. Their intermediates are resonance-stabilized, making substitution reactions faster.",
  },
  {
    name: "Benzylic halide",
    priority: 27.3,
    nomenclaturePriority: 21.3,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "benzylic halo",
    equivalentNames: ["benzyl halide"],
    smarts: "[a][CH2][F,Cl,Br,I]",
    mcatNote:
      "Benzylic halides contain a halogen on the carbon next to a benzene ring. Benzylic carbocations and radicals are resonance-stabilized.",
  },
  {
    name: "Geminal dihalide",
    priority: 27.4,
    nomenclaturePriority: 21.4,
    confidence: "Medium",
    suffix: "Never suffix",
    prefix: "gem-dihalo",
    equivalentNames: ["1,1-dihalide"],
    smarts: "[CX4]([F,Cl,Br,I])([F,Cl,Br,I])",
    mcatNote:
      "Geminal dihalides contain two halogens on the same carbon atom. They are useful synthetic intermediates.",
  },
  {
    name: "Vicinal dihalide",
    priority: 27.5,
    nomenclaturePriority: 21.5,
    confidence: "Medium",
    suffix: "Never suffix",
    prefix: "vic-dihalo",
    equivalentNames: ["1,2-dihalide"],
    smarts: "[CX4]([F,Cl,Br,I])[CX4]([F,Cl,Br,I])",
    mcatNote:
      "Vicinal dihalides contain halogens on adjacent carbons. They are commonly formed by halogen addition to alkenes.",
  },
  {
    name: "Allylic fluoride",
    priority: 27.21,
    nomenclaturePriority: 21.21,
    confidence: "Medium",
    suffix: "Never suffix",
    prefix: "allylic fluoro",
    smarts: "C=C[CX4]F",
    mcatNote:
      "An allylic fluoride contains fluorine on the carbon adjacent to an alkene.",
  },
  {
    name: "Allylic chloride",
    priority: 27.22,
    nomenclaturePriority: 21.22,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "allylic chloro",
    smarts: "C=C[CX4]Cl",
    mcatNote:
      "Allylic chlorides are common substrates for SN1, SN2, and allylic substitution reactions.",
  },
  {
    name: "Allylic bromide",
    priority: 27.23,
    nomenclaturePriority: 21.23,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "allylic bromo",
    smarts: "C=C[CX4]Br",
    mcatNote:
      "Allylic bromides are frequently used in organic synthesis because bromide is an excellent leaving group.",
  },
  {
    name: "Benzylic chloride",
    priority: 27.31,
    nomenclaturePriority: 21.31,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "benzyl chloro",
    smarts: "[a][CH2]Cl",
    mcatNote:
      "Benzyl chloride is a classic benzylic halide and reacts readily through substitution pathways.",
  },
  {
    name: "Benzylic bromide",
    priority: 27.32,
    nomenclaturePriority: 21.32,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "benzyl bromo",
    smarts: "[a][CH2]Br",
    mcatNote:
      "Benzylic bromides are highly reactive SN2 substrates because of resonance stabilization.",
  },
];