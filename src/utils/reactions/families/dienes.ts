import type { ReactionRule } from "../reactionTypes";
import { HYDROHALOGENS } from "../profiles/halogens";
import { CONJUGATED_DIENE_HX_TEMPERATURE_GUIDE } from "../profiles/conditions";

function conjugatedPolyeneSmarts(doubleBondCount: number): string {
  if (!Number.isInteger(doubleBondCount) || doubleBondCount < 2) {
    throw new Error("A conjugated polyene must contain at least two double bonds.");
  }

  let smarts = "[C;!a]=[C;!a]";
  for (let bond = 2; bond <= doubleBondCount; bond += 1) {
    smarts += "-[C;!a]=[C;!a]";
  }
  return smarts;
}

/**
 * Broad conjugated-diene trigger for reactions such as Diels-Alder chemistry
 * that genuinely can use a four-carbon segment embedded in a longer polyene.
 */
const DIELS_ALDER_DIENE_TRIGGER_SMARTS =
  "[$([C;!a]=[C;!a]-[C;!a]=[C;!a]),$([O]=[c]1[o][c][c][c][c]1)]";

const anyConjugatedDieneTrigger = {
  // ReactionTrigger.includeSmarts is AND-semantics, so ordinary carbon dienes
  // and alpha-pyrones must be expressed as alternatives inside ONE SMARTS.
  // RDKit aromaticizes 2-pyrone as O=c1occcc1; the second recursive branch
  // therefore uses aromatic c/o atoms rather than a Kekule-only pattern.
  includeSmarts: [DIELS_ALDER_DIENE_TRIGGER_SMARTS],
};


function intramolecularDielsAlderTrigger(tetherAtoms: number) {
  const tether = Array.from({ length: tetherAtoms }, () => "-[*]").join("");
  return {
    includeSmarts: [
      `[C;!a]=[C;!a]-[C;!a]=[C;!a]${tether}-[C;!a]=[C;!a]`,
    ],
  };
}

const intramolecularDielsAlderRules: ReactionRule[] = [1, 2, 3, 4, 5].map(
  (tetherAtoms) => ({
    id: `diene-intramolecular-diels-alder-${tetherAtoms}`,
    family: "dienes",
    reactionType: "pericyclic",
    title: "Intramolecular Diels–Alder Cyclization",
    reagents: "heat",
    reagentNote: "The tethered diene and dienophile react within the same molecule",
    productHint: "Bicyclic cyclohexene derivative",
    explanation:
      "A substrate containing both a conjugated diene and a tethered alkene can close on itself in a concerted intramolecular [4+2] cycloaddition; no second reactant is required.",
    trigger: intramolecularDielsAlderTrigger(tetherAtoms),
    transform: {
      // IMDA now uses the same canonical pericyclic engine as every other
      // Diels-Alder reaction. The handler receives explicit intramolecular
      // topology metadata, so there is only one implementation of the bond
      // reorganization to keep in sync.
      type: "customHandler",
      handler: "pericyclic",
      options: {
        mode: "dielsAlder",
        intramolecular: true,
        tetherAtoms,
        maxProducts: 8,
      },
    },
    productStatus: "representative",
    display: { renderer: "heavy-atom-stereo" },
    mechanism: "Pericyclic intramolecular [4+2] cycloaddition",
    mechanismProfile: {
      family: "pericyclic-4+2",
      steps: [
        {
          type: "cycloaddition",
          label: "Concerted intramolecular suprafacial [4+2] bond reorganization",
          concerted: true,
          stereochemicalConsequence: "suprafacial",
        },
      ],
    },
    selectivityProfile: {
      stereochemistry: {
        mode: "suprafacial",
        stereospecific: true,
        attackMode: "concerted",
      },
      mixture: "expected",
    },
    competition: { group: "diels-alder-topology", specificity: 200 },
    selectivity: [
      "The reacting diene and dienophile are part of the same connected molecule.",
      "The tether length determines the bicyclic framework; this rule family covers one- through five-atom tethers without substrate-specific cases.",
    ],
    priority: 690 + tetherAtoms,
  }),
);

/**
 * HX addition must be classified by the MAXIMAL conjugated pi system.
 * A triene/tetraene must never fall through to a local diene 1,4 rule because
 * that changes the remote capture atom and produces the wrong constitution.
 */
const isolatedDieneHxTrigger = {
  includeSmarts: [conjugatedPolyeneSmarts(2)],
  excludeSmarts: [conjugatedPolyeneSmarts(3)],
};

