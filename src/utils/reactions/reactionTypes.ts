import type { FunctionalGroupResult } from "../functionalGroups";

export type OrganicChemCourse = "ochem-1" | "ochem-2" | "advanced";

export type ProductGenerationStatus =
  | "computed"
  | "representative"
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
};

export type ReactionPredictionInput = {
  reactantSmiles: string;
  functionalGroups: FunctionalGroupResult[];
};
