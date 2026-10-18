import type { FunctionalGroupResult } from "../functionalGroups";

export type OrganicChemCourse = "ochem-1" | "ochem-2" | "advanced";

export const REACTION_FAMILIES = [
  "alkanes",
  "haloalkanes",
  "alkenes",
  "alkynes",
  "alcohols",
  "ethers",
  "epoxides",
  "dienes",
  "aromatics",
  "phenols",
  "aldehydes",
  "ketones",
  "carbonyl-derivatives",
  "couplings",
  "enolates",
  "carboxylic-acids",
  "acid-chlorides",
  "anhydrides",
  "esters",
  "amides",
  "nitriles",
  "amines",
  "diazonium",
  "sulfur",
] as const;

export type ReactionFamily = (typeof REACTION_FAMILIES)[number];

export type ProductGenerationStatus =
  | "computed"
  | "representative"
  | "generic"
  | "concept-only";

/**
 * What kind of reaction this is chemically.
 *
 * This is classification metadata only. It does NOT choose executable code.
 */
export type ReactionType =
  | "addition"
  | "substitution"
  | "elimination"
  | "oxidation"
  | "reduction"
  | "condensation"
  | "rearrangement"
  | "acidBase"
  | "cleavage"
  | "cyclization"
  | "ringOpening"
  | "coupling"
  | "pericyclic"
  | "radical"
  | "tautomerization"
  | "isomerization";

/**
 * Custom executors that currently contain reusable chemistry logic.
 *
 * Do not add a handler just because a new ReactionType exists. Add one only
 * when multiple rules genuinely need substrate-aware code that cannot be
 * expressed cleanly as one reaction SMARTS.
 */
export type ReactionHandlerName =
  | "addition"
  | "substitution"
  | "elimination"
  | "carbonyl"
  | "oxidation"
  | "reduction"
  | "ring"
  | "rearrangement"
  | "pericyclic"
  | "radical";

export type ReactionPurpose = "protection" | "deprotection";

export type RetrosynthesisTier =
  | "preferred"
  | "standard"
  | "secondary"
  | "disabled";

/**
 * Controls whether/how a forward reaction is exposed as a retrosynthetic step.
 * This keeps destructive or pedagogically one-way reactions from flooding the
 * retrosynthesis page while still allowing strategic bond-forming reactions to
 * rank ahead of routine functional-group interconversions.
 */
export type RetrosynthesisPolicy = {
  tier?: RetrosynthesisTier;
  /** Optional stable grouping label for closely related reverse strategies. */
  group?: string;
  /**
   * Some stereospecific forward handlers cannot reconstruct precursor E/Z from
   * a tetrahedral product uniquely. In that case the reverse disconnection may
   * still be shown after exact connectivity replay, clearly labeled as such.
   */
  allowConnectivityOnlyStereo?: boolean;
};

export type AdditionHandlerMode =
  | "oneTwoAddition"
  | "alkeneHydration"
  | "alkeneHydrohalogenation"
  | "dieneHydrohalogenation"
  | "polyeneHydrohalogenation"
  | "halohydrin"
  | "haloether"
  | "alkoxymercuration"
  | "synDihydroxylation"
  | "antiDihydroxylation"
  | "epoxidationOrganometallicOpening"
  | "epoxidationAcidicAlcoholOpening";

export type SubstitutionHandlerMode =
  | "sn1"
  | "sn2"
  | "alkylHalideSubstitution"
  | "alcoholToHalide"
  | "alcoholSn1ToHalide"
  | "vicinalDiolToDihalide"
  | "intermolecularAlcoholDehydration"
  | "etherCleavage"
  | "aromaticEas"
  | "aromaticSnAr"
  | "aromaticBenzyneAmination";

