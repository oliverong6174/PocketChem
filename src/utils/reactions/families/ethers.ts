import type { ReactionRule } from "../reactionTypes";

const etherTrigger = {
  functionalGroups: ["Ether", "Aryl ether", "Phenyl ether"],
};

export const etherReactionRules: ReactionRule[] = [
  {
    id: "ether-cleavage-hbr-hi",
    family: "ethers",
    title: "Ether Cleavage with HBr or HI",
    reagents: "excess HBr or HI",
    reagentNote: "Strong acid cleavage",
    productHint: "Alkyl halide and alcohol",
    explanation:
      "Ethers are cleaved by strong hydrohalic acids to form an alkyl halide and an alcohol.",
    trigger: etherTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][O:2][C:3]>>[C:1][Br].[C:3][OH]",
    },
    priority: 700,
  },
  {
    id: "ether-cleavage-hi",
    family: "ethers",
    title: "Ether Cleavage with HI",
    reagents: "HI",
    reagentNote: "Iodide cleavage",
    productHint: "Alkyl iodide and alcohol",
    explanation:
      "HI cleaves ethers similarly to HBr, often forming an alkyl iodide and an alcohol.",
    trigger: etherTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][O:2][C:3]>>[C:1][I].[C:3][OH]",
    },
    priority: 710,
  },
  {
    id: "ether-autoxidation",
    family: "ethers",
    title: "Ether Autoxidation",
    reagents: "O₂, slow",
    reagentNote: "Peroxide formation",
    productHint: "Ether peroxide",
    explanation:
      "Ethers can slowly oxidize in air to form peroxides, especially after storage.",
    trigger: etherTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][O:2][C:3]>>[C:1][O:2][C:3]OO",
    },
    priority: 720,
  },
];