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
import {
  canonicalizeStereoStructure,
  compareStereoStructureKeys,
  stereochemicalMixtureCanSatisfyTarget,
  type CanonicalStereoStructure,
} from "./stereochemistry";

const DEFAULT_MAX_STEPS = 6;
const DEFAULT_BEAM_WIDTH = 10;
const DEFAULT_BRANCH_LIMIT = 18;
const DEFAULT_MAX_ROUTES = 4;

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
  depth: number;
  rank: number;
  steps: SynthesisStep[];
  history: string[];
  usedStartingMaterialIndices: number[];
};

type ProgressCallback = (progress: MultistepSynthesisProgress) => void;

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

async function canonicalizeSmiles(
  smiles: string,
): Promise<CanonicalStereoStructure | null> {
  return canonicalizeStereoStructure(normalizeKetcherRGroups(smiles));
}

function pathwayPriority(
  ruleId: string,
  priorityByRuleId: Map<string, number>,
): number {
  return priorityByRuleId.get(ruleId) ?? 100;
}

function containsCarbonAtom(smiles: string): boolean {
  // Avoid treating chlorine's "Cl" token as carbon while catching normal
  // aliphatic/aromatic carbon tokens in canonical SMILES.
  return /[Cc]/.test(smiles.replace(/Cl/g, ""));
}

function searchStateKey(node: SearchNode): string {
  const used = [...node.usedStartingMaterialIndices].sort((a, b) => a - b).join(",");
  return `${node.canonical}::${node.stereoMixture ?? "pure-or-unspecified"}::${used}`;
}

function usedStartingMaterialsOverlap(a: SearchNode, b: SearchNode): boolean {
  const used = new Set(a.usedStartingMaterialIndices);
  return b.usedStartingMaterialIndices.some((index) => used.has(index));
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
    // Non-carbon structural partners can be ordinary reagents/conditions. The
    // user only has to provide carbon-bearing co-reactants that contribute to
    // the product skeleton.
    if (!containsCarbonAtom(sideComponent)) continue;

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
    limitations: pathway.limitations,
    retrosynthesisConfidence: null,
    productMixture: pathway.productMixture,
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
    limitations: pathway.limitations,
    retrosynthesisConfidence: pathway.confidence,
    productMixture: pathway.productMixture,
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
  if (match !== "exact" && match !== "connectivity-only") return false;

  // If the backward side requires a specified stereoisomer, a forward state
  // known to be a mixture cannot satisfy it merely because that mixture
  // contains the requested member. The reverse case is included for symmetry
  // even though current retro nodes normally describe precursor purity rather
  // than product-mixture provenance.
  if (forwardNode.stereoMixture && retroNode.hasSpecifiedStereo) return false;
  if (retroNode.stereoMixture && forwardNode.hasSpecifiedStereo) return false;

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
   * The synthesis planner must not prune a valid bond-forming route merely
   * because the catalog priority of that reaction is numerically larger than
   * several one-substrate reactions. A supplied second starting material is a
   * strong planning signal: once a state has incorporated more of the user's
   * structural starting-material pool, preserve it ahead of equally deep
   * states that still use only one component.
   *
   * This is especially important for N-alkylation, Williamson/acetylide
   * couplings, and organometallic additions. The ordinary reaction priority
   * remains the tie-breaker within the same amount of starting-material
   * coverage.
   */
  return [...bestByState.values()]
    .sort((a, b) => {
      const coverageDifference =
        b.usedStartingMaterialIndices.length -
        a.usedStartingMaterialIndices.length;
      if (coverageDifference !== 0) return coverageDifference;

      return a.rank - b.rank || a.canonical.localeCompare(b.canonical);
    })
    .slice(0, beamWidth);
}

function knownStructureKeys(layers: SearchNode[][]): Set<string> {
  return new Set(layers.flatMap((layer) => layer.map((node) => node.canonical)));
}