export type EliminationHandlerMode = "betaElimination" | "e1" | "e2" | "hofmannAmine";
export type CarbonylHandlerMode = "oximeFormation" | "imineHydrolysis";
export type OxidationHandlerMode =
  | "alcoholOxidation"
  | "aldehydeOxidation"
  | "alkeneOxidativeCleavage"
  | "alkyneOxidativeCleavage"
  | "vicinalDiolCleavage"
  | "baeyerVilliger"
  | "benzylicSideChainOxidation"
  | "alkeneReductiveCleavage";
export type ReductionHandlerMode = "oneTwoAddition" | "carbonylToAlkane" | "birchReduction";
export type RingHandlerMode =
  | "epoxideOpening"
  | "epoxideOrganometallicOpening"
  | "epoxideNucleophileOpening"
  | "intramolecularWilliamson";
export type RearrangementHandlerMode = "pinacol";
export type PericyclicHandlerMode =
  | "dielsAlder"
  | "intramolecularDielsAlder";
export type RadicalHandlerMode = "alkaneHalogenation";

type HandlerOptions<Mode extends string> = {
  mode: Mode;
  [key: string]: unknown;
};


export type ReactionProductMixtureKind =
  | "racemic"
  | "diastereomeric"
  | "stereoisomeric";

/**
 * One generated structure can be a member of a chemically inseparable/expected
 * product mixture. The members remain individually addressable by the reaction
 * and synthesis engines, but this metadata prevents one member of an SN1
 * racemate from being misrepresented as an enantiopure product.
 */
export type ReactionProductMixture = {
  kind: ReactionProductMixtureKind;
  groupId: string;
  label: string;
  memberIndex: number;
  memberCount: number;
  memberSmiles: string[];
  /** Optional shared display name such as `rac-butan-2-ol`. */
  displayName: string | null;
};

export type StereochemicalMode =
  | "none"
  | "retention"
  | "inversion"
  | "racemization"
  | "syn-addition"
  | "anti-addition"
  | "suprafacial"
  | "e-preferred"
  | "z-preferred";

export type RelativeStereochemicalRelationship = "syn" | "anti";

export type StereochemicalAttackMode =
  | "frontside"
  | "backside"
  | "either"
  | "concerted";

export type StereochemicalFaceSelection =
  | "both-equivalent"
  | "substrate-controlled"
  | "less-hindered"
  | "single-mechanistic-face";

export type ReactionSitePreference =
  | "most-substituted-alkene"
  | "least-substituted-alkene"
  | "most-accessible-site"
  | "least-accessible-site"
  | "most-stable-carbocation-site"
  | "most-stable-radical-site"
  | "most-substituted-epoxide-carbon"
  | "least-substituted-epoxide-carbon"
  | "most-acidic-alpha-carbon"
  | "most-activated-aromatic-site";

export type ReactionDisplayRenderer =
  | "default"
  | "generic-halogen"
  | "syn-diol"
  | "anti-diol"
  | "tetrahedral-perspective"
  | "explicit-alcohol-stereo"
  | "aligned-stereo"
  | "aligned-generic-halogen"
  | "heavy-atom-stereo"
  | "diels-alder-bicyclic";

export type ReactionSeriesMetadata = {
  /** Stable chemistry-series identifier; UI grouping must use this, not text/IDs. */
  id: string;
  /** Symbol shown when a series is condensed (for example X in HX). */
  variable?: string;
  /** Concrete member represented by this rule (for example Br). */
  value?: string;
};

export type ReactionDisplayMetadata = {
  renderer?: ReactionDisplayRenderer;
  /** Keep unchanged reactant geometry as the source of truth for product depiction. */
  preserveReactantOrientation?: boolean;
  /** Controls reagent-condition pill grouping without changing reaction chemistry. */
  reagentBubbleMode?: "auto" | "single";
  series?: ReactionSeriesMetadata;
};

export type ReactionCompetitionMetadata = {
  /** Matching rules in the same group compete for the same chemical event. */
  group: string;
  /** Higher specificity wins within a competition group. */
  specificity: number;
};

export type ReactionFailureCategory =
  | "steric"
  | "missing-site"
  | "electronic"
  | "mechanistic";

