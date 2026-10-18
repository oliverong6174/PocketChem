import type {
  MultistepSynthesisProgress,
  MultistepSynthesisRoute,
  MultistepSynthesisSearchOptions,
  ReactionPathway,
  ReactionProductMixtureKind,
  ReactionRule,
  RetrosynthesisPathway,
  SynthesisStep,
} from "../reactionTypes";
import {
  isGenericReactionSmiles,
  normalizeKetcherRGroups,
  splitReactionComponents,
} from "./reactionInput";
import { predictReactionPathwaysFromRules } from "./reactionEngine";
import { predictRetrosynthesisPathwaysFromRules } from "./retroSynthesis";
import { verifyMultistepRoute } from "./routeVerification";
import { searchConvergentRoutesCore, type ConvergentSearchResult } from "./convergentSearch";
import {
  canonicalizeStereoStructure,
  compareStereoStructureKeys,
  type CanonicalStereoStructure,
} from "./stereochemistry";
import {
  closestPlanningDistance,
  getPlanningSignature,
  planningSignatureDistance,
  type PlanningSignature,
} from "./planningHeuristics";

const DEFAULT_MAX_STEPS = 7;
const DEFAULT_BEAM_WIDTH = 10;
const DEFAULT_BRANCH_LIMIT = 18;
const DEFAULT_MAX_ROUTES = 4;
const PLANNING_HEURISTIC_SCALE = 8;

type StartingMaterial = {
  smiles: string;
  canonical: string;
  connectivity: string;
  hasSpecifiedStereo: boolean;
};

type SearchNode = {
  smiles: string;
  canonical: string;
  connectivity: string;
  hasSpecifiedStereo: boolean;
  stereoMixture: ReactionProductMixtureKind | null;
  /**
   * Exact isomeric SMILES known to belong to the same stereochemical product
   * mixture as this node. This lets a racemate satisfy a user-drawn enantiomer
   * without pretending the reaction is enantiopure.
   */
  stereoMixtureMembers: string[] | null;
  depth: number;
  /** Accumulated executed reaction/representation cost (g in A* terminology). */
  pathCost: number;
  /** Goal-distance estimate used only to order search work (h in A* terminology). */
  heuristic: number;
  /** pathCost + heuristic plus bridge bonuses; lower is explored first. */
  rank: number;
  steps: SynthesisStep[];
  history: string[];
  usedStartingMaterialIndices: number[];
};

type ProgressCallback = (progress: MultistepSynthesisProgress) => void;

function frontierDiagnosticFields(
  nodes: SearchNode[],
  targetCanonical: string,
  startingMaterialCount: number,
): Pick<
  MultistepSynthesisProgress,
  | "frontierSample"
  | "exactTargetCount"
  | "targetMixtureMemberCount"
  | "fullyConsumedStartingMaterialCount"
  | "frontierRuleSummary"
> {
  const ranked = [...nodes].sort(
    (a, b) =>
      a.rank - b.rank ||
      a.pathCost - b.pathCost ||
      a.canonical.localeCompare(b.canonical),
  );

  const ruleSummary = new Map<
    string,
    {
      ruleId: string;
      title: string;
      count: number;
      bestRank: number;
      minUsedStartingMaterialCount: number;
      maxUsedStartingMaterialCount: number;
    }
  >();

  for (const node of ranked) {
    const lastStep = node.steps[node.steps.length - 1] ?? null;
    const ruleId = lastStep?.ruleId ?? "start";
    const usedCount = new Set(node.usedStartingMaterialIndices).size;
    const existing = ruleSummary.get(ruleId);

    if (!existing) {
      ruleSummary.set(ruleId, {
        ruleId,
        title: lastStep?.title ?? "Starting material",
        count: 1,
        bestRank: Math.round(node.rank * 100) / 100,
        minUsedStartingMaterialCount: usedCount,
        maxUsedStartingMaterialCount: usedCount,
      });
    } else {
      existing.count += 1;
      existing.bestRank = Math.min(
        existing.bestRank,
        Math.round(node.rank * 100) / 100,
      );
      existing.minUsedStartingMaterialCount = Math.min(
        existing.minUsedStartingMaterialCount,
        usedCount,
      );
      existing.maxUsedStartingMaterialCount = Math.max(
        existing.maxUsedStartingMaterialCount,
        usedCount,
      );
    }
  }

  return {
    frontierSample: ranked.slice(0, 8).map((node) => {
      const lastStep = node.steps[node.steps.length - 1] ?? null;
      return {
        smiles: node.canonical,
        depth: node.depth,
        rank: Math.round(node.rank * 100) / 100,
        lastRuleId: lastStep?.ruleId ?? null,
        lastStepTitle: lastStep?.title ?? null,
        usedStartingMaterialCount: new Set(
          node.usedStartingMaterialIndices,
        ).size,
        stereoMixture: node.stereoMixture,
      };
    }),
    exactTargetCount: nodes.filter(
      (node) => node.canonical === targetCanonical,
    ).length,
    targetMixtureMemberCount: nodes.filter((node) =>
      node.stereoMixtureMembers?.includes(targetCanonical),
    ).length,
    fullyConsumedStartingMaterialCount: nodes.filter(
      (node) =>
        new Set(node.usedStartingMaterialIndices).size >=
        startingMaterialCount,
    ).length,
    frontierRuleSummary: [...ruleSummary.values()].sort(
      (a, b) =>
        a.bestRank - b.bestRank ||
        a.ruleId.localeCompare(b.ruleId),
    ),
  };
}

function suppliedCarbonPoolAdjustment(
  candidate: PlanningSignature | null,
  target: PlanningSignature | null,
  usedStartingMaterialIndices: number[],
  startingPlanningSignatures: Array<PlanningSignature | null>,
): number {
  if (!candidate || !target || target.carbonCount <= 0) return 0;

  const used = new Set(usedStartingMaterialIndices);
  let remainingSuppliedCarbon = 0;
  for (let index = 0; index < startingPlanningSignatures.length; index += 1) {
    if (used.has(index)) continue;
    remainingSuppliedCarbon += startingPlanningSignatures[index]?.carbonCount ?? 0;
  }

  const potentialCarbon =
    candidate.carbonCount + remainingSuppliedCarbon;
  const mismatch = Math.abs(potentialCarbon - target.carbonCount);

  // Explicitly supplied carbon-bearing starting materials are strong planning
  // information. Reward a state whose current scaffold plus all still-unused
  // supplied carbon exactly accounts for the target skeleton, and penalize
  // branches that already overshoot/undershoot it. This is search ordering
  // only; it never blocks reactions that legitimately add/remove carbon.
  if (mismatch === 0) return -56;
  return Math.min(96, mismatch * 18);
}


function stereochemicalPlanningPenalty(
  pathway: Pick<ReactionPathway, "selectivityProfile" | "mechanism">,
  targetHasSpecifiedStereo: boolean,
): number {
  if (!targetHasSpecifiedStereo) return 0;

  const profile = pathway.selectivityProfile;
  if (!profile) return 0;

  const stereo = profile.stereochemistry;
  let penalty = 0;

  // Carbocation-forming/rearranging pathways are poor choices when a later
  // stereodefined target depends on a clean E/Z or facial relationship.
  if (profile.allowsRearrangement) {
    penalty += 80;
  }

  if (stereo && !stereo.stereospecific) {
    if (stereo.mode === "racemization") {
      penalty += 160;
    } else if (
      stereo.mode === "e-preferred" ||
      stereo.mode === "z-preferred"
    ) {
      // "Preferred" is not the same as stereospecific: an E1 dehydration can
      // give mostly E alkene while still carrying a Z contaminant that later
      // becomes a different diastereomer.
      penalty += 120;
    } else if (
      profile.mixture === "possible" ||
      profile.mixture === "expected"
    ) {
      penalty += 80;
    }
  }

  if (
    !stereo?.stereospecific &&
    profile.mixture === "possible"
  ) {
    penalty += 60;
  }

  return penalty;
}

function routeStereochemicalAmbiguityPenalty(
  route: MultistepSynthesisRoute,
  targetHasSpecifiedStereo: boolean,
): number {
  if (!targetHasSpecifiedStereo) return 0;

  return route.steps.reduce((sum, step) => {
    return (
      sum +
      stereochemicalPlanningPenalty(
        {
          selectivityProfile: step.selectivityProfile,
          mechanism: step.mechanism,
        },
        true,
      )
    );
  }, 0);
}

