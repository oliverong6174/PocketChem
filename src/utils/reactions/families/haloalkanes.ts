import type { ReactionRule } from "../reactionTypes";

const alkylHalideTrigger = {
  anyFunctionalGroups: ["Haloalkane", "Allylic halide", "Benzyl halide"],
  includeSmarts: ["[C;X4][Cl,Br,I]"],
  excludedFunctionalGroups: ["Aryl halide", "Vinyl halide"],
};

/** Methyl, primary, or secondary alkyl halide; tertiary centers are excluded. */
const sn2EligibleHalideTrigger = {
  ...alkylHalideTrigger,
  includeSmarts: ["[C;X4;H1,H2,H3][Cl,Br,I]"],
};

/** Methyl or primary alkyl halide, used where steric demand must stay very low. */
const primaryOrMethylHalideTrigger = {
  ...alkylHalideTrigger,
  includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"],
};

/** SN2 halide exchange with iodide; avoid an identity I-for-I substitution. */
const sn2IodideEligibleHalideTrigger = {
  ...alkylHalideTrigger,
  includeSmarts: ["[C;X4;H1,H2,H3][Cl,Br]"],
};

/** Secondary or tertiary alkyl halide, the usual simple-substrate SN1/E1 domain. */
const secondaryOrTertiaryHalideTrigger = {
  ...alkylHalideTrigger,
  includeSmarts: ["[C;X4;H0,H1][Cl,Br,I]"],
};

/** Primary, secondary, or tertiary halide, but not methyl; a beta site is still required. */
const e2EligibleHalideTrigger = {
  ...alkylHalideTrigger,
  includeSmarts: ["[C;X4;H0,H1,H2][Cl,Br,I]"],
};

/** Primary benzylic/allylic halides can ionize because the carbocation is resonance-stabilized. */
const resonanceStabilizedPrimaryHalideTrigger = {
  anyFunctionalGroups: ["Allylic halide", "Benzyl halide"],
  includeSmarts: ["[C;X4;H2][Cl,Br,I]"],
  excludedFunctionalGroups: ["Aryl halide", "Vinyl halide"],
};

/** Alkyl halide that does not contain an obvious proton source that would quench a Grignard reagent. */
const grignardCompatibleHalideTrigger = {
  ...alkylHalideTrigger,
  excludeSmarts: [
    "[O,S;H1]",
    "[N;H1,H2,H3]",
    "[C]#[C;H1]",
  ],
};

const hydroxideReactant = {
  label: "hydroxide ion",
  trigger: { includeSmarts: ["[O-;H1]"] },
};

const cyanideReactant = {
  label: "cyanide ion",
  trigger: { includeSmarts: ["[C-]#N"] },
};

const azideReactant = {
  label: "azide ion",
  trigger: { includeSmarts: ["[N-]~[N+]~[N]"] },
};

const iodideReactant = {
  label: "iodide ion",
  trigger: { includeSmarts: ["[I-]"] },
};

const ammoniaReactant = {
  label: "ammonia",
  trigger: { includeSmarts: ["[N;H3;+0]"] },
};

const waterReactant = {
  label: "water",
  trigger: { includeSmarts: ["[O;H2;+0]"] },
};

const neutralAlcoholReactant = {
  label: "alcohol solvent / nucleophile",
  trigger: {
    includeSmarts: ["[#6][O;H1;+0]"],
    excludeSmarts: ["[CX3](=O)[O;H1]"],
  },
};

const unhinderedAlkoxideReactant = {
  label: "unhindered alkoxide base",
  trigger: {
    includeSmarts: ["[C;H1,H2,H3][O-]"],
  },
};

const tertButoxideReactant = {
  label: "tert-butoxide ion",
  trigger: {
    includeSmarts: ["[O-][C;H0;X4]([#6])([#6])[#6]"],
  },
};

const amideBaseReactant = {
  label: "amide base",
  trigger: {
    includeSmarts: ["[N-;H2]"],
  },
};

