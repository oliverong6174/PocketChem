import type { FunctionalGroupPattern } from "../../types";

export const lactamGroups: FunctionalGroupPattern[] = [
  {
    name: "Alpha lactam",
    priority: 6.10,
    nomenclaturePriority: 6.10,
    confidence: "Low",
    suffix: "α-lactam",
    prefix: "oxoaziridinyl",
    equivalentNames: ["aziridinone", "three-membered cyclic amide"],
    smarts: "[NX3;R]1[CX3;R](=O)[CX4;R]1",
    mcatNote:
      "Alpha lactams are three-membered cyclic amides. Their high ring strain makes them extremely reactive and relatively uncommon.",
    displaySmarts: "[NX3;R]1[CX3;R](=O)[CX4;R]1",
    category: "functionalGroup",
    },
  {
    name: "Beta lactam",
    priority: 6.20,
    nomenclaturePriority: 6.20,
    confidence: "High",
    suffix: "β-lactam",
    prefix: "oxoazetidinyl",
    equivalentNames: ["azetidinone", "four-membered cyclic amide"],
    smarts: "[NX3;R]1[CX4;R][CX4;R][CX3;R](=O)1",
    mcatNote:
      "Beta lactams are four-membered cyclic amides. Ring strain makes them highly reactive. Penicillins and cephalosporins contain β-lactams.",
    displaySmarts: "[NX3;R]1[CX4;R][CX4;R][CX3;R](=O)1",
    category: "functionalGroup",
    },
  {
    name: "Gamma lactam",
    priority: 6.30,
    nomenclaturePriority: 6.30,
    confidence: "High",
    suffix: "γ-lactam",
    prefix: "oxopyrrolidinyl",
    equivalentNames: ["pyrrolidinone", "five-membered cyclic amide"],
    smarts: "[NX3;R]1[CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
    mcatNote:
      "Gamma lactams are five-membered cyclic amides. They are common in natural products and medicinal chemistry.",
    displaySmarts: "[NX3;R]1[CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
    category: "functionalGroup",
    },
  {
    name: "Delta lactam",
    priority: 6.40,
    nomenclaturePriority: 6.40,
    confidence: "High",
    suffix: "δ-lactam",
    prefix: "oxopiperidinyl",
    equivalentNames: ["piperidinone", "six-membered cyclic amide"],
    smarts: "[NX3;R]1[CX4;R][CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
    mcatNote:
      "Delta lactams are six-membered cyclic amides. They are considerably less strained than β-lactams.",
    displaySmarts: "[NX3;R]1[CX4;R][CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
    category: "functionalGroup",
    },
  {
    name: "Epsilon lactam",
    priority: 6.50,
    nomenclaturePriority: 6.50,
    confidence: "Medium",
    suffix: "ε-lactam",
    prefix: "oxoazepanyl",
    equivalentNames: ["azepanone", "seven-membered cyclic amide"],
    smarts: "[NX3;R]1[CX4;R][CX4;R][CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
    mcatNote:
      "Epsilon lactams are seven-membered cyclic amides. ε-Caprolactam is the industrial precursor to Nylon-6.",
    displaySmarts:
  "[NX3;R]1[CX4;R][CX4;R][CX4;R][CX4;R][CX4;R][CX3;R](=O)1",
  category: "functionalGroup",
    },
  {
    name: "Lactam",
    priority: 6.90,
    nomenclaturePriority: 6.90,
    confidence: "High",
    suffix: "lactam",
    prefix: "oxoazacyclo",
    equivalentNames: ["cyclic amide"],
    smarts: "[NX3;R][CX3;R](=O)",
    mcatNote:
      "Lactams are cyclic amides. They are classified by ring size into α-, β-, γ-, δ-, and ε-lactams.",
    displaySmarts: "[NX3;R][CX3;R](=O)",
    category: "functionalGroup",
    },
];