export type ReactionConstraintId =
  | "generic-dehydration-not-vicinal-diol"
  | "oxidizable-alcohol-needs-carbon-h"
  | "sn2-alcohol-center-accessible"
  | "lucas-primary-room-temperature"
  | "terminal-alkyne-needs-sp-h"
  | "benzylic-oxidation-needs-h"
  | "benzylic-radical-halogenation-needs-h"
  | "e2-needs-beta-carbon"
  | "sn2-electrophile-accessible"
  | "friedel-crafts-ring-not-strongly-deactivated"
  | "friedel-crafts-amine-compatible";

export type ReactantSupplyMode = "auto" | "user-structure" | "condition-only";

export type ReactionReactantRole =
  | "nucleophile"
  | "electrophile"
  | "diene"
  | "dienophile"
  | "base"
  | "oxidant"
  | "reducing-agent"
  | "structural-partner"
  | "catalyst"
  | "other";

export type RegiochemicalMode =
  | "none"
  | "markovnikov"
  | "anti-markovnikov"
  | "zaitsev"
  | "hofmann"
  | "directed";

/**
 * Machine-readable selectivity metadata. The existing string `selectivity`
 * field remains the human-facing explanation; this profile is what the
 * reaction and synthesis engines should use for chemistry decisions.
 */
export type MechanismStepType =
  | "protonation"
  | "deprotonation"
  | "nucleophilic-attack"
  | "leaving-group-departure"
  | "bond-formation"
  | "bond-cleavage"
  | "pi-bond-shift"
  | "epoxide-formation"
  | "epoxide-opening"
  | "cycloaddition"
  | "rearrangement"
  | "oxidation"
  | "reduction";

export type MechanismStep = {
  type: MechanismStepType;
  label: string;
  concerted?: boolean;
  reversible?: boolean;
  stereochemicalConsequence?:
    | "retention"
    | "inversion"
    | "syn"
    | "anti"
    | "suprafacial"
    | "racemization"
    | "none";
};

export type RelativeStereoPostcondition = {
  /** Product SMARTS containing the two substituent bonds to compare. */
  smarts: string;
  /** Match-array positions for the first substituent bond. */
  firstBond: readonly [number, number];
  /** Match-array positions for the second substituent bond. */
  secondBond: readonly [number, number];
  relationship: "syn" | "anti";
};

export type ReactionMechanismProfile = {
  /** Stable mechanistic family used by validators and future mechanism UI. */
  family:
    | "sn1"
    | "sn2"
    | "e1"
    | "e2"
    | "electrophilic-addition"
    | "epoxide-opening"
    | "epoxidation-opening-sequence"
    | "pericyclic-4+2"
    | "carbonyl-addition-elimination"
    | "other";
  steps: MechanismStep[];
  /** Generic graph-level checks applied to every generated product. */
  productPostconditions?: {
    relativeStereo?: RelativeStereoPostcondition[];
  };
};

export type ReactionSelectivityLevel =
  | "major"
  | "competitive"
  | "minor"
  | "trace"
  | "unknown";

/**
 * Dynamic, product-specific selectivity estimate used by the synthesis planner.
 * This is intentionally separate from rule-level `selectivityProfile`: one
 * reaction rule can generate both major and trace constitutional products.
 */
export type ReactionSelectivityAssessment = {
  level: ReactionSelectivityLevel;
  /** Approximate fraction of the product mixture represented by this path, 0-1. */
  estimatedFraction: number | null;
  /** Extra planner cost. Larger values make low-selectivity routes less preferred. */
  planningPenalty: number;
  /** Compact UI label such as "Trace product (~0.3%)". */
  label: string;
  /** Human-readable basis/limitations for the estimate. */
  basis: string;
};