function exactConjugatedPolyeneTrigger(doubleBondCount: number) {
  const trigger: {
    includeSmarts: string[];
    excludeSmarts?: string[];
  } = {
    includeSmarts: [conjugatedPolyeneSmarts(doubleBondCount)],
  };

  // The current handler supports up to six conjugated double bonds. Excluding
  // the next-longer pattern makes every rule describe one maximal pi system,
  // rather than an arbitrary overlapping sub-window.
  if (doubleBondCount < 6) {
    trigger.excludeSmarts = [conjugatedPolyeneSmarts(doubleBondCount + 1)];
  }

  return trigger;
}

const DIENE_HX = HYDROHALOGENS;



const POLYENE_NAMES: Record<number, string> = {
  3: "Triene",
  4: "Tetraene",
  5: "Pentaene",
  6: "Hexaene",
};

/**
 * Extended conjugation is generated from one factory for 3-6 C=C systems.
 * Remote capture is 1,(2n) addition: triene -> 1,6, tetraene -> 1,8, etc.
 * This prevents future local-diene hotfixes as longer conjugated systems are
 * introduced.
 */
const extendedPolyeneHydrohalogenationRules: ReactionRule[] = [3, 4, 5, 6].flatMap(
  (doubleBondCount) =>
    DIENE_HX.flatMap(({ acidSlug, acid, symbol }, index) => {
      const remoteLocant = 2 * doubleBondCount;
      const polyeneName = POLYENE_NAMES[doubleBondCount] ?? "Polyene";
      const trigger = exactConjugatedPolyeneTrigger(doubleBondCount);
      const specificity = 100 + doubleBondCount * 20;

      return [
        {
          id: `polyene-${doubleBondCount}-hx-1-2-${acidSlug}`,
          family: "dienes",
          reactionType: "addition",
          title: `Electrophilic Addition to a Conjugated ${polyeneName}: 1,2 Product`,
          reagents: `1 equiv ${acid}, ${CONJUGATED_DIENE_HX_TEMPERATURE_GUIDE.kineticCondition}`,
          reagentNote: "Kinetic adjacent capture",
          productHint: "1,2-hydrohalogenation product",
          explanation:
            `Protonation of the maximal conjugated ${polyeneName.toLowerCase()} forms a delocalized carbocation. Fast adjacent halide capture gives the kinetic 1,2 product.`,
          trigger,
          transform: {
            type: "customHandler",
            handler: "addition",
            options: {
              mode: "polyeneHydrohalogenation",
              halogen: symbol,
              conjugatedDoubleBonds: doubleBondCount,
              capture: "adjacent",
            },
          },
          productStatus: "computed",
          mechanism: "Electrophilic addition through a delocalized polyallylic carbocation",
          selectivityProfile: {
            regiochemistry: { mode: "directed", regioselective: true },
            mixture: "single",
            allowsRearrangement: false,
          },
          competition: { group: "hx-addition-conjugation", specificity },
          selectivity: [
            "The maximal conjugated pi system is selected before any local diene window.",
            "Kinetic capture occurs adjacent to the initially favored carbocation center.",
          ],
          priority: 90 + doubleBondCount * 10 + index * 2,
        },
        {
          id: `polyene-${doubleBondCount}-hx-1-${remoteLocant}-${acidSlug}`,
          family: "dienes",
          reactionType: "addition",
          title: `Electrophilic Addition to a Conjugated ${polyeneName}: 1,${remoteLocant} Product`,
          reagents: `1 equiv ${acid}, ${CONJUGATED_DIENE_HX_TEMPERATURE_GUIDE.thermodynamicCondition}`,
          reagentNote: `Thermodynamic remote (1,${remoteLocant}) addition`,
          productHint: `1,${remoteLocant}-hydrohalogenation product`,
          explanation:
            `The delocalized polyallylic carbocation can place positive charge at the remote terminus of the maximal conjugated ${polyeneName.toLowerCase()}. Under thermodynamic-control conditions, remote halide capture gives the 1,${remoteLocant} product while retaining the most stable remaining pi system.`,
          trigger,
          transform: {
            type: "customHandler",
            handler: "addition",
            options: {
              mode: "polyeneHydrohalogenation",
              halogen: symbol,
              conjugatedDoubleBonds: doubleBondCount,
              capture: "remote",
            },
          },
          productStatus: "computed",
          mechanism: "Electrophilic addition through a delocalized polyallylic carbocation",
          selectivityProfile: {
            regiochemistry: { mode: "directed", regioselective: true },
            mixture: "single",
            allowsRearrangement: false,
          },
          competition: { group: "hx-addition-conjugation", specificity },
          selectivity: [
            `The full ${2 * doubleBondCount}-carbon conjugated path is treated as one pi system.`,
            "Thermodynamic remote capture is ranked by retained conjugation and alkene stability.",
            "A longer conjugated system cannot fall through to an overlapping local diene 1,4 rule.",
          ],
          priority: 91 + doubleBondCount * 10 + index * 2,
        },
      ] satisfies ReactionRule[];
    }),
);

