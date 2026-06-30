import type { FunctionalGroupPattern } from "../../types";

export const cyclicHydrocarbonGroups: FunctionalGroupPattern[] = [
  {
    name: "Cyclopropane",
    priority: 32.1,
    nomenclaturePriority: 23.1,
    confidence: "High",
    suffix: "cyclopropane",
    prefix: "cyclopropyl",
    equivalentNames: ["three-membered cycloalkane"],
    smarts: "[CX4;R]1[CX4;R][CX4;R]1",
    mcatNote:
      "Cyclopropanes are three-membered saturated rings. Their high ring strain makes them more reactive than ordinary alkanes.",
  },
  {
    name: "Cyclobutane",
    priority: 32.2,
    nomenclaturePriority: 23.2,
    confidence: "High",
    suffix: "cyclobutane",
    prefix: "cyclobutyl",
    equivalentNames: ["four-membered cycloalkane"],
    smarts: "[CX4;R]1[CX4;R][CX4;R][CX4;R]1",
    mcatNote:
      "Cyclobutanes are four-membered saturated rings. They are strained, but less strained than cyclopropanes.",
  },
  {
    name: "Cyclopentane",
    priority: 32.3,
    nomenclaturePriority: 23.3,
    confidence: "High",
    suffix: "cyclopentane",
    prefix: "cyclopentyl",
    equivalentNames: ["five-membered cycloalkane"],
    smarts: "[CX4;R]1[CX4;R][CX4;R][CX4;R][CX4;R]1",
    mcatNote:
      "Cyclopentanes are five-membered saturated rings with relatively low ring strain.",
  },
  {
    name: "Cyclohexane",
    priority: 32.4,
    nomenclaturePriority: 23.4,
    confidence: "High",
    suffix: "cyclohexane",
    prefix: "cyclohexyl",
    equivalentNames: ["six-membered cycloalkane"],
    smarts: "[CX4;R]1[CX4;R][CX4;R][CX4;R][CX4;R][CX4;R]1",
    mcatNote:
      "Cyclohexanes are six-membered saturated rings. Chair conformations minimize ring strain and are central in stereochemistry.",
  },
  {
    name: "Cycloalkane",
    priority: 32.9,
    nomenclaturePriority: 23.9,
    confidence: "Medium",
    suffix: "cycloalkane",
    prefix: "cycloalkyl",
    equivalentNames: ["saturated carbocycle"],
    smarts: "[CX4;R]",
    mcatNote:
      "Cycloalkanes are saturated carbon rings. Ring size strongly affects strain and conformation.",
  },
  {
    name: "Cycloalkene",
    priority: 24.2,
    nomenclaturePriority: 18.2,
    confidence: "Medium",
    suffix: "cycloalkene",
    prefix: "cycloalkenyl",
    equivalentNames: ["unsaturated carbocycle"],
    smarts: "[C;R]=[C;R]",
    mcatNote:
      "Cycloalkenes contain a carbon-carbon double bond within a ring. Smaller cycloalkenes can be strained.",
  },
  {
    name: "Cycloalkyne",
    priority: 25.2,
    nomenclaturePriority: 19.2,
    confidence: "Low",
    suffix: "cycloalkyne",
    prefix: "cycloalkynyl",
    equivalentNames: ["cyclic alkyne"],
    smarts: "[C;R]#[C;R]",
    mcatNote:
      "Cycloalkynes contain a carbon-carbon triple bond within a ring. Small cycloalkynes are highly strained; cyclooctyne is more commonly encountered.",
  },
];