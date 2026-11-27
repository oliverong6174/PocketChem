import type { ReactionRule } from "../reactionTypes";

/**
 * Stage 9M batch 2: electrophilic substitution of five-membered heteroarenes (furan, thiophene, pyrrole)
 * and crossed aldol reactions with a non-enolizable aldehyde (Claisen-Schmidt). Ordinary reaction-SMARTS
 * rules on the existing engine; scope is enforced in SMARTS. Citations: scripts/benchmarks/stage9m/REFERENCES.md
 * (recalled, not re-read). Products are PocketChem's structural model, not validated predictions.
 */

// An alpha (C2/C5) C-H of a five-membered ring with exactly one heteroatom (O, S or a three-substituted N).
// The ring closure c1:c:c:c:X1 rules out imidazole, oxazole, thiazole, pyrazole and pyridine-type rings.
const heteroAlphaCH = "[cH;$(c1:c:c:c:[o,s,nX3]1)]";
const alphaMapped = "[cH;$(c1:c:c:c:[o,s,nX3]1):1]";
const donorMapped = "[CX3;H0:2](=[O:3])([#6:6])[CX4;H1,H2,H3:1]";
// Deactivated rings (nitro, acyl, ester, nitrile on the ring) are refused: these reactions need an electron-rich ring.
const heteroRingDeactivated = "[$(c1:c:c:c:[o,s,nX3]1);$(c-[$([CX3]=O),$(C#N),$([N+](=O)[O-]),$(S(=O)=O)])]";

const heteroCommon = {
  family: "aromatics" as const,
  reactionType: "substitution" as const,
  reactionClass: "heteroaromatic electrophilic substitution",
  mechanism: "Electrophilic aromatic substitution at the alpha (C2/C5) position via the more delocalized sigma complex",
  selectivityProfile: { mixture: "possible" as const },
  selectivity: [
    "Attack at an alpha carbon (adjacent to O, S or N) is the established regiochemistry for furan, thiophene and pyrrole: the sigma complex has three resonance forms versus two for beta attack.",
    "Only alpha C-H positions are enumerated; beta products are not generated. With two free alpha positions the first substitution is generated; di-substitution with excess reagent is not.",
  ],
  limitations: [
    "Restricted to rings with exactly one heteroatom (furan, thiophene, pyrrole); azoles, pyridines and fused systems are refused.",
    "Rings bearing an electron-withdrawing group (acyl, nitrile, nitro, sulfonyl) are refused.",
    "Furan and pyrrole are acid-sensitive and polymerize under strong Lewis acids; the mild conditions named in the reagents are required.",
    "No yields or product ratios are asserted.",
  ],
  productStatus: "representative" as const,
  planningCost: 70,
};

