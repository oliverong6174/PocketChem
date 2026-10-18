import type {
  MultistepSynthesisRoute,
  RouteInventoryEntry,
  RouteLeftoverSpecies,
  RouteStepDependency,
  RouteTargetLineage,
  RouteVerificationOptions,
  ReactionPathway,
  ReactionRule,
  RouteMatchLevel,
  RouteStepReactantCheck,
  RouteStepVerification,
  RouteVerification,
  RouteVerificationStatus,
} from "../reactionTypes";
import { resolveReactantRequirement } from "../profiles/reactants";
import { predictReactionPathwaysFromRules } from "./reactionEngine";
import { splitReactionComponents } from "./reactionInput";
import { canonicalizeStereoStructure } from "./stereochemistry";

/**
 * End-to-end route replay.
 *
 * The planner builds a route from a forward half and a retrosynthetic half
 * that are each individually plausible. This replays the finished route as one
 * synthesis: the only materials that exist are the supplied starting
 * materials plus what earlier steps actually produced, each step's rule is
 * run again on those materials, and the result must reproduce the recorded
 * product and finally the target.
 */

type Species = {
  /** Stable lot id: `sm<index>#<copy>` for supplied copies, `s<step>.<n>` for products. */
  id: string;
  smiles: string;
  isomeric: string;
  connectivity: string;
  origin: "starting-material" | "earlier-step";
  producedByStep: number | null;
  /**
   * True when this structure is one member of a stereo mixture (or was made
   * from one), so it is only a representative, never an enantiopure product.
   */
  fromMixture: boolean;
  /** Indices of the supplied starting materials this species descends from. */
  lineage: number[];
  /** Lots consumed to make this species (empty for supplied materials). */
  parents: Species[];
  /** Component index and copy number, for supplied lots. */
  supply: { startIndex: number; copy: number } | null;
};

type Identity = { isomeric: string; connectivity: string };

async function identity(smiles: string): Promise<Identity | null> {
  try {
    const structure = await canonicalizeStereoStructure(smiles);
    return structure
      ? { isomeric: structure.isomeric, connectivity: structure.connectivity }
      : null;
  } catch {
    return null;
  }
}

function matchLevel(a: Identity, b: Identity): RouteMatchLevel {
  if (a.isomeric === b.isomeric) return "exact";
  if (a.connectivity === b.connectivity) return "connectivity";
  return "none";
}

async function identities(smiles: string[]): Promise<(Identity | null)[]> {
  return Promise.all(smiles.map(identity));
}

function sortedKey(values: string[]): string {
  return [...values].sort().join(".");
}

/** Best match of a recorded product against one replayed pathway. */
async function compareProduct(
  recorded: Identity[],
  pathway: ReactionPathway,
): Promise<RouteMatchLevel> {
  if (!pathway.productSmiles) return "none";
  const produced = (await identities(splitReactionComponents(pathway.productSmiles))).filter(
    (item): item is Identity => item !== null,
  );

  if (sortedKey(produced.map((p) => p.isomeric)) === sortedKey(recorded.map((p) => p.isomeric))) {
    return "exact";
  }
  if (
    sortedKey(produced.map((p) => p.connectivity)) ===
    sortedKey(recorded.map((p) => p.connectivity))
  ) {
    // Constitution agrees. If the pathway is one member of a stereo mixture
    // that contains the recorded member, that is a legitimate mixture member
    // rather than a stereochemical mismatch.
    const members = pathway.productMixture?.memberSmiles ?? [];
    if (members.length > 0) {
      const memberKeys = (await identities(members))
        .filter((item): item is Identity => item !== null)
        .map((item) => item.isomeric);
      if (recorded.every((item) => memberKeys.includes(item.isomeric))) return "mixture-member";
    }
    return "connectivity";
  }
  return "none";
}

const LEVEL_RANK: Record<RouteMatchLevel, number> = {
  exact: 3,
  "mixture-member": 2,
  connectivity: 1,
  none: 0,
};

function worstStatus(levels: RouteMatchLevel[], hasProblems: boolean): RouteVerificationStatus {
  if (hasProblems || levels.includes("none")) return "failed";
  return levels.every((level) => level === "exact") ? "verified" : "connectivity-only";
}

function copiesFor(options: RouteVerificationOptions | undefined, index: number): number {
  const requested = options?.startingMaterialCopies;
  const value = Array.isArray(requested) ? requested[index] : requested;
  return Number.isInteger(value) && (value as number) >= 1 ? (value as number) : 1;
}

function mergeLineage(lots: Species[]): number[] {
  return [...new Set(lots.flatMap((lot) => lot.lineage))].sort((a, b) => a - b);
}

