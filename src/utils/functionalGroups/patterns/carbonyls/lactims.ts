import type { FunctionalGroupPattern } from "../../types";

export const lactimGroups: FunctionalGroupPattern[] = [
  {
    name: "Alpha lactim",
    priority: 11.21,
    nomenclaturePriority: 11.21,
    confidence: "Low",
    suffix: "α-lactim",
    prefix: "hydroxyazirinyl",
    equivalentNames: ["three-membered cyclic imidic acid"],
    smarts: "[NX2;R]1=[CX3;R]([OX2H])[CX4;R]1",
    mcatNote:
      "Alpha lactims are the imidic acid tautomers of alpha lactams.",
  },
  {
    name: "Beta lactim",
    priority: 11.22,
    nomenclaturePriority: 11.22,
    confidence: "Medium",
    suffix: "β-lactim",
    prefix: "hydroxyazetinyl",
    equivalentNames: ["four-membered cyclic imidic acid"],
    smarts: "[NX2;R]1=[CX3;R]([OX2H])[CX4;R][CX4;R]1",
    mcatNote:
      "Beta lactims are the imidic acid tautomers of beta lactams.",
  },
  {
    name: "Gamma lactim",
    priority: 11.23,
    nomenclaturePriority: 11.23,
    confidence: "Medium",
    suffix: "γ-lactim",
    prefix: "hydroxypyrrolinyl",
    equivalentNames: ["five-membered cyclic imidic acid"],
    smarts: "[NX2;R]1=[CX3;R]([OX2H])[CX4;R][CX4;R][CX4;R]1",
    mcatNote:
      "Gamma lactims are the imidic acid tautomers of gamma lactams.",
  },
  {
    name: "Delta lactim",
    priority: 11.24,
    nomenclaturePriority: 11.24,
    confidence: "Medium",
    suffix: "δ-lactim",
    prefix: "hydroxypiperidinyl",
    equivalentNames: ["six-membered cyclic imidic acid"],
    smarts:
      "[NX2;R]1=[CX3;R]([OX2H])[CX4;R][CX4;R][CX4;R][CX4;R]1",
    mcatNote:
      "Delta lactims are the imidic acid tautomers of delta lactams.",
  },
  {
    name: "Epsilon lactim",
    priority: 11.25,
    nomenclaturePriority: 11.25,
    confidence: "Low",
    suffix: "ε-lactim",
    prefix: "hydroxyazepinyl",
    equivalentNames: ["seven-membered cyclic imidic acid"],
    smarts:
      "[NX2;R]1=[CX3;R]([OX2H])[CX4;R][CX4;R][CX4;R][CX4;R][CX4;R]1",
    mcatNote:
      "Epsilon lactims are the imidic acid tautomers of epsilon lactams.",
  },
  {
    name: "Lactim",
    priority: 11.29,
    nomenclaturePriority: 11.29,
    confidence: "Medium",
    suffix: "lactim",
    prefix: "hydroxyaza",
    equivalentNames: ["cyclic imidic acid"],
    smarts: "[NX2;R]=[CX3;R][OX2H]",
    mcatNote:
      "Lactims are the imidic acid tautomers of lactams. They participate in lactam-lactim tautomerism.",
  },
];