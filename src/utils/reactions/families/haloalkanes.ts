import type { ReactionRule } from "../reactionTypes";

const alkylHalideTrigger = {
  anyFunctionalGroups: ["Haloalkane", "Allylic halide", "Benzyl halide"],
  includeSmarts: ["[C;X4][Cl,Br,I]"],
  excludedFunctionalGroups: ["Aryl halide", "Vinyl halide"],
};

const primaryOrMethylHalideTrigger = {
  ...alkylHalideTrigger,
  includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"],
};

const secondaryOrTertiaryHalideTrigger = {
  ...alkylHalideTrigger,
  includeSmarts: ["[C;X4;H0,H1][Cl,Br,I]"],
};

export const haloalkaneReactionRules: ReactionRule[] = [
  {
    id: "haloalkane-sn2-hydroxide",
    family: "haloalkanes",
    title: "SN2 with Hydroxide",
    reagents: "NaOH or KOH, polar aprotic solvent",
    reagentNote: "Backside substitution",
    productHint: "Alcohol",
    explanation:
      "Hydroxide displaces the leaving group in one step. Methyl and primary substrates react fastest, and a stereocenter inverts.",
    trigger: primaryOrMethylHalideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C;X4:1][Cl,Br,I:2]>>[C:1]O",
    },
    mechanism: "SN2",
    selectivity: ["Backside attack", "Inversion at the reacting carbon"],
    priority: 200,
  },
  {
    id: "haloalkane-sn2-cyanide",
    family: "haloalkanes",
    title: "SN2 with Cyanide",
    reagents: "NaCN or KCN, polar aprotic solvent",
    reagentNote: "One-carbon chain extension",
    productHint: "Nitrile",
    explanation:
      "Cyanide attacks through carbon and replaces the leaving group, extending the carbon skeleton by one carbon.",
    trigger: primaryOrMethylHalideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C;X4:1][Cl,Br,I:2]>>[C:1]C#N",
    },
    mechanism: "SN2",
    selectivity: ["Inversion at the reacting carbon"],
    priority: 210,
  },
  {
    id: "haloalkane-sn2-azide",
    family: "haloalkanes",
    title: "SN2 with Azide",
    reagents: "NaN₃, DMF or DMSO",
    reagentNote: "Azide substitution",
    productHint: "Alkyl azide",
    explanation:
      "Azide is a strong nucleophile and weak base, so it favors substitution on methyl and primary alkyl halides.",
    trigger: primaryOrMethylHalideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C;X4:1][Cl,Br,I:2]>>[C:1][N-][N+]#N",
    },
    mechanism: "SN2",
    selectivity: ["Inversion at the reacting carbon"],
    priority: 220,
  },
  {
    id: "haloalkane-sn2-ammonia",
    family: "haloalkanes",
    title: "Alkylation with Ammonia",
    reagents: "Excess NH₃",
    reagentNote: "SN2 amination",
    productHint: "Primary amine",
    explanation:
      "Ammonia displaces the leaving group. Excess ammonia reduces further alkylation of the amine product.",
    trigger: primaryOrMethylHalideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C;X4:1][Cl,Br,I:2]>>[C:1]N",
    },
    mechanism: "SN2",
    priority: 230,
  },
  {
    id: "haloalkane-williamson-ether",
    family: "haloalkanes",
    title: "Williamson Ether Synthesis",
    reagents: "RO⁻ Na⁺ or RO⁻ K⁺",
    reagentNote: "Alkoxide SN2 substitution",
    productHint: "Ether",
    explanation:
      "An alkoxide displaces a leaving group from a methyl or primary alkyl halide to form an ether.",
    trigger: primaryOrMethylHalideTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The alkoxide carbon group must be specified before an exact ether can be generated.",
    },
    mechanism: "SN2",
    limitations: ["Secondary and tertiary halides favor elimination instead."],
    priority: 240,
  },
  {
    id: "haloalkane-acetylide-alkylation",
    family: "haloalkanes",
    title: "Alkylation with an Acetylide",
    reagents: "RC≡C⁻ Na⁺",
    reagentNote: "Carbon-carbon bond formation",
    productHint: "Higher alkyne",
    explanation:
      "An acetylide ion displaces the leaving group from a methyl or primary alkyl halide, forming a new carbon-carbon bond.",
    trigger: primaryOrMethylHalideTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The acetylide substituent must be specified before an exact alkyne can be generated.",
    },
    mechanism: "SN2",
    priority: 250,
  },
  {
    id: "haloalkane-sn1-solvolysis-water",
    family: "haloalkanes",
    title: "SN1 Solvolysis in Water",
    reagents: "H₂O, polar protic solvent",
    reagentNote: "Carbocation substitution",
    productHint: "Alcohol",
    explanation:
      "Secondary and tertiary alkyl halides can ionize in water, followed by nucleophilic capture to form an alcohol.",
    trigger: secondaryOrTertiaryHalideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C;X4:1][Cl,Br,I:2]>>[C:1]O",
      maxProducts: 4,
    },
    mechanism: "SN1",
    selectivity: ["Racemization is common", "Rearrangements are possible"],
    productStatus: "representative",
    priority: 260,
  },
  {
    id: "haloalkane-e2-zaitsev",
    family: "haloalkanes",
    title: "E2 Elimination: Zaitsev Product",
    reagents: "NaOEt/EtOH or another small strong base, heat",
    reagentNote: "Concerted beta elimination",
    productHint: "More substituted alkene",
    explanation:
      "A small strong base usually removes a beta hydrogen to give the more substituted alkene.",
    trigger: alkylHalideTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "A correct product requires enumerating beta carbons, anti-periplanar hydrogens, and alkene substitution.",
    },
    mechanism: "E2",
    selectivity: ["Anti-periplanar geometry", "Usually Zaitsev"],
    priority: 270,
  },
  {
    id: "haloalkane-e2-hofmann",
    family: "haloalkanes",
    title: "E2 Elimination: Hofmann Product",
    reagents: "KOtBu or another bulky strong base, heat",
    reagentNote: "Sterically controlled beta elimination",
    productHint: "Less substituted alkene",
    explanation:
      "A bulky base often removes the least hindered beta hydrogen, favoring the less substituted alkene.",
    trigger: alkylHalideTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "A correct product requires beta-site enumeration and steric ranking of accessible hydrogens.",
    },
    mechanism: "E2",
    selectivity: ["Anti-periplanar geometry", "Often Hofmann"],
    priority: 280,
  },
  {
    id: "haloalkane-e1-elimination",
    family: "haloalkanes",
    title: "E1 Elimination",
    reagents: "Weak base, polar protic solvent, heat",
    reagentNote: "Carbocation elimination",
    productHint: "Alkene mixture",
    explanation:
      "Secondary and tertiary alkyl halides can ionize, then lose a beta proton to form alkenes. Heat favors elimination over substitution.",
    trigger: secondaryOrTertiaryHalideTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "E1 products require carbocation rearrangement analysis and beta-site enumeration.",
    },
    mechanism: "E1",
    selectivity: ["Usually Zaitsev", "Rearrangements are possible"],
    priority: 290,
  },
  {
    id: "haloalkane-grignard-formation",
    family: "haloalkanes",
    title: "Grignard Reagent Formation",
    reagents: "Mg, dry ether",
    reagentNote: "Metal insertion into C–X",
    productHint: "Organomagnesium halide",
    explanation:
      "Magnesium inserts into the carbon-halogen bond to form a Grignard reagent. Water, alcohols, acids, and other protic groups destroy the reagent.",
    trigger: alkylHalideTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Organometallic salts and counterions need a dedicated representation rather than a neutral product SMILES shortcut.",
    },
    mechanism: "Single-electron transfer / metal insertion",
    limitations: ["Requires rigorously dry conditions", "Incompatible with protic groups"],
    priority: 300,
  },
];
