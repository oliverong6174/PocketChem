import type { ReactionRule } from "../reactionTypes";
import { activeMethyleneRules } from "./activeMethylene9m";

/**
 * Stage 9M reaction-family expansion.
 *
 * Every rule here is an ordinary ReactionRule executed by the existing reaction-SMARTS engine
 * (no new handler). Scope is enforced in the trigger and in the SMARTS, never in prose only.
 * Literature support is listed in scripts/benchmarks/stage9m/REFERENCES.md; the citations were
 * recalled, not re-read in this stage, and the products are PocketChem's structural model of the
 * reaction, not experimentally validated predictions.
 */

// ---------------------------------------------------------------------------------------------
// Wacker–Tsuji oxidation (terminal alkene -> methyl ketone)
// ---------------------------------------------------------------------------------------------

const wackerAlkene =
  "[CH2]=[CH;!$([CH]-[CX3]=[O,N,S]);!$([CH]-C#N);!$([CH]-[N+](=O)[O-]);!$([CH]-[C]=[C]);!$([CH]-[O,N,S,P,Si])]-[#6]";

const wackerRule: ReactionRule = {
  id: "wacker-tsuji-oxidation",
  conditions: { oxidant: "mild", reactionCentre: ["alkene", "ketone"] },
  family: "alkenes",
  reactionType: "oxidation",
  reactionClass: "palladium-catalyzed alkene oxidation",
  title: "Wacker–Tsuji Oxidation",
  reagents: "cat. PdCl₂, CuCl or CuCl₂ (re-oxidant), O₂, H₂O/DMF",
  reagentAtomSources: ["O", "H"],
  reagentNote: "Terminal alkene to methyl ketone; water and O₂ supply the new carbonyl oxygen",
  productHint: "Methyl ketone (Markovnikov oxidation)",
  explanation:
    "Pd(II) activates a terminal alkene toward attack by water at the internal (more substituted) carbon; β-hydride elimination and tautomerization give the methyl ketone, and Cu/O₂ re-oxidizes Pd(0) to Pd(II).",
  trigger: { includeSmarts: [wackerAlkene] },
  transform: {
    type: "reactionSmarts",
    smarts: `[CH2:1]=[CH;!$([CH]-[CX3]=[O,N,S]);!$([CH]-C#N);!$([CH]-[N+](=O)[O-]);!$([CH]-[C]=[C]);!$([CH]-[O,N,S,P,Si]):2]-[#6:3]>>[CH3:1][C:2](=O)[#6:3]`,
    maxProducts: 6,
  },
  mechanism: "Pd(II) oxypalladation (Markovnikov), β-hydride elimination, Pd(0) re-oxidation",
  selectivityProfile: {
    regiochemistry: { mode: "markovnikov", regioselective: true },
    sitePreference: "least-substituted-alkene",
    mixture: "single",
  },
  selectivity: [
    "Water attacks the internal carbon of a monosubstituted alkene: methyl ketone.",
    "Only monosubstituted (terminal) alkyl- or aryl-substituted alkenes are modeled.",
  ],
  productPreferences: [
    {
      id: "wacker-methyl-ketone",
      whenReactantSmarts: [wackerAlkene],
      productSmarts: "[CH3][CX3](=O)[#6]",
      level: "major",
      basis:
        "Terminal monosubstituted alkenes without a coordinating heteroatom at the allylic position are oxidized to the methyl ketone under Tsuji's PdCl₂/CuCl/O₂ conditions; the anti-Markovnikov aldehyde is a minor by-product that needs special ligand/co-catalyst systems to dominate.",
      references: [
        "Tsuji, J. Synthesis 1984, 369-384 (citation recalled; not re-read in this stage).",
        "Smidt, J. et al. Angew. Chem. 1959, 71, 176-182 (citation recalled; not re-read in this stage).",
      ],
    },
  ],
  limitations: [
    "Internal (1,2-disubstituted), cyclic, conjugated (enone, diene, vinyl-heteroatom) and electron-poor alkenes are excluded: they need different conditions or give regioisomer mixtures.",
    "The anti-Markovnikov aldehyde (a minor pathway for some substrates, e.g. allylic/homoallylic heteroatoms) is not generated.",
    "Other alkenes in the same molecule may also be oxidized; each terminal alkene is enumerated separately and not ranked.",
    "Chloride-dependent side reactions (chlorohydrin, alkene isomerization) and catalyst loading are not modeled.",
  ],
  productStatus: "representative",
  planningCost: 100,
  retrosynthesis: { tier: "standard", group: "methyl-ketone-from-alkene" },
  priority: 1330,
};

