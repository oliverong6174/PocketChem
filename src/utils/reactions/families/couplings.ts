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
      // Terminal monosubstituted alkenes: syn carbopalladation then syn beta-hydride elimination gives the
      // E (trans) 1,2-disubstituted alkene from beta-arylation, and the 1,1-disubstituted alkene from
      // alpha-arylation. Other alkene types keep the plain template (no geometry assigned).
      forwardTemplates: [
        { smarts: "[c:1][Cl,Br,I].[CH2:3]=[CH:2][*:4]>>[c:1]/[CH:3]=[CH:2]/[*:4]" },
        { smarts: "[c:1][Cl,Br,I].[CH2:3]=[CH:2][*:4]>>[c:1][C:2](=[CH2:3])[*:4]" },
      ],
    },
    mechanism: "Palladium-catalyzed migratory insertion and beta-hydride elimination",
    productStatus: "representative",
    productPreferences: [
      {
        id: "heck-linear-acceptor-or-styrene",
        whenReactantSmarts: ["[CH2]=[CH]-[$([CX3]=O),$(C#N),$(c),$([SX4](=O)=O)]"],
        productSmarts: "[c][CH]=[CH]-[$([CX3]=O),$(C#N),$(c),$([SX4](=O)=O)]",
        level: "major",
        basis:
          "Aryl palladium adds to the unsubstituted terminus of a monosubstituted alkene bearing an electron-withdrawing group or an aryl group, and beta-hydride elimination gives the (E)-1,2-disubstituted alkene.",
        references: ["Heck, R. F. Acc. Chem. Res. 1979, 12, 146-151 (syn insertion and syn beta-hydride elimination; methyl trans-cinnamate from iodobenzene and methyl acrylate).", "Beletskaya, I. P.; Cheprakov, A. V. Chem. Rev. 2000, 100, 3009-3066 (citation checked; the regiochemistry section itself was not re-read)."],
      },
      {
        id: "heck-branched-acceptor-or-styrene",
        whenReactantSmarts: ["[CH2]=[CH]-[$([CX3]=O),$(C#N),$(c),$([SX4](=O)=O)]"],
        productSmarts: "[CH2]=[C](-[c])-[$([CX3]=O),$(C#N),$(c),$([SX4](=O)=O)]",
        level: "minor",
        basis:
          "Alpha-arylation (the 1,1-disubstituted alkene) is the minor outcome for these alkenes under standard neutral Pd conditions; it becomes competitive with electron-rich alkenes or cationic palladium, which this preference does not cover.",
        references: ["Heck, R. F. Acc. Chem. Res. 1979, 12, 146-151 (syn insertion and syn beta-hydride elimination; methyl trans-cinnamate from iodobenzene and methyl acrylate).", "Beletskaya, I. P.; Cheprakov, A. V. Chem. Rev. 2000, 100, 3009-3066 (citation checked; the regiochemistry section itself was not re-read)."],
      },
    ],
    limitations: [
      "E geometry and the linear/branched preference are modeled for monosubstituted alkenes bearing a carbonyl, nitrile, sulfonyl or aryl group. Other alkenes (alkyl, electron-rich, di- or trisubstituted) keep every attachment site, unranked and without assigned geometry.",
      "Ligand, base, Pd source and cationic-versus-neutral pathway are not modeled.",
    ],
    priority: 2270,
  },
];