export type ReactionSelectivityProfile = {
  stereochemistry?: {
    mode: StereochemicalMode;
    stereospecific?: boolean;
    stereoselective?: boolean;
    /** Mechanistic relationship between the groups installed/compared. */
    relativeRelationship?: RelativeStereochemicalRelationship;
    /** How the stereochemistry is created at the reaction center. */
    attackMode?: StereochemicalAttackMode;
    /** Whether both faces are equivalent or the substrate/framework controls approach. */
    faceSelection?: StereochemicalFaceSelection;
  };
  regiochemistry?: {
    mode: RegiochemicalMode;
    regioselective?: boolean;
  };
  mixture?: "single" | "possible" | "expected";
  /** Prefer the alkene site consumed by the transformation when several C=C bonds are present. */
  sitePreference?: ReactionSitePreference;
  /** Keep the handler-ranked major constitutional product rather than every lower-probability regioisomer. */
  majorProductOnly?: boolean;
  allowsRearrangement?: boolean;
};

/** How PocketChem generates the product structure. */
export type ReactionTransform =
  | {
      type: "reactionSmarts";
      smarts: string;
      maxProducts?: number;
    }
  | { type: "customHandler"; handler: "addition"; options: HandlerOptions<AdditionHandlerMode> }
  | { type: "customHandler"; handler: "substitution"; options: HandlerOptions<SubstitutionHandlerMode> }
  | { type: "customHandler"; handler: "elimination"; options: HandlerOptions<EliminationHandlerMode> }
  | { type: "customHandler"; handler: "carbonyl"; options: HandlerOptions<CarbonylHandlerMode> }
  | { type: "customHandler"; handler: "oxidation"; options: HandlerOptions<OxidationHandlerMode> }
  | { type: "customHandler"; handler: "reduction"; options: HandlerOptions<ReductionHandlerMode> }
  | { type: "customHandler"; handler: "ring"; options: HandlerOptions<RingHandlerMode> }
  | { type: "customHandler"; handler: "rearrangement"; options: HandlerOptions<RearrangementHandlerMode> }
  | { type: "customHandler"; handler: "pericyclic"; options: HandlerOptions<PericyclicHandlerMode> }
  | { type: "customHandler"; handler: "radical"; options: HandlerOptions<RadicalHandlerMode> }
  | {
      type: "conceptOnly";
      reason: string;
    };

/**
 * Functional-group matching is exact by default. Use SMARTS constraints for
 * structural details such as an alpha hydrogen, benzylic hydrogen, or a
 * methyl ketone. The legacy `functionalGroups` field remains supported while
 * older family files are migrated.
 */
export type ReactionTrigger = {
  functionalGroups?: string[];
  anyFunctionalGroups?: string[];
  allFunctionalGroups?: string[];
  excludedFunctionalGroups?: string[];
  includeSmarts?: string[];
  excludeSmarts?: string[];
};

export type ReactionReactantRequirement = {
  /** Stable machine identifier. Display text may change without changing behavior. */
  id?: string;
  /** Human-readable role shown when this reactant is missing. */
  label: string;
  /** Structural requirements for this additional reactant. */
  trigger: ReactionTrigger;
  /**
   * Stoichiometric copies of the same drawn reactant needed by the transform.
   * The user only needs to draw the structure once; the engine duplicates it
   * internally for reaction SMARTS that require multiple equivalents.
   */
  equivalents?: number;
  /** Whether the sequence engine may provide a fixed structure automatically. */
  supplyMode?: ReactantSupplyMode;
  /** Fixed structure for small ions/reagents; never infer this from the label. */
  presetSmiles?: string;
  /** Search-only synonyms; changing them must never change reaction chemistry. */
  searchAliases?: string[];
  /** Whether atoms from this reactant become part of the product skeleton. */
  contributesToProduct?: boolean;
  role?: ReactionReactantRole;
};