function searchCancelled(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

async function yieldToBrowser(signal?: AbortSignal): Promise<boolean> {
  if (searchCancelled(signal)) return false;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return !searchCancelled(signal);
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

const MAX_CANONICAL_CACHE = 1200;
const canonicalStructureCache = new Map<
  string,
  Promise<CanonicalStereoStructure | null>
>();

async function canonicalizeSmiles(
  smiles: string,
): Promise<CanonicalStereoStructure | null> {
  const normalized = normalizeKetcherRGroups(smiles);
  const cached = canonicalStructureCache.get(normalized);
  if (cached) return cached;

  const pending = canonicalizeStereoStructure(normalized).catch((error) => {
    canonicalStructureCache.delete(normalized);
    throw error;
  });
  canonicalStructureCache.set(normalized, pending);

  if (canonicalStructureCache.size > MAX_CANONICAL_CACHE) {
    const oldestKey = canonicalStructureCache.keys().next().value as string | undefined;
    if (oldestKey) canonicalStructureCache.delete(oldestKey);
  }

  return pending;
}

function retrosynthesisTierPenalty(
  tier: RetrosynthesisPathway["retrosynthesisTier"],
): number {
  // Tier is a strategic preference, not a validity decision. Preferred
  // textbook disconnections stay cheapest; specialized/secondary shortcuts
  // remain available but must earn their way into the beam.
  if (tier === "preferred") return 0;
  if (tier === "secondary") return 85;
  return 18;
}

function searchStateKey(node: SearchNode): string {
  const used = [...node.usedStartingMaterialIndices]
    .sort((a, b) => a - b)
    .join(",");
  const mixtureMembers = node.stereoMixtureMembers
    ? [...node.stereoMixtureMembers].sort().join("|")
    : "no-mixture-members";
  return `${node.canonical}::${node.stereoMixture ?? "pure-or-unspecified"}::${mixtureMembers}::${used}`;
}

function usedStartingMaterialsOverlap(a: SearchNode, b: SearchNode): boolean {
  const used = new Set(a.usedStartingMaterialIndices);
  return b.usedStartingMaterialIndices.some((index) => used.has(index));
}

function indexCombinations(indices: number[], size: number): number[][] {
  if (size <= 0) return [[]];
  if (size > indices.length) return [];
  const output: number[][] = [];
  const chosen: number[] = [];

  function visit(start: number): void {
    if (chosen.length === size) {
      output.push([...chosen]);
      return;
    }
    for (let i = start; i < indices.length; i += 1) {
      chosen.push(indices[i]);
      visit(i + 1);
      chosen.pop();
    }
  }

  visit(0);
  return output;
}

async function pathwayConsumesSuppliedMaterials(
  pathway: ReactionPathway,
  parent: SearchNode,
  suppliedIndices: number[],
  startingMaterials: StartingMaterial[],
): Promise<boolean> {
  if (suppliedIndices.length === 0) return true;

  const remainingComponents = [...pathway.reactantComponents];
  const parentIndex = await (async () => {
    for (let i = 0; i < remainingComponents.length; i += 1) {
      const structure = await canonicalizeSmiles(remainingComponents[i]);
      if (structure?.isomeric === parent.canonical) return i;
    }
    return -1;
  })();

  // CRITICAL: a combined search input may contain the current intermediate
  // plus one or more still-unused supplied starting materials. The reaction
  // engine is also allowed to return single-substrate pathways for one member
  // of that combined canvas. If the chosen pathway did NOT actually consume
  // the current parent intermediate, it is not a valid continuation of this
  // search node and must be rejected.
  //
  // Previously we only checked that the newly supplied material appeared in
  // pathway.reactantComponents. That allowed a reaction on the supplied
  // molecule alone to "teleport" over the parent while marking BOTH starting
  // materials consumed.
  if (parentIndex < 0) return false;

  remainingComponents.splice(parentIndex, 1);

  for (const startingIndex of suppliedIndices) {
    const wanted = startingMaterials[startingIndex]?.canonical;
    if (!wanted) return false;

    let matchedIndex = -1;
    for (let i = 0; i < remainingComponents.length; i += 1) {
      const structure = await canonicalizeSmiles(remainingComponents[i]);
      if (structure?.isomeric === wanted) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex < 0) return false;
    remainingComponents.splice(matchedIndex, 1);
  }

  return true;
}

async function matchStartingMaterialSideReactants(
  sideComponents: string[],
  startingMaterials: StartingMaterial[],
  alreadyUsed: number[],
  signal?: AbortSignal,
): Promise<number[] | null> {
  const unavailable = new Set(alreadyUsed);
  const allocated: number[] = [];

  for (const sideComponent of sideComponents) {
    if (searchCancelled(signal)) return null;

    // Retrosynthetic precursorComponents are structural precursors reconstructed
    // from the target. Do not guess whether they matter from their elemental
    // composition (for example CN-, CO2, or other small atom-donating partners).
    const structure = await canonicalizeSmiles(sideComponent);
    if (!structure) return null;

    const matchIndex = startingMaterials.findIndex(
      (reactant, index) =>
        !unavailable.has(index) &&
        !allocated.includes(index) &&
        reactant.canonical === structure.isomeric,
    );

    if (matchIndex < 0) return null;
    allocated.push(matchIndex);
  }

  return allocated;
}

function forwardStepFromPathway(pathway: ReactionPathway): SynthesisStep | null {
  if (!pathway.productSmiles) return null;

  return {
    id: `${pathway.id}--synthesis-forward`,
    stepNumber: 0,
    source: "forward-search",
    ruleId: pathway.ruleId,
    family: pathway.family,
    reactionType: pathway.reactionType,
    title: pathway.title,
    reactantSmiles: pathway.reactantSmiles,
    reactantComponents: pathway.reactantComponents,
    reactantLabel: pathway.reactantLabel,
    productSmiles: pathway.productSmiles,
    productComponents: splitReactionComponents(pathway.productSmiles),
    productLabel: pathway.productLabel,
    reagentLabel: pathway.reagentLabel,
    reagentNote: pathway.reagentNote,
    shortExplanation: pathway.shortExplanation,
    course: pathway.course,
    chapter: pathway.chapter,
    mechanism: pathway.mechanism,
    reactionClass: pathway.reactionClass,
    purpose: pathway.purpose,
    selectivity: pathway.selectivity,
    selectivityProfile: pathway.selectivityProfile,
    selectivityAssessment: pathway.selectivityAssessment ?? null,
    limitations: pathway.limitations,
    retrosynthesisConfidence: null,
    productMixture: pathway.productMixture,
    display: pathway.display,
  };
}

function retroStepFromPathway(pathway: RetrosynthesisPathway): SynthesisStep {
  return {
    id: `${pathway.id}--synthesis-retro`,
    stepNumber: 0,
    source: "retrosynthesis-search",
    ruleId: pathway.ruleId,
    family: pathway.family,
    reactionType: pathway.reactionType,
    title: pathway.title,
    reactantSmiles: pathway.precursorSmiles,
    reactantComponents: pathway.precursorComponents,
    reactantLabel: pathway.precursorLabel,
    productSmiles: pathway.targetSmiles,
    productComponents: splitReactionComponents(pathway.targetSmiles),
    productLabel: pathway.targetLabel,
    reagentLabel: pathway.reagentLabel,
    reagentNote: pathway.reagentNote,
    shortExplanation: pathway.shortExplanation,
    course: pathway.course,
    chapter: pathway.chapter,
    mechanism: pathway.mechanism,
    reactionClass: pathway.reactionClass,
    purpose: pathway.purpose,
    selectivity: pathway.selectivity,
    selectivityProfile: pathway.selectivityProfile,
    selectivityAssessment: pathway.selectivityAssessment ?? null,
    limitations: pathway.limitations,
    retrosynthesisConfidence: pathway.confidence,
    productMixture: pathway.productMixture,
    display: pathway.display,
  };
}

function nodeStructure(node: SearchNode): CanonicalStereoStructure {
  return {
    isomeric: node.canonical,
    connectivity: node.connectivity,
    hasSpecifiedStereo: node.hasSpecifiedStereo,
  };
}

function propagatedStereoMixture(
  parent: SearchNode,
  step: SynthesisStep,
  product: CanonicalStereoStructure,
): ReactionProductMixtureKind | null {
  // If the reaction destroys every currently specified stereogenic element,
  // the former stereochemical mixture has converged to one achiral/unspecified
  // structure and no longer blocks a later exact target match.
  if (!product.hasSpecifiedStereo) return null;

  if (step.productMixture) return step.productMixture.kind;

  // A later stereospecific transformation of a racemate still operates on
  // both members. Conservatively keep mixture provenance until a reaction
  // explicitly removes the stereochemical distinction.
  if (parent.stereoMixture) {
    return parent.stereoMixture === "racemic"
      ? "stereoisomeric"
      : parent.stereoMixture;
  }

  return null;
}

function searchNodesCanMeet(
  forwardNode: SearchNode,
  retroNode: SearchNode,
): boolean {
  const match = compareStereoStructureKeys(
    nodeStructure(forwardNode),
    nodeStructure(retroNode),
  );
  if (match === "exact") {
    // Exact member matching is chemically useful even when that member is part
    // of a racemate/stereoisomeric mixture. Route confidence is downgraded
    // later so an exact member is not mistaken for an enantiopure product.
    return true;
  }

  if (match !== "connectivity-only") return false;

  // If a reaction generated a stereochemical mixture and the exact user-drawn
  // stereoisomer is explicitly one of that mixture's members, the route is
  // chemically valid. It will be marked connectivity-verified later so this is
  // never presented as an enantiopure synthesis.
  if (forwardNode.stereoMixture && retroNode.hasSpecifiedStereo) {
    return Boolean(
      forwardNode.stereoMixtureMembers?.includes(retroNode.canonical),
    );
  }

  if (retroNode.stereoMixture && forwardNode.hasSpecifiedStereo) {
    return Boolean(
      retroNode.stereoMixtureMembers?.includes(forwardNode.canonical),
    );
  }

  return true;
}

function keepBestNodes(nodes: SearchNode[], beamWidth: number): SearchNode[] {
  const bestByState = new Map<string, SearchNode>();

  for (const node of nodes) {
    const key = searchStateKey(node);
    const existing = bestByState.get(key);
    if (!existing || node.rank < existing.rank) {
      bestByState.set(key, node);
    }
  }

  /*
   * A catalog display priority is not a chemical plausibility score. The beam
   * therefore keeps pathway diversity instead of allowing one low-numbered
   * reaction pathway to occupy the entire frontier. Rule-level diversity is
   * important because several chemically distinct aromatic steps share the
   * same broad `aromatics` family.
   */
  const ranked = [...bestByState.values()].sort(
    (a, b) =>
      a.rank - b.rank ||
      a.pathCost - b.pathCost ||
      a.canonical.localeCompare(b.canonical),
  );

  if (ranked.length <= beamWidth) return ranked;

  const selected: SearchNode[] = [];
  const selectedStates = new Set<string>();
  const seenFamilies = new Set<string>();

  for (const node of ranked) {
    const firstRule = node.steps[0]?.ruleId ?? "start";
    const lastRule = node.steps[node.steps.length - 1]?.ruleId ?? "start";
    const pathwayKey = `${firstRule}|${lastRule}`;
    if (seenFamilies.has(pathwayKey)) continue;

    selected.push(node);
    selectedStates.add(searchStateKey(node));
    seenFamilies.add(pathwayKey);
    if (selected.length >= beamWidth) return selected;
  }

  for (const node of ranked) {
    const stateKey = searchStateKey(node);
    if (selectedStates.has(stateKey)) continue;
    selected.push(node);
    selectedStates.add(stateKey);
    if (selected.length >= beamWidth) break;
  }

  return selected;
}

function knownStructureKeys(layers: SearchNode[][]): Set<string> {
  return new Set(layers.flatMap((layer) => layer.map((node) => node.canonical)));
}

type ForwardPredictionCache = Map<string, Promise<ReactionPathway[]>>;
type RetroPredictionCache = Map<string, Promise<RetrosynthesisPathway[]>>;
type LayerProgressCallback = (
  processed: number,
  total: number,
  candidateCount: number,
) => void;

function cachedForwardPredictions(
  inputSmiles: string,
  rules: ReactionRule[],
  cache: ForwardPredictionCache,
  signal?: AbortSignal,
  maxExecutedRules?: number,
): Promise<ReactionPathway[]> {
  const cacheKey = `${inputSmiles}::${maxExecutedRules ?? "all-rules"}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const pending = predictReactionPathwaysFromRules(
    inputSmiles,
    [],
    rules,
    { planning: true, signal, maxExecutedRules },
  ).catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, pending);
  return pending;
}

function cachedRetroPredictions(
  targetSmiles: string,
  rules: ReactionRule[],
  cache: RetroPredictionCache,
  maxResults: number,
  signal?: AbortSignal,
  maxRulesScanned?: number,
  maxTransformsExecuted?: number,
): Promise<RetrosynthesisPathway[]> {
  const cacheKey = `${targetSmiles}::${maxRulesScanned ?? "all"}::${maxResults}::${maxTransformsExecuted ?? "all-transforms"}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const pending = predictRetrosynthesisPathwaysFromRules(
    targetSmiles,
    rules,
    { planning: true, signal, maxResults, maxRulesScanned, maxTransformsExecuted },
  ).catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, pending);
  return pending;
}

function diversePathwaySample<
  T extends { family: string; planningCost: number; ruleId: string },
>(pathways: T[], limit: number): T[] {
  if (pathways.length <= limit) return pathways;

  const ranked = pathways.slice().sort(
    (a, b) =>
      a.planningCost - b.planningCost ||
      a.ruleId.localeCompare(b.ruleId),
  );

  const selected: T[] = [];
  const selectedIndices = new Set<number>();
  const seenRules = new Set<string>();

  // Preserve one representative from every distinct reaction rule before
  // allowing a rule that generated multiple regio-/stereoisomers to occupy
  // another slot. Broad-family diversity was too coarse: dozens of unrelated
  // alkene reactions all share family="alkenes", so an essential reaction
  // such as Br2 addition could disappear before synthesis even began.
  ranked.forEach((pathway, index) => {
    if (selected.length >= limit || seenRules.has(pathway.ruleId)) return;
    seenRules.add(pathway.ruleId);
    selected.push(pathway);
    selectedIndices.add(index);
  });

  for (let index = 0; index < ranked.length && selected.length < limit; index += 1) {
    if (selectedIndices.has(index)) continue;
    selected.push(ranked[index]);
  }

  return selected;
}

async function expandForwardLayer(
  parents: SearchNode[],
  rules: ReactionRule[],
  beamWidth: number,
  branchLimit: number,
  allowGeneric: boolean,
  targetStructure: CanonicalStereoStructure,
  targetPlanningSignature: PlanningSignature | null,
  preferredKeys: Set<string>,
  startingMaterials: StartingMaterial[],
  startingPlanningSignatures: Array<PlanningSignature | null>,
  predictionCache: ForwardPredictionCache,
  signal?: AbortSignal,
  onLayerProgress?: LayerProgressCallback,
  maxExecutedRules?: number,
  poolAwareCarbonBalance = false,
): Promise<SearchNode[]> {
  const candidates: SearchNode[] = [];

  for (let parentIndex = 0; parentIndex < parents.length; parentIndex += 1) {
    const parent = parents[parentIndex];
    if (!(await yieldToBrowser(signal))) return [];
    const reactionInputs: Array<{
      smiles: string;
      startingMaterialIndices: number[];
    }> = [{ smiles: parent.smiles, startingMaterialIndices: [] }];

    const availableIndices = startingMaterials
      .map((_material, index) => index)
      .filter((index) => !parent.usedStartingMaterialIndices.includes(index));
    const maxAdditionalStructures = Math.min(
      availableIndices.length,
      Math.max(
        1,
        ...rules.map((rule) => rule.additionalReactants?.length ?? 0),
      ),
    );

    for (let count = 1; count <= maxAdditionalStructures; count += 1) {
      for (const indices of indexCombinations(availableIndices, count)) {
        reactionInputs.push({
          smiles: [parent.smiles, ...indices.map((index) => startingMaterials[index].smiles)].join("."),
          startingMaterialIndices: indices,
        });
      }
    }

    for (const input of reactionInputs) {
      if (searchCancelled(signal)) return [];
      let pathways: ReactionPathway[] = [];
      try {
        pathways = await cachedForwardPredictions(
          input.smiles,
          rules,
          predictionCache,
          signal,
          maxExecutedRules,
        );
      } catch (error) {
        console.error("[PocketChem:Synthesis] Forward expansion failed for one intermediate; skipping it.", {
          intermediate: input.smiles,
          error,
        });
        continue;
      }
      if (!(await yieldToBrowser(signal))) return [];

      for (const pathway of diversePathwaySample(pathways, branchLimit)) {
        // A combined input is useful only when the chosen reaction actually
        // consumes both structures. This prevents a second disconnected
        // starting material from merely generating unrelated single-substrate
        // reactions.
        if (
          input.startingMaterialIndices.length > 0 &&
          !(await pathwayConsumesSuppliedMaterials(
            pathway,
            parent,
            input.startingMaterialIndices,
            startingMaterials,
          ))
        ) {
          continue;
        }

        const step = forwardStepFromPathway(pathway);
        if (!step || pathway.productStatus === "concept-only") continue;
        if (!allowGeneric && isGenericReactionSmiles(step.productSmiles)) continue;

        const productComponents = step.productComponents;
        for (let index = 0; index < productComponents.length; index += 1) {
          if (searchCancelled(signal)) return [];
          const continuation = productComponents[index];
          const structure = await canonicalizeSmiles(continuation);
          if (!structure || parent.history.includes(structure.isomeric)) continue;

          const nextStereoMixture = propagatedStereoMixture(
            parent,
            step,
            structure,
          );
          const exactTarget = structure.isomeric === targetStructure.isomeric;
          const mixtureContainsTarget = Boolean(
            step.productMixture?.memberSmiles.includes(targetStructure.isomeric),
          );

          // A racemate/stereoisomeric product is a valid synthetic endpoint
          // when the exact user-drawn stereoisomer is one of its known members.
          // Treat that endpoint with the same search priority as an exact pure
          // product, while retaining mixture provenance so the UI never calls
          // it enantiopure.
          const directTargetBonus =
            exactTarget || mixtureContainsTarget ? -1000 : 0;
          const bridgeBonus = preferredKeys.has(structure.isomeric) ? -500 : 0;
          const representationPenalty = pathway.productStatus === "computed" ? 0 : 12;
          const componentMixturePenalty = Math.max(0, productComponents.length - 1) * 4;
          const stereochemicalMixturePenalty = nextStereoMixture ? 24 : 0;
          const continuationPenalty = index * 2;
          // Consuming a supplied starting material is not intrinsically good.
          // In many syntheses a second building block must remain untouched for
          // several steps before the correct coupling intermediate exists.
          //
          // Carbon-pool accounting below already rewards states whose current
          // scaffold + unused supplied materials can still explain the target
          // skeleton. Do not additionally force immediate consumption.
          const suppliedReactantBonus = 0;
          const usedStartingMaterialIndices = [
            ...parent.usedStartingMaterialIndices,
            ...input.startingMaterialIndices,
          ];
          const candidatePlanningSignature = await getPlanningSignature(structure.isomeric);
          const heuristic =
            mixtureContainsTarget
              ? 0
              : planningSignatureDistance(
                  candidatePlanningSignature,
                  targetPlanningSignature,
                ) * PLANNING_HEURISTIC_SCALE;
          const carbonPoolAdjustment = poolAwareCarbonBalance
            ? suppliedCarbonPoolAdjustment(
                candidatePlanningSignature,
                targetPlanningSignature,
                usedStartingMaterialIndices,
                startingPlanningSignatures,
              )
            : 0;
          const stereoControlPenalty = stereochemicalPlanningPenalty(
            pathway,
            targetStructure.hasSpecifiedStereo,
          );
          const pathCost =
            parent.pathCost +
            pathway.planningCost +
            stereoControlPenalty +
            representationPenalty +
            componentMixturePenalty +
            stereochemicalMixturePenalty +
            continuationPenalty +
            suppliedReactantBonus;

          candidates.push({
            smiles: continuation,
            canonical: structure.isomeric,
            connectivity: structure.connectivity,
            hasSpecifiedStereo: structure.hasSpecifiedStereo,
            stereoMixture: nextStereoMixture,
            stereoMixtureMembers: step.productMixture?.memberSmiles ?? null,
            depth: parent.depth + 1,
            pathCost,
            heuristic,
            rank:
              pathCost +
              heuristic +
              carbonPoolAdjustment +
              directTargetBonus +
              bridgeBonus,
            steps: [...parent.steps, step],
            history: [...parent.history, structure.isomeric],
            usedStartingMaterialIndices,
          });
        }
      }
    }

    onLayerProgress?.(parentIndex + 1, parents.length, candidates.length);
  }

  return keepBestNodes(candidates, beamWidth);
}

async function expandRetroLayer(
  parents: SearchNode[],
  rules: ReactionRule[],
  beamWidth: number,
  branchLimit: number,
  allowGeneric: boolean,
  startCanonicals: Set<string>,
  startPlanningSignatures: Array<PlanningSignature | null>,
  preferredKeys: Set<string>,
  startingMaterials: StartingMaterial[],
  predictionCache: RetroPredictionCache,
  signal?: AbortSignal,
  onLayerProgress?: LayerProgressCallback,
  maxRulesScanned?: number,
  maxTransformsExecuted?: number,
): Promise<SearchNode[]> {
  const candidates: SearchNode[] = [];

  for (let parentIndex = 0; parentIndex < parents.length; parentIndex += 1) {
    const parent = parents[parentIndex];
    if (!(await yieldToBrowser(signal))) return [];
    let pathways: RetrosynthesisPathway[] = [];
    try {
      pathways = await cachedRetroPredictions(
        parent.smiles,
        rules,
        predictionCache,
        Math.max(branchLimit * 2, beamWidth * 2, 24),
        signal,
        maxRulesScanned,
        maxTransformsExecuted,
      );

      // The quick interactive lane intentionally caps expensive reverse
      // transforms. A zero-result capped pass is NOT evidence that the target
      // has no retrosynthetic disconnection; the relevant rule may simply sit
      // below the cap after product-side ranking. Before killing this frontier,
      // retry this one intermediate with the transform cap removed.
      if (
        pathways.length === 0 &&
        maxTransformsExecuted !== undefined &&
        !searchCancelled(signal)
      ) {
        pathways = await cachedRetroPredictions(
          parent.smiles,
          rules,
          predictionCache,
          Math.max(branchLimit * 2, beamWidth * 2, 24),
          signal,
          maxRulesScanned,
          undefined,
        );
      }
    } catch (error) {
      console.error("[PocketChem:Synthesis] Reverse expansion failed for one intermediate; skipping it.", {
        intermediate: parent.smiles,
        error,
      });
      onLayerProgress?.(parentIndex + 1, parents.length, candidates.length);
      continue;
    }
    if (!(await yieldToBrowser(signal))) return [];

    for (const pathway of diversePathwaySample(pathways, branchLimit)) {
      const step = retroStepFromPathway(pathway);
      if (!allowGeneric && isGenericReactionSmiles(step.reactantSmiles)) continue;

      for (let index = 0; index < pathway.precursorComponents.length; index += 1) {
        if (searchCancelled(signal)) return [];
        const continuation = pathway.precursorComponents[index];
        const structure = await canonicalizeSmiles(continuation);
        if (!structure || parent.history.includes(structure.isomeric)) continue;

        const sideComponents = pathway.precursorComponents.filter(
          (_component, componentIndex) => componentIndex !== index,
        );
        const matchedStartingMaterials = await matchStartingMaterialSideReactants(
          sideComponents,
          startingMaterials,
          parent.usedStartingMaterialIndices,
          signal,
        );
        if (matchedStartingMaterials === null) continue;

        const directStartBonus = startCanonicals.has(structure.isomeric) ? -1000 : 0;
        const bridgeBonus = preferredKeys.has(structure.isomeric) ? -500 : 0;
        const confidencePenalty = pathway.confidence === "confirmed" ? 0 : 18;
        const multiReactantPenalty = Math.max(0, sideComponents.length) * 6;
        const continuationPenalty = index * 2;
        const suppliedReactantBonus = matchedStartingMaterials.length * -120;
        const candidatePlanningSignature = await getPlanningSignature(structure.isomeric);
        const heuristic =
          closestPlanningDistance(candidatePlanningSignature, startPlanningSignatures) *
          PLANNING_HEURISTIC_SCALE;
        const pathCost =
          parent.pathCost +
          pathway.planningCost +
          retrosynthesisTierPenalty(pathway.retrosynthesisTier) +
          confidencePenalty +
          multiReactantPenalty +
          continuationPenalty +
          suppliedReactantBonus;

        candidates.push({
          smiles: continuation,
          canonical: structure.isomeric,
          connectivity: structure.connectivity,
          hasSpecifiedStereo: structure.hasSpecifiedStereo,
          stereoMixture: null,
          stereoMixtureMembers: null,
          depth: parent.depth + 1,
          pathCost,
          heuristic,
          rank: pathCost + heuristic + directStartBonus + bridgeBonus,
          steps: [step, ...parent.steps],
          history: [...parent.history, structure.isomeric],
          usedStartingMaterialIndices: [
            ...parent.usedStartingMaterialIndices,
            ...matchedStartingMaterials,
          ],
        });
      }
    }

    onLayerProgress?.(parentIndex + 1, parents.length, candidates.length);
  }

  return keepBestNodes(candidates, beamWidth);
}

function routeSignature(steps: SynthesisStep[]): string {
  return steps
    .map(
      (step) =>
        `${step.ruleId}:${step.reactantSmiles}>${step.productSmiles}`,
    )
    .join("||");
}


function hashSignature(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildRoutesFromLayers(
  forwardNodes: SearchNode[],
  retroNodes: SearchNode[],
  startingSmiles: string,
  targetSmiles: string,
  maxRoutes: number,
): MultistepSynthesisRoute[] {
  const retroByCanonical = new Map<string, SearchNode[]>();
  const retroByConnectivity = new Map<string, SearchNode[]>();

  for (const node of retroNodes) {
    const exactBucket = retroByCanonical.get(node.canonical) ?? [];
    exactBucket.push(node);
    retroByCanonical.set(node.canonical, exactBucket);

    const connectivityBucket = retroByConnectivity.get(node.connectivity) ?? [];
    connectivityBucket.push(node);
    retroByConnectivity.set(node.connectivity, connectivityBucket);
  }

  const routes: MultistepSynthesisRoute[] = [];
  const seen = new Map<string, MultistepSynthesisRoute>();

  for (const forwardNode of forwardNodes) {
    const exactMatches = (retroByCanonical.get(forwardNode.canonical) ?? [])
      .filter((node) => searchNodesCanMeet(forwardNode, node));
    const matches = exactMatches.length > 0
      ? exactMatches.map((node) => ({ node, connectivityBridge: false }))
      : (retroByConnectivity.get(forwardNode.connectivity) ?? [])
          .filter(
            (node) =>
              node.canonical !== forwardNode.canonical &&
              searchNodesCanMeet(forwardNode, node),
          )
          .map((node) => ({ node, connectivityBridge: true }));

    for (const match of matches) {
      const retroNode = match.node;
      if (usedStartingMaterialsOverlap(forwardNode, retroNode)) continue;

      const rawSteps = [...forwardNode.steps, ...retroNode.steps];
      const steps = rawSteps.map((step, index) => ({
        ...step,
        id: `${step.id}--${index + 1}`,
        stepNumber: index + 1,
      }));
      const signature = routeSignature(steps);
      const targetMemberObtainedAsMixture = Boolean(
        (forwardNode.stereoMixture && retroNode.hasSpecifiedStereo) ||
          (retroNode.stereoMixture && forwardNode.hasSpecifiedStereo),
      );
      const connectivityOnly =
        match.connectivityBridge ||
        targetMemberObtainedAsMixture ||
        steps.some(
          (step) => step.retrosynthesisConfidence === "connectivity-confirmed",
        );
      const route: MultistepSynthesisRoute = {
        id: `synthesis-route-${hashSignature(signature || "same-structure")}`,
        startingSmiles,
        targetSmiles,
        steps,
        confidence: connectivityOnly ? "connectivity-verified" : "verified",
        // Path cost already charges each reaction step. Keep only a modest
        // extra length preference here so a very short route through a trace
        // product cannot overwhelm chemically realistic selectivity.
        score:
          steps.length * 50 +
          forwardNode.pathCost +
          retroNode.pathCost +
          (forwardNode.stereoMixture ? 40 : 0),
      };

      const existing = seen.get(signature);
      if (!existing || route.score < existing.score) {
        seen.set(signature, route);
      }
    }
  }

  routes.push(...seen.values());
  routes.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return routes.slice(0, maxRoutes);
}

function balancedSplits(totalDepth: number): Array<[number, number]> {
  const splits: Array<[number, number]> = [];
  const middle = totalDepth / 2;

  for (let forwardDepth = 0; forwardDepth <= totalDepth; forwardDepth += 1) {
    splits.push([forwardDepth, totalDepth - forwardDepth]);
  }

  return splits.sort((a, b) => {
    const distanceA = Math.abs(a[0] - middle);
    const distanceB = Math.abs(b[0] - middle);
    if (distanceA !== distanceB) return distanceA - distanceB;
    return b[0] - a[0];
  });
}

/**
 * Finds a verified synthesis by meeting a forward search from the supplied
 * starting-material pool with a retrosynthetic search from the requested
 * product. By default the exhaustive sweep preserves shortest-route behavior;
 * `preferFirstVerifiedRoute` adds a responsive adaptive pass that can return a
 * verified route sooner without first proving that no shorter route exists.
 *
 * Every dot-separated structure is an equal starting
 * material; the forward search can begin from any one and consume the others
 * once each through multi-reactant catalog rules.
 *
 * Forward nodes are generated only by executable catalog reactions. Reverse
 * nodes come from the retrosynthesis engine, which forward-replays every
 * disconnection before returning it. Carbon-bearing side precursors in a
 * retrosynthetic disconnection must match one of the supplied starting materials.
 */
async function searchMultistepRoutes(
  startingSmiles: string,
  targetSmiles: string,
  rules: ReactionRule[],
  options: MultistepSynthesisSearchOptions = {},
  onProgress?: ProgressCallback,
): Promise<MultistepSynthesisRoute[]> {
  const maxSteps = clampInteger(options.maxSteps, DEFAULT_MAX_STEPS, 1, 10);
  const beamWidth = clampInteger(options.beamWidth, DEFAULT_BEAM_WIDTH, 2, 30);
  const branchLimit = clampInteger(
    options.branchLimit,
    DEFAULT_BRANCH_LIMIT,
    4,
    50,
  );
  const maxRoutes = clampInteger(options.maxRoutes, DEFAULT_MAX_ROUTES, 1, 10);
  const signal = options.signal;
  const searchEffort = options.searchEffort ?? "normal";
  const quickTransformBudget = searchEffort === "deep" ? 28 : 12;
  const normalTransformBudget = searchEffort === "deep" ? undefined : 32;
  const quickForwardRuleBudget = searchEffort === "deep" ? 30 : 20;
  const normalForwardRuleBudget = searchEffort === "deep" ? undefined : 36;
  if (searchCancelled(signal)) return [];

  // Multistep planning revisits the same structures repeatedly from different
  // split depths. Cache reaction expansion locally for this search so repeated
  // bridge checks do not rerun every reaction rule or nomenclature pass.
  const forwardPredictionCache: ForwardPredictionCache = new Map();
  const retroPredictionCache: RetroPredictionCache = new Map();

  // Progress is expressed as estimated search work, not elapsed time. Layer
  // expansion is weighted more heavily than cheap frontier matching.
  const layerWorkWeight = 4;
  const matchingWorkTotal = Array.from(
    { length: maxSteps },
    (_unused, index) => index + 2,
  ).reduce((sum, count) => sum + count, 0);
  const totalWork = Math.max(1, maxSteps * 2 * layerWorkWeight + matchingWorkTotal);
  let completedWork = 0;
  const progressPercent = (partialWork = 0) =>
    Math.min(99, Math.round(((completedWork + partialWork) / totalWork) * 100));

  const startComponents = splitReactionComponents(startingSmiles);
  const targetComponents = splitReactionComponents(targetSmiles);
  if (startComponents.length < 1 || targetComponents.length !== 1) return [];

  const normalizedTarget = targetComponents[0];
  if (!(await yieldToBrowser(signal))) return [];
  const targetCanonicalResult = await canonicalizeSmiles(normalizedTarget);
  if (targetCanonicalResult === null) return [];

  // Treat every dot-separated structure as an equal member of the supplied
  // starting-material pool. The search can begin from any one of them and
  // consume any of the others later in a multi-reactant step, so Ketcher's
  // component ordering does not affect the route that PocketChem can find.
  const startingMaterials: StartingMaterial[] = [];
  for (const component of startComponents) {
    if (!(await yieldToBrowser(signal))) return [];
    const structure = await canonicalizeSmiles(component);
    if (!structure) return [];
    startingMaterials.push({
      smiles: component,
      canonical: structure.isomeric,
      connectivity: structure.connectivity,
      hasSpecifiedStereo: structure.hasSpecifiedStereo,
    });
  }

  const targetStructure = targetCanonicalResult;
  const targetCanonical = targetStructure.isomeric;
  const targetPlanningSignature = await getPlanningSignature(targetCanonical);
  const startingPlanningSignatures = await Promise.all(
    startingMaterials.map((material) => getPlanningSignature(material.canonical)),
  );
  const startCanonicals = new Set(
    startingMaterials.map((material) => material.canonical),
  );

  if (startCanonicals.has(targetCanonical)) {
    return [
      {
        id: "synthesis-route-already-target",
        startingSmiles: startComponents.join("."),
        targetSmiles: normalizedTarget,
        steps: [],
        confidence: "verified",
        score: 0,
      },
    ];
  }

  const allowGeneric =
    startComponents.some((component) => isGenericReactionSmiles(component)) ||
    isGenericReactionSmiles(normalizedTarget);

  const forwardLayers: SearchNode[][] = [
    startingMaterials.map((material, index) => {
      const heuristic =
        planningSignatureDistance(startingPlanningSignatures[index] ?? null, targetPlanningSignature) *
        PLANNING_HEURISTIC_SCALE;
      return {
        smiles: material.smiles,
        canonical: material.canonical,
        connectivity: material.connectivity,
        hasSpecifiedStereo: material.hasSpecifiedStereo,
        stereoMixture: null,
        stereoMixtureMembers: null,
        depth: 0,
        pathCost: 0,
        heuristic,
        rank: heuristic,
        steps: [],
        history: [material.canonical],
        usedStartingMaterialIndices: [index],
      };
    }),
  ];
  const retroLayers: SearchNode[][] = [
    [
      {
        smiles: normalizedTarget,
        canonical: targetCanonical,
        connectivity: targetStructure.connectivity,
        hasSpecifiedStereo: targetStructure.hasSpecifiedStereo,
        stereoMixture: null,
        stereoMixtureMembers: null,
        depth: 0,
        pathCost: 0,
        heuristic:
          closestPlanningDistance(targetPlanningSignature, startingPlanningSignatures) *
          PLANNING_HEURISTIC_SCALE,
        rank:
          closestPlanningDistance(targetPlanningSignature, startingPlanningSignatures) *
          PLANNING_HEURISTIC_SCALE,
        steps: [],
        history: [targetCanonical],
        usedStartingMaterialIndices: [],
      },
    ],
  ];

  // Interactive searches get a separate narrow-beam retrosynthesis lane before
  // the exhaustive layers. It still screens the entire catalog cheaply, because
  // a relevant transformation can sit late inside a family (diazotization is a
  // good example). retroSynthesis first product-filters and specificity-sorts
  // those rules, so only plausible transforms reach expensive reverse replay.
  // If this lane does not connect, the normal wider full-catalog search below
  // remains untouched and can continue with complete coverage.
  const QUICK_RETRO_RULE_SCAN = rules.length;
  const quickRetroPredictionCache: RetroPredictionCache = new Map();
  const quickRetroLayers: SearchNode[][] = [
    retroLayers[0].map((node) => ({
      ...node,
      steps: [...node.steps],
      history: [...node.history],
      usedStartingMaterialIndices: [...node.usedStartingMaterialIndices],
    })),
  ];


  // Interactive mode used to return the first verified connection even when
  // that route depended on a low-selectivity constitutional-mixture product.
  // Keep such routes as fallbacks, but continue searching up to maxSteps for a
  // route whose quantified product-selectivity steps are all major products.
  let selectivityFallbackRoutes: MultistepSynthesisRoute[] = [];
  let preferredRoutePool: MultistepSynthesisRoute[] = [];

  function routeUsesOnlyMajorQuantifiedProducts(
    route: MultistepSynthesisRoute,
  ): boolean {
    return route.steps.every((step) => {
      const fraction = step.selectivityAssessment?.estimatedFraction;
      return fraction === null || fraction === undefined || fraction >= 0.5;
    });
  }

  function rememberFallbackRoutes(routes: MultistepSynthesisRoute[]): void {
    if (routes.length === 0) return;
    const byId = new Map<string, MultistepSynthesisRoute>();
    for (const route of [...selectivityFallbackRoutes, ...routes]) {
      const existing = byId.get(route.id);
      if (!existing || route.score < existing.score) byId.set(route.id, route);
    }
    selectivityFallbackRoutes = [...byId.values()]
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
      .slice(0, maxRoutes);
  }

  function preferredRouteComparator(
    a: MultistepSynthesisRoute,
    b: MultistepSynthesisRoute,
  ): number {
    // For a stereodefined target, chemical stereocontrol outranks raw route
    // length. A shorter E1-derived route that passes through an E/Z mixture
    // should not beat a slightly longer route that creates the required alkene
    // geometry stereospecifically (for example Lindlar or dissolving-metal
    // reduction followed by stereospecific dihydroxylation).
    const stereoPenaltyDifference =
      routeStereochemicalAmbiguityPenalty(
        a,
        targetStructure.hasSpecifiedStereo,
      ) -
      routeStereochemicalAmbiguityPenalty(
        b,
        targetStructure.hasSpecifiedStereo,
      );

    if (stereoPenaltyDifference !== 0) {
      return stereoPenaltyDifference;
    }

    // Once routes are in the same selectivity/stereochemical class, prefer the
    // shorter synthesis, then use the detailed planning score as a tie-break.
    return (
      a.steps.length - b.steps.length ||
      a.score - b.score ||
      a.id.localeCompare(b.id)
    );
  }

  function rememberPreferredRoutes(routes: MultistepSynthesisRoute[]): void {
    const preferred = routes.filter(routeUsesOnlyMajorQuantifiedProducts);
    if (preferred.length === 0) return;

    const bySignature = new Map<string, MultistepSynthesisRoute>();
    for (const route of [...preferredRoutePool, ...preferred]) {
      const signature = routeSignature(route.steps);
      const existing = bySignature.get(signature);
      if (!existing || preferredRouteComparator(route, existing) < 0) {
        bySignature.set(signature, route);
      }
    }

    preferredRoutePool = [...bySignature.values()]
      .sort(preferredRouteComparator)
      .slice(0, maxRoutes);
  }

  function bestAvailablePreferredRoutes(): MultistepSynthesisRoute[] {
    if (preferredRoutePool.length === 0) return [];

    if (targetStructure.hasSpecifiedStereo) {
      const stereoControlled = preferredRoutePool
        .filter(
          (route) =>
            routeStereochemicalAmbiguityPenalty(route, true) === 0,
        )
        .sort(preferredRouteComparator);

      if (stereoControlled.length > 0) {
        return stereoControlled.slice(0, maxRoutes);
      }
    }

    return preferredRoutePool
      .slice()
      .sort(preferredRouteComparator)
      .slice(0, maxRoutes);
  }

  function preferredDiscoveredRoutes(
    routes: MultistepSynthesisRoute[],
  ): MultistepSynthesisRoute[] | null {
    if (routes.length > 0) {
      rememberFallbackRoutes(routes);
      rememberPreferredRoutes(routes);
    }

    if (preferredRoutePool.length === 0) return null;

    if (targetStructure.hasSpecifiedStereo) {
      const stereoControlled = preferredRoutePool.filter(
        (route) =>
          routeStereochemicalAmbiguityPenalty(route, true) === 0,
      );
      if (stereoControlled.length > 0) {
        return stereoControlled
          .sort(preferredRouteComparator)
          .slice(0, maxRoutes);
      }

      // Keep an ambiguous route only as a fallback while a small bounded
      // selectivity search continues. Do NOT force the entire exhaustive
      // max-depth search just because the first valid route contains E/Z or
      // racemic ambiguity.
      return null;
    }

    return preferredRoutePool.slice(0, maxRoutes);
  }

  async function ensureForwardDepth(depth: number) {
    while (forwardLayers.length <= depth) {
      if (!(await yieldToBrowser(signal))) return;
      const nextDepth = forwardLayers.length;
      const parents = forwardLayers[nextDepth - 1];
      onProgress?.({
        phase: "forward",
        depth: nextDepth,
        maxSteps,
        processed: 0,
        total: parents.length,
        candidateCount: 0,
        percent: progressPercent(),
      });
      const nextLayer = await expandForwardLayer(
        parents,
        rules,
        beamWidth,
        branchLimit,
        allowGeneric,
        targetStructure,
        targetPlanningSignature,
        knownStructureKeys(retroLayers),
        startingMaterials,
        startingPlanningSignatures,
        forwardPredictionCache,
        signal,
        (processed, total, candidateCount) => {
          const fraction = total > 0 ? processed / total : 1;
          onProgress?.({
            phase: "forward",
            depth: nextDepth,
            maxSteps,
            processed,
            total,
            candidateCount,
            percent: progressPercent(layerWorkWeight * fraction),
          });
        },
        normalForwardRuleBudget,
      );
      completedWork += layerWorkWeight;
      forwardLayers.push(nextLayer);
      onProgress?.({
        phase: "forward",
        depth: nextDepth,
        maxSteps,
        processed: parents.length,
        total: parents.length,
        candidateCount: nextLayer.length,
        percent: progressPercent(),
        ...frontierDiagnosticFields(
          nextLayer,
          targetCanonical,
          startingMaterials.length,
        ),
      });
      if (nextLayer.length === 0) break;
    }
  }

  async function ensureRetroDepth(depth: number) {
    while (retroLayers.length <= depth) {
      if (!(await yieldToBrowser(signal))) return;
      const nextDepth = retroLayers.length;
      const parents = retroLayers[nextDepth - 1];
      onProgress?.({
        phase: "retrosynthesis",
        depth: nextDepth,
        maxSteps,
        processed: 0,
        total: parents.length,
        candidateCount: 0,
        percent: progressPercent(),
      });
      const nextLayer = await expandRetroLayer(
        parents,
        rules,
        beamWidth,
        branchLimit,
        allowGeneric,
        startCanonicals,
        startingPlanningSignatures,
        knownStructureKeys(forwardLayers),
        startingMaterials,
        retroPredictionCache,
        signal,
        (processed, total, candidateCount) => {
          const fraction = total > 0 ? processed / total : 1;
          onProgress?.({
            phase: "retrosynthesis",
            depth: nextDepth,
            maxSteps,
            processed,
            total,
            candidateCount,
            percent: progressPercent(layerWorkWeight * fraction),
          });
        },
        undefined,
        normalTransformBudget,
      );
      completedWork += layerWorkWeight;
      retroLayers.push(nextLayer);
      onProgress?.({
        phase: "retrosynthesis",
        depth: nextDepth,
        maxSteps,
        processed: parents.length,
        total: parents.length,
        candidateCount: nextLayer.length,
        percent: progressPercent(),
        ...frontierDiagnosticFields(
          nextLayer,
          targetCanonical,
          startingMaterials.length,
        ),
      });
      if (nextLayer.length === 0) break;
    }
  }

  async function ensureQuickRetroDepth(depth: number) {
    while (quickRetroLayers.length <= depth) {
      if (!(await yieldToBrowser(signal))) return;
      const nextDepth = quickRetroLayers.length;
      const parents = quickRetroLayers[nextDepth - 1];
      onProgress?.({
        phase: "retrosynthesis",
        depth: nextDepth,
        maxSteps,
        processed: 0,
        total: parents.length,
        candidateCount: 0,
        percent: progressPercent(),
      });

      const nextLayer = await expandRetroLayer(
        parents,
        rules,
        Math.min(beamWidth, 8),
        Math.min(branchLimit, 12),
        allowGeneric,
        startCanonicals,
        startingPlanningSignatures,
        knownStructureKeys(forwardLayers),
        startingMaterials,
        quickRetroPredictionCache,
        signal,
        (processed, total, candidateCount) => {
          onProgress?.({
            phase: "retrosynthesis",
            depth: nextDepth,
            maxSteps,
            processed,
            total,
            candidateCount,
            percent: progressPercent(),
          });
        },
        QUICK_RETRO_RULE_SCAN,
        quickTransformBudget,
      );

      quickRetroLayers.push(nextLayer);
      if (nextLayer.length === 0) break;
    }
  }

  function mergePersistentForwardLayer(
    depth: number,
    nodes: SearchNode[],
    limit: number,
  ): SearchNode[] {
    while (forwardLayers.length <= depth) {
      forwardLayers.push([]);
    }

    const bestByState = new Map<string, SearchNode>();
    for (const node of [...forwardLayers[depth], ...nodes]) {
      const key = searchStateKey(node);
      const existing = bestByState.get(key);
      if (
        !existing ||
        node.rank < existing.rank ||
        (node.rank === existing.rank && node.pathCost < existing.pathCost)
      ) {
        bestByState.set(key, node);
      }
    }

    const merged = [...bestByState.values()]
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.pathCost - b.pathCost ||
          a.canonical.localeCompare(b.canonical),
      )
      .slice(0, limit);

    forwardLayers[depth] = merged;
    return merged;
  }

  async function runSuppliedMaterialForwardLane(): Promise<MultistepSynthesisRoute[]> {
    // When the user supplies multiple carbon-bearing starting materials, that
    // information is unusually strong: a useful route often evolves one
    // scaffold for a few steps and then consumes another supplied structure in
    // an SN2/coupling event. Running a short forward-only lane first avoids
    // spending most of the interactive budget repeatedly reversing every rule
    // from a complex target before the planner has tried the explicitly given
    // building blocks.
    if (startingMaterials.length < 2) return [];

    // Use a broader but deliberately shallow lane. Multi-start textbook
    // syntheses usually join the supplied carbon skeletons within a few steps;
    // preserving those branches is more useful than carrying a narrow beam all
    // the way to depth 9.
    const laneBeamWidth = Math.min(42, Math.max(beamWidth * 3, 30));
    const laneBranchLimit = Math.min(52, Math.max(branchLimit * 2, 36));
    const laneMaxDepth = Math.min(maxSteps, searchEffort === "deep" ? 7 : 6);
    const laneRuleBudget = searchEffort === "deep"
      ? Math.max(64, quickForwardRuleBudget)
      : Math.max(48, quickForwardRuleBudget);

    let frontier = forwardLayers[0].map((node) => ({
      ...node,
      steps: [...node.steps],
      history: [...node.history],
      usedStartingMaterialIndices: [...node.usedStartingMaterialIndices],
    }));
    let firstStereoFallbackDepth: number | null = null;

    for (let depth = 1; depth <= laneMaxDepth; depth += 1) {
      if (searchCancelled(signal) || frontier.length === 0) return [];

      onProgress?.({
        phase: "forward",
        depth,
        maxSteps,
        processed: 0,
        total: frontier.length,
        candidateCount: 0,
        percent: progressPercent(),
      });

      const nextLayer = await expandForwardLayer(
        frontier,
        rules,
        laneBeamWidth,
        laneBranchLimit,
        allowGeneric,
        targetStructure,
        targetPlanningSignature,
        new Set([targetCanonical]),
        startingMaterials,
        startingPlanningSignatures,
        forwardPredictionCache,
        signal,
        (processed, total, candidateCount) => {
          onProgress?.({
            phase: "forward",
            depth,
            maxSteps,
            processed,
            total,
            candidateCount,
            percent: progressPercent(),
          });
        },
        laneRuleBudget,
        true,
      );

      if (searchCancelled(signal)) return [];

      // Persist the fast-lane work into the SAME layer graph used by every
      // later search phase. Previously this lane kept a private frontier and
      // discarded it when it failed to finish the route, causing the next phase
      // to restart from depth 0 despite having already explored several useful
      // transformations.
      const persistentLayer = mergePersistentForwardLayer(
        depth,
        nextLayer,
        laneBeamWidth,
      );

      onProgress?.({
        phase: "forward",
        depth,
        maxSteps,
        processed: frontier.length,
        total: frontier.length,
        candidateCount: persistentLayer.length,
        percent: progressPercent(),
        ...frontierDiagnosticFields(
          persistentLayer,
          targetCanonical,
          startingMaterials.length,
        ),
      });

      // For this lane, require that every explicitly supplied starting
      // material has actually been consumed. This prevents a route from being
      // declared solved while silently ignoring one of the structures the user
      // intentionally supplied.
      const fullyConsumed = persistentLayer.filter(
        (node) =>
          new Set(node.usedStartingMaterialIndices).size ===
          startingMaterials.length,
      );

      if (fullyConsumed.length > 0) {
        const routes = buildRoutesFromLayers(
          fullyConsumed,
          retroLayers[0],
          startComponents.join("."),
          normalizedTarget,
          maxRoutes,
        );
        const preferred = preferredDiscoveredRoutes(routes);
        if (preferred) return preferred;

        if (
          targetStructure.hasSpecifiedStereo &&
          preferredRoutePool.length > 0 &&
          firstStereoFallbackDepth === null
        ) {
          firstStereoFallbackDepth = depth;
        }
      }

      frontier = persistentLayer;

      // Once a valid route exists, give the forward lane exactly one
      // additional reaction depth to find a stereochemically cleaner variant.
      // The next bounded best-first pass gets another independent chance after
      // this. This prevents the selectivity feature from turning a responsive
      // search into a full 45-second exhaustive sweep.
      if (
        firstStereoFallbackDepth !== null &&
        depth >= firstStereoFallbackDepth + 1
      ) {
        break;
      }
    }

    return [];
  }

  async function runBestFirstBridge(): Promise<MultistepSynthesisRoute[]> {
    const maxExpansions = searchEffort === "deep" ? 96 : 40;
    // Children of ONE parent enter an ordered open list, so this cap only
    // decides which siblings are ever considered. It must not be smaller than
    // the number of distinct products a common substrate yields: acetone has
    // seven, and a cap of 6 silently discarded the worst-ranked sibling
    // (Baeyer-Villiger, one step from a valid ester-reduction route to ethanol)
    // before it could be expanded. Normal and deep share the same cap; deep
    // still differs by its larger branch limit, expansion budget and beams.
    const fastBeamWidth = Math.min(beamWidth, 10);
    const fastBranchLimit = Math.min(branchLimit, searchEffort === "deep" ? 18 : 10);

    // Continue from the deepest non-empty forward layer already discovered by
    // the multi-start fast lane instead of reopening the starting materials.
    // Earlier layers remain in forwardVisited so reverse search can meet any
    // intermediate that was already found.
    let deepestForwardDepth = 0;
    for (let depth = forwardLayers.length - 1; depth >= 0; depth -= 1) {
      if ((forwardLayers[depth]?.length ?? 0) > 0) {
        deepestForwardDepth = depth;
        break;
      }
    }

    const forwardVisited = forwardLayers.flat();
    const forwardOpen = [...(forwardLayers[deepestForwardDepth] ?? forwardLayers[0])];
    const retroOpen = [...retroLayers[0]];
    const retroVisited = [...retroLayers[0]];

    const bestForward = new Map<string, number>();
    for (const node of forwardVisited) {
      const key = searchStateKey(node);
      const existing = bestForward.get(key);
      if (existing === undefined || node.rank < existing) {
        bestForward.set(key, node.rank);
      }
    }

    const bestRetro = new Map(
      retroOpen.map((node) => [searchStateKey(node), node.rank] as const),
    );
    let expansions = 0;
    let preferForwardOnNearTie = true;

    const sortOpen = (nodes: SearchNode[]) =>
      nodes.sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.canonical.localeCompare(b.canonical));

    while (
      expansions < maxExpansions &&
      (forwardOpen.length > 0 || retroOpen.length > 0)
    ) {
      if (!(await yieldToBrowser(signal))) return [];
      sortOpen(forwardOpen);
      sortOpen(retroOpen);

      let expandForward = false;
      if (retroOpen.length === 0) {
        expandForward = true;
      } else if (forwardOpen.length === 0) {
        expandForward = false;
      } else {
        const scoreGap = Math.abs(forwardOpen[0].rank - retroOpen[0].rank);
        if (scoreGap <= PLANNING_HEURISTIC_SCALE * 5) {
          expandForward = preferForwardOnNearTie;
          preferForwardOnNearTie = !preferForwardOnNearTie;
        } else {
          expandForward = forwardOpen[0].rank < retroOpen[0].rank;
        }
      }

      if (expandForward) {
        const parent = forwardOpen.shift()!;
        if (parent.depth >= maxSteps) continue;
        onProgress?.({
          phase: "forward",
          depth: parent.depth + 1,
          maxSteps,
          processed: expansions,
          total: maxExpansions,
          candidateCount: forwardOpen.length + retroOpen.length,
          percent: progressPercent(),
        });

        const children = await expandForwardLayer(
          [parent],
          rules,
          fastBeamWidth,
          fastBranchLimit,
          allowGeneric,
          targetStructure,
          targetPlanningSignature,
          new Set(retroVisited.map((node) => node.canonical)),
          startingMaterials,
          startingPlanningSignatures,
          forwardPredictionCache,
          signal,
          undefined,
          quickForwardRuleBudget,
        );
        expansions += 1;

        onProgress?.({
          phase: "forward",
          depth: parent.depth + 1,
          maxSteps,
          processed: expansions,
          total: maxExpansions,
          candidateCount: forwardOpen.length + children.length,
          percent: progressPercent(),
          ...frontierDiagnosticFields(
            [...forwardOpen, ...children],
            targetCanonical,
            startingMaterials.length,
          ),
        });

        for (const child of children) {
          const key = searchStateKey(child);
          const knownRank = bestForward.get(key);
          if (knownRank !== undefined && knownRank <= child.rank) continue;
          bestForward.set(key, child.rank);
          forwardOpen.push(child);
          forwardVisited.push(child);
          mergePersistentForwardLayer(
            child.depth,
            [child],
            Math.max(beamWidth, fastBeamWidth),
          );

          const opposite = retroVisited.filter(
            (node) => child.depth + node.depth <= maxSteps,
          );
          const routes = buildRoutesFromLayers(
            [child],
            opposite,
            startComponents.join("."),
            normalizedTarget,
            maxRoutes,
          );
          preferredDiscoveredRoutes(routes);
        }
      } else {
        const parent = retroOpen.shift()!;
        if (parent.depth >= maxSteps) continue;
        onProgress?.({
          phase: "retrosynthesis",
          depth: parent.depth + 1,
          maxSteps,
          processed: expansions,
          total: maxExpansions,
          candidateCount: forwardOpen.length + retroOpen.length,
          percent: progressPercent(),
        });

        const children = await expandRetroLayer(
          [parent],
          rules,
          fastBeamWidth,
          fastBranchLimit,
          allowGeneric,
          startCanonicals,
          startingPlanningSignatures,
          new Set(forwardVisited.map((node) => node.canonical)),
          startingMaterials,
          retroPredictionCache,
          signal,
          undefined,
          rules.length,
          quickTransformBudget,
        );
        expansions += 1;

        onProgress?.({
          phase: "retrosynthesis",
          depth: parent.depth + 1,
          maxSteps,
          processed: expansions,
          total: maxExpansions,
          candidateCount: retroOpen.length + children.length,
          percent: progressPercent(),
          ...frontierDiagnosticFields(
            [...retroOpen, ...children],
            targetCanonical,
            startingMaterials.length,
          ),
        });

        for (const child of children) {
          const key = searchStateKey(child);
          const knownRank = bestRetro.get(key);
          if (knownRank !== undefined && knownRank <= child.rank) continue;
          bestRetro.set(key, child.rank);
          retroOpen.push(child);
          retroVisited.push(child);

          const opposite = forwardVisited.filter(
            (node) => node.depth + child.depth <= maxSteps,
          );
          const routes = buildRoutesFromLayers(
            opposite,
            [child],
            startComponents.join("."),
            normalizedTarget,
            maxRoutes,
          );
          preferredDiscoveredRoutes(routes);
        }
      }
    }

    const strictlyPreferred = preferredDiscoveredRoutes([]);
    if (strictlyPreferred) return strictlyPreferred;

    // Bounded selectivity fallback: after the focused A*-style pass has had a
    // chance to find a clean stereospecific route, return the best verified
    // route already in hand. "Search deeper" can still run the larger 96-
    // expansion pass when the user explicitly wants more exploration.
    return bestAvailablePreferredRoutes();
  }

  if (options.preferFirstVerifiedRoute && startingMaterials.length > 1) {
    const suppliedMaterialRoutes = await runSuppliedMaterialForwardLane();
    if (suppliedMaterialRoutes.length > 0) return suppliedMaterialRoutes;
    if (searchCancelled(signal)) return [];
  }

  if (options.preferFirstVerifiedRoute) {
    // A*-style bounded pass: order both search fronts by accumulated reaction
    // cost plus a structural functional-group distance to the opposite goal.
    // This is the normal interactive lane and usually resolves textbook routes
    // before the wider layer/beam fallbacks are needed.
    const bestFirstRoutes = await runBestFirstBridge();
    if (bestFirstRoutes.length > 0) return bestFirstRoutes;
    if (searchCancelled(signal)) return [];
  }

  if (options.preferFirstVerifiedRoute) {
    /*
     * Goal-directed bridge pass. Many textbook syntheses begin with one broad
     * functional-group conversion (for example benzylic oxidation) whose exact
     * precursor cannot be reconstructed uniquely backwards. Build exactly one
     * forward layer, then drive the target backwards while checking both the
     * original starting materials and that first forward layer after every
     * reverse depth. This catches routes such as:
     *
     *   alkylbenzene -> benzoic acid  ||  target <- ... <- benzoic acid
     *
     * without exploding the forward frontier to several unnecessary depths.
     */
    await ensureForwardDepth(1);
    if (searchCancelled(signal)) return [];

    for (let retroDepth = 0; retroDepth <= Math.max(0, maxSteps - 1); retroDepth += 1) {
      if (retroDepth > 0) await ensureQuickRetroDepth(retroDepth);
      if (searchCancelled(signal)) return [];

      const retroLayer = quickRetroLayers[retroDepth] ?? [];
      if (retroLayer.length === 0) break;

      for (const forwardDepth of [0, 1]) {
        if (forwardDepth + retroDepth === 0 || forwardDepth + retroDepth > maxSteps) continue;
        const forwardLayer = forwardLayers[forwardDepth] ?? [];
        if (forwardLayer.length === 0) continue;

        onProgress?.({
          phase: "matching",
          depth: forwardDepth + retroDepth,
          maxSteps,
          processed: forwardLayer.length,
          total: forwardLayer.length + retroLayer.length,
          candidateCount: retroLayer.length,
          percent: progressPercent(),
        });
        const bridgeRoutes = buildRoutesFromLayers(
          forwardLayer,
          retroLayer,
          startComponents.join("."),
          normalizedTarget,
          maxRoutes,
        );
        const preferred = preferredDiscoveredRoutes(bridgeRoutes);
        if (preferred) return preferred;
      }
    }
  }

  if (options.preferFirstVerifiedRoute) {
    // Interactive fast path: expand whichever frontier is currently smaller,
    // then immediately test the new layer against every already-built layer on
    // the opposite side. This avoids spending time proving all shorter split
    // combinations before returning a chemically verified route. A classic
    // example is start -> benzoic acid on the forward side plus a longer,
    // narrow retrosynthetic chain from an aryl nitrile target.
    let forwardDepth = 0;
    let retroDepth = 0;
    let preferForwardOnTie = true;

    while (forwardDepth + retroDepth < maxSteps) {
      if (searchCancelled(signal)) return [];

      const forwardFrontier = forwardLayers[forwardDepth] ?? [];
      const retroFrontier = retroLayers[retroDepth] ?? [];
      const canExpandForward =
        forwardDepth < maxSteps && forwardFrontier.length > 0;
      const canExpandRetro = retroDepth < maxSteps && retroFrontier.length > 0;

      if (!canExpandForward && !canExpandRetro) break;

      let expandForward: boolean;
      if (!canExpandRetro) {
        expandForward = true;
      } else if (!canExpandForward) {
        expandForward = false;
      } else if (forwardFrontier.length === retroFrontier.length) {
        expandForward = preferForwardOnTie;
        preferForwardOnTie = !preferForwardOnTie;
      } else {
        expandForward = forwardFrontier.length < retroFrontier.length;
      }

      if (expandForward) {
        forwardDepth += 1;
        await ensureForwardDepth(forwardDepth);
        if (searchCancelled(signal)) return [];
        const newForwardLayer = forwardLayers[forwardDepth] ?? [];
        if (newForwardLayer.length === 0) continue;

        for (let oppositeDepth = 0; oppositeDepth < retroLayers.length; oppositeDepth += 1) {
          if (forwardDepth + oppositeDepth > maxSteps) continue;
          const oppositeLayer = retroLayers[oppositeDepth] ?? [];
          if (oppositeLayer.length === 0) continue;

          onProgress?.({
            phase: "matching",
            depth: forwardDepth + oppositeDepth,
            maxSteps,
            processed: newForwardLayer.length,
            total: newForwardLayer.length + oppositeLayer.length,
            candidateCount: oppositeLayer.length,
            percent: progressPercent(),
          });
          const routes = buildRoutesFromLayers(
            newForwardLayer,
            oppositeLayer,
            startComponents.join("."),
            normalizedTarget,
            maxRoutes,
          );
          const preferred = preferredDiscoveredRoutes(routes);
          if (preferred) return preferred;
        }
      } else {
        retroDepth += 1;
        await ensureRetroDepth(retroDepth);
        if (searchCancelled(signal)) return [];
        const newRetroLayer = retroLayers[retroDepth] ?? [];
        if (newRetroLayer.length === 0) continue;

        for (let oppositeDepth = 0; oppositeDepth < forwardLayers.length; oppositeDepth += 1) {
          if (oppositeDepth + retroDepth > maxSteps) continue;
          const oppositeLayer = forwardLayers[oppositeDepth] ?? [];
          if (oppositeLayer.length === 0) continue;

          onProgress?.({
            phase: "matching",
            depth: oppositeDepth + retroDepth,
            maxSteps,
            processed: oppositeLayer.length,
            total: oppositeLayer.length + newRetroLayer.length,
            candidateCount: newRetroLayer.length,
            percent: progressPercent(),
          });
          const routes = buildRoutesFromLayers(
            oppositeLayer,
            newRetroLayer,
            startComponents.join("."),
            normalizedTarget,
            maxRoutes,
          );
          const preferred = preferredDiscoveredRoutes(routes);
          if (preferred) return preferred;
        }
      }
    }
  }

  for (let totalDepth = 1; totalDepth <= maxSteps; totalDepth += 1) {
    for (const [forwardDepth, retroDepth] of balancedSplits(totalDepth)) {
      if (searchCancelled(signal)) return [];
      await ensureForwardDepth(forwardDepth);
      if (searchCancelled(signal)) return [];
      await ensureRetroDepth(retroDepth);
      if (!(await yieldToBrowser(signal))) return [];

      const forwardLayer = forwardLayers[forwardDepth] ?? [];
      const retroLayer = retroLayers[retroDepth] ?? [];
      if (forwardLayer.length === 0 || retroLayer.length === 0) continue;

      onProgress?.({
        phase: "matching",
        depth: totalDepth,
        maxSteps,
        processed: forwardLayer.length,
        total: forwardLayer.length + retroLayer.length,
        candidateCount: retroLayer.length,
        percent: progressPercent(),
      });
      const routes = buildRoutesFromLayers(
        forwardLayer,
        retroLayer,
        startComponents.join("."),
        normalizedTarget,
        maxRoutes,
      );

      const preferred = preferredDiscoveredRoutes(routes);
      if (preferred) return preferred;

      completedWork += 1;
      onProgress?.({
        phase: "matching",
        depth: totalDepth,
        maxSteps,
        processed: forwardLayer.length + retroLayer.length,
        total: forwardLayer.length + retroLayer.length,
        candidateCount: 0,
        percent: progressPercent(),
      });
    }
  }

  if (preferredRoutePool.length > 0) {
    return bestAvailablePreferredRoutes();
  }

  return selectivityFallbackRoutes;
}