const heteroarenes: ReactionRule[] = [
  {
    ...heteroCommon,
    id: "heteroarene-bromination-nbs",
    conditions: { reactionCentre: ["aromatic"] },
    title: "Heteroarene Bromination (NBS)",
    reagents: "NBS, THF or DMF, 0 °C to rt",
    reagentAtomSources: ["Br"],
    reagentNote: "Furan, thiophene or pyrrole to the 2-bromo derivative; no Lewis acid (Br₂/FeBr₃ would destroy the ring)",
    productHint: "2-Bromo heteroarene",
    explanation:
      "The electron-rich five-membered heteroarene is brominated at an alpha carbon by NBS under mild, non-acidic conditions.",
    trigger: { includeSmarts: [heteroAlphaCH], excludeSmarts: [heteroRingDeactivated] },
    transform: { type: "reactionSmarts", smarts: `${alphaMapped}>>[c:1]Br`, maxProducts: 4 },
    retrosynthesis: { tier: "secondary", group: "heteroarene-eas" },
    priority: 1838,
  },
  {
    ...heteroCommon,
    id: "heteroarene-friedel-crafts-acylation",
    conditions: { reactionCentre: ["aromatic", "ketone"] },
    title: "Heteroarene Acylation (mild Lewis acid)",
    reagents: "acyl chloride or anhydride, SnCl₄ or BF₃·OEt₂ (not AlCl₃), 0 °C",
    reagentNote: "Draw the heteroarene and the acyl chloride as separate structures",
    productHint: "2-Acyl heteroarene",
    explanation:
      "An acylium-type electrophile substitutes an alpha C-H of furan, thiophene or pyrrole. Mild Lewis acids are used because AlCl₃ degrades furan and pyrrole.",
    trigger: { includeSmarts: [heteroAlphaCH], excludeSmarts: [heteroRingDeactivated] },
    additionalReactants: [
      { label: "acyl chloride", trigger: { includeSmarts: ["[CX3;$([CH1,CH0]([#6])=O),$([CH1,CH0](=O)([#6]))](=O)[Cl,Br]"] }, role: "electrophile" as const },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: `${alphaMapped}.[#6:2][C:3](=[O:4])[Cl,Br]>>[c:1][C:3](=[O:4])[#6:2]`,
      maxProducts: 6,
    },
    retrosynthesis: { tier: "secondary", group: "heteroarene-eas" },
    priority: 1837,
  },
  {
    ...heteroCommon,
    id: "heteroarene-vilsmeier-haack",
    conditions: { reactionCentre: ["aromatic", "aldehyde"] },
    title: "Vilsmeier–Haack Formylation",
    reagents: "POCl₃, DMF, then aqueous NaOAc or H₂O",
    reagentAtomSources: ["C", "O"],
    reagentNote: "DMF/POCl₃ supply the formyl group (chloroiminium electrophile)",
    productHint: "Heteroaryl-2-carbaldehyde",
    explanation:
      "The chloroiminium ion from DMF and POCl₃ is a weak electrophile that substitutes only electron-rich rings; hydrolysis of the iminium gives the aldehyde.",
    trigger: { includeSmarts: [heteroAlphaCH], excludeSmarts: [heteroRingDeactivated] },
    transform: { type: "reactionSmarts", smarts: `${alphaMapped}>>[c:1][CH]=O`, maxProducts: 4 },
    retrosynthesis: { tier: "secondary", group: "heteroarene-eas" },
    priority: 1836,
  },
  {
    ...heteroCommon,
    id: "heteroarene-nitration-acetyl-nitrate",
    conditions: { reactionCentre: ["aromatic"] },
    title: "Heteroarene Nitration (acetyl nitrate)",
    reagents: "HNO₃ / Ac₂O, low temperature (not mixed acid)",
    reagentAtomSources: ["N", "O"],
    reagentNote: "Acetyl nitrate is used because HNO₃/H₂SO₄ destroys furan and pyrrole",
    productHint: "2-Nitro heteroarene",
    explanation:
      "Acetyl nitrate nitrates the alpha position of furan, thiophene and pyrrole without the strong acid that would polymerize the ring.",
    trigger: { includeSmarts: [heteroAlphaCH], excludeSmarts: [heteroRingDeactivated] },
    transform: { type: "reactionSmarts", smarts: `${alphaMapped}>>[c:1][N+](=O)[O-]`, maxProducts: 4 },
    retrosynthesis: { tier: "secondary", group: "heteroarene-eas" },
    priority: 1835,
  },
];

// ---------------------------------------------------------------------------------------------
// Crossed aldol with a non-enolizable aldehyde (Claisen–Schmidt)
// ---------------------------------------------------------------------------------------------

// Donor: a ketone with at least one alpha C-H. Aldehyde donors are excluded because they self-condense.
const ketoneDonor = "[CX3;H0](=O)([#6])[CX4;H1,H2,H3]";
// Electrophile: an aldehyde with no alpha hydrogen (aryl or fully substituted alpha carbon).
const nonEnolizableAldehyde = "[CX3H1](=O)[#6;$(c),$([CX4;H0])]";