// ---------------------------------------------------------------------------------------------
// Ring-closing metathesis (terminal α,ω-diene -> cycloalkene + ethylene)
// ---------------------------------------------------------------------------------------------

const rcmSizes = [
  { ringSize: 5, planningCost: 38, tier: "preferred" as const },
  { ringSize: 6, planningCost: 40, tier: "preferred" as const },
  { ringSize: 7, planningCost: 62, tier: "standard" as const },
  { ringSize: 8, planningCost: 85, tier: "secondary" as const },
];

const rcmRules: ReactionRule[] = rcmSizes.map(({ ringSize, planningCost, tier }) => {
  const tetherLength = ringSize - 2;
  const tetherAtoms = Array.from({ length: tetherLength }, (_, index) => {
    // Tether atoms next to the alkene must not be sp2 alkene carbons (that would be a conjugated diene).
    const edge = index === 0 || index === tetherLength - 1;
    return edge ? `[*;!$(*=[#6;!a]);!$(*#*):${index + 2}]` : `[*:${index + 2}]`;
  });
  const reactant = `[CH2;D1]=[CH:1]${tetherAtoms.join("")}[CH:${tetherLength + 2}]=[CH2;D1]`;
  const last = tetherLength + 2;
  const closing = Array.from({ length: tetherLength }, (_, index) => `[*:${last - 1 - index}]`).join("");
  // Ring: C1=C(last), then the tether atoms from the far end back to atom 2, closed onto C1.
  const product = `[CH:1]1=[CH:${last}]${closing}1`;
  return {
    id: `ring-closing-metathesis-${ringSize}`,
    conditions: { reactionCentre: ["alkene"] },
    family: "alkenes",
    reactionType: "cyclization",
    reactionClass: "olefin metathesis",
    title: "Ring-Closing Metathesis",
    reagents: "Grubbs I/II or Hoveyda–Grubbs Ru catalyst, CH₂Cl₂ or toluene, dilute",
    reagentAtomSources: [],
    reagentNote: `${ringSize}-membered ring closure of a terminal α,ω-diene; ethylene is released`,
    productHint: `${ringSize}-membered cycloalkene`,
    explanation:
      "A ruthenium alkylidene exchanges alkylidene fragments between the two terminal alkenes of one molecule. The new internal C=C closes the ring and volatile ethylene is lost, which drives the equilibrium.",
    trigger: {
      includeSmarts: [reactant.replace(/:\d+\]/g, "]")],
    },
    transform: {
      type: "reactionSmarts",
      smarts: `${reactant}>>${product}`,
      maxProducts: 8,
    },
    mechanism: "Chauvin metallacyclobutane [2+2]/retro-[2+2] metathesis",
    selectivityProfile: { mixture: "single" },
    selectivity: [
      ringSize <= 7
        ? "Only the cis (Z) ring alkene is geometrically possible in a ring of this size."
        : "Eight-membered ring closure is possible but slower; the ring alkene is expected cis (Z) and no geometry is assigned.",
      "Stereocentres in the tether are carried through unchanged.",
    ],
    limitations: [
      "Only terminal (monosubstituted) alkene pairs separated by a tether of 3–6 atoms are modeled; internal alkenes, medium/large rings (9+), macrocycles and trisubstituted ring alkenes are not.",
      "Free amines, thiols and phosphines can poison Ru catalysts; competing oligomerization (ADMET) and alkene isomerization are not modeled.",
      "A substrate with more than two terminal alkenes yields every pairwise ring, unranked.",
    ],
    productStatus: "computed",
    planningCost,
    retrosynthesis: { tier, group: "ring-closing-metathesis" },
    priority: 1340 + ringSize,
  } satisfies ReactionRule;
});

// ---------------------------------------------------------------------------------------------
// Mitsunobu substitution (alcohol + acidic pronucleophile, inversion at a stereogenic carbinol)
// ---------------------------------------------------------------------------------------------

const pronucleophileSmarts = "[O,N;$([OX2H1]C=O),$([OX2H1]c),$([NX3H1](C=O)C=O)]";
const pronucleophile = {
  label: "acidic pronucleophile (carboxylic acid, phenol or imide N–H)",
  trigger: { includeSmarts: [pronucleophileSmarts] },
  role: "nucleophile" as const,
};

