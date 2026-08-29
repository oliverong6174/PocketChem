import { getRuleCourse } from "./reactionCurriculum";
import { reactionRegistry } from "./reactionRegistry";
import type {
  OrganicChemCourse,
  ProductGenerationStatus,
  ReactionRule,
  ReactionType,
} from "./reactionTypes";

export type ReactionCatalogSummary = {
  totalRules: number;
  byCourse: Record<OrganicChemCourse, number>;
  byFamily: Record<string, number>;
  byReactionType: Record<ReactionType, number>;
  byProductStatus: Record<ProductGenerationStatus, number>;
};

export function getRuleProductStatus(
  rule: ReactionRule
): ProductGenerationStatus {
  if (rule.transform.type === "conceptOnly") return "concept-only";
  if (rule.productStatus) return rule.productStatus;
  return rule.transform.type === "customHandler" ? "representative" : "computed";
}

export function getReactionCatalogSummary(
  rules: ReactionRule[] = reactionRegistry
): ReactionCatalogSummary {
  const summary: ReactionCatalogSummary = {
    totalRules: rules.length,
    byCourse: {
      "ochem-1": 0,
      "ochem-2": 0,
      advanced: 0,
    },
    byFamily: {},
    byReactionType: {
      addition: 0,
      substitution: 0,
      elimination: 0,
      oxidation: 0,
      reduction: 0,
      condensation: 0,
      rearrangement: 0,
      acidBase: 0,
      cleavage: 0,
      cyclization: 0,
      ringOpening: 0,
      coupling: 0,
      pericyclic: 0,
      radical: 0,
      tautomerization: 0,
      isomerization: 0,
    },
    byProductStatus: {
      computed: 0,
      representative: 0,
      generic: 0,
      "concept-only": 0,
    },
  };

  for (const rule of rules) {
    const course = getRuleCourse(rule);
    const productStatus = getRuleProductStatus(rule);

    summary.byCourse[course] += 1;
    summary.byFamily[rule.family] = (summary.byFamily[rule.family] ?? 0) + 1;
    summary.byReactionType[rule.reactionType] += 1;
    summary.byProductStatus[productStatus] += 1;
  }

  return summary;
}

export function filterReactionRules(
  filters: {
    course?: OrganicChemCourse;
    family?: string;
    reactionType?: ReactionType;
    productStatus?: ProductGenerationStatus;
  },
  rules: ReactionRule[] = reactionRegistry
): ReactionRule[] {
  return rules.filter((rule) => {
    if (filters.course && getRuleCourse(rule) !== filters.course) return false;
    if (filters.family && rule.family !== filters.family) return false;
    if (filters.reactionType && rule.reactionType !== filters.reactionType) {
      return false;
    }
    if (
      filters.productStatus &&
      getRuleProductStatus(rule) !== filters.productStatus
    ) {
      return false;
    }

    return true;
  });
}