export async function verifyMultistepRoute(
  route: MultistepSynthesisRoute,
  rules: ReactionRule[],
  options?: RouteVerificationOptions,
): Promise<RouteVerification> {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const problems: string[] = [];
  const stepResults: RouteStepVerification[] = [];

  const pool: Species[] = [];
  const startComponents = splitReactionComponents(route.startingSmiles);
  const inventoryLots: Species[][] = [];
  for (let startIndex = 0; startIndex < startComponents.length; startIndex += 1) {
    const smiles = startComponents[startIndex];
    const id = await identity(smiles);
    inventoryLots.push([]);
    if (!id) {
      problems.push(`Starting material "${smiles}" could not be parsed.`);
      continue;
    }
    // Each copy is its own lot with the same structure; a lot is consumed once.
    for (let copy = 1; copy <= copiesFor(options, startIndex); copy += 1) {
      const lot: Species = {
        id: `sm${startIndex}#${copy}`,
        smiles,
        ...id,
        origin: "starting-material",
        producedByStep: null,
        fromMixture: false,
        lineage: [startIndex],
        parents: [],
        supply: { startIndex, copy },
      };
      pool.push(lot);
      inventoryLots[startIndex].push(lot);
    }
  }
  const allStarting = [...pool];
  const consumedBy = new Map<Species, number>();
  const allSpecies: Species[] = [...pool];
  const stepDependencies: RouteStepDependency[] = [];

  for (let index = 0; index < route.steps.length; index += 1) {
    const step = route.steps[index];
    const stepNumber = index + 1;
    const stepProblems: string[] = [];
    const reactantChecks: RouteStepReactantCheck[] = [];
    const levels: RouteMatchLevel[] = [];

    const rule = ruleById.get(step.ruleId);
    if (!rule) {
      stepResults.push({
        stepNumber,
        ruleId: step.ruleId,
        status: "failed",
        reactants: [],
        productMatch: "none",
        problems: [`Rule "${step.ruleId}" is not in the reaction registry.`],
      });
      problems.push(`Step ${stepNumber}: unknown rule "${step.ruleId}".`);
      break;
    }

    // Reagents the rule itself supplies (auto presets such as a hindered
    // base) are conditions, not structural reactants the route must provide.
    const rulePresets: Identity[] = [];
    for (const requirement of (rule.additionalReactants ?? []).map(resolveReactantRequirement)) {
      if (requirement.supplyMode !== "auto" || !requirement.presetSmiles) continue;
      const preset = await identity(requirement.presetSmiles);
      if (preset) rulePresets.push(preset);
    }
    let ruleSupplied = 0;

    // 1. Locate every reactant in the running state; never invent one.
    const located: Species[] = [];
    const wanted =
      step.reactantComponents.length > 0
        ? step.reactantComponents
        : splitReactionComponents(step.reactantSmiles);
    const namedLots =
      step.reactantLotIds && step.reactantLotIds.length === wanted.length
        ? step.reactantLotIds
        : null;
    for (let wantedIndex = 0; wantedIndex < wanted.length; wantedIndex += 1) {
      const smiles = wanted[wantedIndex];
      const id = await identity(smiles);
      if (!id) {
        stepProblems.push(`Reactant "${smiles}" could not be parsed.`);
        reactantChecks.push({ smiles, origin: "missing", match: "none" });
        continue;
      }

      const available = pool.filter((item) => !located.includes(item));
      let hit: Species | null;
      let level: RouteMatchLevel;
      const namedId = namedLots?.[wantedIndex];
      if (namedId) {
        // Provenance was recorded: only that exact lot may serve this reactant.
        const named = allSpecies.find((item) => item.id === namedId) ?? null;
        const lotMatch = named ? matchLevel(named, id) : "none";
        if (named && available.includes(named) && lotMatch !== "none") {
          hit = named;
          level = lotMatch;
        } else if (named && consumedBy.has(named)) {
          stepProblems.push(
            `Reactant "${smiles}" names lot ${namedId}, which was already consumed by step ${consumedBy.get(named)} and cannot be reused.`,
          );
          reactantChecks.push({ smiles, origin: "already-consumed", match: "none", lotId: namedId });
          levels.push("none");
          continue;
        } else {
          stepProblems.push(
            named
              ? `Reactant "${smiles}" names lot ${namedId}, but that lot is "${named.smiles}".`
              : `Reactant "${smiles}" names lot ${namedId}, which does not exist at this point in the route.`,
          );
          reactantChecks.push({ smiles, origin: "missing", match: "none", lotId: namedId });
          levels.push("none");
          continue;
        }
      } else {
        hit = available.find((item) => item.isomeric === id.isomeric) ?? null;
        level = hit ? "exact" : "none";
        if (!hit) {
          hit = available.find((item) => item.connectivity === id.connectivity) ?? null;
          if (hit) level = "connectivity";
        }
      }

      if (!hit) {
        const preset = rulePresets.find((item) => item.isomeric === id.isomeric);
        if (preset) {
          ruleSupplied += 1;
          reactantChecks.push({ smiles, origin: "rule-supplied-reagent", match: "exact" });
          continue;
        }
        // Distinguish "used up earlier" from "never existed".
        const consumed = [...consumedBy.keys()].find(
          (item) => item.connectivity === id.connectivity,
        );
        if (consumed) {
          const copies = allSpecies.filter(
            (item) => item.supply && item.connectivity === id.connectivity,
          ).length;
          stepProblems.push(
            `Reactant "${smiles}" was already consumed by step ${consumedBy.get(consumed)} and cannot be reused${
              copies > 0 ? ` (only ${copies} cop${copies === 1 ? "y" : "ies"} supplied)` : ""
            }.`,
          );
          reactantChecks.push({ smiles, origin: "already-consumed", match: "none" });
        } else {
          stepProblems.push(
            `Reactant "${smiles}" is neither a supplied starting material nor a product of an earlier step.`,
          );
          reactantChecks.push({ smiles, origin: "missing", match: "none" });
        }
        levels.push("none");
        continue;
      }

      if (level === "connectivity") {
        stepProblems.push(
          `Reactant "${smiles}" matches available "${hit.smiles}" only by connectivity (stereochemistry differs).`,
        );
      }
      located.push(hit);
      levels.push(level);
      reactantChecks.push({
        smiles,
        origin: hit.origin,
        match: level,
        lotId: hit.id,
        lineage: [...hit.lineage],
      });
    }

    // 2. Replay the rule on the materials that actually exist.
    let productMatch: RouteMatchLevel = "none";
    let replayedProductSmiles: string | null = null;
    if (located.length + ruleSupplied === wanted.length && located.length > 0) {
      const recorded = (
        await identities(
          step.productComponents.length > 0
            ? step.productComponents
            : splitReactionComponents(step.productSmiles),
        )
      ).filter((item): item is Identity => item !== null);

      let pathways: ReactionPathway[] = [];
      try {
        pathways = await predictReactionPathwaysFromRules(
          located.map((item) => item.smiles).join("."),
          [],
          [rule],
          { planning: true },
        );
      } catch (error) {
        stepProblems.push(
          `Replaying "${step.ruleId}" failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      let bestPathway: ReactionPathway | null = null;
      for (const pathway of pathways) {
        const level = await compareProduct(recorded, pathway);
        if (LEVEL_RANK[level] > LEVEL_RANK[productMatch]) {
          productMatch = level;
          bestPathway = pathway;
          if (level === "exact") break;
        }
      }

      if (productMatch === "none") {
        stepProblems.push(
          `Replaying "${step.ruleId}" on the available materials does not produce the recorded product "${step.productSmiles}".`,
        );
      } else if (productMatch === "connectivity") {
        stepProblems.push(
          `The replayed product matches "${step.productSmiles}" only by connectivity (stereochemistry differs).`,
        );
      }
      // Carry the recorded product for mixture members (the route claims that
      // member); otherwise carry what the rule actually produced.
      replayedProductSmiles =
        productMatch === "mixture-member" || !bestPathway?.productSmiles
          ? step.productSmiles
          : bestPathway.productSmiles;
    } else {
      stepProblems.push("The step could not be replayed because a reactant is unavailable.");
    }
    levels.push(productMatch);

    // 3. Update the running state with what was consumed and produced.
    for (const species of located) {
      pool.splice(pool.indexOf(species), 1);
      consumedBy.set(species, stepNumber);
    }
    const producedHere: Species[] = [];
    if (replayedProductSmiles) {
      const mixtureProduct =
        Boolean(step.productMixture && step.productMixture.memberCount > 1) ||
        located.some((item) => item.fromMixture);
      const lineage = mergeLineage(located);
      for (const smiles of splitReactionComponents(replayedProductSmiles)) {
        const id = await identity(smiles);
        if (id) {
          const species: Species = {
            id: `s${stepNumber}.${producedHere.length + 1}`,
            smiles,
            ...id,
            origin: "earlier-step",
            producedByStep: stepNumber,
            fromMixture: mixtureProduct,
            lineage,
            parents: [...located],
            supply: null,
          };
          pool.push(species);
          allSpecies.push(species);
          producedHere.push(species);
        }
      }
    }
    stepDependencies.push({
      stepNumber,
      consumedLotIds: located.map((item) => item.id),
      producedLotIds: producedHere.map((item) => item.id),
      dependsOnSteps: [
        ...new Set(
          located
            .map((item) => item.producedByStep)
            .filter((value): value is number => value !== null),
        ),
      ].sort((a, b) => a - b),
    });

    const hardProblems = stepProblems.filter(
      (message) => !message.includes("only by connectivity"),
    );
    const status = worstStatus(levels, hardProblems.length > 0);
    stepResults.push({
      stepNumber,
      ruleId: step.ruleId,
      status,
      reactants: reactantChecks,
      productMatch,
      problems: stepProblems,
    });
    for (const message of stepProblems) problems.push(`Step ${stepNumber}: ${message}`);
    if (status === "failed") break;
  }

  // 4. The final state must contain the target.
  const target = await identity(route.targetSmiles);
  let targetMatch: RouteMatchLevel = "none";
  let matchedSpecies: Species | null = null;
  if (!target) {
    problems.push(`Target "${route.targetSmiles}" could not be parsed.`);
  } else {
    const lastStep = stepResults[stepResults.length - 1];
    const finishedCleanly = route.steps.length === stepResults.length && lastStep?.status !== "failed";
    if (finishedCleanly || route.steps.length === 0) {
      const targetHasStereo = /[@/\\]/.test(target.isomeric);
      for (const species of pool) {
        let level = matchLevel(species, target);
        // An exact structure that only exists as a mixture member is not a
        // stereochemically pure product of the route.
        if (level === "exact" && species.fromMixture && targetHasStereo) level = "mixture-member";
        if (LEVEL_RANK[level] > LEVEL_RANK[targetMatch]) {
          targetMatch = level;
          matchedSpecies = species;
        }
      }
      // A target that is a recorded member of the last step's product mixture.
      const lastRouteStep = route.steps[route.steps.length - 1];
      if (
        targetMatch === "connectivity" &&
        lastRouteStep?.productMixture?.memberSmiles.length
      ) {
        const members = (await identities(lastRouteStep.productMixture.memberSmiles)).filter(
          (item): item is Identity => item !== null,
        );
        if (members.some((item) => item.isomeric === target.isomeric)) {
          targetMatch = "mixture-member";
        }
      }
    }
    if (targetMatch === "none" && (finishedCleanly || route.steps.length === 0)) {
      problems.push("The replayed synthesis does not contain the target structure.");
    } else if (targetMatch === "connectivity") {
      problems.push(
        "The target is reached only by connectivity: stereochemistry differs from the requested target.",
      );
    } else if (targetMatch === "mixture-member") {
      problems.push(
        "The target is one member of a stereoisomeric/racemic product mixture, not a stereochemically pure product.",
      );
    }
  }

  const stepStatuses = stepResults.map((step) => step.status);
  let status: RouteVerificationStatus;
  if (stepStatuses.includes("failed") || targetMatch === "none") status = "failed";
  else if (
    stepStatuses.includes("connectivity-only") ||
    targetMatch !== "exact" ||
    stepResults.some((step) => step.productMatch !== "exact")
  ) {
    status = "connectivity-only";
  } else status = "verified";

  const inventory: RouteInventoryEntry[] = inventoryLots.map((lots, startIndex) => ({
    startIndex,
    smiles: startComponents[startIndex],
    copies: lots.length,
    consumed: lots.filter((lot) => consumedBy.has(lot)).length,
    lotIds: lots.map((lot) => lot.id),
    consumedByStep: lots.map((lot) => consumedBy.get(lot) ?? null),
  }));
  const leftovers: RouteLeftoverSpecies[] = pool.map((item) => ({
    lotId: item.id,
    smiles: item.smiles,
    origin: item.origin,
    producedByStep: item.producedByStep,
    lineage: [...item.lineage],
    fromMixture: item.fromMixture,
  }));
  const targetLineage = matchedSpecies
    ? describeTargetLineage(matchedSpecies, route.steps.length)
    : null;

  return {
    status,
    steps: stepResults,
    targetMatch,
    coproducts: pool
      .filter((item) => item.origin === "earlier-step" && item !== matchedSpecies)
      .map((item) => item.smiles),
    unusedStartingMaterials: allStarting
      .filter((item) => !consumedBy.has(item))
      .map((item) => item.smiles),
    problems,
    inventory,
    leftovers,
    stepDependencies,
    targetLineage,
  };
}

/** Walks consumption back from the matched target to find what actually feeds it. */
function describeTargetLineage(target: Species, stepCount: number): RouteTargetLineage {
  const steps = new Set<number>();
  const depth = new Map<number, number>();
  const walk = (species: Species): number => {
    if (species.producedByStep === null) return 0;
    steps.add(species.producedByStep);
    const cached = depth.get(species.producedByStep);
    if (cached !== undefined) return cached;
    const value = 1 + Math.max(0, ...species.parents.map(walk));
    depth.set(species.producedByStep, value);
    return value;
  };
  const longest = walk(target);
  return {
    lotId: target.id,
    startingMaterialIndices: [...target.lineage],
    contributingSteps: [...steps].sort((a, b) => a - b),
    unusedSteps: Array.from({ length: stepCount }, (_unused, index) => index + 1).filter(
      (number) => !steps.has(number),
    ),
    longestLinearSequence: longest,
  };
}
