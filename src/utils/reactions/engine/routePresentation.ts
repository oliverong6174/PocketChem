import type { MultistepSynthesisRoute } from "../reactionTypes";

/**
 * Branch structure of a verified route, read ONLY from the replay metadata
 * (`stepDependencies`, `steps[].reactants`, `targetLineage`). When that metadata
 * is absent the structure is "unknown" and nothing is inferred: the UI then shows
 * the ordinary linear step list.
 */
export type RouteJoin = {
  /** The step that consumes the products of two or more independent branches. */
  step: number;
  branches: Array<{ steps: number[]; startingMaterials: number[] }>;
};

export type RouteStructure = {
  kind: "linear" | "convergent" | "unknown";
  joins: RouteJoin[];
  /** Per step number: where each of its inputs came from, in words. */
  stepInputs: Record<number, string[]>;
  /** Steps whose products never feed the matched target. */
  unusedSteps: number[];
};

export function describeRouteStructure(route: MultistepSynthesisRoute): RouteStructure {
  const verification = route.verification;
  const dependencies = verification?.stepDependencies;
  if (!verification || !dependencies || dependencies.length === 0) {
    return { kind: "unknown", joins: [], stepInputs: {}, unusedSteps: [] };
  }

  const dependsOn = new Map(dependencies.map((item) => [item.stepNumber, item.dependsOnSteps]));
  const producerOfLot = new Map<string, number>();
  for (const item of dependencies) for (const lotId of item.producedLotIds) producerOfLot.set(lotId, item.stepNumber);

  const closure = (step: number): Set<number> => {
    const seen = new Set<number>();
    const visit = (at: number) => {
      if (seen.has(at)) return;
      seen.add(at);
      for (const earlier of dependsOn.get(at) ?? []) visit(earlier);
    };
    visit(step);
    return seen;
  };

  const startingMaterialsOf = (steps: Set<number>): number[] => {
    const indices = new Set<number>();
    for (const check of verification.steps) {
      if (!steps.has(check.stepNumber)) continue;
      for (const reactant of check.reactants) {
        if (reactant.origin === "starting-material") for (const index of reactant.lineage ?? []) indices.add(index);
      }
    }
    return [...indices].sort((a, b) => a - b);
  };

  const joins: RouteJoin[] = [];
  for (const item of dependencies) {
    if (item.dependsOnSteps.length < 2) continue;
    const parts = item.dependsOnSteps.map((step) => closure(step));
    const independent = parts.every((part, at) =>
      parts.every((other, to) => at === to || [...part].every((step) => !other.has(step))),
    );
    if (!independent) continue;
    joins.push({
      step: item.stepNumber,
      branches: parts.map((part) => ({
        steps: [...part].sort((a, b) => a - b),
        startingMaterials: startingMaterialsOf(part),
      })),
    });
  }

  const stepInputs: Record<number, string[]> = {};
  for (const check of verification.steps) {
    const inputs: string[] = [];
    for (const reactant of check.reactants) {
      if (reactant.origin === "starting-material") {
        const index = reactant.lineage?.[0];
        inputs.push(index === undefined ? "a supplied starting material" : `supplied starting material ${index + 1}`);
      } else if (reactant.origin === "earlier-step") {
        const producer = reactant.lotId ? producerOfLot.get(reactant.lotId) : undefined;
        if (producer !== undefined) inputs.push(`product of step ${producer}`);
      } else if (reactant.origin === "rule-supplied-reagent") {
        inputs.push("a reagent the reaction rule supplies");
      }
    }
    if (inputs.length > 0) stepInputs[check.stepNumber] = inputs;
  }

  return {
    kind: joins.length > 0 ? "convergent" : "linear",
    joins,
    stepInputs,
    unusedSteps: verification.targetLineage?.unusedSteps ?? [],
  };
}