const dieneHydrohalogenationRules: ReactionRule[] = DIENE_HX.flatMap(
  ({ acidSlug, acid, symbol }, index) => [
    {
      id: `diene-hx-1-2-${acidSlug}`,
      family: "dienes",
      reactionType: "addition",
      title: "Electrophilic Addition to a Diene: 1,2 Product",
      reagents: `1 equiv ${acid}, ${CONJUGATED_DIENE_HX_TEMPERATURE_GUIDE.kineticCondition}`,
      reagentNote: "Kinetic 1,2-addition",
      productHint: "1,2-hydrohalogenation product",
      explanation:
        "Protonation forms an allylic carbocation. Fast halide capture at the adjacent allylic position gives the kinetic 1,2-addition product.",
      trigger: isolatedDieneHxTrigger,
      transform: {
        type: "customHandler",
        handler: "addition",
        options: {
          mode: "dieneHydrohalogenation",
          halogen: symbol,
          additionPattern: "1,2",
        },
      },
      productStatus: "representative",
      mechanism: "Electrophilic addition through an allylic carbocation",
      selectivityProfile: {
        regiochemistry: { mode: "directed", regioselective: true },
        mixture: "single",
        allowsRearrangement: false,
      },
      competition: { group: "hx-addition-conjugation", specificity: 100 },
      selectivity: [
        "Kinetic 1,2 product",
        CONJUGATED_DIENE_HX_TEMPERATURE_GUIDE.kineticNote,
        "PocketChem ranks the allylic-cation orientations and then resolves overlapping diene embeddings by whole-system conjugation scoring, so extended or fused π systems are not decided by the first local SMARTS match.",
      ],
      priority: 106 + index * 2,
    },
    {
      id: `diene-hx-1-4-${acidSlug}`,
      family: "dienes",
      reactionType: "addition",
      title: "Electrophilic Addition to a Diene: 1,4 Product",
      reagents: `1 equiv ${acid}, ${CONJUGATED_DIENE_HX_TEMPERATURE_GUIDE.thermodynamicCondition}`,
      reagentNote: "Thermodynamic 1,4-addition",
      productHint: "1,4-hydrohalogenation product",
      explanation:
        "The allylic carbocation is resonance-delocalized. At higher temperature the reversible addition can equilibrate toward remote halide capture and the thermodynamically favored 1,4-addition alkene.",
      trigger: isolatedDieneHxTrigger,
      transform: {
        type: "customHandler",
        handler: "addition",
        options: {
          mode: "dieneHydrohalogenation",
          halogen: symbol,
          additionPattern: "1,4",
        },
      },
      productStatus: "representative",
      mechanism: "Electrophilic addition through an allylic carbocation",
      selectivityProfile: {
        regiochemistry: { mode: "directed", regioselective: true },
        mixture: "single",
        allowsRearrangement: false,
      },
      competition: { group: "hx-addition-conjugation", specificity: 100 },
      selectivity: [
        "Thermodynamic 1,4 product",
        CONJUGATED_DIENE_HX_TEMPERATURE_GUIDE.thermodynamicNote,
        "The major product is ranked by the remaining conjugated π system, alkene stability, and the allylic-cation pathway; lower-ranked formal regioisomers from overlapping diene embeddings are not displayed.",
        "One equivalent adds one HX across the conjugated diene rather than saturating both double bonds.",
      ],
      priority: 107 + index * 2,
    },
  ],
);

