import type { ReactionRule } from "../reactionTypes";
import { GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS } from "../organometallic";
import { HYDROHALOGENS } from "../profiles/halogens";

const epoxideTrigger = {
  anyFunctionalGroups: ["Epoxide"],
};

const epoxideHxRules: ReactionRule[] = HYDROHALOGENS.map(
  ({ acidSlug, acid, symbol, anionName }, index) => ({
  id: `epoxide-hx-opening-${acidSlug}`,
  family: "epoxides",
  reactionType: "ringOpening",
  title: `Epoxide Opening with ${acid}`,
  reagents: acid,
  reagentNote: "Acidic halohydrin formation",
  productHint: `${symbol}-substituted alcohol`,
  explanation:
    `${acid} protonates the epoxide and ${anionName} opens it from the back side, so the halogen and the oxygen-derived OH are anti. When exactly one epoxide carbon can carry positive charge (tertiary, benzylic or allylic) the halide attacks it (SN1-like); when neither can, it attacks the less substituted carbon (SN2-like); when both can, both regioisomers are listed and neither is preferred.`,
  trigger: epoxideTrigger,
  transform: {
    type: "customHandler",
    handler: "ring",
    options: {
      mode: "epoxideNucleophileOpening",
      nucleophile: "halide",
      attackPreference: "cation-stabilized-else-less-substituted",
      halogen: symbol,
    },
  },
  productStatus: "computed",
  selectivityProfile: {
    stereochemistry: { mode: "anti-addition", relativeRelationship: "anti", attackMode: "backside", stereospecific: true },
    regiochemistry: { mode: "directed", regioselective: true },
    mixture: "expected",
    allowsRearrangement: false,
  },
  selectivity: [
    "A tertiary epoxide carbon is attacked by the halide; otherwise the halide attacks the less substituted carbon (LibreTexts, Wade 15.08 and Nassau 8.14). A benzylic or allylic carbon stabilizes positive charge like a tertiary one and is treated the same way (Parker and Isaacs, Chem. Rev. 1959, 59, 737, for aryl epoxides; not re-read in this stage, so the benzylic and allylic extension is a mechanistic generalisation rather than a quoted rule). This differs from acid-catalysed opening by water or an alcohol, where the more substituted carbon is favoured.",
    "Attack is backside/anti relative to the epoxide oxygen bond being broken.",
  ],
  priority: 840 + index,
}));

