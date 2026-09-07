import type { ReactionRule } from "../reactionTypes";

const DIHYDROBENZOFURAN_SMARTS =
  "[O]1[CH2][CH2][c]2[cH][cH][cH][cH][c]1~2";

// Chroman / chromane: a benzene ring fused to a six-membered saturated
// oxygen heterocycle.  This is the homolog of 2,3-dihydrobenzofuran with one
// additional methylene in the O-containing ring.
const CHROMAN_SMARTS =
  "[cH]1[cH][cH][c]2[c]([cH]1)[CH2][CH2][CH2][O]2";

const dialkylEtherTrigger = {
  includeSmarts: ["[C;X4][O;X2][C;X4]"],
};

const arylAlkylEtherTrigger = {
  includeSmarts: ["[c][O;X2][C;X4]"],
  // 2,3-Dihydrobenzofuran is a cyclic aryl/alkyl ether.  It needs a dedicated
  // ring-opening transform so the ortho relationship is retained correctly.
  excludeSmarts: [DIHYDROBENZOFURAN_SMARTS, CHROMAN_SMARTS],
};

const dihydrobenzofuranTrigger = {
  includeSmarts: [DIHYDROBENZOFURAN_SMARTS],
};

const chromanTrigger = {
  includeSmarts: [CHROMAN_SMARTS],
};

