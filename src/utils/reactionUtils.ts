
import type { FunctionalGroupResult } from "./functionalGroups/types";
import { analyzeFunctionalGroupHierarchy } from "./functionalGroups";
import { analyzeNomenclatureAndProperties } from "./nomenclature";
import { getRDKit } from "./rdkit";
import {
  predictReactionPathways as predictReactionPathwaysBase,
  reactionRegistry,
} from "./reactions";
import type { ReactionPathway, ReactionRule } from "./reactions";
import { deriveMechanisticStereoDirective } from "./stereochemistry/mechanisticRules";
import {
  clearMechanisticStereoDirectives,
  registerMechanisticStereoDirective,
} from "./stereochemistry/runtime";
import {
  completeStereoRepresentative,
  scoreStereoRepresentative,
  type RawGetMol,
} from "./stereochemistry/depictionEngine";
import { generateMechanisticDielsAlderCandidates } from "./stereochemistry/dielsAlderMechanism";
import { pericyclic } from "./reactions/engine/handlers/pericyclic";
import {
  areCanonicalEnantiomers,
  canonicalizeStereoStructure,
} from "./reactions/engine/stereochemistry";

export {
  predictRetrosynthesisPathways,
  findMultistepSynthesisRoutes,
  reactionRegistry,
  alkeneReactionRules,
  analyzeReactionComponents,
  isGenericReactionSmiles,
  normalizeKetcherRGroups,
  splitReactionComponents,
  getSequentialConditionOptions,
  runSequentialSynthesis,
  runSequentialSynthesisDetailed,
  verifyMultistepRoute,
  predictNoReactionOutcomes,
} from "./reactions";

export { runMechanisticStereoRegressionSuite } from "./stereochemistry/regression";

export type {
  ReactionComponent,
  ReactionDisplayMetadata,
  ReactionEngineIssue,
  ReactionPathway,
  ReactionProductMixture,
  ReactionProductMixtureKind,
  ReactionReactantRequirement,
  ReactionRule,
  ReactionSelectivityProfile,
  StereochemicalMode,
  RegiochemicalMode,
  RetrosynthesisConfidence,
  RetrosynthesisPathway,
  MultistepSynthesisRoute,
  MultistepSynthesisSearchOptions,
  MultistepSynthesisProgress,
  SynthesisRouteConfidence,
  SynthesisStep,
  SynthesisStepSource,
  SequentialConditionOption,
  SequentialSynthesisBranch,
  RouteMatchLevel,
  RouteStepReactantCheck,
  RouteStepVerification,
  RouteVerification,
  RouteVerificationStatus,
  SequentialBranchExclusion,
  SequentialBranchRanking,
  SequentialStepMixture,
  SequentialSynthesisReport,
  SequentialSynthesisOptions,
  SequentialSynthesisStep,
  NoReactionOutcome,
} from "./reactions";

function mirrorTetrahedralSmiles(smiles: string) {
  return smiles.replace(/@@|@/g, (tag) => (tag === "@" ? "@@" : "@"));
}

function reactantsHaveSpecifiedStereo(reactants: readonly string[]) {
  return reactants.some((smiles) => /@|[\\/]/.test(smiles));
}

function rawGetMolFromRDKit(rdkit: any): RawGetMol {
  return (
    rdkit.__pocketchem_raw_get_mol ??
    rdkit.get_mol.bind(rdkit)
  ) as RawGetMol;
}

function definedAlkeneGeometries(mol: any): Array<"E" | "Z"> {
  try {
    const raw = mol.get_stereo_tags?.();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { CIP_bonds?: unknown };
    if (!Array.isArray(parsed.CIP_bonds)) return [];
    return parsed.CIP_bonds
      .map((entry) => {
        if (!Array.isArray(entry) || entry.length < 3) return null;
        const descriptor = String(entry[2]).replace(/[()]/g, "");
        return descriptor === "E" || descriptor === "Z" ? descriptor : null;
      })
      .filter((value): value is "E" | "Z" => value !== null);
  } catch {
    return [];
  }
}

function hasActivatedAlkeneSubstituent(rdkit: any, rawGetMol: RawGetMol, smiles: string) {
  const mol = rawGetMol(smiles) as any;
  if (!mol) return false;
  const patterns = [
    "[C,c]=[C,c]-[C](=O)[O,N,C]",
    "[C,c]=[C,c]-[C]#N",
    "[C,c]=[C,c]-[N+](=O)[O-]",
    "[C,c]=[C,c]-[S](=O)(=O)",
  ];
  try {
    for (const smarts of patterns) {
      const query = rdkit.get_qmol?.(smarts);
      if (!query) continue;
      try {
        if (mol.get_substruct_match?.(query) !== "{}") return true;
      } finally {
        query.delete?.();
      }
    }
    return false;
  } finally {
    mol.delete?.();
  }
}