export const dieneReactionRules: ReactionRule[] = [
  ...extendedPolyeneHydrohalogenationRules,
  ...dieneHydrohalogenationRules,
  ...intramolecularDielsAlderRules,
  {
    id: "diene-diels-alder",
    family: "dienes",
    reactionType: "pericyclic",
    title: "Diels–Alder Cycloaddition",
    reagents: "heat",
    reagentNote: "Draw the conjugated diene and dienophile as disconnected structures",
    productHint: "Cyclohexene derivative",
    explanation:
      "A conjugated diene in the s-cis conformation reacts with a dienophile in one concerted step to form a six-membered ring.",
    trigger: anyConjugatedDieneTrigger,
    additionalReactants: [
      {
        label: "dienophile",
        trigger: {
          includeSmarts: ["[C,c]=[C,c]"],
          excludeSmarts: ["[C,c]=[C,c]-[C,c]=[C,c]"],
        },
      },
    ],
    transform: {
      type: "customHandler",
      handler: "pericyclic",
      options: {
        mode: "dielsAlder",
        maxProducts: 8,
      },
    },
    productStatus: "representative",
    display: { renderer: "diels-alder-bicyclic", preserveReactantOrientation: true },
    selectivityProfile: {
      // With achiral starting materials, attack on the two enantiotopic faces
      // gives a racemate. Both members remain stored for chemical identity,
      // while ReactionsPage draws one representative enantiomer and labels the
      // outcome racemic instead of presenting the mirror image as an "OR".
      stereochemistry: {
        mode: "suprafacial",
        stereospecific: true,
        attackMode: "concerted",
      },
      mixture: "expected",
    },
    mechanism: "Pericyclic [4+2] cycloaddition",
    mechanismProfile: {
      family: "pericyclic-4+2",
      steps: [
        {
          type: "cycloaddition",
          label: "Concerted suprafacial [4+2] bond reorganization",
          concerted: true,
          stereochemicalConsequence: "suprafacial",
        },
      ],
    },
    selectivity: [
      "Stereospecific: a Z dienophile retains a cis substituent relationship and an E dienophile retains a trans relationship",
      "When facial attack gives an enantiomeric pair, PocketChem stores both members but displays one representative structure labeled as a racemate",
      "Endo approach is often favored kinetically for electron-withdrawing dienophile substituents",
      "A cyclic diene keeps its pre-existing ring path. For cyclohexa-1,3-diene this creates a bicyclo[2.2.2] framework; the Diels–Alder ring does not replace or open the original ring.",
    ],
    limitations: [
      "The diene must be able to adopt an s-cis conformation.",
      "PocketChem propagates dienophile E/Z stereochemistry and, when both terminal diene double bonds are stereodefined, assigns the diene-derived product centers for H1/H1 termini and the common H0 methyl/non-methyl carbon-substituted terminus class. Unsupported highly substituted patterns fall back to constitution rather than inventing R/S labels.",
      "Full endo/exo facial ranking for every unsymmetrical or multiply substituted diene/dienophile remains a separate selectivity problem.",
    ],
    competition: { group: "diels-alder-topology", specificity: 100 },
    priority: 700,
  },
  {
    id: "diene-diels-alder-alkyne",
    family: "dienes",
    reactionType: "pericyclic",
    title: "Diels–Alder Cycloaddition with an Alkyne",
    reagents: "heat",
    reagentNote: "Draw the conjugated diene and alkyne dienophile as disconnected structures",
    productHint: "Cyclohexadiene derivative",
    explanation:
      "A conjugated diene can undergo a concerted [4+2] cycloaddition with an alkyne dienophile, leaving a second double bond in the six-membered product.",
    trigger: anyConjugatedDieneTrigger,
    additionalReactants: [
      { label: "alkyne dienophile", trigger: { includeSmarts: ["[C]#[C]"] } },
    ],
    transform: {
      type: "customHandler",
      handler: "pericyclic",
      options: {
        mode: "dielsAlder",
        dienophileBond: "alkyne",
        maxProducts: 12,
      },
    },
    mechanism: "Pericyclic [4+2] cycloaddition",
    mechanismProfile: {
      family: "pericyclic-4+2",
      steps: [
        {
          type: "cycloaddition",
          label: "Concerted suprafacial [4+2] bond reorganization",
          concerted: true,
          stereochemicalConsequence: "suprafacial",
        },
      ],
    },
    selectivityProfile: {
      stereochemistry: {
        mode: "suprafacial",
        stereospecific: true,
        attackMode: "concerted",
      },
      mixture: "expected",
    },
    selectivity: [
      "Stereospecific and suprafacial on the diene: defined terminal-diene E/Z relationships are transferred to newly formed tetrahedral centers",
      "An alkyne dienophile remains a C=C bond in the cyclohexadiene product",
      "When facial attack gives an enantiomeric pair, PocketChem stores both members but displays one representative racemate member",
    ],
    productStatus: "representative",
    display: { renderer: "diels-alder-bicyclic", preserveReactantOrientation: true },
    limitations: [
      "The diene must be able to adopt an s-cis conformation.",
      "PocketChem assigns diene-derived stereochemistry for defined H1/H1 termini and for the common H0 methyl/non-methyl carbon-substituted terminus class; more exotic fully substituted termini fall back to constitution rather than inventing R/S.",
    ],
    competition: { group: "diels-alder-topology", specificity: 100 },
    priority: 702,
  },
  {
    id: "diene-polymerization",
    family: "dienes",
    reactionType: "addition",
    title: "Conjugated Diene Polymerization",
    reagents: "Radical, cationic, anionic, or coordination initiator",
    reagentNote: "Chain-growth polymerization",
    productHint: "Polyene polymer",
    explanation:
      "Conjugated dienes can polymerize by 1,2- or 1,4-addition pathways, producing polymers with different alkene placement and stereochemistry.",
    trigger: anyConjugatedDieneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Polymer repeat units and chain length require a polymer-specific representation rather than a finite small-molecule product.",
    },
    mechanism: "Chain-growth polymerization",
    priority: 730,
  },
  {
    id: "claisen-aromatic-rearrangement",
    family: "dienes",
    reactionType: "pericyclic",
    title: "Aromatic Claisen Rearrangement",
    reagents: "heat (about 200 °C)",
    reagentNote: "Thermal [3,3]-sigmatropic shift of an allyl aryl ether",
    productHint: "Ortho-allylphenol",
    explanation:
      "On heating, an allyl aryl ether undergoes a concerted [3,3]-sigmatropic shift: the allyl group migrates from oxygen to the ortho ring carbon with allylic inversion, and tautomerisation of the dienone restores the aromatic phenol.",
    trigger: { includeSmarts: ["[c][OX2][CH2][CH]=[CH2]"] },
    transform: {
      type: "reactionSmarts",
      smarts: "[O:3]([c:1]:[cH:2])[CH2:4][CH:5]=[CH2:6]>>[OH:3][c:1]:[c:2][CH2:6][CH:5]=[CH2:4]",
      maxProducts: 4,
    },
    productStatus: "representative",
    mechanism: "Concerted [3,3]-sigmatropic (Claisen) rearrangement",
    selectivity: [
      "The allyl group bonds to an ortho carbon through its far terminus (allylic inversion). If both ortho positions are free the two products are identical by symmetry; if both are blocked a para (Cope-Claisen) product is possible and is not modeled.",
      "Alkyl substitution on the allyl unit and ring-substituent effects on the ortho:ortho' ratio are not modeled.",
    ],
    limitations: ["Only the unsubstituted-allyl (O-CH2-CH=CH2) case is covered; the chair-transition-state alkene geometry is not predicted."],
    priority: 735,
  },
  {
    id: "cope-rearrangement",
    family: "dienes",
    reactionType: "pericyclic",
    title: "Cope Rearrangement",
    reagents: "heat (about 300 °C)",
    reagentNote: "Thermal [3,3]-sigmatropic shift of a 1,5-diene",
    productHint: "Isomeric 1,5-diene",
    explanation:
      "A 1,5-hexadiene undergoes a concerted [3,3]-sigmatropic shift: the C3-C4 sigma bond breaks while a C1-C6 sigma bond forms and both pi bonds move. The reaction is reversible and the equilibrium favors the thermodynamically more stable (usually more substituted or conjugated) diene.",
    trigger: { includeSmarts: ["[C;!a]=[C;!a]-[C;!a;X4]-[C;!a;X4]-[C;!a]=[C;!a]"] },
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]-[C;X4:3]-[C;X4:4]-[C:5]=[C:6]>>[C:3]=[C:2]-[C:1]-[C:6]-[C:5]=[C:4]",
      maxProducts: 6,
    },
    productStatus: "representative",
    mechanism: "Concerted [3,3]-sigmatropic (Cope) rearrangement",
    selectivity: [
      "Reversible: the product listed is one side of an equilibrium, and the direction is set by the relative stability of the two dienes. For example 3-methylhexa-1,5-diene gives hepta-1,5-diene because the product has an internal, more substituted double bond.",
    ],
    limitations: ["The relative stabilities of the two dienes are not computed, so the equilibrium direction is not ranked; E/Z geometry of the new alkene is not predicted (chair transition states usually favor E)."],
    priority: 736,
  },
];