export const etherReactionRules: ReactionRule[] = [
  {
    id: "dihydrobenzofuran-cleavage-hbr",
    family: "ethers",
    reactionType: "cleavage",
    title: "2,3-Dihydrobenzofuran Cleavage with HBr",
    reagents: "excess HBr, heat",
    reagentNote: "Acidic cleavage of a benzofused cyclic ether",
    productHint: "2-(2-bromoethyl)phenol",
    explanation:
      "Protonation of the cyclic ether is followed by cleavage at the sp3 carbon. The aryl–O bond is not displaced by bromide, so opening the five-membered ring gives the ortho-(2-bromoethyl) phenol skeleton.",
    trigger: dihydrobenzofuranTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[cH:1]1[cH:2][cH:3][c:4]2[c:5]([cH:6]1)[CH2:7][CH2:8][O:9]2>>[cH:1]1[cH:2][cH:3][c:4]([OH:9])[c:5]([CH2:7][CH2:8]Br)[cH:6]1",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Acid-promoted ether cleavage",
    selectivity: [
      "Cleavage occurs at the alkyl C–O bond; an aryl C–O bond does not undergo SN2 displacement.",
      "With excess HBr the opened primary alcohol equivalent is trapped as the bromide while the phenolic OH remains.",
    ],
    priority: 680,
  },
  {
    id: "dihydrobenzofuran-cleavage-hi",
    family: "ethers",
    reactionType: "cleavage",
    title: "2,3-Dihydrobenzofuran Cleavage with HI",
    reagents: "excess HI, heat",
    reagentNote: "Acidic cleavage of a benzofused cyclic ether",
    productHint: "2-(2-iodoethyl)phenol",
    explanation:
      "HI protonates the cyclic ether and iodide opens the alkyl side of the C–O bond. The aryl–oxygen bond remains intact, giving an ortho-(2-iodoethyl) phenol.",
    trigger: dihydrobenzofuranTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[cH:1]1[cH:2][cH:3][c:4]2[c:5]([cH:6]1)[CH2:7][CH2:8][O:9]2>>[cH:1]1[cH:2][cH:3][c:4]([OH:9])[c:5]([CH2:7][CH2:8]I)[cH:6]1",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Acid-promoted ether cleavage",
    selectivity: ["The aryl C–O bond is retained; cleavage occurs on the sp3 side."],
    priority: 681,
  },
  {
    id: "chroman-cleavage-hbr",
    family: "ethers",
    reactionType: "cleavage",
    title: "Chroman Cleavage with HBr",
    reagents: "excess HBr, heat",
    reagentNote: "Acidic cleavage of a benzofused six-membered cyclic ether",
    productHint: "2-(3-bromopropyl)phenol",
    explanation:
      "Protonation of chroman is followed by cleavage at the sp3 C–O bond. The aryl–oxygen bond is retained as phenol, while the three-carbon tether is opened and trapped by bromide.",
    trigger: chromanTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[cH:1]1[cH:2][cH:3][c:4]2[c:5]([cH:6]1)[CH2:7][CH2:8][CH2:9][O:10]2>>[cH:1]1[cH:2][cH:3][c:4]([OH:10])[c:5]([CH2:7][CH2:8][CH2:9]Br)[cH:6]1",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Acid-promoted cyclic ether cleavage",
    selectivity: ["The aryl C–O bond is not displaced by ordinary SN2; cleavage occurs on the saturated side of the ether."],
    priority: 682,
  },
  {
    id: "chroman-cleavage-hi",
    family: "ethers",
    reactionType: "cleavage",
    title: "Chroman Cleavage with HI",
    reagents: "excess HI, heat",
    reagentNote: "Acidic cleavage of a benzofused six-membered cyclic ether",
    productHint: "2-(3-iodopropyl)phenol",
    explanation:
      "HI protonates the cyclic ether and iodide opens the saturated C–O bond. The oxygen remains on the aromatic carbon as phenol, giving an ortho-(3-iodopropyl)phenol.",
    trigger: chromanTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[cH:1]1[cH:2][cH:3][c:4]2[c:5]([cH:6]1)[CH2:7][CH2:8][CH2:9][O:10]2>>[cH:1]1[cH:2][cH:3][c:4]([OH:10])[c:5]([CH2:7][CH2:8][CH2:9]I)[cH:6]1",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Acid-promoted cyclic ether cleavage",
    selectivity: ["The aryl C–O bond is retained; iodide opens the saturated side of the benzofused ether."],
    priority: 683,
  },
  {
    id: "chroman-hi-hydroxide-methyl-iodide-sequence",
    family: "ethers",
    reactionType: "cleavage",
    title: "Chroman Cleavage → Hydrolysis → O-Methylation",
    reagents: "1) excess HI, heat  2) NaOH  3) CH₃I",
    reagentNote: "Three-step sequence: ring cleavage, primary iodide hydrolysis, then methyl ether formation",
    productHint: "2-(3-methoxypropyl)phenol",
    explanation:
      "Excess HI first opens the chroman ring to the ortho-(3-iodopropyl)phenol. Hydroxide substitutes the primary iodide to give the terminal alcohol, and methyl iodide converts that aliphatic oxygen into the methyl ether in the course sequence.",
    trigger: chromanTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[cH:1]1[cH:2][cH:3][c:4]2[c:5]([cH:6]1)[CH2:7][CH2:8][CH2:9][O:10]2>>[cH:1]1[cH:2][cH:3][c:4]([OH:10])[c:5]([CH2:7][CH2:8][CH2:9]OC)[cH:6]1",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Acidic ether cleavage followed by SN2 substitution and Williamson methylation",
    selectivityProfile: { mixture: "single", majorProductOnly: true },
    limitations: ["This bundled rule represents the supplied course sequence. In a fully general substrate containing several competing O–H groups, methylation chemoselectivity depends on base, equivalents, and protection state."],
    priority: 684,
  },
  {
    id: "aryl-alkyl-ether-cleavage-hbr",
    family: "ethers",
    reactionType: "cleavage",
    title: "Aryl Ether Cleavage with HBr",
    reagents: "excess HBr, heat",
    reagentNote: "Cleavage occurs at the alkyl–O bond",
    productHint: "Phenol plus alkyl bromide",
    explanation:
      "After protonation, bromide attacks the alkyl side of an aryl–alkyl ether. The sp2 aryl carbon cannot undergo ordinary SN2 cleavage, so the aryl fragment becomes a phenol.",
    trigger: arylAlkylEtherTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:3][O:2][C;X4:1]>>[c:3][OH:2].[C:1]Br",
      maxProducts: 8,
    },
    productStatus: "representative",
    mechanism: "Acid-promoted substitution",
    selectivity: ["Break the alkyl–O bond, not the aryl–O bond."],
    priority: 690,
  },
  {
    id: "aryl-alkyl-ether-cleavage-hi",
    family: "ethers",
    reactionType: "cleavage",
    title: "Aryl Ether Cleavage with HI",
    reagents: "excess HI, heat",
    reagentNote: "Cleavage occurs at the alkyl–O bond",
    productHint: "Phenol plus alkyl iodide",
    explanation:
      "After protonation, iodide attacks the alkyl side of an aryl–alkyl ether. The aryl fragment is retained as the phenol.",
    trigger: arylAlkylEtherTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:3][O:2][C;X4:1]>>[c:3][OH:2].[C:1]I",
      maxProducts: 8,
    },
    productStatus: "representative",
    mechanism: "Acid-promoted substitution",
    selectivity: ["Break the alkyl–O bond, not the aryl–O bond."],
    priority: 691,
  },
  {
    id: "ether-cleavage-hbr",
    family: "ethers",
    reactionType: "cleavage",
    title: "Dialkyl Ether Cleavage with HBr",
    reagents: "excess HBr, heat",
    reagentNote: "Strong-acid cleavage",
    productHint: "Alkyl bromide(s)",
    explanation:
      "Protonation of the ether oxygen is followed by C–O cleavage. Primary and methyl groups usually react by SN2; tertiary groups can react by SN1. With excess HBr, a primary alcohol formed in the first cleavage can be converted further to bromide.",
    trigger: dialkylEtherTrigger,
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "etherCleavage", halogen: "Br" },
    },
    mechanism: "Acid-promoted substitution",
    selectivity: [
      "For unsymmetrical dialkyl ethers, cleavage usually occurs at the less hindered carbon unless a tertiary, benzylic, or allylic carbocation is favored.",
      "Further conversion of the alcohol to bromide depends on substrate class and conditions.",
    ],
    productStatus: "representative",
    limitations: ["If two ether sides have effectively equal SN1/SN2 preference, both genuinely competitive cleavage products may remain."],
    priority: 700,
  },
  {
    id: "ether-cleavage-hi",
    family: "ethers",
    reactionType: "cleavage",
    title: "Dialkyl Ether Cleavage with HI",
    reagents: "excess HI, heat",
    reagentNote: "Strong-acid cleavage",
    productHint: "Alkyl iodide(s)",
    explanation:
      "HI protonates the ether and iodide cleaves a carbon–oxygen bond. With excess HI, a primary alcohol product may be converted further to an iodide.",
    trigger: dialkylEtherTrigger,
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "etherCleavage", halogen: "I" },
    },
    mechanism: "Acid-promoted substitution",
    selectivity: [
      "For unsymmetrical dialkyl ethers, cleavage usually occurs at the less hindered carbon unless an SN1-favored carbon is present.",
    ],
    productStatus: "representative",
    limitations: ["The exact extent of further alcohol-to-iodide conversion depends on equivalents and temperature."],
    priority: 710,
  },
  {
    id: "ether-autoxidation",
    family: "ethers",
    reactionType: "radical",
    title: "Ether Autoxidation",
    reagents: "O₂, light, prolonged storage",
    reagentNote: "Radical peroxide formation",
    productHint: "Hydroperoxides and peroxides",
    explanation:
      "Ethers containing alpha hydrogens can slowly form shock-sensitive hydroperoxides and peroxides during storage in air.",
    trigger: {
      includeSmarts: ["[C;H1,H2,H3;X4][O;X2][C,c]"],
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