const mitsunobuCommon = {
  conditions: { reactionCentre: ["alcohol", "carboxylic-acid", "phenol"] },
  family: "alcohols" as const,
  reactionType: "substitution" as const,
  reactionClass: "dehydrative substitution",
  reagents: "PPh₃, DEAD or DIAD, THF",
  reagentAtomSources: [] as string[],
  mechanism: "Betaine activation of the alcohol as an alkoxyphosphonium, then SN2 displacement by the conjugate base",
  limitations: [
    "The pronucleophile must be acidic enough (carboxylic acid, phenol, imide); weaker N–H/O–H/C–H acids are not modeled.",
    "Ph₃P=O and the reduced azodicarboxylate by-products are not tracked as products.",
    "Hindered, allylic or benzylic alcohols can give elimination, SN2′ or partial racemization; this is not modeled.",
    "Tertiary alcohols are excluded. A drawn hydroxy-acid is not treated as its own pronucleophile (no intramolecular lactonization).",
  ],
  productStatus: "computed" as const,
};

const mitsunobuRules: ReactionRule[] = [
  {
    ...mitsunobuCommon,
    id: "mitsunobu-secondary-inversion",
    title: "Mitsunobu Substitution (secondary alcohol, inversion)",
    reagentNote: "Draw the secondary alcohol and the acidic pronucleophile as separate structures",
    productHint: "Ester, aryl ether or N-alkyl imide with inverted configuration",
    explanation:
      "The alcohol oxygen is converted to a leaving group by PPh₃/azodicarboxylate and displaced from the back side by the conjugate base of the acidic pronucleophile: net SN2 inversion at a stereogenic carbinol carbon (the oxygen of the product comes from the pronucleophile).",
    trigger: {
      includeSmarts: ["[CX4;H1;!$(C(O)O);!$(C(O)N)]([#6])([#6])[OX2H1]"],
    },
    additionalReactants: [pronucleophile],
    transform: {
      type: "reactionSmarts",
      smarts:
        "[C@H:1]([#6:3])([#6:4])[OX2H1:2].[O,N;$([OX2H1]C=O),$([OX2H1]c),$([NX3H1](C=O)C=O):5]>>[C@@H:1]([#6:3])([#6:4])[*:5]",
      maxProducts: 6,
    },
    selectivityProfile: {
      stereochemistry: { mode: "inversion", attackMode: "backside", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["Backside SN2 displacement: inversion at a stereogenic carbinol carbon", "No carbocation rearrangement"],
    planningCost: 115,
    retrosynthesis: { tier: "standard", group: "mitsunobu" },
    priority: 520.5,
  },
  {
    ...mitsunobuCommon,
    id: "mitsunobu-primary",
    title: "Mitsunobu Substitution (primary alcohol)",
    reagentNote: "Draw the primary alcohol and the acidic pronucleophile as separate structures",
    productHint: "Ester, aryl ether or N-alkyl imide",
    explanation:
      "A primary alcohol is activated by PPh₃/azodicarboxylate and displaced by the conjugate base of an acidic pronucleophile. The carbinol carbon is not a stereocentre, so no inversion is observable.",
    trigger: {
      includeSmarts: ["[CX4;H2;!$(C(O)O);!$(C(O)N)]([#6])[OX2H1]"],
    },
    additionalReactants: [pronucleophile],
    transform: {
      type: "reactionSmarts",
      smarts: "[CH2:1]([#6:3])[OX2H1:2].[O,N;$([OX2H1]C=O),$([OX2H1]c),$([NX3H1](C=O)C=O):5]>>[CH2:1]([#6:3])[*:5]",
      maxProducts: 6,
    },
    selectivityProfile: { mixture: "single", allowsRearrangement: false },
    selectivity: ["SN2 at a primary carbon; no stereocentre is created or inverted"],
    planningCost: 115,
    retrosynthesis: { tier: "standard", group: "mitsunobu" },
    priority: 520.6,
  },
];

// ---------------------------------------------------------------------------------------------
// Benzilic acid rearrangement (1,2-diketone -> α-hydroxy acid)
// ---------------------------------------------------------------------------------------------

const noAlphaHydrogen = "[$([c]),$([CX4;H0])]";

const benzilicConditions = {
  conditions: { base: "mild" as const, reactionCentre: ["ketone", "carboxylic-acid", "alcohol"] },
  family: "ketones" as const,
  reactionType: "rearrangement" as const,
  reactionClass: "1,2-aryl/alkyl shift",
  reagents: "1) KOH or NaOH, H₂O/EtOH, heat  2) H₃O⁺",
  reagentAtomSources: ["O", "H"],
  mechanism: "Hydroxide adds to one carbonyl; a 1,2-shift of the attached group to the neighbouring carbonyl gives a carboxylate",
  productStatus: "computed" as const,
};

const benzilicRules: ReactionRule[] = [
  {
    ...benzilicConditions,
    id: "benzilic-acid-rearrangement",
    title: "Benzilic Acid Rearrangement",
    reagentNote: "Non-enolizable 1,2-diketone (diaryl or α,α-quaternary)",
    productHint: "α-Hydroxy carboxylic acid (e.g. benzilic acid from benzil)",
    explanation:
      "Hydroxide adds to one carbonyl of a 1,2-diketone; the group on that carbon migrates to the adjacent carbonyl, converting the diketone into a tertiary α-hydroxy carboxylate that is protonated on work-up.",
    trigger: {
      includeSmarts: [`${noAlphaHydrogen}[CX3](=O)[CX3](=O)${noAlphaHydrogen}`],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[$([c]),$([CX4;H0]):1][C:2](=[O:3])[C:4](=[O:5])[$([c]),$([CX4;H0]):6]>>[#6:1][C:4]([OH:5])([#6:6])[C:2](=[O:3])[OH]",
      maxProducts: 6,
    },
    selectivityProfile: {
      stereochemistry: { mode: "none" },
      mixture: "possible",
    },
    selectivity: [
      "For an unsymmetrical diketone either carbonyl can be attacked by hydroxide, so both migration outcomes are enumerated and neither is ranked.",
      "A product with two different groups on the new carbinol carbon is a stereocentre formed without facial control (racemic); no enantiomer is assigned.",
    ],
    limitations: [
      "Restricted to diketones whose substituent carbons carry no α-hydrogen (aryl or fully substituted carbon). Enolizable 1,2-diketones undergo competing aldol/enolate chemistry and are excluded.",
      "The benzilic ester variant (alkoxide instead of hydroxide) and migratory aptitude between different aryl groups are not modeled.",
    ],
    planningCost: 110,
    retrosynthesis: { tier: "secondary", group: "benzilic-acid" },
    priority: 1131,
  },
  {
    ...benzilicConditions,
    id: "benzilic-acid-ring-contraction",
    title: "Benzilic Acid Rearrangement (ring contraction)",
    reagentNote: "Cyclic 1,2-diketone (6- to 8-membered ring)",
    productHint: "1-Hydroxycycloalkanecarboxylic acid (5- to 7-membered ring) from a 6- to 8-membered diketone",
    explanation:
      "In a cyclic 1,2-diketone the ring carbon next to the attacked carbonyl migrates to the adjacent carbonyl. The attacked carbon leaves the ring as the carboxylate, so the ring contracts by one carbon and the former carbonyl carbon becomes a tertiary alcohol.",
    trigger: {
      includeSmarts: ["[#6;R]@[CX3;r6,r7,r8](=O)@[CX3;r6,r7,r8](=O)@[#6;R]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[#6;R:1]@[C;r6,r7,r8:2](=[O:3])@[C;r6,r7,r8:4](=[O:5])@[#6;R:6]>>[#6:1][C:4]([OH:5])([#6:6])[C:2](=[O:3])[OH]",
      maxProducts: 6,
    },
    selectivityProfile: { stereochemistry: { mode: "none" }, mixture: "possible" },
    selectivity: ["The ring contracts by one carbon; for an unsymmetrical ring diketone both carbonyls can be attacked and both outcomes are enumerated, unranked."],
    limitations: [
      "Cyclic diketones that can enolize (α-hydrogens) may instead undergo competing enolate chemistry; the rule does not weigh this, so the product is a structural model rather than a yield prediction.",
      "Ring-fusion and bridged diketones (e.g. camphorquinone) are matched structurally; strain effects on migration are not modeled.",
    ],
    planningCost: 112,
    retrosynthesis: { tier: "secondary", group: "benzilic-acid" },
    priority: 1132,
  },
];

// ---------------------------------------------------------------------------------------------
// Pinacol coupling (two carbonyls + one-electron reductant -> vicinal diol)
// ---------------------------------------------------------------------------------------------

const couplingCarbonyl =
  "[CX3;!$(C-[CX3]=[CX3]);!$(C-C#C);$([CH1](=O)[#6]),$([CX3](=O)([#6])[#6])]=O";

const pinacolCouplingRule: ReactionRule = {
  id: "pinacol-coupling",
  conditions: { reactionCentre: ["aldehyde", "ketone", "alcohol"] },
  family: "ketones",
  reactionType: "coupling",
  reactionClass: "reductive carbonyl coupling",
  title: "Pinacol Coupling",
  reagents: "Mg/TMSCl, SmI₂, Zn/TiCl₄ or Al-Hg (one-electron reductant), then H₂O",
  reagentAtomSources: ["H"],
  reagentNote: "Draw the two carbonyl compounds as separate structures (draw one twice for homocoupling)",
  productHint: "Vicinal diol (1,2-diol)",
  explanation:
    "Single-electron reduction of two carbonyl groups gives ketyl radical anions that dimerize at carbon. Protonation of the dimer gives a vicinal diol with a new C–C bond between the former carbonyl carbons.",
  trigger: { includeSmarts: [couplingCarbonyl] },
  additionalReactants: [
    {
      label: "second aldehyde or ketone",
      trigger: { includeSmarts: [couplingCarbonyl] },
      role: "electrophile" as const,
    },
  ],
  reactantRoleSymmetry: "unordered",
  transform: {
    type: "reactionSmarts",
    smarts: "[C:1]=[O:2].[C:3]=[O:4]>>[C:1]([OH:2])[C:3][OH:4]",
    maxProducts: 6,
  },
  mechanism: "Ketyl radical anion dimerization",
  selectivityProfile: { stereochemistry: { mode: "none" }, mixture: "possible" },
  selectivity: [
    "Two new stereocentres form; the dl (racemic) and meso diastereomers are both possible and no diastereomer ratio is assigned.",
    "Two different carbonyl compounds also give the two homocoupling diols (statistical mixture); only the crossed diol is generated here.",
  ],
  limitations: [
    "α,β-unsaturated carbonyls, esters, amides and acids are excluded; enones and strongly electron-poor carbonyls undergo competing reduction or conjugate pathways.",
    "Intramolecular (dialdehyde/diketone) pinacol coupling is not modeled.",
    "Over-reduction to the alcohol and the pinacol rearrangement of the product under acid are separate pathways.",
  ],
  productStatus: "representative",
  planningCost: 118,
  retrosynthesis: { tier: "secondary", group: "pinacol-coupling" },
  priority: 1133,
};

// ---------------------------------------------------------------------------------------------
// Ketonic decarboxylation (2 RCOOH -> ketone + CO2 + H2O)
// ---------------------------------------------------------------------------------------------

const ketonicRule: ReactionRule = {
  id: "ketonic-decarboxylation",
  conditions: { reactionCentre: ["carboxylic-acid", "ketone"] },
  family: "carboxylic-acids",
  reactionType: "condensation",
  reactionClass: "decarboxylative ketonization",
  title: "Ketonic Decarboxylation",
  reagents: "Heat (≈300–450 °C), metal oxide (CeO₂, MnO₂, ThO₂) or Ca/Ba carboxylate salt",
  reagentAtomSources: [],
  reagentNote: "Draw two carboxylic acids as separate structures (draw one twice for a symmetrical ketone)",
  productHint: "Ketone (loses CO₂ and H₂O)",
  explanation:
    "Two carboxylic acids (as their metal salts on a hot oxide surface) condense: one acid contributes its carbonyl carbon and the other loses CO₂, joining the two organic groups through a new carbonyl C–C bond.",
  trigger: { includeSmarts: ["[#6][CX3](=O)[OX2H1]"] },
  additionalReactants: [
    {
      label: "second carboxylic acid",
      trigger: { includeSmarts: ["[#6][CX3](=O)[OX2H1]"] },
      role: "electrophile" as const,
    },
  ],
  transform: {
    type: "reactionSmarts",
    smarts: "[#6:1][C:2](=[O:3])[OX2H1].[#6:4][C:5](=[O:6])[OX2H1]>>[#6:1][C:2](=[O:3])[#6:4]",
    maxProducts: 6,
  },
  mechanism: "Surface carboxylate coupling via a β-keto acid-type intermediate, then decarboxylation",
  selectivityProfile: { mixture: "possible" },
  selectivity: [
    "With two different acids both crossed ketones (each acid as acyl or as the decarboxylated partner) are enumerated, unranked.",
    "The symmetrical ketones from each acid alone are by-products that are not generated unless that acid is drawn twice.",
  ],
  limitations: [
    "Needs very high temperature; acid-, base- and heat-sensitive groups, stereocentres α to the carboxyl and most functional groups do not survive, and this is not assessed.",
    "Mechanism and α-hydrogen requirements are catalyst-dependent and not modeled; formic acid and dicarboxylic acids (which give cyclic ketones) are not covered.",
  ],
  productStatus: "representative",
  planningCost: 120,
  retrosynthesis: { tier: "secondary", group: "ketonic-decarboxylation" },
  priority: 1234,
};

// ---------------------------------------------------------------------------------------------
// Dieckmann condensation (intramolecular Claisen of 1,6/1,7-diesters)
// ---------------------------------------------------------------------------------------------

const dieckmannRules: ReactionRule[] = [
  { ringSize: 5, planningCost: 34, tier: "preferred" as const },
  { ringSize: 6, planningCost: 36, tier: "preferred" as const },
  { ringSize: 7, planningCost: 70, tier: "secondary" as const },
].map(({ ringSize, planningCost, tier }) => {
  const tetherLength = ringSize - 2;
  const tetherAtoms = (queried: boolean) =>
    Array.from({ length: tetherLength }, (_, index) => (queried ? `[*;!$(*=*):${index + 7}]` : `[*:${index + 7}]`)).join("");
  const reactant = `[CH2:1]([C:2](=[O:3])[O:4][#6:5])${tetherAtoms(true)}[C:6](=[O:20])[O:21][#6:22]`;
  const product = `[CH:1]1([C:2](=[O:3])[O:4][#6:5])${tetherAtoms(false)}[C:6]1=[O:20]`;
  return {
    id: `dieckmann-condensation-${ringSize}`,
    conditions: { base: "mild", anhydrous: true, reactionCentre: ["ester", "ketone"] },
    family: "enolates",
    reactionType: "cyclization",
    reactionClass: "intramolecular Claisen condensation",
    title: "Dieckmann Condensation",
    reagents: "1) NaOR (matching alkoxide), ROH or toluene  2) H₃O⁺",
    reagentAtomSources: [],
    reagentNote: `${ringSize}-membered cyclic β-keto ester from a diester`,
    productHint: `Cyclic ${ringSize}-membered β-keto ester`,
    explanation:
      "Alkoxide forms an ester enolate on one side of a diester; it attacks the other ester carbonyl intramolecularly and expels alkoxide. The cyclic β-keto ester is deprotonated under the reaction conditions, which drives the equilibrium, and is protonated on work-up.",
    trigger: { includeSmarts: [reactant.replace(/:\d+\]/g, "]")] },
    transform: {
      type: "reactionSmarts",
      smarts: `${reactant}>>${product}`,
      maxProducts: 8,
    },
    mechanism: "Intramolecular ester enolate acylation (Claisen) with alkoxide loss",
    selectivityProfile: { mixture: "possible" },
    selectivity: [
      ringSize <= 6
        ? "Five- and six-membered rings form best; the nucleophilic carbon must keep an α-hydrogen after cyclization."
        : "Seven-membered ring closure is possible but less favorable than five or six.",
      "An unsymmetrical diester with two enolizable α-carbons can close in either direction; both ring regioisomers are enumerated and not ranked.",
    ],
    limitations: [
      "Only α-carbons that are CH₂ (so the β-keto ester product has an acidic hydrogen to drive the reaction) are modeled; fully substituted α-carbons are excluded.",
      "Ring-substituent stereocentres created at the α-carbon are not assigned (the β-keto ester epimerizes through its enol).",
      "Use an alkoxide matching the ester alkyl group to avoid transesterification; this is not enforced.",
    ],
    productStatus: "computed",
    planningCost,
    retrosynthesis: { tier, group: "dieckmann" },
    priority: 1861 + ringSize,
  } satisfies ReactionRule;
});

export const expansion9mReactionRules: ReactionRule[] = [
  wackerRule,
  ...rcmRules,
  ...mitsunobuRules,
  ...benzilicRules,
  pinacolCouplingRule,
  ketonicRule,
  ...dieckmannRules,
  ...activeMethyleneRules,
];