function enrichDielsAlderDirective(
  rdkit: any,
  rawGetMol: RawGetMol,
  directive: ReturnType<typeof deriveMechanisticStereoDirective>,
) {
  if (!directive || directive.kind !== "diels-alder") return directive;
  const [diene, dienophile] = directive.reactantSmiles;
  let dieneTerminalRelationship: "same" | "opposite" | null = null;
  let dienophileGeometry: "E" | "Z" | null = null;

  if (diene) {
    const mol = rawGetMol(diene) as any;
    if (mol) {
      try {
        const geometries = definedAlkeneGeometries(mol);
        if (geometries.length === 2) {
          dieneTerminalRelationship = geometries[0] === geometries[1] ? "same" : "opposite";
        }
      } finally {
        mol.delete?.();
      }
    }
  }

  if (dienophile) {
    const mol = rawGetMol(dienophile) as any;
    if (mol) {
      try {
        const geometries = definedAlkeneGeometries(mol);
        if (geometries.length === 1) dienophileGeometry = geometries[0];
      } finally {
        mol.delete?.();
      }
    }
  }

  return {
    ...directive,
    dielsAlder: {
      dieneTerminalRelationship,
      dienophileGeometry,
      activatedDienophile: dienophile
        ? hasActivatedAlkeneSubstituent(rdkit, rawGetMol, dienophile)
        : false,
    },
  };
}

function canonicalize(rawGetMol: RawGetMol, smiles: string): string | null {
  const mol = rawGetMol(smiles);
  if (!mol) return null;
  try {
    return mol.get_smiles?.() ?? null;
  } finally {
    mol.delete?.();
  }
}

function canonicalConnectivity(rawGetMol: RawGetMol, smiles: string): string | null {
  const mol = rawGetMol(smiles);
  if (!mol) return null;
  try {
    return mol.get_smiles?.(JSON.stringify({ doIsomericSmiles: false })) ?? null;
  } catch {
    return null;
  } finally {
    mol.delete?.();
  }
}

async function refreshedProductLabel(smiles: string, fallback: string): Promise<string> {
  try {
    const hierarchy = await analyzeFunctionalGroupHierarchy(smiles);
    const identity = await analyzeNomenclatureAndProperties(
      smiles,
      hierarchy.functionalGroups,
      hierarchy.mainGroup,
    );
    return identity.nomenclature.displayName || identity.nomenclature.estimatedName || fallback;
  } catch {
    return fallback;
  }
}