export const haloalkaneReactionRules: ReactionRule[] = [
  {
    id: "haloalkane-intramolecular-amine-cyclization-5",
    family: "haloalkanes",
    reactionType: "cyclization",
    reactionClass: "intramolecular nucleophilic substitution",
    title: "Intramolecular SN2 Amine Cyclization",
    reagents: "Base; heat as needed",
    reagentNote: "5-membered ring closure",
    productHint: "Pyrrolidine derivative",
    explanation:
      "A primary or secondary amine tethered four carbons from a primary alkyl halide can cyclize by intramolecular SN2 displacement to form a five-membered nitrogen heterocycle.",
    trigger: {
      includeSmarts: [
        "[N;H1,H2;+0]-[C;X4]-[C;X4]-[C;X4]-[C;X4][Cl,Br,I]",
      ],
    },
    transform: {
      type: "reactionSmarts",
      smarts:
        "[N;+0:1]-[C:2]-[C:3]-[C:4]-[C:5]-[Cl,Br,I:6]>>[N;+0:1]1[C:2][C:3][C:4][C:5]1",
      maxProducts: 4,
    },
    mechanism: "Intramolecular SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
    },
    selectivity: [
      "Five-membered ring formation is favored",
      "Backside displacement at the carbon bearing the leaving group",
    ],
    limitations: [
      "Best for an unhindered primary tethered halide; competing intermolecular alkylation can occur at high concentration.",
    ],
    priority: 190,
  },

  // ---------------------------------------------------------------------------
  // SN2: the nucleophile is an explicitly drawn second reactant.
  // ---------------------------------------------------------------------------
  {
    id: "haloalkane-sn2-hydroxide",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "nucleophilic substitution",
    title: "SN2 with Hydroxide",
    reagents: "Polar aprotic conditions",
    reagentNote: "Draw the alkyl halide and hydroxide as disconnected structures",
    productHint: "Alcohol",
    explanation:
      "Hydroxide attacks the carbon bearing the leaving group in one concerted backside-displacement step. Methyl and primary substrates react fastest; secondary substrates can compete with E2.",
    trigger: sn2EligibleHalideTrigger,
    additionalReactants: [hydroxideReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "sn2", nucleophile: "hydroxide", maxProducts: 8 },
    },
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
    },
    selectivity: ["Backside attack", "Inversion at a reacting stereocenter"],
    limitations: [
      "SN2 inversion is explicitly encoded at a stereogenic reacting carbon; other stereocenters are retained.",
      "Secondary substrates may also undergo E2; tertiary substrates are excluded from this SN2 rule.",
    ],
    productStatus: "representative",
    priority: 200,
  },
  {
    id: "haloalkane-sn2-cyanide",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "nucleophilic substitution",
    title: "SN2 with Cyanide",
    reagents: "Polar aprotic conditions",
    reagentNote: "Draw the alkyl halide and cyanide ion as disconnected structures",
    productHint: "Nitrile",
    explanation:
      "Cyanide attacks through carbon and displaces the leaving group in an SN2 reaction, extending the carbon skeleton by one carbon.",
    trigger: sn2EligibleHalideTrigger,
    additionalReactants: [cyanideReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "sn2", nucleophile: "cyanide", maxProducts: 8 },
    },
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
    },
    selectivity: ["Backside attack", "Inversion at a reacting stereocenter"],
    limitations: [
      "SN2 inversion is explicitly encoded at a stereogenic reacting carbon.",
      "Secondary substrates can compete with E2.",
    ],
    productStatus: "representative",
    priority: 210,
  },
  {
    id: "haloalkane-sn2-azide",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "nucleophilic substitution",
    title: "SN2 with Azide",
    reagents: "Polar aprotic solvent such as DMF or DMSO",
    reagentNote: "Draw the alkyl halide and azide ion as disconnected structures",
    productHint: "Alkyl azide",
    explanation:
      "Azide is a strong nucleophile and weak base, so it commonly undergoes SN2 substitution with methyl, primary, and many secondary alkyl halides.",
    trigger: sn2EligibleHalideTrigger,
    additionalReactants: [azideReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "sn2", nucleophile: "azide", maxProducts: 8 },
    },
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
    },
    selectivity: ["Backside attack", "Inversion at a reacting stereocenter"],
    limitations: [
      "SN2 inversion is explicitly encoded at a stereogenic reacting carbon.",
    ],
    productStatus: "representative",
    priority: 220,
  },
  {
    id: "haloalkane-sn2-iodide",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "nucleophilic substitution",
    title: "Bimolecular SN2 with Iodide Ion",
    reagents: "NaI, acetone (or another polar aprotic solvent)",
    reagentNote: "Iodide ion is supplied as the nucleophile; classic Finkelstein-type substitution",
    productHint: "Alkyl iodide",
    explanation:
      "Iodide is a strong, polarizable nucleophile. It attacks an unhindered alkyl chloride or bromide from the backside in a concerted SN2 step, replacing the leaving group and inverting a stereogenic reacting center.",
    trigger: sn2IodideEligibleHalideTrigger,
    additionalReactants: [iodideReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "sn2", nucleophile: "iodide", maxProducts: 8 },
    },
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
    },
    selectivity: ["Backside attack", "Inversion at a reacting stereocenter"],
    limitations: [
      "Most effective for methyl and primary substrates; secondary substrates are slower and can compete with elimination.",
      "Tertiary alkyl halides do not undergo clean SN2 substitution with iodide.",
    ],
    productStatus: "representative",
    priority: 225,
  },
  {
    id: "haloalkane-sn2-ammonia",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "nucleophilic substitution",
    title: "SN2 Alkylation with Ammonia",
    reagents: "Excess ammonia; polar conditions",
    reagentNote: "Draw the alkyl halide and ammonia as disconnected structures",
    productHint: "Primary amine",
    explanation:
      "Ammonia attacks the electrophilic carbon and displaces the leaving group by SN2. Excess ammonia helps limit further alkylation of the amine product.",
    trigger: sn2EligibleHalideTrigger,
    additionalReactants: [ammoniaReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "sn2", nucleophile: "ammonia", maxProducts: 8 },
    },
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
    },
    limitations: [
      "Further alkylation can occur if the alkyl halide is not limiting.",
      "Secondary substrates are more hindered and can show competing elimination.",
    ],
    productStatus: "representative",
    priority: 230,
  },
  {
    id: "haloalkane-williamson-ether",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "nucleophilic substitution",
    title: "Williamson Ether Synthesis",
    reagents: "Polar aprotic conditions",
    reagentNote: "Draw the alkyl halide and alkoxide as disconnected structures",
    productHint: "Ether",
    explanation:
      "An alkoxide displaces the leaving group by SN2 to form an ether. Methyl and primary halides are best; secondary halides can undergo competing E2.",
    trigger: sn2EligibleHalideTrigger,
    additionalReactants: [
      {
        label: "alkoxide ion",
        trigger: {
          includeSmarts: ["[#6,#0][O-]"],
        },
      },
    ],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "sn2", nucleophile: "alkoxide", maxProducts: 8 },
    },
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
    },
    selectivity: ["Backside attack", "Inversion at a reacting stereocenter"],
    limitations: [
      "Secondary halides can undergo substantial E2; tertiary halides are excluded.",
      "SN2 inversion is explicitly encoded when the reacting carbon is stereogenic.",
    ],
    productStatus: "representative",
    priority: 240,
  },
  {
    id: "haloalkane-acetylide-alkylation",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "nucleophilic substitution",
    title: "SN2 Alkylation with an Acetylide",
    reagents: "Polar aprotic conditions",
    reagentNote: "Draw a methyl/primary alkyl halide and an acetylide ion",
    productHint: "Higher alkyne",
    explanation:
      "An acetylide ion displaces the leaving group from a methyl or primary alkyl halide by SN2, forming a new carbon-carbon bond.",
    trigger: primaryOrMethylHalideTrigger,
    additionalReactants: [
      {
        label: "acetylide ion",
        trigger: {
          includeSmarts: ["[#6]#[C-]"],
        },
      },
    ],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "sn2", nucleophile: "acetylide", maxProducts: 8 },
    },
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
    },
    priority: 250,
  },

  // ---------------------------------------------------------------------------
  // SN1: weak neutral nucleophile is explicitly drawn.
  // ---------------------------------------------------------------------------
  {
    id: "haloalkane-sn1-solvolysis-water",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "solvolysis",
    title: "SN1 Solvolysis in Water",
    reagents: "Polar protic conditions",
    reagentNote: "Draw a secondary/tertiary alkyl halide and water",
    productHint: "Alcohol",
    explanation:
      "The leaving group ionizes to form a carbocation, then water captures the carbocation and deprotonation gives an alcohol. E1 competes increasingly as temperature rises.",
    trigger: secondaryOrTertiaryHalideTrigger,
    additionalReactants: [waterReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "sn1",
        nucleophile: "water",
        allowRearrangement: true,
        maxShiftDepth: 2,
        maxProducts: 12,
      },
    },
    mechanism: "SN1",
    selectivityProfile: {
      stereochemistry: { mode: "racemization" },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: ["Racemization is common", "Carbocation rearrangements are possible"],
    limitations: [
      "The handler enumerates strictly favorable 1,2-hydride and 1,2-alkyl shifts (up to two consecutive shifts) before capture.",
      "SN1 attack from both faces is explicitly enumerated when the reacting carbocation gives a stereogenic product; real reactions may show incomplete racemization because of ion-pair effects.",
      "Equal-stability rearrangements and detailed migratory aptitude are not ranked automatically.",
    ],
    productStatus: "representative",
    priority: 260,
  },
  {
    id: "haloalkane-sn1-solvolysis-alcohol",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "solvolysis",
    title: "SN1 Solvolysis in an Alcohol",
    reagents: "Polar protic conditions",
    reagentNote: "Draw a secondary/tertiary alkyl halide and the alcohol solvent",
    productHint: "Ether",
    explanation:
      "After ionization of a secondary or tertiary alkyl halide, a neutral alcohol can capture the carbocation to form an ether after deprotonation.",
    trigger: secondaryOrTertiaryHalideTrigger,
    additionalReactants: [neutralAlcoholReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "sn1",
        nucleophile: "alcohol",
        allowRearrangement: true,
        maxShiftDepth: 2,
        maxProducts: 12,
      },
    },
    mechanism: "SN1",
    selectivityProfile: {
      stereochemistry: { mode: "racemization" },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: ["Racemization is common", "Carbocation rearrangements are possible"],
    limitations: [
      "The handler enumerates strictly favorable 1,2-hydride and 1,2-alkyl shifts (up to two consecutive shifts) before alcohol capture.",
      "Both faces of a planar carbocation are enumerated when the product center is stereogenic; ion-pair effects can make experimental racemization incomplete.",
      "Equal-stability rearrangements and detailed migratory aptitude are not ranked automatically.",
    ],
    productStatus: "representative",
    priority: 265,
  },

  // ---------------------------------------------------------------------------
  // E2: the strong base is an explicitly drawn second reactant. It is used for
  // matching/competition but is not incorporated into the alkene product.
  // ---------------------------------------------------------------------------
  {
    id: "haloalkane-sn1-resonance-water",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "solvolysis",
    title: "SN1 Solvolysis of a Primary Allylic/Benzylic Halide",
    reagents: "Polar protic conditions",
    reagentNote: "Draw the resonance-stabilized alkyl halide and water",
    productHint: "Allylic/benzylic alcohol",
    explanation:
      "Although ordinary primary alkyl halides do not favor SN1, primary allylic and benzylic halides can ionize because the carbocation is resonance-stabilized; water then captures the cation.",
    trigger: resonanceStabilizedPrimaryHalideTrigger,
    additionalReactants: [waterReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "sn1",
        nucleophile: "water",
        allowRearrangement: false,
        maxProducts: 8,
      },
    },
    mechanism: "SN1",
    selectivityProfile: {
      stereochemistry: { mode: "racemization" },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Resonance-stabilized carbocation", "Allylic resonance can create more than one capture site"],
    limitations: [
      "The current transform shows capture at the original leaving-group carbon and does not yet enumerate all resonance-related allylic substitution products.",
    ],
    productStatus: "representative",
    priority: 266,
  },
  {
    id: "haloalkane-sn1-resonance-alcohol",
    family: "haloalkanes",
    reactionType: "substitution",
    reactionClass: "solvolysis",
    title: "SN1 Alcohol Solvolysis of a Primary Allylic/Benzylic Halide",
    reagents: "Polar protic conditions",
    reagentNote: "Draw the resonance-stabilized alkyl halide and the alcohol solvent",
    productHint: "Allylic/benzylic ether",
    explanation:
      "A primary allylic or benzylic leaving group can ionize through resonance stabilization, after which the drawn alcohol traps the carbocation to form an ether.",
    trigger: resonanceStabilizedPrimaryHalideTrigger,
    additionalReactants: [neutralAlcoholReactant],
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "sn1",
        nucleophile: "alcohol",
        allowRearrangement: false,
        maxProducts: 8,
      },
    },
    mechanism: "SN1",
    selectivityProfile: {
      stereochemistry: { mode: "racemization" },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Resonance-stabilized carbocation"],
    limitations: [
      "Allylic resonance can permit alternative capture positions; the current transform displays the unrearranged capture constitution.",
    ],
    productStatus: "representative",
    priority: 267,
  },

  {
    id: "haloalkane-e2-hydroxide",
    family: "haloalkanes",
    reactionType: "elimination",
    reactionClass: "beta elimination",
    title: "E2 with Hydroxide",
    reagents: "Heat when elimination is desired",
    reagentNote: "Draw the alkyl halide and hydroxide ion",
    productHint: "Alkene",
    explanation:
      "Hydroxide can remove a beta hydrogen while the leaving group departs in one concerted E2 step. More substituted alkenes are normally favored when conformational access is comparable.",
    trigger: e2EligibleHalideTrigger,
    additionalReactants: [hydroxideReactant],
    transform: {
      type: "customHandler",
      handler: "elimination",
      options: {
        mode: "e2",
        leavingGroup: "halide",
        preference: "zaitsev",
        maxProducts: 8,
      },
    },
    mechanism: "E2",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereoselective: true },
      regiochemistry: { mode: "zaitsev", regioselective: true },
      mixture: "possible",
      majorProductOnly: true,
    },
    selectivity: ["Anti-periplanar beta H / leaving-group geometry", "Usually Zaitsev"],
    limitations: [
      "The handler ranks alkene constitution and explicitly generates E/Z for common acyclic disubstituted alkenes; 3D anti-periplanar conformers and more highly substituted alkene geometry are not yet solved.",
      "Primary and secondary substrates can show competing SN2.",
    ],
    productStatus: "representative",
    priority: 270,
  },
  {
    id: "haloalkane-e2-zaitsev",
    family: "haloalkanes",
    reactionType: "elimination",
    reactionClass: "beta elimination",
    title: "E2 with an Unhindered Alkoxide",
    reagents: "Heat when elimination is desired",
    reagentNote: "Draw the alkyl halide and an unhindered alkoxide base",
    productHint: "More substituted alkene",
    explanation:
      "A strong, relatively unhindered alkoxide removes a beta hydrogen as the leaving group departs. The more substituted Zaitsev alkene is normally favored.",
    trigger: e2EligibleHalideTrigger,
    additionalReactants: [unhinderedAlkoxideReactant],
    transform: {
      type: "customHandler",
      handler: "elimination",
      options: {
        mode: "e2",
        leavingGroup: "halide",
        preference: "zaitsev",
        maxProducts: 8,
      },
    },
    mechanism: "E2",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereoselective: true },
      regiochemistry: { mode: "zaitsev", regioselective: true },
      mixture: "possible",
      majorProductOnly: true,
    },
    selectivity: ["Anti-periplanar geometry", "Usually Zaitsev"],
    limitations: [
      "The handler generates E/Z for common acyclic disubstituted alkenes, but does not yet determine anti-periplanar conformer availability or general trisubstituted/tetrasubstituted alkene geometry.",
      "Secondary substrates can show competing SN2.",
    ],
    productStatus: "representative",
    priority: 272,
  },
  {
    id: "haloalkane-e2-hofmann",
    family: "haloalkanes",
    reactionType: "elimination",
    reactionClass: "beta elimination",
    title: "E2 with tert-Butoxide: Hofmann Preference",
    reagents: "Heat",
    reagentNote: "Draw the alkyl halide and tert-butoxide ion",
    productHint: "Less substituted alkene",
    explanation:
      "Bulky tert-butoxide preferentially removes a less hindered beta hydrogen, often shifting the major constitutional product toward the less substituted Hofmann alkene.",
    trigger: e2EligibleHalideTrigger,
    additionalReactants: [tertButoxideReactant],
    transform: {
      type: "customHandler",
      handler: "elimination",
      options: {
        mode: "e2",
        leavingGroup: "halide",
        preference: "hofmann",
        maxProducts: 8,
      },
    },
    mechanism: "E2",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereoselective: true },
      regiochemistry: { mode: "hofmann", regioselective: true },
      mixture: "possible",
      majorProductOnly: true,
    },
    selectivity: ["Anti-periplanar geometry", "Often Hofmann with a bulky base"],
    limitations: [
      "The handler generates common disubstituted E/Z products but does not explicitly model steric approach trajectories, conformer populations, or general highly substituted alkene geometry.",
    ],
    productStatus: "representative",
    priority: 274,
  },
  {
    id: "haloalkane-e2-amide-base",
    family: "haloalkanes",
    reactionType: "elimination",
    reactionClass: "beta elimination",
    title: "E2 with Amide Base",
    reagents: "Strong-base conditions",
    reagentNote: "Draw the alkyl halide and amide base (for example NH₂⁻)",
    productHint: "Alkene",
    explanation:
      "A very strong amide base can remove a beta hydrogen in a concerted E2 elimination. Constitutional products are ranked toward the more substituted alkene unless steric effects dictate otherwise.",
    trigger: e2EligibleHalideTrigger,
    additionalReactants: [amideBaseReactant],
    transform: {
      type: "customHandler",
      handler: "elimination",
      options: {
        mode: "e2",
        leavingGroup: "halide",
        preference: "zaitsev",
        maxProducts: 8,
      },
    },
    mechanism: "E2",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereoselective: true },
      regiochemistry: { mode: "zaitsev", regioselective: true },
      mixture: "possible",
      majorProductOnly: true,
    },
    selectivity: ["Anti-periplanar geometry", "Often Zaitsev with a small strong base"],
    limitations: [
      "The handler generates common acyclic disubstituted E/Z products but does not yet model anti-periplanar conformer populations or general highly substituted alkene geometry.",
    ],
    productStatus: "representative",
    priority: 276,
  },

  // ---------------------------------------------------------------------------
  // E1: a weak neutral base/solvent is explicitly drawn. SN1 and E1 are both
  // returned when both are chemically plausible; heat is represented as a
  // condition rather than a structural reactant.
  // ---------------------------------------------------------------------------
  {
    id: "haloalkane-e1-elimination",
    family: "haloalkanes",
    reactionType: "elimination",
    reactionClass: "carbocation elimination",
    title: "E1 Elimination in Water",
    reagents: "Heat",
    reagentNote: "Draw a secondary/tertiary alkyl halide and water",
    productHint: "Major Zaitsev alkene",
    explanation:
      "The leaving group ionizes to a carbocation, then water removes a beta proton. Heating shifts the SN1/E1 competition toward elimination, and the more substituted alkene is usually favored.",
    trigger: secondaryOrTertiaryHalideTrigger,
    additionalReactants: [waterReactant],
    transform: {
      type: "customHandler",
      handler: "elimination",
      options: {
        mode: "e1",
        leavingGroup: "halide",
        preference: "zaitsev",
        maxProducts: 12,
        maxShiftDepth: 2,
        allowRearrangement: true,
      },
    },
    mechanism: "E1",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereoselective: true },
      regiochemistry: { mode: "zaitsev", regioselective: true },
      mixture: "possible",
      majorProductOnly: true,
      allowsRearrangement: true,
    },
    selectivity: ["Usually Zaitsev", "Carbocation rearrangements are possible"],
    limitations: [
      "The E1 handler enumerates strictly favorable 1,2-hydride and 1,2-alkyl shifts before beta elimination, then ranks constitutional alkenes by Zaitsev substitution.",
      "E/Z stereoisomers are explicitly generated for common acyclic disubstituted alkenes with E listed first; general highly substituted alkene geometry is not yet enumerated.",
      "Equal-stability shifts and detailed migratory aptitude are not automatically ranked.",
    ],
    productStatus: "representative",
    priority: 290,
  },
  {
    id: "haloalkane-e1-alcohol-solvolysis",
    family: "haloalkanes",
    reactionType: "elimination",
    reactionClass: "carbocation elimination",
    title: "E1 Elimination in an Alcohol Solvent",
    reagents: "Heat",
    reagentNote: "Draw a secondary/tertiary alkyl halide and the alcohol solvent",
    productHint: "Major Zaitsev alkene",
    explanation:
      "A polar protic alcohol can support carbocation formation; at elevated temperature, beta deprotonation competes with SN1 capture and produces an alkene, usually favoring the Zaitsev constitution.",
    trigger: secondaryOrTertiaryHalideTrigger,
    additionalReactants: [neutralAlcoholReactant],
    transform: {
      type: "customHandler",
      handler: "elimination",
      options: {
        mode: "e1",
        leavingGroup: "halide",
        preference: "zaitsev",
        maxProducts: 12,
        maxShiftDepth: 2,
        allowRearrangement: true,
      },
    },
    mechanism: "E1",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereoselective: true },
      regiochemistry: { mode: "zaitsev", regioselective: true },
      mixture: "possible",
      majorProductOnly: true,
      allowsRearrangement: true,
    },
    selectivity: ["Usually Zaitsev", "Carbocation rearrangements are possible"],
    limitations: [
      "The E1 handler includes strictly favorable hydride/alkyl rearrangements before elimination.",
      "E/Z stereoisomers are explicitly generated for common acyclic disubstituted alkenes with E listed first; general highly substituted alkene geometry is not yet enumerated.",
      "Equal-stability shifts and detailed migratory aptitude are not automatically ranked.",
    ],
    productStatus: "representative",
    priority: 292,
  },

  {
    id: "haloalkane-grignard-formation-bromide",
    family: "haloalkanes",
    reactionType: "substitution",
    title: "Grignard Reagent Formation",
    reagents: "Mg, dry ether",
    reagentNote: "Convert R–Br to RMgBr",
    productHint: "Alkylmagnesium bromide",
    explanation:
      "Magnesium inserts into an alkyl carbon-bromine bond to form the corresponding Grignard reagent. The carbon group remains explicit so PocketChem can carry that exact R group into a later carbon-carbon bond-forming step.",
    trigger: {
      ...grignardCompatibleHalideTrigger,
      includeSmarts: ["[C;X4][Br]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[C;X4:1][Br:2]>>[C:1][Mg][Br:2]",
      maxProducts: 8,
    },
    mechanism: "Single-electron transfer / metal insertion",
    limitations: [
      "Requires rigorously dry ether or THF conditions.",
      "Incompatible with alcohols, water, carboxylic acids, terminal alkynes, and other sufficiently acidic/protic groups in the same molecule.",
    ],
    priority: 300,
  },
  {
    id: "haloalkane-grignard-formation-chloride",
    family: "haloalkanes",
    reactionType: "substitution",
    title: "Grignard Reagent Formation",
    reagents: "Mg, dry ether",
    reagentNote: "Convert R–Cl to RMgCl",
    productHint: "Alkylmagnesium chloride",
    explanation:
      "Magnesium inserts into an alkyl carbon-chlorine bond to form the corresponding Grignard reagent. The carbon group remains explicit so PocketChem can carry that exact R group into a later carbon-carbon bond-forming step.",
    trigger: {
      ...grignardCompatibleHalideTrigger,
      includeSmarts: ["[C;X4][Cl]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[C;X4:1][Cl:2]>>[C:1][Mg][Cl:2]",
      maxProducts: 8,
    },
    mechanism: "Single-electron transfer / metal insertion",
    limitations: [
      "Requires rigorously dry ether or THF conditions.",
      "Alkyl chlorides are generally less reactive toward magnesium than the corresponding bromides or iodides.",
      "Incompatible with alcohols, water, carboxylic acids, terminal alkynes, and other sufficiently acidic/protic groups in the same molecule.",
    ],
    priority: 302,
  },
  {
    id: "haloalkane-grignard-formation-iodide",
    family: "haloalkanes",
    reactionType: "substitution",
    title: "Grignard Reagent Formation",
    reagents: "Mg, dry ether",
    reagentNote: "Convert R–I to RMgI",
    productHint: "Alkylmagnesium iodide",
    explanation:
      "Magnesium inserts into an alkyl carbon-iodine bond to form the corresponding Grignard reagent. The carbon group remains explicit so PocketChem can carry that exact R group into a later carbon-carbon bond-forming step.",
    trigger: {
      ...grignardCompatibleHalideTrigger,
      includeSmarts: ["[C;X4][I]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[C;X4:1][I:2]>>[C:1][Mg][I:2]",
      maxProducts: 8,
    },
    mechanism: "Single-electron transfer / metal insertion",
    limitations: [
      "Requires rigorously dry ether or THF conditions.",
      "Incompatible with alcohols, water, carboxylic acids, terminal alkynes, and other sufficiently acidic/protic groups in the same molecule.",
    ],
    priority: 301,
  },
];