export type ReactionRule = {
  id: string;
  family: ReactionFamily;

  /** Chemical classification. This does not select executable code. */
  reactionType: ReactionType;

  title: string;
  reagents: string;
  reagentNote: string;
  productHint: string;
  explanation: string;
  trigger: ReactionTrigger;

  /**
   * Additional structural reactants required by the rule. The first reactant
   * is described by `trigger`; these are matched order-independently against
   * other disconnected structures drawn in Ketcher.
   */
  additionalReactants?: ReactionReactantRequirement[];

  /**
   * Set to `unordered` only when exchanging structurally equivalent reactant
   * roles describes the same chemical event (for example alkene + alkene in a
   * photochemical [2+2]).  Crossed/role-specific reactions such as aldol and
   * nucleophile/electrophile couplings remain ordered.
   */
  reactantRoleSymmetry?: "ordered" | "unordered";

  transform: ReactionTransform;
  priority: number;

  /** Structured rendering/grouping metadata consumed by every reaction UI. */
  display?: ReactionDisplayMetadata;
  /** Structured substrate scope used only for NO REACTION relevance. */
  diagnosticTrigger?: ReactionTrigger;
  /** Reusable mechanistic constraints. No engine/UI module should key on rule IDs. */
  constraints?: ReactionConstraintId[];
  /** Declarative same-condition competition; higher specificity wins. */
  competition?: ReactionCompetitionMetadata;
  /** Optional planning cost distinct from educational/UI priority. Lower is better. */
  planningCost?: number;
  /** Extra search terms independent of display wording. */
  searchAliases?: string[];
  /** Retrosynthetic visibility/ranking independent of forward reaction display. */
  retrosynthesis?: RetrosynthesisPolicy;

  course?: OrganicChemCourse;
  chapter?: string;
  mechanism?: string;
  /** Machine-readable mechanism used to enforce cross-substrate chemistry invariants. */
  mechanismProfile?: ReactionMechanismProfile;
  reactionClass?: string;
  purpose?: ReactionPurpose;
  selectivity?: string[];
  selectivityProfile?: ReactionSelectivityProfile;
  limitations?: string[];
  productStatus?: ProductGenerationStatus;
};

export type ReactionPathway = {
  id: string;
  ruleId: string;
  family: ReactionFamily;
  reactionType: ReactionType;
  title: string;
  reactantSmiles: string;
  reactantLabel: string;
  reagentLabel: string;
  reagentNote: string;
  productSmiles: string | null;
  productLabel: string;
  shortExplanation: string;

  course: OrganicChemCourse;
  chapter: string;
  mechanism: string | null;
  reactionClass: string | null;
  purpose: ReactionPurpose | null;
  selectivity: string[];
  selectivityProfile: ReactionSelectivityProfile | null;
  selectivityAssessment?: ReactionSelectivityAssessment | null;
  limitations: string[];
  productStatus: ProductGenerationStatus;
  reactantComponents: string[];
  hasGenericReactant: boolean;
  productMixture: ReactionProductMixture | null;
  display: ReactionDisplayMetadata | null;
  missingReactants: ReactionReactantRequirement[];
  competition: ReactionCompetitionMetadata | null;
  planningCost: number;
  reactantRequirements: ReactionReactantRequirement[];
};

export type ReactionComponent = {
  smiles: string;
  functionalGroups: FunctionalGroupResult[];
  isGeneric: boolean;
  /**
   * Set when functional-group analysis threw. `functionalGroups` is then empty
   * because the analysis FAILED, not because the molecule has no groups, so
   * name-gated rules must not be read as chemically inapplicable.
   */
  analysisError?: string;
};

/**
 * An internal engine failure observed while predicting reactions. These are
 * reported separately from chemical nonreactivity so that callers can avoid
 * presenting an engine/matcher failure as "NO REACTION".
 */
export type ReactionEngineIssue = {
  kind:
    | "component-analysis"
    | "rule-matching"
    | "smarts-execution"
    | "rule-execution";
  ruleId?: string;
  message: string;
};

export type ReactionPredictionInput = {
  reactantSmiles: string;
  functionalGroups: FunctionalGroupResult[];
};

/** Confidence assigned to a retrosynthetic disconnection after replaying the
 * original forward rule against the proposed precursors. */