export const epoxideReactionRules: ReactionRule[] = [
  {
    id: "epoxide-acid-water-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Acid-Catalyzed Epoxide Opening with Water",
    reagents: "H₃O⁺, H₂O",
    reagentNote: "Anti opening; attack is more substituted",
    productHint: "Trans diol",
    explanation:
      "Under acidic conditions, water opens a protonated epoxide by backside attack, with greater attack at the more substituted carbon. Both carbons become alcohols.",
    trigger: epoxideTrigger,
    transform: {
      type: "customHandler",
      handler: "ring",
      options: {
        mode: "epoxideOpening",
        nucleophile: "water",
        attackPreference: "more-substituted",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "anti-addition", relativeRelationship: "anti", attackMode: "backside", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    priority: 800,
  },
  {
    id: "epoxide-base-hydroxide-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Base-Catalyzed Epoxide Opening with Hydroxide",
    reagents: "1) NaOH or KOH  2) H₂O",
    reagentNote: "SN2 opening; attack is less substituted",
    productHint: "Trans diol",
    explanation:
      "Under basic conditions, hydroxide opens an epoxide by SN2 attack at the less substituted carbon, followed by protonation.",
    trigger: epoxideTrigger,
    transform: {
      type: "customHandler",
      handler: "ring",
      options: {
        mode: "epoxideOpening",
        nucleophile: "hydroxide",
        attackPreference: "less-substituted",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "anti-addition", relativeRelationship: "anti", attackMode: "backside", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    priority: 810,
  },
  {
    id: "epoxide-acid-alcohol-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Acid-Catalyzed Epoxide Opening with Alcohol",
    reagents: "ROH, H⁺",
    reagentNote: "Anti opening; OR attacks the carbon that best carries positive charge (both regioisomers kept when neither does)",
    productHint: "Alkoxy alcohol",
    explanation:
      "An alcohol opens a protonated epoxide. The supplied OR group attacks the epoxide carbon that better carries positive charge (tertiary, benzylic or allylic); when neither does, both regioisomers are given because the opening has mixed SN1/SN2 character. The original epoxide oxygen becomes OH.",
    trigger: epoxideTrigger,
    additionalReactants: [
      { label: "alcohol", trigger: { includeSmarts: ["[O;H1][#6]"] } },
    ],
    transform: {
      type: "customHandler",
      handler: "ring",
      options: {
        mode: "epoxideNucleophileOpening",
        nucleophile: "alcohol",
        attackPreference: "cation-stabilized-else-both",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "anti-addition", relativeRelationship: "anti", attackMode: "backside", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    priority: 820,
  },
  {
    id: "epoxide-base-alkoxide-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Base-Catalyzed Epoxide Opening with Alkoxide",
    reagents: "1) RO⁻  2) H₃O⁺",
    reagentNote: "SN2 opening; OR attacks less substituted carbon",
    productHint: "Alkoxy alcohol",
    explanation:
      "Alkoxide opens the epoxide by SN2 attack at the less substituted carbon. Acidic workup protonates the original epoxide oxygen.",
    trigger: epoxideTrigger,
    additionalReactants: [
      { label: "alkoxide ion", trigger: { includeSmarts: ["[O-][#6]"] } },
    ],
    transform: {
      type: "customHandler",
      handler: "ring",
      options: {
        mode: "epoxideNucleophileOpening",
        nucleophile: "alkoxide",
        attackPreference: "less-substituted",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "anti-addition", relativeRelationship: "anti", attackMode: "backside", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    priority: 830,
  },
  ...epoxideHxRules,
  {
    id: "epoxide-grignard-opening",
    conditions: { organometallic: true, anhydrous: true },
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Epoxide Opening with Grignard/Organolithium Reagent",
    reagents: "1) RMgCl, RMgBr, RMgI, or RLi  2) H₃O⁺",
    reagentNote: "C–C bond formation at less substituted carbon",
    productHint: "Alcohol",
    explanation:
      "Grignard and organolithium reagents open epoxides by SN2 attack at the less substituted carbon, then acidic workup gives the alcohol.",
    trigger: epoxideTrigger,
    additionalReactants: [
      {
        label: "Grignard or organolithium reagent",
        trigger: { includeSmarts: [GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS] },
      },
    ],
    transform: {
      type: "customHandler",
      handler: "ring",
      options: { mode: "epoxideOrganometallicOpening" },
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", attackMode: "backside", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    selectivity: [
      "Attack occurs at the less substituted epoxide carbon.",
      "Opening is SN2-like and inverts the attacked carbon when its stereochemistry is defined.",
    ],
    priority: 850,
  },
  {
    id: "epoxide-amine-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Epoxide Opening with an Amine",
    reagents: "primary or secondary amine; then proton transfer/workup",
    reagentNote: "SN2-like attack at less substituted carbon",
    productHint: "Beta-amino alcohol",
    explanation:
      "Primary and secondary amines open epoxides at the less hindered carbon to form beta-amino alcohols.",
    trigger: epoxideTrigger,
    additionalReactants: [
      { label: "primary or secondary amine", trigger: { includeSmarts: ["[N;H1,H2;+0;!$(N[C,S,P]=O)]"] } },
    ],
    transform: {
      type: "customHandler",
      handler: "ring",
      options: {
        mode: "epoxideNucleophileOpening",
        nucleophile: "amine",
        attackPreference: "less-substituted",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", attackMode: "backside", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    priority: 855,
  },
  {
    id: "epoxide-ammonia-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Epoxide Opening with Ammonia",
    reagents: "NH₃",
    reagentNote: "SN2-like attack at less substituted carbon",
    productHint: "Amino alcohol",
    explanation:
      "Ammonia opens an epoxide at the less substituted carbon to form an amino alcohol after proton transfer.",
    trigger: epoxideTrigger,
    transform: {
      type: "customHandler",
      handler: "ring",
      options: {
        mode: "epoxideNucleophileOpening",
        nucleophile: "ammonia",
        attackPreference: "less-substituted",
      },
    },
    productStatus: "computed",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", attackMode: "backside", stereospecific: true },
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "expected",
      allowsRearrangement: false,
    },
    priority: 860,
  },
];