const crossedAldolCommon = {
  family: "enolates" as const,
  conditions: { base: "mild" as const, reactionCentre: ["ketone", "aldehyde"] },
  trigger: { includeSmarts: [ketoneDonor], excludeSmarts: [nonEnolizableAldehyde] },
  additionalReactants: [
    { label: "non-enolizable aldehyde (e.g. benzaldehyde)", trigger: { includeSmarts: [nonEnolizableAldehyde] }, role: "electrophile" as const },
  ],
  selectivityProfile: { mixture: "possible" as const },
  productStatus: "representative" as const,
  planningCost: 60,
  limitations: [
    "The electrophile must be an aldehyde with no alpha hydrogens; this is what makes the crossed reaction selective, since it cannot enolize or self-condense.",
    "The donor is restricted to ketones; an unsymmetrical ketone gives one product per enolizable alpha site, unranked (kinetic versus thermodynamic enolate control is not modeled).",
    "The ketone can react at both alpha positions with excess aldehyde (double condensation); only the mono-adduct is generated.",
    "E/Z geometry of the enone is not assigned (the E enone is conventionally observed).",
  ],
};

const crossedAldolRules: ReactionRule[] = [
  {
    ...crossedAldolCommon,
    id: "crossed-aldol-claisen-schmidt",
    reactionType: "condensation",
    reactionClass: "crossed aldol condensation",
    title: "Claisen–Schmidt Condensation",
    reagents: "NaOH or KOH, EtOH/H₂O, rt to mild heat",
    reagentAtomSources: [],
    reagentNote: "Draw the ketone and the non-enolizable aldehyde as separate structures",
    productHint: "α,β-Unsaturated ketone (enone)",
    explanation:
      "The ketone enolate adds to a non-enolizable aldehyde and the aldol dehydrates under the reaction conditions to the conjugated enone. Because the aldehyde cannot enolize, only one cross-coupling pathway exists.",
    transform: {
      type: "reactionSmarts",
      smarts: `${donorMapped}.[CX3H1:4](=[O:5])[#6;$(c),$([CX4;H0]):7]>>[C:2](=[O:3])([#6:6])[C:1]=[C:4][#6:7]`,
      maxProducts: 8,
    },
    mechanism: "Enolate addition to the non-enolizable aldehyde, then E1cB dehydration",
    retrosynthesis: { tier: "preferred", group: "crossed-aldol" },
    priority: 1852,
  },
  {
    ...crossedAldolCommon,
    id: "crossed-aldol-addition-nonenolizable",
    reactionType: "addition",
    reactionClass: "crossed aldol addition",
    title: "Crossed Aldol Addition (non-enolizable aldehyde)",
    reagents: "NaOH (dilute) or pre-formed enolate, low temperature",
    reagentAtomSources: [],
    reagentNote: "Isolates the β-hydroxy ketone before dehydration",
    productHint: "β-Hydroxy ketone",
    explanation:
      "The ketone enolate adds to a non-enolizable aldehyde to give the β-hydroxy ketone. Dehydration is a separate, condition-dependent step.",
    transform: {
      type: "reactionSmarts",
      smarts: `${donorMapped}.[CX3H1:4](=[O:5])[#6;$(c),$([CX4;H0]):7]>>[C:2](=[O:3])([#6:6])[C:1][C:4]([OH:5])[#6:7]`,
      maxProducts: 8,
    },
    selectivity: ["A new stereocentre forms at the carbinol carbon (and at C-alpha when substituted); relative configuration is not assigned."],
    mechanism: "Enolate addition to the non-enolizable aldehyde",
    retrosynthesis: { tier: "secondary", group: "crossed-aldol" },
    priority: 1845,
  },
];

export const expansion9m2ReactionRules: ReactionRule[] = [...heteroarenes, ...crossedAldolRules];
