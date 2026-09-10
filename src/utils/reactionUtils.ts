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
  predictNoReactionOutcomes,
} from "./reactions";

export { runMechanisticStereoRegressionSuite } from "./stereochemistry/regression";

export type {
  ReactionComponent,
  ReactionDisplayMetadata,
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

    // Diels-Alder gets an independent mechanism-first constitutional pass.
    // This is intentionally separate from the legacy pericyclic handler: the
    // runtime re-enumerates both constitutional orientations from the actual
    // diene/dienophile, then applies the donor/acceptor directing rule before
    // stereochemical presentation. Thus a stale one-off regio rule upstream
    // cannot lock the reaction card into the wrong constitutional product.
    if (directive.kind === "diels-alder" && pathway.reactantComponents.length >= 2) {
      const [diene, dienophile] = pathway.reactantComponents;
      const mechanistic = generateMechanisticDielsAlderCandidates(
        rdkit,
        rawGetMol,
        diene,
        dienophile,
      );
      directive.dielsAlder = {
        ...directive.dielsAlder,
        preferredRegioRelationship: mechanistic.regio.preferredRelationship,
        dieneDirectorPosition: mechanistic.regio.dieneDirectorPosition,
        regioConfidence: mechanistic.regio.confidence,
        regioReason: mechanistic.regio.reason,
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
    if (
      directive.kind === "diels-alder" ||
      directive.kind === "epoxide-alcohol-opening" ||
      directive.kind === "syn-vicinal" ||
      directive.kind === "anti-vicinal"
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

    let best = pathway.productSmiles;
    let bestScore = -Infinity;
    for (const candidate of candidateSet) {
      const canonical = canonicalize(rawGetMol, candidate);
      if (!canonical) continue;
      const score = scoreStereoRepresentative(rawGetMol, canonical, directive);
      if (score > bestScore) {
        best = canonical;
        bestScore = score;
      }
    }

    const memberSmiles = pathway.productMixture
      ? Array.from(new Set([...pathway.productMixture.memberSmiles, ...candidateSet]))
      : null;

    const nextProductLabel = best === pathway.productSmiles
      ? pathway.productLabel
      : await refreshedProductLabel(best, pathway.productLabel);

    const nextPathway: ReactionPathway = {
      ...pathway,
      productSmiles: best,
      productLabel: nextProductLabel,
      productMixture: pathway.productMixture && memberSmiles
        ? {
            ...pathway.productMixture,
            memberSmiles,
            memberCount: memberSmiles.length,
            memberIndex: Math.max(0, memberSmiles.indexOf(best)),
          }
        : pathway.productMixture,
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