export type RetrosynthesisConfidence = "confirmed" | "connectivity-confirmed";

/** A second forward reaction that reaches the exact same retrosynthetic
 * disconnection/precursor set. These are collapsed into the primary card so
 * symmetric or otherwise equivalent substrates do not create duplicate cards. */
export type RetrosynthesisAlternativeRoute = {
  ruleId: string;
  title: string;
  reagentLabel: string;
  reagentNote: string;
  mechanism: string | null;
  reactionClass: string | null;
  selectivity: string[];
  selectivityProfile: ReactionSelectivityProfile | null;
  display: ReactionDisplayMetadata | null;
};

/**
 * One backwards application of an existing forward ReactionRule.
 *
 * `precursorComponents` contains only structures that can be reconstructed
 * from the target. Non-incorporated bases/solvents remain in
 * `requiredReactantLabels` and in the original rule's reagent metadata rather
 * than being invented as arbitrary molecules.
 */
export type RetrosynthesisPathway = {
  id: string;
  ruleId: string;
  family: ReactionFamily;
  reactionType: ReactionType;
  title: string;

  targetSmiles: string;
  targetLabel: string;

  precursorSmiles: string;
  precursorComponents: string[];
  precursorLabel: string;
  requiredReactantLabels: string[];

  reagentLabel: string;
  reagentNote: string;
  shortExplanation: string;
  priority: number;

  course: OrganicChemCourse;
  chapter: string;
  mechanism: string | null;
  reactionClass: string | null;
  purpose: ReactionPurpose | null;
  selectivity: string[];
  selectivityProfile: ReactionSelectivityProfile | null;
  selectivityAssessment?: ReactionSelectivityAssessment | null;
  limitations: string[];

  confidence: RetrosynthesisConfidence;
  source: "reversed-reaction-smarts" | "reversed-custom-handler";

  /** Other catalog rules that produce the same exact precursor set. */
  alternativeRoutes: RetrosynthesisAlternativeRoute[];
  /** Mixture produced when these precursors are replayed through the forward rule. */
  productMixture: ReactionProductMixture | null;
  display: ReactionDisplayMetadata | null;
  planningCost: number;
  retrosynthesisTier: Exclude<RetrosynthesisTier, "disabled">;
  retrosynthesisGroup: string | null;
};


export type SynthesisStepSource = "forward-search" | "retrosynthesis-search";

export type SynthesisStep = {
  id: string;
  stepNumber: number;
  source: SynthesisStepSource;
  ruleId: string;
  family: ReactionFamily;
  reactionType: ReactionType;
  title: string;

  reactantSmiles: string;
  reactantComponents: string[];
  reactantLabel: string;

  productSmiles: string;
  productComponents: string[];
  productLabel: string;

  reagentLabel: string;
  reagentNote: string;
  shortExplanation: string;

  course: OrganicChemCourse;
  chapter: string;
  mechanism: string | null;
  reactionClass: string | null;
  purpose: ReactionPurpose | null;
  selectivity: string[];
  selectivityProfile: ReactionSelectivityProfile | null;
  selectivityAssessment?: ReactionSelectivityAssessment | null;
  limitations: string[];

  retrosynthesisConfidence: RetrosynthesisConfidence | null;
  productMixture: ReactionProductMixture | null;
  display: ReactionDisplayMetadata | null;
  /**
   * Optional material provenance, aligned with `reactantComponents`: the lot
   * ids (see RouteVerification.inventory / leftovers) this step consumes. When
   * present, the route verifier consumes exactly those lots instead of the
   * first structure match, so two lots with the same structure but different
   * histories (two copies of one starting material, a racemate and an
   * enantiopure sample) are never confused.
   */
  reactantLotIds?: string[];
};

export type SynthesisRouteConfidence = "verified" | "connectivity-verified";

