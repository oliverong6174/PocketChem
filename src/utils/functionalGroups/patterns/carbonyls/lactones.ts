import type { FunctionalGroupPattern } from "../../types";

export const lactoneGroups: FunctionalGroupPattern[] = [
  {
    name: "Alpha lactone",
    priority: 4.1,
    nomenclaturePriority: 4.1,
    confidence: "Low",
    suffix: "α-lactone",
    prefix: "oxooxiranyl",
    equivalentNames: ["three-membered cyclic ester"],
    smarts: "[OX2;R]1[CX3;R](=O)[CX4;R]1",
    mcatNote:
      "Alpha lactones are three-membered cyclic esters. They are highly strained and usually very unstable/reactive.",
  },
  {
    name: "Beta lactone",
    priority: 4.11,
    nomenclaturePriority: 4.11,
    confidence: "High",
    suffix: "β-lactone",
    prefix: "oxooxetanyl",
    equivalentNames: ["four-membered cyclic ester"],
    smarts: "[OX2;R]1[CX4;R][CX4;R][CX3;R](=O)1",
    mcatNote:
      "Beta lactones are four-membered cyclic esters. Their ring strain makes them more reactive than larger lactones.",
  },
  {
    name: "Gamma lactone",
    priority: 4.12,
    nomenclaturePriority: 4.12,
    confidence: "High",
    suffix: "γ-lactone",
    prefix: "oxooxolanyl",
    equivalentNames: ["five-membered cyclic ester"],
    smarts: "[OX2;R]1[CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
    mcatNote:
      "Gamma lactones are five-membered cyclic esters. They commonly form from gamma-hydroxy acids.",
  },
  {
    name: "Delta lactone",
    priority: 4.13,
    nomenclaturePriority: 4.13,
    confidence: "High",
    suffix: "δ-lactone",
    prefix: "oxooxanyl",
    equivalentNames: ["six-membered cyclic ester"],
    smarts: "[OX2;R]1[CX4;R][CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
    mcatNote:
      "Delta lactones are six-membered cyclic esters. They commonly form from delta-hydroxy acids.",
  },
  {
    name: "Epsilon lactone",
    priority: 4.14,
    nomenclaturePriority: 4.14,
    confidence: "Medium",
    suffix: "ε-lactone",
    prefix: "oxooxepanyl",
    equivalentNames: ["seven-membered cyclic ester"],
    smarts:
      "[OX2;R]1[CX4;R][CX4;R][CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
    mcatNote:
      "Epsilon lactones are seven-membered cyclic esters. They are larger-ring lactones and are less strained than beta lactones.",
  },
  {
    name: "Lactone",
    priority: 4.19,
    nomenclaturePriority: 4.19,
    confidence: "High",
    suffix: "lactone",
    prefix: "oxooxacyclo",
    equivalentNames: ["cyclic ester"],
    smarts: "[OX2;R][CX3;R](=O)",
    mcatNote:
      "Lactones are cyclic esters. They are classified by ring size into α-, β-, γ-, δ-, and ε-lactones.",
  },
];