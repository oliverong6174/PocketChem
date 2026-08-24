import type { ReactionRule } from "../reactionTypes";

const etherTrigger = {
  anyFunctionalGroups: ["Ether", "Aryl ether", "Anisole"],
  includeSmarts: ["[OD2]([#6])[#6]"],
};

export const etherReactionRules: ReactionRule[] = [
  {
    id: "ether-cleavage-hbr",
    family: "ethers",
    title: "Ether Cleavage with HBr",
    reagents: "excess HBr, heat",
    reagentNote: "Strong-acid cleavage",
    productHint: "Alkyl bromide and alcohol or phenol",
    explanation:
      "Protonation of the ether oxygen is followed by C–O bond cleavage. Primary and methyl groups usually react by SN2; tertiary groups can react by SN1.",
    trigger: etherTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][O:2][C:3]>>[C:1]Br.[C:3][OH:2]",
      maxProducts: 8,
    },
    mechanism: "Acid-promoted substitution",
    selectivity: [
      "For unsymmetrical dialkyl ethers, cleavage usually occurs at the less hindered carbon unless a tertiary, benzylic, or allylic carbocation is favored.",
      "Aryl–O bonds are not cleaved by SN2; aryl ethers give phenol plus an alkyl bromide.",
    ],
    productStatus: "representative",
    limitations: ["The engine enumerates possible C–O cleavage orientations but does not rank them."],
    priority: 700,
  },
  {
    id: "ether-cleavage-hi",
    family: "ethers",
    title: "Ether Cleavage with HI",
    reagents: "excess HI, heat",
    reagentNote: "Strong-acid cleavage",
    productHint: "Alkyl iodide and alcohol or phenol",
    explanation:
      "HI protonates the ether and iodide cleaves a carbon–oxygen bond. With excess HI, a primary alcohol product may be converted further to an iodide.",
    trigger: etherTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][O:2][C:3]>>[C:1]I.[C:3][OH:2]",
      maxProducts: 8,
    },
    mechanism: "Acid-promoted substitution",
    selectivity: [
      "For unsymmetrical dialkyl ethers, cleavage usually occurs at the less hindered carbon unless an SN1-favored carbon is present.",
      "Aryl ethers cleave at the alkyl–O bond, not the aryl–O bond.",
    ],
    productStatus: "representative",
    limitations: ["The exact extent of further alcohol-to-iodide conversion depends on equivalents and temperature."],
    priority: 710,
  },
  {
    id: "ether-autoxidation",
    family: "ethers",
    title: "Ether Autoxidation",
    reagents: "O₂, light, prolonged storage",
    reagentNote: "Radical peroxide formation",
    productHint: "Hydroperoxides and peroxides",
    explanation:
      "Ethers containing alpha hydrogens can slowly form shock-sensitive hydroperoxides and peroxides during storage in air.",
    trigger: {
      ...etherTrigger,
      includeSmarts: ["[C;H1,H2,H3][OD2][#6]"],
    },
    transform: {
      type: "conceptOnly",
      reason: "Ether autoxidation produces a mixture whose exact peroxide positions and oxidation states depend on the substrate and radical chain history.",
    },
    mechanism: "Radical-chain oxidation",
    course: "advanced",
    priority: 720,
  },
];