/** How closely two structures agree. */
export type RouteMatchLevel =
  /** Identical canonical isomeric SMILES (stereochemistry included). */
  | "exact"
  /** Same constitution; stereochemistry differs or is unspecified on one side. */
  | "connectivity"
  /** Equal to one member of a known stereo mixture produced by the step. */
  | "mixture-member"
  | "none";

export type RouteVerificationStatus = "verified" | "connectivity-only" | "failed";

export type RouteStepReactantCheck = {
  smiles: string;
  /** Where the reactant came from: a supplied material, an earlier step, or nowhere. */
  origin:
    | "starting-material"
    | "earlier-step"
    /** A reagent the rule itself supplies (for example a base); not a route material. */
    | "rule-supplied-reagent"
    | "missing"
    | "already-consumed";
  match: RouteMatchLevel;
  /** Id of the lot this reactant was matched to (absent when nothing matched). */
  lotId?: string;
  /** Indices of the supplied starting materials this lot descends from. */
  lineage?: number[];
};

export type RouteStepVerification = {
  stepNumber: number;
  ruleId: string;
  status: RouteVerificationStatus;
  reactants: RouteStepReactantCheck[];
  /** Recorded step product versus the product obtained by replaying the rule. */
  productMatch: RouteMatchLevel;
  problems: string[];
};

/**
 * Result of replaying a route from its supplied starting materials, one rule
 * application at a time. "verified" means every reactant was available and
 * every product and the target matched exactly (stereochemistry included);
 * "connectivity-only" means the route is constitutionally consistent but at
 * least one stereochemical or mixture-member match was not exact. This is a
 * check against PocketChem's own reaction model, not experimental validation.
 */
export type RouteVerification = {
  status: RouteVerificationStatus;
  steps: RouteStepVerification[];
  targetMatch: RouteMatchLevel;
  /** Supplied starting materials the route never consumed. */
  unusedStartingMaterials: string[];
  /**
   * Other products the route leaves in the final state beside the matched
   * target (for example methanol next to ethanol after an ester reduction).
   * The target is still an exact structure match; this only says it is not
   * the sole product, so a "verified" route is not read as a clean one.
   */
  coproducts: string[];
  problems: string[];
  /** Supplied starting materials, their copies and what consumed them. */
  inventory?: RouteInventoryEntry[];
  /** Every species still present after the last step, with provenance. */
  leftovers?: RouteLeftoverSpecies[];
  /** Which earlier steps each step depends on; independent branches share none. */
  stepDependencies?: RouteStepDependency[];
  /** Which part of the route actually produces the matched target. */
  targetLineage?: RouteTargetLineage | null;
};

/**
 * Starting-material copies available to a route replay. A number applies to
 * every supplied component; an array is indexed by component order. A copy is
 * a qualitative availability count (one isolated batch), not an amount of
 * substance: PocketChem does no mole or limiting-reagent accounting.
 */
export type RouteVerificationOptions = {
  startingMaterialCopies?: number | number[];
};

export type RouteInventoryEntry = {
  startIndex: number;
  smiles: string;
  copies: number;
  consumed: number;
  lotIds: string[];
  /** Step number that consumed each lot, or null when it was never used. */
  consumedByStep: Array<number | null>;
};

export type RouteLeftoverSpecies = {
  lotId: string;
  smiles: string;
  origin: "starting-material" | "earlier-step";
  producedByStep: number | null;
  /** Indices of the supplied starting materials this species descends from. */
  lineage: number[];
  fromMixture: boolean;
};

export type RouteStepDependency = {
  stepNumber: number;
  consumedLotIds: string[];
  producedLotIds: string[];
  dependsOnSteps: number[];
};

export type RouteTargetLineage = {
  lotId: string;
  startingMaterialIndices: number[];
  contributingSteps: number[];
  /** Steps whose products never feed the target (side branches or waste). */
  unusedSteps: number[];
  /** Longest chain of dependent steps leading to the target. */
  longestLinearSequence: number;
};

