import type { ReactionRule } from "../reactionTypes";

const arylHalideTrigger = {
  includeSmarts: ["[c][Cl,Br,I]"],
};

export const couplingReactionRules: ReactionRule[] = [
  {
    id: "suzuki-coupling",
    family: "couplings",
    reactionType: "coupling",
    title: "Suzuki Coupling",
    reagents: "Pd catalyst, base",
    reagentNote: "Draw an aryl halide and boronic acid/boronate as disconnected structures",
    productHint: "Biaryl or substituted arene",
    explanation:
      "A palladium-catalyzed Suzuki reaction couples an aryl halide with an organoboron partner to form a new carbon-carbon bond.",
    trigger: arylHalideTrigger,
    additionalReactants: [
      {
        label: "boronic acid or boronate carbon partner",
        trigger: { includeSmarts: ["[#6,c][B]([O])[O]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][Cl,Br,I].[#6,c:2][B]([O])[O]>>[c:1]-[#6,c:2]",
      maxProducts: 12,
    },
    mechanism: "Palladium-catalyzed cross-coupling",
    limitations: ["Catalyst/ligand effects and competing coupling sites are not ranked."],
    priority: 2250,
  },
  {
    id: "sonogashira-coupling",
    family: "couplings",
    reactionType: "coupling",
    title: "Sonogashira Coupling",
    reagents: "Pd catalyst, CuI/base as applicable",
    reagentNote: "Draw an aryl halide and terminal alkyne as disconnected structures",
    productHint: "Aryl alkyne",
    explanation:
      "Sonogashira coupling joins an aryl halide and a terminal alkyne to form a new aryl-carbon–carbon triple-bond connection.",
    trigger: arylHalideTrigger,
    additionalReactants: [
      { label: "terminal alkyne", trigger: { includeSmarts: ["[C]#[CH]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][Cl,Br,I].[C:2]#[CH:3]>>[c:1]-[C:3]#[C:2]",
      maxProducts: 12,
    },
    mechanism: "Palladium-catalyzed cross-coupling",
    priority: 2260,
  },
  {
    id: "heck-coupling",
    family: "couplings",
    reactionType: "coupling",
    title: "Heck Coupling",
    reagents: "Pd catalyst, base, heat",
    reagentNote: "Draw an aryl halide and alkene as disconnected structures",
    productHint: "Aryl-substituted alkene",
    explanation:
      "The Heck reaction couples an aryl halide with an alkene, forming a new carbon-carbon bond while retaining an alkene in the product.",
    trigger: arylHalideTrigger,
    additionalReactants: [
      {
        label: "alkene",
        trigger: {
          includeSmarts: ["[C]=[C]"],
          excludeSmarts: ["[C]=[C]-[C]=[C]"],
        },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][Cl,Br,I].[C:2]=[C:3]>>[c:1]-[C:2]=[C:3]",
      maxProducts: 16,
    },
    mechanism: "Palladium-catalyzed migratory insertion and beta-hydride elimination",
    productStatus: "representative",
    limitations: [
      "The engine enumerates constitutional attachment possibilities but does not rank Heck regiochemistry or assign E/Z geometry.",
    ],
    priority: 2270,
  },
];