/**
 * Runs only the forward convergent lane (see convergentSearch.ts) and returns
 * its routes with search statistics. Every returned route has been replayed
 * against the supplied inventory; nothing unverified is returned.
 */
export function findConvergentSynthesisRoutes(
  startingSmiles: string,
  targetSmiles: string,
  rules: ReactionRule[],
  options: MultistepSynthesisSearchOptions = {},
  onProgress?: ProgressCallback,
): Promise<ConvergentSearchResult> {
  const convergent = typeof options.convergentSearch === "object" ? options.convergentSearch : {};
  return searchConvergentRoutesCore({
    startingSmiles,
    targetSmiles,
    rules,
    options: { maxRoutes: options.maxRoutes, ...convergent },
    stepFromPathway: forwardStepFromPathway,
    signal: options.signal,
    onProgress,
  });
}

/**
 * Plans routes, then replays every returned route end to end from the supplied
 * starting materials (see routeVerification.ts) and attaches the result. The
 * replay never drops a route: a route whose replay could not be confirmed is
 * still returned, labelled by its `verification`, so a planner or replay
 * limitation cannot silently hide a route the user could still inspect.
 */
export async function findMultistepSynthesisRoutesFromRules(
  startingSmiles: string,
  targetSmiles: string,
  rules: ReactionRule[],
  options: MultistepSynthesisSearchOptions = {},
  onProgress?: ProgressCallback,
): Promise<MultistepSynthesisRoute[]> {
  // Opt-in convergent lane. Its routes are already replayed against the supplied
  // inventory, so they are returned as they are; anything else falls through to
  // the unchanged linear search below.
  if (options.convergentSearch) {
    const convergent = await findConvergentSynthesisRoutes(
      startingSmiles,
      targetSmiles,
      rules,
      options,
      onProgress,
    );
    if (convergent.routes.length > 0 || searchCancelled(options.signal)) return convergent.routes;
  }

  const routes = await searchMultistepRoutes(
    startingSmiles,
    targetSmiles,
    rules,
    options,
    onProgress,
  );
  if (searchCancelled(options.signal)) return routes;

  const verified: MultistepSynthesisRoute[] = [];
  for (const route of routes) {
    try {
      verified.push({ ...route, verification: await verifyMultistepRoute(route, rules) });
    } catch (error) {
      console.error("[PocketChem:Synthesis] Route replay failed; returning the route unverified.", error);
      verified.push(route);
    }
  }
  return verified;
}
