import type { FunctionalGroupResult } from "../functionalGroups";

export type OrganicChemCourse = "ochem-1" | "ochem-2" | "advanced";

export type ProductGenerationStatus =
  | "computed"
  | "representative"
  | "concept-only";

export type ReactionTransform =
  | {
      type: "rdkitReactionSmarts";
      smarts: string;
      maxProducts?: number;
    }
  | {
      type: "engineHandler";
      handler: "addition" | "condensation" | "oxidation" | "reduction";
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
  selectivity?: string[];
  limitations?: string[];
  productStatus?: ProductGenerationStatus;
};

export type ReactionPathway = {
  id: string;
  ruleId: string;
  family: string;
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
  selectivity: string[];
  limitations: string[];
  productStatus: ProductGenerationStatus;
};

export type ReactionPredictionInput = {
  reactantSmiles: string;
  functionalGroups: FunctionalGroupResult[];
};