async function expandForwardLayer(
  parents: SearchNode[],
  rules: ReactionRule[],
  priorityByRuleId: Map<string, number>,
  beamWidth: number,
  branchLimit: number,
  allowGeneric: boolean,
  targetStructure: CanonicalStereoStructure,
  preferredKeys: Set<string>,
  startingMaterials: StartingMaterial[],
  signal?: AbortSignal,
): Promise<SearchNode[]> {
  const candidates: SearchNode[] = [];

  for (const parent of parents) {
    if (!(await yieldToBrowser(signal))) return [];
    const reactionInputs: Array<{
      smiles: string;
      startingMaterialIndex: number | null;
    }> = [{ smiles: parent.smiles, startingMaterialIndex: null }];

    for (let index = 0; index < startingMaterials.length; index += 1) {
      if (parent.usedStartingMaterialIndices.includes(index)) continue;
      reactionInputs.push({
        smiles: `${parent.smiles}.${startingMaterials[index].smiles}`,
        startingMaterialIndex: index,
      });
    }

    for (const input of reactionInputs) {
      if (searchCancelled(signal)) return [];
      const pathways = await predictReactionPathwaysFromRules(
        input.smiles,
        [],
        rules,
      );
      if (!(await yieldToBrowser(signal))) return [];

      for (const pathway of pathways.slice(0, branchLimit)) {
        // A combined input is useful only when the chosen reaction actually
        // consumes both structures. This prevents a second disconnected
        // starting material from merely generating unrelated single-substrate
        // reactions.
        if (input.startingMaterialIndex !== null && pathway.reactantComponents.length < 2) {
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
          const targetAcceptsMixture = stereochemicalMixtureCanSatisfyTarget(
            nextStereoMixture,
            targetStructure,
          );
          const directTargetBonus = exactTarget && targetAcceptsMixture ? -1000 : 0;
          const bridgeBonus = preferredKeys.has(structure.isomeric) ? -500 : 0;
          const representationPenalty = pathway.productStatus === "computed" ? 0 : 12;
          const componentMixturePenalty = Math.max(0, productComponents.length - 1) * 4;
          const stereochemicalMixturePenalty = nextStereoMixture ? 24 : 0;
          const continuationPenalty = index * 2;
          const suppliedReactantBonus = input.startingMaterialIndex === null ? 0 : -120;
          const usedStartingMaterialIndices = input.startingMaterialIndex === null
            ? parent.usedStartingMaterialIndices
            : [...parent.usedStartingMaterialIndices, input.startingMaterialIndex];

          candidates.push({
            smiles: continuation,
            canonical: structure.isomeric,
            connectivity: structure.connectivity,
            hasSpecifiedStereo: structure.hasSpecifiedStereo,
            stereoMixture: nextStereoMixture,
            depth: parent.depth + 1,
            rank:
              parent.rank +
              pathwayPriority(pathway.ruleId, priorityByRuleId) +
              representationPenalty +
              componentMixturePenalty +
              stereochemicalMixturePenalty +
              continuationPenalty +
              suppliedReactantBonus +
              directTargetBonus +
              bridgeBonus,
            steps: [...parent.steps, step],
            history: [...parent.history, structure.isomeric],
            usedStartingMaterialIndices,
          });
        }
      }
    }
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
  preferredKeys: Set<string>,
  startingMaterials: StartingMaterial[],
  signal?: AbortSignal,
): Promise<SearchNode[]> {
  const candidates: SearchNode[] = [];

  for (const parent of parents) {
    if (!(await yieldToBrowser(signal))) return [];
    const pathways = await predictRetrosynthesisPathwaysFromRules(
      parent.smiles,
      rules,
    );
    if (!(await yieldToBrowser(signal))) return [];

    for (const pathway of pathways.slice(0, branchLimit)) {
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

        candidates.push({
          smiles: continuation,
          canonical: structure.isomeric,
          connectivity: structure.connectivity,
          hasSpecifiedStereo: structure.hasSpecifiedStereo,
          stereoMixture: null,
          depth: parent.depth + 1,
          rank:
            parent.rank +
            pathway.priority +
            confidencePenalty +
            multiReactantPenalty +
            continuationPenalty +
            suppliedReactantBonus +
            directStartBonus +
            bridgeBonus,
          steps: [step, ...parent.steps],
          history: [...parent.history, structure.isomeric],
          usedStartingMaterialIndices: [
            ...parent.usedStartingMaterialIndices,
            ...matchedStartingMaterials,
          ],
        });
      }
    }
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
      const connectivityOnly =
        match.connectivityBridge ||
        steps.some(
          (step) => step.retrosynthesisConfidence === "connectivity-confirmed",
        );
      const route: MultistepSynthesisRoute = {
        id: `synthesis-route-${hashSignature(signature || "same-structure")}`,
        startingSmiles,
        targetSmiles,
        steps,
        confidence: connectivityOnly ? "connectivity-verified" : "verified",
        score:
          steps.length * 1000 +
          forwardNode.rank +
          retroNode.rank +
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
 * Finds the shortest verified synthesis by meeting a forward search from the
 * supplied starting-material pool with a retrosynthetic search from the
 * requested product. Every dot-separated structure is an equal starting
 * material; the forward search can begin from any one and consume the others
 * once each through multi-reactant catalog rules.
 *
 * Forward nodes are generated only by executable catalog reactions. Reverse
 * nodes come from the retrosynthesis engine, which forward-replays every
 * disconnection before returning it. Carbon-bearing side precursors in a
 * retrosynthetic disconnection must match one of the supplied starting materials.
 */
export async function findMultistepSynthesisRoutesFromRules(
  startingSmiles: string,
  targetSmiles: string,
  rules: ReactionRule[],
  options: MultistepSynthesisSearchOptions = {},
  onProgress?: ProgressCallback,
): Promise<MultistepSynthesisRoute[]> {
  const maxSteps = clampInteger(options.maxSteps, DEFAULT_MAX_STEPS, 1, 6);
  const beamWidth = clampInteger(options.beamWidth, DEFAULT_BEAM_WIDTH, 2, 30);
  const branchLimit = clampInteger(
    options.branchLimit,
    DEFAULT_BRANCH_LIMIT,
    4,
    50,
  );
  const maxRoutes = clampInteger(options.maxRoutes, DEFAULT_MAX_ROUTES, 1, 10);
  const signal = options.signal;
  if (searchCancelled(signal)) return [];

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
  const priorityByRuleId = new Map(
    rules.map((rule) => [rule.id, rule.priority] as const),
  );

  const forwardLayers: SearchNode[][] = [
    startingMaterials.map((material, index) => ({
      smiles: material.smiles,
      canonical: material.canonical,
      connectivity: material.connectivity,
      hasSpecifiedStereo: material.hasSpecifiedStereo,
      stereoMixture: null,
      depth: 0,
      rank: 0,
      steps: [],
      history: [material.canonical],
      usedStartingMaterialIndices: [index],
    })),
  ];
  const retroLayers: SearchNode[][] = [
    [
      {
        smiles: normalizedTarget,
        canonical: targetCanonical,
        connectivity: targetStructure.connectivity,
        hasSpecifiedStereo: targetStructure.hasSpecifiedStereo,
        stereoMixture: null,
        depth: 0,
        rank: 0,
        steps: [],
        history: [targetCanonical],
        usedStartingMaterialIndices: [],
      },
    ],
  ];

  async function ensureForwardDepth(depth: number) {
    while (forwardLayers.length <= depth) {
      if (!(await yieldToBrowser(signal))) return;
      const nextDepth = forwardLayers.length;
      onProgress?.({ phase: "forward", depth: nextDepth, maxSteps });
      const nextLayer = await expandForwardLayer(
        forwardLayers[nextDepth - 1],
        rules,
        priorityByRuleId,
        beamWidth,
        branchLimit,
        allowGeneric,
        targetStructure,
        knownStructureKeys(retroLayers),
        startingMaterials,
        signal,
      );
      forwardLayers.push(nextLayer);
      if (nextLayer.length === 0) break;
    }
  }

  async function ensureRetroDepth(depth: number) {
    while (retroLayers.length <= depth) {
      if (!(await yieldToBrowser(signal))) return;
      const nextDepth = retroLayers.length;
      onProgress?.({ phase: "retrosynthesis", depth: nextDepth, maxSteps });
      const nextLayer = await expandRetroLayer(
        retroLayers[nextDepth - 1],
        rules,
        beamWidth,
        branchLimit,
        allowGeneric,
        startCanonicals,
        knownStructureKeys(forwardLayers),
        startingMaterials,
        signal,
      );
      retroLayers.push(nextLayer);
      if (nextLayer.length === 0) break;
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

      onProgress?.({ phase: "matching", depth: totalDepth, maxSteps });
      const routes = buildRoutesFromLayers(
        forwardLayer,
        retroLayer,
        startComponents.join("."),
        normalizedTarget,
        maxRoutes,
      );

      if (routes.length > 0) return routes;
    }
  }

  return [];
}
