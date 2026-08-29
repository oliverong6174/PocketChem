import { analyzeFunctionalGroupHierarchy } from "../../functionalGroups";
import type { FunctionalGroupResult } from "../../functionalGroups";
import type { ReactionComponent } from "../reactionTypes";

function nextRGroupMapFactory() {
  let next = 1;
  return (requested?: string) => {
    const parsed = requested ? Number.parseInt(requested, 10) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      next = Math.max(next, parsed + 1);
      return parsed;
    }
    return next++;
  };
}

/**
 * Ketcher can emit wildcard atoms directly, while pseudo/R-group labels may
 * appear as R, R1, [R], or [R1] depending on how the structure was entered.
 * RDKit understands wildcard atoms, so normalize the common label forms to
 * mapped wildcard atoms and leave existing `*`/`[*:n]` atoms untouched.
 */
export function normalizeKetcherRGroups(smiles: string): string {
  const allocateMap = nextRGroupMapFactory();

  let normalized = smiles.trim();

  normalized = normalized.replace(/\[R(\d*)\]/g, (_match, number: string) => {
    return `[*:${allocateMap(number || undefined)}]`;
  });

  normalized = normalized.replace(
    /(^|[.()=#+\-])R(\d+)(?=$|[.()=#+\-])/g,
    (_match, prefix: string, number: string) =>
      `${prefix}[*:${allocateMap(number)}]`
  );

  normalized = normalized.replace(
    /(^|[.()=#+\-])R(?=$|[.()=#+\-])/g,
    (_match, prefix: string) => `${prefix}[*:${allocateMap()}]`
  );

  return normalized;
}

export function splitReactionComponents(smiles: string): string[] {
  return normalizeKetcherRGroups(smiles)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isGenericReactionSmiles(smiles: string): boolean {
  const normalized = normalizeKetcherRGroups(smiles);
  return normalized.includes("*");
}

export async function analyzeReactionComponents(
  smiles: string,
  singleReactantFunctionalGroups: FunctionalGroupResult[] = []
): Promise<ReactionComponent[]> {
  const componentSmiles = splitReactionComponents(smiles);

  const components: ReactionComponent[] = [];

  for (let index = 0; index < componentSmiles.length; index += 1) {
    const component = componentSmiles[index];
    let functionalGroups: FunctionalGroupResult[] = [];

    if (componentSmiles.length === 1 && singleReactantFunctionalGroups.length > 0) {
      functionalGroups = singleReactantFunctionalGroups;
    } else {
      try {
        const hierarchy = await analyzeFunctionalGroupHierarchy(component);
        functionalGroups = hierarchy.primaryGroups ?? [];
      } catch (error) {
        console.warn("Reaction component analysis failed:", component, error);
      }
    }

    components.push({
      smiles: component,
      functionalGroups,
      isGeneric: isGenericReactionSmiles(component),
    });
  }

  return components;
}