export type MultistepSynthesisRoute = {
  id: string;
  startingSmiles: string;
  targetSmiles: string;
  steps: SynthesisStep[];
  confidence: SynthesisRouteConfidence;
  score: number;
  /** End-to-end replay result; absent only for routes built outside the planner. */
  verification?: RouteVerification;
};

/**
 * Budgets and inventory for the opt-in forward convergent lane (A -> A', B -> B',
 * A' + B' -> target). Every field is optional; omitted fields use conservative
 * defaults. A copy is a qualitative availability count, not an amount.
 */
export type ConvergentSearchOptions = {
  /** Copies of each supplied material (number for all, array by component). Default one each. */
  startingMaterialCopies?: number | number[];
  maxStateExpansions?: number;
  maxReactionExecutions?: number;
  /** Most steps in one explored path. */
  maxDepth?: number;
  /** Most lots one step may consume. */
  maxArity?: number;
  maxLiveLots?: number;
  maxLiveCoproducts?: number;
  maxPathwaysPerExecution?: number;
  /** Wall-clock budget for this lane, in milliseconds. */
  maxWallMs?: number;
  /** Absolute Date.now() deadline; the lane stops at the earlier of this and its wall budget. */
  deadline?: number;
  maxRoutes?: number;
};

export type MultistepSynthesisSearchOptions = {
  /**
   * Opt in to the forward convergent lane before the linear search. Off by
   * default; when absent the search behaves exactly as before.
   */
  convergentSearch?: boolean | ConvergentSearchOptions;
  maxSteps?: number;
  beamWidth?: number;
  branchLimit?: number;
  maxRoutes?: number;
  /**
   * Return the first verified bridge found by an adaptive bidirectional pass
   * before running the exhaustive shortest-route sweep. Useful for interactive
   * UI where responsiveness matters more than proving global shortestness.
   */
  preferFirstVerifiedRoute?: boolean;
  /** Search breadth. Normal is tuned for interactive latency; deep widens the A-star and beam fallbacks. */
  searchEffort?: "normal" | "deep";
  /** Optional cancellation signal for long multistep searches. */
  signal?: AbortSignal;
};

/**
 * Live planner telemetry. `percent` is a work estimate, not a wall-clock ETA:
 * forward/retro expansion dominates the cost while frontier matching is cheap.
 */
export type MultistepSynthesisProgress = {
  phase: "forward" | "retrosynthesis" | "matching";
  depth: number;
  maxSteps: number;
  /** Number of parent nodes processed in the current expansion stage. */
  processed?: number;
  /** Total parent nodes scheduled for the current expansion stage. */
  total?: number;
  /** Candidate nodes retained/generated so far for this stage. */
  candidateCount?: number;
  /** Approximate overall search work completed, 0-100. */
  percent?: number;

  /**
   * Optional lightweight snapshot of the BEST retained nodes at a completed
   * search layer. This is intentionally canonical-SMILES based: diagnostics
   * must not invoke nomenclature/SVG work inside the planner.
   */
  frontierSample?: Array<{
    smiles: string;
    depth: number;
    rank: number;
    lastRuleId: string | null;
    lastStepTitle: string | null;
    usedStartingMaterialCount: number;
    stereoMixture: ReactionProductMixtureKind | null;
  }>;

  /** Exact target structure already present in this retained frontier. */
  exactTargetCount?: number;
  /** Target is explicitly one member of a known racemic/stereoisomeric mixture. */
  targetMixtureMemberCount?: number;
  /** Nodes that have consumed every explicitly supplied starting material. */
  fullyConsumedStartingMaterialCount?: number;

  /**
   * Every reaction rule represented in the retained frontier, not merely the
   * first few visually sampled nodes. This is the main pruning diagnostic:
   * if a rule disappears between layers, we know exactly where that synthetic
   * branch was lost.
   */
  frontierRuleSummary?: Array<{
    ruleId: string;
    title: string;
    count: number;
    bestRank: number;
    minUsedStartingMaterialCount: number;
    maxUsedStartingMaterialCount: number;
  }>;
};
