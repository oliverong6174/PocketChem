import type { ReactionRule } from "./reactionTypes";

const VALID_HANDLERS = new Set([
  "addition",
  "condensation",
  "oxidation",
  "reduction",
]);

export type ReactionRegistryIssue = {
  ruleId: string | null;
  message: string;
};

export function validateReactionRegistry(
  rules: ReactionRule[]
): ReactionRegistryIssue[] {
  const issues: ReactionRegistryIssue[] = [];
  const seenIds = new Set<string>();

  for (const rule of rules) {
    const ruleId = rule.id || null;

    if (!rule.id.trim()) {
      issues.push({ ruleId, message: "Rule id is empty." });
    } else if (seenIds.has(rule.id)) {
      issues.push({ ruleId, message: "Duplicate reaction rule id." });
    }
    seenIds.add(rule.id);

    for (const [field, value] of [
      ["family", rule.family],
      ["title", rule.title],
      ["reagents", rule.reagents],
      ["productHint", rule.productHint],
      ["explanation", rule.explanation],
    ] as const) {
      if (!value.trim()) {
        issues.push({ ruleId, message: `${field} is empty.` });
      }
    }

    if (!Number.isFinite(rule.priority)) {
      issues.push({ ruleId, message: "Priority must be a finite number." });
    }

    const trigger = rule.trigger;
    const hasFunctionalGroupTrigger = Boolean(
      trigger.functionalGroups?.length ||
        trigger.anyFunctionalGroups?.length ||
        trigger.allFunctionalGroups?.length
    );

    if (!hasFunctionalGroupTrigger) {
      issues.push({
        ruleId,
        message: "Rule has no functional-group trigger.",
      });
    }

    if (
      rule.transform.type === "engineHandler" &&
      !VALID_HANDLERS.has(rule.transform.handler)
    ) {
      issues.push({
        ruleId,
        message: `Unknown engine handler: ${rule.transform.handler}`,
      });
    }

    if (rule.transform.type === "rdkitReactionSmarts") {
      if (!rule.transform.smarts.includes(">>")) {
        issues.push({
          ruleId,
          message: "Reaction SMARTS is missing the >> separator.",
        });
      }

      if (
        rule.transform.maxProducts !== undefined &&
        (!Number.isInteger(rule.transform.maxProducts) ||
          rule.transform.maxProducts <= 0)
      ) {
        issues.push({
          ruleId,
          message: "maxProducts must be a positive integer.",
        });
      }
    }

    if (
      rule.transform.type === "conceptOnly" &&
      !rule.transform.reason.trim()
    ) {
      issues.push({
        ruleId,
        message: "Concept-only rules must explain why no exact product is generated.",
      });
    }

    if (
      rule.productStatus === "concept-only" &&
      rule.transform.type !== "conceptOnly"
    ) {
      issues.push({
        ruleId,
        message: "Only conceptOnly transforms may explicitly use concept-only product status.",
      });
    }
  }

  return issues;
}

export function assertValidReactionRegistry(rules: ReactionRule[]): void {
  const issues = validateReactionRegistry(rules);

  if (issues.length === 0) return;

  const message = issues
    .map((issue) => `${issue.ruleId ?? "registry"}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid reaction registry:\n${message}`);
}
