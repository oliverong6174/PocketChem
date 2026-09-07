import type { ReactionRule } from "../reactionTypes";

const alkeneTrigger = {
  anyFunctionalGroups: [
    "Alkene",
    "Cycloalkene",
    "Diene",
    "Conjugated diene",
    "Cumulated diene",
    "Triene",
    "Enyne",
    "Enal",
    "Enone",
    "Enoic acid",
    "Enoate",
    "Chalcone",
    "Cinnamic acid",
    "Cinnamaldehyde",
    "Crotonic acid",
    "Crotonaldehyde",
    "Acrylic acid",
    "Acrolein",
  ],
  includeSmarts: ["[C;!a]=[C;!a]"],
};

export const alkeneReactionRules: ReactionRule[] = [
  {
    id: "alkene-photochemical-2plus2",
    family: "alkenes",
    reactionType: "pericyclic",
    title: "Photochemical [2+2] Cycloaddition",
    reagents: "hν (UV light)",
    reagentNote: "Photochemical [2+2] cycloaddition of two alkenes",
    productHint: "Cyclobutane formed from the two alkene π bonds",
    explanation:
      "Under photochemical excitation, two alkene π bonds can undergo a [2+2] cycloaddition. Each C=C becomes a single bond and two new C–C bonds form between the alkene termini, creating a four-membered cyclobutane ring.",
    trigger: alkeneTrigger,
    additionalReactants: [
      {
        label: "alkene reaction partner",
        trigger: alkeneTrigger,
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts:
        "[C:1]=[C:2].[C:3]=[C:4]>>[C:1]1[C:2][C:3][C:4]1",
      // RDKit can emit one product for every atom-map embedding when either
      // reactant contains several C=C bonds.  Those are mapping/site
      // alternatives, not separate reaction cards for the introductory
      // photochemical [2+2] rule.  Generate enough candidates for the shared
      // selectivity layer to canonicalize them, then keep one representative
      // major connectivity below.
      maxProducts: 12,
    },
    productStatus: "computed",
    mechanism: "Photochemical pericyclic [2+2] cycloaddition",
    selectivityProfile: {
      mixture: "single",
      majorProductOnly: true,
    },
    selectivity: [
      "Consumes one alkene from each drawn reactant and forms a cyclobutane ring.",
      "When several C=C atom-map embeddings are possible, PocketChem displays one representative major [2+2] product instead of enumerating every mapping-derived alternative.",
    ],
    limitations: [
      "This rule models intermolecular [2+2] cycloaddition between two disconnected alkene-containing structures.",
      "If a substrate is known experimentally to give a genuine regioisomeric mixture, a dedicated substrate-specific rule should declare that mixture explicitly rather than relying on generic atom-map enumeration.",
      "Ordinary thermal alkene [2+2] cycloaddition is not represented by this rule; hν is required.",
    ],
    priority: 710,
  },
  {
    id: "alkene-alkyne-photochemical-2plus2",
    family: "alkenes",
    reactionType: "pericyclic",
    title: "Photochemical Alkene–Alkyne [2+2] Cycloaddition",
    reagents: "hν (UV light)",
    reagentNote: "Photochemical [2+2] between an alkene and an alkyne",
    productHint: "Cyclobutene derivative",
    explanation:
      "An alkene and an alkyne can undergo a photochemical [2+2] cycloaddition. One alkyne π bond and the alkene π bond form two new C–C σ bonds, leaving a cyclobutene double bond.",
    trigger: alkeneTrigger,
    additionalReactants: [
      {
        label: "alkyne reaction partner",
        trigger: { includeSmarts: ["[C]#[C]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2].[C:3]#[C:4]>>[C:1]1[C:2][C:3]=[C:4]1",
      maxProducts: 12,
    },
    productStatus: "computed",
    mechanism: "Photochemical pericyclic [2+2] cycloaddition",
    selectivityProfile: { mixture: "possible" },
    selectivity: ["This is a photochemical [2+2], not a Diels–Alder [4+2] reaction."],
    limitations: ["Unsymmetrical alkene/alkyne pairs can have genuine regioselectivity that depends on substituent electronics and is not universally captured by one generic rule."],
    priority: 709,
  },
  {
    id: "alkene-hydrogenation",
    family: "alkenes",
    reactionType: "reduction",
    title: "Alkene Hydrogenation",
    reagents: "H₂, Pd/C",
    reagentNote: "Catalytic reduction",
    productHint: "Alkane",
    explanation:
      "Hydrogenation adds H₂ across the C=C bond, reducing the alkene to an alkane.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1][C:2]",
    },
    priority: 100,
  },

  {
    id: "deuteration",
    family: "alkenes",
    reactionType: "reduction",
    title: "Catalytic Deuteration",
    reagents: "D₂, Pd/C",
    reagentNote: "Syn addition of D₂",
    productHint: "1,2-Dideuterated alkane",
    explanation:
      "Catalytic deuteration adds one explicit deuterium (D) to each alkene carbon. PocketChem keeps the isotope atoms in the product structure so the D labels can be drawn.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([2H])[C:2]([2H])",
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["D and D add to the same face of the alkene (syn addition)."],
    priority: 105,
  },

  {
    id: "alkene-hx-addition-hbr",
    family: "alkenes",
    reactionType: "addition",
    title: "HX Addition: Hydrobromination",
    reagents: "HBr",
    reagentNote: "Hydrohalogenation",
    productHint: "Alkyl bromide",
    explanation:
      "Under ordinary ionic conditions, HBr protonates the alkene and bromide attacks the more stable carbocation. For an unsymmetrical alkene this normally places Br on the more substituted carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydrohalogenation",
        halogen: "Br",
        regioselectivity: "markovnikov",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      regiochemistry: { mode: "markovnikov", regioselective: true },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: [
      "For an unsymmetrical alkene, Br is normally placed on the more substituted carbon (Markovnikov orientation).",
      "Carbocation rearrangements can occur under the ionic mechanism.",
    ],
    limitations: [
      "The current hydrohalogenation handler enforces the unrearranged Markovnikov connectivity; carbocation rearrangements are not yet generated for this alkene rule.",
    ],
    priority: 110,
  },

  {
    id: "alkene-hx-addition-hcl",
    family: "alkenes",
    reactionType: "addition",
    title: "HX Addition: Hydrochlorination",
    reagents: "HCl",
    reagentNote: "Hydrohalogenation",
    productHint: "Alkyl chloride",
    explanation:
      "Under ordinary ionic conditions, HCl protonates the alkene and chloride attacks the more stable carbocation. For an unsymmetrical alkene this normally places Cl on the more substituted carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydrohalogenation",
        halogen: "Cl",
        regioselectivity: "markovnikov",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      regiochemistry: { mode: "markovnikov", regioselective: true },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: [
      "For an unsymmetrical alkene, Cl is normally placed on the more substituted carbon (Markovnikov orientation).",
      "Carbocation rearrangements can occur under the ionic mechanism.",
    ],
    limitations: [
      "The current hydrohalogenation handler enforces the unrearranged Markovnikov connectivity; carbocation rearrangements are not yet generated for this alkene rule.",
    ],
    priority: 111,
  },

  {
    id: "alkene-hx-addition-hi",
    family: "alkenes",
    reactionType: "addition",
    title: "HX Addition: Hydroiodination",
    reagents: "HI",
    reagentNote: "Hydrohalogenation",
    productHint: "Alkyl iodide",
    explanation:
      "Under ordinary ionic conditions, HI protonates the alkene and iodide attacks the more stable carbocation. For an unsymmetrical alkene this normally places I on the more substituted carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydrohalogenation",
        halogen: "I",
        regioselectivity: "markovnikov",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      regiochemistry: { mode: "markovnikov", regioselective: true },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: [
      "For an unsymmetrical alkene, I is normally placed on the more substituted carbon (Markovnikov orientation).",
      "Carbocation rearrangements can occur under the ionic mechanism.",
    ],
    limitations: [
      "The current hydrohalogenation handler enforces the unrearranged Markovnikov connectivity; carbocation rearrangements are not yet generated for this alkene rule.",
    ],
    priority: 112,
  },

  {
    id: "alkene-hbr-peroxide",
    family: "alkenes",
    reactionType: "radical",
    title: "Hydrobromination (Peroxide Effect)",
    reagents: "HBr, ROOR",
    reagentNote: "Radical HBr addition",
    productHint: "Alkyl bromide",
    explanation:
      "In the presence of peroxides, HBr adds by a radical-chain mechanism and gives the anti-Markovnikov constitutional product.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydrohalogenation",
        halogen: "Br",
        regioselectivity: "anti-markovnikov",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      regiochemistry: { mode: "anti-markovnikov", regioselective: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Br goes to the less substituted alkene carbon (anti-Markovnikov)."],
    priority: 115,
  },

  {
    id: "alkene-halogenation-bromine",
    family: "alkenes",
    reactionType: "addition",
    title: "Halogenation",
    reagents: "Br₂, CCl₄",
    reagentNote: "Anti addition of halogen",
    productHint: "Vicinal dibromide",
    explanation:
      "Halogenation adds one bromine to each alkene carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([Br])[C:2]([Br])",
    },
    productStatus: "representative",
    selectivityProfile: {
      stereochemistry: { mode: "anti-addition", stereospecific: true },
      sitePreference: "most-substituted-alkene",
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Anti addition", "More substituted/electron-rich alkene sites are preferred when several nonequivalent C=C bonds are present."],
    priority: 120,
  },

  {
    id: "alkene-halohydrin-formation",
    family: "alkenes",
    reactionType: "addition",
    title: "Halohydrin Formation",
    reagents: "Br₂, H₂O",
    reagentNote: "Anti addition of Br and OH",
    productHint: "Halohydrin",
    explanation:
      "The alkene forms a bromonium ion, then water attacks the more substituted carbon. The result is a vicinal bromohydrin with OH on the more substituted carbon and Br on the less substituted carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "halohydrin",
        halogen: "Br",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      stereochemistry: { mode: "anti-addition", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: [
      "OH goes to the more substituted alkene carbon and Br to the less substituted carbon.",
      "Br and OH add anti through bromonium-ion opening.",
    ],
    limitations: [
      "The current product graph enforces the correct constitutional orientation; explicit anti stereocenter assignment will be completed in the alkene stereochemistry phase.",
    ],
    priority: 130,
  },

  {
    id: "alkene-haloether-formation",
    family: "alkenes",
    reactionType: "addition",
    title: "Haloether Formation",
    reagents: "Br₂, ROH",
    reagentNote: "Anti addition of Br and OR",
    productHint: "Vicinal bromoether",
    explanation:
      "An alcohol opens the bromonium ion formed from the alkene. The alcohol's OR group bonds to the more substituted alkene carbon while Br remains on the less substituted carbon, giving a haloether.",
    trigger: alkeneTrigger,
    additionalReactants: [
      {
        label: "alcohol (ROH)",
        trigger: {
          includeSmarts: ["[O;H1][C;X4;!$(C=O)]"],
        },
      },
    ],
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "haloether",
        halogen: "Br",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      stereochemistry: { mode: "anti-addition", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: [
      "OR goes to the more substituted alkene carbon and Br to the less substituted carbon.",
      "Br and OR add anti through bromonium-ion opening.",
    ],
    limitations: [
      "The supplied alcohol's actual R group is carried into the ether. Explicit anti stereocenter assignment will be completed in the alkene stereochemistry phase.",
    ],
    priority: 132,
  },

  {
    id: "alkene-acid-hydration",
    family: "alkenes",
    reactionType: "addition",
    title: "Acid-Catalyzed Hydration",
    reagents: "H₂O/H⁺ (e.g. H₂O + dilute H₂SO₄ or H₃PO₄)",
    reagentNote: "Acid-catalyzed hydration",
    productHint: "Alcohol",
    explanation:
      "Water adds across the alkene under acidic conditions. For an unsymmetrical alkene, protonation favors the more stable carbocation, so OH normally ends up on the more substituted carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydration",
        regioselectivity: "markovnikov",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      regiochemistry: { mode: "markovnikov", regioselective: true },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: [
      "For an unsymmetrical alkene, OH normally forms on the more substituted carbon (Markovnikov orientation).",
      "Carbocation rearrangements may occur.",
    ],
    limitations: [
      "The current hydration handler enforces the unrearranged Markovnikov connectivity but does not yet generate carbocation-rearranged hydration products.",
    ],
    priority: 140,
  },

  {
    id: "alkene-hydroboration-oxidation",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Hydroboration-Oxidation",
    reagents: "1) BH₃·THF  2) H₂O₂, NaOH",
    reagentNote: "Syn hydration",
    productHint: "Alcohol",
    explanation:
      "Hydroboration-oxidation hydrates the alkene with anti-Markovnikov orientation.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydration",
        regioselectivity: "anti-markovnikov",
      },
    },
    productStatus: "representative",
    selectivityProfile: {
      sitePreference: "least-substituted-alkene",
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      regiochemistry: { mode: "anti-markovnikov", regioselective: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Anti-Markovnikov and syn addition"],
    limitations: [
      "The current hydration handler enforces anti-Markovnikov connectivity; syn stereochemistry is not yet assigned explicitly in the product structure.",
    ],
    priority: 150,
  },



  {
    id: "alkene-oxymercuration-demercuration",
    family: "alkenes",
    reactionType: "addition",
    title: "Oxymercuration-Demercuration",
    reagents: "1) Hg(OAc)₂, H₂O  2) NaBH₄",
    reagentNote: "Hydration without rearrangement",
    productHint: "Alcohol",
    explanation:
      "Oxymercuration-demercuration converts an alkene to a Markovnikov alcohol without rearrangement.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydration",
        regioselectivity: "markovnikov",
      },
    },
    productStatus: "representative",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      regiochemistry: { mode: "markovnikov", regioselective: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Markovnikov orientation without rearrangement"],
    priority: 160,
  },

  {
    id: "alkene-alkoxymercuration-demercuration",
    family: "alkenes",
    reactionType: "addition",
    title: "Alkoxymercuration-Demercuration",
    reagents: "1) Hg(OAc)₂, ROH  2) NaBH₄",
    reagentNote: "Markovnikov ether formation without rearrangement",
    productHint: "Ether",
    explanation:
      "Alkoxymercuration-demercuration adds OR and H across an alkene. The oxygen of the supplied alcohol becomes bonded to the more substituted alkene carbon, giving a Markovnikov ether without a free carbocation rearrangement.",
    trigger: alkeneTrigger,
    additionalReactants: [
      {
        label: "alcohol (ROH)",
        trigger: {
          includeSmarts: ["[O;H1][C;X4;!$(C=O)]"],
        },
      },
    ],
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkoxymercuration",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      regiochemistry: { mode: "markovnikov", regioselective: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: [
      "OR goes to the more substituted alkene carbon (Markovnikov orientation).",
      "No carbocation rearrangement is expected.",
    ],
    priority: 162,
  },

  {
    id: "alkene-simmons-smith",
    family: "alkenes",
    reactionType: "addition",
    title: "Simmons–Smith Cyclopropanation",
    reagents: "CH₂I₂, Zn(Cu)",
    reagentNote: "Cyclopropane formation",
    productHint: "Cyclopropane",
    explanation:
      "A methylene carbenoid adds across the double bond to form a cyclopropane while preserving the alkene's relative stereochemistry.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]1[C][C:2]1",
    },
    productStatus: "representative",
    selectivityProfile: {
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Stereospecific cyclopropanation; alkene geometry is retained in the ring relationship."],
    priority: 165,
  },

  {
    id: "alkene-dichlorocyclopropanation",
    family: "alkenes",
    reactionType: "addition",
    title: "Dichlorocyclopropanation",
    reagents: "CHCl₃, strong base (e.g. NaOH)",
    reagentNote: "Dichlorocarbene cyclopropanation",
    productHint: "Gem-dichlorocyclopropane",
    explanation:
      "Base generates dichlorocarbene (:CCl₂) from chloroform. The carbene adds across the alkene to form a cyclopropane bearing two chlorines on the newly inserted carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]1[C]([Cl])([Cl])[C:2]1",
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Carbene addition is stereospecific and preserves the alkene's relative stereochemistry."],
    priority: 166,
  },

  {
    id: "alkene-dibromocyclopropanation",
    family: "alkenes",
    reactionType: "addition",
    title: "Dibromocyclopropanation",
    reagents: "CHBr₃, strong base (e.g. NaOH)",
    reagentNote: "Dibromocarbene cyclopropanation",
    productHint: "Gem-dibromocyclopropane",
    explanation:
      "Base generates dibromocarbene (:CBr₂) from bromoform. The carbene adds across the alkene to form a cyclopropane bearing two bromines on the newly inserted carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]1[C]([Br])([Br])[C:2]1",
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: ["Carbene addition is stereospecific and preserves the alkene's relative stereochemistry."],
    priority: 167,
  },

  {
    id: "alkene-epoxidation",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Epoxidation",
    reagents: "mCPBA; or RCO₃H (peroxyacid)",
    reagentNote: "Peroxyacid epoxidation",
    productHint: "Epoxide",
    explanation:
      "A peroxyacid converts the alkene into a three-membered epoxide ring.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]1[O][C:2]1",
    },
    productStatus: "representative",
    selectivityProfile: {
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      sitePreference: "most-substituted-alkene",
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: [
      "Stereospecific oxygen transfer",
      "When several nonequivalent isolated alkenes are present, the more substituted/electron-rich alkene is preferred; exact ties remain as alternatives.",
    ],
    priority: 170,
  },

  {
    id: "alkene-epoxidation-organometallic-opening",
    family: "alkenes",
    reactionType: "ringOpening",
    title: "Epoxidation Followed by Grignard/Organolithium Opening",
    reagents: "1) 1 equiv mCPBA or RCO₃H  2) RMgX or RLi  3) H₃O⁺",
    reagentNote: "Monoepoxidation, then nucleophilic epoxide opening",
    productHint: "Alcohol with a new C–C bond",
    explanation:
      "One equivalent of peroxyacid converts one alkene into an epoxide. A drawn Grignard or organolithium reagent then opens that epoxide at the less substituted carbon; acidic workup gives the alcohol.",
    trigger: alkeneTrigger,
    additionalReactants: [
      {
        label: "Grignard or organolithium reagent",
        trigger: { includeSmarts: ["[#6][Mg,Li]"] },
      },
    ],
    transform: {
      type: "customHandler",
      handler: "addition",
      options: { mode: "epoxidationOrganometallicOpening" },
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "anti-addition", stereospecific: true },
      sitePreference: "most-substituted-alkene",
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: [
      "One equivalent of mCPBA gives monoepoxidation rather than epoxidizing every C=C bond.",
      "Among nonequivalent isolated alkenes, the more substituted/electron-rich alkene is preferred; exact site-selectivity ties are retained.",
      "RMgX/RLi attacks the less substituted epoxide carbon by backside opening, so the new C–C bond and OH are anti; one wedge/dash representative is drawn rather than duplicating its mirror image as another regioisomer.",
    ],
    limitations: [
      "When two alkene sites have indistinguishable substitution/electronic ranking, both genuinely competitive sites are retained instead of choosing one arbitrarily.",
    ],
    priority: 175,
  },

  {
    id: "alkene-syn-dihydroxylation",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Syn Dihydroxylation",
    reagents: "OsO₄/H₂O₂; OsO₄/NMO; or KMnO₄/OH⁻, cold/dilute",
    reagentNote: "Syn addition of two OH groups",
    productHint: "Vicinal diol",
    explanation:
      "Syn dihydroxylation adds two hydroxyl groups to the same face of the alkene. Common reagent systems are OsO₄ with H₂O₂, OsO₄ with NMO, or cold dilute basic KMnO₄.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: { mode: "synDihydroxylation" },
    },
    productStatus: "computed",
    mechanism: "Syn dihydroxylation",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    selectivity: ["Both OH groups add to the same face of the alkene (syn addition)."],
    priority: 180,
  },

  {
    id: "alkene-anti-dihydroxylation",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Anti Dihydroxylation",
    reagents: "1) mCPBA  2) H₃O⁺",
    reagentNote: "Epoxidation then anti opening",
    productHint: "Vicinal diol",
    explanation:
      "Epoxidation followed by acid-catalyzed ring opening gives an anti vicinal diol.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: { mode: "antiDihydroxylation" },
    },
    productStatus: "computed",
    selectivityProfile: {
      sitePreference: "most-substituted-alkene",
      stereochemistry: { mode: "anti-addition", stereospecific: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    selectivity: ["The two OH groups end up on opposite faces (anti addition)."],
    priority: 190,
  },

    {
        id: "alkene-ozonolysis-reductive",
        family: "alkenes",
        reactionType: "cleavage",
        title: "Reductive Ozonolysis",
        reagents: "1) O₃  2) (CH₃)₂S or Zn/H₂O",
        reagentNote: "Reductive workup",
        productHint: "Aldehydes / Ketones",
        explanation:
            "Ozone cleaves the alkene. Dimethyl sulfide or zinc prevents further oxidation, giving aldehydes and ketones.",
        trigger: alkeneTrigger,
        transform: {
            type: "reactionSmarts",
            smarts:
                "[C:1]=[C:2]>>[C:1]=O.[C:2]=O"
        },
        priority: 200
    },

    {
    id: "alkene-ozonolysis-oxidative",
    family: "alkenes",
    reactionType: "cleavage",
    title: "Oxidative Ozonolysis",
    reagents: "1) O₃  2) H₂O₂",
    reagentNote: "Oxidative workup",
    productHint: "Carboxylic acids",
    explanation:
        "Oxidative workup converts any aldehydes formed during ozonolysis into carboxylic acids while ketones remain ketones.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "oxidation",
      options: {
        mode: "alkeneOxidativeCleavage",
      },
    },
    productStatus: "computed",
    priority: 201
},

  {
    id: "alkene-oxidative-cleavage",
    family: "alkenes",
    reactionType: "cleavage",
    title: "Hot Permanganate Oxidative Cleavage",
    reagents: "1) KMnO4, OH⁻, heat  2) H₃O⁺",
    reagentNote: "Strong oxidative cleavage",
    productHint: "Ketones, carboxylic acids, and/or CO₂",
    explanation:
      "Hot permanganate cleaves the alkene. An alkene carbon with no hydrogen gives a ketone, one bearing a hydrogen gives a carboxylic acid, and a terminal CH₂ carbon is oxidized to CO₂.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "oxidation",
      options: {
        mode: "alkeneOxidativeCleavage",
      },
    },
    productStatus: "computed",
    mechanism: "Strong oxidative cleavage",
    priority: 210,
  },



  {
    id: "alkene-allylic-bromination",
    family: "alkenes",
    reactionType: "radical",
    title: "Allylic Bromination",
    reagents: "NBS, hν or radical initiator",
    reagentNote: "Radical substitution at an allylic carbon",
    productHint: "Allylic bromide",
    explanation:
      "NBS replaces an allylic hydrogen with bromine while minimizing direct addition of Br₂ across the double bond.",
    trigger: {
      ...alkeneTrigger,
      includeSmarts: ["[C]=[C][C;H1,H2,H3]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2][C;H1,H2,H3:3]>>[C:1]=[C:2][C:3]Br",
      maxProducts: 8,
    },
    mechanism: "Radical-chain substitution",
    productStatus: "representative",
    selectivity: ["Reaction occurs at an allylic C–H bond."],
    limitations: [
      "Resonance-related allylic bromides can form; the engine enumerates local sites but does not rank the product mixture.",
    ],
    priority: 215,
  },
  {
    id: "alkene-addition-polymerization",
    family: "alkenes",
    reactionType: "addition",
    title: "Addition Polymerization",
    reagents: "radical, cationic, anionic, or coordination initiator",
    reagentNote: "Chain-growth polymerization",
    productHint: "Polyalkene repeat unit",
    explanation:
      "Many alkenes undergo chain-growth addition polymerization in which the pi bond becomes part of a saturated polymer backbone.",
    trigger: alkeneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "A polymer requires repeat-unit, tacticity, end-group, and chain-length representation rather than a finite small-molecule SMILES product.",
    },
    mechanism: "Chain-growth polymerization",
    course: "advanced",
    priority: 220,
  },
];
