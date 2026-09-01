import type { FunctionalGroupResult } from "../functionalGroups";

export type OrganicChemCourse = "ochem-1" | "ochem-2" | "advanced";

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
  | "rearrangement";

export type ReactionPurpose = "protection" | "deprotection";

/** How PocketChem generates the product structure. */
export type ReactionTransform =
  | {
      type: "reactionSmarts";
      smarts: string;
      maxProducts?: number;
    }
  | {
      type: "customHandler";
      handler: ReactionHandlerName;
      options?: Record<string, unknown>;
    }
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
};

export type ReactionRule = {
  id: string;
  family: string;

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

  transform: ReactionTransform;
  priority: number;

  course?: OrganicChemCourse;
  chapter?: string;
  mechanism?: string;
  reactionClass?: string;
  purpose?: ReactionPurpose;
  selectivity?: string[];
  limitations?: string[];
  productStatus?: ProductGenerationStatus;
};

export type ReactionPathway = {
  id: string;
  ruleId: string;
  family: string;
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
  limitations: string[];
  productStatus: ProductGenerationStatus;
  reactantComponents: string[];
  hasGenericReactant: boolean;
};

export type ReactionComponent = {
  smiles: string;
  functionalGroups: FunctionalGroupResult[];
  isGeneric: boolean;
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
  family: string;
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
  limitations: string[];

  confidence: RetrosynthesisConfidence;
  source: "reversed-reaction-smarts" | "reversed-custom-handler";

  /** Other catalog rules that produce the same exact precursor set. */
  alternativeRoutes: RetrosynthesisAlternativeRoute[];
};


export type SynthesisStepSource = "forward-search" | "retrosynthesis-search";

export type SynthesisStep = {
  id: string;
  stepNumber: number;
  source: SynthesisStepSource;
  ruleId: string;
  family: string;
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
  limitations: string[];

  retrosynthesisConfidence: RetrosynthesisConfidence | null;
};

export type SynthesisRouteConfidence = "verified" | "connectivity-verified";

export type MultistepSynthesisRoute = {
  id: string;
  startingSmiles: string;
  targetSmiles: string;
  steps: SynthesisStep[];
  confidence: SynthesisRouteConfidence;
  score: number;
};

export type MultistepSynthesisSearchOptions = {
  maxSteps?: number;
  beamWidth?: number;
  branchLimit?: number;
  maxRoutes?: number;
  /** Optional cancellation signal for long multistep searches. */
  signal?: AbortSignal;
};

export type MultistepSynthesisProgress = {
  phase: "forward" | "retrosynthesis" | "matching";
  depth: number;
  maxSteps: number;
};