async function applyMechanisticStereoRuntime(
  pathways: ReactionPathway[],
): Promise<ReactionPathway[]> {
  clearMechanisticStereoDirectives();
  if (pathways.length === 0) return pathways;

  const rdkit = await getRDKit();
  const rawGetMol = rawGetMolFromRDKit(rdkit);
  const rulesById = new Map<string, ReactionRule>(
    reactionRegistry.map((rule) => [rule.id, rule]),
  );

  const updated: ReactionPathway[] = [];

  for (const pathway of pathways) {
    const rule = rulesById.get(pathway.ruleId);
    if (!rule || !pathway.productSmiles) {
      updated.push(pathway);
      continue;
    }

    const directive = enrichDielsAlderDirective(
      rdkit,
      rawGetMol,
      deriveMechanisticStereoDirective(rule, pathway),
    );
    if (!directive) {
      updated.push(pathway);
      continue;
    }

    const legacyCandidates = [
      pathway.productSmiles,
      ...(pathway.productMixture?.memberSmiles ?? []),
    ];
    const candidateSet = new Set<string>();

    // Intramolecular Diels-Alder gets the same mechanism-first protection as
    // the two-reactant reaction. Earlier versions skipped this because they
    // required reactantComponents.length >= 2, so a stale one-bond closure
    // could survive all the way to the UI as cyclodecene even after the IMDA
    // SMARTS was corrected upstream.
    if (
      directive.kind === "diels-alder" &&
      pathway.reactantComponents.length === 1 &&
      rule.transform.type === "customHandler" &&
      rule.transform.handler === "pericyclic" &&
      rule.transform.options?.intramolecular === true
    ) {
      const tetherAtoms = Number(rule.transform.options?.tetherAtoms ?? 0);
      const regenerated = await pericyclic(
        pathway.reactantComponents,
        {
          mode: "dielsAlder",
          intramolecular: true,
          tetherAtoms,
          maxProducts: 16,
        },
      );

      // If the mechanism-first pass succeeds, deliberately do NOT preserve the
      // legacy connectivity. This is the crucial difference from the ordinary
      // stereo enrichment path: a monocyclic partial closure is constitutionally
      // wrong, not merely an alternate depiction.
      for (const product of regenerated) candidateSet.add(product);
    }

    // Intermolecular Diels-Alder gets an independent mechanism-first
    // constitutional pass as before.
    if (directive.kind === "diels-alder" && pathway.reactantComponents.length >= 2) {
      const [diene, dienophile] = pathway.reactantComponents;
      const mechanistic = generateMechanisticDielsAlderCandidates(
        rdkit,
        rawGetMol,
        diene,
        dienophile,
      );
      const existingDielsAlder = directive.dielsAlder ?? {
        dieneTerminalRelationship: null,
        dienophileGeometry: null,
        activatedDienophile: false,
      };

      directive.dielsAlder = {
        dieneTerminalRelationship:
          existingDielsAlder.dieneTerminalRelationship,
        dienophileGeometry:
          existingDielsAlder.dienophileGeometry,
        activatedDienophile:
          existingDielsAlder.activatedDienophile,
        preferredRegioRelationship:
          mechanistic.regio.preferredRelationship,
        dieneDirectorPosition:
          mechanistic.regio.dieneDirectorPosition,
        regioConfidence:
          mechanistic.regio.confidence,
        regioReason:
          mechanistic.regio.reason,
      };

      if (mechanistic.products.length > 0) {
        const allowedConnectivity = new Set(
          mechanistic.products
            .map((product) => canonicalConnectivity(rawGetMol, product))
            .filter((value): value is string => Boolean(value)),
        );
        for (const product of mechanistic.products) candidateSet.add(product);
        // Preserve any richer legacy stereostructure only when it belongs to
        // the independently selected constitutional regioisomer.
        for (const legacy of legacyCandidates) {
          const connectivity = canonicalConnectivity(rawGetMol, legacy);
          if (connectivity && allowedConnectivity.has(connectivity)) {
            candidateSet.add(legacy);
          }
        }
      }
    }

    if (candidateSet.size === 0) {
      for (const candidate of legacyCandidates) candidateSet.add(candidate);
    }

    // If an achiral reaction environment can approach either enantiotopic face,
    // include the exact molecular mirror as a representative candidate. This
    // does not invent a new constitutional product; it only lets the UI choose
    // which member of the accessible mirror pair best matches the stable
    // drawing convention.
    if (
      !reactantsHaveSpecifiedStereo(pathway.reactantComponents) &&
      (pathway.productMixture?.memberSmiles.length ?? 0) < 2 &&
      (rule.selectivityProfile?.mixture === "expected" ||
        directive.kind === "diels-alder" ||
        directive.kind === "epoxide-alcohol-opening")
    ) {
      // Mirror only candidates that survived the mechanism-first connectivity
      // filter. Never reintroduce a rejected regioisomer through its mirror.
      for (const seed of [...candidateSet]) {
        if (!/@/.test(seed)) continue;
        const mirror = canonicalize(rawGetMol, mirrorTetrahedralSmiles(seed));
        if (mirror) candidateSet.add(mirror);
      }
    }

    // Complete stereochemistry on each connectivity that survived the
    // mechanism-first filter. This is intentionally NOT based on the legacy
    // pathway.productSmiles: doing so could resurrect the exact wrong
    // regioisomer that the independent Diels-Alder pass just rejected.
    const candidatesAlreadyHaveStereo = [...candidateSet].some(
      (candidate) => /@/.test(candidate),
    );

    if (
      !candidatesAlreadyHaveStereo &&
      (directive.kind === "diels-alder" ||
        directive.kind === "epoxide-alcohol-opening" ||
        directive.kind === "syn-vicinal" ||
        directive.kind === "anti-vicinal")
    ) {
      for (const seed of [...candidateSet]) {
        const completed = completeStereoRepresentative(rawGetMol, seed, directive);
        if (!completed) continue;
        candidateSet.add(completed);
        if (!reactantsHaveSpecifiedStereo(pathway.reactantComponents)) {
          const completedMirror = canonicalize(
            rawGetMol,
            mirrorTetrahedralSmiles(completed),
          );
          if (completedMirror) candidateSet.add(completedMirror);
        }
      }
    }

    // Canonicalize BEFORE scoring/deduplication. RDKit may return the same
    // stereoisomer with different atom orderings, which previously reached the
    // UI as two nearly identical "alternative" molecules.
    const canonicalCandidates = new Set<string>();
    for (const candidate of candidateSet) {
      const canonical = canonicalize(rawGetMol, candidate);
      if (canonical) canonicalCandidates.add(canonical);
    }

    const scoredCandidates = [...canonicalCandidates]
      .map((canonical) => ({
        canonical,
        score: scoreStereoRepresentative(rawGetMol, canonical, directive),
      }))
      .filter((candidate) => candidate.score >= 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.canonical.localeCompare(b.canonical),
      );

    const bestScore = scoredCandidates[0]?.score ?? -Infinity;
    const best =
      scoredCandidates[0]?.canonical ??
      canonicalize(rawGetMol, pathway.productSmiles) ??
      pathway.productSmiles;

    // Keep only equally mechanism-compatible stereochemical members. Do not
    // append every temporary depiction candidate to the chemical mixture.
    const mechanisticMembers = scoredCandidates
      .filter((candidate) => Math.abs(candidate.score - bestScore) < 1e-9)
      .map((candidate) => candidate.canonical);

    let memberSmiles = pathway.productMixture
      ? Array.from(new Set(mechanisticMembers))
      : null;

    let nextMixture = pathway.productMixture;
    if (nextMixture && memberSmiles && memberSmiles.length === 2) {
      const [left, right] = await Promise.all(
        memberSmiles.map((smiles) => canonicalizeStereoStructure(smiles)),
      );
      if (
        left &&
        right &&
        (await areCanonicalEnantiomers(left, right))
      ) {
        nextMixture = {
          ...nextMixture,
          kind: "racemic",
          label: "Racemic mixture",
        };
      }
    }

    // Never lose chemistry provenance merely because the depiction selector
    // only needed one representative. If this is a known racemate, preserve
    // its canonical mirror pair for search while the reaction card will still
    // render only one representative.
    if (
      nextMixture?.kind === "racemic" &&
      (memberSmiles?.length ?? 0) < 2
    ) {
      const canonicalOriginalMembers = new Set<string>();
      for (const member of pathway.productMixture?.memberSmiles ?? []) {
        const canonical = canonicalize(rawGetMol, member);
        if (canonical) canonicalOriginalMembers.add(canonical);
      }
      if (canonicalOriginalMembers.size >= 2) {
        memberSmiles = [...canonicalOriginalMembers];
      }
    }

    const nextProductLabel = best === pathway.productSmiles
      ? pathway.productLabel
      : await refreshedProductLabel(best, pathway.productLabel);

    const nextPathway: ReactionPathway = {
      ...pathway,
      productSmiles: best,
      productLabel: nextProductLabel,
      productMixture:
        nextMixture && memberSmiles && memberSmiles.length > 0
          ? {
              ...nextMixture,
              memberSmiles,
              memberCount: memberSmiles.length,
              memberIndex: Math.max(0, memberSmiles.indexOf(best)),
            }
          : nextMixture,
    };

    // Register the chosen product and every component separately because the
    // reaction UI renders disconnected product components one at a time.
    for (const component of best.split(".").map((part) => part.trim()).filter(Boolean)) {
      const canonicalComponent = canonicalize(rawGetMol, component);
      if (canonicalComponent) {
        registerMechanisticStereoDirective(canonicalComponent, directive);
      }
    }

    updated.push(nextPathway);
  }

  const seen = new Set<string>();
  return updated.filter((pathway) => {
    const key = [
      pathway.ruleId,
      [...pathway.reactantComponents].sort().join("."),
      pathway.productSmiles ?? "<no-product>",
    ].join("||");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Reaction-page entry point with a second, independent stereochemical runtime.
 * The ordinary reaction engine remains responsible for molecular identity;
 * this layer chooses a chemically identical representative and a deterministic
 * mechanistic depiction without requiring each reaction handler to hard-code
 * wedge/hash drawing details.
 */
export async function predictReactionPathways(
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[],
) {
  const pathways = await predictReactionPathwaysBase(reactantSmiles, functionalGroups);
  return applyMechanisticStereoRuntime(pathways);
}
